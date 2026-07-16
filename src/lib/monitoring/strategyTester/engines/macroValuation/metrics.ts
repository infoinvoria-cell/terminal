import type { MonitoringMvaMetrics, MonitoringMvaTrade } from "@/lib/monitoring/strategyTester/types";
import type { MvaEngineRawTrade } from "./types";

function pctForTrade(trade: MvaEngineRawTrade): number {
  if (trade.returnPct != null) return trade.returnPct;
  // fallback for older engine output without returnPct: raw price % move
  if (trade.exitPrice == null || trade.entryPrice <= 0) return 0;
  const move = trade.direction === "LONG"
    ? (trade.exitPrice - trade.entryPrice) / trade.entryPrice
    : (trade.entryPrice - trade.exitPrice) / trade.entryPrice;
  return move * 100;
}

export function toMonitoringTrades(rawTrades: MvaEngineRawTrade[]): MonitoringMvaTrade[] {
  let cumulativePct = 0;
  let cumulativePnl = 0;
  const closedTrades = rawTrades.filter((trade) => trade.exitTime && trade.exitPrice != null);
  return closedTrades.map((trade, index) => {
    const returnPct = pctForTrade(trade);
    const pnlNet = returnPct;
    cumulativePct += returnPct;
    cumulativePnl += pnlNet;
    return {
      tradeNo: index + 1,
      direction: trade.direction,
      entryDate: trade.entryTime,
      exitDate: trade.exitTime ?? trade.entryTime,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice ?? trade.entryPrice,
      returnPct,
      pnlNet,
      cumulativePnl,
      cumulativeReturnPct: cumulativePct,
    };
  });
}

export function computeMetrics(trades: MonitoringMvaTrade[]): MonitoringMvaMetrics {
  let wins = 0;
  let losses = 0;
  let breakEven = 0;
  let longTrades = 0;
  let shortTrades = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let peak = 0;
  let maxDrawdownPct = 0;

  for (const trade of trades) {
    if (trade.direction === "LONG") longTrades += 1;
    else shortTrades += 1;

    if (trade.returnPct > 0) {
      wins += 1;
      grossWin += trade.returnPct;
    } else if (trade.returnPct < 0) {
      losses += 1;
      grossLoss += Math.abs(trade.returnPct);
    } else {
      breakEven += 1;
    }

    peak = Math.max(peak, trade.cumulativeReturnPct);
    maxDrawdownPct = Math.max(maxDrawdownPct, peak - trade.cumulativeReturnPct);
  }

  const returns = trades.map((trade) => trade.returnPct);
  const winReturns = returns.filter((value) => value > 0);
  const lossReturns = returns.filter((value) => value < 0);
  const totalTrades = trades.length;
  const netReturnPct = trades.at(-1)?.cumulativeReturnPct ?? 0;
  const avgReturnPct = totalTrades ? returns.reduce((sum, value) => sum + value, 0) / totalTrades : 0;

  return {
    totalTrades,
    longTrades,
    shortTrades,
    wins,
    losses,
    breakEven,
    winratePct: totalTrades ? (wins / totalTrades) * 100 : 0,
    netReturnPct,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxDrawdownPct,
    avgReturnPct,
    bestTradePct: returns.length ? Math.max(...returns) : 0,
    worstTradePct: returns.length ? Math.min(...returns) : 0,
    avgWinPct: winReturns.length ? winReturns.reduce((sum, value) => sum + value, 0) / winReturns.length : 0,
    avgLossPct: lossReturns.length ? lossReturns.reduce((sum, value) => sum + value, 0) / lossReturns.length : 0,
  };
}

export function buildEquityCurve(trades: MonitoringMvaTrade[]): Array<{ date: string; cumulativeReturnPct: number }> {
  return trades.map((trade) => ({
    date: trade.exitDate,
    cumulativeReturnPct: trade.cumulativeReturnPct,
  }));
}
