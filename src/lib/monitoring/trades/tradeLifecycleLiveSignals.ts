import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";
import { parseTradeTimestampValue } from "@/lib/monitoring/tradeVisualNormalizer";
import type { TradeLifecycle } from "@/lib/monitoring/trades/tradeLifecycleModel";
import type { LiveSignalChartScopeItem, LiveSignalRow, LiveSignalsFeed } from "@/lib/monitoring/liveSignalsFeed";
import { startOfLocalWeekMs } from "@/lib/monitoring/liveSignalsFeed";

// Age limits
const OPEN_AGE_LIMIT_MS = 30 * 24 * 60 * 60_000;
const MAX_OPEN_AGE_MS = 400 * 24 * 60 * 60_000;
// "Closed" shows trades closed within the last ~week (rolling), so recently-closed
// signals stay visible even right after a calendar-week boundary.
const CLOSED_WINDOW_MS = 8 * 24 * 60 * 60_000;
const INTRADAY_TFS = new Set(["30M", "1H", "2H"]);

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
  return parseTradeTimestampValue(String(raw ?? ""));
}

function currentPriceFromPayload(payload: LiveSignalChartScopeItem["payload"]): number | null {
  const bars = payload?.bars;
  if (!bars?.length) return null;
  const close = Number(bars[bars.length - 1]?.close);
  return Number.isFinite(close) && close > 0 ? close : null;
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

function approxPl(
  direction: "long" | "short",
  entry: number | null,
  current: number | null,
): { plApprox: number | null; plPct: number | null } {
  if (entry == null || current == null || entry <= 0) return { plApprox: null, plPct: null };
  const diff = direction === "long" ? current - entry : entry - current;
  return { plApprox: diff, plPct: (diff / entry) * 100 };
}

function sourceLabel(source: TradeLifecycle["source"]): string {
  if (source === "csv_reference") return "csv_reference";
  if (source === "hybrid") return "hybrid";
  if (source === "live_state") return "live_state";
  return "engine";
}

function tabIdForUniverseGroup(
  group: string,
  resolveTab: (group: string) => MonitoringPrimaryTabId | null,
): MonitoringPrimaryTabId {
  return resolveTab(group) ?? "all";
}

// Priority for OPEN dedup: lower = better
function openSourcePriority(src: string): number {
  if (src === "live_state") return 0;
  if (src === "engine") return 1;
  if (src === "hybrid") return 2;
  if (src === "csv_reference") return 3;
  return 4;
}

// Dedup OPEN signals by canonical symbol+direction across all strategies/tabs.
// Keeps the highest-priority source; on equal priority keeps the most recent entry.
function dedupOpenBySymbol(rows: LiveSignalRow[]): LiveSignalRow[] {
  const best = new Map<string, LiveSignalRow>();
  const nonOpen: LiveSignalRow[] = [];

  for (const row of rows) {
    if (row.status !== "OPEN") { nonOpen.push(row); continue; }
    const key = `${row.symbol}:${row.direction}`;
    const existing = best.get(key);
    if (!existing) { best.set(key, row); continue; }

    const rowPrio = openSourcePriority(row.sourceLabel);
    const existPrio = openSourcePriority(existing.sourceLabel);
    if (rowPrio < existPrio) { best.set(key, row); continue; }
    if (rowPrio === existPrio) {
      const rowMs = parseTradeTimestampValue(row.entryTime) ?? 0;
      const existMs = parseTradeTimestampValue(existing.entryTime) ?? 0;
      if (rowMs > existMs) best.set(key, row);
    }
  }

  return [...best.values(), ...nonOpen];
}

// Suppress EXIT_TODAY/ENTRY_TODAY signals that are nested inside a known OPEN trade.
// A signal is nested if: same symbol+direction, and it entered AFTER the open trade's entry.
function suppressNestedSignals(rows: LiveSignalRow[]): LiveSignalRow[] {
  const openBySymbolDir = new Map<string, LiveSignalRow>();
  for (const row of rows) {
    if (row.status === "OPEN") {
      openBySymbolDir.set(`${row.symbol}:${row.direction}`, row);
    }
  }
  if (!openBySymbolDir.size) return rows;

  return rows.filter((row) => {
    if (row.status === "OPEN") return true;
    const openRow = openBySymbolDir.get(`${row.symbol}:${row.direction}`);
    if (!openRow) return true;
    const rowEntryMs = parseTradeTimestampValue(row.entryTime) ?? 0;
    const openEntryMs = parseTradeTimestampValue(openRow.entryTime) ?? 0;
    // Suppress if this signal entered after the open trade (nested inside it)
    return rowEntryMs <= openEntryMs;
  });
}

function buildRow(
  item: LiveSignalChartScopeItem,
  trade: TradeLifecycle,
  tabId: MonitoringPrimaryTabId,
  nowMs: number,
  dayStartMs: number,
  nextDayStartMs: number,
  weekStartMs: number,
): LiveSignalRow | null {
  const entryMs = parseTradeTimestampValue(trade.entryTime);
  if (!entryMs) return null;

  const exitMs = parseTradeTimestampValue(trade.exitTime);
  const entryToday = isMsToday(entryMs, dayStartMs, nextDayStartMs);
  const exitToday = isMsToday(exitMs, dayStartMs, nextDayStartMs);
  // Closed = exited within the rolling window (but not today; today is EXIT_TODAY).
  const exitThisWeek = exitMs != null && exitMs >= (nowMs - CLOSED_WINDOW_MS) && exitMs < dayStartMs;

  const currentPrice = currentPriceFromPayload(item.payload);
  const { plApprox, plPct } = approxPl(trade.direction, trade.entryPrice, currentPrice);
  const lastCandleMs = lastBarMs(item.payload);
  const stale = isStale(lastCandleMs, item.timeframe, nowMs);

  // --- OPEN status hardening ---
  // A trade force-closed at the last data candle (exitReason "end_of_data") is not a
  // real exit — the position is still open as of the latest candle. Treat it as OPEN
  // (this is the trailing intraday signal, e.g. DAX40 2H), as long as it is recent.
  const isEndOfData = trade.exitReason === "end_of_data";
  const hasExitPrice = !isEndOfData && trade.exitPrice != null && trade.exitPrice > 0;
  const hasExitTime = !isEndOfData && Boolean(trade.exitTime);
  const entryAgeTooOld = (trade.source === "csv_reference" || trade.source === "hybrid")
    && (nowMs - entryMs) > OPEN_AGE_LIMIT_MS;
  const isIntradayItem = INTRADAY_TFS.has(String(item.timeframe || "").toUpperCase());

  let isEffectivelyOpen = (trade.isOpen || trade.status === "open" || isEndOfData)
    && !hasExitPrice
    && !hasExitTime
    && !entryAgeTooOld;

  // An end_of_data "open" only counts if the trailing position is still recent — a
  // force-close from a long-stale data file is not a current live signal.
  if (isEffectivelyOpen && isEndOfData && (nowMs - entryMs) > OPEN_AGE_LIMIT_MS) {
    isEffectivelyOpen = false;
  }

  // Intraday MT hard gate: only live_state source (or a recent end_of_data trailing
  // position) may show as OPEN. Other hybrid/csv/engine historical intraday trades must
  // not appear as current live signals — they would mark every recent candle as a signal.
  if (isEffectivelyOpen && isIntradayItem && trade.source !== "live_state" && !isEndOfData) {
    isEffectivelyOpen = false;
  }

  // Universal sanity cap: an "open" trade whose entry is absurdly old (placeholder /
  // epoch / broken timestamp, e.g. >400 days) is a data artifact, not a current live
  // signal. Drop it so it neither pollutes OFFEN nor inflates the header badge.
  if (isEffectivelyOpen && (nowMs - entryMs) > MAX_OPEN_AGE_MS) {
    isEffectivelyOpen = false;
  }

  let status: LiveSignalRow["status"] | null = null;
  if (isEffectivelyOpen) status = "OPEN";
  else if (trade.status === "exit_today" || exitToday) status = "EXIT_TODAY";
  else if (trade.status === "entry_today" || entryToday) status = "ENTRY_TODAY";
  // Trades closed earlier this week. entryAgeTooOld already drops old csv/hybrid
  // backtest trades, so this only surfaces genuinely recent closed signals.
  else if (exitThisWeek && !entryAgeTooOld) status = "EXIT_THIS_WEEK";
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
    hasStopLoss: trade.hasStopLoss,
    hasTakeProfit: trade.hasTakeProfit,
    sourceLabel: sourceLabel(trade.source),
    isOpen: isEffectivelyOpen,
    entryToday,
    exitToday,
    staleStatus: stale ? "stale_data" : "fresh",
    lastCandleTime: lastCandleMs != null ? new Date(lastCandleMs).toISOString() : null,
    dataAgeLabel: dataAgeLabel(lastCandleMs, nowMs),
    durationLabel: formatDuration(entryMs, nowMs),
    signalTimeLabel: formatSignalTime(entryMs),
    plApprox,
    plPct,
    assetId: item.assetId,
  };
}

const EMPTY_FEED: LiveSignalsFeed = {
  openTrades: [],
  exitsToday: [],
  entriesToday: [],
  openCount: 0,
  exitsTodayCount: 0,
  entriesTodayCount: 0,
  badgeCount: 0,
};

export function buildLiveSignalsFeedFromLifecycle(
  items: LiveSignalChartScopeItem[],
  tradesByItemKey: Record<string, TradeLifecycle[]>,
  resolveTab: (group: string) => MonitoringPrimaryTabId | null,
): LiveSignalsFeed {
  try {
  const nowMs = Date.now();
  const dayStartMs = startOfLocalDayMs(nowMs);
  const nextDayStartMs = dayStartMs + 24 * 60 * 60_000;
  const allRows: LiveSignalRow[] = [];

  const weekStartMs = startOfLocalWeekMs(nowMs);
  for (const item of items) {
    const tabId = tabIdForUniverseGroup(item.universeGroup ?? "", resolveTab);
    const trades = tradesByItemKey[item.key] ?? [];
    for (const trade of trades) {
      const row = buildRow(item, trade, tabId, nowMs, dayStartMs, nextDayStartMs, weekStartMs);
      if (row) allRows.push(row);
    }
  }

  // Step 1: dedup OPEN by canonical symbol+direction (eliminates ES1 double)
  const dedupedRows = dedupOpenBySymbol(allRows);

  // Step 2: suppress nested closed signals that sit inside an OPEN trade
  const cleanedRows = suppressNestedSignals(dedupedRows);

  const byNewest = (a: LiveSignalRow, b: LiveSignalRow) => {
    const am = parseTradeTimestampValue(a.entryTime) ?? 0;
    const bm = parseTradeTimestampValue(b.entryTime) ?? 0;
    return bm - am;
  };

  const byExitNewest = (a: LiveSignalRow, b: LiveSignalRow) =>
    (parseTradeTimestampValue(b.exitTime) ?? 0) - (parseTradeTimestampValue(a.exitTime) ?? 0);
  const openTrades = cleanedRows.filter((row) => row.status === "OPEN").sort(byNewest);
  const exitsToday = cleanedRows.filter((row) => row.status === "EXIT_TODAY").sort(byExitNewest);
  const entriesToday = cleanedRows.filter((row) => row.status === "ENTRY_TODAY").sort(byNewest);
  // Cap this-week-closed so a busy week can't flood the panel.
  const closedThisWeek = cleanedRows
    .filter((row) => row.status === "EXIT_THIS_WEEK")
    .sort(byExitNewest)
    .slice(0, 40);

  // badgeCount = currently actionable signals (open + today exits/entries).
  const badgeCount = openTrades.length + exitsToday.length + entriesToday.length;

  return {
    openTrades,
    exitsToday,
    entriesToday,
    closedThisWeek,
    openCount: openTrades.length,
    exitsTodayCount: exitsToday.length,
    entriesTodayCount: entriesToday.length,
    closedThisWeekCount: closedThisWeek.length,
    badgeCount,
  };
  } catch (err) {
    console.error("[buildLiveSignalsFeedFromLifecycle] Runtime error:", err);
    return EMPTY_FEED;
  }
}
