"use client";

import { useEffect, useState } from "react";
import type { CoreInvestPanelData, OhlcBar, SleeveData } from "./types";

const SLEEVE_CONFIGS = [
  { id: "QQQ_PINE_1", label: "QQQ Pine 1", instrument: "QQQ", pineFile: "QQQ_pine1.txt", weight: 0.05, sma1: 400, sma2: 5, stopPct: 25, tpPct: 2 },
  { id: "QQQ_PINE_2_EMA", label: "QQQ Pine 2 EMA", instrument: "QQQ", pineFile: "pine2.txt", weight: 0.05, emaFast: 20, emaSlow: 50, stopPct: 2, tpPct: 4 },
  { id: "COPPER_HG", label: "Copper/HG", instrument: "HG1!", pineFile: "pine2.txt", weight: 0.05, emaFast: 20, emaSlow: 50, stopPct: 2, tpPct: 4 },
  { id: "CHF_6S", label: "CHF/6S", instrument: "6S1!", pineFile: "pine2.txt", weight: 0.05, emaFast: 20, emaSlow: 50, stopPct: 2, tpPct: 4 },
];

// module-level cache so data survives page navigations within session
const CI_OHLC_CACHE = new Map<string, { data: OhlcApiResponse; ts: number }>();
const CI_OHLC_TTL = 120_000; // 2 min

type OhlcApiResponse = {
  symbol: string;
  status: "ok" | "missing" | "error" | "empty";
  bars: OhlcBar[];
  error?: string;
};

function buildBuyholdCurve(bars: OhlcBar[]): { date: string; value: number }[] {
  if (!bars.length) return [];
  const base = bars[0]!.close;
  return bars.map((b) => ({ date: b.date, value: Number(((b.close / base - 1) * 100).toFixed(2)) }));
}

async function fetchOhlc(symbol: string): Promise<OhlcApiResponse> {
  const cached = CI_OHLC_CACHE.get(symbol);
  if (cached && Date.now() - cached.ts < CI_OHLC_TTL) return cached.data;
  const res = await fetch(`/api/core-invest/ohlc?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) return { symbol, status: "error", bars: [], error: `HTTP ${res.status}` };
  const data = await res.json() as OhlcApiResponse;
  CI_OHLC_CACHE.set(symbol, { data, ts: Date.now() });
  return data;
}

export function useCoreInvestData(): CoreInvestPanelData {
  const [state, setState] = useState<CoreInvestPanelData>({
    loading: true,
    error: null,
    portfolioName: "Core Invest",
    sleeves: [],
    equityCurve: [],
    benchmarkCurve: [],
    qqqCurve: [],
    dataStatus: {},
    missingSymbols: [],
    pineFiles: {},
    validationLoaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [configRes, qqqRes, spyRes] = await Promise.all([
          fetch("/api/core-invest/config").then((r) => r.json()),
          fetchOhlc("QQQ"),
          fetchOhlc("SPY"),
        ]);

        if (cancelled) return;

        const qqqBars: OhlcBar[] = qqqRes.bars ?? [];
        const spyBars: OhlcBar[] = spyRes.bars ?? [];

        // Build sleeve data
        const sleeves: SleeveData[] = await Promise.all(
          SLEEVE_CONFIGS.map(async (cfg) => {
            const useQqq = cfg.instrument === "QQQ";
            const bars: OhlcBar[] = useQqq ? qqqBars : (await fetchOhlc(cfg.instrument)).bars;
            const hasBars = bars.length > 0;

            return {
              config: cfg,
              bars: bars.slice(-500),
              signals: [],
              status: hasBars ? "partial" : "missing_ohlc",
              statusMessage: hasBars
                ? `${bars.length} bars · last ${bars.at(-1)?.date ?? "n/a"} · engine disabled, exact Pine parity required`
                : `No OHLC for ${cfg.instrument}`,
              lastDate: bars.at(-1)?.date ?? null,
              validationStatus: hasBars ? "partial_validation" as const : "missing_data" as const,
              equityCurve: [],
              // Approximate signals must not be exposed as validated live signals.
              currentSignal: undefined,
            } satisfies SleeveData;
          }),
        );

        if (cancelled) return;

        const benchmarkCurve = buildBuyholdCurve(spyBars);
        const qqqCurve = buildBuyholdCurve(qqqBars);

        setState({
          loading: false,
          error: null,
          portfolioName: (configRes as { portfolioName?: string }).portfolioName ?? "Core Invest",
          sleeves,
          equityCurve: [],
          benchmarkCurve,
          qqqCurve,
          dataStatus: (configRes as { dataStatus?: Record<string, { found: boolean; file: string | null }> }).dataStatus ?? {},
          missingSymbols: (configRes as { missingSymbols?: string[] }).missingSymbols ?? [],
          pineFiles: (configRes as { pineFiles?: Record<string, { found: boolean }> }).pineFiles ?? {},
          validationLoaded: false,
        });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: String(err) }));
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}
