"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  engineClient,
  type EngineHealth,
  type BacktestResult,
  type SignalData,
  type TradeRecord,
} from "@/lib/engine-client";

// ── Types ──────────────────────────────────────────────────────────────────────

type Strategy  = "EUR_30M" | "DAX_1H" | "DAX_2H" | "GC_FRI" | "GLD_THU" | "YM_TAT";
type AssetType = "futures" | "cfd";
type Params    = Record<string, number | string>;

interface StrategyMeta {
  label: string;
  futures: string;
  cfd: string;
  tvFutures: string;
  tvCfd: string;
  tvInterval: string;
  group: "Intraday" | "Anomaly";
  useEma: boolean;
}

const STRATEGIES: Record<Strategy, StrategyMeta> = {
  EUR_30M: { label: "EUR 30M",      futures: "6E",      cfd: "EURUSD",  tvFutures: "FX:EURUSD",      tvCfd: "FX:EURUSD",      tvInterval: "30",  group: "Intraday", useEma: true  },
  DAX_1H:  { label: "DAX 1H",       futures: "FDAX",    cfd: "DE30",    tvFutures: "FOREXCOM:DE30",   tvCfd: "FOREXCOM:DE30",   tvInterval: "60",  group: "Intraday", useEma: true  },
  DAX_2H:  { label: "DAX 2H",       futures: "FDAX",    cfd: "DE30",    tvFutures: "FOREXCOM:DE30",   tvCfd: "FOREXCOM:DE30",   tvInterval: "120", group: "Intraday", useEma: true  },
  GC_FRI:  { label: "GC Friday",    futures: "GC1!",    cfd: "XAUUSD",  tvFutures: "TVC:GOLD",        tvCfd: "TVC:GOLD",        tvInterval: "D",   group: "Anomaly",  useEma: false },
  GLD_THU: { label: "GLD Thursday", futures: "GLD",     cfd: "XAUUSD",  tvFutures: "AMEX:GLD",        tvCfd: "TVC:GOLD",        tvInterval: "D",   group: "Anomaly",  useEma: false },
  YM_TAT:  { label: "YM TAT",       futures: "YM1!",    cfd: "US30",    tvFutures: "TVC:DJI",         tvCfd: "TVC:DJI",         tvInterval: "D",   group: "Anomaly",  useEma: false },
};

// ── Parameter definitions ──────────────────────────────────────────────────────

interface ParamDef {
  key: string;
  label: string;
  type: "slider" | "number" | "select";
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

const DIR_OPTS = [
  { value: "both",  label: "Long & Short" },
  { value: "long",  label: "Long Only"    },
  { value: "short", label: "Short Only"   },
];

const PARAM_DEFS: Record<Strategy, ParamDef[]> = {
  EUR_30M: [
    { key: "ema_fast",      label: "EMA Fast",       type: "slider", min: 5,  max: 100, step: 1      },
    { key: "ema_slow",      label: "EMA Slow",       type: "slider", min: 10, max: 200, step: 1      },
    { key: "sl_pips",       label: "Stop Loss",      type: "number", min: 0.0001, max: 0.01, step: 0.0001 },
    { key: "tp_pips",       label: "Take Profit",    type: "number", min: 0.0001, max: 0.02, step: 0.0001 },
    { key: "direction",     label: "Direction",      type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Start",  type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End",    type: "slider", min: 0, max: 23, step: 1 },
  ],
  DAX_1H: [
    { key: "ema_fast",      label: "EMA Fast",       type: "slider", min: 5,  max: 100, step: 1  },
    { key: "ema_slow",      label: "EMA Slow",       type: "slider", min: 10, max: 200, step: 1  },
    { key: "sl_pts",        label: "SL Points",      type: "number", min: 5,  max: 200, step: 1  },
    { key: "tp_pts",        label: "TP Points",      type: "number", min: 10, max: 500, step: 1  },
    { key: "direction",     label: "Direction",      type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Start",  type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End",    type: "slider", min: 0, max: 23, step: 1 },
  ],
  DAX_2H: [
    { key: "ema_fast",      label: "EMA Fast",       type: "slider", min: 2,  max: 20,  step: 1   },
    { key: "ema_slow",      label: "EMA Slow",       type: "slider", min: 5,  max: 50,  step: 1   },
    { key: "sl_pts",        label: "SL Points",      type: "number", min: 20, max: 300, step: 5   },
    { key: "tp_pts",        label: "TP Points",      type: "number", min: 30, max: 600, step: 5   },
    { key: "direction",     label: "Direction",      type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Start",  type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End",    type: "slider", min: 0, max: 23, step: 1 },
  ],
  GC_FRI: [
    { key: "atr_len",  label: "ATR Length",   type: "slider", min: 5,   max: 30,  step: 1   },
    { key: "sl_mult",  label: "SL Mult",      type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",       label: "R:R Ratio",    type: "slider", min: 1.0, max: 5.0, step: 0.25 },
  ],
  GLD_THU: [
    { key: "atr_len",  label: "ATR Length",   type: "slider", min: 5,   max: 30,  step: 1   },
    { key: "sl_mult",  label: "SL Mult",      type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",       label: "R:R Ratio",    type: "slider", min: 1.0, max: 5.0, step: 0.25 },
  ],
  YM_TAT: [
    { key: "atr_len",  label: "ATR Length",   type: "slider", min: 5,   max: 30,  step: 1   },
    { key: "sl_mult",  label: "SL Mult",      type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",       label: "R:R Ratio",    type: "slider", min: 1.0, max: 5.0, step: 0.25 },
  ],
};

const DEFAULT_PARAMS: Record<Strategy, Params> = {
  EUR_30M: { ema_fast: 20, ema_slow: 50, sl_pips: 0.0013, tp_pips: 0.0039, direction: "both", session_start: 7,  session_end: 17 },
  DAX_1H:  { ema_fast: 20, ema_slow: 50, sl_pts:  35,     tp_pts:  126,    direction: "both", session_start: 8,  session_end: 17 },
  DAX_2H:  { ema_fast: 4,  ema_slow: 20, sl_pts:  50,     tp_pts:  150,    direction: "both", session_start: 8,  session_end: 18 },
  GC_FRI:  { atr_len: 14, sl_mult: 0.75, rr: 1.25 },
  GLD_THU: { atr_len: 14, sl_mult: 1.5,  rr: 2.0  },
  YM_TAT:  { atr_len: 14, sl_mult: 1.0,  rr: 2.0  },
};

// ── Cache (5 min TTL) ──────────────────────────────────────────────────────────

const CACHE_TTL = 5 * 60 * 1_000;

function cacheRead(key: string): BacktestResult | null {
  try {
    const raw = localStorage.getItem(`bt:${key}`);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: BacktestResult };
    return Date.now() - ts < CACHE_TTL ? data : null;
  } catch { return null; }
}

function cacheWrite(key: string, data: BacktestResult) {
  try { localStorage.setItem(`bt:${key}`, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota */ }
}

// ── TradingView widget ─────────────────────────────────────────────────────────

let tvPromise: Promise<void> | null = null;
function loadTV(): Promise<void> {
  if (tvPromise) return tvPromise;
  tvPromise = new Promise((res) => {
    if (document.getElementById("tv-script")) { res(); return; }
    const s = document.createElement("script");
    s.id = "tv-script";
    s.src = "https://s3.tradingview.com/tv.js";
    s.onload = () => res();
    document.head.appendChild(s);
  });
  return tvPromise;
}

function TradingViewChart({ tvSymbol, tvInterval }: { tvSymbol: string; tvInterval: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    void loadTV().then(() => {
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = "";
      // @ts-expect-error global TradingView
      new window.TradingView.widget({
        container_id: ref.current.id,
        symbol: tvSymbol, interval: tvInterval,
        theme: "dark", style: "1", locale: "en",
        toolbar_bg: "#0c0d10", enable_publishing: false,
        allow_symbol_change: false, hide_side_toolbar: false,
        width: "100%", height: "100%",
        hide_top_toolbar: false, save_image: false,
      });
    });
    return () => { cancelled = true; };
  }, [tvSymbol, tvInterval]);
  const id = `tv-${tvSymbol.replace(/[^a-z0-9]/gi, "")}-${tvInterval}`;
  return <div id={id} ref={ref} style={{ width: "100%", height: "100%" }} />;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  panel:   { background: "#131417", border: "1px solid rgba(255,255,255,0.07)" } as const,
  secHead: { fontSize: 8, fontWeight: 700, color: "rgba(113,113,122,1)", letterSpacing: "0.10em", textTransform: "uppercase" as const, marginBottom: 4, marginTop: 10 },
};

// ── KPI definitions ────────────────────────────────────────────────────────────

const KPI_ROWS: { key: keyof BacktestResult["metrics"]; label: string; suffix: string }[] = [
  { key: "cagr",         label: "CAGR",          suffix: "%" },
  { key: "sharpe",       label: "SHARPE",         suffix: "" },
  { key: "maxDD",        label: "MAX DD",         suffix: "%" },
  { key: "calmar",       label: "CALMAR",         suffix: "" },
  { key: "trades",       label: "TRADES",         suffix: "" },
  { key: "winRate",      label: "WIN RATE",       suffix: "%" },
  { key: "profitFactor", label: "PROFIT FACTOR",  suffix: "" },
  { key: "avgWin",       label: "AVG WIN",        suffix: "%" },
  { key: "avgLoss",      label: "AVG LOSS",       suffix: "%" },
  { key: "bestTrade",    label: "BEST",           suffix: "%" },
  { key: "worstTrade",   label: "WORST",          suffix: "%" },
];

function kpiColor(key: string, v: number): string {
  if (key === "cagr")         return v > 10 ? "#34d399" : v > 0 ? "#fbbf24" : "#f87171";
  if (key === "sharpe")       return v > 1  ? "#34d399" : v > 0.5 ? "#fbbf24" : "#f87171";
  if (key === "maxDD")        return v > -10 ? "#34d399" : v > -20 ? "#fbbf24" : "#f87171";
  if (key === "calmar")       return v > 1  ? "#34d399" : v > 0.5 ? "#fbbf24" : "#f87171";
  if (key === "winRate")      return v > 60 ? "#34d399" : v > 50 ? "#fbbf24" : "#f87171";
  if (key === "profitFactor") return v > 1.5 ? "#34d399" : v > 1 ? "#fbbf24" : "#f87171";
  if (key === "avgWin" || key === "bestTrade")  return "#34d399";
  if (key === "avgLoss" || key === "worstTrade") return "#f87171";
  return "rgba(212,212,216,1)";
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TradingEnginePage() {
  const [strategy,    setStrategy]    = useState<Strategy>("EUR_30M");
  const [assetType,   setAssetType]   = useState<AssetType>("futures");
  const [params,      setParams]      = useState<Params>(DEFAULT_PARAMS["EUR_30M"]);
  const [startDate,   setStartDate]   = useState("2019-01-01");
  const [endDate,     setEndDate]     = useState(new Date().toISOString().slice(0, 10));
  const [result,      setResult]      = useState<BacktestResult | null>(null);
  const [isRunning,   setIsRunning]   = useState(false);
  const [signal,      setSignal]      = useState<SignalData>({ direction: "flat" });
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [health,      setHealth]      = useState<EngineHealth | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meta        = STRATEGIES[strategy];
  const tvSymbol    = assetType === "futures" ? meta.tvFutures : meta.tvCfd;

  // ── Health check ─────────────────────────────────────────────────────────────
  const checkHealth = useCallback(async () => {
    try { setHealth(await engineClient.getHealth()); } catch { setHealth(null); }
  }, []);
  useEffect(() => { void checkHealth(); }, [checkHealth]);
  useEffect(() => {
    const id = setInterval(() => void checkHealth(), 30_000);
    return () => clearInterval(id);
  }, [checkHealth]);

  // ── Backtest via POST /backtest ──────────────────────────────────────────────
  const runBacktest = useCallback(async () => {
    const ckey = JSON.stringify({ strategy, assetType, params, startDate, endDate });
    const cached = cacheRead(ckey);
    if (cached) { setResult(cached); return; }

    setIsRunning(true);
    try {
      const data = await engineClient.postBacktest({
        strategy, asset_type: assetType, params, start_date: startDate, end_date: endDate,
      });
      setResult(data);
      if (!data.error) cacheWrite(ckey, data);
    } catch (err) {
      setResult({
        metrics: {} as BacktestResult["metrics"],
        equity: [], drawdown: [], trades: [],
        error: err instanceof Error ? err.message : "Engine offline — starte start.bat",
      });
    } finally {
      setIsRunning(false);
    }
  }, [strategy, assetType, params, startDate, endDate]);

  // Debounce: every param change schedules backtest after 500ms
  const scheduleBacktest = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runBacktest(), 500);
  }, [runBacktest]);

  useEffect(() => { scheduleBacktest(); }, [params, strategy, assetType, startDate, endDate, scheduleBacktest]);

  // Reset params when strategy changes
  useEffect(() => { setParams(DEFAULT_PARAMS[strategy]); }, [strategy]);

  // ── Signal ───────────────────────────────────────────────────────────────────
  const fetchSignal = useCallback(async () => {
    try {
      const data = await engineClient.getSignal(strategy);
      setSignal(data);
      setLastRefresh(new Date());
    } catch { /* keep last */ }
  }, [strategy]);
  useEffect(() => { void fetchSignal(); }, [fetchSignal]);
  useEffect(() => {
    const id = setInterval(() => void fetchSignal(), 30_000);
    return () => clearInterval(id);
  }, [fetchSignal]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!result?.equity?.length) return [];
    return result.equity.map((v, i) => ({
      date:     (result.equity_dates?.[i] ?? "").slice(0, 7),
      strategy: v,
      buyHold:  result.buy_hold?.[i] ?? null,
    }));
  }, [result]);

  const ddData = useMemo(() => {
    if (!result?.drawdown?.length) return [];
    return result.drawdown.map((v, i) => ({
      date: (result.equity_dates?.[i] ?? "").slice(0, 7),
      dd:   v,
    }));
  }, [result]);

  const tradeStrip = useMemo(() => {
    const trades = result?.trades ?? [];
    if (!trades.length) return [];
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    const range = e - s;
    if (range <= 0) return [];
    return trades.slice(-100).map((t) => {
      const d = new Date(t.entry_date ?? startDate).getTime();
      return { ...t, pct: Math.max(0, Math.min(99, (d - s) / range * 100)) };
    });
  }, [result, startDate, endDate]);

  // ── Param helpers ─────────────────────────────────────────────────────────────
  const setParam = useCallback((key: string, value: number | string) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const setZeitraum = useCallback((years: number | null) => {
    const end = new Date().toISOString().slice(0, 10);
    setEndDate(end);
    if (years === null) { setStartDate("2007-01-01"); return; }
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    setStartDate(d.toISOString().slice(0, 10));
  }, []);

  // ── Status banner ─────────────────────────────────────────────────────────────
  const engineOnline = health?.status === "ok";
  const ibkrOk       = health?.ibkr === "connected";
  const bannerBg     = !engineOnline ? "rgba(239,68,68,0.10)" : !ibkrOk ? "rgba(234,179,8,0.08)" : "rgba(16,185,129,0.08)";
  const bannerBorder = !engineOnline ? "rgba(239,68,68,0.25)" : !ibkrOk ? "rgba(234,179,8,0.25)" : "rgba(16,185,129,0.25)";
  const bannerDot    = !engineOnline ? "#ef4444" : !ibkrOk ? "#eab308" : "#10b981";
  const bannerMsg    = !engineOnline
    ? "Engine offline — starte Desktop/start.bat"
    : !ibkrOk
      ? `Engine online${health?.lean === "running" ? " · LEAN aktiv" : ""} · IBKR nicht verbunden`
      : `Engine online · IBKR verbunden${health?.paper_mode ? " (Paper)" : " (Live)"}`;

  // ── Signal badge color ────────────────────────────────────────────────────────
  const sigColor  = signal.direction === "long" ? "#34d399" : signal.direction === "short" ? "#f87171" : "rgba(113,113,122,1)";
  const sigLabel  = signal.direction === "long" ? "LONG ▲" : signal.direction === "short" ? "SHORT ▼" : "FLAT —";

  // ── Last trade for sidebar ────────────────────────────────────────────────────
  const lastTrade = result?.trades?.at(-1) ?? null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden", background: "#0c0d10" }}>
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        input[type=range] { -webkit-appearance: none; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.12); outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:10px; height:10px; border-radius:50%; background:#3b82f6; cursor:pointer; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        select option { background: #1c1d21; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
      `}</style>

      {/* Status Banner */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", background: bannerBg, borderBottom: `1px solid ${bannerBorder}` }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: bannerDot, flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: "rgba(212,212,216,0.9)" }}>{bannerMsg}</span>
        {engineOnline && <span style={{ fontSize: 9, color: "rgba(113,113,122,1)", marginLeft: "auto" }}>localhost:5000</span>}
      </div>

      {/* Main layout */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6, padding: 6 }}>

        {/* ── LEFT 80% ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>

          {/* Chart Panel */}
          <div style={{ ...S.panel, borderRadius: 10, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* Toolbar */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>
                {assetType === "futures" ? meta.futures : meta.cfd}
              </span>
              <span style={{ fontSize: 10, color: "rgba(113,113,122,1)" }}>{meta.label}</span>
              {meta.useEma && signal.ema_fast_val != null && (
                <div style={{ display: "flex", gap: 12, marginLeft: "auto" }}>
                  <span style={{ fontSize: 9, color: "#3b82f6", fontFamily: "monospace" }}>
                    F {signal.ema_fast_val.toFixed(5)}
                  </span>
                  <span style={{ fontSize: 9, color: "#f59e0b", fontFamily: "monospace" }}>
                    S {signal.ema_slow_val?.toFixed(5)}
                  </span>
                  {signal.last_cross_bars != null && (
                    <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>
                      cross {signal.last_cross_bars}b ago
                    </span>
                  )}
                </div>
              )}
              <div style={{
                marginLeft: meta.useEma ? undefined : "auto",
                padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                background: signal.direction === "long" ? "rgba(52,211,153,0.15)" : signal.direction === "short" ? "rgba(248,113,113,0.15)" : "rgba(113,113,122,0.15)",
                color: sigColor,
              }}>{sigLabel}</div>
            </div>

            {/* Trade strip — time-proportional dots */}
            <div style={{ flexShrink: 0, height: 20, position: "relative", background: "rgba(0,0,0,0.25)", borderBottom: "1px solid rgba(255,255,255,0.04)", overflow: "hidden" }}>
              {tradeStrip.map((t, i) => (
                <div key={i} title={`${(t.dir ?? t.direction ?? "long").toUpperCase()} ${t.entry_date ?? ""} ${t.win ? "WIN" : "LOSS"} ${(t.pnl_pct * 100).toFixed(2)}%`}
                  style={{
                    position: "absolute",
                    left: `${t.pct}%`,
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 5, height: 5,
                    borderRadius: "50%",
                    background: t.win ? "#34d399" : "#f87171",
                    opacity: 0.75,
                    cursor: "default",
                  }}
                />
              ))}
              {tradeStrip.length === 0 && (
                <span style={{ position: "absolute", top: "50%", left: 10, transform: "translateY(-50%)", fontSize: 8, color: "rgba(113,113,122,0.5)" }}>
                  Trade-Timeline (nach Backtest)
                </span>
              )}
            </div>

            {/* TradingView widget */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <TradingViewChart key={`${tvSymbol}-${meta.tvInterval}`} tvSymbol={tvSymbol} tvInterval={meta.tvInterval} />
            </div>
          </div>

          {/* Strategy Tester */}
          <div style={{ ...S.panel, borderRadius: 10, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* Tester Header */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(212,212,216,1)", letterSpacing: "0.04em" }}>
                  STRATEGY TESTER — {meta.label}
                </span>
                {isRunning && (
                  <div style={{ width: 10, height: 10, border: "2px solid #3b82f6", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                )}
                {result?.source && !isRunning && (
                  <span style={{ fontSize: 8, color: "rgba(113,113,122,1)" }}>{result.source} · {result.bars} bars</span>
                )}
              </div>
              <button onClick={() => void runBacktest()} style={{ fontSize: 9, color: "rgba(161,161,170,1)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>
                ↻ Run
              </button>
            </div>

            {/* Tester content */}
            {result?.error ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, color: "#f87171" }}>{result.error}</span>
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 0 }}>

                {/* Charts — left 65% */}
                <div style={{ flex: "0 0 65%", display: "flex", flexDirection: "column", minHeight: 0, padding: "4px 0 4px 4px", gap: 0 }}>
                  {/* Equity chart */}
                  <div style={{ flex: 7, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 6, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 8, fill: "rgba(113,113,122,1)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 8, fill: "rgba(113,113,122,1)" }} tickLine={false} axisLine={false} width={40} tickFormatter={v => `${v.toFixed(0)}`} />
                        <Tooltip
                          contentStyle={{ background: "#1c1d21", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 9 }}
                          labelStyle={{ color: "rgba(161,161,170,1)" }}
                          formatter={(v: unknown, name: unknown) => [`${Number(v).toFixed(2)}`, name === "strategy" ? "Strategy" : "Buy & Hold"]}
                        />
                        <Line type="monotone" dataKey="strategy" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
                        <Line type="monotone" dataKey="buyHold"  stroke="#52525b" dot={false} strokeWidth={1} strokeDasharray="4 2" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Drawdown chart */}
                  <div style={{ flex: 3, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={ddData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 7, fill: "rgba(113,113,122,0.6)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 7, fill: "rgba(113,113,122,0.6)" }} tickLine={false} axisLine={false} width={40} tickFormatter={v => `${v.toFixed(0)}%`} />
                        <Tooltip
                          contentStyle={{ background: "#1c1d21", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 9 }}
                          formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, "Drawdown"]}
                        />
                        <Area type="monotone" dataKey="dd" stroke="#f87171" fill="rgba(248,113,113,0.15)" strokeWidth={1} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* KPIs + trades — right 35% */}
                <div style={{ flex: "0 0 35%", display: "flex", flexDirection: "column", minHeight: 0, padding: "4px", overflowY: "auto" }}>
                  {/* KPI grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                    {KPI_ROWS.map(({ key, label, suffix }) => {
                      const raw = (result?.metrics as Record<string, number> | undefined)?.[key] ?? 0;
                      const val = Number(raw);
                      const disp = suffix === "%" ? `${val > 0 && key !== "maxDD" && key !== "avgLoss" && key !== "worstTrade" ? "+" : ""}${val}%` : String(val);
                      return (
                        <div key={key} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 5, padding: "4px 6px", border: "1px solid rgba(255,255,255,0.05)" }}>
                          <div style={{ fontSize: 7, color: "rgba(113,113,122,1)", letterSpacing: "0.06em", marginBottom: 1 }}>{label}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: kpiColor(key, val) }}>{disp}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Trade list */}
                  {(result?.trades?.length ?? 0) > 0 && (
                    <div style={{ marginTop: 6, overflowY: "auto", maxHeight: 180, borderRadius: 4, border: "1px solid rgba(255,255,255,0.05)" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
                        <thead>
                          <tr style={{ position: "sticky", top: 0, background: "#131417" }}>
                            {["#","Date","D","Entry","Exit","PnL%"].map(h => (
                              <th key={h} style={{ padding: "3px 4px", textAlign: h === "PnL%" ? "right" : "left", color: "rgba(113,113,122,1)", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.07)", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...(result?.trades ?? [])].reverse().slice(0, 100).map((t: TradeRecord, i, arr) => {
                            const dir = t.dir ?? t.direction ?? "long";
                            const pnl = (t.pnl_pct * 100).toFixed(2);
                            const c   = t.win ? "#34d399" : "#f87171";
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                <td style={{ padding: "2px 4px", color: "rgba(113,113,122,1)" }}>{(result?.trades?.length ?? 0) - i}</td>
                                <td style={{ padding: "2px 4px", color: "rgba(161,161,170,1)", fontFamily: "monospace" }}>{(t.entry_date ?? "").slice(5)}</td>
                                <td style={{ padding: "2px 4px", color: dir === "short" ? "#f87171" : "#34d399", fontWeight: 700 }}>{dir === "short" ? "S" : "L"}</td>
                                <td style={{ padding: "2px 4px", color: "rgba(161,161,170,1)", fontFamily: "monospace" }}>{t.entry?.toFixed(4)}</td>
                                <td style={{ padding: "2px 4px", color: "rgba(161,161,170,1)", fontFamily: "monospace" }}>{t.exit?.toFixed(4) ?? "—"}</td>
                                <td style={{ padding: "2px 4px", color: c, textAlign: "right", fontFamily: "monospace" }}>{t.win ? "+" : ""}{pnl}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT 20% Sidebar ─────────────────────────────────────────────── */}
        <div style={{ ...S.panel, borderRadius: 10, width: 200, flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto", padding: "8px 8px 12px" }}>

          {/* STRATEGY */}
          <div style={S.secHead}>Strategy</div>
          {(Object.keys(STRATEGIES) as Strategy[]).map(id => (
            <StratBtn key={id} id={id} active={strategy === id} assetType={assetType} onClick={() => setStrategy(id)} />
          ))}

          {/* ASSET TYPE */}
          <div style={S.secHead}>Asset Type</div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["futures", "cfd"] as AssetType[]).map(t => (
              <button key={t} onClick={() => setAssetType(t)} style={{
                flex: 1, padding: "4px 0", borderRadius: 5, fontSize: 9, fontWeight: assetType === t ? 700 : 400,
                background: assetType === t ? "rgba(255,255,255,0.12)" : "transparent",
                border: assetType === t ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
                color: assetType === t ? "#fff" : "rgba(113,113,122,1)", cursor: "pointer",
              }}>
                {t === "futures" ? assetType === t ? meta.futures : "Futures" : assetType === t ? meta.cfd : "CFD"}
              </button>
            ))}
          </div>

          {/* ZEITRAUM */}
          <div style={S.secHead}>Zeitraum</div>
          <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
            {([1, 3, 5, null] as (number | null)[]).map(y => (
              <button key={y ?? "max"} onClick={() => setZeitraum(y)} style={{
                flex: 1, padding: "3px 0", borderRadius: 4, fontSize: 8, fontWeight: 600,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(161,161,170,1)", cursor: "pointer",
              }}>
                {y ? `${y}J` : "Max"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 8, color: "rgba(113,113,122,1)", width: 26, flexShrink: 0 }}>Von</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ flex: 1, fontSize: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(212,212,216,1)", borderRadius: 4, padding: "2px 4px" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 8, color: "rgba(113,113,122,1)", width: 26, flexShrink: 0 }}>Bis</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                style={{ flex: 1, fontSize: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(212,212,216,1)", borderRadius: 4, padding: "2px 4px" }} />
            </div>
          </div>

          {/* PARAMETER */}
          <div style={S.secHead}>Parameter</div>
          {PARAM_DEFS[strategy].map(def => (
            <ParamInput key={`${strategy}-${def.key}`} def={def} value={params[def.key] ?? ""} onChange={v => setParam(def.key, v)} />
          ))}

          {/* SIGNAL */}
          <div style={S.secHead}>Current Signal</div>
          <div style={{ textAlign: "center", padding: "6px 0 8px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: sigColor, letterSpacing: "0.04em" }}>{sigLabel}</div>
          </div>
          {meta.useEma && signal.ema_fast_val != null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[
                ["EMA Fast",  signal.ema_fast_val?.toFixed(5), "#3b82f6"],
                ["EMA Slow",  signal.ema_slow_val?.toFixed(5), "#f59e0b"],
              ].map(([l, v, c]) => (
                <div key={l as string} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>{l}</span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: c as string }}>{v as string}</span>
                </div>
              ))}
              {signal.last_cross_date && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>Last Cross</span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(161,161,170,1)" }}>{signal.last_cross_date}</span>
                </div>
              )}
            </div>
          )}
          {signal.entry != null && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {[
                ["Entry", signal.entry?.toFixed(signal.entry > 100 ? 2 : 5), "rgba(212,212,216,1)"],
                ["SL",    signal.sl?.toFixed(signal.entry > 100 ? 2 : 5),    "#f87171"],
                ["TP",    signal.tp?.toFixed(signal.entry > 100 ? 2 : 5),    "#34d399"],
              ].map(([l, v, c]) => v && (
                <div key={l as string} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>{l}</span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: c as string }}>{v as string}</span>
                </div>
              ))}
            </div>
          )}

          {/* Refresh info */}
          <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 8, color: "rgba(113,113,122,0.7)" }}>
              {lastRefresh ? lastRefresh.toLocaleTimeString() : "—"}
            </span>
            <button onClick={() => void fetchSignal()} style={{ fontSize: 8, color: "rgba(113,113,122,1)", background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, padding: "1px 5px", cursor: "pointer" }}>↻</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── StratBtn ──────────────────────────────────────────────────────────────────

function StratBtn({ id, active, assetType, onClick }: {
  id: Strategy; active: boolean; assetType: AssetType; onClick: () => void;
}) {
  const meta  = STRATEGIES[id];
  const asset = assetType === "futures" ? meta.futures : meta.cfd;
  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", padding: "4px 7px", borderRadius: 5, marginBottom: 2,
      border: active ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent",
      background: active ? "rgba(255,255,255,0.10)" : "transparent",
      color: active ? "#fff" : "rgba(161,161,170,1)",
      fontSize: 10, fontWeight: active ? 700 : 400, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <span>{meta.label}</span>
      <span style={{ fontSize: 8, color: active ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.18)", fontFamily: "monospace" }}>{asset}</span>
    </button>
  );
}

// ── ParamInput ────────────────────────────────────────────────────────────────

function ParamInput({ def, value, onChange }: {
  def: ParamDef; value: number | string; onChange: (v: number | string) => void;
}) {
  const base: React.CSSProperties = { fontSize: 9, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(212,212,216,1)", borderRadius: 3 };

  if (def.type === "select") {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
        <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>{def.label}</span>
        <select value={value as string} onChange={e => onChange(e.target.value)}
          style={{ ...base, padding: "2px 4px", cursor: "pointer" }}>
          {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  if (def.type === "slider") {
    return (
      <div style={{ padding: "3px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>{def.label}</span>
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(212,212,216,1)" }}>{value}</span>
        </div>
        <input type="range" min={def.min} max={def.max} step={def.step}
          value={value as number}
          onChange={e => {
            const n = (def.step ?? 1) < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
            onChange(n);
          }}
          style={{ width: "100%", accentColor: "#3b82f6" }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>{def.label}</span>
      <input type="number" min={def.min} max={def.max} step={def.step}
        value={value as number}
        onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); }}
        style={{ ...base, width: 70, padding: "2px 4px", fontFamily: "monospace" }}
      />
    </div>
  );
}
