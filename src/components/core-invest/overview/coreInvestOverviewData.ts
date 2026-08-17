// Core Invest Overview — data module, sourced from the frozen validation program
// (workspace/output/core-invest/validation/*). PROPOSED_EXECUTION_SPEC, not canonical.
// LIVE READY: NO. Do not treat any figure here as a live trading claim.

export const CANONICAL = {
  productName: "Core Invest",
  strategyVersion: "Active Alpha 2",
  frozenDate: "2026-08-02",
  baseCurrency: "USD",
  executionPolicyStatus: "PROPOSED" as const,
};

// Backtest metrics — independently reconstructed and proven (V3/V4 metric reconciliation)
export const BACKTEST = {
  period: "2008-05-29 to 2026-07-31 (18.17 years)",
  cagr: 14.66,
  cagrDerived: 14.64,
  volatility: 22.30,
  maxDD: -28.33,
  calmar: 0.517,
  sharpe: 0.663,
  sortino: 0.906,
  sharpeMethodology: "DGS3MO (3-month T-bill) time-varying risk-free rate — proven, not rf=0",
};

export const ETF_WEIGHTS: { symbol: string; name: string; weight: number }[] = [
  { symbol: "SPY", name: "S&P 500", weight: 0.56 },
  { symbol: "QQQ", name: "Nasdaq 100", weight: 0.28 },
  { symbol: "VLUE", name: "MSCI USA Value", weight: 0.160067 },
  { symbol: "RSP", name: "S&P 500 Equal Weight", weight: 0.084 },
  { symbol: "QUAL", name: "MSCI USA Quality", weight: 0.084 },
  { symbol: "MTUM", name: "MSCI USA Momentum", weight: 0.084 },
  { symbol: "USMV", name: "MSCI USA Min Vol", weight: 0.084 },
  { symbol: "IWM", name: "Russell 2000", weight: 0.063933 },
];

export const GROSS_LONG_EXPOSURE = 1.4;
export const FINANCING_WEIGHT = -0.40;
export const TARGET_FUTURES_RATIO = 0.315425;

export type ShadowTier = {
  capital: number;
  etfExecutedExposure: number;
  roundingErrorPct: number;
  future: string;
  futureQty: number;
  futureNotional: number;
  futureDistortionPct: number;
  modelMargin: number;
  modelFinancing: number;
  proposedReserve: number;
  freeLiquidity: number;
  status: "CLEAN" | "WATCH" | "NOT_EXECUTABLE";
};

// Sourced verbatim from CORE_INVEST_SHADOW_CAPITAL_TIERS.json / CORE_INVEST_COMPLETE_CAPITAL_TIERS.json
export const SHADOW_TIERS: ShadowTier[] = [
  { capital: 15000, etfExecutedExposure: 20080, roundingErrorPct: 4.380, future: "MJY", futureQty: -1, futureNotional: 7885.63, futureDistortionPct: 66.89, modelMargin: 475, modelFinancing: 6000, proposedReserve: 1250, freeLiquidity: -5555, status: "WATCH" },
  { capital: 25000, etfExecutedExposure: 33405, roundingErrorPct: 4.557, future: "MJY", futureQty: -1, futureNotional: 7885.63, futureDistortionPct: 0.13, modelMargin: 475, modelFinancing: 10000, proposedReserve: 1450, freeLiquidity: -8880, status: "CLEAN" },
  { capital: 50000, etfExecutedExposure: 68485, roundingErrorPct: 2.164, future: "MJY", futureQty: -2, futureNotional: 15771.25, futureDistortionPct: 0.00, modelMargin: 950, modelFinancing: 20000, proposedReserve: 2900, freeLiquidity: -19435, status: "CLEAN" },
  { capital: 100000, etfExecutedExposure: 138601, roundingErrorPct: 1.000, future: "MJY", futureQty: -4, futureNotional: 31542.50, futureDistortionPct: 0.00, modelMargin: 1900, modelFinancing: 40000, proposedReserve: 5800, freeLiquidity: -40501, status: "CLEAN" },
  { capital: 250000, etfExecutedExposure: 348381, roundingErrorPct: 0.462, future: "MJY (or 6J, equivalent)", futureQty: -10, futureNotional: 78856.25, futureDistortionPct: 0.00, modelMargin: 4750, modelFinancing: 100000, proposedReserve: 14500, freeLiquidity: -103131, status: "CLEAN" },
  { capital: 500000, etfExecutedExposure: 699011, roundingErrorPct: 0.141, future: "MJY (recommended)", futureQty: -20, futureNotional: 157712.50, futureDistortionPct: 0.00, modelMargin: 9500, modelFinancing: 200000, proposedReserve: 29000, freeLiquidity: -208511, status: "CLEAN" },
  { capital: 1000000, etfExecutedExposure: 1398722, roundingErrorPct: 0.091, future: "MJY (recommended)", futureQty: -40, futureNotional: 315425.00, futureDistortionPct: 0.00, modelMargin: 19000, modelFinancing: 400000, proposedReserve: 58000, freeLiquidity: -417722, status: "CLEAN" },
];

export const DEFAULT_TIER_CAPITAL = 25000;

export const FUTURES_OVERLAY = {
  purpose: "Systematic trend-following return/diversification overlay across 12 macro futures markets (managed futures). Not a currency hedge — the ETF sleeve carries no FX exposure to hedge.",
  activeMarket: "JPY (6J / MJY) — the only one of 12 defined markets currently active",
  mjyVs6j: "MJY dominates 6J on sizing precision at every capital tier tested, including $1,000,000. 6J only matches MJY's precision at exact $250,000 multiples. No blanket switch rule is implemented.",
};

export const FINANCING = {
  label: "MODEL FINANCING",
  mechanism: "Synthetic financing-cost proxy in the historical backtest (modeled as -40% BIL weight). BIL generates NO live order — proven via code (excluded from the tradable symbol list) and the mock execution report (zero BIL fills).",
  baseSpread: 1.5,
  stressSpread2x: 3.0,
  stressSpread3x: 5.0,
  realBrokerMechanism: "EXTERNAL_REQUIRED",
};

export const DATA_WARNINGS = [
  { label: "DATA PROVENANCE", value: "BLOCKED", detail: "Original vendor price files referenced in the data manifest are absent from the repository" },
  { label: "TOTAL RETURN", value: "UNKNOWN", detail: "No distributions/adjusted-close data in any canonical ETF series" },
  { label: "OOS OBSERVATIONS", value: "0", detail: "Genuine post-2026-08-01 daily observations — forward sample insufficient" },
  { label: "BROKER", value: "EXTERNAL_REQUIRED", detail: "No live IBKR session; 0/9 tradable instruments have a confirmed conId" },
  { label: "LIVE READY", value: "NO", detail: "Execution Spec remains PROPOSED, not canonical" },
];

export const SATELLITES_NOTE = "Core Invest has no satellite/seasonal sleeves outside the 8-ETF factor sleeve and the single active futures overlay market (JPY).";
