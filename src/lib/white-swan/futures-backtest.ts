/**
 * White Swan Futures Backtest Engine
 * ───────────────────────────────────
 * Canonical 1-contract-per-signal simulation.
 * No fractional contracts. No invented data. No synthetic returns.
 *
 * Data availability as of 2026-08:
 *   FUTURES_REPLICATION_POSSIBLE  – DAX 2H (FDXS), YM1 TAT (MYM)
 *   RESEARCH_ETF_ONLY             – GLD Thursday Long (GLD ETF prices ≠ gold futures oz)
 *   NO_FULL_BACKTEST              – EURUSD 30M (2026 only), DAX 1H (2025-2026 only)
 *   NO_TRADE_DATA                 – 12 seasonal strategies (no individual trade files in repo)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type DataStatus =
  | "FUTURES_REPLICATION_POSSIBLE"
  | "RESEARCH_ETF_ONLY"
  | "NO_FULL_BACKTEST"
  | "NO_TRADE_DATA";

export type SimulationType =
  | "FUTURES_REPLICATION"
  | "RESEARCH_BACKTEST"
  | "NOT_COMPUTABLE";

export type CostScenario = "ZERO" | "INNO_EUR_085" | "INNO_USD_095";

export type ContractCurrency = "USD" | "EUR";

export type ComponentDefinition = {
  strategyId: string;
  label: string;
  ibkrSymbol: string;
  exchange: string;
  multiplier: number;
  currency: ContractCurrency;
  portfolioWeightPct: number;
  dataStatus: DataStatus;
  simulationType: SimulationType;
  dataSourceFile: string | null;
  backtestStartDate: string | null;
  backtestEndDate: string | null;
  notes: string;
};

/** A single completed futures trade — always exactly 1 contract. */
export type FuturesTrade = {
  strategyId: string;
  entryDate: string; // YYYY-MM-DD
  exitDate: string;  // YYYY-MM-DD
  direction: "LONG" | "SHORT";
  contracts: 1;
  entryPrice: number;
  exitPrice: number;
  multiplier: number;
  currency: ContractCurrency;
  grossPnl: number;
};

export type TradeWithCost = FuturesTrade & {
  executionCount: 2;
  costPerExecution: number;
  totalCost: number;
  netPnl: number;
  scenario: CostScenario;
};

export type DailyActivityRow = {
  date: string;
  strategyId: string;
  ibkrSymbol: string;
  direction: "LONG" | "SHORT";
  contracts: 1;
  entryExit: "EXIT"; // daily P&L attributed at exit date
  executionCount: 2;
  grossPnl: number;
  costScenarioA: number;
  costScenarioB: number;
  costScenarioC: number;
  netPnlScenarioA: number;
  netPnlScenarioB: number;
  netPnlScenarioC: number;
  currency: ContractCurrency;
};

export type WhiteSwanDailyPnl = {
  date: string;
  grossPnlUsd: number;
  grossPnlEur: number;
  netPnlScenarioAUsd: number;
  netPnlScenarioAEur: number;
  netPnlScenarioBUsd: number;
  netPnlScenarioBEur: number;
  netPnlScenarioCUsd: number;
  netPnlScenarioCEur: number;
};

export type BacktestResult = {
  componentId: string;
  tradeCount: number;
  executionCount: number;
  grossPnl: number;
  currency: ContractCurrency;
  netPnlScenarioA: number;
  netPnlScenarioB: number;
  netPnlScenarioC: number;
  startDate: string;
  endDate: string;
};

// ─── Component Registry ───────────────────────────────────────────────────────

export const WHITE_SWAN_COMPONENT_REGISTRY: ComponentDefinition[] = [
  {
    strategyId: "eurusd_mt_30m_eurusd_30m",
    label: "EURUSD 30M",
    ibkrSymbol: "M6E",
    exchange: "CME",
    multiplier: 12500,
    currency: "USD",
    portfolioWeightPct: 14,
    dataStatus: "NO_FULL_BACKTEST",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: "CME_6E1_30M_events.json",
    backtestStartDate: "2026-03-18",
    backtestEndDate: null,
    notes: "Monitoring-only (2026). No historical backtest file in repo. M6E multiplier=12500 EUR/USD per contract.",
  },
  {
    strategyId: "mt_dax_1h_de30eur_1h",
    label: "DAX 1H",
    ibkrSymbol: "FDXS",
    exchange: "EUREX",
    multiplier: 1,
    currency: "EUR",
    portfolioWeightPct: 14,
    dataStatus: "NO_FULL_BACKTEST",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: "EUREX_FDAX1_1H_events.json",
    backtestStartDate: "2025-09-26",
    backtestEndDate: null,
    notes: "Monitoring-only (2025-2026). No historical backtest file in repo. FDXS = 1 EUR per DAX index point.",
  },
  {
    strategyId: "FP10_GLD_THURSDAY_LONG",
    label: "GLD Thursday Long",
    ibkrSymbol: "1OZ",
    exchange: "COMEX",
    multiplier: 1,
    currency: "USD",
    portfolioWeightPct: 10,
    dataStatus: "RESEARCH_ETF_ONLY",
    simulationType: "RESEARCH_BACKTEST",
    dataSourceFile: "gld_thursday_long.json",
    backtestStartDate: "2004-11-18",
    backtestEndDate: "2026-07-06",
    notes: "Trade file uses GLD ETF prices (~$40-300/share). 1OZ futures price is gold oz price (~$430-3200/oz). ETF ≠ futures price. Conversion requires gold oz price series not in repo. FUTURES_REPLICATION: NOT_COMPUTABLE.",
  },
  {
    strategyId: "FP10_YM1_TAT",
    label: "Dow Jones TAT",
    ibkrSymbol: "MYM",
    exchange: "CBOT",
    multiplier: 0.5,
    currency: "USD",
    portfolioWeightPct: 10,
    dataStatus: "FUTURES_REPLICATION_POSSIBLE",
    simulationType: "FUTURES_REPLICATION",
    dataSourceFile: "ym1_tat.json",
    backtestStartDate: "2002-04-09",
    backtestEndDate: "2026-06-10",
    notes: "Long-only. YM1! prices (Dow index level). MYM multiplier = 0.5 USD/point. P&L = (exit-entry)*0.5. Existing pnl field uses dynamic sizing — ignored. 1-contract simulation computed from prices.",
  },
  {
    strategyId: "trend_momentum_dax_2h_de30eur_2h",
    label: "DAX 2H",
    ibkrSymbol: "FDXS",
    exchange: "EUREX",
    multiplier: 1,
    currency: "EUR",
    portfolioWeightPct: 8,
    dataStatus: "FUTURES_REPLICATION_POSSIBLE",
    simulationType: "FUTURES_REPLICATION",
    dataSourceFile: "EUREX_FDAX1_2H_events_clean.json",
    backtestStartDate: "2007-03-15",
    backtestEndDate: "2026-07-10",
    notes: "FDXS = 1 EUR/point. Has direction (LONG/SHORT). P&L = (exit-entry)*1 EUR. grossR*stopDist cross-verified identical. 3354 trades.",
  },
  {
    strategyId: "spy_sea",
    label: "SPY Seasonal",
    ibkrSymbol: "MES",
    exchange: "CME",
    multiplier: 5,
    currency: "USD",
    portfolioWeightPct: 5,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file in repo. MES multiplier=5 USD/point. Futures replication requires per-trade entry/exit prices.",
  },
  {
    strategyId: "zm1_sea",
    label: "Soybean Meal Seasonal",
    ibkrSymbol: "MZM",
    exchange: "CBOT",
    multiplier: 10,
    currency: "USD",
    portfolioWeightPct: 5,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file. MZM multiplier=10 USD per ton (100-ton contract).",
  },
  {
    strategyId: "sb1_sea_l",
    label: "Sugar Seasonal",
    ibkrSymbol: "SB",
    exchange: "ICEUS",
    multiplier: 112000,
    currency: "USD",
    portfolioWeightPct: 4,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file. SB = full Sugar No.11, 112,000 lbs, multiplier=112000. No micro available.",
  },
  {
    strategyId: "eem_sea",
    label: "EEM Seasonal (MSCI EM)",
    ibkrSymbol: "MME",
    exchange: "ICEUS",
    multiplier: 50,
    currency: "USD",
    portfolioWeightPct: 4,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file. Signal: EEM ETF → Execution: MME (MSCI EM futures, 50 USD/index point).",
  },
  {
    strategyId: "hg1_sea",
    label: "Copper Seasonal",
    ibkrSymbol: "MHG",
    exchange: "COMEX",
    multiplier: 2500,
    currency: "USD",
    portfolioWeightPct: 4,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file. MHG multiplier=2500 lbs. Copper price in USD/lb.",
  },
  {
    strategyId: "gc1_sea",
    label: "Gold Seasonal",
    ibkrSymbol: "1OZ",
    exchange: "COMEX",
    multiplier: 1,
    currency: "USD",
    portfolioWeightPct: 4,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file for gc1_sea seasonal. Note: gc1_friday_long.json is a separate WATCH strategy, not this canonical component.",
  },
  {
    strategyId: "cl1_sea",
    label: "Crude Oil Seasonal",
    ibkrSymbol: "MCL",
    exchange: "NYMEX",
    multiplier: 100,
    currency: "USD",
    portfolioWeightPct: 3,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file. MCL = Micro WTI, 100 barrels, multiplier=100.",
  },
  {
    strategyId: "zc1_sea",
    label: "Corn Seasonal",
    ibkrSymbol: "MZC",
    exchange: "CBOT",
    multiplier: 500,
    currency: "USD",
    portfolioWeightPct: 3,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file. MZC multiplier=500 bushels (1/10 of standard 5000-bu contract).",
  },
  {
    strategyId: "zw1_sea",
    label: "Wheat Seasonal",
    ibkrSymbol: "MZW",
    exchange: "CBOT",
    multiplier: 500,
    currency: "USD",
    portfolioWeightPct: 3,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file. MZW multiplier=500 bushels.",
  },
  {
    strategyId: "zs1_sea",
    label: "Soybeans Seasonal",
    ibkrSymbol: "MZS",
    exchange: "CBOT",
    multiplier: 500,
    currency: "USD",
    portfolioWeightPct: 3,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file. MZS multiplier=500 bushels.",
  },
  {
    strategyId: "cc1_sea",
    label: "Cocoa Seasonal",
    ibkrSymbol: "CC",
    exchange: "ICEUS",
    multiplier: 10,
    currency: "USD",
    portfolioWeightPct: 3,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file. CC = full Cocoa contract, 10 metric tons, multiplier=10. No faithful micro available.",
  },
  {
    strategyId: "iwm_sea",
    label: "IWM Seasonal",
    ibkrSymbol: "M2K",
    exchange: "CME",
    multiplier: 5,
    currency: "USD",
    portfolioWeightPct: 3,
    dataStatus: "NO_TRADE_DATA",
    simulationType: "NOT_COMPUTABLE",
    dataSourceFile: null,
    backtestStartDate: null,
    backtestEndDate: null,
    notes: "No individual trade file. Signal: IWM ETF → Execution: M2K (Micro E-mini Russell 2000, 5 USD/point).",
  },
];

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateComponentRegistry() {
  const ids = WHITE_SWAN_COMPONENT_REGISTRY.map((c) => c.strategyId);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate strategyId in registry");
  if (ids.length !== 17) throw new Error(`Expected 17 components, got ${ids.length}`);
  const weightSum = WHITE_SWAN_COMPONENT_REGISTRY.reduce((s, c) => s + c.portfolioWeightPct, 0);
  if (weightSum !== 100) throw new Error(`Weight sum is ${weightSum}, expected 100 (WHITE_SWAN_EXECUTION_TRUTH sum)`);
}

// ─── Cost Model ───────────────────────────────────────────────────────────────

/**
 * Returns cost per single execution event (entry OR exit, not roundtrip).
 * Currency matches contract currency for simplicity; USD/EUR mixed noted where needed.
 */
export function getCostPerExecution(scenario: CostScenario): number {
  if (scenario === "ZERO") return 0;
  if (scenario === "INNO_EUR_085") return 0.85; // EUR per execution event
  if (scenario === "INNO_USD_095") return 0.95; // USD per execution event
  return 0;
}

/** 1 completed trade = entry + exit = 2 execution events. */
export function getRoundtripCost(scenario: CostScenario): number {
  return getCostPerExecution(scenario) * 2;
}

// ─── P&L Calculator ───────────────────────────────────────────────────────────

/**
 * Compute gross P&L for a single 1-contract futures trade.
 * Long:  (exitPrice - entryPrice) × multiplier × 1
 * Short: (entryPrice - exitPrice) × multiplier × 1
 * No fractional contracts. Result is in contract's native currency.
 */
export function computeGrossPnl(
  direction: "LONG" | "SHORT",
  entryPrice: number,
  exitPrice: number,
  multiplier: number,
): number {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || !Number.isFinite(multiplier)) {
    throw new Error(`computeGrossPnl: non-finite inputs (entry=${entryPrice} exit=${exitPrice} mult=${multiplier})`);
  }
  if (multiplier <= 0) throw new Error(`computeGrossPnl: multiplier must be > 0, got ${multiplier}`);
  const raw = direction === "LONG"
    ? (exitPrice - entryPrice) * multiplier
    : (entryPrice - exitPrice) * multiplier;
  return Number(raw.toFixed(6));
}

export function applyScenarioCost(trade: FuturesTrade, scenario: CostScenario): TradeWithCost {
  const costPerExecution = getCostPerExecution(scenario);
  const totalCost = costPerExecution * 2; // entry + exit
  return {
    ...trade,
    executionCount: 2,
    costPerExecution,
    totalCost,
    netPnl: Number((trade.grossPnl - totalCost).toFixed(6)),
    scenario,
  };
}

// ─── Data Loaders ─────────────────────────────────────────────────────────────

type Ym1RawTrade = {
  entry_time: string;
  exit_time: string;
  entry_price: number;
  exit_price: number;
  pnl: number;
  exit_type: string;
  year: number;
};

type Dax2hRawTrade = {
  id: string;
  entryTimestamp: string;
  exitTimestamp: string;
  entryPrice: number;
  exitPrice: number;
  direction: "LONG" | "SHORT";
  atr: number;
  stopPrice: number;
  grossR: number;
};

/**
 * Load YM1 TAT trades for 1 MYM contract simulation.
 * Direction: LONG only (strategy design — no direction field in source file).
 * P&L = (exit_price - entry_price) × 0.5 USD.
 * Existing pnl field in source file uses dynamic sizing — ignored.
 */
export function loadYm1TatTrades(
  rawTrades: Ym1RawTrade[],
  fromDate = "2008-01-01",
): FuturesTrade[] {
  const result: FuturesTrade[] = [];
  for (const t of rawTrades) {
    if (!t.entry_time || !t.exit_time) continue;
    if (t.exit_time < fromDate) continue;
    if (t.entry_time < fromDate) continue;
    if (!Number.isFinite(t.entry_price) || !Number.isFinite(t.exit_price)) continue;
    if (t.entry_price <= 0 || t.exit_price <= 0) continue;
    const grossPnl = computeGrossPnl("LONG", t.entry_price, t.exit_price, 0.5);
    result.push({
      strategyId: "FP10_YM1_TAT",
      entryDate: t.entry_time.slice(0, 10),
      exitDate: t.exit_time.slice(0, 10),
      direction: "LONG",
      contracts: 1,
      entryPrice: t.entry_price,
      exitPrice: t.exit_price,
      multiplier: 0.5,
      currency: "USD",
      grossPnl,
    });
  }
  return result;
}

/**
 * Load DAX 2H trades for 1 FDXS contract simulation.
 * Has LONG and SHORT directions.
 * P&L = (exitPrice - entryPrice) × 1 EUR for LONG; reversed for SHORT.
 * Cross-verified: equals grossR × |entry - stop| × 1 EUR.
 */
export function loadDax2hTrades(
  rawTrades: Dax2hRawTrade[],
  fromDate = "2008-01-01",
): FuturesTrade[] {
  const result: FuturesTrade[] = [];
  for (const t of rawTrades) {
    if (!t.entryTimestamp || !t.exitTimestamp) continue;
    const entryDate = t.entryTimestamp.slice(0, 10);
    const exitDate = t.exitTimestamp.slice(0, 10);
    if (entryDate < fromDate) continue;
    if (!Number.isFinite(t.entryPrice) || !Number.isFinite(t.exitPrice)) continue;
    if (!["LONG", "SHORT"].includes(t.direction)) continue;
    const grossPnl = computeGrossPnl(t.direction, t.entryPrice, t.exitPrice, 1);
    result.push({
      strategyId: "trend_momentum_dax_2h_de30eur_2h",
      entryDate,
      exitDate,
      direction: t.direction,
      contracts: 1,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      multiplier: 1,
      currency: "EUR",
      grossPnl,
    });
  }
  return result;
}

// ─── Daily Aggregation ────────────────────────────────────────────────────────

/** P&L attributed to exitDate (trade is closed = P&L realized). */
export function buildDailyActivity(trades: FuturesTrade[]): DailyActivityRow[] {
  return trades.map((t) => {
    const costA = getRoundtripCost("ZERO");
    const costB = getRoundtripCost("INNO_EUR_085");
    const costC = getRoundtripCost("INNO_USD_095");
    return {
      date: t.exitDate,
      strategyId: t.strategyId,
      ibkrSymbol:
        t.strategyId === "FP10_YM1_TAT" ? "MYM" : "FDXS",
      direction: t.direction,
      contracts: 1,
      entryExit: "EXIT",
      executionCount: 2,
      grossPnl: t.grossPnl,
      costScenarioA: costA,
      costScenarioB: costB,
      costScenarioC: costC,
      netPnlScenarioA: Number((t.grossPnl - costA).toFixed(6)),
      netPnlScenarioB: Number((t.grossPnl - costB).toFixed(6)),
      netPnlScenarioC: Number((t.grossPnl - costC).toFixed(6)),
      currency: t.currency,
    };
  });
}

/** Aggregate daily P&L by date, split by USD and EUR. */
export function aggregateDailyPnl(activity: DailyActivityRow[]): WhiteSwanDailyPnl[] {
  const byDate = new Map<string, WhiteSwanDailyPnl>();
  const zero: WhiteSwanDailyPnl = {
    date: "",
    grossPnlUsd: 0, grossPnlEur: 0,
    netPnlScenarioAUsd: 0, netPnlScenarioAEur: 0,
    netPnlScenarioBUsd: 0, netPnlScenarioBEur: 0,
    netPnlScenarioCUsd: 0, netPnlScenarioCEur: 0,
  };

  for (const row of activity) {
    if (!byDate.has(row.date)) byDate.set(row.date, { ...zero, date: row.date });
    const day = byDate.get(row.date)!;
    if (row.currency === "USD") {
      day.grossPnlUsd += row.grossPnl;
      day.netPnlScenarioAUsd += row.netPnlScenarioA;
      day.netPnlScenarioBUsd += row.netPnlScenarioB;
      day.netPnlScenarioCUsd += row.netPnlScenarioC;
    } else {
      day.grossPnlEur += row.grossPnl;
      day.netPnlScenarioAEur += row.netPnlScenarioA;
      day.netPnlScenarioBEur += row.netPnlScenarioB;
      day.netPnlScenarioCEur += row.netPnlScenarioC;
    }
  }

  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      grossPnlUsd: Number(d.grossPnlUsd.toFixed(4)),
      grossPnlEur: Number(d.grossPnlEur.toFixed(4)),
      netPnlScenarioAUsd: Number(d.netPnlScenarioAUsd.toFixed(4)),
      netPnlScenarioAEur: Number(d.netPnlScenarioAEur.toFixed(4)),
      netPnlScenarioBUsd: Number(d.netPnlScenarioBUsd.toFixed(4)),
      netPnlScenarioBEur: Number(d.netPnlScenarioBEur.toFixed(4)),
      netPnlScenarioCUsd: Number(d.netPnlScenarioCUsd.toFixed(4)),
      netPnlScenarioCEur: Number(d.netPnlScenarioCEur.toFixed(4)),
    }));
}

// ─── Backtest Summary ─────────────────────────────────────────────────────────

export function computeBacktestResult(trades: FuturesTrade[]): BacktestResult | null {
  if (trades.length === 0) return null;
  const byStrategy = new Map<string, FuturesTrade[]>();
  for (const t of trades) {
    if (!byStrategy.has(t.strategyId)) byStrategy.set(t.strategyId, []);
    byStrategy.get(t.strategyId)!.push(t);
  }
  const results: BacktestResult[] = [];
  for (const [id, ts] of byStrategy) {
    const sorted = [...ts].sort((a, b) => a.exitDate.localeCompare(b.exitDate));
    const grossPnl = ts.reduce((s, t) => s + t.grossPnl, 0);
    results.push({
      componentId: id,
      tradeCount: ts.length,
      executionCount: ts.length * 2,
      grossPnl: Number(grossPnl.toFixed(4)),
      currency: ts[0]!.currency,
      netPnlScenarioA: Number(ts.reduce((s, t) => s + (t.grossPnl - getRoundtripCost("ZERO")), 0).toFixed(4)),
      netPnlScenarioB: Number(ts.reduce((s, t) => s + (t.grossPnl - getRoundtripCost("INNO_EUR_085")), 0).toFixed(4)),
      netPnlScenarioC: Number(ts.reduce((s, t) => s + (t.grossPnl - getRoundtripCost("INNO_USD_095")), 0).toFixed(4)),
      startDate: sorted[0]!.exitDate,
      endDate: sorted.at(-1)!.exitDate,
    });
  }
  return results[0] ?? null;
}

// ─── CSV Serializers ──────────────────────────────────────────────────────────

export function serializeDailyReturnsCsv(daily: WhiteSwanDailyPnl[]): string {
  const header = "Date,Gross_PnL_USD,Gross_PnL_EUR,Net_PnL_ScenarioA_USD,Net_PnL_ScenarioA_EUR,Net_PnL_ScenarioB_USD,Net_PnL_ScenarioB_EUR,Net_PnL_ScenarioC_USD,Net_PnL_ScenarioC_EUR";
  const rows = daily.map((d) =>
    [d.date, d.grossPnlUsd, d.grossPnlEur, d.netPnlScenarioAUsd, d.netPnlScenarioAEur, d.netPnlScenarioBUsd, d.netPnlScenarioBEur, d.netPnlScenarioCUsd, d.netPnlScenarioCEur].join(","),
  );
  return [header, ...rows].join("\n");
}

export function serializeActivityCsv(activity: DailyActivityRow[]): string {
  const header = "Date,Strategy_ID,Future,Direction,Contracts,Entry_Exit,Execution_Count,Gross_PnL,Cost_ScenA,Cost_ScenB,Cost_ScenC,Net_PnL_ScenA,Net_PnL_ScenB,Net_PnL_ScenC,Currency";
  const rows = activity
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) =>
      [r.date, r.strategyId, r.ibkrSymbol, r.direction, r.contracts, r.entryExit, r.executionCount, r.grossPnl, r.costScenarioA, r.costScenarioB, r.costScenarioC, r.netPnlScenarioA, r.netPnlScenarioB, r.netPnlScenarioC, r.currency].join(","),
    );
  return [header, ...rows].join("\n");
}

export function serializeAuditCsv(components: ComponentDefinition[]): string {
  const header = "Strategy_ID,Label,IBKR_Symbol,Exchange,Multiplier,Currency,Weight_Pct,Data_Status,Simulation_Type,Data_Source,Backtest_Start,Backtest_End,Notes";
  const rows = components.map((c) =>
    [c.strategyId, c.label, c.ibkrSymbol, c.exchange, c.multiplier, c.currency, c.portfolioWeightPct, c.dataStatus, c.simulationType, c.dataSourceFile ?? "—", c.backtestStartDate ?? "—", c.backtestEndDate ?? "—", `"${c.notes.replace(/"/g, "'")}"`,].join(","),
  );
  return [header, ...rows].join("\n");
}
