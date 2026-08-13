import { describe, it, expect } from "vitest";
import { extractMonthlyReturns, buildDistribution, computeRolling } from "../transforms";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";

function makeSeries(values: number[]): AnalyticsSeriesPoint[] {
  return values.map((v, i) => ({ date: `2020-${String(i + 1).padStart(2, "0")}-28`, value: v }));
}

describe("extractMonthlyReturns", () => {
  it("empty series → empty", () => {
    expect(extractMonthlyReturns([])).toEqual([]);
  });

  it("single point → empty", () => {
    expect(extractMonthlyReturns(makeSeries([5]))).toEqual([]);
  });

  it("flat equity → zero returns", () => {
    const rets = extractMonthlyReturns(makeSeries([0, 0, 0, 0]));
    expect(rets.every((r) => Math.abs(r) < 1e-9)).toBe(true);
  });

  it("single step +10% cumulative → return ≈ 0.10", () => {
    const rets = extractMonthlyReturns(makeSeries([0, 10]));
    expect(Math.abs(rets[0]! - 0.1)).toBeLessThan(1e-9);
  });

  it("count equals series.length - 1", () => {
    const rets = extractMonthlyReturns(makeSeries([0, 5, 3, 8, 2]));
    expect(rets.length).toBe(4);
  });
});

describe("buildDistribution", () => {
  it("empty → empty bins, n=0", () => {
    const { bins, stats } = buildDistribution([]);
    expect(bins.length).toBe(0);
    expect(stats.n).toBe(0);
  });

  it("correct mean", () => {
    const { stats } = buildDistribution([0.01, 0.02, -0.01, 0.03, -0.02]);
    expect(Math.abs(stats.mean - 0.006)).toBeLessThan(1e-9);
  });

  it("binCount honored", () => {
    const { bins } = buildDistribution([0.01, 0.02, 0.03], 5);
    expect(bins.length).toBe(5);
  });

  it("frequencies sum to 1", () => {
    const { bins } = buildDistribution([0.01, -0.01, 0.02, -0.02, 0.03], 10);
    const sum = bins.reduce((s, b) => s + b.freq, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("var95 ≤ median for negatively-skewed distribution", () => {
    const data = Array.from({ length: 100 }, (_, i) => (i < 5 ? -0.2 : 0.01));
    const { stats } = buildDistribution(data, 20);
    expect(stats.var95).toBeLessThan(stats.median);
  });
});

describe("computeRolling", () => {
  it("series shorter than window → empty", () => {
    const series = makeSeries([0, 1, 2]);
    expect(computeRolling(series, "sharpe", 12)).toEqual([]);
  });

  it("returns finite values for sharpe", () => {
    const series = makeSeries([0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6]);
    const result = computeRolling(series, "sharpe", 6);
    expect(result.length).toBeGreaterThan(0);
    for (const p of result) expect(Number.isFinite(p.value)).toBe(true);
  });

  it("volatility values are non-negative", () => {
    const series = makeSeries([0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6]);
    const result = computeRolling(series, "volatility", 6);
    for (const p of result) expect(p.value).toBeGreaterThanOrEqual(0);
  });

  it("result length = series.length - window", () => {
    const series = makeSeries(Array.from({ length: 20 }, (_, i) => i));
    const result = computeRolling(series, "return", 6);
    expect(result.length).toBe(14);
  });
});
