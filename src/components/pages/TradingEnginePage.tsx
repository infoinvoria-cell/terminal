"use client";

import {
  useEffect, useRef, useState, useCallback, useMemo,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useHeaderState } from "@/context/header-state-context";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";

const ChartComponent = dynamic(() => import("@/components/engine/LWChart"), { ssr: false });
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
import { KpiCardRef } from "@/components/ui/kpi-card-ref";
import ReferenceDrawdownChart from "@/components/referenzen/ReferenceDrawdownChart";
import { PillButton, InjectPillCss } from "@/components/ui/pill-button";
import { ToggleSwitchRef } from "@/components/ui/toggle-switch-ref";
import { CapitalifeStatusPanel } from "@/components/ui/CapitalifeStatusPanel";
import {
  engineClient,
  type EngineHealth,
  type BacktestResult,
  type SignalData,
  type TradeRecord,
} from "@/lib/engine-client";
import { LiveQuotesProvider } from "@/contexts/LiveQuotesContext";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CANONICAL_STRATEGY_PARAMS } from "@/lib/engine/canonical-strategy-params";

// ── Types ──────────────────────────────────────────────────────────────────────
type Strategy  = "EUR_30M" | "DAX_1H" | "DAX_2H" | "GC_FRI" | "GLD_THU" | "YM_TAT";
type AssetType = "futures" | "cfd";
type Params    = Record<string, number | string>;
type TesterTab = "overview" | "performance" | "trades" | "settings";
interface OhlcBar { time: number; open: number; high: number; low: number; close: number; }

interface StrategyMeta { label: string; futures: string; cfd: string; interval: string; useEma: boolean; icon: string; engine?: string; category: string; liveSymbol: string; name: string; cfdName: string; exchange: string; priceDecimals: number; monitorSymbol?: string; }
const STRATEGIES: Record<Strategy, StrategyMeta> = {
  EUR_30M: { label: "EUR/USD 30M",  futures: "6E",     cfd: "EURUSD", interval: "30m", useEma: false, icon: "/asset-icons/eurusd.png",    engine: "Liquidity Sweep · ATR SL · TP 3R",         category: "Technical",        liveSymbol: "6E1!",  name: "EUR/USD Futures",       cfdName: "Euro / US Dollar",       exchange: "CME",   priceDecimals: 5, monitorSymbol: "6E1!" },
  DAX_1H:  { label: "DAX 1H",       futures: "FDAX1!", cfd: "DE30EUR", interval: "1H",  useEma: true,  icon: "/asset-icons/dax.png",        engine: "EMA Cross · Session Filter · 1.0 ATR SL · 5.0 ATR TP", category: "Technical",        liveSymbol: "FDAX1!", name: "DAX Futures",           cfdName: "Germany 30 (DE30EUR)",   exchange: "EUREX", priceDecimals: 1, monitorSymbol: "FDAX1!" },
  DAX_2H:  { label: "DAX 2H",       futures: "FDAX1!", cfd: "DE30EUR", interval: "2H",  useEma: true,  icon: "/asset-icons/dax.png",        engine: "EMA Cross · Session Filter · 0.8 ATR SL · 4.0 RR TP",  category: "Technical",        liveSymbol: "FDAX1!", name: "DAX Futures",           cfdName: "Germany 30 (DE30EUR)",   exchange: "EUREX", priceDecimals: 1, monitorSymbol: "FDAX1!" },
  GC_FRI:  { label: "Gold Friday",  futures: "GC1!",   cfd: "XAUUSD", interval: "D",   useEma: false, icon: "/asset-icons/gold.png",       engine: "Friday ATR Breakout · ATR SL · R:R",       category: "Calendar Anomaly", liveSymbol: "GC1!",  name: "Gold Futures",          cfdName: "Gold Spot",               exchange: "COMEX", priceDecimals: 1, monitorSymbol: "GC1!" },
  GLD_THU: { label: "Gold Thursday",futures: "GLD",    cfd: "XAUUSD", interval: "D",   useEma: false, icon: "/asset-icons/gold.png",       engine: "Thursday ATR Mean-Rev · ATR SL · R:R",     category: "Calendar Anomaly", liveSymbol: "GC1!",  name: "Gold Futures",          cfdName: "Gold Spot",               exchange: "COMEX", priceDecimals: 1, monitorSymbol: "GC1!" },
  YM_TAT:  { label: "Dow Jones",    futures: "YM1!",   cfd: "US30",   interval: "D",   useEma: false, icon: "/asset-icons/dow_jones.png",  engine: "Trend-ATR · Overnight Gap · ATR SL · R:R", category: "Turnaround",       liveSymbol: "YM1!",  name: "Dow Jones Futures",     cfdName: "US 30",                   exchange: "CBOT",  priceDecimals: 0, monitorSymbol: "YM1!" },
};

interface ParamDef {
  key: string; label: string; type: "slider" | "number" | "select";
  min?: number; max?: number; step?: number;
  options?: { value: string; label: string }[];
}
const DIR_OPTS = [
  { value: "both",  label: "Long & Short" },
  { value: "long",  label: "Long Only"    },
  { value: "short", label: "Short Only"   },
];
const PARAM_DEFS: Record<Strategy, ParamDef[]> = {
  EUR_30M: [
    { key: "fo_pips",         label: "FO Pips",         type: "number", min: 0.00001, max: 0.001,  step: 0.00001 },
    { key: "sl_atr_mult",     label: "SL ATR Mult",     type: "slider", min: 0.5,     max: 3.0,    step: 0.1     },
    { key: "tp_crv",          label: "TP CRV",          type: "slider", min: 1.0,     max: 5.0,    step: 0.5     },
    { key: "session_start_h", label: "Session Start",   type: "slider", min: 0,       max: 23,     step: 1       },
    { key: "session_end_h",   label: "Session End",     type: "slider", min: 0,       max: 23,     step: 1       },
    { key: "flip_threshold",  label: "Flip Threshold",  type: "slider", min: 0.3,     max: 0.7,    step: 0.05    },
    { key: "spec_threshold",  label: "Spec Threshold",  type: "slider", min: 0.3,     max: 0.9,    step: 0.05    },
  ],
  DAX_1H: [
    { key: "ema_fast",      label: "EMA Fast",      type: "slider", min: 5,  max: 100, step: 1 },
    { key: "ema_slow",      label: "EMA Slow",      type: "slider", min: 10, max: 200, step: 1 },
    { key: "sl_pts",        label: "SL Points",     type: "number", min: 5,  max: 200, step: 1 },
    { key: "tp_pts",        label: "TP Points",     type: "number", min: 10, max: 500, step: 1 },
    { key: "direction",     label: "Direction",     type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Start", type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End",   type: "slider", min: 0, max: 23, step: 1 },
  ],
  DAX_2H: [
    { key: "ema_fast",      label: "EMA Fast",      type: "slider", min: 2,  max: 20,  step: 1 },
    { key: "ema_slow",      label: "EMA Slow",      type: "slider", min: 5,  max: 50,  step: 1 },
    { key: "sl_pts",        label: "SL Points",     type: "number", min: 20, max: 300, step: 5 },
    { key: "tp_pts",        label: "TP Points",     type: "number", min: 30, max: 600, step: 5 },
    { key: "direction",     label: "Direction",     type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Start", type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End",   type: "slider", min: 0, max: 23, step: 1 },
  ],
  GC_FRI:  [
    { key: "atr_len", label: "ATR Length", type: "slider", min: 5,   max: 30,  step: 1    },
    { key: "sl_mult", label: "SL Mult",    type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",      label: "R:R",        type: "slider", min: 1.0, max: 5.0, step: 0.25 },
  ],
  GLD_THU: [
    { key: "atr_len", label: "ATR Length", type: "slider", min: 5,   max: 30,  step: 1    },
    { key: "sl_mult", label: "SL Mult",    type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",      label: "R:R",        type: "slider", min: 1.0, max: 5.0, step: 0.25 },
  ],
  YM_TAT: [
    { key: "atr_len", label: "ATR Length", type: "slider", min: 5,   max: 30,  step: 1    },
    { key: "sl_mult", label: "SL Mult",    type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",      label: "R:R",        type: "slider", min: 1.0, max: 5.0, step: 0.25 },
  ],
};
// EUR_30M_CANONICAL_CONFIG — exposed-slider values must match CANONICAL_PARAMS in runner.py.
// Only PARAM_DEFS-exposed keys are sent; backend fills non-UI params from CANONICAL_PARAMS.
// frontendParamHash == backendParamHash == signalParamHash == referenceParamHash
const DEFAULT_PARAMS: Record<Strategy, Params> = {
  EUR_30M: {
    fo_pips: 0.00008, sl_atr_mult: 1.5, tp_crv: 3.0,
    session_start_h: 9, session_end_h: 12,
    flip_threshold: 0.55, spec_threshold: 0.7,
  },
  DAX_1H:  { ema_fast: 20, ema_slow: 50, sl_pts: 35,      tp_pts: 126,     direction: "both", session_start: 8,  session_end: 17 },
  DAX_2H:  { ema_fast: 4,  ema_slow: 20, sl_pts: 50,      tp_pts: 150,     direction: "both", session_start: 8,  session_end: 18 },
  GC_FRI:  { atr_len: 14, sl_mult: 0.75, rr: 1.25 },
  GLD_THU: { atr_len: 14, sl_mult: 1.5,  rr: 2.0  },
  YM_TAT:  { atr_len: 14, sl_mult: 1.0,  rr: 2.0  },
};

// ── Color constants ────────────────────────────────────────────────────────────
const BG       = "#0a0a0c";
const GAP      = "#000000";
const GOLD     = "#D6B24A";
const GOLD_S   = "#D6B24A";
const GOLD_DIM = "rgba(214,178,74,0.12)";
const TXT      = "#F0F2F6";
const MUT      = "rgba(180,192,210,0.6)";
const DIM      = "#6b7280";
const FAINT    = "#4b5563";
const BORDER   = "rgba(255,255,255,0.055)";
const CHART_BG = "linear-gradient(to bottom, #17171b, #0b0b0e)";
const KPI_BG   = "linear-gradient(to bottom, #26262d, #111114)";
const CARD_BG  = CHART_BG;
const RED      = "#dc2626";
const M        = "var(--font-montserrat,'Montserrat',sans-serif)";

const BOX_STYLE: React.CSSProperties = {
  background: CHART_BG,
  borderRadius: 10,
  border: `1px solid ${BORDER}`,
  overflow: "hidden",
};

// ── KPI definitions ────────────────────────────────────────────────────────────
const KPIS: { key: string; label: string; fmt: (v: number) => string; color: (v: number) => string }[] = [
  { key: "cagr",         label: "CAGR",    fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, color: v => v < 0 ? GOLD : TXT },
  { key: "sharpe",       label: "Sharpe",  fmt: v => v.toFixed(2),  color: v => v < 0 ? GOLD : TXT },
  { key: "maxDD",        label: "Max DD",  fmt: v => `${v.toFixed(1)}%`, color: v => v < -30 ? GOLD : TXT },
  { key: "calmar",       label: "Calmar",  fmt: v => v.toFixed(2),  color: () => TXT },
  { key: "trades",       label: "Trades",  fmt: v => String(Math.round(v)), color: () => TXT },
  { key: "winRate",      label: "Win %",   fmt: v => `${v.toFixed(1)}%`, color: () => TXT },
  { key: "profitFactor", label: "PF",      fmt: v => v.toFixed(2),  color: v => v < 1 ? GOLD : TXT },
  { key: "avgWin",       label: "Avg Win", fmt: v => `+${v.toFixed(2)}%`, color: () => TXT },
];

const ALL_KPIS: { key: string; label: string; fmt: (v: number) => string; extra?: string }[] = [
  { key: "cagr",         label: "CAGR",        fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, extra: "p.a." },
  { key: "sharpe",       label: "Sharpe",      fmt: v => v.toFixed(2) },
  { key: "maxDD",        label: "Max DD",      fmt: v => `${v.toFixed(1)}%` },
  { key: "calmar",       label: "Calmar",      fmt: v => v.toFixed(2) },
  { key: "trades",       label: "Trades",      fmt: v => String(Math.round(v)) },
  { key: "winRate",      label: "Win %",       fmt: v => `${v.toFixed(1)}%` },
  { key: "profitFactor", label: "PF",          fmt: v => v.toFixed(2) },
  { key: "avgWin",       label: "Avg Win",     fmt: v => `+${v.toFixed(2)}%` },
  { key: "avgLoss",      label: "Avg Loss",    fmt: v => `${v.toFixed(2)}%` },
  { key: "bestTrade",    label: "Best Trade",  fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(2)}%` },
  { key: "worstTrade",   label: "Worst Trade", fmt: v => `${v.toFixed(2)}%` },
];

// 2×6 KPI grid — exactly 12 KPIs (CAGR + Total Return in equity header, not here)
const TESTER_KPIS: { key: string; label: string; fmt: (v: number) => string; getColor: (v: number) => string }[] = [
  { key: "sharpe",         label: "Sharpe",      fmt: v => v.toFixed(2),                                   getColor: v => v < 0 ? GOLD : TXT },
  { key: "maxDD",          label: "Max DD",      fmt: v => `${v.toFixed(1)}%`,                             getColor: v => v < 0 ? GOLD : TXT },
  { key: "calmar",         label: "Calmar",      fmt: v => v.toFixed(2),                                   getColor: v => v < 0 ? GOLD : TXT },
  { key: "trades",         label: "Trades",      fmt: v => String(Math.round(v)),                          getColor: () => TXT },
  { key: "winRate",        label: "Win %",       fmt: v => `${v.toFixed(1)}%`,                             getColor: () => TXT },
  { key: "profitFactor",   label: "PF",          fmt: v => v.toFixed(2),                                   getColor: v => v < 1 ? GOLD : TXT },
  { key: "avgWin",         label: "Avg Win",     fmt: v => `+${v.toFixed(2)}%`,                            getColor: () => TXT },
  { key: "avgLoss",        label: "Avg Loss",    fmt: v => `${v.toFixed(2)}%`,                             getColor: v => v < 0 ? GOLD : TXT },
  { key: "bestTrade",      label: "Best",        fmt: v => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`,        getColor: v => v < 0 ? GOLD : TXT },
  { key: "worstTrade",     label: "Worst",       fmt: v => `${v.toFixed(2)}%`,                             getColor: v => v < 0 ? GOLD : TXT },
  { key: "expectancy",     label: "Expectancy",  fmt: v => `${v >= 0 ? "+" : ""}${v.toFixed(3)}%`,        getColor: v => v < 0 ? GOLD : TXT },
  { key: "recoveryFactor", label: "Recovery",    fmt: v => v.toFixed(2),                                   getColor: v => v < 1 ? GOLD : TXT },
];

const PERF_ROWS: { key: string; label: string; fmt: (v: number) => string }[] = [
  { key: "cagr",         label: "CAGR",           fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(2)}%` },
  { key: "sharpe",       label: "Sharpe Ratio",   fmt: v => v.toFixed(3) },
  { key: "maxDD",        label: "Max Drawdown",   fmt: v => `${v.toFixed(2)}%` },
  { key: "calmar",       label: "Calmar Ratio",   fmt: v => v.toFixed(3) },
  { key: "trades",       label: "Total Trades",   fmt: v => String(Math.round(v)) },
  { key: "winRate",      label: "Win Rate",       fmt: v => `${v.toFixed(1)}%` },
  { key: "profitFactor", label: "Profit Factor",  fmt: v => v.toFixed(3) },
  { key: "avgWin",       label: "Avg Win",        fmt: v => `+${v.toFixed(3)}%` },
  { key: "avgLoss",      label: "Avg Loss",       fmt: v => `${v.toFixed(3)}%` },
  { key: "bestTrade",    label: "Best Trade",     fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(3)}%` },
  { key: "worstTrade",   label: "Worst Trade",    fmt: v => `${v.toFixed(3)}%` },
];

const TIMEFRAMES: { label: string; days: number | null }[] = [
  { label: "1W",  days: 7 },
  { label: "1M",  days: 30 },
  { label: "3M",  days: 90 },
  { label: "6M",  days: 180 },
  { label: "1Y",  days: 365 },
  { label: "All", days: null },
];

const TAB_LABELS: { key: TesterTab; label: string }[] = [
  { key: "overview",    label: "Overview" },
  { key: "performance", label: "Performance" },
  { key: "trades",      label: "Trades" },
  { key: "settings",    label: "Settings" },
];

type BadgeStatus = "ok" | "warn" | "fail" | "pending";
interface ValidationBadge { label: string; value: string; status: BadgeStatus; tooltip?: string }
const STRATEGY_VALIDATION: Partial<Record<Strategy, ValidationBadge[]>> = {
  EUR_30M: [
    { label: "Basis",        value: "PF 1.275", status: "ok",   tooltip: "2007-2026: 771 Trades, PF=1.275, MaxDD=-19.3%, CAGR=75.1%, Sharpe=0.449 — sl=1.5, be=2.0" },
    { label: "Param Stabil", value: "68%",      status: "ok",   tooltip: "17/25 SL×TP-Varianten profitabel. sl>=1.0 durchgehend robust." },
    { label: "MAX DD",       value: "-19.3%",   status: "ok",   tooltip: "MaxDD -19.3% unter institutionellem Limit von -20%. sl=1.5 + be=2.0." },
    { label: "WF",           value: "ausstehend", status: "pending", tooltip: "Walk-Forward noch nicht berechnet" },
    { label: "Research",     value: "ROBUSTNESS WARNING", status: "warn", tooltip: "PRODUCTION_READY_WITH_ROBUSTNESS_WARNING — Param stability 68%, WF pending. Runtime LIVE status is independent." },
  ],
  DAX_2H: [
    { label: "Lock",         value: "PRODUCTION_V1", status: "ok",   tooltip: "candidate_lock.json 2026-08-08: parameterHash cd588fe5" },
    { label: "SL",           value: "0.8 ATR",       status: "ok",   tooltip: "sl_atr=0.8 — ATR_RATIO convention" },
    { label: "TP",           value: "4.0 R:R",       status: "ok",   tooltip: "tp_rr=4.0 — RR_RATIO convention" },
    { label: "BE",           value: "0.5 ATR",       status: "ok",   tooltip: "be_atr=0.5 — breakeven trigger" },
    { label: "Research",     value: "PRODUCTION_V1", status: "ok",   tooltip: "Canonical parameters locked 2026-08-08. DO NOT RE-OPTIMIZE without full audit." },
  ],
  DAX_1H: [
    { label: "Lock",         value: "PRODUCTION_V1", status: "ok",   tooltip: "candidate_lock.json 2026-08-08: parameterHash aff22a7c" },
    { label: "SL",           value: "1.0 ATR",       status: "ok",   tooltip: "sl_atr=1.0 — ATR_MULTIPLE convention" },
    { label: "TP",           value: "5.0 ATR",       status: "ok",   tooltip: "tp_atr=5.0 — ATR_MULTIPLE convention" },
    { label: "BE",           value: "0.5 ATR",       status: "ok",   tooltip: "be_atr=0.5 — breakeven trigger" },
    { label: "Research",     value: "PRODUCTION_V1", status: "ok",   tooltip: "Canonical parameters locked 2026-08-08. DO NOT RE-OPTIMIZE without full audit." },
  ],
};

// ── Tab icons — currentColor inherits from parent pill (active/inactive sets color there) ──
function tabIcon(key: TesterTab): React.ReactNode {
  switch (key) {
    case "overview":    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    case "performance": return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case "trades":      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
    case "settings":    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  }
}

// ── Resizable column hook ──────────────────────────────────────────────────────
function useResizable(initial: number, min: number, max: number, dir: "left" | "right" = "left") {
  const [w, setW] = useState(initial);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = w;
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = dir === "left" ? startX.current - ev.clientX : ev.clientX - startX.current;
      setW(Math.min(max, Math.max(min, startW.current + dx)));
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [w, min, max, dir]);

  return { w, onMouseDown };
}


// ── No data placeholder ────────────────────────────────────────────────────────
function NoData({ text = "No data available" }: { text?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, opacity: 0.4 }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-4 3 3 4-6" />
      </svg>
      <span style={{ fontSize: 10, color: DIM, letterSpacing: ".04em" }}>{text}</span>
    </div>
  );
}

// ── Engine Equity Chart — reference-style ─────────────────────────────────────
type EquityPoint = { x: string; y: number; bh: number | null; spy?: number | null };

const EQ_WHITE = "#E8EDF4";

function EngineEquityChart({ data, showBenchmark, metrics }: {
  data: EquityPoint[];
  showBenchmark: boolean;
  metrics?: Record<string, number>;
}) {
  const hasBh  = showBenchmark && data.some(d => d.bh != null);
  const hasSpy = showBenchmark && data.some(d => d.spy != null);
  const totalReturn = data.length ? (data[data.length - 1]?.y ?? 0) : 0;
  const bhReturn  = hasBh  ? (data[data.length - 1]?.bh  ?? null) : null;
  const spyReturn = hasSpy ? (data[data.length - 1]?.spy ?? null) : null;
  const cagr = metrics?.cagr;

  // Y domain with breathing room below 0
  const allY   = data.flatMap(d => [d.y, ...(hasBh && d.bh != null ? [d.bh] : []), ...(hasSpy && d.spy != null ? [d.spy] : [])]);
  const rawMin = allY.length ? Math.min(0, ...allY) : 0;
  const rawMax = allY.length ? Math.max(0, ...allY) : 10;
  const tickMin = rawMin >= -2 ? -15 : Math.floor((rawMin - 2) / 10) * 10;
  const tickMax = Math.max(10, Math.ceil((rawMax + 2) / 10) * 10);
  const yTicks: number[] = [];
  for (let t = Math.ceil(tickMin / 10) * 10; t <= tickMax; t += 10) yTicks.push(t);

  const tickStep = Math.max(1, Math.floor(data.length / 8));
  const xTicks = data.filter((_, i) => i % tickStep === 0).map(d => d.x);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 6px", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#f5f7fa", fontFamily: M, letterSpacing: ".04em" }}>Equity Curve</span>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ padding: "5px 10px 6px", borderRadius: 12, border: `1px solid ${BORDER}`, background: KPI_BG, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 9.5, color: MUT, letterSpacing: ".04em", fontFamily: M, lineHeight: 1 }}>Total Return</span>
            <strong style={{ fontSize: 15, fontWeight: 700, color: totalReturn < 0 ? GOLD : TXT, fontFamily: "var(--font-numbers)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(1)}%
            </strong>
            {spyReturn != null && (
              <span style={{ fontSize: 9, color: spyReturn < 0 ? GOLD : "rgba(180,192,210,0.5)", fontFamily: "var(--font-numbers)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                S&P {spyReturn >= 0 ? "+" : ""}{spyReturn.toFixed(1)}%
              </span>
            )}
            {bhReturn != null && !hasSpy && (
              <span style={{ fontSize: 9, color: bhReturn < 0 ? GOLD : "rgba(180,192,210,0.5)", fontFamily: "var(--font-numbers)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                B&H {bhReturn >= 0 ? "+" : ""}{bhReturn.toFixed(1)}%
              </span>
            )}
          </div>
          {cagr != null && Math.abs(cagr) > 0.01 && (
            <div style={{ padding: "5px 10px 6px", borderRadius: 12, border: `1px solid ${BORDER}`, background: KPI_BG, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9.5, color: MUT, letterSpacing: ".04em", fontFamily: M, lineHeight: 1 }}>CAGR</span>
              <strong style={{ fontSize: 15, fontWeight: 700, color: cagr < 0 ? GOLD : TXT, fontFamily: "var(--font-numbers)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                {cagr >= 0 ? "+" : ""}{cagr.toFixed(1)}%
              </strong>
            </div>
          )}
        </div>
      </div>
      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 12, bottom: 8, left: 4 }}>
            <defs>
              <linearGradient id="eqGradEng" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={EQ_WHITE} stopOpacity={0.14} />
                <stop offset="95%" stopColor={EQ_WHITE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.035)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="x" ticks={xTicks}
              tick={{ fontSize: 10, fill: "#7f8a9d", fontFamily: "var(--font-numbers)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.14)" }} tickLine={false}
            />
            <YAxis
              domain={[tickMin, tickMax]} ticks={yTicks} width={56}
              tick={{ fontSize: 10, fill: "#7f8a9d", fontFamily: "var(--font-numbers)" }}
              axisLine={false} tickLine={false}
              tickFormatter={v => `${v > 0 ? "+" : ""}${Number(v).toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{ background: "#0B0E12", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, fontSize: 10, color: TXT }}
              formatter={(value, name) => {
                const v = Number(value);
                return [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, name === "y" ? "Portfolio" : "Buy & Hold"] as [string, string];
              }}
              labelFormatter={(label) => String(label)}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
            <Area type="monotone" dataKey="y" stroke={EQ_WHITE} strokeWidth={1.6} fill="url(#eqGradEng)" dot={false} activeDot={{ r: 3, fill: EQ_WHITE }} isAnimationActive={false} />
            {hasBh && !hasSpy && (
              <Line type="monotone" dataKey="bh" stroke={RED} strokeWidth={1.2} strokeDasharray="4 3" dot={false} activeDot={{ r: 2, fill: RED }} isAnimationActive={false} />
            )}
            {hasSpy && (
              <Line type="monotone" dataKey="spy" stroke={RED} strokeWidth={1.2} strokeDasharray="4 3" dot={false} activeDot={{ r: 2, fill: RED }} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function TradingEnginePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const failureMode = searchParams.get("cf_fail") ?? "";
  const engineDataFailure = failureMode
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes("engine-data");

  if (engineDataFailure) {
    return (
      <div style={{ padding: "20px 20px 24px 12px" }}>
        <CapitalifeStatusPanel
          tone="unavailable"
          title="Engine-Daten nicht verfuegbar"
          detail="Die Trading-Engine liefert aktuell keine nutzbaren Daten. Die Shell bleibt verfuegbar, die Engine-Ansicht ist lokal isoliert."
        />
      </div>
    );
  }

  function resolveInitialStrategy(): Strategy {
    const param = searchParams.get("strategy");
    if (param && param in STRATEGIES) return param as Strategy;
    return "EUR_30M";
  }

  const [strategy,  setStrategy]  = useState<Strategy>(resolveInitialStrategy);
  const [assetType, setAssetType] = useState<AssetType>("futures");
  const [params,    setParams]    = useState<Params>(DEFAULT_PARAMS["EUR_30M"]);
  const [startDate, setStartDate] = useState("2007-01-01");
  const [endDate,   setEndDate]   = useState(new Date().toISOString().slice(0, 10));
  const [result,    setResult]    = useState<BacktestResult | null>(null);
  const [running,   setRunning]   = useState(false);
  const [btPhase,   setBtPhase]   = useState("");
  const [signal,    setSignal]    = useState<SignalData>({ direction: "flat" });
  const [health,    setHealth]    = useState<EngineHealth | null>(null);
  const [bars,      setBars]      = useState<OhlcBar[]>([]);
  const [codePanel, setCodePanel] = useState(false);
  const [strategyCode, setStrategyCode] = useState("");
  const [testerTab,  setTesterTab]  = useState<TesterTab>("overview");
  const [chartDays,  setChartDays]  = useState<number | null>(7);
  const [sortCol,    setSortCol]    = useState<string>("#");
  const [sortAsc,    setSortAsc]    = useState(false);
  const [showEmaFast, setShowEmaFast] = useState(true);
  const [showEmaSlow, setShowEmaSlow] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [datePreset,  setDatePreset]  = useState<number | null>(null);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [spyReturns, setSpyReturns] = useState<Array<{date: string; returnPct: number}>>([]);
  const { headerHidden } = useHeaderState();
  const debRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barsGenRef = useRef(0);
  const btAbortRef = useRef<AbortController | null>(null);
  const [btReqCount, setBtReqCount] = useState(0);
  const [liveProviderPrice, setLiveProviderPrice] = useState<number | null>(null);
  const [liveOpenBarClose,  setLiveOpenBarClose]  = useState<number | null>(null);
  const [liveTickCount,     setLiveTickCount]     = useState<number | null>(null);
  const [liveDupTicks,      setLiveDupTicks]      = useState<number | null>(null);
  const [liveOooTicks,      setLiveOooTicks]      = useState<number | null>(null);
  const [liveBucketSec,     setLiveBucketSec]     = useState<number | null>(null);
  const [cfdDataUnavailable, setCfdDataUnavailable] = useState(false);

  const sidebar = useResizable(260, 200, 400, "left");
  const codeW   = useResizable(380, 280, 700, "left");

  const meta   = STRATEGIES[strategy];
  const online = health?.status === "ok";
  const ibkrOk = health?.ibkr === "connected";

  const checkHealth = useCallback(async () => {
    try { setHealth(await engineClient.getHealth()); } catch { setHealth(null); }
  }, []);
  useEffect(() => { void checkHealth(); }, [checkHealth]);
  useEffect(() => {
    const id = setInterval(() => void checkHealth(), online ? 30_000 : 10_000);
    return () => clearInterval(id);
  }, [checkHealth, online]);

  const BT_STRATEGIES = new Set<Strategy>(["EUR_30M"]);

  const BT_VERSION = "v3";
  const runBacktest = useCallback(async () => {
    const ck = `bt_${strategy}_${assetType}_${BT_VERSION}_${JSON.stringify(params)}_${startDate}_${endDate}`;
    const cached = getCached(ck);
    if (cached) { setResult(cached); return; }

    // Abort any previous in-flight request before starting a new one
    if (btAbortRef.current) { btAbortRef.current.abort(); }
    const controller = new AbortController();
    btAbortRef.current = controller;
    setBtReqCount(c => c + 1);

    setRunning(true); setBtPhase("Lade Daten...");
    try {
      let data: BacktestResult;
      if (BT_STRATEGIES.has(strategy)) {
        const btAsset = assetType;
        const timeout = setTimeout(() => controller.abort(), 120_000);
        setBtPhase("Engine läuft...");
        const r = await fetch("http://localhost:5000/backtest", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy, asset_type: btAsset, params, start_date: startDate, end_date: endDate }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (btAbortRef.current === controller) btAbortRef.current = null;
        setBtPhase("Fertig ✓");
        const raw = await r.json();
        if (raw.error) {
          data = { metrics: {} as BacktestResult["metrics"], equity: [], drawdown: [], trades: [], error: raw.error };
        } else {
          data = {
            metrics: raw.metrics ?? raw,
            equity: raw.equity_curve ?? raw.equity ?? [],
            drawdown: raw.drawdown ?? [],
            buy_hold: raw.buy_hold ?? [],
            trades: (raw.trades ?? []).map((t: Record<string, unknown>) => ({
              entry_date: t.entry_date ?? t.date, dir: t.dir ?? t.direction ?? "long",
              entry: t.entry ?? t.entry_price, exit: t.exit ?? t.exit_price,
              pnl_pct: t.pnl_pct ?? (typeof t.pnl === "number" ? t.pnl / 100000 : 0),
              pnl_pips: t.pnl_pips,
              win: t.win ?? (typeof t.pnl === "number" ? t.pnl > 0 : (t.pnl_pct as number) > 0),
            })),
            equity_dates: raw.equity_dates ?? [],
          };
        }
      } else {
        data = await engineClient.postBacktest({ strategy, asset_type: assetType, params, start_date: startDate, end_date: endDate });
      }
      setResult(data);
      if (!data.error) setCached(ck, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ metrics: {} as BacktestResult["metrics"], equity: [], drawdown: [], trades: [], error: msg.includes("abort") || msg.includes("Abort") ? "Engine-Timeout (120s) — start_all.bat neu starten" : "Engine offline" });
    } finally { setRunning(false); setBtPhase(""); }
  }, [strategy, assetType, params, startDate, endDate]);

  useEffect(() => { setParams(DEFAULT_PARAMS[strategy]); }, [strategy]);

  useEffect(() => {
    if (!showBenchmark || !result || result.error) { setSpyReturns([]); return; }
    const controller = new AbortController();
    fetch(`/api/spy-returns?from=${startDate}&to=${endDate}`, { signal: controller.signal })
      .then(r => r.json())
      .then((data: Array<{date: string; returnPct: number}>) => setSpyReturns(data))
      .catch(() => {});
    return () => controller.abort();
  }, [showBenchmark, result, startDate, endDate]);

  useEffect(() => {
    setBars([]);
    setCfdDataUnavailable(false);
    const gen    = ++barsGenRef.current;
    const ac     = new AbortController();
    const { signal } = ac;

    void (async () => {
      const { monitorSymbol, liveSymbol, interval } = STRATEGIES[strategy];
      const monSym = monitorSymbol ?? liveSymbol;
      const tf     = interval.toUpperCase();
      const asset  = assetType;  // pass directly — no silent cfd→spot proxy

      const loadMonitoringBars = async (): Promise<OhlcBar[]> => {
        const monUrl = `/api/monitoring/ohlc?symbol=${encodeURIComponent(monSym)}&timeframe=${tf}&limit=3000`;
        const monRes = await fetch(monUrl, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]) });
        if (!monRes.ok) return [];
        const monData = await monRes.json() as { bars?: Array<{ time: string; open: number; high: number; low: number; close: number }> };
        const raw = (monData.bars ?? [])
          .map(b => ({ time: Math.floor(new Date(b.time).getTime() / 1000), open: b.open, high: b.high, low: b.low, close: b.close }))
          .filter(b => b.time > 0 && b.open > 0 && b.high >= b.low)
          .sort((a, b) => a.time - b.time);
        // Deduplicate by epoch — "T24:00:00" and "T00:00:00+1d" both parse to the
        // same Unix timestamp; keep the last (higher-quality TV history bar wins
        // after the monitoring route's own priority sort).
        return raw.filter((b, i, arr) => i === arr.length - 1 || b.time !== arr[i + 1].time);
      };

      try {
        const r = await fetch(`http://localhost:5000/chart-data/${strategy}?asset_type=${asset}`, {
          cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
        });
        if (r.ok) {
          const raw = await r.json() as unknown;
          // Check for explicit CFD unavailable declaration from engine
          if ((raw as { data_source_available?: boolean }).data_source_available === false) {
            if (gen === barsGenRef.current) setCfdDataUnavailable(true);
            return;
          }
          const engineBars: OhlcBar[] = Array.isArray(raw)
            ? (raw as OhlcBar[])
            : ((raw as { bars?: OhlcBar[] }).bars ?? []);
          if (engineBars.length) {
            const lastEngineTime = engineBars[engineBars.length - 1].time;
            try {
              const monUrl = `/api/monitoring/ohlc?symbol=${encodeURIComponent(monSym)}&timeframe=${tf}&limit=500`;
              const monRes = await fetch(monUrl, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
              if (monRes.ok) {
                const monData = await monRes.json() as { bars?: Array<{ time: string; open: number; high: number; low: number; close: number }> };
                const gapBars: OhlcBar[] = (monData.bars ?? [])
                  .map(b => ({ time: Math.floor(new Date(b.time).getTime() / 1000), open: b.open, high: b.high, low: b.low, close: b.close }))
                  .filter(b => b.time > lastEngineTime && b.open > 0 && b.high >= b.low);
                if (gen === barsGenRef.current) setBars([...engineBars, ...gapBars]);
                return;
              }
            } catch { /* gap fill unavailable */ }
            if (gen === barsGenRef.current) setBars(engineBars);
            return;
          }
        }
      } catch { /* Python engine offline */ }

      try {
        const monBars = await loadMonitoringBars();
        if (monBars.length && gen === barsGenRef.current) { setBars(monBars); return; }
      } catch { /* no monitoring data */ }
    })();

    return () => { ac.abort(); };
  }, [strategy, assetType]);

  useEffect(() => {
    if (!codePanel) return;
    void fetch(`http://localhost:5000/strategy-code/${strategy}`)
      .then(r => r.json()).then(d => setStrategyCode((d as { code?: string }).code ?? "")).catch(() => undefined);
  }, [codePanel, strategy]);

  useEffect(() => {
    void engineClient.getSignal(strategy).then(setSignal).catch(() => undefined);
    const id = setInterval(() => void engineClient.getSignal(strategy).then(setSignal).catch(() => undefined), 30_000);
    return () => clearInterval(id);
  }, [strategy]);

  const trades  = result?.trades ?? [];
  const metrics = result?.metrics as Record<string, number> | undefined;
  const emaFast = Number(params.ema_fast ?? 20);
  const emaSlow = Number(params.ema_slow ?? 50);
  const hasData = bars.length > 0;
  const hasResult = !!result && !result.error;

  const emaFastData = useMemo(() => {
    if (!bars.length) return [];
    const vals = calcEma(bars.map(b => b.close), emaFast);
    return bars.map((b, i) => ({ time: b.time, value: vals[i] }));
  }, [bars, emaFast]);
  const emaSlowData = useMemo(() => {
    if (!bars.length) return [];
    const vals = calcEma(bars.map(b => b.close), emaSlow);
    return bars.map((b, i) => ({ time: b.time, value: vals[i] }));
  }, [bars, emaSlow]);
  const chartTrades = useMemo(() =>
    trades.filter(t => t.entry_date).map(t => ({
      time: Math.floor(new Date(t.entry_date!).getTime() / 1000),
      win: t.win, dir: t.dir ?? t.direction ?? "long", pnlPct: t.pnl_pct, pnlPips: t.pnl_pips,
    })).sort((a, b) => a.time - b.time), [trades]);
  const spyCumulative = useMemo(() => {
    if (!spyReturns.length) return [] as Array<{date: string; cum: number}>;
    let eq = 1.0;
    return spyReturns.map(({ date, returnPct }) => {
      eq *= (1 + returnPct / 100);
      return { date, cum: eq };
    });
  }, [spyReturns]);

  const equityData = useMemo(() => {
    if (!result?.equity?.length) return [];
    const first = result.equity[0] ?? 0;
    const isAbsolute = first > 1000;
    let spyBase: number | null = null;
    if (spyCumulative.length > 0) {
      const firstDate = (result.equity_dates?.[0] ?? "").slice(0, 10);
      spyBase = findClosestSpyCum(spyCumulative, firstDate) ?? spyCumulative[0].cum;
    }
    return result.equity.map((v, i) => {
      const y = isAbsolute ? ((v / first) - 1) * 100 : v;
      const bh = result.buy_hold?.[i] != null
        ? (isAbsolute ? ((result.buy_hold[i]! / (result.buy_hold[0] ?? first)) - 1) * 100 : result.buy_hold[i]!)
        : null;
      const x = (result.equity_dates?.[i] ?? "").slice(0, 7);
      let spy: number | null = null;
      if (spyBase !== null && spyCumulative.length > 0) {
        const dateStr = (result.equity_dates?.[i] ?? "").slice(0, 10);
        const spyVal = findClosestSpyCum(spyCumulative, dateStr);
        if (spyVal !== null) spy = (spyVal / spyBase - 1) * 100;
      }
      return { y, bh, spy, x };
    });
  }, [result, spyCumulative]);
  const ddData = useMemo(() => {
    if (!result?.drawdown?.length) return [];
    return result.drawdown.map((v, i) => ({ dd: v, x: (result.equity_dates?.[i] ?? "").slice(0, 7) }));
  }, [result]);

  // Buy-hold drawdown for benchmark overlay in drawdown chart
  const bhDdData = useMemo(() => {
    if (!result?.buy_hold?.length) return [];
    const first = result.buy_hold[0] ?? 1;
    let peak = first;
    return result.buy_hold.map((v, i) => {
      if (v > peak) peak = v;
      const dd = peak > 0 ? ((v - peak) / peak) * 100 : 0;
      return { time: (result.equity_dates?.[i] ?? "").slice(0, 7), value: dd };
    });
  }, [result]);
  const spyDdData = useMemo(() => {
    if (!spyCumulative.length || !result?.equity_dates?.length) return [];
    const firstDate = (result.equity_dates[0] ?? "").slice(0, 10);
    const lastDate  = (result.equity_dates[result.equity_dates.length - 1] ?? "").slice(0, 10);
    const slice = spyCumulative.filter(s => s.date >= firstDate && s.date <= lastDate);
    if (!slice.length) return [];
    const base = slice[0].cum;
    let peak = base;
    return slice.map(({ date, cum }) => {
      if (cum > peak) peak = cum;
      const dd = (cum / peak - 1) * 100;
      return { time: date.slice(0, 7), value: dd };
    });
  }, [spyCumulative, result?.equity_dates]);

  const spyMaxDD = useMemo(() => {
    if (spyDdData.length > 0) return Math.min(0, ...spyDdData.map(d => d.value));
    if (!result?.buy_hold?.length) return 0;
    let peak = result.buy_hold[0] ?? 1;
    let maxDD = 0;
    for (const v of result.buy_hold) {
      if (v > peak) peak = v;
      const dd = peak > 0 ? ((v - peak) / peak) * 100 : 0;
      if (dd < maxDD) maxDD = dd;
    }
    return maxDD;
  }, [spyDdData, result?.buy_hold]);

  const spyTotalReturn = useMemo(() => {
    if (!spyCumulative.length || !result?.equity_dates?.length) return null;
    const firstDate = (result.equity_dates[0] ?? "").slice(0, 10);
    const lastDate  = (result.equity_dates[result.equity_dates.length - 1] ?? "").slice(0, 10);
    const base = findClosestSpyCum(spyCumulative, firstDate) ?? spyCumulative[0].cum;
    const last = findClosestSpyCum(spyCumulative, lastDate) ?? spyCumulative[spyCumulative.length - 1].cum;
    if (!base || !last) return null;
    return (last / base - 1) * 100;
  }, [spyCumulative, result?.equity_dates]);

  const computedMetrics = useMemo<Record<string, number>>(() => {
    if (!metrics) return {} as Record<string, number>;
    const wr    = (metrics.winRate ?? 0) / 100;
    const avgW  = metrics.avgWin  ?? 0;
    const avgL  = metrics.avgLoss ?? 0;
    const totRet = metrics.totalReturn ?? metrics.cagr ?? 0;
    const maxDD  = metrics.maxDD ?? 0;
    const expectancy     = wr * avgW + (1 - wr) * Math.abs(avgL) * (avgL < 0 ? -1 : 1);
    const recoveryFactor = maxDD !== 0 ? Math.abs(totRet / maxDD) : 0;
    return { expectancy, recoveryFactor };
  }, [metrics]);

  const allMetrics = useMemo<Record<string, number>>(
    () => ({ ...(metrics ?? {}), ...computedMetrics }),
    [metrics, computedMetrics],
  );

  const sortedTrades = useMemo(() => {
    const arr = [...trades].reverse();
    if (!sortCol || sortCol === "#") return sortAsc ? [...arr].reverse() : arr;
    const sorted = [...arr].sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortCol === "Date")  { va = a.entry_date ?? ""; vb = b.entry_date ?? ""; }
      if (sortCol === "Pips")  { va = a.pnl_pips ?? 0;    vb = b.pnl_pips ?? 0; }
      if (sortCol === "PnL")   { va = a.pnl_pct ?? 0;     vb = b.pnl_pct ?? 0; }
      if (sortCol === "Entry") { va = a.entry ?? 0;       vb = b.entry ?? 0; }
      if (sortCol === "Exit")  { va = a.exit ?? 0;        vb = b.exit ?? 0; }
      if (typeof va === "string") return va.localeCompare(vb as string);
      return (va as number) - (vb as number);
    });
    return sortAsc ? sorted : sorted.reverse();
  }, [trades, sortCol, sortAsc]);

  const setP = useCallback((k: string, v: number | string) => setParams(p => ({ ...p, [k]: v })), []);
  const setZeitraum = useCallback((y: number | null) => {
    const end = new Date().toISOString().slice(0, 10);
    setEndDate(end);
    setDatePreset(y);
    if (y === null) { setStartDate("2007-01-01"); return; }
    const d = new Date(); d.setFullYear(d.getFullYear() - y);
    setStartDate(d.toISOString().slice(0, 10));
  }, []);
  const handleSort = useCallback((col: string) => {
    setSortCol(prev => { if (prev === col) { setSortAsc(a => !a); return col; } setSortAsc(false); return col; });
  }, []);
  const exportCSV = useCallback(() => {
    if (!trades.length) return;
    const headers = ["#","Date","Direction","Entry","Exit","Pips","PnL%"];
    const rows = [...trades].reverse().map((t, i) => [i + 1, t.entry_date ?? "", t.dir ?? t.direction ?? "long", t.entry?.toFixed(5) ?? "", t.exit?.toFixed(5) ?? "", t.pnl_pips?.toFixed(1) ?? "", (t.pnl_pct * 100).toFixed(2)]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `trades_${strategy}_${startDate}_${endDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [trades, strategy, startDate, endDate]);


  const sigColor = signal.direction === "long" ? TXT : signal.direction === "short" ? GOLD : DIM;
  const sigLabel =
    signal.status === "signal_ready"
      ? (signal.direction === "long" ? "LONG" : "SHORT")
      : signal.status === "signal_failed"
        ? "ENGINE ERROR"
        : "NO SIGNAL";
  const assetSym = assetType === "futures" ? meta.futures : meta.cfd;

  return (
    <LiveQuotesProvider>
      <span data-testid="engine-backtest-request-count" style={{display:'none'}}>{btReqCount}</span>
      <InjectPillCss />
      <style>{`
        @keyframes espin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        input[type=range]{-webkit-appearance:none;height:2px;background:${BORDER};border-radius:2px;outline:none;width:100%;cursor:pointer}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:${GOLD};cursor:pointer}
        input[type=number]{-moz-appearance:textfield}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.4);cursor:pointer}
        select option{background:#1a1a1f}

        .e-root{display:flex;flex-direction:column;height:100%;width:100%;background:transparent;overflow:hidden;color:${TXT};font-family:${M};gap:10px;padding:10px}
        .e-top-row{display:flex;flex:1;min-height:0;gap:10px}
        .e-bottom-row{display:flex;flex:1;min-height:0;gap:10px}

        .e-chart-outer{flex:1;min-width:0;position:relative;display:flex;flex-direction:column;overflow:hidden}
        .e-chart-body{flex:1;position:relative;min-height:0;overflow:visible}

        .chart-overlay-btn{width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(15,15,19,0.68);border:1px solid rgba(255,255,255,0.09);border-radius:7px;color:rgba(255,255,255,0.38);cursor:pointer;transition:color .15s,border-color .15s,background .15s;backdrop-filter:blur(6px);flex-shrink:0}
        .chart-overlay-btn:hover{color:rgba(255,255,255,0.82);border-color:rgba(255,255,255,0.20);background:rgba(255,255,255,0.06)}
        .chart-overlay-btn.active{color:rgba(255,255,255,0.90);border-color:rgba(255,255,255,0.24);background:rgba(255,255,255,0.08)}

        /* Hover TF pills overlay */
        .tf-hover-zone{position:absolute;bottom:32px;left:8px;z-index:25;display:flex;gap:3px;opacity:0;transition:opacity .2s ease;pointer-events:none}
        .tf-pill{pointer-events:auto;padding:3px 8px !important;font-size:10px !important}
        .e-chart-outer:hover .tf-hover-zone{opacity:1}

        .e-tester-wrap{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
        .e-strategy-wrap{flex-shrink:0;position:relative;display:flex;flex-direction:column;overflow:hidden}
        .e-params-wrap{flex-shrink:0;position:relative;display:flex;flex-direction:column;overflow:hidden}
        .e-sidebar-resize{position:absolute;top:0;left:0;width:3px;height:100%;cursor:col-resize;z-index:5}
        .e-sidebar-resize:hover{background:${GOLD}40}

        .e-codepanel{flex-shrink:0;background:${CARD_BG};border:1px solid ${BORDER};border-radius:10px;display:flex;flex-direction:column;overflow:hidden;position:relative}
        .e-code-resize{position:absolute;top:0;left:0;width:3px;height:100%;cursor:col-resize;z-index:5}
        .e-code-resize:hover{background:${GOLD}40}

        .e-tester-head{display:flex;align-items:center;min-height:64px;height:64px;flex-shrink:0;border-bottom:1px solid ${BORDER};padding:0 16px;gap:8px}
        .e-tester-body{flex:1;overflow:hidden;display:flex}

        .e-charts-col{display:flex;flex-direction:column;overflow:hidden;border-right:1px solid ${BORDER};padding:0 2px 4px 0;flex:1;min-width:0}
        .e-kpi-col{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(6,1fr);gap:7px;padding:10px;width:clamp(340px,28%,430px);flex-shrink:0;height:100%;box-sizing:border-box;overflow:hidden;align-self:stretch}
        .e-kpi-col .kpi-ec{min-height:0!important;height:100%}
        .e-run-btn{display:flex;align-items:center;justify-content:center;gap:5px;border-radius:999px;padding:5px 16px;font-size:10px;font-weight:600;cursor:pointer;border:1.5px solid transparent;min-width:108px;background:linear-gradient(to bottom,#26262d,#111114);border-color:rgba(255,255,255,0.28);color:${TXT};flex-shrink:0;transition:opacity .15s}
        .e-run-btn:hover{border-color:rgba(255,255,255,0.38)}
        .e-run-btn:disabled{opacity:0.55;cursor:default}

        .icon-btn{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid ${BORDER};border-radius:5px;background:none;color:#888;cursor:pointer;transition:color .15s,border-color .15s;flex-shrink:0}
        .icon-btn:hover,.icon-btn.active{color:${GOLD};border-color:rgba(214,178,74,0.35)}

        .sl{font-size:10px;font-weight:700;color:rgba(180,192,210,0.5);letter-spacing:.1em;text-transform:uppercase;margin:0 0 10px;font-family:${M}}
        .strat-btn{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;color:${MUT};background:none;border:none;width:100%;text-align:left;transition:background .15s,color .15s}
        .strat-btn:hover{background:rgba(255,255,255,0.03);color:${TXT}}
        .strat-btn.on{color:${TXT};background:rgba(255,255,255,0.06)}

        .trade-tbl{width:100%;border-collapse:collapse}
        .trade-tbl th{padding:6px 8px;font-size:9px;color:${DIM};font-weight:600;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid ${BORDER};text-align:left;position:sticky;top:0;background:#1a1a1f;cursor:pointer;user-select:none;white-space:nowrap;font-family:${M}}
        .trade-tbl th:hover{color:${MUT}}
        .trade-tbl td{padding:4px 8px;font-size:11px;font-family:var(--font-numbers)}

        .tbtn{background:none;border:1px solid ${BORDER};color:${DIM};padding:4px 8px;border-radius:4px;cursor:pointer;font-size:10px;transition:all .12s;display:flex;align-items:center;gap:4px}
        .tbtn:hover{color:${TXT};border-color:rgba(255,255,255,0.12)}
        .tbtn.active{color:${GOLD};border-color:rgba(214,178,74,0.3)}

        .settings-drop{position:absolute;top:32px;right:0;background:linear-gradient(to bottom,#26262d,#111114);border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;z-index:20;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,0.7)}

        .pill{padding:3px 10px;border-radius:4px;font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;border:1px solid transparent;font-family:${M}}
        .pill.on{color:#F3F3F4;background:linear-gradient(to bottom,#26262d,#111114);border-color:rgba(255,255,255,0.28)}
        .pill:not(.on){color:#6a6e7a}
        .pill:not(.on):hover{color:${MUT}}

        .params-scroll::-webkit-scrollbar{display:none}
      `}</style>

      <div className="e-root">
        {/* ── Main: content columns + optional right code panel ── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 10 }}>
        {/* ── Content: Top row + Bottom row stacked ── */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 10 }}>
        {/* ── Top row: Chart + Strategy ── */}
        <div className="e-top-row">
          {/* Chart */}
          <div className="e-chart-outer" style={{ ...BOX_STYLE }}>
            {/* Overlay buttons */}
            <div style={{ position: "absolute", top: 8, right: 70, zIndex: 20, display: "flex", gap: 4 }}>
              <button className={`chart-overlay-btn${codePanel ? " active" : ""}`} onClick={() => setCodePanel(p => !p)} title="Strategy Code">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                </svg>
              </button>
              <div style={{ position: "relative" }}>
                <button className={`chart-overlay-btn${showSettings ? " active" : ""}`} onClick={() => setShowSettings(s => !s)} title="Engine Settings">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
                    <circle cx="7" cy="6" r="2.2" fill="currentColor" stroke="none"/>
                    <circle cx="14" cy="12" r="2.2" fill="currentColor" stroke="none"/>
                    <circle cx="7" cy="18" r="2.2" fill="currentColor" stroke="none"/>
                  </svg>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: online ? "#4ade80" : FAINT, position: "absolute", top: 3, right: 3, boxShadow: online ? "0 0 4px rgba(74,222,128,0.5)" : "none" }} />
                </button>
                {showSettings && (
                  <div className="settings-drop" style={{ top: 34 }}>
                    <div style={{ fontSize: 10, color: DIM, marginBottom: 8, letterSpacing: ".06em", textTransform: "uppercase" }}>Engine Status</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: online ? TXT : FAINT }} />
                      <span style={{ fontSize: 11, color: online ? TXT : DIM }}>{online ? "Online" : "Offline"}</span>
                    </div>
                    {online && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: ibkrOk ? GOLD : FAINT }} />
                        <span style={{ fontSize: 11, color: MUT }}>IBKR {ibkrOk ? `connected${health?.paper_mode ? " (Paper)" : ""}` : "disconnected"}</span>
                      </div>
                    )}
                    {!online && <div style={{ fontSize: 10, color: DIM, marginTop: 6 }}>Start Desktop\start.bat</div>}
                    <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 8, paddingTop: 8, fontSize: 10, color: FAINT }}>localhost:5000</div>
                  </div>
                )}
              </div>
            </div>

            {/* Chart body */}
            <div className="e-chart-body">
              {/* Diagnostic testids — hidden, for automated browser tests */}
              {!headerHidden
                ? <span data-testid="engine-global-header-visible" style={{display:'none'}} />
                : <span data-testid="engine-global-header-hidden"  style={{display:'none'}} />
              }
              <span data-testid="engine-active-asset-id"            style={{display:'none'}}>{assetType}</span>
              <span data-testid="engine-active-provider-symbol"     style={{display:'none'}}>{meta.liveSymbol}</span>
              <span data-testid="engine-chart-last-bar"             style={{display:'none'}}>{bars.at(-1)?.time ?? 0}</span>
              <span data-testid="engine-chart-data-hash"            style={{display:'none'}}>{bars.length}:{bars.at(-1)?.time ?? 0}</span>
              <span data-testid="engine-live-provider-price"        style={{display:'none'}}>{liveProviderPrice ?? ''}</span>
              <span data-testid="engine-live-open-bar-close"        style={{display:'none'}}>{liveOpenBarClose ?? ''}</span>
              <span data-testid="engine-backtest-trade-count"       style={{display:'none'}}>{metrics?.trades ?? ''}</span>
              <span data-testid="engine-active-strategy"            style={{display:'none'}}>{strategy}</span>
              {/* Extended price-line / diagnostics testids */}
              <span data-testid="engine-live-price-line"            style={{display:'none'}}>{liveProviderPrice ?? ''}</span>
              <span data-testid="engine-live-price-match"           style={{display:'none'}}>
                {liveProviderPrice != null && liveOpenBarClose != null
                  ? String(Math.abs(liveProviderPrice - liveOpenBarClose) < 0.00002)
                  : ''}
              </span>
              <span data-testid="engine-live-bucket"                style={{display:'none'}}>{liveBucketSec ?? ''}</span>
              <span data-testid="engine-live-tick-count"            style={{display:'none'}}>{liveTickCount ?? ''}</span>
              <span data-testid="engine-live-missing-buckets"       style={{display:'none'}}>{''}</span>
              <span data-testid="engine-live-duplicate-ticks"       style={{display:'none'}}>{liveDupTicks ?? ''}</span>
              <span data-testid="engine-live-out-of-order-ticks"    style={{display:'none'}}>{liveOooTicks ?? ''}</span>
              <span data-testid="engine-live-provider-symbol"       style={{display:'none'}}>{meta.liveSymbol}</span>
              <span data-testid="engine-live-source-status"         style={{display:'none'}}>
                {cfdDataUnavailable ? 'data_unavailable' : online ? 'ok' : 'offline'}
              </span>
              <span data-testid="engine-rendered-entry-count"       style={{display:'none'}}>{chartTrades.length}</span>
              <span data-testid="engine-rendered-exit-count"        style={{display:'none'}}>{trades.filter(t => t.exit_date != null).length}</span>
              {cfdDataUnavailable ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  height: '100%', gap: 12, color: '#6b7280',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', letterSpacing: '.08em', fontFamily: 'var(--font-montserrat)' }}>
                    DATA UNAVAILABLE
                  </div>
                  <div style={{ fontSize: 10.5, color: '#4b5563', textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
                    No real CFD data source for {strategy}.<br />
                    Switch to <strong style={{color:'#6b7280'}}>Futures</strong> to view historical data.
                  </div>
                  <span data-testid="engine-cfd-unavailable" style={{display:'none'}}>true</span>
                </div>
              ) : hasData ? (
                <ChartComponent
                  key={`${strategy}-${meta.interval}`}
                  data={bars} signal={signal} trades={chartTrades}
                  emaFastData={emaFastData} emaSlowData={emaSlowData}
                  showEma={meta.useEma && (showEmaFast || showEmaSlow)} showEmaFast={showEmaFast} showEmaSlow={showEmaSlow}
                  initialBars={30}
                  visibleDays={chartDays}
                  liveSymbol={meta.liveSymbol} timeframe={meta.interval.toUpperCase()}
                  symbol={assetSym} name={meta.name} exchange={meta.exchange} icon={meta.icon}
                  priceDecimals={meta.priceDecimals}
                  onLivePriceUpdate={(pp, obc) => { setLiveProviderPrice(pp); setLiveOpenBarClose(obc); }}
                  onLiveDiagnostics={(stats) => {
                    setLiveTickCount(stats.tickCount);
                    setLiveDupTicks(stats.dupTicks);
                    setLiveOooTicks(stats.oooTicks);
                    setLiveBucketSec(stats.currentBucketSec);
                  }}
                />
              ) : (
                <NoData text={online ? "Loading chart data..." : "Start engine to load chart"} />
              )}
            </div>

            {/* TF hover overlay */}
            <div className="tf-hover-zone">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf.label}
                  className={`rc-pill ${chartDays === tf.days ? "rc-active" : "rc-inactive"} tf-pill`}
                  onClick={() => setChartDays(tf.days)}
                >{tf.label}</button>
              ))}
            </div>
          </div>

          {/* Strategy wrap */}
          <div className="e-strategy-wrap" style={{ width: sidebar.w, ...BOX_STYLE }}>
            <div className="e-sidebar-resize" onMouseDown={sidebar.onMouseDown} />
            {/* Header */}
            <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#f5f7fa", fontFamily: M, letterSpacing: ".03em" }}>Strategy</span>
            </div>
            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "8px 10px" }}>
              {(Object.keys(STRATEGIES) as Strategy[]).map((id, idx, arr) => {
                const s = STRATEGIES[id];
                const active = strategy === id;
                const sym = assetType === "futures" ? s.futures : s.cfd;
                return (
                  <div key={id}>
                    <button onClick={() => { setBars([]); setStrategy(id); router.replace(`/engine?strategy=${id}`, { scroll: false }); }} className={`strat-btn${active ? " on" : ""}`}>
                      <Image src={s.icon} alt="" width={32} height={32} style={{ borderRadius: 6, flexShrink: 0, marginTop: 1 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: active ? 600 : 500, color: active ? TXT : MUT, lineHeight: 1.25, fontFamily: "var(--font-numbers)" }}>{sym}</div>
                        <div style={{ fontSize: 9.5, color: FAINT, marginTop: 2, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {assetType === "futures" ? `${s.name} · ${s.exchange}` : s.cfdName}
                        </div>
                        <div style={{ fontSize: 8.5, color: active ? "rgba(180,192,210,0.4)" : "rgba(107,114,128,0.6)", marginTop: 4, letterSpacing: ".04em", fontFamily: M, textTransform: "uppercase" }}>{s.category}</div>
                      </div>
                    </button>
                    {idx < arr.length - 1 && (
                      <div style={{ height: 1, background: "rgba(255,255,255,0.045)", margin: "0 10px" }} />
                    )}
                  </div>
                );
              })}
              {/* Asset Type */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                <div className="sl">Asset Type</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span onClick={() => setAssetType("futures")} className={`pill${assetType === "futures" ? " on" : ""}`}>Futures</span>
                  <span onClick={() => setAssetType("cfd")} className={`pill${assetType === "cfd" ? " on" : ""}`}>CFD</span>
                </div>
                {assetType === "futures" && (
                  <div style={{ fontSize: 8.5, color: DIM, marginTop: 5, lineHeight: 1.4 }}>
                    Exploration only · Production: {STRATEGIES[strategy].cfd}
                  </div>
                )}
              </div>
              {/* Date Range */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                <div className="sl">Date Range</div>
                <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                  {([1, 3, 5, null] as (number | null)[]).map(y => (
                    <span key={y ?? "max"} onClick={() => setZeitraum(y)} className={`pill${datePreset === y ? " on" : ""}`} style={{ cursor: "pointer" }}>{y ? `${y}Y` : "Max"}</span>
                  ))}
                </div>
                {([["From", startDate, setStartDate], ["To", endDate, setEndDate]] as [string, string, (v: string) => void][]).map(([lbl, val, setter]) => (
                  <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 9, color: FAINT, width: 28, flexShrink: 0 }}>{lbl}</span>
                    <input type="date" value={val} onChange={e => setter(e.target.value)}
                      style={{ flex: 1, fontSize: 9, background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, color: MUT, outline: "none", padding: "2px 0", fontFamily: "var(--font-numbers)" }} />
                  </div>
                ))}
              </div>
            </div>
            {/* Fade bottom */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: "linear-gradient(to bottom, transparent, #0a0a0c)", pointerEvents: "none" }} />
          </div>
        </div>

        {/* ── Bottom row: Tester + Params ── */}
        <div className="e-bottom-row">
          {/* Tester */}
          <div className="e-tester-wrap" style={{ ...BOX_STYLE }}>
            <div className="e-tester-head">
              {TAB_LABELS.map(t => (
                <PillButton
                  key={t.key}
                  active={testerTab === t.key}
                  label={t.label}
                  icon={tabIcon(t.key)}
                  onClick={() => setTesterTab(t.key)}
                  padding="7px 13px"
                  fontSize={11}
                />
              ))}
              <div style={{ flex: 1 }} />
              {/* Benchmark toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 7, userSelect: "none" }} title="S&P 500 Benchmark">
                <span onClick={e => e.stopPropagation()}>
                  <ToggleSwitchRef on={showBenchmark} onChange={() => setShowBenchmark(v => !v)} />
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/invest/spy.png" alt="S&P" onClick={() => setShowBenchmark(v => !v)} style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover", opacity: showBenchmark ? 1 : 0.45, flexShrink: 0, cursor: "pointer" }} />
                <span onClick={() => setShowBenchmark(v => !v)} style={{ fontSize: 10.5, fontWeight: 600, color: showBenchmark ? TXT : DIM, fontFamily: M, cursor: "pointer" }}>S&P</span>
              </div>
              <span style={{ fontSize: 10, color: FAINT, fontFamily: "var(--font-numbers)", flexShrink: 0, marginLeft: 8 }}>
                {hasResult ? `${trades.length} Trades · ${startDate.slice(0, 4)}–${endDate.slice(0, 4)}` : hasData ? `${bars.length.toLocaleString()} Kerzen geladen` : ""}
              </span>
              <button className="e-run-btn" onClick={() => void runBacktest()} disabled={running} style={{ marginLeft: 8 }}>
                {running ? (
                  <>
                    <svg style={{ animation: "espin .8s linear infinite", flexShrink: 0 }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-18 0" strokeLinecap="round"/></svg>
                    Running...
                  </>
                ) : "Run Backtest"}
              </button>
            </div>

            <div className="e-tester-body">
              {result?.error ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <span style={{ fontSize: 11, color: DIM }}>{result.error}</span>
                  <button className="e-run-btn" onClick={() => { setResult(null); void runBacktest(); }}>Retry</button>
                </div>
              ) : !hasResult && !running && testerTab === "overview" ? (
                /* ── Empty state before first backtest ── */
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 14, background: KPI_BG, border: `1px solid ${BORDER}` }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  </div>
                  <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TXT, fontFamily: M }}>Run your first backtest</span>
                    <span style={{ fontSize: 11, color: DIM, fontFamily: M, maxWidth: 280 }}>Configure parameters in the panel on the right, then click Run Backtest to see the equity curve, drawdown, and KPIs.</span>
                  </div>
                  <button className="e-run-btn" onClick={() => void runBacktest()}>Run Backtest</button>
                </div>
              ) : testerTab === "overview" ? (
                <>
                  <div className="e-charts-col">
                    {hasResult && equityData.length > 0 ? (
                      <>
                        <div style={{ flex: 30, minHeight: 0, overflow: "hidden" }}>
                          <EngineEquityChart data={equityData} showBenchmark={showBenchmark} metrics={metrics} />
                        </div>
                        <div style={{ flex: 70, minHeight: 0, overflow: "hidden" }}>
                          {showBenchmark && spyDdData.length > 0 && <span data-testid="engine-sp500-drawdown-series" style={{display:'none'}} />}
                          {showBenchmark && equityData.some(d => d.spy != null) && <span data-testid="engine-sp500-equity-series" style={{display:'none'}} />}
                          <ReferenceDrawdownChart
                            data={ddData.map(d => ({ time: d.x as string, value: d.dd as number }))}
                            maxDrawdownPercent={Math.abs(Math.min(0, ...ddData.map(d => d.dd as number)))}
                            avgDrawdownPercent={Math.abs(ddData.filter(d => (d.dd as number) < 0).reduce((s, d) => s + (d.dd as number), 0) / Math.max(ddData.filter(d => (d.dd as number) < 0).length, 1))}
                            benchmarkData={showBenchmark ? (spyDdData.length > 0 ? spyDdData : bhDdData.length > 0 ? bhDdData : undefined) : undefined}
                          />
                        </div>
                      </>
                    ) : (
                      <NoData text="Run backtest to see equity curve" />
                    )}
                  </div>
                  {/* KPI column — 2×6 grid, compact inline cards */}
                  <div className="e-kpi-col" {...(showBenchmark && hasResult ? { "data-testid": "engine-sp500-kpi-values" } : {})}>
                    {TESTER_KPIS.map(kpi => {
                      const val = allMetrics?.[kpi.key] ?? 0;
                      const valueStr = running ? "…" : hasResult ? kpi.fmt(val) : "—";
                      const isNegative = hasResult && kpi.getColor(val) === GOLD;
                      const valueColor = isNegative ? GOLD : TXT;
                      const spyDiff = showBenchmark && hasResult && kpi.key === "maxDD" && spyMaxDD !== 0
                        ? `S&P ${spyMaxDD.toFixed(1)}%`
                        : showBenchmark && hasResult && kpi.key === "totalReturn" && spyTotalReturn !== null
                        ? `S&P ${spyTotalReturn >= 0 ? "+" : ""}${spyTotalReturn.toFixed(1)}%`
                        : null;
                      return (
                        <div
                          key={kpi.key}
                          style={{
                            display: "flex", flexDirection: "column", justifyContent: "space-between",
                            padding: "7px 10px", borderRadius: 14,
                            border: `1px solid ${BORDER}`,
                            background: KPI_BG,
                            overflow: "hidden", minHeight: 0, height: "100%", boxSizing: "border-box",
                          }}
                        >
                          <span style={{ fontSize: 10, fontWeight: 600, color: MUT, letterSpacing: ".05em", textTransform: "uppercase", fontFamily: M, lineHeight: 1 }}>
                            {kpi.label}
                          </span>
                          <strong style={{ fontSize: 18, fontWeight: 700, color: valueColor, fontFamily: "var(--font-numbers)", fontVariantNumeric: "tabular-nums", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {valueStr}
                          </strong>
                          {spyDiff && (
                            <span style={{ fontSize: 9, color: DIM, fontFamily: "var(--font-numbers)", lineHeight: 1 }}>{spyDiff}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : testerTab === "performance" ? (
                <div style={{ flex: 1, overflow: "auto" }}>
                  {hasResult ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: 12 }}>
                      {PERF_ROWS.map(kpi => (
                        <KpiCardRef
                          key={kpi.key}
                          label={kpi.label}
                          value={hasResult ? kpi.fmt(metrics?.[kpi.key] ?? 0) : "—"}
                          height={72}
                        />
                      ))}
                    </div>
                  ) : <NoData text="Run backtest to see performance" />}
                </div>
              ) : testerTab === "trades" ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", padding: "6px 10px", gap: 8, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: DIM }}>{trades.length} trades</span>
                    <div style={{ flex: 1 }} />
                    {trades.length > 0 && <button onClick={exportCSV} className="tbtn">CSV Export</button>}
                  </div>
                  {trades.length > 0 ? (
                    <div style={{ flex: 1, overflowY: "auto" }}>
                      <table className="trade-tbl"><thead><tr>
                        {["#", "Date", "D", "Entry", "Exit", "Pips", "PnL"].map(h => (
                          <th key={h} onClick={() => handleSort(h)} style={{ color: sortCol === h ? GOLD : undefined }}>
                            {h}{sortCol === h ? (sortAsc ? " ▲" : " ▼") : ""}
                          </th>
                        ))}
                      </tr></thead><tbody>
                        {sortedTrades.slice(0, 500).map((t: TradeRecord, i) => {
                          const dir = t.dir ?? t.direction ?? "long";
                          const rowIdx = trades.length - trades.indexOf(t);
                          return (<tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                            <td style={{ color: FAINT }}>{rowIdx}</td>
                            <td style={{ color: DIM }}>{(t.entry_date ?? "").slice(0, 10)}</td>
                            <td style={{ fontWeight: 600, color: dir === "short" ? GOLD : TXT, fontSize: 10 }}>{dir === "short" ? "S" : "L"}</td>
                            <td style={{ color: MUT }}>{t.entry?.toFixed(4)}</td>
                            <td style={{ color: MUT }}>{t.exit?.toFixed(4) ?? "—"}</td>
                            <td style={{ textAlign: "right", color: MUT }}>{t.pnl_pips != null ? `${(t.pnl_pips ?? 0) > 0 ? "+" : ""}${t.pnl_pips.toFixed(0)}p` : "—"}</td>
                            <td style={{ textAlign: "right", color: (t.pnl_pct ?? 0) >= 0 ? TXT : GOLD, fontWeight: 500 }}>{(t.pnl_pct ?? 0) >= 0 ? "+" : ""}{(t.pnl_pct * 100).toFixed(2)}%</td>
                          </tr>);
                        })}
                      </tbody></table>
                    </div>
                  ) : <NoData text="Run backtest to see trades" />}
                </div>
              ) : /* settings */ (
                <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 480 }}>
                    <div>
                      <label style={{ fontSize: 9, color: DIM, letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Start Date</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                        style={{ width: "100%", fontSize: 11, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, color: TXT, padding: "6px 10px", borderRadius: 4, outline: "none", fontFamily: "var(--font-numbers)" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 9, color: DIM, letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>End Date</label>
                      <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                        style={{ width: "100%", fontSize: 11, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, color: TXT, padding: "6px 10px", borderRadius: 4, outline: "none", fontFamily: "var(--font-numbers)" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                    {([1, 3, 5, null] as (number | null)[]).map(y => (
                      <button key={y ?? "max"} onClick={() => setZeitraum(y)} className={`tbtn${datePreset === y ? " active" : ""}`} style={{ fontSize: 10, fontWeight: 600 }}>{y ? `${y}Y` : "Max"}</button>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 480, marginTop: 20 }}>
                    <div>
                      <label style={{ fontSize: 9, color: DIM, letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Initial Capital</label>
                      <div style={{ fontSize: 13, color: TXT, fontFamily: "var(--font-numbers)", fontWeight: 600, padding: "6px 0" }}>100.000 EUR</div>
                    </div>
                    <div>
                      <label style={{ fontSize: 9, color: DIM, letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Commission</label>
                      <div style={{ fontSize: 13, color: TXT, fontFamily: "var(--font-numbers)", fontWeight: 600, padding: "6px 0" }}>10 bps</div>
                    </div>
                  </div>
                  <button onClick={() => void runBacktest()} disabled={running}
                    style={{ marginTop: 20, fontSize: 11, fontWeight: 600, color: running ? DIM : TXT, background: "rgba(255,255,255,0.04)", border: `1px solid ${running ? "rgba(255,255,255,0.06)" : BORDER}`, borderRadius: 4, padding: "7px 24px", cursor: running ? "default" : "pointer" }}>
                    Recalculate
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Params wrap */}
          <div className="e-params-wrap" style={{ width: sidebar.w, ...BOX_STYLE }}>
            <div className="e-sidebar-resize" onMouseDown={sidebar.onMouseDown} />
            {/* Header */}
            <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#f5f7fa", fontFamily: M, letterSpacing: ".03em" }}>Parameters</span>
            </div>
            {/* Scrollable content with fade */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
              <div className="params-scroll" style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "12px 14px" }}>
                {meta.useEma && (
                  <>
                    <div className="sl">Indicators</div>
                    {[["EMA Fast", showEmaFast, setShowEmaFast, GOLD_S, String(params.ema_fast)], ["EMA Slow", showEmaSlow, setShowEmaSlow, MUT, String(params.ema_slow)]].map(([label, checked, setter, col, val]) => (
                      <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                        <input type="checkbox" checked={checked as boolean} onChange={e => (setter as (v: boolean) => void)(e.target.checked)} style={{ accentColor: GOLD, width: 13, height: 13, cursor: "pointer" }} />
                        <span style={{ fontSize: 10.5, color: (checked as boolean) ? (col as string) : DIM, flex: 1 }}>{label as string}</span>
                        <span style={{ fontSize: 11, color: TXT, fontFamily: "var(--font-numbers)", fontWeight: 600 }}>{val as string}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, marginBottom: 8, borderTop: `1px solid ${BORDER}` }} />
                  </>
                )}
                <div className="sl">Parameters</div>
                {PARAM_DEFS[strategy].map(def => (
                  <ParamRow key={`${strategy}-${def.key}`} def={def} value={params[def.key] ?? ""} onChange={v => setP(def.key, v)} />
                ))}

                <div style={{ borderTop: `1px solid ${BORDER}`, margin: "10px 0 8px" }} />

                {/* Research Status — shown for strategies with validation data */}
                {STRATEGY_VALIDATION[strategy] && (
                  <>
                    <div className="sl">Research Status</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                      {STRATEGY_VALIDATION[strategy]!.map(badge => {
                        const badgeCol = badge.status === "ok" ? TXT : badge.status === "warn" ? GOLD : badge.status === "fail" ? "#f87171" : DIM;
                        return (
                          <div key={badge.label} title={badge.tooltip ?? ""} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 9, color: FAINT }}>{badge.label}</span>
                            <span style={{ fontSize: 9.5, fontWeight: 600, color: badgeCol, fontFamily: "var(--font-numbers)" }}>{badge.value}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ borderTop: `1px solid ${BORDER}`, margin: "4px 0 8px" }} />
                  </>
                )}

                {/* Live Signal */}
                <div className="sl">Live Signal</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: sigColor, letterSpacing: ".02em", marginBottom: 6 }}>{sigLabel}</div>
                {signal.atr != null && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {([
                      ["Close", signal.close?.toFixed(5), TXT],
                      ["ATR", signal.atr?.toFixed(5), MUT],
                      ["Regime", signal.regime_active ? "Active" : "Off", signal.regime_active ? TXT : DIM],
                    ] as [string, string | undefined, string][]).filter(([, v]) => v).map(([l, v, col]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 9, color: FAINT }}>{l}</span>
                        <span style={{ fontSize: 10, color: col, fontFamily: "var(--font-numbers)" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {meta.useEma && signal.ema_fast_val != null && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {([["EMA Fast", signal.ema_fast_val?.toFixed(5), GOLD_S], ["EMA Slow", signal.ema_slow_val?.toFixed(5), DIM], ["Last Cross", signal.last_cross_date, FAINT]] as [string, string | undefined, string][]).filter(([, v]) => v).map(([l, v, col]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 9, color: FAINT }}>{l}</span>
                        <span style={{ fontSize: 10, color: col, fontFamily: "var(--font-numbers)" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {signal.entry != null && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                    {([["Entry", signal.entry?.toFixed(4), TXT], ["SL", signal.sl?.toFixed(4), GOLD], ["TP", signal.tp?.toFixed(4), TXT]] as [string, string | undefined, string][]).filter(([, v]) => v).map(([l, v, col]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 9, color: FAINT }}>{l}</span>
                        <span style={{ fontSize: 10, color: col, fontFamily: "var(--font-numbers)" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {signal.bt_trades != null && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
                    {([
                      ["BT Trades", String(signal.bt_trades), MUT],
                      ["Sharpe", signal.bt_sharpe?.toFixed(3), MUT],
                      ["PF", signal.bt_pf?.toFixed(3), MUT],
                      ["Win %", signal.bt_win_rate ? `${signal.bt_win_rate.toFixed(1)}%` : undefined, MUT],
                    ] as [string, string | undefined, string][]).filter(([, v]) => v).map(([l, v, col]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 9, color: FAINT }}>{l}</span>
                        <span style={{ fontSize: 10, color: col, fontFamily: "var(--font-numbers)" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Fade bottom */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: "linear-gradient(to bottom, transparent, #0a0a0c)", pointerEvents: "none" }} />
            </div>
          </div>
        </div>

        </div>{/* end e-content */}

        {/* ── Code panel — right side ── */}
        {codePanel && (
          <div className="e-codepanel" data-testid="engine-code-panel" style={{ width: codeW.w, flexShrink: 0 }}>
            <div className="e-code-resize" onMouseDown={codeW.onMouseDown} />
            <div style={{ padding: '8px 14px 8px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9, color: MUT, letterSpacing: '.05em', textTransform: 'uppercase', fontFamily: M }}>Strategy Code</span>
                <span style={{ fontSize: 11, color: TXT, fontFamily: 'var(--font-numbers)', fontWeight: 500 }}>
                  {strategy.toLowerCase()}_strategy.py
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button data-testid="engine-code-panel-copy" onClick={() => { void navigator.clipboard.writeText(strategyCode); }} className="tbtn">Copy</button>
                <button onClick={async () => {
                  setRunning(true);
                  try {
                    const r = await fetch('http://localhost:5000/bt/run-custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: strategyCode, strategy, asset_type: assetType, params }), signal: AbortSignal.timeout(30_000) });
                    const data = await r.json();
                    if (data.error) { setResult({ metrics: {} as BacktestResult["metrics"], equity: [], drawdown: [], trades: [], error: data.error }); }
                    else if (data.equity_curve) { setResult({ metrics: data as BacktestResult["metrics"], equity: data.equity_curve, drawdown: [], trades: [], equity_dates: [] }); }
                  } catch (e) { setResult({ metrics: {} as BacktestResult["metrics"], equity: [], drawdown: [], trades: [], error: e instanceof Error ? e.message : "Error" }); }
                  finally { setRunning(false); }
                }} disabled={running} style={{ fontSize: 10, fontWeight: 600, color: running ? DIM : TXT, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: '4px 14px', cursor: running ? 'default' : 'pointer' }}>
                  {running ? "..." : "Run"}
                </button>
                <button data-testid="engine-code-panel-close" onClick={() => setCodePanel(false)} className="tbtn" style={{ padding: "4px 6px" }}>{"✕"}</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <MonacoEditor height="100%" language="python" theme="vs-dark" value={strategyCode} onChange={v => setStrategyCode(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, wordWrap: 'on' }} />
            </div>
          </div>
        )}
        </div>{/* end e-main */}
      </div>

      {showSettings && <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setShowSettings(false)} />}
    </LiveQuotesProvider>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function findClosestSpyCum(arr: Array<{date: string; cum: number}>, target: string): number | null {
  let result: number | null = null;
  for (const { date, cum } of arr) {
    if (date <= target) result = cum;
    else break;
  }
  return result;
}

function calcEma(closes: number[], span: number): number[] {
  const k = 2 / (span + 1);
  const out: number[] = [];
  for (let i = 0; i < closes.length; i++)
    out.push(i === 0 ? closes[0] : closes[i] * k + out[i - 1] * (1 - k));
  return out;
}
const CACHE_TTL = 30 * 60_000;  // 30 min — server has its own longer cache
function getCached(key: string): BacktestResult | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: BacktestResult; ts: number };
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}
function setCached(key: string, data: BacktestResult) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
function valColor(v: number): string {
  if (v < 0) return GOLD;
  return TXT;
}

// ── ParamRow ───────────────────────────────────────────────────────────────────
function ParamRow({ def, value, onChange }: { def: ParamDef; value: number | string; onChange: (v: number | string) => void }) {
  if (def.type === "select") return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
      <span style={{ fontSize: 10, color: DIM }}>{def.label}</span>
      <select value={value as string} onChange={e => onChange(e.target.value)}
        style={{ fontSize: 11, color: TXT, fontFamily: "var(--font-numbers)", fontWeight: 600, background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, outline: "none", cursor: "pointer" }}>
        {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (def.type === "slider") return (
    <div style={{ padding: "5px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: DIM }}>{def.label}</span>
        <span style={{ fontSize: 11, color: TXT, fontFamily: "var(--font-numbers)", fontWeight: 600 }}>{value}</span>
      </div>
      <input type="range" min={def.min} max={def.max} step={def.step} value={value as number}
        onChange={e => onChange((def.step ?? 1) < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10))} />
    </div>
  );
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
      <span style={{ fontSize: 10, color: DIM }}>{def.label}</span>
      <input type="number" min={def.min} max={def.max} step={def.step} value={value as number}
        onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); }}
        style={{ fontSize: 11, color: TXT, fontFamily: "var(--font-numbers)", fontWeight: 600, background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, outline: "none", width: 72, textAlign: "right" }} />
    </div>
  );
}
