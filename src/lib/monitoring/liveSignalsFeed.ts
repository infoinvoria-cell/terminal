import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";
import {
  parseTradeTimestampValue,
  type NormalizedTradeVisualLevel,
  type TradeVisualLevelSource,
} from "@/lib/monitoring/tradeVisualNormalizer";

export type LiveSignalStatus = "OPEN" | "EXIT_TODAY" | "ENTRY_TODAY" | "EXIT_THIS_WEEK";

export type LiveSignalChartScopeItem = {
  key: string;
  code: string;
  name: string;
  strategy?: string;
  tv?: string;
  assetId?: string;
  timeframe?: string;
  universeGroup?: string;
  payload: {
    bars?: Array<{ time?: string | number; close?: number }>;
  } | null;
};

export type LiveSignalRow = {
  id: string;
  tradeId: string;
  itemKey: string;
  tabId: MonitoringPrimaryTabId;
  symbol: string;
  name: string;
  strategy: string;
  group: string;
  direction: "long" | "short";
  status: LiveSignalStatus;
  entryTime: string;
  exitTime: string | null;
  entryPrice: number | null;
  currentPrice: number | null;
  exitPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  hasStopLoss: boolean;
  hasTakeProfit: boolean;
  sourceLabel: string;
  isOpen: boolean;
  entryToday: boolean;
  exitToday: boolean;
  staleStatus: "fresh" | "stale_data";
  lastCandleTime: string | null;
  dataAgeLabel: string;
  durationLabel: string;
  signalTimeLabel: string;
  plApprox: number | null;
  plPct: number | null;
  assetId?: string;
};

export type LiveSignalsFeed = {
  openTrades: LiveSignalRow[];
  exitsToday: LiveSignalRow[];
  entriesToday: LiveSignalRow[];
  /** Trades closed earlier this week (excluding today). Optional so existing feed
   *  constructors stay valid; only the lifecycle builder populates it. */
  closedThisWeek?: LiveSignalRow[];
  openCount: number;
  exitsTodayCount: number;
  entriesTodayCount: number;
  closedThisWeekCount?: number;
  badgeCount: number;
};

/** Monday 00:00 (local) of the current week. */
export function startOfLocalWeekMs(baseMs: number): number {
  const d = new Date(baseMs);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

const STATUS_RANK: Record<LiveSignalStatus, number> = {
  OPEN: 0,
  ENTRY_TODAY: 1,
  EXIT_TODAY: 2,
  EXIT_THIS_WEEK: 3,
};

/** Stable ranking for the unified live-signal list:
 *  open (newest signal first) -> today entries -> today exits -> this-week exits,
 *  with data issues (no symbol / no levels) pushed within their group. */
export function rankLiveSignals(rows: LiveSignalRow[]): LiveSignalRow[] {
  const keyMs = (row: LiveSignalRow): number => {
    const ref = row.status === "OPEN" || row.status === "ENTRY_TODAY" ? row.entryTime : (row.exitTime ?? row.entryTime);
    return parseTradeTimestampValue(ref) ?? 0;
  };
  // Within a status group: complete signals first, level-less placeholders next,
  // fully-broken (no symbol) last.
  const dataIssue = (row: LiveSignalRow): number => {
    if (!row.symbol || row.symbol === "-") return 2;
    const hasLevels = (row.entryPrice != null && row.entryPrice > 0) || row.hasStopLoss || row.hasTakeProfit;
    return hasLevels ? 0 : 1;
  };
  return [...rows].sort((a, b) => {
    const sr = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (sr !== 0) return sr;
    const di = dataIssue(a) - dataIssue(b);
    if (di !== 0) return di;
    return keyMs(b) - keyMs(a); // newest first within the same status
  });
}

function startOfLocalDayMs(baseMs: number): number {
  const d = new Date(baseMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatDuration(entryMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - entryMs);
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `seit ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `seit ${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `seit ${days}d ${hours % 24}h`;
}

function formatSignalTime(entryMs: number): string {
  return new Date(entryMs).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeframeMs(tf: string | undefined): number {
  const key = String(tf || "D").trim().toUpperCase();
  if (key === "30M") return 30 * 60_000;
  if (key === "1H") return 60 * 60_000;
  if (key === "2H") return 2 * 60 * 60_000;
  return 24 * 60 * 60_000;
}

function lastBarMs(payload: LiveSignalChartScopeItem["payload"]): number | null {
  const bars = payload?.bars;
  if (!bars?.length) return null;
  const last = bars[bars.length - 1];
  const raw = last?.time;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  const parsed = parseTradeTimestampValue(String(raw ?? ""));
  return parsed;
}

function currentPriceFromPayload(payload: LiveSignalChartScopeItem["payload"]): number | null {
  const bars = payload?.bars;
  if (!bars?.length) return null;
  const close = Number(bars[bars.length - 1]?.close);
  return Number.isFinite(close) && close > 0 ? close : null;
}

function sourceLabel(levelSource: TradeVisualLevelSource): string {
  const key = String(levelSource || "").toLowerCase();
  if (key.includes("reference") || key.includes("csv")) return "csv_reference";
  if (key.includes("hybrid")) return "hybrid";
  if (key.includes("strategy") || key.includes("generated")) return "engine";
  return "engine";
}

function approxPl(
  direction: "long" | "short",
  entry: number | null,
  current: number | null,
): { plApprox: number | null; plPct: number | null } {
  if (entry == null || current == null || entry <= 0) {
    return { plApprox: null, plPct: null };
  }
  const diff = direction === "long" ? current - entry : entry - current;
  const plPct = (diff / entry) * 100;
  return { plApprox: diff, plPct };
}

function toIsoStringFromMs(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function isStale(lastCandleMs: number | null, timeframe: string | undefined, nowMs: number): boolean {
  if (lastCandleMs == null) return true;
  const barMs = timeframeMs(timeframe);
  const grace = barMs >= 24 * 60 * 60_000 ? 48 * 60 * 60_000 : 2 * barMs;
  return nowMs - lastCandleMs > barMs + grace;
}

function dataAgeLabel(lastCandleMs: number | null, nowMs: number): string {
  if (lastCandleMs == null) return "keine Candle";
  const mins = Math.max(0, Math.floor((nowMs - lastCandleMs) / 60_000));
  if (mins < 60) return `${mins}m alt`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h alt`;
  return `${Math.floor(hours / 24)}d alt`;
}

function isMsToday(ms: number | null, dayStartMs: number, nextDayStartMs: number): boolean {
  if (ms == null) return false;
  return ms >= dayStartMs && ms < nextDayStartMs;
}

const OPEN_AGE_LIMIT_MS = 30 * 24 * 60 * 60_000;

function dedupOpenRows(rows: LiveSignalRow[]): LiveSignalRow[] {
  const openPriority = (row: LiveSignalRow): number => {
    if (row.sourceLabel === "engine") return 0;
    if (row.sourceLabel === "hybrid") return 1;
    if (row.sourceLabel === "csv_reference") return 2;
    return 3;
  };
  const best = new Map<string, LiveSignalRow>();
  const nonOpen: LiveSignalRow[] = [];
  for (const row of rows) {
    if (row.status !== "OPEN") { nonOpen.push(row); continue; }
    const key = `${row.itemKey}:${row.direction}`;
    const existing = best.get(key);
    if (!existing || openPriority(row) < openPriority(existing)) best.set(key, row);
  }
  return [...best.values(), ...nonOpen];
}

function buildRow(
  item: LiveSignalChartScopeItem,
  trade: NormalizedTradeVisualLevel,
  tabId: MonitoringPrimaryTabId,
  nowMs: number,
  dayStartMs: number,
  nextDayStartMs: number,
): LiveSignalRow | null {
  const entryMs = parseTradeTimestampValue(trade.entryTime);
  if (!entryMs) return null;
  const exitMs = parseTradeTimestampValue(trade.exitTime);
  const entryToday = isMsToday(entryMs, dayStartMs, nextDayStartMs);
  const exitToday = isMsToday(exitMs, dayStartMs, nextDayStartMs);

  const currentPrice = currentPriceFromPayload(item.payload);
  const { plApprox, plPct } = approxPl(trade.direction, trade.entryPrice, currentPrice);
  const lastCandleMs = lastBarMs(item.payload);
  const stale = isStale(lastCandleMs, item.timeframe, nowMs);
  const hasStopLoss = trade.stopLossPrice != null && Number.isFinite(Number(trade.stopLossPrice)) && Number(trade.stopLossPrice) > 0;
  const hasTakeProfit = trade.takeProfitPrice != null && Number.isFinite(Number(trade.takeProfitPrice)) && Number(trade.takeProfitPrice) > 0;

  const srcLabel = sourceLabel(trade.levelSource.entry);
  const hasExitPrice = trade.exitPrice != null && Number.isFinite(Number(trade.exitPrice)) && Number(trade.exitPrice) > 0;
  const entryAgeTooOld = (srcLabel === "csv_reference" || srcLabel === "hybrid")
    && (nowMs - entryMs) > OPEN_AGE_LIMIT_MS;
  const isEffectivelyOpen = trade.isOpen && !hasExitPrice && !entryAgeTooOld;

  let status: LiveSignalStatus;
  if (isEffectivelyOpen) status = "OPEN";
  else if (exitToday) status = "EXIT_TODAY";
  else if (entryToday) status = "ENTRY_TODAY";
  else return null;

  return {
    id: `${item.key}:${trade.tradeId}`,
    tradeId: trade.tradeId,
    itemKey: item.key,
    tabId,
    symbol: item.code,
    name: item.name,
    strategy: item.strategy || "-",
    group: item.universeGroup || "-",
    direction: trade.direction,
    status,
    entryTime: trade.entryTime,
    exitTime: trade.exitTime,
    entryPrice: trade.entryPrice,
    currentPrice,
    exitPrice: trade.exitPrice,
    stopLossPrice: trade.stopLossPrice,
    takeProfitPrice: trade.takeProfitPrice,
    hasStopLoss,
    hasTakeProfit,
    sourceLabel: srcLabel,
    isOpen: isEffectivelyOpen,
    entryToday,
    exitToday,
    staleStatus: stale ? "stale_data" : "fresh",
    lastCandleTime: toIsoStringFromMs(lastCandleMs),
    dataAgeLabel: dataAgeLabel(lastCandleMs, nowMs),
    durationLabel: formatDuration(entryMs, nowMs),
    signalTimeLabel: formatSignalTime(entryMs),
    plApprox,
    plPct,
    assetId: item.assetId,
  };
}

export function tabIdForUniverseGroup(
  group: string,
  resolveTab: (group: string) => MonitoringPrimaryTabId | null,
): MonitoringPrimaryTabId {
  return resolveTab(group) ?? "all";
}

export function buildLiveSignalsFeed(
  items: LiveSignalChartScopeItem[],
  tradesByItemKey: Record<string, NormalizedTradeVisualLevel[]>,
  resolveTab: (group: string) => MonitoringPrimaryTabId | null,
): LiveSignalsFeed {
  const nowMs = Date.now();
  const dayStartMs = startOfLocalDayMs(nowMs);
  const nextDayStartMs = dayStartMs + 24 * 60 * 60_000;
  const allRows: LiveSignalRow[] = [];

  for (const item of items) {
    const trades = tradesByItemKey[item.key] ?? [];
    const tabId = tabIdForUniverseGroup(item.universeGroup ?? "", resolveTab);
    for (const trade of trades) {
      const row = buildRow(item, trade, tabId, nowMs, dayStartMs, nextDayStartMs);
      if (row) allRows.push(row);
    }
  }

  const byNewest = (a: LiveSignalRow, b: LiveSignalRow) => {
    const am = parseTradeTimestampValue(a.entryTime) ?? 0;
    const bm = parseTradeTimestampValue(b.entryTime) ?? 0;
    return bm - am;
  };

  const dedupedRows = dedupOpenRows(allRows);

  const openTrades = dedupedRows
    .filter((row) => row.status === "OPEN")
    .sort(byNewest);

  const exitsToday = dedupedRows
    .filter((row) => row.status === "EXIT_TODAY")
    .sort((a, b) => (parseTradeTimestampValue(b.exitTime) ?? 0) - (parseTradeTimestampValue(a.exitTime) ?? 0));

  const entriesToday = dedupedRows
    .filter((row) => row.status === "ENTRY_TODAY")
    .sort(byNewest);

  const badgeIds = new Set<string>();
  for (const row of openTrades) badgeIds.add(row.id);
  for (const row of exitsToday) badgeIds.add(row.id);
  for (const row of entriesToday) badgeIds.add(row.id);

  return {
    openTrades,
    exitsToday,
    entriesToday,
    openCount: openTrades.length,
    exitsTodayCount: exitsToday.length,
    entriesTodayCount: entriesToday.length,
    badgeCount: badgeIds.size,
  };
}

export function emptyLiveSignalsFeed(): LiveSignalsFeed {
  return {
    openTrades: [],
    exitsToday: [],
    entriesToday: [],
    openCount: 0,
    exitsTodayCount: 0,
    entriesTodayCount: 0,
    badgeCount: 0,
  };
}
