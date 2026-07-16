import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getFinalProductionRegistry } from "@/lib/server/monitoring/finalProductionRegistry";

const EMPTY_REGISTRY = {
  config: { version: "0", generatedAt: "", globalTestStandard: { dashboardModes: [], liveWindow: { start: "", end: "" }, fullWindow: { start: "", end: "" }, isWindow: { start: "", end: "" }, walkForwardWindows: [] }, sleeves: [] },
  productionStrategies: [] as unknown[],
  activeStrategies: [] as unknown[],
  summary: { sleeveCount: 0, strategyCount: 0, activeStrategyCount: 0, dashboardModes: [], liveStart: "", fullIsReferenceOnly: true },
  missingDataReport: [] as unknown[],
  missingData: [] as unknown[],
};

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let finalProductionRegistry: any = EMPTY_REGISTRY;
  try {
    finalProductionRegistry = getFinalProductionRegistry();
  } catch {
    // Config file not found (no Invoria workspace) — return empty registry so
    // the monitoring page can still render charts from the local TVC cache.
  }
  const registryPath = path.join(
    process.cwd(),
    "..",
    "workspace",
    "monitoring_strategy_infrastructure",
    "registry",
    "strategy_registry.json",
  );

  try {
    if (fs.existsSync(registryPath)) {
      const raw = fs.readFileSync(registryPath, "utf-8");
      const data = JSON.parse(raw);
      return NextResponse.json({
        source: "file",
        registry: data,
        finalProductionRegistry,
        finalProduction: finalProductionRegistry,
        summary: finalProductionRegistry.summary,
        productionStrategies: finalProductionRegistry.productionStrategies,
        activeStrategies: finalProductionRegistry.activeStrategies,
        missingDataReport: finalProductionRegistry.missingDataReport,
        missingData: finalProductionRegistry.missingData,
      });
    }
  } catch {
    // fall through to inline
  }

  return NextResponse.json({
    source: "fallback",
    note: "File registry not found - returning wave1 groups only",
    registry: buildFallbackRegistry(),
    finalProductionRegistry,
    finalProduction: finalProductionRegistry,
    summary: finalProductionRegistry.summary,
    productionStrategies: finalProductionRegistry.productionStrategies,
    activeStrategies: finalProductionRegistry.activeStrategies,
    missingDataReport: finalProductionRegistry.missingDataReport,
    missingData: finalProductionRegistry.missingData,
  });
}

function buildFallbackRegistry() {
  const wave1 = [
    { group: "agrar", symbols: ["ZW1", "ZC1", "ZS1", "CC1", "KC1", "SB1", "CT1", "OJ1"] },
    { group: "intraday", symbols: ["DAX_2H", "DAX_1H", "GBPUSD_30M", "EURUSD_30M"] },
    { group: "indices", symbols: ["UKX", "YM1", "NQ1", "FDAX1"] },
  ];
  return wave1.flatMap(({ group, symbols }) =>
    symbols.map((id) => ({
      id,
      group,
      status: ["SB1", "CT1"].includes(id) ? "WEAK" : "READY",
      wave1Ready: true,
      frontendExport: `/generated/monitoring/wave1/${group}`,
    })),
  );
}
