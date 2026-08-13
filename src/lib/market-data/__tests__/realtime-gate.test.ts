import { describe, it, expect, beforeEach, vi } from "vitest";
import { confirmSignal, resetGate, activeConfirmations } from "../realtime-gate";

// Mock the Dukascopy provider so tests don't make real network calls
vi.mock("../providers/dukascopy", () => ({
  fetchDukascopyQuote: vi.fn(),
}));

import { fetchDukascopyQuote } from "../providers/dukascopy";
const mockFetch = vi.mocked(fetchDukascopyQuote);

// Helper: candle closing in N minutes from now
function candleClosingIn(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

describe("RealtimeGate", () => {
  beforeEach(() => {
    resetGate();
    vi.clearAllMocks();
  });

  it("returns 'no real-time provider' for asset without dukascopyInstrument", async () => {
    const result = await confirmSignal({
      assetId: "spy",          // ETF — no Dukascopy instrument
      direction: "long",
      thresholdPrice: 420,
      candleCloseAt: candleClosingIn(5),
      strategyId: "test",
    });
    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain("no real-time provider");
  });

  it("returns 'outside confirmation window' when candle closes in 20 min", async () => {
    const result = await confirmSignal({
      assetId: "eurusd_30m",
      direction: "long",
      thresholdPrice: 1.09,
      candleCloseAt: candleClosingIn(20),   // outside the 12 min window
      strategyId: "test",
    });
    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain("Outside confirmation window");
  });

  it("confirms long signal when mid price is above threshold", async () => {
    mockFetch.mockResolvedValueOnce({
      instrument: "EUR/USD",
      bid: 1.0895, ask: 1.0905, mid: 1.09,
      high: 1.092, low: 1.085, open: 1.087,
      timestamp: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    });

    const result = await confirmSignal({
      assetId: "eurusd_30m",
      direction: "long",
      thresholdPrice: 1.088,
      candleCloseAt: candleClosingIn(5),
      strategyId: "eur30m_sweep",
    });

    expect(result.confirmed).toBe(true);
    expect(result.provider).toBe("dukascopy");
    expect(result.delayMinutes).toBe(0);
    expect(result.currentPrice).toBeCloseTo(1.09);
  });

  it("rejects long signal when mid price is below threshold", async () => {
    mockFetch.mockResolvedValueOnce({
      instrument: "EUR/USD",
      bid: 1.0875, ask: 1.0885, mid: 1.088,
      high: 1.092, low: 1.085, open: 1.087,
      timestamp: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    });

    const result = await confirmSignal({
      assetId: "eurusd_30m",
      direction: "long",
      thresholdPrice: 1.09,
      candleCloseAt: candleClosingIn(5),
      strategyId: "eur30m_sweep",
    });

    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain("NOT confirmed");
  });

  it("confirms short signal when mid price is below threshold", async () => {
    mockFetch.mockResolvedValueOnce({
      instrument: "EUR/USD",
      bid: 1.0875, ask: 1.0885, mid: 1.088,
      high: 1.092, low: 1.085, open: 1.09,
      timestamp: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    });

    const result = await confirmSignal({
      assetId: "eurusd_30m",
      direction: "short",
      thresholdPrice: 1.09,
      candleCloseAt: candleClosingIn(5),
      strategyId: "eur30m_sweep",
    });

    expect(result.confirmed).toBe(true);
  });

  it("handles Dukascopy returning null gracefully", async () => {
    mockFetch.mockResolvedValueOnce(null);

    const result = await confirmSignal({
      assetId: "eurusd_30m",
      direction: "long",
      thresholdPrice: 1.09,
      candleCloseAt: candleClosingIn(5),
      strategyId: "eur30m_sweep",
    });

    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain("no data");
    expect(result.currentPrice).toBeNull();
  });

  it("tracks active confirmations correctly", async () => {
    expect(activeConfirmations()).toBe(0);
    // After a completed call, active count goes back to 0
    mockFetch.mockResolvedValueOnce(null);
    await confirmSignal({
      assetId: "eurusd_30m",
      direction: "long",
      thresholdPrice: 1.09,
      candleCloseAt: candleClosingIn(5),
      strategyId: "eur30m_sweep",
    });
    expect(activeConfirmations()).toBe(0);
  });
});
