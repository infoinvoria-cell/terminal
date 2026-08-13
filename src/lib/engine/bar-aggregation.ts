/**
 * bar-aggregation.ts
 * Timezone-aware 30M bar aggregation utilities.
 * All internal timestamps are UTC seconds; only display-layer code adds the
 * Berlin offset (so LightweightCharts shows local time on the X-axis).
 *
 * Exported functions are pure / side-effect-free so vitest can run them in
 * the node environment without mocking browser APIs.
 */

// ─── Timezone ─────────────────────────────────────────────────────────────────

/**
 * Returns the current UTC→Berlin offset in whole seconds.
 * Uses Intl.DateTimeFormat.formatToParts so DST is always correct.
 * Berlin is UTC+1 in winter (CET) and UTC+2 in summer (CEST).
 *
 * @param forTimestampMs - optional epoch ms to compute the offset FOR; defaults to now.
 *                        Pass a specific value for deterministic unit tests.
 */
export function getBerlinOffsetSec(forTimestampMs?: number): number {
  try {
    const d = forTimestampMs != null ? new Date(forTimestampMs) : new Date()
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false,
    }).formatToParts(d)
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0)
    // hour12:false can emit "24" at midnight instead of 0
    const h = get('hour') % 24
    const berlinMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'))
    const diff = Math.round((berlinMs - d.getTime()) / 1000)
    // Sanity: Berlin is UTC+1 or UTC+2 only
    return diff >= 3600 && diff <= 7200 ? diff : 2 * 3600
  } catch {
    return 2 * 3600 // safe fallback
  }
}

// ─── Timeframe helpers ────────────────────────────────────────────────────────

/** Step in seconds for a timeframe string such as "30M", "1H", "2H", "D". */
export function tfStepSec(tf: string): number {
  const u = tf.toUpperCase()
  const m = /^(\d+)M$/.exec(u)
  if (m) return Number(m[1]) * 60
  const h = /^(\d+)H$/.exec(u)
  if (h) return Number(h[1]) * 3600
  return 86400
}

// ─── Bar-boundary helpers ─────────────────────────────────────────────────────

/**
 * Returns the UTC start of the bar that contains `nowSec`.
 * e.g. 09:47 UTC with step=1800 → 09:30 UTC.
 */
export function barBoundaryUtcSec(nowSec: number, stepSec: number): number {
  return Math.floor(nowSec / stepSec) * stepSec
}

/**
 * Normalise any UTC epoch second (bar-end or bar-start) to its bucket-start.
 * 12:29:59 → 12:00:00 (bar-end → bar-start)
 * 12:30:00 → 12:30:00 (already start)
 */
export function normalizeToSlot(rawSec: number, stepSec: number): number {
  return Math.floor(rawSec / stepSec) * stepSec
}

/**
 * Derive the current provider bucket from the EXCHANGE event timestamp only.
 * updated_at (DB insert time) must never be passed here — it is close to
 * browser/server time and would produce phantom future candles on a delayed feed.
 *
 * Returns null when no real event timestamp is present.
 */
export function providerBucketUtc(
  providerEventTimestamp: string | null | undefined,
  stepSec: number,
): number | null {
  if (!providerEventTimestamp) return null
  const epochSec = Math.floor(new Date(providerEventTimestamp).getTime() / 1000)
  if (!Number.isFinite(epochSec) || epochSec <= 0) return null
  return normalizeToSlot(epochSec, stepSec)
}

/**
 * Converts a UTC bar boundary to the Berlin-offset display timestamp.
 * The chart stores Berlin-offset timestamps so the X-axis reads local time
 * without any extra formatter — LightweightCharts just prints what it's given.
 */
export function toDisplaySec(utcSec: number, berlinOffsetSec: number): number {
  return utcSec + berlinOffsetSec
}

// ─── Live bar accumulator ─────────────────────────────────────────────────────

export interface LiveBarState {
  /** UTC seconds of this bar's start boundary. */
  barUtcSec: number
  open: number
  high: number
  low: number
  /** Close is always the last tick passed in — not stored here. */
}

/**
 * Accumulates OHLC across 5-second ticks for the currently-forming bar.
 *
 * Rules enforced:
 *  - Open = first tick in this bar period (or the monitoring bar's open if
 *    injected via initFromData).
 *  - High grows only when a tick exceeds the running maximum — never from
 *    historical data, never from session extremes.
 *  - Low falls only when a tick goes below the running minimum.
 *  - Duplicate ticks (same price, same period) are processed but have no
 *    visible effect on H/L beyond the first one.
 *  - Period change creates exactly one new bar.
 */
export class LiveBarAccumulator {
  private state: LiveBarState | null = null

  /**
   * Process one tick. Resets the bar when the boundary changes.
   * @param tickPrice  live close / last price
   * @param nowSec     current time in UTC seconds
   * @param stepSec    bar duration in seconds (e.g. 1800 for 30M)
   */
  update(tickPrice: number, nowSec: number, stepSec: number): LiveBarState & { close: number } {
    const barUtcSec = barBoundaryUtcSec(nowSec, stepSec)

    if (this.state === null || this.state.barUtcSec !== barUtcSec) {
      // New bar — reset accumulator with first tick as open
      this.state = { barUtcSec, open: tickPrice, high: tickPrice, low: tickPrice }
    } else {
      // Same bar — accumulate
      if (tickPrice > this.state.high) this.state.high = tickPrice
      if (tickPrice < this.state.low)  this.state.low  = tickPrice
    }

    this._lastClose = tickPrice
    return { ...this.state, close: tickPrice }
  }

  /**
   * Seed the accumulator with a monitoring bar's open price so the displayed
   * open matches the real first tick of the period (which we may have missed
   * if the dashboard was opened mid-bar). Only takes effect when `barUtcSec`
   * differs from the current state — i.e. it initialises a new bar, never
   * overrides a bar that already has live ticks.
   *
   * H/L are intentionally NOT seeded from monitoring data because the live
   * feed stores DAY session extremes in those fields (stuck-session-extreme
   * bug in tv_live_feed.py).
   */
  initFromData(open: number, barUtcSec: number): void {
    if (this.state === null || this.state.barUtcSec !== barUtcSec) {
      this.state = { barUtcSec, open, high: open, low: open }
    }
  }

  /** Returns a snapshot of the current bar state (read-only, no tick processed). */
  snapshot(): (LiveBarState & { close: number }) | null {
    if (!this.state) return null
    return { ...this.state, close: this._lastClose ?? this.state.open }
  }

  currentBarUtcSec(): number | null {
    return this.state?.barUtcSec ?? null
  }

  reset(): void {
    this.state = null
    this._lastClose = null
  }

  private _lastClose: number | null = null
}
