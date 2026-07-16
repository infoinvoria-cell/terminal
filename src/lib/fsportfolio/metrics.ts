import type { EquityPoint, PortfolioMetrics, ReturnPoint } from "@/lib/fsportfolio/types";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values: number[]) {
  const avg = mean(values);
  if (avg === null || values.length < 2) return null;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function annualizeFromDaily(meanDaily: number, periods = 252) {
  return (Math.pow(1 + meanDaily, periods) - 1) * 100;
}

export function computeDrawdownCurve(equityCurve: EquityPoint[]): ReturnPoint[] {
  let peak = -Infinity;
  return equityCurve.map((point) => {
    peak = Math.max(peak, point.value);
    const drawdown = peak > 0 ? ((point.value / peak) - 1) * 100 : 0;
    return { date: point.date, value: round2(drawdown) };
  });
}

export function aggregateReturns(
  returnsByDate: Record<string, number>,
  bucket: "month" | "year",
): ReturnPoint[] {
  const grouped = new Map<string, number[]>();
  for (const [date, value] of Object.entries(returnsByDate)) {
    const key = bucket === "month" ? date.slice(0, 7) : date.slice(0, 4);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(value);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      date,
      value: round2((values.reduce((acc, current) => acc * (1 + current), 1) - 1) * 100),
    }));
}

export function computeRollingWindow(
  points: ReturnPoint[],
  windowSize: number,
  kind: "return" | "volatility",
): ReturnPoint[] {
  const result: ReturnPoint[] = [];
  for (let index = windowSize - 1; index < points.length; index += 1) {
    const window = points.slice(index - windowSize + 1, index + 1).map((point) => point.value / 100);
    if (kind === "return") {
      result.push({
        date: points[index]!.date,
        value: round2((window.reduce((acc, current) => acc * (1 + current), 1) - 1) * 100),
      });
    } else {
      const sigma = stdev(window);
      result.push({
        date: points[index]!.date,
        value: sigma === null ? 0 : round2(sigma * Math.sqrt(12) * 100),
      });
    }
  }
  return result;
}

export function computeRollingCorrelation(
  left: ReturnPoint[],
  right: ReturnPoint[],
  windowSize: number,
): ReturnPoint[] {
  const rightMap = new Map(right.map((point) => [point.date, point.value / 100]));
  const aligned = left
    .map((point) => ({
      date: point.date,
      left: point.value / 100,
      right: rightMap.get(point.date),
    }))
    .filter((point): point is { date: string; left: number; right: number } => point.right !== undefined);

  const result: ReturnPoint[] = [];
  for (let index = windowSize - 1; index < aligned.length; index += 1) {
    const window = aligned.slice(index - windowSize + 1, index + 1);
    const meanLeft = mean(window.map((point) => point.left));
    const meanRight = mean(window.map((point) => point.right));
    if (meanLeft === null || meanRight === null) continue;
    const numerator = window.reduce(
      (sum, point) => sum + (point.left - meanLeft) * (point.right - meanRight),
      0,
    );
    const denomLeft = Math.sqrt(window.reduce((sum, point) => sum + (point.left - meanLeft) ** 2, 0));
    const denomRight = Math.sqrt(window.reduce((sum, point) => sum + (point.right - meanRight) ** 2, 0));
    const correlation = denomLeft > 0 && denomRight > 0 ? numerator / (denomLeft * denomRight) : 0;
    result.push({ date: aligned[index]!.date, value: round2(correlation) });
  }
  return result;
}

export function computePortfolioMetrics(params: {
  initialCapital: number;
  equityCurve: EquityPoint[];
  dailyReturns: Record<string, number>;
  benchmarkDailyReturns: Record<string, number>;
  transactionCostAmount: number;
  turnoverPct: number | null;
}): PortfolioMetrics | null {
  const { initialCapital, equityCurve, dailyReturns, benchmarkDailyReturns, transactionCostAmount, turnoverPct } = params;
  if (equityCurve.length < 2) return null;

  const endValue = equityCurve.at(-1)!.value;
  const totalReturnPct = ((endValue / initialCapital) - 1) * 100;
  const startDate = new Date(`${equityCurve[0]!.date}T00:00:00Z`);
  const endDate = new Date(`${equityCurve.at(-1)!.date}T00:00:00Z`);
  const years = Math.max(1 / 365, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  const cagrPct = (Math.pow(endValue / initialCapital, 1 / years) - 1) * 100;

  const daily = Object.values(dailyReturns);
  const avgDaily = mean(daily) ?? 0;
  const sigmaDaily = stdev(daily) ?? 0;
  const annualizedVolatilityPct = sigmaDaily * Math.sqrt(252) * 100;
  const drawdownCurve = computeDrawdownCurve(equityCurve);
  const maxDrawdownPct = Math.min(...drawdownCurve.map((point) => point.value), 0);
  const sharpe = sigmaDaily > 0 ? (avgDaily / sigmaDaily) * Math.sqrt(252) : 0;

  const downside = daily.filter((value) => value < 0);
  const downsideSigma = stdev(downside) ?? 0;
  const sortino = downsideSigma > 0 ? (avgDaily / downsideSigma) * Math.sqrt(252) : null;
  const calmar = maxDrawdownPct < 0 ? cagrPct / Math.abs(maxDrawdownPct) : null;

  const monthly = aggregateReturns(dailyReturns, "month");
  const annual = aggregateReturns(dailyReturns, "year");
  const worstMonthPct = monthly.length ? Math.min(...monthly.map((item) => item.value)) : null;
  const worstYearPct = annual.length ? Math.min(...annual.map((item) => item.value)) : null;
  const positiveMonthsPct = monthly.length ? (monthly.filter((item) => item.value > 0).length / monthly.length) * 100 : null;
  const positiveYearsPct = annual.length ? (annual.filter((item) => item.value > 0).length / annual.length) * 100 : null;

  const benchmarkMap = new Map(Object.entries(benchmarkDailyReturns));
  const aligned = Object.entries(dailyReturns)
    .map(([date, value]) => ({ portfolio: value, benchmark: benchmarkMap.get(date) }))
    .filter((row): row is { portfolio: number; benchmark: number } => row.benchmark !== undefined);
  const correlationToSpy = (() => {
    if (aligned.length < 2) return null;
    const pMean = mean(aligned.map((row) => row.portfolio)) ?? 0;
    const bMean = mean(aligned.map((row) => row.benchmark)) ?? 0;
    const num = aligned.reduce((sum, row) => sum + (row.portfolio - pMean) * (row.benchmark - bMean), 0);
    const pVar = aligned.reduce((sum, row) => sum + (row.portfolio - pMean) ** 2, 0);
    const bVar = aligned.reduce((sum, row) => sum + (row.benchmark - bMean) ** 2, 0);
    if (pVar <= 0 || bVar <= 0) return null;
    return num / Math.sqrt(pVar * bVar);
  })();
  const betaToSpy = (() => {
    if (aligned.length < 2) return null;
    const pMean = mean(aligned.map((row) => row.portfolio)) ?? 0;
    const bMean = mean(aligned.map((row) => row.benchmark)) ?? 0;
    const covariance = aligned.reduce((sum, row) => sum + (row.portfolio - pMean) * (row.benchmark - bMean), 0) / (aligned.length - 1);
    const variance = aligned.reduce((sum, row) => sum + (row.benchmark - bMean) ** 2, 0) / (aligned.length - 1);
    return variance > 0 ? covariance / variance : null;
  })();
  const upsideCapturePct = (() => {
    const positive = aligned.filter((row) => row.benchmark > 0);
    if (!positive.length) return null;
    const p = positive.reduce((acc, row) => acc * (1 + row.portfolio), 1) - 1;
    const b = positive.reduce((acc, row) => acc * (1 + row.benchmark), 1) - 1;
    return b !== 0 ? (p / b) * 100 : null;
  })();
  const downsideCapturePct = (() => {
    const negative = aligned.filter((row) => row.benchmark < 0);
    if (!negative.length) return null;
    const p = negative.reduce((acc, row) => acc * (1 + row.portfolio), 1) - 1;
    const b = negative.reduce((acc, row) => acc * (1 + row.benchmark), 1) - 1;
    return b !== 0 ? (p / b) * 100 : null;
  })();

  const currentYear = equityCurve.at(-1)!.date.slice(0, 4);
  const ytdEntries = Object.entries(dailyReturns)
    .filter(([date]) => date.startsWith(currentYear))
    .map(([, value]) => value);
  const ytdReturnPct = ytdEntries.length
    ? (ytdEntries.reduce((acc, current) => acc * (1 + current), 1) - 1) * 100
    : null;

  return {
    totalReturnPct: round2(totalReturnPct),
    cagrPct: round2(cagrPct),
    annualizedVolatilityPct: round2(annualizedVolatilityPct),
    maxDrawdownPct: round2(maxDrawdownPct),
    sharpe: round2(sharpe),
    sortino: sortino === null ? null : round2(sortino),
    calmar: calmar === null ? null : round2(calmar),
    worstMonthPct: worstMonthPct === null ? null : round2(worstMonthPct),
    worstYearPct: worstYearPct === null ? null : round2(worstYearPct),
    positiveMonthsPct: positiveMonthsPct === null ? null : round2(positiveMonthsPct),
    positiveYearsPct: positiveYearsPct === null ? null : round2(positiveYearsPct),
    correlationToSpy: correlationToSpy === null ? null : round2(correlationToSpy),
    betaToSpy: betaToSpy === null ? null : round2(betaToSpy),
    upsideCapturePct: upsideCapturePct === null ? null : round2(upsideCapturePct),
    downsideCapturePct: downsideCapturePct === null ? null : round2(downsideCapturePct),
    turnoverPerYearPct: turnoverPct === null ? null : round2(turnoverPct),
    transactionCostPct: round2((transactionCostAmount / initialCapital) * 100),
    transactionCostAmount: round2(transactionCostAmount),
    ytdReturnPct: ytdReturnPct === null ? null : round2(ytdReturnPct),
  };
}
