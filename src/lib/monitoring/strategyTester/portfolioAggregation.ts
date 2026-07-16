import type {
  MonitoringMvaTrade,
  MonitoringStrategyPortfolioMode,
  MonitoringStrategyPortfolioResult,
  MonitoringStrategyTestResult,
} from "@/lib/monitoring/strategyTester/types";

type AggregateOptions = {
  portfolioMode?: MonitoringStrategyPortfolioMode;
  weights?: Record<string, number> | null;
  fromDate?: string | null;
};

type PortfolioTradeRow = NonNullable<MonitoringStrategyPortfolioResult["rawTrades"]>[number];
type CurvePoint = { date: string; cumulativeReturnPct: number };
type ClosedTrade = {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  exitReason: string | null;
  quantity: number;
  grossPnl: number;
  netPnl: number;
  commissionCost: number;
  spreadCost: number;
  slippageCost: number;
  financingCost: number;
  holdingBars: number | null;
  rMultiple: number | null;
};

const PORTFOLIO_INITIAL_CAPITAL = 1_000_000;
const DAYS_PER_YEAR = 252;
const DAY_MS = 24 * 60 * 60 * 1000;

function safeNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeDate(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 10) : null;
}

function parseDateKey(date: string): number {
  const ts = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ts) ? ts : 0;
}

function yearsBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const startMs = parseDateKey(start);
  const endMs = parseDateKey(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return (endMs - startMs) / (365.25 * DAY_MS);
}

function normalizeWeights(symbols: string[], explicitWeights?: Record<string, number> | null): Record<string, number> {
  if (!symbols.length) return {};
  const base = explicitWeights ?? {};
  const positiveWeights = symbols
    .map((symbol) => [symbol, safeNumber(base[symbol], 0)] as const)
    .filter(([, value]) => value > 0);

  if (!positiveWeights.length) {
    const equalWeight = 1 / symbols.length;
    return Object.fromEntries(symbols.map((symbol) => [symbol, equalWeight]));
  }

  const sum = positiveWeights.reduce((acc, [, value]) => acc + value, 0);
  if (sum <= 0) {
    const equalWeight = 1 / symbols.length;
    return Object.fromEntries(symbols.map((symbol) => [symbol, equalWeight]));
  }

  return Object.fromEntries(positiveWeights.map(([symbol, value]) => [symbol, value / sum]));
}

function tradeReturnPctFromRaw(direction: "LONG" | "SHORT", entryPrice: number, exitPrice: number): number | null {
  if (entryPrice <= 0 || !Number.isFinite(exitPrice)) return null;
  const move = direction === "LONG"
    ? ((exitPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - exitPrice) / entryPrice) * 100;
  return Number.isFinite(move) ? move : null;
}

function estimateHoldingBars(entryTime: string, exitTime: string): number | null {
  const entry = Date.parse(entryTime);
  const exit = Date.parse(exitTime);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || exit < entry) return null;
  return Math.max(1, Math.round((exit - entry) / DAY_MS));
}

function toClosedTrades(results: MonitoringStrategyTestResult[], weights: Record<string, number>, fromDate: string | null): ClosedTrade[] {
  return results
    .flatMap((result) => {
      const sleeveCapital = PORTFOLIO_INITIAL_CAPITAL * (weights[result.symbol] ?? 0);
      const assetInitialCapital = safeNumber(result.costSummary?.initialCapital ?? result.metrics.initialCapital, PORTFOLIO_INITIAL_CAPITAL);
      return (result.rawTrades ?? [])
        .filter((trade) => trade.exitTime && trade.exitPrice != null)
        .filter((trade) => {
          const exitDate = normalizeDate(trade.exitTime);
          const entryDate = normalizeDate(trade.entryTime);
          return exitDate != null && entryDate != null && (!fromDate || (entryDate >= fromDate && exitDate >= fromDate));
        })
        .map((trade) => {
          const netReturnPct = safeNumber(trade.returnPct, Number.NaN);
          const grossReturnPct = safeNumber(trade.grossReturnPct, Number.NaN);
          const netPnl = Number.isFinite(netReturnPct)
            ? (netReturnPct / 100) * sleeveCapital
            : (safeNumber(trade.netPnl) / assetInitialCapital) * sleeveCapital;
          const grossPnl = Number.isFinite(grossReturnPct)
            ? (grossReturnPct / 100) * sleeveCapital
            : (safeNumber(trade.grossPnl) / assetInitialCapital) * sleeveCapital;
          const stopDistance = trade.stopLossPrice != null ? Math.abs(trade.entryPrice - trade.stopLossPrice) : 0;
          const pnlMove = trade.exitPrice != null
            ? trade.direction === "LONG"
              ? trade.exitPrice - trade.entryPrice
              : trade.entryPrice - trade.exitPrice
            : 0;
          const rMultiple = stopDistance > 0 ? pnlMove / stopDistance : null;
          return {
            symbol: trade.symbol,
            direction: trade.direction,
            entryTime: trade.entryTime,
            exitTime: trade.exitTime as string,
            entryPrice: trade.entryPrice,
            exitPrice: trade.exitPrice as number,
            stopLossPrice: trade.stopLossPrice ?? null,
            takeProfitPrice: trade.takeProfitPrice ?? null,
            exitReason: trade.exitReason ?? null,
            quantity: trade.quantity,
            grossPnl,
            netPnl,
            commissionCost: (safeNumber(trade.commissionCost) / assetInitialCapital) * sleeveCapital,
            spreadCost: (safeNumber(trade.spreadCost) / assetInitialCapital) * sleeveCapital,
            slippageCost: (safeNumber(trade.slippageCost) / assetInitialCapital) * sleeveCapital,
            financingCost: (safeNumber(trade.financingCost) / assetInitialCapital) * sleeveCapital,
            holdingBars: estimateHoldingBars(trade.entryTime, trade.exitTime as string),
            rMultiple: rMultiple != null && Number.isFinite(rMultiple) ? round(rMultiple, 3) : null,
          } satisfies ClosedTrade;
        });
    })
    .sort((left, right) => left.entryTime.localeCompare(right.entryTime));
}

function buildPortfolioTrades(trades: ClosedTrade[]): Array<MonitoringMvaTrade & { symbol: string }> {
  let cumulativePnl = 0;
  let cumulativeReturnPct = 0;
  return trades.map((trade, index) => {
    cumulativePnl += trade.netPnl;
    cumulativeReturnPct = (cumulativePnl / PORTFOLIO_INITIAL_CAPITAL) * 100;
    return {
      tradeNo: index + 1,
      direction: trade.direction,
      entryDate: trade.entryTime,
      exitDate: trade.exitTime,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      returnPct: round((trade.netPnl / PORTFOLIO_INITIAL_CAPITAL) * 100),
      pnlNet: round(trade.netPnl, 2),
      cumulativePnl: round(cumulativePnl, 2),
      cumulativeReturnPct: round(cumulativeReturnPct),
      symbol: trade.symbol,
    };
  });
}

function buildPortfolioTradeRows(trades: ClosedTrade[]): PortfolioTradeRow[] {
  return trades.map((trade, index) => ({
    key: `${trade.symbol}_${trade.entryTime}_${index}`,
    symbol: trade.symbol,
    direction: trade.direction,
    entryTime: trade.entryTime,
    entryPrice: trade.entryPrice,
    exitTime: trade.exitTime,
    exitPrice: trade.exitPrice,
    stopLossPrice: trade.stopLossPrice,
    takeProfitPrice: trade.takeProfitPrice,
    exitReason: trade.exitReason,
    quantity: trade.quantity,
    grossPnl: round(trade.grossPnl, 2),
    netPnl: round(trade.netPnl, 2),
    commissionCost: round(trade.commissionCost, 2),
    spreadCost: round(trade.spreadCost, 2),
    slippageCost: round(trade.slippageCost, 2),
    financingCost: round(trade.financingCost, 2),
    holdingBars: trade.holdingBars,
    rMultiple: trade.rMultiple,
  }));
}

function buildCurveFromDailyPnl(
  trades: ClosedTrade[],
  fromDate: string | null,
  mode: "gross" | "net",
): CurvePoint[] {
  if (!trades.length) return [];
  const dailyMap = new Map<string, number>();

  for (const trade of trades) {
    const exitDate = normalizeDate(trade.exitTime);
    if (!exitDate) continue;
    const value = mode === "gross" ? trade.grossPnl : trade.netPnl;
    dailyMap.set(exitDate, (dailyMap.get(exitDate) ?? 0) + value);
  }

  const orderedDates = Array.from(dailyMap.keys()).sort((left, right) => left.localeCompare(right));
  const startDate = fromDate ?? orderedDates[0];
  const endDate = orderedDates[orderedDates.length - 1];
  const startMs = parseDateKey(startDate);
  const endMs = parseDateKey(endDate);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];

  let cumulativePnl = 0;
  const curve: CurvePoint[] = [];
  for (let cursor = startMs; cursor <= endMs; cursor += DAY_MS) {
    const day = new Date(cursor).toISOString().slice(0, 10);
    cumulativePnl += dailyMap.get(day) ?? 0;
    curve.push({
      date: day,
      cumulativeReturnPct: round((cumulativePnl / PORTFOLIO_INITIAL_CAPITAL) * 100),
    });
  }
  return curve;
}

function buildDrawdownCurve(curve: CurvePoint[]): CurvePoint[] {
  if (!curve.length) return [];
  let runningPeak = PORTFOLIO_INITIAL_CAPITAL;
  return curve.map((point) => {
    const equity = PORTFOLIO_INITIAL_CAPITAL * (1 + safeNumber(point.cumulativeReturnPct) / 100);
    runningPeak = Math.max(runningPeak, equity);
    const drawdownPct = runningPeak > 0 ? ((equity / runningPeak) - 1) * 100 : 0;
    return {
      date: point.date,
      cumulativeReturnPct: round(drawdownPct),
    };
  });
}

function computeDailySharpe(curve: CurvePoint[]): number | null {
  if (curve.length < 2) return null;
  const dailyReturns: number[] = [];
  let previousEquity = PORTFOLIO_INITIAL_CAPITAL;
  for (const point of curve) {
    const equity = PORTFOLIO_INITIAL_CAPITAL * (1 + safeNumber(point.cumulativeReturnPct) / 100);
    if (previousEquity > 0) {
      dailyReturns.push((equity / previousEquity) - 1);
    }
    previousEquity = equity;
  }
  const cleanReturns = dailyReturns.slice(1).filter((value) => Number.isFinite(value));
  if (cleanReturns.length < 2) return null;
  const mean = cleanReturns.reduce((sum, value) => sum + value, 0) / cleanReturns.length;
  const variance = cleanReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (cleanReturns.length - 1);
  const stdev = Math.sqrt(Math.max(variance, 0));
  if (stdev <= 0) return null;
  return round((mean / stdev) * Math.sqrt(DAYS_PER_YEAR));
}

function computeExposurePct(trades: ClosedTrade[], weights: Record<string, number>): number | null {
  const bySymbol = new Map<string, ClosedTrade[]>();
  for (const trade of trades) {
    if (!bySymbol.has(trade.symbol)) bySymbol.set(trade.symbol, []);
    bySymbol.get(trade.symbol)?.push(trade);
  }

  const exposures = Array.from(bySymbol.entries()).map(([symbol, rows]) => {
    if (!rows.length) return { symbol, exposurePct: 0 };
    const start = normalizeDate(rows[0]?.entryTime);
    const end = normalizeDate(rows[rows.length - 1]?.exitTime);
    const totalDays = Math.max(1, Math.round(yearsBetween(start, end) * 365.25));
    const activeDays = new Set<string>();
    for (const trade of rows) {
      const entry = normalizeDate(trade.entryTime);
      const exit = normalizeDate(trade.exitTime);
      if (!entry || !exit) continue;
      const entryMs = parseDateKey(entry);
      const exitMs = parseDateKey(exit);
      if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs)) continue;
      for (let cursor = entryMs; cursor <= exitMs; cursor += DAY_MS) {
        activeDays.add(new Date(cursor).toISOString().slice(0, 10));
      }
    }
    return {
      symbol,
      exposurePct: totalDays > 0 ? (activeDays.size / totalDays) * 100 : 0,
    };
  });

  if (!exposures.length) return null;
  const weighted = exposures.reduce((sum, row) => sum + (weights[row.symbol] ?? 0) * row.exposurePct, 0);
  return round(weighted);
}

function computePositiveYears(curve: CurvePoint[]): number | null {
  if (!curve.length) return null;
  const lastByYear = new Map<string, number>();
  for (const point of curve) {
    lastByYear.set(point.date.slice(0, 4), safeNumber(point.cumulativeReturnPct));
  }
  const years = Array.from(lastByYear.keys()).sort();
  let previous = 0;
  let positive = 0;
  for (const year of years) {
    const current = safeNumber(lastByYear.get(year), previous);
    if (current - previous > 0) positive += 1;
    previous = current;
  }
  return positive;
}

export function aggregateStrategyResults(
  results: MonitoringStrategyTestResult[],
  options: AggregateOptions = {},
): MonitoringStrategyPortfolioResult {
  const selectedSymbols = results.map((result) => result.symbol);
  const weights = normalizeWeights(selectedSymbols, options.weights);
  const fromDate = options.fromDate ?? null;
  const closedTrades = toClosedTrades(results, weights, fromDate);
  const trades = buildPortfolioTrades(closedTrades);
  const rawTrades = buildPortfolioTradeRows(closedTrades);
  const equityCurve = buildCurveFromDailyPnl(closedTrades, fromDate, "net");
  const grossEquityCurve = buildCurveFromDailyPnl(closedTrades, fromDate, "gross");
  const drawdownCurve = buildDrawdownCurve(equityCurve);

  const netPnlValues = closedTrades.map((trade) => trade.netPnl);
  const wins = netPnlValues.filter((value) => value > 0);
  const losses = netPnlValues.filter((value) => value < 0);
  const totalTrades = rawTrades.length;
  const longTrades = rawTrades.filter((trade) => trade.direction === "LONG").length;
  const shortTrades = rawTrades.filter((trade) => trade.direction === "SHORT").length;
  const grossReturnPct = grossEquityCurve.at(-1)?.cumulativeReturnPct ?? 0;
  const netReturnPct = equityCurve.at(-1)?.cumulativeReturnPct ?? 0;
  const startDate = equityCurve[0]?.date ?? null;
  const endDate = equityCurve.at(-1)?.date ?? null;
  const years = yearsBetween(startDate, endDate);
  const cagr = years > 0
    ? (Math.pow(1 + (netReturnPct / 100), 1 / years) - 1) * 100
    : null;
  const maxDrawdownPct = drawdownCurve.length
    ? Math.abs(Math.min(...drawdownCurve.map((point) => safeNumber(point.cumulativeReturnPct))))
    : 0;
  const avgTradePct = totalTrades
    ? (netPnlValues.reduce((sum, value) => sum + value, 0) / totalTrades / PORTFOLIO_INITIAL_CAPITAL) * 100
    : null;
  const avgWinPct = wins.length
    ? (wins.reduce((sum, value) => sum + value, 0) / wins.length / PORTFOLIO_INITIAL_CAPITAL) * 100
    : null;
  const avgLossPct = losses.length
    ? (losses.reduce((sum, value) => sum + value, 0) / losses.length / PORTFOLIO_INITIAL_CAPITAL) * 100
    : null;
  const profitFactor = losses.length
    ? wins.reduce((sum, value) => sum + value, 0) / Math.abs(losses.reduce((sum, value) => sum + value, 0))
    : wins.length
      ? Number.POSITIVE_INFINITY
      : null;
  const winratePct = totalTrades ? (wins.length / totalTrades) * 100 : null;
  const tradeReturns = netPnlValues.map((value) => value / PORTFOLIO_INITIAL_CAPITAL);
  const tradeMean = tradeReturns.length
    ? tradeReturns.reduce((sum, value) => sum + value, 0) / tradeReturns.length
    : 0;
  const tradeVariance = tradeReturns.length > 1
    ? tradeReturns.reduce((sum, value) => sum + (value - tradeMean) ** 2, 0) / (tradeReturns.length - 1)
    : 0;
  const tradeStd = Math.sqrt(Math.max(tradeVariance, 0));
  const tradeSharpe = tradeStd > 0 ? (tradeMean / tradeStd) * Math.sqrt(DAYS_PER_YEAR) : null;
  const dailySharpe = computeDailySharpe(equityCurve);
  const calmar = maxDrawdownPct > 0 && cagr != null ? cagr / maxDrawdownPct : cagr;
  const stopExits = rawTrades.filter((trade) => {
    const reason = String(trade.exitReason ?? "").toLowerCase();
    return ["stop_loss", "sl", "trailing_stop", "break_even"].includes(reason);
  }).length;
  const tpExits = rawTrades.filter((trade) => {
    const reason = String(trade.exitReason ?? "").toLowerCase();
    return ["take_profit", "tp"].includes(reason);
  }).length;
  const commissionCost = rawTrades.reduce((sum, trade) => sum + safeNumber(trade.commissionCost), 0);
  const spreadCost = rawTrades.reduce((sum, trade) => sum + safeNumber(trade.spreadCost), 0);
  const financingCost = rawTrades.reduce((sum, trade) => sum + safeNumber(trade.financingCost), 0);
  const slippageCost = rawTrades.reduce((sum, trade) => sum + safeNumber(trade.slippageCost), 0);

  return {
    selectedSymbols,
    portfolioMode: options.portfolioMode ?? (selectedSymbols.length <= 1 ? "single" : "selected_equal_weight"),
    weights,
    trades,
    rawTrades,
    equityCurve,
    grossEquityCurve,
    drawdownCurve,
    metrics: {
      grossReturnPct: round(grossReturnPct),
      netReturnPct: round(netReturnPct),
      cagr: cagr != null ? round(cagr) : null,
      maxDrawdownPct: round(maxDrawdownPct),
      profitFactor: profitFactor != null && Number.isFinite(profitFactor) ? round(profitFactor) : profitFactor,
      winratePct: winratePct != null ? round(winratePct) : null,
      tradeSharpe: tradeSharpe != null && Number.isFinite(tradeSharpe) ? round(tradeSharpe) : null,
      dailySharpe,
      calmar: calmar != null && Number.isFinite(calmar) ? round(calmar) : null,
      totalTrades,
      longTrades,
      shortTrades,
      wins: wins.length,
      losses: losses.length,
      avgTradePct: avgTradePct != null ? round(avgTradePct) : null,
      avgWinPct: avgWinPct != null ? round(avgWinPct) : null,
      avgLossPct: avgLossPct != null ? round(avgLossPct) : null,
      stopExitRate: totalTrades ? round((stopExits / totalTrades) * 100) : null,
      tpExitRate: totalTrades ? round((tpExits / totalTrades) * 100) : null,
      commissionCost: round(commissionCost, 2),
      spreadCost: round(spreadCost, 2),
      financingCost: round(financingCost, 2),
      slippageCost: round(slippageCost, 2),
      exposurePct: computeExposurePct(closedTrades, weights),
      positiveYears: computePositiveYears(equityCurve),
      startDate,
      endDate,
    },
  };
}
