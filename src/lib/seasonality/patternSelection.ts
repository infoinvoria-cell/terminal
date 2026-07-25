// Pattern Selection Utility
// Computes best LONG/SHORT setup candidates for seasonal slots.
// This is separate from the Pine TV 252-slot seasonal curve calculation.

import type { DailyBar } from "./walkForward/types";
import { analyzeSampleYears } from "./yearWindow";
import { buildSeasonalityResultIdentity, type SeasonalityResultIdentity } from "./resultIdentity";
import { computeTradingViewMetrics } from "./tradingViewMetrics";
import {
  buildPatternTradesFromLookup,
  buildYearSlotLookup,
  type PatternTradeAuditMetrics,
  type YearSlotLookup,
  computeBarLevelRiskMetricsFromTrades,
} from "./barLevelRisk";
import {
  SEASONALITY_CALCULATION_VERSION,
  SEASONALITY_CALMAR_FORMULA_VERSION,
  SEASONALITY_DRAWDOWN_METHOD_VERSION,
  SEASONALITY_HOLDING_GRID_VERSION,
  SEASONALITY_METRIC_FORMULA_VERSION,
  SEASONALITY_PATTERN_SELECTION_VERSION,
  SEASONALITY_QUALITY_RISK_INPUT_VERSION,
  SEASONALITY_SHARPE_FORMULA_VERSION,
} from "./versions";

export type PatternDirection = "LONG" | "SHORT";
export type PatternHolding = 10 | 12 | 14 | 16 | 18 | 20;

export interface PatternCandidate {
  startSlot: number;
  endSlot: number;
  approxMonthLabel: string;
  direction: PatternDirection;
  holdingDays: PatternHolding;
  winRate: number;
  avgPerformance: number;
  maxDrawdown: number;
  sharpe: number | null;
  calmar: number | null;
  sortino: number | null;
  profitFactor: number | null;
  avgDrawdown: number | null;
  observationCount: number;
  strategyReturns: number[];
  /** Years with valid entry+exit bars — used for correct PatternReturns chart labels */
  coveredYears?: number[];
  /** Years missing entry or exit bar */
  missingYears?: Array<{ year: number; reason: string }>;
  /** Internal audit-only trade-close references after bar-level migration. */
  auditMetrics?: PatternTradeAuditMetrics;
  /** Same as observationCount — explicit count of historical trades */
  historicalTradeCount?: number;
  /** Date labels derived from coveredYears */
  entryDateLabel?: string;
  exitDateLabel?: string;
}

export interface WinrateBarData {
  startSlot: number;
  approxMonthLabel: string;
  bestCandidate: PatternCandidate | null;
  /** Signed display value. For WR: ±((wr-50)/50)*100. For SR: ±sharpe. For QS: ±(qs-50)*2. */
  barValue: number;
}

/** Bar item — same shape for WR, SR and QS chart strips. */
export type OscillatorBarData = WinrateBarData;

/** QS-aware PatternCandidate — qualityScore added by qsBars computation. */
export interface PatternCandidateWithQs extends PatternCandidate {
  qualityScore?: number;
}

export type OscillatorMode = "WR" | "SR" | "QS";

export interface PatternDataResult {
  assetId: string;
  lookbackYears: number;
  requestedSampleYears: number | "MAX";
  includedYears: number[];
  excludedYears: Array<{ year: number; reason: string }>;
  sourceFingerprint?: string;
  monitoringSymbol?: string;
  resultType: "historical_pattern_metrics";
  identity?: SeasonalityResultIdentity;
  winrateBars: WinrateBarData[];
  /** Sharpe-Ratio bars: best Sharpe candidate per 2-slot step (avgPerf>0 required). */
  srBars?: WinrateBarData[];
  /** Quality-Score bars: best QS candidate per 2-slot step from mini-PFWF OOS. */
  qsBars?: WinrateBarData[];
  bestPatternBySlot: Record<number, PatternCandidate | null>;
  candidatesBySlot: Record<number, PatternCandidate[]>;
  nextPattern: PatternCandidate | null;
  /** Legacy single: first pre-qualified LONG (WR≥70%, avgPerf>0, PF>1). Prefer nextPatternLongCandidates. */
  nextPatternLong?: PatternCandidate | null;
  /** Legacy single: first pre-qualified SHORT. */
  nextPatternShort?: PatternCandidate | null;
  /** Ranked shortlist of pre-qualified LONG candidates within next 90 trading days.
   *  UI iterates in order until one passes Strict-WF-Quality gate (score≥75). */
  nextPatternLongCandidates?: PatternCandidate[];
  /** Ranked shortlist of pre-qualified SHORT candidates within next 90 trading days. */
  nextPatternShortCandidates?: PatternCandidate[];
  todaySlot: number;
  generatedAt: string;
}

const SLOT_MIN = 1;
const SLOT_MAX = 252;
const WINRATE_STEP = 2;

const MONTH_SLOT_MAP: Record<number, number> = {
  1: 1,
  2: 21,
  3: 40,
  4: 62,
  5: 83,
  6: 104,
  7: 125,
  8: 147,
  9: 169,
  10: 189,
  11: 211,
  12: 232,
};

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function slotToMonth(slot: number): string {
  const entries = Object.entries(MONTH_SLOT_MAP)
    .map(([month, start]) => ({ month: Number(month), start: Number(start) }))
    .sort((a, b) => a.start - b.start);

  let resolvedMonth = 1;
  for (const entry of entries) {
    if (slot >= entry.start) {
      resolvedMonth = entry.month;
      continue;
    }
    break;
  }
  return MONTHS_EN[resolvedMonth - 1] ?? "Jan";
}

export function todaySlotFromDate(): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const monthStart = MONTH_SLOT_MAP[month] ?? SLOT_MIN;
  const nextMonthStart = MONTH_SLOT_MAP[month + 1] ?? monthStart + 21;
  const tradingDaysInMonth = nextMonthStart - monthStart;
  const calendarDaysInMonth = new Date(now.getFullYear(), month, 0).getDate();
  const frac = Math.min((day - 1) / calendarDaysInMonth, 1);
  return Math.round(monthStart + frac * tradingDaysInMonth);
}

function computeMetrics(returns: number[]) {
  const n = returns.length;
  if (n === 0) {
    return {
      winRate: 50,
      avgPerformance: 0,
      maxDrawdown: 0,
      sharpe: null,
      calmar: null,
      sortino: null,
      profitFactor: null,
      avgDrawdown: null,
      auditMetrics: {
        tradeCloseMaxDrawdown: 0,
        tradeCloseCalmar: null,
      },
    };
  }

  const wins = returns.filter((value) => value > 0).length;
  const winRate = (wins / n) * 100;
  const metrics = computeTradingViewMetrics(returns);
  const downsideVar = returns.reduce((sum, value) => sum + Math.min(value, 0) ** 2, 0) / n;
  const downsideStd = Math.sqrt(downsideVar);
  const sortino = downsideStd > 0.001 ? metrics.averageReturn / downsideStd : null;

  let equity = 1;
  let peak = 1;
  const drawdowns: number[] = [];
  for (const value of returns) {
    equity *= 1 + value;
    if (equity > peak) peak = equity;
    else drawdowns.push((peak - equity) / peak);
  }
  const avgDrawdown = drawdowns.length > 0 ? drawdowns.reduce((sum, d) => sum + d, 0) / drawdowns.length : 0;

  return {
    winRate,
    avgPerformance: metrics.averageReturn,
    maxDrawdown: metrics.maxDrawdown,
    sharpe: metrics.sharpe,
    calmar: metrics.calmar,
    sortino,
    profitFactor: metrics.profitFactor,
    avgDrawdown,
    auditMetrics: {
      tradeCloseMaxDrawdown: metrics.maxDrawdown,
      tradeCloseCalmar: metrics.calmar,
    },
  };
}

function buildCandidateFromLookup(
  lookup: YearSlotLookup,
  startSlot: number,
  holding: PatternHolding,
  direction: PatternDirection,
): PatternCandidate | null {
  const tradeCollection = buildPatternTradesFromLookup(
    lookup,
    lookup.years,
    startSlot,
    holding,
    direction,
  );
  const strategyReturns = tradeCollection.strategyReturns;

  if (strategyReturns.length < 3) {
    return null;
  }

  const metrics = computeMetrics(strategyReturns);
  const barLevelRisk = computeBarLevelRiskMetricsFromTrades(tradeCollection.trades);
  return {
    startSlot,
    endSlot: startSlot + holding,
    approxMonthLabel: slotToMonth(startSlot),
    entryDateLabel: slotToApproxDate(startSlot),
    exitDateLabel:  slotToApproxDate(startSlot + holding),
    direction,
    holdingDays: holding,
    winRate: metrics.winRate,
    avgPerformance: metrics.avgPerformance,
    maxDrawdown: barLevelRisk.maxDrawdown,
    sharpe: metrics.sharpe,
    calmar: barLevelRisk.calmar,
    sortino: metrics.sortino,
    profitFactor: metrics.profitFactor,
    avgDrawdown: metrics.avgDrawdown,
    observationCount: strategyReturns.length,
    historicalTradeCount: strategyReturns.length,
    strategyReturns,
    coveredYears: tradeCollection.coveredYears,
    missingYears: tradeCollection.missingYears,
    auditMetrics: tradeCollection.auditMetrics,
  };
}

function buildCandidatesForSlotFromLookup(lookup: YearSlotLookup, startSlot: number): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  const directions: PatternDirection[] = ["LONG", "SHORT"];
  const holdings: PatternHolding[] = [10, 12, 14, 16, 18, 20];

  for (const direction of directions) {
    for (const holding of holdings) {
      const candidate = buildCandidateFromLookup(lookup, startSlot, holding, direction);
      if (candidate) out.push(candidate);
    }
  }

  return out;
}

function rankBest(candidates: PatternCandidate[]): PatternCandidate | null {
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    // 1. Higher win rate
    if (current.winRate > best.winRate + 0.001) return current;
    if (best.winRate > current.winRate + 0.001) return best;
    // 2. Higher avg performance
    if (current.avgPerformance > best.avgPerformance + 0.0001) return current;
    if (best.avgPerformance > current.avgPerformance + 0.0001) return best;
    // 3. Lower max drawdown
    if (current.maxDrawdown < best.maxDrawdown - 0.001) return current;
    if (best.maxDrawdown < current.maxDrawdown - 0.001) return best;
    // 4. Shorter holding
    if (current.holdingDays < best.holdingDays) return current;
    if (best.holdingDays < current.holdingDays) return best;
    // 5. Deterministic: LONG preferred over SHORT, then by start slot
    if (current.direction === "LONG" && best.direction === "SHORT") return current;
    if (best.direction === "LONG" && current.direction === "SHORT") return best;
    return best;
  });
}

function normalizeSlot(slot: number): number {
  return Math.max(SLOT_MIN, Math.min(SLOT_MAX - 1, Math.round(slot)));
}

export function buildBestForwardPatternBySlot(
  allBars: DailyBar[],
  lookbackYears: number,
  startSlot: number,
): PatternCandidate | null {
  const sample = analyzeSampleYears(allBars, lookbackYears);
  const lookup = buildYearSlotLookup(allBars, sample.includedYears);
  return rankBest(buildCandidatesForSlotFromLookup(lookup, normalizeSlot(startSlot)));
}

export function findNextBestPattern(
  allBars: DailyBar[],
  lookbackYears: number,
  todaySlot: number,
  lookaheadTradingDays = 20,
): PatternCandidate | null {
  const sample = analyzeSampleYears(allBars, lookbackYears);
  const lookup = buildYearSlotLookup(allBars, sample.includedYears);
  const start = normalizeSlot(todaySlot);
  const end = Math.min(SLOT_MAX - 1, start + Math.max(1, lookaheadTradingDays));
  const candidates: PatternCandidate[] = [];

  for (let slot = start; slot <= end; slot += WINRATE_STEP) {
    candidates.push(...buildCandidatesForSlotFromLookup(lookup, slot));
  }

  return rankBest(candidates);
}

function isHistoricallyPreQualified(candidate: PatternCandidate | null): candidate is PatternCandidate {
  if (!candidate) return false;
  return candidate.winRate >= 70
    && candidate.avgPerformance > 0
    && (candidate.profitFactor ?? 0) > 1;
}

function collectDirectionalCandidates(
  lookup: YearSlotLookup,
  startSlotInclusive: number,
  endSlotInclusive: number,
  direction: PatternDirection,
): PatternCandidate[] {
  const candidates: PatternCandidate[] = [];
  for (let slot = normalizeSlot(startSlotInclusive); slot <= normalizeSlot(endSlotInclusive); slot += 1) {
    for (const holding of [10, 12, 14, 16, 18, 20] as PatternHolding[]) {
      const candidate = buildCandidateFromLookup(lookup, slot, holding, direction);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
}

function buildQualifiedDirectionalShortlist(
  lookup: YearSlotLookup,
  todaySlot: number,
  direction: PatternDirection,
  maxCandidates = 5,
): PatternCandidate[] {
  const shortlist = collectDirectionalCandidates(
    lookup,
    todaySlot,
    Math.min(SLOT_MAX - 1, todaySlot + 90),
    direction,
  ).filter(isHistoricallyPreQualified);

  return shortlist
    .sort((left, right) => {
      const best = rankBest([left, right]);
      if (best === left && best !== right) return -1;
      if (best === right && best !== left) return 1;
      return left.startSlot - right.startSlot;
    })
    .slice(0, maxCandidates);
}

function findQualifiedDirectionalNextPattern(
  lookup: YearSlotLookup,
  todaySlot: number,
  direction: PatternDirection,
): PatternCandidate | null {
  for (const horizon of [20, 40, 60, 90]) {
    const qualified = collectDirectionalCandidates(
      lookup,
      todaySlot,
      Math.min(SLOT_MAX - 1, todaySlot + horizon),
      direction,
    ).filter(isHistoricallyPreQualified);

    if (qualified.length > 0) {
      return rankBest(qualified);
    }
  }

  return null;
}

export function buildPatternData(
  allBars: DailyBar[],
  assetId: string,
  lookbackYears: number,
  sourceFingerprint = "",
  monitoringSymbol = assetId,
  sourcePathOrProviderSymbol = sourceFingerprint,
): PatternDataResult {
  const sorted = [...allBars].sort((a, b) => a.date.localeCompare(b.date));
  const sample = analyzeSampleYears(sorted, lookbackYears);
  const lookup = buildYearSlotLookup(sorted, sample.includedYears);
  const todaySlot = todaySlotFromDate();

  const winrateBars: WinrateBarData[] = [];
  const srBars: WinrateBarData[] = [];
  const bestPatternBySlot: Record<number, PatternCandidate | null> = {};
  const candidatesBySlot: Record<number, PatternCandidate[]> = {};

  for (let startSlot = SLOT_MIN; startSlot <= SLOT_MAX - 1; startSlot += 1) {
    const candidates = buildCandidatesForSlotFromLookup(lookup, startSlot);
    const best = rankBest(candidates);

    candidatesBySlot[startSlot] = candidates;
    bestPatternBySlot[startSlot] = best;
    if ((startSlot - SLOT_MIN) % WINRATE_STEP === 0) {
      winrateBars.push({
        startSlot,
        approxMonthLabel: slotToMonth(startSlot),
        bestCandidate: best,
        barValue: best
          ? (best.direction === "LONG" ? 1 : -1) * ((best.winRate - 50) * 2)
          : 0,
      });

      const bestSharpeCandidate = candidates
        .filter((candidate) => candidate.sharpe != null && candidate.avgPerformance > 0)
        .reduce<PatternCandidate | null>((currentBest, candidate) => {
          if (!currentBest) return candidate;
          return (candidate.sharpe ?? Number.NEGATIVE_INFINITY) > (currentBest.sharpe ?? Number.NEGATIVE_INFINITY)
            ? candidate
            : currentBest;
        }, null);

      if (bestSharpeCandidate) {
        srBars.push({
          startSlot,
          approxMonthLabel: slotToMonth(startSlot),
          bestCandidate: bestSharpeCandidate,
          barValue: bestSharpeCandidate.direction === "LONG"
            ? (bestSharpeCandidate.sharpe ?? 0)
            : -(bestSharpeCandidate.sharpe ?? 0),
        });
      }
    }
  }

  const nextCandidates: PatternCandidate[] = [];
  for (
    let slot = normalizeSlot(todaySlot);
    slot <= Math.min(SLOT_MAX - 1, normalizeSlot(todaySlot) + 20);
    slot += WINRATE_STEP
  ) {
    nextCandidates.push(...buildCandidatesForSlotFromLookup(lookup, slot));
  }

  const nextPattern = rankBest(nextCandidates);
  const nextPatternLong = findQualifiedDirectionalNextPattern(lookup, todaySlot, "LONG");
  const nextPatternShort = findQualifiedDirectionalNextPattern(lookup, todaySlot, "SHORT");
  const nextPatternLongCandidates = buildQualifiedDirectionalShortlist(lookup, todaySlot, "LONG");
  const nextPatternShortCandidates = buildQualifiedDirectionalShortlist(lookup, todaySlot, "SHORT");

  return {
    assetId,
    lookbackYears,
    requestedSampleYears: sample.requestedSampleYears,
    includedYears: sample.includedYears,
    excludedYears: sample.excludedYears,
    sourceFingerprint,
    monitoringSymbol,
    resultType: "historical_pattern_metrics",
    identity: buildSeasonalityResultIdentity({
      base: {
        identityVersion: "seasonality_result_identity_v1",
        assetId,
        monitoringSymbol,
        sourceType: sourceFingerprint.startsWith("yahoo:")
          ? "existing_yahoo_provider"
          : "manual_tv_csv",
        sourcePathOrProviderSymbol,
        sourceFingerprint,
        calculationVersion: SEASONALITY_CALCULATION_VERSION,
        metricFormulaVersion: SEASONALITY_METRIC_FORMULA_VERSION,
        drawdownMethodVersion: SEASONALITY_DRAWDOWN_METHOD_VERSION,
        calmarFormulaVersion: SEASONALITY_CALMAR_FORMULA_VERSION,
        qualityRiskInputVersion: SEASONALITY_QUALITY_RISK_INPUT_VERSION,
        sharpeFormulaVersion: SEASONALITY_SHARPE_FORMULA_VERSION,
        holdingGridVersion: SEASONALITY_HOLDING_GRID_VERSION,
        patternSelectionVersion: SEASONALITY_PATTERN_SELECTION_VERSION,
      },
      resultType: "historical_pattern_metrics",
      requestedSampleYears: sample.requestedSampleYears,
      includedYears: sample.includedYears,
      excludedYears: sample.excludedYears,
    }),
    winrateBars,
    srBars,
    bestPatternBySlot,
    candidatesBySlot,
    nextPattern,
    nextPatternLong,
    nextPatternShort,
    nextPatternLongCandidates,
    nextPatternShortCandidates,
    todaySlot,
    generatedAt: new Date().toISOString(),
  };
}

const SLOT_MONTHS = [
  { slot: 1, name: "Jan", days: 31 },
  { slot: 21, name: "Feb", days: 28 },
  { slot: 40, name: "Mar", days: 31 },
  { slot: 62, name: "Apr", days: 30 },
  { slot: 83, name: "May", days: 31 },
  { slot: 104, name: "Jun", days: 30 },
  { slot: 125, name: "Jul", days: 31 },
  { slot: 147, name: "Aug", days: 31 },
  { slot: 169, name: "Sep", days: 30 },
  { slot: 189, name: "Oct", days: 31 },
  { slot: 211, name: "Nov", days: 30 },
  { slot: 232, name: "Dec", days: 31 },
];

export function slotToApproxDate(slot: number): string {
  const normalized = Math.max(SLOT_MIN, Math.min(SLOT_MAX, Math.round(slot)));
  let monthIndex = SLOT_MONTHS.length - 1;

  for (let i = 0; i < SLOT_MONTHS.length - 1; i += 1) {
    const current = SLOT_MONTHS[i];
    const next = SLOT_MONTHS[i + 1];
    if (normalized >= current.slot && normalized < next.slot) {
      monthIndex = i;
      break;
    }
  }

  const month = SLOT_MONTHS[monthIndex];
  const nextStart = SLOT_MONTHS[monthIndex + 1]?.slot ?? month.slot + 21;
  const tradingDays = nextStart - month.slot;
  const dayInMonth = Math.min(
    month.days,
    Math.round(((normalized - month.slot) / tradingDays) * month.days) + 1,
  );

  return `${String(dayInMonth).padStart(2, "0")} ${month.name}`;
}

export function slotToApproxMonthDay(slot: number): string {
  const normalized = Math.max(SLOT_MIN, Math.min(SLOT_MAX, Math.round(slot)));
  let monthIndex = SLOT_MONTHS.length - 1;

  for (let i = 0; i < SLOT_MONTHS.length - 1; i += 1) {
    const current = SLOT_MONTHS[i];
    const next = SLOT_MONTHS[i + 1];
    if (normalized >= current.slot && normalized < next.slot) {
      monthIndex = i;
      break;
    }
  }

  const month = SLOT_MONTHS[monthIndex];
  const nextStart = SLOT_MONTHS[monthIndex + 1]?.slot ?? month.slot + 21;
  const tradingDays = nextStart - month.slot;
  const dayInMonth = Math.min(
    month.days,
    Math.round(((normalized - month.slot) / tradingDays) * month.days) + 1,
  );

  return `${String(monthIndex + 1).padStart(2, "0")}-${String(dayInMonth).padStart(2, "0")}`;
}

export function formatPatternWindow(startSlot: number, endSlot: number): string {
  return `${slotToApproxDate(startSlot)} - ${slotToApproxDate(endSlot)}`;
}

export function monthDayToApproxSlot(monthDay: string): number | null {
  if (!/^\d{2}-\d{2}$/.test(monthDay)) return null;
  const month = Number(monthDay.slice(0, 2));
  const day = Number(monthDay.slice(3, 5));
  const monthStart = MONTH_SLOT_MAP[month];
  if (!monthStart) return null;

  const nextMonthStart = MONTH_SLOT_MAP[month + 1] ?? monthStart + 21;
  const tradingDaysInMonth = nextMonthStart - monthStart;
  const calendarDaysInMonth = new Date(2025, month, 0).getDate();
  const frac = Math.min(Math.max((day - 1) / calendarDaysInMonth, 0), 1);
  return Math.round(monthStart + frac * tradingDaysInMonth);
}

/** Gets a best candidate for a slot from pre-built data. */
export function getPatternForSlot(
  bars: WinrateBarData[],
  slot: number,
): PatternCandidate | null {
  if (bars.length === 0) return null;
  const normalized = normalizeSlot(slot);
  const exact = bars.find((b) => normalized >= b.startSlot && normalized < b.startSlot + WINRATE_STEP);
  if (exact) return exact.bestCandidate;

  const nearest = bars.reduce((best, current) =>
    Math.abs(current.startSlot - normalized) < Math.abs(best.startSlot - normalized) ? current : best,
  );
  return nearest.bestCandidate;
}
