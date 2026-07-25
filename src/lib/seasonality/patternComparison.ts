/**
 * PatternComparison — links a tested backtest/WF result to the cached baseline pattern.
 * All metric deltas are tested - baseline. Null means no meaningful difference.
 */

import type { PatternCandidate } from "./patternSelection";
import { formatPatternWindow } from "./patternSelection";

export type ComparisonResultType = "fixed_backtest" | "strict_walk_forward_oos";

export interface PatternComparison {
  resultType: ComparisonResultType;
  /** Tested metrics shown as main values in KPI panel */
  winRate:        number;        // 0–100
  avgPerformance: number;        // fraction
  maxDrawdown:    number;        // fraction (positive)
  sharpe:         number | null;
  calmar:         number | null;
  profitFactor:   number;
  /** When tested pattern uses different slot/holding than baseline */
  windowChanged:     boolean;
  holdingChanged:    boolean;
  testedWindow?:     string;     // formatted window label if changed
  testedHoldingDays?: number;    // if changed
  /** Deltas: tested − baseline. Null suppressed (below threshold or missing data). */
  dWinRate:  number | null;      // percentage points
  dAvgPerf:  number | null;      // percentage points
  dMaxDD:    number | null;      // percentage points
  dSharpe:   number | null;      // ratio difference
  dCalmar:   number | null;      // ratio difference
  dPF:       number | null;      // ratio difference
}

const PCT_THRESHOLD   = 0.1;    // < 0.1 pp → suppress
const RATIO_THRESHOLD = 0.005;  // < 0.005 → suppress

function dPct(tested: number, baseline: number): number | null {
  const d = parseFloat((tested - baseline).toFixed(2));
  return Math.abs(d) >= PCT_THRESHOLD ? d : null;
}
function dRatio(tested: number | null, baseline: number | null): number | null {
  if (tested == null || baseline == null) return null;
  const d = parseFloat((tested - baseline).toFixed(3));
  return Math.abs(d) >= RATIO_THRESHOLD ? d : null;
}

export function computePatternComparison(
  baseline:       PatternCandidate,
  resultType:     ComparisonResultType,
  winRate:        number,
  avgPerformance: number,
  maxDrawdown:    number,
  sharpe:         number | null,
  calmar:         number | null,
  profitFactor:   number,
  testedStartSlot:   number = baseline.startSlot,
  testedHoldingDays: number = baseline.holdingDays,
): PatternComparison {
  const windowChanged = testedStartSlot  !== baseline.startSlot;
  const holdingChanged = testedHoldingDays !== baseline.holdingDays;

  return {
    resultType,
    winRate, avgPerformance, maxDrawdown, sharpe, calmar, profitFactor,
    windowChanged,
    holdingChanged,
    testedWindow:     windowChanged  ? formatPatternWindow(testedStartSlot, testedStartSlot + testedHoldingDays) : undefined,
    testedHoldingDays: holdingChanged ? testedHoldingDays : undefined,
    dWinRate: dPct(winRate,                     baseline.winRate),
    dAvgPerf: dPct(avgPerformance * 100,        baseline.avgPerformance * 100),
    dMaxDD:   dPct(maxDrawdown * 100,           baseline.maxDrawdown * 100),
    dSharpe:  dRatio(sharpe,                    baseline.sharpe),
    dCalmar:  dRatio(calmar,                    baseline.calmar),
    dPF:      dRatio(profitFactor,              baseline.profitFactor ?? null),
  };
}
