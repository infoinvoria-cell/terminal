"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type LiveQuote = {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
  updated_at: string;
};

type ApiResponse = { quotes: LiveQuote[]; count: number; asOf: string };

export function useLiveQuotes(intervalMs = 5000): Map<string, LiveQuote> {
  const [quotes, setQuotes] = useState<Map<string, LiveQuote>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/live-quotes");
      if (!res.ok) return;
      const data = (await res.json()) as ApiResponse;
      const map = new Map<string, LiveQuote>();
      for (const q of data.quotes) map.set(q.symbol.toUpperCase(), q);
      setQuotes(map);
    } catch {
      // keep stale
    }
  }, []);

  useEffect(() => {
    void fetch_();
    // Align polling to wall-clock boundaries (…:00, :05, :10 for a 5s interval) so
    // the live update lands on whole 5-second ticks instead of a random phase.
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
