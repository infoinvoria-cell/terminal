"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type IRange,
  type Time,
  ColorType,
} from "lightweight-charts";
import MonitoringChart, { type MonitoringChartData } from "@/components/monitoring/MonitoringChart";
import { useCoreInvestData } from "./use-core-invest-data";
import type { OhlcBar, SleeveData, SignalMarker } from "./types";
import { CORE_INVEST_COLORS, getCoreInvestColor } from "@/lib/core-invest/coreInvestColors";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";

// ─── design tokens ────���───────────────────────────────────────────────────────
const CHART_BG   = "#0A0A0A";
const BORDER     = "rgba(255,255,255,0.08)";
const BORDER_ACT = "#1F2127";
const T_MUTED    = "#6B7280";
const T_DIM      = "#9CA3AF";
const T_BRIGHT   = "#E5E7EB";
const FONT_MONO  = "var(--font-montserrat,ui-monospace,monospace)";

// Icon paths verified against /public directory:
// /assets/invest/{spy,spmo,qqq,gld}.png   — invest-specific icons
// /asset-icons/{nasdaq,Kupfer,chf}.png/webp — monitoring icons
const ALLOC_ITEMS = [
  { id: "spmo",     label: "SPMO",       weight: 35,  icon: "/assets/invest/spmo.png"  },
  { id: "spy",      label: "SPY",        weight: 15,  icon: "/assets/invest/spy.png"   },
  { id: "qqq",      label: "QQQ",        weight: 15,  icon: "/assets/invest/qqq.png"   },
  { id: "gld",      label: "GLD",        weight: 10,  icon: "/assets/invest/gld.png"   },
  { id: "qqqPine1", label: "Pine 1",     weight: 7.5, icon: "/asset-icons/nasdaq.png"  },
  { id: "qqqPine2", label: "Pine 2 EMA", weight: 7.5, icon: "/asset-icons/nasdaq.png"  },
  { id: "copper",   label: "Copper/HG",  weight: 5,   icon: "/asset-icons/Kupfer.webp" },
  { id: "chf",      label: "CHF/6S",     weight: 5,   icon: "/asset-icons/chf.png"     },
];

// ─── asset icons — from /public/asset-icons/
const ASSET_ICON: Record<string, string> = {
  qqqPine1: "/asset-icons/nasdaq.png",
  qqqPine2: "/asset-icons/nasdaq.png",
  copper:   "/asset-icons/Kupfer.webp",
  chf:      "/asset-icons/chf.png",
};

// Strategy ID → card meta
const ASSET_LABEL: Record<string, { sym: string; name: string; desc: string }> = {
  qqqPine1: { sym: "QQQ",  name: "QQQ Pine 1",     desc: "Nasdaq Strategy" },
  qqqPine2: { sym: "QQQ",  name: "QQQ Pine 2 EMA", desc: "Valuation / EMA" },
  copper:   { sym: "HG1!", name: "Copper",         desc: "COMEX" },
  chf:      { sym: "6S1!", name: "CHF / Swiss Franc", desc: "CME" },
};

// weightId → sleeve config ID (used to match props)
const WEIGHT_TO_SLEEVE_ID: Record<string, string> = {
  qqqPine1: "QQQ_PINE_1",
  qqqPine2: "QQQ_PINE_2_EMA",
  copper:   "COPPER_HG",
  chf:      "CHF_6S",
};

// ─── types ───���────────────────────────────────────────────────────────────────
export type TradeRow = {
  direction: "long" | "short";
  entryTime: string;
  exitTime?: string | null;
  entry: number;
  exit?: number | null;
  sl?: number | null;
  tp?: number | null;
  exitReason?: string;
  isOpen?: boolean | null;
};

// ─── helpers ────���────────────────────────────────��────────────────────────────
function toBarRows(bars: OhlcBar[]) {
  return bars.map(b => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close }));
}

function buildTradesFromSignals(signals: SignalMarker[]): TradeRow[] {
  const out: TradeRow[] = [];
  let open: { date: string; price: number } | null = null;
  for (const s of signals) {
    if (s.type === "long" && !open) {
      open = { date: s.date, price: s.price };
    } else if ((s.type === "exit" || s.type === "stop" || s.type === "tp") && open) {
      out.push({ direction: "long", entryTime: open.date, exitTime: s.date, entry: open.price, exit: s.price,
        exitReason: s.type === "stop" ? "stop_loss" : s.type === "tp" ? "take_profit" : undefined });
      open = null;
    }
  }
  if (open) out.push({ direction: "long", entryTime: open.date, entry: open.price, isOpen: true });
  return out;
}

function buildEquityPct(bars: OhlcBar[], signals: SignalMarker[]): { date: string; value: number }[] {
  if (!bars.length) return [];
  const sigMap = new Map<string, string>();
  for (const s of signals) sigMap.set(s.date, s.type);
  let equity = 1, inLong = false, entryPrice: number | null = null;
  const curve: { date: string; value: number }[] = [];
  for (const b of bars) {
    const sig = sigMap.get(b.date);
    if (sig === "long" && !inLong) { entryPrice = b.close; inLong = true; }
    if (sig === "exit" && inLong && entryPrice) { equity *= b.close / entryPrice; entryPrice = null; inLong = false; }
    curve.push({ date: b.date, value: +((equity - 1) * 100).toFixed(2) });
  }
  return curve;
}

function buildBuyholdPct(bars: OhlcBar[]): { date: string; value: number }[] {
  if (!bars.length) return [];
  const base = bars[0]!.close;
  return bars.map(b => ({ date: b.date, value: +((b.close / base - 1) * 100).toFixed(2) }));
}

function toUtcTs(dateStr: string): UTCTimestamp {
  return (Date.parse(`${dateStr.slice(0, 10)}T00:00:00Z`) / 1000) as UTCTimestamp;
}

type Pt = { date: string; value: number };

function resampleWeekly(pts: Pt[]): Pt[] {
  const byWeek = new Map<string, Pt>();
  for (const p of pts) {
    const d = new Date(p.date + "T00:00:00Z");
    const thu = new Date(d); thu.setUTCDate(d.getUTCDate() + (4 - (d.getUTCDay() || 7)));
    const key = `${thu.getUTCFullYear()}-W${String(Math.ceil((((thu.getTime() - new Date(thu.getUTCFullYear(), 0, 1).getTime()) / 864e5) + 1) / 7)).padStart(2, "0")}`;
    byWeek.set(key, p);
  }
  return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function resampleMonthly(pts: Pt[]): Pt[] {
  const byMonth = new Map<string, Pt>();
  for (const p of pts) byMonth.set(p.date.slice(0, 7), p);
  return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Correct compound rebase: all values are cumulative % returns from an original base.
// To rebase to fromDate: new_pct(t) = (1+v_t/100)/(1+v_from/100) - 1, * 100.
// Simple subtraction (v_t - v_from) is wrong for cumulative returns.
function rebaseFrom(pts: Pt[], fromDate: string): Pt[] {
  const ref = pts.find(p => p.date >= fromDate);
  if (!ref) return pts;
  const baseFactor = 1 + ref.value / 100;
  return pts.map(p => ({
    date: p.date,
    value: +((( 1 + p.value / 100) / baseFactor - 1) * 100).toFixed(2),
  }));
}

// ─── candle card ──────────────────────────────────────────────────────────────
type CandleCardProps = {
  weightId: string;
  sleeve: SleeveData;
  strategyTrades?: TradeRow[];
  showEmas?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
};

function CandleCard({ weightId, sleeve, strategyTrades, showEmas, isSelected, onClick }: CandleCardProps) {
  const trades = useMemo(() => {
    if (strategyTrades && strategyTrades.length > 0) return strategyTrades;
    return buildTradesFromSignals(sleeve.signals);
  }, [sleeve.signals, strategyTrades]);

  const lbl = ASSET_LABEL[weightId];
  const data: MonitoringChartData = useMemo(() => ({
    displaySymbol: lbl?.sym ?? weightId,
    displayName:   lbl?.name ?? weightId,
    tvSymbol:      lbl?.sym ?? weightId,
    bars:          toBarRows(sleeve.bars),
    signals:       [],
    trades,
    boxes:         [],
    variant:       "compact",
    timeframe:     "D",
  }), [sleeve.bars, lbl, weightId, trades]);

  const trendEmas = useMemo(() => showEmas ? [
    { key: "emaFast", len: 20, color: "rgba(251,191,36,0.65)" },
    { key: "emaSlow", len: 50, color: "rgba(168,85,247,0.55)" },
  ] : undefined, [showEmas]);

  const color   = getCoreInvestColor(weightId);
  const iconSrc = getMonitoringAssetIconUrl({
    code: lbl?.sym ?? weightId,
    displaySymbol: lbl?.sym ?? weightId,
    name: lbl?.name ?? weightId,
    assetId: weightId,
  }) ?? ASSET_ICON[weightId];
  const weight  = ALLOC_ITEMS.find(a => a.id === weightId)?.weight;
  const isLong  = sleeve.currentSignal === "long";

  return (
    <div
      onClick={onClick}
      style={{
        background:   CHART_BG,
        border:       `1px solid ${isSelected ? "rgba(214,219,228,0.18)" : BORDER}`,
        borderRadius: 8,
        overflow:     "hidden",
        position:     "relative",
        height:       "100%",
        cursor:       onClick ? "pointer" : undefined,
        boxShadow:    isSelected ? "0 0 0 1px rgba(214,219,228,0.08)" : undefined,
      }}
      data-invest-card={weightId}
    >
      {sleeve.status === "missing_ohlc" ? (
        <div style={{ height: "100%", display: "grid", placeItems: "center", color: T_MUTED, fontSize: 12 }}>
          {lbl?.sym} OHLC fehlt
        </div>
      ) : (
        <MonitoringChart data={data} maxBars={500} trendEmas={trendEmas} />
      )}

      <div
        className="assetOverlay monitoring-card-label"
        data-invest-header={weightId}
        style={{ top: 10, left: 10, paddingRight: 10, zIndex: 6 }}
      >
        <div
          className="monitoring-card-label-head"
          style={{
            minHeight: 44,
            padding: "6px 10px 6px 8px",
            gap: 8,
            background: "linear-gradient(180deg, rgba(8,8,10,0.92) 0%, rgba(8,8,10,0.78) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
          }}
        >
          {iconSrc ? (
            <img
              src={iconSrc}
              alt=""
              className="monitoring-card-asset-icon"
              width={32}
              height={32}
              style={{
                width: 32,
                height: 32,
                borderRadius: 7,
                objectFit: "cover",
                flexShrink: 0,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
              }}
            />
          ) : null}
          <div className="monitoring-card-label-text" style={{ gap: 2 }}>
            <div className="assetTopLine">
              <span className="assetSymbol monitoring-card-symbol" style={{ fontSize: 12, fontWeight: 800, color: T_BRIGHT, letterSpacing: "0.04em", lineHeight: 1.05, fontFamily: FONT_MONO }}>
                {lbl?.sym}
              </span>
            </div>
            <div className="assetDesc monitoring-card-desc" style={{ fontSize: 11, lineHeight: 1.1, color: "#e8ebf0", fontWeight: 600 }}>
              {lbl?.name}
            </div>
            <div className="assetDesc monitoring-card-desc" style={{ fontSize: 9, lineHeight: 1.1, color: T_MUTED }}>
              {lbl?.desc}
            </div>
          </div>
        </div>
      </div>

      {/* top-right: weight badge */}
      {weight != null && (
        <div style={{ position: "absolute", top: 8, right: 8, pointerEvents: "none" }}>
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: T_DIM, border: "1px solid rgba(255,255,255,0.10)" }}>{weight}%</span>
        </div>
      )}

      {/* bottom-right: signal badge */}
      <div style={{ position: "absolute", bottom: 8, right: 8, pointerEvents: "none", display: "flex", alignItems: "center", gap: 5, background: "rgba(4,4,6,0.68)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: "3px 8px" }}>
        <span style={{ fontSize: 11, lineHeight: 1, color: isLong ? "#4ADE80" : "#9CA3AF" }}>{isLong ? "▲" : "△"}</span>
        <span style={{ fontSize: 9, color: isLong ? "#E5E7EB" : T_DIM, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 700 }}>{isLong ? "Long" : "Cash"}</span>
      </div>
    </div>
  );
}

// ─── portfolio helpers ────────────────────────────────────────────────────────
// Compute a weighted portfolio from cumulative-%-return series.
// Converts each series to a price index (base=100), computes weighted average
// price index, then converts back to cumulative % return.
// This avoids the linear-averaging bug (e.g. 50%+100% ≠ 75% for a portfolio).
function computeWeightedPortfolio(
  components: { pts: Pt[]; weight: number }[]
): Pt[] {
  const available = components.filter(c => c.pts.length > 0);
  if (!available.length) return [];
  const totalW = available.reduce((s, c) => s + c.weight, 0);
  const allDates = [...new Set(available.flatMap(c => c.pts.map(p => p.date)))].sort();
  // Use last-known price index for step-forward interpolation
  const lastIdx = available.map(() => 100); // each series starts at price index 100
  // Build lookup maps for O(1) access
  const maps = available.map(c => new Map(c.pts.map(p => [p.date, p.value])));
  // Record initial portfolio price index (at first date of each series)
  let portBase: number | null = null;
  const portIdxSeries: { date: string; idx: number }[] = [];
  for (const date of allDates) {
    let wIdx = 0;
    available.forEach((c, i) => {
      const val = maps[i]!.get(date);
      if (val !== undefined) lastIdx[i] = 100 * (1 + val / 100);
      wIdx += (c.weight / totalW) * lastIdx[i];
    });
    portIdxSeries.push({ date, idx: wIdx });
    if (portBase === null) portBase = wIdx;
  }
  if (portBase === null || portBase === 0) return [];
  return portIdxSeries.map(({ date, idx }) => ({
    date,
    value: +((idx / portBase! - 1) * 100).toFixed(2),
  }));
}

// ─── performance tile ────────────────────────────────────────────────────────
type SeriesKey = "portfolio" | "spy" | "qqq" | "gld" | "qqqPine1" | "qqqPine2" | "copper" | "chf";
type TF = "D" | "W" | "M" | "ALL";
type Anchor = "fixed" | "visible";

const PERF_SERIES: Array<{ key: SeriesKey; label: string; defaultOn: boolean }> = [
  { key: "portfolio", label: "Portfolio", defaultOn: true  },
  { key: "spy",       label: "SPY",       defaultOn: true  },
  { key: "qqq",       label: "QQQ",       defaultOn: false },
  { key: "gld",       label: "GLD",       defaultOn: false },
  { key: "qqqPine1",  label: "Pine 1",    defaultOn: false },
  { key: "qqqPine2",  label: "Pine 2",    defaultOn: false },
  { key: "copper",    label: "Copper",    defaultOn: false },
  { key: "chf",       label: "CHF/6S",    defaultOn: false },
];
type PerfSeriesData = Record<SeriesKey, Pt[]>;

type PerfTileProps = {
  benchmarkCurve: Pt[];
  qqqCurve: Pt[];
  sleeves: SleeveData[];
  gldBars: OhlcBar[];
};

function InteractivePerformanceTile({ benchmarkCurve, qqqCurve, sleeves, gldBars }: PerfTileProps) {
  const chartRef  = useRef<HTMLDivElement>(null);
  const chartApi  = useRef<IChartApi | null>(null);
  const seriesApi = useRef<Partial<Record<string, ISeriesApi<"Line">>>>({});
  // Track whether the chart has been initially fitted so we don't fitContent on every pan
  const initialFitDone = useRef(false);

  // Persist benchmark state to localStorage
  function loadBenchmarkState() {
    try {
      const raw = typeof window !== "undefined" && window.localStorage.getItem("invest_benchmark_state_v1");
      if (!raw) return null;
      return JSON.parse(raw) as { tf?: TF; anchor?: Anchor; visible?: Partial<Record<SeriesKey, boolean>> };
    } catch { return null; }
  }
  const savedState = loadBenchmarkState();
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>(() => {
    const defaults = Object.fromEntries(PERF_SERIES.map(s => [s.key, s.defaultOn])) as Record<SeriesKey, boolean>;
    if (savedState?.visible) return { ...defaults, ...savedState.visible };
    return defaults;
  });
  const [tf,     setTf]     = useState<TF>((savedState?.tf ?? "ALL") as TF);
  const [anchor, setAnchor] = useState<Anchor>((savedState?.anchor ?? "fixed") as Anchor);
  useEffect(() => {
    try { window.localStorage.setItem("invest_benchmark_state_v1", JSON.stringify({ tf, anchor, visible })); } catch { /* ignore */ }
  }, [tf, anchor, visible]);
  // visibleStart stored in a ref for the subscriber (avoids closure stale) and in state for rebase
  const visibleStartRef = useRef<string | null>(null);
  const [visibleStart, setVisibleStart] = useState<string | null>(null);
  // Debounce timer for visibleStart updates — prevents setState on every drag frame
  const visibleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawData: PerfSeriesData = useMemo(() => {
    const pine1  = sleeves.find(s => s.config.id === "QQQ_PINE_1");
    const pine2  = sleeves.find(s => s.config.id === "QQQ_PINE_2_EMA");
    const copper = sleeves.find(s => s.config.id === "COPPER_HG");
    const chf    = sleeves.find(s => s.config.id === "CHF_6S");
    const gld    = buildBuyholdPct(gldBars);
    const spyCurve = benchmarkCurve;
    const qqqCurveData = qqqCurve;
    const pine1Curve  = pine1?.equityCurve  ?? (pine1  ? buildEquityPct(pine1.bars,  pine1.signals)  : []);
    const pine2Curve  = pine2?.equityCurve  ?? (pine2  ? buildEquityPct(pine2.bars,  pine2.signals)  : []);
    const copperCurve = copper?.equityCurve ?? (copper ? buildEquityPct(copper.bars, copper.signals) : []);
    const chfCurve    = chf?.equityCurve    ?? (chf    ? buildEquityPct(chf.bars,    chf.signals)    : []);
    // Portfolio = weighted mix of available series (SPMO 35% excluded — data unavailable)
    const portfolio = computeWeightedPortfolio([
      { pts: spyCurve,     weight: 15   },
      { pts: qqqCurveData, weight: 15   },
      { pts: gld,          weight: 10   },
      { pts: pine1Curve,   weight: 7.5  },
      { pts: pine2Curve,   weight: 7.5  },
      { pts: copperCurve,  weight: 5    },
      { pts: chfCurve,     weight: 5    },
    ]);
    return {
      portfolio,
      spy:      spyCurve,
      qqq:      qqqCurveData,
      gld,
      qqqPine1: pine1Curve,
      qqqPine2: pine2Curve,
      copper:   copperCurve,
      chf:      chfCurve,
    };
  }, [benchmarkCurve, qqqCurve, sleeves, gldBars]);

  const sampledData: PerfSeriesData = useMemo(() => {
    const resample = (pts: Pt[]) =>
      tf === "W" ? resampleWeekly(pts) :
      tf === "M" ? resampleMonthly(pts) : pts;
    return Object.fromEntries(
      (Object.entries(rawData) as [SeriesKey, Pt[]][]).map(([k, v]) => [k, resample(v)])
    ) as PerfSeriesData;
  }, [rawData, tf]);

  const anchoredData: PerfSeriesData = useMemo(() => {
    const fromDate = anchor === "visible" && visibleStart ? visibleStart : "2000-01-01";
    return Object.fromEntries(
      (Object.entries(sampledData) as [SeriesKey, Pt[]][]).map(([k, v]) => [k, rebaseFrom(v, fromDate)])
    ) as PerfSeriesData;
  }, [sampledData, anchor, visibleStart]);

  // Chart init — runs once
  useEffect(() => {
    const host = chartRef.current;
    if (!host) return;
    const chart = createChart(host, {
      width:  Math.max(80, host.clientWidth),
      height: Math.max(56, host.clientHeight),
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: T_MUTED,
        fontSize: 10,
        attributionLogo: false,
      },
      localization: {
        priceFormatter: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
      },
      // No background grid
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderColor: BORDER_ACT },
      timeScale: { borderColor: BORDER_ACT, timeVisible: false },
      crosshair: { mode: 1 },
    });
    chartApi.current = chart;
    initialFitDone.current = false;

    const ro = new ResizeObserver(() =>
      chart.applyOptions({ width: host.clientWidth, height: host.clientHeight })
    );
    ro.observe(host);

    return () => {
      ro.disconnect();
      chart.remove();
      chartApi.current = null;
      seriesApi.current = {};
      initialFitDone.current = false;
      if (visibleDebounceRef.current) clearTimeout(visibleDebounceRef.current);
    };
  }, []);

  // Subscribe to time-range changes — debounced to prevent setState on every drag frame
  useEffect(() => {
    const chart = chartApi.current;
    if (!chart) return;
    const sub = (range: IRange<Time> | null) => {
      if (!range) return;
      const ts = typeof range.from === "number" ? range.from * 1000 : null;
      if (ts == null) return;
      const d = new Date(ts);
      const ds = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      visibleStartRef.current = ds;
      // Only update React state when "View" anchor is active, and debounce to 150ms
      if (anchor !== "visible") return;
      if (visibleDebounceRef.current) clearTimeout(visibleDebounceRef.current);
      visibleDebounceRef.current = setTimeout(() => setVisibleStart(ds), 150);
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(sub);
    return () => { chart.timeScale().unsubscribeVisibleTimeRangeChange(sub); };
  }, [anchor]); // re-subscribe when anchor changes so the guard is current

  // Sync series data + visibility
  useEffect(() => {
    const chart = chartApi.current;
    if (!chart) return;
    for (const { key } of PERF_SERIES) {
      const pts = anchoredData[key];
      const on  = visible[key] && pts.length > 0;
      let api = seriesApi.current[key];
      if (!api) {
        api = chart.addSeries(LineSeries, {
          color: getCoreInvestColor(key),
          lineWidth: key === "portfolio" ? 2 : key === "spy" ? 2 : 1,
          lastValueVisible: true,
          priceLineVisible: false,
          title: "",
        });
        seriesApi.current[key] = api;
      }
      if (on) {
        api.setData(pts.map(p => ({ time: toUtcTs(p.date), value: p.value })));
        api.applyOptions({ visible: true, lastValueVisible: true });
      } else {
        api.applyOptions({ visible: false, lastValueVisible: false });
      }
    }
    // fitContent only on first load, not on every anchor/pan update
    if (!initialFitDone.current && anchoredData.spy.length > 0) {
      chart.timeScale().fitContent();
      initialFitDone.current = true;
    }
  }, [anchoredData, visible]);

  // When switching anchor mode, trigger immediate rebase from current visible position
  const handleAnchorChange = useCallback((mode: Anchor) => {
    if (mode === "visible" && visibleStartRef.current) {
      setVisibleStart(visibleStartRef.current);
    }
    setAnchor(mode);
  }, []);

  const toggleSeries = useCallback((key: SeriesKey) =>
    setVisible(prev => ({ ...prev, [key]: !prev[key] })), []);

  const segBase: React.CSSProperties = {
    fontSize: 9, padding: "2px 6px", cursor: "pointer", border: "none",
    background: "transparent", color: T_MUTED, lineHeight: 1,
  };
  const segActive: React.CSSProperties = { ...segBase, background: "rgba(255,255,255,0.09)", color: T_BRIGHT };
  const segGroup: React.CSSProperties  = { display: "flex", border: `1px solid ${BORDER}`, borderRadius: 4, overflow: "hidden" };

  return (
    <div style={{ background: CHART_BG, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px 4px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: T_DIM, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: FONT_MONO, marginRight: 2 }}>
          Benchmark
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, flexWrap: "nowrap", overflow: "hidden" }}>
          {PERF_SERIES.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => toggleSeries(key)} style={{
              display: "flex", alignItems: "center", gap: 2, padding: 0,
              background: "none", border: "none", cursor: "pointer",
              opacity: visible[key] ? 1 : 0.3, flexShrink: 0,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: getCoreInvestColor(key), display: "inline-block" }} />
              <span style={{ fontSize: 8, color: T_MUTED, whiteSpace: "nowrap" }}>{label}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <div style={segGroup}>
            {(["fixed", "visible"] as Anchor[]).map((m, i) => (
              <button key={m} type="button" onClick={() => handleAnchorChange(m)}
                style={{ ...anchor === m ? segActive : segBase, borderRight: i === 0 ? `1px solid ${BORDER}` : "none" }}>
                {m === "fixed" ? "2000" : "View"}
              </button>
            ))}
          </div>
          <div style={segGroup}>
            {(["D", "W", "M", "ALL"] as TF[]).map((t, i) => (
              <button key={t} type="button" onClick={() => setTf(t)}
                style={{ ...tf === t ? segActive : segBase, borderRight: i < 3 ? `1px solid ${BORDER}` : "none" }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div ref={chartRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}

// ─── donut ring ────���──────────────────────────────────────────────────────────
function DonutRing({ value, color, label, icon }: { value: number; color: string; label: string; icon?: string }) {
  const SIZE = 74, R = 28, circ = 2 * Math.PI * R;
  const fill = (value / 100) * circ;
  const cx = SIZE / 2, cy = SIZE / 2;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div style={{ position: "relative", width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={BORDER_ACT} strokeWidth="5" />
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
            fill={T_BRIGHT} fontSize="10" fontWeight="800">{value}%</text>
        </svg>
        {icon && (
          <img src={icon} alt={label}
            style={{ position: "absolute", bottom: 2, right: 2, width: 20, height: 20, borderRadius: 4, objectFit: "cover", background: CHART_BG, border: "1px solid rgba(255,255,255,0.08)" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
      </div>
      <span style={{ fontSize: 8, color: T_MUTED, textAlign: "center", lineHeight: 1.3, maxWidth: 64 }}>{label}</span>
    </div>
  );
}

// ─── info tile ────────────────────────────────────────────────────────────────
type InfoTileProps = {
  dataStatus: Record<string, { found: boolean; file: string | null }>;
  missingSymbols: string[];
  sleeves: SleeveData[];
};

function InfoTile({ dataStatus, missingSymbols, sleeves }: InfoTileProps) {
  const lastUpdated = sleeves.reduce<string | null>(
    (acc, s) => !s.lastDate ? acc : !acc || s.lastDate > acc ? s.lastDate : acc, null
  );
  const byId: Record<string, SleeveData> = Object.fromEntries(sleeves.map(s => [s.config.id, s]));

  const signals = [
    { id: "qqqPine1", label: "Pine 1",     sym: "QQQ",  sid: "QQQ_PINE_1"     },
    { id: "qqqPine2", label: "Pine 2 EMA", sym: "QQQ",  sid: "QQQ_PINE_2_EMA" },
    { id: "copper",   label: "Copper",     sym: "HG1!", sid: "COPPER_HG"       },
    { id: "chf",      label: "CHF/6S",     sym: "6S1!", sid: "CHF_6S"          },
  ].map(r => ({
    ...r,
    signal: byId[r.sid]?.currentSignal ?? "—",
    price:  byId[r.sid]?.bars?.at(-1)?.close,
  }));

  return (
    <div style={{ background: CHART_BG, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 5px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: T_BRIGHT, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT_MONO }}>Core Invest</span>
        {missingSymbols.length > 0 && (
          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#450a0a", color: "#F87171" }}>{missingSymbols.length} missing</span>
        )}
        {lastUpdated && <span style={{ fontSize: 9, color: T_MUTED, marginLeft: "auto" }}>{lastUpdated}</span>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Allocation donuts */}
        <div>
          <div style={{ fontSize: 9, color: T_MUTED, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Allocation</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {ALLOC_ITEMS.map(item => (
              <DonutRing key={item.id} value={item.weight} color={getCoreInvestColor(item.id)} label={item.label} icon={item.icon} />
            ))}
          </div>
        </div>

        {/* Strategy signals — icon + name + direction triangle */}
        <div>
          <div style={{ fontSize: 9, color: T_MUTED, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Signals</div>
          {signals.map(row => {
            const icon = ASSET_ICON[row.id];
            const isLong = row.signal === "long";
            const isCash = !isLong;
            return (
              <div key={row.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {icon && <img src={icon} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover", flexShrink: 0, opacity: 0.92, border: "1px solid rgba(255,255,255,0.08)" }} />}
                  <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: T_BRIGHT }}>{row.label}</span>
                    <span style={{ fontSize: 8, color: T_MUTED }}>{row.sym}</span>
                  </div>
                </div>
                <span style={{
                  fontSize: 14, lineHeight: 1,
                  color: isLong ? "#4ADE80" : isCash ? T_MUTED : "#F87171",
                }}>
                  {isLong ? "▲" : "△"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Data status */}
        <div>
          <div style={{ fontSize: 9, color: T_MUTED, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Data</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 8px" }}>
            {Object.entries(dataStatus).map(([sym, info]) => (
              <div key={sym} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 9, color: T_DIM }}>{sym}</span>
                <span style={{ fontSize: 8, padding: "0 4px", borderRadius: 2, background: info.found ? "#052E16" : "#450a0a", color: info.found ? "#4ADE80" : "#F87171" }}>
                  {info.found ? "ok" : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── main grid ──────────���────────────────────────────��────────────────────────
type CoreInvestMonitoringGridProps = {
  /** Called when user selects a strategy card for the Tester */
  onStrategySelect?: (sleeveId: string) => void;
  /** Which sleeve ID is currently active in the Tester */
  selectedStrategyId?: string | null;
};

export default function CoreInvestMonitoringGrid({ onStrategySelect, selectedStrategyId }: CoreInvestMonitoringGridProps) {
  const { sleeves, benchmarkCurve, qqqCurve, dataStatus, missingSymbols, loading, error } = useCoreInvestData();

  const [gldBars,     setGldBars]     = useState<OhlcBar[]>([]);
  const [chfTrades,   setChfTrades]   = useState<TradeRow[]>([]);
  const [pine1Trades, setPine1Trades] = useState<TradeRow[]>([]);
  const [pine2Trades, setPine2Trades] = useState<TradeRow[]>([]);
  const [hgTrades,    setHgTrades]    = useState<TradeRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadTrades = (url: string, set: (t: TradeRow[]) => void) =>
      fetch(url).then(r => r.json()).then(d => { if (!cancelled) set(Array.isArray(d.trades) ? d.trades : []); }).catch(() => {});

    fetch("/api/core-invest/ohlc?symbol=GLD")
      .then(r => r.json()).then(d => { if (!cancelled) setGldBars(d.bars ?? []); }).catch(() => {});

    loadTrades("/generated/monitoring/strategies/CME_6S1_events.json",        setChfTrades);
    loadTrades("/generated/monitoring/strategies/BATS_QQQ_pine1_events.json", setPine1Trades);
    loadTrades("/generated/monitoring/strategies/BATS_QQQ_pine2_events.json", setPine2Trades);
    loadTrades("/generated/monitoring/strategies/COMEX_HG1_events.json",      setHgTrades);
    return () => { cancelled = true; };
  }, []);

  const EMPTY: SleeveData = {
    config: { id: "", label: "", instrument: "", pineFile: "", weight: 0 },
    bars: [], signals: [], status: "missing_ohlc", statusMessage: "", lastDate: null,
  };

  const pine1  = sleeves.find(s => s.config.id === "QQQ_PINE_1")     ?? EMPTY;
  const pine2  = sleeves.find(s => s.config.id === "QQQ_PINE_2_EMA") ?? EMPTY;
  const copper = sleeves.find(s => s.config.id === "COPPER_HG")      ?? EMPTY;
  const chf    = sleeves.find(s => s.config.id === "CHF_6S")         ?? EMPTY;

  if (loading) return <div style={{ background: CHART_BG, height: "100%", display: "grid", placeItems: "center", color: T_MUTED, fontSize: 12 }}>Core Invest lädt…</div>;
  if (error)   return <div style={{ background: CHART_BG, height: "100%", display: "grid", placeItems: "center", color: "#F87171", fontSize: 12 }}>Fehler: {error}</div>;

  const makeCardClick = (weightId: string) => onStrategySelect
    ? () => onStrategySelect(WEIGHT_TO_SLEEVE_ID[weightId] ?? weightId)
    : undefined;

  const isCardSelected = (weightId: string) =>
    selectedStrategyId != null && selectedStrategyId === WEIGHT_TO_SLEEVE_ID[weightId];

  if (process.env.NODE_ENV === "development") {
    console.info("[MONITORING_RENDER_TRACE]", { component: "CoreInvestMonitoringGrid", file: "src/components/core-invest/CoreInvestMonitoringGrid.tsx", version: "2026-07-12-invest-final-fix-v2" });
  }

  return (
    <div data-render-trace="core-invest-final-fix-v2" style={{
      background: CHART_BG,
      height: "100%",
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0,1fr))",
      gridTemplateRows: "repeat(2, minmax(0,1fr))",
      gap: 8,
      padding: 8,
      boxSizing: "border-box",
    }}>
      <CandleCard weightId="qqqPine1" sleeve={pine1}  strategyTrades={pine1Trades}
        isSelected={isCardSelected("qqqPine1")} onClick={makeCardClick("qqqPine1")} />
      <CandleCard weightId="qqqPine2" sleeve={pine2}  strategyTrades={pine2Trades} showEmas
        isSelected={isCardSelected("qqqPine2")} onClick={makeCardClick("qqqPine2")} />
      <InteractivePerformanceTile sleeves={sleeves} benchmarkCurve={benchmarkCurve} qqqCurve={qqqCurve} gldBars={gldBars} />
      <CandleCard weightId="copper"   sleeve={copper} strategyTrades={hgTrades}    showEmas
        isSelected={isCardSelected("copper")} onClick={makeCardClick("copper")} />
      <CandleCard weightId="chf"      sleeve={chf}    strategyTrades={chfTrades}   showEmas
        isSelected={isCardSelected("chf")} onClick={makeCardClick("chf")} />
      <InfoTile dataStatus={dataStatus} missingSymbols={missingSymbols} sleeves={sleeves} />
    </div>
  );
}
