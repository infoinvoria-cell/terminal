import { pineAnnualizedSharpe } from "./pineSharpe";

export interface TradingViewMetricsResult {
  averageReturn: number;
  compoundReturn: number;
  cagr: number;
  maxDrawdown: number;
  profitFactor: number;
  sharpe: number | null;
  calmar: number | null;
}

export function computeTradingViewCompatibleTradeReturns(returns: number[]): number[] {
  return returns
    .filter((value) => Number.isFinite(value))
    .map((value) => Number(value));
}

export function computeTradingViewCompatibleSharpe(returns: number[]): number | null {
  return pineAnnualizedSharpe(computeTradingViewCompatibleTradeReturns(returns));
}

export function computeProfitFactor(returns: number[]): number {
  const normalized = computeTradingViewCompatibleTradeReturns(returns);
  const gains = normalized.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const losses = Math.abs(normalized.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  if (losses <= 1e-12) return gains > 0 ? 99 : 0;
  return gains / losses;
}

export function computeCompoundReturn(returns: number[]): number {
  return computeTradingViewCompatibleTradeReturns(returns).reduce((equity, value) => equity * (1 + value), 1) - 1;
}

export function computeCagr(returns: number[]): number {
  const normalized = computeTradingViewCompatibleTradeReturns(returns);
  if (normalized.length === 0) return 0;
  const compoundReturn = computeCompoundReturn(normalized);
  return Math.pow(Math.max(1 + compoundReturn, 1e-9), 1 / normalized.length) - 1;
}

export function computeMaxDrawdown(returns: number[]): number {
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const value of computeTradingViewCompatibleTradeReturns(returns)) {
    equity *= 1 + value;
    if (equity > peak) peak = equity;
    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
    }
  }
  return maxDrawdown;
}

export function computeCalmar(returns: number[]): number | null {
  const maxDrawdown = computeMaxDrawdown(returns);
  if (maxDrawdown <= 1e-12) return null;
  return computeCagr(returns) / Math.abs(maxDrawdown);
}

export function computeTradingViewMetrics(returns: number[]): TradingViewMetricsResult {
  const normalized = computeTradingViewCompatibleTradeReturns(returns);
  const averageReturn = normalized.length
    ? normalized.reduce((sum, value) => sum + value, 0) / normalized.length
    : 0;
  const compoundReturn = computeCompoundReturn(normalized);
  const cagr = computeCagr(normalized);
  const maxDrawdown = computeMaxDrawdown(normalized);
  const profitFactor = computeProfitFactor(normalized);
  const sharpe = computeTradingViewCompatibleSharpe(normalized);
  const calmar = maxDrawdown > 1e-12 ? cagr / Math.abs(maxDrawdown) : null;

  return {
    averageReturn,
    compoundReturn,
    cagr,
    maxDrawdown,
    profitFactor,
    sharpe,
    calmar,
  };
}

