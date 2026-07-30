// Pine TV 252-Slot Seasonal Curve
// Implements exact Pine Script semantics from "IVQ - Seasonal Chart"
//
// Formula: PINE_TV_252_SLOT_ABSOLUTE_CLOSE_CHANGE
//
// 1. Assign each bar a trading-day-of-year slot (1..252), resetting each calendar year.
// 2. change = close - close[1]  (absolute, NOT percent; cross-year included as Pine does)
// 3. Average absolute changes per slot across all years in lookback window.
// 4. Cumulate: line[0]=0, line[i] = line[i-1] + bins[i] for i=1..used (bin 0 SKIPPED per Pine).
// 5. Linear detrend: step = line[used]/used, line[i] -= step*i  => endpoint ≈ 0.
// 6. Smoothing=1 means no smoothing applied.
//
// Safety: usedAsLiveSignal=false, research only.

import type { DailyBar } from "./walkForward/types";
import type { DailySeasonalResult, DailySeasonalPoint } from "./dailySeasonalChart";
import { filterBarsByYears, selectCompleteSampleYears } from "./yearWindow";

export const PINE_252_FORMULA = "pine_tv_252_slot_absolute_close_change" as const;
export const BINS_COUNT = 252;

// Month-slot boundaries derived from historical 2007+ Wheat data.
// Computed as: first slot in each calendar month across complete years.
// These are approximate and computed dynamically per asset in the function below.
const MONTH_LABELS_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export interface PineSlotDiagnostic {
  binIndex: number;           // 0-indexed (0 = first trading day)
  tradingDaySlot: number;     // 1-indexed (1 = first trading day)
  approximateMonthLabel: string;
  observationCount: number;
  averageAbsoluteCloseChange: number;
  cumulativeBeforeDetrend: number;
  seasonalValueAfterDetrend: number;
  sign: "positive" | "negative" | "zero";
  includedYears: number[];
}

export interface PineSeasonalSourceCoverage {
  firstBar: string;
  lastBar: string;
  inputBarsTotal: number;
  inputBarsUsed: number;
  startDateFilter: string;
  yearsContributing: number[];
  partialYearsNote: string;
  binsWithZeroObservations: number;
}

export interface PineSeasonalExtra {
  pineCalculationMode: typeof PINE_252_FORMULA;
  pineConfig: {
    lookbackYears: number;
    calculationThroughYear: number;
    startDateFilter: string;
    numberOfBins: 252;
    smoothing: 1;
    crossYearCloseChangeIncluded: true;
    firstBinContributionAppliedToLine: false;
  };
  sourceCoverage: PineSeasonalSourceCoverage;
  rawCumulativeEndpointBeforeDetrend: number;
  detrendStep: number;
  finalEndpointAfterDetrend: number;
  peakSlot: number;
  troughSlot: number;
  peakValue: number;
  troughValue: number;
  binDiagnostics: PineSlotDiagnostic[];
}

// Extended result type — DailySeasonalResult with extra Pine fields
export type PineSeasonalResult = DailySeasonalResult & { pineExtra: PineSeasonalExtra };

// ─── Main function ─────────────────────────────────────────────────────────────

export function buildPineTv252SlotSeasonalCurve(
  bars: DailyBar[],
  assetId: string,
  symbol: string,
  lookbackYears: number,
  backadjustmentStatus: string,
): PineSeasonalResult {
  const calculationThroughYear = new Date().getFullYear();
  // 1. Sort all bars; filter from startDate
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const yearsUsed = selectCompleteSampleYears(sorted, lookbackYears, calculationThroughYear);
  const usedBars = filterBarsByYears(sorted, yearsUsed);
  const startDateFilter = yearsUsed.length > 0 ? `${yearsUsed[0]}-01-01` : "";

  // 2. Assign Pine trading-day-of-year slots
  // Rule: tdoy resets to 1 when the calendar year changes
  const BINS = BINS_COUNT;
  interface AnnotatedBar {
    date: string;
    close: number;
    prevClose: number;
    year: number;
    slot: number;    // 1-indexed
    binIndex: number; // 0-indexed
  }

  const annotated: AnnotatedBar[] = [];
  let tdoy = 0;
  let prevYear = -1;

  for (let i = 0; i < usedBars.length; i++) {
    const bar = usedBars[i];
    const year = parseInt(bar.date.slice(0, 4));

    if (year !== prevYear) {
      tdoy = 0;
      prevYear = year;
    }
    tdoy++;

    if (tdoy > BINS) continue; // bars beyond slot 252 are excluded

    // change = close - close[1]  (Pine semantics, cross-year included)
    // First bar of the dataset has no prevBar → skip (no change calculable)
    const prevBar = i > 0 ? usedBars[i - 1] : null;
    if (!prevBar) continue;

    annotated.push({
      date: bar.date,
      close: bar.close,
      prevClose: prevBar.close,
      year,
      slot: tdoy,
      binIndex: tdoy - 1,
    });
  }

  // 3. Accumulate per-bin: sum of absolute changes, count, years, months, all changes for median
  const binSums = new Float64Array(BINS);
  const binCounts = new Int32Array(BINS);
  const binYears: Set<number>[] = Array.from({ length: BINS }, () => new Set<number>());
  const binMonthCounts: Array<Map<number, number>> = Array.from({ length: BINS }, () => new Map());
  const binPositiveCount = new Int32Array(BINS);
  const binAllChanges: number[][] = Array.from({ length: BINS }, () => []);

  for (const ab of annotated) {
    const change = ab.close - ab.prevClose;
    binSums[ab.binIndex] += change;
    binCounts[ab.binIndex]++;
    binYears[ab.binIndex].add(ab.year);
    binAllChanges[ab.binIndex].push(change);
    const m = parseInt(ab.date.slice(5, 7));
    binMonthCounts[ab.binIndex].set(m, (binMonthCounts[ab.binIndex].get(m) ?? 0) + 1);
    if (change > 0) binPositiveCount[ab.binIndex]++;
  }

  // Derive modal month per bin
  const binModalMonth = new Int32Array(BINS);
  for (let i = 0; i < BINS; i++) {
    if (binMonthCounts[i].size === 0) continue;
    let maxCount = 0, modalM = 1;
    for (const [m, cnt] of binMonthCounts[i]) {
      if (cnt > maxCount) { maxCount = cnt; modalM = m; }
    }
    binModalMonth[i] = modalM;
  }

  // 4. Average and Median per bin — with ±3σ outlier winsorizing
  // Winsorizing caps extreme single-year crisis moves (e.g. 2008 on Gold/Silver)
  // without removing them entirely. Median is naturally outlier-resistant.
  const binAverages = new Float64Array(BINS);
  const binMedians = new Float64Array(BINS);
  for (let i = 0; i < BINS; i++) {
    if (binCounts[i] === 0) continue;
    const rawSorted = [...binAllChanges[i]].sort((a, b) => a - b);
    const mid = Math.floor(rawSorted.length / 2);
    binMedians[i] = rawSorted.length % 2 === 0
      ? (rawSorted[mid - 1] + rawSorted[mid]) / 2
      : rawSorted[mid];
    // Winsorize: clip each value to [mean - 3σ, mean + 3σ] before averaging
    const rawMean = binSums[i] / binCounts[i];
    const variance = rawSorted.reduce((acc, v) => acc + (v - rawMean) ** 2, 0) / binCounts[i];
    const sigma = Math.sqrt(variance);
    const lo = rawMean - 3 * sigma;
    const hi = rawMean + 3 * sigma;
    const clipped = rawSorted.map(v => Math.min(hi, Math.max(lo, v)));
    binAverages[i] = clipped.reduce((a, v) => a + v, 0) / clipped.length;
  }

  // 5. Find last bin with observations ("used" in Pine)
  let lastBinWithData = 0;
  for (let i = 0; i < BINS; i++) {
    if (binCounts[i] > 0) lastBinWithData = i;
  }
  // Pine's "used" variable = lastBinWithData (the loop goes "for i=1 to used")
  const used = lastBinWithData;

  // 6. Cumulate — Pine skips bin[0]:
  // line[0] = 0
  // line[i] = line[i-1] + bins[i]  for i = 1..used  (SKIPS bin 0)
  const C = new Float64Array(BINS);
  const CM = new Float64Array(BINS); // median cumulative
  for (let i = 1; i <= used; i++) {
    C[i] = C[i - 1] + binAverages[i];
    CM[i] = CM[i - 1] + binMedians[i];
  }
  const rawEndpoint = C[used];

  // 7. Detrend — linear correction so endpoint ≈ 0:
  let detrendStep = 0;
  let detrendStepMedian = 0;
  if (used > 0) {
    detrendStep = rawEndpoint / used;
    detrendStepMedian = CM[used] / used;
    for (let i = 1; i <= used; i++) {
      C[i] -= detrendStep * i;
      CM[i] -= detrendStepMedian * i;
    }
  }
  const finalEndpoint = C[used];

  // 8. Compute month boundaries from binModalMonth
  // Build: for each calendar month, find the first slot number where that month appears
  const monthFirstSlot = new Map<number, number>();
  for (let i = 0; i < BINS; i++) {
    const m = binModalMonth[i];
    if (m > 0 && !monthFirstSlot.has(m)) {
      monthFirstSlot.set(m, i + 1); // 1-indexed slot
    }
  }
  const monthBoundaries = Array.from(monthFirstSlot.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([month, slot]) => ({
      month,
      label: MONTH_LABELS_DE[month - 1] ?? `M${month}`,
      startDayOfYear: slot,
    }));

  // 9. Build DailySeasonalPoint[] (reusing existing type, mapping fields)
  const points: DailySeasonalPoint[] = [];
  for (let i = 0; i <= used; i++) {
    const slot = i + 1; // 1-indexed
    const month = binModalMonth[i] || 1;
    const winrate = binCounts[i] > 0 ? (binPositiveCount[i] / binCounts[i]) * 100 : 50;
    const approxLabel = MONTH_LABELS_DE[month - 1] ?? "";

    points.push({
      dayOfYear: slot,
      monthDay: `${approxLabel} S${slot}`,
      month,
      dayInMonth: slot,
      seasonal: parseFloat(C[i].toFixed(4)),
      medianSeasonal: parseFloat(CM[i].toFixed(4)),
      winrate,
      avgReturn: parseFloat(binAverages[i].toFixed(4)),
      sampleSize: binCounts[i],
    });
  }

  // 10. Peak / trough (slots with data, skip C[0]=0)
  let peakVal = -Infinity, peakSlot = 1, troughVal = Infinity, troughSlot = 1;
  for (let i = 1; i <= used; i++) {
    if (C[i] > peakVal) { peakVal = C[i]; peakSlot = i + 1; }
    if (C[i] < troughVal) { troughVal = C[i]; troughSlot = i + 1; }
  }

  // 11. Source coverage diagnostics
  const allUsedYears = new Set<number>();
  for (let i = 0; i < BINS; i++) {
    for (const y of binYears[i]) allUsedYears.add(y);
  }
  const yearsContributing = Array.from(allUsedYears).sort();

  // Identify partial years: first year (CSV might start mid-year) and last (current year)
  const partialNotes: string[] = [];
  if (usedBars.length > 0) {
    const firstYear = parseInt(usedBars[0].date.slice(0, 4));
    const lastYear = parseInt(usedBars[usedBars.length - 1].date.slice(0, 4));
    if (usedBars[0].date > `${firstYear}-01-10`) {
      partialNotes.push(`${firstYear}: partial (CSV starts ${usedBars[0].date})`);
    }
    if (usedBars[usedBars.length - 1].date < `${lastYear}-12-15`) {
      partialNotes.push(`${lastYear}: partial (CSV ends ${usedBars[usedBars.length - 1].date})`);
    }
  }

  // 12. Build bin diagnostics (full array for report)
  const binDiagnostics: PineSlotDiagnostic[] = [];
  for (let i = 0; i <= used; i++) {
    const slot = i + 1;
    const month = binModalMonth[i] || 1;
    binDiagnostics.push({
      binIndex: i,
      tradingDaySlot: slot,
      approximateMonthLabel: `${MONTH_LABELS_DE[month - 1] ?? ""} (slot ${slot})`,
      observationCount: binCounts[i],
      averageAbsoluteCloseChange: parseFloat(binAverages[i].toFixed(4)),
      cumulativeBeforeDetrend: parseFloat((C[i] + detrendStep * i).toFixed(4)),
      seasonalValueAfterDetrend: parseFloat(C[i].toFixed(4)),
      sign: C[i] > 0.001 ? "positive" : C[i] < -0.001 ? "negative" : "zero",
      includedYears: Array.from(binYears[i]).sort(),
    });
  }

  const pineExtra: PineSeasonalExtra = {
    pineCalculationMode: PINE_252_FORMULA,
    pineConfig: {
      lookbackYears,
      calculationThroughYear,
      startDateFilter,
      numberOfBins: 252,
      smoothing: 1,
      crossYearCloseChangeIncluded: true,
      firstBinContributionAppliedToLine: false,
    },
    sourceCoverage: {
      firstBar: usedBars[0]?.date ?? "",
      lastBar: usedBars[usedBars.length - 1]?.date ?? "",
      inputBarsTotal: sorted.length,
      inputBarsUsed: annotated.length,
      startDateFilter,
      yearsContributing,
      partialYearsNote: partialNotes.join("; ") || "None detected",
      binsWithZeroObservations: binCounts.filter((c) => c === 0).length,
    },
    rawCumulativeEndpointBeforeDetrend: parseFloat(rawEndpoint.toFixed(4)),
    detrendStep: parseFloat(detrendStep.toFixed(6)),
    finalEndpointAfterDetrend: parseFloat(finalEndpoint.toFixed(8)),
    peakSlot,
    troughSlot,
    peakValue: parseFloat(peakVal.toFixed(4)),
    troughValue: parseFloat(troughVal.toFixed(4)),
    binDiagnostics,
  };

  return {
    assetId,
    symbol,
    formula: PINE_252_FORMULA as unknown as "daily_returns_cumulated",
    dataMode: "historical_csv",
    backadjustmentStatus,
    yearsUsed: yearsContributing,
    lookback: lookbackYears,
    firstDate: usedBars[0]?.date ?? "",
    lastDate: usedBars[usedBars.length - 1]?.date ?? "",
    points,
    monthBoundaries,
    rollGapWarnings: [],
    generatedAt: new Date().toISOString(),
    pineExtra,
  };
}
