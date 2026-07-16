import fs from "node:fs";
import path from "node:path";

export type ProductionStrategyType = "macro" | "seasonal" | "valuation" | "portfolio";

export type ProductionAssetEntry = {
  asset: string;
  label: string;
  sourceSymbol: string;
  timeframe: string;
  active: boolean;
  versionName: string;
  status: string;
  strategyType: ProductionStrategyType;
  sleeveName?: string;
  weightSource?: string;
  anchors?: string[];
  patterns?: Array<Record<string, string | number>>;
  parameters?: Record<string, unknown>;
};

type ProductionSleeve = {
  id: string;
  name: string;
  status: string;
  portfolio?: Record<string, unknown>;
  assets: ProductionAssetEntry[];
};

type ProductionConfig = {
  version: string;
  generatedAt: string;
  globalTestStandard: {
    dashboardModes: string[];
    liveWindow: { start: string; end: string };
    fullWindow: { start: string; end: string };
    isWindow: { start: string; end: string };
    walkForwardWindows: Array<Record<string, string>>;
    fullIsReferenceOnly?: boolean;
  };
  sleeves: ProductionSleeve[];
};

export type ProductionMissingDataRow = {
  sleeve: string;
  asset: string;
  missingSymbol: string;
  timeframe: string;
  reason: string;
};

const INVORIA_WORKSPACE = process.env.INVORIA_WORKSPACE_PATH ?? path.join(process.cwd(), "..");
const INVORIA_DASHBOARD = process.env.INVORIA_DASHBOARD_PATH ?? path.join(INVORIA_WORKSPACE, "frontend");
const CONFIG_PATH = path.join(INVORIA_WORKSPACE, "workspace", "input", "strategy_registry", "final_production_sleeves.json");
const SEARCH_ROOTS = [
  path.join(INVORIA_DASHBOARD, "public", "generated", "monitoring", "tradingview_data_cache"),
  path.join(INVORIA_WORKSPACE, "workspace", "monitoring_strategy_data"),
  path.join(INVORIA_WORKSPACE, "workspace", "monitoring_strategy_infrastructure"),
  path.join(INVORIA_WORKSPACE, "workspace", "output"),
  path.join(INVORIA_WORKSPACE, "workspace", "input"),
];

const SYMBOL_FILE_HINTS: Record<string, string[]> = {
  "ZC1!": ["ZC1"],
  "ZW1!": ["ZW1"],
  "ZS1!": ["ZS1"],
  "CC1!": ["CC1"],
  "KC1!": ["KC1"],
  "OJ1!": ["OJ1"],
  "SB1!": ["SB1"],
  "CT1!": ["CT1"],
  "GC1!": ["GC1"],
  "SI1!": ["SI1"],
  "HG1!": ["HG1"],
  "PL1!": ["PL1"],
  "PA1!": ["PA1"],
  "CL1!": ["CL1"],
  "RB1!": ["RB1"],
  "NG1!": ["NG1"],
  "ES1!": ["ES1"],
  "NQ1!": ["NQ1"],
  "YM1!": ["YM1"],
  "FDAX1!": ["FDAX1"],
  UKX: ["UKX"],
  DXY: ["DXY"],
  VIX: ["VIX"],
  US10Y: ["US10Y"],
  US02Y: ["US02Y"],
  SPY: ["SPY"],
  BB: ["BB", "BRENT", "BRENT1", "BRNT"],
  JPY: ["JPY", "USDJPY", "JPYUSD"],
  EURGBP: ["EURGBP"],
  GBPJPY: ["GBPJPY"],
  BRLUSD: ["BRLUSD"],
  USDBRL: ["USDBRL", "BRLUSD"],
  MXNUSD: ["MXNUSD"],
  CLPUSD: ["CLPUSD"],
  SEKUSD: ["SEKUSD"],
  ZARUSD: ["ZARUSD"],
  NOK: ["USDNOK", "NOKUSD", "NOK1", "NOK_CFD"],
  USDNOK: ["USDNOK", "NOKUSD", "NOK1", "NOK_CFD"],
};

let cachedConfig: ProductionConfig | null = null;
let cachedFiles: string[] | null = null;

function walkFiles(root: string, bucket: string[]) {
  if (!fs.existsSync(root)) return;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else bucket.push(fullPath.toUpperCase());
    }
  }
}

function getFileIndex() {
  if (cachedFiles) return cachedFiles;
  const next: string[] = [];
  for (const root of SEARCH_ROOTS) walkFiles(root, next);
  cachedFiles = next;
  return next;
}

function loadConfig(): ProductionConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as ProductionConfig;
  for (const sleeve of cachedConfig.sleeves) {
    for (const asset of sleeve.assets) asset.sleeveName = sleeve.name;
  }
  return cachedConfig;
}

function normalizeLookup(symbol: string): string[] {
  const normalized = symbol.trim().split(":").pop() ?? symbol.trim();
  return SYMBOL_FILE_HINTS[normalized] ?? [normalized.replace(/[^A-Z0-9]/gi, "")];
}

function timeframeHints(timeframe: string): string[] {
  return timeframe === "1W" ? ["_W", "WEEK", "1W"] : ["_D", "DAILY", "1D"];
}

function hasDataForSymbol(symbol: string, timeframe: string): boolean {
  const files = getFileIndex();
  const hints = normalizeLookup(symbol).map((item) => item.toUpperCase());
  const targetHints = timeframeHints(timeframe).map((item) => item.toUpperCase());
  const hasExact = files.some((file) => hints.some((hint) => file.includes(hint)) && targetHints.some((hint) => file.includes(hint)));
  if (hasExact) return true;
  if (timeframe === "1W") {
    const dailyHints = timeframeHints("1D").map((item) => item.toUpperCase());
    return files.some((file) => hints.some((hint) => file.includes(hint)) && dailyHints.some((hint) => file.includes(hint)));
  }
  return false;
}

function sourceReason(symbol: string, timeframe: string) {
  if (timeframe === "1W") {
    return "Primary OHLC/source series not found. Weekly accepts exact 1W data or resampled 1D data when available.";
  }
  return "Primary OHLC/source series not found in monitoring caches or workspace inputs.";
}

function anchorReason(timeframe: string) {
  if (timeframe === "1W") {
    return "Required anchor/comparison series not found. Weekly accepts exact 1W data or resampled 1D data when available.";
  }
  return "Required anchor/comparison series not found for the configured timeframe.";
}

function buildMissingRows(config: ProductionConfig): ProductionMissingDataRow[] {
  const rows: ProductionMissingDataRow[] = [];
  const seen = new Set<string>();
  for (const sleeve of config.sleeves) {
    for (const asset of sleeve.assets) {
      if (!asset.active) continue;
      const sourceLookup = asset.sourceSymbol.split(":").pop() ?? asset.asset;
      if (!hasDataForSymbol(sourceLookup, asset.timeframe)) {
        const key = [sleeve.name, asset.asset, asset.sourceSymbol, asset.timeframe].join("|");
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({
            sleeve: sleeve.name,
            asset: asset.asset,
            missingSymbol: asset.sourceSymbol,
            timeframe: asset.timeframe,
            reason: sourceReason(sourceLookup, asset.timeframe),
          });
        }
      }
      for (const anchor of asset.anchors ?? []) {
        if (!hasDataForSymbol(anchor, asset.timeframe)) {
          const key = [sleeve.name, asset.asset, anchor, asset.timeframe].join("|");
          if (!seen.has(key)) {
            seen.add(key);
            rows.push({
              sleeve: sleeve.name,
              asset: asset.asset,
              missingSymbol: anchor,
              timeframe: asset.timeframe,
              reason: anchorReason(asset.timeframe),
            });
          }
        }
      }
    }
  }
  return rows;
}

export function getFinalProductionRegistry() {
  const config = loadConfig();
  const productionStrategies = config.sleeves.flatMap((sleeve) =>
    sleeve.assets.map((asset) => ({
      ...asset,
      sleeveName: sleeve.name,
    })),
  );
  const activeStrategies = productionStrategies.filter((asset) => asset.active);
  const missingDataReport = buildMissingRows(config);
  const summary = {
    sleeveCount: config.sleeves.length,
    strategyCount: productionStrategies.length,
    activeStrategyCount: activeStrategies.length,
    dashboardModes: config.globalTestStandard.dashboardModes,
    liveStart: config.globalTestStandard.liveWindow.start,
    fullIsReferenceOnly: config.globalTestStandard.fullIsReferenceOnly !== false,
  };

  return {
    config,
    productionStrategies,
    activeStrategies,
    summary,
    missingDataReport,
    missingData: missingDataReport,
  };
}
