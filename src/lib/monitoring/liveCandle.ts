// Live 5-second candle building for intraday charts.
//
// The historical bars come pre-built from Supabase/cache. The live feed
// (live_quotes) gives one latest tick per symbol every ~5s. This util merges a
// tick into the bar series so the current candle grows tick-by-tick and a new
// candle is opened when the timeframe boundary is crossed — without needing
// exact exchange-session alignment (it extends from the last historical bar's
// cadence, appending at most one new in-progress bar).

export type LiveBar = { time: string; open: number; high: number; low: number; close: number; volume?: number | null };

export type LiveTick = {
  close: number;
  high?: number | null;
  low?: number | null;
  timestamp?: string | null; // ISO; when the tick was observed
};

const TF_MINUTES: Record<string, number> = {
  "1M": 1, "5M": 5, "15M": 15, "30M": 30,
  "1H": 60, "2H": 120, "3H": 180, "4H": 240,
  "D": 1440, "1D": 1440, "W": 10080, "1W": 10080,
};

export function timeframeMinutes(timeframe: string | undefined | null): number {
  if (!timeframe) return 1440;
  const key = String(timeframe).trim().toUpperCase();
  return TF_MINUTES[key] ?? 1440;
}

function toEpochMs(t: string): number {
  if (!t) return NaN;
  // Full ISO (intraday) or a YYYY-MM-DD day; append T00:00:00Z for bare days.
  const iso = t.length <= 10 ? `${t}T00:00:00Z` : /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`;
  return Date.parse(iso);
}

/**
 * Merge a live tick into a copy of `bars`.
 * - Within the last bar's window → update its close/high/low.
 * - One full interval past the last bar → append a single new in-progress bar.
 * Returns the original array reference when nothing applies (cheap no-op).
 */
export function applyLiveCandle(
  bars: LiveBar[],
  tick: LiveTick | null | undefined,
  timeframe: string | undefined | null,
): LiveBar[] {
  if (!tick || !Number.isFinite(tick.close) || tick.close <= 0 || !bars.length) return bars;

  const last = bars[bars.length - 1]!;
  const lastMs = toEpochMs(last.time);
  if (!Number.isFinite(lastMs)) return bars;

  const intervalMs = timeframeMinutes(timeframe) * 60_000;
  const tickMs = tick.timestamp ? toEpochMs(tick.timestamp) : Date.now();
  const price = tick.close;
  // The live feed sends partial ticks — high/low may arrive as 0/null. Treat any
  // non-positive value as "absent" and fall back to the close, otherwise a 0 would
  // crush the candle's low to zero and destroy the chart scale.
  const th = Number(tick.high);
  const tl = Number(tick.low);
  const tickHigh = Number.isFinite(th) && th > 0 ? th : price;
  const tickLow = Number.isFinite(tl) && tl > 0 ? tl : price;

  // A brand-new period started → open one new in-progress candle.
  if (Number.isFinite(tickMs) && tickMs >= lastMs + intervalMs) {
    const newTime = new Date(lastMs + intervalMs).toISOString().slice(0, 19) + "Z";
    return [...bars, { time: newTime, open: price, high: Math.max(price, tickHigh), low: Math.min(price, tickLow), close: price, volume: null }];
  }

  // Otherwise grow the current (last) candle.
  const updated: LiveBar = {
    ...last,
    close: price,
    high: Math.max(Number(last.high), price, tickHigh),
    low: Math.min(Number(last.low), price, tickLow),
  };
  return [...bars.slice(0, -1), updated];
}

/**
 * Normalize a chart item's code to the symbol key used in live_quotes.
 * Chart codes may carry a timeframe suffix ("FDAX1! 2H", "6E1! 30M") or an
 * underscore form ("FDAX1!_2H"); live_quotes stores the bare symbol ("FDAX1!").
 */
export function liveQuoteKey(code: string | undefined | null): string | null {
  if (!code) return null;
  let s = String(code).trim().toUpperCase();
  s = s.replace(/[ _](\d+\s*(?:M|H|D|W)|30M|1H|2H|3H|4H|15M|5M|1M|1D|1W)$/i, "");
  s = s.replace(/\s+\d+\s*(?:MIN|MINUTE|HOUR|H|M)S?$/i, "");
  return s.trim() || null;
}
