import fs from "node:fs";
import path from "node:path";
import type {
  AgriAssetStatusSummary,
  AgriAutoUpdateHealth,
  AgriDataSourceStatus,
  AgriFinalStatusResponse,
  AgriLiveReadiness,
  AgriLiveReadinessReason,
  AgriLiveReadinessStatus,
  AgriParityStatus,
  AgriPortfolioReferenceDelta,
  AgriSourceHealthEntry,
  AgriStrategyConfigSummary,
} from "@/lib/monitoring/agriFinalStatusTypes";
import { getAgricultureMvaBinding } from "@/lib/monitoring/strategyTester/engines/macroValuation/bindings";

const PROJECT_ROOT = process.env.INVORIA_WORKSPACE_PATH ?? path.join(process.cwd(), "..");
const REGISTRY_PATH = "workspace/input/strategy_registry/agri_strategy_configs_final.json";
const REGISTRY_PATH_V2 = "workspace/input/strategy_registry/agri_strategy_configs_final_v2.json";
const REGISTRY_PATH_FROZEN = "workspace/input/strategy_registry/agri_strategy_configs_frozen_final.json";
const VARIANTS_PATH = "workspace/input/agri_research/agri_final_selected_variants.json";
const VARIANTS_PATH_V2 = "workspace/input/agri_research/agri_final_selected_variants_v2.json";
const VARIANTS_PATH_FROZEN = "workspace/input/agri_research/agri_final_selected_variants_frozen.json";
const FRESHNESS_AUDIT_PATH = "workspace/output/monitoring/audit/agri_final_configs_phase1/step9_freshness_audit.json";
const SYMBOL_AUDIT_PATH = "workspace/output/monitoring/audit/agri_final_configs_phase1/step11_symbol_audit.json";
const PORTFOLIO_KPIS_PATH = "workspace/output/monitoring/audit/agri_final_configs_phase1/step8b_portfolio_kpis.json";
const LIVE_REFRESH_STATUS_PATH = "frontend/public/generated/monitoring/debug/live_refresh_status_report.json";

type RegistryAsset = {
  params?: Record<string, unknown>;
  meta?: {
    comparisonSymbolsSource?: string;
    pointvalueSource?: string;
    sourcePayload?: string;
    appliedFinalSpecDeltas?: {
      variant_id?: string;
      family?: string;
      direction?: string;
    } & Record<string, unknown>;
  };
};

type RegistryFile = {
  generatedAt?: string;
  assets?: Record<string, RegistryAsset>;
};

type SelectedVariant = {
  variant_id?: string;
  family?: string;
  direction?: string;
  [key: string]: unknown;
};

type FreshnessAuditRow = {
  key?: string;
  name?: string;
  group?: string;
  role?: string;
  comparison_of?: string[] | string | null;
  row_count?: number;
  start_date?: string;
  end_date?: string;
  last_close?: number;
  stale?: boolean;
  provisional?: boolean;
  validation?: string[];
  guard_status?: string;
};

type FreshnessAuditFile = {
  generatedAt?: string;
  symbols?: FreshnessAuditRow[];
  autoUpdate?: {
    process_running?: boolean;
    last_refresh_ok?: boolean;
    last_refresh_at?: string;
    loop_alive?: boolean;
    expected_interval_min?: number;
    last_errors?: string[];
    notes?: string[];
  };
};

type SymbolAuditRow = {
  symbol?: string;
  role?: string;
  used_in_live?: boolean;
  resolved_path?: string;
  exists?: boolean;
  start_date?: string;
  last_date?: string;
  stale?: boolean;
  provisional?: boolean;
  scale_warnings?: string[];
  guard_status?: string;
};

type PortfolioComparisonRow = {
  symbol?: string;
  status?: string;
  ref_trades?: number;
  inv_trades?: number;
  trade_count_delta?: number;
  ref_return_pct?: number;
  inv_return_pct?: number;
  ref_max_dd_pct?: number;
  inv_max_dd_pct?: number;
  ref_pf?: number;
  inv_pf?: number;
  ref_win_pct?: number;
  inv_win_pct?: number;
  suspected_cause?: string;
};

type PortfolioKpisFile = {
  invoria?: {
    trades?: number;
    return_pct?: number;
    cagr_pct?: number;
    max_dd_pct?: number;
    pf?: number;
    win_pct?: number;
    avg_trade?: number;
    trade_sharpe?: number;
    daily_sharpe?: number | null;
    calmar?: number;
    start?: string;
    end?: string;
  };
  reference?: {
    trades?: number;
    return_pct?: number;
    cagr_pct?: number;
    max_dd_pct?: number;
    pf?: number;
    win_pct?: number;
    avg_trade?: number;
    trade_sharpe?: number;
    daily_sharpe?: number | null;
    calmar?: number;
    stop_rate?: number;
    tp_rate?: number;
  };
  comparisons?: PortfolioComparisonRow[];
};

type LiveRefreshStatusFile = {
  generatedAt?: string;
  refreshLoop?: {
    loopMode?: boolean;
    intervalMinutes?: number;
  };
  summary?: {
    loaded?: number;
    failed?: number;
    changedAssets?: number;
  };
};

type AuditBundle = {
  registry: RegistryFile;
  variants: Record<string, SelectedVariant>;
  freshness: FreshnessAuditFile;
  symbolAudit: SymbolAuditRow[];
  portfolio: PortfolioKpisFile;
  liveRefresh: LiveRefreshStatusFile | null;
  activeRegistryPath: string;
  activeVariantsPath: string;
  registryVersion: string;
};

let cachedBundle: { expiresAt: number; value: AuditBundle } | null = null;
let cachedResponse: { expiresAt: number; value: AgriFinalStatusResponse } | null = null;

function projectPath(relPath: string): string {
  return path.join(PROJECT_ROOT, relPath);
}

function normalizeSlash(value: string | null | undefined): string {
  return String(value ?? "").replace(/\\/g, "/").toLowerCase();
}

function readJson<T>(relPath: string, fallback: T): T {
  const fullPath = projectPath(relPath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function safeNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function symbolKey(symbol: string): string {
  return symbol.replace(/!$/, "").toUpperCase();
}

function loadAuditBundle(): AuditBundle {
  if (cachedBundle && cachedBundle.expiresAt > Date.now()) {
    return cachedBundle.value;
  }
  const hasFrozenRegistry = fs.existsSync(projectPath(REGISTRY_PATH_FROZEN));
  const hasFrozenVariants = fs.existsSync(projectPath(VARIANTS_PATH_FROZEN));
  const useV2Registry = fs.existsSync(projectPath(REGISTRY_PATH_V2));
  const useV2Variants = fs.existsSync(projectPath(VARIANTS_PATH_V2));
  const activeRegistryPath = hasFrozenRegistry ? REGISTRY_PATH_FROZEN : useV2Registry ? REGISTRY_PATH_V2 : REGISTRY_PATH;
  const activeVariantsPath = hasFrozenVariants ? VARIANTS_PATH_FROZEN : useV2Variants ? VARIANTS_PATH_V2 : VARIANTS_PATH;
  const registryVersion = hasFrozenRegistry ? "frozen_final" : useV2Registry ? "v2" : "v1";
  const bundle: AuditBundle = {
    registry: readJson<RegistryFile>(activeRegistryPath, {}),
    variants: readJson<Record<string, SelectedVariant>>(activeVariantsPath, {}),
    freshness: readJson<FreshnessAuditFile>(FRESHNESS_AUDIT_PATH, {}),
    symbolAudit: readJson<SymbolAuditRow[]>(SYMBOL_AUDIT_PATH, []),
    portfolio: readJson<PortfolioKpisFile>(PORTFOLIO_KPIS_PATH, {}),
    liveRefresh: readJson<LiveRefreshStatusFile | null>(LIVE_REFRESH_STATUS_PATH, null),
    activeRegistryPath,
    activeVariantsPath,
    registryVersion,
  };
  cachedBundle = { expiresAt: Date.now() + 30_000, value: bundle };
  return bundle;
}

function inferDirection(asset: RegistryAsset | undefined, variant: SelectedVariant | undefined): AgriStrategyConfigSummary["direction"] {
  const longs = Boolean(asset?.params?.enableLongs);
  const shorts = Boolean(asset?.params?.enableShorts);
  if (longs && shorts) return "both";
  if (longs) return "long";
  if (shorts) return "short";
  const fromVariant = String(variant?.direction ?? asset?.meta?.appliedFinalSpecDeltas?.direction ?? "").toLowerCase();
  if (fromVariant === "long" || fromVariant === "short") return fromVariant;
  return null;
}

function inferConfigSummary(symbol: string, asset: RegistryAsset | undefined, variant: SelectedVariant | undefined, bundle: AuditBundle): AgriStrategyConfigSummary {
  const params = asset?.params ?? {};
  const comparisonSymbols = [
    params.useCustomBase ? String(params.baseSymbol ?? "").trim() : "",
    params.use1 ? String(params.sym1 ?? "").trim() : "",
    params.use2 ? String(params.sym2 ?? "").trim() : "",
    params.use3 ? String(params.sym3 ?? "").trim() : "",
  ].filter(Boolean);

  const hints: string[] = [];
  if (bundle.registryVersion === "v2") hints.push("registry:v2");
  const v2Status = String((variant as Record<string, unknown>)?.v2_status ?? (asset?.meta as Record<string, unknown>)?.v2Status ?? "").trim();
  if (v2Status === "REOPTIMIZED") hints.push("REOPTIMIZED");
  const satelliteStatus = String((variant as Record<string, unknown>)?.satellite_status ?? (asset?.meta as Record<string, unknown>)?.satelliteStatus ?? "").trim();
  if (satelliteStatus === "SATELLITE_WEAK") hints.push("SATELLITE_WEAK");

  return {
    symbol,
    displayName: getAgricultureMvaBinding(symbol)?.displayName ?? symbol,
    registrySource: bundle.activeRegistryPath,
    variantsSource: bundle.activeVariantsPath,
    sourcePayload: asset?.meta?.sourcePayload ?? null,
    comparisonSymbolsSource: asset?.meta?.comparisonSymbolsSource ?? null,
    pointvalueSource: asset?.meta?.pointvalueSource ?? null,
    variantId: String(variant?.variant_id ?? asset?.meta?.appliedFinalSpecDeltas?.variant_id ?? "").trim() || null,
    family: String(variant?.family ?? asset?.meta?.appliedFinalSpecDeltas?.family ?? "").trim() || null,
    direction: inferDirection(asset, variant),
    comparisonSymbols,
    hints: hints.length ? hints : undefined,
    settings: {
      fastLen: safeNumber(params.fastLen),
      slowLen: safeNumber(params.slowLen),
      upper: safeNumber(params.upper),
      lower: safeNumber(params.lower),
      cooldown: safeNumber(params.cooldown),
      useTrendEngine: typeof params.useTrendEngine === "boolean" ? params.useTrendEngine : null,
      useRegime: typeof params.useRegime === "boolean" ? params.useRegime : null,
      sd: typeof params.sd === "boolean" ? params.sd : null,
      sd1: typeof params.sd1 === "boolean" ? params.sd1 : null,
    },
  };
}

function sourceStatusFromFlags(row: {
  exists?: boolean;
  stale?: boolean;
  provisional?: boolean;
  guard_status?: string | null;
}): AgriDataSourceStatus {
  if (row.exists === false) return "missing";
  const guardStatus = String(row.guard_status ?? "").toUpperCase();
  if (guardStatus.includes("INVALID")) return "invalid_scale";
  if (row.stale) return "stale";
  if (row.provisional) return "provisional";
  return "fresh";
}

function labelForSourceKey(key: string, displayName: string, role: AgriSourceHealthEntry["role"]): string {
  if (role === "base") return `${displayName} OHLC`;
  if (role === "base_symbol") return `Base ${key}`;
  return key;
}

function findBaseFreshnessRow(symbol: string, bundle: AuditBundle): FreshnessAuditRow | null {
  return (bundle.freshness.symbols ?? []).find((row) => String(row.key ?? "").toUpperCase() === symbol.toUpperCase()) ?? null;
}

function findSymbolAuditRowByPath(symbol: string, bundle: AuditBundle): SymbolAuditRow | null {
  const binding = getAgricultureMvaBinding(symbol);
  if (!binding) return null;
  const target = normalizeSlash(binding.validatedOhlcCsvPath);
  return bundle.symbolAudit.find((row) => normalizeSlash(row.resolved_path) === target) ?? null;
}

function findDependencyRow(key: string, bundle: AuditBundle): FreshnessAuditRow | SymbolAuditRow | null {
  const fromSymbolAudit = bundle.symbolAudit.find((row) => String(row.symbol ?? "").toUpperCase() === key.toUpperCase());
  if (fromSymbolAudit) return fromSymbolAudit;
  return (bundle.freshness.symbols ?? []).find((row) => String(row.key ?? "").toUpperCase() === key.toUpperCase()) ?? null;
}

function toHealthEntry(
  key: string,
  displayName: string,
  role: AgriSourceHealthEntry["role"],
  row: FreshnessAuditRow | SymbolAuditRow | null,
  usedInLive = true,
): AgriSourceHealthEntry {
  return {
    key,
    label: labelForSourceKey(key, displayName, role),
    role,
    sourceStatus: sourceStatusFromFlags({
      exists: "exists" in (row ?? {}) ? (row as SymbolAuditRow).exists : true,
      stale: Boolean(row && "stale" in row ? row.stale : false),
      provisional: Boolean(row && "provisional" in row ? row.provisional : false),
      guard_status: row && "guard_status" in row ? row.guard_status ?? null : null,
    }),
    guardStatus: row && "guard_status" in row ? row.guard_status ?? null : null,
    startDate: row && "start_date" in row ? row.start_date ?? null : null,
    endDate: row
      ? ("last_date" in row
        ? row.last_date ?? null
        : ("end_date" in row ? row.end_date ?? null : null))
      : null,
    provisional: Boolean(row && "provisional" in row ? row.provisional : false),
    stale: Boolean(row && "stale" in row ? row.stale : false),
    usedInLive,
    validation: Array.isArray((row as FreshnessAuditRow | null)?.validation) ? ((row as FreshnessAuditRow).validation ?? []) : Array.isArray((row as SymbolAuditRow | null)?.scale_warnings) ? ((row as SymbolAuditRow).scale_warnings ?? []) : [],
  };
}

function computeLiveReadiness(dependencies: AgriSourceHealthEntry[], hasConfig: boolean): AgriLiveReadiness {
  if (!hasConfig) {
    return {
      status: "CONFIG_INCOMPLETE",
      reason: "CONFIG_INCOMPLETE",
      blockers: ["Final registry config missing"],
    };
  }

  const missing = dependencies.filter((item) => item.sourceStatus === "missing");
  if (missing.length) {
    return {
      status: "MISSING_COMPARISON_SYMBOL",
      reason: "MISSING_COMPARISON_SYMBOL",
      blockers: missing.map((item) => `${item.label}: missing`),
    };
  }

  const invalidScale = dependencies.find((item) => item.guardStatus === "INVALID_SCALE_DXY");
  if (invalidScale) {
    return {
      status: "INVALID_OHLC",
      reason: "INVALID_SCALE_DXY",
      blockers: [invalidScale.label],
    };
  }

  const invalidOhlc = dependencies.find((item) => item.guardStatus === "INVALID_OHLC_DATA");
  if (invalidOhlc) {
    return {
      status: "INVALID_OHLC",
      reason: "INVALID_OHLC_DATA",
      blockers: [invalidOhlc.label],
    };
  }

  const usdbrl = dependencies.find((item) => item.key.toUpperCase() === "FX_IDC:USDBRL");
  if (usdbrl && (usdbrl.stale || usdbrl.sourceStatus === "missing")) {
    return {
      status: "DATA_STALE",
      reason: "MISSING_OR_STALE_USDBRL",
      blockers: [usdbrl.label],
    };
  }

  const stale = dependencies.filter((item) => item.sourceStatus === "stale");
  if (stale.length) {
    return {
      status: "DATA_STALE",
      reason: "DATA_STALE",
      blockers: stale.map((item) => item.label),
    };
  }

  const provisional = dependencies.filter((item) => item.sourceStatus === "provisional");
  if (provisional.length) {
    return {
      status: "PROVISIONAL_ONLY",
      reason: "PROVISIONAL_SIGNAL_ONLY",
      blockers: provisional.map((item) => item.label),
    };
  }

  return {
    status: "READY",
    reason: "READY",
    blockers: [],
  };
}

function mapParityStatus(status: string | null | undefined): AgriParityStatus {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "match") return "MATCH";
  if (normalized === "close") return "CLOSE";
  if (normalized === "mismatch") return "MISMATCH";
  return "DATA_BLOCKED";
}

function buildPortfolioDelta(bundle: AuditBundle): AgriPortfolioReferenceDelta | null {
  if (!bundle.portfolio.invoria || !bundle.portfolio.reference) return null;
  return {
    invoria: {
      trades: safeNumber(bundle.portfolio.invoria.trades),
      returnPct: safeNumber(bundle.portfolio.invoria.return_pct),
      cagrPct: safeNumber(bundle.portfolio.invoria.cagr_pct),
      maxDrawdownPct: safeNumber(bundle.portfolio.invoria.max_dd_pct),
      profitFactor: safeNumber(bundle.portfolio.invoria.pf),
      winPct: safeNumber(bundle.portfolio.invoria.win_pct),
      avgTrade: safeNumber(bundle.portfolio.invoria.avg_trade),
      tradeSharpe: safeNumber(bundle.portfolio.invoria.trade_sharpe),
      dailySharpe: safeNumber(bundle.portfolio.invoria.daily_sharpe),
      calmar: safeNumber(bundle.portfolio.invoria.calmar),
      start: bundle.portfolio.invoria.start ?? null,
      end: bundle.portfolio.invoria.end ?? null,
    },
    reference: {
      trades: safeNumber(bundle.portfolio.reference.trades),
      returnPct: safeNumber(bundle.portfolio.reference.return_pct),
      cagrPct: safeNumber(bundle.portfolio.reference.cagr_pct),
      maxDrawdownPct: safeNumber(bundle.portfolio.reference.max_dd_pct),
      profitFactor: safeNumber(bundle.portfolio.reference.pf),
      winPct: safeNumber(bundle.portfolio.reference.win_pct),
      avgTrade: safeNumber(bundle.portfolio.reference.avg_trade),
      tradeSharpe: safeNumber(bundle.portfolio.reference.trade_sharpe),
      dailySharpe: safeNumber(bundle.portfolio.reference.daily_sharpe),
      calmar: safeNumber(bundle.portfolio.reference.calmar),
      stopRate: safeNumber(bundle.portfolio.reference.stop_rate),
      tpRate: safeNumber(bundle.portfolio.reference.tp_rate),
    },
    delta: {
      trades: safeNumber(bundle.portfolio.invoria.trades) != null && safeNumber(bundle.portfolio.reference.trades) != null
        ? safeNumber(bundle.portfolio.invoria.trades)! - safeNumber(bundle.portfolio.reference.trades)!
        : null,
      returnPct: safeNumber(bundle.portfolio.invoria.return_pct) != null && safeNumber(bundle.portfolio.reference.return_pct) != null
        ? safeNumber(bundle.portfolio.invoria.return_pct)! - safeNumber(bundle.portfolio.reference.return_pct)!
        : null,
      tradeSharpe: safeNumber(bundle.portfolio.invoria.trade_sharpe) != null && safeNumber(bundle.portfolio.reference.trade_sharpe) != null
        ? safeNumber(bundle.portfolio.invoria.trade_sharpe)! - safeNumber(bundle.portfolio.reference.trade_sharpe)!
        : null,
    },
    note: "Data provenance delta: accepted gap from OHLC versioning and comparison-source differences, not treated as a strategy-logic failure.",
  };
}

function buildAutoUpdateHealth(bundle: AuditBundle): AgriAutoUpdateHealth | null {
  const auto = bundle.freshness.autoUpdate;
  const refresh = bundle.liveRefresh;
  if (!auto && !refresh) return null;
  const provisionalAssets = (bundle.freshness.symbols ?? []).filter((row) => row.group === "agri_asset" && row.provisional).length;
  const lastError = auto?.last_errors?.find(Boolean) ?? auto?.notes?.find((note) => /error|timeout|permission/i.test(note)) ?? null;
  return {
    generatedAt: refresh?.generatedAt ?? bundle.freshness.generatedAt ?? null,
    refreshLoopActive: Boolean(auto?.loop_alive && auto?.process_running),
    loopModeEnabled: Boolean(refresh?.refreshLoop?.loopMode),
    processRunning: Boolean(auto?.process_running),
    lockStatus: auto?.process_running ? "active" : "none",
    lastRefreshAt: auto?.last_refresh_at ?? null,
    lastRefreshOk: auto?.last_refresh_ok ?? null,
    intervalMinutes: safeNumber(refresh?.refreshLoop?.intervalMinutes) ?? safeNumber(auto?.expected_interval_min),
    successfulSymbols: safeNumber(refresh?.summary?.loaded),
    failedSymbols: safeNumber(refresh?.summary?.failed),
    changedAssets: safeNumber(refresh?.summary?.changedAssets),
    provisionalAssets,
    lastError,
    notes: [...(auto?.notes ?? [])].slice(0, 4),
  };
}

function buildAssetSummary(symbol: string, bundle: AuditBundle): AgriAssetStatusSummary {
  const registryAsset = bundle.registry.assets?.[symbol];
  const variant = bundle.variants[symbolKey(symbol)];
  const strategyConfig = inferConfigSummary(symbol, registryAsset, variant, bundle);
  const displayName = getAgricultureMvaBinding(symbol)?.displayName ?? symbol;

  const baseRow = findBaseFreshnessRow(symbol, bundle);
  const symbolAuditBase = findSymbolAuditRowByPath(symbol, bundle);
  const baseEntry = toHealthEntry(
    symbol,
    displayName,
    "base",
    baseRow ?? symbolAuditBase,
    true,
  );

  const dependencyEntries = strategyConfig.comparisonSymbols.map((depSymbol, index) => {
    const role = index === 0 && registryAsset?.params?.useCustomBase ? "base_symbol" : "comparison";
    return toHealthEntry(depSymbol, displayName, role, findDependencyRow(depSymbol, bundle), true);
  });

  const healthEntries = [baseEntry, ...dependencyEntries];
  const overallStatus = healthEntries.some((entry) => entry.sourceStatus === "invalid_scale")
    ? "invalid_scale"
    : healthEntries.some((entry) => entry.sourceStatus === "stale")
      ? "stale"
      : healthEntries.some((entry) => entry.sourceStatus === "provisional")
        ? "provisional"
        : healthEntries.some((entry) => entry.sourceStatus === "missing")
          ? "missing"
          : "fresh";

  const parityRow = (bundle.portfolio.comparisons ?? []).find((row) => String(row.symbol ?? "").toUpperCase() === symbol.toUpperCase());
  const parity = {
    status: mapParityStatus(parityRow?.status),
    referenceTrades: safeNumber(parityRow?.ref_trades),
    invoriaTrades: safeNumber(parityRow?.inv_trades),
    tradeCountDelta: safeNumber(parityRow?.trade_count_delta),
    referenceReturnPct: safeNumber(parityRow?.ref_return_pct),
    invoriaReturnPct: safeNumber(parityRow?.inv_return_pct),
    referenceTradeSharpe: null,
    invoriaTradeSharpe: null,
    note: parityRow?.suspected_cause ?? null,
  };

  return {
    symbol,
    displayName,
    strategyConfig,
    dataHealth: {
      overallStatus,
      lastBarDate: baseEntry.endDate,
      lastClose: safeNumber(baseRow?.last_close),
      base: baseEntry,
      dependencies: dependencyEntries,
    },
    parity,
    liveReadiness: computeLiveReadiness(healthEntries, Boolean(registryAsset?.params)),
  };
}

export function getAgriFinalRegistryAsset(symbol: string): RegistryAsset | null {
  const bundle = loadAuditBundle();
  return bundle.registry.assets?.[symbol] ?? null;
}

export function getActiveRegistryPath(): string {
  return loadAuditBundle().activeRegistryPath;
}

export function getAgriFinalStatus(): AgriFinalStatusResponse {
  if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
    return cachedResponse.value;
  }
  const bundle = loadAuditBundle();
  const symbols = Object.keys(bundle.registry.assets ?? {});
  const assets = Object.fromEntries(symbols.map((symbol) => [symbol, buildAssetSummary(symbol, bundle)]));
  const response: AgriFinalStatusResponse = {
    generatedAt: new Date().toISOString(),
    assets,
    portfolio: buildPortfolioDelta(bundle),
    autoUpdate: buildAutoUpdateHealth(bundle),
    configSources: {
      registry: bundle.activeRegistryPath,
      selectedVariants: bundle.activeVariantsPath,
      parityAudit: PORTFOLIO_KPIS_PATH,
      freshnessAudit: FRESHNESS_AUDIT_PATH,
      symbolAudit: SYMBOL_AUDIT_PATH,
      registryVersion: bundle.registryVersion,
    },
  };
  cachedResponse = { expiresAt: Date.now() + 30_000, value: response };
  return response;
}

export function getAgriAssetStatus(symbol: string): AgriAssetStatusSummary | null {
  return getAgriFinalStatus().assets[symbol] ?? null;
}

export function applyRiskReadinessGuard(
  base: AgriLiveReadiness,
  payload: {
    signal: "LONG" | "SHORT" | "NONE" | null | undefined;
    entryPrice?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
  },
): AgriLiveReadiness {
  if (!payload || payload.signal == null || payload.signal === "NONE") return base;
  if (payload.entryPrice == null || payload.stopLoss == null || payload.takeProfit == null) {
    return {
      status: "INVALID_RISK_LEVELS" satisfies AgriLiveReadinessStatus,
      reason: "NO_TRADE_INVALID_RISK_LEVELS" satisfies AgriLiveReadinessReason,
      blockers: [...base.blockers, "Entry / stop / take-profit incomplete"],
    };
  }
  return base;
}
