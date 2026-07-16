"use client";

import { useEffect, useState } from "react";
import type { CoreInvestPanelData, OhlcBar, SignalMarker, SleeveData } from "./types";

const SLEEVE_CONFIGS = [
  { id: "QQQ_PINE_1", label: "QQQ Pine 1", instrument: "QQQ", pineFile: "QQQ_pine1.txt", weight: 0.075, sma1: 400, sma2: 5, stopPct: 25, tpPct: 2 },
  { id: "QQQ_PINE_2_EMA", label: "QQQ Pine 2 EMA", instrument: "QQQ", pineFile: "pine2.txt", weight: 0.075, emaFast: 20, emaSlow: 50, stopPct: 2, tpPct: 4 },
  { id: "COPPER_HG", label: "Copper/HG", instrument: "HG1!", pineFile: "pine2.txt", weight: 0.05, emaFast: 20, emaSlow: 50, stopPct: 2, tpPct: 4 },
  { id: "CHF_6S", label: "CHF/6S", instrument: "6S1!", pineFile: "pine2.txt", weight: 0.05, emaFast: 20, emaSlow: 50, stopPct: 2, tpPct: 4 },
];

type OhlcApiResponse = {
  symbol: string;
  status: "ok" | "missing" | "error" | "empty";
  bars: OhlcBar[];
  error?: string;
};

function computeSma(bars: OhlcBar[], period: number): (number | null)[] {
  return bars.map((_, i) => {
    if (i < period - 1) return null;
    const slice = bars.slice(i - period + 1, i + 1);
    return slice.reduce((sum, b) => sum + b.close, 0) / period;
  });
}

function computeEma(bars: OhlcBar[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(bars.length).fill(null);
  const k = 2 / (period + 1);
  let ema: number | null = null;
  for (let i = 0; i < bars.length; i++) {
    if (ema === null) {
      if (i >= period - 1) {
        const slice = bars.slice(0, i + 1);
        ema = slice.reduce((sum, b) => sum + b.close, 0) / period;
        result[i] = ema;
      }
    } else {
      ema = bars[i]!.close * k + ema * (1 - k);
      result[i] = ema;
    }
  }
  return result;
}

function deriveSignals_Pine1(bars: OhlcBar[]): SignalMarker[] {
  if (bars.length < 401) return [];
  const sma400 = computeSma(bars, 400);
  const sma5 = computeSma(bars, 5);
  const signals: SignalMarker[] = [];
  let inLong = false;
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i]!;
    const s400 = sma400[i];
    const s5 = sma5[i];
    if (s400 === null || s5 === null) continue;
    if (!inLong && bar.close > s400 && bar.close < s5) {
      signals.push({ date: bar.date, type: "long", price: bar.close });
      inLong = true;
    } else if (inLong && bar.close > s5) {
      signals.push({ date: bar.date, type: "exit", price: bar.close });
      inLong = false;
    }
  }
  return signals;
}

function deriveSignals_Pine2(bars: OhlcBar[]): SignalMarker[] {
  if (bars.length < 51) return [];
  const emaFast = computeEma(bars, 20);
  const emaSlow = computeEma(bars, 50);
  const signals: SignalMarker[] = [];
  let inLong = false;
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i]!;
    const ef = emaFast[i];
    const es = emaSlow[i];
    if (ef === null || es === null) continue;
    if (!inLong && ef > es) {
      signals.push({ date: bar.date, type: "long", price: bar.close });
      inLong = true;
    } else if (inLong && ef < es) {
      signals.push({ date: bar.date, type: "exit", price: bar.close });
      inLong = false;
    }
  }
  return signals;
}

function buildEquityCurve(
  bars: OhlcBar[],
  signals: SignalMarker[],
  startCapital = 10000,
): { date: string; value: number }[] {
  if (!bars.length) return [];
  const signalMap = new Map(signals.map((s) => [s.date, s]));
  const curve: { date: string; value: number }[] = [];
  let equity = startCapital;
  let entryPrice: number | null = null;
  let inLong = false;
  for (const bar of bars) {
    const sig = signalMap.get(bar.date);
    if (sig?.type === "long" && !inLong) { entryPrice = bar.close; inLong = true; }
    if (sig?.type === "exit" && inLong && entryPrice) {
      equity *= bar.close / entryPrice;
      entryPrice = null; inLong = false;
    }
    curve.push({ date: bar.date, value: Number(((equity / startCapital - 1) * 100).toFixed(2)) });
  }
  return curve;
}

function buildBuyholdCurve(bars: OhlcBar[]): { date: string; value: number }[] {
  if (!bars.length) return [];
  const base = bars[0]!.close;
  return bars.map((b) => ({ date: b.date, value: Number(((b.close / base - 1) * 100).toFixed(2)) }));
}

async function fetchOhlc(symbol: string): Promise<OhlcApiResponse> {
  const res = await fetch(`/api/core-invest/ohlc?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) return { symbol, status: "error", bars: [], error: `HTTP ${res.status}` };
  return res.json() as Promise<OhlcApiResponse>;
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

            let signals: SignalMarker[] = [];
            if (hasBars) {
              signals = cfg.sma1 ? deriveSignals_Pine1(bars) : deriveSignals_Pine2(bars);
            }

            const equityCurve = hasBars ? buildEquityCurve(bars, signals) : [];

            const currentSignal = (() => {
              if (!hasBars || !signals.length) return "cash" as const;
              const last = signals.at(-1)!;
              return last.type === "long" ? "long" : "cash";
            })();

            return {
              config: cfg,
              bars: bars.slice(-500),
              signals: signals.slice(-200),
              status: hasBars ? "ok" : "missing_ohlc",
              statusMessage: hasBars ? `${bars.length} bars · last ${bars.at(-1)?.date ?? "n/a"}` : `No OHLC for ${cfg.instrument}`,
              lastDate: bars.at(-1)?.date ?? null,
              validationStatus: "not_run" as const,
              equityCurve,
              currentSignal,
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
