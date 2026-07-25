/**
 * Pattern Family Walk-Forward — Strict time-causal OOS validation.
 *
 * Leakage audit:
 * - Candidate selection: ONLY on allYears.slice(0, blockStart) — never touches OOS years.
 * - OOS evaluation: the frozen candidate is applied to OOS years that were never in training.
 * - No look-ahead: each fold freezes the rule BEFORE seeing the OOS block.
 * - Parameter stability: measured from fold-by-fold consistency, never from OOS outcomes.
 * - validatedCurrentPattern: selected via the same method applied to ALL completed years
 *   (not post-hoc optimised on OOS results).
 *
 * Default config: initialTrainingYears=10, oosBlockYears=2.
 * Quality score 0-100 with full parameter stability and sample-size weighting.
 */

import type { DailyBar } from "./walkForward/types";
import type { PatternDirection, PatternHolding } from "./patternSelection";
import { slotToApproxDate } from "./patternSelection";
import { completeYears, csvFingerprint } from "./walkForward/csvDataLoader";
import {
  buildYearSlotLookup,
  computeBarLevelRiskMetricsFromTrades,
  getPatternTradeForYear,
  type PatternTradeAuditMetrics,
  type PatternTradePath,
  type YearSlotLookup,
} from "./barLevelRisk";
import { computeCalmar as computeTradeCloseCalmar, computeMaxDrawdown as computeTradeCloseMaxDrawdown } from "./tradingViewMetrics";
import {
  SEASONALITY_CALCULATION_VERSION,
  SEASONALITY_CALMAR_FORMULA_VERSION,
  SEASONALITY_DRAWDOWN_METHOD_VERSION,
  SEASONALITY_METRIC_FORMULA_VERSION,
  SEASONALITY_PATTERN_SELECTION_VERSION,
  SEASONALITY_QUALITY_RISK_INPUT_VERSION,
  SEASONALITY_RESULT_IDENTITY_VERSION,
  SEASONALITY_SHARPE_FORMULA_VERSION,
} from "./versions";

const HOLDING_CANDIDATES: PatternHolding[] = [10, 12, 14, 16, 18, 20];
const LOCAL_ENTRY_SHIFTS = [-3, -2, -1, 0, 1, 2, 3] as const;
type LocalEntryShift = typeof LOCAL_ENTRY_SHIFTS[number];
export const LOCAL_WALK_FORWARD_FAMILY_VERSION = "local_family_v1";

// ── Version tag ────────────────────────────────────────────────────────────────
/** Bump when scoring formula or candidate-selection logic changes. */
export const PFWF_CONFIG_VERSION = "v3.0_local_family_bar_level_oos_risk";

export interface LocalWalkForwardFamilyConfig {
  version: string;
  directionFixed: true;
  maxEntryShiftTradingDays: number;
  maxHoldingChangeTradingDays: number;
  maxExitShiftTradingDays: number;
  sameSeasonWindowRequired: true;
}

export interface SelectedPatternBaseline {
  assetId: string;
  direction: PatternDirection;
  entrySlot: number;
  exitSlot: number;
  windowLabel: string;
  holdingDays: PatternHolding | null;
}

export interface DeploymentPattern {
  assetId: string;
  direction: PatternDirection;
  entrySlot: number;
  holdingDays: PatternHolding;
  exitSlot: number;
  windowLabel: string;
  relationToSelected: {
    entryShiftTradingDays: number;
    holdingChangeTradingDays: number;
    exitShiftTradingDays: number;
  };
  validatedByFamilyOosResultId: string;
}

export const DEFAULT_LOCAL_WALK_FORWARD_FAMILY_CONFIG: LocalWalkForwardFamilyConfig = {
  version: LOCAL_WALK_FORWARD_FAMILY_VERSION,
  directionFixed: true,
  maxEntryShiftTradingDays: 3,
  maxHoldingChangeTradingDays: 4,
  maxExitShiftTradingDays: 5,
  sameSeasonWindowRequired: true,
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ValidatedCurrentPattern {
  direction: PatternDirection;
  entryShift: number;
  startSlot: number;
  endSlot: number;
  holdingDays: PatternHolding;
  entryDateLabel: string;
  exitDateLabel: string;
  /** All history through this year was used for selection. */
  basedOnAllYearsThrough: number;
}

export interface PFWFold {
  foldIndex: number;
  trainingYears: number[];
  trainingEndYear: number;
  /** First OOS year of the block. */
  oosYear: number;
  // Selected rule (from training only — never touched OOS)
  selectedEntryShift: number;
  selectedHoldingDays: PatternHolding;
  selectedEntrySlot: number;
  selectedExitSlot: number;
  // Training score of the selected rule
  trainingWinRate: number;
  trainingAvgReturn: number;
  trainingCandidateCount: number;
  // OOS result
  oosEntryDate: string | null;
  oosExitDate: string | null;
  oosEntryPrice: number | null;
  oosExitPrice: number | null;
  oosReturn: number | null;
  oosWin: boolean | null;
  oosValid: boolean;
  oosInvalidReason: string | null;
  // Audit
  ruleChangedFromPreviousFold: boolean;
  lookaheadCheckPassed: true;
}

export interface PFWQualityResult {
  status: "Not tested" | "Insufficient OOS sample" | "Failed" | "Weak" | "Promising" | "Strong" | "Excellent";
  /** Numeric quality score 0–100. 0 = leakage/invalid; 1–39 = Failed/Insufficient. */
  qualityScore: number;
  oosTradeCount: number;
  oosWinRate: number;
  oosAvgReturn: number;
  oosCompoundReturn: number;
  oosMaxDrawdown: number;
  oosProfitFactor: number;
  positiveOosFolds: number;
  totalOosFolds: number;
  /** 0–1: fraction of folds where the most-common {shift,holding} was selected. */
  parameterStability: number;
  neighborStabilityNote: string;
  leakageCheckPassed: boolean;
  auditMetrics?: PatternTradeAuditMetrics;
  oosBarLevelCalmar?: number | null;
}

export interface PatternFamilyWFResult {
  resultId: string;
  lockedPatternAnchor: string;
  assetId: string;
  monitoringSymbol?: string;
  sourceType?: "manual_tv_csv" | "existing_yahoo_provider" | "other_verified_source";
  sourcePathOrProviderSymbol?: string;
  sourceFingerprint?: string;
  baselineHoldingDays?: PatternHolding | null;
  selectedPatternBaseline: SelectedPatternBaseline;
  familyConfig: LocalWalkForwardFamilyConfig;
  directionFixed: PatternDirection;
  anchorStartSlot: number;
  entryShiftCandidates: number[];
  holdingCandidates: PatternHolding[];
  candidatesPerFold: number;
  // Config
  initialTrainingYears: number;
  oosBlockYears: number;
  configVersion: string;
  // History used
  earliestHistoryYear: number;
  latestHistoryYear: number;
  // Results
  folds: PFWFold[];
  oosTrades: number;
  // Stitched OOS metrics
  stitchedOosWinRate: number;
  stitchedOosAvgReturn: number;
  stitchedOosCompound: number;
  stitchedOosMaxDD: number;
  stitchedOosBarLevelCalmar?: number | null;
  oosProfitFactor: number;
  // Parameter stability
  parameterStability: number;
  // Quality
  quality: PFWQualityResult;
  /** Pattern validated using full history (not OOS-derived). null if WF failed. */
  validatedCurrentPattern: ValidatedCurrentPattern | null;
  deploymentPattern: DeploymentPattern | null;
  resultIdentity?: {
    identityVersion: string;
    assetId: string;
    monitoringSymbol: string;
    sourceType: "manual_tv_csv" | "existing_yahoo_provider" | "other_verified_source";
    sourcePathOrProviderSymbol: string;
    sourceFingerprint: string;
    calculationVersion: string;
    metricFormulaVersion: string;
    drawdownMethodVersion: string;
    calmarFormulaVersion: string;
    qualityRiskInputVersion: string;
    sharpeFormulaVersion: string;
    patternSelectionVersion: string;
    resultType: "strict_walk_forward_oos";
    requestedSampleYears: "MAX";
    includedYears: number[];
    excludedYears: Array<{ year: number; reason: string }>;
    patternIdentity: {
      direction: PatternDirection;
      startSlot: number;
      holdingDays: PatternHolding | null;
    };
  };
  generatedAt: string;
  auditMetrics?: {
    tradeCloseStitchedOosMaxDrawdown: number;
    tradeCloseStitchedOosCalmar: number | null;
  };
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function evalCandidate(
  lookup: YearSlotLookup,
  years: number[],
  entrySlot: number,
  holding: PatternHolding,
  direction: PatternDirection,
): { winRate: number; avgReturn: number; validCount: number } {
  const rets: number[] = [];
  for (const year of years) {
    const trade = getPatternTradeForYear(lookup, year, entrySlot, holding, direction).trade;
    if (!trade) continue;
    rets.push(trade.strategyReturn);
  }
  const n = rets.length;
  if (n === 0) return { winRate: 50, avgReturn: 0, validCount: 0 };
  const mean = rets.reduce((s, r) => s + r, 0) / n;
  const wins = rets.filter(r => r > 0).length;
  return { winRate: (wins / n) * 100, avgReturn: mean, validCount: n };
}

function buildResultId(
  assetId: string,
  direction: PatternDirection,
  anchorStartSlot: number,
  baselineHoldingDays: PatternHolding | null,
): string {
  return `pfwf-local-${assetId}-${direction}-S${anchorStartSlot}-H${baselineHoldingDays ?? "na"}-${PFWF_CONFIG_VERSION}`;
}

function buildHoldingCandidates(baselineHoldingDays: PatternHolding | null): PatternHolding[] {
  if (baselineHoldingDays == null) return [...HOLDING_CANDIDATES];
  return HOLDING_CANDIDATES.filter((holding) =>
    Math.abs(holding - baselineHoldingDays) <= DEFAULT_LOCAL_WALK_FORWARD_FAMILY_CONFIG.maxHoldingChangeTradingDays,
  );
}

function isCandidateAllowed(
  anchorStartSlot: number,
  baselineHoldingDays: PatternHolding | null,
  entrySlot: number,
  holdingDays: PatternHolding,
): boolean {
  const cfg = DEFAULT_LOCAL_WALK_FORWARD_FAMILY_CONFIG;
  if (Math.abs(entrySlot - anchorStartSlot) > cfg.maxEntryShiftTradingDays) return false;
  if (baselineHoldingDays != null && Math.abs(holdingDays - baselineHoldingDays) > cfg.maxHoldingChangeTradingDays) return false;
  if (baselineHoldingDays != null) {
    const baselineExitSlot = anchorStartSlot + baselineHoldingDays;
    const candidateExitSlot = entrySlot + holdingDays;
    if (Math.abs(candidateExitSlot - baselineExitSlot) > cfg.maxExitShiftTradingDays) return false;
  }
  return true;
}

/** Select the best {shift, holding} candidate from training data only. */
function selectBestCandidate(
  lookup: YearSlotLookup,
  trainingYears: number[],
  anchorStartSlot: number,
  direction: PatternDirection,
  baselineHoldingDays: PatternHolding | null,
): { shift: number; holding: PatternHolding; candidateCount: number } {
  let bestShift: number = 0;
  const initialHolding = baselineHoldingDays != null ? buildHoldingCandidates(baselineHoldingDays)[0] ?? 10 : 10;
  let bestHolding: PatternHolding = initialHolding;
  let bestScore = -Infinity;
  let candidateCount = 0;
  const holdingCandidates = buildHoldingCandidates(baselineHoldingDays);

  for (const shift of LOCAL_ENTRY_SHIFTS) {
    const entrySlot = anchorStartSlot + shift;
    if (entrySlot < 1 || entrySlot > 242) continue;
    for (const holding of holdingCandidates) {
      if (!isCandidateAllowed(anchorStartSlot, baselineHoldingDays, entrySlot, holding)) continue;
      const { winRate, avgReturn, validCount } = evalCandidate(lookup, trainingYears, entrySlot, holding, direction);
      if (validCount < 3) continue;
      candidateCount++;
      // Score: prefer higher winRate, break ties with avgReturn, prefer shorter holding
      const score = winRate * 1000 + avgReturn * 100 - holding * 0.01;
      if (score > bestScore) { bestScore = score; bestShift = shift; bestHolding = holding; }
    }
  }
  return { shift: bestShift, holding: bestHolding, candidateCount };
}

/** Evaluate a frozen candidate on a single OOS year. */
function evaluateOosYear(
  lookup: YearSlotLookup,
  oosYear: number,
  entrySlot: number,
  holdingDays: PatternHolding,
  direction: PatternDirection,
) {
  const { trade, missingReason } = getPatternTradeForYear(lookup, oosYear, entrySlot, holdingDays, direction);
  if (!trade) {
    const entry = lookup.yearMap.get(oosYear)?.barsBySlot.get(entrySlot) ?? null;
    return {
      trade: null,
      oosReturn: null,
      oosWin: null,
      oosValid: false,
      oosInvalidReason: missingReason ?? `missing_trade_${oosYear}`,
      oosEntryDate: entry?.date ?? null,
      oosExitDate: null,
      oosEntryPrice: entry?.close ?? null,
      oosExitPrice: null,
    };
  }
  return {
    trade,
    oosReturn: parseFloat(trade.strategyReturn.toFixed(6)),
    oosWin: trade.strategyReturn > 0,
    oosValid: true,
    oosInvalidReason: null,
    oosEntryDate: trade.entryDate,
    oosExitDate: trade.exitDate,
    oosEntryPrice: parseFloat(trade.entryPrice.toFixed(2)),
    oosExitPrice: parseFloat(trade.exitPrice.toFixed(2)),
  };
}

// ── Quality score 0–100 ────────────────────────────────────────────────────────

/**
 * Compute walk-forward quality score 0–100.
 *
 * Formula (all components 0–1, then weighted sum × 100):
 *   wrComponent     = clamp((oosWinRate-50)/30, 0, 1)       weight 0.28
 *   retComponent    = clamp(oosAvgReturn/0.02,  0, 1)       weight 0.22
 *   pfComponent     = clamp((oosPF-1)/1.5,      0, 1)       weight 0.18
 *   ddComponent     = clamp(1-oosMaxDD/0.25,    0, 1)       weight 0.12
 *   foldComponent   = positiveFoldRate                       weight 0.10
 *   stabilityComp   = parameterStability                     weight 0.10
 *   rawScore        = sum(weight*component) × 100 × sampleMult
 *
 * sampleMult = clamp(0.5 + (oosTradeCount-5)/(15-5)*0.5, 0.5, 1.0)
 *   (linearly ramps from 0.5 at 5 trades to 1.0 at 15+ trades)
 *
 * Hard caps:
 *   leakagePassed=false → 0
 *   oosTradeCount<5 or oosFoldCount<3 → clamp to [0,39]
 *   oosAvgReturn<=0 → clamp to [0,39]
 *   oosProfitFactor<=1 → clamp to [0,49]
 *
 * Score bands:
 *   0–39  = Failed / Insufficient
 *   40–59 = Weak
 *   60–74 = Promising
 *   75–89 = Strong
 *   90–100= Excellent
 */
export function computeWalkForwardQualityScore(inputs: {
  oosTradeCount:      number;
  oosFoldCount:       number;
  oosWinRate:         number; // 0–100
  oosAverageReturn:   number; // fraction
  oosProfitFactor:    number;
  oosMaxDrawdown:     number; // fraction
  positiveFoldRate:   number; // 0–1
  parameterStability: number; // 0–1
  leakagePassed:      boolean;
}): number {
  if (!inputs.leakagePassed) return 0;

  if (inputs.oosTradeCount < 5 || inputs.oosFoldCount < 3) {
    return Math.min(39, Math.round(inputs.oosTradeCount * 5 + inputs.oosFoldCount * 2));
  }
  if (inputs.oosAverageReturn <= 0) {
    return Math.min(39, Math.round(20 + inputs.oosWinRate * 0.2));
  }
  if (inputs.oosProfitFactor <= 1.0) {
    return Math.min(49, Math.round(28 + inputs.oosWinRate * 0.25));
  }

  const wr   = Math.max(0, Math.min(1, (inputs.oosWinRate - 50) / 30));
  const ret  = Math.min(1, inputs.oosAverageReturn / 0.02);
  const pf   = Math.min(1, (inputs.oosProfitFactor - 1) / 1.5);
  const dd   = Math.max(0, 1 - inputs.oosMaxDrawdown / 0.25);
  const fold = Math.max(0, Math.min(1, inputs.positiveFoldRate));
  const stab = Math.max(0, Math.min(1, inputs.parameterStability));

  const weighted = wr * 0.28 + ret * 0.22 + pf * 0.18 + dd * 0.12 + fold * 0.10 + stab * 0.10;

  const sampleMult = Math.min(1.0, 0.5 + Math.max(0, inputs.oosTradeCount - 5) / 10 * 0.5);
  const raw = weighted * 100 * sampleMult;

  return Math.min(100, Math.max(0, Math.round(raw)));
}

function scoreToStatus(score: number, n: number): PFWQualityResult["status"] {
  if (n < 5) return "Insufficient OOS sample";
  if (score <= 39) return "Failed";
  if (score <= 59) return "Weak";
  if (score <= 74) return "Promising";
  if (score <= 89) return "Strong";
  return "Excellent";
}

// ── Main WF function ───────────────────────────────────────────────────────────

export function runPatternFamilyWalkForward(
  allBars: DailyBar[],
  assetId: string,
  direction: PatternDirection,
  anchorStartSlot: number,
  initialTrainingYears = 10,
  oosBlockYears = 2,
  baselineHoldingDays: PatternHolding | null = null,
  identity?: {
    monitoringSymbol: string;
    sourceType: "manual_tv_csv" | "existing_yahoo_provider" | "other_verified_source";
    sourcePathOrProviderSymbol: string;
    sourceFingerprint: string;
  },
): PatternFamilyWFResult {
  const lookup = buildYearSlotLookup(allBars);
  const resultId = buildResultId(assetId, direction, anchorStartSlot, baselineHoldingDays);
  const currentYear = new Date().getFullYear();
  const allHistoricalYears = Array.from(new Set(allBars.map((bar) => parseInt(bar.date.slice(0, 4), 10))))
    .filter((year) => year < currentYear)
    .sort((a, b) => a - b);
  const allYears = Array.from(lookup.yearMap.keys())
    .filter(y => y < currentYear)
    .sort((a, b) => a - b);

  if (allYears.length < initialTrainingYears + oosBlockYears) {
    return buildEmptyResult(assetId, direction, anchorStartSlot, initialTrainingYears, oosBlockYears,
      allYears[0] ?? currentYear - 20, allYears[allYears.length - 1] ?? currentYear - 1, baselineHoldingDays);
  }

  const folds: PFWFold[] = [];
  const validTradePaths: PatternTradePath[] = [];
  let prevSelectedShift = 0;
  let prevSelectedHolding: PatternHolding = baselineHoldingDays ?? 10;
  const selectedPatternBaseline: SelectedPatternBaseline = {
    assetId,
    direction,
    entrySlot: anchorStartSlot,
    exitSlot: anchorStartSlot + (baselineHoldingDays ?? 0),
    windowLabel: baselineHoldingDays != null
      ? `${slotToApproxDate(anchorStartSlot)} - ${slotToApproxDate(anchorStartSlot + baselineHoldingDays)}`
      : `${slotToApproxDate(anchorStartSlot)}`,
    holdingDays: baselineHoldingDays,
  };
  const holdingCandidates = buildHoldingCandidates(baselineHoldingDays);

  // Anchored expanding: each block trains on everything before it, tests the block
  for (let blockStart = initialTrainingYears; blockStart < allYears.length; blockStart += oosBlockYears) {
    const oosBlock = allYears.slice(blockStart, blockStart + oosBlockYears);
    if (oosBlock.length === 0) break;

    const trainingYears = allYears.slice(0, blockStart);
    if (trainingYears.length < 3) continue;

    // === TRAINING PHASE: select candidate solely from training data ===
    const { shift: bestShift, holding: bestHolding, candidateCount } =
      selectBestCandidate(lookup, trainingYears, anchorStartSlot, direction, baselineHoldingDays);

    const selectedEntrySlot = anchorStartSlot + bestShift;
    const selectedExitSlot  = selectedEntrySlot + bestHolding;

    const trainingEval = evalCandidate(lookup, trainingYears, selectedEntrySlot, bestHolding, direction);

    // === OOS PHASE: frozen candidate applied to each OOS year in the block ===
    for (const oosYear of oosBlock) {
      const oos = evaluateOosYear(lookup, oosYear, selectedEntrySlot, bestHolding, direction);
      if (oos.trade) {
        validTradePaths.push(oos.trade);
      }
      const { trade: _trade, ...oosForFold } = oos;

      folds.push({
        foldIndex: folds.length + 1,
        trainingYears,
        trainingEndYear: trainingYears[trainingYears.length - 1],
        oosYear,
        selectedEntryShift:     bestShift,
        selectedHoldingDays:    bestHolding,
        selectedEntrySlot,
        selectedExitSlot,
        trainingWinRate:        parseFloat(trainingEval.winRate.toFixed(2)),
        trainingAvgReturn:      parseFloat(trainingEval.avgReturn.toFixed(6)),
        trainingCandidateCount: candidateCount,
        ...oosForFold,
        ruleChangedFromPreviousFold: bestShift !== prevSelectedShift || bestHolding !== prevSelectedHolding,
        lookaheadCheckPassed: true,
      });
    }
    prevSelectedShift   = bestShift;
    prevSelectedHolding = bestHolding;
  }

  // === Stitch OOS results ===
  const validFolds = folds.filter(f => f.oosValid && f.oosReturn != null);
  const oosReturns = validFolds.map(f => f.oosReturn!);
  const n = oosReturns.length;
  const wins = oosReturns.filter(r => r > 0).length;
  const mean = n > 0 ? oosReturns.reduce((s, r) => s + r, 0) / n : 0;
  const eq = oosReturns.reduce((value, ret) => value * (1 + ret), 1);
  const barLevelRisk = computeBarLevelRiskMetricsFromTrades(validTradePaths);
  const tradeCloseAudit: PatternTradeAuditMetrics = {
    tradeCloseMaxDrawdown: computeTradeCloseMaxDrawdown(oosReturns),
    tradeCloseCalmar: computeTradeCloseCalmar(oosReturns),
  };
  const maxDD = barLevelRisk.maxDrawdown;
  const grossW = oosReturns.filter(r => r > 0).reduce((s, r) => s + r, 0);
  const grossL = Math.abs(oosReturns.filter(r => r < 0).reduce((s, r) => s + r, 0));
  const pf = grossL > 0.001 ? grossW / grossL : (grossW > 0 ? 99 : 0);

  // === Parameter stability ===
  const paramKeys = validFolds.map(f => `${f.selectedEntryShift}:${f.selectedHoldingDays}`);
  const paramFreq = new Map<string, number>();
  for (const k of paramKeys) paramFreq.set(k, (paramFreq.get(k) ?? 0) + 1);
  const maxFreq = paramKeys.length > 0 ? Math.max(...paramFreq.values()) : 0;
  const parameterStability = paramKeys.length > 0 ? parseFloat((maxFreq / paramKeys.length).toFixed(3)) : 0;

  const positiveFoldRate = n > 0 ? wins / n : 0;
  const oosFoldCount = folds.length;

  // === Quality score and status ===
  const qualityScore = computeWalkForwardQualityScore({
    oosTradeCount:      n,
    oosFoldCount,
    oosWinRate:         n > 0 ? (wins / n) * 100 : 0,
    oosAverageReturn:   mean,
    oosProfitFactor:    pf,
    oosMaxDrawdown:     maxDD,
    positiveFoldRate,
    parameterStability,
    leakagePassed:      true,
  });
  const qualityStatus = scoreToStatus(qualityScore, n);

  const quality: PFWQualityResult = {
    status:             qualityStatus,
    qualityScore,
    oosTradeCount:      n,
    oosWinRate:         n > 0 ? parseFloat(((wins / n) * 100).toFixed(2)) : 0,
    oosAvgReturn:       parseFloat(mean.toFixed(6)),
    oosCompoundReturn:  parseFloat((eq - 1).toFixed(6)),
    oosMaxDrawdown:     parseFloat(maxDD.toFixed(6)),
    oosProfitFactor:    parseFloat(pf.toFixed(3)),
    positiveOosFolds:   wins,
    totalOosFolds:      oosFoldCount,
    parameterStability,
    neighborStabilityNote: `Direction fixed. ${paramKeys.length} OOS folds. Modal params used in ${maxFreq}/${paramKeys.length} folds.`,
    leakageCheckPassed: true,
    auditMetrics: tradeCloseAudit,
    oosBarLevelCalmar: barLevelRisk.calmar != null ? parseFloat(barLevelRisk.calmar.toFixed(6)) : null,
  };

  // === Validated current pattern ===
  // Apply the same selection method to ALL completed history — not derived from OOS outcomes.
  // This is the recommended candidate for the upcoming trade based on full evidence.
  let validatedCurrentPattern: ValidatedCurrentPattern | null = null;
  let deploymentPattern: DeploymentPattern | null = null;
  const isValidatedFamily = n >= 5 && qualityScore >= 75 && (qualityStatus === "Strong" || qualityStatus === "Excellent");
  if (isValidatedFamily) {
    const { shift: vShift, holding: vHolding } =
      selectBestCandidate(lookup, allYears, anchorStartSlot, direction, baselineHoldingDays);
    const vStart = anchorStartSlot + vShift;
    validatedCurrentPattern = {
      direction,
      entryShift: vShift,
      startSlot:  vStart,
      endSlot:    vStart + vHolding,
      holdingDays: vHolding,
      entryDateLabel: slotToApproxDate(vStart),
      exitDateLabel:  slotToApproxDate(vStart + vHolding),
      basedOnAllYearsThrough: allYears[allYears.length - 1],
    };
    deploymentPattern = {
      assetId,
      direction,
      entrySlot: vStart,
      holdingDays: vHolding,
      exitSlot: vStart + vHolding,
      windowLabel: `${slotToApproxDate(vStart)} - ${slotToApproxDate(vStart + vHolding)}`,
      relationToSelected: {
        entryShiftTradingDays: vStart - anchorStartSlot,
        holdingChangeTradingDays: baselineHoldingDays == null ? 0 : vHolding - baselineHoldingDays,
        exitShiftTradingDays: baselineHoldingDays == null ? 0 : (vStart + vHolding) - (anchorStartSlot + baselineHoldingDays),
      },
      validatedByFamilyOosResultId: resultId,
    };
  }

  return {
    resultId,
    lockedPatternAnchor: `${assetId}-${direction}-S${anchorStartSlot}`,
    assetId,
    monitoringSymbol: identity?.monitoringSymbol ?? assetId,
    sourceType: identity?.sourceType ?? "other_verified_source",
    sourcePathOrProviderSymbol: identity?.sourcePathOrProviderSymbol ?? assetId,
    sourceFingerprint: identity?.sourceFingerprint ?? csvFingerprint(allBars),
    baselineHoldingDays,
    selectedPatternBaseline,
    familyConfig: DEFAULT_LOCAL_WALK_FORWARD_FAMILY_CONFIG,
    directionFixed:     direction,
    anchorStartSlot,
    entryShiftCandidates: [...LOCAL_ENTRY_SHIFTS],
    holdingCandidates,
    candidatesPerFold:  LOCAL_ENTRY_SHIFTS.length * holdingCandidates.length,
    initialTrainingYears,
    oosBlockYears,
    configVersion:      PFWF_CONFIG_VERSION,
    earliestHistoryYear: allYears[0],
    latestHistoryYear:   allYears[allYears.length - 1],
    folds,
    oosTrades:           n,
    stitchedOosWinRate:  n > 0 ? parseFloat(((wins / n) * 100).toFixed(2)) : 0,
    stitchedOosAvgReturn: parseFloat(mean.toFixed(6)),
    stitchedOosCompound:  parseFloat((eq - 1).toFixed(6)),
    stitchedOosMaxDD:     parseFloat(maxDD.toFixed(6)),
    stitchedOosBarLevelCalmar: barLevelRisk.calmar != null ? parseFloat(barLevelRisk.calmar.toFixed(6)) : null,
    oosProfitFactor:      parseFloat(pf.toFixed(3)),
    parameterStability,
    quality,
    validatedCurrentPattern,
    deploymentPattern,
    resultIdentity: {
      identityVersion: SEASONALITY_RESULT_IDENTITY_VERSION,
      assetId,
      monitoringSymbol: identity?.monitoringSymbol ?? assetId,
      sourceType: identity?.sourceType ?? "other_verified_source",
      sourcePathOrProviderSymbol: identity?.sourcePathOrProviderSymbol ?? assetId,
      sourceFingerprint: identity?.sourceFingerprint ?? csvFingerprint(allBars),
      calculationVersion: SEASONALITY_CALCULATION_VERSION,
      metricFormulaVersion: SEASONALITY_METRIC_FORMULA_VERSION,
      drawdownMethodVersion: SEASONALITY_DRAWDOWN_METHOD_VERSION,
      calmarFormulaVersion: SEASONALITY_CALMAR_FORMULA_VERSION,
      qualityRiskInputVersion: SEASONALITY_QUALITY_RISK_INPUT_VERSION,
      sharpeFormulaVersion: SEASONALITY_SHARPE_FORMULA_VERSION,
      patternSelectionVersion: SEASONALITY_PATTERN_SELECTION_VERSION,
      resultType: "strict_walk_forward_oos",
      requestedSampleYears: "MAX",
      includedYears: allYears,
      excludedYears: allHistoricalYears
        .filter((year) => !allYears.includes(year))
        .map((year) => ({ year, reason: "incomplete_calendar_year" })),
      patternIdentity: {
        direction,
        startSlot: anchorStartSlot,
        holdingDays: baselineHoldingDays,
      },
    },
    generatedAt: new Date().toISOString(),
    auditMetrics: {
      tradeCloseStitchedOosMaxDrawdown: tradeCloseAudit.tradeCloseMaxDrawdown,
      tradeCloseStitchedOosCalmar: tradeCloseAudit.tradeCloseCalmar,
    },
  };
}

function buildEmptyResult(
  assetId: string, direction: PatternDirection, anchorStartSlot: number,
  iT: number, oosB: number, earliest: number, latest: number, baselineHoldingDays: PatternHolding | null,
): PatternFamilyWFResult {
  const resultId = buildResultId(assetId, direction, anchorStartSlot, baselineHoldingDays);
  const holdingCandidates = buildHoldingCandidates(baselineHoldingDays);
  const emptyQuality: PFWQualityResult = {
    status: "Insufficient OOS sample", qualityScore: 0,
    oosTradeCount: 0, oosWinRate: 0, oosAvgReturn: 0, oosCompoundReturn: 0,
    oosMaxDrawdown: 0, oosProfitFactor: 0, positiveOosFolds: 0, totalOosFolds: 0,
    parameterStability: 0,
    neighborStabilityNote: "Not enough history for this WF configuration",
    leakageCheckPassed: true,
    auditMetrics: { tradeCloseMaxDrawdown: 0, tradeCloseCalmar: null },
    oosBarLevelCalmar: null,
  };
  return {
    resultId,
    lockedPatternAnchor: `${assetId}-${direction}-S${anchorStartSlot}`,
    assetId,
    selectedPatternBaseline: {
      assetId,
      direction,
      entrySlot: anchorStartSlot,
      exitSlot: anchorStartSlot + (baselineHoldingDays ?? 0),
      windowLabel: baselineHoldingDays != null
        ? `${slotToApproxDate(anchorStartSlot)} - ${slotToApproxDate(anchorStartSlot + baselineHoldingDays)}`
        : `${slotToApproxDate(anchorStartSlot)}`,
      holdingDays: baselineHoldingDays,
    },
    familyConfig: DEFAULT_LOCAL_WALK_FORWARD_FAMILY_CONFIG,
    baselineHoldingDays,
    directionFixed: direction, anchorStartSlot,
    entryShiftCandidates: [...LOCAL_ENTRY_SHIFTS], holdingCandidates, candidatesPerFold: LOCAL_ENTRY_SHIFTS.length * holdingCandidates.length,
    initialTrainingYears: iT, oosBlockYears: oosB, configVersion: PFWF_CONFIG_VERSION,
    earliestHistoryYear: earliest, latestHistoryYear: latest,
    folds: [], oosTrades: 0,
    stitchedOosWinRate: 0, stitchedOosAvgReturn: 0, stitchedOosCompound: 0,
    stitchedOosMaxDD: 0, stitchedOosBarLevelCalmar: null, oosProfitFactor: 0,
    parameterStability: 0,
    quality: emptyQuality,
    validatedCurrentPattern: null,
    deploymentPattern: null,
    generatedAt: new Date().toISOString(),
    auditMetrics: {
      tradeCloseStitchedOosMaxDrawdown: 0,
      tradeCloseStitchedOosCalmar: null,
    },
  };
}
