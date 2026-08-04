"use client";

import { useEffect, useRef } from "react";
import { ChartAssetOverlay } from "@/components/shared/ChartAssetOverlay";

// ── Demo candle data (Gold/GC1! style — realistic price range) ───────────────

function makeDemoCandles() {
  const start = new Date("2025-01-02").getTime() / 1000;
  let close = 2650;
  return Array.from({ length: 120 }, (_, i) => {
    const open = close;
    const trend = Math.sin(i * 0.08) * 80;
    const noise = (Math.random() - 0.48) * 28;
    close = Math.round((open + trend * 0.06 + noise) * 100) / 100;
    const range = Math.abs(open - close);
    const hi = Math.max(open, close) + range * (0.3 + Math.random() * 0.5);
    const lo = Math.min(open, close) - range * (0.3 + Math.random() * 0.5);
    return {
      time: (start + i * 86400) as unknown as import("lightweight-charts").Time,
      open,
      high: Math.round(hi * 100) / 100,
      low:  Math.round(lo * 100) / 100,
      close,
    };
  });
}

// ── Master Candle Chart ───────────────────────────────────────────────────────

function MasterCandleChart() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("lightweight-charts").then(({ createChart, CandlestickSeries, ColorType, LineStyle, CrosshairMode }) => {
      if (!containerRef.current) return;

      const chart = createChart(containerRef.current, {
        width:  containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: "#0B0C0F" },
          textColor: "#6B7280",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif",
          fontSize: 11,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: "rgba(255,255,255,0.18)",
            width: 1,
            style: LineStyle.Solid,
            labelBackgroundColor: "#1e1f24",
          },
          horzLine: {
            color: "rgba(255,255,255,0.18)",
            width: 1,
            style: LineStyle.Solid,
            labelBackgroundColor: "#C9A84C",
          },
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.07)",
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: (time: number) => {
            const d = new Date(time * 1000);
            return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
          },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.07)",
          scaleMargins: { top: 0.08, bottom: 0.08 },
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale:  { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      });

      const candles = chart.addSeries(CandlestickSeries, {
        upColor:       "#FFFFFF",
        downColor:     "#C9A84C",
        wickUpColor:   "#FFFFFF",
        wickDownColor: "#C9A84C",
        borderVisible: false,
        priceLineVisible:  true,
        lastValueVisible:  true,
        priceLineColor:    "#C9A84C",
        priceLineWidth:    1,
        priceLineStyle:    LineStyle.Dashed,
      });

      const data = makeDemoCandles();
      candles.setData(data);
      chart.timeScale().fitContent();

      const ro = new ResizeObserver(() => {
        if (containerRef.current) {
          chart.applyOptions({
            width:  containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          });
        }
      });
      ro.observe(containerRef.current);

      cleanup = () => { ro.disconnect(); chart.remove(); };
    });

    return () => { cleanup?.(); };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 10, overflow: "hidden" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", left: 14, top: 14, zIndex: 10, pointerEvents: "none" }}>
        <ChartAssetOverlay
          iconUrl="/asset-icons/gold.png"
          symbol="GC1!"
          assetName="Gold Futures"
          iconSize={26}
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ReferenzenPage() {
  return (
    <div style={{
      width: "100%",
      height: "100vh",
      background: "#0A0A0E",
      display: "flex",
      flexDirection: "column",
      padding: "28px 36px 28px",
      gap: 16,
      overflow: "hidden",
    }}>

      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#C9A84C", marginBottom: 5 }}>
          Design System · Referenz
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#eef5ff", lineHeight: 1 }}>Kerzenchart — Master</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
          Positiv = Weiß · Negativ = Gold · Kein Grid · Preis-Linie gestrichelt · Overlay oben links
        </div>
      </div>

      {/* Chart — fills remaining space */}
      <div style={{ flex: 1, minHeight: 0, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
        <MasterCandleChart />
      </div>

      {/* Spec strip */}
      <div style={{ flexShrink: 0, display: "flex", gap: 28, flexWrap: "wrap" }}>
        {([
          ["Up-Farbe",   "#FFFFFF",                    "#FFFFFF"],
          ["Down-Farbe", "#C9A84C",                    "#C9A84C"],
          ["Chart BG",   "#0B0C0F",                    "rgba(255,255,255,0.38)"],
          ["Grid",       "aus",                         "rgba(255,255,255,0.38)"],
          ["Preis-Linie","gestrichelt · #C9A84C",       "#C9A84C"],
          ["X-Achse",    "timeVisible: true",           "rgba(255,255,255,0.38)"],
          ["Overlay",    "ChartAssetOverlay",           "rgba(255,255,255,0.38)"],
        ] as [string, string, string][]).map(([label, value, color]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>{label}</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color }}>{value}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
