/**
 * CLI entry point for track-record assembly.
 * Called by: npx tsx src/lib/track-record/run-assembly.ts
 *
 * Reads paths from environment variables, calls assembleTrackRecord,
 * and writes the result atomically to .runtime/track-record/track-record.json
 */

import { resolve } from "path";
import { config as loadDotenv } from "dotenv";
import { assembleTrackRecord } from "./assemble-track-record";
import { atomicWriteJson } from "./atomic-write";
import {
  buildCombinedPortfolio,
  buildTradeEventSeries,
  buildCombinedTrackRecordSeries,
} from "./portfolio-engine";
import { loadEurUsdDailyRates } from "./fx-rates";

// Load .env.local (or .env fallback) — no-op if already set
loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: false });
loadDotenv({ path: resolve(process.cwd(), ".env"), override: false });

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

// ── Resolve paths ─────────────────────────────────────────────────────────────

const dataPath          = env("TRACK_ACCOUNT_1_DATA_PATH");
const mt4SnapshotPath   = dataPath
  ? resolve(dataPath, "MQL4", "Files", "capitalife", "account_1-snapshot.json")
  : resolve(".runtime", "track-record", "account_1-snapshot.json");

const mt4HistoryPath    = dataPath
  ? resolve(dataPath, "MQL4", "Files", "capitalife", "account_1-history.json")
  : resolve(".runtime", "track-record", "account_1-history.json");

const legacyHistoryPath = resolve(".runtime", "track-record", "legacy-account_1-history.json");

const mt5SnapshotPath   = env(
  "TRACK_ACCOUNT_2_SNAPSHOT_PATH",
  resolve(".runtime", "track-record", "account_2-snapshot.json"),
);

const equitySnapshotsPath     = resolve(".runtime", "track-record", "equity-snapshots.json");
const outputPath              = resolve(".runtime", "track-record", "track-record.json");
const portfolioPath           = resolve(".runtime", "track-record", "portfolio.json");
const portfolioAuditPath      = resolve(".runtime", "track-record", "portfolio-audit.json");
const reconciliationAuditPath = resolve(".runtime", "track-record", "reconciliation-audit.json");
const portfolioDailyAuditPath = resolve(".runtime", "track-record", "portfolio-daily-audit.json");
const tradeEventSeriesPath       = resolve(".runtime", "track-record", "trade-event-series.json");
const combinedTrackRecordPath    = resolve(".runtime", "track-record", "combined-track-record.json");
const fullTradeLedgerPath     = resolve(".runtime", "track-record", "full-trade-ledger.json");
const fullCashflowLedgerPath  = resolve(".runtime", "track-record", "full-cashflow-ledger.json");

// ── Run ───────────────────────────────────────────────────────────────────────

console.log("[run-assembly] Assembling track record…");
console.log(`  mt4Snapshot:  ${mt4SnapshotPath}`);
console.log(`  mt4History:   ${mt4HistoryPath}`);
console.log(`  mt5Snapshot:  ${mt5SnapshotPath}`);
console.log(`  equitySnaps:  ${equitySnapshotsPath}`);
console.log(`  output:       ${outputPath}`);

try {
  const record = assembleTrackRecord({
    mt4SnapshotPath,
    mt4HistoryPath,
    mt5SnapshotPath,
    equitySnapshotsPath,
    legacyHistoryPath,
  });

  atomicWriteJson(outputPath, record);

  // ── Build and write combined portfolio ──────────────────────────────────────
  console.log("\n[run-assembly] Building combined portfolio…");
  const fxRates = loadEurUsdDailyRates();
  const fxDays = Object.keys(fxRates).length;
  console.log(`  FX rates loaded: ${fxDays} days (EURUSD)`);

  const portfolio = buildCombinedPortfolio(record, fxRates);
  atomicWriteJson(portfolioPath, portfolio);
  console.log(`  portfolio.json written. totalReturn=${(portfolio.totalReturn * 100).toFixed(4)}%`);
  console.log(`  totalTrades=${portfolio.diagnostics.totalTrades}, daysWithMissingFx=${portfolio.diagnostics.daysWithMissingFx}`);

  // ── Build and write trade-event series ──────────────────────────────────────
  console.log("\n[run-assembly] Building trade-event series…");
  const tradeEventResult = buildTradeEventSeries(
    record.closedTrades,
    record.cashFlows,
    record.accounts,
    fxRates,
  );
  atomicWriteJson(tradeEventSeriesPath, {
    generatedAtUtc: new Date().toISOString().replace(".000Z", "Z"),
    series:         tradeEventResult.series,
    finalIndex:     tradeEventResult.finalIndex,
    finalReturn:    tradeEventResult.finalReturn,
    pointCount:     tradeEventResult.series.length,
    firstTradeCloseUtc: tradeEventResult.series[0]?.closeTimeUtc ?? null,
    lastTradeCloseUtc:  tradeEventResult.series.at(-1)?.closeTimeUtc ?? null,
    warnings:       tradeEventResult.warnings,
  });
  console.log(`  trade-event-series.json written. points=${tradeEventResult.series.length}, finalReturn=${(tradeEventResult.finalReturn * 100).toFixed(4)}%`);
  if (tradeEventResult.warnings.length > 0) {
    for (const w of tradeEventResult.warnings.slice(0, 5)) console.log(`    warning: ${w}`);
  }

  // ── Build and write combined additive track record ───────────────────────────
  console.log("\n[run-assembly] Building combined additive track record series…");
  const combinedResult = buildCombinedTrackRecordSeries(
    record,
    portfolio.summary,
    {
      account1TotalReturn: portfolio.diagnostics.account1TotalReturn,
      account2TotalReturn: portfolio.diagnostics.account2TotalReturn,
    },
    tradeEventResult.finalReturn,
  );
  atomicWriteJson(combinedTrackRecordPath, combinedResult);
  console.log(
    `  combined-track-record.json written.` +
    ` combinedReturn=${(combinedResult.summary.combinedCumulativeTrackRecordReturn * 100).toFixed(4)}%` +
    ` (acc1=${(combinedResult.summary.account1CumulativeReturn * 100).toFixed(4)}%` +
    ` + acc2=${(combinedResult.summary.account2CumulativeReturn * 100).toFixed(4)}%)`,
  );
  console.log(
    `  combinedSeries points=${combinedResult.combinedSeries.length}`,
    ` totalTrades=${combinedResult.summary.totalTrades}`,
    ` match=${combinedResult.combinedSeries.length === combinedResult.summary.totalTrades}`,
  );
  if (combinedResult.warnings.filter((w) => w.startsWith("invariant")).length > 0) {
    for (const w of combinedResult.warnings) console.log(`    warning: ${w}`);
  }

  // ── Write full trade/cashflow ledgers ────────────────────────────────────────
  atomicWriteJson(fullTradeLedgerPath, {
    generatedAtUtc: new Date().toISOString().replace(".000Z", "Z"),
    tradeCount: record.closedTrades.length,
    trades: record.closedTrades,
  });
  atomicWriteJson(fullCashflowLedgerPath, {
    generatedAtUtc: new Date().toISOString().replace(".000Z", "Z"),
    cashFlowCount: record.cashFlows.length,
    cashFlows: record.cashFlows,
  });
  console.log(`  full-trade-ledger.json written (${record.closedTrades.length} trades).`);
  console.log(`  full-cashflow-ledger.json written (${record.cashFlows.length} cashflows).`);

  // ── Build and write portfolio audit ─────────────────────────────────────────
  const audit = {
    generatedAtUtc: new Date().toISOString().replace(".000Z", "Z"),
    method: portfolio.method,
    summary: portfolio.summary,
    coverage: portfolio.coverage,
    diagnostics: portfolio.diagnostics,
    warnings: portfolio.warnings,
    topDailyContributions: portfolio.dailyPoints
      .filter((p) => p.portfolioDailyReturn !== null)
      .sort((a, b) => Math.abs(b.portfolioDailyReturn!) - Math.abs(a.portfolioDailyReturn!))
      .slice(0, 10)
      .map((p) => ({ date: p.dateUtc, return: p.portfolioDailyReturn })),
    daysWithUnusualReturns: portfolio.dailyPoints
      .filter((p) => p.portfolioDailyReturn !== null && Math.abs(p.portfolioDailyReturn!) > 0.05)
      .map((p) => ({ date: p.dateUtc, return: p.portfolioDailyReturn })),
  };
  atomicWriteJson(portfolioAuditPath, audit);
  console.log(`  portfolio-audit.json written.`);

  // ── Write reconciliation audit ───────────────────────────────────────────────
  atomicWriteJson(reconciliationAuditPath, {
    generatedAtUtc: new Date().toISOString().replace(".000Z", "Z"),
    reconciliation: portfolio.reconciliation,
  });
  console.log(`  reconciliation-audit.json written.`);

  // ── Write portfolio daily audit (per-day details) ────────────────────────────
  const dailyAudit = {
    generatedAtUtc: new Date().toISOString().replace(".000Z", "Z"),
    startDate: portfolio.startDate,
    endDate: portfolio.endDate,
    totalPoints: portfolio.dailyPoints.length,
    points: portfolio.dailyPoints.map((p) => ({
      dateUtc: p.dateUtc,
      portfolioIndex: p.portfolioIndex,
      cumulativeReturn: p.cumulativeReturn,
      portfolioDailyReturn: p.portfolioDailyReturn,
      dataStatus: p.dataStatus,
      activeAccountCount: p.activeAccountCount,
      fxRatesUsed: p.fxRatesUsed,
    })),
  };
  atomicWriteJson(portfolioDailyAuditPath, dailyAudit);
  console.log(`  portfolio-daily-audit.json written.`);

  const { accounts, closedTrades, openPositions, cashFlows, warnings, sourceStatus } = record;
  console.log("\n[run-assembly] Done.");
  console.log(`  accounts:      ${accounts.length}`);
  console.log(`  closedTrades:  ${closedTrades.length}`);
  console.log(`  openPositions: ${openPositions.length}`);
  console.log(`  cashFlows:     ${cashFlows.length}`);
  console.log(`  warnings:      ${warnings.length}`);
  console.log("  sourceStatus:", JSON.stringify(sourceStatus, null, 2));

  if (warnings.length > 0) {
    console.log("\n  Warnings:");
    for (const w of warnings) console.log(`    - ${w}`);
  }

  process.exit(0);
} catch (err) {
  console.error("[run-assembly] Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
}
