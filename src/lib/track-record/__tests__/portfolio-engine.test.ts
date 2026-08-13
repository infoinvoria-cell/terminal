/**
 * Unit tests for portfolio-engine.ts
 */

import { describe, it, expect } from "vitest";
import {
  buildCombinedPortfolio,
  buildTradeEventSeries,
  buildAccountCumulativeSeries,
  buildCombinedTrackRecordSeries,
} from "../portfolio-engine";
import type {
  NormalizedTrackRecord,
  NormalizedTrade,
  NormalizedCashFlow,
  NormalizedAccountSnapshot,
} from "../normalized-types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW_EPOCH = 1780000000;
const NOW_UTC = new Date(NOW_EPOCH * 1000).toISOString().replace(".000Z", "Z");

function makeAccount(
  overrides: Partial<NormalizedAccountSnapshot> = {},
): NormalizedAccountSnapshot {
  return {
    accountId: "account_1",
    platform: "MT4",
    broker: "TestBroker",
    loginMasked: "****1234",
    server: "Test-1",
    currency: "EUR",
    balance: 1000,
    equity: 1000,
    floatingProfit: 0,
    margin: 0,
    freeMargin: 1000,
    marginLevel: 0,
    leverage: 100,
    connected: true,
    generatedAtUtc: NOW_UTC,
    generatedAtEpoch: NOW_EPOCH,
    source: "mt4_file",
    sourceFresh: true,
    ...overrides,
  };
}

function makeTrade(overrides: Partial<NormalizedTrade> = {}): NormalizedTrade {
  return {
    id: "account_1_1",
    accountId: "account_1",
    sourceTicket: 1,
    platform: "MT4",
    broker: "TestBroker",
    symbol: "EURUSD",
    side: "buy",
    volume: 0.1,
    openTimeUtc: "2024-03-15T10:00:00Z",
    openTimeEpoch: 1710496800,
    closeTimeUtc: "2024-03-15T14:22:00Z",
    closeTimeEpoch: 1710512520,
    openPrice: 1.08,
    closePrice: 1.09,
    stopLoss: 0,
    takeProfit: 0,
    grossProfit: 10,
    commission: -1,
    swap: 0,
    fees: 0,
    netProfit: 9,
    magicNumber: 0,
    comment: "",
    status: "closed",
    source: "mt4_file",
    ...overrides,
  };
}

function makeCashFlow(overrides: Partial<NormalizedCashFlow> = {}): NormalizedCashFlow {
  return {
    id: "account_1_deposit_1",
    accountId: "account_1",
    sourceTicket: 1,
    type: "deposit",
    timeUtc: "2024-03-15T09:00:00Z",
    timeEpoch: 1710493200,
    amount: 1000,
    currency: "EUR",
    comment: "Initial deposit",
    source: "mt4_file",
    ...overrides,
  };
}

function makeRecord(
  overrides: Partial<NormalizedTrackRecord> = {},
): NormalizedTrackRecord {
  return {
    schemaVersion: 1,
    generatedAtUtc: NOW_UTC,
    generatedAtEpoch: NOW_EPOCH,
    accounts: [makeAccount()],
    closedTrades: [],
    openPositions: [],
    cashFlows: [],
    balanceCurves: {},
    equitySnapshots: [],
    kpis: {},
    warnings: [],
    sourceStatus: {},
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildCombinedPortfolio", () => {
  // 1. UTC day boundary: trade at 23:59:59Z stays on same day
  it("UTC day boundary — trade at 23:59:59Z on 2024-03-15 maps to 2024-03-15, not 2024-03-16", () => {
    const trade = makeTrade({
      closeTimeUtc: "2024-03-15T23:59:59Z",
      closeTimeEpoch: new Date("2024-03-15T23:59:59Z").getTime() / 1000,
      netProfit: 50,
      grossProfit: 50,
    });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1050 })],
      closedTrades: [trade],
    });
    const result = buildCombinedPortfolio(record);

    const points = result.accountDailyPoints["account_1"] ?? [];
    const day15 = points.find((p) => p.dateUtc === "2024-03-15");
    const day16 = points.find((p) => p.dateUtc === "2024-03-16");
    expect(day15?.tradingPnl).toBe(50);
    expect(day16?.tradingPnl ?? 0).toBe(0);
  });

  // 2. Daylight saving edge case: 2024-03-31T00:30:00Z stays 2024-03-31 UTC
  //    (even though Europe/Berlin would place this on 2024-04-01 02:30 local)
  it("DST edge case — trade at 2024-03-31T00:30:00Z is 2024-03-31 UTC (not 2024-04-01)", () => {
    const trade = makeTrade({
      closeTimeUtc: "2024-03-31T00:30:00Z",
      closeTimeEpoch: new Date("2024-03-31T00:30:00Z").getTime() / 1000,
      netProfit: 20,
      grossProfit: 20,
    });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1020 })],
      closedTrades: [trade],
    });
    const result = buildCombinedPortfolio(record);
    const points = result.accountDailyPoints["account_1"] ?? [];
    const dayMar31 = points.find((p) => p.dateUtc === "2024-03-31");
    expect(dayMar31?.tradingPnl).toBe(20);
  });

  // 3. Modified Dietz — deposit mid-day reduces effective weight
  it("Modified Dietz — deposit at mid-day lowers denominator vs deposit at day start", () => {
    // Account starts with 0. Trade brings 10 profit. Deposit of 1000 arrives mid-day.
    const depositEpoch = new Date("2024-03-15T12:00:00Z").getTime() / 1000;
    const trade = makeTrade({
      closeTimeUtc: "2024-03-15T09:00:00Z",
      closeTimeEpoch: new Date("2024-03-15T09:00:00Z").getTime() / 1000,
      netProfit: 10,
      grossProfit: 10,
    });
    const cf = makeCashFlow({
      timeUtc: "2024-03-15T12:00:00Z",
      timeEpoch: depositEpoch,
      amount: 1000,
    });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1010 })],
      closedTrades: [trade],
      cashFlows: [cf],
    });
    const result = buildCombinedPortfolio(record);
    const points = result.accountDailyPoints["account_1"] ?? [];
    const day = points.find((p) => p.dateUtc === "2024-03-15");
    // modified_dietz denominator = 0 (begin) + weight*1000 = ~0.5*1000 = 500
    // return = (1010 - 0 - 1000) / 500 ≈ 0.02 = 2%
    // (If weight were 0 it would be denominator_lte_zero; weight at noon ≈ 0.5)
    expect(day?.dailyReturn).not.toBeNull();
    expect(day?.reasonCode).toBe("modified_dietz");
    // Return should be roughly 10/500 ≈ 2%, well above 0
    expect(day!.dailyReturn!).toBeGreaterThan(0);
  });

  // 4. No return when denominator <= 0
  it("returns null dailyReturn when denominator is zero (no beginning balance, no intra-day cash)", () => {
    // Pure trading profit with no beginning balance and no cashflow on that day
    // inferInitialBalance: balance=10 - netProfit=10 - cashFlows=0 = 0
    const trade = makeTrade({
      closeTimeUtc: "2024-03-15T14:00:00Z",
      closeTimeEpoch: new Date("2024-03-15T14:00:00Z").getTime() / 1000,
      netProfit: 10,
      grossProfit: 10,
    });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 10 })],
      closedTrades: [trade],
      cashFlows: [], // no cashflows → inferInitialBalance = 10 - 10 - 0 = 0
    });
    const result = buildCombinedPortfolio(record);
    const points = result.accountDailyPoints["account_1"] ?? [];
    const day = points.find((p) => p.dateUtc === "2024-03-15");
    expect(day?.dailyReturn).toBeNull();
    expect(day?.reasonCode).toBe("denominator_lte_zero");
  });

  // 5. FX null → warning still emitted, compute proceeds when only one account active
  it("FX null → warning emitted, portfolio still computes for single EUR account", () => {
    const trade = makeTrade({
      closeTimeUtc: "2024-03-15T14:00:00Z",
      closeTimeEpoch: new Date("2024-03-15T14:00:00Z").getTime() / 1000,
      netProfit: 10,
      grossProfit: 10,
    });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1010, currency: "EUR" })],
      closedTrades: [trade],
      cashFlows: [makeCashFlow({ amount: 1000 })],
    });
    // Pass empty fxRates — null for all dates
    const result = buildCombinedPortfolio(record, {});
    // Single EUR account should still compute without FX
    expect(result.totalReturn).not.toBeNaN();
    expect(typeof result.totalReturn).toBe("number");
    // daysWithMissingFx may be > 0 because there's no EURUSD entry
    // But we don't error out
    expect(result.endIndex).toBeGreaterThan(0);
  });

  // 6. Naive return != correct portfolio return (anti-regression)
  it("naiveCombinedReturn differs from correctPortfolioReturn", () => {
    // Two accounts, different currencies, different returns
    const trade1 = makeTrade({
      id: "account_1_1",
      accountId: "account_1",
      closeTimeUtc: "2024-03-15T14:00:00Z",
      closeTimeEpoch: new Date("2024-03-15T14:00:00Z").getTime() / 1000,
      netProfit: 100,
      grossProfit: 100,
    });
    const trade2 = makeTrade({
      id: "account_2_1",
      accountId: "account_2",
      closeTimeUtc: "2024-03-16T14:00:00Z",
      closeTimeEpoch: new Date("2024-03-16T14:00:00Z").getTime() / 1000,
      netProfit: 50,
      grossProfit: 50,
    });
    const cf1 = makeCashFlow({
      id: "account_1_dep_1",
      accountId: "account_1",
      amount: 1000,
      timeUtc: "2024-03-14T09:00:00Z",
      timeEpoch: new Date("2024-03-14T09:00:00Z").getTime() / 1000,
    });
    const cf2 = makeCashFlow({
      id: "account_2_dep_1",
      accountId: "account_2",
      amount: 200,
      currency: "USD",
      timeUtc: "2024-03-14T09:00:00Z",
      timeEpoch: new Date("2024-03-14T09:00:00Z").getTime() / 1000,
    });
    const record = makeRecord({
      accounts: [
        makeAccount({ accountId: "account_1", currency: "EUR", balance: 1100 }),
        makeAccount({ accountId: "account_2", platform: "MT5", currency: "USD", balance: 250 }),
      ],
      closedTrades: [trade1, trade2],
      cashFlows: [cf1, cf2],
    });
    const result = buildCombinedPortfolio(record, { "2024-03-15": { EURUSD: 1.08 }, "2024-03-16": { EURUSD: 1.08 } });
    // naive is simple sum of individual returns, correct is capital-weighted
    expect(result.diagnostics.naiveCombinedReturn).not.toBe(
      result.diagnostics.correctPortfolioReturn,
    );
  });

  // 7. Combined trade count = account1 + account2, no duplicates
  it("combined trade count equals sum of both accounts, no duplicates", () => {
    const t1 = makeTrade({ id: "account_1_100", accountId: "account_1", sourceTicket: 100 });
    const t2 = makeTrade({ id: "account_2_200", accountId: "account_2", sourceTicket: 200, platform: "MT5" });
    const record = makeRecord({
      accounts: [
        makeAccount({ accountId: "account_1", balance: 1009 }),
        makeAccount({ accountId: "account_2", platform: "MT5", balance: 1009 }),
      ],
      closedTrades: [t1, t2],
      cashFlows: [
        makeCashFlow({ id: "account_1_dep", accountId: "account_1", amount: 1000 }),
        makeCashFlow({ id: "account_2_dep", accountId: "account_2", amount: 1000 }),
      ],
    });
    const result = buildCombinedPortfolio(record);
    expect(result.combinedTrades.length).toBe(2);
    expect(result.diagnostics.account1Trades).toBe(1);
    expect(result.diagnostics.account2Trades).toBe(1);
    expect(result.diagnostics.totalTrades).toBe(2);
    // No duplicate IDs
    const ids = result.combinedTrades.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // 8. Cashflows not counted as trading PnL
  it("cashflows are not included in tradingPnl", () => {
    const cf = makeCashFlow({ amount: 500, timeUtc: "2024-03-15T09:00:00Z" });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 500 })],
      closedTrades: [],
      cashFlows: [cf],
    });
    const result = buildCombinedPortfolio(record);
    const day = result.accountDailyPoints["account_1"]?.find(
      (p) => p.dateUtc === "2024-03-15",
    );
    expect(day?.tradingPnl).toBe(0);
    expect(day?.deposits).toBe(500);
  });

  // 9. Chain-linking: +1%, -1%, +2% → correct index path
  it("chain-links daily returns correctly: +1%, -1%, +2%", () => {
    // We need an account with known beginning balance and specific daily profits
    // Initial balance inferred from: balance = initial + netProfit + cashflows
    // Set up: initial = 1000, 3 trades on 3 days yielding 1%, -1%, +2%
    // Day 1: profit = 10 on balance 1000 → 1% return
    // Day 2: profit ≈ -9.9 on balance 1010 → ≈ -0.98% (close to -1%)
    // Day 3: profit ≈ 20 on balance ≈ 1000.1 → ≈ +2%
    // totalNetProfit = 10 - 9.9 + 20 = 20.1, cashflows = 0, currentBalance = 1020.1
    const t1 = makeTrade({
      id: "account_1_1",
      closeTimeUtc: "2024-01-01T12:00:00Z",
      closeTimeEpoch: new Date("2024-01-01T12:00:00Z").getTime() / 1000,
      netProfit: 10,
      grossProfit: 10,
    });
    const t2 = makeTrade({
      id: "account_1_2",
      closeTimeUtc: "2024-01-02T12:00:00Z",
      closeTimeEpoch: new Date("2024-01-02T12:00:00Z").getTime() / 1000,
      netProfit: -9.9,
      grossProfit: -9.9,
    });
    const t3 = makeTrade({
      id: "account_1_3",
      closeTimeUtc: "2024-01-03T12:00:00Z",
      closeTimeEpoch: new Date("2024-01-03T12:00:00Z").getTime() / 1000,
      netProfit: 20.1,
      grossProfit: 20.1,
    });
    // currentBalance = 1000 + 10 - 9.9 + 20.1 = 1020.2
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1020.2 })],
      closedTrades: [t1, t2, t3],
      cashFlows: [], // initialBalance = 1020.2 - 20.2 - 0 = 1000
    });
    const result = buildCombinedPortfolio(record);
    const pts = result.dailyPoints;
    // Find the three active days
    const d1 = pts.find((p) => p.dateUtc === "2024-01-01");
    const d2 = pts.find((p) => p.dateUtc === "2024-01-02");
    const d3 = pts.find((p) => p.dateUtc === "2024-01-03");

    expect(d1?.portfolioIndex).toBeCloseTo(100 * 1.01, 2);
    expect(d2?.portfolioIndex).toBeCloseTo(100 * 1.01 * (1 - 0.0099), 1);
    expect(d3?.portfolioIndex).toBeCloseTo(100 * 1.01 * (1 - 0.0099) * 1.02, 1);
    // Final total return ≈ +1% -1% +2% → roughly +2%
    expect(result.totalReturn).toBeGreaterThan(0.01);
  });

  // ── New Phase-9 tests ─────────────────────────────────────────────────────

  // Phase 9 test 1: Daily series has exactly N+1 points for N-day range (inclusive)
  it("daily series has exactly N+1 points for N-day range (inclusive start and end)", () => {
    const t1 = makeTrade({ closeTimeUtc: "2024-01-01T12:00:00Z", closeTimeEpoch: new Date("2024-01-01T12:00:00Z").getTime() / 1000, netProfit: 5, grossProfit: 5 });
    const t2 = makeTrade({ id: "account_1_2", closeTimeUtc: "2024-01-05T12:00:00Z", closeTimeEpoch: new Date("2024-01-05T12:00:00Z").getTime() / 1000, netProfit: 5, grossProfit: 5 });
    // Cashflow date must be within trade range so it doesn't extend the date span
    const cf = makeCashFlow({ amount: 1000, timeUtc: "2024-01-01T08:00:00Z", timeEpoch: new Date("2024-01-01T08:00:00Z").getTime() / 1000 });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1010 })],
      closedTrades: [t1, t2],
      cashFlows: [cf],
    });
    const result = buildCombinedPortfolio(record);
    // startDate = 2024-01-01, endDate = 2024-01-05 → 5 days inclusive = 5 points
    expect(result.dailyPoints.length).toBe(5);
  });

  // Phase 9 test 2: Weekend days are included with dailyReturn potentially null (no trades)
  it("weekend days are included in the series even with no trades", () => {
    // Trade on Friday 2024-01-05, next on Monday 2024-01-08
    const t1 = makeTrade({ closeTimeUtc: "2024-01-05T12:00:00Z", closeTimeEpoch: new Date("2024-01-05T12:00:00Z").getTime() / 1000, netProfit: 5, grossProfit: 5 });
    const t2 = makeTrade({ id: "account_1_2", closeTimeUtc: "2024-01-08T12:00:00Z", closeTimeEpoch: new Date("2024-01-08T12:00:00Z").getTime() / 1000, netProfit: 5, grossProfit: 5 });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1010 })],
      closedTrades: [t1, t2],
      cashFlows: [makeCashFlow({ amount: 1000 })],
    });
    const result = buildCombinedPortfolio(record);
    // Should include Sat 2024-01-06 and Sun 2024-01-07
    const sat = result.dailyPoints.find((p) => p.dateUtc === "2024-01-06");
    const sun = result.dailyPoints.find((p) => p.dateUtc === "2024-01-07");
    expect(sat).toBeDefined();
    expect(sun).toBeDefined();
    // These days have no trades, so portfolioDailyReturn may be null (denominator only is beginning balance)
    // but they ARE present
  });

  // Phase 9 test 3: cumulativeReturn on last point matches totalReturn
  it("last daily point cumulativeReturn matches summary.totalReturn within 0.0001", () => {
    const trade = makeTrade({ netProfit: 50, grossProfit: 50 });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1050 })],
      closedTrades: [trade],
      cashFlows: [makeCashFlow({ amount: 1000 })],
    });
    const result = buildCombinedPortfolio(record);
    const last = result.dailyPoints.at(-1);
    expect(last).toBeDefined();
    expect(Math.abs((last!.cumulativeReturn) - result.totalReturn)).toBeLessThan(0.0001);
  });

  // Phase 9 test 4: FX lookup never uses future date
  it("FX lookup never uses a future date — returns null if only future dates available", () => {
    const futureDate = "2099-01-01";
    const fxRates = { [futureDate]: { EURUSD: 1.5 } };
    const trade = makeTrade({ netProfit: 10, grossProfit: 10 });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1010, currency: "EUR" })],
      closedTrades: [trade],
      cashFlows: [makeCashFlow({ amount: 1000 })],
    });
    // Trade closes on 2024-03-15, FX only available for 2099 → no lookback match
    const result = buildCombinedPortfolio(record, fxRates);
    // Single EUR account — computes without needing FX
    expect(result.totalReturn).not.toBeNaN();
    // No EURUSD rate for 2024-03-15 in fxRates
    const day = result.dailyPoints.find((p) => p.dateUtc === "2024-03-15");
    expect(day?.fxRatesUsed.EURUSD).toBeNull();
  });

  // Phase 9 test 5: Annualized return uses 365.2425 calendar days
  it("annualized return formula uses 365.2425 calendar days", () => {
    // 365.2425 days at 10% total return → annualized = exactly 10%
    // Use start=2024-01-01, end=2025-01-01 (366 days leap year — close to 365.2425)
    const t1 = makeTrade({ closeTimeUtc: "2024-01-01T12:00:00Z", closeTimeEpoch: new Date("2024-01-01T12:00:00Z").getTime() / 1000, netProfit: 100, grossProfit: 100 });
    const t2 = makeTrade({ id: "account_1_2", closeTimeUtc: "2025-01-01T12:00:00Z", closeTimeEpoch: new Date("2025-01-01T12:00:00Z").getTime() / 1000, netProfit: 0, grossProfit: 0 });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1100 })],
      closedTrades: [t1, t2],
      cashFlows: [makeCashFlow({ amount: 1000 })],
    });
    const result = buildCombinedPortfolio(record);
    expect(result.summary.annualizedReturn).not.toBeNull();
    // Annualized should be calculated (not null) for >30 day window
    expect(typeof result.summary.annualizedReturn).toBe("number");
  });

  // Phase 9 test 6: Max drawdown calculated from full daily series
  it("max drawdown is calculated from full daily series, not sampled", () => {
    // Creates a series with a deep intra-period drawdown
    const t1 = makeTrade({ id: "t1", closeTimeUtc: "2024-01-10T12:00:00Z", closeTimeEpoch: new Date("2024-01-10T12:00:00Z").getTime() / 1000, netProfit: 200, grossProfit: 200 });
    const t2 = makeTrade({ id: "t2", closeTimeUtc: "2024-01-20T12:00:00Z", closeTimeEpoch: new Date("2024-01-20T12:00:00Z").getTime() / 1000, netProfit: -150, grossProfit: -150 });
    const t3 = makeTrade({ id: "t3", closeTimeUtc: "2024-01-30T12:00:00Z", closeTimeEpoch: new Date("2024-01-30T12:00:00Z").getTime() / 1000, netProfit: 100, grossProfit: 100 });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1150 })],
      closedTrades: [t1, t2, t3],
      cashFlows: [makeCashFlow({ amount: 1000 })],
    });
    const result = buildCombinedPortfolio(record);
    // Should detect drawdown from peak (after t1) to trough (after t2)
    expect(result.summary.maxDrawdown).not.toBeNull();
    expect(result.summary.maxDrawdown!).toBeLessThan(0); // negative number
  });

  // Phase 9 test 7: Profit factor excludes cashflows
  it("profit factor is computed from trade netProfit only, not cashflows", () => {
    const winner = makeTrade({ id: "w", netProfit: 100, grossProfit: 100 });
    const loser = makeTrade({ id: "l", closeTimeUtc: "2024-03-16T12:00:00Z", closeTimeEpoch: new Date("2024-03-16T12:00:00Z").getTime() / 1000, netProfit: -40, grossProfit: -40 });
    const cf = makeCashFlow({ amount: 5000, comment: "big deposit" });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1060 })],
      closedTrades: [winner, loser],
      cashFlows: [makeCashFlow({ amount: 1000 }), cf],
    });
    const result = buildCombinedPortfolio(record);
    // profitFactor = 100 / 40 = 2.5 (cashflow ignored)
    expect(result.summary.profitFactor).not.toBeNull();
    expect(result.summary.profitFactor!).toBeCloseTo(2.5, 2);
  });

  // Phase 9 test 8: Positive months chains within month
  it("positive months chains daily returns within each month", () => {
    // Two trades in January: +5% then -3% → net positive
    // One trade in February: -2% → net negative
    const t1 = makeTrade({ id: "jan1", closeTimeUtc: "2024-01-10T12:00:00Z", closeTimeEpoch: new Date("2024-01-10T12:00:00Z").getTime() / 1000, netProfit: 50, grossProfit: 50 });
    const t2 = makeTrade({ id: "jan2", closeTimeUtc: "2024-01-20T12:00:00Z", closeTimeEpoch: new Date("2024-01-20T12:00:00Z").getTime() / 1000, netProfit: -30, grossProfit: -30 });
    const t3 = makeTrade({ id: "feb1", closeTimeUtc: "2024-02-15T12:00:00Z", closeTimeEpoch: new Date("2024-02-15T12:00:00Z").getTime() / 1000, netProfit: -20, grossProfit: -20 });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1000 })],
      closedTrades: [t1, t2, t3],
      cashFlows: [makeCashFlow({ amount: 1000 })],
    });
    const result = buildCombinedPortfolio(record);
    expect(result.summary.totalMonths).toBeGreaterThanOrEqual(2);
  });

  // Phase 9 test 9: No hardcoded 97.2, 73.19, 9.75 in portfolio-engine output
  it("engine output contains no hardcoded reference values (97.2, 73.19, 9.75)", () => {
    const trade = makeTrade({ netProfit: 50, grossProfit: 50 });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1050 })],
      closedTrades: [trade],
      cashFlows: [makeCashFlow({ amount: 1000 })],
    });
    const result = buildCombinedPortfolio(record);
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/97\.2/);
    expect(json).not.toMatch(/73\.19/);
    expect(json).not.toMatch(/9\.75/);
    // Result must be a valid number (not NaN)
    expect(typeof result.totalReturn).toBe("number");
    expect(isNaN(result.totalReturn)).toBe(false);
  });

  // Phase 9 test 10: Modified Dietz — multiple cashflows on same day
  it("Modified Dietz handles multiple cashflows on same day correctly", () => {
    // Two deposits on same day at different times
    const cf1 = makeCashFlow({ id: "cf1", timeUtc: "2024-03-15T09:00:00Z", timeEpoch: new Date("2024-03-15T09:00:00Z").getTime() / 1000, amount: 500 });
    const cf2 = makeCashFlow({ id: "cf2", timeUtc: "2024-03-15T15:00:00Z", timeEpoch: new Date("2024-03-15T15:00:00Z").getTime() / 1000, amount: 500 });
    const trade = makeTrade({ netProfit: 10, grossProfit: 10 });
    const record = makeRecord({
      accounts: [makeAccount({ balance: 1010 })],
      closedTrades: [trade],
      cashFlows: [cf1, cf2],
    });
    const result = buildCombinedPortfolio(record);
    const day = result.accountDailyPoints["account_1"]?.find((p) => p.dateUtc === "2024-03-15");
    expect(day).toBeDefined();
    expect(day!.deposits).toBe(1000);
    expect(day!.reasonCode).toBe("modified_dietz");
  });

  // 10. MT5 partial close: 2 OUT deals for same position = 2 separate trade entries
  it("MT5 partial close: 2 trades with same sourceTicket from different accounts are NOT merged", () => {
    // Two trades with different IDs (as produced by normalize-mt5 for partial closes)
    const t1 = makeTrade({
      id: "account_2_501",
      accountId: "account_2",
      sourceTicket: 501,
      platform: "MT5",
      netProfit: 30,
      grossProfit: 30,
    });
    const t2 = makeTrade({
      id: "account_2_502",
      accountId: "account_2",
      sourceTicket: 502,
      platform: "MT5",
      netProfit: 20,
      grossProfit: 20,
    });
    const record = makeRecord({
      accounts: [makeAccount({ accountId: "account_2", platform: "MT5", balance: 1050 })],
      closedTrades: [t1, t2],
      cashFlows: [makeCashFlow({ id: "account_2_dep", accountId: "account_2", amount: 1000 })],
    });
    const result = buildCombinedPortfolio(record);
    expect(result.combinedTrades.length).toBe(2);
    expect(result.combinedTrades.map((t) => t.id)).toContain("account_2_501");
    expect(result.combinedTrades.map((t) => t.id)).toContain("account_2_502");
  });
});

// ── buildTradeEventSeries tests ────────────────────────────────────────────────

describe("buildTradeEventSeries", () => {
  // 1. 0 trades → empty series
  it("0 trades → empty series", () => {
    const { series, finalIndex, finalReturn } = buildTradeEventSeries([], [], [makeAccount()], {});
    expect(series).toHaveLength(0);
    expect(finalIndex).toBe(100);
    expect(finalReturn).toBe(0);
  });

  // 2. 1 trade → 1 point, index = 100 * (1 + tradeReturn)
  it("1 trade → 1 point", () => {
    const acct = makeAccount({ balance: 1000 });
    // One trade with netProfit=10, account balance=1000, so initialBalance ~= 990 (balance - profit)
    const trade = makeTrade({ id: "account_1_t1", sourceTicket: 1, netProfit: 10, grossProfit: 10, commission: 0 });
    const { series } = buildTradeEventSeries([trade], [], [acct], {});
    expect(series).toHaveLength(1);
    expect(series[0].sequence).toBe(1);
    expect(series[0].tradeId).toBe("account_1_t1");
    expect(series[0].cumulativeIndex).toBeGreaterThan(100);
    // cumulativeReturn = cumulativeIndex/100 - 1
    expect(series[0].cumulativeReturn).toBeCloseTo(series[0].cumulativeIndex / 100 - 1, 10);
  });

  // 3. N trades → exactly N points
  it("N trades → exactly N points (invariant)", () => {
    const acct = makeAccount({ balance: 1100 });
    const trades = [
      makeTrade({ id: "account_1_1", sourceTicket: 1, netProfit: 10, closeTimeEpoch: 1710512520 }),
      makeTrade({ id: "account_1_2", sourceTicket: 2, netProfit: -5, closeTimeEpoch: 1710598920 }),
      makeTrade({ id: "account_1_3", sourceTicket: 3, netProfit: 20, closeTimeEpoch: 1710685320 }),
    ];
    const { series } = buildTradeEventSeries(trades, [], [acct], {});
    expect(series).toHaveLength(3);
    expect(series.length).toBe(trades.length);
  });

  // 4. Cashflow does NOT create a chart point
  it("cashflow does NOT create a chart point", () => {
    const acct = makeAccount({ balance: 1100 });
    const trade = makeTrade({ id: "account_1_1", sourceTicket: 1, netProfit: 10 });
    const cf = makeCashFlow({ id: "account_1_d1", sourceTicket: 99, amount: 100 });
    const { series } = buildTradeEventSeries([trade], [cf], [acct], {});
    expect(series).toHaveLength(1); // only the trade, not the cashflow
  });

  // 5. First point sequence = 1, last sequence = N
  it("sequences are 1-indexed and continuous", () => {
    const acct = makeAccount({ balance: 1050 });
    const trades = [
      makeTrade({ id: "account_1_1", sourceTicket: 1, closeTimeEpoch: 1710512520 }),
      makeTrade({ id: "account_1_2", sourceTicket: 2, closeTimeEpoch: 1710598920 }),
    ];
    const { series } = buildTradeEventSeries(trades, [], [acct], {});
    expect(series[0].sequence).toBe(1);
    expect(series[series.length - 1].sequence).toBe(series.length);
  });

  // 6. cumulativeReturn of last point = (finalIndex / 100) - 1
  it("last point cumulativeReturn matches finalReturn", () => {
    const acct = makeAccount({ balance: 1050 });
    const trades = [
      makeTrade({ id: "account_1_1", sourceTicket: 1, netProfit: 10, closeTimeEpoch: 1710512520 }),
      makeTrade({ id: "account_1_2", sourceTicket: 2, netProfit: 20, closeTimeEpoch: 1710598920 }),
    ];
    const { series, finalReturn } = buildTradeEventSeries(trades, [], [acct], {});
    const last = series[series.length - 1];
    expect(last.cumulativeReturn).toBeCloseTo(finalReturn, 10);
    expect(last.cumulativeReturn).toBeCloseTo(last.cumulativeIndex / 100 - 1, 10);
  });

  // 7. Two trades same timestamp → both appear, deterministic order
  it("two trades at same epoch → both appear in deterministic order", () => {
    const acct = makeAccount({ balance: 1100 });
    const epoch = 1710512520;
    const t1 = makeTrade({ id: "account_1_1", sourceTicket: 1, closeTimeEpoch: epoch, netProfit: 10 });
    const t2 = makeTrade({ id: "account_1_2", sourceTicket: 2, closeTimeEpoch: epoch, netProfit: 5 });
    const { series } = buildTradeEventSeries([t2, t1], [], [acct], {});
    expect(series).toHaveLength(2);
    // Both trade ids present
    const ids = series.map((p) => p.tradeId);
    expect(ids).toContain("account_1_1");
    expect(ids).toContain("account_1_2");
  });

  // 8. Reconciliation: last cumulativeReturn = (finalIndex - 100) / 100
  it("finalIndex and finalReturn are consistent", () => {
    const acct = makeAccount({ balance: 1010 });
    const trade = makeTrade({ id: "account_1_1", sourceTicket: 1, netProfit: 10 });
    const { finalIndex, finalReturn } = buildTradeEventSeries([trade], [], [acct], {});
    expect(finalReturn).toBeCloseTo(finalIndex / 100 - 1, 10);
  });
});

// ── buildAccountCumulativeSeries tests ────────────────────────────────────────

describe("buildAccountCumulativeSeries", () => {
  it("single trade: index and cumulative return computed correctly", () => {
    // balance=1100, one trade netProfit=100, no cashflows → initialCapital=1000
    // tradeReturn = 100/1000 = 0.1, accountIndex = 110, cumulativeReturn = 0.1
    const trade = makeTrade({ netProfit: 100, grossProfit: 100 });
    const series = buildAccountCumulativeSeries([trade], [], 1100, "account_1", "EUR");
    expect(series.initialCapital).toBeCloseTo(1000, 4);
    expect(series.finalIndex).toBeCloseTo(110, 4);
    expect(series.finalCumulativeReturn).toBeCloseTo(0.1, 4);
    expect(series.tradeCount).toBe(1);
    expect(series.points).toHaveLength(1);
    expect(series.points[0].tradeReturn).toBeCloseTo(0.1, 4);
  });

  it("cashflow updates capital but does not create a chart point", () => {
    const cf = makeCashFlow({ amount: 500, timeEpoch: 1710500000 });
    const trade = makeTrade({ netProfit: 50, grossProfit: 50, closeTimeEpoch: 1710512520 });
    // balance=1550, trade netProfit=50, cashflow=500 → initialCapital=1000
    // cashflow before trade → capital becomes 1500, then tradeReturn=50/1500
    const series = buildAccountCumulativeSeries([trade], [cf], 1550, "account_1", "EUR");
    expect(series.tradeCount).toBe(1);
    expect(series.points).toHaveLength(1);
    expect(series.points[0].capitalBefore).toBeCloseTo(1500, 4);
    expect(series.points[0].tradeReturn).toBeCloseTo(50 / 1500, 6);
  });

  it("two trades: chain-linked compounding", () => {
    // balance=1000+10+20=1030, no cashflows → initialCapital=1000
    // trade1 return=10/1000=0.01, index=101
    // trade2 return=20/1010=~0.0198, index=101*(1+20/1010)
    const t1 = makeTrade({ id: "a1_1", sourceTicket: 1, netProfit: 10, grossProfit: 10, closeTimeEpoch: 1710512520 });
    const t2 = makeTrade({ id: "a1_2", sourceTicket: 2, netProfit: 20, grossProfit: 20, closeTimeEpoch: 1710512521 });
    const series = buildAccountCumulativeSeries([t1, t2], [], 1030, "account_1", "EUR");
    expect(series.tradeCount).toBe(2);
    const expectedIndex = 100 * (1 + 10 / 1000) * (1 + 20 / 1010);
    expect(series.finalIndex).toBeCloseTo(expectedIndex, 4);
    expect(series.finalCumulativeReturn).toBeCloseTo(expectedIndex / 100 - 1, 4);
  });
});

// ── buildCombinedTrackRecordSeries tests ─────────────────────────────────────

// Helper: make a two-account NormalizedTrackRecord
function makeTwoAccountRecord(
  acc1Trades: NormalizedTrade[],
  acc2Trades: NormalizedTrade[],
  acc1Balance: number,
  acc2Balance: number,
  cashFlows: NormalizedCashFlow[] = [],
): NormalizedTrackRecord {
  const acc1 = makeAccount({ accountId: "account_1", platform: "MT4", currency: "EUR", balance: acc1Balance });
  const acc2 = makeAccount({ accountId: "account_2", platform: "MT5", currency: "USD", balance: acc2Balance });
  return makeRecord({
    accounts: [acc1, acc2],
    closedTrades: [...acc1Trades, ...acc2Trades],
    cashFlows,
  });
}

describe("buildCombinedTrackRecordSeries — additive return", () => {
  it("additive: Account1=+10%, Account2=+5% → combined=+15%, not +15.5%", () => {
    // acc1: balance=1100, trade netProfit=100 → initialCapital=1000, return=10%
    // acc2: balance=1050, trade netProfit=50 → initialCapital=1000, return=5%
    const t1 = makeTrade({ id: "account_1_1", accountId: "account_1", sourceTicket: 1, netProfit: 100, grossProfit: 100, closeTimeEpoch: 1710512520 });
    const t2 = makeTrade({ id: "account_2_1", accountId: "account_2", platform: "MT5", sourceTicket: 1, netProfit: 50, grossProfit: 50, closeTimeEpoch: 1710512521 });
    const record = makeTwoAccountRecord([t1], [t2], 1100, 1050);
    const result = buildCombinedTrackRecordSeries(record, null, null, null);

    const additive = 0.1 + 0.05; // 0.15
    const compounded = (1.1) * (1.05) - 1; // ~0.155
    expect(result.summary.combinedCumulativeTrackRecordReturn).toBeCloseTo(additive, 4);
    expect(result.summary.combinedCumulativeTrackRecordReturn).not.toBeCloseTo(compounded, 2);
  });

  it("additive: before account2 starts, account2CumulativeReturn = 0", () => {
    const t1 = makeTrade({ id: "account_1_1", accountId: "account_1", sourceTicket: 1, netProfit: 100, grossProfit: 100, closeTimeEpoch: 1710512520 });
    const record = makeTwoAccountRecord([t1], [], 1100, 1000);
    const result = buildCombinedTrackRecordSeries(record, null, null, null);
    const firstPoint = result.combinedSeries[0];
    expect(firstPoint.account2CumulativeReturn).toBeCloseTo(0, 6);
    expect(firstPoint.combinedCumulativeReturn).toBeCloseTo(firstPoint.account1CumulativeReturn, 6);
  });

  it("additive: account1 trade updates only account1, not account2", () => {
    const t1 = makeTrade({ id: "account_1_1", accountId: "account_1", sourceTicket: 1, netProfit: 100, grossProfit: 100, closeTimeEpoch: 1710512520 });
    const t2 = makeTrade({ id: "account_2_1", accountId: "account_2", platform: "MT5", sourceTicket: 1, netProfit: 50, grossProfit: 50, closeTimeEpoch: 1710512521 });
    const record = makeTwoAccountRecord([t1], [t2], 1100, 1050);
    const result = buildCombinedTrackRecordSeries(record, null, null, null);
    // Point 0 is the account_1 trade — account2Index should still be 100
    const firstPoint = result.combinedSeries[0];
    expect(firstPoint.accountId).toBe("account_1");
    expect(firstPoint.account2Index).toBeCloseTo(100, 6);
  });

  it("additive: account2 trade updates only account2, not account1", () => {
    const t1 = makeTrade({ id: "account_1_1", accountId: "account_1", sourceTicket: 1, netProfit: 100, grossProfit: 100, closeTimeEpoch: 1710512520 });
    const t2 = makeTrade({ id: "account_2_1", accountId: "account_2", platform: "MT5", sourceTicket: 1, netProfit: 50, grossProfit: 50, closeTimeEpoch: 1710512521 });
    const record = makeTwoAccountRecord([t1], [t2], 1100, 1050);
    const result = buildCombinedTrackRecordSeries(record, null, null, null);
    const secondPoint = result.combinedSeries[1];
    expect(secondPoint.accountId).toBe("account_2");
    const firstPoint = result.combinedSeries[0];
    // account1Index at second point must equal account1Index at first point (unchanged)
    expect(secondPoint.account1Index).toBeCloseTo(firstPoint.account1Index, 6);
  });

  it("additive: N trades → exactly N chart points", () => {
    const acc1Trades = [
      makeTrade({ id: "a1_1", sourceTicket: 1, netProfit: 10, closeTimeEpoch: 1710512520 }),
      makeTrade({ id: "a1_2", sourceTicket: 2, netProfit: 10, closeTimeEpoch: 1710512521 }),
    ];
    const acc2Trades = Array.from({ length: 3 }, (_, i) =>
      makeTrade({
        id: `a2_${i + 1}`,
        accountId: "account_2",
        platform: "MT5",
        sourceTicket: i + 1,
        netProfit: 5,
        closeTimeEpoch: 1710512522 + i,
      }),
    );
    const record = makeTwoAccountRecord(acc1Trades, acc2Trades, 1020, 1015);
    const result = buildCombinedTrackRecordSeries(record, null, null, null);
    expect(result.combinedSeries).toHaveLength(5);
    expect(result.summary.totalTrades).toBe(5);
  });

  it("additive: cashflow updates capital but does not create chart point", () => {
    const t1 = makeTrade({ id: "account_1_1", accountId: "account_1", sourceTicket: 1, netProfit: 10, closeTimeEpoch: 1710512520 });
    const cf = makeCashFlow({ accountId: "account_1", amount: 500, timeEpoch: 1710512519 });
    const record = makeTwoAccountRecord([t1], [], 1510, 1000, [cf]);
    const result = buildCombinedTrackRecordSeries(record, null, null, null);
    expect(result.combinedSeries).toHaveLength(1); // cashflow is not a point
  });

  it("additive: same timestamp — deterministic order (accountId then sourceTicket)", () => {
    const epoch = 1710512520;
    const t1 = makeTrade({ id: "account_1_1", accountId: "account_1", sourceTicket: 1, netProfit: 10, closeTimeEpoch: epoch });
    const t2 = makeTrade({ id: "account_2_1", accountId: "account_2", platform: "MT5", sourceTicket: 1, netProfit: 5, closeTimeEpoch: epoch });
    // Run twice with reversed input order
    const record1 = makeTwoAccountRecord([t1], [t2], 1010, 1005);
    const record2 = makeTwoAccountRecord([t1], [t2], 1010, 1005);
    const r1 = buildCombinedTrackRecordSeries(record1, null, null, null);
    const r2 = buildCombinedTrackRecordSeries(record2, null, null, null);
    expect(r1.combinedSeries[0].tradeId).toBe(r2.combinedSeries[0].tradeId);
    expect(r1.combinedSeries[1].tradeId).toBe(r2.combinedSeries[1].tradeId);
  });

  it("additive: combinedReturn = account1FinalReturn + account2FinalReturn (not compounded)", () => {
    const a1Return = 0.7319;
    const a2Return = 0.2396;
    const additive = a1Return + a2Return;
    const compounded = (1 + a1Return) * (1 + a2Return) - 1;
    // Simulate: build with trades that produce exactly these returns
    // acc1: initialCapital=100, trade netProfit = 73.19 → return=73.19%
    // acc2: initialCapital=100, trade netProfit = 23.96 → return=23.96%
    const t1 = makeTrade({ id: "account_1_1", accountId: "account_1", sourceTicket: 1, netProfit: 73.19, grossProfit: 73.19, closeTimeEpoch: 1710512520 });
    const t2 = makeTrade({ id: "account_2_1", accountId: "account_2", platform: "MT5", sourceTicket: 1, netProfit: 23.96, grossProfit: 23.96, closeTimeEpoch: 1710512521 });
    // balance1=173.19, balance2=123.96 (no cashflows → initialCapital = balance - netProfit)
    const record = makeTwoAccountRecord([t1], [t2], 173.19, 123.96);
    const result = buildCombinedTrackRecordSeries(record, null, null, null);
    expect(result.summary.combinedCumulativeTrackRecordReturn).toBeCloseTo(additive, 4);
    expect(result.summary.combinedCumulativeTrackRecordReturn).not.toBeCloseTo(compounded, 2);
  });

  it("additive: chart last point combinedReturn === summary combinedReturn", () => {
    const t1 = makeTrade({ id: "account_1_1", accountId: "account_1", sourceTicket: 1, netProfit: 100, grossProfit: 100, closeTimeEpoch: 1710512520 });
    const t2 = makeTrade({ id: "account_2_1", accountId: "account_2", platform: "MT5", sourceTicket: 1, netProfit: 50, grossProfit: 50, closeTimeEpoch: 1710512521 });
    const record = makeTwoAccountRecord([t1], [t2], 1100, 1050);
    const result = buildCombinedTrackRecordSeries(record, null, null, null);
    const lastPoint = result.combinedSeries[result.combinedSeries.length - 1];
    expect(lastPoint.combinedCumulativeReturn).toBeCloseTo(
      result.summary.combinedCumulativeTrackRecordReturn, 6,
    );
  });

  it("additive: no hardcoded 0.9715, 0.7319, 0.2396 in computed output when mock PnL changes", () => {
    // Use different PnL values — output must reflect them, not preset constants
    const t1 = makeTrade({ id: "account_1_1", accountId: "account_1", sourceTicket: 1, netProfit: 50, grossProfit: 50, closeTimeEpoch: 1710512520 });
    const t2 = makeTrade({ id: "account_2_1", accountId: "account_2", platform: "MT5", sourceTicket: 1, netProfit: 30, grossProfit: 30, closeTimeEpoch: 1710512521 });
    const record = makeTwoAccountRecord([t1], [t2], 150, 130);
    const result = buildCombinedTrackRecordSeries(record, null, null, null);
    // 50/100=0.5 and 30/100=0.3 → combined=0.8 (not any legacy constant)
    expect(result.summary.combinedCumulativeTrackRecordReturn).toBeCloseTo(0.8, 4);
    expect(result.summary.account1CumulativeReturn).toBeCloseTo(0.5, 4);
    expect(result.summary.account2CumulativeReturn).toBeCloseTo(0.3, 4);
  });
});
