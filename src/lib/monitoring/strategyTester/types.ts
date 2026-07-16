// Monitoring Strategy Tester — Type definitions
// Covers strategy kind selection, XLSX input discovery, parity validation,
// quant validation framework. No live trading, no portfolio release.
// usedAsLiveSignal=false, canBePromotedToLiveSignal=false always.

import type { AgriAssetStatusSummary } from "@/lib/monitoring/agriFinalStatusTypes";

export type MonitoringStrategyKind =
  | "macro_valuation"
  | "seasonal"
  | "portfolio"
  | "intraday_1"
  | "intraday_2"
  | "intraday_3"
  | "intraday_4"
  | "invest";

export const MONITORING_STRATEGY_LABELS: Record<MonitoringStrategyKind, string> = {
  macro_valuation: "Macro Valuation",
  seasonal:       "Seasonal",
  portfolio:      "Portfolio",
  intraday_1:      "Intraday 1",
  intraday_2:      "Intraday 2",
  intraday_3:      "Intraday 3",
  intraday_4:      "Intraday 4",
  invest:          "Invest",
};

export type MonitoringAssetGroup =
  | "agriculture"
  | "metals"
  | "energy"
  | "forex"
  | "indices"
  | "stocks"
  | "crypto"
  | "other";

export type StrategyAvailabilityStatus =
  | "available_exact_parity"
  | "available_metric_parity"
  | "available_metric_parity_missing_input_xlsx"
  | "blocked_missing_inputs"
  | "blocked_missing_history"
  | "blocked_missing_strategy_csv"
  | "blocked_missing_execution_assumptions"
  | "unsupported";

export type StrategyInputSource =
  | "xlsx"
  | "csv"
  | "json_config"
  | "manual_default"
  | "missing";

export type StrategyInputAvailability =
  | "xlsx_params_available"
  | "missing_input_xlsx"
  | "not_applicable";

export type MonitoringSymbolStrategyBinding = {
  strategyKind: MonitoringStrategyKind;
  displayName: string;
  defaultEnabled: boolean;
  inputSource: StrategyInputSource;
  inputSourcePath?: string;
  strategyEnginePath?: string;
  tradingViewExportPath?: string;
  supported: boolean;
  availabilityStatus: StrategyAvailabilityStatus;
  blockedReason?: string;
  // Input capability flags
  inputAvailability: StrategyInputAvailability;
  canLoadXlsxDefaults: boolean;
  canRunWithXlsxDefaults: boolean;
  canRunMetricParity: boolean;
  canRunCustomInputs: boolean;
};

export type MonitoringSymbolStrategyMapping = {
  symbol: string;
  assetId: string;
  displayName: string;
  group: MonitoringAssetGroup;
  availableStrategies: MonitoringSymbolStrategyBinding[];
};

// ── Strategy Input Types ─────────────────────────────────────────────────────

export type StrategyInputType = "number" | "boolean" | "select" | "date" | "string";

export type StrategyInputDefinitionItem = {
  key: string;
  label: string;
  type: StrategyInputType;
  defaultValue: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  unit?: string;
  sourceCell?: string;
  group: string;
};

export type StrategyInputSet = {
  strategyKind: MonitoringStrategyKind;
  symbol: string;
  sourceFile: string;
  sourceSheet: string;
  inputFingerprint: string;
  generatedAt: string;
  inputs: StrategyInputDefinitionItem[];
  // Symbol metadata from Eigenschaften sheet
  metadata: {
    tradingViewSymbol: string;
    timeframe: string;
    pointValue: number | null;
    currency: string;
    tickSize: string;
    backtestingRange: string;
    tradingRange: string;
  };
};

// ── Trade Export Types ───────────────────────────────────────────────────────

export type MonitoringMvaTrade = {
  tradeNo: number;
  direction: "LONG" | "SHORT";
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  pnlNet: number;
  cumulativePnl: number;
  cumulativeReturnPct: number;
};

export type MonitoringMvaMetrics = {
  totalTrades: number;
  longTrades: number;
  shortTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winratePct: number;
  netReturnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  avgReturnPct: number;
  bestTradePct: number;
  worstTradePct: number;
  avgWinPct: number;
  avgLossPct: number;
  // From TradingView Performance sheet (if available)
  sharpeRatio?: number | null;
  sortinoRatio?: number | null;
  cagr?: number | null;
  initialCapital?: number | null;
};

// ── Strategy Tester Run Types ─────────────────────────────────────────────────

export type MonitoringStrategyRunMode =
  | "engine_simulation"
  | "csv_reference_replay"
  | "engine_vs_csv_validation"
  | "walk_forward"
  | "live_signal"
  | "trade_export_replay"
  | "parity_validation";

export type MonitoringStrategyHistoryMode =
  | "default_2000"
  | "full";

export type MonitoringStrategyRunStatus =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "blocked";

// Input mode: how were the inputs sourced for this run?
export type MonitoringStrategyInputMode =
  | "xlsx_defaults"           // XLSX params loaded, run with XLSX defaults → exact parity possible
  | "missing_xlsx_metric_only" // No input XLSX; only trade export; metric parity only
  | "user_modified";          // User changed at least one input vs XLSX defaults → parity invalidated

// Parity basis: what guarantees the run result?
export type MonitoringStrategyParityBasis =
  | "tradingview_export_and_xlsx_inputs"    // Full exact parity: trade export + input XLSX both present
  | "tradingview_export_metrics_only"       // Metric parity: trade export present, inputs missing
  | "custom_backtest_no_parity_export";     // Custom inputs; no parity guarantee

export type MonitoringStrategyRunIdentity = {
  symbol: string;
  strategyKind: MonitoringStrategyKind;
  inputsHash: string;
  inputHash?: string;
  ohlcFingerprint?: string;
  historicalCsvFingerprint: string;
  strategyCsvFingerprint: string;
  csvFingerprint?: string;
  engineVersionHash: string;
  executionProfileVersion: string;
  executionProfileHash?: string;
  quantValidationMode: string;
  generatedAt: string;
  inputMode: MonitoringStrategyInputMode;
  parityBasis: MonitoringStrategyParityBasis;
};

export type MonitoringChartStrategyState = {
  chartId: string;
  symbol: string;
  selectedStrategyKind: MonitoringStrategyKind | null;
  selectedInputProfile: "xlsx_default" | "custom";
  customInputsHash?: string;
  lastRunId?: string;
  parityStatus?: string;
};

// ── Parity Status ─────────────────────────────────────────────────────────────

// Canonical parity status for MVA strategy tester.
// UPPERCASE_UNDERSCORE format for clarity in reports and API responses.
export type MonitoringMvaParityStatus =
  | "PASS_EXACT_PARITY"                      // Trade export + input XLSX + metrics all match
  | "PASS_METRIC_PARITY_MISSING_INPUT_XLSX"  // Metrics match trade export; no input XLSX available
  | "PASS_TRADE_EXPORT_PARITY_INPUTS_UNKNOWN"
  | "FAIL_TRADE_MISMATCH"
  | "FAIL_METRIC_MISMATCH"
  | "BLOCKED_MISSING_TRADE_EXPORT"
  | "BLOCKED_MISSING_HISTORY"
  | "BLOCKED_MISSING_INPUT_XLSX"
  | "UNSUPPORTED"
  | "CUSTOM_INPUTS_NOT_PARITY_VALIDATED"
  | "exact_trade_parity"
  | "close_metric_parity"
  | "mismatch_remaining"
  | "blocked_missing_execution_assumption"
  | "blocked_missing_csv_reference";    // User-modified inputs; parity invalidated

// MonitoringParityStatus = canonical alias (same type)
export type MonitoringParityStatus = MonitoringMvaParityStatus;

// Run provenance: ties input mode, parity basis, and displayed status together.
export type MonitoringMvaRunProvenance = {
  symbol: string;
  inputMode: MonitoringStrategyInputMode;
  parityBasis: MonitoringStrategyParityBasis;
  displayedParityStatus: MonitoringMvaParityStatus;
};

export type MonitoringStrategyParityValidation = {
  symbol: string;
  strategyKind: MonitoringStrategyKind;
  engineTradeCount: number;
  csvTradeCount: number;
  tradeCountDelta: number;
  tradeCountMatches: boolean;
  firstMismatch?: {
    tradeIndex: number;
    field: "entryDate" | "exitDate" | "direction" | "entryPrice" | "exitPrice" | "returnPct" | "pnl" | "quantity";
    engineValue: unknown;
    csvValue: unknown;
    likelyCause: string;
  };
  metrics: Array<{
    name: string;
    engineValue: number | null;
    csvValue: number | null;
    delta: number | null;
    passed: boolean;
  }>;
  parityStatus: MonitoringParityStatus;
};

// Resolver / external-series data-coverage diagnostics (monitoring only,
// additive — never changes which source is resolved or any trade/signal).
export type MonitoringDataCoverageDataGap = {
  status: "DATA_GAP";
  targetStart: string;
  sourceStart: string | null;
  leadingGapBars: number;
  note: string;
};

export type MonitoringDataCoverageEntry = {
  role: string; // "sym1" | "sym2" | "sym3"
  symbol: string;
  normalizedSymbol: string;
  resolved: boolean;
  sourceBars: number;
  sourceStart: string | null;
  sourceEnd: string | null;
  targetTotalBars: number;
  targetCoverageBars: number;
  targetNanPct: number | null;
  availableForTargetStart: boolean;
  dataGap: MonitoringDataCoverageDataGap | null;
};

export type MonitoringResolverDiagnostics = {
  tvCacheFramesPresentInMarketData: boolean;
  cacheShadowPossible: boolean;
  cacheShadowFixApplied: boolean;
  note: string;
};

export type MonitoringStrategyTestResult = {
  symbol: string;
  strategyKind: MonitoringStrategyKind;
  runMode: MonitoringStrategyRunMode;
  metrics: MonitoringMvaMetrics;
  trades: MonitoringMvaTrade[];
  equityCurve: Array<{ date: string; cumulativeReturnPct: number }>;
  cacheIdentity: MonitoringStrategyRunIdentity;
  parityStatus: MonitoringParityStatus;
  inputAvailability: StrategyInputAvailability;
  inputSource?: string;
  openTrade?: {
    direction: "LONG" | "SHORT";
    entryTime: string;
    entryPrice: number;
    stopLossPrice: number | null;
    takeProfitPrice: number | null;
  } | null;
  liveSignal?: {
    symbol: string;
    timestamp: string;
    signal: "LONG" | "SHORT" | "NONE";
    confidence?: number;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    reason: string[];
    basedOnLatestBarTime: string;
    engineInputsHash: string;
    stale?: boolean;
  } | null;
  rawTrades?: Array<{
    tradeId: string;
    strategyId: string;
    strategyName: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    entryTime: string;
    entryPrice: number;
    exitTime: string | null;
    exitPrice: number | null;
    stopLossPrice: number | null;
    takeProfitPrice: number | null;
    exitReason: string | null;
    quantity: number;
    source: string;
    grossPnl?: number;
    netPnl?: number;
    returnPct?: number;
    grossReturnPct?: number;
    commissionCost?: number;
    spreadCost?: number;
    slippageCost?: number;
    financingCost?: number;
  }>;
  costSummary?: {
    totalGrossPnl: number;
    totalNetPnl: number;
    totalCommissionCost: number;
    totalSpreadCost: number;
    totalSlippageCost: number;
    totalFinancingCost: number;
    tradeCount: number;
    commissionPct: number;
    spreadTicks: number;
    slippageTicks: number;
    financingRatePct: number;
    tickSize: number | null;
    initialCapital: number;
  } | null;
  referenceKpis?: {
    asset: string;
    trades: number;
    returnPct: number;
    cagrPct: number;
    maxDdPct: number;
    pf: number;
    winPct: number;
    sharpe: number;
    sortino: number | null;
    stopRate: number;
    tpRate: number;
    avgR: number | null;
    start: string;
    end: string;
    initialCapital: number;
    spreadTicks: number;
    commissionPct: number;
    strategyName?: string | null;
    strategyStatus?: "ACTIVE" | "DISABLED" | "PENDING";
    oosSharpe?: number | null;
    oosPValue?: number | null;
  } | null;
  agriAudit?: AgriAssetStatusSummary | null;
  visualModel?: {
    symbol: string;
    currentSignal: "LONG" | "SHORT" | "NONE";
    openPosition?: {
      direction: "LONG" | "SHORT";
      entryPrice: number;
      stopLoss: number | null;
      takeProfit: number | null;
      entryDate: string;
    };
    markers: Array<{
      time: string;
      type: "entry" | "exit" | "stop" | "take_profit" | "break_even" | "trail";
      direction?: "LONG" | "SHORT";
      price: number;
      label: string;
    }>;
    lines: Array<{
      type: "entry" | "stop_loss" | "take_profit";
      price?: number;
    }>;
    boxes: Array<{
      type: "position_zone";
      startTime: string;
      endTime?: string;
      high: number;
      low: number;
    }>;
  } | null;
  validation?: MonitoringStrategyParityValidation | null;
  walkForward?: {
    symbol: string;
    folds: Array<{
      trainStart: string;
      trainEnd: string;
      oosStart: string;
      oosEnd: string;
      selectedInputsHash: string;
      trainMetrics: Record<string, number>;
      oosMetrics: Record<string, number>;
    }>;
    oosAggregate: {
      trades: number;
      netReturn: number;
      profitFactor: number;
      maxDrawdown: number;
      calmar: number;
      winrate: number;
    };
    robustnessStatus: "strong" | "promising" | "weak" | "failed" | "insufficient";
  } | null;
  dataBinding?: {
    symbol: string;
    displayName: string;
    tvSymbol: string;
    validatedOhlcCsvPath: string | null;
    liveOhlcJsonPath: string;
    sourceType: "validated_tradingview_csv" | "manual_tradingview_csv";
    ohlcFingerprint: string;
    firstDate: string;
    lastDate: string;
    rowCount: number;
    valid: boolean;
    mergedOhlcPath: string;
    liveCacheLastBar: string | null;
  } | null;
  warnings?: string[];
  dataCoverage?: MonitoringDataCoverageEntry[];
  resolverDiagnostics?: MonitoringResolverDiagnostics;
  /** Active data mode for comparison series — set by MVA agriculture engine. */
  dataMode?: "PRODUCTION_LIVE" | "REFERENCE_PARITY";
  /** Per-symbol data source details — set by MVA agriculture engine. */
  dataSourceMap?: Array<{
    symbol: string;
    path: string;
    mode: "PRODUCTION_LIVE" | "REFERENCE_PARITY";
    available: boolean;
    requested?: boolean;
    rowCount?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  }>;
  error?: string;
};

// ── Quant Validation Framework ────────────────────────────────────────────────

export type QuantValidationMode =
  | "fixed_backtest"
  | "in_sample_out_of_sample"
  | "walk_forward"
  | "parameter_sensitivity"
  | "monte_carlo_bootstrap"
  | "risk_analysis";

export type InOutSampleConfig = {
  inSampleStart: string;
  inSampleEnd: string;
  outOfSampleStart: string;
  outOfSampleEnd: string;
};

export type WalkForwardConfig = {
  initialTrainingYears: number;
  oosBlockYears: number;
  anchored: boolean;
  reoptimizeInputs: boolean;
  allowedInputRanges: Record<string, { min: number; max: number; step: number }>;
};

export type QuantValidationStatus =
  | "implemented"
  | "prepared_not_implemented"
  | "blocked_missing_data"
  | "blocked_missing_engine";

export type QuantModuleInfo = {
  mode: QuantValidationMode;
  label: string;
  status: QuantValidationStatus;
  blockedReason?: string;
};

// ── API Response Types ────────────────────────────────────────────────────────

export type MonitoringStrategyDiscoverResponse = {
  symbols: MonitoringSymbolStrategyMapping[];
  generatedAt: string;
  totalSymbols: number;
  mvaSymbolCount: number;
  intradaySymbolCount: number;
  mvaExactParityCount: number;
  mvaMetricParityCount: number;
};

export type MonitoringStrategyLoadInputsResponse = {
  symbol: string;
  strategyKind: MonitoringStrategyKind;
  inputSet: StrategyInputSet | null;
  inputAvailability: StrategyInputAvailability;
  error?: string;
};

export type MonitoringStrategyRunResponse = {
  runId: string;
  symbol: string;
  strategyKind: MonitoringStrategyKind;
  status: MonitoringStrategyRunStatus;
  result?: MonitoringStrategyTestResult;
  selectedSymbols?: string[];
  focusedSymbol?: string;
  mode?: "single" | "portfolio";
  portfolioMode?: "single" | "selected_equal_weight" | "custom_weight";
  perAsset?: Record<string, MonitoringStrategyTestResult>;
  combined?: MonitoringStrategyPortfolioResult | null;
  historyMode?: MonitoringStrategyHistoryMode;
  backtestStart?: string | null;
  dataHealth?: Record<string, AgriAssetStatusSummary["dataHealth"] | null>;
  liveReadiness?: Record<string, AgriAssetStatusSummary["liveReadiness"] | null>;
  referenceComparison?: {
    referenceName: "Python All-8" | "Python Macro-6" | "Custom Basket";
    tradeDelta?: number | null;
    returnDelta?: number | null;
    referenceTrades?: number | null;
    referenceReturnPct?: number | null;
    startDate?: string | null;
    provenanceDelta?: string | null;
  } | null;
  blocker?: string;
};

export type MonitoringStrategyPortfolioMode = "single" | "selected_equal_weight" | "custom_weight";

export type MonitoringStrategyPortfolioMetrics = {
  grossReturnPct: number | null;
  netReturnPct: number | null;
  cagr: number | null;
  maxDrawdownPct: number | null;
  profitFactor: number | null;
  winratePct: number | null;
  tradeSharpe: number | null;
  dailySharpe: number | null;
  calmar: number | null;
  totalTrades: number;
  longTrades: number;
  shortTrades: number;
  wins: number;
  losses: number;
  avgTradePct: number | null;
  avgWinPct: number | null;
  avgLossPct: number | null;
  stopExitRate: number | null;
  tpExitRate: number | null;
  commissionCost: number | null;
  spreadCost: number | null;
  financingCost: number | null;
  slippageCost: number | null;
  exposurePct: number | null;
  positiveYears: number | null;
  startDate: string | null;
  endDate: string | null;
};

export type MonitoringStrategyPortfolioTradeRow = {
  key: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryTime: string;
  entryPrice: number;
  exitTime: string | null;
  exitPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  exitReason: string | null;
  quantity: number;
  grossPnl: number | null;
  netPnl: number | null;
  commissionCost: number | null;
  spreadCost: number | null;
  slippageCost: number | null;
  financingCost: number | null;
  holdingBars: number | null;
  rMultiple: number | null;
};

export type MonitoringStrategyPortfolioResult = {
  selectedSymbols: string[];
  portfolioMode: MonitoringStrategyPortfolioMode;
  weights: Record<string, number>;
  metrics: MonitoringStrategyPortfolioMetrics;
  trades: Array<MonitoringMvaTrade & { symbol: string }>;
  rawTrades: MonitoringStrategyPortfolioTradeRow[];
  equityCurve: Array<{ date: string; cumulativeReturnPct: number }>;
  grossEquityCurve: Array<{ date: string; cumulativeReturnPct: number }>;
  drawdownCurve: Array<{ date: string; cumulativeReturnPct: number }>;
};
