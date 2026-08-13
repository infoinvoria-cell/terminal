import { describe, it, expect } from "vitest";
import { runMonteCarlo } from "../monte-carlo";

const RETURNS = [0.02, -0.01, 0.03, -0.02, 0.01, 0.04, -0.03, 0.02, 0.01, -0.01, 0.05, -0.02];

describe("runMonteCarlo", () => {
  it("same seed → identical output", () => {
    const a = runMonteCarlo({ returns: RETURNS, simulationCount: 100, horizon: 24, seed: 42, method: "bootstrap", sourceHash: "x" });
    const b = runMonteCarlo({ returns: RETURNS, simulationCount: 100, horizon: 24, seed: 42, method: "bootstrap", sourceHash: "x" });
    expect(a.paths).toEqual(b.paths);
    expect(a.percentiles.p50).toEqual(b.percentiles.p50);
  });

  it("different seed → different path sequence", () => {
    const a = runMonteCarlo({ returns: RETURNS, simulationCount: 100, horizon: 24, seed: 42, method: "bootstrap", sourceHash: "x" });
    const b = runMonteCarlo({ returns: RETURNS, simulationCount: 100, horizon: 24, seed: 99, method: "bootstrap", sourceHash: "x" });
    expect(a.paths[0]).not.toEqual(b.paths[0]);
  });

  it("simulationCount honored", () => {
    const r = runMonteCarlo({ returns: RETURNS, simulationCount: 500, horizon: 12, seed: 1, method: "bootstrap", sourceHash: "x" });
    expect(r.paths.length).toBe(500);
  });

  it("no NaN or Infinity in paths", () => {
    const r = runMonteCarlo({ returns: RETURNS, simulationCount: 200, horizon: 24, seed: 7, method: "bootstrap", sourceHash: "x" });
    for (const path of r.paths) {
      for (const v of path) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Number.isNaN(v)).toBe(false);
      }
    }
  });

  it("zero-return input → all paths at 100", () => {
    const r = runMonteCarlo({ returns: [0, 0, 0], simulationCount: 10, horizon: 6, seed: 1, method: "bootstrap", sourceHash: "x" });
    for (const path of r.paths) {
      for (const v of path) expect(Math.abs(v - 100)).toBeLessThan(1e-9);
    }
  });

  it("empty input → paths empty, percentiles flat", () => {
    const r = runMonteCarlo({ returns: [], simulationCount: 10, horizon: 6, seed: 1, method: "bootstrap", sourceHash: "x" });
    expect(r.paths.length).toBe(0);
    expect(r.percentiles.p50.every((v) => v === 100)).toBe(true);
  });

  it("horizon honored: each path has horizon+1 points", () => {
    const r = runMonteCarlo({ returns: RETURNS, simulationCount: 5, horizon: 36, seed: 1, method: "bootstrap", sourceHash: "x" });
    for (const path of r.paths) expect(path.length).toBe(37);
  });

  it("percentile ordering: p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90 at final step", () => {
    const r = runMonteCarlo({ returns: RETURNS, simulationCount: 1000, horizon: 24, seed: 42, method: "bootstrap", sourceHash: "x" });
    const t = 24;
    expect(r.percentiles.p10[t]!).toBeLessThanOrEqual(r.percentiles.p25[t]!);
    expect(r.percentiles.p25[t]!).toBeLessThanOrEqual(r.percentiles.p50[t]!);
    expect(r.percentiles.p50[t]!).toBeLessThanOrEqual(r.percentiles.p75[t]!);
    expect(r.percentiles.p75[t]!).toBeLessThanOrEqual(r.percentiles.p90[t]!);
  });
});
