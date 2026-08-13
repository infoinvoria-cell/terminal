import { describe, it, expect } from "vitest";
import {
  computeCorrelationMatrix,
  computePCA,
  computeEfficientFrontier,
  computeVaRSurface,
  computeTradeStats,
} from "../transforms";
import {
  covarianceMatrix,
  correlationFromCovariance,
  jacobiEigen,
  portfolioVariance,
  randomWeights,
  solveLinearSystem,
  analyticalFrontierPoint,
} from "../linear-algebra";
import type { TradeRecord } from "../types";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";

// ─── Test data helpers ────────────────────────────────────────────────────────

function makeSeries(values: number[]): AnalyticsSeriesPoint[] {
  return values.map((v, i) => ({
    date: `2020-${String(i + 1).padStart(2, "0")}-01`,
    value: v,
  }));
}

/** Generate ~24 months of synthetic equity series (random walk from 100). */
function syntheticEquity(seed: number, n = 60): AnalyticsSeriesPoint[] {
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
  const dates: string[] = [];
  let year = 2019, month = 1;
  for (let i = 0; i < n; i++) {
    dates.push(`${year}-${String(month).padStart(2, "0")}-01`);
    month++;
    if (month > 12) { month = 1; year++; }
  }
  let val = 100;
  return dates.map((date) => {
    val = val * (1 + (rng() - 0.48) * 0.05);
    return { date, value: val };
  });
}

function makeTrades(n: number, winRate: number, avgWin: number, avgLoss: number): TradeRecord[] {
  const trades: TradeRecord[] = [];
  const winsNeeded = Math.round(n * winRate);
  for (let i = 0; i < n; i++) {
    const isWin = i < winsNeeded;
    trades.push({
      entry_time: `2020-01-${String((i % 28) + 1).padStart(2, "0")}`,
      exit_time: `2020-01-${String((i % 28) + 1).padStart(2, "0")}`,
      entry_price: 100,
      exit_price: isWin ? 100 + avgWin : 100 - avgLoss,
      pnl: isWin ? avgWin : -avgLoss,
      exit_type: "TIME",
      year: 2020,
    });
  }
  return trades;
}

// ─── Linear algebra ───────────────────────────────────────────────────────────

describe("covarianceMatrix", () => {
  it("produces symmetric matrix", () => {
    const data = [[1, 2], [3, 4], [5, 6], [7, 8]];
    const cov = covarianceMatrix(data);
    expect(cov.length).toBe(2);
    expect(cov[0]![1]).toBeCloseTo(cov[1]![0]!, 8);
  });

  it("diagonal is variance of each column", () => {
    // Column 0: [0,1,2,3] — variance = 1.667
    const data = [[0, 10], [1, 10], [2, 10], [3, 10]];
    const cov = covarianceMatrix(data);
    const variance = data.map(r => r[0]).reduce((s, v) => s + (v! - 1.5) ** 2, 0) / 3;
    expect(cov[0]![0]).toBeCloseTo(variance, 6);
    expect(cov[1]![1]).toBeCloseTo(0, 6); // column 1 is constant
  });

  it("returns empty for insufficient data", () => {
    expect(covarianceMatrix([[1, 2]])).toEqual([]);
    expect(covarianceMatrix([])).toEqual([]);
  });
});

describe("correlationFromCovariance", () => {
  it("diagonal is always 1", () => {
    const cov = [[4, 2], [2, 9]];
    const corr = correlationFromCovariance(cov);
    expect(corr[0]![0]).toBeCloseTo(1, 8);
    expect(corr[1]![1]).toBeCloseTo(1, 8);
  });

  it("off-diagonal is bounded [-1, 1]", () => {
    const cov = [[4, 2], [2, 9]];
    const corr = correlationFromCovariance(cov);
    expect(Math.abs(corr[0]![1]!)).toBeLessThanOrEqual(1);
  });
});

describe("jacobiEigen", () => {
  it("finds eigenvalues of 2×2 symmetric matrix", () => {
    // [[3, 1], [1, 3]] has eigenvalues 4 and 2
    const A = [[3, 1], [1, 3]];
    const { eigenvalues } = jacobiEigen(A);
    expect(eigenvalues[0]).toBeCloseTo(4, 4);
    expect(eigenvalues[1]).toBeCloseTo(2, 4);
  });

  it("eigenvalues are sorted descending", () => {
    const A = [[1, 0, 0], [0, 5, 0], [0, 0, 3]];
    const { eigenvalues } = jacobiEigen(A);
    expect(eigenvalues[0]).toBeGreaterThanOrEqual(eigenvalues[1]!);
    expect(eigenvalues[1]).toBeGreaterThanOrEqual(eigenvalues[2]!);
  });

  it("sum of eigenvalues = trace of matrix", () => {
    const A = [[4, 2, 1], [2, 3, 0.5], [1, 0.5, 2]];
    const trace = A.reduce((s, row, i) => s + row[i]!, 0);
    const { eigenvalues } = jacobiEigen(A);
    const sumEv = eigenvalues.reduce((s, v) => s + v, 0);
    expect(sumEv).toBeCloseTo(trace, 3);
  });
});

describe("portfolioVariance", () => {
  it("equal weight 2-asset uncorrelated portfolio", () => {
    // σ² = 0.25 * var1 + 0.25 * var2 (covariance = 0)
    const cov = [[0.04, 0], [0, 0.09]];
    const w = [0.5, 0.5];
    const pv = portfolioVariance(w, cov);
    expect(pv).toBeCloseTo(0.25 * 0.04 + 0.25 * 0.09, 8);
  });
});

describe("randomWeights", () => {
  it("sums to 1", () => {
    for (let k = 2; k <= 8; k++) {
      const w = randomWeights(k, k * 1337);
      const sum = w.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it("all non-negative", () => {
    const w = randomWeights(5, 42);
    expect(w.every((v) => v >= 0)).toBe(true);
  });

  it("different seeds produce different weights", () => {
    const w1 = randomWeights(4, 1);
    const w2 = randomWeights(4, 2);
    expect(w1).not.toEqual(w2);
  });
});

// ─── Correlation matrix ───────────────────────────────────────────────────────

describe("computeCorrelationMatrix", () => {
  it("returns null for single series", () => {
    const seriesMap = { A: syntheticEquity(1) };
    expect(computeCorrelationMatrix(seriesMap)).toBeNull();
  });

  it("diagonal is 1 for all assets", () => {
    const seriesMap = {
      A: syntheticEquity(1),
      B: syntheticEquity(2),
      C: syntheticEquity(3),
    };
    const result = computeCorrelationMatrix(seriesMap);
    expect(result).not.toBeNull();
    for (let i = 0; i < 3; i++) {
      expect(result!.matrix[i]![i]).toBeCloseTo(1, 4);
    }
  });

  it("matrix is symmetric", () => {
    const seriesMap = { A: syntheticEquity(10), B: syntheticEquity(20) };
    const result = computeCorrelationMatrix(seriesMap);
    expect(result!.matrix[0]![1]).toBeCloseTo(result!.matrix[1]![0]!, 8);
  });

  it("correlation is bounded [-1, 1]", () => {
    const seriesMap = { A: syntheticEquity(5), B: syntheticEquity(99) };
    const result = computeCorrelationMatrix(seriesMap);
    for (const row of result!.matrix) {
      for (const v of row) {
        expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("returns correct label count", () => {
    const seriesMap = { A: syntheticEquity(1), B: syntheticEquity(2), C: syntheticEquity(3) };
    const result = computeCorrelationMatrix(seriesMap);
    expect(result!.labels.length).toBe(3);
    expect(result!.matrix.length).toBe(3);
  });
});

// ─── PCA ─────────────────────────────────────────────────────────────────────

describe("computePCA", () => {
  it("returns null for single series", () => {
    expect(computePCA({ A: syntheticEquity(1) })).toBeNull();
  });

  it("explained variance sums to ~1", () => {
    const seriesMap = { A: syntheticEquity(1), B: syntheticEquity(2), C: syntheticEquity(3) };
    const result = computePCA(seriesMap);
    expect(result).not.toBeNull();
    const totalExplained = result!.components.reduce((s, c) => s + c.explainedVariance, 0);
    expect(totalExplained).toBeCloseTo(1, 3);
  });

  it("cumulative variance is monotonically increasing", () => {
    const seriesMap = { A: syntheticEquity(7), B: syntheticEquity(8), C: syntheticEquity(9) };
    const result = computePCA(seriesMap);
    const cumVars = result!.components.map((c) => c.cumulativeVariance);
    for (let i = 1; i < cumVars.length; i++) {
      expect(cumVars[i]).toBeGreaterThanOrEqual(cumVars[i - 1]! - 1e-9);
    }
  });

  it("PC1 explains the most variance", () => {
    const seriesMap = { A: syntheticEquity(10), B: syntheticEquity(11), C: syntheticEquity(12) };
    const result = computePCA(seriesMap);
    const ev = result!.components.map((c) => c.explainedVariance);
    expect(ev[0]).toBeGreaterThanOrEqual(ev[1]! - 1e-9);
  });
});

// ─── Efficient frontier ───────────────────────────────────────────────────────

describe("computeEfficientFrontier", () => {
  it("returns null for single series", () => {
    expect(computeEfficientFrontier({ A: syntheticEquity(1) })).toBeNull();
  });

  it("returns sampled portfolios", () => {
    const seriesMap = { A: syntheticEquity(1, 60), B: syntheticEquity(2, 60) };
    const result = computeEfficientFrontier(seriesMap, 100);
    expect(result).not.toBeNull();
    expect(result!.sampledPortfolios.length).toBe(100);
  });

  it("min-vol has lower variance than max-sharpe in most cases", () => {
    const seriesMap = {
      A: syntheticEquity(1, 60),
      B: syntheticEquity(2, 60),
      C: syntheticEquity(3, 60),
    };
    const result = computeEfficientFrontier(seriesMap, 200);
    expect(result).not.toBeNull();
    // min-vol should have finite vol
    expect(isFinite(result!.minVol.vol)).toBe(true);
    expect(result!.minVol.vol).toBeLessThan(Infinity);
  });

  it("individual assets are listed", () => {
    const seriesMap = { A: syntheticEquity(4, 60), B: syntheticEquity(5, 60) };
    const result = computeEfficientFrontier(seriesMap, 50);
    expect(result!.individualAssets.length).toBe(2);
    expect(["A", "B"]).toContain(result!.individualAssets[0]!.label);
  });
});

// ─── VaR/CVaR surface ────────────────────────────────────────────────────────

describe("computeVaRSurface", () => {
  const returns = Array.from({ length: 60 }, (_, i) => (i % 5 === 0 ? -0.05 : 0.02));

  it("returns null for insufficient data", () => {
    expect(computeVaRSurface([0.01, 0.02])).toBeNull();
  });

  it("returns correct grid dimensions", () => {
    const conf = [0.95, 0.99];
    const horiz = [1, 3, 12];
    const result = computeVaRSurface(returns, conf, horiz);
    expect(result!.confidences).toEqual(conf);
    expect(result!.horizons).toEqual(horiz);
    expect(result!.varMatrix.length).toBe(conf.length);
    expect(result!.varMatrix[0]!.length).toBe(horiz.length);
  });

  it("CVaR ≤ VaR (CVaR is worse or equal)", () => {
    // Use highly negative returns to ensure loss-side VaR
    const lossReturns = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? -0.08 : 0.03));
    const result = computeVaRSurface(lossReturns, [0.95], [1, 6]);
    for (let ci = 0; ci < result!.confidences.length; ci++) {
      for (let hi = 0; hi < result!.horizons.length; hi++) {
        expect(result!.cvarMatrix[ci]![hi]).toBeLessThanOrEqual(
          result!.varMatrix[ci]![hi]! + 1e-9,
        );
      }
    }
  });

  it("negative-return series has negative VaR at high confidence", () => {
    // All returns negative — VaR must be negative
    const allLoss = Array.from({ length: 60 }, () => -0.03);
    const result = computeVaRSurface(allLoss, [0.95], [1]);
    expect(result!.varMatrix[0]![0]).toBeLessThan(0);
  });

  it("longer horizon has more severe VaR for consistently negative returns", () => {
    const allLoss = Array.from({ length: 60 }, () => -0.03);
    const result = computeVaRSurface(allLoss, [0.95], [1, 12]);
    const var1 = result!.varMatrix[0]![0]!;
    const var12 = result!.varMatrix[0]![1]!;
    expect(var12).toBeLessThanOrEqual(var1 + 1e-9);
  });
});

// ─── Trade statistics ─────────────────────────────────────────────────────────

describe("computeTradeStats", () => {
  it("returns zero stats for empty trades", () => {
    const stats = computeTradeStats([]);
    expect(stats.n).toBe(0);
    expect(stats.winRate).toBe(0);
  });

  it("correct win rate calculation", () => {
    const trades = makeTrades(100, 0.6, 50, 30);
    const stats = computeTradeStats(trades);
    expect(stats.n).toBe(100);
    expect(stats.winRate).toBeCloseTo(0.6, 1);
  });

  it("expectancy = WR * avgWin - (1-WR) * avgLoss", () => {
    const trades: TradeRecord[] = [
      { entry_time: "2020-01-01", exit_time: "2020-01-01", entry_price: 100, exit_price: 110, pnl: 10, exit_type: "TP", year: 2020 },
      { entry_time: "2020-01-02", exit_time: "2020-01-02", entry_price: 100, exit_price: 90, pnl: -10, exit_type: "SL", year: 2020 },
      { entry_time: "2020-01-03", exit_time: "2020-01-03", entry_price: 100, exit_price: 120, pnl: 20, exit_type: "TP", year: 2020 },
    ];
    const stats = computeTradeStats(trades);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBeCloseTo(2 / 3, 6);
    expect(stats.avgWin).toBeCloseTo(15, 6);
    expect(stats.avgLoss).toBeCloseTo(10, 6);
    const expectedExpectancy = (2 / 3) * 15 - (1 / 3) * 10;
    expect(stats.expectancy).toBeCloseTo(expectedExpectancy, 6);
  });

  it("profit factor = total wins / total losses", () => {
    const trades: TradeRecord[] = [
      { entry_time: "2020-01-01", exit_time: "2020-01-01", entry_price: 100, exit_price: 110, pnl: 10, exit_type: "TP", year: 2020 },
      { entry_time: "2020-01-02", exit_time: "2020-01-02", entry_price: 100, exit_price: 95, pnl: -5, exit_type: "SL", year: 2020 },
    ];
    const stats = computeTradeStats(trades);
    expect(stats.profitFactor).toBeCloseTo(10 / 5, 6);
  });

  it("max consecutive wins tracked correctly", () => {
    const trades: TradeRecord[] = [
      { pnl: 5, entry_time: "", exit_time: "", entry_price: 0, exit_price: 0, exit_type: "", year: 2020 },
      { pnl: 5, entry_time: "", exit_time: "", entry_price: 0, exit_price: 0, exit_type: "", year: 2020 },
      { pnl: 5, entry_time: "", exit_time: "", entry_price: 0, exit_price: 0, exit_type: "", year: 2020 },
      { pnl: -5, entry_time: "", exit_time: "", entry_price: 0, exit_price: 0, exit_type: "", year: 2020 },
      { pnl: 5, entry_time: "", exit_time: "", entry_price: 0, exit_price: 0, exit_type: "", year: 2020 },
    ];
    const stats = computeTradeStats(trades);
    expect(stats.maxConsecWins).toBe(3);
    expect(stats.maxConsecLosses).toBe(1);
  });

  it("all losses → profitFactor is 0", () => {
    const trades: TradeRecord[] = [
      { pnl: -10, entry_time: "", exit_time: "", entry_price: 0, exit_price: 0, exit_type: "", year: 2020 },
      { pnl: -5, entry_time: "", exit_time: "", entry_price: 0, exit_price: 0, exit_type: "", year: 2020 },
    ];
    const stats = computeTradeStats(trades);
    expect(stats.profitFactor).toBe(0);
    expect(stats.wins).toBe(0);
    expect(stats.winRate).toBe(0);
  });
});

// ─── solveLinearSystem ────────────────────────────────────────────────────────

describe("solveLinearSystem", () => {
  it("solves a simple 2x2 system", () => {
    // 2x + y = 5, x + 3y = 10
    const A = [[2, 1], [1, 3]];
    const b = [5, 10];
    const sol = solveLinearSystem(A, b);
    expect(sol).not.toBeNull();
    expect(sol![0]).toBeCloseTo(1.0, 6);
    expect(sol![1]).toBeCloseTo(3.0, 6);
  });

  it("returns null for singular system", () => {
    const A = [[1, 2], [2, 4]];
    const b = [3, 6];
    const result = solveLinearSystem(A, b);
    expect(result).toBeNull();
  });

  it("solves 3x3 identity", () => {
    const A = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const b = [3, 7, 2];
    const sol = solveLinearSystem(A, b);
    expect(sol).not.toBeNull();
    expect(sol![0]).toBeCloseTo(3, 9);
    expect(sol![1]).toBeCloseTo(7, 9);
    expect(sol![2]).toBeCloseTo(2, 9);
  });
});

// ─── analyticalFrontierPoint ─────────────────────────────────────────────────

describe("analyticalFrontierPoint", () => {
  const means2 = [0.01, 0.015]; // monthly
  const cov2 = [[0.0004, 0.0001], [0.0001, 0.0009]]; // 2-asset uncorrelated-ish

  it("weights sum to 1", () => {
    const fp = analyticalFrontierPoint(cov2, means2, 0.012);
    expect(fp).not.toBeNull();
    const wSum = fp!.weights.reduce((s, w) => s + w, 0);
    expect(wSum).toBeCloseTo(1, 6);
  });

  it("return constraint is satisfied (monthly → annualised)", () => {
    const targetMonthly = 0.012;
    const fp = analyticalFrontierPoint(cov2, means2, targetMonthly);
    expect(fp).not.toBeNull();
    // fp.ret is annualised = 12 * targetMonthly
    expect(fp!.ret).toBeCloseTo(targetMonthly * 12, 4);
  });

  it("portfolio variance matches w'Σw", () => {
    const fp = analyticalFrontierPoint(cov2, means2, 0.012);
    expect(fp).not.toBeNull();
    const manualVar = portfolioVariance(fp!.weights, cov2);
    const fpVar = (fp!.vol / Math.sqrt(12)) ** 2;
    expect(fpVar).toBeCloseTo(manualVar, 8);
  });

  it("no NaN or Infinity in result", () => {
    const fp = analyticalFrontierPoint(cov2, means2, 0.013);
    expect(fp).not.toBeNull();
    expect(isFinite(fp!.vol)).toBe(true);
    expect(isFinite(fp!.ret)).toBe(true);
    expect(isFinite(fp!.sharpe)).toBe(true);
    for (const w of fp!.weights) expect(isFinite(w)).toBe(true);
  });
});

// ─── computeEfficientFrontier — frontier tests ────────────────────────────────

describe("computeEfficientFrontier frontier", () => {
  const seriesMap = {
    A: syntheticEquity(10, 60),
    B: syntheticEquity(20, 60),
    C: syntheticEquity(30, 60),
  };

  it("returns frontierPoints array", () => {
    const result = computeEfficientFrontier(seriesMap, 200);
    expect(result).not.toBeNull();
    expect(result!.frontierPoints.length).toBeGreaterThan(0);
  });

  it("frontier weights sum to 1 for every point", () => {
    const result = computeEfficientFrontier(seriesMap, 200);
    for (const fp of result!.frontierPoints) {
      const wSum = fp.weights.reduce((s, w) => s + w, 0);
      expect(wSum).toBeCloseTo(1, 4);
    }
  });

  it("frontier vols are all finite and positive", () => {
    const result = computeEfficientFrontier(seriesMap, 200);
    for (const fp of result!.frontierPoints) {
      expect(isFinite(fp.vol)).toBe(true);
      expect(fp.vol).toBeGreaterThanOrEqual(0);
    }
  });

  it("min-vol has lower vol than max-sharpe (or equal)", () => {
    const result = computeEfficientFrontier(seriesMap, 200);
    expect(result!.minVol.vol).toBeLessThanOrEqual(result!.maxSharpe.vol + 0.01);
  });

  it("method is LONG-ONLY SIMPLEX", () => {
    const result = computeEfficientFrontier(seriesMap, 100);
    expect(result!.method).toBe("LONG-ONLY SIMPLEX");
  });

  it("componentCount and observationCount are correct", () => {
    const result = computeEfficientFrontier(seriesMap, 100);
    expect(result!.componentCount).toBe(3);
    expect(result!.observationCount).toBeGreaterThan(0);
  });

  it("riskFreeRate is 0", () => {
    const result = computeEfficientFrontier(seriesMap, 100);
    expect(result!.riskFreeRate).toBe(0);
  });

  it("frontier ordering: vol generally increases along sorted frontier", () => {
    const result = computeEfficientFrontier(seriesMap, 200);
    const sorted = [...result!.frontierPoints].sort((a, b) => a.ret - b.ret);
    // Along the frontier, return increases → check at least 70% of consecutive pairs have non-decreasing vol
    let ok = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.vol >= sorted[i - 1]!.vol - 0.002) ok++;
    }
    expect(ok / (sorted.length - 1)).toBeGreaterThan(0.65);
  });
});
