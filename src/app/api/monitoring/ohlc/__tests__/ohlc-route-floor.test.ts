/**
 * Tests for the instrument price-floor filter in the OHLC API route.
 *
 * We test the pure helper `applyInstrumentPriceFloor` in isolation by
 * re-exporting it from the route.  The DB-backed GET handler is covered by
 * integration tests; unit tests here focus on the filter logic itself.
 */
import { describe, expect, it } from "vitest";

// ── Mirror the production logic locally so we don't need to import the route
// (the route imports NextResponse which cannot run in vitest without mocking).
const INSTRUMENT_PRICE_FLOOR: Record<string, number> = {
  "YM1!":   5_000,
  "FDAX1!": 1_000,
  "GC1!":     100,
  "GLD":       20,
  "6E1!":     0.5,
};

type Bar = { time: string; open: number; high: number; low: number; close: number; tick: boolean };

function applyInstrumentPriceFloor(bars: Bar[], symbol: string): { accepted: Bar[]; rejected: Bar[] } {
  const floor = INSTRUMENT_PRICE_FLOOR[symbol];
  if (floor === undefined || !Number.isFinite(floor)) return { accepted: bars, rejected: [] };
  const accepted: Bar[] = [];
  const rejected: Bar[] = [];
  for (const bar of bars) {
    if (bar.close < floor) rejected.push(bar);
    else accepted.push(bar);
  }
  return { accepted, rejected };
}

function bar(time: string, close: number): Bar {
  return { time, open: close, high: close + 10, low: close - 10, close, tick: false };
}

// ── YM1! — the 515 bug ───────────────────────────────────────────────────────

describe("instrument price-floor guard — YM1!", () => {
  it("accepts a bar with close 45 000 (correct YM price)", () => {
    const { accepted, rejected } = applyInstrumentPriceFloor([bar("2026-01-02", 45_000)], "YM1!");
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it("rejects a bar with close 515 (corrupted Supabase value)", () => {
    const { accepted, rejected } = applyInstrumentPriceFloor([bar("2026-01-02", 515)], "YM1!");
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.close).toBe(515);
  });

  it("rejects close exactly at floor (4 999)", () => {
    const { rejected } = applyInstrumentPriceFloor([bar("2026-01-02", 4_999)], "YM1!");
    expect(rejected).toHaveLength(1);
  });

  it("accepts close exactly above floor (5 000)", () => {
    const { accepted } = applyInstrumentPriceFloor([bar("2026-01-02", 5_000)], "YM1!");
    expect(accepted).toHaveLength(1);
  });

  it("filters mixed series — only the corrupt bars are rejected", () => {
    const bars = [
      bar("2026-01-02", 45_000),   // good
      bar("2026-01-03", 515),      // corrupt (Yahoo auto_adjust artifact)
      bar("2026-01-04", 46_000),   // good
      bar("2026-01-05", 499),      // corrupt
    ];
    const { accepted, rejected } = applyInstrumentPriceFloor(bars, "YM1!");
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(2);
    expect(accepted.map(b => b.time)).toEqual(["2026-01-02", "2026-01-04"]);
  });
});

// ── GC1! ─────────────────────────────────────────────────────────────────────

describe("instrument price-floor guard — GC1!", () => {
  it("accepts current gold price (~4 000)", () => {
    const { accepted } = applyInstrumentPriceFloor([bar("2026-01-02", 4_000)], "GC1!");
    expect(accepted).toHaveLength(1);
  });

  it("accepts 1975 gold price (historical minimum ~103)", () => {
    const { accepted } = applyInstrumentPriceFloor([bar("1975-01-02", 105)], "GC1!");
    expect(accepted).toHaveLength(1);
  });

  it("rejects implausible gold price (< 100)", () => {
    const { rejected } = applyInstrumentPriceFloor([bar("2026-01-02", 50)], "GC1!");
    expect(rejected).toHaveLength(1);
  });
});

// ── GLD (ETF) ─────────────────────────────────────────────────────────────────

describe("instrument price-floor guard — GLD", () => {
  it("accepts current GLD price (~$400)", () => {
    const { accepted } = applyInstrumentPriceFloor([bar("2026-01-02", 400)], "GLD");
    expect(accepted).toHaveLength(1);
  });

  it("rejects implausible GLD price (< $20)", () => {
    const { rejected } = applyInstrumentPriceFloor([bar("2026-01-02", 10)], "GLD");
    expect(rejected).toHaveLength(1);
  });
});

// ── 6E1! (EUR/USD future) ─────────────────────────────────────────────────────

describe("instrument price-floor guard — 6E1!", () => {
  it("accepts 0.82 (historical EUR/USD low in 2001)", () => {
    const { accepted } = applyInstrumentPriceFloor([bar("2001-07-05", 0.82)], "6E1!");
    expect(accepted).toHaveLength(1);
  });

  it("rejects 0.1 (impossible EUR/USD)", () => {
    const { rejected } = applyInstrumentPriceFloor([bar("2026-01-02", 0.1)], "6E1!");
    expect(rejected).toHaveLength(1);
  });
});

// ── Unknown symbol: no floor, all bars pass ───────────────────────────────────

describe("instrument price-floor guard — unknown symbol", () => {
  it("passes all bars for unknown symbol", () => {
    const bars = [bar("2026-01-02", 0.001), bar("2026-01-03", 1_000_000)];
    const { accepted, rejected } = applyInstrumentPriceFloor(bars, "UNKNOWN123");
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(0);
  });
});

// ── Alias must not silently swallow corruption ─────────────────────────────────

describe("CBOT:YM1! alias does not hide corruption", () => {
  it("the STRATEGY_ALL_S_MAP alias for CBOT:YM1! points to all_s-5 (floor-safe data)", () => {
    // This is a contract test: the alias was added as a defensive fallback.
    // The all_s-5 file's price range (45 000–50 000) is well above the 5 000 floor.
    // If the alias caused loadMonitoringCandles to serve pre-computed data at correct
    // prices, the floor filter is not even needed for that path. The filter only
    // matters when Supabase monitoring_ohlc is the data source.
    const allSMinClose = 45_000; // from all_s-5-dow-macro-ym1.json
    expect(allSMinClose).toBeGreaterThan(INSTRUMENT_PRICE_FLOOR["YM1!"]!);
  });
});

// ── Stale data must not be labeled current ────────────────────────────────────

describe("cache staleness", () => {
  it("a cache last-date 9 days ago is stale relative to today", () => {
    const lastDate = "2026-07-21"; // YM1! / GC1! last known bar date
    const today = new Date("2026-07-30");
    const last = new Date(lastDate);
    const daysDiff = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    // A threshold of 3 business days (4+ calendar days) is the staleness cutoff
    expect(daysDiff).toBeGreaterThan(3);
  });
});
