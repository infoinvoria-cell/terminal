import { NextResponse } from "next/server";
import { getFinalProductionRegistry } from "@/lib/server/monitoring/finalProductionRegistry";
import type {
  MonitoringSymbolStrategyBinding,
  MonitoringSymbolStrategyMapping,
  MonitoringStrategyDiscoverResponse,
  MonitoringStrategyKind,
  StrategyAvailabilityStatus,
  StrategyInputAvailability,
  StrategyInputSource,
} from "@/lib/monitoring/strategyTester/types";

function mapGroup(sourceSymbol: string): MonitoringSymbolStrategyMapping["group"] {
  const upper = sourceSymbol.toUpperCase();
  if (upper.includes("CBOT") || upper.includes("ICEUS")) return "agriculture";
  if (upper.includes("COMEX") || upper.includes("NYMEX")) return upper.includes("CL1") || upper.includes("RB1") || upper.includes("NG1") ? "energy" : "metals";
  if (upper.includes("FX") || upper.includes("VANTAGE") || upper.includes("IBKR")) return "forex";
  if (upper.includes("CME_MINI") || upper.includes("CBOT_MINI") || upper.includes("EUREX") || upper.includes("TVC:UKX")) return "indices";
  return "other";
}

function buildBinding(entry: {
  active: boolean;
  status: string;
  strategyType: string;
  sourceSymbol: string;
  versionName: string;
}): MonitoringSymbolStrategyBinding {
  const strategyKind: MonitoringStrategyKind =
    entry.strategyType === "seasonal"
      ? "seasonal"
      : entry.strategyType === "portfolio"
        ? "portfolio"
        : "macro_valuation";
  const disabled = !entry.active || entry.status === "Disabled";
  const availabilityStatus: StrategyAvailabilityStatus = disabled ? "unsupported" : "available_exact_parity";
  const inputSource: StrategyInputSource = strategyKind === "seasonal" ? "json_config" : "xlsx";
  const inputAvailability: StrategyInputAvailability = strategyKind === "seasonal" ? "not_applicable" : "xlsx_params_available";
  return {
    strategyKind,
    displayName: strategyKind === "seasonal" ? "Seasonal" : strategyKind === "portfolio" ? "Portfolio" : "Macro Valuation",
    defaultEnabled: entry.active,
    inputSource,
    inputSourcePath: strategyKind === "seasonal" ? "workspace/input/strategy_registry/final_production_sleeves.json" : undefined,
    strategyEnginePath: strategyKind === "seasonal" ? "workspace/input/strategy_registry/final_production_sleeves.json" : "frontend/app/api/monitoring/strategy-tester/run/route.ts",
    supported: !disabled,
    availabilityStatus,
    blockedReason: disabled ? `${entry.sourceSymbol.split(":").pop() ?? entry.sourceSymbol} is disabled in the final production registry.` : undefined,
    inputAvailability,
    canLoadXlsxDefaults: strategyKind !== "seasonal" && !disabled,
    canRunWithXlsxDefaults: strategyKind !== "seasonal" && !disabled,
    canRunMetricParity: strategyKind !== "seasonal" && !disabled,
    canRunCustomInputs: !disabled,
  };
}

export async function GET() {
  const finalProductionRegistry = getFinalProductionRegistry();
  const grouped = new Map<string, MonitoringSymbolStrategyMapping>();

  for (const entry of finalProductionRegistry.productionStrategies) {
    const symbol = entry.asset;
    const current = grouped.get(symbol) ?? {
      symbol,
      assetId: symbol.replace(/[^A-Z0-9]/gi, "_").toLowerCase(),
      displayName: entry.label.replace(/\s+(Seasonal|Macro)$/i, ""),
      group: mapGroup(entry.sourceSymbol),
      availableStrategies: [],
    };
    current.availableStrategies.push(buildBinding(entry));
    grouped.set(symbol, current);
  }

  const symbols = Array.from(grouped.values()).sort((left, right) => left.symbol.localeCompare(right.symbol));
  const macroSymbols = symbols.filter((item) => item.availableStrategies.some((strategy) => strategy.strategyKind === "macro_valuation"));
  const seasonalSymbols = symbols.filter((item) => item.availableStrategies.some((strategy) => strategy.strategyKind === "seasonal"));

  const resp: MonitoringStrategyDiscoverResponse & Record<string, unknown> = {
    symbols,
    generatedAt: new Date().toISOString(),
    totalSymbols: symbols.length,
    mvaSymbolCount: macroSymbols.length,
    intradaySymbolCount: 0,
    mvaExactParityCount: macroSymbols.filter((item) => item.availableStrategies.some((strategy) => strategy.availabilityStatus === "available_exact_parity")).length,
    mvaMetricParityCount: 0,
    mvaExactParitySymbols: macroSymbols.map((item) => item.symbol),
    mvaMetricParitySymbols: [],
    approvedForTrading: false,
    usedAsLiveSignal: false,
    canBePromotedToLiveSignal: false,
    dashboardModes: finalProductionRegistry.summary.dashboardModes,
    liveStart: finalProductionRegistry.summary.liveStart,
    finalProductionRegistry,
    finalProduction: finalProductionRegistry,
    summary: finalProductionRegistry.summary,
    missingDataReport: finalProductionRegistry.missingDataReport,
    missingData: finalProductionRegistry.missingData,
    productionStrategies: finalProductionRegistry.productionStrategies,
    productionStrategyCount: finalProductionRegistry.productionStrategies.length,
    seasonalSymbolCount: seasonalSymbols.length,
  };

  return NextResponse.json(resp);
}
