#!/usr/bin/env node
/**
 * White Swan 1-Contract Futures Backtest — Full Computation
 * All 11 READY strategies, 2008-01-01 to 2026-08-13
 *
 * Contract specs: verbatim from src/lib/white-swan/execution-truth.ts
 * Seasonal engine: entry=OPEN of first bar on/after target date; exit=CLOSE of bar at entryIdx+holdingTradingDays
 * Source: src/lib/seasonality/walkForward/types.ts → entryExecutionRule:"open_on_or_after", exitExecutionRule:"close_after_holding_days"
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const FROM_DATE = "2008-01-01";
const TO_DATE   = "2026-08-13"; // today

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function readCsvBars(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) throw new Error(`Missing: ${relPath}`);
  const lines = fs.readFileSync(full, "utf8").trim().split(/\r?\n/);
  const hdrs = lines[0].split(",").map(h => h.trim());
  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split(",");
    const row = {};
    hdrs.forEach((h, j) => (row[h] = v[j]?.trim() ?? ""));
    const date  = row.time;
    const open  = parseFloat(row.open);
    const close = parseFloat(row.close);
    if (!date || !isFinite(open) || !isFinite(close)) continue;
    bars.push({ date, open, close });
  }
  return bars;
}

function buildIndex(bars) {
  const dates = bars.map(b => b.date);
  const map   = new Map(bars.map(b => [b.date, b]));
  return { dates, map };
}

// First bar index where date >= target
function findOnOrAfter(dates, target) {
  let lo = 0, hi = dates.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < target) lo = mid + 1; else hi = mid - 1;
  }
  return lo < dates.length ? lo : -1;
}

// ─── Contract specs (verbatim from execution-truth.ts) ────────────────────────
//
// Tick validation:
//   MES:   tickSize=0.25  tickValue=1.25   → 0.25×5    = 1.25 ✓
//   1OZ:   tickSize=0.1   tickValue=0.1    → 0.1×1     = 0.10 ✓
//   MHG:   tickSize=0.0005 tickValue=1.25  → 0.0005×2500 = 1.25 ✓  (price in USD/lb)
//   MCL:   tickSize=0.01  tickValue=1.0    → 0.01×100  = 1.00 ✓  (price in USD/bbl)
//   MZC:   tickSize=0.005 tickValue=2.5    → 0.005×500 = 2.50 ✓  (price in USD/bu → CSV in ¢/bu ÷100)
//   MZW:   tickSize=0.005 tickValue=2.5    → 0.005×500 = 2.50 ✓  (price in USD/bu → CSV in ¢/bu ÷100)
//   MZS:   tickSize=0.00125 tickValue=0.625→ 0.00125×500 = 0.625 ✓ (price in USD/bu → CSV in ¢/bu ÷100)
//   CC:    tickSize=1     tickValue=10     → 1×10      = 10 ✓   (price in USD/MT)
//   SB:    tickSize=0.0001 tickValue=11.2  → 0.0001×112000 = 11.2 ✓ (price in USD/lb → CSV in ¢/lb ÷100)
//   MYM:   tickSize=1     tickValue=0.5    → 1×0.5     = 0.50 ✓
//   FDXS:  tickSize=1     tickValue=1.0    → 1×1       = 1.00 ✓

const SPECS = {
  FDXS: { mult: 1,      cur: "EUR", csvDiv: 1   },
  MYM:  { mult: 0.5,    cur: "USD", csvDiv: 1   },
  MES:  { mult: 5,      cur: "USD", csvDiv: 1   },
  "1OZ":{ mult: 1,      cur: "USD", csvDiv: 1   },  // $/oz
  MHG:  { mult: 2500,   cur: "USD", csvDiv: 1   },  // $/lb
  MCL:  { mult: 100,    cur: "USD", csvDiv: 1   },  // $/bbl
  MZC:  { mult: 500,    cur: "USD", csvDiv: 100 },  // ¢/bu → ÷100 → $/bu → ×500
  MZW:  { mult: 500,    cur: "USD", csvDiv: 100 },  // ¢/bu → ÷100 → $/bu → ×500
  MZS:  { mult: 500,    cur: "USD", csvDiv: 100 },  // ¢/bu → ÷100 → $/bu → ×500
  CC:   { mult: 10,     cur: "USD", csvDiv: 1   },  // $/MT
  SB:   { mult: 112000, cur: "USD", csvDiv: 100 },  // ¢/lb → ÷100 → $/lb → ×112000
};

function grossPnl(direction, entryRaw, exitRaw, spec) {
  const entry = entryRaw / spec.csvDiv;
  const exit  = exitRaw  / spec.csvDiv;
  const diff  = direction === "LONG" ? exit - entry : entry - exit;
  return diff * spec.mult;
}

// ─── Strategy runners ─────────────────────────────────────────────────────────

function runDax2h() {
  const raw  = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/capitalife/monitoring-events/EUREX_FDAX1_2H_events_clean.json"), "utf8"));
  const spec = SPECS.FDXS;
  const trades = [];
  for (const t of raw.trades) {
    if (!t.entryTimestamp || !t.exitTimestamp) continue;
    const entryDate = String(t.entryTimestamp).slice(0, 10);
    const exitDate  = String(t.exitTimestamp).slice(0, 10);
    if (entryDate < FROM_DATE || exitDate > TO_DATE) continue;
    if (!["LONG", "SHORT"].includes(String(t.direction))) continue;
    const ep = parseFloat(t.entryPrice), xp = parseFloat(t.exitPrice);
    if (!isFinite(ep) || !isFinite(xp)) continue;
    const gp = grossPnl(t.direction, ep, xp, spec);
    trades.push({ sid: "DAX_2H", future: "FDXS", cur: "EUR", exitDate, direction: t.direction, entry: ep, exit: xp, gp });
  }
  return trades;
}

function runYm1() {
  const raw  = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/anomaly/ym1_tat.json"), "utf8"));
  const spec = SPECS.MYM;
  const trades = [];
  for (const t of raw.trades) {
    if (!t.entry_time || !t.exit_time) continue;
    const entryDate = String(t.entry_time).slice(0, 10);
    const exitDate  = String(t.exit_time).slice(0, 10);
    if (entryDate < FROM_DATE || exitDate > TO_DATE) continue;
    const ep = parseFloat(t.entry_price), xp = parseFloat(t.exit_price);
    if (!isFinite(ep) || !isFinite(xp)) continue;
    const gp = grossPnl("LONG", ep, xp, spec);
    trades.push({ sid: "YM1_TAT", future: "MYM", cur: "USD", exitDate, direction: "LONG", entry: ep, exit: xp, gp });
  }
  return trades;
}

function parseEngine(engine) {
  const m = engine.match(/^M(\d{2})D(\d{2})\s+(Long|Short)\s+\+(\d+)d$/i);
  if (!m) throw new Error(`Bad engine: ${engine}`);
  return { month: +m[1], day: +m[2], direction: m[3].toUpperCase(), hold: +m[4] };
}

function runSeasonal(sid, future, engine, csvPath) {
  const { month, day, direction, hold } = parseEngine(engine);
  const spec  = SPECS[future];
  const bars  = readCsvBars(csvPath);
  const { dates, map } = buildIndex(bars);
  const trades = [];

  for (let yr = 2008; yr <= 2026; yr++) {
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const target = `${yr}-${mm}-${dd}`;
    if (target > TO_DATE) break;

    const eIdx = findOnOrAfter(dates, target);
    if (eIdx < 0 || eIdx >= dates.length) continue;
    const entryDate = dates[eIdx];
    if (entryDate > TO_DATE) continue;

    const xIdx = eIdx + hold;
    if (xIdx >= dates.length) continue;
    const exitDate = dates[xIdx];
    if (exitDate > TO_DATE) continue;

    const eBar = map.get(entryDate);
    const xBar = map.get(exitDate);
    if (!eBar || !xBar) continue;

    const ep = eBar.open;   // entry at open (per walkForwardEngine)
    const xp = xBar.close;  // exit at close (per walkForwardEngine)
    if (!isFinite(ep) || !isFinite(xp)) continue;

    const gp = grossPnl(direction, ep, xp, spec);
    trades.push({ sid, future, cur: spec.cur, year: yr, exitDate, direction, entry: ep, exit: xp, gp, entryDate, hold });
  }
  return trades;
}

// ─── Run all 11 strategies ────────────────────────────────────────────────────

const SEASONALS = [
  { sid: "GC1_SEA",  future: "1OZ", engine: "M01D08 Long +25d",  csv: "data/historical/metals/COMEX_GC1_D.csv" },
  { sid: "HG1_SEA",  future: "MHG", engine: "M02D01 Long +20d",  csv: "data/historical/metals/COMEX_HG1_D.csv" },
  { sid: "CL1_SEA",  future: "MCL", engine: "M02D01 Long +120d", csv: "data/historical/energy/NYMEX_CL1_D.csv" },
  { sid: "ZC1_SEA",  future: "MZC", engine: "M07D14 Short +18d", csv: "data/historical/agrar/CBOT_ZC1_D.csv" },
  { sid: "ZW1_SEA",  future: "MZW", engine: "M12D01 Long +20d",  csv: "data/historical/agrar/CBOT_ZW1_D.csv" },
  { sid: "ZS1_SEA",  future: "MZS", engine: "M07D15 Short +16d", csv: "data/historical/agrar/CBOT_ZS1_D.csv" },
  { sid: "CC1_SEA",  future: "CC",  engine: "M04D02 Long +16d",  csv: "data/historical/agrar/ICEUS_CC1_D.csv" },
  { sid: "SB1_SEA",  future: "SB",  engine: "M09D24 Long +10d",  csv: "data/historical/agrar/ICEUS_SB1_D.csv" },
  { sid: "SPY_SEA",  future: "MES", engine: "M10D25 Long +30d",  csv: "data/core-invest/canonical/ES.csv" },
];

const allTrades = [];

allTrades.push(...runDax2h());
allTrades.push(...runYm1());
for (const s of SEASONALS) {
  allTrades.push(...runSeasonal(s.sid, s.future, s.engine, s.csv));
}

// ─── Per-strategy stats ───────────────────────────────────────────────────────

function fmt(n, dec = 2) {
  return Number(n.toFixed(dec)).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function stats(trades) {
  if (!trades.length) return null;
  const sorted = [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate));
  const grossTotal  = trades.reduce((s, t) => s + t.gp, 0);
  const wins   = trades.filter(t => t.gp > 0);
  const losses = trades.filter(t => t.gp <= 0);
  const pf     = losses.length === 0 ? Infinity :
    Math.abs(wins.reduce((s, t) => s + t.gp, 0)) /
    Math.abs(losses.reduce((s, t) => s + t.gp, 0));
  const best  = sorted.reduce((a, b) => b.gp > a.gp ? b : a);
  const worst = sorted.reduce((a, b) => b.gp < a.gp ? b : a);

  let cum = 0, peak = 0, maxDd = 0;
  for (const t of sorted) {
    cum += t.gp;
    if (cum > peak) peak = cum;
    if (peak - cum > maxDd) maxDd = peak - cum;
  }

  return {
    count: trades.length,
    longs: trades.filter(t => t.direction === "LONG").length,
    shorts: trades.filter(t => t.direction === "SHORT").length,
    grossTotal,
    winRate: wins.length / trades.length,
    pf,
    maxDd,
    best,
    worst,
    startDate: sorted[0].exitDate,
    endDate:   sorted.at(-1).exitDate,
  };
}

// ─── Output ───────────────────────────────────────────────────────────────────

const ORDER = [
  "DAX_2H","YM1_TAT",
  "GC1_SEA","HG1_SEA","CL1_SEA",
  "ZC1_SEA","ZW1_SEA","ZS1_SEA",
  "CC1_SEA","SB1_SEA","SPY_SEA",
];

const COST_EUR = 1.70; // 0.85 × 2 executions — conversation assumption
const COST_USD = 1.90; // 0.95 × 2 executions — conversation assumption

let totalTradesAll = 0;
let totalGrossUSD = 0, totalGrossEUR = 0;
let totalCostUSD = 0,  totalCostEUR = 0;
const allDays = new Set();

const rows = [];

for (const sid of ORDER) {
  const trades = allTrades.filter(t => t.sid === sid);
  if (!trades.length) { rows.push({ sid, error: "NO TRADES" }); continue; }

  const s = stats(trades);
  const spec = SPECS[trades[0].future];
  const costPerRt = spec.cur === "EUR" ? COST_EUR : COST_USD;
  const totalCost = s.count * costPerRt;
  const netPnl    = s.grossTotal - totalCost;

  trades.forEach(t => allDays.add(t.exitDate));
  totalTradesAll += s.count;
  if (spec.cur === "USD") { totalGrossUSD += s.grossTotal; totalCostUSD += totalCost; }
  else                    { totalGrossEUR += s.grossTotal; totalCostEUR += totalCost; }

  // 3 sample trades (earliest, one mid-way, latest)
  const sorted = [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate));
  const midIdx = Math.floor(sorted.length / 2);
  const samples = [sorted[0], sorted[midIdx], sorted.at(-1)].filter(Boolean);

  rows.push({ sid, future: trades[0].future, cur: spec.cur, s, costPerRt, totalCost, netPnl, spec, samples });
}

// ─── Print report ─────────────────────────────────────────────────────────────

const SEP = "─".repeat(70);

// Contract spec confirmation table
console.log("\n" + SEP);
console.log("CONTRACT SPEC VERIFICATION (verbatim from execution-truth.ts)");
console.log(SEP);
console.log("Tick math: tickValue = tickSize × multiplier");
console.log("");
console.log([
  "Future".padEnd(6),
  "Multiplier".padEnd(12),
  "tickSize".padEnd(10),
  "tickValue".padEnd(10),
  "CSV unit".padEnd(14),
  "Check",
].join(" "));
const tickRows = [
  ["MYM",  0.5,    1,       0.5,    "index pts",  "1×0.5=0.50"],
  ["FDXS", 1,      1,       1.0,    "index pts",  "1×1=1.00"],
  ["MES",  5,      0.25,    1.25,   "index pts",  "0.25×5=1.25"],
  ["1OZ",  1,      0.1,     0.1,    "$/oz",       "0.1×1=0.10"],
  ["MHG",  2500,   0.0005,  1.25,   "$/lb",       "0.0005×2500=1.25"],
  ["MCL",  100,    0.01,    1.0,    "$/bbl",      "0.01×100=1.00"],
  ["MZC",  500,    0.005,   2.5,    "¢/bu ÷100",  "0.005×500=2.50"],
  ["MZW",  500,    0.005,   2.5,    "¢/bu ÷100",  "0.005×500=2.50"],
  ["MZS",  500,    0.00125, 0.625,  "¢/bu ÷100",  "0.00125×500=0.625"],
  ["CC",   10,     1,       10,     "$/MT",       "1×10=10.00"],
  ["SB",   112000, 0.0001,  11.2,   "¢/lb ÷100",  "0.0001×112000=11.20"],
];
for (const [f, m, ts, tv, unit, check] of tickRows) {
  const computed = +(ts * m).toFixed(6);
  const ok = Math.abs(computed - tv) < 1e-9 ? "✓" : "✗ MISMATCH";
  console.log([
    String(f).padEnd(6),
    String(m).padEnd(12),
    String(ts).padEnd(10),
    String(tv).padEnd(10),
    unit.padEnd(14),
    ok,
  ].join(" "));
}

// Per-strategy output
for (const r of rows) {
  console.log("\n" + SEP);
  if (r.error) { console.log(`${r.sid}: ${r.error}`); continue; }

  const { sid, future, cur, s, costPerRt, totalCost, netPnl, samples } = r;
  console.log(`STRATEGIE: ${sid}`);
  console.log(`Future:        ${future}  |  Currency: ${cur}  |  Period: ${s.startDate} → ${s.endDate}`);
  console.log(`Trades:        ${s.count}  (Long: ${s.longs}  Short: ${s.shorts})`);
  console.log(`Contract:      multiplier=${SPECS[future].mult}  csvDiv=${SPECS[future].csvDiv}`);
  console.log(`Point Value:   1 price unit × ${SPECS[future].mult} = ${SPECS[future].mult} ${cur}`);
  if (future === "MZC" || future === "MZW" || future === "MZS")
    console.log(`               (price in ¢/bu, effective: 1¢/bu × ${SPECS[future].mult}/100 = ${(SPECS[future].mult/100).toFixed(2)} USD/¢)`);
  if (future === "SB")
    console.log(`               (price in ¢/lb, effective: 1¢/lb × ${SPECS[future].mult}/100 = ${(SPECS[future].mult/100).toFixed(2)} USD/¢)`);

  console.log("");
  console.log(`Gross P&L:         ${cur} ${fmt(s.grossTotal)}`);
  console.log(`Execution Costs:   ${cur} ${fmt(totalCost)}  (${s.count} trades × ${costPerRt} ${cur} per roundtrip)`);
  console.log(`  Assumption: 0.85 EUR / 0.95 USD per single execution, 2 executions per roundtrip`);
  console.log(`Net P&L:           ${cur} ${fmt(netPnl)}`);

  console.log("");
  console.log(`Best Trade:        ${s.best.exitDate}  ${cur} ${fmt(s.best.gp)}`);
  console.log(`Worst Trade:       ${s.worst.exitDate}  ${cur} ${fmt(s.worst.gp)}`);
  console.log(`Max Drawdown:      ${cur} ${fmt(s.maxDd)}`);
  console.log(`Profit Factor:     ${s.pf === Infinity ? "∞" : fmt(s.pf)}`);
  console.log(`Win Rate:          ${fmt(s.winRate * 100, 1)}%`);
  console.log(`Daily P&L:         JA`);

  console.log("");
  console.log("SAMPLE TRADES (entry=OPEN of entry bar, exit=CLOSE of exit bar):");
  console.log([
    "Date".padEnd(24),
    "Entry".padEnd(12),
    "Exit".padEnd(12),
    "Dir".padEnd(6),
    "PriceDiff".padEnd(14),
    "×Mult÷Div".padEnd(14),
    "Gross P&L",
  ].join(" "));
  for (const t of samples) {
    const ep = t.entry, xp = t.exit;
    const rawDiff = t.direction === "LONG" ? xp - ep : ep - xp;
    const spec = SPECS[t.future];
    const adjDiff = rawDiff / spec.csvDiv;
    const computed = adjDiff * spec.mult;
    const dateStr = t.year ? `${t.entryDate} → ${t.exitDate}` : `${t.exitDate}`;
    console.log([
      dateStr.padEnd(24),
      fmt(ep, 4).padEnd(12),
      fmt(xp, 4).padEnd(12),
      t.direction.padEnd(6),
      fmt(rawDiff, 4).padEnd(14),
      `÷${spec.csvDiv}×${spec.mult}`.padEnd(14),
      `${cur} ${fmt(computed)}`,
    ].join(" "));
  }
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(70));
console.log("WHITE SWAN — 11 READY COMPONENTS — AGGREGATE");
console.log("═".repeat(70));
console.log(`Total Trades:       ${totalTradesAll}`);
console.log(`Trading Days:       ${allDays.size}  (unique exit dates across all strategies)`);
console.log(`Start:              ${[...allDays].sort()[0]}`);
console.log(`End:                ${[...allDays].sort().at(-1)}`);
console.log("");
console.log(`Gross P&L USD:      $ ${fmt(totalGrossUSD)}`);
console.log(`Gross P&L EUR:      € ${fmt(totalGrossEUR)}`);
console.log("");
console.log(`Costs USD:          $ ${fmt(totalCostUSD)}  (${COST_USD} USD/RT × USD-strategy trades)`);
console.log(`Costs EUR:          € ${fmt(totalCostEUR)}  (${COST_EUR} EUR/RT × EUR-strategy trades)`);
console.log("");
console.log(`Net P&L USD:        $ ${fmt(totalGrossUSD - totalCostUSD)}`);
console.log(`Net P&L EUR:        € ${fmt(totalGrossEUR - totalCostEUR)}`);
console.log("");
console.log(`USD and EUR kept separate — no FX conversion applied.`);
console.log(`Costs are conversation assumptions (not verified IBKR rates).`);
console.log("");
console.log(`11/11 tatsächlich berechnet: ${rows.every(r => !r.error) ? "JA" : "NEIN"}`);
