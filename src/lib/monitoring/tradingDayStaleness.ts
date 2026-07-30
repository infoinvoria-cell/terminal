/**
 * Trading-day-aware staleness detection.
 *
 * Counts actual trading days (Mon–Fri, excluding known US/CME market holidays)
 * in the open interval (lastBarDate, todayStr]. Weekend gaps and holidays do
 * NOT count as stale days — only sessions where a market was expected to be
 * open and data should have been available.
 *
 * This module is pure (no I/O) and runs on both server and client.
 */

export type StalenessResult = {
  stale: boolean;
  tradingDaysStale: number;
  maxTradingDays: number;
  lastBarDate: string;
  expectedLastTradingDay: string;
};

// Known full-day US/CME market closures 2025–2027.
// Conservative: only full-day closures; early-close days still count.
// EUREX (FDAX1!) follows a slightly different holiday calendar, but the
// major US holidays are close enough for a staleness guard.
const MARKET_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2025
  "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01",
  "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03",
  "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
  "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26",
  "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06",
  "2027-11-25", "2027-12-24",
]);

/** True when date (YYYY-MM-DD) is a weekday and not a market holiday. */
export function isTradingDay(dateStr: string): boolean {
  const ms = Date.parse(`${dateStr}T12:00:00Z`);
  if (!Number.isFinite(ms)) return false;
  const dow = new Date(ms).getUTCDay(); // 0=Sun, 6=Sat
  return dow !== 0 && dow !== 6 && !MARKET_HOLIDAYS.has(dateStr);
}

/** Advance a YYYY-MM-DD string by n calendar days. */
export function addCalendarDays(dateStr: string, n: number): string {
  const ms = Date.parse(`${dateStr}T12:00:00Z`);
  if (!Number.isFinite(ms)) return dateStr;
  return new Date(ms + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Count trading days in the half-open interval (fromDate, toDate].
 * fromDate itself is NOT counted — it represents the last-known-good day.
 */
export function countTradingDaysBetween(fromDateStr: string, toDateStr: string): number {
  if (fromDateStr >= toDateStr) return 0;
  let count = 0;
  let cur = addCalendarDays(fromDateStr, 1);
  // Safety cap: max 366 iterations
  for (let i = 0; i < 366 && cur <= toDateStr; i++) {
    if (isTradingDay(cur)) count++;
    cur = addCalendarDays(cur, 1);
  }
  return count;
}

/** The most recent trading day on or before the given date. */
export function lastTradingDayOnOrBefore(dateStr: string): string {
  let cur = dateStr;
  for (let i = 0; i < 10; i++) {
    if (isTradingDay(cur)) return cur;
    cur = addCalendarDays(cur, -1);
  }
  return dateStr;
}

// Per-timeframe maximum trading days before data is considered stale.
// Daily instruments (futures, ETFs) tolerate up to 2 trading days (weekend + holiday buffer).
// Intraday instruments: 1 trading day (must update every session).
const MAX_STALE_TRADING_DAYS: Record<string, number> = {
  D:     2,
  "1D":  2,
  W:     5,
  "1W":  5,
  "2H":  1,
  "1H":  1,
  "30M": 1,
  "15M": 1,
};

/**
 * Check whether `lastBarDate` is stale relative to `todayStr` for the given `timeframe`.
 *
 * @param lastBarDate - YYYY-MM-DD of the last available bar
 * @param timeframe   - canonical timeframe string ("D", "2H", "30M", …)
 * @param todayStr    - YYYY-MM-DD of "today" (inject for testability; defaults to UTC date)
 */
export function checkStaleness(
  lastBarDate: string,
  timeframe: string,
  todayStr?: string,
): StalenessResult {
  const today = todayStr ?? new Date().toISOString().slice(0, 10);
  const maxTradingDays = MAX_STALE_TRADING_DAYS[timeframe] ?? 2;
  const expectedLastTradingDay = lastTradingDayOnOrBefore(today);
  const tradingDaysStale = countTradingDaysBetween(lastBarDate, expectedLastTradingDay);
  return {
    stale: tradingDaysStale > maxTradingDays,
    tradingDaysStale,
    maxTradingDays,
    lastBarDate,
    expectedLastTradingDay,
  };
}
