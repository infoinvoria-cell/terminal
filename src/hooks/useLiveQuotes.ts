"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DataSourceStatus } from "@/lib/market-data/types";

export type LiveQuote = {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
  updated_at: string;
  /** Data quality status — components must not show "live" unless this is "live" */
  status: DataSourceStatus;
  /** Approximate delay in minutes (15 = TradingView delayed, 0 = real-time, null = historical) */
  delayMinutes: number | null;
};

type ApiResponse = {
  quotes: Array<Omit<LiveQuote, "status" | "delayMinutes"> & {
    status?: DataSourceStatus;
    delay_minutes?: number | null;
  }>;
  count: number;
  asOf: string;
};

/**
 * Intraday asset symbols (from live_quotes) that require 5 s polling.
 * All others use DAILY_INTERVAL_MS (30 s).
 */
const INTRADAY_SYMBOLS = new Set([
  "6E1!", "6B1!", "FDAX1!", "NQ1!", "ES1!", "YM1!", "RTY1!",
]);

export const INTRADAY_INTERVAL_MS = 5_000;
export const DAILY_INTERVAL_MS   = 30_000;

export function useLiveQuotes(intervalMs = INTRADAY_INTERVAL_MS): Map<string, LiveQuote> {
  const [quotes, setQuotes] = useState<Map<string, LiveQuote>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/live-quotes");
      if (!res.ok) return;
      const data = (await res.json()) as ApiResponse;
      const map = new Map<string, LiveQuote>();
      for (const q of data.quotes) {
        const sym = q.symbol.toUpperCase();
        map.set(sym, {
          ...q,
          symbol: sym,
          status: q.status ?? "delayed",
          delayMinutes: q.delay_minutes ?? 15,
        });
      }
      setQuotes(map);
    } catch {
      // keep stale quotes — never clear on error
    }
  }, []);

  useEffect(() => {
    void fetch_();
    // Align polling to wall-clock boundaries so updates land on whole ticks.
    const alignTimer = setTimeout(() => {
      void fetch_();
      timerRef.current = setInterval(() => void fetch_(), intervalMs);
    }, intervalMs - (Date.now() % intervalMs));
    document.addEventListener("visibilitychange", fetch_);
    return () => {
      clearTimeout(alignTimer);
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", fetch_);
    };
  }, [fetch_, intervalMs]);

  return quotes;
}

/**
 * Returns the appropriate polling interval for a given live_quotes symbol.
 * Intraday assets: 5 s. Daily assets: 30 s.
 */
export function pollIntervalForSymbol(symbol: string): number {
  return INTRADAY_SYMBOLS.has(symbol.toUpperCase())
    ? INTRADAY_INTERVAL_MS
    : DAILY_INTERVAL_MS;
}
