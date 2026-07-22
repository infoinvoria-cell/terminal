import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getFinalProductionRegistry } from "@/lib/server/monitoring/finalProductionRegistry";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

const EMPTY_REGISTRY = {
  config: { version: "0", generatedAt: "", globalTestStandard: { dashboardModes: [], liveWindow: { start: "", end: "" }, fullWindow: { start: "", end: "" }, isWindow: { start: "", end: "" }, walkForwardWindows: [] }, sleeves: [] },
  productionStrategies: [] as unknown[],
  activeStrategies: [] as unknown[],
  summary: { sleeveCount: 0, strategyCount: 0, activeStrategyCount: 0, dashboardModes: [], liveStart: "", fullIsReferenceOnly: true },
  missingDataReport: [] as unknown[],
  missingData: [] as unknown[],
};

async function fromSupabase() {
  const db = createSupabaseServiceClient();
  const [sleevesRes, entriesRes] = await Promise.all([
    db.from("strategy_sleeves").select("*"),
    db.from("strategy_entries").select("*"),
  ]);
  if (sleevesRes.error || entriesRes.error) return null;
  const sleeves = sleevesRes.data ?? [];
  const entries = entriesRes.data ?? [];
  if (!sleeves.length) return null;

  const productionStrategies = entries.map((e) => ({
    asset: e.strategy_id,
    label: e.label ?? e.strategy_id,
    sourceSymbol: e.source_symbol ?? e.strategy_id,
    timeframe: e.timeframe ?? "D",
    active: e.active ?? false,
    versionName: e.version_name ?? "",
    status: e.status ?? "READY",
    strategyType: e.strategy_type ?? "macro",
    sleeveName: e.sleeve ?? "",
  }));
  const activeStrategies = productionStrategies.filter((s) => s.active);

  const config = {
    version: "supabase",
    generatedAt: new Date().toISOString(),
    globalTestStandard: { dashboardModes: ["live"], liveWindow: { start: "", end: "" }, fullWindow: { start: "", end: "" }, isWindow: { start: "", end: "" }, walkForwardWindows: [] },
    sleeves: sleeves.map((s) => ({
      id: s.sleeve,
      name: s.sleeve,
      status: s.status ?? "READY",
      assets: entries.filter((e) => e.sleeve === s.sleeve).map((e) => ({
        asset: e.strategy_id,
        label: e.label ?? e.strategy_id,
        sourceSymbol: e.source_symbol ?? e.strategy_id,
        timeframe: e.timeframe ?? "D",
        active: e.active ?? false,
        versionName: e.version_name ?? "",
        status: e.status ?? "READY",
        strategyType: e.strategy_type ?? "macro",
      })),
    })),
  };

  return {
    config,
    productionStrategies,
    activeStrategies,
    summary: {
      sleeveCount: sleeves.length,
      strategyCount: entries.length,
      activeStrategyCount: activeStrategies.length,
      dashboardModes: ["live"],
      liveStart: "",
      fullIsReferenceOnly: true,
    },
    missingDataReport: [],
    missingData: [],
  };
}

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let finalProductionRegistry: any = EMPTY_REGISTRY;
  try {
    finalProductionRegistry = getFinalProductionRegistry();
  } catch {
    // Config file not found (no Invoria workspace) — try Supabase below.
  }

  // If local registry has data, use it
  if (finalProductionRegistry.summary.strategyCount > 0) {
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
    } catch { /* fall through */ }

    return NextResponse.json({
      source: "local",
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

  // No local registry — try Supabase (Vercel / cloud)
  try {
    const sbRegistry = await fromSupabase();
    if (sbRegistry) {
      return NextResponse.json({
        source: "supabase",
        registry: buildFallbackRegistry(),
        finalProductionRegistry: sbRegistry,
        finalProduction: sbRegistry,
        summary: sbRegistry.summary,
        productionStrategies: sbRegistry.productionStrategies,
        activeStrategies: sbRegistry.activeStrategies,
        missingDataReport: [],
        missingData: [],
      });
    }
  } catch { /* fall through */ }

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
