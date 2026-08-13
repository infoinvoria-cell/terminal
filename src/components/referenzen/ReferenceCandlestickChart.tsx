"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CapalifeChart, type CapalifeChartApi } from "@/components/ui/capitalife-chart";
import type { MonitoringChartData } from "@/components/monitoring/MonitoringChart";

// ---------------------------------------------------------------------------
// 350 deterministische Tageskerzen
// ---------------------------------------------------------------------------
function buildGoldBars() {
  let seed = 0xabcd_ef01;
  const rand = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b_3c6d);
    seed = Math.imul(seed ^ (seed >>> 12), 0x297a_2d39);
    seed ^= seed >>> 15;
    return (seed >>> 0) / 0xffff_ffff;
  };
  const bars: Array<{ time: string; open: number; high: number; low: number; close: number }> = [];
  let close = 2_310;
  const startMs = Date.UTC(2023, 11, 4);
  let cal = 0, trading = 0;
  while (trading < 350) {
    const d = new Date(startMs + cal * 86_400_000);
    cal++;
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const open = close;
    const drift = Math.sin(trading * 0.07) * 60 + Math.sin(trading * 0.019) * 30;
    close = Math.round((open + drift * 0.04 + (rand() - 0.46) * 14) * 100) / 100;
    const body = Math.abs(open - close);
    const wm = 0.25 + rand() * 0.55;
    const high = Math.round((Math.max(open, close) + body * wm + rand() * 4) * 100) / 100;
    const low = Math.round((Math.min(open, close) - body * wm - rand() * 4) * 100) / 100;
    bars.push({
      time: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
      open, high, low, close,
    });
    trading++;
  }
  return bars;
}

const GOLD_BARS = buildGoldBars();

// 10 Whitespace-Bars nach letzter Kerze → X-Achse + Fadenkreuz in Zukunft sichtbar
function buildFutureBars(count = 10) {
  const last = GOLD_BARS[GOLD_BARS.length - 1];
  const result: { time: string }[] = [];
  const d = new Date(`${last.time}T00:00:00Z`);
  while (result.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    result.push({ time: d.toISOString().slice(0, 10) });
  }
  return result;
}
const FUTURE_BARS = buildFutureBars();

// Test-Signale: Seasonal = Long, Anomaly = Short
const TEST_SIGNALS = {
  Seasonal: { barIndex: GOLD_BARS.length - 22, bar: GOLD_BARS[GOLD_BARS.length - 22], direction: "long" as const },
  Anomaly:  { barIndex: GOLD_BARS.length - 10, bar: GOLD_BARS[GOLD_BARS.length - 10], direction: "short" as const },
};

function getSignalLevels(sig: { bar: (typeof GOLD_BARS)[0]; direction: "long" | "short" }) {
  const entry = sig.bar.close;
  const risk = entry * 0.005;
  return sig.direction === "long"
    ? { entry, sl: entry - risk, be: entry + risk, tp: entry + risk * 2 }
    : { entry, sl: entry + risk, be: entry - risk, tp: entry - risk * 2 };
}

// MonitoringChartData wrapper for CapalifeChart (bar data only — future bars handled in onChartReady)
const GOLD_MONITORING_DATA: MonitoringChartData = {
  displaySymbol: "GC1!",
  displayName: "Gold Futures",
  bars: GOLD_BARS.map((b) => ({ ...b })),
  signals: [],
  boxes: [],
  timeframe: "1D",
};

const FONT = "var(--font-montserrat, 'Montserrat', sans-serif)";
const TIME_AXIS_H = 32;

function StrategyChip({ label, active, onToggle, font }: { label: string; active: boolean; onToggle: () => void; font: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block",
        border: "none",
        background: "none",
        padding: 0,
        cursor: "pointer",
        fontFamily: font,
        fontSize: 11,
        fontWeight: 500,
        color: active
          ? hovered ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.75)"
          : hovered ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.22)",
        transition: "color 140ms ease",
        whiteSpace: "nowrap",
        textAlign: "left",
        lineHeight: 1.4,
        userSelect: "none",
      }}
    >
      {label}
    </button>
  );
}

export function ReferenceCandlestickChart() {
  // Chart API from CapalifeChart
  const chartApiRef = useRef<CapalifeChartApi | null>(null);
  const [apiReady, setApiReady] = useState(false);

  // Signal overlay state
  const [signalTriangles, setSignalTriangles] = useState<Array<{ x: number; y: number; dir: "up" | "down"; color: string; name: string }>>([]);
  const [signalLevels, setSignalLevels] = useState<Array<{ x: number; y: number; color: string; label: string }>>([]);
  const [exitTriangles, setExitTriangles] = useState<Array<{ x: number; y: number }>>([]);
  const [tradeLines, setTradeLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);
  const [activeTradeBg, setActiveTradeBg] = useState<Set<string>>(new Set());
  const activeTradeBgRef = useRef<Set<string>>(new Set());
  const [tradeBgRects, setTradeBgRects] = useState<Array<{
    xStart: number; xEnd: number;
    yEntry: number; ySL: number; yBE: number; yTP: number;
  }>>([]);
  const syncSignalTrianglesRef = useRef<() => void>(() => {});

  const [showStrategies, setShowStrategies] = useState(false);
  const [activeStrategies, setActiveStrategies] = useState<Set<string>>(new Set(["Seasonal", "Anomaly"]));
  const [headerSize, setHeaderSize] = useState<{ w: number; h: number } | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const toggleStrategy = (name: string) =>
    setActiveStrategies((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const toggleTradeBg = useCallback((name: string) => {
    setActiveTradeBg((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      activeTradeBgRef.current = next;
      return next;
    });
  }, []);

  // Header size for blur backdrop (reference chart's own header)
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setHeaderSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setHeaderSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  const syncSignalTriangles = useCallback(() => {
    const api = chartApiRef.current;
    if (!api || !showStrategies) {
      setSignalTriangles([]);
      setSignalLevels([]);
      setExitTriangles([]);
      setTradeLines([]);
      setTradeBgRects([]);
      return;
    }
    const { chart, series, container } = api;
    const triangles: typeof signalTriangles = [];
    for (const [name, sig] of Object.entries(TEST_SIGNALS)) {
      if (!activeStrategies.has(name)) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x = chart.timeScale().timeToCoordinate(sig.bar.time as any) as any;
      const bodyBottom = Math.min(sig.bar.open, sig.bar.close);
      const bodyTop = Math.max(sig.bar.open, sig.bar.close);
      const bodyRange = bodyTop - bodyBottom;
      const priceGap = Math.max(bodyRange * 1.1, sig.bar.close * 0.003);
      const refPrice = sig.direction === "long" ? bodyBottom - priceGap : bodyTop + priceGap;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const y = series.priceToCoordinate(refPrice) as any;
      if (x == null || y == null || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;
      triangles.push({
        x: Number(x), y: Number(y),
        dir: sig.direction === "long" ? "up" : "down",
        color: sig.direction === "long" ? "#22C55E" : "#EF4444",
        name,
      });
    }
    setSignalTriangles(triangles);

    const levels: typeof signalLevels = [];
    for (const [name, sig] of Object.entries(TEST_SIGNALS)) {
      if (!activeStrategies.has(name)) continue;
      const nextBar = GOLD_BARS[sig.barIndex + 1];
      if (!nextBar) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lx = chart.timeScale().timeToCoordinate(nextBar.time as any) as any;
      if (lx == null || !Number.isFinite(Number(lx))) continue;
      const chartW = container.clientWidth;
      const chartH = container.clientHeight - TIME_AXIS_H;
      const LEVEL_W = 12;
      if (Number(lx) < LEVEL_W || Number(lx) > chartW) continue;
      const { entry, sl, be, tp } = getSignalLevels(sig);
      const items = [
        { price: entry, color: "#06B6D4", label: "Entry" },
        { price: sl,    color: "#EF4444", label: "SL" },
        { price: be,    color: "#3B82F6", label: "BE" },
        { price: tp,    color: "#22C55E", label: "TP" },
      ];
      for (const item of items) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ly = series.priceToCoordinate(item.price) as any;
        if (ly == null || !Number.isFinite(Number(ly))) continue;
        if (Number(ly) < 0 || Number(ly) > chartH) continue;
        levels.push({ x: Number(lx), y: Number(ly), color: item.color, label: item.label });
      }
    }
    setSignalLevels(levels);

    const exits: typeof exitTriangles = [];
    for (const [name, sig] of Object.entries(TEST_SIGNALS)) {
      if (!activeStrategies.has(name)) continue;
      const exitBar = GOLD_BARS[sig.barIndex + 6];
      if (!exitBar) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ex = chart.timeScale().timeToCoordinate(exitBar.time as any) as any;
      if (ex == null || !Number.isFinite(Number(ex))) continue;
      const chartW = container.clientWidth;
      if (Number(ex) < 0 || Number(ex) > chartW) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ey = series.priceToCoordinate(exitBar.close) as any;
      if (ey == null || !Number.isFinite(Number(ey))) continue;
      exits.push({ x: Number(ex), y: Number(ey) });
    }
    setExitTriangles(exits);

    const lines: typeof tradeLines = [];
    for (const [name, sig] of Object.entries(TEST_SIGNALS)) {
      if (!activeStrategies.has(name)) continue;
      const entryNextBar = GOLD_BARS[sig.barIndex + 1];
      const exitBar = GOLD_BARS[sig.barIndex + 6];
      if (!entryNextBar || !exitBar) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x1 = Number(chart.timeScale().timeToCoordinate(entryNextBar.time as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x2 = Number(chart.timeScale().timeToCoordinate(exitBar.time as any));
      const { entry } = getSignalLevels(sig);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const y1 = Number(series.priceToCoordinate(entry) as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const y2 = Number(series.priceToCoordinate(exitBar.close) as any);
      const chartW = container.clientWidth;
      const chartH2 = container.clientHeight - TIME_AXIS_H;
      if (!Number.isFinite(x1) || !Number.isFinite(x2) || !Number.isFinite(y1) || !Number.isFinite(y2)) continue;
      if (x1 < 0 || x2 > chartW || y1 < 0 || y1 > chartH2) continue;
      lines.push({ x1, y1, x2, y2 });
    }
    setTradeLines(lines);

    const bgs: typeof tradeBgRects = [];
    for (const [name, sig] of Object.entries(TEST_SIGNALS)) {
      if (!activeStrategies.has(name) || !activeTradeBgRef.current.has(name)) continue;
      const entryNextBar = GOLD_BARS[sig.barIndex + 1];
      const exitBar = GOLD_BARS[sig.barIndex + 6];
      if (!entryNextBar || !exitBar) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xStart = Number(chart.timeScale().timeToCoordinate(entryNextBar.time as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xEnd = Number(chart.timeScale().timeToCoordinate(exitBar.time as any));
      if (!Number.isFinite(xStart) || !Number.isFinite(xEnd)) continue;
      const { entry, sl, be, tp } = getSignalLevels(sig);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yEntry = Number(series.priceToCoordinate(entry) as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ySL = Number(series.priceToCoordinate(sl) as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yBE = Number(series.priceToCoordinate(be) as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yTP = Number(series.priceToCoordinate(tp) as any);
      if ([yEntry, ySL, yBE, yTP].some((v) => !Number.isFinite(v))) continue;
      bgs.push({ xStart, xEnd, yEntry, ySL, yBE, yTP });
    }
    setTradeBgRects(bgs);
  }, [showStrategies, activeStrategies, activeTradeBg]);

  // Keep ref up-to-date so chart subscriptions always call the latest version
  useEffect(() => {
    syncSignalTrianglesRef.current = syncSignalTriangles;
  }, [syncSignalTriangles]);

  // Recompute whenever strategies or trade bg change
  useEffect(() => {
    syncSignalTriangles();
  }, [syncSignalTriangles]);

  // ResizeObserver for signal triangles — wired up once chart API is ready
  useEffect(() => {
    if (!apiReady || !chartApiRef.current) return;
    const { container } = chartApiRef.current;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => syncSignalTrianglesRef.current());
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [apiReady]);

  // onChartReady — called by CapalifeChart once the LWC chart is mounted
  const onChartReady = useCallback((api: CapalifeChartApi) => {
    chartApiRef.current = api;

    // Override series data to include future whitespace bars
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.series.setData([...GOLD_BARS, ...FUTURE_BARS] as any);
    api.chart.timeScale().setVisibleLogicalRange({
      from: GOLD_BARS.length - 25,
      to: GOLD_BARS.length + 4,
    });

    // Attach signal triangle subscriptions
    api.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      requestAnimationFrame(() => syncSignalTrianglesRef.current());
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api.chart as any).priceScale("right").subscribeVisiblePriceRangeChange?.(() =>
      requestAnimationFrame(() => syncSignalTrianglesRef.current()),
    );

    setApiReady(true);
  }, []);

  return (
    <CapalifeChart
      data={GOLD_MONITORING_DATA}
      symbol="GC1!"
      instrument="Gold Futures"
      timeframe="1D"
      iconUrl="/asset-icons/gold.png"
      showHeader={false}
      showPriceOverlay={true}
      showRangeBar={true}
      showResetButton={true}
      onChartReady={onChartReady}
    >
      {/* Trade background fills */}
      {tradeBgRects.map((b, i) => {
        const w = b.xEnd - b.xStart;
        const slZoneY = Math.min(b.yEntry, b.ySL);
        const slZoneH = Math.abs(b.ySL - b.yEntry);
        const tpZoneY = Math.min(b.yEntry, b.yTP);
        const tpZoneH = Math.abs(b.yTP - b.yEntry);
        return (
          <svg key={i} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 3, overflow: "hidden" }}>
            <rect x={b.xStart} y={slZoneY} width={w} height={slZoneH} fill="rgba(239,68,68,0.055)" />
            <rect x={b.xStart} y={tpZoneY} width={w} height={tpZoneH} fill="rgba(34,197,94,0.045)" />
            <line x1={b.xStart} y1={b.ySL}    x2={b.xEnd} y2={b.ySL}    stroke="#EF4444" strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 3" />
            <line x1={b.xStart} y1={b.yBE}    x2={b.xEnd} y2={b.yBE}    stroke="#3B82F6" strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 3" />
            <line x1={b.xStart} y1={b.yEntry} x2={b.xEnd} y2={b.yEntry} stroke="#06B6D4" strokeWidth={1} strokeOpacity={0.7} strokeDasharray="3 3" />
            <line x1={b.xStart} y1={b.yTP}    x2={b.xEnd} y2={b.yTP}    stroke="#22C55E" strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 3" />
          </svg>
        );
      })}

      {/* Signal entry triangles */}
      {signalTriangles.map((t) => {
        const S = 7;
        const isActive = activeTradeBg.has(t.name);
        const points = t.dir === "up"
          ? `${t.x},${t.y - S * 2} ${t.x - S},${t.y} ${t.x + S},${t.y}`
          : `${t.x},${t.y + S * 2} ${t.x - S},${t.y} ${t.x + S},${t.y}`;
        return (
          <svg
            key={t.name}
            onClick={() => toggleTradeBg(t.name)}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 7, overflow: "visible", cursor: "pointer" }}
          >
            <polygon
              points={points}
              fill={t.color}
              opacity={isActive ? 1 : 0.92}
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              stroke={isActive ? "rgba(255,255,255,0.5)" : "none"}
              strokeWidth={isActive ? 1 : 0}
            />
          </svg>
        );
      })}

      {/* Signal level triangles */}
      {signalLevels.map((l, i) => {
        const H = 5;
        const W = 10;
        const points = `${l.x - W},${l.y - H} ${l.x - W},${l.y + H} ${l.x},${l.y}`;
        return (
          <svg key={i} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 6, overflow: "hidden" }}>
            <polygon points={points} fill={l.color} opacity={0.88} />
          </svg>
        );
      })}

      {/* Trade lines */}
      {tradeLines.map((l, i) => (
        <svg key={i} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5, overflow: "hidden" }}>
          <line
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(160,160,170,0.55)"
            strokeWidth={1}
            strokeDasharray="3 4"
            shapeRendering="geometricPrecision"
          />
        </svg>
      ))}

      {/* Exit triangles */}
      {exitTriangles.map((t, i) => {
        const H = 6;
        const W = 11;
        const points = `${t.x},${t.y} ${t.x + W},${t.y - H} ${t.x + W},${t.y + H}`;
        return (
          <svg key={i} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 6, overflow: "hidden" }}>
            <polygon points={points} fill="#A855F7" opacity={0.9} />
          </svg>
        );
      })}

      {/* Blur backdrop behind reference chart header */}
      {headerSize && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 12 + headerSize.w + 20,
            height: 12 + headerSize.h + 16,
            zIndex: 9,
            pointerEvents: "none",
            backdropFilter: "blur(7px)",
            WebkitBackdropFilter: "blur(7px)",
            maskImage: "linear-gradient(135deg, black 50%, transparent 88%)",
            WebkitMaskImage: "linear-gradient(135deg, black 50%, transparent 88%)",
          }}
        />
      )}

      {/* Reference chart header — GC1! · 1D + eye toggle + strategy chips */}
      <div
        ref={headerRef}
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          pointerEvents: "auto",
          userSelect: "none",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Instrument row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/asset-icons/gold.png"
            alt=""
            style={{ width: 34, height: 34, objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5, fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "#F5F5F5", lineHeight: 1.15, whiteSpace: "nowrap" }}>
              <span>GC1!</span>
              <span style={{ color: "#ffffff", fontWeight: 700 }}>·</span>
              <span style={{ fontFamily: "var(--font-nunito, 'Nunito', sans-serif)", fontWeight: 700 }}>1D</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: FONT, fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", lineHeight: 1.2, whiteSpace: "nowrap" }}>
                <span>Gold Futures</span>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
                <span>COMEX</span>
              </div>
              {/* Eye toggle */}
              <button
                type="button"
                onClick={() => setShowStrategies((v) => !v)}
                title={showStrategies ? "Strategien ausblenden" : "Strategien einblenden"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 18, height: 18, border: "none", background: "none",
                  cursor: "pointer", padding: 0,
                  color: showStrategies ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)",
                  transition: "color 150ms ease", flexShrink: 0,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.85)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = showStrategies ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)"; }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {showStrategies ? (
                    <>
                      <path d="M8 3C4.5 3 1.5 8 1.5 8s3 5 6.5 5 6.5-5 6.5-5-3-5-6.5-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                    </>
                  ) : (
                    <>
                      <path d="M2 2l12 12M6.5 6.7A2 2 0 0010.3 10M4.2 4.5C2.8 5.6 1.5 8 1.5 8s3 5 6.5 5c1.4 0 2.7-.5 3.8-1.3M7 3.1C7.3 3 7.7 3 8 3c3.5 0 6.5 5 6.5 5s-.7 1.3-1.9 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Strategy chips — visible when eye is active */}
        {showStrategies && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {["Seasonal", "Anomaly"].map((name) => (
              <StrategyChip
                key={name}
                label={name}
                active={activeStrategies.has(name)}
                onToggle={() => toggleStrategy(name)}
                font={FONT}
              />
            ))}
          </div>
        )}
      </div>
    </CapalifeChart>
  );
}
