/**
 * Top-level assembler: merges MT4 + MT5 data into a NormalizedTrackRecord.
 * Server-only. No I/O side-effects except reading from filesystem.
 */

import { existsSync, readFileSync } from "fs";
import { resolve, normalize } from "path";
import type {
  NormalizedTrackRecord,
  NormalizedAccountSnapshot,
  NormalizedTrade,
  NormalizedCashFlow,
  NormalizedOpenPosition,
  EquitySnapshot,
  BalanceCurvePoint,
  PerformanceKpis,
} from "./normalized-types";
import { normalizeMt4WithLegacy } from "./normalize-mt4";
import { normalizeMt5 } from "./normalize-mt5";
import {
  buildBalanceCurve,
  buildCombinedBalanceCurve,
  computePerformanceKpis,
} from "./build-track-record";

export const TRACK_RECORD_SCHEMA_VERSION = 1;

export interface AssembleOptions {
  mt4SnapshotPath: string;
  mt4HistoryPath: string;
  mt5SnapshotPath: string;
  equitySnapshotsPath: string;
  /** Optional: path to legacy pre-bridge CSV import file */
  legacyHistoryPath?: string;
}

export function assembleTrackRecord(opts: AssembleOptions): NormalizedTrackRecord {
  const {
    mt4SnapshotPath,
    mt4HistoryPath,
    mt5SnapshotPath,
    equitySnapshotsPath,
    legacyHistoryPath,
  } = opts;

  const warnings: string[] = [];
  const sourceStatus: Record<string, { ok: boolean; reason?: string }> = {};

  // Collect everything
  const accounts: NormalizedAccountSnapshot[] = [];
  const allTrades: NormalizedTrade[] = [];
  const allPositions: NormalizedOpenPosition[] = [];
  const allCashFlows: NormalizedCashFlow[] = [];

  // ── MT4 ───────────────────────────────────────────────────────────────────
  try {
    const mt4 = normalizeMt4WithLegacy(mt4SnapshotPath, mt4HistoryPath, legacyHistoryPath);
    if (mt4.account) accounts.push(mt4.account);
    allTrades.push(...mt4.closedTrades);
    allPositions.push(...mt4.openPositions);
    allCashFlows.push(...mt4.cashFlows);
    warnings.push(...mt4.warnings.map((w) => `[account_1] ${w}`));
    sourceStatus["account_1"] = {
      ok: mt4.account !== null,
      reason: mt4.warnings[0],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`[account_1] failed: ${msg}`);
    sourceStatus["account_1"] = { ok: false, reason: msg };
  }

  // ── MT5 ───────────────────────────────────────────────────────────────────
  try {
    const mt5 = normalizeMt5(mt5SnapshotPath);
    if (mt5.account) accounts.push(mt5.account);
    allTrades.push(...mt5.closedTrades);
    allPositions.push(...mt5.openPositions);
    allCashFlows.push(...mt5.cashFlows);
    warnings.push(...mt5.warnings.map((w) => `[account_2] ${w}`));
    sourceStatus["account_2"] = {
      ok: mt5.account !== null,
      reason: mt5.warnings[0],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`[account_2] failed: ${msg}`);
    sourceStatus["account_2"] = { ok: false, reason: msg };
  }

  // ── Deduplication guard (cross-account) ───────────────────────────────────
  const seenTradeIds = new Set<string>();
  const dedupedTrades = allTrades.filter((t) => {
    if (seenTradeIds.has(t.id)) {
      warnings.push(`duplicate trade id across accounts: ${t.id}`);
      return false;
    }
    seenTradeIds.add(t.id);
    return true;
  });

  const seenPositionIds = new Set<string>();
  const dedupedPositions = allPositions.filter((p) => {
    if (seenPositionIds.has(p.id)) {
      warnings.push(`duplicate position id across accounts: ${p.id}`);
      return false;
    }
    seenPositionIds.add(p.id);
    return true;
  });

  const seenCfIds = new Set<string>();
  const dedupedCashFlows = allCashFlows.filter((cf) => {
    if (seenCfIds.has(cf.id)) {
      warnings.push(`duplicate cashflow id across accounts: ${cf.id}`);
      return false;
    }
    seenCfIds.add(cf.id);
    return true;
  });

  // ── Balance curves ────────────────────────────────────────────────────────
  const balanceCurves: Record<string, BalanceCurvePoint[]> = {};
  const currencies: Record<string, string> = {};

  for (const acct of accounts) {
    currencies[acct.accountId] = acct.currency;
    balanceCurves[acct.accountId] = buildBalanceCurve(
      dedupedTrades,
      dedupedCashFlows,
      acct.accountId,
    );
  }

  const { curve: combinedCurve, warnings: combineWarnings } = buildCombinedBalanceCurve(
    balanceCurves,
    currencies,
  );
  if (combinedCurve.length > 0) {
    balanceCurves["combined"] = combinedCurve;
  }
  warnings.push(...combineWarnings);

  // ── Equity snapshots ──────────────────────────────────────────────────────
  let equitySnapshots: EquitySnapshot[] = [];

  if (existsSync(resolve(normalize(equitySnapshotsPath)))) {
    try {
      const raw = JSON.parse(readFileSync(resolve(normalize(equitySnapshotsPath)), "utf-8"));
      if (Array.isArray(raw)) {
        equitySnapshots = raw as EquitySnapshot[];
      } else {
        warnings.push("equity snapshots file is not a JSON array");
      }
    } catch {
      warnings.push("equity snapshots file could not be parsed");
    }
  }

  // Append current equity from each account snapshot
  const nowEpoch = Math.floor(Date.now() / 1000);
  const nowUtc   = new Date(nowEpoch * 1000).toISOString().replace(".000Z", "Z");
  for (const acct of accounts) {
    equitySnapshots.push({
      accountId:  acct.accountId,
      timeUtc:    acct.generatedAtUtc,
      timeEpoch:  acct.generatedAtEpoch,
      equity:     acct.equity,
      balance:    acct.balance,
      source:     acct.source,
    });
  }

  // ── KPIs per account ──────────────────────────────────────────────────────
  const kpis: Record<string, PerformanceKpis> = {};
  for (const acct of accounts) {
    kpis[acct.accountId] = computePerformanceKpis(
      dedupedTrades,
      dedupedCashFlows,
      acct,
      balanceCurves[acct.accountId] ?? [],
      equitySnapshots,
    );
  }

  // ── Assemble ──────────────────────────────────────────────────────────────
  const generatedAtEpoch = Math.floor(Date.now() / 1000);
  const generatedAtUtc   = new Date(generatedAtEpoch * 1000).toISOString().replace(".000Z", "Z");

  return {
    schemaVersion:   TRACK_RECORD_SCHEMA_VERSION,
    generatedAtUtc,
    generatedAtEpoch,
    accounts,
    closedTrades:    dedupedTrades,
    openPositions:   dedupedPositions,
    cashFlows:       dedupedCashFlows,
    balanceCurves,
    equitySnapshots,
    kpis,
    warnings,
    sourceStatus,
  };
}
