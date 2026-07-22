// Runtime-safe loader for capitalife performance JSONs.
//
// The raw JSONs live under `src/data/capitalife/` which is gitignored on
// purpose (Brain / raw-data policy). On Vercel Public Preview those files
// are absent, so a plain `import ... from "@/data/capitalife/*.json"` breaks
// the build with module-not-found.
//
// This module returns real data server-side when the JSON exists, and
// falls back to a structurally-valid empty skeleton otherwise. Client
// bundles never see the real data — they always resolve to the skeleton.

export type MonthlyReturnRow = {
  month: string;
  label: string;
  year: number;
  return_pct: number;
};

export type PerformanceMonthly = {
  meta: { source: string; period: string; basis: string };
  monthly_returns: MonthlyReturnRow[];
};

export type Account2Trade = {
  date: string;
  close_time: string;
  symbol: string;
  direction: string;
  gain_pct: number;
  cum_pct: number;
};

export type Account2Trades = {
  meta: {
    source: string;
    note: string;
    total_visible_trades: number;
    cum_pct_visible_trades: number;
    official_account2_return_pct: number;
    currency: string;
  };
  trades: Account2Trade[];
};

export type WhiteSwanCombinedEvidence = {
  meta: { title: string; period: string; caveat: string; sources: string[] };
  official_kpis: {
    account1_return_pct: number;
    account2_return_pct: number;
    combined_return_pct: number;
    compounded_return_pct: number;
    max_drawdown_pct: number;
    annualized_return_pct: number;
    sharpe: number;
    calmar: number;
    profit_factor: number;
    assets: number;
    sleeves: number;
    aum_eur: number;
  };
  account1_partial: {
    broker: string;
    account: string;
    currency: string;
    statement_period: string;
    total_closed_trades: number;
    closed_pl_eur: number;
  };
  account2_visible: {
    source: string;
    total_visible_trades: number;
    cum_pct_visible_only: number;
    note: string;
    symbols_traded: string[];
  };
  monthly_summary_account1_partial: Array<{
    month: string;
    closed_trades: number;
    profit_eur: number;
    note: string;
  }>;
  optimal_portfolio?: {
    label: string;
    frozen_at: string;
    weights: Array<{ strategy: string; weight_pct: number }>;
    oos_sharpe: number;
    cagr_pct: number;
    max_dd_pct: number;
    calmar: number;
    wf_folds_positive: number;
    wf_folds_total: number;
    mc_p5_sharpe: number;
    mc_loss_prob_5y_pct: number;
    note: string;
  };
};

export type WhiteSwanAnnualReturns = {
  meta: { source: string; period: string; caveat: string };
  annual_returns: Array<{ year: string; return_pct: number; note: string }>;
  summary_stats: {
    best_month_pct: number;
    worst_month_pct: number;
    positive_months: number;
    negative_months: number;
    total_months: number;
  };
  sleeves: Array<{
    name: string;
    cagr: number;
    maxdd: number;
    sharpe: number;
    positive_yrs_pct: number;
    entries: number;
    status: string;
  }>;
};

export type AnalyticsBacktestBlock = {
  performanceSeries: Array<{ date: string; value: number | null }>;
  drawdownSeries: Array<{ date: string; value: number | null }>;
  benchmarkSeries: Array<{ date: string; value: number | null }>;
  groupSeries?: Record<string, Array<{ date: string; value: number | null }>>;
  annualReturns: Array<{ year: string; value: number | null }>;
  monthlyReturns: Array<{ month: string; value: number | null }>;
  groupBars: Array<{ group: string; value: number }>;
  strategyBars: Array<{ strategy: string; group: string; value: number }>;
};

export type AnalyticsGenerated = {
  generatedAt: string;
  whiteSwanBacktest: AnalyticsBacktestBlock;
  investBacktest: AnalyticsBacktestBlock;
  combinedBacktest: AnalyticsBacktestBlock;
};

export type WsPortfolioEquityFile = {
  meta: {
    generated: string;
    is_start: string;
    oos_start: string;
    strategies: string[];
    weights: Record<string, number>;
    note?: string;
  };
  isOosSplit: string;
  equityCurve: Array<{ time: string; value: number }>;
  drawdownCurve?: Array<{ time: string; value: number }>;
  summary?: Record<string, number>;
  yearly?: Array<{ year: number; return: number }>;
};

export type FSPortfolioConfigJson = {
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
  weights: Record<string, number>;
  removed_from_core?: Record<
    string,
    { previous_weight: number; new_status: string; reason: string }
  >;
  white_swan: {
    name: string;
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

const EMPTY_BACKTEST: AnalyticsBacktestBlock = {
  performanceSeries: [],
  drawdownSeries: [],
  benchmarkSeries: [],
  groupSeries: {},
  annualReturns: [],
  monthlyReturns: [],
  groupBars: [],
  strategyBars: [],
};

const FALLBACK_PERFORMANCE_MONTHLY: PerformanceMonthly = {
  meta: { source: "public-preview", period: "unavailable", basis: "skeleton" },
  monthly_returns: [],
};

const FALLBACK_ACCOUNT2_TRADES: Account2Trades = {
  meta: {
    source: "public-preview",
    note: "no data in preview",
    total_visible_trades: 0,
    cum_pct_visible_trades: 0,
    official_account2_return_pct: 0,
    currency: "EUR",
  },
  trades: [],
};

const FALLBACK_COMBINED_EVIDENCE: WhiteSwanCombinedEvidence = {
  meta: { title: "public-preview", period: "unavailable", caveat: "skeleton", sources: [] },
  official_kpis: {
    account1_return_pct: 0,
    account2_return_pct: 0,
    combined_return_pct: 0,
    compounded_return_pct: 0,
    max_drawdown_pct: 0,
    annualized_return_pct: 0,
    sharpe: 0,
    calmar: 0,
    profit_factor: 0,
    assets: 0,
    sleeves: 0,
    aum_eur: 0,
  },
  account1_partial: {
    broker: "n/a",
    account: "n/a",
    currency: "EUR",
    statement_period: "n/a",
    total_closed_trades: 0,
    closed_pl_eur: 0,
  },
  account2_visible: {
    source: "n/a",
    total_visible_trades: 0,
    cum_pct_visible_only: 0,
    note: "no data in preview",
    symbols_traded: [],
  },
  monthly_summary_account1_partial: [],
};

const FALLBACK_ANNUAL_RETURNS: WhiteSwanAnnualReturns = {
  meta: { source: "public-preview", period: "unavailable", caveat: "skeleton" },
  annual_returns: [],
  summary_stats: {
    best_month_pct: 0,
    worst_month_pct: 0,
    positive_months: 0,
    negative_months: 0,
    total_months: 0,
  },
  sleeves: [],
};

const FALLBACK_ANALYTICS_GENERATED: AnalyticsGenerated = {
  generatedAt: "1970-01-01T00:00:00Z",
  whiteSwanBacktest: EMPTY_BACKTEST,
  investBacktest: EMPTY_BACKTEST,
  combinedBacktest: EMPTY_BACKTEST,
};

// Minimal but validation-passing config used when the real JSON is absent.
// Downstream `buildReadySnapshot` detects missing OHLC data via the manifest
// and returns a "not ready" snapshot, so this default never drives real math.
const FALLBACK_FSPORTFOLIO_CONFIG: FSPortfolioConfigJson = {
  portfolio_name: "FSPortfolio Preview Skeleton",
  version: "preview",
  status: "preview",
  currency: "USD",
  initial_capital: 100_000,
  rebalance_frequency: "quarterly",
  rebalance_months: [],
  rebalance_day: "last_trading_day",
  transaction_cost_bps: 0,
  tolerance_band_relative: 0,
  use_tolerance_band_for_live_orders: false,
  benchmark: "SPY",
  weights: { SPY: 0.275, SPMO: 0.275, QQQ: 0.15, GLD: 0.2, WHITE_SWAN_NAS_EMA: 0.1 },
  removed_from_core: {
    DBC: {
      previous_weight: 0.05,
      new_status: "research_optional",
      reason: "skeleton preview",
    },
  },
  white_swan: {
    name: "preview",
    research_symbol_reference: "n/a",
    implementation_instrument: "QQQ",
    max_portfolio_weight: 0.1,
    mode: "long_or_cash",
    cash_return: 0,
    use_trade_export_if_available: false,
    use_signal_script_if_available: false,
    if_no_signal_data: "treat_as_cash_and_warn",
  },
  required_ohlc_symbols: ["SPY", "SPMO", "QQQ", "GLD"],
  white_swan_required_data: [],
  optional_symbols: [],
  research_optional_symbols: ["DBC"],
  analysis_periods: {
    full_backtest: false,
    in_sample_end: "1970-01-01",
    out_of_sample_start: "1970-01-01",
    forward_start: "1970-01-01",
  },
  risk_rules: {
    no_shorts: true,
    no_options: true,
    no_portfolio_leverage: true,
    white_swan_sleeve_cap: 0.1,
    freeze_parameters_during_forward_test: true,
  },
  caveats: [],
};

// Server-side dynamic load.
//
// Vercel: files in src/data/capitalife/ are git-tracked and included in the
// Lambda bundle via outputFileTracingIncludes in next.config.ts.
// Local dev/build: CJS `require` is available server-side → real JSONs loaded.
// Client bundle: `typeof window !== "undefined"` guard → null → skeleton.
//
// `require` is referenced via `typeof` check so the bundler sees a variable
// access, not a static `require(...)` call, keeping JSON files out of the
// static module graph even when the file is imported by "use client" components.
function loadJsonFromDisk<T>(fileName: string): T | null {
  if (typeof window !== "undefined") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeRequire: NodeRequire | undefined =
      typeof require !== "undefined" ? require : undefined;
    if (!nodeRequire) return null;
    const fs = nodeRequire("node:fs") as typeof import("node:fs");
    const path = nodeRequire("node:path") as typeof import("node:path");
    const filePath = path.join(
      process.cwd(),
      "src",
      "data",
      "capitalife",
      fileName,
    );
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export const performanceMonthly: PerformanceMonthly =
  loadJsonFromDisk<PerformanceMonthly>("performance-monthly.json") ??
  FALLBACK_PERFORMANCE_MONTHLY;

export const account2Trades: Account2Trades =
  loadJsonFromDisk<Account2Trades>("account2-myfxbook-visible-trades.json") ??
  FALLBACK_ACCOUNT2_TRADES;

export const whiteSwanCombinedEvidence: WhiteSwanCombinedEvidence =
  loadJsonFromDisk<WhiteSwanCombinedEvidence>("white-swan-combined-evidence.json") ??
  FALLBACK_COMBINED_EVIDENCE;

export const whiteSwanAnnualReturns: WhiteSwanAnnualReturns =
  loadJsonFromDisk<WhiteSwanAnnualReturns>("white-swan-annual-returns.json") ??
  FALLBACK_ANNUAL_RETURNS;

export const analyticsGenerated: AnalyticsGenerated =
  loadJsonFromDisk<AnalyticsGenerated>("analytics-generated.json") ??
  FALLBACK_ANALYTICS_GENERATED;

export const fsportfolioConfigJson: FSPortfolioConfigJson =
  loadJsonFromDisk<FSPortfolioConfigJson>("fsportfolio-live-core.config.json") ??
  FALLBACK_FSPORTFOLIO_CONFIG;

function loadPublicJson<T>(relativePath: string): T | null {
  if (typeof window !== "undefined") return null;
  if (process.env.VERCEL) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeRequire: NodeRequire | undefined =
      typeof require !== "undefined" ? require : undefined;
    if (!nodeRequire) return null;
    const fs = nodeRequire("node:fs") as typeof import("node:fs");
    const path = nodeRequire("node:path") as typeof import("node:path");
    const filePath = path.join(process.cwd(), "public", relativePath);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export const wsPortfolioEquity: WsPortfolioEquityFile | null =
  loadPublicJson<WsPortfolioEquityFile>("data/whiteswan/portfolio_f10_equity.json");

// Typed bundle of all capitalife data — call server-side, pass as props to client components.
export type CapalifeData = {
  performanceMonthly: PerformanceMonthly;
  account2Trades: Account2Trades;
  whiteSwanCombinedEvidence: WhiteSwanCombinedEvidence;
  whiteSwanAnnualReturns: WhiteSwanAnnualReturns;
  analyticsGenerated: AnalyticsGenerated;
  wsPortfolioEquity: WsPortfolioEquityFile | null;
};

export function getCapalifeData(): CapalifeData {
  return {
    performanceMonthly,
    account2Trades,
    whiteSwanCombinedEvidence,
    whiteSwanAnnualReturns,
    analyticsGenerated,
    wsPortfolioEquity,
  };
}
