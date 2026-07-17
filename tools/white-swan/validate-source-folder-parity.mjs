/**
 * White Swan Source Folder Parity Validator
 * Validates: SourceFolder vs Brain vs Dashboard vs Monitoring API
 *
 * Usage: node tools/white-swan/validate-source-folder-parity.mjs
 *
 * Security: Monitoring only. No execution. No order routing. No secrets.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const BRAIN_ROOT = path.resolve(PROJECT_ROOT, "../Capitalife Brain");
const SOURCE_FOLDER = path.join(BRAIN_ROOT, "_External_Sources/capitalife_brain_final_v1");

const results = { pass: [], warn: [], fail: [] };

function pass(msg) { results.pass.push(msg); }
function warn(msg) { results.warn.push(msg); }
function fail(msg) { results.fail.push(msg); }

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return null; }
}

function readCsv(p) {
  try {
    const lines = fs.readFileSync(p, "utf8").trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));
    });
  } catch { return null; }
}

// ─── A: Source Folder Structure ──────────────────────────────────────────────
console.log("\n=== A: Source Folder Structure ===");

const requiredFiles = [
  "README.md",
  "python/strategies_final.json",
  "python/strategy_registry_flat.csv",
  "python/groups.csv",
  "python/assets.csv",
  "python/key_stats.csv",
  "python/missing_data.csv",
  "python/deprecated_sources_do_not_use.csv",
  "python/source_files_manifest.csv",
  "dashboard/final_production_sleeves.snapshot.json",
  "dashboard/INGESTION_NOTES.md",
  "obsidian/03_Final_Strategies.md",
  "source_exports/final/agri/packages/agri_final_portfolio_package.zip",
  "source_exports/final/metals/packages/metals_wfo_focused_v2.zip",
  "source_exports/final/indices/packages/indices_hybrid_final.zip",
  "source_exports/final/energy/packages/energy_robust3_equal_weight_package.zip",
  "source_exports/final/forex/packages/forex8_final_clean_package.zip",
];

for (const f of requiredFiles) {
  const fp = path.join(SOURCE_FOLDER, f);
  if (fs.existsSync(fp)) pass(`Source file exists: ${f}`);
  else fail(`Source file MISSING: ${f}`);
}

// ─── B: Registry Parity ──────────────────────────────────────────────────────
console.log("\n=== B: Registry Parity ===");

const strategies = readCsv(path.join(SOURCE_FOLDER, "python/strategy_registry_flat.csv"));
const strategiesJson = readJson(path.join(SOURCE_FOLDER, "python/strategies_final.json"));

if (!strategies) { fail("Cannot read strategy_registry_flat.csv"); }
else {
  pass(`strategy_registry_flat.csv: ${strategies.length} rows`);
  const active = strategies.filter(s => s.active === "True");
  if (active.length === 35) pass(`Active strategies: ${active.length} (expected 35)`);
  else warn(`Active strategies: ${active.length} (expected 35)`);
}

// ─── C: Dashboard JSON Parity ────────────────────────────────────────────────
console.log("\n=== C: Dashboard JSON Parity ===");

const sfV1Path = path.join(PROJECT_ROOT, "src/data/capitalife/white-swan-source-folder-v1.json");
const globalPath = path.join(PROJECT_ROOT, "src/data/capitalife/white-swan-global-strategy.json");

const sfV1 = readJson(sfV1Path);
if (!sfV1) fail("white-swan-source-folder-v1.json missing");
else {
  pass("white-swan-source-folder-v1.json exists");
  if (sfV1.registry_counts?.active_strategies === 35) pass("registry_counts.active_strategies = 35");
  else fail(`registry_counts.active_strategies = ${sfV1.registry_counts?.active_strategies} (expected 35)`);
  if (sfV1.production_sleeves?.length === 5) pass("production_sleeves: 5 sleeves");
  else fail(`production_sleeves: ${sfV1.production_sleeves?.length} (expected 5)`);
}

const globalJson = readJson(globalPath);
if (!globalJson) fail("white-swan-global-strategy.json missing");
else pass("white-swan-global-strategy.json exists");

// ─── D: Asset Universe Parity ────────────────────────────────────────────────
console.log("\n=== D: Asset Universe Parity ===");

const universePath = path.join(PROJECT_ROOT, "public/generated/monitoring/config/monitoring_asset_universe.json");
const universe = readJson(universePath);

const expectedMetalAssets = ["GC1!", "SI1!", "HG1!", "PL1!", "PA1!"];
const expectedEnergyAssets = ["CL1!", "NG1!", "RB1!"];
const expectedForex8 = ["EURGBP", "MXNUSD", "NOKUSD", "CLPUSD", "GBPJPY", "SEKUSD", "BRLUSD", "ZARUSD"];

if (!universe) {
  fail("monitoring_asset_universe.json missing");
} else {
  const universeAssets = universe.assets.map(a => a.symbol);
  pass(`Universe: ${universeAssets.length} assets`);

  for (const sym of expectedMetalAssets) {
    if (universeAssets.includes(sym)) pass(`Metals5 asset in universe: ${sym}`);
    else fail(`Metals5 asset MISSING from universe: ${sym}`);
  }
  for (const sym of expectedEnergyAssets) {
    if (universeAssets.includes(sym)) pass(`Energy Robust3 asset in universe: ${sym}`);
    else fail(`Energy Robust3 asset MISSING from universe: ${sym}`);
  }
  for (const sym of expectedForex8) {
    if (universeAssets.includes(sym)) pass(`Forex8 asset in universe: ${sym}`);
    else warn(`Forex8 asset NOT in universe: ${sym} (no TVC cache — expected gap)`);
  }
}

// ─── E: TVC Cache Parity ─────────────────────────────────────────────────────
console.log("\n=== E: TVC Cache Parity ===");

const cacheDir = path.join(PROJECT_ROOT, "public/generated/monitoring/tradingview_data_cache/D");
const cacheFiles = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : [];

const assetCacheMap = {
  "GC1!": "COMEX_GC1_D.json",
  "SI1!": "COMEX_SI1_D.json",
  "HG1!": "COMEX_HG1_D.json",
  "PL1!": "NYMEX_PL1_D.json",
  "PA1!": "NYMEX_PA1_D.json",
  "CL1!": "NYMEX_CL1_D.json",
  "NG1!": "NYMEX_NG1_D.json",
  "RB1!": "NYMEX_RB1_D.json",
  "ES1!": "CME_MINI_ES1_D.json",
  "NQ1!": "CME_MINI_NQ1_D.json",
  "YM1!": "CBOT_MINI_YM1_D.json",
  "FDAX1!": "EUREX_FDAX1_D.json",
  "UKX": "TVC_UKX_D.json",
  "ZW1!": "CBOT_ZW1_D.json",
  "ZC1!": "CBOT_ZC1_D.json",
  "ZS1!": "CBOT_ZS1_D.json",
  "CC1!": "ICEUS_CC1_D.json",
  "KC1!": "ICEUS_KC1_D.json",
  "OJ1!": "ICEUS_OJ1_D.json",
};

// Forex8 TVC cache: EURGBP+GBPJPY built from Dukascopy (stale Apr 2026); 6 others no OHLC source
const forex8CacheMap = {
  "EURGBP": "VANTAGE_EURGBP_D.json",   // built from Dukascopy hourly, stale 2026-04-07
  "GBPJPY": "VANTAGE_GBPJPY_D.json",   // built from Dukascopy hourly, stale 2026-04-07
  "MXNUSD": "FX_IDC_MXNUSD_D.json",   // stub — no OHLC in local system
  "NOKUSD": "CME_NOK1_D.json",         // stub — no OHLC in local system
  "CLPUSD": "FX_IDC_CLPUSD_D.json",   // stub — no OHLC in local system
  "SEKUSD": "FX_IDC_SEKUSD_D.json",   // stub — no OHLC in local system
  "BRLUSD": "FX_IDC_BRLUSD_D.json",   // stub — no OHLC in local system
  "ZARUSD": "FX_IDC_ZARUSD_D.json",   // stub — no OHLC in local system
};

for (const [sym, file] of Object.entries(assetCacheMap)) {
  if (cacheFiles.includes(file)) pass(`TVC cache: ${sym} → ${file}`);
  else fail(`TVC cache MISSING: ${sym} → ${file}`);
}

for (const [sym, file] of Object.entries(forex8CacheMap)) {
  if (cacheFiles.includes(file)) {
    const p = path.join(cacheDir, file);
    const meta = readJson(p);
    if (meta?.barCount > 0) {
      pass(`Forex8 TVC cache (stale-ok): ${sym} → ${file} | bars=${meta.barCount} last=${meta.lastDate}`);
    } else {
      warn(`Forex8 TVC cache stub (no OHLC): ${sym} → ${file} | barCount=0 — strategy events only`);
    }
  } else {
    fail(`Forex8 TVC cache MISSING: ${sym} → ${file}`);
  }
}

// ─── F: Strategy Events Parity ───────────────────────────────────────────────
console.log("\n=== F: Strategy Events Parity ===");

const strategiesDir = path.join(PROJECT_ROOT, "public/generated/monitoring/strategies");
const eventFiles = fs.existsSync(strategiesDir) ? fs.readdirSync(strategiesDir) : [];

const expectedEvents = {
  "GC1!": "COMEX_GC1_events.json",
  "SI1!": "COMEX_SI1_events.json",
  "PA1!": "NYMEX_PA1_events.json",
  "PL1!": "NYMEX_PL1_events.json",
  "CL1!": "NYMEX_CL1_events.json",
  "NG1!": "NYMEX_NG1_events.json",
  // Forex8 events (from capitalife_portfolio CSV exports)
  "EURGBP": "VANTAGE_EURGBP_events.json",
  "GBPJPY": "VANTAGE_GBPJPY_events.json",
  "MXNUSD": "FX_IDC_MXNUSD_events.json",
  "NOKUSD": "CME_NOK1_events.json",
  "CLPUSD": "FX_IDC_CLPUSD_events.json",
  "SEKUSD": "FX_IDC_SEKUSD_events.json",
  "BRLUSD": "FX_IDC_BRLUSD_events.json",
  "ZARUSD": "FX_IDC_ZARUSD_events.json",
};

const missingEvents = {
  "HG1!": "COMEX_HG1_events.json (missing — no strategy events for Copper)",
  "RB1!": "NYMEX_RB1_events.json (missing — no strategy events for Gasoline)",
};

for (const [sym, file] of Object.entries(expectedEvents)) {
  if (eventFiles.includes(file)) pass(`Strategy events: ${sym} → ${file}`);
  else fail(`Strategy events MISSING: ${sym} → ${file}`);
}

for (const [sym, msg] of Object.entries(missingEvents)) {
  warn(`Strategy events gap: ${sym} — ${msg}`);
}

// ─── G: Tab Config Parity ────────────────────────────────────────────────────
console.log("\n=== G: Tab Config Parity ===");

const tabConfigPath = path.join(PROJECT_ROOT, "src/config/monitoringTabConfig.ts");
if (!fs.existsSync(tabConfigPath)) {
  fail("monitoringTabConfig.ts missing");
} else {
  const tabConfig = fs.readFileSync(tabConfigPath, "utf8");
  const checkAssets = ["HG1!", "NG1!", "RB1!", "NQ1!", "UKX!", "ZS1!", "KC1!"];
  for (const sym of checkAssets) {
    if (tabConfig.includes(`"${sym}"`)) pass(`Tab config contains: ${sym}`);
    else warn(`Tab config missing: ${sym}`);
  }
  if (!tabConfig.includes("hidden: true")) pass("FX tab visible (Forex8 active)");
  else warn("FX tab still hidden — should be visible for Forex8");
}

// ─── H: Deprecated Sources Check ─────────────────────────────────────────────
console.log("\n=== H: Deprecated Sources Check ===");

const deprecatedPatterns = [
  "frontend/public/generated",
  "workspace/output/tradingview_data_test",
  "path.join(process.cwd(), \"..\")",
];

const sourceFiles = [
  "src/lib/monitoring/strategyTester/engines/macroValuation/ohlc.ts",
  "src/lib/monitoring/strategyTester/engines/macroValuation/csvReference.ts",
  "src/lib/monitoring/strategyTester/engines/macroValuation/pythonRunner.ts",
  "src/lib/monitoring/strategyTester/engines/macroValuation/bindings.ts",
];

for (const sf of sourceFiles) {
  const fp = path.join(PROJECT_ROOT, sf);
  if (!fs.existsSync(fp)) { warn(`Source file not found: ${sf}`); continue; }
  const content = fs.readFileSync(fp, "utf8");
  let clean = true;
  for (const pattern of deprecatedPatterns) {
    if (content.includes(pattern)) {
      fail(`Deprecated pattern found in ${sf}: ${pattern}`);
      clean = false;
    }
  }
  if (clean) pass(`No deprecated paths in: ${sf}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("\n=== PARITY SUMMARY ===");
console.log(`PASS: ${results.pass.length}`);
console.log(`WARN: ${results.warn.length}`);
console.log(`FAIL: ${results.fail.length}`);

if (results.fail.length > 0) {
  console.log("\n--- FAILURES ---");
  results.fail.forEach(f => console.log(`  ✗ ${f}`));
}
if (results.warn.length > 0) {
  console.log("\n--- WARNINGS ---");
  results.warn.forEach(w => console.log(`  ⚠ ${w}`));
}

const overallStatus = results.fail.length === 0 ? (results.warn.length === 0 ? "PASS" : "WARN") : "FAIL";
console.log(`\nOverall: ${overallStatus}`);

// Write JSON report
const reportJson = {
  generated_at: new Date().toISOString(),
  overall: overallStatus,
  counts: { pass: results.pass.length, warn: results.warn.length, fail: results.fail.length },
  failures: results.fail,
  warnings: results.warn,
  passes: results.pass,
};

const reportDir = path.join(BRAIN_ROOT, "14_Data_Room");
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  path.join(reportDir, "White Swan Source Folder Parity Report.json"),
  JSON.stringify(reportJson, null, 2),
  "utf8"
);

// Write MD report
const mdReport = `# White Swan Source Folder Parity Report

**Datum:** ${new Date().toISOString().slice(0, 10)}
**Status:** ${overallStatus}
**PASS:** ${results.pass.length} | **WARN:** ${results.warn.length} | **FAIL:** ${results.fail.length}

---

## Failures

${results.fail.length === 0 ? "_Keine_" : results.fail.map(f => `- ✗ ${f}`).join("\n")}

---

## Warnings

${results.warn.length === 0 ? "_Keine_" : results.warn.map(w => `- ⚠ ${w}`).join("\n")}

---

## Passes (${results.pass.length})

${results.pass.map(p => `- ✓ ${p}`).join("\n")}
`;

fs.writeFileSync(
  path.join(reportDir, "White Swan Source Folder Parity Report.md"),
  mdReport,
  "utf8"
);

console.log(`\nReport written to: ${path.join(reportDir, "White Swan Source Folder Parity Report.json")}`);
process.exit(results.fail.length > 0 ? 1 : 0);
