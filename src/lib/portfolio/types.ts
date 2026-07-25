export type PortfolioGroupId =
  | "intraday_mt"
  | "macro_indices"
  | "real_assets"
  | "forex_macro"
  | "invest"
  | "stocks"
  | "seasonal_patterns";

export type PortfolioGroupDefinition = {
  id: PortfolioGroupId;
  label: string;
  defaultWeightPct: number;
};

export type PortfolioTrade = {
  id: string;
  tradeNo: number;
  timestamp: string;
  type: string;
  signal: string;
  price: number;
  sizeQty: number;
  sizeValue: number;
  pnlNet: number;
  pnlPct: number;
  cumulativePnl: number;
  cumulativePct: number;
  sourceFile: string;
};

export type PortfolioStrategy = {
  id: string;
  fileName: string;
  displayName: string;
  shortName: string;
  groupId: PortfolioGroupId;
  symbol: string;
  market: string;
  trades: PortfolioTrade[];
  researchOnly?: boolean;
  researchSource?: "seasonality_saved_pattern";
  sourcePatternId?: string;
};

export type PortfolioDataset = {
  generatedAt: string;
  strategies: PortfolioStrategy[];
  groups: PortfolioGroupDefinition[];
};

export type PortfolioRuleSettings = {
  fixedCore: boolean;
  dailyIntradayStopEnabled: boolean;
  clusterOpenCapEnabled: boolean;
  drawdownThrottleEnabled: boolean;
  groupRiskCapEnabled: boolean;
  compoundedMode: boolean;
  nonCompoundedMode: boolean;
  masterMultiplier: number;
  dailyAccountStopPct: number;
  weeklyStopPct: number;
  softDdThrottlePct: number;
  hardDdThrottlePct: number;
  maxDdTolerancePct: number;
  normalTradeRiskCapUsd: number;
  realAssetRiskCapUsd: number;
  hardTradeCapUsd: number;
  maxOpenRealAssets: number;
  maxOpenMetals: number;
  maxOpenSoftsGrains: number;
  equityTechClusterCapPct: number;
  metalsClusterCapPct: number;
  softsGrainsClusterCapPct: number;
  dailyIntradayStopPct: number;
  tradeRiskCapUsd: number;
  softClusterCapPct: number;
  hardClusterCapPct: number;
  maxSingleTradeRiskPct: number;
  maxGroupRiskPct: number;
  drawdownStepsText: string;
  dailyProtectionPct: number;
  weeklyProtectionPct: number;
};

export type PortfolioSimulatorSettings = {
  startCapital: number;
  brokerProfile: string;
  minlotProfile: string;
  multiplier: number;
  groupRiskAdjustment: Record<PortfolioGroupId, number>;
};

export type PortfolioConfig = {
  systemName: string;
  systemType: string;
  range: "all" | "since2000" | "since2008" | "since2010" | "1y" | "3y" | "5y" | "ytd";
  logScale: boolean;
  viewMode: "portfolio" | "groups";
  includeEquityInDrawdown: boolean;
  activeGroups: Record<PortfolioGroupId, boolean>;
  groupWeightsPct: Record<PortfolioGroupId, number>;
  groupMultipliers: Record<PortfolioGroupId, number>;
  activeStrategies: Record<string, boolean>;
  strategyWeightsPct: Record<string, number>;
  strategyMultipliers: Record<string, number>;
  strategyRiskModelUsd: Record<string, number>;
  autoNormalizeWeights: boolean;
  rules: PortfolioRuleSettings;
  simulator: PortfolioSimulatorSettings;
};

export type PortfolioMode = "normal" | "compounded";

export type PortfolioPhaseKey =
  | "backtesting"
  | "in_sample"
  | "out_of_sample"
  | "robustness"
  | "live";

export type PortfolioPhaseMarker = {
  key: PortfolioPhaseKey;
  label: string;
  date: string;
  tone: "muted" | "neutral" | "accent";
};

export type PortfolioPhaseStatus = {
  key: PortfolioPhaseKey;
  label: string;
  status: "active" | "available" | "pending";
  date?: string | null;
  description?: string | null;
};

export type PortfolioKpi = {
  key: string;
  label: string;
  value: string;
  tooltip: string;
  tone?: "neutral" | "positive" | "negative";
};

export type PortfolioKpiMetrics = {
  annualPerfNormalPct: number;
  annualPerfCompPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  calmarRatio: number;
  adjustedCalmarRatio: number;
  averageDrawdownPct: number;
  averageTop5DrawdownPct: number;
  ulcerIndexPct: number;
  tradesTotal: number;
  tradesPerMonth: number;
  tradesPerYear: number;
  hitRatePct: number;
  profitFactor: number;
  longPct: number;
  shortPct: number;
  dayTradePct: number;
  swingTradePct: number;
  hasDaySwingSplit: boolean;
  sharpeFrequency: "daily" | "monthly";
  riskFreeRate: number;
  auditNotes: string[];
};

export type PortfolioPoint = {
  date: string;
  ts: number;
  equity: number;
  drawdownPct: number;
  dayReturnPct: number;
  groupReturnsPct: Record<PortfolioGroupId, number>;
  groupEquity: Record<PortfolioGroupId, number>;
};

export type PortfolioHeatmapRow = {
  year: number;
  months: Array<number | null>;
  total: number | null;
};

export type PortfolioBarPoint = {
  label: string;
  value: number;
};

export type PortfolioContributionPoint = {
  id: PortfolioGroupId;
  label: string;
  weightPct: number;
  contributionPct: number;
  trades: number;
};

export type PortfolioCorrelationCell = {
  row: PortfolioGroupId;
  col: PortfolioGroupId;
  rowLabel: string;
  colLabel: string;
  value: number;
};

export type PortfolioSimulatorRow = {
  strategyId: string;
  groupId: PortfolioGroupId;
  groupLabel: string;
  strategyName: string;
  symbol: string;
  trades: number;
  tradablePct: number;
  nonTradablePct: number;
  partialPct: number;
  avgDistortionPct: number;
  worstDistortionPct: number;
  status: "green" | "yellow" | "red";
};

export type PortfolioSimulatorSummary = {
  totalTradablePct: number;
  fullStrategies: number;
  partialStrategies: number;
  unusableStrategies: number;
  avgDistortionPct: number;
  estimatedPortfolioDeviationPct: number;
  strategyRows: PortfolioSimulatorRow[];
  groupTradability: Array<{ groupId: PortfolioGroupId; label: string; tradablePct: number }>;
};

export type PortfolioModel = {
  kpis: PortfolioKpi[];
  kpiMetrics: PortfolioKpiMetrics;
  points: PortfolioPoint[];
  filteredPoints: PortfolioPoint[];
  monthlyHeatmap: PortfolioHeatmapRow[];
  yearlyReturns: PortfolioBarPoint[];
  rollingPerformance: PortfolioBarPoint[];
  rollingDrawdown: PortfolioBarPoint[];
  groupContribution: PortfolioContributionPoint[];
  correlation: PortfolioCorrelationCell[];
  simulator: PortfolioSimulatorSummary;
  recommendations: string[];
  activeStrategies: number;
  activeGroups: number;
  weightSumPct: number;
  strategyWeightSumsByGroup: Record<PortfolioGroupId, number>;
};
