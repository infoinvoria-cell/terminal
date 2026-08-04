"use client";

import { useEffect, useRef } from "react";
import { ChartAssetOverlay } from "@/components/shared/ChartAssetOverlay";
import { MONITORING_CHART_BACKGROUND } from "@/lib/monitoring/monitoringChartTheme";
import type {
  IChartApi,
  ISeriesApi,
  CandlestickSeriesOptions,
  Time,
} from "lightweight-charts";

// Suppress unused-import lint — types used in refs below
type _Unused = IChartApi | ISeriesApi<"Candlestick"> | CandlestickSeriesOptions;

// ── Reproducible Gold/GC1! demo data ─────────────────────────────────────────
// Fixed seed — does NOT change on re-render.

function buildGoldDemoData(): { time: Time; open: number; high: number; low: number; close: number }[] {
  // GC1! approximate price range Jan–Aug 2025
  const BASE = 2650;
  const START_UNIX = 1735689600; // 2025-01-01 00:00 UTC
  const TRADING_DAY = 86400;

  // Deterministic pseudo-random (LCG)
  let seed = 0xdeadbeef;
  function rand() {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  }

  const candles: { time: Time; open: number; high: number; low: number; close: number }[] = [];
  let close = BASE;
  let day = 0;

  for (let i = 0; i < 160; i++) {
    // Skip weekends
    const ts = START_UNIX + day * TRADING_DAY;
    const dow = new Date(ts * 1000).getUTCDay();
    if (dow === 0 || dow === 6) { day++; i--; continue; }

    const open = close;
    const trend = Math.sin(i * 0.07) * 60 + Math.sin(i * 0.023) * 30;
    const noise = (rand() - 0.47) * 24;
    close = Math.round((open + trend * 0.05 + noise) * 100) / 100;

    const bodyRange = Math.abs(open - close);
    const wickMult = 0.25 + rand() * 0.55;
    const high = Math.round((Math.max(open, close) + bodyRange * wickMult + rand() * 8) * 100) / 100;
    const low  = Math.round((Math.min(open, close) - bodyRange * wickMult - rand() * 8) * 100) / 100;

    candles.push({ time: ts as Time, open, high, low, close });
    day++;
  }

  return candles;
}

const GOLD_DEMO_DATA = buildGoldDemoData();


// ── Chart component ───────────────────────────────────────────────────────────

export function MasterCandleChart() {
  const wrapRef      = useRef<HTMLDivElement>(null);
  const chartHostRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const roRef        = useRef<ResizeObserver | null>(null);

  // Silence unused-ref lint — refs used inside async init below
  void wrapRef; void candleRef; void roRef;

  async function initChart() {
    if (!chartHostRef.current) return;

    const {
      createChart,
      CandlestickSeries,
      ColorType,
      CrosshairMode,
      LineStyle,
    } = await import("lightweight-charts");

    const host = chartHostRef.current;

    const chart = createChart(host, {
      width:  Math.max(80, host.clientWidth),
      height: Math.max(56, host.clientHeight),
      layout: {
        background: { type: ColorType.Solid, color: MONITORING_CHART_BACKGROUND },
        textColor: "#6B7280",
        fontSize: 11,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.MagnetOHLC,
        vertLine: {
          color: "rgba(180,185,200,0.55)",
          width: 1,
          style: 0,
          labelVisible: true,
          labelBackgroundColor: "rgba(22,26,32,0.92)",
          visible: true,
        },
        horzLine: {
          color: "rgba(180,185,200,0.55)",
          width: 1,
          style: 0,
          labelVisible: true,
          labelBackgroundColor: "rgba(22,26,32,0.92)",
          visible: true,
        },
      },
      localization: {
        priceFormatter: (p: number) => p.toFixed(2),
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        ticksVisible: true,
        minimumHeight: 22,
        rightOffset: 6,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.10 },
        minimumWidth: 72,
      },
      // TradingView-style: wheel zooms, drag pans
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      kineticScroll: {
        touch: true,
        mouse: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
      },
    });

    const lastCandle = GOLD_DEMO_DATA[GOLD_DEMO_DATA.length - 1];
    const isUp = lastCandle.close >= lastCandle.open;
    const priceLineColor = isUp ? "rgba(255,255,255,0.7)" : "#C9A84C";

    const candle = chart.addSeries(CandlestickSeries, {
      upColor:       "#FFFFFF",
      downColor:     "#C9A84C",
      wickUpColor:   "#FFFFFF",
      wickDownColor: "#C9A84C",
      borderVisible: false,
      // Built-in price line — matches Signal page style
      priceLineVisible: true,
      lastValueVisible: true,
      priceLineColor,
      priceLineWidth:  1,
      priceLineStyle:  LineStyle.Dashed,
    } as Partial<CandlestickSeriesOptions>);

    candle.setData(GOLD_DEMO_DATA);
    chart.timeScale().fitContent();

    chartRef.current  = chart;
    candleRef.current = candle;

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (chartHostRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width:  Math.max(80, chartHostRef.current.clientWidth),
          height: Math.max(56, chartHostRef.current.clientHeight),
        });
      }
    });
    ro.observe(host);
    roRef.current = ro;

    // Prevent browser vertical scroll hijack while hovering chart
    const onWheel = (e: WheelEvent) => { e.preventDefault(); };
    host.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      host.removeEventListener("wheel", onWheel);
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      candleRef.current = null;
    };
  }

  useEffect(() => {
    let teardown: (() => void) | undefined;
    initChart().then((fn) => { teardown = fn; });
    return () => { teardown?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", borderRadius: 10, overflow: "hidden" }}>
      <div ref={chartHostRef} style={{ width: "100%", height: "100%" }} />
      {/* Overlay — top-left, pointerEvents none so chart interactions pass through */}
      <div style={{ position: "absolute", left: 14, top: 14, zIndex: 10, pointerEvents: "none" }}>
        <ChartAssetOverlay
          iconUrl="/asset-icons/gold.png"
          symbol="GC1!"
          assetName="Gold Futures · COMEX"
          iconSize={26}
        />
      </div>
      {/* Demo data badge */}
      <div style={{
        position: "absolute", right: 12, bottom: 28, zIndex: 10, pointerEvents: "none",
        fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
        color: "rgba(255,255,255,0.15)", fontFamily: "monospace",
      }}>
        Demo-Daten
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
      padding: "28px 36px 24px",
      gap: 14,
      overflow: "hidden",
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#C9A84C", marginBottom: 5 }}>
          Design System · Referenz
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#eef5ff", lineHeight: 1 }}>Kerzenchart — Master</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 4 }}>
          Positiv = Weiß · Negativ = Gold · Kein Grid · Preis-Linie gestrichelt · MagnetOHLC-Fadenkreuz · TradingView-Interaktion
        </div>
      </div>

      {/* Chart */}
      <div style={{
        flex: 1,
        minHeight: 0,
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
        background: MONITORING_CHART_BACKGROUND,
      }}>
        <MasterCandleChart />
      </div>

      {/* Spec strip */}
      <div style={{ flexShrink: 0, display: "flex", gap: 24, flexWrap: "wrap" }}>
        {([
          ["Up-Farbe",    "#FFFFFF",                  "#FFFFFF"],
          ["Down-Farbe",  "#C9A84C",                  "#C9A84C"],
          ["BG",          "MONITORING_CHART_BACKGROUND", "rgba(255,255,255,0.35)"],
          ["Grid",        "aus",                       "rgba(255,255,255,0.35)"],
          ["Preis-Linie", "Dashed · auto Farbe",       "#C9A84C"],
          ["Fadenkreuz",  "MagnetOHLC",                "rgba(255,255,255,0.35)"],
          ["X-Achse",     "timeVisible: true",          "rgba(255,255,255,0.35)"],
          ["Scroll",      "Wheel + Drag + Pinch",       "rgba(255,255,255,0.35)"],
        ] as [string, string, string][]).map(([label, value, color]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)" }}>{label}</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
