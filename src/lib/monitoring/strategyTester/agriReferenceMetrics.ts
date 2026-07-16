import fs from "node:fs";
import path from "node:path";
import { csvParse } from "d3-dsv";
import type { AgriReferenceKpis } from "@/lib/monitoring/strategyTester/engines/macroValuation/types";
import { AGRI_DEFAULT_BACKTEST_START, AGRI_PORTFOLIO_INITIAL_CAPITAL } from "@/lib/monitoring/strategyTester/constants";

type ReferenceTradeRow = {
  asset: string;
  variantId: string;
  entryDate: string;
  exitDate: string;
  direction: "LONG" | "SHORT";
  entry: number;
  exit: number;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  exitReason: string | null;
  grossPnl: number;
  cost: number;
  netPnl: number;
  days: number | null;
};

type PortfolioPoint = { date: string; cumulativeReturnPct: number };

export type AgriReferenceAssetMetrics = {
  asset: string;
  trades: number;
  grossReturnPct: number;
  netReturnPct: number;
  cagrPct: number;
  maxDdPct: number;
  pf: number;
  winPct: number;
  tradeSharpe: number | null;
  tradeSortino: number | null;
  dailySharpe: number | null;
  calmar: number | null;
  avgR: number | null;
  stopRate: number | null;
  tpRate: number | null;
  positiveYears: number | null;
  start: string | null;
  end: string | null;
  initialCapital: number;
  commissionPct: number;
  spreadTicks: number;
  costDragPct: number;
  equityCurve: PortfolioPoint[];
  drawdownCurve: PortfolioPoint[];
};

export type AgriReferencePortfolioMetrics = {
  selectedSymbols: string[];
  metrics: {
    grossReturnPct: number;
    netReturnPct: number;
    cagr: number | null;
    maxDrawdownPct: number;
    profitFactor: number | null;
    winratePct: number | null;
    tradeSharpe: number | null;
    dailySharpe: number | null;
    calmar: number | null;
    totalTrades: number;
    longTrades: number;
    shortTrades: number;
    wins: number;
    losses: number;
    avgTradePct: number | null;
    avgWinPct: number | null;
    avgLossPct: number | null;
    stopExitRate: number | null;
    tpExitRate: number | null;
    costDragPct: number;
    positiveYears: number | null;
    startDate: string | null;
    endDate: string | null;
  };
  perAsset: Record<string, AgriReferenceAssetMetrics>;
  equityCurve: PortfolioPoint[];
  drawdownCurve: PortfolioPoint[];
};

const PROJECT_ROOT = path.join(process.cwd(), "..");
const REFERENCE_TRADES_PATH = path.join(PROJECT_ROOT, "workspace", "input", "agri_research", "agri_final_selected_trades.csv");
const REFERENCE_TRADES_PATH_V2 = path.join(PROJECT_ROOT, "workspace", "input", "agri_research", "agri_final_selected_trades_v2.csv");
const REFERENCE_PARAMS_PATH = path.join(PROJECT_ROOT, "workspace", "input", "agri_research", "agri_extracted_strategy_params_clean.csv");
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 252;

function getActiveTradesPath(): string {
  return fs.existsSync(REFERENCE_TRADES_PATH_V2) ? REFERENCE_TRADES_PATH_V2 : REFERENCE_TRADES_PATH;
}

let referenceTradesCache: ReferenceTradeRow[] | null = null;
let referenceTradesCachePath: string | null = null;
let initialCapitalCache: Map<string, number> | null = null;

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeAsset(value: string): string {
  return String(value ?? "").trim().toUpperCase().replace("!", "");
}

function normalizeDate(value: unknown): string | null {
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

function readCsv(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) return [];
  return csvParse(fs.readFileSync(filePath, "utf-8"));
}

function loadReferenceTrades(): ReferenceTradeRow[] {
  const activePath = getActiveTradesPath();
  if (referenceTradesCache && referenceTradesCachePath === activePath) return referenceTradesCache;
  referenceTradesCachePath = activePath;
  referenceTradesCache = readCsv(activePath).map((row) => ({
    asset: normalizeAsset(row.asset ?? ""),
    variantId: String(row.variant_id ?? "").trim(),
    entryDate: normalizeDate(row.entry_date) ?? "",
    exitDate: normalizeDate(row.exit_date) ?? "",
    direction: String(row.direction ?? "").trim().toUpperCase() === "SHORT" ? "SHORT" : "LONG",
    entry: safeNumber(row.entry),
    exit: safeNumber(row.exit),
    quantity: safeNumber(row.qty),
    stopLoss: row.sl ? safeNumber(row.sl) : null,
    takeProfit: row.tp ? safeNumber(row.tp) : null,
    exitReason: String(row.exit_reason ?? "").trim() || null,
    grossPnl: safeNumber(row.gross_pnl),
    cost: safeNumber(row.cost),
    netPnl: safeNumber(row.net_pnl),
    days: row.days ? safeNumber(row.days) : null,
  }));
  return referenceTradesCache;
}

function loadInitialCapitalMap(): Map<string, number> {
  if (initialCapitalCache) return initialCapitalCache;
  initialCapitalCache = new Map<string, number>();
  for (const row of readCsv(REFERENCE_PARAMS_PATH)) {
    const asset = normalizeAsset(row.asset ?? "");
    if (!asset) continue;
    initialCapitalCache.set(asset, safeNumber(row.initial_capital, AGRI_PORTFOLIO_INITIAL_CAPITAL));
  }
  return initialCapitalCache;
}

function getInitialCapital(asset: string): number {
  return loadInitialCapitalMap().get(normalizeAsset(asset)) ?? AGRI_PORTFOLIO_INITIAL_CAPITAL;
}

function filterTradesFromStart(trades: ReferenceTradeRow[], startDate: string | null): ReferenceTradeRow[] {
  if (!startDate) return trades.slice();
  return trades.filter((trade) => trade.entryDate >= startDate && trade.exitDate >= startDate);
}

function buildCurveFromDailyPnl(points: Array<{ date: string; grossPnl: number; netPnl: number }>, startDate: string, initialCapital: number, mode: "gross" | "net"): PortfolioPoint[] {
  if (!points.length) return [];
  const daily = new Map<string, number>();
  for (const point of points) {
    daily.set(point.date, (daily.get(point.date) ?? 0) + (mode === "gross" ? point.grossPnl : point.netPnl));
  }
  const orderedDates = Array.from(daily.keys()).sort((left, right) => left.localeCompare(right));
  const firstDate = startDate || (orderedDates[0] ?? "");
  const lastDate = orderedDates[orderedDates.length - 1] ?? firstDate;
  const startMs = parseDateKey(firstDate);
  const endMs = parseDateKey(lastDate);
  if (!firstDate || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];
  let cumulativePnl = 0;
  const curve: PortfolioPoint[] = [];
  for (let cursor = startMs; cursor <= endMs; cursor += DAY_MS) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    cumulativePnl += daily.get(date) ?? 0;
    curve.push({
      date,
      cumulativeReturnPct: round((cumulativePnl / initialCapital) * 100),
    });
  }
  return curve;
}

function buildDrawdownCurve(curve: PortfolioPoint[], initialCapital: number): PortfolioPoint[] {
  if (!curve.length) return [];
  let peak = initialCapital;
  return curve.map((point) => {
    const equity = initialCapital * (1 + safeNumber(point.cumulativeReturnPct) / 100);
    peak = Math.max(peak, equity);
    const drawdownPct = peak > 0 ? ((equity / peak) - 1) * 100 : 0;
    return { date: point.date, cumulativeReturnPct: round(drawdownPct) };
  });
}

function computeDailySharpe(curve: PortfolioPoint[], initialCapital: number): number | null {
  if (curve.length < 2) return null;
  const dailyReturns: number[] = [];
  let previousEquity = initialCapital;
  for (const point of curve) {
    const equity = initialCapital * (1 + safeNumber(point.cumulativeReturnPct) / 100);
    if (previousEquity > 0) dailyReturns.push((equity / previousEquity) - 1);
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

function computePositiveYears(curve: PortfolioPoint[]): number | null {
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

function sumPositive(values: number[]): number {
  return values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
}

function sumNegativeAbs(values: number[]): number {
  return Math.abs(values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
}

function computeTradeSortino(returns: number[]): number | null {
  const clean = returns.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const downside = clean.filter((value) => value < 0);
  if (!downside.length) return null;
  const downsideVariance = downside.reduce((sum, value) => sum + value ** 2, 0) / downside.length;
  const downsideDeviation = Math.sqrt(Math.max(downsideVariance, 0));
  if (downsideDeviation <= 0) return null;
  return round((mean / downsideDeviation) * Math.sqrt(DAYS_PER_YEAR));
}

function computeAverageR(trades: ReferenceTradeRow[]): number | null {
  const rValues = trades
    .map((trade) => {
      if (trade.stopLoss == null || !Number.isFinite(trade.stopLoss) || !Number.isFinite(trade.entry) || !Number.isFinite(trade.quantity)) {
        return null;
      }
      const riskPerUnit = Math.abs(trade.entry - trade.stopLoss);
      const totalRisk = riskPerUnit * Math.abs(trade.quantity);
      if (!(totalRisk > 0)) return null;
      return trade.netPnl / totalRisk;
    })
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (!rValues.length) return null;
  return round(rValues.reduce((sum, value) => sum + value, 0) / rValues.length);
}

export function getAgriReferenceTradesForAsset(symbol: string, startDate: string | null = AGRI_DEFAULT_BACKTEST_START): ReferenceTradeRow[] {
  const asset = normalizeAsset(symbol);
  return filterTradesFromStart(loadReferenceTrades().filter((trade) => trade.asset === asset), startDate);
}

export function computeAgriReferenceAssetMetrics(symbol: string, startDate: string | null = AGRI_DEFAULT_BACKTEST_START): AgriReferenceAssetMetrics | null {
  const asset = normalizeAsset(symbol);
  const trades = getAgriReferenceTradesForAsset(asset, startDate);
  if (!trades.length) return null;
  const initialCapital = getInitialCapital(asset);
  const netPnlValues = trades.map((trade) => trade.netPnl);
  const grossPnlValues = trades.map((trade) => trade.grossPnl);
  const totalNetPnl = netPnlValues.reduce((sum, value) => sum + value, 0);
  const totalGrossPnl = grossPnlValues.reduce((sum, value) => sum + value, 0);
  const equityCurve = buildCurveFromDailyPnl(
    trades.map((trade) => ({ date: trade.exitDate, grossPnl: trade.grossPnl, netPnl: trade.netPnl })),
    startDate ?? trades[0]?.exitDate ?? trades[0]?.entryDate ?? "",
    initialCapital,
    "net",
  );
  const drawdownCurve = buildDrawdownCurve(equityCurve, initialCapital);
  const winPnl = sumPositive(netPnlValues);
  const lossPnlAbs = sumNegativeAbs(netPnlValues);
  const tradeReturns = netPnlValues.map((value) => value / initialCapital);
  const tradeMean = tradeReturns.reduce((sum, value) => sum + value, 0) / tradeReturns.length;
  const tradeVariance = tradeReturns.length > 1
    ? tradeReturns.reduce((sum, value) => sum + (value - tradeMean) ** 2, 0) / (tradeReturns.length - 1)
    : 0;
  const tradeStd = Math.sqrt(Math.max(tradeVariance, 0));
  const tradeSortino = computeTradeSortino(tradeReturns);
  const wins = netPnlValues.filter((value) => value > 0);
  const losses = netPnlValues.filter((value) => value < 0);
  const stopExits = trades.filter((trade) => {
    const reason = String(trade.exitReason ?? "").toLowerCase();
    return ["sl", "stop_loss", "trailing_stop", "break_even"].includes(reason);
  }).length;
  const tpExits = trades.filter((trade) => {
    const reason = String(trade.exitReason ?? "").toLowerCase();
    return ["tp", "take_profit"].includes(reason);
  }).length;
  const effectiveStart = startDate ?? trades[0]?.entryDate ?? trades[0]?.exitDate ?? "";
  const start = trades[0]?.entryDate ?? effectiveStart;
  const end = trades[trades.length - 1]?.exitDate ?? start;
  const cagrPct = (() => {
    const years = yearsBetween(effectiveStart, end);
    const endingEquity = initialCapital + totalNetPnl;
    if (years <= 0 || endingEquity <= 0 || initialCapital <= 0) return 0;
    return (Math.pow(endingEquity / initialCapital, 1 / years) - 1) * 100;
  })();
  const maxDdPct = Math.abs(Math.min(...drawdownCurve.map((point) => safeNumber(point.cumulativeReturnPct)), 0));
  const dailySharpe = computeDailySharpe(equityCurve, initialCapital);
  const tradeSharpe = tradeStd > 0 ? round((tradeMean / tradeStd) * Math.sqrt(DAYS_PER_YEAR)) : null;
  const calmar = maxDdPct > 0 ? round(cagrPct / maxDdPct) : null;

  return {
    asset,
    trades: trades.length,
    grossReturnPct: round((totalGrossPnl / initialCapital) * 100),
    netReturnPct: round((totalNetPnl / initialCapital) * 100),
    cagrPct: round(cagrPct),
    maxDdPct: round(maxDdPct),
    pf: lossPnlAbs > 0 ? round(winPnl / lossPnlAbs, 3) : winPnl > 0 ? Number.POSITIVE_INFINITY : 0,
    winPct: trades.length ? round((wins.length / trades.length) * 100) : 0,
    tradeSharpe,
    tradeSortino,
    dailySharpe,
    calmar,
    avgR: computeAverageR(trades),
    stopRate: trades.length ? round((stopExits / trades.length) * 100) : null,
    tpRate: trades.length ? round((tpExits / trades.length) * 100) : null,
    positiveYears: computePositiveYears(equityCurve),
    start,
    end,
    initialCapital,
    commissionPct: 0.01,
    spreadTicks: 1,
    costDragPct: round((trades.reduce((sum, trade) => sum + trade.cost, 0) / initialCapital) * 100),
    equityCurve,
    drawdownCurve,
  };
}

export function loadAgriReferenceKpisFromTrades(symbol: string, startDate: string | null = AGRI_DEFAULT_BACKTEST_START): AgriReferenceKpis | null {
  const metrics = computeAgriReferenceAssetMetrics(symbol, startDate);
  if (!metrics) return null;
  return {
    asset: metrics.asset,
    trades: metrics.trades,
    returnPct: metrics.netReturnPct,
    cagrPct: metrics.cagrPct,
    maxDdPct: metrics.maxDdPct,
    pf: metrics.pf,
    winPct: metrics.winPct,
    sharpe: metrics.tradeSharpe ?? 0,
    sortino: metrics.tradeSortino,
    stopRate: metrics.stopRate ?? 0,
    tpRate: metrics.tpRate ?? 0,
    avgR: metrics.avgR,
    start: metrics.start ?? startDate ?? "",
    end: metrics.end ?? startDate ?? metrics.start ?? "",
    initialCapital: metrics.initialCapital,
    spreadTicks: metrics.spreadTicks,
    commissionPct: metrics.commissionPct,
    strategyName: "Invoria Agri Macro Frozen",
    strategyStatus: "ACTIVE",
    oosSharpe: null,
    oosPValue: null,
  };
}

export function computeAgriReferencePortfolioMetrics(symbols: string[], startDate: string | null = AGRI_DEFAULT_BACKTEST_START): AgriReferencePortfolioMetrics {
  const normalizedSymbols = Array.from(new Set(symbols.map(normalizeAsset))).filter(Boolean);
  const sleeveWeight = normalizedSymbols.length ? 1 / normalizedSymbols.length : 0;
  const perAsset: Record<string, AgriReferenceAssetMetrics> = {};
  const scaledTrades = normalizedSymbols.flatMap((asset) => {
    const assetMetrics = computeAgriReferenceAssetMetrics(asset, startDate);
    if (assetMetrics) perAsset[`${asset}!`] = assetMetrics;
    const assetCapital = getInitialCapital(asset);
    return getAgriReferenceTradesForAsset(asset, startDate).map((trade) => ({
      asset: `${asset}!`,
      direction: trade.direction,
      entryDate: trade.entryDate,
      exitDate: trade.exitDate,
      grossPnl: (trade.grossPnl / assetCapital) * (AGRI_PORTFOLIO_INITIAL_CAPITAL * sleeveWeight),
      netPnl: (trade.netPnl / assetCapital) * (AGRI_PORTFOLIO_INITIAL_CAPITAL * sleeveWeight),
      cost: (trade.cost / assetCapital) * (AGRI_PORTFOLIO_INITIAL_CAPITAL * sleeveWeight),
      exitReason: trade.exitReason,
    }));
  }).sort((left, right) => left.entryDate.localeCompare(right.entryDate));

  const equityCurve = buildCurveFromDailyPnl(
    scaledTrades.map((trade) => ({ date: trade.exitDate, grossPnl: trade.grossPnl, netPnl: trade.netPnl })),
    startDate ?? scaledTrades[0]?.exitDate ?? scaledTrades[0]?.entryDate ?? "",
    AGRI_PORTFOLIO_INITIAL_CAPITAL,
    "net",
  );
  const grossEquityCurve = buildCurveFromDailyPnl(
    scaledTrades.map((trade) => ({ date: trade.exitDate, grossPnl: trade.grossPnl, netPnl: trade.netPnl })),
    startDate ?? scaledTrades[0]?.exitDate ?? scaledTrades[0]?.entryDate ?? "",
    AGRI_PORTFOLIO_INITIAL_CAPITAL,
    "gross",
  );
  const drawdownCurve = buildDrawdownCurve(equityCurve, AGRI_PORTFOLIO_INITIAL_CAPITAL);
  const netPnlValues = scaledTrades.map((trade) => trade.netPnl);
  const wins = netPnlValues.filter((value) => value > 0);
  const losses = netPnlValues.filter((value) => value < 0);
  const totalTrades = scaledTrades.length;
  const tradeReturns = netPnlValues.map((value) => value / AGRI_PORTFOLIO_INITIAL_CAPITAL);
  const tradeMean = tradeReturns.length ? tradeReturns.reduce((sum, value) => sum + value, 0) / tradeReturns.length : 0;
  const tradeVariance = tradeReturns.length > 1
    ? tradeReturns.reduce((sum, value) => sum + (value - tradeMean) ** 2, 0) / (tradeReturns.length - 1)
    : 0;
  const tradeStd = Math.sqrt(Math.max(tradeVariance, 0));
  const start = equityCurve[0]?.date ?? null;
  const end = equityCurve.at(-1)?.date ?? null;
  const effectiveStart = startDate ?? start ?? null;
  const years = yearsBetween(effectiveStart, end);
  const netReturnPct = equityCurve.at(-1)?.cumulativeReturnPct ?? 0;
  const cagr = years > 0 ? (Math.pow(1 + (netReturnPct / 100), 1 / years) - 1) * 100 : null;
  const maxDdPct = Math.abs(Math.min(...drawdownCurve.map((point) => safeNumber(point.cumulativeReturnPct)), 0));
  const stopExits = scaledTrades.filter((trade) => {
    const reason = String(trade.exitReason ?? "").toLowerCase();
    return ["sl", "stop_loss", "trailing_stop", "break_even"].includes(reason);
  }).length;
  const tpExits = scaledTrades.filter((trade) => {
    const reason = String(trade.exitReason ?? "").toLowerCase();
    return ["tp", "take_profit"].includes(reason);
  }).length;
  return {
    selectedSymbols: normalizedSymbols.map((asset) => `${asset}!`),
    metrics: {
      grossReturnPct: round(grossEquityCurve.at(-1)?.cumulativeReturnPct ?? 0),
      netReturnPct: round(netReturnPct),
      cagr: cagr != null ? round(cagr) : null,
      maxDrawdownPct: round(maxDdPct),
      profitFactor: sumNegativeAbs(netPnlValues) > 0 ? round(sumPositive(netPnlValues) / sumNegativeAbs(netPnlValues), 3) : wins.length ? Number.POSITIVE_INFINITY : null,
      winratePct: totalTrades ? round((wins.length / totalTrades) * 100) : null,
      tradeSharpe: tradeStd > 0 ? round((tradeMean / tradeStd) * Math.sqrt(DAYS_PER_YEAR)) : null,
      dailySharpe: computeDailySharpe(equityCurve, AGRI_PORTFOLIO_INITIAL_CAPITAL),
      calmar: cagr != null && maxDdPct > 0 ? round(cagr / maxDdPct) : null,
      totalTrades,
      longTrades: scaledTrades.filter((trade) => trade.direction === "LONG").length,
      shortTrades: scaledTrades.filter((trade) => trade.direction === "SHORT").length,
      wins: wins.length,
      losses: losses.length,
      avgTradePct: totalTrades ? round((netPnlValues.reduce((sum, value) => sum + value, 0) / totalTrades / AGRI_PORTFOLIO_INITIAL_CAPITAL) * 100) : null,
      avgWinPct: wins.length ? round((wins.reduce((sum, value) => sum + value, 0) / wins.length / AGRI_PORTFOLIO_INITIAL_CAPITAL) * 100) : null,
      avgLossPct: losses.length ? round((losses.reduce((sum, value) => sum + value, 0) / losses.length / AGRI_PORTFOLIO_INITIAL_CAPITAL) * 100) : null,
      stopExitRate: totalTrades ? round((stopExits / totalTrades) * 100) : null,
      tpExitRate: totalTrades ? round((tpExits / totalTrades) * 100) : null,
      costDragPct: round((scaledTrades.reduce((sum, trade) => sum + trade.cost, 0) / AGRI_PORTFOLIO_INITIAL_CAPITAL) * 100),
      positiveYears: computePositiveYears(equityCurve),
      startDate: start,
      endDate: end,
    },
    perAsset,
    equityCurve,
    drawdownCurve,
  };
}
