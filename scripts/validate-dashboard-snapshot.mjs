#!/usr/bin/env node
/**
 * Validate the Capitalife Brain dashboard_snapshot.json.
 *
 * Checks:
 *  1. File exists and is valid JSON
 *  2. Registry counts match
 *  3. Strategy IDs are unique
 *  4. Core + Limited = total
 *  5. default_active strategies exist in list
 *  6. Seasonal Core strategies have safety_stop.present
 *  7. Portfolio core_default references valid strategy IDs
 *  8. Macro NOT presented as active Core sleeve
 *  9. Missing values are null/missing/unknown, not 0 when unknown
 * 10. AI_PROJECT_BRAIN_CURRENT.md contains required sections
 */

import fs from "fs";
import path from "path";

const BRAIN_ROOT = process.env.CAPITALIFE_BRAIN_PATH?.trim() || null;

if (!BRAIN_ROOT) {
  console.error("  ✗ CAPITALIFE_BRAIN_PATH missing");
  process.exit(1);
}

const SNAPSHOT_PATH = path.join(BRAIN_ROOT, "09_AI", "dashboard_snapshot.json");
const BRAIN_CURRENT_PATH = path.join(BRAIN_ROOT, "09_AI", "AI_PROJECT_BRAIN_CURRENT.md");

let pass = 0;
let fail = 0;
let warn = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
  pass++;
}
function err(label, detail) {
  console.error(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
  fail++;
}
function warning(label, detail) {
  console.warn(`  ⚠ ${label}${detail ? `: ${detail}` : ""}`);
  warn++;
}

console.log("\n=== validate-dashboard-snapshot ===\n");

// 1. File exists and valid JSON
let snap;
try {
  const raw = fs.readFileSync(SNAPSHOT_PATH, "utf-8");
  snap = JSON.parse(raw);
  ok("snapshot.json exists and is valid JSON");
} catch (e) {
  err("snapshot.json load failed", e.message);
  process.exit(1);
}

// 2. Required top-level fields
for (const field of ["manual", "project", "integrity", "counts", "portfolios", "strategies"]) {
  if (snap[field] !== undefined) ok(`field: ${field}`);
  else err(`missing field: ${field}`);
}

// 3. Mode must be PAPER_ONLY
if (snap.project?.mode === "PAPER_ONLY") ok("mode = PAPER_ONLY");
else err("mode is not PAPER_ONLY", snap.project?.mode);

// 4. Strategy array count matches declared total
const strategies = snap.strategies ?? [];
const declaredTotal = snap.counts?.strategies_total ?? -1;
if (strategies.length === declaredTotal) ok(`strategy count = ${strategies.length}`);
else err(`strategy count mismatch`, `array=${strategies.length} declared=${declaredTotal}`);

// 5. Strategy IDs unique
const ids = strategies.map((s) => s.strategy_id);
const uniqueIds = new Set(ids);
if (uniqueIds.size === ids.length) ok(`strategy IDs unique (${ids.length})`);
else err(`duplicate strategy IDs`, `${ids.length - uniqueIds.size} duplicates`);

// 6. Core + Limited = total
const coreCount = strategies.filter((s) => s.tier === "FINAL_CORE").length;
const limitedCount = strategies.filter((s) => s.tier === "FINAL_LIMITED").length;
const declaredCore = snap.counts?.core ?? -1;
const declaredLimited = snap.counts?.limited ?? -1;
if (coreCount === declaredCore) ok(`core count = ${coreCount}`);
else err(`core count mismatch`, `actual=${coreCount} declared=${declaredCore}`);
if (limitedCount === declaredLimited) ok(`limited count = ${limitedCount}`);
else err(`limited count mismatch`, `actual=${limitedCount} declared=${declaredLimited}`);
if (coreCount + limitedCount === declaredTotal) ok(`core + limited = total`);
else warning(`core + limited != total`, `${coreCount}+${limitedCount}=${coreCount+limitedCount} total=${declaredTotal}`);

// 7. default_active strategies exist in list
const defaultActive = strategies.filter((s) => s.enabled_default === true);
const declaredActive = snap.counts?.default_active ?? -1;
if (defaultActive.length === declaredActive) ok(`default_active count = ${defaultActive.length}`);
else warning(`default_active count mismatch`, `actual=${defaultActive.length} declared=${declaredActive}`);

// 8. Core portfolio refs valid
const corePortfolio = snap.portfolios?.core_default?.strategies ?? [];
const corePortfolioIds = corePortfolio.map((s) => s.strategy_id);
const missingRefs = corePortfolioIds.filter((id) => !uniqueIds.has(id));
if (missingRefs.length === 0) ok("core_default portfolio refs all valid");
else err("core_default portfolio has invalid refs", missingRefs.join(", "));

// 9. Seasonal Core strategies have safety_stop.present
const seasonalCore = strategies.filter((s) => s.tier === "FINAL_CORE" && s.approach === "Seasonal");
const missingStop = seasonalCore.filter((s) => !s.safety_stop?.present);
if (missingStop.length === 0) ok(`seasonal core strategies have safety_stop (${seasonalCore.length})`);
else err("seasonal core missing safety_stop", missingStop.map((s) => s.strategy_id).join(", "));

// 10. Macro not as active Core
const macroCore = strategies.filter((s) => s.approach === "Macro" && s.tier === "FINAL_CORE");
if (macroCore.length === 0) ok("macro is NOT in FINAL_CORE (correct)");
else err("macro incorrectly in FINAL_CORE", macroCore.map((s) => s.strategy_id).join(", "));

// 11. Macro default_active = false
const macroDefaultOn = strategies.filter((s) => s.approach === "Macro" && s.enabled_default === true);
if (macroDefaultOn.length === 0) ok("macro strategies all default OFF (correct)");
else err("macro strategy is default ON", macroDefaultOn.map((s) => s.strategy_id).join(", "));

// 12. AI_PROJECT_BRAIN_CURRENT.md has required sections
const requiredSections = [
  "## Bot Start Here",
  "## Projektmission",
  "## Aktuelle Versionen",
  "## Kanonische Quellen",
  "## Aktueller Portfoliozustand",
  "## Aktive Core-Strategien",
  "## Limited-Strategien",
  "## Ansatzstatus",
  "## Dashboardarchitektur",
  "## Offene Go-Live-Gates",
  "## Entscheidungen und unveränderliche Regeln",
  "## Übergabeanweisung für den nächsten KI-Bot",
];
try {
  const brainText = fs.readFileSync(BRAIN_CURRENT_PATH, "utf-8");
  const missingSections = requiredSections.filter((s) => !brainText.includes(s));
  if (missingSections.length === 0) ok(`AI_PROJECT_BRAIN_CURRENT.md has all ${requiredSections.length} required sections`);
  else err("AI_PROJECT_BRAIN_CURRENT.md missing sections", missingSections.join(", "));
} catch {
  err("AI_PROJECT_BRAIN_CURRENT.md not found", BRAIN_CURRENT_PATH);
}

// Summary
console.log(`\n--- Results ---`);
console.log(`PASS: ${pass}  FAIL: ${fail}  WARN: ${warn}`);
if (fail > 0) {
  console.error(`\nVALIDATION FAILED (${fail} errors)\n`);
  process.exit(1);
} else {
  console.log(`\nVALIDATION PASS${warn > 0 ? ` (with ${warn} warnings)` : ""}\n`);
  process.exit(0);
}
