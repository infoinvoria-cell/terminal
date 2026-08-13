/**
 * Combined portfolio engine.
 * Computes a daily FX-neutral, capital-weighted combined return from two accounts.
 * Pure functions — no I/O, no side effects.
 */

import type {
  NormalizedTrackRecord,
  NormalizedTrade,
  NormalizedCashFlow,
} from "./normalized-types";
import type { FxRateMap } from "./fx-rates";
import { getClosestEurUsdRate } from "./fx-rates";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccountDailyPoint {
  dateUtc: string;
  accountId: string;
  currency: string;
  beginningBalance: number;
  tradingPnl: number;
  deposits: number;
  withdrawals: number;
  credits: number;
  fees: number;
  netExternalCashFlow: number;
  endingBalance: number;
  dailyReturn: number | null;
  reasonCode: string;
}

export interface PortfolioDailyPoint {
  dateUtc: string;
  accountContributions: Record<
    string,
    {
      weight: number;
      localDailyReturn: number | null;
      beginningCapital: number;
      convertedBeginningCapital: number;
      currency: string;
      reasonCode: string;
    }
  >;
  activeAccountCount: number;
  portfolioDailyReturn: number | null;
  portfolioIndex: number;
  /** Cumulative return as a fraction (not percent): portfolioIndex/100 - 1. Matches summary.totalReturn on last point. */
  cumulativeReturn: number;
  fxRatesUsed: Record<string, number | null>;
  warnings: string[];
  dataStatus: "active" | "no_activity";
}

export interface PortfolioSummary {
  totalReturn: number | null;
  annualizedReturn: number | null;
  maxDrawdown: number | null;
  volatility: number | null;
  sharpe: number | null;
  calmar: number | null;
  positiveMonths: number | null;
  totalMonths: number | null;
  profitFactor: number | null;
  startDateUtc: string | null;
  endDateUtc: string | null;
  totalTrades: number;
  assetsUnderManagementEur: number | null;
}

export interface AccountReconciliation {
  accountId: string;
  currency: string;
  inferredInitialCapital: number;
  sumClosedTradeNetProfit: number;
  sumDeposits: number;
  sumWithdrawals: number;
  sumCredits: number;
  sumFees: number;
  sumAdjustments: number;
  reconstructedCurrentBalance: number;
  latestSnapshotBalance: number;
  reconciliationDifference: number;
  reconciliationDifferencePercent: number;
  reconciliationStatus: "exact" | "within_rounding_tolerance" | "mismatch" | "insufficient_history";
  earliestTradeCloseUtc: string | null;
  latestTradeCloseUtc: string | null;
  tradeCount: number;
  cashFlowCount: number;
}

export interface AccountCoverage {
  accountId: string;
  earliestTradeCloseUtc: string | null;
  earliestTradeOpenUtc: string | null;
  earliestCashFlowUtc: string | null;
  earliestEvidenceUtc: string | null;
  latestTradeCloseUtc: string | null;
  latestSnapshotUtc: string | null;
  tradeCount: number;
  cashFlowCount: number;
  historyCoverageStatus: "complete" | "partial" | "insufficient";
  missingFromUtc: string | null;
  missingToUtc: string | null;
}

export interface CombinedTrade {
  id: string;
  accountId: string;
  platform: string;
  broker: string;
  sourceTicket: string;
  symbol: string;
  side: string;
  volume: number;
  openTimeUtc: string;
  closeTimeUtc: string;
  openPrice: number;
  closePrice: number;
  grossProfit: number;
  commission: number;
  swap: number;
  fees: number;
  netProfit: number;
  accountCurrency: string;
  source: string;
}

export interface CombinedCashFlow {
  id: string;
  accountId: string;
  type: string;
  timeUtc: string;
  amount: number;
  currency: string;
  comment: string;
  source: string;
}

export interface CombinedPortfolioResult {
  method: "fx_neutral_weighted_portfolio_return";
  baseCurrency: "EUR";
  startDate: string;
  endDate: string;
  startIndex: 100;
  endIndex: number;
  totalReturn: number;
  summary: PortfolioSummary;
  coverage: {
    status: "complete" | "partial";
    startDateUtc: string;
    endDateUtc: string;
    missingRanges: Array<{ fromUtc: string; toUtc: string; reasonCode: string }>;
    note: string;
  };
  dailyPoints: PortfolioDailyPoint[];
  accountDailyPoints: Record<string, AccountDailyPoint[]>;
  combinedTrades: CombinedTrade[];
  combinedCashFlows: CombinedCashFlow[];
  reconciliation: AccountReconciliation[];
  diagnostics: {
    naiveCombinedReturn: number;
    correctPortfolioReturn: number;
    account1TotalReturn: number;
    account2TotalReturn: number;
    legacyNote: string;
    daysWithMissingFx: number;
    daysWithNullReturn: number;
    totalTrades: number;
    account1Trades: number;
    account2Trades: number;
    totalCashFlows: number;
    dailySeriesPointCount: number;
    expectedCalendarDays: number;
  };
  warnings: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract UTC date string from ISO-8601 — always uses UTC regardless of local TZ */
function toUtcDateString(isoString: string): string {
  return isoString.slice(0, 10); // "2024-03-15T14:22:00Z" → "2024-03-15"
}

/** Enumerate all UTC calendar dates between startDate and endDate inclusive */
function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Modified Dietz daily return.
 * beginningBalance: balance at start of UTC day
 * endingBalance:    balance at end of UTC day (after trading + cashflows)
 * cashFlows:        cashflows that occurred during this UTC day
 */
function modifiedDietz(
  beginningBalance: number,
  endingBalance: number,
  cashFlows: Array<{ timeUtc: string; amount: number; dateUtc: string }>,
): { return: number | null; reasonCode: string } {
  const dayFlowsTotal = cashFlows.reduce((s, cf) => s + cf.amount, 0);

  const weightedFlows = cashFlows.reduce((s, cf) => {
    const tEpoch = new Date(cf.timeUtc).getTime() / 1000;
    const dayStart = new Date(cf.dateUtc + "T00:00:00Z").getTime() / 1000;
    // weight = fraction of day remaining after cashflow
    const weight = Math.max(0, Math.min(1, (86399 - (tEpoch - dayStart)) / 86399));
    return s + weight * cf.amount;
  }, 0);

  const numerator = endingBalance - beginningBalance - dayFlowsTotal;
  const denominator = beginningBalance + weightedFlows;

  if (!isFinite(denominator) || denominator <= 0) {
    return { return: null, reasonCode: "denominator_lte_zero" };
  }
  if (!isFinite(numerator)) {
    return { return: null, reasonCode: "numerator_not_finite" };
  }
  return { return: numerator / denominator, reasonCode: "modified_dietz" };
}

// ── Per-account daily point builder ──────────────────────────────────────────

function buildAccountDailyPoints(
  trades: NormalizedTrade[],
  cashFlows: NormalizedCashFlow[],
  accountId: string,
  currency: string,
  initialBalance: number,
  allDates: string[],
): AccountDailyPoint[] {
  // Group trades by UTC close date
  const tradePnlByDate = new Map<string, number>();
  for (const t of trades) {
    if (t.accountId !== accountId || t.status !== "closed") continue;
    const d = toUtcDateString(t.closeTimeUtc);
    tradePnlByDate.set(d, (tradePnlByDate.get(d) ?? 0) + t.netProfit);
  }

  // Group cashflows by UTC date
  const cfByDate = new Map<
    string,
    Array<{ timeUtc: string; amount: number; dateUtc: string; type: string }>
  >();
  for (const cf of cashFlows) {
    if (cf.accountId !== accountId) continue;
    const d = toUtcDateString(cf.timeUtc);
    if (!cfByDate.has(d)) cfByDate.set(d, []);
    cfByDate.get(d)!.push({
      timeUtc: cf.timeUtc,
      amount: cf.amount,
      dateUtc: d,
      type: cf.type,
    });
  }

  const points: AccountDailyPoint[] = [];
  let runningBalance = initialBalance;

  for (const dateUtc of allDates) {
    const pnl = tradePnlByDate.get(dateUtc) ?? 0;
    const cfsToday = cfByDate.get(dateUtc) ?? [];

    const deposits = cfsToday
      .filter((c) => c.type === "deposit")
      .reduce((s, c) => s + c.amount, 0);
    const withdrawals = cfsToday
      .filter((c) => c.type === "withdrawal")
      .reduce((s, c) => s + c.amount, 0);
    const credits = cfsToday
      .filter((c) => c.type === "credit")
      .reduce((s, c) => s + c.amount, 0);
    const fees = cfsToday
      .filter((c) => c.type === "fee")
      .reduce((s, c) => s + c.amount, 0);
    const netExternal = deposits + withdrawals + credits + fees;

    const beginningBalance = runningBalance;
    const endingBalance = beginningBalance + pnl + netExternal;
    runningBalance = endingBalance;

    const { return: dr, reasonCode } = modifiedDietz(
      beginningBalance,
      endingBalance,
      cfsToday,
    );

    points.push({
      dateUtc,
      accountId,
      currency,
      beginningBalance,
      tradingPnl: pnl,
      deposits,
      withdrawals,
      credits,
      fees,
      netExternalCashFlow: netExternal,
      endingBalance,
      dailyReturn: dr,
      reasonCode,
    });
  }

  return points;
}

// ── Initial balance inference ─────────────────────────────────────────────────

/**
 * Infer the account's balance at the start of the trade history window.
 * Formula: initialBalance = currentBalance − sum(netProfit) − sum(cashFlows)
 *
 * This handles accounts whose MT4/MT5 history doesn't include the original
 * opening deposit (the account was pre-funded before the tracked history starts).
 * This is NOT a hardcoded correction — it is derived entirely from the live
 * account snapshot balance and the trade/cashflow records we have.
 *
 * Returns 0 (clamped) if the computation yields negative (shouldn't happen with
 * complete data, but safeguards against edge cases).
 */
function inferInitialBalance(
  currentBalance: number,
  trades: NormalizedTrade[],
  cashFlows: NormalizedCashFlow[],
  accountId: string,
): number {
  const totalNetProfit = trades
    .filter((t) => t.accountId === accountId && t.status === "closed")
    .reduce((s, t) => s + t.netProfit, 0);

  const totalCashFlows = cashFlows
    .filter((cf) => cf.accountId === accountId)
    .reduce((s, cf) => s + cf.amount, 0);

  const inferred = currentBalance - totalNetProfit - totalCashFlows;
  // Allow small negative due to floating point; clamp to 0 minimum
  return Math.max(0, inferred);
}

// ── Combined trade/cashflow builders ──────────────────────────────────────────

function buildCombinedTrades(
  trades: NormalizedTrade[],
  accounts: NormalizedTrackRecord["accounts"],
): CombinedTrade[] {
  const currencyByAccount: Record<string, string> = {};
  for (const a of accounts) currencyByAccount[a.accountId] = a.currency;

  const combined: CombinedTrade[] = trades
    .filter((t) => t.status === "closed")
    .map((t) => ({
      id: t.id,
      accountId: t.accountId,
      platform: t.platform,
      broker: t.broker,
      sourceTicket: String(t.sourceTicket),
      symbol: t.symbol,
      side: t.side,
      volume: t.volume,
      openTimeUtc: t.openTimeUtc,
      closeTimeUtc: t.closeTimeUtc,
      openPrice: t.openPrice,
      closePrice: t.closePrice,
      grossProfit: t.grossProfit,
      commission: t.commission,
      swap: t.swap,
      fees: t.fees,
      netProfit: t.netProfit,
      accountCurrency: currencyByAccount[t.accountId] ?? "?",
      source: t.source,
    }));

  combined.sort((a, b) => {
    if (a.closeTimeUtc < b.closeTimeUtc) return -1;
    if (a.closeTimeUtc > b.closeTimeUtc) return 1;
    return a.accountId.localeCompare(b.accountId);
  });

  return combined;
}

function buildCombinedCashFlows(cashFlows: NormalizedCashFlow[]): CombinedCashFlow[] {
  return cashFlows.map((cf) => ({
    id: cf.id,
    accountId: cf.accountId,
    type: cf.type,
    timeUtc: cf.timeUtc,
    amount: cf.amount,
    currency: cf.currency,
    comment: cf.comment,
    source: cf.source,
  }));
}

// ── Single-account total return (naive, for diagnostics) ──────────────────────

function computeAccountTotalReturn(points: AccountDailyPoint[]): number {
  // Chain-link all daily returns
  let index = 1;
  for (const p of points) {
    if (p.dailyReturn !== null) {
      index *= 1 + p.dailyReturn;
    }
  }
  return index - 1;
}

// ── KPI computation from daily series ────────────────────────────────────────

function daysBetween(startUtc: string, endUtc: string): number {
  const s = new Date(startUtc + "T00:00:00Z").getTime();
  const e = new Date(endUtc + "T00:00:00Z").getTime();
  return (e - s) / 86400000;
}

function computePortfolioSummary(
  dailyPoints: PortfolioDailyPoint[],
  combinedTrades: CombinedTrade[],
  accounts: NormalizedTrackRecord["accounts"],
  fxRates: FxRateMap,
  startDate: string,
  endDate: string,
  endIndex: number,
): PortfolioSummary {
  const totalReturn = endIndex / 100 - 1;

  // ── Annualized Return ──────────────────────────────────────────────────────
  const elapsedDays = daysBetween(startDate, endDate);
  const annualizedReturn =
    elapsedDays > 30 ? Math.pow(endIndex / 100, 365.2425 / elapsedDays) - 1 : null;

  // ── Max Drawdown (from full daily series) ──────────────────────────────────
  let peak = dailyPoints[0]?.portfolioIndex ?? 100;
  let maxDD = 0;
  for (const p of dailyPoints) {
    if (p.portfolioIndex > peak) peak = p.portfolioIndex;
    const dd = (p.portfolioIndex - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  const maxDrawdown = dailyPoints.length > 0 ? maxDD : null;

  // ── Volatility + Sharpe ────────────────────────────────────────────────────
  const validReturns = dailyPoints
    .filter((p) => p.portfolioDailyReturn !== null)
    .map((p) => p.portfolioDailyReturn!);

  let volatility: number | null = null;
  let sharpe: number | null = null;

  if (validReturns.length > 1) {
    const mean = validReturns.reduce((s, r) => s + r, 0) / validReturns.length;
    const variance =
      validReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (validReturns.length - 1);
    volatility = Math.sqrt(variance) * Math.sqrt(252);

    const riskFreeDaily = 0.04 / 252;
    const excessReturns = validReturns.map((r) => r - riskFreeDaily);
    const excessMean = excessReturns.reduce((s, r) => s + r, 0) / excessReturns.length;
    const excessVar =
      excessReturns.reduce((s, r) => s + (r - excessMean) ** 2, 0) / (excessReturns.length - 1);
    const excessStd = Math.sqrt(excessVar);
    sharpe = excessStd > 0 ? (excessMean / excessStd) * Math.sqrt(252) : null;
  }

  // ── Calmar ─────────────────────────────────────────────────────────────────
  const calmar =
    annualizedReturn !== null && maxDrawdown !== null && maxDrawdown !== 0
      ? annualizedReturn / Math.abs(maxDrawdown)
      : null;

  // ── Positive Months ────────────────────────────────────────────────────────
  const byMonth: Record<string, number[]> = {};
  for (const p of dailyPoints) {
    if (p.portfolioDailyReturn === null) continue;
    const month = p.dateUtc.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(p.portfolioDailyReturn);
  }
  let positiveMonths = 0;
  let totalMonths = 0;
  for (const returns of Object.values(byMonth)) {
    totalMonths++;
    const monthReturn = returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
    if (monthReturn > 0) positiveMonths++;
  }

  // ── Profit Factor (trades only) ────────────────────────────────────────────
  const grossProfit = combinedTrades
    .filter((t) => t.netProfit > 0)
    .reduce((s, t) => s + t.netProfit, 0);
  const grossLoss = Math.abs(
    combinedTrades.filter((t) => t.netProfit < 0).reduce((s, t) => s + t.netProfit, 0),
  );
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  // ── AUM in EUR ─────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const fxEntry = fxRates[today];
  const latestFxDate = Object.keys(fxRates).sort().at(-1);
  const latestFxEntry = latestFxDate ? fxRates[latestFxDate] : undefined;
  const currentEurUsd = fxEntry?.EURUSD ?? latestFxEntry?.EURUSD ?? null;

  let aumEur: number | null = null;
  if (currentEurUsd !== null) {
    let total = 0;
    for (const acct of accounts) {
      if (acct.currency === "EUR") {
        total += acct.balance;
      } else if (acct.currency === "USD") {
        total += acct.balance / currentEurUsd;
      }
    }
    aumEur = total;
  }

  return {
    totalReturn,
    annualizedReturn,
    maxDrawdown,
    volatility,
    sharpe,
    calmar,
    positiveMonths: totalMonths > 0 ? positiveMonths : null,
    totalMonths: totalMonths > 0 ? totalMonths : null,
    profitFactor,
    startDateUtc: startDate || null,
    endDateUtc: endDate || null,
    totalTrades: combinedTrades.length,
    assetsUnderManagementEur: aumEur,
  };
}

// ── Reconciliation per account ────────────────────────────────────────────────

function buildReconciliation(
  accounts: NormalizedTrackRecord["accounts"],
  closedTrades: NormalizedTrackRecord["closedTrades"],
  cashFlows: NormalizedTrackRecord["cashFlows"],
): AccountReconciliation[] {
  return accounts.map((acct) => {
    const accountId = acct.accountId;
    const accountTrades = closedTrades.filter(
      (t) => t.accountId === accountId && t.status === "closed",
    );
    const accountCfs = cashFlows.filter((cf) => cf.accountId === accountId);

    const sumNetProfit = accountTrades.reduce((s, t) => s + t.netProfit, 0);
    const sumDeposits = accountCfs
      .filter((cf) => cf.type === "deposit")
      .reduce((s, cf) => s + cf.amount, 0);
    const sumWithdrawals = accountCfs
      .filter((cf) => cf.type === "withdrawal")
      .reduce((s, cf) => s + cf.amount, 0);
    const sumCredits = accountCfs
      .filter((cf) => cf.type === "credit")
      .reduce((s, cf) => s + cf.amount, 0);
    const sumFees = accountCfs
      .filter((cf) => cf.type === "fee")
      .reduce((s, cf) => s + cf.amount, 0);
    const sumAdjustments = accountCfs
      .filter((cf) => cf.type === "adjustment")
      .reduce((s, cf) => s + cf.amount, 0);
    const totalCfSum = sumDeposits + sumWithdrawals + sumCredits + sumFees + sumAdjustments;

    const inferredInitial = Math.max(0, acct.balance - sumNetProfit - totalCfSum);
    const reconstructed = inferredInitial + sumNetProfit + totalCfSum;
    const diff = Math.abs(reconstructed - acct.balance);
    const diffPct = acct.balance > 0 ? diff / acct.balance : 0;

    let status: AccountReconciliation["reconciliationStatus"];
    if (diff < 0.001) {
      status = "exact";
    } else if (diffPct < 0.01) {
      status = "within_rounding_tolerance";
    } else if (accountTrades.length === 0 && accountCfs.length === 0) {
      status = "insufficient_history";
    } else {
      status = "mismatch";
    }

    const closeTimes = accountTrades.map((t) => t.closeTimeUtc).sort();
    const openTimes = accountTrades.map((t) => t.openTimeUtc).sort();

    return {
      accountId,
      currency: acct.currency,
      inferredInitialCapital: inferredInitial,
      sumClosedTradeNetProfit: sumNetProfit,
      sumDeposits,
      sumWithdrawals,
      sumCredits,
      sumFees,
      sumAdjustments,
      reconstructedCurrentBalance: reconstructed,
      latestSnapshotBalance: acct.balance,
      reconciliationDifference: diff,
      reconciliationDifferencePercent: diffPct,
      reconciliationStatus: status,
      earliestTradeCloseUtc: closeTimes[0] ?? null,
      latestTradeCloseUtc: closeTimes.at(-1) ?? null,
      tradeCount: accountTrades.length,
      cashFlowCount: accountCfs.length,
    };
  });
}

// ── Trade-event series ────────────────────────────────────────────────────────

export interface TradePerformancePoint {
  sequence: number;
  tradeId: string;
  accountId: string;
  closeTimeUtc: string;
  closeTimeEpoch: number;
  symbol: string;
  side: "buy" | "sell";
  netProfitLocal: number;
  accountCurrency: string;
  portfolioCapitalBeforeEur: number;
  account1CapitalBeforeEur: number | null;
  account2CapitalBeforeEur: number | null;
  fxRateUsed: number | null;
  tradeReturnOnPortfolio: number;
  cumulativeIndex: number;
  cumulativeReturn: number;
  source: string;
}

/**
 * Build a trade-event performance series: one point per closed trade,
 * in chronological order. This is the authoritative chart series for the
 * home page performance line — it reflects every actual trade event with no
 * calendar filler.
 *
 * Algorithm:
 * 1. Reconstruct each account's running balance backwards from the live snapshot.
 * 2. Process events forward chronologically, computing portfolio capital at each
 *    trade close, then updating the cumulative performance index.
 * 3. Cash flows update the running balance but do NOT produce a chart point.
 */
export function buildTradeEventSeries(
  trades: NormalizedTrade[],
  cashFlows: NormalizedCashFlow[],
  accounts: NormalizedTrackRecord["accounts"],
  fxRates: FxRateMap = {},
): {
  series: TradePerformancePoint[];
  finalIndex: number;
  finalReturn: number;
  warnings: string[];
} {
  const warnings: string[] = [];

  const closedTrades = trades.filter((t) => t.status === "closed");
  if (closedTrades.length === 0) {
    return { series: [], finalIndex: 100, finalReturn: 0, warnings };
  }

  // Currency map
  const currencyByAccount: Record<string, string> = {};
  const balanceByAccount: Record<string, number> = {};
  for (const acct of accounts) {
    currencyByAccount[acct.accountId] = acct.currency;
    balanceByAccount[acct.accountId] = acct.balance;
  }

  // ── Reconstruct per-account balance history ─────────────────────────────────
  // We process all events (trades + cashflows) in reverse chronological order,
  // starting from the live snapshot balance, to reconstruct the running balance
  // at each point in time.

  type BalanceEvent = {
    epoch: number;
    accountId: string;
    delta: number;         // positive = added money/profit, negative = removed
    isTrade: boolean;
    tradeId?: string;
  };

  const allEvents: BalanceEvent[] = [];

  for (const t of closedTrades) {
    allEvents.push({
      epoch:     t.closeTimeEpoch,
      accountId: t.accountId,
      delta:     t.netProfit,
      isTrade:   true,
      tradeId:   t.id,
    });
  }
  for (const cf of cashFlows) {
    allEvents.push({
      epoch:     cf.timeEpoch,
      accountId: cf.accountId,
      delta:     cf.amount,
      isTrade:   false,
    });
  }

  // Sort in reverse chronological order (latest first) for backwards reconstruction
  allEvents.sort(
    (a, b) => b.epoch - a.epoch || (b.isTrade ? 1 : -1) || b.accountId.localeCompare(a.accountId)
  );

  // Running balance starts at live snapshot; we subtract each event as we go backwards
  const runningBalances: Record<string, number> = { ...balanceByAccount };

  // Map from event key → balance BEFORE this event
  // For trades: key = tradeId
  // For cashflows: we store by index in allEvents
  const balanceBeforeTrade: Record<string, Record<string, number>> = {};
  // keyed by accountId → { tradeId → balanceBefore }

  for (const ev of allEvents) {
    if (!(ev.accountId in runningBalances)) {
      runningBalances[ev.accountId] = 0;
    }
    // current runningBalance is the balance AFTER this event
    const balanceAfter = runningBalances[ev.accountId];
    const balanceBefore = balanceAfter - ev.delta;
    runningBalances[ev.accountId] = balanceBefore;

    if (ev.isTrade && ev.tradeId) {
      if (!balanceBeforeTrade[ev.accountId]) balanceBeforeTrade[ev.accountId] = {};
      balanceBeforeTrade[ev.accountId][ev.tradeId] = balanceBefore;
    }
  }

  // ── Build forward series ─────────────────────────────────────────────────────
  // Sort trades chronologically (stable: epoch, accountId, tradeId)
  const sortedTrades = [...closedTrades].sort(
    (a, b) =>
      a.closeTimeEpoch - b.closeTimeEpoch ||
      a.accountId.localeCompare(b.accountId) ||
      a.id.localeCompare(b.id)
  );

  const series: TradePerformancePoint[] = [];
  let cumulativeIndex = 100;
  let sequence = 0;

  for (const trade of sortedTrades) {
    sequence++;
    const dateStr  = toUtcDateString(trade.closeTimeUtc);
    const currency = currencyByAccount[trade.accountId] ?? "EUR";

    // Balance BEFORE this trade closed on this account
    const localBalanceBefore =
      balanceBeforeTrade[trade.accountId]?.[trade.id] ?? 0;

    // Convert to EUR
    let eurUsd: number | null = null;
    let accountEurCapital: number;
    if (currency === "EUR") {
      accountEurCapital = localBalanceBefore;
    } else if (currency === "USD") {
      eurUsd = getClosestEurUsdRate(fxRates, dateStr);
      if (eurUsd !== null) {
        accountEurCapital = localBalanceBefore / eurUsd;
      } else {
        // No FX rate: use local value as fallback, emit warning once
        accountEurCapital = localBalanceBefore;
        warnings.push(`fx_missing: no EURUSD rate for ${dateStr}, trade ${trade.id} — USD balance used without conversion`);
      }
    } else {
      accountEurCapital = localBalanceBefore;
      warnings.push(`unsupported_currency: ${currency} for account ${trade.accountId}, trade ${trade.id}`);
    }

    // Compute total portfolio capital before this trade (sum across all accounts)
    let totalPortfolioEur = 0;
    const acc1Id = accounts.find((a) => a.platform === "MT4")?.accountId ?? "account_1";
    const acc2Id = accounts.find((a) => a.platform === "MT5")?.accountId ?? "account_2";
    let acc1EurCapital: number | null = null;
    let acc2EurCapital: number | null = null;

    for (const acct of accounts) {
      const acctCurrency = currencyByAccount[acct.accountId] ?? "EUR";
      // The balance before this trade for *other* accounts = their balance at this same epoch
      // We use the backwards reconstruction for the trading account; for other accounts
      // we use the reconstructed balance at this epoch.
      let acctLocalBal: number;
      if (acct.accountId === trade.accountId) {
        acctLocalBal = localBalanceBefore;
      } else {
        // Reconstruct other account's balance at this epoch by replaying backwards
        // Start from live balance and subtract events after this trade's epoch
        acctLocalBal = balanceByAccount[acct.accountId] ?? 0;
        for (const ev of allEvents) {
          if (ev.accountId !== acct.accountId) continue;
          if (ev.epoch > trade.closeTimeEpoch) {
            acctLocalBal -= ev.delta;
          } else if (ev.epoch === trade.closeTimeEpoch && ev.isTrade && ev.tradeId !== trade.id) {
            // Same epoch but different trade on other account — subtract it
            acctLocalBal -= ev.delta;
          }
        }
      }

      let acctEurBal: number;
      if (acctCurrency === "EUR") {
        acctEurBal = acctLocalBal;
      } else if (acctCurrency === "USD") {
        const rate = eurUsd ?? getClosestEurUsdRate(fxRates, dateStr);
        acctEurBal = rate !== null ? acctLocalBal / rate : acctLocalBal;
      } else {
        acctEurBal = acctLocalBal;
      }

      if (acct.accountId === acc1Id) acc1EurCapital = acctEurBal;
      if (acct.accountId === acc2Id) acc2EurCapital = acctEurBal;
      totalPortfolioEur += Math.max(0, acctEurBal);
    }

    // Net profit in EUR
    let netProfitEur: number;
    if (currency === "EUR") {
      netProfitEur = trade.netProfit;
    } else if (currency === "USD") {
      const rate = eurUsd ?? getClosestEurUsdRate(fxRates, dateStr);
      netProfitEur = rate !== null ? trade.netProfit / rate : trade.netProfit;
    } else {
      netProfitEur = trade.netProfit;
    }

    // Trade return on portfolio
    const tradeReturn = totalPortfolioEur > 0 ? netProfitEur / totalPortfolioEur : 0;

    // Update cumulative index
    cumulativeIndex = cumulativeIndex * (1 + tradeReturn);

    series.push({
      sequence,
      tradeId:                   trade.id,
      accountId:                 trade.accountId,
      closeTimeUtc:              trade.closeTimeUtc,
      closeTimeEpoch:            trade.closeTimeEpoch,
      symbol:                    trade.symbol,
      side:                      trade.side,
      netProfitLocal:            trade.netProfit,
      accountCurrency:           currency,
      portfolioCapitalBeforeEur: totalPortfolioEur,
      account1CapitalBeforeEur:  acc1EurCapital,
      account2CapitalBeforeEur:  acc2EurCapital,
      fxRateUsed:                eurUsd,
      tradeReturnOnPortfolio:    tradeReturn,
      cumulativeIndex,
      cumulativeReturn:          cumulativeIndex / 100 - 1,
      source:                    trade.source,
    });
  }

  const finalIndex  = cumulativeIndex;
  const finalReturn = finalIndex / 100 - 1;

  // Invariant check
  if (series.length !== sortedTrades.length) {
    warnings.push(
      `invariant_violation: series.length (${series.length}) !== sortedTrades.length (${sortedTrades.length})`
    );
  }

  return { series, finalIndex, finalReturn, warnings };
}

// ── Per-account cumulative return (new primary method) ────────────────────────

export interface AccountCumulativePoint {
  sequence: number;
  tradeId: string;
  closeTimeEpoch: number;
  closeTimeUtc: string;
  symbol: string;
  side: "buy" | "sell";
  netProfit: number;
  currency: string;
  capitalBefore: number;
  capitalAfter: number;
  tradeReturn: number;
  accountIndex: number;
  accountCumulativeReturn: number;
}

export interface AccountCumulativeSeries {
  accountId: string;
  currency: string;
  initialCapital: number;
  finalIndex: number;
  finalCumulativeReturn: number;
  tradeCount: number;
  points: AccountCumulativePoint[];
}

export interface CombinedTrackRecordPoint {
  sequence: number;
  tradeId: string;
  accountId: string;
  closeTimeEpoch: number;
  closeTimeUtc: string;
  symbol: string;
  side: "buy" | "sell";
  account1Index: number;
  account2Index: number;
  account1CumulativeReturn: number;
  account2CumulativeReturn: number;
  combinedCumulativeReturn: number;
  source: string;
}

export interface CombinedTrackRecordSummary {
  combinedCumulativeTrackRecordReturn: number;
  account1CumulativeReturn: number;
  account2CumulativeReturn: number;
  portfolioTimeWeightedReturn: number | null;
  portfolioTradeEventReturn: number | null;
  annualizedReturn: number | null;
  maxDrawdown: number | null;
  volatility: number | null;
  sharpe: number | null;
  calmar: number | null;
  positiveMonths: number | null;
  totalMonths: number | null;
  profitFactor: number | null;
  startDateUtc: string;
  endDateUtc: string;
  totalTrades: number;
  account1Trades: number;
  account2Trades: number;
  assetsUnderManagementEur: number | null;
  inceptionStartUtc: string;
}

export interface LegacyComparison {
  legacyAccount1Return: number;
  legacyAccount2Return: number;
  legacyNaiveCombinedReturn: number;
  newAccount1Return: number;
  newAccount2Return: number;
  newCombinedReturn: number;
  account1DifferencePercentPoints: number;
  account2DifferencePercentPoints: number;
  combinedDifferencePercentPoints: number;
  note: string;
}

export interface CombinedTrackRecordResult {
  method: "additive_multi_account_cumulative_return";
  account1Series: AccountCumulativeSeries;
  account2Series: AccountCumulativeSeries;
  combinedSeries: CombinedTrackRecordPoint[];
  summary: CombinedTrackRecordSummary;
  legacyComparison: LegacyComparison;
  warnings: string[];
}

/**
 * Build a per-account chain-linked cumulative return series.
 *
 * Algorithm:
 * 1. Compute initialCapital = snapshotBalance - sum(netProfit) - sum(cashflows)
 * 2. Process events chronologically: cashflows update capital (no chart point),
 *    trades update the chain-linked index and emit a point.
 *
 * netProfit is used directly — it already includes commission + swap + fees
 * per the NormalizedTrade definition (netProfit = grossProfit + commission + swap + fees).
 */
export function buildAccountCumulativeSeries(
  trades: NormalizedTrade[],
  cashFlows: NormalizedCashFlow[],
  snapshotBalance: number,
  accountId: string,
  currency: string,
): AccountCumulativeSeries {
  const accountTrades = trades
    .filter((t) => t.accountId === accountId && t.status === "closed")
    .sort((a, b) => a.closeTimeEpoch - b.closeTimeEpoch || a.sourceTicket - b.sourceTicket);

  const accountCashFlows = cashFlows
    .filter((cf) => cf.accountId === accountId)
    .sort((a, b) => a.timeEpoch - b.timeEpoch);

  // initialCapital = snapshotBalance − Σ(netProfit) − Σ(cashflows)
  const sumNetProfit = accountTrades.reduce((s, t) => s + t.netProfit, 0);
  const sumCashFlows = accountCashFlows.reduce((s, cf) => s + cf.amount, 0);
  const initialCapital = Math.max(0, snapshotBalance - sumNetProfit - sumCashFlows);

  let accountIndex = 100;
  let runningCapital = initialCapital;

  type Ev =
    | { type: "trade"; trade: NormalizedTrade; epoch: number }
    | { type: "cashflow"; cf: NormalizedCashFlow; epoch: number };

  const events: Ev[] = [
    ...accountTrades.map((t) => ({ type: "trade" as const, trade: t, epoch: t.closeTimeEpoch })),
    ...accountCashFlows.map((cf) => ({ type: "cashflow" as const, cf, epoch: cf.timeEpoch })),
  ];
  // Cashflows before trades at same epoch; otherwise chronological
  events.sort(
    (a, b) => a.epoch - b.epoch || (a.type === "cashflow" ? -1 : 1),
  );

  const points: AccountCumulativePoint[] = [];
  let sequence = 0;

  for (const ev of events) {
    if (ev.type === "cashflow") {
      runningCapital += ev.cf.amount;
    } else {
      const t = ev.trade;
      const capitalBefore = runningCapital;
      const tradeReturn = capitalBefore > 0 ? t.netProfit / capitalBefore : 0;
      accountIndex = accountIndex * (1 + tradeReturn);
      runningCapital += t.netProfit;
      sequence++;
      points.push({
        sequence,
        tradeId: t.id,
        closeTimeEpoch: t.closeTimeEpoch,
        closeTimeUtc: t.closeTimeUtc,
        symbol: t.symbol,
        side: t.side,
        netProfit: t.netProfit,
        currency,
        capitalBefore,
        capitalAfter: runningCapital,
        tradeReturn,
        accountIndex,
        accountCumulativeReturn: accountIndex / 100 - 1,
      });
    }
  }

  return {
    accountId,
    currency,
    initialCapital,
    finalIndex: accountIndex,
    finalCumulativeReturn: accountIndex / 100 - 1,
    tradeCount: points.length,
    points,
  };
}

/**
 * Build the combined additive track record series and summary.
 *
 * Primary return formula:
 *   combinedCumulativeTrackRecordReturn = account1CumulativeReturn + account2CumulativeReturn
 *
 * NOT compounded: (1+a1)×(1+a2)−1 is intentionally NOT used.
 *
 * Each account's index is chain-linked independently. The combined return
 * at each chart point is the sum of the two accounts' individual cumulative returns.
 */
export function buildCombinedTrackRecordSeries(
  trackRecord: NormalizedTrackRecord,
  existingPortfolioSummary: PortfolioSummary | null,
  legacyDiagnostics: {
    account1TotalReturn: number;
    account2TotalReturn: number;
  } | null,
  portfolioTradeEventReturn: number | null,
): CombinedTrackRecordResult {
  const warnings: string[] = [...trackRecord.warnings];
  const { accounts, closedTrades, cashFlows } = trackRecord;

  const account1 = accounts.find((a) => a.platform === "MT4");
  const account2 = accounts.find((a) => a.platform === "MT5");

  if (!account1) warnings.push("missing_account: MT4 account not found");
  if (!account2) warnings.push("missing_account: MT5 account not found");

  const acc1Id = account1?.accountId ?? "account_1";
  const acc2Id = account2?.accountId ?? "account_2";
  const acc1Currency = account1?.currency ?? "EUR";
  const acc2Currency = account2?.currency ?? "USD";

  // ── Per-account series ────────────────────────────────────────────────────────
  const account1Series = buildAccountCumulativeSeries(
    closedTrades, cashFlows,
    account1?.balance ?? 0, acc1Id, acc1Currency,
  );
  const account2Series = buildAccountCumulativeSeries(
    closedTrades, cashFlows,
    account2?.balance ?? 0, acc2Id, acc2Currency,
  );

  // ── Combined chronological series ─────────────────────────────────────────────
  type CombinedEv =
    | { type: "trade"; trade: NormalizedTrade; epoch: number }
    | { type: "cashflow"; cf: NormalizedCashFlow; epoch: number };

  const allEvents: CombinedEv[] = [
    ...closedTrades
      .filter((t) => t.status === "closed")
      .map((t) => ({ type: "trade" as const, trade: t, epoch: t.closeTimeEpoch })),
    ...cashFlows.map((cf) => ({ type: "cashflow" as const, cf, epoch: cf.timeEpoch })),
  ];

  // Sort: cashflows before trades at same epoch, then accountId, then sourceTicket
  allEvents.sort((a, b) => {
    const epochDiff = a.epoch - b.epoch;
    if (epochDiff !== 0) return epochDiff;
    if (a.type !== b.type) return a.type === "cashflow" ? -1 : 1;
    if (a.type === "trade" && b.type === "trade") {
      const accDiff = a.trade.accountId.localeCompare(b.trade.accountId);
      if (accDiff !== 0) return accDiff;
      return a.trade.sourceTicket - b.trade.sourceTicket;
    }
    return 0;
  });

  let acc1Index = 100;
  let acc2Index = 100;
  let acc1Capital = account1Series.initialCapital;
  let acc2Capital = account2Series.initialCapital;

  const combinedSeries: CombinedTrackRecordPoint[] = [];
  let sequence = 0;

  for (const ev of allEvents) {
    if (ev.type === "cashflow") {
      if (ev.cf.accountId === acc1Id) {
        acc1Capital += ev.cf.amount;
      } else if (ev.cf.accountId === acc2Id) {
        acc2Capital += ev.cf.amount;
      }
    } else {
      const t = ev.trade;
      if (t.accountId === acc1Id) {
        const tradeReturn = acc1Capital > 0 ? t.netProfit / acc1Capital : 0;
        acc1Index = acc1Index * (1 + tradeReturn);
        acc1Capital += t.netProfit;
      } else if (t.accountId === acc2Id) {
        const tradeReturn = acc2Capital > 0 ? t.netProfit / acc2Capital : 0;
        acc2Index = acc2Index * (1 + tradeReturn);
        acc2Capital += t.netProfit;
      }
      sequence++;
      const acc1CumulativeReturn = acc1Index / 100 - 1;
      const acc2CumulativeReturn = acc2Index / 100 - 1;
      combinedSeries.push({
        sequence,
        tradeId: t.id,
        accountId: t.accountId,
        closeTimeEpoch: t.closeTimeEpoch,
        closeTimeUtc: t.closeTimeUtc,
        symbol: t.symbol,
        side: t.side,
        account1Index: acc1Index,
        account2Index: acc2Index,
        account1CumulativeReturn: acc1CumulativeReturn,
        account2CumulativeReturn: acc2CumulativeReturn,
        combinedCumulativeReturn: acc1CumulativeReturn + acc2CumulativeReturn,
        source: t.source,
      });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  const account1CumulativeReturn = account1Series.finalCumulativeReturn;
  const account2CumulativeReturn = account2Series.finalCumulativeReturn;
  const combinedCumulativeTrackRecordReturn = account1CumulativeReturn + account2CumulativeReturn;

  const allClosedTrades = closedTrades.filter((t) => t.status === "closed");
  const tradeDates = allClosedTrades.map((t) => t.closeTimeUtc.slice(0, 10)).sort();
  const inceptionStartUtc = tradeDates[0] ?? "";
  const endDateUtc = tradeDates[tradeDates.length - 1] ?? "";
  const elapsedDays = inceptionStartUtc && endDateUtc ? daysBetween(inceptionStartUtc, endDateUtc) : 0;

  // Annualized from additive combined (power approximation consistent with primary metric)
  const annualizedReturn =
    elapsedDays > 30
      ? Math.pow(1 + combinedCumulativeTrackRecordReturn, 365.2425 / elapsedDays) - 1
      : null;

  // Max drawdown from combined series (peak-to-trough in percentage points, not relative)
  let peak = -Infinity;
  let maxDD = 0;
  for (const p of combinedSeries) {
    if (p.combinedCumulativeReturn > peak) peak = p.combinedCumulativeReturn;
    const dd = p.combinedCumulativeReturn - peak;
    if (dd < maxDD) maxDD = dd;
  }
  const maxDrawdown = combinedSeries.length > 0 ? maxDD : null;

  // Calmar
  const calmar =
    annualizedReturn !== null && maxDrawdown !== null && maxDrawdown !== 0
      ? annualizedReturn / Math.abs(maxDrawdown)
      : null;

  // Profit factor from all trades (trade-level metric, currency-native)
  const grossProfit = allClosedTrades
    .filter((t) => t.netProfit > 0)
    .reduce((s, t) => s + t.netProfit, 0);
  const grossLoss = Math.abs(
    allClosedTrades.filter((t) => t.netProfit < 0).reduce((s, t) => s + t.netProfit, 0),
  );
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  // Volatility + Sharpe + Positive Months from existing daily portfolio series (Modified Dietz)
  const volatility = existingPortfolioSummary?.volatility ?? null;
  const sharpe = existingPortfolioSummary?.sharpe ?? null;
  const positiveMonths = existingPortfolioSummary?.positiveMonths ?? null;
  const totalMonths = existingPortfolioSummary?.totalMonths ?? null;
  const assetsUnderManagementEur = existingPortfolioSummary?.assetsUnderManagementEur ?? null;

  const account1Trades = allClosedTrades.filter((t) => t.accountId === acc1Id).length;
  const account2Trades = allClosedTrades.filter((t) => t.accountId === acc2Id).length;

  // ── Legacy comparison ─────────────────────────────────────────────────────────
  const legacyAccount1Return = legacyDiagnostics?.account1TotalReturn ?? 0;
  const legacyAccount2Return = legacyDiagnostics?.account2TotalReturn ?? 0;
  const legacyNaiveCombinedReturn = legacyAccount1Return + legacyAccount2Return;

  const legacyComparison: LegacyComparison = {
    legacyAccount1Return,
    legacyAccount2Return,
    legacyNaiveCombinedReturn,
    newAccount1Return: account1CumulativeReturn,
    newAccount2Return: account2CumulativeReturn,
    newCombinedReturn: combinedCumulativeTrackRecordReturn,
    account1DifferencePercentPoints: (account1CumulativeReturn - legacyAccount1Return) * 100,
    account2DifferencePercentPoints: (account2CumulativeReturn - legacyAccount2Return) * 100,
    combinedDifferencePercentPoints:
      (combinedCumulativeTrackRecordReturn - legacyNaiveCombinedReturn) * 100,
    note:
      "Legacy values are from prior daily Modified Dietz diagnostics (account-level chain-linked). " +
      "New values use per-account trade-event chain-linking, which handles intra-day cashflows more precisely.",
  };

  // ── Invariant check ───────────────────────────────────────────────────────────
  const expectedPoints = allClosedTrades.length;
  if (combinedSeries.length !== expectedPoints) {
    warnings.push(
      `invariant_violation: combinedSeries.length (${combinedSeries.length}) !== allClosedTrades.length (${expectedPoints})`,
    );
  }

  return {
    method: "additive_multi_account_cumulative_return",
    account1Series,
    account2Series,
    combinedSeries,
    summary: {
      combinedCumulativeTrackRecordReturn,
      account1CumulativeReturn,
      account2CumulativeReturn,
      portfolioTimeWeightedReturn: existingPortfolioSummary?.totalReturn ?? null,
      portfolioTradeEventReturn,
      annualizedReturn,
      maxDrawdown,
      volatility,
      sharpe,
      calmar,
      positiveMonths,
      totalMonths,
      profitFactor,
      startDateUtc: inceptionStartUtc,
      endDateUtc,
      totalTrades: allClosedTrades.length,
      account1Trades,
      account2Trades,
      assetsUnderManagementEur,
      inceptionStartUtc,
    },
    legacyComparison,
    warnings,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildCombinedPortfolio(
  trackRecord: NormalizedTrackRecord,
  fxRates: FxRateMap = {},
): CombinedPortfolioResult {
  const warnings: string[] = [...trackRecord.warnings];
  const { accounts, closedTrades, cashFlows } = trackRecord;

  // ── Determine date range ─────────────────────────────────────────────────
  const allTradeDates = closedTrades
    .filter((t) => t.status === "closed")
    .map((t) => toUtcDateString(t.closeTimeUtc));
  const allCfDates = cashFlows.map((cf) => toUtcDateString(cf.timeUtc));
  const allEventDates = [...allTradeDates, ...allCfDates].filter(Boolean).sort();

  if (allEventDates.length === 0) {
    // No data at all
    const empty: CombinedPortfolioResult = {
      method: "fx_neutral_weighted_portfolio_return",
      baseCurrency: "EUR",
      startDate: "",
      endDate: "",
      startIndex: 100,
      endIndex: 100,
      totalReturn: 0,
      summary: {
        totalReturn: null,
        annualizedReturn: null,
        maxDrawdown: null,
        volatility: null,
        sharpe: null,
        calmar: null,
        positiveMonths: null,
        totalMonths: null,
        profitFactor: null,
        startDateUtc: null,
        endDateUtc: null,
        totalTrades: 0,
        assetsUnderManagementEur: null,
      },
      coverage: {
        status: "partial",
        startDateUtc: "",
        endDateUtc: "",
        missingRanges: [],
        note: "No trade or cashflow data available.",
      },
      dailyPoints: [],
      accountDailyPoints: {},
      combinedTrades: [],
      combinedCashFlows: [],
      reconciliation: [],
      diagnostics: {
        naiveCombinedReturn: 0,
        correctPortfolioReturn: 0,
        account1TotalReturn: 0,
        account2TotalReturn: 0,
        legacyNote: "No data.",
        daysWithMissingFx: 0,
        daysWithNullReturn: 0,
        totalTrades: 0,
        account1Trades: 0,
        account2Trades: 0,
        totalCashFlows: 0,
        dailySeriesPointCount: 0,
        expectedCalendarDays: 0,
      },
      warnings: ["no_trade_or_cashflow_data"],
    };
    return empty;
  }

  const startDate = allEventDates[0];
  const endDate = allEventDates[allEventDates.length - 1];
  const allDates = enumerateDates(startDate, endDate);

  // ── Build per-account daily points ───────────────────────────────────────
  const accountDailyPoints: Record<string, AccountDailyPoint[]> = {};

  for (const acct of accounts) {
    const initialBalance = inferInitialBalance(
      acct.balance,
      closedTrades,
      cashFlows,
      acct.accountId,
    );
    accountDailyPoints[acct.accountId] = buildAccountDailyPoints(
      closedTrades,
      cashFlows,
      acct.accountId,
      acct.currency,
      initialBalance,
      allDates,
    );
  }

  // ── Build combined daily portfolio points ────────────────────────────────
  const dailyPoints: PortfolioDailyPoint[] = [];
  let portfolioIndex = 100;
  let daysWithMissingFx = 0;
  let daysWithNullReturn = 0;

  for (const dateUtc of allDates) {
    const pointsByAccount: Record<
      string,
      AccountDailyPoint
    > = {};
    for (const acct of accounts) {
      const pts = accountDailyPoints[acct.accountId];
      if (!pts) continue;
      const pt = pts.find((p) => p.dateUtc === dateUtc);
      if (pt) pointsByAccount[acct.accountId] = pt;
    }

    // FX: get EURUSD rate for this day
    const eurUsd = getClosestEurUsdRate(fxRates, dateUtc);
    const fxRatesUsed: Record<string, number | null> = { EURUSD: eurUsd };
    if (eurUsd === null) {
      daysWithMissingFx++;
    }

    // Determine beginning capital (converted to EUR) for each account
    const accountContributions: PortfolioDailyPoint["accountContributions"] = {};
    let totalConvertedCapital = 0;

    for (const acct of accounts) {
      const pt = pointsByAccount[acct.accountId];
      if (!pt) continue;

      // Convert beginning balance to EUR
      let convertedCapital: number;
      if (acct.currency === "EUR") {
        convertedCapital = pt.beginningBalance;
      } else if (acct.currency === "USD" && eurUsd !== null) {
        convertedCapital = pt.beginningBalance / eurUsd;
      } else {
        // Can't convert — use local value, emit warning only once (daysWithMissingFx covers it)
        convertedCapital = pt.beginningBalance;
      }

      accountContributions[acct.accountId] = {
        weight: 0, // filled in below
        localDailyReturn: pt.dailyReturn,
        beginningCapital: pt.beginningBalance,
        convertedBeginningCapital: convertedCapital,
        currency: acct.currency,
        reasonCode: pt.reasonCode,
      };

      if (convertedCapital > 0) {
        totalConvertedCapital += convertedCapital;
      }
    }

    // Assign weights and compute portfolio daily return
    let portfolioDailyReturn: number | null = null;
    let activeAccountCount = 0;
    const dayWarnings: string[] = [];

    if (totalConvertedCapital > 0) {
      // Weighted return: only accounts with non-null return and positive capital
      let weightedReturn = 0;
      let totalUsedCapital = 0;

      for (const [accountId, contrib] of Object.entries(accountContributions)) {
        if (contrib.localDailyReturn === null) continue;
        if (contrib.convertedBeginningCapital <= 0) continue;
        totalUsedCapital += contrib.convertedBeginningCapital;
        weightedReturn += contrib.convertedBeginningCapital * contrib.localDailyReturn;
        activeAccountCount++;
      }

      if (totalUsedCapital > 0) {
        portfolioDailyReturn = weightedReturn / totalUsedCapital;
      }

      // Assign weights (based on all capital, not just active)
      for (const contrib of Object.values(accountContributions)) {
        contrib.weight = contrib.convertedBeginningCapital / totalConvertedCapital;
      }
    } else {
      // All accounts have zero or negative capital — day before any deposits
      for (const contrib of Object.values(accountContributions)) {
        contrib.weight = 0;
      }
      activeAccountCount = 0;
    }

    if (portfolioDailyReturn === null) {
      daysWithNullReturn++;
    }

    if (eurUsd === null && accounts.length > 1) {
      dayWarnings.push(`fx_missing:${dateUtc}`);
    }

    // Chain-link
    if (portfolioDailyReturn !== null) {
      portfolioIndex = portfolioIndex * (1 + portfolioDailyReturn);
    }

    dailyPoints.push({
      dateUtc,
      accountContributions,
      activeAccountCount,
      portfolioDailyReturn,
      portfolioIndex,
      cumulativeReturn: portfolioIndex / 100 - 1,
      dataStatus:
        Object.values(accountContributions).some(
          (c) => c.localDailyReturn !== null && c.localDailyReturn !== 0,
        ) ||
        Object.values(accountContributions).some(
          (c) => c.beginningCapital > 0,
        )
          ? "active"
          : "no_activity",
      fxRatesUsed,
      warnings: dayWarnings,
    });
  }

  // ── Compute per-account total returns ─────────────────────────────────────
  const account1Id = accounts.find((a) => a.platform === "MT4")?.accountId ?? "account_1";
  const account2Id = accounts.find((a) => a.platform === "MT5")?.accountId ?? "account_2";

  const account1Return = computeAccountTotalReturn(
    accountDailyPoints[account1Id] ?? [],
  );
  const account2Return = computeAccountTotalReturn(
    accountDailyPoints[account2Id] ?? [],
  );

  // Naive: simple addition (wrong method, for audit)
  const naiveCombinedReturn = account1Return + account2Return;

  const correctPortfolioReturn = portfolioIndex / 100 - 1;

  // ── Trades & cashflows ────────────────────────────────────────────────────
  const combinedTrades = buildCombinedTrades(closedTrades, accounts);
  const combinedCashFlows = buildCombinedCashFlows(cashFlows);

  const account1Trades = closedTrades.filter(
    (t) => t.accountId === account1Id && t.status === "closed",
  ).length;
  const account2Trades = closedTrades.filter(
    (t) => t.accountId === account2Id && t.status === "closed",
  ).length;

  // ── Summary KPIs ──────────────────────────────────────────────────────────
  const summary = computePortfolioSummary(
    dailyPoints,
    combinedTrades,
    accounts,
    fxRates,
    startDate,
    endDate,
    portfolioIndex,
  );

  // ── Reconciliation ────────────────────────────────────────────────────────
  const reconciliation = buildReconciliation(accounts, closedTrades, cashFlows);

  // ── Coverage ──────────────────────────────────────────────────────────────
  const expectedCalendarDays = allDates.length;
  const coverage: CombinedPortfolioResult["coverage"] = {
    status: "partial",
    startDateUtc: startDate,
    endDateUtc: endDate,
    missingRanges: [],
    note: `Available raw trade data starts ${startDate}. Legacy statement-based combined return covers Apr 2024 – Jul 2026 but cannot be reconstructed from raw trade data alone. See diagnostics.legacyNote for details.`,
  };

  return {
    method: "fx_neutral_weighted_portfolio_return",
    baseCurrency: "EUR",
    startDate,
    endDate,
    startIndex: 100,
    endIndex: portfolioIndex,
    totalReturn: correctPortfolioReturn,
    summary,
    coverage,
    dailyPoints,
    accountDailyPoints,
    combinedTrades,
    combinedCashFlows,
    reconciliation,
    diagnostics: {
      naiveCombinedReturn,
      correctPortfolioReturn,
      account1TotalReturn: account1Return,
      account2TotalReturn: account2Return,
      legacyNote:
        "Legacy home showed a statement-based combined return (period Apr 2024–Jul 2026). correctPortfolioReturn is from raw trade data only.",
      daysWithMissingFx,
      daysWithNullReturn,
      totalTrades: combinedTrades.length,
      account1Trades,
      account2Trades,
      totalCashFlows: combinedCashFlows.length,
      dailySeriesPointCount: dailyPoints.length,
      expectedCalendarDays,
    },
    warnings,
  };
}
