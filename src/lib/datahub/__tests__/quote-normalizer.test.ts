import { describe, it, expect } from "vitest"
import { normalizeSupabaseQuote } from "../market/quote-normalizer"

describe("normalizeSupabaseQuote", () => {
  const NOW = "2026-08-07T10:00:00.000Z"

  it("normalizes a 6E futures row", () => {
    const q = normalizeSupabaseQuote(
      {
        asset_id: "6E1!",
        asset_type: "futures",
        price: 1.09235,
        lp_time: "2026-08-07T09:59:58Z",
        provider: "tradingview",
        provider_symbol: "6E1!",
      },
      NOW,
    )
    expect(q.instrumentId).toBe("6e")
    expect(q.assetType).toBe("futures")
    expect(q.chartPrice).toBe(1.09235)
    expect(q.providerTimestampUtc).toBe("2026-08-07T09:59:58Z")
    expect(q.receivedTimestampUtc).toBe(NOW)
    expect(q.sourceQuality).toBe("realtime")
    expect(q.provider).toBe("tradingview")
  })

  it("strips futures 1! suffix for instrumentId", () => {
    const q = normalizeSupabaseQuote(
      { asset_id: "GC1!", asset_type: "futures", price: 3200 },
      NOW,
    )
    expect(q.instrumentId).toBe("gc")
  })

  it("falls back to receivedAtUtc when lp_time absent", () => {
    const q = normalizeSupabaseQuote(
      { asset_id: "NQ1!", asset_type: "futures", price: 22000 },
      NOW,
    )
    expect(q.providerTimestampUtc).toBe(NOW)
  })

  it("handles unknown assetType gracefully", () => {
    const q = normalizeSupabaseQuote(
      { asset_id: "FOO", asset_type: "exotic", price: 1.0 },
      NOW,
    )
    // defaults to futures
    expect(q.assetType).toBe("futures")
  })

  it("chartPrice equals price (last price)", () => {
    const q = normalizeSupabaseQuote(
      { asset_id: "YM1!", asset_type: "futures", price: 44500 },
      NOW,
    )
    expect(q.chartPrice).toBe(44500)
    expect(q.last).toBe(44500)
  })
})
