/** Helpers for strategy *_events.json payloads (monitoring overlay + trade panel). */
import { inferTradeClosedState } from "@/lib/monitoring/tradeVisualNormalizer";

export type EventsTradeRow = {
  direction: "long" | "short";
  entryTime: string;
  exitTime?: string | null;
  entry: number;
  sl?: number | null;
  tp?: number | null;
  exit?: number | null;
  exitReason?: string;
};

export type StrategyEventsPayloadLike = {
  openTrade?: boolean;
  openTradeRow?: EventsTradeRow | null;
  trades?: EventsTradeRow[];
  events?: unknown[];
};

function toFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function tradeRowHasResolvedExit(row: EventsTradeRow | null | undefined): boolean {
  if (!row) return false;
  const state = inferTradeClosedState({
    ...row,
    exitPrice: row.exit ?? null,
    exitDate: row.exitTime ?? null,
  });
  return !state.isOpen;
}

export function mergeTradesFromEventsPayload(payload: StrategyEventsPayloadLike | undefined | null): EventsTradeRow[] {
  if (!payload) return [];
  const raw = Array.isArray(payload.trades) ? payload.trades : [];
  if (!payload.openTrade || !payload.openTradeRow) {
    return raw;
  }
  const openRow = payload.openTradeRow;
  const last = raw.length ? raw[raw.length - 1] : null;
  const lastOpen =
    last &&
    (!String(last.exitTime || "").trim() ||
      last.exit == null ||
      !Number.isFinite(Number(last.exit)) ||
      Number(last.exit) <= 0);
  if (lastOpen) {
    return raw;
  }
  return [...raw, openRow];
}

export type ActiveSetupFromEvents = {
  statusLabel: "Open" | "No active setup";
  direction: "long" | "short" | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  hasOpenTrade: boolean;
};

export function activeSetupFromEventsPayload(payload: StrategyEventsPayloadLike | undefined | null): ActiveSetupFromEvents {
  const merged = mergeTradesFromEventsPayload(payload);
  if (!merged.length) {
    return {
      statusLabel: "No active setup",
      direction: null,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      hasOpenTrade: false,
    };
  }
  const last = merged[merged.length - 1];
  if (!tradeRowHasResolvedExit(last)) {
    const direction: "long" | "short" = last.direction === "short" ? "short" : "long";
    return {
      statusLabel: "Open",
      direction,
      entry: toFinite(last.entry),
      stopLoss: toFinite(last.sl),
      takeProfit: toFinite(last.tp),
      hasOpenTrade: true,
    };
  }
  return {
    statusLabel: "No active setup",
    direction: null,
    entry: null,
    stopLoss: null,
    takeProfit: null,
    hasOpenTrade: false,
  };
}
