import fs from "node:fs";
import path from "node:path";
import { ASSET_REGISTRY, getAssetByLiveSymbol, getAssetByTvSymbol } from "@/lib/market-data/asset-registry";
import { getAllInstruments } from "@/lib/datahub";
import type { MonitoringUniverseAsset, WhiteSwanUniverseAsset } from "@/lib/monitoring/live-feed-resolver";

export type TerminalUniverseSourceStatus =
  | "READY"
  | "MISSING_HISTORY"
  | "LIVE_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "CONFIG_ERROR";

export type TerminalUniverseSourceMap = {
  instrumentId: string;
  underlyingId: string | null;
  marketType: string | null;
  ticker: string;
  displayName: string;
  assetClass: string | null;
  venue: string | null;
  providerSymbol: string | null;
  historicalSymbol: string | null;
  historicalSource: string | null;
  liveSource: string | null;
  expectedDelaySeconds: number | null;
  tickSize: number | null;
  pricePrecision: number | null;
  timezone: string | null;
  session: string | null;
  configuredTimeframes: string[];
  historyFiles: string[];
  status: TerminalUniverseSourceStatus;
  sources: Array<"monitoring" | "white_swan" | "core_invest" | "trading_engine">;
};

export type TerminalUniverseStrategyMapping = {
  strategyId: string;
  underlyingId: string | null;
  instrumentId: string;
  marketType: string | null;
  venue: string | null;
  timeframe: string;
  historicalSource: string | null;
  liveSource: string | null;
  runtimeKey: string;
  sourceConfigPath: string;
  sourceConfigRef: string;
};

export type TerminalUniverseBuild = {
  entries: TerminalUniverseSourceMap[];
  strategyMappings: TerminalUniverseStrategyMapping[];
  identityCounts: {
    realInstrumentCount: number;
    strategyCount: number;
    underlyingCount: number;
    instrumentTimeframePairCount: number;
  };
  counts: {
    monitoringCount: number;
    whiteSwanCount: number;
    coreInvestCount: number;
    tradingEngineCount: number;
    dedupedTotalCount: number;
    excludedResearchOnlyCount: number;
  };
};

type CoreInvestPlan = {
  etf_weights?: Record<string, number>;
  futures_targets?: Array<{ signal_root?: string | null }>;
  source_files?: Record<string, string>;
};

type TradingEngineStrategy = {
  strategyId: string;
  symbol: string;
  timeframe: string | null;
};

type StrategyRuntimeRoute = {
  strategyId?: string;
  asset?: string;
  tvSymbol?: string;
  timeframe?: string;
  universeSymbol?: string;
};

type CanonicalMarketResolution = {
  instrumentId: string;
  ticker: string;
  providerSymbol: string | null;
  historicalSymbol: string | null;
  sourceConfigPath: string | null;
  sourceConfigRef: string | null;
  strategyId: string | null;
  runtimeKey: string | null;
};

const MONITORING_UNIVERSE_PATH = path.join(process.cwd(), "public", "generated", "monitoring", "config", "monitoring_asset_universe.json");
const STRATEGY_RUNTIME_ROUTES_PATH = path.join(process.cwd(), "public", "generated", "monitoring", "config", "strategy_runtime_routes.json");
const WHITE_SWAN_UNIVERSE_PATH = path.join(process.cwd(), "src", "data", "monitoring", "white-swan-monitoring-assets.json");
const CORE_INVEST_PLAN_PATH = path.join(process.cwd(), "data", "core-invest", "config", "current_plan_25k.json");
const ENGINE_STRATEGIES_PATH = path.join(process.cwd(), "engine", "config", "strategies.yaml");

const RESEARCH_ONLY_ASSET_IDS = new Set([
  "aapl",
  "msft",
  "nvda",
  "tsla",
  "meta_s",
  "amzn",
  "googl",
  "jpm",
  "bac",
  "gs",
  "xom",
  "cvx",
  "tsm",
  "sap_de",
  "dxy",
  "vix",
  "tnx",
  "us2y",
  "usdjpy",
  "audusd",
  "usdcad",
  "nzdusd",
  "usdchf_fx",
  "eurgbp_fx",
  "eurjpy_fx",
  "gbpjpy_fx",
  "audcad_fx",
  "eurchf_fx",
  "usdmxn_fx",
  "usdzar_fx",
  "usdtry_fx",
  "sp500_idx",
  "nasdaq_idx",
  "dow_idx",
  "russell2k",
  "dax_idx",
  "cac40_idx",
  "eurostoxx_idx",
  "nikkei_idx",
  "hsi_idx",
  "asx200_idx",
  "ibex_idx",
  "mib_idx",
  "silver",
  "platinum",
  "palladium",
  "copper_spot",
  "crude",
  "brent",
  "natgas",
  "heating_oil",
  "gasoline",
  "uranium",
  "corn_f",
  "wheat_f",
  "soybean_f",
  "coffee_f",
  "cocoa_f",
  "sugar_f",
  "oj_f",
  "cattle_f",
  "hogs_f",
  "lumber_f",
  "zb1",
  "zn1",
]);

const DIRECT_INSTRUMENT_ALIASES: Record<string, string> = {
  "6E1!": "6e",
  EURUSD: "eurusd",
  "6B1!": "6b",
  GBPUSD: "gbpusd",
  "FDAX1!": "fdax",
  FDAX: "fdax",
  DE30EUR: "de30eur",
  "GC1!": "gc",
  GC: "gc",
  GLD: "gld",
  "YM1!": "ym",
  YM: "ym",
  "NQ1!": "nq",
  NQ: "nq",
  NAS100USD: "nas100usd",
  QQQ: "qqq",
  SPMO: "spmo",
  SPY: "spy",
  "HG1!": "hg",
  HG: "hg",
  "6S1!": "6s",
  CHF: "6s",
  USDCHF: "usdchf",
  GLGG: "glgg",
  FIW: "fiw",
  "ZC1!": "zc",
  "ZW1!": "zw",
  "CC1!": "cc",
  "OJ1!": "oj",
  "SB1!": "sb",
  "CT1!": "ct",
  "KC1!": "kc",
  "ZS1!": "zs",
  "SI1!": "si",
  "PA1!": "pa",
  "PL1!": "pl",
  "CL1!": "cl",
  "UKX!": "ukx",
  UKX: "ukx",
  MJY: "6j_micro",
};

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadMonitoringUniverse(): MonitoringUniverseAsset[] {
  const json = readJsonFile<{ assets?: MonitoringUniverseAsset[] }>(MONITORING_UNIVERSE_PATH, {});
  return json.assets ?? [];
}

function loadStrategyRuntimeRoutes(): StrategyRuntimeRoute[] {
  const json = readJsonFile<{ routes?: StrategyRuntimeRoute[] }>(STRATEGY_RUNTIME_ROUTES_PATH, {});
  return json.routes ?? [];
}

function loadWhiteSwanUniverse(): WhiteSwanUniverseAsset[] {
  const json = readJsonFile<{ assets?: WhiteSwanUniverseAsset[] }>(WHITE_SWAN_UNIVERSE_PATH, {});
  return json.assets ?? [];
}

function loadCoreInvestPlan(): CoreInvestPlan {
  return readJsonFile<CoreInvestPlan>(CORE_INVEST_PLAN_PATH, {});
}

function parseTradingEngineStrategies(): TradingEngineStrategy[] {
  try {
    const raw = fs.readFileSync(ENGINE_STRATEGIES_PATH, "utf8");
    const lines = raw.split(/\r?\n/);
    const result: TradingEngineStrategy[] = [];
    let currentId: string | null = null;
    let currentSymbol: string | null = null;
    let currentTimeframe: string | null = null;

    const flush = () => {
      if (!currentId || !currentSymbol) return;
      result.push({
        strategyId: currentId,
        symbol: currentSymbol,
        timeframe: currentTimeframe,
      });
    };

    for (const line of lines) {
      const topLevel = /^([a-zA-Z0-9_]+):\s*$/.exec(line);
      if (topLevel) {
        flush();
        currentId = topLevel[1];
        currentSymbol = null;
        currentTimeframe = null;
        continue;
      }
      const symbolMatch = /^\s{2}symbol:\s*([A-Za-z0-9!._-]+)\s*$/.exec(line);
      if (symbolMatch) {
        currentSymbol = symbolMatch[1];
        continue;
      }
      const timeframeMatch = /^\s{2}timeframe:\s*([A-Za-z0-9!._-]+)\s*$/.exec(line);
      if (timeframeMatch) {
        currentTimeframe = timeframeMatch[1];
      }
    }
    flush();
    return result;
  } catch {
    return [];
  }
}

function getVenue(source: string | undefined | null): string | null {
  const value = String(source || "").trim();
  if (!value) return null;
  return value.includes(":") ? value.split(":")[0] ?? null : null;
}

function normalizeTimeframe(tf: string | null | undefined): string | null {
  if (!tf) return null;
  const value = String(tf).trim().toUpperCase();
  if (!value) return null;
  if (value === "1D") return "D";
  return value;
}

function extractSourceSymbol(source: string | null | undefined): string {
  const raw = String(source || "").trim();
  if (!raw) return "";
  return raw.includes(":") ? (raw.split(":").at(-1) ?? "").trim().toUpperCase() : raw.toUpperCase();
}

function canonicalInstrumentIdForSymbol(symbol: string | null | undefined): string | null {
  const raw = String(symbol || "").trim().toUpperCase();
  if (!raw) return null;
  if (DIRECT_INSTRUMENT_ALIASES[raw]) return DIRECT_INSTRUMENT_ALIASES[raw];
  const registry = getAssetByLiveSymbol(raw) || getAssetByTvSymbol(raw);
  if (registry?.id) return registry.id.toLowerCase();
  const stripped = raw.replace(/[^A-Z0-9]+/g, "").replace(/1$/, "");
  return stripped ? stripped.toLowerCase() : null;
}

function coalesceString(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function resolveMonitoringCanonicalAsset(
  asset: MonitoringUniverseAsset,
  routeIndex: Map<string, StrategyRuntimeRoute>,
): CanonicalMarketResolution | null {
  const requestSymbol = String(asset.requestSymbol || asset.symbol || "").trim().toUpperCase();
  const timeframe = normalizeTimeframe(asset.timeframe);
  const routeKey = timeframe ? `${requestSymbol}__${timeframe}` : requestSymbol;
  const route = routeIndex.get(routeKey) ?? routeIndex.get(requestSymbol) ?? null;

  if (route?.tvSymbol) {
    const routeSymbol = extractSourceSymbol(route.tvSymbol);
    const instrumentId = canonicalInstrumentIdForSymbol(routeSymbol);
    if (instrumentId) {
      const datahub = getAllInstruments().find((instrument) => instrument.id === instrumentId) ?? null;
      return {
        instrumentId,
        ticker: (datahub?.liveSymbol ?? routeSymbol).toUpperCase(),
        providerSymbol: datahub?.liveSymbol ?? routeSymbol,
        historicalSymbol: route.tvSymbol,
        sourceConfigPath: "public/generated/monitoring/config/strategy_runtime_routes.json",
        sourceConfigRef: route.strategyId ?? requestSymbol,
        strategyId: route.strategyId ?? null,
        runtimeKey: route.universeSymbol ?? requestSymbol,
      };
    }
  }

  const source = String(asset.source || "").trim();
  const sourceSymbol = extractSourceSymbol(source);
  for (const candidate of [sourceSymbol, requestSymbol, String(asset.symbol || "").trim().toUpperCase()]) {
    const instrumentId = canonicalInstrumentIdForSymbol(candidate);
    if (!instrumentId) continue;
    const datahub = getAllInstruments().find((instrument) => instrument.id === instrumentId) ?? null;
    const registry = getAssetByLiveSymbol(candidate) || getAssetByTvSymbol(source);
    return {
      instrumentId,
      ticker: (datahub?.liveSymbol ?? registry?.liveQuotesSymbol ?? candidate).toUpperCase(),
      providerSymbol: datahub?.liveSymbol ?? registry?.liveQuotesSymbol ?? candidate,
      historicalSymbol: coalesceString(datahub?.historicalSymbol, registry?.tvSymbol, source),
      sourceConfigPath: null,
      sourceConfigRef: null,
      strategyId: null,
      runtimeKey: requestSymbol || candidate,
    };
  }

  return null;
}

function upsertEntry(
  map: Map<string, TerminalUniverseSourceMap>,
  next: Partial<TerminalUniverseSourceMap> & {
    instrumentId: string;
    ticker: string;
    sourceTag: "monitoring" | "white_swan" | "core_invest" | "trading_engine";
  },
) {
  const existing = map.get(next.instrumentId);
  if (!existing) {
    map.set(next.instrumentId, {
      instrumentId: next.instrumentId,
      underlyingId: next.underlyingId ?? null,
      marketType: next.marketType ?? null,
      ticker: next.ticker,
      displayName: next.displayName ?? next.ticker,
      assetClass: next.assetClass ?? null,
      venue: next.venue ?? null,
      providerSymbol: next.providerSymbol ?? null,
      historicalSymbol: next.historicalSymbol ?? null,
      historicalSource: next.historicalSource ?? null,
      liveSource: next.liveSource ?? null,
      expectedDelaySeconds: next.expectedDelaySeconds ?? null,
      tickSize: next.tickSize ?? null,
      pricePrecision: next.pricePrecision ?? null,
      timezone: next.timezone ?? null,
      session: next.session ?? null,
      configuredTimeframes: next.configuredTimeframes ? [...next.configuredTimeframes] : [],
      historyFiles: next.historyFiles ? [...next.historyFiles] : [],
      status: next.status ?? "CONFIG_ERROR",
      sources: [next.sourceTag],
    });
    return;
  }

  if (!existing.sources.includes(next.sourceTag)) existing.sources.push(next.sourceTag);
  if (next.displayName && existing.displayName === existing.ticker) existing.displayName = next.displayName;
  existing.underlyingId = existing.underlyingId ?? next.underlyingId ?? null;
  existing.marketType = existing.marketType ?? next.marketType ?? null;
  existing.assetClass = existing.assetClass ?? next.assetClass ?? null;
  existing.venue = existing.venue ?? next.venue ?? null;
  existing.providerSymbol = existing.providerSymbol ?? next.providerSymbol ?? null;
  existing.historicalSymbol = existing.historicalSymbol ?? next.historicalSymbol ?? null;
  existing.historicalSource = existing.historicalSource ?? next.historicalSource ?? null;
  existing.liveSource = existing.liveSource ?? next.liveSource ?? null;
  existing.expectedDelaySeconds = existing.expectedDelaySeconds ?? next.expectedDelaySeconds ?? null;
  existing.tickSize = existing.tickSize ?? next.tickSize ?? null;
  existing.pricePrecision = existing.pricePrecision ?? next.pricePrecision ?? null;
  existing.timezone = existing.timezone ?? next.timezone ?? null;
  existing.session = existing.session ?? next.session ?? null;
  if (next.configuredTimeframes) {
    existing.configuredTimeframes = [...new Set([...existing.configuredTimeframes, ...next.configuredTimeframes])];
  }
  if (next.historyFiles) {
    existing.historyFiles = [...new Set([...existing.historyFiles, ...next.historyFiles])];
  }
  if (existing.status !== "READY") existing.status = next.status ?? existing.status;
}

function deriveStatus(params: {
  historicalSource: string | null;
  liveSource: string | null;
  historyFiles: string[];
}): TerminalUniverseSourceStatus {
  const { historicalSource, liveSource, historyFiles } = params;
  if (!historicalSource) return "MISSING_HISTORY";
  if (!liveSource) return "LIVE_UNAVAILABLE";
  if (historyFiles.length === 0 && historicalSource === "core_invest_plan") return "MISSING_HISTORY";
  return "READY";
}

export function buildTerminalUniverse(): TerminalUniverseBuild {
  const monitoringUniverse = loadMonitoringUniverse();
  const strategyRuntimeRoutes = loadStrategyRuntimeRoutes();
  const whiteSwanUniverse = loadWhiteSwanUniverse();
  const coreInvestPlan = loadCoreInvestPlan();
  const tradingEngineStrategies = parseTradingEngineStrategies();
  const datahubInstruments = new Map(getAllInstruments().map((instrument) => [instrument.id, instrument]));
  const routeIndex = new Map<string, StrategyRuntimeRoute>();
  const strategyMappings = new Map<string, TerminalUniverseStrategyMapping>();

  for (const route of strategyRuntimeRoutes) {
    const universeSymbol = String(route.universeSymbol || "").trim().toUpperCase();
    const timeframe = normalizeTimeframe(route.timeframe);
    if (!universeSymbol) continue;
    routeIndex.set(universeSymbol, route);
    if (timeframe) routeIndex.set(`${universeSymbol}__${timeframe}`, route);
  }

  const map = new Map<string, TerminalUniverseSourceMap>();
  let monitoringCount = 0;
  let whiteSwanCount = 0;
  let coreInvestCount = 0;
  let tradingEngineCount = 0;

  for (const asset of monitoringUniverse) {
    const resolved = resolveMonitoringCanonicalAsset(asset, routeIndex);
    if (!resolved) continue;
    const requestSymbol = String(asset.requestSymbol || asset.symbol || "").trim().toUpperCase();
    monitoringCount += 1;
    const datahub = datahubInstruments.get(resolved.instrumentId);
    const registry =
      getAssetByLiveSymbol(resolved.providerSymbol ?? resolved.ticker) ||
      getAssetByTvSymbol(resolved.historicalSymbol ?? String(asset.source || "").trim()) ||
      getAssetByLiveSymbol(String(asset.requestSymbol || asset.symbol || "").trim().toUpperCase());
    const timeframe = normalizeTimeframe(asset.timeframe);
    const historicalSource = datahub?.historicalProvider ?? (registry ? registry.historyProviders.join("|") : null);
    const liveSource =
      datahub?.liveProvider ??
      (registry
        ? registry.historyProviders.includes("supabase_quotes") || registry.historyProviders.includes("tv_cache")
          ? "tradingview"
          : null
        : null);
    upsertEntry(map, {
      instrumentId: resolved.instrumentId,
      underlyingId: datahub?.underlyingId ?? null,
      marketType: datahub?.marketType ?? datahub?.assetType ?? null,
      ticker: resolved.ticker,
      displayName: asset.name ? String(asset.name) : resolved.ticker,
      assetClass: datahub?.assetClass ?? registry?.class ?? null,
      venue: datahub?.venue ?? datahub?.exchange ?? getVenue(asset.source),
      providerSymbol: datahub?.liveSymbol ?? resolved.providerSymbol ?? registry?.liveQuotesSymbol ?? resolved.ticker,
      historicalSymbol: coalesceString(datahub?.historicalSymbol, resolved.historicalSymbol, registry?.tvSymbol, String(asset.source || "").trim()),
      historicalSource,
      liveSource,
      expectedDelaySeconds: registry?.liveDelayMinutes != null ? registry.liveDelayMinutes * 60 : 0,
      tickSize: datahub?.tickSize ?? null,
      pricePrecision: datahub?.precision ?? null,
      timezone: datahub?.exchangeTimezone ?? registry?.sessionTimezone ?? null,
      session: datahub?.tradingCalendar ?? null,
      configuredTimeframes: timeframe ? [timeframe] : [],
      historyFiles: [],
      status: deriveStatus({ historicalSource, liveSource, historyFiles: [] }),
      sourceTag: "monitoring",
    });

    if (resolved.strategyId && timeframe) {
      const mappingKey = `${resolved.strategyId}__${resolved.instrumentId}__${timeframe}`;
      strategyMappings.set(mappingKey, {
        strategyId: resolved.strategyId,
        underlyingId: datahub?.underlyingId ?? null,
        instrumentId: resolved.instrumentId,
        marketType: datahub?.marketType ?? datahub?.assetType ?? null,
        venue: datahub?.venue ?? datahub?.exchange ?? getVenue(asset.source),
        timeframe,
        historicalSource: resolved.historicalSymbol,
        liveSource: datahub?.liveSymbol ?? resolved.providerSymbol ?? null,
        runtimeKey: resolved.runtimeKey ?? requestSymbol,
        sourceConfigPath: resolved.sourceConfigPath ?? "public/generated/monitoring/config/monitoring_asset_universe.json",
        sourceConfigRef: resolved.sourceConfigRef ?? requestSymbol,
      });
    }
  }

  for (const route of strategyRuntimeRoutes) {
    const strategyId = String(route.strategyId || "").trim();
    const timeframe = normalizeTimeframe(route.timeframe);
    const tvSymbol = String(route.tvSymbol || "").trim();
    const universeSymbol = String(route.universeSymbol || "").trim().toUpperCase();
    const sourceSymbol = extractSourceSymbol(tvSymbol);
    const instrumentId = canonicalInstrumentIdForSymbol(sourceSymbol);
    if (!strategyId || !timeframe || !instrumentId) continue;
    const datahub = datahubInstruments.get(instrumentId);
    const registry = getAssetByTvSymbol(tvSymbol) || getAssetByLiveSymbol(sourceSymbol);
    const historicalSource = datahub?.historicalProvider ?? (registry ? registry.historyProviders.join("|") : null);
    const liveSource =
      datahub?.liveProvider ??
      (registry
        ? registry.historyProviders.includes("supabase_quotes") || registry.historyProviders.includes("tv_cache")
          ? "tradingview"
          : null
        : null);
    upsertEntry(map, {
      instrumentId,
      underlyingId: datahub?.underlyingId ?? null,
      marketType: datahub?.marketType ?? datahub?.assetType ?? null,
      ticker: (datahub?.liveSymbol ?? sourceSymbol).toUpperCase(),
      displayName: String(route.asset || strategyId),
      assetClass: datahub?.assetClass ?? registry?.class ?? null,
      venue: datahub?.venue ?? datahub?.exchange ?? getVenue(tvSymbol),
      providerSymbol: datahub?.liveSymbol ?? sourceSymbol,
      historicalSymbol: coalesceString(datahub?.historicalSymbol, tvSymbol),
      historicalSource,
      liveSource,
      expectedDelaySeconds: registry?.liveDelayMinutes != null ? registry.liveDelayMinutes * 60 : 900,
      tickSize: datahub?.tickSize ?? null,
      pricePrecision: datahub?.precision ?? null,
      timezone: datahub?.exchangeTimezone ?? registry?.sessionTimezone ?? null,
      session: datahub?.tradingCalendar ?? null,
      configuredTimeframes: [timeframe],
      historyFiles: [],
      status: deriveStatus({ historicalSource, liveSource, historyFiles: [] }),
      sourceTag: "monitoring",
    });
    const mappingKey = `${strategyId}__${instrumentId}__${timeframe}`;
    strategyMappings.set(mappingKey, {
      strategyId,
      underlyingId: datahub?.underlyingId ?? null,
      instrumentId,
      marketType: datahub?.marketType ?? datahub?.assetType ?? null,
      venue: datahub?.venue ?? datahub?.exchange ?? getVenue(tvSymbol),
      timeframe,
      historicalSource: coalesceString(datahub?.historicalSymbol, tvSymbol),
      liveSource: datahub?.liveSymbol ?? sourceSymbol,
      runtimeKey: universeSymbol || sourceSymbol,
      sourceConfigPath: "public/generated/monitoring/config/strategy_runtime_routes.json",
      sourceConfigRef: strategyId,
    });
  }

  for (const asset of whiteSwanUniverse) {
    const resolved = resolveMonitoringCanonicalAsset(
      {
        requestSymbol: asset.symbol,
        symbol: asset.symbol,
        source: asset.source,
        name: asset.name,
        timeframe: Array.isArray(asset.timeframes) ? asset.timeframes[0] : undefined,
      },
      routeIndex,
    );
    if (!resolved) continue;
    whiteSwanCount += 1;
    const datahub = datahubInstruments.get(resolved.instrumentId);
    const timeframe = normalizeTimeframe(Array.isArray(asset.timeframes) ? asset.timeframes[0] : null);
    upsertEntry(map, {
      instrumentId: resolved.instrumentId,
      underlyingId: datahub?.underlyingId ?? null,
      marketType: datahub?.marketType ?? datahub?.assetType ?? null,
      ticker: (datahub?.liveSymbol ?? resolved.ticker).toUpperCase(),
      displayName: asset.name ? String(asset.name) : resolved.ticker,
      providerSymbol: datahub?.liveSymbol ?? resolved.providerSymbol ?? resolved.ticker,
      historicalSymbol: coalesceString(datahub?.historicalSymbol, resolved.historicalSymbol, asset.source),
      configuredTimeframes: timeframe ? [timeframe] : [],
      sourceTag: "white_swan",
      status: map.get(resolved.instrumentId)?.status ?? "CONFIG_ERROR",
    });
  }

  const sourceFiles = coreInvestPlan.source_files ?? {};
  for (const symbol of Object.keys(coreInvestPlan.etf_weights ?? {})) {
    const upper = symbol.toUpperCase();
    const instrumentId = canonicalInstrumentIdForSymbol(upper);
    if (!instrumentId) continue;
    coreInvestCount += 1;
    const datahub = datahubInstruments.get(instrumentId);
    const registry = getAssetByLiveSymbol(upper) || getAssetByTvSymbol(upper);
    const historyFiles = sourceFiles[upper] ? [sourceFiles[upper] as string] : [];
    const historicalSource =
      datahub?.historicalProvider ?? (historyFiles.length ? "core_invest_plan" : registry ? registry.historyProviders.join("|") : null);
    const liveSource = datahub?.liveProvider ?? registry?.liveQuotesSymbol ?? registry?.tvSymbol ?? null;
    upsertEntry(map, {
      instrumentId,
      underlyingId: datahub?.underlyingId ?? null,
      marketType: datahub?.marketType ?? datahub?.assetType ?? null,
      ticker: upper,
      displayName: upper,
      assetClass: datahub?.assetClass ?? registry?.class ?? null,
      venue: datahub?.venue ?? datahub?.exchange ?? null,
      providerSymbol: datahub?.liveSymbol ?? registry?.liveQuotesSymbol ?? upper,
      historicalSymbol: coalesceString(datahub?.historicalSymbol, registry?.tvSymbol),
      historicalSource,
      liveSource,
      expectedDelaySeconds: registry?.liveDelayMinutes != null ? registry.liveDelayMinutes * 60 : 0,
      tickSize: datahub?.tickSize ?? null,
      pricePrecision: datahub?.precision ?? null,
      timezone: datahub?.exchangeTimezone ?? registry?.sessionTimezone ?? null,
      session: datahub?.tradingCalendar ?? null,
      configuredTimeframes: ["D"],
      historyFiles,
      status: deriveStatus({ historicalSource, liveSource, historyFiles }),
      sourceTag: "core_invest",
    });
  }

  for (const target of coreInvestPlan.futures_targets ?? []) {
    const root = String(target.signal_root || "").trim().toUpperCase();
    if (!root) continue;
    const instrumentId = canonicalInstrumentIdForSymbol(root);
    if (!instrumentId) continue;
    coreInvestCount += 1;
    const datahub = datahubInstruments.get(instrumentId);
    const historyFiles = sourceFiles[root] ? [sourceFiles[root] as string] : [];
    upsertEntry(map, {
      instrumentId,
      underlyingId: datahub?.underlyingId ?? null,
      marketType: datahub?.marketType ?? datahub?.assetType ?? null,
      ticker: root,
      displayName: root,
      assetClass: datahub?.assetClass ?? null,
      venue: datahub?.venue ?? datahub?.exchange ?? null,
      providerSymbol: datahub?.liveSymbol ?? root,
      historicalSymbol: coalesceString(datahub?.historicalSymbol),
      historicalSource: datahub?.historicalProvider ?? null,
      liveSource: datahub?.liveProvider ?? "tradingview",
      expectedDelaySeconds: 900,
      tickSize: datahub?.tickSize ?? null,
      pricePrecision: datahub?.precision ?? null,
      timezone: datahub?.exchangeTimezone ?? null,
      session: datahub?.tradingCalendar ?? null,
      configuredTimeframes: ["D"],
      historyFiles,
      status: deriveStatus({
        historicalSource: datahub?.historicalProvider ?? null,
        liveSource: datahub?.liveProvider ?? "tradingview",
        historyFiles,
      }),
      sourceTag: "core_invest",
    });
  }

  for (const strategy of tradingEngineStrategies) {
    const instrumentId = canonicalInstrumentIdForSymbol(strategy.symbol);
    if (!instrumentId) continue;
    tradingEngineCount += 1;
    const datahub = datahubInstruments.get(instrumentId);
    const registry = getAssetByLiveSymbol(strategy.symbol) || getAssetByTvSymbol(strategy.symbol);
    const timeframe = normalizeTimeframe(strategy.timeframe);
    const historicalSource = datahub?.historicalProvider ?? registry?.historyProviders.join("|") ?? null;
    const liveSource = datahub?.liveProvider ?? "tradingview";
    upsertEntry(map, {
      instrumentId,
      underlyingId: datahub?.underlyingId ?? null,
      marketType: datahub?.marketType ?? datahub?.assetType ?? null,
      ticker: strategy.symbol.toUpperCase(),
      displayName: strategy.strategyId,
      assetClass: datahub?.assetClass ?? registry?.class ?? null,
      venue: datahub?.venue ?? datahub?.exchange ?? null,
      providerSymbol: datahub?.liveSymbol ?? registry?.liveQuotesSymbol ?? strategy.symbol.toUpperCase(),
      historicalSymbol: coalesceString(datahub?.historicalSymbol, registry?.tvSymbol),
      historicalSource,
      liveSource,
      expectedDelaySeconds: registry?.liveDelayMinutes != null ? registry.liveDelayMinutes * 60 : 900,
      tickSize: datahub?.tickSize ?? null,
      pricePrecision: datahub?.precision ?? null,
      timezone: datahub?.exchangeTimezone ?? registry?.sessionTimezone ?? null,
      session: datahub?.tradingCalendar ?? null,
      configuredTimeframes: timeframe ? [timeframe] : [],
      historyFiles: [],
      status: deriveStatus({ historicalSource, liveSource, historyFiles: [] }),
      sourceTag: "trading_engine",
    });

    if (timeframe) {
      const mappingKey = `${strategy.strategyId}__${instrumentId}__${timeframe}`;
      strategyMappings.set(mappingKey, {
        strategyId: strategy.strategyId,
        underlyingId: datahub?.underlyingId ?? null,
        instrumentId,
        marketType: datahub?.marketType ?? datahub?.assetType ?? null,
        venue: datahub?.venue ?? datahub?.exchange ?? null,
        timeframe,
        historicalSource: datahub?.historicalSymbol ?? registry?.tvSymbol ?? null,
        liveSource: datahub?.liveSymbol ?? registry?.liveQuotesSymbol ?? null,
        runtimeKey: datahub?.liveSymbol ?? strategy.symbol.toUpperCase(),
        sourceConfigPath: "engine/config/strategies.yaml",
        sourceConfigRef: strategy.strategyId,
      });
    }
  }

  const entries = [...map.values()].sort((a, b) => a.instrumentId.localeCompare(b.instrumentId));
  const includedAssetIds = new Set(entries.map((entry) => entry.instrumentId));
  const excludedResearchOnlyCount = ASSET_REGISTRY.filter((asset) => {
    const candidateId = canonicalInstrumentIdForSymbol(asset.liveQuotesSymbol) ?? asset.id.toLowerCase();
    return RESEARCH_ONLY_ASSET_IDS.has(asset.id) && !includedAssetIds.has(candidateId);
  }).length;
  const strategyMappingsList = [...strategyMappings.values()].sort(
    (a, b) =>
      a.strategyId.localeCompare(b.strategyId) ||
      a.instrumentId.localeCompare(b.instrumentId) ||
      a.timeframe.localeCompare(b.timeframe),
  );

  return {
    entries,
    strategyMappings: strategyMappingsList,
    identityCounts: {
      realInstrumentCount: entries.length,
      strategyCount: new Set(strategyMappingsList.map((mapping) => mapping.strategyId)).size,
      underlyingCount: new Set(entries.map((entry) => entry.underlyingId).filter(Boolean)).size,
      instrumentTimeframePairCount: entries.reduce((sum, entry) => sum + entry.configuredTimeframes.length, 0),
    },
    counts: {
      monitoringCount,
      whiteSwanCount,
      coreInvestCount,
      tradingEngineCount,
      dedupedTotalCount: entries.length,
      excludedResearchOnlyCount,
    },
  };
}
