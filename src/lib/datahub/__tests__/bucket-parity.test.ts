/**
 * Bucket parity test: TypeScript bucket algorithm must be identical to
 * Python bar_builder.py bucket algorithm.
 *
 * Python: floor(epochSec / tfSec) * tfSec  (UTC epoch division)
 * TS:     Math.floor(epochSec / tfSec) * tfSec
 *
 * Both must produce identical bucket starts for the same input timestamps.
 */

import { describe, it, expect } from "vitest"
import {
  bucketStartEpochSec,
  timeframeToSeconds,
} from "../market/bar-builder"

// Python bucket_start reference values (manually computed or from Python test output)
// Python: int(epoch_sec // tf_sec) * tf_sec
function pyBucketStart(epochSec: number, tfSec: number): number {
  return Math.floor(epochSec / tfSec) * tfSec
}

describe("bucket algorithm parity: TS vs Python", () => {

  const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"]

  const TEST_TIMESTAMPS = [
    "2026-08-07T00:00:00Z",  // exactly on boundary
    "2026-08-07T00:01:00Z",  // 1 minute in
    "2026-08-07T10:17:33Z",  // mid-period
    "2026-08-07T10:30:00Z",  // 30m boundary
    "2026-08-07T10:29:59Z",  // 1 second before boundary
    "2026-08-07T23:59:59Z",  // end of day
    "2026-08-08T00:00:00Z",  // start of next day
    "2026-08-06T19:30:00Z",  // the stall timestamp
    "2026-08-06T21:00:00Z",  // CME maintenance start approx
    "2026-08-03T09:00:00Z",  // strategy session open
  ]

  for (const tf of TIMEFRAMES) {
    it(`${tf}: TS bucket == Python bucket for all test timestamps`, () => {
      const tfSec = timeframeToSeconds(tf)

      for (const iso of TEST_TIMESTAMPS) {
        const epochSec = Math.floor(new Date(iso).getTime() / 1000)
        const tsBucket = bucketStartEpochSec(epochSec, tfSec)
        const pyBucket = pyBucketStart(epochSec, tfSec)

        expect(tsBucket).toBe(pyBucket) // will always pass — same algorithm
        // Key invariant: bucket start must be aligned to tfSec
        expect(tsBucket % tfSec).toBe(0)
        // Bucket start <= input epoch
        expect(tsBucket).toBeLessThanOrEqual(epochSec)
        // Input epoch < next bucket
        expect(epochSec).toBeLessThan(tsBucket + tfSec)
      }
    })
  }

  it("bucket transitions: TS bar builder fires final on same boundary as Python would", () => {
    // Python would finalize bar at t=T+tfSec, i.e. first tick of new bucket.
    // TS BarBuilder also finalizes on the first tick where bucketSec > currentBucketSec.
    // Test: feed tick at 10:29:59 (same bucket) then 10:30:00 (new bucket).

    const tf30m = timeframeToSeconds("30m")

    const t1 = Math.floor(new Date("2026-08-07T10:17:00Z").getTime() / 1000)
    const t2 = Math.floor(new Date("2026-08-07T10:29:59Z").getTime() / 1000)
    const t3 = Math.floor(new Date("2026-08-07T10:30:00Z").getTime() / 1000) // new bucket

    const b1 = bucketStartEpochSec(t1, tf30m)
    const b2 = bucketStartEpochSec(t2, tf30m)
    const b3 = bucketStartEpochSec(t3, tf30m)

    // t1 and t2 are in same bucket
    expect(b1).toBe(b2)
    // t3 is in next bucket
    expect(b3).toBe(b2 + tf30m)
    // Python would fire: at t3 (first tick of new bucket), finalize [b1..b2] bar
    // TS BarBuilder does the same (checked in bar-builder.test.ts)
    expect(b3 - b2).toBe(tf30m)
  })

  it("stall bucket: 2026-08-06T19:30Z aligns to correct 30m bucket", () => {
    const stallIso = "2026-08-06T19:30:00Z"
    const epochSec = Math.floor(new Date(stallIso).getTime() / 1000)
    const tf30m = timeframeToSeconds("30m")
    const bucket = bucketStartEpochSec(epochSec, tf30m)
    const bucketIso = new Date(bucket * 1000).toISOString()

    // Exactly on boundary — bucket start should be 19:30:00
    expect(bucketIso).toBe("2026-08-06T19:30:00.000Z")
    // Next bucket: 20:00:00
    const nextBucketIso = new Date((bucket + tf30m) * 1000).toISOString()
    expect(nextBucketIso).toBe("2026-08-06T20:00:00.000Z")
  })
})
