import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { validateAndRepairOhlc } from "@/lib/market-data/ohlc-quality";
import { sha256Json } from "@/lib/track-record/utils";

type OhlcRow = { date: unknown; open: unknown; high: unknown; low: unknown; close: unknown };
type ShapedBar = { time: string; open: number; high: number; low: number; close: number; tick: boolean };

/**
 * Canonical period key.
 *
 * `monitoring_ohlc.date` is a TEXT column and the unique key is
 * (asset, timeframe, date) — so "2026-07-27T10:00:00" and
 * "2026-07-27T10:00:00Z" are two DIFFERENT rows for the SAME 2H period.
 * The TradingView history writers (tools/market-data/bridge_intraday_mt.mjs,
 * scripts/seed-supabase.ts) slice the Z off; the tick feed
 * (tools/live-feed/tv_live_feed.py) used to write it. The chart therefore
 * plotted every intraday period twice with different values.
 *
 * Stripping the trailing Z and any sub-second part collapses both onto one key.
 */
function periodKey(raw: string, isDaily: boolean): string {
  const t = String(raw).trim().replace(" ", "T");
  let key: string;
  if (/[+-]\d{2}:?\d{2}$/.test(t)) {
    // Explicit offset — normalize through Date so the key is real UTC.
    const ms = Date.parse(t);
    key = Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 19) : t;
  } else {
    key = t.replace(/(\.\d+)?Z$/i, "").slice(0, 19);
  }
  // Daily rows arrive both as "2026-07-25" and "2026-07-25T00:00:00Z" —
  // the day alone is the period, so they must collapse too.
  return isDaily ? key.slice(0, 10) : key;
}

/**
 * A stored date carrying a trailing "Z" is tick-built. There is no `source`
 * column on monitoring_ohlc, so the date-string shape is the only deterministic
 * discriminator: every TradingView-history writer strips the Z, the tick feed
 * wrote it. Value-based heuristics are NOT usable — a poisoned tick high sits
 * inside normal intraday wick noise (0.2–0.8%).
 */
function isTickBuilt(raw: string): boolean {
  return /Z$/i.test(String(raw).trim());
}

/**
 * Assets whose intraday bars come exclusively from the TV chart-series pipeline
 * (tools/live-feed/tv_live_feed.py CHART_SERIES_CONFIGS). For these assets the
 * tick-built Z-rows carry contaminated H/L from the TV DAY session extreme fields
 * (high_price / low_price) and must NEVER be returned — not even for the forming
 * candle. The current bar is built by the LiveBarAccumulator in LWChart.tsx using
 * close ticks only, which is clean.
 */
const TV_SERIES_ASSETS = new Set(["6E1!_30M", "6B1!_30M", "FDAX1!_1H", "FDAX1!_2H"]);

/**
 * One row per period, ascending.
 *
 * A TradingView-history row always beats a tick-built row; a tick row survives
 * only when it is the ONLY row for its period — i.e. the currently forming
 * candle, the ~10–15 min TradingView delay gap that live data is allowed to fill.
 */
function dedupeByPeriod(rows: OhlcRow[], isDaily: boolean): Array<{ key: string; row: OhlcRow; tick: boolean }> {
  const byPeriod = new Map<string, { key: string; row: OhlcRow; tick: boolean }>();
  for (const row of rows) {
    const raw = String(row?.date ?? "");
    if (!raw) continue;
    const key = periodKey(raw, isDaily);
    if (!key) continue;
    const tick = isTickBuilt(raw);
    const prev = byPeriod.get(key);
    // Keep the first row seen for a period, but let a history row evict a tick row.
    if (!prev || (prev.tick && !tick)) byPeriod.set(key, { key, row, tick });
  }
  return [...byPeriod.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Stuck-session-extreme repair (intraday only).
 *
 * tv_live_feed.py used to fold TradingView's DAY high/low (quote fields
 * high_price / low_price) into every tick-built bar, so one session extreme
 * (e.g. FDAX 25654) got baked into bar after bar and every candle grew a
 * full-session wick. Signature: the byte-identical extreme repeating across
 * several tick-built periods while sitting outside that bar's own body.
 * Genuine bars practically never do that, and tick bars are only ever the
 * forming candle, so the check is scoped to them and cannot damage TV history.
 *
 * Repair, not deletion: keep valid live wicks, but cap impossible session-sized
 * extremes to a small intraday range around the candle body.
 */
function repairStuckSessionExtremes(bars: ShapedBar[]): void {
  for (const bar of bars) {
    if (!bar.tick) continue;
    const bodyHigh = Math.max(bar.open, bar.close);
    const bodyLow = Math.min(bar.open, bar.close);
    const maxExtra = Math.max(Math.abs(bar.close) * 0.0035, 1e-6);
    bar.high = Math.max(bodyHigh, Math.min(bar.high, bodyHigh + maxExtra));
    bar.low = Math.min(bodyLow, Math.max(bar.low, bodyLow - maxExtra));
  }
}

function pruneStaleTickBars(bars: ShapedBar[], isDaily: boolean): ShapedBar[] {
  if (isDaily) {
    // Daily tick-built bars carry the full session high/low from the live-feed
    // (high_price / low_price quote fields), which creates massive corrupt wicks
    // on daily candles. TV history rows are authoritative for closed daily bars.
    // If any history rows exist, drop ALL tick-built rows — the 15-min TV delay
    // is acceptable for daily monitoring (anomaly tab, etc.).
    const hasHistory = bars.some(b => !b.tick);
    return hasHistory ? bars.filter(b => !b.tick) : bars;
  }
  const lastHistoryIndex = bars.reduce((last, bar, index) => (bar.tick ? last : index), -1);
  if (lastHistoryIndex < 0) return bars.slice(-1);
  const lastHistoryMs = Date.parse(bars[lastHistoryIndex]!.time);
  return bars.filter((bar, index) => {
    if (!bar.tick) return true;
    if (index <= lastHistoryIndex) return false;
    const barMs = Date.parse(bar.time);
    return Number.isFinite(lastHistoryMs) && Number.isFinite(barMs) && barMs > lastHistoryMs;
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  // Normalize "1D" → "D" to match how data is stored in monitoring_ohlc
  const rawTf = searchParams.get("timeframe") ?? "D";
  const timeframe = rawTf === "1D" ? "D" : rawTf === "1W" ? "W" : rawTf === "1M" ? "M" : rawTf;
  const limitStr = searchParams.get("limit") ?? "500";
  const limit = Math.min(5000, Math.max(1, parseInt(limitStr, 10) || 500));

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    const db = createSupabaseServiceClient();
    // Intraday bars are stored under a composite asset key "<symbol>_<tf>"
    // (e.g. FDAX1!_2H, 6E1!_30M); daily uses the bare symbol. Match both.
    const assetKeys = timeframe === "D" ? [symbol] : [symbol, `${symbol}_${timeframe}`];
    // Over-fetch: duplicated periods would otherwise eat the caller's budget and
    // the client would silently receive fewer bars than it asked for.
    const fetchLimit = Math.min(5000, limit * 2);
    const { data, error } = await db
      .from("monitoring_ohlc")
      .select("date,open,high,low,close")
      .in("asset", assetKeys)
      .eq("timeframe", timeframe)
      .gt("close", 0)
      .order("date", { ascending: false })
      .limit(fetchLimit);

    if (error) {
      return NextResponse.json({ error: error.message, bars: [] }, { status: 200 });
    }

    // Fallback: for Core Invest ETFs not yet in monitoring_ohlc, try invest_ohlc
    const INVEST_OHLC_SYMBOLS = new Set(["QQQ", "SPY", "SPMO", "GLD"]);
    if (!data?.length && timeframe === "D" && INVEST_OHLC_SYMBOLS.has(symbol)) {
      const { data: iData } = await db
        .from("invest_ohlc")
        .select("date,open,high,low,close")
        .eq("symbol", symbol)
        .gt("close", 0)
        .order("date", { ascending: false })
        .limit(limit);
      if (iData?.length) {
        const bars = iData
          .reverse()
          .map((r) => ({ time: String(r.date).slice(0, 10), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close) }))
          .filter((b) => b.time && b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0 && b.low <= b.high);
        return NextResponse.json({ bars, symbol, timeframe, count: bars.length, lastDate: bars.at(-1)?.time ?? null, source: "invest_ohlc" });
      }
    }

    if (!data?.length) {
      return NextResponse.json({ bars: [], symbol, timeframe, count: 0 });
    }

    // Daily bars use a YYYY-MM-DD key; intraday must keep the full timestamp,
    // otherwise every bar in a day collapses onto the same date and the chart breaks.
    const isDaily = timeframe === "D";
    const nowMs = Date.now();

    const shapedRaw: ShapedBar[] = dedupeByPeriod(data as OhlcRow[], isDaily).map(({ key, row, tick }) => {
      const open = Number(row.open);
      const close = Number(row.close);
      const high = Number(row.high);
      const low = Number(row.low);
      // Emit ONE canonical timestamp shape so desktop and mobile parse the same
      // instant and lightweight-charts never sees two rows with equal `time`.
      const time = isDaily ? key : `${key}Z`;
      return { time, open, high, low, close, tick };
    });

    // Second-pass epoch dedup: "T24:00:00" (bar-end notation) and "T00:00:00"
    // next day both parse to the same Unix epoch but survive dedupeByPeriod with
    // different text keys. Deduplicate here by epoch; history rows (tick=false)
    // beat tick rows, then later key beats earlier key (TV history wins).
    const shaped: ShapedBar[] = (() => {
      const epochMap = new Map<number, ShapedBar>();
      for (const b of shapedRaw) {
        const epoch = Math.floor(new Date(b.time).getTime() / 1000);
        if (!isFinite(epoch) || epoch <= 0) continue;
        const prev = epochMap.get(epoch);
        if (!prev || (prev.tick && !b.tick)) epochMap.set(epoch, b);
      }
      return [...epochMap.values()].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    })();

    // Hard-exclude all tick-built Z-rows for TV-series-covered assets.
    // These assets get clean OHLC from the chart-series pipeline; their Z-rows
    // carry contaminated day-session H/L and must never reach the chart.
    const compositeKey = isDaily ? symbol : `${symbol}_${timeframe}`;
    const isTvSeriesAsset = TV_SERIES_ASSETS.has(compositeKey);
    const shapedClean = isTvSeriesAsset ? shaped.filter(b => !b.tick) : shaped;

    const pruned = pruneStaleTickBars(shapedClean, isDaily);
    repairStuckSessionExtremes(pruned);
    const quality = validateAndRepairOhlc(pruned, {
      intraday: !isDaily,
      nowMs,
    });
    if (quality.events.length) {
      await db.from("ohlc_quality_events").upsert(
        quality.events.map((event) => ({
          event_hash: sha256Json([symbol, timeframe, event.time, event.flag, event.original, event.corrected]),
          asset: symbol,
          timeframe,
          period_utc: event.time,
          severity: event.severity,
          quality_flag: event.flag,
          repair_method: event.method,
          original_bar: event.original,
          corrected_bar: event.corrected,
        })),
        { onConflict: "event_hash", ignoreDuplicates: true },
      );
    }
    const bars = quality.accepted
      .slice(-limit)
      .map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));

    const lastBar = bars.at(-1);
    return NextResponse.json({
      bars,
      symbol,
      timeframe,
      count: bars.length,
      lastDate: lastBar?.time ?? null,
      quality: {
        status: quality.events.length ? "warning" : "ok",
        flags: quality.flags,
        repaired: quality.events.filter((event) => event.severity === "repair").length,
        quarantined: quality.quarantined.length,
        events: quality.events.slice(-100),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), bars: [] },
      { status: 500 },
    );
  }
}
