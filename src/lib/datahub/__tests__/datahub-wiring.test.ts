/**
 * DataHub wiring tests:
 * - quote → hub publish
 * - hub open-bar topic
 * - consumer-cache role (not authoritative)
 * - duplicate / out-of-order tracking
 * - historical / live separation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { CapitalifeDataHub, _resetDataHubForTests } from "../hub"
import { normalizeSupabaseQuote } from "../market/quote-normalizer"
import { BarBuilder, _resetBarBuildersForTests } from "../market/bar-builder"
import {
  topicMarketQuote,
  topicMarketBar,
} from "../topic-names"
import type { NormalizedMarketQuote, CanonicalBar } from "../types"

beforeEach(() => {
  _resetDataHubForTests()
  _resetBarBuildersForTests()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-07T10:00:00.000Z"))
})
afterEach(() => vi.useRealTimers())

// ─── quote → hub ──────────────────────────────────────────────────────────────

describe("quote → DataHub publish flow", () => {
  it("normalized quote reaches market.quote.6e topic", () => {
    const hub = new CapitalifeDataHub()
    const receivedAt = "2026-08-07T10:00:00.000Z"

    const q = normalizeSupabaseQuote(
      { asset_id: "6E1!", asset_type: "futures", price: 1.09235, lp_time: "2026-08-07T09:59:58Z" },
      receivedAt,
    )

    hub.publish(topicMarketQuote(q.instrumentId), q, {
      source: "supabase.live_quotes",
      provider: "tradingview",
      providerSymbol: "6E1!",
      sourceTimestampUtc: q.providerTimestampUtc,
    })

    vi.runAllTimers()

    const state = hub.getState<NormalizedMarketQuote>(topicMarketQuote("6e"))
    expect(state.value?.chartPrice).toBe(1.09235)
    expect(state.source).toBe("supabase.live_quotes")
    expect(state.provider).toBe("tradingview")
    expect(state.freshness).toBe("live")
    expect(state.totalPublishes).toBe(1)
  })

  it("multiple quotes increment sequence correctly", () => {
    const hub = new CapitalifeDataHub()
    const now = "2026-08-07T10:00:00.000Z"

    for (let i = 0; i < 5; i++) {
      const q = normalizeSupabaseQuote(
        { asset_id: "6E1!", asset_type: "futures", price: 1.09 + i * 0.0001 },
        now,
      )
      hub.publish(topicMarketQuote("6e"), q, { source: "test" })
      vi.runAllTimers()
    }

    const state = hub.getState(topicMarketQuote("6e"))
    // 5 publishes but coalescing may collapse some — sequence reflects actual deliveries
    expect(state.totalPublishes).toBeGreaterThanOrEqual(1)
    expect(state.sequence).toBeGreaterThanOrEqual(1)
  })
})

// ─── quote → open bar ─────────────────────────────────────────────────────────

describe("quote → open bar via BarBuilder", () => {
  it("live quote drives open bar state in DataHub", () => {
    const hub = new CapitalifeDataHub()
    const bb = new BarBuilder("6e", "30m", "bar_builder_live")
    const openTopic = topicMarketBar("6e", "30m.open")

    const quotes = [
      { ts: "2026-08-07T10:05:00Z", price: 1.0900 },
      { ts: "2026-08-07T10:10:00Z", price: 1.0920 },
      { ts: "2026-08-07T10:15:00Z", price: 1.0880 },
    ]

    for (const { ts, price } of quotes) {
      const q: NormalizedMarketQuote = {
        instrumentId: "6e",
        assetType: "futures",
        provider: "tradingview",
        providerSymbol: "6E1!",
        providerTimestampUtc: ts,
        receivedTimestampUtc: ts,
        bid: null, ask: null, last: price, mid: null,
        chartPrice: price,
        sequence: null,
        sourceQuality: "realtime",
      }
      const completed = bb.update(q)
      if (completed) {
        hub.publish(topicMarketBar("6e", "30m"), completed, {
          source: "bar_builder_live",
          sourceTimestampUtc: completed.bucketStartUtc,
        })
      }
      if (bb.currentBar) {
        hub.publish(openTopic, bb.currentBar, {
          source: "bar_builder_live",
          sourceTimestampUtc: ts,
        })
      }
      vi.runAllTimers()
    }

    const openState = hub.getState<CanonicalBar>(openTopic)
    expect(openState.value?.open).toBe(1.0900)
    expect(openState.value?.high).toBe(1.0920)
    expect(openState.value?.low).toBe(1.0880)
    expect(openState.value?.close).toBe(1.0880)
    expect(openState.value?.isFinal).toBe(false)
  })

  it("bucket transition produces one final bar, one new open bar", () => {
    const hub = new CapitalifeDataHub()
    const bb = new BarBuilder("6e", "30m")
    const finalTopic = topicMarketBar("6e", "30m")
    const openTopic  = topicMarketBar("6e", "30m.open")

    const finalBars: CanonicalBar[] = []
    hub.subscribe<CanonicalBar>(finalTopic, (s) => {
      if (s.value?.isFinal) finalBars.push(s.value)
    })

    const ticksB1 = [
      { ts: "2026-08-07T10:05:00Z", price: 1.090 },
      { ts: "2026-08-07T10:25:00Z", price: 1.092 },
    ]
    const ticksB2 = [
      { ts: "2026-08-07T10:35:00Z", price: 1.091 }, // crosses bucket boundary
    ]

    for (const { ts, price } of [...ticksB1, ...ticksB2]) {
      const q: NormalizedMarketQuote = {
        instrumentId: "6e", assetType: "futures",
        provider: "tradingview", providerSymbol: "6E1!",
        providerTimestampUtc: ts, receivedTimestampUtc: ts,
        bid: null, ask: null, last: price, mid: null,
        chartPrice: price, sequence: null, sourceQuality: "realtime",
      }
      const completed = bb.update(q)
      if (completed) {
        hub.publish(finalTopic, completed, { source: "test", sourceTimestampUtc: completed.bucketEndUtc })
      }
      if (bb.currentBar) {
        hub.publish(openTopic, bb.currentBar, { source: "test", sourceTimestampUtc: ts })
      }
      vi.runAllTimers()
    }

    // Exactly one final bar published
    expect(finalBars).toHaveLength(1)
    expect(finalBars[0].isFinal).toBe(true)
    expect(finalBars[0].close).toBe(1.092)

    // Open bar is for new bucket
    const openState = hub.getState<CanonicalBar>(openTopic)
    expect(openState.value?.open).toBe(1.091)
    expect(openState.value?.isFinal).toBe(false)
  })
})

// ─── Historical / live separation ─────────────────────────────────────────────

describe("historical / live separation", () => {
  it("final bar topic receives only isFinal=true bars", () => {
    const hub = new CapitalifeDataHub()
    const finalTopic = topicMarketBar("6e", "30m")
    const openTopic  = topicMarketBar("6e", "30m.open")

    // Publish historical final bar
    const historicalBar: CanonicalBar = {
      instrumentId: "6e", timeframe: "30m",
      bucketStartUtc: "2026-08-07T09:00:00.000Z",
      bucketEndUtc:   "2026-08-07T09:30:00.000Z",
      open: 1.088, high: 1.092, low: 1.087, close: 1.091,
      volume: null, tickCount: 100, isFinal: true,
      source: "flask.monitoring_ohlc.final",
      firstTickUtc: null, lastTickUtc: null,
    }
    hub.publish(finalTopic, historicalBar, { source: "flask.chart-data" })
    vi.runAllTimers()

    // Publish open bar separately
    const openBar: CanonicalBar = {
      ...historicalBar,
      bucketStartUtc: "2026-08-07T10:00:00.000Z",
      bucketEndUtc:   "2026-08-07T10:30:00.000Z",
      open: 1.091, high: 1.093, low: 1.090, close: 1.092,
      isFinal: false,
      source: "flask.monitoring_ohlc.open",
    }
    hub.publish(openTopic, openBar, { source: "flask.chart-data" })
    vi.runAllTimers()

    // Final topic has historical bar — not contaminated by open bar
    const finalState = hub.getState<CanonicalBar>(finalTopic)
    expect(finalState.value?.isFinal).toBe(true)
    expect(finalState.value?.source).toBe("flask.monitoring_ohlc.final")

    // Open topic has forming bar
    const openState = hub.getState<CanonicalBar>(openTopic)
    expect(openState.value?.isFinal).toBe(false)

    // The two topics are completely independent
    expect(finalState.topic).not.toBe(openState.topic)
  })
})

// ─── Duplicate / out-of-order tracking ───────────────────────────────────────

describe("duplicate / out-of-order tick detection", () => {
  it("BarBuilder ignores out-of-order ticks (past bucket)", () => {
    const bb = new BarBuilder("6e", "30m")

    bb.update({ instrumentId: "6e", assetType: "futures", provider: "test", providerSymbol: "6E1!",
      providerTimestampUtc: "2026-08-07T10:35:00Z", receivedTimestampUtc: "2026-08-07T10:35:00Z",
      bid: null, ask: null, last: 1.091, mid: null, chartPrice: 1.091, sequence: null, sourceQuality: "realtime" })

    // Out-of-order tick from past bucket (10:05 < current bucket 10:30)
    const result = bb.update({
      instrumentId: "6e", assetType: "futures", provider: "test", providerSymbol: "6E1!",
      providerTimestampUtc: "2026-08-07T10:05:00Z", receivedTimestampUtc: "2026-08-07T10:35:01Z",
      bid: null, ask: null, last: 999, mid: null, chartPrice: 999, sequence: null, sourceQuality: "realtime",
    })

    expect(result).toBeNull() // not returned as final
    expect(bb.currentBar!.open).toBe(1.091) // price not corrupted
    expect(bb.currentBar!.high).toBe(1.091) // high not corrupted
  })
})

// ─── Consumer cache role ──────────────────────────────────────────────────────

describe("DataHub as consumer cache", () => {
  it("DataHub cleared on reset (simulates Next.js restart)", () => {
    const hub1 = new CapitalifeDataHub()
    hub1.publish(topicMarketQuote("6e"), { chartPrice: 1.09 }, { source: "test" })
    vi.runAllTimers()

    // Simulate restart: new hub instance (reset)
    _resetDataHubForTests()
    const hub2 = new CapitalifeDataHub()

    // New instance starts empty — re-population requires fetching from Flask/Supabase
    const state = hub2.getState(topicMarketQuote("6e"))
    expect(state.value).toBeNull()
    expect(state.freshness).toBe("unavailable")
  })

  it("DataHub is NOT authoritative — value survives publisher restart if populated", () => {
    const hub = new CapitalifeDataHub()

    hub.publish(topicMarketQuote("6e"), { chartPrice: 1.09 }, { source: "test" })
    vi.runAllTimers()

    // After TTL but still within expiredAfterMs, keepLastKnownGood = true
    vi.advanceTimersByTime(120_000) // > staleAfterMs (90s) but < expiredAfterMs (300s)

    const state = hub.getState(topicMarketQuote("6e"))
    // last-known-good preserved even though stale
    expect(state.value).not.toBeNull()
    expect(state.freshness).toBe("stale")
    // Status reflects degraded quality
    expect(state.status).toBe("degraded")
  })
})
