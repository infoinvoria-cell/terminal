import type {
  MonitoringDataCoverageEntry,
  MonitoringMvaMetrics,
  MonitoringMvaTrade,
  MonitoringResolverDiagnostics,
  MonitoringStrategyParityValidation,
  MonitoringStrategyRunIdentity,
  StrategyInputAvailability,
  StrategyInputSet,
} from "@/lib/monitoring/strategyTester/types";

export type MvaAgricultureSymbol =
  | "ZW1!"
  | "ZC1!"
  | "ZS1!"
  | "CC1!"
  | "KC1!"
  | "SB1!"
  | "CT1!"
  | "OJ1!";

export type AgricultureMvaDataBinding = {
  symbol: MvaAgricultureSymbol;
  displayName: string;
  tvSymbol: string;
  validatedOhlcCsvPath: string | null;
  liveOhlcJsonPath: string;
  generatedPayloadPath: string | null;
  inputParamsXlsxPath: string | null;
  strategyReferenceCsvPath: string | null;
  tradeExportXlsxPath: string | null;
  tradeExportCsvPath: string | null;
  referenceEventsPath: string | null;
  sourceType: "validated_tradingview_csv" | "manual_tradingview_csv";
};

export type MvaEngineInputSource =
  | "generated_monitoring_payload"
  | "xlsx_defaults"
  | "engine_defaults";

export type MvaEngineRawTrade = {
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
};

export type MvaCostSummary = {
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
};

export type AgriReferenceKpis = {
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
};

export type MvaEngineLiveSignal = {
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
};

export type MvaChartVisualModel = {
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
};

export type MvaWalkForwardFold = {
  trainStart: string;
  trainEnd: string;
  oosStart: string;
  oosEnd: string;
  selectedInputsHash: string;
  trainMetrics: Record<string, number>;
  oosMetrics: Record<string, number>;
};

export type MvaWalkForwardResult = {
  symbol: string;
  folds: MvaWalkForwardFold[];
  oosAggregate: {
    trades: number;
    netReturn: number;
    profitFactor: number;
    maxDrawdown: number;
    calmar: number;
    winrate: number;
  };
  robustnessStatus: "strong" | "promising" | "weak" | "failed" | "insufficient";
};

/** Which data files the engine used for comparison series. */
export type MvaDataMode = "PRODUCTION_LIVE" | "REFERENCE_PARITY";

export type MvaDataSourceEntry = {
  symbol: string;
  path: string;
  mode: MvaDataMode;
  available: boolean;
  requested?: boolean;
  rowCount?: number | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type MvaEngineRunResult = {
  symbol: string;
  displayName: string;
  inputSet: StrategyInputSet;
  inputAvailability: StrategyInputAvailability;
  inputSource: MvaEngineInputSource;
  dataBinding: AgricultureMvaDataBinding & {
    ohlcFingerprint: string;
    firstDate: string;
    lastDate: string;
    rowCount: number;
    valid: boolean;
    mergedOhlcPath: string;
    liveCacheLastBar: string | null;
  };
  metrics: MonitoringMvaMetrics;
  trades: MonitoringMvaTrade[];
  rawTrades: MvaEngineRawTrade[];
  equityCurve: Array<{ date: string; cumulativeReturnPct: number }>;
  openTrade: MvaEngineRawTrade | null;
  liveSignal: MvaEngineLiveSignal | null;
  visualModel: MvaChartVisualModel;
  cacheIdentity: MonitoringStrategyRunIdentity;
  validation: MonitoringStrategyParityValidation | null;
  walkForward: MvaWalkForwardResult | null;
  warnings: string[];
  dataCoverage: MonitoringDataCoverageEntry[];
  resolverDiagnostics: MonitoringResolverDiagnostics;
  costSummary: MvaCostSummary | null;
  referenceKpis: AgriReferenceKpis | null;
  /** Active data mode for comparison series (PRODUCTION_LIVE or REFERENCE_PARITY). */
  dataMode: MvaDataMode;
  /** Per-symbol data source details for transparency panel. */
  dataSourceMap: MvaDataSourceEntry[];
};
