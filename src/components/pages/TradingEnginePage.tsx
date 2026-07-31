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

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:       "#0A0A0A",
  card:     "#111111",
  border:   "#1F1F1F",
  gold:     "#C9A84C",
  positive: "#22C55E",
  negative: "#EF4444",
  neutral:  "#6B7280",
  white:    "#FFFFFF",
  dim:      "#9CA3AF",
};

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
  EUR_30M: { label: "EUR 30M",      futures: "6E",   cfd: "EURUSD",  tvFutures: "FX:EURUSD",      tvCfd: "FX:EURUSD",      tvInterval: "30",  group: "Intraday", useEma: true  },
  DAX_1H:  { label: "DAX 1H",       futures: "FDAX", cfd: "DE30",    tvFutures: "FOREXCOM:DE30",   tvCfd: "FOREXCOM:DE30",  tvInterval: "60",  group: "Intraday", useEma: true  },
  DAX_2H:  { label: "DAX 2H",       futures: "FDAX", cfd: "DE30",    tvFutures: "FOREXCOM:DE30",   tvCfd: "FOREXCOM:DE30",  tvInterval: "120", group: "Intraday", useEma: true  },
  GC_FRI:  { label: "GC Friday",    futures: "GC1!", cfd: "XAUUSD",  tvFutures: "TVC:GOLD",        tvCfd: "TVC:GOLD",       tvInterval: "D",   group: "Anomaly",  useEma: false },
  GLD_THU: { label: "GLD Thursday", futures: "GLD",  cfd: "XAUUSD",  tvFutures: "AMEX:GLD",        tvCfd: "TVC:GOLD",       tvInterval: "D",   group: "Anomaly",  useEma: false },
  YM_TAT:  { label: "YM TAT",       futures: "YM1!", cfd: "US30",    tvFutures: "TVC:DJI",         tvCfd: "TVC:DJI",        tvInterval: "D",   group: "Anomaly",  useEma: false },
};

// ── Parameter definitions ──────────────────────────────────────────────────────
interface ParamDef {
  key: string; label: string;
  type: "slider" | "number" | "select";
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
    { key: "ema_fast",      label: "EMA Fast",       type: "slider", min: 5,  max: 100, step: 1      },
    { key: "ema_slow",      label: "EMA Slow",       type: "slider", min: 10, max: 200, step: 1      },
    { key: "sl_pips",       label: "Stop Loss",      type: "number", min: 0.0001, max: 0.01, step: 0.0001 },
    { key: "tp_pips",       label: "Take Profit",    type: "number", min: 0.0001, max: 0.02, step: 0.0001 },
    { key: "direction",     label: "Direction",      type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Start h",type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End h",  type: "slider", min: 0, max: 23, step: 1 },
  ],
  DAX_1H: [
    { key: "ema_fast",      label: "EMA Fast",       type: "slider", min: 5,  max: 100, step: 1  },
    { key: "ema_slow",      label: "EMA Slow",       type: "slider", min: 10, max: 200, step: 1  },
    { key: "sl_pts",        label: "SL Points",      type: "number", min: 5,  max: 200, step: 1  },
    { key: "tp_pts",        label: "TP Points",      type: "number", min: 10, max: 500, step: 1  },
    { key: "direction",     label: "Direction",      type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Start h",type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End h",  type: "slider", min: 0, max: 23, step: 1 },
  ],
  DAX_2H: [
    { key: "ema_fast",      label: "EMA Fast",       type: "slider", min: 2,  max: 20,  step: 1   },
    { key: "ema_slow",      label: "EMA Slow",       type: "slider", min: 5,  max: 50,  step: 1   },
    { key: "sl_pts",        label: "SL Points",      type: "number", min: 20, max: 300, step: 5   },
    { key: "tp_pts",        label: "TP Points",      type: "number", min: 30, max: 600, step: 5   },
    { key: "direction",     label: "Direction",      type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Start h",type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End h",  type: "slider", min: 0, max: 23, step: 1 },
  ],
  GC_FRI:  [
    { key: "atr_len", label: "ATR Length",  type: "slider", min: 5,   max: 30,  step: 1    },
    { key: "sl_mult", label: "SL Mult",     type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",      label: "R:R Ratio",   type: "slider", min: 1.0, max: 5.0, step: 0.25 },
  ],
  GLD_THU: [
    { key: "atr_len", label: "ATR Length",  type: "slider", min: 5,   max: 30,  step: 1    },
    { key: "sl_mult", label: "SL Mult",     type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",      label: "R:R Ratio",   type: "slider", min: 1.0, max: 5.0, step: 0.25 },
  ],
  YM_TAT:  [
    { key: "atr_len", label: "ATR Length",  type: "slider", min: 5,   max: 30,  step: 1    },
    { key: "sl_mult", label: "SL Mult",     type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",      label: "R:R Ratio",   type: "slider", min: 1.0, max: 5.0, step: 0.25 },
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

// ── Cache (localStorage, 5 min) ────────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1_000;

function getCacheKey(strategy: string, assetType: string, params: Params, start: string, end: string) {
  return `bt_${strategy}_${assetType}_${JSON.stringify(params)}_${start}_${end}`;
}
function getCache(key: string): BacktestResult | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const { data, timestamp } = JSON.parse(item) as { data: BacktestResult; timestamp: number };
    if (Date.now() - timestamp > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}
function setCache(key: string, data: BacktestResult) {
  try { localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() })); } catch { /* quota */ }
}

// ── TradingView widget ─────────────────────────────────────────────────────────
let tvPromise: Promise<void> | null = null;
function loadTV(): Promise<void> {
  if (tvPromise) return tvPromise;
  tvPromise = new Promise((res) => {
    if (document.getElementById("tv-script")) { res(); return; }
    const s = document.createElement("script");
    s.id = "tv-script"; s.src = "https://s3.tradingview.com/tv.js";
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
      // @ts-expect-error TradingView global
      new window.TradingView.widget({
        container_id: ref.current.id,
        symbol: tvSymbol, interval: tvInterval,
        theme: "dark", style: "1", locale: "en",
        toolbar_bg: C.bg, enable_publishing: false,
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

// ── KPI config ─────────────────────────────────────────────────────────────────
const KPI_ROWS: { key: keyof BacktestResult["metrics"]; label: string; suffix: string }[] = [
  { key: "cagr",         label: "CAGR",         suffix: "%" },
  { key: "sharpe",       label: "SHARPE",        suffix: ""  },
  { key: "maxDD",        label: "MAX DD",        suffix: "%" },
  { key: "calmar",       label: "CALMAR",        suffix: ""  },
  { key: "trades",       label: "TRADES",        suffix: ""  },
  { key: "winRate",      label: "WIN RATE",      suffix: "%" },
  { key: "profitFactor", label: "PROFIT FACTOR", suffix: ""  },
  { key: "avgWin",       label: "AVG WIN",       suffix: "%" },
  { key: "avgLoss",      label: "AVG LOSS",      suffix: "%" },
  { key: "bestTrade",    label: "BEST",          suffix: "%" },
  { key: "worstTrade",   label: "WORST",         suffix: "%" },
];

function kpiDot(key: string, v: number): string {
  if (key === "cagr")         return v > 10  ? C.positive : v > 0    ? C.gold     : C.negative;
  if (key === "sharpe")       return v > 1   ? C.positive : v > 0.5  ? C.gold     : C.negative;
  if (key === "maxDD")        return v > -10 ? C.positive : v > -20  ? C.gold     : C.negative;
  if (key === "calmar")       return v > 1   ? C.positive : v > 0.5  ? C.gold     : C.negative;
  if (key === "winRate")      return v > 60  ? C.positive : v > 50   ? C.gold     : C.negative;
  if (key === "profitFactor") return v > 1.5 ? C.positive : v > 1    ? C.gold     : C.negative;
  if (key === "avgWin"  || key === "bestTrade")  return C.positive;
  if (key === "avgLoss" || key === "worstTrade") return C.negative;
  return C.neutral;
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
  const engineOnline = health?.status === "ok";

  // ── Health check (10s retry when offline, 30s when online) ───────────────────
  const checkHealth = useCallback(async () => {
    try { setHealth(await engineClient.getHealth()); } catch { setHealth(null); }
  }, []);

  useEffect(() => { void checkHealth(); }, [checkHealth]);

  useEffect(() => {
    const interval = engineOnline ? 30_000 : 10_000;
    const id = setInterval(() => void checkHealth(), interval);
    return () => clearInterval(id);
  }, [checkHealth, engineOnline]);

  // ── Backtest ──────────────────────────────────────────────────────────────────
  const runBacktest = useCallback(async () => {
    const ckey = getCacheKey(strategy, assetType, params, startDate, endDate);
    const cached = getCache(ckey);
    if (cached) { setResult(cached); return; }

    setIsRunning(true);
    try {
      const data = await engineClient.postBacktest({
        strategy, asset_type: assetType, params, start_date: startDate, end_date: endDate,
      });
      setResult(data);
      if (!data.error) setCache(ckey, data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isOffline = msg.includes("fetch") || msg.includes("connect") || msg.includes("network");
      setResult({
        metrics: {} as BacktestResult["metrics"],
        equity: [], drawdown: [], trades: [],
        error: isOffline
          ? "Engine offline — starte Desktop\\start.bat und warte 5 Sekunden"
          : msg.includes("Timeout") || msg.includes("30000")
            ? "Backtest Timeout — Zeitraum verkürzen oder Engine neu starten"
            : msg,
      });
    } finally {
      setIsRunning(false);
    }
  }, [strategy, assetType, params, startDate, endDate]);

  const scheduleBacktest = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runBacktest(), 500);
  }, [runBacktest]);

  useEffect(() => { scheduleBacktest(); }, [params, strategy, assetType, startDate, endDate, scheduleBacktest]);

  // Reset params when strategy changes
  useEffect(() => { setParams(DEFAULT_PARAMS[strategy]); }, [strategy]);

  // ── Signal ────────────────────────────────────────────────────────────────────
  const fetchSignal = useCallback(async () => {
    try {
      const data = await engineClient.getSignal(strategy);
      setSignal(data);
      setLastRefresh(new Date());
    } catch { /* keep last valid */ }
  }, [strategy]);

  useEffect(() => { void fetchSignal(); }, [fetchSignal]);
  useEffect(() => {
    const id = setInterval(() => void fetchSignal(), 30_000);
    return () => clearInterval(id);
  }, [fetchSignal]);

  // ── Chart data ────────────────────────────────────────────────────────────────
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
    return trades.slice(-120).map(t => ({
      ...t,
      pct: Math.max(0, Math.min(99, (new Date(t.entry_date ?? startDate).getTime() - s) / range * 100)),
    }));
  }, [result, startDate, endDate]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const setParam = useCallback((key: string, v: number | string) => {
    setParams(prev => ({ ...prev, [key]: v }));
  }, []);

  const setZeitraum = useCallback((years: number | null) => {
    const end = new Date().toISOString().slice(0, 10);
    setEndDate(end);
    if (years === null) { setStartDate("2007-01-01"); return; }
    const d = new Date(); d.setFullYear(d.getFullYear() - years);
    setStartDate(d.toISOString().slice(0, 10));
  }, []);

  // ── Signal display ────────────────────────────────────────────────────────────
  const sigColor = signal.direction === "long" ? C.positive : signal.direction === "short" ? C.negative : C.neutral;
  const sigLabel = signal.direction === "long" ? "LONG ▲" : signal.direction === "short" ? "SHORT ▼" : "FLAT —";

  // ── Banner ────────────────────────────────────────────────────────────────────
  const ibkrOk    = health?.ibkr === "connected";
  const bannerDot = !engineOnline ? C.negative : !ibkrOk ? C.gold : C.positive;
  const bannerMsg = !engineOnline
    ? "Engine offline — starte Desktop\\start.bat"
    : !ibkrOk
      ? `Engine online${health?.lean === "running" ? " · LEAN aktiv" : ""} · IBKR nicht verbunden`
      : `Engine online · IBKR verbunden${health?.paper_mode ? " (Paper)" : " (Live)"}`;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden", background: C.bg, color: C.white, fontFamily: "system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        input[type=range] { -webkit-appearance: none; height: 2px; border-radius: 2px; background: ${C.border}; outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:10px; height:10px; border-radius:50%; background:${C.gold}; cursor:pointer; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        select { cursor: pointer; }
        select option { background: ${C.card}; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        .strat-btn:hover { color: ${C.white} !important; border-color: ${C.neutral} !important; }
        .zeitraum-btn:hover { color: ${C.gold} !important; }
      `}</style>

      {/* Banner */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", borderBottom: `1px solid ${C.border}`, background: C.card }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: bannerDot, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: C.dim }}>{bannerMsg}</span>
        {engineOnline && <span style={{ fontSize: 9, color: C.neutral, marginLeft: "auto" }}>localhost:5000</span>}
      </div>

      {/* Main */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6, padding: 6 }}>

        {/* ── Left 80% ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>

          {/* Chart panel */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            {/* Chart toolbar */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.white, letterSpacing: "-0.01em" }}>
                {assetType === "futures" ? meta.futures : meta.cfd}
              </span>
              <span style={{ fontSize: 10, color: C.neutral }}>{meta.label}</span>
              {meta.useEma && signal.ema_fast_val != null && (
                <div style={{ display: "flex", gap: 12, marginLeft: "auto", alignItems: "center" }}>
                  <span style={{ fontSize: 9, fontFamily: "monospace" }}>
                    <span style={{ color: C.neutral }}>F </span>
                    <span style={{ color: C.gold }}>{signal.ema_fast_val.toFixed(5)}</span>
                  </span>
                  <span style={{ fontSize: 9, fontFamily: "monospace" }}>
                    <span style={{ color: C.neutral }}>S </span>
                    <span style={{ color: C.dim }}>{signal.ema_slow_val?.toFixed(5)}</span>
                  </span>
                  {signal.last_cross_bars != null && (
                    <span style={{ fontSize: 8, color: C.neutral }}>cross {signal.last_cross_bars}b ago</span>
                  )}
                </div>
              )}
              <div style={{
                marginLeft: meta.useEma ? undefined : "auto",
                padding: "2px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                color: sigColor, background: "transparent",
                border: `1px solid ${sigColor}22`,
              }}>
                {sigLabel}
              </div>
            </div>

            {/* Trade strip */}
            <div style={{ flexShrink: 0, height: 18, position: "relative", background: `${C.bg}80`, borderBottom: `1px solid ${C.border}`, overflow: "hidden" }}>
              {tradeStrip.map((t, i) => (
                <div key={i}
                  title={`${(t.dir ?? t.direction ?? "long").toUpperCase()} | ${t.entry_date ?? ""} | ${t.win ? "WIN" : "LOSS"} | ${(t.pnl_pct * 100).toFixed(2)}%`}
                  style={{
                    position: "absolute", left: `${t.pct}%`, top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 4, height: 4, borderRadius: "50%",
                    background: t.win ? C.positive : C.negative,
                    opacity: 0.8,
                  }}
                />
              ))}
              {tradeStrip.length === 0 && (
                <span style={{ position: "absolute", top: "50%", left: 10, transform: "translateY(-50%)", fontSize: 8, color: `${C.neutral}60` }}>
                  Trade-Timeline (nach Backtest)
                </span>
              )}
            </div>

            {/* TV widget */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <TradingViewChart key={`${tvSymbol}-${meta.tvInterval}`} tvSymbol={tvSymbol} tvInterval={meta.tvInterval} />
            </div>
          </div>

          {/* Strategy Tester */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            {/* Tester header */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, letterSpacing: "0.08em" }}>
                  STRATEGY TESTER — {meta.label}
                </span>
                {isRunning && (
                  <div style={{ width: 10, height: 10, border: `2px solid ${C.gold}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                )}
                {result?.source && !isRunning && (
                  <span style={{ fontSize: 8, color: C.neutral }}>{result.source} · {result.bars?.toLocaleString()} bars</span>
                )}
              </div>
              <button onClick={() => void runBacktest()} style={{
                fontSize: 9, color: C.neutral, background: "none",
                border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 9px", cursor: "pointer",
              }}>
                ↻ Run
              </button>
            </div>

            {/* Error state */}
            {result?.error ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: C.negative }}>{result.error}</span>
                {!engineOnline && (
                  <span style={{ fontSize: 9, color: C.neutral }}>
                    Automatischer Retry in 10s...
                  </span>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, display: "flex" }}>

                {/* Charts 65% */}
                <div style={{ flex: "0 0 65%", display: "flex", flexDirection: "column", minHeight: 0, padding: "4px 0 4px 4px" }}>
                  {/* Equity chart */}
                  <div style={{ flex: 7, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 7.5, fill: C.neutral }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 7.5, fill: C.neutral }} tickLine={false} axisLine={false} width={42} tickFormatter={v => `${Number(v).toFixed(0)}`} />
                        <Tooltip
                          contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 9 }}
                          labelStyle={{ color: C.dim }}
                          formatter={(v: unknown, name: unknown) => [
                            `${Number(v).toFixed(2)}`,
                            name === "strategy" ? "Strategie" : "Buy & Hold",
                          ]}
                        />
                        <Line type="monotone" dataKey="strategy" stroke={C.gold}    dot={false} strokeWidth={1.5} />
                        <Line type="monotone" dataKey="buyHold"  stroke={C.neutral} dot={false} strokeWidth={1} strokeDasharray="4 2" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Drawdown chart */}
                  <div style={{ flex: 3, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={ddData} margin={{ top: 2, right: 4, left: -22, bottom: 0 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 7, fill: `${C.neutral}80` }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 7, fill: `${C.neutral}80` }} tickLine={false} axisLine={false} width={42} tickFormatter={v => `${Number(v).toFixed(0)}%`} />
                        <Tooltip
                          contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 9 }}
                          formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, "Drawdown"]}
                        />
                        <Area type="monotone" dataKey="dd" stroke={C.negative} fill={`${C.negative}18`} strokeWidth={1} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* KPIs + Trade list 35% */}
                <div style={{ flex: "0 0 35%", display: "flex", flexDirection: "column", minHeight: 0, padding: "4px", overflowY: "auto" }}>
                  {/* KPI grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                    {KPI_ROWS.map(({ key, label, suffix }) => {
                      const raw = (result?.metrics as Record<string, number> | undefined)?.[key] ?? 0;
                      const val = Number(raw);
                      const isNeg = key === "maxDD" || key === "avgLoss" || key === "worstTrade";
                      const sign = !isNeg && val > 0 && suffix === "%" ? "+" : "";
                      return (
                        <div key={key} style={{ background: `${C.bg}80`, borderRadius: 5, padding: "4px 7px", border: `1px solid ${C.border}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                            <div style={{ width: 4, height: 4, borderRadius: "50%", background: kpiDot(key, val), flexShrink: 0 }} />
                            <span style={{ fontSize: 7, color: C.neutral, letterSpacing: "0.06em" }}>{label}</span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: C.white }}>
                            {sign}{val}{suffix}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Trade list */}
                  {(result?.trades?.length ?? 0) > 0 && (
                    <div style={{ marginTop: 6, flex: 1, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 5 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
                        <thead>
                          <tr style={{ background: C.card, position: "sticky", top: 0 }}>
                            {["#", "Date", "D", "Entry", "Exit", "PnL%"].map(h => (
                              <th key={h} style={{
                                padding: "3px 4px", textAlign: h === "PnL%" ? "right" : "left",
                                color: C.neutral, fontWeight: 600, fontSize: 7.5,
                                borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...(result?.trades ?? [])].reverse().slice(0, 100).map((t: TradeRecord, i) => {
                            const dir = t.dir ?? t.direction ?? "long";
                            const pnl = (t.pnl_pct * 100).toFixed(2);
                            const tc  = t.win ? C.positive : C.negative;
                            return (
                              <tr key={i} style={{ borderBottom: `1px solid ${C.border}20` }}>
                                <td style={{ padding: "2px 4px", color: C.neutral }}>{(result?.trades?.length ?? 0) - i}</td>
                                <td style={{ padding: "2px 4px", color: C.dim, fontFamily: "monospace" }}>{(t.entry_date ?? "").slice(5)}</td>
                                <td style={{ padding: "2px 4px", color: dir === "short" ? C.negative : C.positive, fontWeight: 700 }}>
                                  {dir === "short" ? "S" : "L"}
                                </td>
                                <td style={{ padding: "2px 4px", color: C.dim, fontFamily: "monospace" }}>{t.entry?.toFixed(4)}</td>
                                <td style={{ padding: "2px 4px", color: C.dim, fontFamily: "monospace" }}>{t.exit?.toFixed(4) ?? "—"}</td>
                                <td style={{ padding: "2px 4px", color: tc, textAlign: "right", fontFamily: "monospace" }}>
                                  {t.win ? "+" : ""}{pnl}%
                                </td>
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

        {/* ── Right Sidebar 20% ────────────────────────────────────────── */}
        <div style={{
          width: 204, flexShrink: 0, display: "flex", flexDirection: "column",
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: "8px 8px 12px", overflowY: "auto",
        }}>
          {/* STRATEGY */}
          <SectionHead label="Strategy" />
          {(Object.keys(STRATEGIES) as Strategy[]).map(id => (
            <StratBtn key={id} id={id} active={strategy === id} assetType={assetType} onClick={() => setStrategy(id)} />
          ))}

          {/* ASSET TYPE */}
          <SectionHead label="Asset Type" />
          <div style={{ display: "flex", gap: 4 }}>
            {(["futures", "cfd"] as AssetType[]).map(t => (
              <button key={t} onClick={() => setAssetType(t)} style={{
                flex: 1, padding: "4px 0", borderRadius: 5, fontSize: 9,
                background: "transparent",
                border: assetType === t ? `1px solid ${C.gold}` : `1px solid ${C.border}`,
                color:  assetType === t ? C.gold : C.neutral,
                fontWeight: assetType === t ? 700 : 400, cursor: "pointer",
              }}>
                {t === "futures"
                  ? (assetType === "futures" ? meta.futures : "Futures")
                  : (assetType === "cfd" ? meta.cfd : "CFD")
                }
              </button>
            ))}
          </div>

          {/* ZEITRAUM */}
          <SectionHead label="Zeitraum" />
          <div style={{ display: "flex", gap: 3, marginBottom: 5 }}>
            {([1, 3, 5, null] as (number | null)[]).map(y => (
              <button key={y ?? "max"} className="zeitraum-btn"
                onClick={() => setZeitraum(y)}
                style={{
                  flex: 1, padding: "3px 0", borderRadius: 4, fontSize: 8, fontWeight: 600,
                  background: "none", border: `1px solid ${C.border}`,
                  color: C.neutral, cursor: "pointer",
                }}>
                {y ? `${y}J` : "Max"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {([["Von", startDate, setStartDate], ["Bis", endDate, setEndDate]] as [string, string, (v: string) => void][]).map(([lbl, val, setter]) => (
              <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 8, color: C.neutral, width: 22, flexShrink: 0 }}>{lbl}</span>
                <input type="date" value={val}
                  onChange={e => setter(e.target.value)}
                  style={{ flex: 1, fontSize: 8, background: "none", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 4, padding: "2px 4px" }}
                />
              </div>
            ))}
          </div>

          {/* PARAMETER */}
          <SectionHead label="Parameter" />
          {PARAM_DEFS[strategy].map(def => (
            <ParamInput key={`${strategy}-${def.key}`} def={def} value={params[def.key] ?? ""} onChange={v => setParam(def.key, v)} />
          ))}

          {/* SIGNAL */}
          <SectionHead label="Current Signal" />
          <div style={{ textAlign: "center", padding: "8px 0 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: sigColor, letterSpacing: "0.04em" }}>{sigLabel}</div>
          </div>

          {meta.useEma && signal.ema_fast_val != null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {[
                ["EMA Fast", signal.ema_fast_val?.toFixed(5), C.gold],
                ["EMA Slow", signal.ema_slow_val?.toFixed(5), C.dim],
              ].map(([l, v, col]) => (
                <div key={l as string} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: C.neutral }}>{l}</span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: col as string }}>{v}</span>
                </div>
              ))}
              {signal.last_cross_date && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: C.neutral }}>Last Cross</span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: C.dim }}>{signal.last_cross_date}</span>
                </div>
              )}
            </div>
          )}

          {signal.entry != null && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
              {([
                ["Entry", signal.entry?.toFixed(signal.entry > 100 ? 2 : 5), C.white],
                ["SL",   signal.sl?.toFixed(signal.entry > 100 ? 2 : 5),    C.negative],
                ["TP",   signal.tp?.toFixed(signal.entry > 100 ? 2 : 5),    C.positive],
              ] as [string, string | undefined, string][]).map(([l, v, col]) => v && (
                <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: C.neutral }}>{l}</span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: col }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 7.5, color: `${C.neutral}80` }}>{lastRefresh?.toLocaleTimeString() ?? "—"}</span>
            <button onClick={() => void fetchSignal()} style={{
              fontSize: 8, color: C.neutral, background: "none",
              border: `1px solid ${C.border}`, borderRadius: 3, padding: "1px 5px", cursor: "pointer",
            }}>↻</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHead({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 7.5, fontWeight: 700, color: C.neutral,
      letterSpacing: "0.10em", textTransform: "uppercase",
      marginTop: 12, marginBottom: 5,
      paddingBottom: 4, borderBottom: `1px solid ${C.border}`,
    }}>
      {label}
    </div>
  );
}

function StratBtn({ id, active, assetType, onClick }: {
  id: Strategy; active: boolean; assetType: AssetType; onClick: () => void;
}) {
  const meta  = STRATEGIES[id];
  const asset = assetType === "futures" ? meta.futures : meta.cfd;
  return (
    <button className="strat-btn" onClick={onClick} style={{
      width: "100%", textAlign: "left", padding: "4px 7px", borderRadius: 5, marginBottom: 2,
      border: active ? `1px solid ${C.gold}` : `1px solid transparent`,
      background: active ? `${C.gold}10` : "transparent",
      color: active ? C.gold : C.neutral,
      fontSize: 10, fontWeight: active ? 700 : 400, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <span>{meta.label}</span>
      <span style={{ fontSize: 8, color: active ? `${C.gold}80` : `${C.neutral}60`, fontFamily: "monospace" }}>{asset}</span>
    </button>
  );
}

function ParamInput({ def, value, onChange }: {
  def: ParamDef; value: number | string; onChange: (v: number | string) => void;
}) {
  const inputBase: React.CSSProperties = {
    fontSize: 9, background: "none", border: `1px solid ${C.border}`,
    color: C.dim, borderRadius: 3, outline: "none",
  };

  if (def.type === "select") {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
        <span style={{ fontSize: 9, color: C.neutral }}>{def.label}</span>
        <select value={value as string} onChange={e => onChange(e.target.value)}
          style={{ ...inputBase, padding: "2px 4px" }}>
          {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  if (def.type === "slider") {
    return (
      <div style={{ padding: "3px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: C.neutral }}>{def.label}</span>
          <span style={{ fontSize: 9, fontFamily: "monospace", color: C.gold }}>{value}</span>
        </div>
        <input type="range" min={def.min} max={def.max} step={def.step}
          value={value as number}
          onChange={e => {
            const n = (def.step ?? 1) < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
            onChange(n);
          }}
          style={{ width: "100%" }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontSize: 9, color: C.neutral }}>{def.label}</span>
      <input type="number" min={def.min} max={def.max} step={def.step}
        value={value as number}
        onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); }}
        style={{ ...inputBase, width: 68, padding: "2px 4px", fontFamily: "monospace" }}
      />
    </div>
  );
}
