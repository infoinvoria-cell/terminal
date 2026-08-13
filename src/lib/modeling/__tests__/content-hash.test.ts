/**
 * Content hash tests — source provenance contract.
 *
 * Requirements:
 * - Same exact dataset → same hash
 * - Different selection → different hash
 * - Middle equity value changes → hash changes
 * - Middle return changes → hash changes
 * - Trade changes → hash changes
 * - Component series changes → hash changes
 * - Ordering stable for already-sorted data
 */
import { describe, it, expect } from "vitest";
import { computeDatasetHash } from "../content-hash";
import type { DatasetHashInput } from "../content-hash";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEquity(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    date: `2020-${String(Math.floor(i / 30) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    value: 100 + i * 0.5 + offset,
  }));
}

function makeReturns(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => 0.01 + i * 0.001 + offset);
}

function makeTrades(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    entry_time: `2020-01-${String(i + 1).padStart(2, "0")}T09:00:00`,
    exit_time: `2020-01-${String(i + 2).padStart(2, "0")}T17:00:00`,
    entry_price: 100 + i,
    exit_price: 102 + i,
    pnl: 0.02 * (i + 1),
    exit_type: "TP",
    year: 2020,
  }));
}

function makeComponents(keys: string[], seriesLen: number) {
  const result: Record<string, Array<{ date: string; value: number }>> = {};
  for (const key of keys) {
    result[key] = Array.from({ length: seriesLen }, (_, i) => ({
      date: `2020-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      value: 100 + i * 0.3,
    }));
  }
  return result;
}

const BASE: DatasetHashInput = {
  selectionId: "portfolio-ws",
  equity: makeEquity(24),
  returns: makeReturns(23),
  trades: null,
  components: null,
};

// ─── Stability ────────────────────────────────────────────────────────────────

describe("computeDatasetHash — stability", () => {
  it("same exact dataset → same hash", () => {
    const a = computeDatasetHash(BASE);
    const b = computeDatasetHash({ ...BASE });
    expect(a).toBe(b);
  });

  it("same dataset called twice → same hash (deterministic)", () => {
    const h1 = computeDatasetHash(BASE);
    const h2 = computeDatasetHash(BASE);
    expect(h1).toBe(h2);
  });

  it("already-sorted equity input is stable across calls", () => {
    const eq = makeEquity(12);
    const input: DatasetHashInput = { ...BASE, equity: eq, returns: makeReturns(11) };
    expect(computeDatasetHash(input)).toBe(computeDatasetHash(input));
  });
});

// ─── Selection isolation ───────────────────────────────────────────────────────

describe("computeDatasetHash — selection isolation", () => {
  it("different selectionId → different hash even with same data", () => {
    const a = computeDatasetHash({ ...BASE, selectionId: "portfolio-ws" });
    const b = computeDatasetHash({ ...BASE, selectionId: "portfolio-invest" });
    expect(a).not.toBe(b);
  });

  it("GC1 hash ≠ portfolio-ws hash", () => {
    const ws = computeDatasetHash(BASE);
    const gc1 = computeDatasetHash({ ...BASE, selectionId: "GC1 Friday Long" });
    expect(ws).not.toBe(gc1);
  });

  it("asset-SPY hash ≠ asset-GLD hash with same equity", () => {
    const spy = computeDatasetHash({ ...BASE, selectionId: "asset-SPY" });
    const gld = computeDatasetHash({ ...BASE, selectionId: "asset-GLD" });
    expect(spy).not.toBe(gld);
  });
});

// ─── Equity mutation sensitivity ──────────────────────────────────────────────

describe("computeDatasetHash — equity mutation", () => {
  it("middle equity value changes → hash changes", () => {
    const eq = makeEquity(24);
    const eqMutated = eq.map((p, i) =>
      i === 12 ? { ...p, value: p.value + 0.001 } : p
    );
    const a = computeDatasetHash({ ...BASE, equity: eq });
    const b = computeDatasetHash({ ...BASE, equity: eqMutated });
    expect(a).not.toBe(b);
  });

  it("first equity value changes → hash changes", () => {
    const eq = makeEquity(24);
    const eqMutated = [{ ...eq[0]!, value: eq[0]!.value + 0.001 }, ...eq.slice(1)];
    const a = computeDatasetHash({ ...BASE, equity: eq });
    const b = computeDatasetHash({ ...BASE, equity: eqMutated });
    expect(a).not.toBe(b);
  });

  it("last equity value changes → hash changes", () => {
    const eq = makeEquity(24);
    const last = eq[eq.length - 1]!;
    const eqMutated = [...eq.slice(0, -1), { ...last, value: last.value + 0.001 }];
    const a = computeDatasetHash({ ...BASE, equity: eq });
    const b = computeDatasetHash({ ...BASE, equity: eqMutated });
    expect(a).not.toBe(b);
  });

  it("single equity date changes → hash changes", () => {
    const eq = makeEquity(24);
    const eqMutated = eq.map((p, i) =>
      i === 5 ? { ...p, date: "2021-01-01" } : p
    );
    const a = computeDatasetHash({ ...BASE, equity: eq });
    const b = computeDatasetHash({ ...BASE, equity: eqMutated });
    expect(a).not.toBe(b);
  });

  it("extra equity point appended → hash changes", () => {
    const eq = makeEquity(24);
    const eqExtended = [...eq, { date: "2022-01-01", value: 115 }];
    const a = computeDatasetHash({ ...BASE, equity: eq });
    const b = computeDatasetHash({ ...BASE, equity: eqExtended });
    expect(a).not.toBe(b);
  });
});

// ─── Return mutation sensitivity ──────────────────────────────────────────────

describe("computeDatasetHash — return mutation", () => {
  it("middle return changes → hash changes", () => {
    const ret = makeReturns(23);
    const retMutated = ret.map((v, i) => (i === 11 ? v + 0.0001 : v));
    const a = computeDatasetHash({ ...BASE, returns: ret });
    const b = computeDatasetHash({ ...BASE, returns: retMutated });
    expect(a).not.toBe(b);
  });

  it("first return changes → hash changes", () => {
    const ret = makeReturns(23);
    const retMutated = [ret[0]! + 0.00001, ...ret.slice(1)];
    const a = computeDatasetHash({ ...BASE, returns: ret });
    const b = computeDatasetHash({ ...BASE, returns: retMutated });
    expect(a).not.toBe(b);
  });

  it("extra return appended → hash changes", () => {
    const ret = makeReturns(23);
    const a = computeDatasetHash({ ...BASE, returns: ret });
    const b = computeDatasetHash({ ...BASE, returns: [...ret, 0.05] });
    expect(a).not.toBe(b);
  });
});

// ─── Trade mutation sensitivity ───────────────────────────────────────────────

describe("computeDatasetHash — trade mutation", () => {
  it("adding trades → hash changes", () => {
    const a = computeDatasetHash({ ...BASE, trades: null });
    const b = computeDatasetHash({ ...BASE, trades: makeTrades(5) });
    expect(a).not.toBe(b);
  });

  it("trade pnl changes → hash changes", () => {
    const trades = makeTrades(10);
    const mutated = trades.map((t, i) =>
      i === 4 ? { ...t, pnl: t.pnl + 0.001 } : t
    );
    const a = computeDatasetHash({ ...BASE, trades });
    const b = computeDatasetHash({ ...BASE, trades: mutated });
    expect(a).not.toBe(b);
  });

  it("trade entry time changes → hash changes", () => {
    const trades = makeTrades(10);
    const mutated = trades.map((t, i) =>
      i === 2 ? { ...t, entry_time: "2021-06-01T09:00:00" } : t
    );
    const a = computeDatasetHash({ ...BASE, trades });
    const b = computeDatasetHash({ ...BASE, trades: mutated });
    expect(a).not.toBe(b);
  });

  it("trade count changes → hash changes", () => {
    const trades = makeTrades(10);
    const a = computeDatasetHash({ ...BASE, trades });
    const b = computeDatasetHash({ ...BASE, trades: trades.slice(0, 9) });
    expect(a).not.toBe(b);
  });
});

// ─── Component mutation sensitivity ───────────────────────────────────────────

describe("computeDatasetHash — component mutation", () => {
  it("adding components → hash changes", () => {
    const a = computeDatasetHash({ ...BASE, components: null });
    const b = computeDatasetHash({ ...BASE, components: makeComponents(["GC1", "YM1"], 24) });
    expect(a).not.toBe(b);
  });

  it("component series value changes → hash changes", () => {
    const comps = makeComponents(["GC1", "YM1"], 24);
    const compsMutated = {
      ...comps,
      GC1: comps["GC1"]!.map((p, i) => (i === 10 ? { ...p, value: p.value + 0.5 } : p)),
    };
    const a = computeDatasetHash({ ...BASE, components: comps });
    const b = computeDatasetHash({ ...BASE, components: compsMutated });
    expect(a).not.toBe(b);
  });

  it("adding a new component key → hash changes", () => {
    const comps2 = makeComponents(["GC1", "YM1"], 24);
    const comps3 = makeComponents(["GC1", "YM1", "NQ1"], 24);
    const a = computeDatasetHash({ ...BASE, components: comps2 });
    const b = computeDatasetHash({ ...BASE, components: comps3 });
    expect(a).not.toBe(b);
  });

  it("component key ordering does not affect hash (canonical sort)", () => {
    const compsAB = makeComponents(["GC1", "YM1"], 24);
    const compsBA: Record<string, Array<{ date: string; value: number }>> = {
      YM1: compsAB["YM1"]!,
      GC1: compsAB["GC1"]!,
    };
    const a = computeDatasetHash({ ...BASE, components: compsAB });
    const b = computeDatasetHash({ ...BASE, components: compsBA });
    expect(a).toBe(b);
  });
});

// ─── Empty / edge cases ────────────────────────────────────────────────────────

describe("computeDatasetHash — edge cases", () => {
  it("empty equity → returns empty sentinel without throwing", () => {
    const h = computeDatasetHash({ ...BASE, equity: [], returns: [] });
    expect(h).toContain("empty");
  });

  it("single point equity → produces a hash", () => {
    const h = computeDatasetHash({
      ...BASE,
      equity: [{ date: "2020-01-01", value: 100 }],
      returns: [],
    });
    expect(h.length).toBeGreaterThan(0);
    expect(h).not.toContain("empty");
  });
});
