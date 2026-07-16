export type MonitoringCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

export type MonitoringTrade = {
  direction: "long" | "short";
  entryTime: string;
  exitTime: string;
  entry: number;
  exit: number;
  sl?: number | null;
  tp?: number | null;
  exitReason?: string | null;
  quantity?: number | null;
};

export type MonitoringStrategyEvent = {
  time: string;
  barIndex: number;
  type:
    | "long_entry"
    | "short_entry"
    | "long_exit"
    | "short_exit"
    | "sl_hit"
    | "tp_hit"
    | "be_active"
    | "trail_update"
    | "trend_exit"
    | "opposite_valuation_exit";
  price?: number | null;
  entry?: number | null;
  sl?: number | null;
  tp?: number | null;
  reason?: string | null;
};

export type PerformanceCurvePoint = {
  time: string;
  value: number;
};

export type DrawdownCurvePoint = {
  time: string;
  value: number;
};

export type StrategyPerformanceSummary = {
  netProfit: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  avgDrawdownPercent: number;
  top5DrawdownsPercent: number[];
  winRatePercent: number;
  profitFactor: number;
  totalTrades: number;
  avgTrade: number;
  bestTrade: number;
  worstTrade: number;
  longTrades: number;
  shortTrades: number;
  openPL: number;
  grossProfit: number;
  grossLoss: number;
  commissionPaid: number;
  cagr: number;
  calmarRatio: number;
  sharpeRatio: number;
  expectancyPercent: number;
};

export type StrategyTradeStats = {
  totalClosedTrades: number;
  winningTrades: number;
  losingTrades: number;
  percentProfitable: number;
  avgTrade: number;
  avgWinningTrade: number;
  avgLosingTrade: number;
  avgWinLossRatio: number;
  largestWinningTrade: number;
  largestLosingTrade: number;
};

export type StrategyLongShortStats = {
  longNetProfit: number;
  shortNetProfit: number;
  longWinRate: number;
  shortWinRate: number;
  longTrades: number;
  shortTrades: number;
};

export type StrategyRiskStats = {
  maxDrawdownPercent: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgBarsInTrade: number;
  exposurePercent: number;
  realizedRiskReward: number;
};

export type StrategyTradeListRow = {
  index: number;
  direction: "long" | "short";
  entryDate: string;
  exitDate: string;
  entry: number;
  exit: number;
  pl: number;
  plPercent: number;
  bars: number;
  exitReason: string;
};

export type StrategyPerformanceResult = {
  summary: StrategyPerformanceSummary;
  equityCurve: PerformanceCurvePoint[];
  drawdownCurve: DrawdownCurvePoint[];
  tradeStats: StrategyTradeStats;
  longShortStats: StrategyLongShortStats;
  riskStats: StrategyRiskStats;
  tradeList: StrategyTradeListRow[];
  debug: {
    positionSizingFallback: boolean;
    usedPointValue: number;
    useCompounding: boolean;
    fixedBalance: boolean;
    initialCapital: number;
  };
};
