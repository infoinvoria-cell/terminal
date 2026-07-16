import type { MvaChartVisualModel, MvaEngineLiveSignal, MvaEngineRawTrade } from "./types";

export function buildVisualModel(symbol: string, trades: MvaEngineRawTrade[], openTrade: MvaEngineRawTrade | null, liveSignal: MvaEngineLiveSignal | null): MvaChartVisualModel {
  const markers: MvaChartVisualModel["markers"] = [];
  const lines: MvaChartVisualModel["lines"] = [];
  const boxes: MvaChartVisualModel["boxes"] = [];

  for (const trade of trades.slice(-40)) {
    markers.push({
      time: trade.entryTime,
      type: "entry",
      direction: trade.direction,
      price: trade.entryPrice,
      label: `${trade.direction} Entry`,
    });
    if (trade.exitTime && trade.exitPrice != null) {
      markers.push({
        time: trade.exitTime,
        type: "exit",
        direction: trade.direction,
        price: trade.exitPrice,
        label: trade.exitReason ? `Exit ${trade.exitReason}` : "Exit",
      });
    }
  }

  if (openTrade) {
    if (openTrade.stopLossPrice != null) lines.push({ type: "stop_loss", price: openTrade.stopLossPrice });
    if (openTrade.takeProfitPrice != null) lines.push({ type: "take_profit", price: openTrade.takeProfitPrice });
    lines.push({ type: "entry", price: openTrade.entryPrice });
    boxes.push({
      type: "position_zone",
      startTime: openTrade.entryTime,
      high: Math.max(openTrade.entryPrice, openTrade.takeProfitPrice ?? openTrade.entryPrice),
      low: Math.min(openTrade.entryPrice, openTrade.stopLossPrice ?? openTrade.entryPrice),
    });
  } else if (liveSignal?.signal && liveSignal.signal !== "NONE" && liveSignal.entryPrice != null) {
    if (liveSignal.stopLoss != null) lines.push({ type: "stop_loss", price: liveSignal.stopLoss });
    if (liveSignal.takeProfit != null) lines.push({ type: "take_profit", price: liveSignal.takeProfit });
    lines.push({ type: "entry", price: liveSignal.entryPrice });
  }

  return {
    symbol,
    currentSignal: liveSignal?.signal ?? "NONE",
    openPosition: openTrade ? {
      direction: openTrade.direction,
      entryPrice: openTrade.entryPrice,
      stopLoss: openTrade.stopLossPrice,
      takeProfit: openTrade.takeProfitPrice,
      entryDate: openTrade.entryTime,
    } : undefined,
    markers,
    lines,
    boxes,
  };
}
