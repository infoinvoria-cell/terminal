import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { CapitalifeDataHub, _resetDataHubForTests, getDataHub } from "../hub"
import type { NormalizedMarketQuote } from "../types"

beforeEach(() => {
  _resetDataHubForTests()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-07T10:00:00.000Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Hub construction ─────────────────────────────────────────────────────────

describe("CapitalifeDataHub singleton", () => {
  it("returns same instance on repeated calls", () => {
    const a = getDataHub()
    const b = getDataHub()
    expect(a).toBe(b)
  })

  it("returns fresh instance after reset", () => {
    const a = getDataHub()
    _resetDataHubForTests()
    const b = getDataHub()
    expect(a).not.toBe(b)
  })
})

// ─── Publish / Subscribe ──────────────────────────────────────────────────────

describe("publish / subscribe", () => {
  it("subscriber receives published value", () => {
    const hub = new CapitalifeDataHub()
    const received: unknown[] = []

    hub.subscribe("market.quote.6e", (s) => received.push(s.value))

    hub.publish("market.quote.6e", { chartPrice: 1.09 }, { source: "test" })

    vi.runAllTimers() // flush coalesce
    expect(received).toHaveLength(1)
    expect((received[0] as { chartPrice: number }).chartPrice).toBe(1.09)
  })

  it("unsubscribe stops delivery", () => {
    const hub = new CapitalifeDataHub()
    const received: unknown[] = []

    const unsub = hub.subscribe("market.quote.6e", (s) => received.push(s.value))

    hub.publish("market.quote.6e", 1, { source: "test" })
    vi.runAllTimers()
    unsub()

    hub.publish("market.quote.6e", 2, { source: "test" })
    vi.runAllTimers()

    expect(received).toHaveLength(1)
  })

  it("immediate delivery to new subscriber if value exists", () => {
    const hub = new CapitalifeDataHub()

    hub.publish("market.quote.6e", 42, { source: "test" })
    vi.runAllTimers()

    const received: unknown[] = []
    hub.subscribe("market.quote.6e", (s) => received.push(s.value))

    // immediate delivery happens synchronously in subscribe()
    expect(received).toHaveLength(1)
    expect(received[0]).toBe(42)
  })

  it("coalesces rapid publishes within coalesceWithinMs", () => {
    const hub = new CapitalifeDataHub()
    const received: unknown[] = []

    hub.subscribe("market.quote.6e", (s) => received.push(s.value))

    hub.publish("market.quote.6e", 1, { source: "test" })
    hub.publish("market.quote.6e", 2, { source: "test" })
    hub.publish("market.quote.6e", 3, { source: "test" })

    // Before timer fires: no delivery yet
    expect(received).toHaveLength(0)

    vi.runAllTimers()
    // Only one delivery with the last value
    expect(received).toHaveLength(1)
    expect(received[0]).toBe(3)
  })
})

// ─── Error publishing ─────────────────────────────────────────────────────────

describe("publishError", () => {
  it("records error without clearing last-known-good value", () => {
    const hub = new CapitalifeDataHub()

    hub.publish("market.quote.6e", 1.09, { source: "test" })
    vi.runAllTimers()

    hub.publishError("market.quote.6e", "connection lost", { source: "test" })

    const state = hub.getState("market.quote.6e")
    expect(state.value).toBe(1.09) // keepLastKnownGood
    expect(state.lastError).toBe("connection lost")
    expect(state.totalErrors).toBe(1)
  })
})

// ─── Freshness ────────────────────────────────────────────────────────────────

describe("freshness computation", () => {
  it("live when age < delayedAfterMs", () => {
    const hub = new CapitalifeDataHub()

    hub.publish("market.quote.6e", 1.09, { source: "test" })
    vi.runAllTimers()

    // Advance by 10 seconds
    vi.advanceTimersByTime(10_000)
    const state = hub.getState("market.quote.6e")
    expect(state.freshness).toBe("live")
  })

  it("delayed when age > delayedAfterMs", () => {
    const hub = new CapitalifeDataHub()

    hub.publish("market.quote.6e", 1.09, { source: "test" })
    vi.runAllTimers()

    vi.advanceTimersByTime(20_000) // > 15s delayedAfterMs
    const state = hub.getState("market.quote.6e")
    expect(state.freshness).toBe("delayed")
  })

  it("stale when age > staleAfterMs", () => {
    const hub = new CapitalifeDataHub()

    hub.publish("market.quote.6e", 1.09, { source: "test" })
    vi.runAllTimers()

    vi.advanceTimersByTime(91_000) // > 90s staleAfterMs
    const state = hub.getState("market.quote.6e")
    expect(state.freshness).toBe("stale")
  })

  it("unavailable when no value published", () => {
    const hub = new CapitalifeDataHub()
    const state = hub.getState("market.quote.6e")
    expect(state.freshness).toBe("unavailable")
    expect(state.value).toBeNull()
  })
})

// ─── Sequence counter ─────────────────────────────────────────────────────────

describe("sequence counter", () => {
  it("increments on each publish", () => {
    const hub = new CapitalifeDataHub()

    hub.publish("market.quote.6e", 1, { source: "test" })
    vi.runAllTimers()
    hub.publish("market.quote.6e", 2, { source: "test" })
    vi.runAllTimers()
    hub.publish("market.quote.6e", 3, { source: "test" })
    vi.runAllTimers()

    const state = hub.getState("market.quote.6e")
    expect(state.sequence).toBe(3)
    expect(state.totalPublishes).toBe(3)
  })
})

// ─── listTopics ───────────────────────────────────────────────────────────────

describe("listTopics", () => {
  it("returns entries for all touched topics", () => {
    const hub = new CapitalifeDataHub()

    hub.publish("market.quote.6e", 1, { source: "test" })
    hub.publish("engine.strategy.eur_30m", { active: true }, { source: "test" })
    vi.runAllTimers()

    const topics = hub.listTopics()
    const names = topics.map((t) => t.topic)
    expect(names).toContain("market.quote.6e")
    expect(names).toContain("engine.strategy.eur_30m")
  })
})

// ─── Multi-subscriber ─────────────────────────────────────────────────────────

describe("multiple subscribers", () => {
  it("all subscribers receive the same value", () => {
    const hub = new CapitalifeDataHub()
    const a: unknown[] = []
    const b: unknown[] = []

    hub.subscribe("market.quote.6e", (s) => a.push(s.value))
    hub.subscribe("market.quote.6e", (s) => b.push(s.value))

    hub.publish("market.quote.6e", 99, { source: "test" })
    vi.runAllTimers()

    expect(a).toEqual([99])
    expect(b).toEqual([99])
  })

  it("subscriber exception does not crash hub", () => {
    const hub = new CapitalifeDataHub()
    const good: unknown[] = []

    hub.subscribe("market.quote.6e", () => { throw new Error("boom") })
    hub.subscribe("market.quote.6e", (s) => good.push(s.value))

    hub.publish("market.quote.6e", 42, { source: "test" })
    vi.runAllTimers()

    expect(good).toEqual([42])
  })
})
