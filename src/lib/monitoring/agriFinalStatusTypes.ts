export type AgriParityStatus = "MATCH" | "CLOSE" | "MISMATCH" | "DATA_BLOCKED";

export type AgriDataSourceStatus =
  | "fresh"
  | "stale"
  | "provisional"
  | "invalid_scale"
  | "missing";

export type AgriLiveReadinessStatus =
  | "READY"
  | "PROVISIONAL_ONLY"
  | "DATA_STALE"
  | "INVALID_OHLC"
  | "MISSING_COMPARISON_SYMBOL"
  | "INVALID_RISK_LEVELS"
  | "CONFIG_INCOMPLETE";

export type AgriLiveReadinessReason =
  | "READY"
  | "PROVISIONAL_SIGNAL_ONLY"
  | "DATA_STALE"
  | "INVALID_OHLC_DATA"
  | "INVALID_SCALE_DXY"
  | "MISSING_OR_STALE_USDBRL"
  | "MISSING_COMPARISON_SYMBOL"
  | "NO_TRADE_INVALID_RISK_LEVELS"
  | "CONFIG_INCOMPLETE";

export type AgriStrategyConfigSummary = {
  symbol: string;
  displayName: string;
  registrySource: string;
  variantsSource: string;
  sourcePayload: string | null;
  comparisonSymbolsSource: string | null;
  pointvalueSource: string | null;
  variantId: string | null;
  family: string | null;
  direction: "long" | "short" | "both" | null;
  comparisonSymbols: string[];
  hints?: string[];
  settings: {
    fastLen: number | null;
    slowLen: number | null;
    upper: number | null;
    lower: number | null;
    cooldown: number | null;
    useTrendEngine: boolean | null;
    useRegime: boolean | null;
    sd: boolean | null;
    sd1: boolean | null;
  };
};

export type AgriSourceHealthEntry = {
  key: string;
  label: string;
  role: "base" | "base_symbol" | "comparison";
  sourceStatus: AgriDataSourceStatus;
  guardStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  provisional: boolean;
  stale: boolean;
  usedInLive: boolean;
  validation: string[];
};

export type AgriAssetDataHealth = {
  overallStatus: AgriDataSourceStatus;
  lastBarDate: string | null;
  lastClose: number | null;
  base: AgriSourceHealthEntry | null;
  dependencies: AgriSourceHealthEntry[];
};

export type AgriParitySummary = {
  status: AgriParityStatus;
  referenceTrades: number | null;
  invoriaTrades: number | null;
  tradeCountDelta: number | null;
  referenceReturnPct: number | null;
  invoriaReturnPct: number | null;
  referenceTradeSharpe: number | null;
  invoriaTradeSharpe: number | null;
  note: string | null;
};

export type AgriLiveReadiness = {
  status: AgriLiveReadinessStatus;
  reason: AgriLiveReadinessReason;
  blockers: string[];
};

export type AgriAssetStatusSummary = {
  symbol: string;
  displayName: string;
  strategyConfig: AgriStrategyConfigSummary;
  dataHealth: AgriAssetDataHealth;
  parity: AgriParitySummary;
  liveReadiness: AgriLiveReadiness;
};

export type AgriPortfolioReferenceDelta = {
  invoria: {
    trades: number | null;
    returnPct: number | null;
    cagrPct: number | null;
    maxDrawdownPct: number | null;
    profitFactor: number | null;
    winPct: number | null;
    avgTrade: number | null;
    tradeSharpe: number | null;
    dailySharpe: number | null;
    calmar: number | null;
    start: string | null;
    end: string | null;
  };
  reference: {
    trades: number | null;
    returnPct: number | null;
    cagrPct: number | null;
    maxDrawdownPct: number | null;
    profitFactor: number | null;
    winPct: number | null;
    avgTrade: number | null;
    tradeSharpe: number | null;
    dailySharpe: number | null;
    calmar: number | null;
    stopRate: number | null;
    tpRate: number | null;
  };
  delta: {
    trades: number | null;
    returnPct: number | null;
    tradeSharpe: number | null;
  };
  note: string;
};

export type AgriAutoUpdateHealth = {
  generatedAt: string | null;
  refreshLoopActive: boolean;
  loopModeEnabled: boolean;
  processRunning: boolean;
  lockStatus: "active" | "stale" | "none";
  lastRefreshAt: string | null;
  lastRefreshOk: boolean | null;
  intervalMinutes: number | null;
  successfulSymbols: number | null;
  failedSymbols: number | null;
  changedAssets: number | null;
  provisionalAssets: number | null;
  lastError: string | null;
  notes: string[];
};

export type AgriFinalStatusResponse = {
  generatedAt: string;
  assets: Record<string, AgriAssetStatusSummary>;
  portfolio: AgriPortfolioReferenceDelta | null;
  autoUpdate: AgriAutoUpdateHealth | null;
  configSources: {
    registry: string;
    selectedVariants: string;
    parityAudit: string;
    freshnessAudit: string;
    symbolAudit: string;
    registryVersion?: string;
  };
};
