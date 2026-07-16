/**
 * Agrar Seasonal Strategy Backtester
 *
 * Deterministic ATR-stop seasonal engine for Agrar V/S/M tester.
 * Reads OHLC from TradingView JSON cache and computes real trade results
 * from strategy rules in agri-v2-registry.ts.
 *
 * Paper-only. Safety Stop limits modeled risk — does not guarantee fills.
 * No live trading, no order execution.
 */

import fs from "node:fs";
import path from "node:path";
import type { AgriStrategyEntry } from "@/lib/agri/agri-v2-registry";
import type { MonitoringMvaMetrics, MonitoringMvaTrade } from "@/lib/monitoring/strategyTester/types";
import { computeMetrics, buildEquityCurve } from "@/lib/monitoring/strategyTester/engines/macroValuation/metrics";

export type SeasonalBacktestResult = {
  symbol: string;
  trades: MonitoringMvaTrade[];
  metrics: MonitoringMvaMetrics;
  equityCurve: Array<{ date: string; cumulativeReturnPct: number }>;
  strategyBreakdown: Array<{
    strategyId: string;
    tradeCount: number;
    netReturnPct: number;
    winratePct: number;
  }>;
  ohlcPath: string;
  ohlcRowCount: number;
  ohlcStart: string;
  ohlcEnd: string;
  backtestStart: string;
  backtestEnd: string;
};

type OhlcBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type StrategyTrade = {
  strategyId: string;
  direction: "LONG" | "SHORT";
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  stopLossPrice: number;
  exitReason: string;
  returnPct: number;
};

// Parse month/day from strategy ID: SEA_SAFE_{ASSET}_{DIR}_{MM}_{DD}_h{N}_s{N}p{N}_v1
function parseSeasonalRule(id: string): { month: number; day: number } | null {
  const m = id.match(/^SEA_SAFE_\w+?_(LONG|SHORT)_(\d{2})_(\d{2})_h/);
  if (!m) return null;
  return { month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
}

function computeAtr14(bars: OhlcBar[]): number[] {
  const period = 14;
  const atr: number[] = [];
  let prevClose = bars[0].close;
  const trueRanges: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr =
      i === 0
        ? b.high - b.low
        : Math.max(
            b.high - b.low,
            Math.abs(b.high - prevClose),
            Math.abs(b.low - prevClose),
          );
    trueRanges.push(tr);

    if (i < period - 1) {
      atr.push(trueRanges.reduce((a, x) => a + x, 0) / trueRanges.length);
    } else if (i === period - 1) {
      atr.push(trueRanges.reduce((a, x) => a + x, 0) / period);
    } else {
      atr.push((atr[i - 1] * (period - 1) + tr) / period);
    }
    prevClose = b.close;
  }
  return atr;
}

function findTriggerBarIdx(
  bars: OhlcBar[],
  year: number,
  month: number,
  day: number,
  startSearchIdx: number,
): number {
  const targetDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const yearEnd = `${year}-12-31`;
  for (let i = startSearchIdx; i < bars.length; i++) {
    if (bars[i].date >= targetDate && bars[i].date <= yearEnd) return i;
  }
  return -1;
}

function simulateTrade(
  bars: OhlcBar[],
  atr: number[],
  triggerIdx: number,
  strategy: AgriStrategyEntry,
): StrategyTrade | null {
  const entryIdx = triggerIdx + 1;
  if (entryIdx >= bars.length) return null;

  const atrAtTrigger = atr[triggerIdx];
  if (!atrAtTrigger || atrAtTrigger <= 0) return null;

  const slippage = 0.01 * atrAtTrigger;
  const holdingBars = strategy.holdingBars ?? 10;
  const atrStop = strategy.atrStopMultiplier ?? 1.5;
  const dir = strategy.direction;

  const entryBar = bars[entryIdx];
  const adjEntry =
    dir === "LONG" ? entryBar.open + slippage : entryBar.open - slippage;

  const stopPrice =
    dir === "LONG"
      ? adjEntry - atrStop * atrAtTrigger
      : adjEntry + atrStop * atrAtTrigger;

  const timeExitIdx = Math.min(entryIdx + holdingBars, bars.length - 1);

  // Simulate bars after entry
  for (let i = entryIdx + 1; i <= timeExitIdx; i++) {
    const bar = bars[i];
    if (dir === "LONG") {
      if (bar.open <= stopPrice) {
        return makeTradeRecord(strategy, entryBar.date, bar.date, adjEntry, bar.open, stopPrice, "gap_stop");
      }
      if (bar.low <= stopPrice) {
        return makeTradeRecord(strategy, entryBar.date, bar.date, adjEntry, stopPrice, stopPrice, "stop_loss");
      }
    } else {
      if (bar.open >= stopPrice) {
        return makeTradeRecord(strategy, entryBar.date, bar.date, adjEntry, bar.open, stopPrice, "gap_stop");
      }
      if (bar.high >= stopPrice) {
        return makeTradeRecord(strategy, entryBar.date, bar.date, adjEntry, stopPrice, stopPrice, "stop_loss");
      }
    }

    if (i === timeExitIdx) {
      const rawExit = bar.close;
      const adjExit = dir === "LONG" ? rawExit - slippage : rawExit + slippage;
      return makeTradeRecord(strategy, entryBar.date, bar.date, adjEntry, adjExit, stopPrice, "time_exit");
    }
  }

  // Edge: holding_bars = 0 or timeExitIdx == entryIdx
  const rawExit = entryBar.close;
  const adjExit = dir === "LONG" ? rawExit - slippage : rawExit + slippage;
  return makeTradeRecord(strategy, entryBar.date, entryBar.date, adjEntry, adjExit, stopPrice, "time_exit");
}

function makeTradeRecord(
  strategy: AgriStrategyEntry,
  entryDate: string,
  exitDate: string,
  entryPrice: number,
  exitPrice: number,
  stopLossPrice: number,
  exitReason: string,
): StrategyTrade {
  const dir: "LONG" | "SHORT" = strategy.direction === "SHORT" ? "SHORT" : "LONG";
  const returnPct =
    dir === "LONG"
      ? ((exitPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - exitPrice) / entryPrice) * 100;

  return {
    strategyId: strategy.id,
    direction: dir,
    entryDate,
    exitDate,
    entryPrice,
    exitPrice,
    stopLossPrice,
    exitReason,
    returnPct,
  };
}

function loadOhlcJson(exchange: string, symbol: string): { bars: OhlcBar[]; filePath: string } | null {
  const filename = `${exchange}_${symbol.replace("!", "")}_D.json`;
  const filePath = path.join(
    process.cwd(),
    "public",
    "generated",
    "monitoring",
    "tradingview_data_cache",
    "D",
    filename,
  );
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
      bars: Array<{ date: string; open: number; high: number; low: number; close: number }>;
    };
    if (!Array.isArray(raw.bars)) return null;
    const bars = raw.bars
      .filter((b) => b.date && b.open > 0 && b.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    return { bars, filePath };
  } catch {
    return null;
  }
}

export function runSeasonalBacktest(
  symbol: string,
  exchange: string,
  strategies: AgriStrategyEntry[],
  historyMode: "default_2000" | "full" = "default_2000",
): SeasonalBacktestResult | { error: string } {
  const seasonalStrategies = strategies.filter((s) => s.kind === "seasonal");
  if (seasonalStrategies.length === 0) {
    return { error: `No seasonal strategies registered for ${symbol}` };
  }

  const ohlc = loadOhlcJson(exchange, symbol);
  if (!ohlc) {
    return { error: `OHLC data not found for ${exchange}:${symbol}` };
  }

  const { bars, filePath } = ohlc;
  const cutoffDate = historyMode === "full" ? "1970-01-01" : "2000-01-01";
  const filteredBars = bars.filter((b) => b.date >= cutoffDate);
  if (filteredBars.length < 20) {
    return { error: `Insufficient OHLC bars for ${symbol} (${filteredBars.length} bars after ${cutoffDate})` };
  }

  const atr = computeAtr14(filteredBars);

  const allStrategyTrades: StrategyTrade[] = [];
  const breakdown: SeasonalBacktestResult["strategyBreakdown"] = [];

  for (const strategy of seasonalStrategies) {
    const rule = parseSeasonalRule(strategy.id);
    if (!rule) continue;

    const { month, day } = rule;
    const firstYear = parseInt(filteredBars[0].date.slice(0, 4), 10);
    const lastYear = parseInt(filteredBars[filteredBars.length - 1].date.slice(0, 4), 10);
    const strategyTrades: StrategyTrade[] = [];

    let searchStartIdx = 0;
    for (let year = firstYear; year <= lastYear; year++) {
      const triggerIdx = findTriggerBarIdx(filteredBars, year, month, day, searchStartIdx);
      if (triggerIdx < 0) {
        // Advance to next year
        const nextYearStart = `${year + 1}-01-01`;
        const nextIdx = filteredBars.findIndex((b) => b.date >= nextYearStart);
        searchStartIdx = nextIdx < 0 ? filteredBars.length : nextIdx;
        continue;
      }

      const trade = simulateTrade(filteredBars, atr, triggerIdx, strategy);
      if (trade) {
        strategyTrades.push(trade);
        // Advance search past this trade's exit to avoid overlapping in same year
        const nextSearchDate = trade.exitDate;
        const nextIdx = filteredBars.findIndex((b) => b.date > nextSearchDate);
        searchStartIdx = nextIdx < 0 ? filteredBars.length : nextIdx;
      } else {
        const nextYearStart = `${year + 1}-01-01`;
        const nextIdx = filteredBars.findIndex((b) => b.date >= nextYearStart);
        searchStartIdx = nextIdx < 0 ? filteredBars.length : nextIdx;
      }
    }

    allStrategyTrades.push(...strategyTrades);

    const wins = strategyTrades.filter((t) => t.returnPct > 0).length;
    const net = strategyTrades.reduce((s, t) => s + t.returnPct, 0);
    breakdown.push({
      strategyId: strategy.id,
      tradeCount: strategyTrades.length,
      netReturnPct: Math.round(net * 100) / 100,
      winratePct: strategyTrades.length ? Math.round((wins / strategyTrades.length) * 1000) / 10 : 0,
    });
  }

  // Sort all trades chronologically
  allStrategyTrades.sort((a, b) => a.entryDate.localeCompare(b.entryDate));

  // Build MonitoringMvaTrade[] for computeMetrics / buildEquityCurve
  let cumReturnPct = 0;
  let cumPnl = 0;
  const mvaTrades: MonitoringMvaTrade[] = allStrategyTrades.map((t, i) => {
    cumReturnPct += t.returnPct;
    cumPnl += t.returnPct;
    return {
      tradeNo: i + 1,
      direction: t.direction,
      entryDate: t.entryDate,
      exitDate: t.exitDate,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      returnPct: t.returnPct,
      pnlNet: t.returnPct,
      cumulativePnl: cumPnl,
      cumulativeReturnPct: cumReturnPct,
    };
  });

  const metrics = computeMetrics(mvaTrades);
  const equityCurve = buildEquityCurve(mvaTrades);

  return {
    symbol,
    trades: mvaTrades,
    metrics,
    equityCurve,
    strategyBreakdown: breakdown,
    ohlcPath: filePath,
    ohlcRowCount: filteredBars.length,
    ohlcStart: filteredBars[0].date,
    ohlcEnd: filteredBars[filteredBars.length - 1].date,
    backtestStart: mvaTrades[0]?.entryDate ?? cutoffDate,
    backtestEnd: mvaTrades[mvaTrades.length - 1]?.exitDate ?? cutoffDate,
  };
}
