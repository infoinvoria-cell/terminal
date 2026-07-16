#!/usr/bin/env node
// Validation script: Agrar V/S/M Integration
// Checks: registry consistency, adapter files, tester binding, Brain docs
// Run: node scripts/validate-agri-vsm-integration.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BRAIN = process.env.CAPITALIFE_BRAIN_PATH?.trim() || null;

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function fileExists(rel, base = ROOT) {
  return fs.existsSync(path.join(base, rel));
}

function fileContains(rel, search, base = ROOT) {
  try {
    const content = fs.readFileSync(path.join(base, rel), "utf8");
    return content.includes(search);
  } catch {
    return false;
  }
}

console.log("\n=== Agrar V/S/M Integration Validation ===\n");
check("CAPITALIFE_BRAIN_PATH configured", Boolean(BRAIN));

// ── 1. Registry files ─────────────────────────────────────────────────────────
console.log("1. Core files");
check("agri-v2-registry.ts exists", fileExists("src/lib/agri/agri-v2-registry.ts"));
check("useAgriStrategySelection.ts exists", fileExists("src/hooks/useAgriStrategySelection.ts"));
check("AgriStrategyKindButtons.tsx exists", fileExists("src/components/agri/AgriStrategyKindButtons.tsx"));
check("MonitoringFlexibleGrid has agri props", fileContains(
  "src/components/monitoring/MonitoringFlexibleGrid.tsx", "agriAvailableKindsBySymbol"
));

// ── 2. MonitoringPage both grid instances ─────────────────────────────────────
console.log("\n2. MonitoringPage grid bindings");
const monPage = fs.readFileSync(path.join(ROOT, "src/components/pages/MonitoringPage.tsx"), "utf8");
const agriKindToggleMatches = (monPage.match(/onAgriKindToggle=/g) ?? []).length;
check("onAgriKindToggle passed to both grid instances", agriKindToggleMatches >= 2,
  `found ${agriKindToggleMatches} occurrences (need ≥2)`);
const agriActiveKindMatches = (monPage.match(/agriActiveKindsBySymbol=/g) ?? []).length;
check("agriActiveKindsBySymbol passed to both grid instances", agriActiveKindMatches >= 2,
  `found ${agriActiveKindMatches}`);
check("agriActiveKinds passed to MonitoringStrategyWorkspace",
  monPage.includes("agriActiveKinds={"));

// ── 3. MonitoringStrategyWorkspace V/S/M binding ─────────────────────────────
console.log("\n3. MonitoringStrategyWorkspace tester binding");
const workspace = fs.readFileSync(
  path.join(ROOT, "src/components/monitoring/MonitoringStrategyWorkspace.tsx"), "utf8"
);
check("agriActiveKinds prop declared in Props type", workspace.includes("agriActiveKinds?: string[]"));
check("agriActiveKinds destructured", workspace.includes("agriActiveKinds,"));
check("setSelectedStrategyType sync effect present", workspace.includes("agriActiveKinds.length !== 1"));
check("seasonal kind mapped to selectedStrategyType", workspace.includes("setSelectedStrategyType(\"seasonal\")"));
check("valuation kind mapped", workspace.includes("setSelectedStrategyType(\"valuation\")"));
check("macro kind mapped", workspace.includes("setSelectedStrategyType(\"macro\")"));

// ── 4. White Swan adapter files ───────────────────────────────────────────────
console.log("\n4. White Swan adapter files");
check("agri-strategy-types.ts exists", fileExists("src/lib/white-swan/agri-strategy-types.ts"));
check("agri-strategy-adapter.ts exists", fileExists("src/lib/white-swan/agri-strategy-adapter.ts"));
check("agri-vsm-selector.ts exists", fileExists("src/lib/white-swan/agri-vsm-selector.ts"));
check("paperOnly enforced in types", fileContains(
  "src/lib/white-swan/agri-strategy-types.ts", "paperOnly: true"
));
check("combineKindDirections: CONFLICT when LONG+SHORT", fileContains(
  "src/lib/white-swan/agri-vsm-selector.ts", "CONFLICT"
));
check("no live signal in adapter", !fileContains(
  "src/lib/white-swan/agri-strategy-adapter.ts", "canBePromotedToLiveSignal=true"
));

// ── 5. Brain documentation ────────────────────────────────────────────────────
console.log("\n5. Brain documentation");
check("Agrar VSM Strategy Integration.md exists", fileExists(
  "04_Strategies\\White Swan\\Agrar VSM Strategy Integration.md", BRAIN ?? ROOT
));
check("Agrar Asset Strategy Matrix.md exists", fileExists(
  "04_Strategies\\White Swan\\Agrar Asset Strategy Matrix.md", BRAIN ?? ROOT
));
check("Monitoring Agrar VSM Controls.md exists", fileExists(
  "07_Technology\\Monitoring Agrar VSM Controls.md", BRAIN ?? ROOT
));
check("Analytics White Swan VSM Data Contract.md exists", fileExists(
  "07_Technology\\Analytics White Swan VSM Data Contract.md", BRAIN ?? ROOT
));

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n=== Result: ${passed} PASS / ${failed} FAIL ===\n`);
if (failed > 0) process.exit(1);
