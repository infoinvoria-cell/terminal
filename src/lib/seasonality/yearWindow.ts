import type { DailyBar } from "./walkForward/types";
import { completeYears, dateYear } from "./walkForward/csvDataLoader";

export interface SampleYearSelection {
  requestedSampleYears: number | "MAX";
  completeClosedYears: number[];
  includedYears: number[];
  excludedYears: Array<{ year: number; reason: string }>;
}

function uniqueHistoricalYears(bars: DailyBar[], currentYear: number): number[] {
  return Array.from(new Set(bars.map((bar) => dateYear(bar.date))))
    .filter((year) => year < currentYear)
    .sort((a, b) => a - b);
}

export function analyzeSampleYears(
  bars: DailyBar[],
  lookbackYears: number,
  currentYear = new Date().getFullYear(),
): SampleYearSelection {
  const historicalYears = uniqueHistoricalYears(bars, currentYear);
  const completeClosedYears = completeYears(bars)
    .filter((year) => year < currentYear)
    .sort((a, b) => a - b);

  const requestedSampleYears = lookbackYears <= 0 ? "MAX" : lookbackYears;
  const targetYears = requestedSampleYears === "MAX"
    ? completeClosedYears
    : completeClosedYears.slice(-requestedSampleYears);

  const completeSet = new Set(completeClosedYears);
  const includedSet = new Set(targetYears);
  const excludedYears = historicalYears
    .filter((year) => !includedSet.has(year))
    .map((year) => ({
      year,
      reason: completeSet.has(year) ? "outside_requested_window" : "incomplete_calendar_year",
    }));

  return {
    requestedSampleYears,
    completeClosedYears,
    includedYears: targetYears,
    excludedYears,
  };
}

export function selectCompleteSampleYears(
  bars: DailyBar[],
  lookbackYears: number,
  currentYear = new Date().getFullYear(),
): number[] {
  return analyzeSampleYears(bars, lookbackYears, currentYear).includedYears;
}

export function filterBarsByYears(bars: DailyBar[], years: number[]): DailyBar[] {
  if (!years.length) return [];
  const yearSet = new Set(years);
  return bars.filter((bar) => yearSet.has(dateYear(bar.date)));
}
