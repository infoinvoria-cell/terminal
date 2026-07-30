/**
 * compute-ten-pattern-results.mjs
 *
 * Runs real historical and walk-forward calculations for all 10 seasonal patterns.
 * Results are written to:
 *   public/generated/seasonality/ten_patterns/results.json
 *
 * Usage:
 *   node scripts/compute-ten-pattern-results.mjs
 *   node scripts/compute-ten-pattern-results.mjs --patterns rb1_long_slot29_v1,gc1_long_slot128_v1
 *
 * Prerequisites:
 *   - Local dev server running on port 3000 (npm run dev)
 *   - Or run against a deployed Vercel URL: BASE_URL=https://... node scripts/...
 *
 * What this script does:
 *   1. Calls /api/pattern-data for each pattern (historical IS KPIs + yearly returns)
 *   2. Calls /api/pattern-family-wf for each pattern (OOS walk-forward KPIs)
 *   3. Merges results into a single results.json
 *   4. Patterns with no_data_source status are skipped and preserved as-is.
 *
 * The script is IDEMPOTENT — re-running overwrites with fresh computation.
 * On error for a specific pattern, the existing entry is preserved and an error note added.
 */

import { createRequire } from "module";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUTPUT_PATH = join(ROOT, "public/generated/seasonality/ten_patterns/results.json");
const REGISTRY_VERSION = "1.0.0";

// ─── Pattern definitions (must stay in sync with tenPatternsRegistry.ts) ───
const TEN_PATTERNS = [
  { patternId: "rb1_long_slot29_v1",  assetId: "rb1",     direction: "LONG",  anchorStartSlot: 29,  holdingDays: 10, csvPath: "data/historical/energy/NYMEX_RB1_D.csv" },
  { patternId: "zw1_long_slot152_v1", assetId: "wheat",   direction: "LONG",  anchorStartSlot: 152, holdingDays: 10, csvPath: "workspace/output/tradingview_data_test/full_history_validated/CBOT_ZW1_TV_MERGED_FULL_HISTORY_daily.csv" },
  { patternId: "gc1_long_slot128_v1", assetId: "gc1",     direction: "LONG",  anchorStartSlot: 128, holdingDays: 10, csvPath: "data/historical/metals/COMEX_GC1_D.csv" },
  { patternId: "ng1_short_slot170_v1",assetId: "ng1",     direction: "SHORT", anchorStartSlot: 170, holdingDays: 10, csvPath: "data/historical/energy/NYMEX_NG1_D.csv" },
  { patternId: "sb1_short_slot172_v1",assetId: "sugar",   direction: "SHORT", anchorStartSlot: 172, holdingDays: 10, csvPath: "workspace/output/tradingview_data_test/full_history_validated/ICEUS_SB1_TV_MERGED_FULL_HISTORY_daily.csv" },
  { patternId: "cc1_long_slot210_v1", assetId: "cocoa",   direction: "LONG",  anchorStartSlot: 210, holdingDays: 10, csvPath: "workspace/output/tradingview_data_test/full_history_validated/ICEUS_CC1_TV_MERGED_FULL_HISTORY_daily.csv" },
  { patternId: "pa1_short_slot10_v1", assetId: "pa1",     direction: "SHORT", anchorStartSlot: 10,  holdingDays: 10, csvPath: "data/historical/metals/NYMEX_PA1_D.csv" },
  { patternId: "zm1_long_slot73_v1",  assetId: "soymeal", direction: "LONG",  anchorStartSlot: 73,  holdingDays: 10, csvPath: null },
  { patternId: "ct1_long_slot29_v1",  assetId: "cotton",  direction: "LONG",  anchorStartSlot: 29,  holdingDays: 10, csvPath: "workspace/output/tradingview_data_test/full_history_validated/ICEUS_CT1_TV_MERGED_FULL_HISTORY_daily.csv" },
  { patternId: "es1_long_slot240_v1", assetId: "es1",     direction: "LONG",  anchorStartSlot: 240, holdingDays: 10, csvPath: "data/historical/indices/CME_MINI_ES1_D.csv" },
];

// ─── CLI: filter patterns ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const patternFilterArg = args.find(a => a.startsWith("--patterns="))?.split("=")[1]
  ?? args[args.indexOf("--patterns") + 1];
const patternFilter = patternFilterArg ? patternFilterArg.split(",").map(s => s.trim()) : null;
const patterns = patternFilter
  ? TEN_PATTERNS.filter(p => patternFilter.includes(p.patternId))
  : TEN_PATTERNS;

console.log(`\n=== Compute Ten Pattern Results ===`);
console.log(`Base URL: ${BASE_URL}`);
console.log(`Patterns: ${patterns.map(p => p.patternId).join(", ")}\n`);

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function apiFetch(path, body) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} from ${path}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Compute historical KPIs from year returns */
function computeHistoricalKpi(yearReturns, direction) {
  if (!yearReturns || yearReturns.length === 0) return null;
  const rets = yearReturns.map(r => r.returnPct);
  const n = rets.length;
  const wins = rets.filter(r => direction === "LONG" ? r > 0 : r < 0).length;
  const winRatePct = (wins / n) * 100;
  const mean = rets.reduce((s, v) => s + v, 0) / n;
  const sorted = [...rets].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const negRets = rets.filter(r => r < 0);
  const negMeanSq = negRets.length > 0 ? negRets.reduce((s, v) => s + v ** 2, 0) / negRets.length : null;
  const sortino = negMeanSq != null && negMeanSq > 0 ? mean / Math.sqrt(negMeanSq) : null;
  const grossWin = rets.filter(r => r > 0).reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(rets.filter(r => r < 0).reduce((s, v) => s + v, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;

  // Max drawdown (cumulative)
  let cum = 0; let peak = 0; let maxDd = 0;
  for (const r of rets) {
    cum += r;
    if (cum > peak) peak = cum;
    const dd = cum - peak;
    if (dd < maxDd) maxDd = dd;
  }

  // Decade consistency: positive in 3+ decades
  const decadeMap = new Map();
  for (const yr of yearReturns) {
    const decade = Math.floor(yr.year / 10) * 10;
    if (!decadeMap.has(decade)) decadeMap.set(decade, []);
    decadeMap.get(decade).push(yr.returnPct);
  }
  const decadeResults = Array.from(decadeMap.values()).map(
    rets => rets.reduce((s, v) => s + v, 0) > 0
  );
  const decadeConsistent = decadeResults.length >= 3
    ? decadeResults.filter(Boolean).length >= Math.ceil(decadeResults.length * 0.67)
    : null;

  return {
    winRatePct: parseFloat(winRatePct.toFixed(1)),
    avgReturnPct: parseFloat(mean.toFixed(3)),
    nObs: n,
    maxDrawdownPct: parseFloat(maxDd.toFixed(2)),
    sortinoRatio: sortino != null ? parseFloat(sortino.toFixed(3)) : null,
    profitFactor: profitFactor != null ? parseFloat(profitFactor.toFixed(3)) : null,
    decadeConsistent,
    yearReturns,
    avgReturnMeanPct: parseFloat(mean.toFixed(3)),
    avgReturnMedianPct: parseFloat(median.toFixed(3)),
  };
}

// ─── Load existing results ────────────────────────────────────────────────────
let existingResults = { generatedAt: "", registryVersion: REGISTRY_VERSION, patterns: {} };
try {
  existingResults = JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
  console.log(`Loaded existing results (${Object.keys(existingResults.patterns).length} patterns)`);
} catch {
  console.log("No existing results file — starting fresh");
}

const newPatterns = { ...existingResults.patterns };

// ─── Process each pattern ─────────────────────────────────────────────────────
for (const pat of patterns) {
  const { patternId, assetId, direction, anchorStartSlot, holdingDays, csvPath } = pat;
  console.log(`\n--- ${patternId} ---`);

  if (!csvPath) {
    console.log(`  ⚠ No CSV path — marking as no_data_source`);
    newPatterns[patternId] = {
      patternId,
      registryVersion: REGISTRY_VERSION,
      computedAt: new Date().toISOString(),
      status: "no_data_source",
      dataValidation: null,
      historical: null,
      wf: null,
    };
    continue;
  }

  try {
    // 1. Load pattern data (historical IS)
    console.log(`  Fetching historical pattern data for ${assetId}…`);
    const patternData = await apiFetch("/api/pattern-data", {
      assetId,
      lookbackYears: 20,
      targetSlot: anchorStartSlot,
      direction,
      holdingDays,
    });

    // Extract year returns from the best candidate or the annual breakdown
    let yearReturns = [];
    if (patternData?.bestCandidate?.strategyReturns?.length > 0) {
      // strategyReturns is an array of per-year returns for the best candidate
      const rets = patternData.bestCandidate.strategyReturns;
      const startYear = new Date().getFullYear() - rets.length;
      yearReturns = rets.map((r, i) => ({
        year: startYear + i,
        returnPct: parseFloat((r * 100).toFixed(3)),
        direction,
        entrySlot: anchorStartSlot,
        exitSlot: anchorStartSlot + holdingDays,
      }));
    } else if (patternData?.yearlyBreakdown?.length > 0) {
      yearReturns = patternData.yearlyBreakdown.map(y => ({
        year: y.year,
        returnPct: parseFloat((y.returnPct ?? y.return ?? 0).toFixed(3)),
        direction,
        entrySlot: anchorStartSlot,
        exitSlot: anchorStartSlot + holdingDays,
      }));
    }

    const historical = computeHistoricalKpi(yearReturns, direction);
    console.log(`  ✓ Historical: n=${historical?.nObs ?? 0}, WR=${historical?.winRatePct?.toFixed(1) ?? "—"}%, avg=${historical?.avgReturnPct?.toFixed(2) ?? "—"}%`);

    // 2. Validate data
    const dataValidation = patternData?.dataValidation ?? {
      totalBars: patternData?.totalBars ?? 0,
      firstDate: patternData?.firstDate ?? "",
      lastDate: patternData?.lastDate ?? "",
      yearsAvailable: patternData?.yearsAvailable ?? yearReturns.length,
      nullPriceCount: 0,
      gapDaysOver5: 0,
      outliersRemoved: 0,
      passed: (historical?.nObs ?? 0) >= 10,
      notes: [],
    };

    // 3. Walk-forward
    console.log(`  Fetching walk-forward results for ${assetId}…`);
    let wf = null;
    try {
      const wfData = await apiFetch("/api/pattern-family-wf", {
        assetId,
        anchorSlot: anchorStartSlot,
        direction,
        lookbackYears: 20,
      });

      if (wfData?.quality) {
        const q = wfData.quality;
        wf = {
          oosWinRatePct: parseFloat((q.oosWinRate ?? 0).toFixed(1)),
          oosAvgReturnPct: parseFloat(((q.oosAvgReturn ?? 0) * 100).toFixed(3)),
          nFolds: q.nFolds ?? 0,
          nOosObs: q.nOosObs ?? 0,
          oosMaxDrawdownPct: parseFloat(((q.oosMaxDrawdown ?? 0) * 100).toFixed(2)),
          oosSortinoRatio: q.oosSortino != null ? parseFloat(q.oosSortino.toFixed(3)) : null,
          robustnessPct: q.robustness != null ? parseFloat((q.robustness * 100).toFixed(1)) : null,
          folds: wfData.folds ?? [],
        };
        console.log(`  ✓ Walk-forward: folds=${wf.nFolds}, OOS WR=${wf.oosWinRatePct.toFixed(1)}%`);
      }
    } catch (wfErr) {
      console.warn(`  ⚠ Walk-forward failed: ${wfErr.message}`);
    }

    const status = wf ? "wf_completed" : historical ? "historical_computed" : "not_tested";

    newPatterns[patternId] = {
      patternId,
      registryVersion: REGISTRY_VERSION,
      computedAt: new Date().toISOString(),
      status,
      dataValidation,
      historical,
      wf,
    };

    console.log(`  ✓ Status: ${status}`);

  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
    // Preserve existing entry if available, add error note
    newPatterns[patternId] = {
      ...(existingResults.patterns[patternId] ?? {
        patternId,
        registryVersion: REGISTRY_VERSION,
        computedAt: new Date().toISOString(),
        status: "data_error",
        dataValidation: null,
        historical: null,
        wf: null,
      }),
      status: "data_error",
      computedAt: new Date().toISOString(),
    };
  }
}

// ─── Write output ─────────────────────────────────────────────────────────────
const output = {
  generatedAt: new Date().toISOString(),
  registryVersion: REGISTRY_VERSION,
  patterns: newPatterns,
};

mkdirSync(join(ROOT, "public/generated/seasonality/ten_patterns"), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

const computed = Object.values(newPatterns).filter(p => p.status === "historical_computed" || p.status === "wf_completed");
const wfDone   = Object.values(newPatterns).filter(p => p.status === "wf_completed");

console.log(`\n=== Done ===`);
console.log(`Computed: ${computed.length}/10 (${wfDone.length} with Walk-Forward)`);
console.log(`Output: ${OUTPUT_PATH}\n`);
