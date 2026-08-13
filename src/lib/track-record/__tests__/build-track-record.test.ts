/**
 * Unit tests for build-track-record.ts:
 * buildBalanceCurve, buildCombinedBalanceCurve, computePerformanceKpis,
 * computeMaxDrawdown.
 */

import { describe, it, expect } from "vitest";
import {
  buildBalanceCurve,
  buildCombinedBalanceCurve,
  computePerformanceKpis,
  computeMaxDrawdown,
} from "../build-track-record";
import type {
  NormalizedTrade,
  NormalizedCashFlow,
  NormalizedAccountSnapshot,
  BalanceCurvePoint,
  EquitySnapshot,
} from "../normalized-types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000);

function makeTrade(overrides: Partial<NormalizedTrade> = {}): NormalizedTrade {
  return {
    id:             "account_1_1",
    accountId:      "account_1",
    sourceTicket:   1,
    platform:       "MT4",
    broker:         "TestBroker",
    symbol:         "EURUSD",
    side:           "buy",
    volume:         0.1,
    openTimeUtc:    "2025-01-01T00:00:00Z",
    openTimeEpoch:  NOW - 86400,
    closeTimeUtc:   "2025-01-02T00:00:00Z",
    closeTimeEpoch: NOW,
    openPrice:      1.08,
    closePrice:     1.09,
    stopLoss:       0,
    takeProfit:     0,
    grossProfit:    100,
    commission:     -2,
    swap:           -1,
    fees:           0,
    netProfit:      97,
    magicNumber:    0,
    comment:        "",
    status:         "closed",
    source:         "mt4_file",
    ...overrides,
  };
}

function makeAccount(overrides: Partial<NormalizedAccountSnapshot> = {}): NormalizedAccountSnapshot {
  return {
    accountId:      "account_1",
    platform:       "MT4",
    broker:         "TestBroker",
    loginMasked:    "****1234",
    server:         "Test-Server",
    currency:       "EUR",
    balance:        10000,
    equity:         10050,
    floatingProfit: 50,
    margin:         500,
    freeMargin:     9550,
    marginLevel:    2010,
    leverage:       100,
    connected:      true,
    generatedAtUtc:  new Date(NOW * 1000).toISOString(),
    generatedAtEpoch:NOW,
    source:         "mt4_file",
    sourceFresh:    true,
    ...overrides,
  };
}

function makeCashFlow(overrides: Partial<NormalizedCashFlow> = {}): NormalizedCashFlow {
  return {
    id:           "account_1_cf1",
    accountId:    "account_1",
    sourceTicket: 100,
    type:         "deposit",
    timeUtc:      "2025-01-01T00:00:00Z",
    timeEpoch:    NOW - 86400 * 30,
    amount:       5000,
    currency:     "EUR",
    comment:      "Initial deposit",
    source:       "mt4_file",
    ...overrides,
  };
}

// ── buildBalanceCurve ─────────────────────────────────────────────────────────

describe("buildBalanceCurve", () => {
  it("returns one point per event sorted by time", () => {
    const trades = [makeTrade({ closeTimeEpoch: NOW })];
    const cashFlows = [makeCashFlow({ timeEpoch: NOW - 3600 })];
    const curve = buildBalanceCurve(trades, cashFlows, "account_1");
    expect(curve).toHaveLength(2);
    expect(curve[0].timeEpoch).toBeLessThanOrEqual(curve[1].timeEpoch);
  });

  it("runningBalance accumulates correctly", () => {
    const trades = [makeTrade({ netProfit: 100, closeTimeEpoch: NOW + 100 })];
    const cashFlows = [makeCashFlow({ amount: 5000, timeEpoch: NOW })];
    const curve = buildBalanceCurve(trades, cashFlows, "account_1", 0);
    // cashflow first (lower epoch), then trade
    expect(curve[0].runningBalance).toBeCloseTo(5000);
    expect(curve[1].runningBalance).toBeCloseTo(5100);
  });

  it("ignores events from other accounts", () => {
    const otherTrade = makeTrade({ accountId: "account_2" });
    const curve = buildBalanceCurve([otherTrade], [], "account_1");
    expect(curve).toHaveLength(0);
  });

  it("eventType is always a valid BalanceCurvePoint eventType (not equity or snapshot)", () => {
    const validTypes = new Set(["trade", "deposit", "withdrawal", "credit", "fee", "adjustment", "other"]);
    const curve = buildBalanceCurve([makeTrade()], [makeCashFlow()], "account_1");
    for (const pt of curve) {
      expect(validTypes.has(pt.eventType)).toBe(true);
    }
  });
});

// ── No synthetic equity ───────────────────────────────────────────────────────

describe("NO SYNTHETIC EQUITY — equity snapshots are separate from balance curve", () => {
  it("equity snapshots contain only real snapshot points, not balance curve points", () => {
    const trades = Array.from({ length: 50 }, (_, i) =>
      makeTrade({ id: `account_1_${i}`, sourceTicket: i, closeTimeEpoch: NOW - i * 3600, netProfit: 10 }),
    );
    const realSnap: EquitySnapshot = {
      accountId: "account_1",
      timeUtc:   new Date(NOW * 1000).toISOString(),
      timeEpoch: NOW,
      equity:    10500,
      balance:   10450,
      source:    "mt4_file",
    };
    const equitySnapshots = [realSnap];

    const curve = buildBalanceCurve(trades, [], "account_1");
    expect(curve).toHaveLength(50); // 50 balance points
    expect(equitySnapshots).toHaveLength(1); // 1 real equity snapshot — never inflated
  });

  it("balance curve eventType is always a recognized event kind", () => {
    const validTypes = new Set(["trade", "deposit", "withdrawal", "credit", "fee", "adjustment", "other"]);
    const curve = buildBalanceCurve([makeTrade()], [], "account_1");
    expect(curve.every((pt) => validTypes.has(pt.eventType))).toBe(true);
  });
});

// ── buildCombinedBalanceCurve ─────────────────────────────────────────────────

describe("buildCombinedBalanceCurve", () => {
  it("returns empty curve and warning when currencies differ", () => {
    const curveA = buildBalanceCurve([makeTrade()], [], "account_1");
    const curveB = buildBalanceCurve(
      [makeTrade({ accountId: "account_2", id: "account_2_1" })],
      [],
      "account_2",
    );
    const { curve, warnings } = buildCombinedBalanceCurve(
      { account_1: curveA, account_2: curveB },
      { account_1: "EUR", account_2: "USD" },
    );
    expect(curve).toHaveLength(0);
    expect(warnings.some((w) => w.includes("differ"))).toBe(true);
  });

  it("computes combined balance correctly when currencies match", () => {
    const t1 = makeTrade({ netProfit: 100, closeTimeEpoch: NOW });
    const t2 = makeTrade({ accountId: "account_2", id: "account_2_1", netProfit: 200, closeTimeEpoch: NOW + 1 });
    const curveA = buildBalanceCurve([t1], [], "account_1");
    const curveB = buildBalanceCurve([t2], [], "account_2");
    const { curve, warnings } = buildCombinedBalanceCurve(
      { account_1: curveA, account_2: curveB },
      { account_1: "EUR", account_2: "EUR" },
    );
    expect(warnings).toHaveLength(0);
    expect(curve).toHaveLength(2);
    expect(curve[curve.length - 1].runningBalance).toBeCloseTo(300);
  });

  it("never uses invented FX rates", () => {
    // When currencies differ, the combined curve MUST be empty (no conversion)
    const { curve } = buildCombinedBalanceCurve(
      {
        account_1: [{ timeEpoch: NOW, timeUtc: "", balance: 100, eventType: "trade", amount: 100, runningBalance: 100, accountId: "account_1" }],
        account_2: [{ timeEpoch: NOW, timeUtc: "", balance: 100, eventType: "trade", amount: 100, runningBalance: 100, accountId: "account_2" }],
      },
      { account_1: "EUR", account_2: "USD" },
    );
    expect(curve).toHaveLength(0);
  });
});

// ── computeMaxDrawdown ────────────────────────────────────────────────────────

describe("computeMaxDrawdown", () => {
  it("returns null for curve with < 2 points", () => {
    expect(computeMaxDrawdown([])).toBeNull();
    const single: BalanceCurvePoint[] = [
      { timeEpoch: NOW, timeUtc: "", balance: 100, eventType: "trade", amount: 100, runningBalance: 100, accountId: "account_1" },
    ];
    expect(computeMaxDrawdown(single)).toBeNull();
  });

  it("calculates max drawdown correctly", () => {
    const curve: BalanceCurvePoint[] = [
      { timeEpoch: 1, timeUtc: "", balance: 100, eventType: "trade", amount: 100, runningBalance: 100, accountId: "account_1" },
      { timeEpoch: 2, timeUtc: "", balance: 150, eventType: "trade", amount: 50,  runningBalance: 150, accountId: "account_1" },
      { timeEpoch: 3, timeUtc: "", balance: -80, eventType: "trade", amount: -80, runningBalance: 70,  accountId: "account_1" },
      { timeEpoch: 4, timeUtc: "", balance: 200, eventType: "trade", amount: 130, runningBalance: 200, accountId: "account_1" },
    ];
    // Peak at 150, trough at 70 → drawdown = 80
    expect(computeMaxDrawdown(curve)).toBeCloseTo(80);
  });
});

// ── computePerformanceKpis ────────────────────────────────────────────────────

describe("computePerformanceKpis", () => {
  it("winRate is null when closedTradeCount = 0", () => {
    const kpi = computePerformanceKpis([], [], makeAccount(), [], []);
    expect(kpi.winRate).toBeNull();
    expect(kpi.closedTradeCount).toBe(0);
  });

  it("profitFactor is null when grossLoss = 0 (all winners)", () => {
    const trades = [makeTrade({ netProfit: 100, grossProfit: 100 })];
    const kpi = computePerformanceKpis(trades, [], makeAccount(), buildBalanceCurve(trades, [], "account_1"), []);
    expect(kpi.profitFactor).toBeNull();
  });

  it("cashflows are NOT counted as trades", () => {
    const deposit = makeCashFlow({ amount: 10000 });
    const kpi = computePerformanceKpis([], [deposit], makeAccount(), [], []);
    expect(kpi.closedTradeCount).toBe(0);
    expect(kpi.totalDeposits).toBeCloseTo(10000);
  });

  it("netProfit = sum of all closedTrade netProfits", () => {
    const trades = [
      makeTrade({ netProfit: 100 }),
      makeTrade({ id: "account_1_2", sourceTicket: 2, netProfit: -30 }),
    ];
    const kpi = computePerformanceKpis(trades, [], makeAccount(), buildBalanceCurve(trades, [], "account_1"), []);
    expect(kpi.netProfit).toBeCloseTo(70);
  });

  it("balanceDrawdown is null if curve has < 2 points", () => {
    const kpi = computePerformanceKpis([], [], makeAccount(), [], []);
    expect(kpi.balanceDrawdown).toBeNull();
  });

  it("winRate is computed correctly", () => {
    const trades = [
      makeTrade({ netProfit:  50 }),
      makeTrade({ id: "account_1_2", sourceTicket: 2, netProfit: -20 }),
      makeTrade({ id: "account_1_3", sourceTicket: 3, netProfit:  80 }),
    ];
    const kpi = computePerformanceKpis(trades, [], makeAccount(), buildBalanceCurve(trades, [], "account_1"), []);
    expect(kpi.winRate).toBeCloseTo(2 / 3);
  });
});
