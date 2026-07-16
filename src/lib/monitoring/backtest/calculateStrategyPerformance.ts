import type {
  MonitoringCandle,
  MonitoringStrategyEvent,
  MonitoringTrade,
  StrategyLongShortStats,
  StrategyPerformanceResult,
  StrategyRiskStats,
  StrategyTradeListRow,
  StrategyTradeStats,
} from "@/lib/monitoring/types";

type StrategyParamsInput = {
  pointvalue?: number | null;
  commission?: number | null;
  commissionPerTrade?: number | null;
  useComp?: boolean | null;
};

type CalculateInput = {
  candles: MonitoringCandle[];
  trades: MonitoringTrade[];
  events: MonitoringStrategyEvent[];
  strategyParams?: StrategyParamsInput | null;
  initialCapital?: number;
};

function toFinite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dayKey(value: string): string {
  return String(value).slice(0, 10);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-9999, Math.min(9999, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function barsBetween(candles: MonitoringCandle[], from: string, to: string): number {
  const fromKey = dayKey(from);
  const toKey = dayKey(to);
  if (!fromKey || !toKey) return 0;
  const ordered = candles.map((x) => dayKey(x.time));
  const a = ordered.findIndex((d) => d === fromKey);
  const b = ordered.findIndex((d) => d === toKey);
  if (a < 0 || b < 0) return 0;
  return Math.max(1, b - a + 1);
}

function daysBetweenStr(a: string, b: string): number {
  const da = new Date(dayKey(a));
  const db = new Date(dayKey(b));
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  return Math.abs((db.getTime() - da.getTime()) / 86_400_000);
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Find top N local drawdown troughs (worst isolated dips). */
function topNDrawdowns(ddCurve: { value: number }[], n: number): number[] {
  if (!ddCurve.length) return [];
  const troughs: number[] = [];
  let inTrough = false;
  let minVal = 0;
  for (let i = 0; i < ddCurve.length; i++) {
    const v = ddCurve[i].value;
    if (v < 0) {
      inTrough = true;
      if (v < minVal) minVal = v;
    } else if (inTrough) {
      troughs.push(minVal);
      minVal = 0;
      inTrough = false;
    }
  }
  if (inTrough && minVal < 0) troughs.push(minVal);
  return troughs
    .sort((a, b) => a - b)
    .slice(0, n)
    .map((v) => round2(Math.abs(v)));
}

function safeReturn(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Prevent impossible collapse below -100% in compounded mode.
  return Math.max(-0.9999, value);
}

export function calculateStrategyPerformance({
  candles,
  trades,
  events,
  strategyParams,
  initialCapital = 100,
}: CalculateInput): StrategyPerformanceResult {
  const usedPointValue = toFinite(strategyParams?.pointvalue, 1);
  const commissionPerTrade = toFinite(strategyParams?.commissionPerTrade ?? strategyParams?.commission, 0);
  const useComp = strategyParams?.useComp === true;
  const pointValue = usedPointValue > 0 ? usedPointValue : 1;
  const positionSizingFallback = !(strategyParams?.pointvalue && toFinite(strategyParams.pointvalue, 0) > 0);

  const sortedTrades = [...trades]
    .filter((t) => t && t.entryTime && t.exitTime)
    .sort((a, b) => String(a.entryTime).localeCompare(String(b.entryTime)));
  const latestClose = toFinite(candles[candles.length - 1]?.close, 0);

  // Legacy money P/L stays available for table/debug, KPI logic uses return-based equity.
  let moneyPnlTotal = 0;
  let moneyLongPnl = 0;
  let moneyShortPnl = 0;

  let returnSum = 0;
  let compoundedEquityFactor = 1;
  let peakEquityFactor = 1;

  let grossProfitReturn = 0;
  let grossLossReturn = 0;
  let longReturnSum = 0;
  let shortReturnSum = 0;
  let wins = 0;
  let losses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let totalBarsInTrades = 0;
  let totalExposureBars = 0;

  const tradeList: StrategyTradeListRow[] = [];
  const equityCurve: Array<{ time: string; value: number }> = [
    { time: candles[0]?.time ?? sortedTrades[0]?.entryTime ?? new Date().toISOString(), value: 0 },
  ];

  for (let i = 0; i < sortedTrades.length; i += 1) {
    const trade = sortedTrades[i];
    const entry = toFinite(trade.entry, 0);
    const exit = toFinite(trade.exit, 0);
    if (entry <= 0 || exit <= 0) continue;

    const directionMult = trade.direction === "long" ? 1 : -1;
    const qty = Math.max(1, toFinite(trade.quantity, 1));

    const grossPoints = (exit - entry) * directionMult;
    const grossMoneyPnl = grossPoints * pointValue * qty;
    const netMoneyPnl = grossMoneyPnl - commissionPerTrade;

    // Per-trade return baseline: entry price + direction, as requested.
    const grossReturn = (grossPoints / entry);
    const notional = entry * pointValue * qty;
    const commissionReturn = notional > 0 ? (commissionPerTrade / notional) : 0;
    const tradeReturn = safeReturn(grossReturn - commissionReturn);
    const tradeReturnPct = tradeReturn * 100;

    moneyPnlTotal += netMoneyPnl;
    if (trade.direction === "long") moneyLongPnl += netMoneyPnl;
    else moneyShortPnl += netMoneyPnl;

    returnSum += tradeReturn;
    if (useComp) {
      compoundedEquityFactor *= (1 + tradeReturn);
      if (!Number.isFinite(compoundedEquityFactor) || compoundedEquityFactor <= 0) {
        compoundedEquityFactor = 0.0001;
      }
    }

    const currentEquityFactor = useComp ? compoundedEquityFactor : (1 + returnSum);
    if (currentEquityFactor > peakEquityFactor) peakEquityFactor = currentEquityFactor;

    if (tradeReturn >= 0) {
      wins += 1;
      grossProfitReturn += tradeReturn;
      consecutiveWins += 1;
      consecutiveLosses = 0;
      if (consecutiveWins > maxConsecutiveWins) maxConsecutiveWins = consecutiveWins;
    } else {
      losses += 1;
      grossLossReturn += Math.abs(tradeReturn);
      consecutiveLosses += 1;
      consecutiveWins = 0;
      if (consecutiveLosses > maxConsecutiveLosses) maxConsecutiveLosses = consecutiveLosses;
    }

    if (trade.direction === "long") longReturnSum += tradeReturn;
    else shortReturnSum += tradeReturn;

    const bars = barsBetween(candles, trade.entryTime, trade.exitTime);
    totalBarsInTrades += bars;
    totalExposureBars += bars;

    tradeList.push({
      index: tradeList.length + 1,
      direction: trade.direction,
      entryDate: dayKey(trade.entryTime),
      exitDate: dayKey(trade.exitTime),
      entry: round2(entry),
      exit: round2(exit),
      pl: round2(netMoneyPnl),
      plPercent: round2(tradeReturnPct),
      bars,
      exitReason: String(trade.exitReason || "Exit"),
    });

    equityCurve.push({ time: trade.exitTime, value: round2((currentEquityFactor - 1) * 100) });
  }

  const totalTrades = tradeList.length;
  const totalReturnPercent = clampPercent((useComp ? (compoundedEquityFactor - 1) : returnSum) * 100);
  const netProfit = round2(totalReturnPercent);
  const winRatePercent = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor = grossLossReturn > 0 ? grossProfitReturn / grossLossReturn : grossProfitReturn > 0 ? 999 : 0;
  const avgTrade = totalTrades > 0 ? totalReturnPercent / totalTrades : 0;
  const bestTrade = tradeList.length ? Math.max(...tradeList.map((t) => t.plPercent)) : 0;
  const worstTrade = tradeList.length ? Math.min(...tradeList.map((t) => t.plPercent)) : 0;
  const longTrades = tradeList.filter((t) => t.direction === "long").length;
  const shortTrades = tradeList.filter((t) => t.direction === "short").length;

  const openTrades = trades.filter((t) => {
    const hasExitTime = String(t?.exitTime || "").trim().length > 0;
    const hasExitPrice = toFinite(t?.exit, 0) > 0;
    return !hasExitTime || !hasExitPrice;
  });
  const openPLRaw = openTrades.reduce((acc, trade) => {
    const entry = toFinite(trade.entry, 0);
    if (entry <= 0 || latestClose <= 0) return acc;
    const qty = Math.max(1, toFinite(trade.quantity, 1));
    const directionMult = trade.direction === "long" ? 1 : -1;
    const unrealizedPoints = (latestClose - entry) * directionMult;
    return acc + unrealizedPoints * pointValue * qty;
  }, 0);

  const longWins = tradeList.filter((t) => t.direction === "long" && t.plPercent > 0).length;
  const shortWins = tradeList.filter((t) => t.direction === "short" && t.plPercent > 0).length;
  const longWinRate = longTrades > 0 ? (longWins / longTrades) * 100 : 0;
  const shortWinRate = shortTrades > 0 ? (shortWins / shortTrades) * 100 : 0;

  const avgWinningTrade = wins > 0 ? (grossProfitReturn * 100) / wins : 0;
  const avgLosingTrade = losses > 0 ? -((grossLossReturn * 100) / losses) : 0;
  const avgWinLossRatio = avgLosingTrade !== 0 ? Math.abs(avgWinningTrade / avgLosingTrade) : 0;
  const largestWinningTrade = tradeList.length ? Math.max(...tradeList.map((t) => t.plPercent)) : 0;
  const largestLosingTrade = tradeList.length ? Math.min(...tradeList.map((t) => t.plPercent)) : 0;
  const avgBarsInTrade = totalTrades > 0 ? totalBarsInTrades / totalTrades : 0;
  const exposurePercent = candles.length > 0 ? (totalExposureBars / candles.length) * 100 : 0;
  const realizedRiskReward = Math.abs(avgLosingTrade) > 0 ? Math.abs(avgWinningTrade / avgLosingTrade) : 0;

  // Drawdown from return-equity, not money-vs-initial-capital.
  const drawdownCurve: Array<{ time: string; value: number }> = [];
  let rollingPeakFactor = Number.NEGATIVE_INFINITY;
  let maxDrawdownPercent = 0;
  for (const point of equityCurve) {
    const factor = 1 + toFinite(point.value, 0) / 100;
    if (factor > rollingPeakFactor) rollingPeakFactor = factor;
    const dd = rollingPeakFactor > 0 ? ((factor / rollingPeakFactor) - 1) * 100 : 0;
    const ddRounded = round2(Math.min(0, dd));
    drawdownCurve.push({ time: point.time, value: ddRounded });
    if (Math.abs(ddRounded) > maxDrawdownPercent) {
      maxDrawdownPercent = Math.abs(ddRounded);
    }
  }

  const negDDs = drawdownCurve.filter((p) => p.value < 0).map((p) => p.value);
  const avgDrawdownPercent = negDDs.length > 0 ? round2(negDDs.reduce((a, b) => a + b, 0) / negDDs.length) : 0;
  const top5DrawdownsPercent = topNDrawdowns(drawdownCurve, 5);

  const firstTime = sortedTrades[0]?.entryTime || candles[0]?.time || "";
  const lastTime = sortedTrades[sortedTrades.length - 1]?.exitTime || candles[candles.length - 1]?.time || "";
  const years = firstTime && lastTime ? daysBetweenStr(firstTime, lastTime) / 365.25 : 0;
  const totalReturnFactor = 1 + totalReturnPercent / 100;
  const cagr = years > 0.01 && totalReturnFactor > 0
    ? round2((Math.pow(totalReturnFactor, 1 / years) - 1) * 100)
    : round2(totalReturnPercent);

  const calmarRatio = maxDrawdownPercent > 0.01 ? round2(cagr / maxDrawdownPercent) : 0;

  const perTradeReturns = tradeList.map((t) => t.plPercent);
  const perTradeStd = stddev(perTradeReturns);
  const perTradeMean = totalTrades > 0 ? perTradeReturns.reduce((a, b) => a + b, 0) / totalTrades : 0;
  const tradesPerYear = avgBarsInTrade > 0 ? 250 / avgBarsInTrade : totalTrades;
  const sharpeRatio = perTradeStd > 0
    ? round2((perTradeMean / perTradeStd) * Math.sqrt(Math.max(1, tradesPerYear)))
    : 0;

  const expectancyPercent = totalTrades > 0 ? round2(totalReturnPercent / totalTrades) : 0;

  const summary = {
    netProfit: round2(netProfit),
    totalReturnPercent: round2(totalReturnPercent),
    maxDrawdownPercent: round2(maxDrawdownPercent),
    avgDrawdownPercent,
    top5DrawdownsPercent,
    winRatePercent: round2(winRatePercent),
    profitFactor: round2(profitFactor),
    totalTrades,
    avgTrade: round2(avgTrade),
    bestTrade: round2(bestTrade),
    worstTrade: round2(worstTrade),
    longTrades,
    shortTrades,
    openPL: round2(openPLRaw),
    grossProfit: round2(grossProfitReturn * 100),
    grossLoss: round2(grossLossReturn * 100),
    commissionPaid: round2(totalTrades * commissionPerTrade),
    cagr,
    calmarRatio,
    sharpeRatio,
    expectancyPercent,
  };

  const tradeStats: StrategyTradeStats = {
    totalClosedTrades: totalTrades,
    winningTrades: wins,
    losingTrades: losses,
    percentProfitable: round2(winRatePercent),
    avgTrade: round2(avgTrade),
    avgWinningTrade: round2(avgWinningTrade),
    avgLosingTrade: round2(avgLosingTrade),
    avgWinLossRatio: round2(avgWinLossRatio),
    largestWinningTrade: round2(largestWinningTrade),
    largestLosingTrade: round2(largestLosingTrade),
  };

  const longShortStats: StrategyLongShortStats = {
    longNetProfit: round2(longReturnSum * 100),
    shortNetProfit: round2(shortReturnSum * 100),
    longWinRate: round2(longWinRate),
    shortWinRate: round2(shortWinRate),
    longTrades,
    shortTrades,
  };

  const riskStats: StrategyRiskStats = {
    maxDrawdownPercent: round2(maxDrawdownPercent),
    maxConsecutiveWins,
    maxConsecutiveLosses,
    avgBarsInTrade: round2(avgBarsInTrade),
    exposurePercent: round2(exposurePercent),
    realizedRiskReward: round2(realizedRiskReward),
  };

  void events;

  return {
    summary,
    equityCurve: equityCurve.map((p) => ({ time: p.time, value: round2(p.value) })),
    drawdownCurve,
    tradeStats,
    longShortStats,
    riskStats,
    tradeList,
    debug: {
      positionSizingFallback,
      usedPointValue: pointValue,
      useCompounding: useComp,
      fixedBalance: !useComp,
      initialCapital,
    },
  };
}
