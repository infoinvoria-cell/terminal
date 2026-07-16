import type { FSPortfolioConfig, PositionWeight } from "@/lib/fsportfolio/types";

export function isQuarterRebalanceDate(date: string, rebalanceMonths: number[], nextDate?: string) {
  const current = new Date(`${date}T00:00:00Z`);
  const month = current.getUTCMonth() + 1;
  if (!rebalanceMonths.includes(month)) return false;
  if (!nextDate) return true;
  const next = new Date(`${nextDate}T00:00:00Z`);
  return next.getUTCMonth() !== current.getUTCMonth() || next.getUTCFullYear() !== current.getUTCFullYear();
}

export function buildPositionWeights(
  config: FSPortfolioConfig,
  currentValues: Record<string, number>,
): PositionWeight[] {
  const total = Object.values(currentValues).reduce((sum, value) => sum + value, 0);
  return Object.entries(config.weights).map(([symbol, targetWeight]) => {
    const currentWeight = total > 0 ? (currentValues[symbol] ?? 0) / total : 0;
    const relativeBand = config.tolerance_band_relative;
    return {
      symbol,
      targetWeight,
      currentWeight,
      deviation: currentWeight - targetWeight,
      lowerBand: targetWeight * (1 - relativeBand),
      upperBand: targetWeight * (1 + relativeBand),
    };
  });
}

export function computeTurnover(
  currentWeights: Record<string, number>,
  targetWeights: Record<string, number>,
) {
  return Object.keys(targetWeights).reduce(
    (sum, symbol) => sum + Math.abs((currentWeights[symbol] ?? 0) - (targetWeights[symbol] ?? 0)),
    0,
  );
}

export function transactionCostPct(turnover: number, bps: number) {
  return turnover * (bps / 10_000);
}
