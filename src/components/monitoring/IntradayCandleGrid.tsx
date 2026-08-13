"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CapalifeChart, type CapalifeChartApi, type CapalifeChartBar } from "@/components/ui/capitalife-chart";
import type { MonitoringChartData } from "@/components/monitoring/MonitoringChart";

const FONT = "var(--font-montserrat, 'Montserrat', sans-serif)";
const FONT_NUNITO = "var(--font-nunito, 'Nunito', sans-serif)";
const TIME_AXIS_H = 32;

// ---------------------------------------------------------------------------
// Config — 3 intraday slots
// ---------------------------------------------------------------------------
export type SlotConfig = {
  symbol: string;
  timeframe: string;
  displaySymbol: string;
  instrument: string;
  exchange: string;
  iconUrl: string;
  /** LWC price format — pass precision per instrument */
  pricePrecision: number;
  minMove: number;
  strategies: string[];
};

const SLOTS: SlotConfig[] = [
  {
    symbol: "FDAX1!",
    timeframe: "2H",
    displaySymbol: "FDAX1!",
    instrument: "DAX Futures",
    exchange: "EUREX",
    iconUrl: "/asset-icons/dax.png",
    pricePrecision: 0,
    minMove: 1,
    strategies: [],
  },
  {
    symbol: "FDAX1!",
    timeframe: "1H",
    displaySymbol: "FDAX1!",
    instrument: "DAX Futures",
    exchange: "EUREX",
    iconUrl: "/asset-icons/dax.png",
    pricePrecision: 0,
    minMove: 1,
    strategies: [],
  },
  {
    symbol: "6E1!",
    timeframe: "30M",
    displaySymbol: "6E1!",
    instrument: "Euro FX Futures",
    exchange: "CME",
    iconUrl: "/asset-icons/eur.png",
    pricePrecision: 4,
    minMove: 0.0001,
    strategies: [],
  },
];

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------
type OhlcBar = { time: string; open: number; high: number; low: number; close: number };
type OhlcResponse = { bars: OhlcBar[]; symbol: string; timeframe: string; count: number };

function toMonitoringChartData(slot: SlotConfig): MonitoringChartData {
  return {
    displaySymbol: slot.displaySymbol,
    displayName: slot.instrument,
    timeframe: slot.timeframe,
    bars: [],
    signals: [],
    boxes: [],
  };
}

function toUnixSeconds(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

const TF_SECONDS: Record<string, number> = {
  "30M": 30 * 60,
  "1H":  60 * 60,
  "2H":  2 * 60 * 60,
  "4H":  4 * 60 * 60,
  "1D":  24 * 60 * 60,
};

function buildFutureIntradayBars(
  lastUnix: number,
  timeframe: string,
  count = 10,
): { time: number }[] {
  const step = TF_SECONDS[timeframe] ?? 3600;
  const result: { time: number }[] = [];
  let t = lastUnix + step;
  while (result.length < count) {
    result.push({ time: t });
    t += step;
  }
  return result;
}

// ---------------------------------------------------------------------------
// StrategyChip — identical to ReferenceCandlestickChart
// ---------------------------------------------------------------------------
function StrategyChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
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
        fontFamily: FONT,
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

// ---------------------------------------------------------------------------
// IntraChartHeader — identical layout to ReferenceCandlestickChart's header
// ---------------------------------------------------------------------------
function IntraChartHeader({ slot }: { slot: SlotConfig }) {
  const [showStrategies, setShowStrategies] = useState(false);
  const [activeStrategies, setActiveStrategies] = useState<Set<string>>(
    new Set(slot.strategies),
  );
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerSize, setHeaderSize] = useState<{ w: number; h: number } | null>(null);

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

  const toggleStrategy = (name: string) =>
    setActiveStrategies((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <>
      {/* Blur backdrop behind header — identical to Reference */}
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

      {/* Header */}
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
            src={slot.iconUrl}
            alt=""
            style={{ width: 34, height: 34, objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 5,
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 700,
                color: "#F5F5F5",
                lineHeight: 1.15,
                whiteSpace: "nowrap",
              }}
            >
              <span>{slot.displaySymbol}</span>
              <span style={{ color: "#ffffff", fontWeight: 700 }}>·</span>
              <span style={{ fontFamily: FONT_NUNITO, fontWeight: 700 }}>
                {slot.timeframe}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 400,
                  color: "rgba(255,255,255,0.45)",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                }}
              >
                <span>{slot.instrument}</span>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
                <span>{slot.exchange}</span>
              </div>
              {/* Eye toggle */}
              <button
                type="button"
                onClick={() => setShowStrategies((v) => !v)}
                title={showStrategies ? "Strategien ausblenden" : "Strategien einblenden"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: showStrategies
                    ? "rgba(255,255,255,0.75)"
                    : "rgba(255,255,255,0.25)",
                  transition: "color 150ms ease",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "rgba(255,255,255,0.85)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = showStrategies
                    ? "rgba(255,255,255,0.75)"
                    : "rgba(255,255,255,0.25)";
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {showStrategies ? (
                    <>
                      <path
                        d="M8 3C4.5 3 1.5 8 1.5 8s3 5 6.5 5 6.5-5 6.5-5-3-5-6.5-5z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                    </>
                  ) : (
                    <>
                      <path
                        d="M2 2l12 12M6.5 6.7A2 2 0 0010.3 10M4.2 4.5C2.8 5.6 1.5 8 1.5 8s3 5 6.5 5c1.4 0 2.7-.5 3.8-1.3M7 3.1C7.3 3 7.7 3 8 3c3.5 0 6.5 5 6.5 5s-.7 1.3-1.9 2.5"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Strategy chips */}
        {showStrategies && slot.strategies.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {slot.strategies.map((name) => (
              <StrategyChip
                key={name}
                label={name}
                active={activeStrategies.has(name)}
                onToggle={() => toggleStrategy(name)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Single chart slot
// ---------------------------------------------------------------------------
function IntradayChartSlot({
  slot,
  onRegisterReset,
  refreshMs = 0,
}: {
  slot: SlotConfig;
  onRegisterReset?: (fn: () => void) => void;
  refreshMs?: number;
}) {
  const [bars, setBars] = useState<OhlcBar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chartApiRef = useRef<CapalifeChartApi | null>(null);
  const barsRef = useRef<OhlcBar[]>([]);
  const realBarCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const load = () => {
      const url = `/api/monitoring/ohlc?symbol=${encodeURIComponent(slot.symbol)}&timeframe=${encodeURIComponent(slot.timeframe)}&limit=500`;
      fetch(url, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<OhlcResponse>;
        })
        .then((d) => {
          if (cancelled) return;
          setError(null);
          setBars(d.bars ?? []);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(String(e instanceof Error ? e.message : e));
        });
    };
    load();
    if (refreshMs > 0) {
      timer = window.setInterval(load, refreshMs);
    }
    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, [refreshMs, slot.symbol, slot.timeframe]);

  const pushBarsToChart = useCallback(
    (api: CapalifeChartApi, rawBars: OhlcBar[], timeframe: string) => {
      if (!rawBars || rawBars.length === 0) return;

      // Deduplicate by unix second, keep last entry
      const map = new Map<number, { time: number; open: number; high: number; low: number; close: number }>();
      for (const b of rawBars) {
        const t = toUnixSeconds(b.time);
        if (!Number.isFinite(t) || t <= 0) continue;
        map.set(t, { time: t, open: b.open, high: b.high, low: b.low, close: b.close });
      }
      const lwcBars = Array.from(map.values()).sort((a, b) => a.time - b.time);
      if (lwcBars.length === 0) return;

      // Some Monitoring cards mount before their final grid dimensions settle.
      // Re-applying the same payload after the next layout ticks prevents the
      // visible "blank chart for several seconds" state on Anomaly/Intraday.
      const futureCount = timeframe === "1D" ? 3 : 10;
      const futureBars = buildFutureIntradayBars(lwcBars[lwcBars.length - 1].time, timeframe, futureCount);
      const fullSeries = [...lwcBars, ...futureBars];

      const applyData = () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          api.series.setData(fullSeries as any);
          api.setOverlayBars?.(lwcBars as CapalifeChartBar[]);
          const total = lwcBars.length;
          realBarCountRef.current = total;
          api.chart.priceScale("right").applyOptions({ autoScale: true });
          api.chart.timeScale().setVisibleLogicalRange({
            from: Math.max(0, total - 10),
            to: total + 5,
          });
        } catch {
          // The retry sequence below covers transient zero-size / early-mount states.
        }
      };

      applyData();
      requestAnimationFrame(applyData);
      window.setTimeout(applyData, 150);
      window.setTimeout(applyData, 600);
    },
    // realBarCountRef is a ref — stable, no dep needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!bars) return;
    barsRef.current = bars;
    const api = chartApiRef.current;
    if (api) pushBarsToChart(api, bars, slot.timeframe);
  }, [bars, pushBarsToChart]);

  const handleResetView = useCallback(() => {
    const api = chartApiRef.current;
    if (!api) return;
    api.chart.priceScale("right").applyOptions({ autoScale: true });
    const total = realBarCountRef.current;
    api.chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, total - 10),
      to: total + 5,
    });
  }, []);

  // Register this slot's reset function with the parent grid
  useEffect(() => {
    onRegisterReset?.(handleResetView);
  }, [handleResetView, onRegisterReset]);

  const onChartReady = useCallback(
    (api: CapalifeChartApi) => {
      chartApiRef.current = api;

      // Apply instrument-specific price format on the series
      api.series.applyOptions({
        priceFormat: {
          type: "price",
          precision: slot.pricePrecision,
          minMove: slot.minMove,
        },
      });

      // No future whitespace bars for intraday — crosshair still works
      // rightOffset={5} already set in timeScale options of CapalifeChart

      if (barsRef.current.length > 0) {
        pushBarsToChart(api, barsRef.current, slot.timeframe);
      }
    },
    [slot.pricePrecision, slot.minMove, pushBarsToChart],
  );

  if (error) {
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          background: "#0e0e12",
          color: "rgba(180,192,210,0.5)",
          fontSize: 11,
          fontFamily: FONT,
          letterSpacing: "0.04em",
          fontWeight: 700,
        }}
      >
        NO DATA
      </div>
    );
  }

  return (
    <CapalifeChart
      data={toMonitoringChartData(slot)}
      symbol={slot.displaySymbol}
      instrument={slot.instrument}
      timeframe={slot.timeframe}
      showHeader={false}
      showPriceOverlay={true}
      showRangeBar={false}
      showResetButton={true}
      onResetView={handleResetView}
      onChartReady={onChartReady}
    >
      <IntraChartHeader slot={slot} />
    </CapalifeChart>
  );
}

// ---------------------------------------------------------------------------
// Main export — 3-column grid + global reset-all button
// ---------------------------------------------------------------------------
export default function IntradayCandleGrid({
  slots,
  columns,
  refreshMs = 0,
}: {
  slots?: SlotConfig[];
  columns?: number;
  refreshMs?: number;
}) {
  const resolvedSlots = slots ?? SLOTS;
  const cols = columns ?? 3;

  const resetFnsRef = useRef<Array<() => void>>([]);
  const [showGlobalReset, setShowGlobalReset] = useState(false);

  const handleRegisterReset = useCallback((idx: number) => (fn: () => void) => {
    resetFnsRef.current[idx] = fn;
  }, []);

  const resetAll = useCallback(() => {
    for (const fn of resetFnsRef.current) fn?.();
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Global reset-all button — top-right of the grid, hover-reveal */}
      <div
        onMouseEnter={() => setShowGlobalReset(true)}
        onMouseLeave={() => setShowGlobalReset(false)}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 64,
          height: 64,
          zIndex: 30,
          pointerEvents: "auto",
        }}
      >
        <button
          type="button"
          title="Alle Charts zurücksetzen"
          onClick={resetAll}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 26,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 6,
            background: "rgba(20,21,26,0.88)",
            backdropFilter: "blur(6px)",
            cursor: "pointer",
            padding: 0,
            color: "rgba(200,205,215,0.8)",
            opacity: showGlobalReset ? 1 : 0,
            pointerEvents: showGlobalReset ? "auto" : "none",
            transition: "opacity 150ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(40,42,52,0.95)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(200,205,215,0.8)";
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(20,21,26,0.88)";
          }}
        >
          {/* "fit all charts" icon — 4 small chart bars */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="8" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.7" />
            <rect x="4.5" y="5" width="2" height="7" rx="0.5" fill="currentColor" opacity="0.85" />
            <rect x="8" y="3" width="2" height="9" rx="0.5" fill="currentColor" />
            <rect x="11.5" y="6" width="2" height="6" rx="0.5" fill="currentColor" opacity="0.7" />
            <line x1="1" y1="2" x2="13" y2="2" stroke="currentColor" strokeWidth="1" strokeOpacity="0.45" />
          </svg>
        </button>
      </div>

      {/* Chart grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 8,
          width: "100%",
          height: "100%",
        }}
      >
        {resolvedSlots.map((slot, idx) => (
          <IntradayChartSlot
            key={`${slot.symbol}_${slot.timeframe}_${idx}`}
            slot={slot}
            onRegisterReset={handleRegisterReset(idx)}
            refreshMs={refreshMs}
          />
        ))}
      </div>
    </div>
  );
}
