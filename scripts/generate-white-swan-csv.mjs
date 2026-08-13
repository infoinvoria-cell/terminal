#!/usr/bin/env node
/**
 * White Swan Futures Backtest CSV Generator
 * ─────────────────────────────────────────
 * Reads YM1 TAT and DAX 2H trade files, runs 1-contract simulation
 * for 2008-01-01 to present, and writes CSV outputs.
 *
 * Usage: node scripts/generate-white-swan-csv.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ─── Data ─────────────────────────────────────────────────────────────────────

const ym1Raw = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/anomaly/ym1_tat.json"), "utf8"));
const dax2hRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/capitalife/monitoring-events/EUREX_FDAX1_2H_events_clean.json"), "utf8"));

const FROM_DATE = "2008-01-01";

// ─── P&L formulas ─────────────────────────────────────────────────────────────

function grossPnl(direction, entry, exit, multiplier) {
  const raw = direction === "LONG" ? (exit - entry) * multiplier : (entry - exit) * multiplier;
  return Number(raw.toFixed(4));
}

// ─── Load YM1 (LONG only, MYM 0.5 USD/pt) ────────────────────────────────────

const ym1Trades = [];
for (const t of ym1Raw.trades) {
  if (!t.entry_time || !t.exit_time) continue;
  if (t.entry_time < FROM_DATE || t.exit_time < FROM_DATE) continue;
  if (!Number.isFinite(t.entry_price) || !Number.isFinite(t.exit_price)) continue;
  if (t.entry_price <= 0 || t.exit_price <= 0) continue;
  ym1Trades.push({
    strategyId: "FP10_YM1_TAT",
    future: "MYM",
    entryDate: t.entry_time.slice(0, 10),
    exitDate: t.exit_time.slice(0, 10),
    direction: "LONG",
    contracts: 1,
    entryPrice: t.entry_price,
    exitPrice: t.exit_price,
    multiplier: 0.5,
    currency: "USD",
    grossPnl: grossPnl("LONG", t.entry_price, t.exit_price, 0.5),
  });
}
console.log(`YM1 TAT (2008+): ${ym1Trades.length} trades`);

// ─── Load DAX 2H (LONG+SHORT, FDXS 1 EUR/pt) ─────────────────────────────────

const dax2hTrades = [];
for (const t of dax2hRaw.trades) {
  if (!t.entryTimestamp || !t.exitTimestamp) continue;
  const entryDate = t.entryTimestamp.slice(0, 10);
  const exitDate = t.exitTimestamp.slice(0, 10);
  if (entryDate < FROM_DATE) continue;
  if (!Number.isFinite(t.entryPrice) || !Number.isFinite(t.exitPrice)) continue;
  if (!["LONG", "SHORT"].includes(t.direction)) continue;
  dax2hTrades.push({
    strategyId: "trend_momentum_dax_2h_de30eur_2h",
    future: "FDXS",
    entryDate,
    exitDate,
    direction: t.direction,
    contracts: 1,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    multiplier: 1,
    currency: "EUR",
    grossPnl: grossPnl(t.direction, t.entryPrice, t.exitPrice, 1),
  });
}
console.log(`DAX 2H (2008+): ${dax2hTrades.length} trades`);

// ─── Cost model ───────────────────────────────────────────────────────────────

// 1 round trip = 2 executions (entry + exit)
const COSTS = {
  A: 0,      // zero
  B: 0.85,   // EUR per execution (INNO scenario)
  C: 0.95,   // USD per execution (INNO scenario)
};

function netPnl(gp, costPerExec) {
  return Number((gp - costPerExec * 2).toFixed(4));
}

// ─── Activity CSV ─────────────────────────────────────────────────────────────

const allTrades = [...ym1Trades, ...dax2hTrades].sort((a, b) =>
  a.exitDate.localeCompare(b.exitDate),
);

const activityRows = [
  "Date,Strategy_ID,Future,Direction,Contracts,Entry_Exit,Execution_Count,Gross_PnL,Cost_ScenA,Cost_ScenB,Cost_ScenC,Net_PnL_ScenA,Net_PnL_ScenB,Net_PnL_ScenC,Currency",
];
for (const t of allTrades) {
  activityRows.push([
    t.exitDate,
    t.strategyId,
    t.future,
    t.direction,
    1,
    "EXIT",
    2,
    t.grossPnl,
    COSTS.A * 2,
    COSTS.B * 2,
    COSTS.C * 2,
    netPnl(t.grossPnl, COSTS.A),
    netPnl(t.grossPnl, COSTS.B),
    netPnl(t.grossPnl, COSTS.C),
    t.currency,
  ].join(","));
}

// ─── Daily P&L CSV ────────────────────────────────────────────────────────────

const dailyMap = new Map();
for (const t of allTrades) {
  if (!dailyMap.has(t.exitDate)) {
    dailyMap.set(t.exitDate, {
      date: t.exitDate,
      grossUsd: 0, grossEur: 0,
      netAUsd: 0, netAEur: 0,
      netBUsd: 0, netBEur: 0,
      netCUsd: 0, netCEur: 0,
    });
  }
  const d = dailyMap.get(t.exitDate);
  if (t.currency === "USD") {
    d.grossUsd += t.grossPnl;
    d.netAUsd += netPnl(t.grossPnl, COSTS.A);
    d.netBUsd += netPnl(t.grossPnl, COSTS.B);
    d.netCUsd += netPnl(t.grossPnl, COSTS.C);
  } else {
    d.grossEur += t.grossPnl;
    d.netAEur += netPnl(t.grossPnl, COSTS.A);
    d.netBEur += netPnl(t.grossPnl, COSTS.B);
    d.netCEur += netPnl(t.grossPnl, COSTS.C);
  }
}

const dailySorted = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
const dailyRows = ["Date,Gross_PnL_USD,Gross_PnL_EUR,Net_PnL_ScenA_USD,Net_PnL_ScenA_EUR,Net_PnL_ScenB_USD,Net_PnL_ScenB_EUR,Net_PnL_ScenC_USD,Net_PnL_ScenC_EUR"];
for (const d of dailySorted) {
  dailyRows.push([
    d.date,
    d.grossUsd.toFixed(4),
    d.grossEur.toFixed(4),
    d.netAUsd.toFixed(4),
    d.netAEur.toFixed(4),
    d.netBUsd.toFixed(4),
    d.netBEur.toFixed(4),
    d.netCUsd.toFixed(4),
    d.netCEur.toFixed(4),
  ].join(","));
}

// ─── Audit CSV ────────────────────────────────────────────────────────────────

const auditJson = JSON.parse(fs.readFileSync(
  path.join(ROOT, "src/data/capitalife/white-swan-futures/component-audit.json"), "utf8"),
);
const auditRows = ["Strategy_ID,Label,IBKR_Symbol,Exchange,Multiplier,Currency,Weight_Pct,Data_Status,Simulation_Type,Backtest_Start,Backtest_End,Trade_Count"];
for (const c of auditJson.components) {
  auditRows.push([
    c.strategyId,
    `"${c.label}"`,
    c.ibkrSymbol,
    c.exchange,
    c.multiplier,
    c.currency,
    c.portfolioWeightPct,
    c.dataStatus,
    c.simulationType,
    c.backtestStartDate ?? "—",
    c.backtestEndDate ?? "—",
    c.backtestTradeCount ?? "—",
  ].join(","));
}

// ─── Write output ─────────────────────────────────────────────────────────────

const OUT = path.join(ROOT, "public/data/white-swan");
fs.mkdirSync(OUT, { recursive: true });

fs.writeFileSync(path.join(OUT, "White_Swan_Daily_Activity_2008_2026.csv"), activityRows.join("\n"), "utf8");
fs.writeFileSync(path.join(OUT, "White_Swan_Daily_Returns_2008_2026.csv"), dailyRows.join("\n"), "utf8");
fs.writeFileSync(path.join(OUT, "White_Swan_Futures_Component_Audit.csv"), auditRows.join("\n"), "utf8");

console.log(`\n✓ Activity CSV: ${allTrades.length} rows → public/data/white-swan/White_Swan_Daily_Activity_2008_2026.csv`);
console.log(`✓ Daily Returns CSV: ${dailySorted.length} days → public/data/white-swan/White_Swan_Daily_Returns_2008_2026.csv`);
console.log(`✓ Audit CSV: ${auditJson.components.length} components → public/data/white-swan/White_Swan_Futures_Component_Audit.csv`);
console.log(`\nFutures Replication Possible: YM1 TAT (MYM, USD) + DAX 2H (FDXS, EUR)`);
console.log(`NOT_COMPUTABLE (15 strategies): No individual trade data or ETF-only prices.`);
console.log(`IMPORTANT: Daily P&L is in two separate currencies (USD + EUR). No FX conversion applied.`);
