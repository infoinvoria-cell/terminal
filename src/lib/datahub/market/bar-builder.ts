/**
 * CanonicalBar builder — single authoritative bar-aggregation algorithm.
 *
 * Consumers: chart renderer, backtest engine, signal engine, gap classifier.
 * All must use the same CanonicalBar for signal parity.
 */

import type { CanonicalBar, NormalizedMarketQuote } from "../types"

// ─── Timeframe helpers ────────────────────────────────────────────────────────

const TF_SECONDS: Record<string, number> = {
  "1m":  60,
  "5m":  300,
  "15m": 900,
  "30m": 1800,
  "1h":  3600,
  "2h":  7200,
  "4h":  14400,
  "1d":  86400,
}

export function timeframeToSeconds(tf: string): number {
  const s = TF_SECONDS[tf.toLowerCase()]
  if (!s) throw new Error(`Unknown timeframe: ${tf}`)
  return s
}

export function bucketStartEpochSec(epochSec: number, tfSec: number): number {
  return Math.floor(epochSec / tfSec) * tfSec
}

export function bucketEndEpochSec(bucketStartSec: number, tfSec: number): number {
  return bucketStartSec + tfSec
}

export function epochSecToIso(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString()
}

// ─── Bar state ────────────────────────────────────────────────────────────────

export interface MutableBar {
  instrumentId: string
  timeframe: string
  bucketStartSec: number
  bucketEndSec: number
  open: number
  high: number
  low: number
  close: number
  volume: number | null
  tickCount: number
  source: string
  firstTickUtc: string | null
  lastTickUtc: string | null
}

// ─── BarBuilder ───────────────────────────────────────────────────────────────

/**
 * Stateful bar builder for one instrument + timeframe combination.
 *
 * Feed quotes via `update()`. When a bucket boundary is crossed, the completed
 * bar is returned from `update()`. The current open bar is always available via
 * `currentBar`.
 */
export class BarBuilder {
  private _current: MutableBar | null = null
  private readonly tfSec: number

  constructor(
    readonly instrumentId: string,
    readonly timeframe: string,
    readonly source: string = "bar_builder_live",
  ) {
    this.tfSec = timeframeToSeconds(timeframe)
  }

  get currentBar(): CanonicalBar | null {
    if (!this._current) return null
    return this._toCanonical(this._current, false)
  }

  /**
   * Feed one normalized quote.
   *
   * Returns the completed (final) bar if a bucket boundary was crossed,
   * otherwise returns null.
   */
  update(quote: NormalizedMarketQuote): CanonicalBar | null {
    const epochSec = Math.floor(new Date(quote.providerTimestampUtc).getTime() / 1000)
    const bucketSec = bucketStartEpochSec(epochSec, this.tfSec)

    if (!this._current) {
      this._openBar(quote, bucketSec)
      return null
    }

    if (bucketSec > this._current.bucketStartSec) {
      // Bucket closed — capture final bar, open new one
      const completed = this._toCanonical(this._current, true)
      this._openBar(quote, bucketSec)
      return completed
    }

    if (bucketSec < this._current.bucketStartSec) {
      // Out-of-order tick from a past bucket — ignore, do not corrupt current bar
      return null
    }

    // Same bucket — update OHLC
    const p = quote.chartPrice
    this._current.high  = Math.max(this._current.high, p)
    this._current.low   = Math.min(this._current.low, p)
    this._current.close = p
    this._current.tickCount++
    this._current.lastTickUtc = quote.providerTimestampUtc
    if (quote.sequence != null && this._current.volume != null) {
      // volume tracking not available from TV quotes; skip
    }

    return null
  }

  /**
   * Force-close the current bar (e.g., on market close).
   * Resets internal state.
   */
  flush(): CanonicalBar | null {
    if (!this._current) return null
    const final = this._toCanonical(this._current, true)
    this._current = null
    return final
  }

  /** Replace current open bar with a pre-built bar (e.g., from chart-series backfill). */
  seedOpenBar(bar: CanonicalBar): void {
    const bucketSec = Math.floor(new Date(bar.bucketStartUtc).getTime() / 1000)
    this._current = {
      instrumentId: bar.instrumentId,
      timeframe: bar.timeframe,
      bucketStartSec: bucketSec,
      bucketEndSec: bucketSec + this.tfSec,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      tickCount: bar.tickCount,
      source: bar.source,
      firstTickUtc: bar.firstTickUtc,
      lastTickUtc: bar.lastTickUtc,
    }
  }

  reset(): void {
    this._current = null
  }

  private _openBar(quote: NormalizedMarketQuote, bucketSec: number): void {
    const p = quote.chartPrice
    this._current = {
      instrumentId: this.instrumentId,
      timeframe: this.timeframe,
      bucketStartSec: bucketSec,
      bucketEndSec: bucketSec + this.tfSec,
      open:  p,
      high:  p,
      low:   p,
      close: p,
      volume: null,
      tickCount: 1,
      source: this.source,
      firstTickUtc: quote.providerTimestampUtc,
      lastTickUtc: quote.providerTimestampUtc,
    }
  }

  private _toCanonical(b: MutableBar, isFinal: boolean): CanonicalBar {
    return {
      instrumentId: b.instrumentId,
      timeframe: b.timeframe,
      bucketStartUtc: epochSecToIso(b.bucketStartSec),
      bucketEndUtc:   epochSecToIso(b.bucketEndSec),
      open:  b.open,
      high:  b.high,
      low:   b.low,
      close: b.close,
      volume: b.volume,
      tickCount: b.tickCount,
      isFinal,
      source: b.source,
      firstTickUtc: b.firstTickUtc,
      lastTickUtc: b.lastTickUtc,
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const _builders = new Map<string, BarBuilder>()

export function getBarBuilder(
  instrumentId: string,
  timeframe: string,
  source?: string,
): BarBuilder {
  const key = `${instrumentId}:${timeframe}`
  if (!_builders.has(key)) {
    _builders.set(key, new BarBuilder(instrumentId, timeframe, source))
  }
  return _builders.get(key)!
}

export function _resetBarBuildersForTests(): void {
  _builders.clear()
}
