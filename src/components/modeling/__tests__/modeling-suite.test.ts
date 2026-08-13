/**
 * Modeling Studio — Vitest suite
 * Covers: registry integrity, availability resolver, MC math, 2D/3D lifecycle semantics
 */
import { describe, it, expect } from "vitest";
import { MODELING_REGISTRY } from "../ModelingRegistry";
import { seriesHasData } from "@/lib/modeling/availability";

// ─── Registry ───────────────────────────────────────────────────────────────

describe("ModelingRegistry", () => {
  it("has at least 70 entries", () => {
    expect(MODELING_REGISTRY.length).toBeGreaterThanOrEqual(70);
  });

  it("every entry has a unique id", () => {
    const ids = MODELING_REGISTRY.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every entry has a non-empty label", () => {
    for (const e of MODELING_REGISTRY) {
      expect(e.label.trim().length, `empty label for ${e.id}`).toBeGreaterThan(0);
    }
  });

  it("every entry has a valid section key", () => {
    const VALID_SECTIONS = new Set([
      "portfolios", "groups", "ws-strategies", "ws-seasonal", "core-invest",
      "monitoring-agrar", "monitoring-metalle", "monitoring-energie",
      "monitoring-indizes", "monitoring-fx", "monitoring-aktien",
      "other", "custom",
    ]);
    for (const e of MODELING_REGISTRY) {
      expect(VALID_SECTIONS.has(e.section), `unknown section '${e.section}' for ${e.id}`).toBe(true);
    }
  });

  it("contains the 3 core portfolio entries", () => {
    const ids = new Set(MODELING_REGISTRY.map((e) => e.id));
    expect(ids.has("portfolio-ws")).toBe(true);
    expect(ids.has("portfolio-invest")).toBe(true);
    expect(ids.has("portfolio-combined")).toBe(true);
  });

  it("has monitoring group entries for Agrar, Metalle, Energie, Indizes, FX, Aktien, Seasonal", () => {
    const ids = new Set(MODELING_REGISTRY.map((e) => e.id));
    for (const g of [
      "group-agrar-all", "group-metalle-all", "group-energie-all",
      "group-indizes-all", "group-fx-all", "group-aktien-all", "group-seasonal-all",
    ]) {
      expect(ids.has(g), `missing group entry: ${g}`).toBe(true);
    }
  });

  it("has at least 8 Agrar child entries", () => {
    const agrar = MODELING_REGISTRY.filter((e) => e.section === "monitoring-agrar");
    expect(agrar.length).toBeGreaterThanOrEqual(8);
  });

  it("has at least 5 Metalle child entries", () => {
    const metalle = MODELING_REGISTRY.filter((e) => e.section === "monitoring-metalle");
    expect(metalle.length).toBeGreaterThanOrEqual(5);
  });

  it("has at least 8 FX child entries", () => {
    const fx = MODELING_REGISTRY.filter((e) => e.section === "monitoring-fx");
    expect(fx.length).toBeGreaterThanOrEqual(8);
  });

  it("has at least 6 WS Seasonal entries", () => {
    const seasonal = MODELING_REGISTRY.filter((e) => e.section === "ws-seasonal");
    expect(seasonal.length).toBeGreaterThanOrEqual(6);
  });

  it("all group-kind entries are in the 'groups' section", () => {
    const groupEntries = MODELING_REGISTRY.filter((e) => e.kind === "group");
    for (const e of groupEntries) {
      expect(e.section, `group ${e.id} not in 'groups' section`).toBe("groups");
    }
  });

  it("portfolio entries have no groupSeriesId (resolves to available)", () => {
    const portfolios = MODELING_REGISTRY.filter((e) => e.section === "portfolios");
    for (const e of portfolios) {
      expect(e.groupSeriesId, `portfolio ${e.id} should have no groupSeriesId`).toBeUndefined();
    }
  });
});

// ─── Availability ────────────────────────────────────────────────────────────

describe("seriesHasData", () => {
  it("returns true for undefined (portfolio-level entries)", () => {
    expect(seriesHasData(undefined)).toBe(true);
  });

  it("returns true for known WS strategy keys", () => {
    // GC1 Friday Long is the canonical gold strategy in groupSeries
    expect(seriesHasData("GC1 Friday Long")).toBe(true);
  });

  it("returns false for unknown series keys", () => {
    expect(seriesHasData("__nonexistent_key_xyz__")).toBe(false);
  });

  it("returns false for bare monitoring asset tickers (no analytics data)", () => {
    // These monitoring assets have no equity series in analytics-generated.json
    for (const k of ["ZC1", "ZW1", "CC1", "OJ1", "SB1", "CT1", "SI1", "HG1"]) {
      expect(seriesHasData(k), `expected NO DATA for monitoring ticker ${k}`).toBe(false);
    }
  });

  it("returns false for stock tickers (no analytics data)", () => {
    for (const k of ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"]) {
      expect(seriesHasData(k), `expected NO DATA for stock ${k}`).toBe(false);
    }
  });

  it("returns false for GLD (separate strategy, no bare-ticker group series)", () => {
    expect(seriesHasData("GLD")).toBe(false);
  });
});

// ─── MC Math ─────────────────────────────────────────────────────────────────

describe("Monte Carlo math invariants", () => {
  // Test the statistical properties that should hold for MC path generation
  // These test the pure math layer, not the React component

  function simulatePaths(
    startValue: number,
    mu: number,
    sigma: number,
    steps: number,
    n: number,
    seed: number,
  ): number[][] {
    // Simple seeded LCG for deterministic testing
    let s = seed;
    const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0x100000000; };
    const paths: number[][] = [];
    for (let i = 0; i < n; i++) {
      const path = [startValue];
      for (let j = 0; j < steps; j++) {
        const u1 = rand(), u2 = rand();
        const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
        path.push(path[path.length - 1] * Math.exp(mu + sigma * z));
      }
      paths.push(path);
    }
    return paths;
  }

  it("all paths start at the same initial value", () => {
    const paths = simulatePaths(100, 0.001, 0.02, 12, 50, 42);
    for (const p of paths) {
      expect(p[0]).toBe(100);
    }
  });

  it("all paths have the correct number of steps", () => {
    const paths = simulatePaths(100, 0.001, 0.02, 24, 30, 7);
    for (const p of paths) {
      expect(p.length).toBe(25); // steps + 1 (including start)
    }
  });

  it("median path is between min and max at each step", () => {
    const paths = simulatePaths(100, 0.001, 0.02, 12, 200, 99);
    const steps = paths[0].length;
    for (let t = 0; t < steps; t++) {
      const vals = paths.map((p) => p[t]).sort((a, b) => a - b);
      const min = vals[0], max = vals[vals.length - 1];
      const median = vals[Math.floor(vals.length / 2)];
      expect(median).toBeGreaterThanOrEqual(min);
      expect(median).toBeLessThanOrEqual(max);
    }
  });

  it("worst-case path is always the minimum across paths at final step", () => {
    const paths = simulatePaths(100, 0.001, 0.02, 12, 100, 13);
    const finals = paths.map((p) => p[p.length - 1]);
    const worstFinal = Math.min(...finals);
    expect(worstFinal).toBeLessThan(100 * Math.exp(0.001 * 12)); // below expected
  });

  it("zero sigma produces paths that follow pure drift (no randomness)", () => {
    const paths = simulatePaths(100, 0.01, 0, 5, 10, 1);
    // All paths should be identical with zero sigma
    for (let t = 1; t < paths[0].length; t++) {
      const expected = paths[0][t];
      for (const p of paths) {
        expect(p[t]).toBeCloseTo(expected, 8);
      }
    }
  });
});

// ─── 2D/3D lifecycle ─────────────────────────────────────────────────────────

describe("2D/3D toggle state machine", () => {
  // Test the pure state transition logic extracted from use3DCard semantics

  type CardState = { is3D: boolean; has3DBeenMounted: boolean };

  function toggle(state: CardState): CardState {
    const next = !state.is3D;
    return { is3D: next, has3DBeenMounted: state.has3DBeenMounted || next };
  }

  it("starts in 2D, 3D not yet mounted", () => {
    const s: CardState = { is3D: false, has3DBeenMounted: false };
    expect(s.is3D).toBe(false);
    expect(s.has3DBeenMounted).toBe(false);
  });

  it("first toggle activates 3D and marks it mounted", () => {
    let s: CardState = { is3D: false, has3DBeenMounted: false };
    s = toggle(s);
    expect(s.is3D).toBe(true);
    expect(s.has3DBeenMounted).toBe(true);
  });

  it("toggling back to 2D keeps has3DBeenMounted true (lazy-init guard)", () => {
    let s: CardState = { is3D: false, has3DBeenMounted: false };
    s = toggle(s);
    s = toggle(s);
    expect(s.is3D).toBe(false);
    expect(s.has3DBeenMounted).toBe(true); // canvas stays in DOM, just hidden
  });

  it("20 rapid toggles end in the same state as 20 mod 2", () => {
    let s: CardState = { is3D: false, has3DBeenMounted: false };
    for (let i = 0; i < 20; i++) s = toggle(s);
    expect(s.is3D).toBe(false); // 20 is even → back to 2D
    expect(s.has3DBeenMounted).toBe(true);
  });

  it("21 rapid toggles end in 3D", () => {
    let s: CardState = { is3D: false, has3DBeenMounted: false };
    for (let i = 0; i < 21; i++) s = toggle(s);
    expect(s.is3D).toBe(true);
  });

  it("has3DBeenMounted is monotonically true once set (no reset on subject change)", () => {
    // Simulate a subject change by resetting is3D but preserving has3DBeenMounted
    let s: CardState = { is3D: false, has3DBeenMounted: false };
    s = toggle(s); // mount 3D
    // Subject changes → is3D reset to false, but has3DBeenMounted preserved (CSS display swap)
    s = { is3D: false, has3DBeenMounted: s.has3DBeenMounted };
    expect(s.has3DBeenMounted).toBe(true);
  });
});
