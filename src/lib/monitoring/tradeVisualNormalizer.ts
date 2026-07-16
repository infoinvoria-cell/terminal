export type TradeVisualLooseRow = {
  direction?: string | null;
  entryTime?: string | null;
  exitTime?: string | null;
  entry?: number | null;
  sl?: number | null;
  tp?: number | null;
  exit?: number | null;
  [key: string]: unknown;
};

export const TRADE_ENTRY_KEYS = ["entryPrice", "entry", "openPrice", "entry_price", "avgEntryPrice", "price"] as const;
export const TRADE_TP_KEYS = ["takeProfitPrice", "takeProfit", "tp", "targetPrice", "target", "take_profit", "take_profit_price", "profitTarget", "limitPrice", "limit"] as const;
export const TRADE_SL_KEYS = ["stopLossPrice", "stopLoss", "sl", "stopPrice", "stop", "stop_loss", "stop_loss_price", "initialStop", "protectiveStop"] as const;
export const TRADE_EXIT_KEYS = ["exitPrice", "exit", "closePrice", "exit_price"] as const;
export const TRADE_ENTRY_TIME_KEYS = ["entryTime", "entryDate", "entry_time", "openTime", "open_time", "timestamp", "time"] as const;
export const TRADE_EXIT_TIME_KEYS = ["exitTime", "exitDate", "exit_time", "closeTime", "close_time"] as const;
export const TRADE_DIRECTION_KEYS = ["direction", "side", "tradeSide", "positionSide", "signalDirection"] as const;
export const TRADE_STATUS_KEYS = ["status", "tradeStatus", "positionStatus"] as const;

export type TradeVisualLevelSource =
  | "primary_direct"
  | "reference_event_direct"
  | "hybrid_event_direct"
  | "original_strategy_event_direct"
  | "generated_monitoring_event_direct"
  | "csv_field"
  | "strategy_param_reconstruction"
  | "level_missing_in_all_sources";

export type TradeLevelNormalizationSource<T extends TradeVisualLooseRow> = {
  source: TradeVisualLevelSource;
  rows: T[];
};

export type TradeLevelNormalizationAudit = {
  tradesTotal: number;
  tradesWithEntry: number;
  tradesWithTPBeforeEnrichment: number;
  tradesWithSLBeforeEnrichment: number;
  tradesWithTPAfterEnrichment: number;
  tradesWithSLAfterEnrichment: number;
  tpLevelSourceCounts: Record<string, number>;
  slLevelSourceCounts: Record<string, number>;
  missingTPReason: Record<string, number>;
  missingSLReason: Record<string, number>;
  first20MissingTP: string[];
  first20MissingSL: string[];
};

export type NormalizedTradeVisualLevel = {
  tradeId: string;
  strategyId: string | null;
  symbol: string | null;
  timeframe: string | null;
  direction: "long" | "short";
  entryTime: string;
  entryPrice: number | null;
  exitTime: string | null;
  exitPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  isOpen: boolean;
  levelSource: {
    entry: TradeVisualLevelSource;
    exit: TradeVisualLevelSource;
    stopLoss: TradeVisualLevelSource;
    takeProfit: TradeVisualLevelSource;
  };
  missingLevelReason: {
    stopLoss: string | null;
    takeProfit: string | null;
  };
};

export function normalizeTradeTimeValue(value: string | null | undefined): string {
  return String(value || "").trim().replace(/ZZ$/i, "Z");
}

/** Matches an explicit timezone designator at the end of an ISO timestamp:
 *  a trailing "Z" or a numeric offset like "+02:00", "+0200" or "-01:00".
 *  Intraday strategy events (DAX 1H/2H) store entryTime in Europe/Berlin local
 *  time WITH offset (e.g. "2026-05-04T09:00:00+02:00"). Appending "Z" to such a
 *  string produces an invalid date ("...+02:00Z") and silently drops the marker. */
const ISO_TZ_DESIGNATOR = /([Zz]|[+-]\d{2}:?\d{2})$/;

export function parseTradeTimestampValue(value: string | null | undefined): number | null {
  const raw = normalizeTradeTimeValue(value);
  if (!raw) return null;
  // Preserve an existing offset / Z; only assume UTC when none is present.
  const iso = raw.includes("T")
    ? (ISO_TZ_DESIGNATOR.test(raw) ? raw : `${raw}Z`)
    : `${raw}T00:00:00Z`;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function pickTradeStringFromKeys(row: unknown, keys: readonly string[]): string {
  const obj = row as Record<string, unknown> | null | undefined;
  if (!obj) return "";
  for (const key of keys) {
    const value = String(obj[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function pickTradeNumberFromKeys(row: unknown, keys: readonly string[]): number | null {
  const obj = row as Record<string, unknown> | null | undefined;
  if (!obj) return null;
  for (const key of keys) {
    const value = Number(obj[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

export function normalizeTradeDirection(row: unknown): "long" | "short" {
  const raw = pickTradeStringFromKeys(row, TRADE_DIRECTION_KEYS) || "long";
  const key = raw.trim().toLowerCase();
  return key.includes("short") || key === "sell" ? "short" : "long";
}

function parseLooseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "true" || text === "1" || text === "yes") return true;
  if (text === "false" || text === "0" || text === "no") return false;
  return null;
}

export function inferTradeClosedState(row: unknown): {
  isOpen: boolean;
  hasExitTime: boolean;
  hasExitPrice: boolean;
  explicitOpen: boolean;
  explicitClosed: boolean;
} {
  const status = pickTradeStringFromKeys(row, TRADE_STATUS_KEYS).toLowerCase();
  const isOpenFlag = parseLooseBoolean((row as Record<string, unknown> | null | undefined)?.isOpen);
  const closedFlag = parseLooseBoolean((row as Record<string, unknown> | null | undefined)?.closed);
  const exitReason = String((row as Record<string, unknown> | null | undefined)?.exit_reason ?? (row as Record<string, unknown> | null | undefined)?.exitReason ?? "").trim().toLowerCase();
  const hasExitTime = Boolean(pickTradeStringFromKeys(row, TRADE_EXIT_TIME_KEYS));
  const hasExitPrice = pickTradeNumberFromKeys(row, TRADE_EXIT_KEYS) != null;
  const explicitOpen = isOpenFlag === true || status === "open" || closedFlag === false;
  const explicitClosed = status === "closed" || status === "exit" || closedFlag === true || exitReason === "closed" || exitReason === "exit";
  const closedByExitPair = hasExitTime && hasExitPrice;
  const isClosed = explicitOpen ? false : (explicitClosed || closedByExitPair);
  return {
    isOpen: !isClosed,
    hasExitTime,
    hasExitPrice,
    explicitOpen,
    explicitClosed,
  };
}

export function tradeIdentityKey(row: TradeVisualLooseRow): string {
  const direction = normalizeTradeDirection(row);
  const entryTime = normalizeTradeTimeValue(
    pickTradeStringFromKeys(row, TRADE_ENTRY_TIME_KEYS) || row.entryTime || null,
  );
  const exitTime = normalizeTradeTimeValue(
    pickTradeStringFromKeys(row, TRADE_EXIT_TIME_KEYS) || row.exitTime || null,
  );
  const entry = pickTradeNumberFromKeys(row, TRADE_ENTRY_KEYS) ?? Number(row.entry ?? 0);
  const exit = pickTradeNumberFromKeys(row, TRADE_EXIT_KEYS) ?? Number(row.exit ?? 0);
  return [direction, entryTime, exitTime, Number(entry), Number(exit)].join("|");
}

function rowHasTpSl(row: unknown): boolean {
  return pickTradeNumberFromKeys(row, TRADE_SL_KEYS) != null || pickTradeNumberFromKeys(row, TRADE_TP_KEYS) != null;
}

export function findBestFallbackTrade<T extends TradeVisualLooseRow>(primaryRow: T, fallbackRows: T[]): T | null {
  const exact = fallbackRows.find((row) => tradeIdentityKey(row) === tradeIdentityKey(primaryRow));
  if (exact) return exact;

  const pDirection = normalizeTradeDirection(primaryRow);
  const pEntry = pickTradeNumberFromKeys(primaryRow, TRADE_ENTRY_KEYS);
  const pEntryTimeRaw = pickTradeStringFromKeys(primaryRow, TRADE_ENTRY_TIME_KEYS) || primaryRow.entryTime || "";
  const pEntryTimeMs = parseTradeTimestampValue(pEntryTimeRaw);
  const pEntryDay = normalizeTradeTimeValue(pEntryTimeRaw).slice(0, 10);
  const pExitTimeMs = parseTradeTimestampValue(
    pickTradeStringFromKeys(primaryRow, TRADE_EXIT_TIME_KEYS) || primaryRow.exitTime || null,
  );

  let best: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of fallbackRows) {
    const cDirection = normalizeTradeDirection(candidate);
    if (cDirection !== pDirection) continue;

    const cEntry = pickTradeNumberFromKeys(candidate, TRADE_ENTRY_KEYS);
    const cEntryTimeRaw = pickTradeStringFromKeys(candidate, TRADE_ENTRY_TIME_KEYS) || candidate.entryTime || "";
    const cEntryTimeMs = parseTradeTimestampValue(cEntryTimeRaw);
    const cEntryDay = normalizeTradeTimeValue(cEntryTimeRaw).slice(0, 10);
    const cExitTimeMs = parseTradeTimestampValue(
      pickTradeStringFromKeys(candidate, TRADE_EXIT_TIME_KEYS) || candidate.exitTime || null,
    );

    let timeScore = 5;
    if (pEntryTimeMs != null && cEntryTimeMs != null) {
      const diff = Math.abs(pEntryTimeMs - cEntryTimeMs);
      const toleranceMs = 3 * 24 * 60 * 60 * 1000;
      if (diff > toleranceMs) continue;
      timeScore = diff / toleranceMs;
    } else if (pEntryDay && cEntryDay) {
      if (pEntryDay !== cEntryDay) continue;
      timeScore = 0;
    }

    let priceScore = 1;
    if (pEntry != null && cEntry != null) {
      const diff = Math.abs(pEntry - cEntry);
      const tolerance = Math.max(0.0001, pEntry * 0.01);
      if (diff > tolerance) continue;
      priceScore = diff / tolerance;
    }

    let exitScore = 0.25;
    if (pExitTimeMs != null && cExitTimeMs != null) {
      const exitDiff = Math.abs(pExitTimeMs - cExitTimeMs);
      exitScore = Math.min(0.25, exitDiff / (7 * 24 * 60 * 60 * 1000));
    }

    const score = timeScore * 1.5 + priceScore + exitScore + (rowHasTpSl(candidate) ? -0.2 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

export function enrichTradesWithFallbackGroups<T extends TradeVisualLooseRow>(primary: T[], fallbackGroups: T[][]): T[] {
  if (!primary.length) return primary;
  const fallbackRows = fallbackGroups.flat().filter(Boolean);
  if (!fallbackRows.length) return primary;

  return primary.map((row) => {
    const match = findBestFallbackTrade(row, fallbackRows);
    if (!match) return row;
    return {
      ...row,
      entry: pickTradeNumberFromKeys(row, TRADE_ENTRY_KEYS) ?? pickTradeNumberFromKeys(match, TRADE_ENTRY_KEYS) ?? row.entry ?? null,
      sl: pickTradeNumberFromKeys(row, TRADE_SL_KEYS) ?? pickTradeNumberFromKeys(match, TRADE_SL_KEYS) ?? row.sl ?? null,
      tp: pickTradeNumberFromKeys(row, TRADE_TP_KEYS) ?? pickTradeNumberFromKeys(match, TRADE_TP_KEYS) ?? row.tp ?? null,
      exit: pickTradeNumberFromKeys(row, TRADE_EXIT_KEYS) ?? pickTradeNumberFromKeys(match, TRADE_EXIT_KEYS) ?? row.exit ?? null,
      exitReason:
        String((row as Record<string, unknown>)?.exitReason ?? "").trim()
          ? (row as Record<string, unknown>).exitReason
          : (match as Record<string, unknown>)?.exitReason,
    } as T;
  });
}

function tradeEntryDay(row: TradeVisualLooseRow): string {
  const raw = pickTradeStringFromKeys(row, TRADE_ENTRY_TIME_KEYS) || row.entryTime || "";
  return normalizeTradeTimeValue(raw).slice(0, 10);
}

function toIsoTime(raw: string): string {
  const normalized = normalizeTradeTimeValue(raw);
  if (!normalized) return "";
  if (normalized.includes("T")) {
    return normalized.endsWith("Z") ? normalized : `${normalized}Z`;
  }
  return `${normalized}T00:00:00Z`;
}

function shiftIsoDay(day: string, deltaDays: number): string {
  const base = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(base.getTime())) return day;
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function parseMs(raw: string): number | null {
  const iso = toIsoTime(raw);
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

type IndexedSource<T extends TradeVisualLooseRow> = {
  source: TradeVisualLevelSource;
  byIdentity: Map<string, T[]>;
  byDirectionDay: Map<string, T[]>;
  allByDirection: Map<"long" | "short", T[]>;
};

function indexSourceRows<T extends TradeVisualLooseRow>(source: TradeVisualLevelSource, rows: T[]): IndexedSource<T> {
  const byIdentity = new Map<string, T[]>();
  const byDirectionDay = new Map<string, T[]>();
  const allByDirection = new Map<"long" | "short", T[]>([["long", []], ["short", []]]);
  for (const row of rows) {
    const id = tradeIdentityKey(row);
    const direction = normalizeTradeDirection(row);
    const day = tradeEntryDay(row);
    const idRows = byIdentity.get(id) ?? [];
    idRows.push(row);
    byIdentity.set(id, idRows);
    const dayKey = `${direction}|${day}`;
    const dayRows = byDirectionDay.get(dayKey) ?? [];
    dayRows.push(row);
    byDirectionDay.set(dayKey, dayRows);
    allByDirection.set(direction, [...(allByDirection.get(direction) ?? []), row]);
  }
  return {
    source,
    byIdentity,
    byDirectionDay,
    allByDirection,
  };
}

function matchBestCandidate<T extends TradeVisualLooseRow>(primary: T, index: IndexedSource<T>): T | null {
  const exactRows = index.byIdentity.get(tradeIdentityKey(primary));
  if (exactRows?.length) return exactRows[0] ?? null;

  const direction = normalizeTradeDirection(primary);
  const baseDay = tradeEntryDay(primary);
  const baseEntry = pickTradeNumberFromKeys(primary, TRADE_ENTRY_KEYS);
  const baseEntryTimeMs = parseMs(pickTradeStringFromKeys(primary, TRADE_ENTRY_TIME_KEYS) || primary.entryTime || "");

  let candidates: T[] = [];
  if (baseDay) {
    for (let d = -3; d <= 3; d += 1) {
      const day = shiftIsoDay(baseDay, d);
      const dayRows = index.byDirectionDay.get(`${direction}|${day}`) ?? [];
      if (dayRows.length) candidates.push(...dayRows);
    }
  }
  if (!candidates.length) {
    candidates = index.allByDirection.get(direction) ?? [];
  }
  if (!candidates.length) return null;

  let best: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const cEntry = pickTradeNumberFromKeys(candidate, TRADE_ENTRY_KEYS);
    const cEntryTimeMs = parseMs(
      pickTradeStringFromKeys(candidate, TRADE_ENTRY_TIME_KEYS) || candidate.entryTime || "",
    );
    let timeScore = 1.0;
    if (baseEntryTimeMs != null && cEntryTimeMs != null) {
      const diffMs = Math.abs(baseEntryTimeMs - cEntryTimeMs);
      const maxMs = 3 * 24 * 60 * 60 * 1000;
      if (diffMs > maxMs) continue;
      timeScore = diffMs / maxMs;
    }
    let priceScore = 0.5;
    if (baseEntry != null && cEntry != null) {
      const tolerance = Math.max(0.0001, Math.abs(baseEntry) * 0.015);
      const diff = Math.abs(baseEntry - cEntry);
      if (diff > tolerance) continue;
      priceScore = diff / tolerance;
    }
    const levelBonus = (pickTradeNumberFromKeys(candidate, TRADE_SL_KEYS) != null ? 0.15 : 0)
      + (pickTradeNumberFromKeys(candidate, TRADE_TP_KEYS) != null ? 0.15 : 0);
    const score = timeScore * 0.8 + priceScore * 0.8 - levelBonus;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

export function normalizeTradeVisualLevels<T extends TradeVisualLooseRow>(params: {
  primaryTrades: T[];
  fallbackSources: Array<TradeLevelNormalizationSource<T>>;
  strategyId?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
}): {
  normalizedTrades: T[];
  visualLevels: NormalizedTradeVisualLevel[];
  audit: TradeLevelNormalizationAudit;
} {
  const primaryTrades = Array.isArray(params.primaryTrades) ? params.primaryTrades : [];
  const fallbackSources = Array.isArray(params.fallbackSources) ? params.fallbackSources : [];
  const indexes = fallbackSources
    .map((row) => indexSourceRows(row.source, Array.isArray(row.rows) ? row.rows : []))
    .filter((row) => row.byIdentity.size > 0 || row.byDirectionDay.size > 0);

  const normalizedTrades: T[] = [];
  const visualLevels: NormalizedTradeVisualLevel[] = [];
  const tpLevelSourceCounts: Record<string, number> = {};
  const slLevelSourceCounts: Record<string, number> = {};
  const missingTPReason: Record<string, number> = {};
  const missingSLReason: Record<string, number> = {};
  const first20MissingTP: string[] = [];
  const first20MissingSL: string[] = [];

  let tradesWithEntry = 0;
  let tpBefore = 0;
  let slBefore = 0;
  let tpAfter = 0;
  let slAfter = 0;

  for (let idx = 0; idx < primaryTrades.length; idx += 1) {
    const row = primaryTrades[idx];
    const entryTime = normalizeTradeTimeValue(
      pickTradeStringFromKeys(row, TRADE_ENTRY_TIME_KEYS) || row.entryTime || "",
    );
    const exitTimeRaw = normalizeTradeTimeValue(
      pickTradeStringFromKeys(row, TRADE_EXIT_TIME_KEYS) || row.exitTime || "",
    );
    const direction = normalizeTradeDirection(row);
    const entryPrice = pickTradeNumberFromKeys(row, TRADE_ENTRY_KEYS);
    const exitPrice = pickTradeNumberFromKeys(row, TRADE_EXIT_KEYS);
    let stopLossPrice = pickTradeNumberFromKeys(row, TRADE_SL_KEYS);
    let takeProfitPrice = pickTradeNumberFromKeys(row, TRADE_TP_KEYS);
    const beforeSl = stopLossPrice != null;
    const beforeTp = takeProfitPrice != null;
    if (entryPrice != null) tradesWithEntry += 1;
    if (beforeSl) slBefore += 1;
    if (beforeTp) tpBefore += 1;

    let slSource: TradeVisualLevelSource = beforeSl ? "primary_direct" : "level_missing_in_all_sources";
    let tpSource: TradeVisualLevelSource = beforeTp ? "primary_direct" : "level_missing_in_all_sources";

    if (stopLossPrice == null || takeProfitPrice == null) {
      for (const sourceIndex of indexes) {
        const matched = matchBestCandidate(row, sourceIndex);
        if (!matched) continue;
        if (stopLossPrice == null) {
          const matchedSl = pickTradeNumberFromKeys(matched, TRADE_SL_KEYS);
          if (matchedSl != null) {
            stopLossPrice = matchedSl;
            slSource = sourceIndex.source;
          }
        }
        if (takeProfitPrice == null) {
          const matchedTp = pickTradeNumberFromKeys(matched, TRADE_TP_KEYS);
          if (matchedTp != null) {
            takeProfitPrice = matchedTp;
            tpSource = sourceIndex.source;
          }
        }
        if (stopLossPrice != null && takeProfitPrice != null) break;
      }
    }

    if (stopLossPrice != null) slAfter += 1;
    if (takeProfitPrice != null) tpAfter += 1;

    slLevelSourceCounts[slSource] = (slLevelSourceCounts[slSource] ?? 0) + 1;
    tpLevelSourceCounts[tpSource] = (tpLevelSourceCounts[tpSource] ?? 0) + 1;

    const missingSl = stopLossPrice == null ? "level_missing_in_all_sources" : null;
    const missingTp = takeProfitPrice == null ? "level_missing_in_all_sources" : null;
    if (missingSl) {
      missingSLReason[missingSl] = (missingSLReason[missingSl] ?? 0) + 1;
      if (first20MissingSL.length < 20) {
        first20MissingSL.push(`${params.strategyId ?? "unknown"}:${entryTime || `trade-${idx + 1}`}`);
      }
    }
    if (missingTp) {
      missingTPReason[missingTp] = (missingTPReason[missingTp] ?? 0) + 1;
      if (first20MissingTP.length < 20) {
        first20MissingTP.push(`${params.strategyId ?? "unknown"}:${entryTime || `trade-${idx + 1}`}`);
      }
    }

    const nextRow = {
      ...row,
      entry: entryPrice ?? row.entry ?? null,
      sl: stopLossPrice ?? null,
      tp: takeProfitPrice ?? null,
      exit: exitPrice ?? row.exit ?? null,
    } as T;
    normalizedTrades.push(nextRow);

    const tradeId = `${params.strategyId ?? params.symbol ?? "trade"}_${idx + 1}`;
    const openState = inferTradeClosedState({
      ...row,
      exitTime: exitTimeRaw || null,
      exitPrice,
      exit: exitPrice,
    });
    const isOpen = openState.isOpen;
    visualLevels.push({
      tradeId,
      strategyId: params.strategyId ?? null,
      symbol: params.symbol ?? null,
      timeframe: params.timeframe ?? null,
      direction,
      entryTime,
      entryPrice,
      exitTime: exitTimeRaw || null,
      exitPrice,
      stopLossPrice,
      takeProfitPrice,
      isOpen,
      levelSource: {
        entry: entryPrice != null ? "primary_direct" : "level_missing_in_all_sources",
        exit: exitPrice != null ? "primary_direct" : "level_missing_in_all_sources",
        stopLoss: slSource,
        takeProfit: tpSource,
      },
      missingLevelReason: {
        stopLoss: missingSl,
        takeProfit: missingTp,
      },
    });
  }

  return {
    normalizedTrades,
    visualLevels,
    audit: {
      tradesTotal: primaryTrades.length,
      tradesWithEntry,
      tradesWithTPBeforeEnrichment: tpBefore,
      tradesWithSLBeforeEnrichment: slBefore,
      tradesWithTPAfterEnrichment: tpAfter,
      tradesWithSLAfterEnrichment: slAfter,
      tpLevelSourceCounts,
      slLevelSourceCounts,
      missingTPReason,
      missingSLReason,
      first20MissingTP,
      first20MissingSL,
    },
  };
}
