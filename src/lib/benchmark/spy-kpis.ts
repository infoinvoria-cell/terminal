import type { SpyDailyReturn } from "./spy-data";

export type SpyBenchmarkKpis = {
  totalReturnPct: number;
  annualizedReturnPct: number;
  maxDrawdownPct: number; // absolute value (positive number)
  sharpe: number;
  calmar: number;
  posMonths: number;
  totalMonths: number;
  volatilityPct: number; // annualized daily std × √252, as percentage
};

export function computeSpyKpis(
  spyDailyReturns: SpyDailyReturn[],
  startDate: string,
  endDate: string
): SpyBenchmarkKpis | null {
  const filtered = spyDailyReturns.filter(
    (r) => r.date >= startDate && r.date <= endDate
  );
  if (filtered.length < 5) return null;

  // Build equity curve (starting at 1.0)
  let equity = 1.0;
  let peak = 1.0;
  let maxDD = 0;
  const dailyReturns: number[] = [];

  for (const { returnPct } of filtered) {
    const r = returnPct / 100;
    equity *= 1 + r;
    dailyReturns.push(r);
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  const totalReturnPct = (equity - 1) * 100;

  // Calendar days for annualization
  const calDays =
    (new Date(filtered[filtered.length - 1].date).getTime() -
      new Date(filtered[0].date).getTime()) /
    86_400_000;
  const years = calDays / 365.25;
  const annualizedReturnPct =
    years > 0 ? (Math.pow(equity, 1 / years) - 1) * 100 : 0;
  const maxDrawdownPct = maxDD * 100;

  // Sharpe: annualized mean / annualized std of daily returns
  const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length;
  const dailyStd = Math.sqrt(variance);
  const annualizedStd = dailyStd * Math.sqrt(252);
  const annualizedMean = mean * 252;
  const sharpe = annualizedStd > 0 ? annualizedMean / annualizedStd : 0;

  const calmar =
    maxDrawdownPct > 0 ? annualizedReturnPct / maxDrawdownPct : 0;

  // Positive months
  const monthMap = new Map<string, number[]>();
  for (const { date, returnPct } of filtered) {
    const key = date.slice(0, 7);
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(returnPct);
  }
  let posMonths = 0;
  let totalMonths = 0;
  for (const returns of monthMap.values()) {
    const monthReturn = returns.reduce((acc, r) => acc * (1 + r / 100), 1) - 1;
    totalMonths++;
    if (monthReturn >= 0) posMonths++;
  }

  return {
    totalReturnPct: parseFloat(totalReturnPct.toFixed(2)),
    annualizedReturnPct: parseFloat(annualizedReturnPct.toFixed(2)),
    maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
    sharpe: parseFloat(sharpe.toFixed(2)),
    calmar: parseFloat(calmar.toFixed(2)),
    posMonths,
    totalMonths,
    volatilityPct: parseFloat((annualizedStd * 100).toFixed(2)),
  };
}
