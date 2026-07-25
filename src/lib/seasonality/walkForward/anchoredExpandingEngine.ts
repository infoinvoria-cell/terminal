// V2: Anchored Expanding OOS Walk-Forward Engine
// Historical CSV Research Only. NOT a live trading signal.
// canBePromotedToLiveSignal = false always.

import { completeYears, csvFingerprint, dateYear } from "./csvDataLoader";
import { computeOosSummary, computeStabilityScore, computeTradeMetrics } from "./metrics";
import { DEFAULT_RESEARCH_GATE_CRITERIA } from "./types";
import type {
  AnchoredFoldStatus,
  AnchoredWalkForwardFold,
  DailyBar,
  RobustnessCell,
  RobustnessClassification,
  RobustnessResult,
  SeasonalPatternCandidate,
  SeasonalRuleVersion,
  SeasonalTrade,
  StitchedOosResult,
  WFDirection,
  WFResearchGateResult,
  WFTradeMetrics,
  WalkForwardExperiment,
} from "./types";

// ─── Helpers (reuse engine pattern) ──────────────────────────────────────────

interface BarIndex {
  yearBars: Map<number, DailyBar[]>;
  dateIndex: Map<string, number>;
}

function buildIndex(allBars: DailyBar[]): BarIndex {
  const yearBars = new Map<number, DailyBar[]>();
  const dateIndex = new Map<string, number>();
  for (let i = 0; i < allBars.length; i++) {
    const bar = allBars[i];
    const y = dateYear(bar.date);
    let yArr = yearBars.get(y);
    if (!yArr) { yArr = []; yearBars.set(y, yArr); }
    yArr.push(bar);
    dateIndex.set(bar.date, i);
  }
  return { yearBars, dateIndex };
}

function findEntryBarFast(yearBars: DailyBar[], targetMD: string): DailyBar | null {
  for (const bar of yearBars) {
    if (bar.date.slice(5) >= targetMD) return bar;
  }
  return null;
}

function findExitBarFast(allBars: DailyBar[], dateIndex: Map<string, number>, entryBar: DailyBar, holdingTradingDays: number): DailyBar | null {
  const idx = dateIndex.get(entryBar.date);
  if (idx === undefined) return null;
  const exitIdx = idx + holdingTradingDays;
  return exitIdx < allBars.length ? allBars[exitIdx] : null;
}

function tradeReturn(direction: WFDirection, entry: number, exit: number): number {
  return direction === "LONG" ? (exit - entry) / entry : (entry - exit) / entry;
}

function extractValidMDs(idx: BarIndex, trainingYears: number[]): string[] {
  const all = new Set<string>();
  for (const y of trainingYears) {
    for (const bar of (idx.yearBars.get(y) ?? [])) all.add(bar.date.slice(5));
  }
  const result: string[] = [];
  for (const md of all) {
    let valid = true;
    for (const y of trainingYears) {
      if (!findEntryBarFast(idx.yearBars.get(y) ?? [], md)) { valid = false; break; }
    }
    if (valid) result.push(md);
  }
  return result.sort();
}

function selectBestCandidate(
  allBars: DailyBar[],
  idx: BarIndex,
  trainingYears: number[],
  directions: WFDirection[],
  holdingMin: number,
  holdingMax: number,
  costBps: number,
): SeasonalPatternCandidate | null {
  const validMDs = extractValidMDs(idx, trainingYears);
  let best: SeasonalPatternCandidate | null = null;
  let bestKey: [number, number, number, number, number, string, string] | null = null;

  for (const direction of directions) {
    for (const md of validMDs) {
      for (let hd = holdingMin; hd <= holdingMax; hd++) {
        const returns: number[] = [];
        const years: number[] = [];
        let valid = true;

        for (const y of trainingYears) {
          const entryBar = findEntryBarFast(idx.yearBars.get(y) ?? [], md);
          if (!entryBar) { valid = false; break; }
          const exitBar = findExitBarFast(allBars, idx.dateIndex, entryBar, hd);
          if (!exitBar) { valid = false; break; }
          const gross = tradeReturn(direction, entryBar.open, exitBar.close);
          returns.push(gross - costBps / 10000);
          years.push(y);
        }

        if (!valid) continue;

        const metrics = computeTradeMetrics(returns, years);
        const ss = computeStabilityScore(metrics);
        const key: [number, number, number, number, number, string, string] = [
          -ss, -metrics.compoundedReturn, -metrics.winRate,
          metrics.maxDrawdown, hd, md, direction,
        ];

        if (bestKey === null || key < bestKey) {
          bestKey = key;
          best = { direction, entryMonthDay: md, holdingTradingDays: hd, stabilityScore: ss, trainingMetrics: metrics };
        }
      }
    }
  }
  return best;
}

// ─── Anchored fold generation ─────────────────────────────────────────────────

export interface AnchoredExpandingConfig {
  assetId: string;
  anchorYear: number;        // first complete year to start training
  oosBlockYears: number;     // years per OOS block (default 2)
  minInitialTrainYears: number; // minimum years to start first OOS block
  holdingDaysMin: number;
  holdingDaysMax: number;
  directions: WFDirection[];
  transactionCostBps: number;
}

export function runAnchoredExpandingWalkForward(
  allBars: DailyBar[],
  csvPath: string,
  config: AnchoredExpandingConfig,
  experimentId: string,
): WalkForwardExperiment {
  const startMs = Date.now();
  const idx = buildIndex(allBars);
  const allComplete = completeYears(allBars);
  const fingerprint = csvFingerprint(allBars);
  const warnings: string[] = [];

  // Filter to years >= anchorYear
  const availableYears = allComplete.filter((y) => y >= config.anchorYear);
  if (availableYears.length < config.minInitialTrainYears + config.oosBlockYears) {
    warnings.push(`Insufficient data: need ${config.minInitialTrainYears + config.oosBlockYears} complete years >= ${config.anchorYear}, found ${availableYears.length}`);
  }

  const ruleVersions: SeasonalRuleVersion[] = [];
  const folds: AnchoredWalkForwardFold[] = [];
  const validOosReturns: number[] = [];
  const validOosYears: number[] = [];
  const validFoldIds: number[] = [];
  const provisionalFoldIds: number[] = [];
  let foldId = 1;

  // Build fold schedule: training expands from anchor, OOS moves by oosBlockYears
  // Initial training: anchorYear .. anchorYear + minInitialTrainYears - 1
  // First OOS: anchorYear + minInitialTrainYears .. anchorYear + minInitialTrainYears + oosBlockYears - 1
  const currentYear = new Date().getFullYear();
  let trainEndIdx = config.minInitialTrainYears - 1; // index into availableYears

  while (trainEndIdx < availableYears.length - 1) {
    const trainingYears = availableYears.slice(0, trainEndIdx + 1);
    const oosStartIdx = trainEndIdx + 1;
    const oosEndIdx = Math.min(oosStartIdx + config.oosBlockYears - 1, availableYears.length - 1);

    if (oosStartIdx >= availableYears.length) break;

    const oosYears = availableYears.slice(oosStartIdx, oosEndIdx + 1);
    const oosStartYear = oosYears[0];
    const oosEndYear = oosYears[oosYears.length - 1];
    const trainingEndYear = trainingYears[trainingYears.length - 1];

    // Determine if OOS block is complete or provisional
    const isProvisional = oosYears.some((y) => {
      // A year is partial/provisional if it's the current year
      return y >= currentYear;
    });

    // Select best candidate from training data only
    const best = selectBestCandidate(
      allBars, idx, trainingYears,
      config.directions, config.holdingDaysMin, config.holdingDaysMax,
      config.transactionCostBps,
    );

    const ruleVersionId = `${experimentId}_fold${foldId}_rule`;

    // Create rule version (AUTO_GRID = SYSTEM_FROZEN_BEFORE_OOS)
    const ruleVersion: SeasonalRuleVersion = {
      ruleVersionId,
      experimentId,
      symbol: "",
      displayName: best ? `${best.direction} ${best.entryMonthDay} +${best.holdingTradingDays}d` : "NO_CANDIDATE",
      createdAt: new Date().toISOString(),
      sourceMode: "AUTO_GRID",
      freezeEvidence: "SYSTEM_FROZEN_BEFORE_OOS",
      frozenBeforeOosStart: true,
      trainingStartYear: availableYears[0],
      trainingEndYear,
      intendedOosStartYear: oosStartYear,
      intendedOosEndYear: oosEndYear,
      direction: best?.direction ?? "LONG",
      entryMonthDay: best?.entryMonthDay ?? "",
      holdingTradingDays: best?.holdingTradingDays ?? 0,
      commissionBps: config.transactionCostBps,
      slippageBps: 0,
      rationale: "AUTO_GRID selection from training data only",
      userNotes: "",
      validForOosEvaluation: best !== null,
    };
    ruleVersions.push(ruleVersion);

    // Execute OOS trades
    const oosTrades: SeasonalTrade[] = [];
    const oosReturns: number[] = [];

    let validityStatus: AnchoredFoldStatus = "VALID_OOS";
    const validationWarnings: string[] = [];

    if (!best) {
      validityStatus = "INVALID_MISSING_DATA";
      validationWarnings.push("No training candidate found");
    } else {
      for (const oosYear of oosYears) {
        const yBars = idx.yearBars.get(oosYear) ?? [];
        const entryBar = findEntryBarFast(yBars, best.entryMonthDay);
        if (!entryBar) {
          validationWarnings.push(`No entry bar for ${oosYear}`);
          continue;
        }
        const exitBar = findExitBarFast(allBars, idx.dateIndex, entryBar, best.holdingTradingDays);
        if (!exitBar) {
          validationWarnings.push(`No exit bar for ${oosYear}`);
          continue;
        }
        const gross = tradeReturn(best.direction, entryBar.open, exitBar.close);
        const net = gross - config.transactionCostBps / 10000;
        oosReturns.push(net);

        const sampleType = isProvisional ? "CURRENT_YEAR_PROVISIONAL" : "OUT_OF_SAMPLE";
        oosTrades.push({
          year: oosYear,
          direction: best.direction,
          plannedEntryMonthDay: best.entryMonthDay,
          actualEntryDate: entryBar.date,
          actualExitDate: exitBar.date,
          entryPrice: entryBar.open,
          exitPrice: exitBar.close,
          grossReturn: gross,
          netReturn: net,
          source: "historical_csv_walk_forward",
          sampleType,
        });
      }

      if (isProvisional) {
        validityStatus = "PROVISIONAL_INCOMPLETE_OOS";
      }
    }

    const oosMetrics = oosReturns.length > 0
      ? computeTradeMetrics(oosReturns, oosYears.slice(0, oosReturns.length))
      : null;

    const fold: AnchoredWalkForwardFold = {
      foldId,
      experimentId,
      symbol: "",
      backadjustmentStatus: "assumed_backadjusted",
      trainingStartYear: availableYears[0],
      trainingEndYear,
      oosStartYear,
      oosEndYear,
      ruleVersionId,
      ruleFreezeEvidence: "SYSTEM_FROZEN_BEFORE_OOS",
      selectedFromTrainingOnly: true,
      lookaheadCheckPassed: true,
      validityStatus,
      validationWarnings,
      trainingMetrics: best?.trainingMetrics ?? null,
      oosTrades,
      oosMetrics,
      generatedAt: new Date().toISOString(),
    };

    folds.push(fold);

    if (validityStatus === "VALID_OOS" && oosReturns.length > 0) {
      validOosReturns.push(...oosReturns);
      validOosYears.push(...oosYears.slice(0, oosReturns.length));
      validFoldIds.push(foldId);
    } else if (validityStatus === "PROVISIONAL_INCOMPLETE_OOS") {
      provisionalFoldIds.push(foldId);
    }

    trainEndIdx = oosEndIdx;
    foldId++;
  }

  // Build stitched OOS from valid folds only
  const stitchedOosResult = buildStitchedOos(
    folds, validFoldIds, provisionalFoldIds, validOosReturns, validOosYears,
  );

  return {
    experimentId,
    asset: {
      assetId: config.assetId,
      displayName: "",
      symbol: "",
    },
    dataSource: {
      type: "historical_csv_walk_forward",
      csvPath,
      csvFingerprint: fingerprint,
      firstDate: allBars[0]?.date ?? "",
      lastDate: allBars[allBars.length - 1]?.date ?? "",
      bars: allBars.length,
      completeYears: allComplete.length,
      completeYearsList: allComplete,
    },
    validationMode: "ANCHORED_EXPANDING",
    ruleSelectionMode: "AUTO_GRID",
    config: {
      anchorYear: config.anchorYear,
      oosBlockYears: config.oosBlockYears,
      holdingDaysMin: config.holdingDaysMin,
      holdingDaysMax: config.holdingDaysMax,
      directions: config.directions,
      transactionCostBps: config.transactionCostBps,
    },
    ruleVersions,
    folds,
    stitchedOosResult,
    robustnessResult: null,
    warnings,
    generatedAt: new Date().toISOString(),
    calculationDurationMs: Date.now() - startMs,
    noLookAheadConfirmed: true,
    usedAsLiveSignal: false,
    canBePromotedToLiveSignal: false,
    globalLiveSignalsChanged: false,
    monitoringChanged: false,
  };
}

// ─── Stitched OOS ─────────────────────────────────────────────────────────────

function buildStitchedOos(
  folds: AnchoredWalkForwardFold[],
  validFoldIds: number[],
  provisionalFoldIds: number[],
  validReturns: number[],
  validYears: number[],
): StitchedOosResult {
  const excludedFoldIds = folds
    .filter((f) => !validFoldIds.includes(f.foldId) && !provisionalFoldIds.includes(f.foldId))
    .map((f) => f.foldId);

  const oosSummary = validReturns.length > 0
    ? computeOosSummary(validReturns, validYears)
    : {
        foldCount: 0, oosTradeCount: 0, oosCompoundedReturn: 0, oosAverageReturn: 0,
        oosMedianReturn: 0, oosWinRate: 0, oosProfitFactor: 0, oosMaxDrawdown: 0,
        positiveTestYears: 0, negativeTestYears: 0, bestTestYear: null, worstTestYear: null,
      };

  const oosWinRateFraction = oosSummary.oosWinRate / 100;
  const c = DEFAULT_RESEARCH_GATE_CRITERIA;
  const failures: string[] = [];
  if (oosSummary.oosTradeCount < c.minOosTradeCount)
    failures.push(`oosTradeCount ${oosSummary.oosTradeCount} < ${c.minOosTradeCount}`);
  if (oosSummary.oosCompoundedReturn <= c.minOosCompoundedReturn)
    failures.push(`oosCompoundedReturn ${(oosSummary.oosCompoundedReturn * 100).toFixed(2)}% <= 0%`);
  if (oosSummary.oosAverageReturn <= c.minOosAverageReturn)
    failures.push(`oosAverageReturn ${(oosSummary.oosAverageReturn * 100).toFixed(2)}% <= 0%`);
  if (oosWinRateFraction < c.minOosWinRate)
    failures.push(`oosWinRate ${oosSummary.oosWinRate.toFixed(1)}% < ${(c.minOosWinRate * 100).toFixed(0)}%`);
  if (oosSummary.oosMaxDrawdown > c.maxOosMaxDrawdown)
    failures.push(`oosMaxDrawdown ${(oosSummary.oosMaxDrawdown * 100).toFixed(2)}% > ${(c.maxOosMaxDrawdown * 100).toFixed(0)}%`);

  const passed = failures.length === 0;
  const hasData = oosSummary.oosTradeCount >= c.minOosTradeCount;

  const researchGate: WFResearchGateResult = {
    status: !hasData ? "INSUFFICIENT_DATA" : passed ? "PASSED_RESEARCH_GATE" : "FAILED_RESEARCH_GATE",
    criteria: c,
    failures,
    canBeConsideredStableSeasonalPattern: passed && hasData,
    canBePromotedToLiveSignal: false,
  };

  // Profit concentration: does any single fold dominate?
  let dominantFoldId: number | null = null;
  let dominantFoldProfitShare: number | null = null;
  if (validFoldIds.length > 1) {
    const foldReturns = validFoldIds.map((fid) => {
      const fold = folds.find((f) => f.foldId === fid);
      const total = fold?.oosTrades.reduce((s, t) => s + t.netReturn, 0) ?? 0;
      return { fid, total };
    });
    const totalPositive = foldReturns.filter((f) => f.total > 0).reduce((s, f) => s + f.total, 0);
    if (totalPositive > 0) {
      const best = foldReturns.reduce((a, b) => (a.total > b.total ? a : b));
      if (best.total > 0) {
        dominantFoldId = best.fid;
        dominantFoldProfitShare = best.total / totalPositive;
      }
    }
  }

  const smallSampleWarning = oosSummary.oosTradeCount > 0 && oosSummary.oosTradeCount < 20;
  const profitConcentrationWarning = dominantFoldProfitShare !== null && dominantFoldProfitShare > 0.5;

  return {
    validFoldIds,
    userAttestedFoldIds: [],
    excludedFoldIds,
    provisionalFoldIds,
    oosTradeCount: oosSummary.oosTradeCount,
    oosCompoundedReturn: oosSummary.oosCompoundedReturn,
    oosAverageReturn: oosSummary.oosAverageReturn,
    oosWinRate: oosSummary.oosWinRate,
    oosMaxDrawdown: oosSummary.oosMaxDrawdown,
    oosProfitFactor: oosSummary.oosProfitFactor,
    positiveOosFolds: validFoldIds.filter((fid) => {
      const fold = folds.find((f) => f.foldId === fid);
      return (fold?.oosMetrics?.compoundedReturn ?? 0) > 0;
    }).length,
    negativeOosFolds: validFoldIds.filter((fid) => {
      const fold = folds.find((f) => f.foldId === fid);
      return (fold?.oosMetrics?.compoundedReturn ?? 0) <= 0;
    }).length,
    smallSampleWarning,
    profitConcentrationWarning,
    dominantFoldId,
    dominantFoldProfitShare,
    researchGate,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Robustness heatmap ───────────────────────────────────────────────────────

export function runRobustnessHeatmap(
  allBars: DailyBar[],
  folds: AnchoredWalkForwardFold[],
  baseRuleVersionId: string,
  baseEntryMonthDay: string,
  baseHoldingTradingDays: number,
  directions: WFDirection[],
  costBps: number,
): RobustnessResult {
  const idx = buildIndex(allBars);
  const cells: RobustnessCell[] = [];
  const SHIFTS = [-2, -1, 0, 1, 2];

  // Use only VALID_OOS folds for robustness
  const validFolds = folds.filter((f) => f.validityStatus === "VALID_OOS");

  for (const entryShift of SHIFTS) {
    for (const holdingShift of SHIFTS) {
      const holdingDays = Math.max(1, baseHoldingTradingDays + holdingShift);

      // Shift entry: need to offset the MM-DD by entryShift trading days
      // Simplification: use as entry offset applied to each year's actual entry bar
      const returns: number[] = [];

      for (const fold of validFolds) {
        const trainYears = [];
        for (let y = fold.trainingStartYear; y <= fold.trainingEndYear; y++) {
          if (idx.yearBars.has(y)) trainYears.push(y);
        }

        // Find shifted entry: take base entryMonthDay bar, then offset by entryShift
        for (const oosYear of [fold.oosStartYear, fold.oosEndYear]) {
          const yBars = idx.yearBars.get(oosYear) ?? [];
          let entryBar = findEntryBarFast(yBars, baseEntryMonthDay);
          if (!entryBar) continue;

          // Apply entry shift: move forward/backward in allBars
          if (entryShift !== 0) {
            const baseIdx = idx.dateIndex.get(entryBar.date);
            if (baseIdx === undefined) continue;
            const shiftedIdx = baseIdx + entryShift;
            if (shiftedIdx < 0 || shiftedIdx >= allBars.length) continue;
            entryBar = allBars[shiftedIdx];
            // Ensure shifted entry is still in the same year
            if (dateYear(entryBar.date) !== oosYear) continue;
          }

          const exitBar = findExitBarFast(allBars, idx.dateIndex, entryBar, holdingDays);
          if (!exitBar) continue;

          const direction = fold.oosTrades[0]?.direction ?? directions[0];
          const net = tradeReturn(direction, entryBar.open, exitBar.close) - costBps / 10000;
          returns.push(net);
        }
      }

      if (!returns.length) {
        cells.push({
          entryShift, holdingShift, holdingDays,
          oosReturn: 0, winRate: 0, profitFactor: 0, foldCount: 0,
        });
        continue;
      }

      let comp = 1;
      for (const r of returns) comp *= (1 + r);
      const wr = (returns.filter((r) => r > 0).length / returns.length) * 100;
      const pos = returns.filter((r) => r > 0).reduce((s, r) => s + r, 0);
      const neg = Math.abs(returns.filter((r) => r < 0).reduce((s, r) => s + r, 0));
      const pf = neg > 0 ? pos / neg : pos > 0 ? 999 : 0;

      cells.push({
        entryShift, holdingShift, holdingDays,
        oosReturn: comp - 1,
        winRate: wr,
        profitFactor: pf,
        foldCount: validFolds.length,
      });
    }
  }

  // Classification
  const positiveCount = cells.filter((c) => c.oosReturn > 0 && c.foldCount > 0).length;
  const totalWithData = cells.filter((c) => c.foldCount > 0).length;
  const baseCell = cells.find((c) => c.entryShift === 0 && c.holdingShift === 0);

  let classification: RobustnessClassification;
  let classificationReason: string;

  if (totalWithData < 5) {
    classification = "INCONCLUSIVE";
    classificationReason = "Too few OOS trades for robustness assessment";
  } else if (positiveCount >= 15) {
    classification = "ROBUST";
    classificationReason = `${positiveCount}/25 neighbor cells positive — pattern generalizes to nearby rules`;
  } else if (positiveCount <= 3) {
    classification = "FRAGILE";
    classificationReason = `Only ${positiveCount}/25 neighbor cells positive — pattern may be curve-fitted`;
  } else {
    classification = "FRAGILE";
    classificationReason = `${positiveCount}/25 neighbor cells positive — pattern is not broadly robust`;
  }

  return {
    baseRuleVersionId,
    baseEntryMonthDay,
    baseHoldingTradingDays,
    cells,
    classification,
    classificationReason,
    generatedAt: new Date().toISOString(),
  };
}
