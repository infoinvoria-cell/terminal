export type MonteCarloMethod = "bootstrap" | "stationary-bootstrap";

export type MonteCarloParams = {
  returns: number[];
  simulationCount: number;
  horizon: number;
  seed: number;
  method: MonteCarloMethod;
  sourceHash: string;
};

export type MonteCarloPercentiles = {
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
};

export type MonteCarloResult = {
  paths: number[][];
  percentiles: MonteCarloPercentiles;
  actualPath: number[];
  params: MonteCarloParams;
};

export type DistributionBin = {
  x0: number;
  x1: number;
  midpoint: number;
  count: number;
  freq: number;
};

export type DistributionStats = {
  mean: number;
  median: number;
  std: number;
  skew: number;
  kurt: number;
  var95: number;
  cvar95: number;
  n: number;
};

export type DistributionResult = {
  bins: DistributionBin[];
  stats: DistributionStats;
};

export type RollingMetricPoint = {
  date: string;
  value: number;
};

export type RollingMetric = "sharpe" | "volatility" | "return";

export type DrawdownEvent = {
  startDate: string;
  troughDate: string;
  endDate: string | null;
  depth: number;
  duration: number;
  recoveryDays: number | null;
};

export type ModelingSelection = {
  type: "portfolio";
  id: "whiteSwan" | "invest" | "combined";
  label: string;
};

export type RegressionResult = {
  alpha: number;
  beta: number;
  r2: number;
  points: Array<{ x: number; y: number; date: string }>;
  fittedLine: Array<{ x: number; y: number }>;
};

export type CorrelationPoint = {
  date: string;
  correlation: number;
};

export type ModelingSubject =
  | { kind: "portfolio"; tab: "whiteSwan" | "invest" | "combined" }
  | { kind: "strategy"; id: string }
  | { kind: "custom"; ids: string[] };

// ─── Quant expansion types ────────────────────────────────────────────────────

export type CorrelationMatrixResult = {
  labels: string[];
  matrix: number[][];
  covMatrix: number[][];
};

export type EfficientFrontierResult = {
  sampledPortfolios: Array<{ vol: number; ret: number; sharpe: number }>;
  /** Long-only frontier points (projected gradient descent, wᵢ ≥ 0, Σwᵢ = 1) */
  frontierPoints: Array<{ vol: number; ret: number; sharpe: number; weights: number[] }>;
  minVol: { weights: number[]; vol: number; ret: number; sharpe: number };
  maxSharpe: { weights: number[]; vol: number; ret: number; sharpe: number };
  individualAssets: Array<{ label: string; vol: number; ret: number }>;
  /** "LONG-ONLY SIMPLEX" — projected gradient descent, wᵢ ≥ 0 */
  method: "LONG-ONLY SIMPLEX";
  componentCount: number;
  observationCount: number;
  riskFreeRate: 0;
};

export type PCAResult = {
  labels: string[];
  components: Array<{
    eigenvalue: number;
    explainedVariance: number;
    cumulativeVariance: number;
    loadings: number[];
  }>;
};

export type VaRSurfaceResult = {
  confidences: number[];
  horizons: number[];
  varMatrix: number[][];
  cvarMatrix: number[][];
};

export type TradeRecord = {
  entry_time: string;
  exit_time: string;
  entry_price: number;
  exit_price: number;
  pnl: number;
  exit_type: string;
  year: number;
};

export type TradeStats = {
  n: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  profitFactor: number;
  maxConsecWins: number;
  maxConsecLosses: number;
};
