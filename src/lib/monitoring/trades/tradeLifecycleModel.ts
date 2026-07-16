import { mergeTradesFromEventsPayload } from "@/lib/monitoring/tradeSetupFromEvents";
import {
  type NormalizedTradeVisualLevel,
  normalizeTradeTimeValue,
  parseTradeTimestampValue,
  pickTradeNumberFromKeys,
  pickTradeStringFromKeys,
  TRADE_DIRECTION_KEYS,
  TRADE_ENTRY_KEYS,
  TRADE_ENTRY_TIME_KEYS,
  TRADE_EXIT_KEYS,
  TRADE_EXIT_TIME_KEYS,
  TRADE_SL_KEYS,
  TRADE_STATUS_KEYS,
  TRADE_TP_KEYS,
  type TradeVisualLevelSource,
  type TradeVisualLooseRow,
} from "@/lib/monitoring/tradeVisualNormalizer";

export type TradeLifecycleSource = "engine" | "csv_reference" | "hybrid" | "live_state" | "manual";
export type TradeLifecycleExitReason = "take_profit" | "stop_loss" | "signal_exit" | "manual" | "end_of_data" | "unknown" | null;
export type TradeLifecycleStatus = "open" | "closed" | "entry_today" | "exit_today" | "pending";

export type TradeLifecycle = {
  tradeId: string;
  strategyId: string;
  symbol: string;
  group: string;
  timeframe: string;
  source: TradeLifecycleSource;
  sourceFile?: string;
  direction: "long" | "short";
  entryTime: string;
  entryPrice: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  exitTime: string | null;
  exitPrice: number | null;
  exitReason: TradeLifecycleExitReason;
  status: TradeLifecycleStatus;
  isOpen: boolean;
  hasEntry: boolean;
  hasStopLoss: boolean;
  hasTakeProfit: boolean;
  hasExit: boolean;
  createdAt?: string;
  updatedAt?: string;
  dataQuality: {
    entrySource: string;
    stopLossSource: string | null;
    takeProfitSource: string | null;
    exitSource: string | null;
    missingReason?: string;
  };
};

export type TradeLifecycleInput = {
  strategyId: string;
  symbol: string;
  group: string;
  timeframe: string;
  source: TradeLifecycleSource;
  sourceFile?: string | null;
};

export type MonitoringLiveStateRowLike = {
  strategyId?: string | null;
  symbol?: string | null;
  group?: string | null;
  timeframe?: string | null;
  direction?: string | null;
  entryTime?: string | null;
  entryPrice?: number | null;
  currentPrice?: number | null;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  exitTime?: string | null;
  exitPrice?: number | null;
  source?: string | null;
  status?: string | null;
  tradeId?: string | null;
};

function normalizeDirection(value: unknown): "long" | "short" {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "sell" || raw.includes("short")) return "short";
  return "long";
}

function normalizeSource(value: unknown): TradeLifecycleSource {
  const key = String(value || "").trim().toLowerCase();
  if (key.includes("hybrid")) return "hybrid";
  if (key.includes("reference") || key.includes("csv")) return "csv_reference";
  if (key.includes("live")) return "live_state";
  if (key.includes("manual")) return "manual";
  return "engine";
}

function normalizeExitReason(value: unknown): TradeLifecycleExitReason {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return null;
  // A backtest force-close at the last available candle ("end_of_data") is not a real
  // exit — the position is still open as of the latest data. Preserve it so the live
  // feed can surface it as a current OPEN trade (e.g. the trailing DAX40 2H signal).
  if (key.includes("end_of_data") || key.includes("end of data") || key === "eod") return "end_of_data";
  if (key.includes("tp") || key.includes("take")) return "take_profit";
  if (key.includes("sl") || key.includes("stop")) return "stop_loss";
  if (key.includes("manual")) return "manual";
  if (key.includes("signal") || key.includes("opposite") || key.includes("trend")) return "signal_exit";
  return "unknown";
}

function parseLooseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "true" || text === "1" || text === "yes" || text === "open") return true;
  if (text === "false" || text === "0" || text === "no" || text === "closed") return false;
  return null;
}

export function resolveTradeStatus(row: TradeVisualLooseRow): {
  isOpen: boolean;
  status: TradeLifecycleStatus;
  hasExitTime: boolean;
  hasExitPrice: boolean;
} {
  const statusValue = pickTradeStringFromKeys(row, TRADE_STATUS_KEYS).toLowerCase();
  const isOpenFlag = parseLooseBoolean((row as Record<string, unknown>)?.isOpen);
  const closedFlag = parseLooseBoolean((row as Record<string, unknown>)?.closed);
  const exitTime = pickTradeStringFromKeys(row, TRADE_EXIT_TIME_KEYS) || String(row.exitTime || "").trim();
  const exitPrice = pickTradeNumberFromKeys(row, TRADE_EXIT_KEYS);
  const hasExitTime = Boolean(exitTime);
  const hasExitPrice = exitPrice != null;

  const openByStatus = statusValue === "open";
  const closedByStatus = statusValue === "closed" || statusValue === "exit";

  const openByRule = openByStatus || isOpenFlag === true || closedFlag === false || !hasExitTime || !hasExitPrice;
  const closedByRule = !openByRule && (closedByStatus || (hasExitTime && hasExitPrice && statusValue !== "open"));

  const isOpen = openByRule && !closedByRule;
  return {
    isOpen,
    status: isOpen ? "open" : "closed",
    hasExitTime,
    hasExitPrice,
  };
}

export function normalizeLifecycleTradeFromRow(
  row: TradeVisualLooseRow,
  input: TradeLifecycleInput,
  index: number,
): TradeLifecycle | null {
  const direction = normalizeDirection(
    pickTradeStringFromKeys(row, TRADE_DIRECTION_KEYS) || row.direction || "long",
  );
  const entryTimeRaw = pickTradeStringFromKeys(row, TRADE_ENTRY_TIME_KEYS) || row.entryTime || "";
  const entryTime = normalizeTradeTimeValue(entryTimeRaw);
  const entryPrice = pickTradeNumberFromKeys(row, TRADE_ENTRY_KEYS);
  if (!entryTime || entryPrice == null || entryPrice <= 0) return null;

  const exitTime = normalizeTradeTimeValue(
    pickTradeStringFromKeys(row, TRADE_EXIT_TIME_KEYS) || row.exitTime || "",
  ) || null;
  const exitPrice = pickTradeNumberFromKeys(row, TRADE_EXIT_KEYS);
  const stopLossPrice = pickTradeNumberFromKeys(row, TRADE_SL_KEYS);
  const takeProfitPrice = pickTradeNumberFromKeys(row, TRADE_TP_KEYS);
  const statusState = resolveTradeStatus(row);
  const entryMs = parseTradeTimestampValue(entryTime);
  const exitMs = parseTradeTimestampValue(exitTime);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const nextDayMs = dayStartMs + 24 * 60 * 60 * 1000;
  const entryToday = entryMs != null && entryMs >= dayStartMs && entryMs < nextDayMs;
  const exitToday = exitMs != null && exitMs >= dayStartMs && exitMs < nextDayMs;
  const status: TradeLifecycleStatus = statusState.isOpen
    ? (entryToday ? "entry_today" : "open")
    : (exitToday ? "exit_today" : "closed");

  const tradeId =
    String((row as Record<string, unknown>)?.tradeId || "").trim()
    || `${input.strategyId}:${entryTime}:${direction}:${index + 1}`;

  const entrySource = input.source === "csv_reference" ? "csv_reference" : "engine";
  const stopLossSource = stopLossPrice != null ? entrySource : null;
  const takeProfitSource = takeProfitPrice != null ? entrySource : null;
  const exitSource = statusState.hasExitPrice && statusState.hasExitTime ? entrySource : null;
  const missingReasons: string[] = [];
  if (stopLossSource == null) missingReasons.push("missing_stop_loss");
  if (takeProfitSource == null) missingReasons.push("missing_take_profit");

  return {
    tradeId,
    strategyId: input.strategyId,
    symbol: input.symbol,
    group: input.group,
    timeframe: input.timeframe,
    source: input.source,
    sourceFile: input.sourceFile || undefined,
    direction,
    entryTime,
    entryPrice,
    stopLossPrice: stopLossPrice ?? null,
    takeProfitPrice: takeProfitPrice ?? null,
    exitTime,
    exitPrice: exitPrice ?? null,
    exitReason: normalizeExitReason(
      (row as Record<string, unknown>)?.exitReason ?? (row as Record<string, unknown>)?.exit_reason ?? null,
    ),
    status,
    isOpen: statusState.isOpen,
    hasEntry: true,
    hasStopLoss: stopLossPrice != null,
    hasTakeProfit: takeProfitPrice != null,
    hasExit: statusState.hasExitTime && statusState.hasExitPrice,
    dataQuality: {
      entrySource,
      stopLossSource,
      takeProfitSource,
      exitSource,
      missingReason: missingReasons.length ? missingReasons.join("|") : undefined,
    },
  };
}

export function buildTradeLifecycleFromRows(
  rows: TradeVisualLooseRow[],
  input: TradeLifecycleInput,
): TradeLifecycle[] {
  const out: TradeLifecycle[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const normalized = normalizeLifecycleTradeFromRow(rows[i], input, i);
    if (normalized) out.push(normalized);
  }
  return out;
}

export function buildTradeLifecycleFromEventsPayload(
  payload: unknown,
  input: TradeLifecycleInput,
): TradeLifecycle[] {
  const rows = mergeTradesFromEventsPayload(payload as Parameters<typeof mergeTradesFromEventsPayload>[0]);
  return buildTradeLifecycleFromRows(rows as TradeVisualLooseRow[], input);
}

export function lifecycleToTradeRow(trade: TradeLifecycle): TradeVisualLooseRow {
  return {
    tradeId: trade.tradeId,
    direction: trade.direction,
    entryTime: trade.entryTime,
    exitTime: trade.exitTime,
    entry: trade.entryPrice,
    sl: trade.stopLossPrice,
    tp: trade.takeProfitPrice,
    exit: trade.exitPrice,
    status: trade.status === "open" || trade.status === "entry_today" ? "open" : "closed",
    isOpen: trade.isOpen,
    exitReason: trade.exitReason || undefined,
    source: trade.source,
  };
}

function lifecyclePriority(trade: TradeLifecycle): number {
  if (trade.source === "engine") return 0;
  if (trade.source === "hybrid") return 1;
  if (trade.source === "live_state") return 2;
  if (trade.source === "csv_reference") return 3;
  return 4;
}

function sameLifecycleIdentity(a: TradeLifecycle, b: TradeLifecycle): boolean {
  if (a.strategyId && b.strategyId && a.strategyId === b.strategyId) {
    if (a.direction !== b.direction) return false;
    if (normalizeTradeTimeValue(a.entryTime) !== normalizeTradeTimeValue(b.entryTime)) return false;
    return Math.abs(a.entryPrice - b.entryPrice) < 1e-6;
  }
  return false;
}

export function mergeLifecycleTrades(primary: TradeLifecycle[], extra: TradeLifecycle[]): TradeLifecycle[] {
  const out = [...primary];
  for (const candidate of extra) {
    const idx = out.findIndex((row) => sameLifecycleIdentity(row, candidate));
    if (idx < 0) {
      out.push(candidate);
      continue;
    }
    const current = out[idx];
    const better = lifecyclePriority(candidate) < lifecyclePriority(current);
    const shouldPromoteOpen = candidate.isOpen && !current.isOpen;
    if (better || shouldPromoteOpen) out[idx] = candidate;
  }
  return out.sort((a, b) => {
    const am = parseTradeTimestampValue(a.entryTime) ?? 0;
    const bm = parseTradeTimestampValue(b.entryTime) ?? 0;
    return am - bm;
  });
}

export function lifecycleFromLiveStateRow(
  row: MonitoringLiveStateRowLike,
  fallback: Omit<TradeLifecycleInput, "source">,
): TradeLifecycle | null {
  const entryTime = normalizeTradeTimeValue(String(row.entryTime || ""));
  const entryPrice = Number(row.entryPrice);
  if (!entryTime || !Number.isFinite(entryPrice) || entryPrice <= 0) return null;

  const source = normalizeSource(row.source || "live_state");
  const direction = normalizeDirection(row.direction || "long");
  const exitTime = normalizeTradeTimeValue(String(row.exitTime || "")) || null;
  const exitPriceRaw = Number(row.exitPrice);
  const exitPrice = Number.isFinite(exitPriceRaw) && exitPriceRaw > 0 ? exitPriceRaw : null;
  const slRaw = Number(row.stopLossPrice);
  const tpRaw = Number(row.takeProfitPrice);
  const stopLossPrice = Number.isFinite(slRaw) && slRaw > 0 ? slRaw : null;
  const takeProfitPrice = Number.isFinite(tpRaw) && tpRaw > 0 ? tpRaw : null;
  const rowStatus = String(row.status || "").toLowerCase();
  const isOpen = rowStatus === "open" || !exitTime || exitPrice == null;
  const status: TradeLifecycleStatus = isOpen
    ? "open"
    : (rowStatus === "exit_today" ? "exit_today" : "closed");
  const tradeId = String(row.tradeId || `${fallback.strategyId}:live:${entryTime}:${direction}`).trim();

  return {
    tradeId,
    strategyId: String(row.strategyId || fallback.strategyId),
    symbol: String(row.symbol || fallback.symbol),
    group: String(row.group || fallback.group),
    timeframe: String(row.timeframe || fallback.timeframe),
    source,
    sourceFile: "live_state/open_trades.json",
    direction,
    entryTime,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    exitTime,
    exitPrice,
    exitReason: normalizeExitReason(status === "closed" ? "signal_exit" : null),
    status,
    isOpen,
    hasEntry: true,
    hasStopLoss: stopLossPrice != null,
    hasTakeProfit: takeProfitPrice != null,
    hasExit: !isOpen && Boolean(exitTime) && exitPrice != null,
    dataQuality: {
      entrySource: "live_state",
      stopLossSource: stopLossPrice != null ? "live_state" : null,
      takeProfitSource: takeProfitPrice != null ? "live_state" : null,
      exitSource: !isOpen && exitTime && exitPrice != null ? "live_state" : null,
      missingReason:
        stopLossPrice == null || takeProfitPrice == null
          ? "level_missing_in_all_sources"
          : undefined,
    },
  };
}

export function lifecycleSourceToLevelSource(source: TradeLifecycleSource): TradeVisualLevelSource {
  if (source === "csv_reference") return "reference_event_direct";
  if (source === "hybrid") return "hybrid_event_direct";
  if (source === "engine") return "original_strategy_event_direct";
  if (source === "live_state") return "generated_monitoring_event_direct";
  return "generated_monitoring_event_direct";
}

export function lifecycleToNormalizedVisualLevel(trade: TradeLifecycle): NormalizedTradeVisualLevel {
  const source = lifecycleSourceToLevelSource(trade.source);
  return {
    tradeId: trade.tradeId,
    strategyId: trade.strategyId,
    symbol: trade.symbol,
    timeframe: trade.timeframe,
    direction: trade.direction,
    entryTime: trade.entryTime,
    entryPrice: trade.entryPrice,
    exitTime: trade.exitTime,
    exitPrice: trade.exitPrice,
    stopLossPrice: trade.stopLossPrice,
    takeProfitPrice: trade.takeProfitPrice,
    isOpen: trade.isOpen,
    levelSource: {
      entry: source,
      exit: source,
      stopLoss: trade.hasStopLoss ? source : "level_missing_in_all_sources",
      takeProfit: trade.hasTakeProfit ? source : "level_missing_in_all_sources",
    },
    missingLevelReason: {
      stopLoss: trade.hasStopLoss ? null : "level_missing_in_all_sources",
      takeProfit: trade.hasTakeProfit ? null : "level_missing_in_all_sources",
    },
  };
}
