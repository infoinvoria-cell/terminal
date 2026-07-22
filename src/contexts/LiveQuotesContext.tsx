"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLiveQuotes, type LiveQuote } from "@/hooks/useLiveQuotes";

const LiveQuotesContext = createContext<Map<string, LiveQuote>>(new Map());

export function LiveQuotesProvider({ children }: { children: ReactNode }) {
  const quotes = useLiveQuotes(5000);
  return <LiveQuotesContext.Provider value={quotes}>{children}</LiveQuotesContext.Provider>;
}

export function useLiveQuotesContext(): Map<string, LiveQuote> {
  return useContext(LiveQuotesContext);
}
