import type { CandlestickData, Time, WhitespaceData } from "lightweight-charts";
import { parseTradeTimestampValue } from "@/lib/monitoring/tradeVisualNormalizer";
import type { TradeLifecycle } from "@/lib/monitoring/trades/tradeLifecycleModel";

export type TradeLifecycleVisualMode = "normal" | "mini" | "fullscreen";

export type TradeLifecycleOverlayTrade = {
  id: string;
  direction: "long" | "short";
  status: "open" | "closed" | "pending_signal";
  entryTime: Time;
  entryIndex: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  exitPrice?: number | null;
  exitTime?: Time;
  exitIndex?: number;
  exitReason?: string;
};

export type TradeLifecycleLineSegment = {
  id: string;
  type: "entry" | "sl" | "tp";
  startTime: Time;
  endTime: Time;
  value: number;
  color: string;
};

export type TradeLifecycleVisualResult = {
  entryLines: TradeLifecycleLineSegment[];
  stopLossLines: TradeLifecycleLineSegment[];
  takeProfitLines: TradeLifecycleLineSegment[];
  allLineSegments: TradeLifecycleLineSegment[];
  overlayTrades: TradeLifecycleOverlayTrade[];
  futureBars: Array<WhitespaceData<Time>>;
  projectedEndTime: Time | null;
};

const TRADE_ENTRY_COLOR = "#F59E0B";
const TRADE_SL_COLOR = "#FF3B30";
const TRADE_TP_COLOR = "#22C55E";
const OPEN_TRADE_FUTURE_BARS = 10;

function chartTimeKey(value: Time): string {
  return String(value);
}

function inferBarStepSeconds(candles: CandlestickData<Time>[]): number {
  if (candles.length < 2) return 24 * 60 * 60;
  let best = 0;
  for (let i = candles.length - 1; i > 0; i -= 1) {
    const a = Number(candles[i].time);
    const b = Number(candles[i - 1].time);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const step = a - b;
    if (step > 0) {
      best = step;
      break;
    }
  }
  return best > 0 ? best : 24 * 60 * 60;
}

function inferBarStepDays(candles: CandlestickData<Time>[]): number {
  if (candles.length < 2) return 1;
  const sorted = candles
    .map((row) => String(row.time))
    .filter(Boolean);
  if (sorted.length < 2) return 1;
  const last = Date.parse(`${sorted[sorted.length - 1]}T00:00:00Z`);
  const prev = Date.parse(`${sorted[sorted.length - 2]}T00:00:00Z`);
  if (!Number.isFinite(last) || !Number.isFinite(prev) || last <= prev) return 1;
  return Math.max(1, Math.round((last - prev) / (24 * 60 * 60 * 1000)));
}

function shiftTime(time: Time, bars: number, isIntraday: boolean, stepSec: number, stepDays: number): Time {
  if (isIntraday) {
    return (Number(time) + (stepSec * bars)) as Time;
  }
  const base = new Date(`${String(time)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + (stepDays * bars));
  return base.toISOString().slice(0, 10) as Time;
}

function normalizeBarTime(value: string | null | undefined, isIntraday: boolean): Time | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (isIntraday) {
    const ms = parseTradeTimestampValue(raw);
    if (ms == null) return null;
    return Math.floor(ms / 1000) as Time;
  }
  const day = raw.includes("T") ? raw.slice(0, 10) : raw;
  return day as Time;
}

function resolveTradeTimeToCandle(
  rawValue: string | null | undefined,
  orderedTimes: Time[],
  isIntraday: boolean,
): Time | null {
  const normalized = normalizeBarTime(rawValue, isIntraday);
  if (normalized == null) return null;
  const exact = orderedTimes.find((row) => chartTimeKey(row) === chartTimeKey(normalized));
  if (exact != null) return exact;
  if (isIntraday) {
    // Nearest-candle with 3h tolerance — prevents historical trades outside the
    // OHLC window from snapping to the last bar and stacking there.
    const targetSec = Number(normalized);
    let bestTime: Time | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const t of orderedTimes) {
      if (typeof t !== "number") continue;
      const diff = Math.abs(t - targetSec);
      if (diff < bestDiff) { bestDiff = diff; bestTime = t; }
    }
    return (bestTime != null && bestDiff <= 10_800) ? bestTime : null;
  }
  const target = String(normalized);
  for (let i = orderedTimes.length - 1; i >= 0; i -= 1) {
    const day = String(orderedTimes[i]);
    if (day <= target) return orderedTimes[i];
  }
  // Trade date is before the first available candle → skip it (return null).
  // Returning orderedTimes[0] would snap it to the first bar at the wrong historical
  // price, distorting the Y-axis for assets with long multi-decade trade histories.
  return null;
}

function isTradeVisible(
  trade: TradeLifecycleOverlayTrade,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  if (trade.status === "open") return true;
  const end = trade.exitIndex != null ? trade.exitIndex : trade.entryIndex;
  return end >= rangeStart && trade.entryIndex <= rangeEnd;
}

export function buildTradeLifecycleVisuals(
  trades: TradeLifecycle[],
  candles: CandlestickData<Time>[],
  visibleRange: { from: number; to: number } | null,
  mode: TradeLifecycleVisualMode,
  colors?: { entry: string; sl: string; tp: string },
): TradeLifecycleVisualResult {
  if (!candles.length) {
    return {
      entryLines: [],
      stopLossLines: [],
      takeProfitLines: [],
      allLineSegments: [],
      overlayTrades: [],
      futureBars: [],
      projectedEndTime: null,
    };
  }

  const firstTime = candles[0].time;
  const isIntraday = typeof firstTime === "number";
  const orderedTimes = candles.map((row) => row.time);
  const byTimeIndex = new Map<string, number>();
  for (let i = 0; i < orderedTimes.length; i += 1) {
    byTimeIndex.set(chartTimeKey(orderedTimes[i]), i);
  }
  const lastIndex = orderedTimes.length - 1;
  const lastTime = orderedTimes[lastIndex];
  const barStepSeconds = inferBarStepSeconds(candles);
  const barStepDays = inferBarStepDays(candles);

  const projectedEndTime = shiftTime(lastTime, OPEN_TRADE_FUTURE_BARS, isIntraday, barStepSeconds, barStepDays);
  const futureBars: Array<WhitespaceData<Time>> = [];
  for (let i = 1; i <= OPEN_TRADE_FUTURE_BARS; i += 1) {
    futureBars.push({ time: shiftTime(lastTime, i, isIntraday, barStepSeconds, barStepDays) });
  }

  const from = Math.max(0, Math.floor(visibleRange?.from ?? 0));
  const to = Math.min(lastIndex, Math.ceil(visibleRange?.to ?? lastIndex));
  const rangeStart = Math.max(0, from - 10);
  const rangeEnd = Math.max(rangeStart, to + 10);

  const overlayTrades: TradeLifecycleOverlayTrade[] = [];
  for (let i = 0; i < trades.length; i += 1) {
    const row = trades[i];
    if (!row.hasEntry || row.entryPrice <= 0) continue;
    const entryTime = resolveTradeTimeToCandle(row.entryTime, orderedTimes, isIntraday);
    if (entryTime == null) continue;
    const entryIndex = byTimeIndex.get(chartTimeKey(entryTime));
    if (entryIndex == null) continue;
    const isOpen = row.isOpen || row.status === "open" || row.status === "entry_today";
    const exitTime = !isOpen ? resolveTradeTimeToCandle(row.exitTime, orderedTimes, isIntraday) : null;
    const resolvedExitIndex = exitTime != null ? byTimeIndex.get(chartTimeKey(exitTime)) : undefined;
    const exitIndex = !isOpen ? (resolvedExitIndex != null ? Math.max(entryIndex, resolvedExitIndex) : entryIndex) : undefined;
    overlayTrades.push({
      id: row.tradeId || `${row.strategyId}:${row.entryTime}:${i + 1}`,
      direction: row.direction,
      status: isOpen ? "open" : "closed",
      entryTime,
      entryIndex,
      entryPrice: row.entryPrice,
      stopLoss: row.stopLossPrice,
      takeProfit: row.takeProfitPrice,
      exitPrice: isOpen ? null : row.exitPrice,
      exitTime: isOpen ? undefined : (exitIndex != null ? orderedTimes[exitIndex] : undefined),
      exitIndex,
      exitReason: row.exitReason || undefined,
    });
  }

  const visibleTradesAll = overlayTrades.filter((trade) => isTradeVisible(trade, rangeStart, rangeEnd));
  const visibleTrades = mode === "mini"
    ? [
        ...visibleTradesAll.filter((row) => row.status === "open"),
        ...visibleTradesAll
          .filter((row) => row.status !== "open")
          .sort((a, b) => b.entryIndex - a.entryIndex)
          .slice(0, 40),
      ]
    : visibleTradesAll;
  const visibleTradeIds = new Set(visibleTrades.map((row) => row.id));

  const entryLines: TradeLifecycleLineSegment[] = [];
  const stopLossLines: TradeLifecycleLineSegment[] = [];
  const takeProfitLines: TradeLifecycleLineSegment[] = [];

  for (const trade of overlayTrades) {
    if (!visibleTradeIds.has(trade.id)) continue;
    const startTime = trade.entryTime;
    const endTime = trade.status === "open"
      ? projectedEndTime
      : (trade.exitTime ?? trade.entryTime);

    entryLines.push({
      id: `${trade.id}-entry`,
      type: "entry",
      startTime,
      endTime,
      value: trade.entryPrice,
      color: colors?.entry ?? TRADE_ENTRY_COLOR,
    });

    if (trade.stopLoss != null && trade.stopLoss > 0) {
      stopLossLines.push({
        id: `${trade.id}-sl`,
        type: "sl",
        startTime,
        endTime,
        value: trade.stopLoss,
        color: colors?.sl ?? TRADE_SL_COLOR,
      });
    }
    if (trade.takeProfit != null && trade.takeProfit > 0) {
      takeProfitLines.push({
        id: `${trade.id}-tp`,
        type: "tp",
        startTime,
        endTime,
        value: trade.takeProfit,
        color: colors?.tp ?? TRADE_TP_COLOR,
      });
    }
  }

  return {
    entryLines,
    stopLossLines,
    takeProfitLines,
    allLineSegments: [...entryLines, ...stopLossLines, ...takeProfitLines],
    overlayTrades: visibleTrades,
    futureBars,
    projectedEndTime,
  };
}
