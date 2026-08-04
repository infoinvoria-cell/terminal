"use client";

import { useEffect, useRef } from "react";
import { ChartAssetOverlay } from "@/components/shared/ChartAssetOverlay";

// ── Demo candle data ──────────────────────────────────────────────────────────

function makeDemoCandles() {
  const start = new Date("2025-01-02").getTime() / 1000;
  let close = 2650;
  return Array.from({ length: 80 }, (_, i) => {
    const open = close;
    const move = (Math.sin(i * 0.4) + Math.cos(i * 0.15)) * 18 + (Math.random() - 0.48) * 22;
    close = Math.round((open + move) * 100) / 100;
    const hi = Math.max(open, close) + Math.abs(move) * 0.4;
    const lo = Math.min(open, close) - Math.abs(move) * 0.4;
    return { time: (start + i * 86400) as unknown as import("lightweight-charts").Time, open, high: hi, low: lo, close };
  });
}

// ── Master Candle Chart ───────────────────────────────────────────────────────

export function MasterCandleChart() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let chart: import("lightweight-charts").IChartApi | null = null;

    import("lightweight-charts").then(({ createChart, CandlestickSeries }) => {
      if (!containerRef.current) return;

      chart = createChart(containerRef.current, {
        width:  containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        layout: {
          background: { color: "#0A0A0A" },
          textColor: "#6B7280",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.04)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        crosshair: {
          vertLine: { color: "rgba(255,255,255,0.12)", labelBackgroundColor: "#1a1a1a" },
          horzLine: { color: "rgba(255,255,255,0.12)", labelBackgroundColor: "#1a1a1a" },
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.06)",
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.06)",
        },
        handleScroll: true,
        handleScale: true,
      });

      const series = chart.addSeries(CandlestickSeries, {
        upColor:        "#FFFFFF",
        downColor:      "#C9A84C",
        wickUpColor:    "#FFFFFF",
        wickDownColor:  "#C9A84C",
        borderVisible:  false,
      });

      series.setData(makeDemoCandles());
      chart.timeScale().fitContent();

      const ro = new ResizeObserver(() => {
        if (chart && containerRef.current) {
          chart.applyOptions({
            width:  containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          });
        }
      });
      ro.observe(containerRef.current);

      return () => { ro.disconnect(); chart?.remove(); };
    });

    return () => { chart?.remove(); };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 10, overflow: "hidden" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", left: 14, top: 14, zIndex: 10, pointerEvents: "none" }}>
        <ChartAssetOverlay symbol="GC1!" assetName="Gold Futures" iconSize={26} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ReferenzenPage() {
  return (
    <div style={{ width: "100%", height: "100%", minHeight: "100vh", background: "#0A0A0E", padding: "36px 40px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#C9A84C", marginBottom: 6 }}>
          Design System · Referenz
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#eef5ff" }}>Kerzenchart — Master</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", marginTop: 4 }}>
          Positiv = Weiß · Negativ = Gold · X-Achse sichtbar · Overlay oben links direkt auf dem Chart
        </div>
      </div>

      {/* Chart — takes remaining height */}
      <div style={{ flex: 1, minHeight: 500, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
        <MasterCandleChart />
      </div>

      {/* Spec strip */}
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        {[
          ["Up-Farbe", "#FFFFFF", "#FFFFFF"],
          ["Down-Farbe", "#C9A84C", "#C9A84C"],
          ["Chart BG", "#0A0A0A", "rgba(255,255,255,0.4)"],
          ["Grid", "rgba(255,255,255,0.04)", "rgba(255,255,255,0.4)"],
          ["X-Achse", "timeVisible: true", "rgba(255,255,255,0.4)"],
          ["Overlay", "ChartAssetOverlay", "rgba(255,255,255,0.4)"],
        ].map(([label, value, valueColor]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>{label}</div>
            <div style={{ fontSize: 12, fontFamily: "monospace", color: valueColor }}>{value}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
