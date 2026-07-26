import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const strategyPath = path.join(root, "src/lib/components/ws-strategy-data.ts");
const coreHookPath = path.join(root, "src/components/core-invest/use-core-invest-data.ts");

const strategySource = await readFile(strategyPath, "utf8");
const coreHookSource = await readFile(coreHookPath, "utf8");

function fail(message) {
  throw new Error(`Strategy proof validation failed: ${message}`);
}

function arrayBody(name, nextName) {
  const startMarker = `const ${name}: StrategyRow[] = [`;
  const start = strategySource.indexOf(startMarker);
  const end = strategySource.indexOf(`const ${nextName}: StrategyRow[] = [`, start);
  if (start < 0 || end < 0) fail(`cannot locate ${name}`);
  return strategySource.slice(start, end);
}

function activeRows(body) {
  return [...body.matchAll(/\{[\s\S]*?\n\s*\},/g)]
    .map((match) => match[0])
    .filter((row) => /status:\s*"active"/.test(row));
}

function rowWeight(row) {
  const match = row.match(/\bweight:\s*([0-9.]+)/);
  if (!match) fail("active White Swan row has no numeric weight");
  return Number(match[1]);
}

const groups = [
  ["VALUATION", "MACRO"],
  ["MACRO", "TREND"],
  ["TREND", "SEASONAL"],
  ["SEASONAL", "ANOMALY"],
  ["ANOMALY", "INTRADAY"],
];
const wsRows = groups.flatMap(([name, next]) => activeRows(arrayBody(name, next)));

const intradayStart = strategySource.indexOf("const INTRADAY: StrategyRow[] = [");
const intradayEnd = strategySource.indexOf("export const WS_STRATEGIES", intradayStart);
if (intradayStart < 0 || intradayEnd < 0) fail("cannot locate INTRADAY");
wsRows.push(...activeRows(strategySource.slice(intradayStart, intradayEnd)));

const wsWeight = wsRows.reduce((sum, row) => sum + rowWeight(row), 0);
if (wsRows.length !== 29) fail(`expected 29 active White Swan components, found ${wsRows.length}`);
if (Math.abs(wsWeight - 100) > 1e-9) fail(`White Swan weights sum to ${wsWeight}, expected 100`);

const expectedIntradayWeights = {
  eurusd_30m: 12.8,
  dax_1h: 12.8,
  dax_2h: 4.8,
  gbpusd_30m: 1.6,
};
const intradayBody = strategySource.slice(intradayStart, intradayEnd);
for (const [id, weight] of Object.entries(expectedIntradayWeights)) {
  const row = activeRows(intradayBody).find((candidate) => candidate.includes(`id: "${id}"`));
  if (!row) fail(`missing active intraday component ${id}`);
  if (rowWeight(row) !== weight) fail(`${id} weight differs from validated v3-F allocation`);
}

const ciWeightsMatch = strategySource.match(/export const CI_WEIGHTS = \{([\s\S]*?)\} as const;/);
if (!ciWeightsMatch) fail("cannot locate CI_WEIGHTS");
const ciWeights = [...ciWeightsMatch[1].matchAll(/:\s*([0-9.]+),/g)].map((match) => Number(match[1]));
const ciWeight = ciWeights.reduce((sum, value) => sum + value, 0);
if (ciWeights.length !== 8) fail(`expected 8 Core Invest allocations, found ${ciWeights.length}`);
if (Math.abs(ciWeight - 1) > 1e-9) fail(`Core Invest weights sum to ${ciWeight}, expected 1`);

for (const forbidden of ["deriveSignals_Pine1", "deriveSignals_Pine2", "buildEquityCurve"]) {
  if (coreHookSource.includes(forbidden)) {
    fail(`approximation helper ${forbidden} is exposed in the monitoring hook`);
  }
}
if (!coreHookSource.includes('validationStatus: hasBars ? "partial_validation"')) {
  fail("Core Invest sleeves are not marked partial_validation");
}

console.log(`Strategy proof OK: White Swan ${wsRows.length} components / ${wsWeight.toFixed(0)}%`);
console.log(`Strategy proof OK: Core Invest ${ciWeights.length} allocations / ${(ciWeight * 100).toFixed(0)}%`);
console.log("Strategy proof OK: approximate Core Invest signals are disabled");
