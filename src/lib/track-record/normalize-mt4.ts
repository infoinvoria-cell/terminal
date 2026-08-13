/**
 * MT4 file-bridge normalizer.
 * Reads account_1 snapshot + history and maps them to NormalizedTrackRecord types.
 * Server-only. Never logs credential values.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, normalize } from "path";
import type {
  NormalizedAccountSnapshot,
  NormalizedTrade,
  NormalizedCashFlow,
  NormalizedOpenPosition,
  TradeSide,
  CashFlowType,
} from "./normalized-types";
import { readMt4FileSnapshot } from "./mt4-file-reader";

// ── Public types ──────────────────────────────────────────────────────────────

export interface Mt4NormalizeResult {
  account: NormalizedAccountSnapshot | null;
  closedTrades: NormalizedTrade[];
  openPositions: NormalizedOpenPosition[];
  cashFlows: NormalizedCashFlow[];
  warnings: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACCOUNT_ID = "account_1";
const SOURCE = "mt4_file" as const;
const SOURCE_FRESH_WINDOW = 86_400; // 24 h

function epochToUtc(epoch: number): string {
  return new Date(epoch * 1000).toISOString().replace(".000Z", "Z");
}

function isSide(s: string): s is TradeSide {
  return s === "buy" || s === "sell";
}

const CASH_FLOW_RECORD_TYPES = new Set([
  "balance", "credit", "deposit", "withdrawal", "adjustment", "fee", "other",
]);

function recordTypeToCashFlowType(rt: string, profit: number): CashFlowType {
  switch (rt) {
    case "deposit":    return "deposit";
    case "withdrawal": return "withdrawal";
    case "credit":     return "credit";
    case "fee":        return "fee";
    case "adjustment": return "adjustment";
    case "balance":    return profit >= 0 ? "deposit" : "withdrawal";
    default:           return "other";
  }
}

// ── Main normalizer ───────────────────────────────────────────────────────────

/**
 * Normalize MT4 account_1 data from snapshot and history JSON paths.
 *
 * The snapshotPath and historyPath are the resolved absolute paths to the
 * JSON files written by the MT4 EA bridge.
 *
 * If dataPath is provided instead (the MT4 terminal data directory), the
 * standard sub-paths are derived. Pass snapshotPath/historyPath directly
 * if already resolved by the caller.
 */
export function normalizeMt4(
  snapshotPath: string,
  historyPath: string,
): Mt4NormalizeResult {
  const warnings: string[] = [];
  const closedTrades: NormalizedTrade[] = [];
  const openPositions: NormalizedOpenPosition[] = [];
  const cashFlows: NormalizedCashFlow[] = [];

  // ── Read snapshot ─────────────────────────────────────────────────────────
  let account: NormalizedAccountSnapshot | null = null;

  if (!existsSync(resolve(normalize(snapshotPath)))) {
    return {
      account: null,
      closedTrades: [],
      openPositions: [],
      cashFlows: [],
      warnings: ["mt4: snapshot file not found at " + snapshotPath],
    };
  }

  let snapRaw: Record<string, unknown>;
  try {
    snapRaw = JSON.parse(readFileSync(resolve(normalize(snapshotPath)), "utf-8")) as Record<string, unknown>;
  } catch {
    return {
      account: null,
      closedTrades: [],
      openPositions: [],
      cashFlows: [],
      warnings: ["mt4: snapshot JSON parse error"],
    };
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  // Use gmt_time_epoch as the UTC reference (bridge writes GMT = UTC)
  const snapEpoch = typeof snapRaw.gmt_time_epoch === "number" ? snapRaw.gmt_time_epoch : 0;

  if (snapRaw.account_id !== ACCOUNT_ID) {
    warnings.push(`mt4: snapshot account_id mismatch (expected ${ACCOUNT_ID})`);
  }

  if (snapRaw.complete !== true) {
    warnings.push("mt4: snapshot complete flag is not true");
  }

  account = {
    accountId:     ACCOUNT_ID,
    platform:      "MT4",
    broker:        String(snapRaw.broker ?? ""),
    loginMasked:   String(snapRaw.login_masked ?? ""),
    server:        String(snapRaw.server ?? ""),
    currency:      String(snapRaw.account_currency ?? "USD"),
    balance:       Number(snapRaw.balance ?? 0),
    equity:        Number(snapRaw.equity ?? 0),
    floatingProfit:Number(snapRaw.floating_profit ?? 0),
    margin:        Number(snapRaw.margin ?? 0),
    freeMargin:    Number(snapRaw.free_margin ?? 0),
    marginLevel:   Number(snapRaw.margin_level ?? 0),
    leverage:      Number(snapRaw.leverage ?? 0),
    connected:     Boolean(snapRaw.connected),
    generatedAtUtc:  String(snapRaw.generated_at_utc ?? epochToUtc(snapEpoch)),
    generatedAtEpoch:snapEpoch,
    source:        SOURCE,
    sourceFresh:   nowEpoch - snapEpoch <= SOURCE_FRESH_WINDOW,
  };

  // ── Read history ──────────────────────────────────────────────────────────
  if (!existsSync(resolve(normalize(historyPath)))) {
    warnings.push("mt4: history file not found — no closed trades");
    return { account, closedTrades, openPositions, cashFlows, warnings };
  }

  let histRaw: Record<string, unknown>;
  try {
    histRaw = JSON.parse(readFileSync(resolve(normalize(historyPath)), "utf-8")) as Record<string, unknown>;
  } catch {
    warnings.push("mt4: history JSON parse error");
    return { account, closedTrades, openPositions, cashFlows, warnings };
  }

  if (!Array.isArray(histRaw.trades)) {
    warnings.push("mt4: history.trades is not an array");
    return { account, closedTrades, openPositions, cashFlows, warnings };
  }

  const utcOffsetSeconds = typeof histRaw.server_utc_offset_seconds === "number"
    ? histRaw.server_utc_offset_seconds
    : (typeof snapRaw.server_utc_offset_seconds === "number" ? snapRaw.server_utc_offset_seconds : 0);

  // The MT4 bridge writes server-time epochs; subtract UTC offset to get UTC
  function serverEpochToUtcEpoch(serverEpoch: number): number {
    return serverEpoch - utcOffsetSeconds;
  }

  const seenTickets = new Set<number>();

  for (const rawTrade of histRaw.trades as Record<string, unknown>[]) {
    const ticket = Number(rawTrade.ticket);
    if (!Number.isFinite(ticket) || ticket <= 0) {
      warnings.push("mt4: skipping record with invalid ticket");
      continue;
    }
    if (seenTickets.has(ticket)) {
      warnings.push(`mt4: duplicate ticket ${ticket} — skipped`);
      continue;
    }
    seenTickets.add(ticket);

    const recordType = String(rawTrade.record_type ?? "trade").toLowerCase();
    const orderType  = String(rawTrade.order_type ?? "").toLowerCase();
    const profit     = Number(rawTrade.profit ?? 0);
    const commission = Number(rawTrade.commission ?? 0);
    const swap       = Number(rawTrade.swap ?? 0);
    const openServerEpoch  = Number(rawTrade.open_time_server_epoch ?? 0);
    const closeServerEpoch = Number(rawTrade.close_time_server_epoch ?? 0);
    const openUtcEpoch  = serverEpochToUtcEpoch(openServerEpoch);
    const closeUtcEpoch = serverEpochToUtcEpoch(closeServerEpoch);

    // ── Cash-flow records ─────────────────────────────────────────────────
    if (CASH_FLOW_RECORD_TYPES.has(recordType) && recordType !== "trade") {
      const cfType = recordTypeToCashFlowType(recordType, profit);
      cashFlows.push({
        id:           `${ACCOUNT_ID}_${ticket}`,
        accountId:    ACCOUNT_ID,
        sourceTicket: ticket,
        type:         cfType,
        timeUtc:      epochToUtc(closeUtcEpoch || openUtcEpoch),
        timeEpoch:    closeUtcEpoch || openUtcEpoch,
        amount:       profit,
        currency:     account.currency,
        comment:      String(rawTrade.comment ?? ""),
        source:       SOURCE,
      });
      continue;
    }

    // ── Closed trade records ──────────────────────────────────────────────
    if (recordType === "trade" || !CASH_FLOW_RECORD_TYPES.has(recordType)) {
      const side: TradeSide = isSide(orderType) ? orderType : "buy";
      const grossProfit = profit;
      const netProfit   = grossProfit + commission + swap;

      closedTrades.push({
        id:             `${ACCOUNT_ID}_${ticket}`,
        accountId:      ACCOUNT_ID,
        sourceTicket:   ticket,
        platform:       "MT4",
        broker:         account.broker,
        symbol:         String(rawTrade.symbol ?? ""),
        side,
        volume:         Number(rawTrade.lots ?? 0),
        openTimeUtc:    epochToUtc(openUtcEpoch),
        openTimeEpoch:  openUtcEpoch,
        closeTimeUtc:   epochToUtc(closeUtcEpoch),
        closeTimeEpoch: closeUtcEpoch,
        openPrice:      Number(rawTrade.open_price ?? 0),
        closePrice:     Number(rawTrade.close_price ?? 0),
        stopLoss:       Number(rawTrade.stop_loss ?? 0),
        takeProfit:     Number(rawTrade.take_profit ?? 0),
        grossProfit,
        commission,
        swap,
        fees:           0,
        netProfit,
        magicNumber:    Number(rawTrade.magic_number ?? 0),
        comment:        String(rawTrade.comment ?? ""),
        status:         "closed",
        source:         SOURCE,
      });
    }
  }

  return { account, closedTrades, openPositions, cashFlows, warnings };
}

/**
 * Convenience wrapper that takes the MT4 terminal dataPath and accountId,
 * resolves the standard file paths, and delegates to normalizeMt4().
 */
export function normalizeMt4FromDataPath(
  dataPath: string,
  accountId = ACCOUNT_ID,
): Mt4NormalizeResult {
  const base = resolve(normalize(dataPath), "MQL4", "Files", "capitalife");
  const snapshotPath = resolve(base, `${accountId}-snapshot.json`);
  const historyPath  = resolve(base, `${accountId}-history.json`);
  return normalizeMt4(snapshotPath, historyPath);
}

// ── Legacy CSV import types ───────────────────────────────────────────────────

interface LegacyHistoryFile {
  schemaVersion:          number;
  accountId:              string;
  serverUtcOffsetSeconds: number;
  cutoffDate:             string;
  closedTrades:           NormalizedTrade[];
  cashFlows:              NormalizedCashFlow[];
  warnings:               string[];
}

/**
 * Normalize MT4 account_1 data from snapshot + bridge history, then MERGE
 * pre-bridge legacy records from the optional legacyHistoryPath.
 *
 * Merge rules:
 * - Legacy records (before cutoffDate) are loaded first.
 * - Bridge records are appended.
 * - Deduplication: if the same sourceTicket appears in both, bridge wins.
 * - Sort: final lists are sorted chronologically.
 */
export function normalizeMt4WithLegacy(
  snapshotPath: string,
  historyPath:  string,
  legacyHistoryPath?: string,
): Mt4NormalizeResult {
  const bridgeResult = normalizeMt4(snapshotPath, historyPath);
  const warnings = [...bridgeResult.warnings];

  if (!legacyHistoryPath || !existsSync(resolve(normalize(legacyHistoryPath)))) {
    return bridgeResult;
  }

  let legacyRaw: LegacyHistoryFile;
  try {
    legacyRaw = JSON.parse(
      readFileSync(resolve(normalize(legacyHistoryPath)), "utf-8")
    ) as LegacyHistoryFile;
  } catch {
    warnings.push("mt4-legacy: legacy history file could not be parsed");
    return { ...bridgeResult, warnings };
  }

  if (legacyRaw.accountId !== ACCOUNT_ID) {
    warnings.push(
      `mt4-legacy: account_id mismatch in legacy file (expected ${ACCOUNT_ID}, got ${legacyRaw.accountId})`
    );
  }

  warnings.push(
    ...legacyRaw.warnings.map((w) => `mt4-legacy: ${w}`)
  );

  // Deduplicate: bridge records by sourceTicket take priority
  const bridgeTickets = new Set(bridgeResult.closedTrades.map((t) => t.sourceTicket));
  const bridgeCfTickets = new Set(bridgeResult.cashFlows.map((cf) => cf.sourceTicket));

  const legacyTradeCount    = legacyRaw.closedTrades?.length ?? 0;
  const legacyCfCount       = legacyRaw.cashFlows?.length ?? 0;

  const legacyTrades: NormalizedTrade[] = (legacyRaw.closedTrades ?? []).filter((t) => {
    if (bridgeTickets.has(t.sourceTicket)) {
      // Duplicate — bridge version kept; this is expected for overlap period
      return false;
    }
    return true;
  });

  const legacyCashFlows: NormalizedCashFlow[] = (legacyRaw.cashFlows ?? []).filter((cf) => {
    if (bridgeCfTickets.has(cf.sourceTicket)) return false;
    return true;
  });

  const mergedTrades = [...legacyTrades, ...bridgeResult.closedTrades].sort(
    (a, b) => a.closeTimeEpoch - b.closeTimeEpoch || a.sourceTicket - b.sourceTicket
  );

  const mergedCashFlows = [...legacyCashFlows, ...bridgeResult.cashFlows].sort(
    (a, b) => a.timeEpoch - b.timeEpoch
  );

  warnings.push(
    `mt4-legacy: merged ${legacyTradeCount} legacy trades + ${bridgeResult.closedTrades.length} bridge trades → ${mergedTrades.length} total (deduplicated from legacy: ${legacyTradeCount - legacyTrades.length} overlap)`
  );

  warnings.push(
    `mt4-legacy: merged ${legacyCfCount} legacy cashflows + ${bridgeResult.cashFlows.length} bridge cashflows → ${mergedCashFlows.length} total`
  );

  return {
    account:       bridgeResult.account,
    closedTrades:  mergedTrades,
    openPositions: bridgeResult.openPositions,
    cashFlows:     mergedCashFlows,
    warnings,
  };
}
