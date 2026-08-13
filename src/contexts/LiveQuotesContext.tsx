"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLiveQuotes, INTRADAY_INTERVAL_MS, type LiveQuote } from "@/hooks/useLiveQuotes";
import type { DataSourceStatus } from "@/lib/market-data/types";

interface LiveQuotesContextValue {
  /** All live quotes keyed by symbol (uppercase) */
  quotes: Map<string, LiveQuote>
  /** Data quality status per symbol */
  getStatus: (symbol: string) => DataSourceStatus
  /** Convenience: get a single quote or undefined */
  getQuote: (symbol: string) => LiveQuote | undefined
}

const LiveQuotesContext = createContext<LiveQuotesContextValue>({
  quotes: new Map(),
  getStatus: () => "unavailable",
  getQuote: () => undefined,
});

export function LiveQuotesProvider({ children }: { children: ReactNode }) {
  // Single poll — 5 s for the whole app (Supabase live_quotes is upserted every 5 s).
  // The server-side DataManager handles per-asset TTLs independently.
  const quotes = useLiveQuotes(INTRADAY_INTERVAL_MS);

  const value = useMemo<LiveQuotesContextValue>(() => ({
    quotes,
    getStatus: (symbol: string) => quotes.get(symbol.toUpperCase())?.status ?? "unavailable",
    getQuote:  (symbol: string) => quotes.get(symbol.toUpperCase()),
  }), [quotes]);

  return (
    <LiveQuotesContext.Provider value={value}>
      {children}
    </LiveQuotesContext.Provider>
  );
}

/** Full context value (quotes + status helpers) */
export function useLiveQuotesContext(): LiveQuotesContextValue {
  return useContext(LiveQuotesContext);
}

/** Backward-compat: returns only the Map, same as before */
export function useLiveQuotesMap(): Map<string, LiveQuote> {
  return useContext(LiveQuotesContext).quotes;
}
