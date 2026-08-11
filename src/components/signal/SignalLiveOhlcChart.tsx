"use client";

import { useEffect, useRef, useState } from "react";
import { CapalifeChart } from "@/components/ui/capitalife-chart";
import type { MonitoringChartData } from "@/components/monitoring/MonitoringChart";

type OhlcBar = { time: string; open: number; high: number; low: number; close: number };

const ASSET_ICON_MAP: Record<string, string> = {
  "GC1!": "/asset-icons/gold.png",
  "GLD":  "/asset-icons/gold.png",
  "SI1!": "/asset-icons/silver.png",
  "YM1!": "/asset-icons/dow-jones.png",
  "NQ1!": "/asset-icons/nasdaq.png",
  "ES1!": "/asset-icons/sp500.png",
  "ZC1!": "/asset-icons/corn.png",
  "ZW1!": "/asset-icons/wheat.png",
  "ZS1!": "/asset-icons/soybeans.png",
  "CT1!": "/asset-icons/cotton.png",
  "KC1!": "/asset-icons/coffee.png",
  "CC1!": "/asset-icons/cocoa.png",
  "SB1!": "/asset-icons/sugar.png",
  "OJ1!": "/asset-icons/orange-juice.png",
  "CL1!": "/asset-icons/oil.png",
  "HG1!": "/asset-icons/copper.png",
  "6E1!": "/asset-icons/eur.png",
  "6B1!": "/asset-icons/gbp.png",
  "6S1!": "/asset-icons/chf.png",
  "QQQ":  "/asset-icons/nasdaq.png",
  "AAPL": "/asset-icons/aapl.png",
  "MSFT": "/asset-icons/msft.png",
  "NVDA": "/asset-icons/nvda.png",
  "AMZN": "/asset-icons/amzn.png",
  "GOOGL": "/asset-icons/googl.png",
  "META": "/asset-icons/meta.png",
};

function iconForSymbol(symbol: string): string {
  return ASSET_ICON_MAP[symbol] ?? "/asset-icons/default.png";
}

export function SignalLiveOhlcChart({
  symbol,
  assetName,
  timeframe = "1D",
}: {
  symbol: string;
  assetName: string;
  timeframe?: string;
}) {
  const [chartData, setChartData] = useState<MonitoringChartData | null>(null);
  const [lastDate, setLastDate] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const tf = timeframe === "1D" ? "D" : timeframe;
        const res = await fetch(
          `/api/monitoring/ohlc?symbol=${encodeURIComponent(symbol)}&timeframe=${tf}&limit=300`,
        );
        if (!res.ok || cancelled) return;
        const json = await res.json() as { bars?: OhlcBar[]; lastDate?: string };
        if (cancelled) return;
        const bars = (json.bars ?? []).filter(
          (b) => b.time && b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0,
        );
        setChartData({
          displaySymbol: symbol,
          displayName: assetName,
          bars,
          signals: [],
          boxes: [],
          timeframe: "1D",
        });
        setLastDate(json.lastDate ?? bars.at(-1)?.time ?? null);
      } catch {
        // keep previous data on error
      }
    };

    void load();
    intervalRef.current = setInterval(() => void load(), 30_000);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [symbol, assetName, timeframe]);

  // Re-fetch when symbol changes
  useEffect(() => {
    setChartData(null);
    setLastDate(null);
  }, [symbol]);

  const isEmpty = !chartData || chartData.bars.length === 0;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <CapalifeChart
        data={chartData}
        symbol={symbol}
        instrument={assetName}
        timeframe="1D"
        iconUrl={iconForSymbol(symbol)}
        showHeader={true}
        showPriceOverlay={true}
        showRangeBar={true}
        showResetButton={true}
        isEmpty={isEmpty}
      />
      {lastDate && (
        <div style={{
          position: "absolute",
          bottom: 36,
          right: 10,
          fontSize: 9,
          color: "rgba(255,255,255,0.22)",
          fontFamily: "var(--font-montserrat, 'Montserrat', sans-serif)",
          pointerEvents: "none",
          zIndex: 5,
        }}>
          last {lastDate}
        </div>
      )}
    </div>
  );
}
