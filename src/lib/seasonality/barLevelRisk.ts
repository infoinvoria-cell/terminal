import type { DailyBar } from "./walkForward/types";
import type { PatternDirection, PatternHolding } from "./patternSelection";
import {
  computeCagr,
  computeMaxDrawdown,
  computeCalmar,
  computeTradingViewCompatibleTradeReturns,
} from "./tradingViewMetrics";

export interface YearSlotBar {
  slot: number;
  date: string;
  close: number;
}

export interface YearSlotSeries {
  orderedBars: YearSlotBar[];
  barsBySlot: Map<number, YearSlotBar>;
}

export interface YearSlotLookup {
  yearMap: Map<number, YearSlotSeries>;
  years: number[];
}

export interface PatternTradePath {
  year: number;
  direction: PatternDirection;
  entrySlot: number;
  exitSlot: number;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  strategyReturn: number;
  barsDuringOpenPosition: YearSlotBar[];
}

export interface PatternTradeAuditMetrics {
  tradeCloseMaxDrawdown: number;
  tradeCloseCalmar: number | null;
}

export interface PatternTradeCollection {
  trades: PatternTradePath[];
  coveredYears: number[];
  missingYears: Array<{ year: number; reason: string }>;
  strategyReturns: number[];
  auditMetrics: PatternTradeAuditMetrics;
}

export interface BarLevelRiskMetrics {
  averageReturn: number;
  compoundReturn: number;
  cagr: number;
  maxDrawdown: number;
  calmar: number | null;
  endingEquity: number;
}

export function buildYearSlotLookup(
  allBars: DailyBar[],
  includedYears?: number[],
): YearSlotLookup {
  const sorted = [...allBars].sort((a, b) => a.date.localeCompare(b.date));
  const includeSet = includedYears ? new Set(includedYears) : null;

  const yearMap = new Map<number, YearSlotSeries>();
  let slot = 0;
  let previousYear = -1;

  for (const bar of sorted) {
    const year = Number(bar.date.slice(0, 4));
    if (includeSet && !includeSet.has(year)) {
      continue;
    }

    if (year !== previousYear) {
      slot = 0;
      previousYear = year;
    }

    slot += 1;
    if (slot > 252) {
      continue;
    }

    if (!yearMap.has(year)) {
      yearMap.set(year, { orderedBars: [], barsBySlot: new Map() });
    }

    const yearSeries = yearMap.get(year)!;
    const slotBar: YearSlotBar = { slot, date: bar.date, close: bar.close };
    yearSeries.orderedBars.push(slotBar);
    yearSeries.barsBySlot.set(slot, slotBar);
  }

  const years = includeSet
    ? [...includeSet].filter((year) => yearMap.has(year)).sort((a, b) => a - b)
    : Array.from(yearMap.keys()).sort((a, b) => a - b);

  return { yearMap, years };
}

export function getPatternTradeForYear(
  lookup: YearSlotLookup,
  year: number,
  startSlot: number,
  holdingDays: PatternHolding,
  direction: PatternDirection,
): { trade: PatternTradePath | null; missingReason: string | null } {
  const yearSeries = lookup.yearMap.get(year);
  const exitSlot = startSlot + holdingDays;
  if (!yearSeries) {
    return { trade: null, missingReason: "no_year_data" };
  }

  const entry = yearSeries.barsBySlot.get(startSlot);
  const exit = yearSeries.barsBySlot.get(exitSlot);

  if (!entry) {
    return { trade: null, missingReason: "missing_entry_bar" };
  }
  if (!exit) {
    return { trade: null, missingReason: `missing_exit_bar_slot_${exitSlot}` };
  }
  if (!Number.isFinite(entry.close) || entry.close <= 0) {
    return { trade: null, missingReason: "zero_entry_price" };
  }

  const barsDuringOpenPosition = yearSeries.orderedBars.slice(startSlot - 1, exitSlot);
  if (barsDuringOpenPosition.length === 0 || barsDuringOpenPosition[0]?.slot !== startSlot || barsDuringOpenPosition[barsDuringOpenPosition.length - 1]?.slot !== exitSlot) {
    return { trade: null, missingReason: `missing_open_position_bar_range_${startSlot}_${exitSlot}` };
  }

  const rawReturn = exit.close / entry.close - 1;
  const strategyReturn = direction === "LONG" ? rawReturn : -rawReturn;

  return {
    trade: {
      year,
      direction,
      entrySlot: startSlot,
      exitSlot,
      entryDate: entry.date,
      exitDate: exit.date,
      entryPrice: entry.close,
      exitPrice: exit.close,
      strategyReturn,
      barsDuringOpenPosition,
    },
    missingReason: null,
  };
}

export function buildPatternTradesFromLookup(
  lookup: YearSlotLookup,
  years: number[],
  startSlot: number,
  holdingDays: PatternHolding,
  direction: PatternDirection,
): PatternTradeCollection {
  const trades: PatternTradePath[] = [];
  const coveredYears: number[] = [];
  const missingYears: Array<{ year: number; reason: string }> = [];

  for (const year of years) {
    const { trade, missingReason } = getPatternTradeForYear(lookup, year, startSlot, holdingDays, direction);
    if (!trade) {
      missingYears.push({ year, reason: missingReason ?? "unknown_trade_error" });
      continue;
    }
    trades.push(trade);
    coveredYears.push(year);
  }

  const strategyReturns = computeTradingViewCompatibleTradeReturns(trades.map((trade) => trade.strategyReturn));
  return {
    trades,
    coveredYears,
    missingYears,
    strategyReturns,
    auditMetrics: {
      tradeCloseMaxDrawdown: computeMaxDrawdown(strategyReturns),
      tradeCloseCalmar: computeCalmar(strategyReturns),
    },
  };
}

function mtmReturnAtClose(trade: PatternTradePath, closePrice: number): number {
  if (trade.direction === "LONG") {
    return closePrice / trade.entryPrice - 1;
  }
  return (trade.entryPrice - closePrice) / trade.entryPrice;
}

export function computeBarLevelRiskMetricsFromTrades(trades: PatternTradePath[]): BarLevelRiskMetrics {
  const normalizedTrades = trades.filter((trade) => Number.isFinite(trade.strategyReturn));
  const strategyReturns = computeTradingViewCompatibleTradeReturns(normalizedTrades.map((trade) => trade.strategyReturn));
  const averageReturn = strategyReturns.length
    ? strategyReturns.reduce((sum, value) => sum + value, 0) / strategyReturns.length
    : 0;

  let realizedEquity = 1;
  let peakEquity = 1;
  let maxDrawdown = 0;

  for (const trade of normalizedTrades) {
    for (const bar of trade.barsDuringOpenPosition) {
      const equity = realizedEquity * (1 + mtmReturnAtClose(trade, bar.close));
      if (equity > peakEquity) {
        peakEquity = equity;
      } else if (peakEquity > 0) {
        maxDrawdown = Math.max(maxDrawdown, (peakEquity - equity) / peakEquity);
      }
    }
    realizedEquity *= 1 + trade.strategyReturn;
    if (realizedEquity > peakEquity) {
      peakEquity = realizedEquity;
    }
  }

  const compoundReturn = realizedEquity - 1;
  const cagr = computeCagr(strategyReturns);
  const calmar = maxDrawdown > 1e-12 ? cagr / Math.abs(maxDrawdown) : null;

  return {
    averageReturn,
    compoundReturn,
    cagr,
    maxDrawdown,
    calmar,
    endingEquity: realizedEquity,
  };
}
