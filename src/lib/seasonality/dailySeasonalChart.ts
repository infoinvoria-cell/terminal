// Daily Seasonal Chart Computation — Historical CSV Research Only
// Formula: daily-returns-cumulated.
// For each complete year: compute daily return (close_t / close_{t-1} - 1) for each bar except the first.
// Average daily returns per calendar day-of-year across all selected years.
// Cumulate the average daily returns from DOY 1 to 365 to get the seasonal curve.

import type { DailyBar } from "./walkForward/types";
import { dateYear } from "./walkForward/csvDataLoader";
import { selectCompleteSampleYears } from "./yearWindow";

export interface DailySeasonalPoint {
  dayOfYear: number;    // 1..365
  monthDay: string;     // MM-DD label
  month: number;        // 1..12
  dayInMonth: number;   // 1..31
  seasonal: number;     // cumulative seasonal value (%) starting at 0
  winrate: number;      // 0..100: % of years that were positive at this day
  avgReturn: number;    // average cross-sectional daily return (%)
  sampleSize: number;   // number of years contributing
}

export interface RollGapWarning {
  year: number;
  date: string;
  doy: number;
  returnPct: number;
}

export interface DailySeasonalResult {
  assetId: string;
  symbol: string;
  formula: "daily_returns_cumulated" | "pine_tv_252_slot_absolute_close_change";
  dataMode: "historical_csv";
  /** Price units for Pine mode, percent for daily-returns mode */
  yAxisUnit?: "percent" | "price_units";
  backadjustmentStatus: string;
  yearsUsed: number[];
  lookback: number;
  firstDate: string;
  lastDate: string;
  points: DailySeasonalPoint[];
  monthBoundaries: Array<{ month: number; label: string; startDayOfYear: number }>;
  rollGapWarnings: RollGapWarning[];
  generatedAt: string;
}

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const DAYS_PER_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Threshold for flagging a suspected roll-gap or extreme move
const ROLL_GAP_THRESHOLD_PCT = 8;

function dayOfYear(dateStr: string): number {
  const [, m, d] = dateStr.split("-").map(Number);
  let doy = 0;
  for (let i = 0; i < m - 1; i++) doy += DAYS_PER_MONTH[i];
  return doy + d;
}

function monthOfDayOfYear(doy: number): { month: number; dayInMonth: number } {
  let remaining = doy;
  for (let m = 0; m < 12; m++) {
    const days = DAYS_PER_MONTH[m];
    if (remaining <= days) return { month: m + 1, dayInMonth: remaining };
    remaining -= days;
  }
  return { month: 12, dayInMonth: 31 };
}

function formatMMDD(doy: number): string {
  const { month, dayInMonth } = monthOfDayOfYear(doy);
  return `${String(month).padStart(2, "0")}-${String(dayInMonth).padStart(2, "0")}`;
}

/**
 * Build daily seasonal curve from bars.
 *
 * Formula: daily-returns-cumulated.
 * For each complete historical year:
 *   For each bar i > 0: dailyReturn[i] = close[i] / close[i-1] - 1.
 *   Map dailyReturn to the day-of-year of bar[i].
 *
 * Average daily returns per DOY slot across all selected years.
 * Cumulate the averages: seasonal[doy] = sum of avgDailyReturn[1..doy] * 100.
 *
 * Winrate = % of years where dailyReturn > 0 on that DOY.
 * Roll-gap warnings: any daily return below -ROLL_GAP_THRESHOLD or above +ROLL_GAP_THRESHOLD.
 */
export function buildDailySeasonalCurve(
  bars: DailyBar[],
  assetId: string,
  symbol: string,
  lookbackYears: number,
  backadjustmentStatus: string,
): DailySeasonalResult {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const yearsToUse = selectCompleteSampleYears(sorted, lookbackYears);

  // Group bars by year
  const barsByYear = new Map<number, DailyBar[]>();
  for (const bar of sorted) {
    const y = dateYear(bar.date);
    if (!yearsToUse.includes(y)) continue;
    const arr = barsByYear.get(y) ?? [];
    arr.push(bar);
    barsByYear.set(y, arr);
  }

  // For each year, build doy -> dailyReturn map
  // Also collect roll-gap warnings
  type YearProfile = Map<number, number>; // doy -> dailyReturn (raw, not %)
  const profiles: YearProfile[] = [];
  const rollGapWarnings: RollGapWarning[] = [];

  for (const year of yearsToUse) {
    const yBars = barsByYear.get(year);
    if (!yBars || yBars.length < 10) continue;

    const profile = new Map<number, number>();
    for (let i = 1; i < yBars.length; i++) {
      const prevClose = yBars[i - 1].close;
      const currClose = yBars[i].close;
      if (!prevClose || prevClose <= 0 || !currClose || currClose <= 0) continue;

      const ret = (currClose - prevClose) / prevClose;
      const doy = dayOfYear(yBars[i].date);
      profile.set(doy, ret);

      const retPct = ret * 100;
      if (Math.abs(retPct) >= ROLL_GAP_THRESHOLD_PCT) {
        rollGapWarnings.push({
          year,
          date: yBars[i].date,
          doy,
          returnPct: parseFloat(retPct.toFixed(2)),
        });
      }
    }
    profiles.push(profile);
  }

  // Aggregate: for each doy compute avg daily return and winrate
  const points: DailySeasonalPoint[] = [];
  let cumulative = 0;

  for (let doy = 1; doy <= 365; doy++) {
    const vals: number[] = [];
    for (const profile of profiles) {
      const v = profile.get(doy);
      if (v !== undefined) vals.push(v);
    }

    const { month, dayInMonth } = monthOfDayOfYear(doy);

    if (vals.length === 0) {
      // No trading days for this DOY (weekends, holidays, Feb 29 in most years)
      // Carry cumulative forward unchanged (zero avg return for this slot)
      points.push({
        dayOfYear: doy,
        monthDay: formatMMDD(doy),
        month,
        dayInMonth,
        seasonal: parseFloat((cumulative * 100).toFixed(3)),
        winrate: 50,
        avgReturn: 0,
        sampleSize: 0,
      });
      continue;
    }

    const avgRet = vals.reduce((s, v) => s + v, 0) / vals.length;
    const winrate = (vals.filter((v) => v > 0).length / vals.length) * 100;
    cumulative += avgRet;

    points.push({
      dayOfYear: doy,
      monthDay: formatMMDD(doy),
      month,
      dayInMonth,
      seasonal: parseFloat((cumulative * 100).toFixed(3)),
      winrate,
      avgReturn: parseFloat((avgRet * 100).toFixed(4)),
      sampleSize: vals.length,
    });
  }

  // Build month boundary markers
  const monthBoundaries = MONTH_LABELS.map((label, i) => {
    let startDoy = 1;
    for (let j = 0; j < i; j++) startDoy += DAYS_PER_MONTH[j];
    return { month: i + 1, label, startDayOfYear: startDoy };
  });

  return {
    assetId,
    symbol,
    formula: "daily_returns_cumulated",
    dataMode: "historical_csv",
    backadjustmentStatus,
    yearsUsed: yearsToUse,
    lookback: lookbackYears,
    firstDate: sorted[0]?.date ?? "",
    lastDate: sorted[sorted.length - 1]?.date ?? "",
    points,
    monthBoundaries,
    rollGapWarnings,
    generatedAt: new Date().toISOString(),
  };
}

/** Map a MM-DD string to approximate day-of-year */
export function mmddToDayOfYear(mmdd: string): number {
  const [m, d] = mmdd.split("-").map(Number);
  let doy = 0;
  for (let i = 0; i < m - 1; i++) doy += DAYS_PER_MONTH[i];
  return doy + d;
}

/** Today's day-of-year */
export function currentDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}
