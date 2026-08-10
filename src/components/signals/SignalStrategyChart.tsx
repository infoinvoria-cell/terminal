"use client";

import { useState, useEffect, useRef } from "react";
import { CapalifeChart } from "@/components/ui/capitalife-chart";
import type { MonitoringChartData } from "@/components/monitoring/MonitoringChart";

type OhlcBar = { time: string; open: number; high: number; low: number; close: number };

// Maps legacy assetId keys to monitoring symbols for fallback
const ASSET_TO_MONITORING: Record<string, string> = {
  dax_2h: "FDAX1!", dax_1h: "FDAX1!",
  eurusd_30m: "6E1!", gbpusd_30m: "6B1!",
  gc1: "GC1!", ym1: "YM1!", nq1: "NQ1!",
  qqq: "QQQ", spy: "SPY",
};

export function SignalStrategyChart({
  assetId,
  tf,
  symbol,
  monitoringSymbol,
  height = 210,
}: {
  assetId: string;
  tf: string;
  symbol?: string;
  monitoringSymbol?: string;
  height?: number;
}) {
  const [chartData, setChartData] = useState<MonitoringChartData | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveSym = monitoringSymbol ?? ASSET_TO_MONITORING[assetId] ?? assetId.toUpperCase().replace(/_.*$/, "");
  const displayLabel = symbol ?? effectiveSym;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/monitoring/ohlc?symbol=${encodeURIComponent(effectiveSym)}&timeframe=1D&limit=500`,
        );
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { bars?: OhlcBar[] };
        const bars = json.bars ?? [];
        if (!bars.length || cancelled) return;
        setChartData({
          displaySymbol: displayLabel,
          displayName: displayLabel,
          bars,
          signals: [],
          boxes: [],
          timeframe: "1D",
        });
      } catch {
        // keep previous data on error
      }
    }

    void load();
    timerRef.current = setInterval(() => { void load(); }, 30_000);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [effectiveSym, displayLabel]);

  return (
    <div style={{ height, width: "100%", overflow: "hidden" }}>
      <CapalifeChart
        data={chartData}
        timeframe="1D"
        showHeader={false}
        showRangeBar={false}
        showPriceOverlay={true}
        showResetButton={false}
      />
    </div>
  );
}
