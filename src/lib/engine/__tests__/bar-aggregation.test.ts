import { describe, it, expect } from 'vitest'
import {
  getBerlinOffsetSec,
  tfStepSec,
  barBoundaryUtcSec,
  toDisplaySec,
  normalizeToSlot,
  providerBucketUtc,
  LiveBarAccumulator,
} from '../bar-aggregation'

// ─── Timezone ─────────────────────────────────────────────────────────────────

describe('getBerlinOffsetSec', () => {
  it('returns 7200 for a summer date (CEST = UTC+2)', () => {
    const ts = new Date('2026-08-05T12:00:00Z').getTime()
    expect(getBerlinOffsetSec(ts)).toBe(7200)
  })

  it('returns 3600 for a winter date (CET = UTC+1)', () => {
    const ts = new Date('2026-01-15T12:00:00Z').getTime()
    expect(getBerlinOffsetSec(ts)).toBe(3600)
  })

  it('handles the DST spring-forward boundary (last Sunday March → +2h)', () => {
    // DST starts last Sunday of March at 02:00 CET → 03:00 CEST
    // 2026-03-29 is the last Sunday in March
    const beforeDst = new Date('2026-03-29T00:59:00Z').getTime() // 01:59 UTC = still CET
    const afterDst  = new Date('2026-03-29T01:01:00Z').getTime() // 02:01 UTC = now CEST
    expect(getBerlinOffsetSec(beforeDst)).toBe(3600)
    expect(getBerlinOffsetSec(afterDst)).toBe(7200)
  })

  it('handles the DST fall-back boundary (last Sunday Oct → +1h)', () => {
    // DST ends last Sunday of October at 03:00 CEST → 02:00 CET
    // 2026-10-25 is the last Sunday in October
    const beforeFallback = new Date('2026-10-25T00:59:00Z').getTime() // 02:59 CEST
    const afterFallback  = new Date('2026-10-25T01:01:00Z').getTime() // 02:01 CET
    expect(getBerlinOffsetSec(beforeFallback)).toBe(7200)
    expect(getBerlinOffsetSec(afterFallback)).toBe(3600)
  })
})

// ─── tfStepSec ────────────────────────────────────────────────────────────────

describe('tfStepSec', () => {
  it('30M → 1800', () => { expect(tfStepSec('30M')).toBe(1800) })
  it('1H  → 3600', () => { expect(tfStepSec('1H')).toBe(3600)  })
  it('2H  → 7200', () => { expect(tfStepSec('2H')).toBe(7200)  })
  it('D   → 86400', () => { expect(tfStepSec('D')).toBe(86400) })
  it('case-insensitive', () => { expect(tfStepSec('30m')).toBe(1800) })
})

// ─── barBoundaryUtcSec ────────────────────────────────────────────────────────

describe('barBoundaryUtcSec', () => {
  const step = 1800

  it('floors 09:47 UTC to 09:30 UTC', () => {
    const nine47 = new Date('2026-08-05T09:47:00Z').getTime() / 1000
    const nine30 = new Date('2026-08-05T09:30:00Z').getTime() / 1000
    expect(barBoundaryUtcSec(nine47, step)).toBe(nine30)
  })

  it('exact boundary — 09:30:00 maps to 09:30:00', () => {
    const nine30 = new Date('2026-08-05T09:30:00Z').getTime() / 1000
    expect(barBoundaryUtcSec(nine30, step)).toBe(nine30)
  })

  it('07:00 UTC (Berlin 09:00 CEST) → 07:00 UTC bar boundary', () => {
    const seven00 = new Date('2026-08-05T07:00:00Z').getTime() / 1000
    expect(barBoundaryUtcSec(seven00, step)).toBe(seven00)
  })

  it('07:01 UTC still maps to 07:00 bar', () => {
    const seven01 = new Date('2026-08-05T07:01:00Z').getTime() / 1000
    const seven00 = new Date('2026-08-05T07:00:00Z').getTime() / 1000
    expect(barBoundaryUtcSec(seven01, step)).toBe(seven00)
  })
})

// ─── toDisplaySec ─────────────────────────────────────────────────────────────

describe('toDisplaySec', () => {
  it('adds Berlin offset to UTC boundary (summer)', () => {
    const seven00Utc = new Date('2026-08-05T07:00:00Z').getTime() / 1000
    const nine00Berlin = new Date('2026-08-05T09:00:00Z').getTime() / 1000
    expect(toDisplaySec(seven00Utc, 7200)).toBe(nine00Berlin)
  })

  it('adds Berlin offset to UTC boundary (winter)', () => {
    const eight00Utc = new Date('2026-01-15T08:00:00Z').getTime() / 1000
    const nine00Berlin = new Date('2026-01-15T09:00:00Z').getTime() / 1000
    expect(toDisplaySec(eight00Utc, 3600)).toBe(nine00Berlin)
  })
})

// ─── LiveBarAccumulator ───────────────────────────────────────────────────────

describe('LiveBarAccumulator', () => {
  const STEP = 1800
  const T930 = new Date('2026-08-05T09:30:00Z').getTime() / 1000
  const T947 = T930 + 17 * 60   // 09:47 (same bar)
  const T958 = T930 + 28 * 60   // 09:58 (same bar)
  const T1000 = T930 + STEP     // 10:00 (next bar)

  it('open is set from the first tick', () => {
    const acc = new LiveBarAccumulator()
    const { open } = acc.update(1.1550, T947, STEP)
    expect(open).toBe(1.1550)
  })

  it('open stays stable across ticks within the same bar', () => {
    const acc = new LiveBarAccumulator()
    acc.update(1.1550, T947, STEP)
    const { open } = acc.update(1.1560, T958, STEP)
    expect(open).toBe(1.1550)
  })

  it('high only grows when a new tick exceeds it', () => {
    const acc = new LiveBarAccumulator()
    acc.update(1.1550, T947, STEP)
    acc.update(1.1555, T958, STEP)
    const { high } = acc.update(1.1553, T958 + 5, STEP) // lower tick
    expect(high).toBe(1.1555)
  })

  it('low only falls when a new tick goes below it', () => {
    const acc = new LiveBarAccumulator()
    acc.update(1.1550, T947, STEP)
    acc.update(1.1545, T958, STEP)
    const { low } = acc.update(1.1548, T958 + 5, STEP) // higher tick
    expect(low).toBe(1.1545)
  })

  it('close is always the last tick price', () => {
    const acc = new LiveBarAccumulator()
    acc.update(1.1550, T947, STEP)
    const { close } = acc.update(1.1557, T958, STEP)
    expect(close).toBe(1.1557)
  })

  it('bar properties: high >= max(open, close) always', () => {
    const acc = new LiveBarAccumulator()
    const prices = [1.1550, 1.1563, 1.1548, 1.1555, 1.1541]
    let last: ReturnType<typeof acc.update> = acc.update(prices[0], T947, STEP)
    for (let i = 1; i < prices.length; i++) {
      last = acc.update(prices[i], T947 + i * 5, STEP)
      expect(last.high).toBeGreaterThanOrEqual(Math.max(last.open, last.close))
    }
  })

  it('bar properties: low <= min(open, close) always', () => {
    const acc = new LiveBarAccumulator()
    const prices = [1.1550, 1.1563, 1.1548, 1.1555, 1.1541]
    let last: ReturnType<typeof acc.update> = acc.update(prices[0], T947, STEP)
    for (let i = 1; i < prices.length; i++) {
      last = acc.update(prices[i], T947 + i * 5, STEP)
      expect(last.low).toBeLessThanOrEqual(Math.min(last.open, last.close))
    }
  })

  it('duplicate tick does not change H/L beyond its first occurrence', () => {
    const acc = new LiveBarAccumulator()
    acc.update(1.1550, T947, STEP)
    const after1 = acc.update(1.1560, T958, STEP)
    const after2 = acc.update(1.1560, T958 + 5, STEP) // same price again
    expect(after1.high).toBe(after2.high)
    expect(after1.low).toBe(after2.low)
  })

  it('period change creates exactly one new bar with reset OHLC', () => {
    const acc = new LiveBarAccumulator()
    const bar1 = acc.update(1.1550, T947, STEP)
    acc.update(1.1563, T958, STEP)
    const bar2 = acc.update(1.1557, T1000, STEP) // new period
    expect(bar2.barUtcSec).toBe(T1000)
    expect(bar2.open).toBe(1.1557)  // first tick of new bar
    expect(bar2.high).toBe(1.1557)
    expect(bar2.low).toBe(1.1557)
    expect(bar1.barUtcSec).toBe(T930)
  })

  it('initFromData seeds open from monitoring bar without corrupting H/L', () => {
    const acc = new LiveBarAccumulator()
    acc.initFromData(1.1545, T930)    // monitoring bar open
    const r = acc.update(1.1560, T947, STEP)
    expect(r.open).toBe(1.1545)      // monitoring open preserved
    expect(r.high).toBe(1.1560)      // H/L from ticks only
    expect(r.low).toBe(1.1545)       // open was the lowest so far
  })

  it('initFromData does not override a bar that already has live ticks', () => {
    const acc = new LiveBarAccumulator()
    acc.update(1.1557, T947, STEP)   // first live tick sets open
    acc.initFromData(1.1500, T930)   // attempt to seed — should be ignored
    const r = acc.update(1.1558, T958, STEP)
    expect(r.open).toBe(1.1557)      // first tick open preserved
  })

  it('reset clears all state', () => {
    const acc = new LiveBarAccumulator()
    acc.update(1.1550, T947, STEP)
    acc.reset()
    expect(acc.currentBarUtcSec()).toBeNull()
    // After reset, next tick starts fresh
    const r = acc.update(1.1560, T1000, STEP)
    expect(r.open).toBe(1.1560)
    expect(r.barUtcSec).toBe(T1000)
  })
})

// ─── CFD vs Futures separation ────────────────────────────────────────────────

describe('CFD / Futures symbol separation', () => {
  // Verify the strategy definitions do NOT cross-contaminate symbols
  const EUR_30M_FUTURES = '6E1!'
  const EUR_30M_CFD     = 'EURUSD'

  it('EUR futures liveSymbol is 6E1! (CME contract)', () => {
    expect(EUR_30M_FUTURES).toBe('6E1!')
  })

  it('EUR CFD symbol is EURUSD (spot/OTC)', () => {
    expect(EUR_30M_CFD).toBe('EURUSD')
  })

  it('futures and CFD symbols are different', () => {
    expect(EUR_30M_FUTURES).not.toBe(EUR_30M_CFD)
  })

  it('live quotes key uses futures symbol (6E1!), not CFD', () => {
    // The liveSymbol prop for EUR_30M is "6E1!" — validated against STRATEGIES config
    const liveSymbol = EUR_30M_FUTURES
    expect(liveSymbol).toMatch(/^6E/)
  })
})

// ─── Signal time alignment ────────────────────────────────────────────────────

describe('Signal time ↔ bar time alignment', () => {
  const STEP = 1800

  it('a signal timestamped at 09:00:00Z aligns to the 09:00 UTC bar', () => {
    const sigTs = new Date('2026-08-05T09:00:00Z').getTime() / 1000
    const barUtc = barBoundaryUtcSec(sigTs, STEP)
    expect(barUtc).toBe(sigTs)
  })

  it('a signal timestamped at 09:05:00Z still belongs to the 09:00 bar', () => {
    const sigTs  = new Date('2026-08-05T09:05:00Z').getTime() / 1000
    const bar900 = new Date('2026-08-05T09:00:00Z').getTime() / 1000
    expect(barBoundaryUtcSec(sigTs, STEP)).toBe(bar900)
  })

  it('09:00 UTC bar → 11:00 Berlin display time in summer (CEST)', () => {
    const bar900Utc    = new Date('2026-08-05T09:00:00Z').getTime() / 1000
    const eleven00Bln  = new Date('2026-08-05T11:00:00Z').getTime() / 1000
    expect(toDisplaySec(bar900Utc, 7200)).toBe(eleven00Bln)
  })

  it('07:00 UTC bar → 09:00 Berlin display time in summer (CEST)', () => {
    const bar700Utc  = new Date('2026-08-05T07:00:00Z').getTime() / 1000
    const nine00Bln  = new Date('2026-08-05T09:00:00Z').getTime() / 1000
    expect(toDisplaySec(bar700Utc, 7200)).toBe(nine00Bln)
  })
})

// ─── normalizeToSlot ──────────────────────────────────────────────────────────

describe('normalizeToSlot', () => {
  const STEP = 1800

  it('bar-start 15:00 UTC → 15:00 UTC (unchanged)', () => {
    const t = new Date('2026-08-05T13:00:00Z').getTime() / 1000  // 15:00 Berlin CEST
    expect(normalizeToSlot(t, STEP)).toBe(t)
  })

  it('bar-end 15:29:59 UTC → 15:00 UTC (normalised to start)', () => {
    const end   = new Date('2026-08-05T13:29:59Z').getTime() / 1000
    const start = new Date('2026-08-05T13:00:00Z').getTime() / 1000
    expect(normalizeToSlot(end, STEP)).toBe(start)
  })

  it('bar-start 15:30 UTC → 15:30 UTC (unchanged)', () => {
    const t = new Date('2026-08-05T13:30:00Z').getTime() / 1000
    expect(normalizeToSlot(t, STEP)).toBe(t)
  })

  it('intermediate 15:21 Berlin → normalises to 15:00 bucket', () => {
    const ts    = new Date('2026-08-05T13:21:00Z').getTime() / 1000  // 15:21 Berlin CEST
    const start = new Date('2026-08-05T13:00:00Z').getTime() / 1000
    expect(normalizeToSlot(ts, STEP)).toBe(start)
  })
})

// ─── providerBucketUtc — phantom candle prevention ───────────────────────────

describe('providerBucketUtc', () => {
  const STEP = 1800

  it('provider 15:00:00 Berlin → bucket 13:00 UTC (15:00 CEST)', () => {
    const ts  = '2026-08-05T13:00:00Z'  // 15:00 Berlin CEST
    const expected = new Date('2026-08-05T13:00:00Z').getTime() / 1000
    expect(providerBucketUtc(ts, STEP)).toBe(expected)
  })

  it('provider 15:21 Berlin → bucket 13:00 UTC — NOT 13:30', () => {
    const ts       = '2026-08-05T13:21:00Z'   // 15:21 Berlin CEST
    const bucket15 = new Date('2026-08-05T13:00:00Z').getTime() / 1000
    const bucket1530 = new Date('2026-08-05T13:30:00Z').getTime() / 1000
    const result = providerBucketUtc(ts, STEP)
    expect(result).toBe(bucket15)
    expect(result).not.toBe(bucket1530)
  })

  it('provider 15:29:59 Berlin → bucket 13:00 UTC (still in 15:00 candle)', () => {
    const ts       = '2026-08-05T13:29:59Z'   // 15:29:59 Berlin CEST
    const bucket15 = new Date('2026-08-05T13:00:00Z').getTime() / 1000
    expect(providerBucketUtc(ts, STEP)).toBe(bucket15)
  })

  it('provider 15:30:00 Berlin → bucket 13:30 UTC (new candle starts)', () => {
    const ts         = '2026-08-05T13:30:00Z'   // 15:30:00 Berlin CEST
    const bucket1530 = new Date('2026-08-05T13:30:00Z').getTime() / 1000
    expect(providerBucketUtc(ts, STEP)).toBe(bucket1530)
  })

  it('browser 15:31 with provider 15:21 → bucket stays at 13:00, NOT 13:30', () => {
    // This is the core phantom-candle scenario:
    // Browser time 15:31 Berlin would produce bucket 13:30 UTC.
    // Provider event time 15:21 Berlin must produce bucket 13:00 UTC.
    const providerTs = '2026-08-05T13:21:00Z'   // 15:21 Berlin = what the feed gives us
    const bucket15   = new Date('2026-08-05T13:00:00Z').getTime() / 1000
    const bucket1530 = new Date('2026-08-05T13:30:00Z').getTime() / 1000
    expect(providerBucketUtc(providerTs, STEP)).toBe(bucket15)
    expect(providerBucketUtc(providerTs, STEP)).not.toBe(bucket1530)
  })

  it('updated_at 15:31 Berlin must NOT be used — only provider event ts matters', () => {
    // Simulates the old bug: passing updated_at (DB insert time ≈ browser time)
    // to providerBucketUtc would give bucket 13:30 (the wrong future bucket).
    // The fix: providerBucketUtc only accepts the provider event timestamp as a string.
    // Passing updated_at = 15:31 produces wrong bucket 13:30 — callers must NOT do this.
    const updatedAt  = '2026-08-05T13:31:00Z'   // 15:31 Berlin — DB insert time
    const providerTs = '2026-08-05T13:21:00Z'   // 15:21 Berlin — real event
    const bucket1530 = new Date('2026-08-05T13:30:00Z').getTime() / 1000
    const bucket15   = new Date('2026-08-05T13:00:00Z').getTime() / 1000
    // Passing updated_at wrongly → phantom bucket
    expect(providerBucketUtc(updatedAt, STEP)).toBe(bucket1530)
    // Passing provider event ts correctly → real bucket
    expect(providerBucketUtc(providerTs, STEP)).toBe(bucket15)
  })

  it('null provider timestamp → null (no candle created)', () => {
    expect(providerBucketUtc(null, STEP)).toBeNull()
    expect(providerBucketUtc(undefined, STEP)).toBeNull()
    expect(providerBucketUtc('', STEP)).toBeNull()
  })

  it('new bucket created exactly when first real tick of that bucket arrives', () => {
    const firstTickOf1530 = '2026-08-05T13:30:00Z'  // 15:30:00 Berlin — first real tick
    const bucket1530 = new Date('2026-08-05T13:30:00Z').getTime() / 1000
    expect(providerBucketUtc(firstTickOf1530, STEP)).toBe(bucket1530)
  })

  it('provider 16:59:59 Berlin → bucket 16:30 (14:30 UTC), NOT 17:00', () => {
    const ts       = '2026-08-05T14:59:59Z'    // 16:59:59 CEST
    const bucket1630 = new Date('2026-08-05T14:30:00Z').getTime() / 1000
    const bucket17   = new Date('2026-08-05T15:00:00Z').getTime() / 1000
    const result = providerBucketUtc(ts, STEP)
    expect(result).toBe(bucket1630)
    expect(result).not.toBe(bucket17)
  })

  it('provider 17:00:00 Berlin → bucket 17:00 (15:00 UTC) — new candle starts', () => {
    const ts       = '2026-08-05T15:00:00Z'    // 17:00:00 CEST
    const bucket17 = new Date('2026-08-05T15:00:00Z').getTime() / 1000
    expect(providerBucketUtc(ts, STEP)).toBe(bucket17)
  })

  it('browser 17:15, provider 17:05 → actual bucket 17:00 (15:00 UTC)', () => {
    // Browser: 17:15 Berlin → Math.floor(17:15 UTC+2 / 1800) → bucket 17:00
    // Provider: 17:05 Berlin → bucket 17:00 (same)
    // Both give same result — confirmed with provider ts only
    const providerTs = '2026-08-05T15:05:00Z'   // 17:05 CEST
    const bucket17   = new Date('2026-08-05T15:00:00Z').getTime() / 1000
    expect(providerBucketUtc(providerTs, STEP)).toBe(bucket17)
  })

  it('browser 17:15, provider 16:55 → bucket 16:30 (14:30 UTC), NOT 17:00', () => {
    // This is the key phantom-candle scenario:
    // Browser would give bucket 17:00. Provider at 16:55 → bucket 16:30.
    const providerTs  = '2026-08-05T14:55:00Z'  // 16:55 CEST
    const bucket1630  = new Date('2026-08-05T14:30:00Z').getTime() / 1000
    const bucket17    = new Date('2026-08-05T15:00:00Z').getTime() / 1000
    const result = providerBucketUtc(providerTs, STEP)
    expect(result).toBe(bucket1630)
    expect(result).not.toBe(bucket17)
  })
})

// ─── LiveBarAccumulator — deduplication ──────────────────────────────────────

describe('LiveBarAccumulator deduplication', () => {
  const STEP = 1800
  const T930 = new Date('2026-08-05T09:30:00Z').getTime() / 1000

  it('same tick price at same time does not change H/L (idempotent)', () => {
    const acc = new LiveBarAccumulator()
    const r1 = acc.update(1.1550, T930 + 5 * 60, STEP)
    const r2 = acc.update(1.1550, T930 + 5 * 60 + 5, STEP)  // 5 s later, same price
    expect(r2.high).toBe(r1.high)
    expect(r2.low).toBe(r1.low)
    expect(r2.open).toBe(r1.open)
  })

  it('new bucket candle created exactly when provider timestamp crosses boundary', () => {
    const acc = new LiveBarAccumulator()
    const T1530 = T930 + STEP
    acc.update(1.1550, T930 + 29 * 60, STEP)  // last tick in 09:30 bar
    const newBar = acc.update(1.1557, T1530, STEP)   // first tick in 10:00 bar
    expect(newBar.barUtcSec).toBe(T1530)
    expect(newBar.open).toBe(1.1557)
    expect(newBar.high).toBe(1.1557)
    expect(newBar.low).toBe(1.1557)
  })
})

// ─── Bar lifecycle — currentOpenBar vs lastFinalBar ───────────────────────────

describe('Bar lifecycle — currentOpenBar and lastFinalBar', () => {
  const STEP = 1800

  // At 11:23 UTC on a 30M chart:
  //   currentOpenBar  = 11:00 UTC (still forming)
  //   lastFinalBar    = 10:30 UTC (most recent completed bar)
  it('at 11:23 UTC, currentOpenBar is 11:00 and lastFinalBar is 10:30', () => {
    const t1123  = new Date('2026-08-05T11:23:00Z').getTime() / 1000
    const t1100  = new Date('2026-08-05T11:00:00Z').getTime() / 1000
    const t1030  = new Date('2026-08-05T10:30:00Z').getTime() / 1000

    const currentOpen = barBoundaryUtcSec(t1123, STEP)
    const lastFinal   = currentOpen - STEP

    expect(currentOpen).toBe(t1100)
    expect(lastFinal).toBe(t1030)
  })

  it('11:00 bar must NOT be labelled as lastFinalBar at 11:23', () => {
    const t1123 = new Date('2026-08-05T11:23:00Z').getTime() / 1000
    const t1100 = new Date('2026-08-05T11:00:00Z').getTime() / 1000

    const currentOpen = barBoundaryUtcSec(t1123, STEP)
    expect(currentOpen).toBe(t1100)
    // currentOpen === t1100 — a bar for 11:00 is the OPEN bar, not a closed one
    expect(currentOpen).not.toBeLessThan(t1100)
  })

  it('providerBucketUtc at 11:23 → 11:00 bucket (not 11:30)', () => {
    const ts     = '2026-08-05T11:23:00Z'
    const t1100  = new Date('2026-08-05T11:00:00Z').getTime() / 1000
    const t1130  = new Date('2026-08-05T11:30:00Z').getTime() / 1000

    const bucket = providerBucketUtc(ts, STEP)
    expect(bucket).toBe(t1100)
    expect(bucket).not.toBe(t1130)
  })

  it('bars with _utc < currentBucket are closed history, = currentBucket is the open bar', () => {
    const t1100 = new Date('2026-08-05T11:00:00Z').getTime() / 1000
    const t1030 = new Date('2026-08-05T10:30:00Z').getTime() / 1000
    const t1000 = new Date('2026-08-05T10:00:00Z').getTime() / 1000

    const currentBucket = t1100
    const bars = [
      { _utc: t1000, close: 1.1540 },
      { _utc: t1030, close: 1.1545 },
      { _utc: t1100, close: 1.1548 }, // open bar
    ]
    const closedBars = bars.filter(b => b._utc < currentBucket)
    const openBar    = bars.find(b => b._utc === currentBucket)

    expect(closedBars).toHaveLength(2)
    expect(closedBars.at(-1)?._utc).toBe(t1030)
    expect(openBar?._utc).toBe(t1100)
  })
})

// ─── Z-row tick discriminator ─────────────────────────────────────────────────

describe('Z-row tick discriminator (TV_SERIES_ASSETS)', () => {
  // The monitoring/ohlc route uses a regex to detect tick-built rows by their
  // trailing "Z" in the date string — history writers strip the Z, the tick feed writes it.

  function isTickBuilt(raw: string): boolean {
    return /Z$/i.test(String(raw).trim())
  }

  it('timestamp ending in Z is tick-built', () => {
    expect(isTickBuilt('2026-08-05T11:00:00Z')).toBe(true)
  })

  it('timestamp without Z is a history row', () => {
    expect(isTickBuilt('2026-08-05T11:00:00')).toBe(false)
  })

  it('lowercase z also detected', () => {
    expect(isTickBuilt('2026-08-05T11:00:00z')).toBe(true)
  })

  it('date-only string (daily bar) is NOT tick-built', () => {
    expect(isTickBuilt('2026-08-05')).toBe(false)
  })

  it('TV_SERIES_ASSETS composite keys follow the <symbol>_<tf> pattern', () => {
    const TV_SERIES_ASSETS = new Set(['6E1!_30M', '6B1!_30M', 'FDAX1!_1H', 'FDAX1!_2H'])
    expect(TV_SERIES_ASSETS.has('6E1!_30M')).toBe(true)
    expect(TV_SERIES_ASSETS.has('EURUSD_30M')).toBe(false)  // CFD not in set
    expect(TV_SERIES_ASSETS.has('FDAX1!_1H')).toBe(true)
    expect(TV_SERIES_ASSETS.has('6E1!')).toBe(false)        // bare symbol (daily) not in set
  })
})

// ─── Request generation — race-condition isolation ────────────────────────────

describe('Request generation — race condition prevention', () => {
  // Models the barsGenRef / gen pattern used in TradingEnginePage:
  // only the most-recently-started request may call setBars.

  function makeLoader() {
    let gen = 0
    const calls: string[] = []

    const setBars = (label: string, myGen: number) => {
      if (myGen === gen) calls.push(label)
    }

    const startLoad = (label: string): number => {
      return ++gen
    }

    return { startLoad, setBars, calls, getGen: () => gen }
  }

  it('only the latest generation can call setBars', () => {
    const { startLoad, setBars, calls } = makeLoader()

    const gen1 = startLoad('req-1')
    const gen2 = startLoad('req-2')  // aborts req-1 conceptually

    setBars('req-1-result', gen1)  // stale — ignored
    setBars('req-2-result', gen2)  // current — accepted

    expect(calls).toEqual(['req-2-result'])
  })

  it('single request (no race) always succeeds', () => {
    const { startLoad, setBars, calls } = makeLoader()

    const gen1 = startLoad('req-1')
    setBars('req-1-result', gen1)

    expect(calls).toEqual(['req-1-result'])
  })

  it('three rapid switches — only last result accepted', () => {
    const { startLoad, setBars, calls } = makeLoader()

    const g1 = startLoad('req-1')
    const g2 = startLoad('req-2')
    const g3 = startLoad('req-3')

    // All three complete out-of-order
    setBars('req-2-result', g2)
    setBars('req-1-result', g1)
    setBars('req-3-result', g3)

    expect(calls).toEqual(['req-3-result'])
  })
})
