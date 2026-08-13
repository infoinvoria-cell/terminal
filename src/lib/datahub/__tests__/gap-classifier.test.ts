import { describe, it, expect } from "vitest"
import { classifyGaps, countMissingBuckets } from "../market/gap-classifier"
// instrument-registry auto-registers on import
import "../market/instrument-registry"

const NOW = "2026-08-07T12:00:00Z" // Thursday 14:00 CEST, trading hours

describe("classifyGaps — market_closed (weekend)", () => {
  it("Saturday bucket classified as market_closed", () => {
    // 2026-08-08 is Saturday
    const results = classifyGaps("6e", "30m", {
      rangeStartUtc: "2026-08-08T10:00:00Z",
      rangeEndUtc:   "2026-08-08T11:00:00Z",
      actualBucketStartSecs: new Set(),
      nowUtc: NOW,
    })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.classification).toBe("market_closed")
    }
  })

  it("Sunday morning classified as market_closed", () => {
    // 2026-08-09 Sunday 10:00 UTC is before 22:00 (pre-open)
    const results = classifyGaps("6e", "30m", {
      rangeStartUtc: "2026-08-09T10:00:00Z",
      rangeEndUtc:   "2026-08-09T11:00:00Z",
      actualBucketStartSecs: new Set(),
      nowUtc: NOW,
    })
    for (const r of results) {
      expect(r.classification).toBe("market_closed")
    }
  })
})

describe("classifyGaps — actual bars", () => {
  it("buckets with actual bars are classified as actual", () => {
    const bucketSec = Math.floor(new Date("2026-08-07T10:00:00Z").getTime() / 1000)
    const results = classifyGaps("6e", "30m", {
      rangeStartUtc: "2026-08-07T10:00:00Z",
      rangeEndUtc:   "2026-08-07T11:00:00Z",
      actualBucketStartSecs: new Set([bucketSec]),
      nowUtc: NOW,
    })
    const actual = results.find((r) => r.bucketStartUtc.startsWith("2026-08-07T10:00"))
    expect(actual?.classification).toBe("actual")
  })
})

describe("classifyGaps — future buckets", () => {
  it("bucket starting after now is classified as future", () => {
    const results = classifyGaps("6e", "30m", {
      rangeStartUtc: "2026-08-07T13:00:00Z",
      rangeEndUtc:   "2026-08-07T14:00:00Z",
      actualBucketStartSecs: new Set(),
      nowUtc: "2026-08-07T12:00:00Z",
    })
    for (const r of results) {
      expect(r.classification).toBe("future")
    }
  })
})

describe("classifyGaps — pipeline_failure for old missing buckets", () => {
  it("old trading-hours bucket with no bar is pipeline_failure", () => {
    // 2026-08-06 Wednesday 10:00 UTC — clearly a trading hour, well in the past
    const results = classifyGaps("6e", "30m", {
      rangeStartUtc: "2026-08-06T10:00:00Z",
      rangeEndUtc:   "2026-08-06T11:00:00Z",
      actualBucketStartSecs: new Set(),
      nowUtc: NOW,
    })
    const tradingBucket = results.find((r) => r.bucketStartUtc.startsWith("2026-08-06T10"))
    expect(tradingBucket?.classification).toBe("pipeline_failure")
  })
})

describe("countMissingBuckets", () => {
  it("counts pipeline_failure separately from market_closed", () => {
    const actualsSet = new Set<number>()
    const { byClassification } = countMissingBuckets("6e", "30m", {
      rangeStartUtc: "2026-08-06T10:00:00Z",
      rangeEndUtc:   "2026-08-09T00:00:00Z", // Wed–Sun range
      actualBucketStartSecs: actualsSet,
      nowUtc: NOW,
    })
    // There should be market_closed buckets (weekend) and pipeline_failures (trading hours)
    expect(byClassification.market_closed).toBeGreaterThan(0)
    expect(byClassification.pipeline_failure).toBeGreaterThan(0)
  })
})
