export type PortfolioWeight = Record<string, number>;

export type FSPortfolioConfig = {
  portfolio_name: string;
  version?: string;
  status: string;
  currency: string;
  initial_capital: number;
  rebalance_frequency: "quarterly";
  rebalance_months: number[];
  rebalance_day: "last_trading_day";
  transaction_cost_bps: number;
  tolerance_band_relative: number;
  use_tolerance_band_for_live_orders: boolean;
  benchmark: string;
  weights: PortfolioWeight;
  removed_from_core?: Record<
    string,
    {
      previous_weight: number;
      new_status: string;
      reason: string;
    }
  >;
  white_swan: {
    name: string;
    symbol_reference?: string;
    research_symbol_reference?: string;
    implementation_instrument?: string;
    max_portfolio_weight: number;
    mode: "long_or_cash";
    cash_return: number;
    use_trade_export_if_available: boolean;
    use_signal_script_if_available: boolean;
    if_no_signal_data: "treat_as_cash_and_warn";
  };
  required_ohlc_symbols: string[];
  white_swan_required_data?: string[];
  optional_symbols?: string[];
  research_optional_symbols?: string[];
  analysis_periods: {
    full_backtest: boolean;
    in_sample_end: string;
    out_of_sample_start: string;
    forward_start: string;
  };
  risk_rules: {
    no_shorts: boolean;
    no_options: boolean;
    no_portfolio_leverage: boolean;
    white_swan_sleeve_cap: number;
    freeze_parameters_during_forward_test: boolean;
  };
  caveats: string[];
};

export type OhlcBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

export type ReturnPoint = {
  date: string;
  value: number;
};

export type EquityPoint = {
  date: string;
  value: number;
};

export type PositionWeight = {
  symbol: string;
  targetWeight: number;
  currentWeight: number;
  deviation: number;
  lowerBand: number;
  upperBand: number;
};

export type RebalanceEvent = {
  date: string;
  portfolioValue: number;
  currentWeights: Record<string, number>;
  targetWeights: Record<string, number>;
  deviations: Record<string, number>;
  theoreticalOrders: Record<string, number>;
  toleranceBandOrders: Record<string, number>;
  turnover: number;
  transactionCostPct: number;
  transactionCostAmount: number;
  whiteSwanSignal: "long" | "cash";
  comment: string;
  status: "scheduled" | "executed" | "band_hold";
};

export type PortfolioMetrics = {
  totalReturnPct: number;
  cagrPct: number;
  annualizedVolatilityPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  sortino: number | null;
  calmar: number | null;
  worstMonthPct: number | null;
  worstYearPct: number | null;
  positiveMonthsPct: number | null;
  positiveYearsPct: number | null;
  correlationToSpy: number | null;
  betaToSpy: number | null;
  upsideCapturePct: number | null;
  downsideCapturePct: number | null;
  turnoverPerYearPct: number | null;
  transactionCostPct: number;
  transactionCostAmount: number;
  ytdReturnPct: number | null;
};

export type WhiteSwanSleeveStatus = {
  source: "trade_export" | "signal_script" | "cash_fallback";
  displayName?: string;
  sourcePath?: string | null;
  tradeExportStatus?: "present" | "missing" | "pending";
  pineReferencePath?: string | null;
  pineReferenceStatus?: "present" | "missing";
  currentSignal: "long" | "cash";
  warning: string | null;
  tradeCount: number;
  winRatePct: number | null;
  profitFactor: number | null;
  averageGainPct: number | null;
  averageLossPct: number | null;
  payoffRatio: number | null;
  maxDrawdownPct: number | null;
  timeInMarketPct: number | null;
  forwardReturnPct: number | null;
  forwardStartDate: string | null;
  forwardStartConfirmed: boolean;
  currentSleeveValue: number | null;
  contributionToPortfolioPct: number | null;
  lastTradeDate: string | null;
  firstTradeDate: string | null;
  equityCurve: EquityPoint[];
  drawdownCurve: ReturnPoint[];
  tradeList: Array<{
    entryDate: string | null;
    exitDate: string;
    returnPct: number;
    netProfitUsd: number | null;
  }>;
  dailyReturns: Record<string, number>;
};

export type DataQualityStatus = {
  symbol: string;
  found: boolean;
  sourcePath: string | null;
  format: "csv" | "json" | "xlsx" | "unknown";
  rowCount: number;
  startDate: string | null;
  endDate: string | null;
  warnings: string[];
};

export type ManifestFileEntry = {
  path: string | null;
  status: "present" | "missing" | "pending";
  required?: boolean;
  core?: boolean;
  size_bytes?: number;
  header?: string | null;
  rows?: number;
  first_date?: string | null;
  last_date?: string | null;
  date_column?: string | null;
  ohlc_columns_recognized?: boolean;
  parseable_dates?: number;
  sorted?: boolean;
  duplicate_dates?: number;
  frequency?: "daily" | "weekly" | "monthly" | "unknown";
  missing_close_values?: number;
  notes?: string[];
};

export type FSPortfolioDataManifest = {
  portfolio: string;
  updated_at: string;
  core_required: Record<string, ManifestFileEntry>;
  white_swan: {
    implementation_instrument: string;
    trade_export: ManifestFileEntry;
    pine_reference: ManifestFileEntry;
  };
  research_optional: Record<string, ManifestFileEntry>;
  missing: string[];
  can_run_final_core_backtest: boolean;
  reason: string | null;
};

export type FSPortfolioBacktestResult = {
  ready: boolean;
  reason: string | null;
  equityCurve: EquityPoint[];
  assetCurves: Record<string, EquityPoint[]>;
  benchmarkCurve: EquityPoint[];
  drawdownCurve: ReturnPoint[];
  monthlyReturns: ReturnPoint[];
  annualReturns: ReturnPoint[];
  rolling12mReturns: ReturnPoint[];
  rollingVolatility: ReturnPoint[];
  rollingCorrelation: ReturnPoint[];
  rebalanceEvents: RebalanceEvent[];
  currentWeights: PositionWeight[];
  metrics: PortfolioMetrics | null;
  nextRebalanceDate: string | null;
  whiteSwan: WhiteSwanSleeveStatus;
  commonStartDate: string | null;
  commonEndDate: string | null;
  oosStartDate: string | null;
  adaptiveStartDate: string | null;
  fullCoreStartDate: string | null;
  backtestAssetDailyReturns: Record<string, Record<string, number>>;
};

export type FSPortfolioLiveAssetStatus = {
  symbol: string;
  status: "ok" | "stale" | "missing" | "error";
  lastFetch: string | null;
  lastBarTime: string | null;
  latestClose: number | null;
  historyRows: number;
};

export type FSPortfolioLiveResult = {
  status: "verified" | "forward" | "pending" | "missing";
  seriesType: "portfolio" | "qqq_invest_pine" | "missing";
  latestMarketDataTimestamp: string | null;
  marketDataStatus: "ok" | "stale" | "missing" | "error";
  marketDataSource: string;
  marketDataAuthMode: "login" | "nologin" | "unavailable";
  qqqInvestPineForwardVerified: boolean;
  qqqInvestPineCandidateStartDate: string | null;
  qqqInvestPineSeriesStartDate: string | null;
  qqqInvestPineSeriesEndDate: string | null;
  qqqInvestPineSeriesPoints: number;
  qqqInvestPineCurrentSignal: "long" | "cash";
  portfolioForwardVerified: boolean;
  portfolioForwardStartDate: string | null;
  portfolioSeriesStartDate: string | null;
  portfolioSeriesEndDate: string | null;
  portfolioSeriesPoints: number;
  assetStatuses: Record<string, FSPortfolioLiveAssetStatus>;
  assetCurves: Record<string, EquityPoint[]>;
  qqqInvestPineReturnPct: number | null;
  portfolioReturnPct: number | null;
  maxDrawdownPct: number | null;
  ytdReturnPct: number | null;
  caveat: string;
  reason: string | null;
  // Forward tracking dataset (Phase A: QQQ Pine 100% from 2025-05-01; Phase B: full mix from 2026-05-01)
  forwardPhaseAStart: string;
  forwardPhaseBStart: string;
  forwardPortfolioSeries: EquityPoint[];
  forwardBenchmarkSeries: EquityPoint[];
  forwardAssetCurves: Record<string, EquityPoint[]>;
  forwardAnnualReturns: ReturnPoint[];
  forwardMonthlyReturns: ReturnPoint[];
  forwardTotalReturnPct: number | null;
  forwardMaxDrawdownPct: number | null;
  forwardCagrPct: number | null;
  forwardAnnualizedVolPct: number | null;
  forwardSharpe: number | null;
  forwardSortino: number | null;
  forwardCalmar: number | null;
  forwardPositiveMonthsPct: number | null;
  forwardDataPoints: number;
  forwardAssetDailyReturns: Record<string, Record<string, number>>;
};

export type FSPortfolioSnapshot = {
  portfolioName: string;
  status: string;
  sourcePrompt: string;
  configPath: string;
  config: FSPortfolioConfig;
  manifest: FSPortfolioDataManifest;
  dataQuality: DataQualityStatus[];
  missingSymbols: string[];
  optionalDataFound: string[];
  backtest: FSPortfolioBacktestResult;
  live: FSPortfolioLiveResult;
  caveats: string[];
};
