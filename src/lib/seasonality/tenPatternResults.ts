/**
 * Ten Pattern Results — schema for persisted computation output.
 *
 * Result files live at:
 *   public/generated/seasonality/ten_patterns/results.json
 *
 * All rates are stored on 0–100 scale (percent) for clarity.
 * All return values are stored in percent (e.g. 2.4 = 2.4%).
 *
 * Status fields are intentionally separate dimensions:
 *   calculationStatus — was the algorithm executed and did it complete?
 *   dataStatus        — was sufficient, valid input data available?
 *   profitabilityStatus — what does the OOS expectancy suggest?
 *   walkForwardStatus — did the WF procedure complete with ≥ 1 fold?
 *   robustnessStatus  — is there evidence of parameter stability?
 *   productionStatus  — is this pattern approved for live use? (never auto-approved)
 */

import type { PatternStatus } from "./tenPatternsRegistry";

/* ─── Multi-dimensional status ──────────────────────────────────────────── */

export type CalculationStatus =
  | "calculated"         // algorithm ran to completion
  | "not_calculated"     // not yet run
  | "calculation_failed"; // runtime error

export type DataStatus =
  | "complete"            // sufficient history, no critical gaps
  | "no_data_source"      // CSV / API source missing entirely
  | "insufficient_history" // fewer than MIN_OBS valid trades
  | "degraded";           // partial gaps or quality warnings

export type ProfitabilityStatus =
  | "positive_oos_expectancy"  // OOS avg return > 0
  | "near_zero_expectancy"     // OOS avg return within ±0.5%
  | "negative_oos_expectancy"  // OOS avg return < 0
  | "not_assessed";            // no OOS results available

export type WalkForwardStatus =
  | "completed"           // ≥ 1 OOS fold produced results
  | "not_run"             // WF was not executed
  | "failed"              // WF API error
  | "insufficient_folds"; // < 3 folds (unreliable OOS estimate)

export type RobustnessStatus =
  | "strong"         // robustnessPct ≥ 70
  | "moderate"       // robustnessPct 50–69
  | "weak"           // robustnessPct < 50
  | "not_assessed";  // no parameter-sweep data

export type ProductionStatus = "not_approved"; // never auto-approved

export interface PatternStatusDetail {
  calculationStatus: CalculationStatus;
  dataStatus: DataStatus;
  profitabilityStatus: ProfitabilityStatus;
  walkForwardStatus: WalkForwardStatus;
  robustnessStatus: RobustnessStatus;
  /** Always "not_approved" — production approval is a manual gate */
  productionStatus: ProductionStatus;
}

/* ─── Data types ────────────────────────────────────────────────────────── */

export interface YearReturn {
  year: number;
  /** IS return for this calendar year's pattern window, in percent */
  returnPct: number;
  direction: "LONG" | "SHORT";
  entrySlot: number;
  exitSlot: number;
  entryDate?: string;
  exitDate?: string;
}

export interface HistoricalKpi {
  /** In-sample (IS) win rate, 0–100 */
  isWinRatePct: number;
  /** IS average return per trade in percent (arithmetic mean) */
  isAvgReturnMeanPct: number;
  /** IS median return per trade in percent */
  isAvgReturnMedianPct: number;
  /** Number of IS observations (completed historical trades) */
  nObs: number;
  /** IS maximum drawdown in percent (negative number, e.g. -8.3) */
  maxDrawdownPct: number;
  /** Sortino ratio on IS trades, null if insufficient data */
  sortinoRatio: number | null;
  /** Profit factor on IS trades (gross profit / gross loss) */
  profitFactor: number | null;
  /** True if pattern showed positive performance in 3+ decades */
  decadeConsistent: boolean | null;
  /** Per-year IS returns */
  yearReturns: YearReturn[];
  /** First year of IS sample */
  sampleStartYear: number;
  /** Last year of IS sample */
  sampleEndYear: number;

  // Backwards-compatible aliases (deprecated — prefer isWinRatePct, isAvgReturnMeanPct)
  /** @deprecated use isWinRatePct */
  winRatePct?: number;
  /** @deprecated use isAvgReturnMeanPct */
  avgReturnPct?: number;
  /** @deprecated use isAvgReturnMeanPct */
  avgReturnMeanPct?: number;
  /** @deprecated use isAvgReturnMedianPct */
  avgReturnMedianPct?: number;
}

export interface WfFold {
  foldIndex: number;
  /** IS training window start year */
  isStartYear: number;
  /** IS training window end year */
  isEndYear: number;
  /** OOS evaluation year */
  oosYear: number;
  /** Best entry slot selected by IS optimisation */
  isBestEntrySlot: number;
  /** Best holding period (days) selected by IS optimisation */
  isBestHoldingDays: number;
  /** OOS return for this fold, in percent */
  oosReturnPct: number;
  /** True if OOS return > 0 */
  oosWin: boolean;
}

export interface WfKpi {
  /** OOS win rate across all WF folds, 0–100 */
  oosWinRatePct: number;
  /** OOS average return per fold in percent (arithmetic mean) */
  oosAvgReturnPct: number;
  /** OOS median return per fold in percent */
  oosMedianReturnPct: number | null;
  /** Number of WF folds run */
  nFolds: number;
  /** Total OOS observations (sum across folds) */
  nOosObs: number;
  /** OOS max drawdown in percent (negative) */
  oosMaxDrawdownPct: number;
  /** OOS profit factor, null if no OOS losses */
  oosProfitFactor: number | null;
  /** OOS Sortino ratio */
  oosSortinoRatio: number | null;
  /** Robustness score 0–100 (% of parameter variants that remain profitable) */
  robustnessPct: number | null;
  /** Individual fold details */
  folds: WfFold[];
}

export interface DataValidation {
  totalBars: number;
  firstDate: string;
  lastDate: string;
  yearsAvailable: number;
  validTradeCount: number;
  missingYearCount: number;
  missingYears: number[];
  csvHash: string;
  csvBars: number;
  passed: boolean;
  notes: string[];
}

export interface WfAudit {
  /** Entry rule description */
  entryRule: string;
  /** Exit rule description */
  exitRule: string;
  /** Direction and return sign convention */
  returnFormula: string;
  /** Initial IS training years */
  initialTrainingYears: number;
  /** OOS block size in years */
  oosBlockYears: number;
  /** Cost assumptions applied */
  slippageBps: number;
  commissionBps: number;
  totalRoundTripBps: number;
  /** Hash of the CSV data used */
  dataHash: string;
  /** Hash of the full result object for determinism check */
  resultHash: string;
}

export interface TenPatternResult {
  patternId: string;
  registryVersion: string;
  computedAt: string;
  /** Legacy single-field status (kept for backwards compat) */
  status: PatternStatus;
  /** Multi-dimensional status — use this for display and logic */
  statusDetail: PatternStatusDetail;
  dataValidation: DataValidation | null;
  historical: HistoricalKpi | null;
  wf: WfKpi | null;
  wfAudit: WfAudit | null;
}

export interface TenPatternResultsFile {
  generatedAt: string;
  registryVersion: string;
  patterns: Record<string, TenPatternResult>;
}

export const EMPTY_RESULT = (patternId: string): TenPatternResult => ({
  patternId,
  registryVersion: "1.0.0",
  computedAt: new Date().toISOString(),
  status: "not_tested",
  statusDetail: {
    calculationStatus: "not_calculated",
    dataStatus: "complete",
    profitabilityStatus: "not_assessed",
    walkForwardStatus: "not_run",
    robustnessStatus: "not_assessed",
    productionStatus: "not_approved",
  },
  dataValidation: null,
  historical: null,
  wf: null,
  wfAudit: null,
});

/** Returns display string for a win rate pct (0–100), or fallback */
export function fmtWinRate(pct: number | null | undefined, fallback = "—"): string {
  if (pct == null) return fallback;
  return `${pct.toFixed(0)}%`;
}

/** Returns display string for a return percent, or fallback */
export function fmtReturn(pct: number | null | undefined, fallback = "—"): string {
  if (pct == null) return fallback;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

/** Returns display string for a ratio, or fallback */
export function fmtRatio(v: number | null | undefined, decimals = 2, fallback = "—"): string {
  if (v == null) return fallback;
  return v.toFixed(decimals);
}

/** Derive ProfitabilityStatus from OOS avg return */
export function deriveProfitabilityStatus(oosAvgReturnPct: number | null | undefined): ProfitabilityStatus {
  if (oosAvgReturnPct == null) return "not_assessed";
  if (oosAvgReturnPct > 0.5)  return "positive_oos_expectancy";
  if (oosAvgReturnPct < -0.5) return "negative_oos_expectancy";
  return "near_zero_expectancy";
}

/** Derive RobustnessStatus from robustnessPct */
export function deriveRobustnessStatus(robustnessPct: number | null | undefined): RobustnessStatus {
  if (robustnessPct == null) return "not_assessed";
  if (robustnessPct >= 70)   return "strong";
  if (robustnessPct >= 50)   return "moderate";
  return "weak";
}
