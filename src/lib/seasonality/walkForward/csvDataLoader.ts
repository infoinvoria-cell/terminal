import type { DailyBar } from "./types";

/**
 * Parse CSV content with header: date,open,high,low,close,volume
 * Returns bars sorted ascending by date.
 */
export function parseDailyBarsCsv(csvContent: string): DailyBar[] {
  const lines = csvContent.split("\n");
  const bars: DailyBar[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 5) continue;
    const date = parts[0].trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const open = parseFloat(parts[1]);
    const high = parseFloat(parts[2]);
    const low = parseFloat(parts[3]);
    const close = parseFloat(parts[4]);
    const volume = parts[5] != null ? parseFloat(parts[5]) : 0;
    if (!Number.isFinite(open) || !Number.isFinite(close)) continue;
    bars.push({ date, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
  }

  bars.sort((a, b) => a.date.localeCompare(b.date));
  return bars;
}

/** Extract YYYY from YYYY-MM-DD */
export function dateYear(date: string): number {
  return parseInt(date.slice(0, 4), 10);
}

/** Extract MM-DD from YYYY-MM-DD */
export function dateMonthDay(date: string): string {
  return date.slice(5, 10);
}

/** Get all bars for a specific calendar year */
export function barsForYear(bars: DailyBar[], year: number): DailyBar[] {
  return bars.filter((b) => dateYear(b.date) === year);
}

/** Get all bars for a range of years [startYear, endYear] inclusive */
export function barsForYearRange(bars: DailyBar[], startYear: number, endYear: number): DailyBar[] {
  return bars.filter((b) => {
    const y = dateYear(b.date);
    return y >= startYear && y <= endYear;
  });
}

/**
 * Find the first available trading day on or after the target MM-DD within a given year.
 * Returns null if no trading day exists at or after that date in the year.
 */
export function findEntryBar(
  yearBars: DailyBar[],
  targetMonthDay: string,
): DailyBar | null {
  for (const bar of yearBars) {
    if (dateMonthDay(bar.date) >= targetMonthDay) return bar;
  }
  return null;
}

/**
 * Find the exit bar: the bar exactly holdingTradingDays sessions after the entry bar.
 * Entry is day 0 (entry bar itself). holdingTradingDays=10 means exit is at close of bar at index 10 (the 11th bar including entry, or 10 bars held after entry).
 *
 * Counting rule (unit-tested):
 * - entryBarIndex = 0 in yearBars
 * - holdingTradingDays = 10
 * - exitBarIndex = entryBarIndex + 10
 * - The position is OPEN at entryBar.open and CLOSED at exitBar.close
 * - 10 sessions are "held": bars at index 1..10 inclusive after entry
 */
export function findExitBar(
  allBars: DailyBar[],
  entryBar: DailyBar,
  holdingTradingDays: number,
): DailyBar | null {
  const entryIdx = allBars.findIndex((b) => b.date === entryBar.date);
  if (entryIdx < 0) return null;
  const exitIdx = entryIdx + holdingTradingDays;
  return exitIdx < allBars.length ? allBars[exitIdx] : null;
}

/**
 * Extract all unique MM-DD trading day patterns that appear in the given bars.
 * Only includes dates that are present in ALL years of the training window.
 */
export function extractValidMonthDays(
  trainingBars: DailyBar[],
  trainingYears: number[],
): string[] {
  const yearSets = new Map<number, Set<string>>();
  for (const year of trainingYears) {
    yearSets.set(year, new Set<string>());
  }

  for (const bar of trainingBars) {
    const year = dateYear(bar.date);
    const md = dateMonthDay(bar.date);
    yearSets.get(year)?.add(md);
  }

  // Collect all unique MM-DD values and filter to those that appear in all training years
  const allMDs = new Set<string>();
  for (const bar of trainingBars) {
    allMDs.add(dateMonthDay(bar.date));
  }

  const result: string[] = [];
  for (const md of allMDs) {
    // A candidate is valid if findEntryBar returns a bar in every training year
    let validInAll = true;
    for (const year of trainingYears) {
      const yBars = trainingBars.filter((b) => dateYear(b.date) === year);
      if (!findEntryBar(yBars, md)) {
        validInAll = false;
        break;
      }
    }
    if (validInAll) result.push(md);
  }

  return result.sort();
}

/** Simple fingerprint: first date + last date + row count */
export function csvFingerprint(bars: DailyBar[]): string {
  if (!bars.length) return "empty";
  return `${bars[0].date}|${bars[bars.length - 1].date}|${bars.length}`;
}

/** Determine list of complete calendar years from bars */
export function completeYears(bars: DailyBar[]): number[] {
  const yearCounts = new Map<number, number>();
  for (const bar of bars) {
    const y = dateYear(bar.date);
    yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
  }

  const result: number[] = [];
  for (const [year, count] of yearCounts) {
    // A "complete" year has at least 240 trading days
    if (count >= 240) result.push(year);
  }
  return result.sort((a, b) => a - b);
}
