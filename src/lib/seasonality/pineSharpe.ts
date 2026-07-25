const TRADING_DAYS_PER_YEAR = 252;
const EPSILON = 1e-12;

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function pineArrayStdev(values: number[], biased = true): number | null {
  const count = values.length;
  if (count === 0) return null;

  const divisor = biased ? count : count - 1;
  if (divisor <= 0) return 0;

  const avg = mean(values);
  const variance = values.reduce((sum, value) => {
    const delta = value - avg;
    return sum + (delta * delta);
  }, 0) / divisor;

  return Math.sqrt(Math.max(variance, 0));
}

export function pineAnnualizedSharpe(strategyReturns: number[]): number | null {
  const count = strategyReturns.length;
  if (count < 2) return null;

  const avgReturn = mean(strategyReturns);
  const stdev = pineArrayStdev(strategyReturns, true);
  if (stdev == null || stdev <= EPSILON) return null;

  return (avgReturn / stdev) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}
