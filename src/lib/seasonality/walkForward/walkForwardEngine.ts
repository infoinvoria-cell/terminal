import {
  completeYears,
  csvFingerprint,
  dateMonthDay,
  dateYear,
} from "./csvDataLoader";
import { computeOosSummary, computeStabilityScore, computeTradeMetrics } from "./metrics";
import type {
  DailyBar,
  SeasonalPatternCandidate,
  SeasonalTrade,
  WFCurrentYearPlan,
  WFCurrentYearStatus,
  WFDirection,
  WFOosSummary,
  WFResearchGateResult,
  WalkForwardConfig,
  WalkForwardFold,
  WalkForwardResult,
} from "./types";
import { DEFAULT_RESEARCH_GATE_CRITERIA } from "./types";
import {
  SEASONALITY_CALCULATION_VERSION,
  SEASONALITY_WALK_FORWARD_CACHE_VERSION,
} from "../versions";

// ─── Research Quality Gate ────────────────────────────────────────────────────

function evaluateResearchGate(oos: WFOosSummary): WFResearchGateResult {
  const c = DEFAULT_RESEARCH_GATE_CRITERIA;
  const failures: string[] = [];

  if (oos.oosTradeCount < c.minOosTradeCount)
    failures.push(`oosTradeCount ${oos.oosTradeCount} < ${c.minOosTradeCount}`);
  if (oos.oosCompoundedReturn <= c.minOosCompoundedReturn)
    failures.push(`oosCompoundedReturn ${(oos.oosCompoundedReturn * 100).toFixed(2)}% <= 0%`);
  if (oos.oosAverageReturn <= c.minOosAverageReturn)
    failures.push(`oosAverageReturn ${(oos.oosAverageReturn * 100).toFixed(2)}% <= 0%`);
  if (oos.oosWinRate / 100 < c.minOosWinRate)
    failures.push(`oosWinRate ${oos.oosWinRate.toFixed(1)}% < ${(c.minOosWinRate * 100).toFixed(0)}%`);
  if (oos.oosMaxDrawdown > c.maxOosMaxDrawdown)
    failures.push(`oosMaxDrawdown ${(oos.oosMaxDrawdown * 100).toFixed(2)}% > ${(c.maxOosMaxDrawdown * 100).toFixed(0)}%`);

  const passed = failures.length === 0;
  const hasData = oos.oosTradeCount >= c.minOosTradeCount;

  return {
    status: !hasData ? "INSUFFICIENT_DATA" : passed ? "PASSED_RESEARCH_GATE" : "FAILED_RESEARCH_GATE",
    criteria: c,
    failures,
    canBeConsideredStableSeasonalPattern: passed && hasData,
    canBePromotedToLiveSignal: false,
  };
}

interface WalkForwardEngineIdentityInput {
  assetId: string;
  displayName: string;
  symbol: string;
  monitoringSymbol: string;
  sourceType: "manual_tv_csv" | "existing_yahoo_provider" | "other_verified_source";
  sourcePathOrProviderSymbol: string;
  sourceFingerprint: string;
}

// ─── Pre-indexed data structures for O(1) lookups ────────────────────────────

interface BarIndex {
  yearBars: Map<number, DailyBar[]>;     // year -> sorted bars
  dateIndex: Map<string, number>;         // date -> position in allBars
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

// ─── Trade simulation ─────────────────────────────────────────────────────────

function applyNetReturn(gross: number, costBps: number): number {
  return gross - costBps / 10000;
}

function computeTradeReturn(direction: WFDirection, entryPrice: number, exitPrice: number): number {
  return direction === "LONG"
    ? (exitPrice - entryPrice) / entryPrice
    : (entryPrice - exitPrice) / entryPrice;
}

/**
 * Entry: first bar in yearBars with date[5:] >= targetMonthDay (MM-DD).
 * Returns null if no such bar exists.
 */
function findEntryBarFast(yearBars: DailyBar[], targetMonthDay: string): DailyBar | null {
  for (const bar of yearBars) {
    if (bar.date.slice(5) >= targetMonthDay) return bar;
  }
  return null;
}

/**
 * Exit: bar at index (entryIdx + holdingTradingDays) in allBars.
 * Uses pre-built dateIndex for O(1) entry lookup.
 */
function findExitBarFast(
  allBars: DailyBar[],
  dateIndex: Map<string, number>,
  entryBar: DailyBar,
  holdingTradingDays: number,
): DailyBar | null {
  const idx = dateIndex.get(entryBar.date);
  if (idx === undefined) return null;
  const exitIdx = idx + holdingTradingDays;
  return exitIdx < allBars.length ? allBars[exitIdx] : null;
}

function simulateTrade(
  allBars: DailyBar[],
  idx: BarIndex,
  year: number,
  direction: WFDirection,
  entryMonthDay: string,
  holdingTradingDays: number,
  costBps: number,
): {
  trade: SeasonalTrade;
  grossReturn: number;
  netReturn: number;
} | null {
  const yearBars = idx.yearBars.get(year) ?? [];
  const entryBar = findEntryBarFast(yearBars, entryMonthDay);
  if (!entryBar) return null;
  const exitBar = findExitBarFast(allBars, idx.dateIndex, entryBar, holdingTradingDays);
  if (!exitBar) return null;

  const gross = computeTradeReturn(direction, entryBar.open, exitBar.close);
  const net = applyNetReturn(gross, costBps);

  return {
    trade: {
      year,
      direction,
      plannedEntryMonthDay: entryMonthDay,
      actualEntryDate: entryBar.date,
      actualExitDate: exitBar.date,
      entryPrice: entryBar.open,
      exitPrice: exitBar.close,
      grossReturn: gross,
      netReturn: net,
      source: "historical_csv_walk_forward",
      sampleType: "IN_SAMPLE",
    },
    grossReturn: gross,
    netReturn: net,
  };
}

// ─── Grid evaluation ──────────────────────────────────────────────────────────

/**
 * Extract all MM-DD values that produce a valid entry bar in every training year.
 * Uses pre-built year index for fast per-year bar access.
 */
function extractValidMonthDaysFast(
  idx: BarIndex,
  trainingYears: number[],
): string[] {
  // Collect all unique MM-DD values from training bars
  const allMDs = new Set<string>();
  for (const year of trainingYears) {
    for (const bar of (idx.yearBars.get(year) ?? [])) {
      allMDs.add(dateMonthDay(bar.date));
    }
  }

  const result: string[] = [];
  for (const md of allMDs) {
    let valid = true;
    for (const year of trainingYears) {
      const yBars = idx.yearBars.get(year) ?? [];
      if (!findEntryBarFast(yBars, md)) { valid = false; break; }
    }
    if (valid) result.push(md);
  }
  return result.sort();
}

/**
 * Evaluate all grid candidates on the training years.
 * No look-ahead: only trainingYears data used.
 */
function evaluateTrainingCandidates(
  allBars: DailyBar[],
  idx: BarIndex,
  trainingYears: number[],
  config: WalkForwardConfig,
): SeasonalPatternCandidate[] {
  const validMDs = extractValidMonthDaysFast(idx, trainingYears);
  const candidates: SeasonalPatternCandidate[] = [];

  for (const direction of config.directions) {
    for (const md of validMDs) {
      for (let hd = config.holdingDaysMin; hd <= config.holdingDaysMax; hd++) {
        const returns: number[] = [];
        const years: number[] = [];
        let valid = true;

        for (const year of trainingYears) {
          const result = simulateTrade(allBars, idx, year, direction, md, hd, config.transactionCostBps);
          if (!result) { valid = false; break; }
          returns.push(result.netReturn);
          years.push(year);
        }

        if (!valid) continue;

        const metrics = computeTradeMetrics(returns, years);
        const stabilityScore = computeStabilityScore(metrics);
        candidates.push({ direction, entryMonthDay: md, holdingTradingDays: hd, stabilityScore, trainingMetrics: metrics });
      }
    }
  }

  return candidates;
}

function selectBestCandidate(candidates: SeasonalPatternCandidate[]): SeasonalPatternCandidate | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const ss = b.stabilityScore - a.stabilityScore;
    if (Math.abs(ss) > 1e-10) return ss;
    const cr = b.trainingMetrics.compoundedReturn - a.trainingMetrics.compoundedReturn;
    if (Math.abs(cr) > 1e-10) return cr;
    const wr = b.trainingMetrics.winRate - a.trainingMetrics.winRate;
    if (Math.abs(wr) > 1e-10) return wr;
    const dd = a.trainingMetrics.maxDrawdown - b.trainingMetrics.maxDrawdown;
    if (Math.abs(dd) > 1e-10) return dd;
    const hd = a.holdingTradingDays - b.holdingTradingDays;
    if (hd !== 0) return hd;
    return a.entryMonthDay.localeCompare(b.entryMonthDay);
  })[0];
}

// ─── Main walk-forward ────────────────────────────────────────────────────────

export function runWalkForward(
  allBars: DailyBar[],
  csvPath: string,
  config: WalkForwardConfig,
  currentDate: string = new Date().toISOString().slice(0, 10),
  identity?: WalkForwardEngineIdentityInput,
): WalkForwardResult {
  const startMs = Date.now();
  const warnings: string[] = [];
  const idx = buildIndex(allBars);
  const currentYear = parseInt(currentDate.slice(0, 4), 10);
  const complete = completeYears(allBars).filter((year) => year < currentYear);

  if (complete.length < config.trainingYears + config.testYears) {
    warnings.push(`Only ${complete.length} complete years. Need ${config.trainingYears + config.testYears}.`);
  }

  const fingerprint = csvFingerprint(allBars);
  const folds: WalkForwardFold[] = [];
  const oosReturns: number[] = [];
  const oosTestYears: number[] = [];

  for (let i = 0; i + config.trainingYears + config.testYears <= complete.length; i += config.stepYears) {
    const trainingYears = complete.slice(i, i + config.trainingYears);
    const testYear = complete[i + config.trainingYears];
    if (testYear === undefined) break;

    // Skip any fold whose test year is the current or future year — those are current-year plan only
    if (testYear >= currentYear) break;

    const candidates = evaluateTrainingCandidates(allBars, idx, trainingYears, config);
    const best = selectBestCandidate(candidates);

    let oosTrade: SeasonalTrade | null = null;
    let oosTradeStatus: WalkForwardFold["oosTradeStatus"] = "NO_DATA";
    let oosNoTradeReason: string | null = null;
    let oosGrossReturn: number | null = null;
    let oosNetReturn: number | null = null;

    if (best) {
      const result = simulateTrade(allBars, idx, testYear, best.direction, best.entryMonthDay, best.holdingTradingDays, config.transactionCostBps);
      if (result) {
        oosTrade = { ...result.trade, sampleType: "OUT_OF_SAMPLE" };
        oosTradeStatus = "EXECUTED";
        oosGrossReturn = result.grossReturn;
        oosNetReturn = result.netReturn;
        oosReturns.push(result.netReturn);
        oosTestYears.push(testYear);
      } else {
        const yBars = idx.yearBars.get(testYear) ?? [];
        const entryBar = findEntryBarFast(yBars, best.entryMonthDay);
        if (!entryBar) {
          oosTradeStatus = "NO_TRADE_ENTRY_NOT_FOUND";
          oosNoTradeReason = `No trading day >= ${best.entryMonthDay} in ${testYear}`;
        } else {
          oosTradeStatus = "NO_TRADE_EXIT_NOT_FOUND";
          oosNoTradeReason = `Entry ${entryBar.date} but exit unavailable after ${best.holdingTradingDays} days`;
        }
        warnings.push(`Fold ${folds.length + 1} (${testYear}): ${oosNoTradeReason}`);
      }
    } else {
      oosNoTradeReason = "No valid training candidate";
      warnings.push(`Fold ${folds.length + 1} (${testYear}): ${oosNoTradeReason}`);
    }

    folds.push({
      foldId: folds.length + 1,
      trainingStartYear: trainingYears[0],
      trainingEndYear: trainingYears[trainingYears.length - 1],
      testYear,
      selectedCandidate: best,
      trainingMetrics: best?.trainingMetrics ?? null,
      oosTrade,
      oosTradeStatus,
      oosNoTradeReason,
      oosGrossReturn,
      oosNetReturn,
    });
  }

  const oosSummary = { ...computeOosSummary(oosReturns, oosTestYears), foldCount: folds.length };
  const researchGate = evaluateResearchGate(oosSummary);

  const currentYearPlan = buildCurrentYearPlan(allBars, idx, complete, config, currentYear, currentDate, researchGate);

  // Top 10 from last training window
  let topCandidatesLastTrainingWindow: SeasonalPatternCandidate[] = [];
  if (folds.length > 0) {
    const lastFold = folds[folds.length - 1];
    const i = complete.indexOf(lastFold.trainingStartYear);
    if (i >= 0) {
      const lastTrainYears = complete.slice(i, i + config.trainingYears);
      const allCands = evaluateTrainingCandidates(allBars, idx, lastTrainYears, config);
      allCands.sort((a, b) => b.stabilityScore - a.stabilityScore);
      topCandidatesLastTrainingWindow = allCands.slice(0, 10);
    }
  }

  return {
    asset: {
      assetId: identity?.assetId ?? config.assetId,
      displayName: identity?.displayName ?? config.assetId,
      symbol: identity?.symbol ?? config.assetId,
      monitoringSymbol: identity?.monitoringSymbol ?? identity?.symbol ?? config.assetId,
    },
    resultIdentity: {
      assetId: identity?.assetId ?? config.assetId,
      monitoringSymbol: identity?.monitoringSymbol ?? identity?.symbol ?? config.assetId,
      sourceType: identity?.sourceType ?? "other_verified_source",
      sourcePathOrProviderSymbol: identity?.sourcePathOrProviderSymbol ?? csvPath,
      sourceFingerprint: identity?.sourceFingerprint ?? fingerprint,
      calculationVersion: SEASONALITY_CALCULATION_VERSION,
      walkForwardConfigVersion: SEASONALITY_WALK_FORWARD_CACHE_VERSION,
      requestedSampleYears: "MAX",
      includedYears: complete,
      excludedYears: Array.from(new Set(allBars.map((bar) => dateYear(bar.date))))
        .filter((year) => !complete.includes(year))
        .sort((a, b) => a - b)
        .map((year) => ({
          year,
          reason: year >= currentYear ? "current_or_future_year" : "incomplete_calendar_year",
        })),
      resultType: "strict_walk_forward_oos",
    },
    dataSource: {
      type: "historical_csv_walk_forward",
      csvPath,
      csvFingerprint: fingerprint,
      firstDate: allBars[0]?.date ?? "",
      lastDate: allBars[allBars.length - 1]?.date ?? "",
      bars: allBars.length,
      completeYears: complete.length,
      completeYearsList: complete,
    },
    config,
    foldResults: folds,
    oosSummary,
    researchGate,
    currentYearPlan,
    topCandidatesLastTrainingWindow,
    warnings,
    generatedAt: new Date().toISOString(),
    calculationDurationMs: Date.now() - startMs,
    noLookAheadConfirmed: true,
    currentYearExcludedFromCompletedOos: true,
    usedAsLiveSignal: false,
    globalLiveSignalsChanged: false,
    monitoringChanged: false,
    customEnginePilotsChanged: false,
  };
}

function buildCurrentYearPlan(
  allBars: DailyBar[],
  idx: BarIndex,
  complete: number[],
  config: WalkForwardConfig,
  currentYear: number,
  currentDate: string,
  researchGate: WFResearchGateResult,
): WFCurrentYearPlan | null {
  const yearsBeforeCurrent = complete.filter((y) => y < currentYear);
  if (yearsBeforeCurrent.length < config.trainingYears) return null;

  const trainingYears = yearsBeforeCurrent.slice(-config.trainingYears);
  const candidates = evaluateTrainingCandidates(allBars, idx, trainingYears, config);
  const best = selectBestCandidate(candidates);

  if (!best) {
    return {
      year: currentYear, trainingStartYear: trainingYears[0],
      trainingEndYear: trainingYears[trainingYears.length - 1],
      selectedDirection: null, selectedEntryMonthDay: null,
      selectedHoldingTradingDays: null, plannedEntryDate: null,
      plannedExitDate: null, status: "NOT_ENOUGH_CURRENT_YEAR_DATA",
      actualEntryPrice: null, actualExitPrice: null,
      returnToDate: null, finalReturn: null,
      stabilityScore: null, trainingMetrics: null,
      researchGate,
    };
  }

  const currentYearBars = idx.yearBars.get(currentYear) ?? [];
  const entryBar = findEntryBarFast(currentYearBars, best.entryMonthDay);
  const exitBar = entryBar
    ? findExitBarFast(allBars, idx.dateIndex, entryBar, best.holdingTradingDays)
    : null;

  let status: WFCurrentYearStatus;
  let actualEntryPrice: number | null = null;
  let actualExitPrice: number | null = null;
  let returnToDate: number | null = null;
  let finalReturn: number | null = null;

  // Estimate planned entry date even if bar not yet in CSV
  const estimatedEntryDate = entryBar?.date ?? `${currentYear}-${best.entryMonthDay}`;

  if (!entryBar || entryBar.date > currentDate) {
    status = estimatedEntryDate > currentDate ? "UPCOMING" : "NOT_ENOUGH_CURRENT_YEAR_DATA";
  } else if (!exitBar || exitBar.date > currentDate) {
    status = "ACTIVE";
    actualEntryPrice = entryBar.open;
    const lastBar = currentYearBars[currentYearBars.length - 1];
    if (lastBar && lastBar.date <= currentDate) {
      returnToDate = computeTradeReturn(best.direction, entryBar.open, lastBar.close);
    }
  } else {
    status = "COMPLETED_PROVISIONAL";
    actualEntryPrice = entryBar.open;
    actualExitPrice = exitBar.close;
    finalReturn = applyNetReturn(
      computeTradeReturn(best.direction, entryBar.open, exitBar.close),
      config.transactionCostBps,
    );
  }

  return {
    year: currentYear,
    trainingStartYear: trainingYears[0],
    trainingEndYear: trainingYears[trainingYears.length - 1],
    selectedDirection: best.direction,
    selectedEntryMonthDay: best.entryMonthDay,
    selectedHoldingTradingDays: best.holdingTradingDays,
    plannedEntryDate: estimatedEntryDate,
    plannedExitDate: exitBar?.date ?? null,
    status,
    actualEntryPrice,
    actualExitPrice,
    returnToDate,
    finalReturn,
    stabilityScore: best.stabilityScore,
    trainingMetrics: best.trainingMetrics,
    researchGate,
  };
}
