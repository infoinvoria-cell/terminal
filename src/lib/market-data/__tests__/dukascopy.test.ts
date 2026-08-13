import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { fetchDukascopyQuote, DUKASCOPY_INSTRUMENTS } from "../providers/dukascopy";

// Reset module-level rate-limit state between tests
// by re-importing (vitest handles module isolation per file)

describe("Dukascopy Provider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns null for unsupported instrument", async () => {
    const result = await fetchDukascopyQuote("FAKE/PAIR");
    expect(result).toBeNull();
  });

  it("parses a valid Dukascopy response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Instrument: "EUR/USD",
        Bid: "1.08950",
        Ask: "1.08960",
        High: "1.09200",
        Low: "1.08500",
        Open: "1.08700",
        Timestamp: "2025-01-15 14:30:00",
      }),
    } as Response);

    // Advance time past MIN_INTERVAL_MS between calls
    vi.advanceTimersByTime(2_000);
    const q = await fetchDukascopyQuote("EUR/USD");

    expect(q).not.toBeNull();
    expect(q!.bid).toBeCloseTo(1.0895);
    expect(q!.ask).toBeCloseTo(1.0896);
    expect(q!.mid).toBeCloseTo((1.0895 + 1.0896) / 2);
    expect(q!.instrument).toBe("EUR/USD");
  });

  it("returns null when HTTP response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as Response);

    vi.advanceTimersByTime(2_000);
    const q = await fetchDukascopyQuote("EUR/USD");
    expect(q).toBeNull();
  });

  it("returns null when Bid/Ask are missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Instrument: "EUR/USD" }),
    } as Response);

    vi.advanceTimersByTime(2_000);
    const q = await fetchDukascopyQuote("EUR/USD");
    expect(q).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    vi.advanceTimersByTime(2_000);
    const q = await fetchDukascopyQuote("EUR/USD");
    expect(q).toBeNull();
  });

  it("DUKASCOPY_INSTRUMENTS covers all major Forex pairs", () => {
    const required = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD"];
    for (const pair of required) {
      expect(DUKASCOPY_INSTRUMENTS[pair]).toBeDefined();
    }
  });
});
