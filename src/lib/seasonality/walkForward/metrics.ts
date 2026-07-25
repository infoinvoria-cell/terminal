import type { WFTradeMetrics } from "./types";

export function computeTradeMetrics(returns: number[], years: number[]): WFTradeMetrics {
  const tradeCount = returns.length;
  if (tradeCount === 0) {
    return {
      tradeCount: 0,
      compoundedReturn: 0,
      averageReturn: 0,
      medianReturn: 0,
      winRate: 0,
      standardDeviation: 0,
      maxDrawdown: 0,
      profitFactor: 0,
      positiveYears: 0,
      negativeYears: 0,
    };
  }

  const sorted = [...returns].sort((a, b) => a - b);
  const medianReturn = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  const averageReturn = returns.reduce((s, r) => s + r, 0) / tradeCount;
  const compoundedReturn = returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
  const winRate = (returns.filter((r) => r > 0).length / tradeCount) * 100;

  const variance = tradeCount < 2
    ? 0
    : returns.reduce((s, r) => s + (r - averageReturn) ** 2, 0) / (tradeCount - 1);
  const standardDeviation = Math.sqrt(Math.max(variance, 0));

  // Max drawdown on trade equity curve
  let peak = 1;
  let equity = 1;
  let maxDrawdown = 0;
  for (const r of returns) {
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const grossProfit = returns.filter((r) => r > 0).reduce((s, r) => s + r, 0);
  const grossLoss = Math.abs(returns.filter((r) => r < 0).reduce((s, r) => s + r, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 999 : 0) : grossProfit / grossLoss;

  const positiveYears = years.filter((_, i) => returns[i] > 0).length;
  const negativeYears = years.filter((_, i) => returns[i] < 0).length;

  return {
    tradeCount,
    compoundedReturn,
    averageReturn,
    medianReturn,
    winRate,
    standardDeviation,
    maxDrawdown,
    profitFactor,
    positiveYears,
    negativeYears,
  };
}

export function computeStabilityScore(metrics: WFTradeMetrics): number {
  return metrics.averageReturn - 0.5 * metrics.standardDeviation;
}

export function computeOosSummary(oosReturns: number[], testYears: number[]) {
  if (oosReturns.length === 0) {
    return {
      foldCount: 0,
      oosTradeCount: 0,
      oosCompoundedReturn: 0,
      oosAverageReturn: 0,
      oosMedianReturn: 0,
      oosWinRate: 0,
      oosProfitFactor: 0,
      oosMaxDrawdown: 0,
      positiveTestYears: 0,
      negativeTestYears: 0,
      bestTestYear: null,
      worstTestYear: null,
    };
  }

  const metrics = computeTradeMetrics(oosReturns, testYears);
  const bestIdx = oosReturns.reduce((best, r, i) => r > oosReturns[best] ? i : best, 0);
  const worstIdx = oosReturns.reduce((worst, r, i) => r < oosReturns[worst] ? i : worst, 0);

  return {
    foldCount: testYears.length,
    oosTradeCount: oosReturns.length,
    oosCompoundedReturn: metrics.compoundedReturn,
    oosAverageReturn: metrics.averageReturn,
    oosMedianReturn: metrics.medianReturn,
    oosWinRate: metrics.winRate,
    oosProfitFactor: metrics.profitFactor,
    oosMaxDrawdown: metrics.maxDrawdown,
    positiveTestYears: metrics.positiveYears,
    negativeTestYears: metrics.negativeYears,
    bestTestYear: testYears[bestIdx],
    worstTestYear: testYears[worstIdx],
  };
}
