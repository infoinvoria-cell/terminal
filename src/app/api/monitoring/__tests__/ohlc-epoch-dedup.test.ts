/**
 * Regression test — DAX1H duplicate timestamp bug.
 *
 * Root cause: "T24:00:00" (bar-end notation) and "T00:00:00" of the next day
 * both parse to the same Unix epoch. dedupeByPeriod deduplicates by TEXT key
 * only, so both strings survive. The resulting bars array contains two entries
 * at the same epoch, causing LightweightCharts to throw:
 *   "data must be asc ordered by time, index=1, time=1781740800, prev time=1781740800"
 *
 * Fix: second-pass epoch dedup in monitoring/ohlc/route.ts (shapedRaw → shaped)
 * and a final .filter in TradingEnginePage loadMonitoringBars.
 */

import { describe, it, expect } from "vitest";

// ── Helpers mirroring the monitoring/ohlc route logic ─────────────────────────

type Bar = { time: string; open: number; high: number; low: number; close: number; tick?: boolean };

/** Simulate the epoch dedup pass added in Phase 2C */
function epochDedup(bars: Bar[]): Bar[] {
  const epochMap = new Map<number, Bar>();
  for (const b of bars) {
    const epoch = Math.floor(new Date(b.time).getTime() / 1000);
    if (!isFinite(epoch) || epoch <= 0) continue;
    const prev = epochMap.get(epoch);
    // history row (tick=false) beats tick row; otherwise last write wins
    if (!prev || (prev.tick && !b.tick)) epochMap.set(epoch, b);
  }
  return [...epochMap.values()].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

/** Simulate the loadMonitoringBars final filter in TradingEnginePage */
function loadMonitoringBarsDedup(bars: { time: number; open: number; high: number; low: number; close: number }[]) {
  const sorted = [...bars].sort((a, b) => a.time - b.time);
  return sorted.filter((b, i, arr) => i === arr.length - 1 || b.time !== arr[i + 1].time);
}

// ── Epoch constant ─────────────────────────────────────────────────────────────

// 1781740800 = 2026-06-18T00:00:00Z
const EPOCH_2026_06_18 = 1781740800;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DAX1H duplicate timestamp regression", () => {
  it("T24:00:00 and T00:00:00 next day parse to the same epoch", () => {
    const t1 = Math.floor(new Date("2026-06-17T24:00:00Z").getTime() / 1000);
    const t2 = Math.floor(new Date("2026-06-18T00:00:00Z").getTime() / 1000);
    expect(t1).toBe(EPOCH_2026_06_18);
    expect(t2).toBe(EPOCH_2026_06_18);
  });

  it("epochDedup removes duplicate T24:00:00 / T00:00:00 bars", () => {
    const bars: Bar[] = [
      { time: "2026-06-17T24:00:00Z", open: 25000, high: 25100, low: 24900, close: 25050, tick: false },
      { time: "2026-06-18T00:00:00Z", open: 25000, high: 25100, low: 24900, close: 25050, tick: false },
    ];
    const result = epochDedup(bars);
    expect(result).toHaveLength(1);
  });

  it("epochDedup keeps only one bar per epoch — timestamps are unique", () => {
    const bars: Bar[] = [
      { time: "2026-06-16T22:00:00Z", open: 24800, high: 24900, low: 24700, close: 24850, tick: false },
      { time: "2026-06-17T24:00:00Z", open: 25000, high: 25100, low: 24900, close: 25050, tick: false },
      { time: "2026-06-18T00:00:00Z", open: 25000, high: 25100, low: 24900, close: 25050, tick: false },
      { time: "2026-06-18T01:00:00Z", open: 25050, high: 25150, low: 24950, close: 25100, tick: false },
    ];
    const result = epochDedup(bars);
    const epochs = result.map(b => Math.floor(new Date(b.time).getTime() / 1000));
    const uniqueEpochs = new Set(epochs);
    expect(uniqueEpochs.size).toBe(epochs.length);
  });

  it("epochDedup result is strictly ascending by epoch", () => {
    const bars: Bar[] = [
      { time: "2026-06-17T24:00:00Z", open: 25000, high: 25100, low: 24900, close: 25050, tick: false },
      { time: "2026-06-18T00:00:00Z", open: 25000, high: 25100, low: 24900, close: 25050, tick: false },
      { time: "2026-06-18T01:00:00Z", open: 25050, high: 25150, low: 24950, close: 25100, tick: false },
      { time: "2026-06-18T02:00:00Z", open: 25100, high: 25200, low: 25000, close: 25150, tick: false },
    ];
    const result = epochDedup(bars);
    for (let i = 1; i < result.length; i++) {
      const prev = Math.floor(new Date(result[i - 1].time).getTime() / 1000);
      const curr = Math.floor(new Date(result[i].time).getTime() / 1000);
      expect(curr).toBeGreaterThan(prev);
    }
  });

  it("epochDedup: history bar beats tick bar at same epoch", () => {
    const bars: Bar[] = [
      { time: "2026-06-17T24:00:00Z", open: 25000, high: 25100, low: 24900, close: 25050, tick: true },   // tick
      { time: "2026-06-18T00:00:00Z", open: 25000, high: 25100, low: 24900, close: 25055, tick: false },  // history
    ];
    const result = epochDedup(bars);
    expect(result).toHaveLength(1);
    expect(result[0].tick).toBe(false);
    expect(result[0].close).toBe(25055);
  });

  it("loadMonitoringBars dedup filters adjacent duplicate epochs", () => {
    const bars = [
      { time: EPOCH_2026_06_18, open: 25000, high: 25100, low: 24900, close: 25050 },
      { time: EPOCH_2026_06_18, open: 25000, high: 25100, low: 24900, close: 25055 },
      { time: EPOCH_2026_06_18 + 3600, open: 25050, high: 25150, low: 24950, close: 25100 },
    ];
    const result = loadMonitoringBarsDedup(bars);
    const epochs = result.map(b => b.time);
    expect(new Set(epochs).size).toBe(epochs.length);
    expect(result).toHaveLength(2);
  });

  it("no duplicate epochs survive the full dedup pipeline", () => {
    // Simulate monitoring route output with "T24:00:00" / "T00:00:00" pair
    const apiOutput: Bar[] = [
      { time: "2026-06-15T22:00:00Z", open: 24700, high: 24800, low: 24600, close: 24750, tick: false },
      { time: "2026-06-16T22:00:00Z", open: 24800, high: 24900, low: 24700, close: 24850, tick: false },
      { time: "2026-06-17T22:00:00Z", open: 24900, high: 25000, low: 24800, close: 24950, tick: false },
      { time: "2026-06-17T24:00:00Z", open: 25000, high: 25100, low: 24900, close: 25050, tick: false },  // bar-end
      { time: "2026-06-18T00:00:00Z", open: 25000, high: 25100, low: 24900, close: 25050, tick: false },  // bar-start same epoch
      { time: "2026-06-18T22:00:00Z", open: 25050, high: 25150, low: 24950, close: 25100, tick: false },
    ];

    // Step 1: route epoch dedup
    const routeDeduped = epochDedup(apiOutput);

    // Step 2: convert to epoch integers (as loadMonitoringBars does)
    const converted = routeDeduped
      .map(b => ({ time: Math.floor(new Date(b.time).getTime() / 1000), open: b.open, high: b.high, low: b.low, close: b.close }))
      .filter(b => b.time > 0 && b.open > 0 && b.high >= b.low)
      .sort((a, b) => a.time - b.time);

    // Step 3: final filter dedup in loadMonitoringBars
    const final = converted.filter((b, i, arr) => i === arr.length - 1 || b.time !== arr[i + 1].time);

    // Verify: all epochs unique and strictly ascending
    for (let i = 1; i < final.length; i++) {
      expect(final[i].time).toBeGreaterThan(final[i - 1].time);
    }
    expect(new Set(final.map(b => b.time)).size).toBe(final.length);
    expect(final).toHaveLength(5); // 6 input bars - 1 duplicate = 5
  });
});
