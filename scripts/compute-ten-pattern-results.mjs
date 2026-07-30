/**
 * compute-ten-pattern-results.mjs
 *
 * Computes real historical and walk-forward KPIs for all 10 seasonal patterns.
 * Writes results to:
 *   public/generated/seasonality/ten_patterns/results.json
 *
 * Usage:
 *   node scripts/compute-ten-pattern-results.mjs
 *   node scripts/compute-ten-pattern-results.mjs --patterns rb1_long_slot29_v1,gc1_long_slot128_v1
 *   BASE_URL=http://localhost:3000 node scripts/compute-ten-pattern-results.mjs
 *
 * Requires:
 *   npm run dev  (in a separate terminal first)
 *
 * Rules:
 *   - Only real CSV data via /api/seasonality/walk-forward
 *   - No placeholders, no fallbacks to hardcoded values
 *   - Patterns with <10 valid trades → status: insufficient_history, KPIs: null
 *   - Patterns with no CSV → status: no_data_source, KPIs: null
 *   - API errors → status: calculation_failed, KPIs: null
 *   - Output is deterministic for identical input data
 */

import { createHash } from "crypto";
import { createRequire } from "module";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BASE_URL      = process.env.BASE_URL ?? "http://localhost:3000";
const WF_URL        = `${BASE_URL}/api/seasonality/walk-forward`;
const OUTPUT_PATH   = join(ROOT, "public/generated/seasonality/ten_patterns/results.json");
const REGISTRY_VER  = "1.0.0";
const MIN_OBS       = 10;
const LOOKBACK_YEARS = 20;
const INIT_TRAINING  = 10;   // years of initial IS window
const OOS_BLOCK      = 2;    // OOS block size in years

// ─── Pattern definitions (must stay in sync with tenPatternsRegistry.ts) ───────
const PATTERNS = [
  { patternId: "rb1_long_slot29_v1",  assetId: "rb1",     direction: "LONG",  anchorSlot: 29,  holdingDays: 10, csvPath: "data/historical/energy/NYMEX_RB1_D.csv",              displayName: "RBOB Gasoline" },
  { patternId: "zw1_long_slot152_v1", assetId: "wheat",   direction: "LONG",  anchorSlot: 152, holdingDays: 10, csvPath: "workspace/output/tradingview_data_test/full_history_validated/CBOT_ZW1_TV_MERGED_FULL_HISTORY_daily.csv", displayName: "Chicago Wheat" },
  { patternId: "gc1_long_slot128_v1", assetId: "gc1",     direction: "LONG",  anchorSlot: 128, holdingDays: 10, csvPath: "data/historical/metals/COMEX_GC1_D.csv",               displayName: "Gold" },
  { patternId: "ng1_short_slot170_v1",assetId: "ng1",     direction: "SHORT", anchorSlot: 170, holdingDays: 10, csvPath: "data/historical/energy/NYMEX_NG1_D.csv",               displayName: "Natural Gas" },
  { patternId: "sb1_short_slot172_v1",assetId: "sugar",   direction: "SHORT", anchorSlot: 172, holdingDays: 10, csvPath: "workspace/output/tradingview_data_test/full_history_validated/ICEUS_SB1_TV_MERGED_FULL_HISTORY_daily.csv", displayName: "Sugar #11" },
  { patternId: "cc1_long_slot210_v1", assetId: "cocoa",   direction: "LONG",  anchorSlot: 210, holdingDays: 10, csvPath: "workspace/output/tradingview_data_test/full_history_validated/ICEUS_CC1_TV_MERGED_FULL_HISTORY_daily.csv", displayName: "Cocoa" },
  { patternId: "pa1_short_slot10_v1", assetId: "pa1",     direction: "SHORT", anchorSlot: 10,  holdingDays: 10, csvPath: "data/historical/metals/NYMEX_PA1_D.csv",               displayName: "Palladium" },
  { patternId: "zm1_long_slot73_v1",  assetId: "soymeal", direction: "LONG",  anchorSlot: 73,  holdingDays: 10, csvPath: null,                                                   displayName: "Soybean Meal" },
  { patternId: "ct1_long_slot29_v1",  assetId: "cotton",  direction: "LONG",  anchorSlot: 29,  holdingDays: 10, csvPath: "workspace/output/tradingview_data_test/full_history_validated/ICEUS_CT1_TV_MERGED_FULL_HISTORY_daily.csv", displayName: "Cotton #2" },
  { patternId: "es1_long_slot240_v1", assetId: "es1",     direction: "LONG",  anchorSlot: 240, holdingDays: 10, csvPath: "data/historical/indices/CME_MINI_ES1_D.csv",            displayName: "S&P 500 E-mini" },
];

// ─── CLI filter ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const patternArgIdx = args.findIndex(a => a === "--patterns");
const patternArgVal = patternArgIdx >= 0 ? args[patternArgIdx + 1]
  : args.find(a => a.startsWith("--patterns="))?.split("=")[1];
const filter = patternArgVal ? patternArgVal.split(",").map(s => s.trim()) : null;
const patternsToRun = filter ? PATTERNS.filter(p => filter.includes(p.patternId)) : PATTERNS;

// ─── Helpers ───────────────────────────────────────────────────────────────────
function sanitize(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    if (!isFinite(v) || isNaN(v)) return null;
    return v;
  }
  return v;
}

function sanitizeObj(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      result[k] = v.map(item => typeof item === "object" ? sanitizeObj(item) : sanitize(item));
    } else if (typeof v === "object" && v !== null) {
      result[k] = sanitizeObj(v);
    } else {
      result[k] = sanitize(v);
    }
  }
  return result;
}

function csvHash(relPath) {
  if (!relPath) return null;
  const full = join(ROOT, relPath);
  try {
    const content = readFileSync(full);
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

function csvLines(relPath) {
  if (!relPath) return 0;
  try {
    const content = readFileSync(join(ROOT, relPath), "utf8");
    return content.split("\n").filter(l => l.trim()).length - 1; // minus header
  } catch { return 0; }
}

async function apiPost(body, timeoutMs = 180_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(WF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function pct(v, decimals = 3) {
  const s = sanitize(v);
  return s == null ? null : parseFloat((s * 100).toFixed(decimals));
}

function round(v, decimals = 4) {
  const s = sanitize(v);
  return s == null ? null : parseFloat(s.toFixed(decimals));
}

// ─── Main ──────────────────────────────────────────────────────────────────────
console.log("\n╔══════════════════════════════════════════════════╗");
console.log("║   Compute Ten Pattern Results                    ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log(`Base URL : ${BASE_URL}`);
console.log(`Patterns : ${patternsToRun.length}/10`);
console.log(`Min. Obs.: ${MIN_OBS}`);
console.log(`Lookback : ${LOOKBACK_YEARS}y\n`);

// Check server reachable
try {
  const ping = await fetch(`${BASE_URL}/api/system/health`, { signal: AbortSignal.timeout(5000) });
  if (!ping.ok) throw new Error(`Health check HTTP ${ping.status}`);
  console.log("✓ Dev server reachable\n");
} catch (e) {
  console.error(`✗ Dev server NOT reachable at ${BASE_URL}`);
  console.error(`  Start it first: npm run dev`);
  console.error(`  Error: ${e.message}`);
  process.exit(1);
}

// Load existing results to preserve untouched entries
let existing = { generatedAt: "", registryVersion: REGISTRY_VER, patterns: {} };
try {
  existing = JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
  console.log(`Loaded existing results.json (${Object.keys(existing.patterns).length} entries)\n`);
} catch {
  console.log("No existing results.json — starting fresh\n");
}

const newPatterns = { ...existing.patterns };
const report = [];

for (const pat of patternsToRun) {
  const { patternId, assetId, direction, anchorSlot, holdingDays, csvPath, displayName } = pat;
  const hash = csvHash(csvPath);
  const nBars = csvLines(csvPath);

  console.log(`\n┌─ ${patternId}`);
  console.log(`│  Name      : ${displayName}`);
  console.log(`│  Direction : ${direction}  Slot: ${anchorSlot}  Hold: ${holdingDays}d`);
  console.log(`│  CSV       : ${csvPath ?? "NONE"}`);
  if (csvPath) console.log(`│  Hash      : ${hash ?? "ERROR"}  Bars: ${nBars}`);

  // ── no_data_source ──────────────────────────────────────────────────────────
  if (!csvPath) {
    console.log(`└  Status    : no_data_source`);
    const entry = {
      patternId, registryVersion: REGISTRY_VER,
      computedAt: new Date().toISOString(),
      status: "no_data_source",
      dataHash: null, csvPath: null,
      dataValidation: null, historical: null, wf: null,
    };
    newPatterns[patternId] = entry;
    report.push({ patternId, displayName, status: "no_data_source" });
    continue;
  }

  // ── Step 1: Fixed-pattern backtest (historical IS) ──────────────────────────
  let historical = null;
  let dataValidation = null;
  let status = "calculation_failed";

  try {
    console.log(`│  [1/2] Fetching fixed-pattern backtest…`);
    const bt = await apiPost({
      action: "fixedPatternBacktest",
      assetId,
      direction,
      startSlot: anchorSlot,
      holdingDays,
      lookbackYears: LOOKBACK_YEARS,
    });

    if (!bt || typeof bt !== "object") throw new Error("Empty response");
    if (bt.error) throw new Error(`API error: ${bt.error}`);

    const validTrades = (bt.trades ?? []).filter(t => t.validTrade && t.strategyReturn != null);
    const nObs = validTrades.length;

    console.log(`│     Trades: ${bt.trades?.length ?? 0} total, ${nObs} valid`);
    console.log(`│     Years : ${bt.sampleStartYear}–${bt.sampleEndYear}`);
    console.log(`│     WinRate: ${bt.winRate?.toFixed(1)}%  AvgPerf: ${(bt.avgPerformance * 100)?.toFixed(2)}%`);

    dataValidation = sanitizeObj({
      totalBars: nBars,
      firstDate: bt.trades?.[0]?.entryDate ?? "",
      lastDate: bt.trades?.[bt.trades.length - 1]?.exitDate ?? "",
      yearsAvailable: (bt.sampleEndYear ?? 0) - (bt.sampleStartYear ?? 0) + 1,
      validTradeCount: nObs,
      missingYearCount: bt.missingYears?.length ?? 0,
      missingYears: (bt.missingYears ?? []).map(m => m.year),
      csvHash: hash,
      csvBars: nBars,
      passed: nObs >= MIN_OBS,
      notes: nObs < MIN_OBS ? [`Only ${nObs} valid trades — below minimum ${MIN_OBS}`] : [],
    });

    if (nObs < MIN_OBS) {
      console.log(`│     ⚠ Insufficient: ${nObs} < ${MIN_OBS} min — marking insufficient_history`);
      status = "insufficient_history";
      historical = null;
    } else {
      // Build per-year returns from trades
      const yearReturns = validTrades.map(t => ({
        year: t.year,
        returnPct: round(t.strategyReturn * 100, 3),
        direction,
        entrySlot: t.entrySlot ?? anchorSlot,
        exitSlot: t.exitSlot ?? anchorSlot + holdingDays,
        entryDate: t.entryDate ?? null,
        exitDate: t.exitDate ?? null,
      })).sort((a, b) => a.year - b.year);

      // Verify no NaN/Infinity
      const badReturns = yearReturns.filter(r => r.returnPct == null || !isFinite(r.returnPct));
      if (badReturns.length > 0) {
        throw new Error(`${badReturns.length} trades have NaN/Infinity returnPct`);
      }

      // Median
      const sortedRets = [...yearReturns.map(r => r.returnPct)].sort((a, b) => a - b);
      const mid = Math.floor(sortedRets.length / 2);
      const medianRetPct = sortedRets.length % 2 === 0
        ? (sortedRets[mid - 1] + sortedRets[mid]) / 2
        : sortedRets[mid];

      // Decade consistency
      const decadeMap = new Map();
      for (const yr of yearReturns) {
        const decade = Math.floor(yr.year / 10) * 10;
        if (!decadeMap.has(decade)) decadeMap.set(decade, []);
        decadeMap.get(decade).push(yr.returnPct);
      }
      const decadeResults = Array.from(decadeMap.values()).map(rets => rets.reduce((s, v) => s + v, 0) > 0);
      const decadeConsistent = decadeResults.length >= 3
        ? decadeResults.filter(Boolean).length >= Math.ceil(decadeResults.length * 0.67)
        : null;

      historical = sanitizeObj({
        winRatePct: round(bt.winRate, 1),
        avgReturnPct: round(bt.avgPerformance * 100, 3),
        avgReturnMeanPct: round(bt.avgPerformance * 100, 3),
        avgReturnMedianPct: round(medianRetPct, 3),
        nObs,
        maxDrawdownPct: round(bt.maxDrawdown * 100, 2),
        sortinoRatio: round(bt.sortino, 4),
        profitFactor: round(bt.profitFactor, 4),
        sharpeRatio: round(bt.sharpe, 4),
        calmarRatio: round(bt.calmar, 4),
        decadeConsistent,
        sampleStartYear: bt.sampleStartYear,
        sampleEndYear: bt.sampleEndYear,
        yearReturns,
      });

      status = "calculated";
    }

  } catch (err) {
    console.log(`│     ✗ Backtest error: ${err.message}`);
    status = "calculation_failed";
  }

  // ── Step 2: Walk-forward (only if historical succeeded) ─────────────────────
  let wf = null;
  if (status === "calculated") {
    try {
      console.log(`│  [2/2] Fetching walk-forward (IT=${INIT_TRAINING}y OOS=${OOS_BLOCK}y)…`);
      const wfData = await apiPost({
        action: "patternFamilyWalkForward",
        assetId,
        direction,
        startSlot: anchorSlot,
        initialTrainingYears: INIT_TRAINING,
        oosBlockYears: OOS_BLOCK,
        baselineHoldingDays: holdingDays,
      }, 240_000);

      if (!wfData || typeof wfData !== "object") throw new Error("Empty WF response");
      if (wfData.error) throw new Error(`WF API error: ${wfData.error}`);

      const q = wfData.quality ?? {};
      console.log(`│     Folds: ${q.totalOosFolds ?? 0}  OOS trades: ${q.oosTradeCount ?? 0}`);
      console.log(`│     OOS WR: ${q.oosWinRate?.toFixed(1)}%  OOS Avg: ${(q.oosAvgReturn * 100)?.toFixed(2)}%`);
      console.log(`│     Quality: ${q.status}  Score: ${q.qualityScore}`);

      // Build fold-level log
      const folds = (wfData.folds ?? []).map((f, i) => ({
        foldIndex: i,
        isStartYear: f.isStartYear ?? f.trainingStartYear ?? null,
        isEndYear: f.isEndYear ?? f.trainingEndYear ?? null,
        oosYear: f.oosStartYear ?? f.oosYear ?? null,
        selectedEntrySlot: f.selectedEntryShift != null ? anchorSlot + f.selectedEntryShift : null,
        selectedHoldingDays: f.selectedHolding ?? null,
        oosReturnPct: f.oosReturn != null ? round(f.oosReturn * 100, 3) : null,
        oosWin: f.oosReturn != null ? (direction === "LONG" ? f.oosReturn > 0 : f.oosReturn < 0) : null,
      }));

      // Verify no NaN in folds
      const badFolds = folds.filter(f => f.oosReturnPct != null && !isFinite(f.oosReturnPct));
      if (badFolds.length > 0) throw new Error(`${badFolds.length} folds have NaN/Infinity oosReturnPct`);

      wf = sanitizeObj({
        oosWinRatePct: round(q.oosWinRate, 1),
        oosAvgReturnPct: round((q.oosAvgReturn ?? 0) * 100, 3),
        nFolds: q.totalOosFolds ?? 0,
        nOosObs: q.oosTradeCount ?? 0,
        oosMaxDrawdownPct: round((q.oosMaxDrawdown ?? 0) * 100, 2),
        oosSortinoRatio: null,
        oosProfitFactor: round(q.oosProfitFactor, 4),
        robustnessPct: round((q.parameterStability ?? 0) * 100, 1),
        qualityScore: q.qualityScore ?? null,
        qualityStatus: q.status ?? null,
        sourceFingerprint: wfData.sourceFingerprint ?? null,
        folds,
      });

    } catch (wfErr) {
      console.log(`│     ⚠ Walk-forward error: ${wfErr.message}`);
      console.log(`│     Pattern marked 'calculated' with historical data only`);
      wf = null;
    }
  }

  // ── Assemble entry ──────────────────────────────────────────────────────────
  console.log(`└  Status   : ${status}${wf ? " + WF" : ""}`);
  if (historical) {
    console.log(`   IS  WR: ${historical.winRatePct?.toFixed(1)}%  Avg: ${historical.avgReturnPct?.toFixed(2)}%  n: ${historical.nObs}`);
    if (wf) console.log(`   OOS WR: ${wf.oosWinRatePct?.toFixed(1)}%  Avg: ${wf.oosAvgReturnPct?.toFixed(2)}%  Folds: ${wf.nFolds}`);
  }

  newPatterns[patternId] = sanitizeObj({
    patternId,
    registryVersion: REGISTRY_VER,
    computedAt: new Date().toISOString(),
    status,
    csvPath: csvPath ?? null,
    dataHash: hash,
    dataValidation,
    historical: status === "calculated" ? historical : null,
    wf: status === "calculated" ? wf : null,
  });

  report.push({
    patternId,
    displayName,
    status,
    csvHash: hash,
    nBars,
    nObs: historical?.nObs ?? null,
    isWinRatePct: historical?.winRatePct ?? null,
    isAvgRetPct: historical?.avgReturnPct ?? null,
    isMedianRetPct: historical?.avgReturnMedianPct ?? null,
    maxDdPct: historical?.maxDrawdownPct ?? null,
    sortino: historical?.sortinoRatio ?? null,
    sharpe: historical?.sharpeRatio ?? null,
    pf: historical?.profitFactor ?? null,
    decadeConsistent: historical?.decadeConsistent ?? null,
    oosWinRatePct: wf?.oosWinRatePct ?? null,
    oosAvgRetPct: wf?.oosAvgReturnPct ?? null,
    oosFolds: wf?.nFolds ?? null,
    oosObs: wf?.nOosObs ?? null,
    qualityScore: wf?.qualityScore ?? null,
    qualityStatus: wf?.qualityStatus ?? null,
  });
}

// ─── Write output ───────────────────────────────────────────────────────────────
const output = sanitizeObj({
  generatedAt: new Date().toISOString(),
  registryVersion: REGISTRY_VER,
  patterns: newPatterns,
});

// Final NaN/Infinity check on the entire output
const serialized = JSON.stringify(output);
if (serialized.includes("NaN") || serialized.includes("Infinity")) {
  console.error("\n✗ OUTPUT CONTAINS NaN or Infinity — NOT WRITTEN");
  console.error("  Check sanitize() logic above.");
  process.exit(1);
}

mkdirSync(join(ROOT, "public/generated/seasonality/ten_patterns"), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

// ─── Summary report ─────────────────────────────────────────────────────────────
const byStatus = {
  calculated:           report.filter(r => r.status === "calculated").length,
  not_tested:           report.filter(r => r.status === "not_tested").length,
  no_data_source:       report.filter(r => r.status === "no_data_source").length,
  insufficient_history: report.filter(r => r.status === "insufficient_history").length,
  calculation_failed:   report.filter(r => r.status === "calculation_failed").length,
};

console.log("\n╔══════════════════════════════════════════════════╗");
console.log("║   Results Summary                                ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log(`calculated           : ${byStatus.calculated}`);
console.log(`not_tested           : ${byStatus.not_tested}`);
console.log(`no_data_source       : ${byStatus.no_data_source}`);
console.log(`insufficient_history : ${byStatus.insufficient_history}`);
console.log(`calculation_failed   : ${byStatus.calculation_failed}`);
console.log("");

for (const r of report) {
  const tag = r.status === "calculated" ? "✓" : r.status === "no_data_source" ? "—" : "✗";
  console.log(`${tag} ${r.patternId.padEnd(26)} ${r.status}`);
  if (r.status === "calculated") {
    console.log(`  IS  WR=${r.isWinRatePct?.toFixed(1)}% Avg=${r.isAvgRetPct?.toFixed(2)}% Med=${r.isMedianRetPct?.toFixed(2)}% n=${r.nObs} DD=${r.maxDdPct?.toFixed(1)}% Sort=${r.sortino?.toFixed(2)} PF=${r.pf?.toFixed(2)}`);
    if (r.oosWinRatePct != null)
      console.log(`  OOS WR=${r.oosWinRatePct?.toFixed(1)}% Avg=${r.oosAvgRetPct?.toFixed(2)}% Folds=${r.oosFolds} Obs=${r.oosObs} Q=${r.qualityStatus}`);
    else
      console.log(`  OOS: not computed`);
  }
}

console.log(`\nOutput written: ${OUTPUT_PATH}`);
console.log(`\nIMPORTANT: 'calculated' means computation ran successfully.`);
console.log(`It does NOT mean the pattern is validated or production-ready.`);
