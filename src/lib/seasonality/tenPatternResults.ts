/**
 * Ten Pattern Results — schema for persisted computation output.
 *
 * Result files live at:
 *   public/generated/seasonality/ten_patterns/results.json
 *
 * All rates are stored on 0–100 scale (percent) for clarity.
 * All return values are stored in percent (e.g. 2.4 = 2.4%).
 */

import type { PatternStatus } from "./tenPatternsRegistry";

export interface YearReturn {
  year: number;
  returnPct: number;
  direction: "LONG" | "SHORT";
  entrySlot: number;
  exitSlot: number;
  entryDate?: string;
  exitDate?: string;
}

export interface HistoricalKpi {
  /** In-sample win rate, 0–100 */
  winRatePct: number;
  /** Average return per trade in percent */
  avgReturnPct: number;
  /** Number of observations (completed historical trades) */
  nObs: number;
  /** Maximum drawdown in percent (negative number, e.g. -8.3) */
  maxDrawdownPct: number;
  /** Sortino ratio, null if insufficient data */
  sortinoRatio: number | null;
  /** Profit factor (gross profit / gross loss), null if no losses */
  profitFactor: number | null;
  /** True if pattern showed positive performance in 3+ decades */
  decadeConsistent: boolean | null;
  /** Per-year returns */
  yearReturns: YearReturn[];
  /** Average return using arithmetic mean */
  avgReturnMeanPct: number;
  /** Average return using median */
  avgReturnMedianPct: number;
}

export interface WfFold {
  foldIndex: number;
  isStartYear: number;
  isEndYear: number;
  oosYear: number;
  isBestEntrySlot: number;
  isBestHoldingDays: number;
  oosReturnPct: number;
  oosWin: boolean;
}

export interface WfKpi {
  /** OOS win rate across all WF folds, 0–100 */
  oosWinRatePct: number;
  /** Average OOS return per fold in percent */
  oosAvgReturnPct: number;
  /** Number of WF folds run */
  nFolds: number;
  /** Total OOS observations */
  nOosObs: number;
  /** OOS max drawdown in percent (negative) */
  oosMaxDrawdownPct: number;
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
  nullPriceCount: number;
  gapDaysOver5: number;
  outliersRemoved: number;
  passed: boolean;
  notes: string[];
}

export interface TenPatternResult {
  patternId: string;
  registryVersion: string;
  computedAt: string;
  status: PatternStatus;
  dataValidation: DataValidation | null;
  historical: HistoricalKpi | null;
  wf: WfKpi | null;
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
  dataValidation: null,
  historical: null,
  wf: null,
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
