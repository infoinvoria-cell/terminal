/**
 * FX rate loader for the portfolio engine.
 * Reads OANDA_EURUSD_D.json from public/generated to provide daily close rates.
 * Pure — no I/O side effects after the initial load.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/** keyed by "YYYY-MM-DD" UTC → EURUSD close price */
export type FxRateMap = Record<string, Record<string, number>>;

interface OhlcBar {
  date?: string;        // "YYYY-MM-DD"
  time?: string | null;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

interface OhlcFile {
  bars?: OhlcBar[];
}

/**
 * Load EURUSD daily close rates from the local monitoring cache.
 * Returns a map of { "YYYY-MM-DD": { EURUSD: closePrice } }.
 * Never throws — returns empty map if file is missing or unreadable.
 */
export function loadEurUsdDailyRates(): FxRateMap {
  const filePath = resolve(
    process.cwd(),
    "public",
    "generated",
    "monitoring",
    "tradingview_data_cache",
    "fx",
    "OANDA_EURUSD_D.json",
  );

  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as OhlcFile;
    const bars = raw.bars ?? [];
    const result: FxRateMap = {};

    for (const bar of bars) {
      const date = bar.date;
      const close = bar.close;
      if (
        typeof date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        typeof close === "number" &&
        isFinite(close) &&
        close > 0
      ) {
        result[date] = { EURUSD: close };
      }
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Look up the closest available EURUSD rate on or before `dateUtc`.
 * Searches backward up to `maxLookbackDays` days.
 * Returns null if no rate found within the lookback window.
 */
export function getClosestEurUsdRate(
  fxRates: FxRateMap,
  dateUtc: string,
  maxLookbackDays = 5,
): number | null {
  const d = new Date(dateUtc + "T00:00:00Z");
  for (let i = 0; i <= maxLookbackDays; i++) {
    const check = new Date(d.getTime() - i * 86400 * 1000);
    const key = check.toISOString().slice(0, 10);
    const entry = fxRates[key];
    if (entry?.EURUSD != null) return entry.EURUSD;
  }
  return null;
}
