"use client";

import { useEffect, useState } from "react";
import type { CoreInvestPanelData, OhlcBar, SleeveConfig, SleeveData } from "./types";

const SLEEVE_CONFIGS: SleeveConfig[] = [
  {
    id: "QQQ_PINE_1", label: "QQQ Pine 1", instrument: "QQQ", pineFile: "08_core_invest_universal_presets.pine", weight: 0.10,
    kind: "strategy", tvSymbol: "QQQ", tvPreset: "QQQ Pine 1", sma1: 400, sma2: 5, stopPct: 25, tpPct: 2,
    tvMetrics: { source: "tradingview", preset: "QQQ Pine 1", status: "tv_reference", totalReturnPct: 95.19, maxDrawdownPct: 8.71, profitFactor: 1.602, trades: 642, winRatePct: 69.31, note: "TV Strategy Tester reference; lokale Trade-Paritaet noch nicht als validiert markiert." },
  },
  {
    id: "COPPER_HG", label: "Copper/HG", instrument: "HG1!", pineFile: "08_core_invest_universal_presets.pine", weight: 0.05,
    kind: "strategy", tvSymbol: "HG1!", tvPreset: "Copper HG", emaFast: 20, emaSlow: 50, stopPct: 2, tpPct: 4,
    tvMetrics: { source: "tradingview", preset: "Copper HG", status: "tv_reference", totalReturnPct: 483.82, maxDrawdownPct: 40.43, profitFactor: 2.082, trades: 88, winRatePct: 30.68, note: "TV-Referenz aktiv; Futures-Pointvalue und Positionsgroesse separat validieren." },
  },
  {
    id: "CHF_6S", label: "CHF/6S", instrument: "6S1!", pineFile: "08_core_invest_universal_presets.pine", weight: 0.05,
    kind: "strategy", tvSymbol: "6S1!", tvPreset: "CHF 6S", emaFast: 20, emaSlow: 50, stopPct: 2, tpPct: 4,
    tvMetrics: { source: "tradingview", preset: "CHF 6S", status: "tv_reference", totalReturnPct: 17.92, maxDrawdownPct: 23.66, profitFactor: 1.266, trades: 65, winRatePct: 32.31, note: "TV-Referenz aktiv; Futures-Pointvalue und Positionsgroesse separat validieren." },
  },
  { id: "QQQ_PASSIVE", label: "QQQ Passive", instrument: "QQQ", pineFile: "", weight: 0.45, kind: "asset", tvSymbol: "QQQ", tvPreset: "Asset Chart" },
  { id: "GLD", label: "GLD", instrument: "GLD", pineFile: "", weight: 0.25, kind: "asset", tvSymbol: "GLD", tvPreset: "Asset Chart" },
  { id: "SPMO", label: "SPMO", instrument: "SPMO", pineFile: "", weight: 0.05, kind: "asset", tvSymbol: "SPMO", tvPreset: "Asset Chart" },
  { id: "SPY", label: "SPY", instrument: "SPY", pineFile: "", weight: 0.05, kind: "asset", tvSymbol: "SPY", tvPreset: "Asset Chart" },
];

const CI_OHLC_CACHE = new Map<string, { data: OhlcApiResponse; ts: number }>();
const CI_OHLC_TTL = 120_000;

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
        const symbols = [...new Set(SLEEVE_CONFIGS.map((cfg) => cfg.instrument))];
        const [configRes, ...ohlcResponses] = await Promise.all([
          fetch("/api/core-invest/config").then((r) => r.json()),
          ...symbols.map((symbol) => fetchOhlc(symbol)),
        ]);

        if (cancelled) return;

        const ohlcBySymbol = new Map(ohlcResponses.map((res) => [res.symbol, res]));
        const qqqBars: OhlcBar[] = ohlcBySymbol.get("QQQ")?.bars ?? [];
        const spyBars: OhlcBar[] = ohlcBySymbol.get("SPY")?.bars ?? [];

        const sleeves: SleeveData[] = SLEEVE_CONFIGS.map((cfg) => {
          const bars: OhlcBar[] = ohlcBySymbol.get(cfg.instrument)?.bars ?? [];
          const hasBars = bars.length > 0;
          const isRejected = cfg.tvMetrics?.status === "rejected";
          const isAsset = cfg.kind === "asset";

          return {
            config: cfg,
            bars: bars.slice(-500),
            signals: [],
            status: isRejected ? "rejected" : hasBars ? "ok" : "missing_ohlc",
            statusMessage: isRejected
              ? (cfg.tvMetrics?.note ?? "Rejected")
              : hasBars
                ? `${bars.length} bars · last ${bars.at(-1)?.date ?? "n/a"} · ${isAsset ? "asset OHLC reference" : "TV Strategy Tester reference"}`
                : `No OHLC for ${cfg.instrument}`,
            lastDate: bars.at(-1)?.date ?? null,
            validationStatus: isRejected ? "rejected" : hasBars ? (isAsset ? "validated" : "partial_validation") : "missing_data",
            equityCurve: [],
            currentSignal: undefined,
          } satisfies SleeveData;
        });

        if (cancelled) return;

        setState({
          loading: false,
          error: null,
          portfolioName: (configRes as { portfolioName?: string }).portfolioName ?? "Core Invest",
          sleeves,
          equityCurve: [],
          benchmarkCurve: buildBuyholdCurve(spyBars),
          qqqCurve: buildBuyholdCurve(qqqBars),
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
