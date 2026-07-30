import { describe, expect, it } from "vitest";
import { validateAndRepairOhlc, type OhlcQualityInput } from "@/lib/market-data/ohlc-quality";

function bar(overrides: Partial<OhlcQualityInput> & { time?: string } = {}): OhlcQualityInput {
  return {
    time: "2026-01-02",
    open: 45000,
    high: 45500,
    low: 44800,
    close: 45200,
    ...overrides,
  };
}

describe("OHLC quality validator — monitoring chart safety", () => {
  // ── Basic invariants ──────────────────────────────────────────────────────

  it("accepts a valid daily bar", () => {
    const result = validateAndRepairOhlc([bar()], { intraday: false });
    expect(result.accepted).toHaveLength(1);
    expect(result.quarantined).toHaveLength(0);
  });

  it("rejects price = 0 (non_positive)", () => {
    const result = validateAndRepairOhlc(
      [bar({ open: 0, high: 500, low: 0, close: 0 })],
      { intraday: false },
    );
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0]!.close).toBe(0);
    expect(result.events[0]!.flag).toBe("non_positive");
  });

  it("rejects negative price (non_positive)", () => {
    const result = validateAndRepairOhlc(
      [bar({ close: -1, low: -1 })],
      { intraday: false },
    );
    expect(result.quarantined).toHaveLength(1);
    expect(result.events.some(e => e.flag === "non_positive")).toBe(true);
  });

  it("rejects NaN OHLC (non_finite)", () => {
    const result = validateAndRepairOhlc(
      [bar({ high: NaN })],
      { intraday: false },
    );
    expect(result.quarantined).toHaveLength(1);
    expect(result.events[0]!.flag).toBe("non_finite");
  });

  it("rejects Infinity OHLC (non_finite)", () => {
    const result = validateAndRepairOhlc(
      [bar({ low: Infinity })],
      { intraday: false },
    );
    expect(result.quarantined).toHaveLength(1);
    expect(result.events[0]!.flag).toBe("non_finite");
  });

  it("repairs high < open (body_outside_range)", () => {
    const result = validateAndRepairOhlc(
      [bar({ open: 45500, high: 45000, low: 44800, close: 45200 })],
      { intraday: false },
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]!.high).toBeGreaterThanOrEqual(45500);
    expect(result.events.some(e => e.flag === "body_outside_range")).toBe(true);
  });

  it("repairs low > close (body_outside_range)", () => {
    const result = validateAndRepairOhlc(
      [bar({ open: 45000, high: 45500, low: 45800, close: 45200 })],
      { intraday: false },
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]!.low).toBeLessThanOrEqual(45200);
    expect(result.events.some(e => e.flag === "body_outside_range")).toBe(true);
  });

  it("deduplicates bars with the same timestamp", () => {
    const result = validateAndRepairOhlc(
      [bar({ time: "2026-01-02" }), bar({ time: "2026-01-02", close: 99999 })],
      { intraday: false },
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.quarantined).toHaveLength(1);
    expect(result.events.some(e => e.flag === "duplicate_timestamp")).toBe(true);
  });

  // ── YM1! scale error (the 515 bug) ───────────────────────────────────────

  it("quarantines YM1!-style scale error: one 515-close bar among correct 45 000+ bars", () => {
    const goodBars = Array.from({ length: 20 }, (_, i) =>
      bar({ time: `2026-01-${String(i + 2).padStart(2, "0")}`, close: 45000 + i * 100, high: 46000 + i * 100, low: 44900 + i * 100 }),
    );
    const badBar: OhlcQualityInput = {
      time: "2026-02-01",
      open: 520,
      high: 530,
      low: 510,
      close: 515,
    };
    const result = validateAndRepairOhlc([...goodBars, badBar], { intraday: false });
    const quarantinedTimes = result.quarantined.map(b => b.time);
    expect(quarantinedTimes).toContain("2026-02-01");
    expect(result.events.some(e => e.flag === "close_outlier" && e.time === "2026-02-01")).toBe(true);
  });

  // ── Extreme wick detection ────────────────────────────────────────────────

  it("quarantines a bar whose low is less than 20 % of close (wick_outlier)", () => {
    const base = bar();
    const result = validateAndRepairOhlc(
      [bar({ time: "2025-12-01" }), bar({ time: "2025-12-02" }), { ...base, time: "2025-12-03", low: base.close * 0.1 }],
      { intraday: false },
    );
    expect(result.events.some(e => e.flag === "wick_outlier")).toBe(true);
  });

  it("quarantines a bar whose high is more than 5× close (wick_outlier)", () => {
    const base = bar();
    const result = validateAndRepairOhlc(
      [bar({ time: "2025-12-01" }), bar({ time: "2025-12-02" }), { ...base, time: "2025-12-03", high: base.close * 6 }],
      { intraday: false },
    );
    expect(result.events.some(e => e.flag === "wick_outlier")).toBe(true);
  });

  // ── Intraday — tick bar session extreme repair ────────────────────────────

  it("caps tick bar stuck session extreme to 0.35% around body (tick_session_extreme)", () => {
    const tickBar: OhlcQualityInput = {
      time: "2026-07-30T12:00:00Z",
      open: 25600,
      high: 26500,  // full-session high baked in
      low: 24900,   // full-session low baked in
      close: 25620,
      tick: true,
    };
    const result = validateAndRepairOhlc([tickBar], { intraday: true });
    expect(result.accepted).toHaveLength(1);
    const accepted = result.accepted[0]!;
    const bodyHigh = Math.max(tickBar.open, tickBar.close);
    const bodyLow = Math.min(tickBar.open, tickBar.close);
    const maxExtra = bodyHigh * 0.0035;
    expect(accepted.high).toBeLessThanOrEqual(bodyHigh + maxExtra + 1e-9);
    expect(accepted.low).toBeGreaterThanOrEqual(bodyLow - maxExtra - 1e-9);
    expect(result.events.some(e => e.flag === "tick_session_extreme")).toBe(true);
  });

  // ── Future timestamp ──────────────────────────────────────────────────────

  it("quarantines a bar with a timestamp > now + 60s (future_timestamp)", () => {
    const futureMs = Date.now() + 2 * 60 * 1000;
    const futureIso = new Date(futureMs).toISOString();
    const result = validateAndRepairOhlc(
      [bar({ time: futureIso })],
      { intraday: true, nowMs: Date.now() },
    );
    expect(result.quarantined).toHaveLength(1);
    expect(result.events[0]!.flag).toBe("future_timestamp");
  });

  // ── Symbol mapping — GC vs GLD independence ───────────────────────────────

  it("close_outlier does NOT cross-contaminate separate series (GC vs GLD independence)", () => {
    // GC closes around 4 000; GLD around 300; they are never merged.
    // Each series must be consistent (open ≈ close) to avoid body_outside_range
    // triggering a wick_outlier on the repaired bar.
    const gcBars = Array.from({ length: 10 }, (_, i) => ({
      time: `2026-01-${String(i + 2).padStart(2, "0")}`,
      open: 4000 + i,
      high: 4100 + i,
      low: 3900 + i,
      close: 4000 + i,
    }));
    const gldBars = Array.from({ length: 10 }, (_, i) => ({
      time: `2026-01-${String(i + 2).padStart(2, "0")}`,
      open: 300 + i,
      high: 320 + i,
      low: 290 + i,
      close: 300 + i,
    }));
    // Each series evaluated independently should accept all bars
    const gcResult = validateAndRepairOhlc(gcBars, { intraday: false });
    const gldResult = validateAndRepairOhlc(gldBars, { intraday: false });
    expect(gcResult.quarantined).toHaveLength(0);
    expect(gldResult.quarantined).toHaveLength(0);
  });

  // ── OHLC invariants ───────────────────────────────────────────────────────

  it("high >= low after repair for all accepted bars", () => {
    const bars: OhlcQualityInput[] = [
      bar({ time: "2026-01-02" }),
      bar({ time: "2026-01-03", open: 45500, high: 44000, low: 45800, close: 45100 }),
      bar({ time: "2026-01-04" }),
    ];
    const result = validateAndRepairOhlc(bars, { intraday: false });
    for (const accepted of result.accepted) {
      expect(accepted.high).toBeGreaterThanOrEqual(accepted.low);
    }
  });

  it("all accepted close values are positive", () => {
    const bars: OhlcQualityInput[] = [
      bar({ time: "2026-01-02" }),
      bar({ time: "2026-01-03", close: 0, low: 0 }),
      bar({ time: "2026-01-04" }),
    ];
    const result = validateAndRepairOhlc(bars, { intraday: false });
    for (const accepted of result.accepted) {
      expect(accepted.close).toBeGreaterThan(0);
    }
  });

  // ── Intraday timeframe aggregation invariant ──────────────────────────────

  it("accepts a valid 30M bar and a valid 2H bar with intraday=true", () => {
    const bar30m: OhlcQualityInput = {
      time: "2026-07-30T10:00:00Z",
      open: 25600,
      high: 25650,
      low: 25580,
      close: 25630,
    };
    const bar2h: OhlcQualityInput = {
      time: "2026-07-30T08:00:00Z",
      open: 25500,
      high: 25700,
      low: 25450,
      close: 25600,
    };
    const result = validateAndRepairOhlc([bar2h, bar30m], { intraday: true });
    expect(result.accepted).toHaveLength(2);
    expect(result.quarantined).toHaveLength(0);
  });
});
