import type { LiveSignalRow, LiveSignalsFeed } from "@/lib/monitoring/liveSignalsFeed";
import { parseTradeTimestampValue } from "@/lib/monitoring/tradeVisualNormalizer";

export type LiveCardStatus = "Open" | "Take Profit" | "Stop Loss";

export type LiveSignalCardModel = {
  id: string;
  tradeId: string;
  itemKey: string;
  tabId: LiveSignalRow["tabId"];
  symbol: string;
  name: string;
  group: string;
  strategy: string;
  sourceLabel: string;
  direction: "long" | "short";
  category: "open" | "closed";
  cardStatus: LiveCardStatus;
  entryPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  currentPrice: number | null;
  exitPrice: number | null;
  hasStopLoss: boolean;
  hasTakeProfit: boolean;
  signalMs: number | null;
  exitMs: number | null;
  plAbs: number | null;
  plPct: number | null;
  rr: number | null;
  exitReason: string | null;
  assetId?: string;
};

function num(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

function nearLevel(a: number | null, b: number | null): boolean {
  return a != null && b != null && Math.abs(a - b) / Math.max(1, Math.abs(b)) < 0.0015;
}

function realizedPl(direction: "long" | "short", entry: number | null, exit: number | null): { abs: number | null; pct: number | null } {
  if (entry == null || exit == null || entry <= 0) return { abs: null, pct: null };
  const abs = direction === "long" ? exit - entry : entry - exit;
  return { abs, pct: (abs / entry) * 100 };
}

function riskReward(entry: number | null, sl: number | null, tp: number | null): number | null {
  if (entry == null || sl == null || tp == null) return null;
  const risk = Math.abs(entry - sl);
  if (risk <= 0) return null;
  return Math.abs(tp - entry) / risk;
}

const REAL_SOURCES = new Set(["live_state", "engine", "hybrid", "csv_reference", "manual_verified"]);

/** A row is shown only if it has a real engine/monitoring source: a symbol, a tradeId,
 *  a recognised source label and a parseable signal time. The display `strategy` field
 *  can legitimately be empty ("-") for live_state rows (e.g. ES1!), so it is NOT used as
 *  a gate — the real-source proof is the sourceLabel + tradeId. */
function hasRealSource(row: LiveSignalRow): boolean {
  const validTime = parseTradeTimestampValue(row.entryTime) != null
    && (parseTradeTimestampValue(row.entryTime) ?? 0) >= 1.1e12;
  return Boolean(row.symbol && row.symbol !== "-")
    && Boolean(row.tradeId)
    && REAL_SOURCES.has(row.sourceLabel)
    && validTime;
}

function toOpenCard(row: LiveSignalRow): LiveSignalCardModel {
  const entry = num(row.entryPrice);
  const current = num(row.currentPrice);
  const pl = entry != null && current != null && entry > 0
    ? { abs: row.direction === "long" ? current - entry : entry - current, pct: ((row.direction === "long" ? current - entry : entry - current) / entry) * 100 }
    : { abs: null, pct: null };
  return {
    id: row.id, tradeId: row.tradeId, itemKey: row.itemKey, tabId: row.tabId,
    symbol: row.symbol, name: row.name, group: row.group, strategy: row.strategy, sourceLabel: row.sourceLabel,
    direction: row.direction, category: "open", cardStatus: "Open",
    entryPrice: entry, stopLossPrice: num(row.stopLossPrice), takeProfitPrice: num(row.takeProfitPrice),
    currentPrice: current, exitPrice: null, hasStopLoss: row.hasStopLoss, hasTakeProfit: row.hasTakeProfit,
    signalMs: parseTradeTimestampValue(row.entryTime), exitMs: null,
    plAbs: pl.abs, plPct: pl.pct, rr: riskReward(entry, num(row.stopLossPrice), num(row.takeProfitPrice)),
    exitReason: null, assetId: row.assetId,
  };
}

function toClosedCard(row: LiveSignalRow): LiveSignalCardModel {
  const entry = num(row.entryPrice);
  const exit = num(row.exitPrice);
  const pl = realizedPl(row.direction, entry, exit);
  // Outcome: a profitable close (or TP touch) = Take Profit; a losing close (or SL
  // touch) = Stop Loss. Derived from real entry/exit values, never faked.
  let cardStatus: LiveCardStatus;
  if (nearLevel(exit, num(row.takeProfitPrice))) cardStatus = "Take Profit";
  else if (nearLevel(exit, num(row.stopLossPrice))) cardStatus = "Stop Loss";
  else if (pl.abs != null) cardStatus = pl.abs >= 0 ? "Take Profit" : "Stop Loss";
  else cardStatus = "Stop Loss";
  const exitReason = cardStatus === "Take Profit" ? "Take Profit / Gewinn" : "Stop Loss / Verlust";
  return {
    id: row.id, tradeId: row.tradeId, itemKey: row.itemKey, tabId: row.tabId,
    symbol: row.symbol, name: row.name, group: row.group, strategy: row.strategy, sourceLabel: row.sourceLabel,
    direction: row.direction, category: "closed", cardStatus,
    entryPrice: entry, stopLossPrice: num(row.stopLossPrice), takeProfitPrice: num(row.takeProfitPrice),
    currentPrice: num(row.currentPrice), exitPrice: exit, hasStopLoss: row.hasStopLoss, hasTakeProfit: row.hasTakeProfit,
    signalMs: parseTradeTimestampValue(row.entryTime), exitMs: parseTradeTimestampValue(row.exitTime),
    plAbs: pl.abs, plPct: pl.pct, rr: riskReward(entry, num(row.stopLossPrice), num(row.takeProfitPrice)),
    exitReason, assetId: row.assetId,
  };
}

/** Collect only real Open + Closed-this-week signals from the monitoring feed.
 *  Dedups by tradeId. No placeholders, no fakes. */
export function collectRealMonitoringSignals(feed: LiveSignalsFeed): { open: LiveSignalCardModel[]; closed: LiveSignalCardModel[] } {
  const seen = new Set<string>();
  const open: LiveSignalCardModel[] = [];
  for (const row of feed.openTrades) {
    if (!hasRealSource(row)) continue;
    const key = `open:${row.tradeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    open.push(toOpenCard(row));
  }
  // Closed-this-week: an intraday strategy can close many trades in a week, which would
  // flood the panel with near-identical cards. Show the most recent close per
  // symbol+direction (newest exit first) — clean, distinct, still real.
  const closedRows = [...feed.exitsToday, ...(feed.closedThisWeek ?? [])]
    .filter(hasRealSource)
    .sort((a, b) => (parseTradeTimestampValue(b.exitTime) ?? 0) - (parseTradeTimestampValue(a.exitTime) ?? 0));
  const closed: LiveSignalCardModel[] = [];
  const closedSeen = new Set<string>();
  for (const row of closedRows) {
    const sym = String(row.symbol).replace(/[!]/g, "").toUpperCase();
    if (closedSeen.has(sym)) continue;
    closedSeen.add(sym);
    closed.push(toClosedCard(row));
  }
  return rankLiveSignalCards(open, closed);
}

/** Open: newest signal first. Closed: newest exit first. */
export function rankLiveSignalCards(
  open: LiveSignalCardModel[],
  closed: LiveSignalCardModel[],
): { open: LiveSignalCardModel[]; closed: LiveSignalCardModel[] } {
  return {
    open: [...open].sort((a, b) => (b.signalMs ?? 0) - (a.signalMs ?? 0)),
    closed: [...closed].sort((a, b) => (b.exitMs ?? b.signalMs ?? 0) - (a.exitMs ?? a.signalMs ?? 0)),
  };
}
