import { describe, it, expect } from "vitest";
import {
  WHITE_SWAN_COMPONENT_REGISTRY,
  validateComponentRegistry,
  computeGrossPnl,
  getCostPerExecution,
  getRoundtripCost,
  applyScenarioCost,
  loadYm1TatTrades,
  loadDax2hTrades,
  buildDailyActivity,
  aggregateDailyPnl,
  serializeDailyReturnsCsv,
  serializeActivityCsv,
  serializeAuditCsv,
  type FuturesTrade,
} from "./futures-backtest";

// ─── Registry invariants ───────────────────────────────────────────────────────

describe("WHITE_SWAN_COMPONENT_REGISTRY", () => {
  it("has exactly 17 components", () => {
    expect(WHITE_SWAN_COMPONENT_REGISTRY).toHaveLength(17);
  });

  it("has no duplicate strategyIds", () => {
    const ids = WHITE_SWAN_COMPONENT_REGISTRY.map((c) => c.strategyId);
    expect(new Set(ids).size).toBe(17);
  });

  it("weight sum is 100 (matching WHITE_SWAN_EXECUTION_TRUTH)", () => {
    const sum = WHITE_SWAN_COMPONENT_REGISTRY.reduce((s, c) => s + c.portfolioWeightPct, 0);
    expect(sum).toBe(100);
  });

  it("validateComponentRegistry does not throw", () => {
    expect(() => validateComponentRegistry()).not.toThrow();
  });

  it("FUTURES_REPLICATION_POSSIBLE strategies have dataSourceFile set", () => {
    const replicable = WHITE_SWAN_COMPONENT_REGISTRY.filter(
      (c) => c.dataStatus === "FUTURES_REPLICATION_POSSIBLE",
    );
    expect(replicable.length).toBeGreaterThan(0);
    for (const c of replicable) {
      expect(c.dataSourceFile).not.toBeNull();
      expect(c.simulationType).toBe("FUTURES_REPLICATION");
    }
  });

  it("NO_TRADE_DATA strategies have null dataSourceFile and NOT_COMPUTABLE", () => {
    const noData = WHITE_SWAN_COMPONENT_REGISTRY.filter(
      (c) => c.dataStatus === "NO_TRADE_DATA",
    );
    expect(noData.length).toBe(12); // 12 seasonal strategies
    for (const c of noData) {
      expect(c.dataSourceFile).toBeNull();
      expect(c.simulationType).toBe("NOT_COMPUTABLE");
    }
  });

  it("GLD Thursday Long has RESEARCH_ETF_ONLY status", () => {
    const gld = WHITE_SWAN_COMPONENT_REGISTRY.find((c) => c.strategyId === "FP10_GLD_THURSDAY_LONG")!;
    expect(gld).toBeDefined();
    expect(gld.dataStatus).toBe("RESEARCH_ETF_ONLY");
    expect(gld.simulationType).toBe("RESEARCH_BACKTEST");
  });

  it("all multipliers are positive", () => {
    for (const c of WHITE_SWAN_COMPONENT_REGISTRY) {
      expect(c.multiplier).toBeGreaterThan(0);
    }
  });

  it("all portfolioWeightPct are positive integers", () => {
    for (const c of WHITE_SWAN_COMPONENT_REGISTRY) {
      expect(c.portfolioWeightPct).toBeGreaterThan(0);
      expect(Number.isInteger(c.portfolioWeightPct)).toBe(true);
    }
  });
});

// ─── P&L formula invariants ───────────────────────────────────────────────────

describe("computeGrossPnl", () => {
  it("LONG: positive when exit > entry", () => {
    expect(computeGrossPnl("LONG", 10000, 10100, 1)).toBeCloseTo(100, 4);
  });

  it("LONG: negative when exit < entry", () => {
    expect(computeGrossPnl("LONG", 10000, 9900, 1)).toBeCloseTo(-100, 4);
  });

  it("SHORT: positive when exit < entry", () => {
    expect(computeGrossPnl("SHORT", 10000, 9900, 1)).toBeCloseTo(100, 4);
  });

  it("SHORT: negative when exit > entry", () => {
    expect(computeGrossPnl("SHORT", 10000, 10100, 1)).toBeCloseTo(-100, 4);
  });

  it("MYM multiplier 0.5: 100 point move = 50 USD", () => {
    expect(computeGrossPnl("LONG", 30000, 30100, 0.5)).toBeCloseTo(50, 4);
  });

  it("FDXS multiplier 1: 100 point move = 100 EUR", () => {
    expect(computeGrossPnl("LONG", 15000, 15100, 1)).toBeCloseTo(100, 4);
  });

  it("throws on non-finite multiplier", () => {
    expect(() => computeGrossPnl("LONG", 100, 200, NaN)).toThrow();
  });

  it("throws on zero multiplier", () => {
    expect(() => computeGrossPnl("LONG", 100, 200, 0)).toThrow();
  });

  it("zero move = zero P&L", () => {
    expect(computeGrossPnl("LONG", 15000, 15000, 1)).toBe(0);
  });
});

// ─── Cost model ───────────────────────────────────────────────────────────────

describe("cost model", () => {
  it("ZERO scenario: costPerExecution = 0", () => {
    expect(getCostPerExecution("ZERO")).toBe(0);
  });

  it("INNO_EUR_085 scenario: costPerExecution = 0.85", () => {
    expect(getCostPerExecution("INNO_EUR_085")).toBe(0.85);
  });

  it("INNO_USD_095 scenario: costPerExecution = 0.95", () => {
    expect(getCostPerExecution("INNO_USD_095")).toBe(0.95);
  });

  it("roundtrip = 2× per-execution cost", () => {
    expect(getRoundtripCost("INNO_EUR_085")).toBeCloseTo(1.70, 6);
    expect(getRoundtripCost("INNO_USD_095")).toBeCloseTo(1.90, 6);
  });

  it("applyScenarioCost: netPnl = grossPnl - roundtripCost", () => {
    const trade: FuturesTrade = {
      strategyId: "test",
      entryDate: "2010-01-04",
      exitDate: "2010-01-05",
      direction: "LONG",
      contracts: 1,
      entryPrice: 10000,
      exitPrice: 10100,
      multiplier: 1,
      currency: "EUR",
      grossPnl: 100,
    };
    const withCost = applyScenarioCost(trade, "INNO_EUR_085");
    expect(withCost.executionCount).toBe(2);
    expect(withCost.costPerExecution).toBe(0.85);
    expect(withCost.totalCost).toBeCloseTo(1.70, 6);
    expect(withCost.netPnl).toBeCloseTo(98.30, 4);
  });

  it("ZERO scenario: netPnl = grossPnl", () => {
    const trade: FuturesTrade = {
      strategyId: "test",
      entryDate: "2010-01-04",
      exitDate: "2010-01-05",
      direction: "LONG",
      contracts: 1,
      entryPrice: 10000,
      exitPrice: 10050,
      multiplier: 0.5,
      currency: "USD",
      grossPnl: 25,
    };
    const withCost = applyScenarioCost(trade, "ZERO");
    expect(withCost.netPnl).toBe(25);
    expect(withCost.totalCost).toBe(0);
  });
});

// ─── YM1 TAT loader ───────────────────────────────────────────────────────────

const YM1_SAMPLE = [
  { entry_time: "2008-01-15", exit_time: "2008-02-01", entry_price: 12500, exit_price: 12800, pnl: 9999, exit_type: "TP", year: 2008 },
  { entry_time: "2008-03-01", exit_time: "2008-03-20", entry_price: 12200, exit_price: 12000, pnl: 9999, exit_type: "SL", year: 2008 },
  { entry_time: "2007-01-01", exit_time: "2007-06-01", entry_price: 11000, exit_price: 11500, pnl: 9999, exit_type: "TP", year: 2007 },
];

describe("loadYm1TatTrades", () => {
  it("computes P&L as (exit-entry)*0.5 — ignores existing pnl field", () => {
    const trades = loadYm1TatTrades(YM1_SAMPLE);
    expect(trades[0]!.grossPnl).toBeCloseTo((12800 - 12500) * 0.5, 4);
    expect(trades[0]!.grossPnl).not.toBe(9999);
  });

  it("filters trades before fromDate", () => {
    const trades = loadYm1TatTrades(YM1_SAMPLE, "2008-01-01");
    const strategyIds = trades.map((t) => t.entryDate);
    expect(strategyIds).not.toContain("2007-01-01");
  });

  it("all trades are LONG with 1 contract", () => {
    const trades = loadYm1TatTrades(YM1_SAMPLE);
    for (const t of trades) {
      expect(t.direction).toBe("LONG");
      expect(t.contracts).toBe(1);
    }
  });

  it("loss trade: negative P&L", () => {
    const trades = loadYm1TatTrades(YM1_SAMPLE);
    const loser = trades.find((t) => t.entryPrice > t.exitPrice)!;
    expect(loser.grossPnl).toBeLessThan(0);
  });

  it("currency is USD, multiplier is 0.5", () => {
    const trades = loadYm1TatTrades(YM1_SAMPLE);
    for (const t of trades) {
      expect(t.currency).toBe("USD");
      expect(t.multiplier).toBe(0.5);
    }
  });
});

// ─── DAX 2H loader ───────────────────────────────────────────────────────────

const DAX_SAMPLE = [
  { id: "d1", entryTimestamp: "2008-01-15T09:00:00", exitTimestamp: "2008-01-16T11:00:00", entryPrice: 7800, exitPrice: 8000, direction: "LONG" as const, atr: 100, stopPrice: 7700, grossR: 2.0 },
  { id: "d2", entryTimestamp: "2008-02-01T09:00:00", exitTimestamp: "2008-02-03T11:00:00", entryPrice: 8100, exitPrice: 8000, direction: "SHORT" as const, atr: 80, stopPrice: 8200, grossR: 1.0 },
  { id: "d3", entryTimestamp: "2007-12-01T09:00:00", exitTimestamp: "2007-12-15T11:00:00", entryPrice: 7700, exitPrice: 7900, direction: "LONG" as const, atr: 90, stopPrice: 7600, grossR: 2.0 },
];

describe("loadDax2hTrades", () => {
  it("LONG P&L = (exit-entry)*1 EUR", () => {
    const trades = loadDax2hTrades(DAX_SAMPLE);
    const long = trades.find((t) => t.direction === "LONG")!;
    expect(long.grossPnl).toBeCloseTo((8000 - 7800) * 1, 4);
  });

  it("SHORT P&L = (entry-exit)*1 EUR", () => {
    const trades = loadDax2hTrades(DAX_SAMPLE);
    const short = trades.find((t) => t.direction === "SHORT")!;
    expect(short.grossPnl).toBeCloseTo((8100 - 8000) * 1, 4);
  });

  it("filters trades before fromDate", () => {
    const trades = loadDax2hTrades(DAX_SAMPLE, "2008-01-01");
    expect(trades).toHaveLength(2);
    expect(trades.every((t) => t.entryDate >= "2008-01-01")).toBe(true);
  });

  it("currency is EUR, multiplier is 1", () => {
    const trades = loadDax2hTrades(DAX_SAMPLE);
    for (const t of trades) {
      expect(t.currency).toBe("EUR");
      expect(t.multiplier).toBe(1);
    }
  });

  it("contracts is always 1", () => {
    const trades = loadDax2hTrades(DAX_SAMPLE);
    for (const t of trades) {
      expect(t.contracts).toBe(1);
    }
  });
});

// ─── Daily activity and aggregation ──────────────────────────────────────────

describe("buildDailyActivity", () => {
  const trades: FuturesTrade[] = [
    { strategyId: "FP10_YM1_TAT", entryDate: "2010-01-04", exitDate: "2010-01-05", direction: "LONG", contracts: 1, entryPrice: 10000, exitPrice: 10100, multiplier: 0.5, currency: "USD", grossPnl: 50 },
    { strategyId: "trend_momentum_dax_2h_de30eur_2h", entryDate: "2010-01-04", exitDate: "2010-01-05", direction: "SHORT", contracts: 1, entryPrice: 7000, exitPrice: 6900, multiplier: 1, currency: "EUR", grossPnl: 100 },
  ];

  it("activity row count equals trade count", () => {
    expect(buildDailyActivity(trades)).toHaveLength(2);
  });

  it("netPnlScenarioA = grossPnl (zero cost)", () => {
    const activity = buildDailyActivity(trades);
    for (const row of activity) {
      expect(row.netPnlScenarioA).toBe(row.grossPnl);
    }
  });

  it("netPnlScenarioB < grossPnl (has cost)", () => {
    const activity = buildDailyActivity(trades);
    for (const row of activity) {
      expect(row.netPnlScenarioB).toBeLessThan(row.grossPnl);
    }
  });

  it("executionCount is always 2", () => {
    const activity = buildDailyActivity(trades);
    for (const row of activity) {
      expect(row.executionCount).toBe(2);
    }
  });
});

describe("aggregateDailyPnl", () => {
  it("separates USD and EUR P&L", () => {
    const trades: FuturesTrade[] = [
      { strategyId: "FP10_YM1_TAT", entryDate: "2010-01-04", exitDate: "2010-01-05", direction: "LONG", contracts: 1, entryPrice: 10000, exitPrice: 10100, multiplier: 0.5, currency: "USD", grossPnl: 50 },
      { strategyId: "trend_momentum_dax_2h_de30eur_2h", entryDate: "2010-01-04", exitDate: "2010-01-05", direction: "SHORT", contracts: 1, entryPrice: 7000, exitPrice: 6900, multiplier: 1, currency: "EUR", grossPnl: 100 },
    ];
    const activity = buildDailyActivity(trades);
    const daily = aggregateDailyPnl(activity);
    expect(daily).toHaveLength(1);
    const day = daily[0]!;
    expect(day.grossPnlUsd).toBeCloseTo(50, 4);
    expect(day.grossPnlEur).toBeCloseTo(100, 4);
  });

  it("two trades on same date same currency are summed", () => {
    const trades: FuturesTrade[] = [
      { strategyId: "FP10_YM1_TAT", entryDate: "2010-01-04", exitDate: "2010-01-05", direction: "LONG", contracts: 1, entryPrice: 10000, exitPrice: 10100, multiplier: 0.5, currency: "USD", grossPnl: 50 },
      { strategyId: "FP10_YM1_TAT", entryDate: "2010-01-03", exitDate: "2010-01-05", direction: "LONG", contracts: 1, entryPrice: 9900, exitPrice: 10100, multiplier: 0.5, currency: "USD", grossPnl: 100 },
    ];
    const activity = buildDailyActivity(trades);
    const daily = aggregateDailyPnl(activity);
    expect(daily).toHaveLength(1);
    expect(daily[0]!.grossPnlUsd).toBeCloseTo(150, 4);
  });

  it("result is sorted ascending by date", () => {
    const trades: FuturesTrade[] = [
      { strategyId: "FP10_YM1_TAT", entryDate: "2010-01-10", exitDate: "2010-01-15", direction: "LONG", contracts: 1, entryPrice: 10000, exitPrice: 10100, multiplier: 0.5, currency: "USD", grossPnl: 50 },
      { strategyId: "FP10_YM1_TAT", entryDate: "2010-01-04", exitDate: "2010-01-05", direction: "LONG", contracts: 1, entryPrice: 10000, exitPrice: 10100, multiplier: 0.5, currency: "USD", grossPnl: 50 },
    ];
    const activity = buildDailyActivity(trades);
    const daily = aggregateDailyPnl(activity);
    expect(daily[0]!.date < daily[1]!.date).toBe(true);
  });
});

// ─── CSV serializers ──────────────────────────────────────────────────────────

describe("CSV serializers", () => {
  it("serializeDailyReturnsCsv has correct header", () => {
    const csv = serializeDailyReturnsCsv([]);
    expect(csv).toContain("Date,Gross_PnL_USD,Gross_PnL_EUR");
  });

  it("serializeActivityCsv has correct header", () => {
    const csv = serializeActivityCsv([]);
    expect(csv).toContain("Date,Strategy_ID,Future,Direction");
  });

  it("serializeAuditCsv has 17 data rows (one per component)", () => {
    const csv = serializeAuditCsv(WHITE_SWAN_COMPONENT_REGISTRY);
    const rows = csv.split("\n");
    expect(rows).toHaveLength(18); // header + 17 data rows
  });

  it("serializeAuditCsv contains all strategyIds", () => {
    const csv = serializeAuditCsv(WHITE_SWAN_COMPONENT_REGISTRY);
    for (const c of WHITE_SWAN_COMPONENT_REGISTRY) {
      expect(csv).toContain(c.strategyId);
    }
  });
});
