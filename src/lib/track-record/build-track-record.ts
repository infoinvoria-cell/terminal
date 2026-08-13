/**
 * Balance curve, combined curve, KPI, and drawdown computation.
 * Pure functions — no I/O, no side effects.
 */

import type {
  NormalizedTrade,
  NormalizedCashFlow,
  NormalizedAccountSnapshot,
  BalanceCurvePoint,
  PerformanceKpis,
  EquitySnapshot,
} from "./normalized-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function epochToUtc(epoch: number): string {
  return new Date(epoch * 1000).toISOString().replace(".000Z", "Z");
}

// ── Balance curve ─────────────────────────────────────────────────────────────

type BalanceEvent = {
  timeEpoch: number;
  amount: number;
  eventType: BalanceCurvePoint["eventType"];
};

export function buildBalanceCurve(
  trades: NormalizedTrade[],
  cashFlows: NormalizedCashFlow[],
  accountId: string,
  initialBalance = 0,
): BalanceCurvePoint[] {
  const events: BalanceEvent[] = [];

  for (const t of trades) {
    if (t.accountId !== accountId || t.status !== "closed") continue;
    events.push({ timeEpoch: t.closeTimeEpoch, amount: t.netProfit, eventType: "trade" });
  }

  for (const cf of cashFlows) {
    if (cf.accountId !== accountId) continue;
    events.push({ timeEpoch: cf.timeEpoch, amount: cf.amount, eventType: cf.type as BalanceCurvePoint["eventType"] });
  }

  // Sort ascending by time
  events.sort((a, b) => a.timeEpoch - b.timeEpoch || 0);

  let running = initialBalance;
  return events.map((ev) => {
    running += ev.amount;
    return {
      timeEpoch:      ev.timeEpoch,
      timeUtc:        epochToUtc(ev.timeEpoch),
      balance:        ev.amount,
      eventType:      ev.eventType,
      amount:         ev.amount,
      runningBalance: running,
      accountId,
    };
  });
}

// ── Combined balance curve ────────────────────────────────────────────────────

export function buildCombinedBalanceCurve(
  curves: Record<string, BalanceCurvePoint[]>,
  currencies: Record<string, string>,
): { curve: BalanceCurvePoint[]; warnings: string[] } {
  const warnings: string[] = [];
  const accountIds = Object.keys(curves);

  if (accountIds.length === 0) {
    return { curve: [], warnings };
  }

  // Check all currencies match
  const currencyValues = accountIds.map((id) => currencies[id]).filter(Boolean);
  const uniqueCurrencies = [...new Set(currencyValues)];
  if (uniqueCurrencies.length > 1) {
    const detail = accountIds.map((id) => `${id}=${currencies[id] ?? "?"}`).join(" ");
    warnings.push(`currencies differ: ${detail}, combined balance not computed`);
    return { curve: [], warnings };
  }

  // Merge all points, sort by time, recompute running balance
  const allPoints: BalanceCurvePoint[] = [];
  for (const id of accountIds) {
    for (const pt of curves[id] ?? []) {
      allPoints.push({ ...pt, accountId: "combined" });
    }
  }

  allPoints.sort((a, b) => a.timeEpoch - b.timeEpoch);

  let running = 0;
  const combined: BalanceCurvePoint[] = allPoints.map((pt) => {
    running += pt.amount;
    return { ...pt, runningBalance: running };
  });

  return { curve: combined, warnings };
}

// ── Max drawdown ──────────────────────────────────────────────────────────────

export function computeMaxDrawdown(curve: BalanceCurvePoint[]): number | null {
  if (curve.length < 2) return null;

  let peak = -Infinity;
  let maxDrawdown = 0;

  for (const pt of curve) {
    if (pt.runningBalance > peak) peak = pt.runningBalance;
    const drawdown = peak - pt.runningBalance;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return maxDrawdown;
}

// ── Performance KPIs ──────────────────────────────────────────────────────────

export function computePerformanceKpis(
  trades: NormalizedTrade[],
  cashFlows: NormalizedCashFlow[],
  snapshot: NormalizedAccountSnapshot | null,
  balanceCurve: BalanceCurvePoint[],
  equitySnapshots?: EquitySnapshot[],
): PerformanceKpis {
  const accountId = snapshot?.accountId ?? (trades[0]?.accountId ?? cashFlows[0]?.accountId ?? "unknown");
  const currency  = snapshot?.currency ?? "";

  const closed = trades.filter((t) => t.status === "closed" && t.accountId === accountId);

  const winners = closed.filter((t) => t.netProfit > 0);
  const losers  = closed.filter((t) => t.netProfit < 0);

  const grossProfit = winners.reduce((s, t) => s + t.netProfit, 0);
  const grossLoss   = losers.reduce((s, t) => s + t.netProfit, 0);
  const netProfit   = closed.reduce((s, t) => s + t.netProfit, 0);

  const closedTradeCount = closed.length;
  const winRate     = closedTradeCount > 0 ? winners.length / closedTradeCount : null;
  const profitFactor = grossLoss !== 0 ? grossProfit / Math.abs(grossLoss) : null;

  const averageWin  = winners.length > 0 ? grossProfit / winners.length : null;
  const averageLoss = losers.length  > 0 ? grossLoss  / losers.length  : null;
  const bestTrade   = closed.length > 0 ? Math.max(...closed.map((t) => t.netProfit)) : null;
  const worstTrade  = closed.length > 0 ? Math.min(...closed.map((t) => t.netProfit)) : null;
  const averageTrade = closedTradeCount > 0 ? netProfit / closedTradeCount : null;
  const payoffRatio  =
    averageWin !== null && averageLoss !== null && averageLoss !== 0
      ? averageWin / Math.abs(averageLoss)
      : null;

  const deposits    = cashFlows.filter((cf) => cf.accountId === accountId && cf.type === "deposit");
  const withdrawals = cashFlows.filter((cf) => cf.accountId === accountId && cf.type === "withdrawal");
  const totalDeposits    = deposits.reduce((s, cf) => s + cf.amount, 0);
  const totalWithdrawals = withdrawals.reduce((s, cf) => s + cf.amount, 0);

  const balanceDrawdown = computeMaxDrawdown(balanceCurve);
  const balanceDrawdownReason = balanceCurve.length < 2 ? "insufficient_balance_events" : null;

  // Equity drawdown from equity snapshots
  const acctEquitySnaps = (equitySnapshots ?? []).filter((es) => es.accountId === accountId);
  let equityDrawdown: number | null = null;
  let equityDrawdownReason: string | null = null;

  if (acctEquitySnaps.length < 2) {
    equityDrawdown = null;
    equityDrawdownReason = "insufficient_equity_snapshots";
  } else {
    let peak = -Infinity;
    let maxDD = 0;
    for (const es of acctEquitySnaps.sort((a, b) => a.timeEpoch - b.timeEpoch)) {
      if (es.equity > peak) peak = es.equity;
      const dd = peak - es.equity;
      if (dd > maxDD) maxDD = dd;
    }
    equityDrawdown = maxDD;
  }

  return {
    accountId,
    currency,
    closedTradeCount,
    winners: winners.length,
    losers: losers.length,
    winRate,
    grossProfit,
    grossLoss,
    netProfit,
    profitFactor,
    averageWin,
    averageLoss,
    bestTrade,
    worstTrade,
    averageTrade,
    payoffRatio,
    currentBalance:    snapshot?.balance    ?? null,
    currentEquity:     snapshot?.equity     ?? null,
    currentFloatingPnl:snapshot?.floatingProfit ?? null,
    totalDeposits,
    totalWithdrawals,
    balanceDrawdown,
    balanceDrawdownReason,
    equityDrawdown,
    equityDrawdownReason,
  };
}
