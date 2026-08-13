"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  CrosshairMode,
  LineStyle,
  ColorType,
} from "lightweight-charts";
import {
  buildLivePriceAxisLabel,
  candleCloseTone,
  formatAxisPrice,
  PRICE_AXIS_COUNTDOWN_COLOR,
  PRICE_AXIS_TEXT_COLOR,
  priceAxisBackgroundColor,
  priceAxisGuideStrokeColor,
  priceAxisLabelBorderColor,
  priceAxisLabelShadowColor,
  type CandleCloseTone,
} from "@/lib/monitoring/candleCloseCountdown";
import { useLiveQuotesContext } from "@/contexts/LiveQuotesContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type OhlcBar = {
  time: number; // Unix seconds UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ApiBar = { t: string; open: number; high: number; low: number; close: number; volume: number };

type EngineSignal = {
  name: string;
  barTime: number; // Unix seconds
  bar: OhlcBar;
  direction: "long" | "short";
};

type PriceLine = { x1: number; x2: number; y: number; stroke: string };
type PriceLabel = {
  top: number; left: number; width: number;
  priceText: string; countdownText: string | null;
  tone: CandleCloseTone; backgroundColor: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const UP_COLOR   = "#ffffff";
const DOWN_COLOR = "#C9A84C"; // gold — same palette as Referenzen
const FONT       = "var(--font-montserrat, 'Montserrat', sans-serif)";
const FONT_NUNITO = "var(--font-nunito, 'Nunito', sans-serif)";
const MONITORING_FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
const TIME_AXIS_H = 32;
const VISIBLE_BARS = 80; // initial visible range for 30M

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPriceAxisWidth(chart: ReturnType<typeof createChart>): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (chart as any).priceScale("right").width() as number;
    return w > 10 ? w : 70;
  } catch { return 70; }
}

function buildFutureBars(lastTimeUnix: number, count = 12): { time: number }[] {
  const result: { time: number }[] = [];
  let t = lastTimeUnix;
  for (let i = 0; i < count; i++) {
    t += 30 * 60; // +30 minutes
    result.push({ time: t });
  }
  return result;
}

function signalLevels(bar: OhlcBar, dir: "long" | "short") {
  const entry = bar.close;
  const risk = entry * 0.003; // ~0.3% — tight for intraday FX
  return dir === "long"
    ? { entry, sl: entry - risk, be: entry + risk, tp: entry + risk * 2 }
    : { entry, sl: entry + risk, be: entry - risk, tp: entry - risk * 2 };
}

// ─── EngineCandlestickChart ──────────────────────────────────────────────────

export function EngineCandlestickChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef    = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef     = useRef<ReturnType<typeof createChart> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef    = useRef<any>(null);

  const [bars, setBars]         = useState<OhlcBar[]>([]);
  const [futureBars, setFutureBars] = useState<{ time: number }[]>([]);
  const [dataStatus, setDataStatus] = useState<"loading" | "loaded" | "empty">("loading");
  const [signals, setSignals]   = useState<EngineSignal[]>([]);

  const [priceLine, setPriceLine]   = useState<PriceLine | null>(null);
  const [priceLabel, setPriceLabel] = useState<PriceLabel | null>(null);
  const [headerSize, setHeaderSize] = useState<{ w: number; h: number } | null>(null);
  const [showSignals, setShowSignals] = useState(false);
  const [activeSignals, setActiveSignals] = useState<Set<string>>(new Set());
  const [activeTradeBg, setActiveTradeBg] = useState<Set<string>>(new Set());
  const activeTradeBgRef = useRef<Set<string>>(new Set());

  const [signalTriangles, setSignalTriangles] = useState<Array<{ x: number; y: number; dir: "up" | "down"; color: string; name: string }>>([]);
  const [signalLevelMarkers, setSignalLevelMarkers] = useState<Array<{ x: number; y: number; color: string; label: string }>>([]);
  const [tradeLines, setTradeLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);
  const [tradeBgRects, setTradeBgRects] = useState<Array<{ xStart: number; xEnd: number; yEntry: number; ySL: number; yBE: number; yTP: number }>>([]);

  const syncSignalTrianglesRef = useRef<() => void>(() => {});

  // Live quote from Supabase (5 s poll, ~15 min delayed)
  const { getQuote } = useLiveQuotesContext();
  const liveQuote = getQuote("6E1!");
  // Ref so syncOverlay doesn't cause a render loop when liveQuote returns new obj refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveQuoteRef = useRef<any>(null);
  const barsRef = useRef<OhlcBar[]>([]);
  useEffect(() => { liveQuoteRef.current = liveQuote; }, [liveQuote]);
  useEffect(() => { barsRef.current = bars; }, [bars]);

  // ─── Fetch OHLCV from timeseries API ──────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setDataStatus("loading");
    fetch("/api/asset/eurusd_30m/timeseries?tf=30M")
      .then(r => r.ok ? r.json() : null)
      .then((data: { ohlcv?: ApiBar[] } | null) => {
        if (cancelled) return;
        const raw = data?.ohlcv ?? [];
        if (!raw.length) { setDataStatus("empty"); return; }
        const converted: OhlcBar[] = raw.map(b => ({
          time: Math.floor(new Date(b.t).getTime() / 1000),
          open: b.open, high: b.high, low: b.low,
          close: b.close, volume: b.volume,
        }));
        // deduplicate & sort
        const deduped = new Map<number, OhlcBar>();
        for (const b of converted) deduped.set(b.time, b);
        const sorted = [...deduped.values()].sort((a, b) => a.time - b.time);
        setBars(sorted);
        setFutureBars(buildFutureBars(sorted[sorted.length - 1].time));
        setDataStatus("loaded");
      })
      .catch(() => { if (!cancelled) setDataStatus("empty"); });
    return () => { cancelled = true; };
  }, []);

  // ─── Fetch signals from forward-logger ────────────────────────────────────

  useEffect(() => {
    fetch("/api/monitoring/forward-logger")
      .then(r => r.ok ? r.json() : null)
      .then((data: { activeSignals?: Array<{ symbol?: string; direction?: string; signal_direction?: string; timestamp?: string; signal_date?: string; strategy?: string; strategy_id?: string }> } | null) => {
        const sigs = (data?.activeSignals ?? [])
          .filter(s => {
            const sym = (s.symbol ?? "").toUpperCase();
            return sym === "6E1!" || sym === "EURUSD" || sym === "EUR/USD";
          })
          .map((s, i) => {
            const rawDir = (s.direction ?? s.signal_direction ?? "").toLowerCase();
            const dir: "long" | "short" = rawDir === "short" ? "short" : "long";
            const ts = s.timestamp ?? s.signal_date ?? "";
            const barTime = ts ? Math.floor(new Date(ts).getTime() / 1000) : 0;
            return { name: s.strategy ?? s.strategy_id ?? `Signal ${i + 1}`, barTime, bar: null as unknown as OhlcBar, direction: dir };
          })
          .filter(s => s.barTime > 0);
        setSignals(sigs);
        setActiveSignals(new Set(sigs.map(s => s.name)));
      })
      .catch(() => {/* no signals */});
  }, []);

  // ─── Resolve signal bars once OHLCV is loaded ─────────────────────────────

  const resolvedSignals: EngineSignal[] = signals.map(sig => {
    // find nearest bar at or before signal time
    let best: OhlcBar | null = null;
    for (const b of bars) {
      if (b.time <= sig.barTime) best = b;
      else break;
    }
    return { ...sig, bar: best ?? bars[bars.length - 1] };
  }).filter(s => !!s.bar);

  // ─── Header resize observer ────────────────────────────────────────────────

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

  // ─── syncOverlay — live price line + label ─────────────────────────────────

  const syncOverlay = useCallback(() => {
    const chart  = chartRef.current;
    const series = seriesRef.current;
    const container = containerRef.current;
    const bars = barsRef.current;
    if (!chart || !series || !container || !bars.length) return;

    const lastBar = bars[bars.length - 1];
    const liveClose = liveQuoteRef.current?.close ?? lastBar.close;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceY = series.priceToCoordinate(liveClose) as any;
    if (priceY == null || !Number.isFinite(Number(priceY))) { setPriceLine(null); return; }

    const priceAxisW = getPriceAxisWidth(chart);
    const w = container.clientWidth;
    const x2 = w - priceAxisW;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastX = chart.timeScale().timeToCoordinate(lastBar.time as any) as any;
    const MIN_LINE_PX = 40;
    const rawStart = lastX != null && Number.isFinite(Number(lastX)) && Number(lastX) > 0 && Number(lastX) < x2 ? Number(lastX) : null;
    const x1 = Math.max(0, rawStart != null ? Math.min(rawStart, x2 - MIN_LINE_PX) : x2 - MIN_LINE_PX);

    const label = buildLivePriceAxisLabel({ barTime: lastBar.time * 1000, open: lastBar.open, close: liveClose, timeframe: "30M" });
    const tone  = label?.tone ?? candleCloseTone(lastBar.open, liveClose);

    setPriceLine({ x1, x2, y: Number(priceY), stroke: priceAxisGuideStrokeColor(tone) });
    setPriceLabel({
      top: Number(priceY), left: x2, width: priceAxisW,
      priceText: label?.priceText ?? formatAxisPrice(liveClose),
      countdownText: label?.countdownText ?? null,
      tone, backgroundColor: label?.backgroundColor ?? priceAxisBackgroundColor(tone),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync when bars load; live quote handled by 1s interval
  useEffect(() => { syncOverlay(); }, [bars, syncOverlay]);

  // ─── syncSignalTriangles ───────────────────────────────────────────────────

  const syncSignalTriangles = useCallback(() => {
    const chart  = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !showSignals || !resolvedSignals.length) {
      setSignalTriangles([]); setSignalLevelMarkers([]); setTradeLines([]); setTradeBgRects([]);
      return;
    }
    const chartH = (containerRef.current?.clientHeight ?? 9999) - TIME_AXIS_H;
    const chartW = containerRef.current?.clientWidth ?? 0;

    const triangles: typeof signalTriangles = [];
    for (const sig of resolvedSignals) {
      if (!activeSignals.has(sig.name)) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x = chart.timeScale().timeToCoordinate(sig.bar.time as any) as any;
      const bodyBottom = Math.min(sig.bar.open, sig.bar.close);
      const bodyTop    = Math.max(sig.bar.open, sig.bar.close);
      const bodyRange  = bodyTop - bodyBottom;
      const priceGap   = Math.max(bodyRange * 1.2, sig.bar.close * 0.001);
      const refPrice   = sig.direction === "long" ? bodyBottom - priceGap : bodyTop + priceGap;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const y = series.priceToCoordinate(refPrice) as any;
      if (x == null || y == null || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;
      triangles.push({ x: Number(x), y: Number(y), dir: sig.direction === "long" ? "up" : "down", color: sig.direction === "long" ? "#22C55E" : "#EF4444", name: sig.name });
    }
    setSignalTriangles(triangles);

    // Level markers
    const levels: typeof signalLevelMarkers = [];
    for (const sig of resolvedSignals) {
      if (!activeSignals.has(sig.name)) continue;
      const nextIdx = bars.findIndex(b => b.time > sig.bar.time);
      const nextBar = nextIdx !== -1 ? bars[nextIdx] : null;
      if (!nextBar) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lx = chart.timeScale().timeToCoordinate(nextBar.time as any) as any;
      if (lx == null || !Number.isFinite(Number(lx))) continue;
      if (Number(lx) < 10 || Number(lx) > chartW) continue;
      const { entry, sl, be, tp } = signalLevels(sig.bar, sig.direction);
      for (const [price, color, label] of [[entry, "#06B6D4", "Entry"], [sl, "#EF4444", "SL"], [be, "#3B82F6", "BE"], [tp, "#22C55E", "TP"]] as const) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ly = series.priceToCoordinate(price as any) as any;
        if (ly == null || !Number.isFinite(Number(ly))) continue;
        if (Number(ly) < 0 || Number(ly) > chartH) continue;
        levels.push({ x: Number(lx), y: Number(ly), color, label });
      }
    }
    setSignalLevelMarkers(levels);

    // Trade lines (entry → exit: entry bar + 5)
    const lines: typeof tradeLines = [];
    for (const sig of resolvedSignals) {
      if (!activeSignals.has(sig.name)) continue;
      const entryIdx = bars.findIndex(b => b.time > sig.bar.time);
      const exitIdx  = entryIdx !== -1 ? entryIdx + 4 : -1;
      if (entryIdx === -1 || exitIdx >= bars.length) continue;
      const entryBar = bars[entryIdx];
      const exitBar  = bars[exitIdx];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x1 = Number(chart.timeScale().timeToCoordinate(entryBar.time as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x2 = Number(chart.timeScale().timeToCoordinate(exitBar.time as any));
      const { entry } = signalLevels(sig.bar, sig.direction);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const y1 = Number(series.priceToCoordinate(entry as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const y2 = Number(series.priceToCoordinate(exitBar.close as any));
      if (!Number.isFinite(x1) || !Number.isFinite(x2) || !Number.isFinite(y1) || !Number.isFinite(y2)) continue;
      lines.push({ x1, y1, x2, y2 });
    }
    setTradeLines(lines);

    // Trade bg rects (on click)
    const bgs: typeof tradeBgRects = [];
    for (const sig of resolvedSignals) {
      if (!activeSignals.has(sig.name) || !activeTradeBgRef.current.has(sig.name)) continue;
      const entryIdx = bars.findIndex(b => b.time > sig.bar.time);
      const exitIdx  = entryIdx !== -1 ? entryIdx + 4 : -1;
      if (entryIdx === -1 || exitIdx >= bars.length) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xStart = Number(chart.timeScale().timeToCoordinate(bars[entryIdx].time as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xEnd   = Number(chart.timeScale().timeToCoordinate(bars[exitIdx].time as any));
      if (!Number.isFinite(xStart) || !Number.isFinite(xEnd)) continue;
      const { entry, sl, be, tp } = signalLevels(sig.bar, sig.direction);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yEntry = Number(series.priceToCoordinate(entry as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ySL    = Number(series.priceToCoordinate(sl as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yBE    = Number(series.priceToCoordinate(be as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yTP    = Number(series.priceToCoordinate(tp as any));
      if ([yEntry, ySL, yBE, yTP].some(v => !Number.isFinite(v))) continue;
      bgs.push({ xStart, xEnd, yEntry, ySL, yBE, yTP });
    }
    setTradeBgRects(bgs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSignals, activeSignals, activeTradeBg, resolvedSignals, bars]);

  useEffect(() => { syncSignalTrianglesRef.current = syncSignalTriangles; }, [syncSignalTriangles]);
  useEffect(() => { syncSignalTriangles(); }, [syncSignalTriangles]);

  // ─── Build / update LWC chart ─────────────────────────────────────────────

  useEffect(() => {
    if (!bars.length) return;
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.VerticalGradient, topColor: "#17171b", bottomColor: "#0b0b0e" },
        textColor: "rgba(200, 200, 200, 0.85)",
        fontFamily: FONT,
        fontSize: 11,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(180,180,180,0.45)", width: 1, style: LineStyle.LargeDashed, labelVisible: true, labelBackgroundColor: "#2a2d35" },
        horzLine: { color: "rgba(180,180,180,0.45)", width: 1, style: LineStyle.LargeDashed, labelVisible: true, labelBackgroundColor: "#2a2d35" },
      },
      rightPriceScale: { visible: true, borderVisible: false, autoScale: true, scaleMargins: { top: 0.08, bottom: 0.06 } },
      leftPriceScale: { visible: false },
      timeScale: {
        visible: true, borderVisible: false, timeVisible: true, secondsVisible: false,
        minimumHeight: TIME_AXIS_H, fixLeftEdge: false, fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false, rightOffset: 5,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      kineticScroll: { mouse: false, touch: false },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    seriesRef.current = series;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series.setData([...bars, ...futureBars] as any);

    chart.timeScale().setVisibleLogicalRange({
      from: bars.length - VISIBLE_BARS,
      to:   bars.length + 4,
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      requestAnimationFrame(syncOverlay);
      requestAnimationFrame(() => syncSignalTrianglesRef.current());
    });
    chart.subscribeCrosshairMove(() => requestAnimationFrame(syncOverlay));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chart as any).priceScale("right").subscribeVisiblePriceRangeChange?.(() =>
      requestAnimationFrame(() => syncSignalTrianglesRef.current())
    );

    syncOverlay();
    const timer = setInterval(syncOverlay, 1_000);

    const onPtrMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const isPlot = e.clientX - rect.left < rect.width - getPriceAxisWidth(chart) && e.clientY - rect.top < rect.height - TIME_AXIS_H;
      container.style.cursor = isPlot ? "crosshair" : "";
    };
    const onPtrLeave = () => { container.style.cursor = ""; };
    container.addEventListener("pointermove", onPtrMove);
    container.addEventListener("pointerleave", onPtrLeave);

    const clearCross = () => { try { chart.clearCrosshairPosition(); } catch { /* ignore */ } };
    container.addEventListener("mouseleave", clearCross);
    container.addEventListener("touchend",   clearCross);

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(syncOverlay);
      requestAnimationFrame(() => syncSignalTrianglesRef.current());
    });
    ro.observe(container);

    return () => {
      clearInterval(timer);
      ro.disconnect();
      container.removeEventListener("pointermove", onPtrMove);
      container.removeEventListener("pointerleave", onPtrLeave);
      container.removeEventListener("mouseleave", clearCross);
      container.removeEventListener("touchend",   clearCross);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  // bars / futureBars only change once (on data load) — deliberate dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars.length, futureBars.length, syncOverlay]);

  const toggleTradeBg = useCallback((name: string) => {
    setActiveTradeBg(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      activeTradeBgRef.current = next;
      return next;
    });
  }, []);

  const toggleSignal = (name: string) =>
    setActiveSignals(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", background: "#0e0e12", overflow: "hidden" }}>

      {/* LWC canvas */}
      <div ref={containerRef} className="monitoring-chart-shell" style={{ position: "absolute", inset: 0 }} />

      {/* Loading / empty state */}
      {dataStatus === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 2 }}>
          <span style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Lade OHLCV…</span>
        </div>
      )}
      {dataStatus === "empty" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 2 }}>
          <span style={{ fontFamily: FONT, fontSize: 12, color: "rgba(255,100,100,0.5)" }}>Keine Daten — TV-Cache prüfen</span>
        </div>
      )}

      {/* Live price guide line */}
      {priceLine && (
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5, overflow: "visible" }}>
          <line data-price-guide="1" x1={priceLine.x1} y1={priceLine.y} x2={priceLine.x2} y2={priceLine.y}
            stroke={priceLine.stroke} strokeOpacity={0.92} strokeWidth={1} strokeDasharray="3 3" shapeRendering="geometricPrecision" pointerEvents="none" />
        </svg>
      )}

      {/* Trade background fills */}
      {tradeBgRects.map((b, i) => {
        const w = b.xEnd - b.xStart;
        const slZoneY = Math.min(b.yEntry, b.ySL); const slZoneH = Math.abs(b.ySL - b.yEntry);
        const tpZoneY = Math.min(b.yEntry, b.yTP); const tpZoneH = Math.abs(b.yTP - b.yEntry);
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
          <svg key={t.name} onClick={() => toggleTradeBg(t.name)}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 7, overflow: "visible", cursor: "pointer" }}>
            <polygon points={points} fill={t.color} opacity={isActive ? 1 : 0.92}
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              stroke={isActive ? "rgba(255,255,255,0.5)" : "none"} strokeWidth={isActive ? 1 : 0} />
          </svg>
        );
      })}

      {/* Signal level triangles */}
      {signalLevelMarkers.map((l, i) => {
        const H = 5; const W = 10;
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
          <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="rgba(160,160,170,0.55)" strokeWidth={1} strokeDasharray="3 4" shapeRendering="geometricPrecision" />
        </svg>
      ))}

      {/* Live price axis label */}
      {priceLabel && (
        <div
          className="monitoring-price-axis-label"
          data-tone={priceLabel.tone}
          style={{
            position: "absolute", left: priceLabel.left, top: priceLabel.top, width: priceLabel.width,
            transform: "translateY(-50%)", zIndex: 6, pointerEvents: "none",
            display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center",
            gap: 1, minHeight: 20, padding: "1px 5px", boxSizing: "border-box", borderRadius: 3,
            background: priceLabel.backgroundColor,
            border: `1px solid ${priceAxisLabelBorderColor(priceLabel.tone)}`,
            lineHeight: 1, fontFamily: MONITORING_FONT, fontSize: 10,
            boxShadow: `0 0 0 1px ${priceAxisLabelShadowColor(priceLabel.tone)}, 0 2px 8px rgba(0,0,0,0.38)`,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT_NUNITO, color: PRICE_AXIS_TEXT_COLOR, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
            {priceLabel.priceText}
          </span>
          {priceLabel.countdownText && (
            <span style={{ fontSize: 10, fontWeight: 400, color: "#9CA3AF", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {priceLabel.countdownText}
            </span>
          )}
        </div>
      )}

      {/* Live badge — bottom-right, shows data source */}
      <div style={{
        position: "absolute", bottom: TIME_AXIS_H + 8, right: 10, zIndex: 10, pointerEvents: "none",
        fontFamily: FONT, fontSize: 10, color: liveQuote ? "rgba(34,197,94,0.7)" : "rgba(255,255,255,0.2)",
        letterSpacing: "0.06em",
      }}>
        {liveQuote ? "● SUPABASE ~15min" : "○ TV Cache"}
      </div>

      {/* Blur behind header */}
      {headerSize && (
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0,
          width: 12 + headerSize.w + 20, height: 12 + headerSize.h + 16,
          zIndex: 9, pointerEvents: "none",
          backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)",
          maskImage: "linear-gradient(135deg, black 50%, transparent 88%)",
          WebkitMaskImage: "linear-gradient(135deg, black 50%, transparent 88%)",
        }} />
      )}

      {/* Header: 6E1! · 30M */}
      <div ref={headerRef} style={{ position: "absolute", top: 12, left: 12, zIndex: 10, pointerEvents: "auto", userSelect: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/asset-icons/eur.png" alt="" style={{ width: 34, height: 34, objectFit: "contain", flexShrink: 0, borderRadius: "50%" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5, fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "#F5F5F5", lineHeight: 1.15, whiteSpace: "nowrap" }}>
              <span>6E1!</span>
              <span style={{ color: "#ffffff", fontWeight: 700 }}>·</span>
              <span style={{ fontFamily: FONT_NUNITO, fontWeight: 700 }}>30M</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: FONT, fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", lineHeight: 1.2, whiteSpace: "nowrap" }}>
                <span>EUR/USD Futures</span>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
                <span>CME</span>
              </div>
              {/* Eye toggle for signals */}
              {resolvedSignals.length > 0 && (
                <button type="button" onClick={() => setShowSignals(v => !v)}
                  title={showSignals ? "Signale ausblenden" : "Signale einblenden"}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, border: "none", background: "none", cursor: "pointer", padding: 0, color: showSignals ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)", transition: "color 150ms ease", flexShrink: 0 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.85)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = showSignals ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)"; }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    {showSignals ? (
                      <><path d="M8 3C4.5 3 1.5 8 1.5 8s3 5 6.5 5 6.5-5 6.5-5-3-5-6.5-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/></>
                    ) : (
                      <><path d="M2 2l12 12M6.5 6.7A2 2 0 0010.3 10M4.2 4.5C2.8 5.6 1.5 8 1.5 8s3 5 6.5 5c1.4 0 2.7-.5 3.8-1.3M7 3.1C7.3 3 7.7 3 8 3c3.5 0 6.5 5 6.5 5s-.7 1.3-1.9 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></>
                    )}
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Signal chips */}
        {showSignals && resolvedSignals.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {resolvedSignals.map(sig => {
              const active = activeSignals.has(sig.name);
              return (
                <button key={sig.name} type="button" onClick={() => toggleSignal(sig.name)}
                  style={{ display: "block", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 500, color: active ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.22)", transition: "color 140ms ease", whiteSpace: "nowrap", textAlign: "left", lineHeight: 1.4, userSelect: "none" }}>
                  {sig.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
