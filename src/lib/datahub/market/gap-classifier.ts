/**
 * Bucket gap classifier.
 *
 * Given an instrument, timeframe, and a list of bucket start times,
 * classifies each missing bucket as one of the BucketClassification values.
 *
 * Uses the InstrumentDefinition's electronicSession and maintenanceBreak
 * for DST-aware classification. Does NOT depend on Python-side session logic.
 */

import type {
  BucketClassification,
  BucketStatus,
  InstrumentDefinition,
} from "../types"
import {
  bucketStartEpochSec,
  bucketEndEpochSec,
  epochSecToIso,
  timeframeToSeconds,
} from "./bar-builder"
import { getInstrument } from "./instrument-registry"

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GapClassifierOptions {
  /** ISO UTC string of first bucket to consider. */
  rangeStartUtc: string
  /** ISO UTC string of last bucket to consider (exclusive). */
  rangeEndUtc: string
  /** Set of bucket start epoch seconds that have actual bars. */
  actualBucketStartSecs: Set<number>
  /** Current wall-clock UTC for "future" detection. */
  nowUtc?: string
}

export function classifyGaps(
  instrumentId: string,
  timeframe: string,
  opts: GapClassifierOptions,
): BucketStatus[] {
  const instrument = getInstrument(instrumentId)
  const tfSec = timeframeToSeconds(timeframe)

  const rangeStart = Math.floor(new Date(opts.rangeStartUtc).getTime() / 1000)
  const rangeEnd   = Math.floor(new Date(opts.rangeEndUtc).getTime() / 1000)
  const nowSec     = opts.nowUtc
    ? Math.floor(new Date(opts.nowUtc).getTime() / 1000)
    : Math.floor(Date.now() / 1000)

  // Align start to bucket grid
  const firstBucket = bucketStartEpochSec(rangeStart, tfSec)

  const results: BucketStatus[] = []

  for (
    let bucketSec = firstBucket;
    bucketSec < rangeEnd;
    bucketSec += tfSec
  ) {
    const bucketEndSec = bucketEndEpochSec(bucketSec, tfSec)
    const hasBar = opts.actualBucketStartSecs.has(bucketSec)

    const classification = hasBar
      ? "actual"
      : classifyMissingBucket(bucketSec, bucketEndSec, tfSec, instrument, nowSec)

    results.push({
      bucketStartUtc:  epochSecToIso(bucketSec),
      bucketEndUtc:    epochSecToIso(bucketEndSec),
      classification,
      hasActualBar: hasBar,
    })
  }

  return results
}

export function countMissingBuckets(
  instrumentId: string,
  timeframe: string,
  opts: GapClassifierOptions,
): { total: number; byClassification: Record<BucketClassification, number> } {
  const statuses = classifyGaps(instrumentId, timeframe, opts)

  const counts: Record<BucketClassification, number> = {
    actual: 0,
    market_closed: 0,
    maintenance: 0,
    holiday: 0,
    expected_no_trade: 0,
    source_missing: 0,
    pipeline_failure: 0,
    future: 0,
  }

  for (const s of statuses) {
    counts[s.classification]++
  }

  const total = counts.source_missing + counts.pipeline_failure

  return { total, byClassification: counts }
}

// ─── Classification logic ─────────────────────────────────────────────────────

function classifyMissingBucket(
  bucketStartSec: number,
  bucketEndSec: number,
  _tfSec: number,
  instrument: InstrumentDefinition | null,
  nowSec: number,
): BucketClassification {
  if (!instrument) {
    if (bucketStartSec > nowSec) return "future"
    return "source_missing"
  }

  const bucketMidSec = Math.floor((bucketStartSec + bucketEndSec) / 2)
  const bucketMidDate = new Date(bucketMidSec * 1000)
  const dow = bucketMidDate.getUTCDay() // 0=Sun, 6=Sat

  // Weekend check before future check — weekends are structurally closed
  if (dow === 6) return "market_closed" // Saturday always closed
  if (dow === 0) {
    // Sunday: CME-style opens 17:00 CT (22:00 UTC summer, 23:00 UTC winter)
    // Use 22:00 UTC as conservative threshold (works for CDT; slightly off for CST)
    const hourUtc = bucketMidDate.getUTCHours()
    if (hourUtc < 22) return "market_closed"
  }

  // Friday close check for CME instruments
  const elec = instrument.electronicSession
  if (elec && elec.closeDow === 4 /* Friday */) {
    if (dow === 4) {
      const hourUtc = bucketMidDate.getUTCHours()
      // CME closes Friday 16:00 CT = ~21:00 UTC (CDT) or ~22:00 UTC (CST)
      if (hourUtc >= 21) return "market_closed"
    }
  }

  // Maintenance break check
  const maint = instrument.maintenanceBreak
  if (maint && maint.appliesDow.includes(dow)) {
    // Rough UTC approximation: maintenance is 1h window, commonly 21:00–22:00 UTC (CDT)
    const hourUtc = bucketMidDate.getUTCHours()
    // Map maintenance start from local timezone to UTC
    // For America/Chicago CDT (UTC-5): startHour 16 → UTC 21
    // For America/New_York EDT (UTC-4): startHour 17 → UTC 21
    // Both happen to be ~21:00 UTC in summer
    const maintStartUtc = maint.startHour + 5 // CDT approximation
    const maintEndUtc   = maint.endHour + 5
    if (hourUtc >= maintStartUtc && hourUtc < maintEndUtc) {
      return "maintenance"
    }
  }

  // Future trading-hours bucket (e.g. today afternoon, market hasn't reached yet)
  if (bucketStartSec > nowSec) return "future"

  // Bucket is in an expected trading period but has no bar
  // Classify based on age: very recent = possible pipeline lag, older = pipeline failure
  const ageSec = nowSec - bucketEndSec
  if (ageSec < 120) {
    // Very recent — bar might still be in flight
    return "source_missing"
  }

  return "pipeline_failure"
}
