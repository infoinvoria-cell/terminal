import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";
import type { LiveSignalRow, LiveSignalsFeed } from "@/lib/monitoring/liveSignalsFeed";

export type ManualVerifiedSignalStatus = "OPEN" | "EXIT_TODAY";

export type ManualVerifiedSignal = {
  symbol: string;
  canonicalSymbol?: string;
  strategyId: string;
  group: string;
  itemKey: string;
  tabId: MonitoringPrimaryTabId;
  name: string;
  status: ManualVerifiedSignalStatus;
  direction?: "long" | "short" | null;
  entryTime?: string | null;
  entryPrice?: number | null;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  currentPrice?: number | null;
  exitTime?: string | null;
  exitPrice?: number | null;
  note?: string;
};

export type ManualVerifiedPayload = {
  schema?: string;
  updatedAt?: string;
  source?: string;
  signals?: ManualVerifiedSignal[];
};

function normalizeCanonical(symbol: string): string {
  return String(symbol || "")
    .trim()
    .replace(/[!]/g, "")
    .toUpperCase();
}

// Build a ManualVerified LiveSignalRow from the JSON entry.
// Tries to fill levels from an existing engine/lifecycle row if available.
function buildRow(
  sig: ManualVerifiedSignal,
  existingRow: LiveSignalRow | null,
): LiveSignalRow {
  const direction: "long" | "short" = sig.direction ?? existingRow?.direction ?? "long";
  const entryPrice = sig.entryPrice ?? existingRow?.entryPrice ?? null;
  const stopLossPrice = sig.stopLossPrice ?? existingRow?.stopLossPrice ?? null;
  const takeProfitPrice = sig.takeProfitPrice ?? existingRow?.takeProfitPrice ?? null;
  const currentPrice = sig.currentPrice ?? existingRow?.currentPrice ?? null;
  const exitPrice = sig.exitPrice ?? existingRow?.exitPrice ?? null;
  const entryTime = sig.entryTime ?? existingRow?.entryTime ?? "2000-01-01";
  const exitTime = sig.exitTime ?? (sig.status === "EXIT_TODAY" ? existingRow?.exitTime ?? null : null);

  const hasStopLoss = stopLossPrice != null && Number.isFinite(Number(stopLossPrice)) && Number(stopLossPrice) > 0;
  const hasTakeProfit = takeProfitPrice != null && Number.isFinite(Number(takeProfitPrice)) && Number(takeProfitPrice) > 0;

  const nowMs = Date.now();
  const entryMs = entryTime !== "2000-01-01" ? new Date(entryTime).getTime() : null;
  const durationLabel = entryMs ? formatDuration(entryMs, nowMs) : "—";
  const signalTimeLabel = entryMs
    ? new Date(entryMs).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

  let plApprox: number | null = null;
  let plPct: number | null = null;
  if (entryPrice && currentPrice && entryPrice > 0) {
    const diff = direction === "long" ? currentPrice - entryPrice : entryPrice - currentPrice;
    plApprox = diff;
    plPct = (diff / entryPrice) * 100;
  }

  return {
    id: `manual:${sig.strategyId}:${sig.status}`,
    // Reuse the real lifecycle tradeId when available so chart/trade-execution focus works
    tradeId: existingRow?.tradeId ?? `manual:${sig.strategyId}`,
    itemKey: sig.itemKey,
    tabId: sig.tabId,
    symbol: sig.symbol,
    name: sig.name,
    strategy: sig.strategyId,
    group: sig.group,
    direction,
    status: sig.status,
    entryTime,
    exitTime: exitTime ?? null,
    entryPrice,
    currentPrice,
    exitPrice,
    stopLossPrice,
    takeProfitPrice,
    hasStopLoss,
    hasTakeProfit,
    sourceLabel: "manual_verified",
    isOpen: sig.status === "OPEN",
    entryToday: false,
    exitToday: sig.status === "EXIT_TODAY",
    staleStatus: "fresh",
    lastCandleTime: null,
    dataAgeLabel: "bestätigt",
    durationLabel,
    signalTimeLabel,
    plApprox,
    plPct,
    assetId: existingRow?.assetId,
  };
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

function allRawRows(feed: LiveSignalsFeed): LiveSignalRow[] {
  return [...feed.openTrades, ...feed.exitsToday, ...feed.entriesToday];
}

function findBestExistingRow(
  allRows: LiveSignalRow[],
  sig: ManualVerifiedSignal,
): LiveSignalRow | null {
  const canonical = normalizeCanonical(sig.canonicalSymbol ?? sig.symbol);
  // First try strategyId match
  const byStrategy = allRows.find((r) =>
    String(r.strategy || "").toLowerCase() === sig.strategyId.toLowerCase(),
  );
  if (byStrategy) return byStrategy;
  // Then symbol match
  return allRows.find((r) => normalizeCanonical(r.symbol) === canonical) ?? null;
}

/** A manual_verified signal is "real" only if it carries its own data (direction,
 *  time or a level) OR matches a real engine/lifecycle row. Pure placeholders
 *  (all-null watchlist entries) are rejected. */
function isRealManualSignal(sig: ManualVerifiedSignal, existing: LiveSignalRow | null): boolean {
  if (existing) return true;
  const hasOwnDir = sig.direction === "long" || sig.direction === "short";
  const hasOwnTime = Boolean(sig.entryTime) || Boolean(sig.exitTime);
  const hasOwnLevels = (sig.entryPrice != null && sig.entryPrice > 0)
    || (sig.stopLossPrice != null && sig.stopLossPrice > 0)
    || (sig.takeProfitPrice != null && sig.takeProfitPrice > 0);
  return hasOwnDir || hasOwnTime || hasOwnLevels;
}

function symbolMatchesSig(row: LiveSignalRow, sig: ManualVerifiedSignal): boolean {
  const canonical = normalizeCanonical(sig.canonicalSymbol ?? sig.symbol);
  const rowCanonical = normalizeCanonical(row.symbol);
  return rowCanonical === canonical
    || String(row.strategy || "").toLowerCase() === sig.strategyId.toLowerCase();
}

const MAX_PANEL_ROWS = 20;

/**
 * Applies manual_verified overrides to a raw feed.
 * Priority: manual_verified signals win over everything else.
 * - Removes any existing row for the same symbol (any status)
 * - Injects the manual_verified row with the correct status + best available levels
 * - Limits total panel to MAX_PANEL_ROWS
 */
export function applyManualVerifiedOverrides(
  rawFeed: LiveSignalsFeed,
  payload: ManualVerifiedPayload | null,
): LiveSignalsFeed {
  const signals = payload?.signals;
  if (!signals?.length) {
    return capFeed(rawFeed);
  }

  const rawRows = allRawRows(rawFeed);

  // Build override rows; collect ONLY the signals that were actually applied. A skipped
  // placeholder / bogus signal must NOT suppress the real engine row — otherwise e.g.
  // the bogus ES1! EXIT_TODAY would delete ES1!'s genuine OPEN trade.
  const appliedSignals: ManualVerifiedSignal[] = [];
  const overrideOpen: LiveSignalRow[] = [];
  const overrideExit: LiveSignalRow[] = [];

  for (const sig of signals) {
    const existing = findBestExistingRow(rawRows, sig);
    // Skip pure placeholder signals: no own direction/time/levels AND no matching
    // real engine/lifecycle row. These carry no real source and must not be shown.
    if (!isRealManualSignal(sig, existing)) continue;

    // An EXIT_TODAY override needs real exit proof (exitTime or exitPrice). A bogus
    // "exit today" without exit data must NOT override the engine: e.g. ES1! is still
    // OPEN per its engine state — skipping the override lets the real OPEN row show.
    if (sig.status === "EXIT_TODAY") {
      const hasExitProof = Boolean(sig.exitTime) || (sig.exitPrice != null && sig.exitPrice > 0)
        || Boolean(existing?.exitTime) || (existing?.exitPrice != null && existing.exitPrice > 0);
      if (!hasExitProof) continue;
    }

    appliedSignals.push(sig);
    const row = buildRow(sig, existing);

    if (sig.status === "OPEN") overrideOpen.push(row);
    else if (sig.status === "EXIT_TODAY") overrideExit.push(row);
  }

  // Filter raw rows: remove anything that conflicts with an APPLIED manual signal only.
  const cleanOpen = rawFeed.openTrades.filter(
    (r) => !appliedSignals.some((sig) => symbolMatchesSig(r, sig)),
  );
  const cleanExit = rawFeed.exitsToday.filter(
    (r) => !appliedSignals.some((sig) => symbolMatchesSig(r, sig)),
  );
  const cleanEntry = rawFeed.entriesToday.filter(
    (r) => !appliedSignals.some((sig) => symbolMatchesSig(r, sig)),
  );

  const finalOpen = [...overrideOpen, ...cleanOpen];
  const finalExit = [...overrideExit, ...cleanExit];
  const finalEntry = cleanEntry;

  const total = finalOpen.length + finalExit.length + finalEntry.length;
  const excess = Math.max(0, total - MAX_PANEL_ROWS);

  // Trim oldest non-manual entries first
  const trimmedEntry = finalEntry.slice(0, Math.max(0, finalEntry.length - excess));

  // closedThisWeek is a separate bucket (not overridden by manual open/exit-today
  // signals); pass it through, dropping only rows for manually-overridden symbols.
  const closedThisWeek = (rawFeed.closedThisWeek ?? []).filter(
    (r) => !appliedSignals.some((sig) => symbolMatchesSig(r, sig)),
  );

  return {
    openTrades: finalOpen,
    exitsToday: finalExit,
    entriesToday: trimmedEntry,
    closedThisWeek,
    openCount: finalOpen.length,
    exitsTodayCount: finalExit.length,
    entriesTodayCount: trimmedEntry.length,
    closedThisWeekCount: closedThisWeek.length,
    badgeCount: finalOpen.length + finalExit.length + trimmedEntry.length,
  };
}

function capFeed(feed: LiveSignalsFeed): LiveSignalsFeed {
  const total = feed.openTrades.length + feed.exitsToday.length + feed.entriesToday.length;
  if (total <= MAX_PANEL_ROWS) return feed;
  const excess = total - MAX_PANEL_ROWS;
  const trimmed = feed.entriesToday.slice(0, Math.max(0, feed.entriesToday.length - excess));
  return {
    ...feed,
    entriesToday: trimmed,
    entriesTodayCount: trimmed.length,
    badgeCount: feed.openTrades.length + feed.exitsToday.length + trimmed.length,
  };
}
