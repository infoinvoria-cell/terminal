import { describe, it, expect, beforeEach } from "vitest"
import { BarBuilder, _resetBarBuildersForTests, bucketStartEpochSec, timeframeToSeconds } from "../market/bar-builder"
import type { NormalizedMarketQuote } from "../types"

beforeEach(() => {
  _resetBarBuildersForTests()
})

function makeQuote(isoUtc: string, price: number): NormalizedMarketQuote {
  return {
    instrumentId: "6e",
    assetType: "futures",
    provider: "test",
    providerSymbol: "6E1!",
    providerTimestampUtc: isoUtc,
    receivedTimestampUtc: isoUtc,
    bid: null,
    ask: null,
    last: price,
    mid: null,
    chartPrice: price,
    sequence: null,
    sourceQuality: "realtime",
  }
}

describe("timeframeToSeconds", () => {
  it("parses standard timeframes", () => {
    expect(timeframeToSeconds("1m")).toBe(60)
    expect(timeframeToSeconds("30m")).toBe(1800)
    expect(timeframeToSeconds("1h")).toBe(3600)
    expect(timeframeToSeconds("4h")).toBe(14400)
    expect(timeframeToSeconds("1d")).toBe(86400)
  })

  it("throws on unknown timeframe", () => {
    expect(() => timeframeToSeconds("3m")).toThrow()
  })
})

describe("bucketStartEpochSec", () => {
  it("aligns to 30m boundary", () => {
    // 2026-08-07T10:17:00Z → bucket should be 10:00:00
    const epochSec = Math.floor(new Date("2026-08-07T10:17:00Z").getTime() / 1000)
    const bucket   = Math.floor(new Date("2026-08-07T10:00:00Z").getTime() / 1000)
    expect(bucketStartEpochSec(epochSec, 1800)).toBe(bucket)
  })

  it("aligns to 1h boundary", () => {
    const epochSec = Math.floor(new Date("2026-08-07T10:45:00Z").getTime() / 1000)
    const bucket   = Math.floor(new Date("2026-08-07T10:00:00Z").getTime() / 1000)
    expect(bucketStartEpochSec(epochSec, 3600)).toBe(bucket)
  })
})

describe("BarBuilder", () => {
  it("builds first bar from first quote", () => {
    const bb = new BarBuilder("6e", "30m")
    const completed = bb.update(makeQuote("2026-08-07T10:05:00Z", 1.09))
    expect(completed).toBeNull()
    expect(bb.currentBar).not.toBeNull()
    expect(bb.currentBar!.open).toBe(1.09)
    expect(bb.currentBar!.close).toBe(1.09)
    expect(bb.currentBar!.tickCount).toBe(1)
  })

  it("updates OHLC within same bucket", () => {
    const bb = new BarBuilder("6e", "30m")
    bb.update(makeQuote("2026-08-07T10:05:00Z", 1.0900))
    bb.update(makeQuote("2026-08-07T10:10:00Z", 1.0920))
    bb.update(makeQuote("2026-08-07T10:15:00Z", 1.0880))
    bb.update(makeQuote("2026-08-07T10:25:00Z", 1.0910))

    const bar = bb.currentBar!
    expect(bar.open).toBe(1.0900)
    expect(bar.high).toBe(1.0920)
    expect(bar.low).toBe(1.0880)
    expect(bar.close).toBe(1.0910)
    expect(bar.tickCount).toBe(4)
    expect(bar.isFinal).toBe(false)
  })

  it("returns completed bar on bucket boundary crossing", () => {
    const bb = new BarBuilder("6e", "30m")
    bb.update(makeQuote("2026-08-07T10:05:00Z", 1.09))
    bb.update(makeQuote("2026-08-07T10:25:00Z", 1.092))

    // First tick of new bucket closes the old one
    const completed = bb.update(makeQuote("2026-08-07T10:35:00Z", 1.091))
    expect(completed).not.toBeNull()
    expect(completed!.isFinal).toBe(true)
    expect(completed!.close).toBe(1.092)

    // New bar open
    expect(bb.currentBar!.open).toBe(1.091)
    expect(bb.currentBar!.tickCount).toBe(1)
  })

  it("ignores out-of-order tick from past bucket", () => {
    const bb = new BarBuilder("6e", "30m")
    bb.update(makeQuote("2026-08-07T10:35:00Z", 1.091)) // current bucket: 10:30
    const result = bb.update(makeQuote("2026-08-07T10:05:00Z", 999)) // past bucket
    expect(result).toBeNull()
    expect(bb.currentBar!.high).toBe(1.091) // not corrupted
  })

  it("flush returns final bar and resets state", () => {
    const bb = new BarBuilder("6e", "30m")
    bb.update(makeQuote("2026-08-07T10:05:00Z", 1.09))
    const final = bb.flush()
    expect(final).not.toBeNull()
    expect(final!.isFinal).toBe(true)
    expect(bb.currentBar).toBeNull()
  })

  it("seedOpenBar sets bar state from external source", () => {
    const bb = new BarBuilder("6e", "30m")
    bb.seedOpenBar({
      instrumentId: "6e",
      timeframe: "30m",
      bucketStartUtc: "2026-08-07T10:00:00.000Z",
      bucketEndUtc: "2026-08-07T10:30:00.000Z",
      open: 1.088,
      high: 1.092,
      low: 1.087,
      close: 1.091,
      volume: null,
      tickCount: 47,
      isFinal: false,
      source: "chart_series",
      firstTickUtc: null,
      lastTickUtc: null,
    })

    expect(bb.currentBar!.open).toBe(1.088)
    expect(bb.currentBar!.tickCount).toBe(47)

    // Next live tick updates the seeded bar
    bb.update(makeQuote("2026-08-07T10:15:00Z", 1.093))
    expect(bb.currentBar!.high).toBe(1.093)
  })
})
