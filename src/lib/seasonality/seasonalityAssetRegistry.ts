/**
 * Central seasonality asset registry — Monitoring-first, source-confirmed assets only.
 * Priority: manual TradingView CSV > existing Yahoo alias table > excluded.
 */

import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import {
  MANUAL_TV_HISTORY_PARTS_FILES,
  MANUAL_TV_TRADINGVIEW_DATA_TEST_FILES,
} from "@/lib/seasonality/manualTradingViewCsvIndex.generated";
import type { SeasonalAssetCategory, SeasonalAssetDef } from "@/lib/seasonality/walkForward/assetManifest";
import { LEGACY_SEASONAL_ASSET_DEFS } from "@/lib/seasonality/seasonalityLegacyAssetDefs";

const RAW_PARTS = "trading_dashboard/data/raw/history_parts";
const TV_TEST_DIR = "workspace/output/tradingview_data_test";

const historyPartsSet = new Set<string>(MANUAL_TV_HISTORY_PARTS_FILES as readonly string[]);
const tvTestSet = new Set<string>(MANUAL_TV_TRADINGVIEW_DATA_TEST_FILES as readonly string[]);

export type SeasonalityAssetGroup =
  | "agrar"
  | "energie"
  | "metalle"
  | "fx"
  | "indizes"
  | "aktien";

export type SeasonalityDataSource =
  | { type: "manual_tv_csv"; path: string; csvFile: string; csvDir?: string }
  | { type: "existing_yahoo_provider"; providerSymbol: string };

export type SeasonalityAssetDefinition = {
  assetId: string;
  monitoringSymbol: string;
  tvSymbol: string;
  displayName: string;
  displayNameShort: string;
  group: SeasonalityAssetGroup;
  iconUrl: string | null;
  source: SeasonalityDataSource;
  enabled: boolean;
};

export type SeasonalityExcludedAsset = {
  symbol: string;
  reason: "no_manual_csv_and_no_existing_yahoo_mapping" | "not_in_monitoring";
};

type MonitoringBinding = {
  monitoringSymbol: string;
  tvSymbol: string;
  group: SeasonalityAssetGroup;
  /** Match existing legacy assetId when present */
  legacyAssetId?: string;
  displayName?: string;
  displayNameShort?: string;
  /** Confirmed history_parts proxy (project CSV basename) */
  historyPartsCsv?: string;
};

/** Binding list from Monitoring seasonality scope (CODEX task). */
const MONITORING_BINDINGS: MonitoringBinding[] = [
  // Agrar / Softs
  { monitoringSymbol: "CC1!", tvSymbol: "ICEUS:CC1!", group: "agrar", legacyAssetId: "cocoa" },
  { monitoringSymbol: "CT1!", tvSymbol: "ICEUS:CT1!", group: "agrar", legacyAssetId: "cotton" },
  { monitoringSymbol: "KC1!", tvSymbol: "ICEUS:KC1!", group: "agrar", legacyAssetId: "coffee" },
  { monitoringSymbol: "OJ1!", tvSymbol: "ICEUS:OJ1!", group: "agrar", legacyAssetId: "orangejuice" },
  { monitoringSymbol: "SB1!", tvSymbol: "ICEUS:SB1!", group: "agrar", legacyAssetId: "sugar" },
  { monitoringSymbol: "ZC1!", tvSymbol: "CBOT:ZC1!", group: "agrar", legacyAssetId: "corn" },
  { monitoringSymbol: "ZS1!", tvSymbol: "CBOT:ZS1!", group: "agrar", legacyAssetId: "soybeans" },
  { monitoringSymbol: "ZW1!", tvSymbol: "CBOT:ZW1!", group: "agrar", legacyAssetId: "wheat" },
  // Energie
  { monitoringSymbol: "NG1!", tvSymbol: "NYMEX:NG1!", group: "energie", legacyAssetId: "ng1", historyPartsCsv: "NGAS.csv" },
  { monitoringSymbol: "CL1!", tvSymbol: "NYMEX:CL1!", group: "energie", legacyAssetId: "cl1", historyPartsCsv: "WTI.csv" },
  { monitoringSymbol: "RB1!", tvSymbol: "NYMEX:RB1!", group: "energie", legacyAssetId: "rb1" },
  // Metalle
  { monitoringSymbol: "GC1!", tvSymbol: "COMEX:GC1!", group: "metalle", legacyAssetId: "gc1" },
  { monitoringSymbol: "SI1!", tvSymbol: "COMEX:SI1!", group: "metalle", legacyAssetId: "si1" },
  { monitoringSymbol: "HG1!", tvSymbol: "COMEX:HG1!", group: "metalle", legacyAssetId: "hg1" },
  { monitoringSymbol: "PL1!", tvSymbol: "NYMEX:PL1!", group: "metalle", legacyAssetId: "pl1" },
  { monitoringSymbol: "PA1!", tvSymbol: "NYMEX:PA1!", group: "metalle", legacyAssetId: "pa1" },
  // FX
  { monitoringSymbol: "6A1!", tvSymbol: "CME:6A1!", group: "fx", legacyAssetId: "fx_6a1" },
  { monitoringSymbol: "6B1!", tvSymbol: "CME:6B1!", group: "fx", legacyAssetId: "fx_6b1" },
  { monitoringSymbol: "6C1!", tvSymbol: "CME:6C1!", group: "fx", legacyAssetId: "fx_6c1" },
  { monitoringSymbol: "6E1!", tvSymbol: "CME:6E1!", group: "fx", legacyAssetId: "fx_6e1" },
  { monitoringSymbol: "6J1!", tvSymbol: "CME:6J1!", group: "fx", legacyAssetId: "fx_6j1" },
  { monitoringSymbol: "6N1!", tvSymbol: "CME:6N1!", group: "fx", legacyAssetId: "fx_6n1" },
  { monitoringSymbol: "6S1!", tvSymbol: "CME:6S1!", group: "fx", legacyAssetId: "fx_6s1" },
  { monitoringSymbol: "DXY", tvSymbol: "TVC:DXY", group: "fx", legacyAssetId: "dxy", historyPartsCsv: "DXY.csv" },
  // Indizes
  { monitoringSymbol: "US30USD", tvSymbol: "OANDA:US30USD", group: "indizes", legacyAssetId: "us30usd", historyPartsCsv: "DOW30.csv" },
  { monitoringSymbol: "NQ1!", tvSymbol: "CME_MINI:NQ1!", group: "indizes", legacyAssetId: "nq1", historyPartsCsv: "NAS100.csv" },
  { monitoringSymbol: "ES1!", tvSymbol: "CME_MINI:ES1!", group: "indizes", legacyAssetId: "es1", historyPartsCsv: "US500.csv" },
  { monitoringSymbol: "FDAX1!", tvSymbol: "EUREX:FDAX1!", group: "indizes", legacyAssetId: "fdax1", historyPartsCsv: "GER40.csv" },
  { monitoringSymbol: "RTY1!", tvSymbol: "CME_MINI:RTY1!", group: "indizes", legacyAssetId: "rty1", historyPartsCsv: "US2000.csv" },
  { monitoringSymbol: "YM1!", tvSymbol: "CBOT_MINI:YM1!", group: "indizes", legacyAssetId: "ym1", historyPartsCsv: "DOW30.csv" },
];

/** Monitoring aktien tab + confirmed history_parts CSV (no EUR/GBP / JPM). */
const MONITORING_STOCK_BINDINGS: MonitoringBinding[] = [
  { monitoringSymbol: "AAPL", tvSymbol: "NASDAQ:AAPL", group: "aktien", legacyAssetId: "aapl" },
  { monitoringSymbol: "MSFT", tvSymbol: "NASDAQ:MSFT", group: "aktien", legacyAssetId: "msft" },
  { monitoringSymbol: "NVDA", tvSymbol: "NASDAQ:NVDA", group: "aktien", legacyAssetId: "nvda" },
  { monitoringSymbol: "GOOGL", tvSymbol: "NASDAQ:GOOGL", group: "aktien", legacyAssetId: "goog", historyPartsCsv: "GOOGL.csv" },
  { monitoringSymbol: "META", tvSymbol: "NASDAQ:META", group: "aktien", legacyAssetId: "meta" },
  { monitoringSymbol: "AMZN", tvSymbol: "NASDAQ:AMZN", group: "aktien", legacyAssetId: "amzn" },
];

/** Mirrors `YAHOO_SYMBOL_ALIASES` in `frontend/lib/server/yahooFallback.ts` (seasonality subset). */
const SEASONALITY_YAHOO_ALIASES: Record<string, string> = {
  DXY: "DX-Y.NYB",
  "6E1!": "EURUSD=X",
  "6J1!": "JPY=X",
  "6B1!": "GBPUSD=X",
  "6S1!": "CHF=X",
  "6A1!": "AUDUSD=X",
  "6C1!": "CAD=X",
  "6N1!": "NZDUSD=X",
  "NQ1!": "^IXIC",
  "YM1!": "^DJI",
  "RTY1!": "^RUT",
  "GC1!": "GC=F",
  "SI1!": "SI=F",
  "HG1!": "HG=F",
  "PL1!": "PL=F",
  "PA1!": "PA=F",
  "NG1!": "NG=F",
  "RB1!": "RB=F",
  "CL1!": "CL=F",
  "ES1!": "^GSPC",
  "FDAX1!": "^GDAXI",
  "ZW1!": "ZW=F",
  "ZC1!": "ZC=F",
  "ZS1!": "ZS=F",
  "KC1!": "KC=F",
  "SB1!": "SB=F",
  "CC1!": "CC=F",
  "CT1!": "CT=F",
  "OJ1!": "OJ=F",
};

function hasExistingYahooMapping(symbol: string): boolean {
  return Boolean(SEASONALITY_YAHOO_ALIASES[String(symbol || "").trim().toUpperCase()]);
}

function resolveYahooSymbol(symbol: string): string {
  const normalized = String(symbol || "").trim().toUpperCase();
  return SEASONALITY_YAHOO_ALIASES[normalized] ?? "";
}

const GROUP_TO_CATEGORY: Record<SeasonalityAssetGroup, SeasonalAssetCategory> = {
  agrar: "Agrar",
  energie: "Energie",
  metalle: "Metalle",
  fx: "FX",
  indizes: "Indizes",
  aktien: "Aktien",
};

const legacyByAssetId = new Map(LEGACY_SEASONAL_ASSET_DEFS.map((a) => [a.assetId, a]));

function stripFuturesCode(symbol: string): string {
  return String(symbol || "").trim().toUpperCase().replace(/!/g, "");
}

function dailyCsvNameForTvSymbol(tvSymbol: string): string | null {
  if (!tvSymbol.includes(":")) return null;
  const [ex, raw] = tvSymbol.split(":");
  const code = String(raw || "").replace(/!/g, "");
  return `${ex}_${code}_daily.csv`;
}

function resolveManualTvSource(binding: MonitoringBinding, legacy?: SeasonalAssetDef): SeasonalityDataSource | null {
  const tvSymbol = binding.tvSymbol;

  if (legacy?.csvFile) {
    const csvDir = legacy.csvDir ?? "";
    if (csvDir.includes("history_parts") && historyPartsSet.has(legacy.csvFile)) {
      return {
        type: "manual_tv_csv",
        path: `${csvDir}/${legacy.csvFile}`,
        csvFile: legacy.csvFile,
        csvDir: legacy.csvDir,
      };
    }
    if (legacy.csvFile.includes("full_history_validated")) {
      return {
        type: "manual_tv_csv",
        path: `${TV_TEST_DIR}/${legacy.csvFile}`,
        csvFile: legacy.csvFile,
      };
    }
    const dailyName = dailyCsvNameForTvSymbol(tvSymbol);
    if (dailyName && tvTestSet.has(dailyName)) {
      return {
        type: "manual_tv_csv",
        path: `${TV_TEST_DIR}/${dailyName}`,
        csvFile: dailyName,
      };
    }
  }

  const dailyName = dailyCsvNameForTvSymbol(tvSymbol);
  if (dailyName && tvTestSet.has(dailyName)) {
    return {
      type: "manual_tv_csv",
      path: `${TV_TEST_DIR}/${dailyName}`,
      csvFile: dailyName,
    };
  }

  if (binding.historyPartsCsv && historyPartsSet.has(binding.historyPartsCsv)) {
    return {
      type: "manual_tv_csv",
      path: `${RAW_PARTS}/${binding.historyPartsCsv}`,
      csvFile: binding.historyPartsCsv,
      csvDir: RAW_PARTS,
    };
  }

  const spotAliases: Record<string, string> = {
    KC1: "COFFEE.csv",
    CT1: "COTTON.csv",
    SB1: "SUGAR.csv",
    ZS1: "SOYBEAN.csv",
  };
  const spotFile = spotAliases[stripFuturesCode(binding.monitoringSymbol)];
  if (spotFile && historyPartsSet.has(spotFile)) {
    return {
      type: "manual_tv_csv",
      path: `${RAW_PARTS}/${spotFile}`,
      csvFile: spotFile,
      csvDir: RAW_PARTS,
    };
  }

  return null;
}

function resolveYahooSource(binding: MonitoringBinding): SeasonalityDataSource | null {
  const sym = binding.monitoringSymbol;
  if (!hasExistingYahooMapping(sym)) return null;
  const providerSymbol = resolveYahooSymbol(sym);
  if (!providerSymbol) return null;
  return { type: "existing_yahoo_provider", providerSymbol };
}

function defaultStubForBinding(binding: MonitoringBinding): SeasonalAssetDef {
  const code = stripFuturesCode(binding.monitoringSymbol);
  const assetId =
    binding.legacyAssetId ??
    binding.monitoringSymbol.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return {
    assetId,
    symbol: binding.tvSymbol,
    displayName: binding.displayName ?? binding.monitoringSymbol,
    displayNameShort: binding.displayNameShort ?? binding.monitoringSymbol,
    category: GROUP_TO_CATEGORY[binding.group],
    csvFile: "__pending__",
    exchange: binding.tvSymbol.split(":")[0] ?? "—",
    backadjustmentStatus: "unknown",
    marketType: binding.group === "aktien" ? "spot" : "continuous_futures",
    iconKey: assetId,
    firstDateEstimate: "1990-01-01",
    lastDateEstimate: "2026-06-01",
    completeYearsEstimate: 15,
  };
}

function buildDefinition(binding: MonitoringBinding): SeasonalityAssetDefinition {
  const legacy = binding.legacyAssetId ? legacyByAssetId.get(binding.legacyAssetId) : undefined;
  const stub = legacy ?? defaultStubForBinding(binding);
  const manual = resolveManualTvSource(binding, legacy);
  const yahoo = manual ? null : resolveYahooSource(binding);
  const source = manual ?? yahoo;
  const enabled = source != null;

  const iconUrl = getMonitoringAssetIconUrl({
    code: binding.monitoringSymbol,
    assetId: stub.assetId,
    name: stub.displayNameShort,
    source: binding.tvSymbol,
    tv: binding.tvSymbol,
    displaySymbol: binding.monitoringSymbol,
  });

  return {
    assetId: stub.assetId,
    monitoringSymbol: binding.monitoringSymbol,
    tvSymbol: binding.tvSymbol,
    displayName: binding.displayName ?? stub.displayName,
    displayNameShort: binding.displayNameShort ?? stub.displayNameShort,
    group: binding.group,
    iconUrl,
    source: source ?? { type: "existing_yahoo_provider", providerSymbol: "" },
    enabled,
  };
}

function toSeasonalAssetDef(defn: SeasonalityAssetDefinition): SeasonalAssetDef | null {
  if (!defn.enabled) return null;
  const legacy = legacyByAssetId.get(defn.assetId) ?? defaultStubForBinding({
    monitoringSymbol: defn.monitoringSymbol,
    tvSymbol: defn.tvSymbol,
    group: defn.group,
    legacyAssetId: defn.assetId,
    displayName: defn.displayName,
    displayNameShort: defn.displayNameShort,
  });

  if (defn.source.type === "manual_tv_csv") {
    return {
      ...legacy,
      assetId: defn.assetId,
      symbol: defn.tvSymbol,
      displayName: defn.displayName,
      displayNameShort: defn.displayNameShort,
      category: GROUP_TO_CATEGORY[defn.group],
      csvFile: defn.source.csvFile,
      csvDir: defn.source.csvDir,
    };
  }

  return {
    ...legacy,
    assetId: defn.assetId,
    symbol: defn.monitoringSymbol,
    displayName: defn.displayName,
    displayNameShort: defn.displayNameShort,
    category: GROUP_TO_CATEGORY[defn.group],
    csvFile: `__yahoo__:${defn.source.providerSymbol}`,
    marketType: legacy.marketType,
  };
}

const ALL_BINDINGS = [...MONITORING_BINDINGS, ...MONITORING_STOCK_BINDINGS];

const REGISTRY_DEFINITIONS: SeasonalityAssetDefinition[] = ALL_BINDINGS.map(buildDefinition);

export function getSeasonalityRegistryDefinitions(): SeasonalityAssetDefinition[] {
  return REGISTRY_DEFINITIONS;
}

export function getEnabledSeasonalityDefinitions(): SeasonalityAssetDefinition[] {
  return REGISTRY_DEFINITIONS.filter((d) => d.enabled);
}

export function buildEnabledSeasonalAssetDefs(): SeasonalAssetDef[] {
  return getEnabledSeasonalityDefinitions()
    .map(toSeasonalAssetDef)
    .filter((d): d is SeasonalAssetDef => d != null);
}

export const SEASONAL_CSV_ASSETS: SeasonalAssetDef[] = buildEnabledSeasonalAssetDefs();

export function getAssetDef(assetId: string): SeasonalAssetDef | undefined {
  return SEASONAL_CSV_ASSETS.find((a) => a.assetId === assetId);
}

export const DEFAULT_SEASONAL_ASSET_ID = "wheat";

export function getExcludedSeasonalityAssets(): SeasonalityExcludedAsset[] {
  return REGISTRY_DEFINITIONS.filter((d) => !d.enabled).map((d) => ({
    symbol: d.monitoringSymbol,
    reason: "no_manual_csv_and_no_existing_yahoo_mapping" as const,
  }));
}

export const MONITORING_ASSET_LIST = ALL_BINDINGS.map((b) => b.monitoringSymbol);

export const ICON_MAPPING_SOURCE = "frontend/lib/monitoring/monitoringAssetIcons.ts";
