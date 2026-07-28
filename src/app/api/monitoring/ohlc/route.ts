import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

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
 * Repair, not deletion: fall back to the body extent — the only range the tick
 * close progression actually proves.
 */
function repairStuckSessionExtremes(bars: ShapedBar[]): void {
  const highCounts = new Map<number, number>();
  const lowCounts = new Map<number, number>();
  for (const bar of bars) {
    if (!bar.tick) continue;
    highCounts.set(bar.high, (highCounts.get(bar.high) ?? 0) + 1);
    lowCounts.set(bar.low, (lowCounts.get(bar.low) ?? 0) + 1);
  }
  for (const bar of bars) {
    if (!bar.tick) continue;
    const bodyHigh = Math.max(bar.open, bar.close);
    const bodyLow = Math.min(bar.open, bar.close);
    if (bar.high > bodyHigh && (highCounts.get(bar.high) ?? 0) >= 2) bar.high = bodyHigh;
    if (bar.low < bodyLow && (lowCounts.get(bar.low) ?? 0) >= 2) bar.low = bodyLow;
  }
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

    const shaped: ShapedBar[] = dedupeByPeriod(data as OhlcRow[], isDaily).map(({ key, row, tick }) => {
      const open = Number(row.open);
      const close = Number(row.close);
      // Hard OHLC invariant: a body must never poke outside its own wick.
      const high = Math.max(Number(row.high), open, close);
      const low = Math.min(Number(row.low), open, close);
      // Emit ONE canonical timestamp shape so desktop and mobile parse the same
      // instant and lightweight-charts never sees two rows with equal `time`.
      const time = isDaily ? key : `${key}Z`;
      return { time, open, high, low, close, tick };
    });

    if (!isDaily) repairStuckSessionExtremes(shaped);

    const bars = shaped
      .filter(
        (bar) =>
          Boolean(bar.time) &&
          Number.isFinite(bar.open) && bar.open > 0 &&
          Number.isFinite(bar.high) && bar.high > 0 &&
          Number.isFinite(bar.low) && bar.low > 0 &&
          Number.isFinite(bar.close) && bar.close > 0 &&
          bar.low <= bar.high &&
          // Clock-skew / bad-bucket guard: never emit a period that hasn't started.
          Date.parse(isDaily ? `${bar.time}T00:00:00Z` : bar.time) <= nowMs + 60_000,
      )
      .slice(-limit)
      .map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));

    const lastBar = bars.at(-1);
    return NextResponse.json({
      bars,
      symbol,
      timeframe,
      count: bars.length,
      lastDate: lastBar?.time ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), bars: [] },
      { status: 500 },
    );
  }
}
