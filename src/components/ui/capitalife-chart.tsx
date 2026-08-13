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
  PRICE_AXIS_TEXT_COLOR,
  priceAxisBackgroundColor,
  priceAxisGuideStrokeColor,
  priceAxisLabelBorderColor,
  priceAxisLabelShadowColor,
  type CandleCloseTone,
} from "@/lib/monitoring/candleCloseCountdown";
import type { MonitoringChartData } from "@/components/monitoring/MonitoringChart";

// ── Constants ──────────────────────────────────────────────────────────────────
const GOLD = "#C9A84C";
const FONT = "var(--font-montserrat, 'Montserrat', sans-serif)";
const FONT_NUNITO = "var(--font-nunito, 'Nunito', sans-serif)";
const MONITORING_FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
const TIME_AXIS_H = 32;

const RANGE_OPTS = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "All"] as const;
type RangeOpt = typeof RANGE_OPTS[number];
const RANGE_DAYS: Record<RangeOpt, number> = {
  "1M": 25, "3M": 65, "6M": 130, "1Y": 252, "3Y": 756, "5Y": 1260, "All": 0,
};
const KPI_BG_RANGE = "linear-gradient(to bottom, #26262d, #111114)";
const RANGE_PILL_CSS = `
  .cap-rng-pill { border-radius: 999px; cursor: pointer; transition: background 160ms ease, border-color 160ms ease;
    outline: none; display: flex; align-items: center; border: 1.5px solid transparent; }
  .cap-rng-pill:focus-visible { outline: 2px solid rgba(180,200,220,0.45); outline-offset: 2px; }
  .cap-rng-active   { background: ${KPI_BG_RANGE} !important; border-color: rgba(255,255,255,0.28) !important; }
  .cap-rng-active:hover   { border-color: rgba(255,255,255,0.42) !important; }
  .cap-rng-inactive { background: rgba(10,12,18,0.72) !important; border-color: transparent !important; }
  .cap-rng-inactive:hover { background: ${KPI_BG_RANGE} !important; border-color: rgba(255,255,255,0.18) !important; }
`;

type PriceLine = { x1: number; x2: number; y: number; stroke: string };
type PriceLabel = {
  top: number;
  left: number;
  width: number;
  priceText: string;
  countdownText: string | null;
  tone: CandleCloseTone;
  backgroundColor: string;
};

function getPriceAxisWidth(chart: ReturnType<typeof createChart>): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (chart as any).priceScale("right").width() as number;
    return w > 10 ? w : 65;
  } catch {
    return 65;
  }
}

// ── Public API exposed via onChartReady ────────────────────────────────────────
export type CapalifeChartBar = { time: number | string; open: number; high: number; low: number; close: number };

export type CapalifeChartApi = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chart: ReturnType<typeof createChart>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  series: any;
  container: HTMLDivElement;
  /**
   * Call this after pushing external bars via series.setData() so the
   * price guide line / label overlay picks up the correct last close.
   */
  setOverlayBars: (bars: CapalifeChartBar[]) => void;
};

// ── Props ──────────────────────────────────────────────────────────────────────
export type CapalifeChartProps = {
  data: MonitoringChartData | null;
  /** Overrides data.displaySymbol for the header symbol label */
  symbol?: string;
  /** Overrides data.displayName for the header instrument label */
  instrument?: string;
  /** Overrides data.timeframe for the header timeframe label */
  timeframe?: string;
  /** When true renders the empty state (no data cell) */
  isEmpty?: boolean;
  /** Optional asset icon URL for the header */
  iconUrl?: string;
  /** Set false to hide the built-in header (symbol/instrument/timeframe row) */
  showHeader?: boolean;
  /** Set false to hide the built-in live price guide line + label overlay */
  showPriceOverlay?: boolean;
  /** Set false to hide the built-in time range selector bar */
  showRangeBar?: boolean;
  /** Set false to hide the built-in auto-fit / reset button */
  showResetButton?: boolean;
  /**
   * When provided, overrides the built-in resetView logic.
   * Use this when the chart's data was set externally via onChartReady
   * so the internal candles.current ref would be empty.
   */
  onResetView?: () => void;
  /**
   * Called once after the LWC chart + candlestick series are created.
   * Use this to attach additional subscriptions or set custom data.
   */
  onChartReady?: (api: CapalifeChartApi) => void;
  /**
   * Children rendered inside the chart wrapper (position: relative, overflow: hidden).
   * Use absolute positioning for overlay elements.
   */
  children?: React.ReactNode;
};

// ── Component ──────────────────────────────────────────────────────────────────
export function CapalifeChart({
  data,
  symbol,
  instrument,
  timeframe,
  isEmpty = false,
  iconUrl,
  showHeader = true,
  showPriceOverlay = true,
  showRangeBar = true,
  showResetButton = true,
  onResetView,
  onChartReady,
  children,
}: CapalifeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  const onChartReadyRef = useRef(onChartReady);
  useEffect(() => { onChartReadyRef.current = onChartReady; }, [onChartReady]);

  const [priceLine, setPriceLine] = useState<PriceLine | null>(null);
  const [priceLabel, setPriceLabel] = useState<PriceLabel | null>(null);
  const [headerSize, setHeaderSize] = useState<{ w: number; h: number } | null>(null);
  const [showResetBtnState, setShowResetBtn] = useState(false);
  const [showRangeBarState, setShowRangeBar] = useState(false);
  const [activeRange, setActiveRange] = useState<RangeOpt>("1M");

  // Resolved display values
  const displaySymbol = symbol ?? data?.displaySymbol ?? "-";
  const displayName = instrument ?? data?.displayName ?? "-";
  const displayTimeframe = timeframe ?? data?.timeframe ?? "D";
  const displayTimeframeRef = useRef(displayTimeframe);
  useEffect(() => { displayTimeframeRef.current = displayTimeframe; }, [displayTimeframe]);

  // Build candles from MonitoringChartData — stored in a ref so the chart useEffect
  // does not need to re-run when data changes (we call series.setData in a separate effect).
  const candles = useRef<Array<{ time: string; open: number; high: number; low: number; close: number }>>([]);
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!data?.bars) { candles.current = []; return; }
    const parsed: typeof candles.current = [];
    for (const bar of data.bars) {
      if (!bar.time || bar.open == null || bar.high == null || bar.low == null || bar.close == null) continue;
      const day = String(bar.time).slice(0, 10);
      if (!day || day.length < 10) continue;
      parsed.push({
        time: day,
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
      });
    }
    parsed.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    // Deduplicate: keep last bar per day (most recent data wins)
    const seen = new Map<string, typeof parsed[0]>();
    for (const bar of parsed) seen.set(bar.time, bar);
    candles.current = Array.from(seen.values());
  }, [data?.bars]);

  const applyRange = useCallback((range: RangeOpt) => {
    const chart = chartRef.current;
    if (!chart) return;
    setActiveRange(range);
    chart.priceScale("right").applyOptions({ autoScale: true });
    const totalBars = candles.current.length;
    const bars = RANGE_DAYS[range];
    const to = totalBars + 4;
    const from = bars === 0 ? 0 : Math.max(0, totalBars - bars);
    chart.timeScale().setVisibleLogicalRange({ from, to });
  }, []);

  const onResetViewRef = useRef(onResetView);
  useEffect(() => { onResetViewRef.current = onResetView; }, [onResetView]);

  const resetView = useCallback(() => {
    if (onResetViewRef.current) {
      onResetViewRef.current();
      return;
    }
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale("right").applyOptions({ autoScale: true });
    const totalBars = candles.current.length;
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, totalBars - 30),
      to: totalBars + 4,
    });
  }, []);

  // Header size for blur backdrop
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
  }, [showHeader]);

  const syncOverlay = useCallback(() => {
    if (!showPriceOverlay) return;
    const chart = chartRef.current;
    const series = seriesRef.current;
    const container = containerRef.current;
    if (!chart || !series || !container) return;
    const bars = candles.current;
    if (!bars.length) return;
    const lastBar = bars[bars.length - 1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceY = series.priceToCoordinate(lastBar.close) as any;
    if (priceY == null || !Number.isFinite(Number(priceY))) {
      setPriceLine(null);
      return;
    }
    const priceAxisW = getPriceAxisWidth(chart);
    const w = container.clientWidth;
    const x2 = w - priceAxisW;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastX = chart.timeScale().timeToCoordinate(lastBar.time as any) as any;
    const MIN_LINE_PX = 40;
    const rawStart =
      lastX != null && Number.isFinite(Number(lastX)) && Number(lastX) > 0 && Number(lastX) < x2
        ? Number(lastX)
        : null;
    const x1 = Math.max(
      0,
      rawStart != null ? Math.min(rawStart, x2 - MIN_LINE_PX) : x2 - MIN_LINE_PX,
    );
    const label = buildLivePriceAxisLabel({
      barTime: lastBar.time,
      open: lastBar.open,
      close: lastBar.close,
      timeframe: displayTimeframeRef.current,
    });
    const tone = label?.tone ?? candleCloseTone(lastBar.open, lastBar.close);
    setPriceLine({
      x1,
      x2,
      y: Number(priceY),
      stroke: priceAxisGuideStrokeColor(tone),
    });
    setPriceLabel({
      top: Number(priceY),
      left: x2,
      width: priceAxisW,
      priceText: label?.priceText ?? formatAxisPrice(lastBar.close),
      countdownText: label?.countdownText ?? "--:--",
      tone,
      backgroundColor: label?.backgroundColor ?? priceAxisBackgroundColor(tone),
    });
  }, [showPriceOverlay]);

  // Chart initialisation — runs once on mount
  useEffect(() => {
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
      rightPriceScale: { visible: true, borderVisible: false, autoScale: true, scaleMargins: { top: 0.05, bottom: 0.05 } },
      leftPriceScale: { visible: false },
      timeScale: {
        visible: true,
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        minimumHeight: TIME_AXIS_H,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
        rightOffset: 5,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      kineticScroll: { mouse: false, touch: false },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#ffffff",
      downColor: GOLD,
      borderUpColor: "#ffffff",
      borderDownColor: GOLD,
      wickUpColor: "#ffffff",
      wickDownColor: GOLD,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    seriesRef.current = series;

    // Set initial data from current candles
    const bars = candles.current;
    if (bars.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      series.setData(bars as any);
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, bars.length - 25),
        to: bars.length + 4,
      });
    }

    // Notify consumer — include setOverlayBars so external data pushers
    // can keep the price guide line / label in sync with their bars.
    onChartReadyRef.current?.({
      chart,
      series,
      container,
      setOverlayBars: (externalBars) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        candles.current = externalBars as any;
        requestAnimationFrame(syncOverlay);
      },
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      requestAnimationFrame(syncOverlay);
    });
    chart.subscribeCrosshairMove(() => requestAnimationFrame(syncOverlay));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chart as any).priceScale("right").subscribeVisiblePriceRangeChange?.(() =>
      requestAnimationFrame(syncOverlay),
    );

    syncOverlay();
    const timer = setInterval(syncOverlay, 1_000);

    const onPtrMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const isPlot = x < rect.width - getPriceAxisWidth(chart) && y < rect.height - TIME_AXIS_H;
      container.style.cursor = isPlot ? "crosshair" : "";
      setShowRangeBar(x < 340 && y > rect.height - TIME_AXIS_H - 64);
    };
    const onPtrLeave = () => { container.style.cursor = ""; setShowRangeBar(false); };
    container.addEventListener("pointermove", onPtrMove);
    container.addEventListener("pointerleave", onPtrLeave);

    const clearCross = () => { try { chart.clearCrosshairPosition(); } catch { /* ignore */ } };
    container.addEventListener("mouseleave", clearCross);
    container.addEventListener("touchend", clearCross);
    container.addEventListener("touchcancel", clearCross);

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(syncOverlay);
    });
    ro.observe(container);

    return () => {
      clearInterval(timer);
      ro.disconnect();
      container.removeEventListener("pointermove", onPtrMove);
      container.removeEventListener("pointerleave", onPtrLeave);
      container.removeEventListener("mouseleave", clearCross);
      container.removeEventListener("touchend", clearCross);
      container.removeEventListener("touchcancel", clearCross);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update series data when bars change — skipped on initial mount (chart creation
  // useEffect already seeds the data, and onChartReady may have overridden it with
  // custom data e.g. including future whitespace bars).
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const bars = candles.current;
    if (!bars.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series.setData(bars as any);
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, bars.length - 25),
      to: bars.length + 4,
    });
    requestAnimationFrame(syncOverlay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.bars]);

  if (isEmpty) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "rgba(180,192,210,0.6)", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", fontFamily: FONT }}>
        NO DATA
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        background: "#0e0e12",
        overflow: "hidden",
      }}
    >
      {/* LWC chart host */}
      <div
        ref={containerRef}
        className="monitoring-chart-shell"
        style={{ position: "absolute", inset: 0 }}
      />

      {/* Price guide line */}
      {showPriceOverlay && priceLine ? (
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 5,
            overflow: "visible",
          }}
        >
          <line
            data-price-guide="1"
            x1={priceLine.x1}
            y1={priceLine.y}
            x2={priceLine.x2}
            y2={priceLine.y}
            stroke={priceLine.stroke}
            strokeOpacity={0.92}
            strokeWidth={1}
            strokeDasharray="3 3"
            shapeRendering="geometricPrecision"
            pointerEvents="none"
          />
        </svg>
      ) : null}

      {/* Price/countdown label */}
      {showPriceOverlay && priceLabel ? (
        <div
          className="monitoring-price-axis-label"
          data-tone={priceLabel.tone}
          style={{
            position: "absolute",
            left: priceLabel.left,
            top: priceLabel.top,
            width: priceLabel.width,
            transform: "translateY(-50%)",
            zIndex: 6,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: 1,
            minHeight: 20,
            padding: "1px 5px",
            boxSizing: "border-box",
            borderRadius: 3,
            background: priceLabel.backgroundColor,
            border: `1px solid ${priceAxisLabelBorderColor(priceLabel.tone)}`,
            lineHeight: 1,
            fontFamily: MONITORING_FONT,
            fontSize: 10,
            boxShadow: `0 0 0 1px ${priceAxisLabelShadowColor(priceLabel.tone)}, 0 2px 8px rgba(0, 0, 0, 0.38)`,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: FONT_NUNITO,
              color: PRICE_AXIS_TEXT_COLOR,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              letterSpacing: "-0.01em",
            }}
          >
            {priceLabel.priceText}
          </span>
          {priceLabel.countdownText ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 400,
                color: priceLabel.tone === "bull" ? "#777" : priceLabel.tone === "bear" ? "#7a6010" : "#9CA3AF",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {priceLabel.countdownText}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Blur backdrop behind header */}
      {showHeader && headerSize && (
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

      {/* Header — symbol · timeframe + instrument name */}
      {showHeader ? (
        <div
          ref={headerRef}
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            zIndex: 10,
            pointerEvents: "none",
            userSelect: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={iconUrl}
                alt=""
                style={{ width: 34, height: 34, objectFit: "contain", flexShrink: 0 }}
              />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "#F5F5F5", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                <span>{displaySymbol}</span>
                <span style={{ color: "#ffffff", fontWeight: 700 }}>·</span>
                <span style={{ fontFamily: FONT_NUNITO, fontWeight: 700 }}>{displayTimeframe}</span>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", lineHeight: 1.2, whiteSpace: "nowrap" }}>
                {displayName}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Time range selector */}
      {showRangeBar ? (
        <>
          <style dangerouslySetInnerHTML={{ __html: RANGE_PILL_CSS }} />
          <div
            style={{
              position: "absolute",
              bottom: TIME_AXIS_H + 6,
              left: 12,
              display: "flex",
              flexWrap: "wrap",
              gap: 3,
              maxWidth: 330,
              opacity: showRangeBarState ? 1 : 0,
              transition: "opacity 180ms ease",
              pointerEvents: showRangeBarState ? "auto" : "none",
              zIndex: 20,
            }}
            onMouseEnter={() => setShowRangeBar(true)}
            onMouseLeave={() => setShowRangeBar(false)}
          >
            {RANGE_OPTS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => applyRange(r)}
                className={`cap-rng-pill ${activeRange === r ? "cap-rng-active" : "cap-rng-inactive"}`}
                style={{ padding: "4px 9px", fontFamily: FONT }}
              >
                <span style={{
                  fontSize: 10,
                  fontWeight: activeRange === r ? 600 : 400,
                  color: activeRange === r ? "#F3F3F4" : "#6a6e7a",
                  fontFamily: FONT,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}>
                  {r}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* Auto-fit / reset button */}
      {showResetButton ? (
        <div
          onMouseEnter={() => setShowResetBtn(true)}
          onMouseLeave={() => setShowResetBtn(false)}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: 90,
            height: 90,
            zIndex: 20,
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            title="Reset view"
            onClick={resetView}
            style={{
              position: "absolute",
              bottom: 6,
              right: 6,
              width: 22,
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 5,
              background: "rgba(20,21,26,0.82)",
              backdropFilter: "blur(6px)",
              cursor: "pointer",
              padding: 0,
              color: "rgba(200,205,215,0.75)",
              opacity: showResetBtnState ? 1 : 0,
              pointerEvents: showResetBtnState ? "auto" : "none",
              transition: "opacity 150ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#fff";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(40,42,52,0.95)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(200,205,215,0.75)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(20,21,26,0.82)";
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 4.5V1h3.5M11.5 4.5V1H8M1 8.5V12h3.5M11.5 8.5V12H8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* Consumer-provided overlay children (e.g. signal triangles) */}
      {children}
    </div>
  );
}
