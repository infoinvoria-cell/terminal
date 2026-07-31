"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import {
  engineClient,
  type EngineHealth,
  type BacktestResult,
  type SignalData,
  type TradeRecord,
} from "@/lib/engine-client";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:       "#090909",
  surface:  "#111111",
  border:   "#1A1A1A",
  text:     "#F5F5F5",
  muted:    "#6B7280",
  gold:     "#C9A84C",
  positive: "#22C55E",
  negative: "#EF4444",
};

const BANNER_H = 24; // px — single source of truth for status bar height

// ── Types ──────────────────────────────────────────────────────────────────────
type Strategy  = "EUR_30M" | "DAX_1H" | "DAX_2H" | "GC_FRI" | "GLD_THU" | "YM_TAT";
type AssetType = "futures" | "cfd";
type Params    = Record<string, number | string>;

interface StrategyMeta {
  label: string; futures: string; cfd: string;
  interval: string; group: "Intraday" | "Anomaly"; useEma: boolean;
}

const STRATEGIES: Record<Strategy, StrategyMeta> = {
  EUR_30M: { label: "EUR 30M",      futures: "6E",    cfd: "EURUSD", interval: "30",  group: "Intraday", useEma: true  },
  DAX_1H:  { label: "DAX 1H",       futures: "FDAX1!",cfd: "DE30",   interval: "60",  group: "Intraday", useEma: true  },
  DAX_2H:  { label: "DAX 2H",       futures: "FDAX1!",cfd: "DE30",   interval: "120", group: "Intraday", useEma: true  },
  GC_FRI:  { label: "GC Friday",    futures: "GC1!",  cfd: "XAUUSD", interval: "D",   group: "Anomaly",  useEma: false },
  GLD_THU: { label: "GLD Thursday", futures: "GLD",   cfd: "XAUUSD", interval: "D",   group: "Anomaly",  useEma: false },
  YM_TAT:  { label: "YM TAT",       futures: "YM1!",  cfd: "US30",   interval: "D",   group: "Anomaly",  useEma: false },
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
    { key: "ema_fast",      label: "EMA Fast",        type: "slider", min: 5,      max: 100, step: 1      },
    { key: "ema_slow",      label: "EMA Slow",        type: "slider", min: 10,     max: 200, step: 1      },
    { key: "sl_pips",       label: "Stop Loss",       type: "number", min: 0.0001, max: 0.01,step: 0.0001 },
    { key: "tp_pips",       label: "Take Profit",     type: "number", min: 0.0001, max: 0.02,step: 0.0001 },
    { key: "direction",     label: "Direction",       type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Start h", type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End h",   type: "slider", min: 0, max: 23, step: 1 },
  ],
  DAX_1H: [
    { key: "ema_fast",      label: "EMA Fast",        type: "slider", min: 5,  max: 100, step: 1 },
    { key: "ema_slow",      label: "EMA Slow",        type: "slider", min: 10, max: 200, step: 1 },
    { key: "sl_pts",        label: "SL Points",       type: "number", min: 5,  max: 200, step: 1 },
    { key: "tp_pts",        label: "TP Points",       type: "number", min: 10, max: 500, step: 1 },
    { key: "direction",     label: "Direction",       type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Start h", type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End h",   type: "slider", min: 0, max: 23, step: 1 },
  ],
  DAX_2H: [
    { key: "ema_fast",      label: "EMA Fast",        type: "slider", min: 2,  max: 20,  step: 1 },
    { key: "ema_slow",      label: "EMA Slow",        type: "slider", min: 5,  max: 50,  step: 1 },
    { key: "sl_pts",        label: "SL Points",       type: "number", min: 20, max: 300, step: 5 },
    { key: "tp_pts",        label: "TP Points",       type: "number", min: 30, max: 600, step: 5 },
    { key: "direction",     label: "Direction",       type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Start h", type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End h",   type: "slider", min: 0, max: 23, step: 1 },
  ],
  GC_FRI:  [
    { key: "atr_len", label: "ATR Length", type: "slider", min: 5,   max: 30,  step: 1    },
    { key: "sl_mult", label: "SL Mult",    type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",      label: "R:R Ratio",  type: "slider", min: 1.0, max: 5.0, step: 0.25 },
  ],
  GLD_THU: [
    { key: "atr_len", label: "ATR Length", type: "slider", min: 5,   max: 30,  step: 1    },
    { key: "sl_mult", label: "SL Mult",    type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",      label: "R:R Ratio",  type: "slider", min: 1.0, max: 5.0, step: 0.25 },
  ],
  YM_TAT:  [
    { key: "atr_len", label: "ATR Length", type: "slider", min: 5,   max: 30,  step: 1    },
    { key: "sl_mult", label: "SL Mult",    type: "slider", min: 0.3, max: 2.0, step: 0.05 },
    { key: "rr",      label: "R:R Ratio",  type: "slider", min: 1.0, max: 5.0, step: 0.25 },
  ],
};

const DEFAULT_PARAMS: Record<Strategy, Params> = {
  EUR_30M: { ema_fast: 20, ema_slow: 50, sl_pips: 0.0013, tp_pips: 0.0039, direction: "both", session_start: 7,  session_end: 17 },
  DAX_1H:  { ema_fast: 20, ema_slow: 50, sl_pts: 35,      tp_pts: 126,     direction: "both", session_start: 8,  session_end: 17 },
  DAX_2H:  { ema_fast: 4,  ema_slow: 20, sl_pts: 50,      tp_pts: 150,     direction: "both", session_start: 8,  session_end: 18 },
  GC_FRI:  { atr_len: 14, sl_mult: 0.75, rr: 1.25 },
  GLD_THU: { atr_len: 14, sl_mult: 1.5,  rr: 2.0  },
  YM_TAT:  { atr_len: 14, sl_mult: 1.0,  rr: 2.0  },
};

// ── Cache ──────────────────────────────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1_000;
function getCache(key: string): BacktestResult | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const { data, ts } = JSON.parse(item) as { data: BacktestResult; ts: number };
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}
function setCache(key: string, data: BacktestResult) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
}

// ── EMA helper ─────────────────────────────────────────────────────────────────
function calcEma(closes: number[], span: number): number[] {
  const k = 2 / (span + 1);
  const out: number[] = [];
  for (let i = 0; i < closes.length; i++)
    out.push(i === 0 ? closes[0] : closes[i] * k + out[i - 1] * (1 - k));
  return out;
}

// ── KPI config ─────────────────────────────────────────────────────────────────
const KPI_ROWS: { key: keyof BacktestResult["metrics"]; label: string; suffix: string }[] = [
  { key: "cagr",         label: "CAGR",    suffix: "%" },
  { key: "sharpe",       label: "SHARPE",  suffix: ""  },
  { key: "maxDD",        label: "MAX DD",  suffix: "%" },
  { key: "calmar",       label: "CALMAR",  suffix: ""  },
  { key: "trades",       label: "TRADES",  suffix: ""  },
  { key: "winRate",      label: "WIN RATE",suffix: "%" },
  { key: "profitFactor", label: "PF",      suffix: ""  },
  { key: "avgWin",       label: "AVG WIN", suffix: "%" },
  { key: "avgLoss",      label: "AVG LOSS",suffix: "%" },
  { key: "bestTrade",    label: "BEST",    suffix: "%" },
];

function kpiDot(key: string, v: number): string {
  if (key === "cagr")         return v > 10  ? C.positive : v > 0   ? C.gold : C.negative;
  if (key === "sharpe")       return v > 1   ? C.positive : v > 0.5 ? C.gold : C.negative;
  if (key === "maxDD")        return v > -10 ? C.positive : v > -20 ? C.gold : C.negative;
  if (key === "calmar")       return v > 1   ? C.positive : v > 0.5 ? C.gold : C.negative;
  if (key === "winRate")      return v > 60  ? C.positive : v > 50  ? C.gold : C.negative;
  if (key === "profitFactor") return v > 1.5 ? C.positive : v > 1   ? C.gold : C.negative;
  if (key === "avgWin" || key === "bestTrade") return C.positive;
  if (key === "avgLoss") return C.negative;
  return C.muted;
}

// ── OHLC type ──────────────────────────────────────────────────────────────────
interface OhlcBar { time: number; open: number; high: number; low: number; close: number; }

// ── LWChart ────────────────────────────────────────────────────────────────────
interface LWCProps { bars: OhlcBar[]; trades: TradeRecord[]; emaFast: number; emaSlow: number; showEma: boolean; }

function LWChart({ bars, trades, emaFast, emaSlow, showEma }: LWCProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<unknown>(null);
  const candleRef    = useRef<unknown>(null);
  const emaFRef      = useRef<unknown>(null);
  const emaSRef      = useRef<unknown>(null);
  const markerApiRef = useRef<unknown>(null);

  // Init chart once — autoSize: true handles all resize automatically
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    void import("lightweight-charts").then((lc) => {
      if (cancelled || !containerRef.current) return;

      const chart = lc.createChart(containerRef.current, {
        autoSize: true,               // ← fills container, no manual resize needed
        layout: {
          background:  { color: C.bg },
          textColor:   C.muted,
          fontFamily:  "var(--font-montserrat), system-ui, sans-serif",
          fontSize:    10,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        crosshair: {
          vertLine: { color: "#2a2a2a", width: 1, style: 0, labelBackgroundColor: C.surface },
          horzLine: { color: "#2a2a2a", width: 1, style: 0, labelBackgroundColor: C.surface },
        },
        rightPriceScale: { borderColor: C.border, textColor: C.muted },
        timeScale:       { borderColor: C.border, timeVisible: true, secondsVisible: false, rightOffset: 6 },
        handleScroll:    true,
        handleScale:     true,
      });

      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: C.text, downColor: C.negative,
        borderUpColor: C.text, borderDownColor: C.negative,
        wickUpColor: C.text, wickDownColor: C.negative,
      });
      const emaFastSeries = chart.addSeries(lc.LineSeries, {
        color: C.gold, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
      });
      const emaSlowSeries = chart.addSeries(lc.LineSeries, {
        color: C.muted, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
      });

      chartRef.current   = chart;
      candleRef.current  = candleSeries;
      emaFRef.current    = emaFastSeries;
      emaSRef.current    = emaSlowSeries;
      markerApiRef.current = lc.createSeriesMarkers(candleSeries, []);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update candles + EMA
  useEffect(() => {
    if (!candleRef.current || !bars.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (candleRef.current as any).setData(
      bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }))
    );

    const closes   = bars.map(b => b.close);
    const fastVals = calcEma(closes, emaFast);
    const slowVals = calcEma(closes, emaSlow);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const efs = emaFRef.current as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ess = emaSRef.current as any;

    efs?.applyOptions({ visible: showEma });
    ess?.applyOptions({ visible: showEma });
    if (showEma) {
      efs?.setData(bars.map((b, i) => ({ time: b.time, value: fastVals[i] })));
      ess?.setData(bars.map((b, i) => ({ time: b.time, value: slowVals[i] })));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chartRef.current as any)?.timeScale().fitContent();
  }, [bars, emaFast, emaSlow, showEma]);

  // Trade markers
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = markerApiRef.current as any;
    if (!api) return;
    if (!trades.length) { api.setMarkers([]); return; }

    const markers = trades
      .filter(t => t.entry_date)
      .map(t => {
        const unix = Math.floor(new Date(t.entry_date!).getTime() / 1000);
        const dir  = t.dir ?? t.direction ?? "long";
        const pips = Math.abs(t.pnl_pct * 10000).toFixed(0);
        return {
          time:     unix,
          position: dir === "long" ? "belowBar" : "aboveBar",
          color:    t.win ? C.positive : C.negative,
          shape:    dir === "long" ? "arrowUp" : "arrowDown",
          text:     (t.win ? "+" : "") + pips + "p",
          size:     1,
        };
      })
      .sort((a, b) => a.time - b.time);

    api.setMarkers(markers);
  }, [trades, bars]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}
      className="lwc-container" />
  );
}

// ── Resize handles ─────────────────────────────────────────────────────────────
function HHandle() {
  return (
    <PanelResizeHandle style={{ height: 3, flexShrink: 0, background: C.border, cursor: "row-resize" }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = C.gold; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = C.border; }}
    />
  );
}
function VHandle() {
  return (
    <PanelResizeHandle style={{ width: 3, flexShrink: 0, background: C.border, cursor: "col-resize" }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = C.gold; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = C.border; }}
    />
  );
}

// ── Section label ──────────────────────────────────────────────────────────────
function SL({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 8.5, fontWeight: 700, color: C.muted, letterSpacing: "0.12em",
      textTransform: "uppercase", fontFamily: "var(--font-montserrat),system-ui",
      marginTop: 14, marginBottom: 5, paddingBottom: 4, borderBottom: `1px solid ${C.border}`,
    }}>
      {children}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function TradingEnginePage() {
  const [strategy,    setStrategy]    = useState<Strategy>("EUR_30M");
  const [assetType,   setAssetType]   = useState<AssetType>("futures");
  const [params,      setParams]      = useState<Params>(DEFAULT_PARAMS["EUR_30M"]);
  const [startDate,   setStartDate]   = useState("2019-01-01");
  const [endDate,     setEndDate]     = useState(new Date().toISOString().slice(0, 10));
  const [result,      setResult]      = useState<BacktestResult | null>(null);
  const [isRunning,   setIsRunning]   = useState(false);
  const [signal,      setSignal]      = useState<SignalData>({ direction: "flat" });
  const [health,      setHealth]      = useState<EngineHealth | null>(null);
  const [chartBars,   setChartBars]   = useState<OhlcBar[]>([]);
  const [codeOpen,    setCodeOpen]    = useState(false);
  const [codeContent, setCodeContent] = useState("");
  const [codeFile,    setCodeFile]    = useState("");
  const [codeSaving,  setCodeSaving]  = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meta        = STRATEGIES[strategy];
  const engineOnline = health?.status === "ok";
  const ibkrOk       = health?.ibkr === "connected";

  // Health
  const checkHealth = useCallback(async () => {
    try { setHealth(await engineClient.getHealth()); } catch { setHealth(null); }
  }, []);
  useEffect(() => { void checkHealth(); }, [checkHealth]);
  useEffect(() => {
    const id = setInterval(() => void checkHealth(), engineOnline ? 30_000 : 10_000);
    return () => clearInterval(id);
  }, [checkHealth, engineOnline]);

  // Backtest
  const runBacktest = useCallback(async () => {
    const ckey = `bt_${strategy}_${assetType}_${JSON.stringify(params)}_${startDate}_${endDate}`;
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
      setResult({
        metrics: {} as BacktestResult["metrics"], equity: [], drawdown: [], trades: [],
        error: msg.includes("30000") || msg.toLowerCase().includes("timeout")
          ? "Backtest Timeout — Zeitraum verkürzen oder Engine neu starten"
          : "Engine offline — starte Desktop\\start.bat",
      });
    } finally { setIsRunning(false); }
  }, [strategy, assetType, params, startDate, endDate]);

  const scheduleBacktest = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runBacktest(), 300);
  }, [runBacktest]);

  useEffect(() => { scheduleBacktest(); }, [params, strategy, assetType, startDate, endDate, scheduleBacktest]);
  useEffect(() => { setParams(DEFAULT_PARAMS[strategy]); }, [strategy]);

  // Chart bars
  const fetchChartData = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:5000/chart-data/${strategy}?asset_type=${assetType}&limit=2000`, {
        cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) setChartBars(await res.json() as OhlcBar[]);
    } catch { /* engine offline */ }
  }, [strategy, assetType]);
  useEffect(() => { void fetchChartData(); }, [fetchChartData]);

  // Signal
  const fetchSignal = useCallback(async () => {
    try { setSignal(await engineClient.getSignal(strategy)); } catch { /* keep last */ }
  }, [strategy]);
  useEffect(() => { void fetchSignal(); }, [fetchSignal]);
  useEffect(() => {
    const id = setInterval(() => void fetchSignal(), 30_000);
    return () => clearInterval(id);
  }, [fetchSignal]);

  // Code
  const fetchCode = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:5000/strategy-code/${strategy}`, { cache: "no-store" });
      if (res.ok) {
        const d = await res.json() as { code: string; filename: string };
        setCodeContent(d.code); setCodeFile(d.filename);
      }
    } catch { /* offline */ }
  }, [strategy]);
  useEffect(() => { if (codeOpen) void fetchCode(); }, [codeOpen, fetchCode]);

  const saveCode = useCallback(async () => {
    setCodeSaving(true);
    try {
      const res = await fetch(`http://localhost:5000/strategy-code/${strategy}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeContent }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (d.success) void runBacktest(); else alert(d.error ?? "Fehler");
    } catch { alert("Engine offline"); }
    finally { setCodeSaving(false); }
  }, [strategy, codeContent, runBacktest]);

  // Helpers
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

  // Chart memos
  const equityData = useMemo(() => {
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
      date: (result.equity_dates?.[i] ?? "").slice(0, 7), dd: v,
    }));
  }, [result]);

  const trades        = result?.trades ?? [];
  const sigColor      = signal.direction === "long" ? C.positive : signal.direction === "short" ? C.negative : C.muted;
  const sigLabel      = signal.direction === "long" ? "LONG ▲" : signal.direction === "short" ? "SHORT ▼" : "FLAT —";
  const chartEmaFast  = Number(params.ema_fast ?? 20);
  const chartEmaSlow  = Number(params.ema_slow ?? 50);
  const assetSymbol   = assetType === "futures" ? meta.futures : meta.cfd;

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: "100dvh", display: "flex", flexDirection: "column",
      overflow: "hidden", background: C.bg, color: C.text,
    }}>
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        /* LWC: hide branding watermark div injected after canvas */
        .lwc-container > table { display: none !important; }
        .lwc-container canvas { pointer-events: auto !important; }
        /* Range slider */
        input[type=range]{-webkit-appearance:none;height:2px;border-radius:2px;background:${C.border};outline:none;cursor:pointer;width:100%}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:${C.gold};cursor:pointer}
        /* Number input — hide spinner */
        input[type=number]{-moz-appearance:textfield}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        /* Date picker icon */
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.4);cursor:pointer}
        /* Select */
        select option{background:${C.surface}}
        /* Strategy button */
        .strat-btn{display:flex;align-items:center;justify-content:space-between;width:100%;padding:5px 0 5px 4px;border:none;border-left:2px solid transparent;background:none;cursor:pointer;font-family:var(--font-montserrat),system-ui;font-size:11px;color:${C.muted};transition:color 0.12s,border-color 0.12s}
        .strat-btn.active{color:${C.text};border-left-color:${C.gold}}
        .strat-btn:hover:not(.active){color:${C.text}}
        /* Text button */
        .tbtn{background:none;border:none;cursor:pointer;font-family:var(--font-montserrat),system-ui;padding:2px 4px;transition:color 0.12s}
        /* Scrollbar */
        ::-webkit-scrollbar{width:2px;height:2px}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        /* Panel group needs height to flow correctly */
        [data-panel-group]{display:flex!important}
        [data-panel-group][data-orientation=horizontal]{flex-direction:row}
        [data-panel-group][data-orientation=vertical]{flex-direction:column}
      `}</style>

      {/* ── Status banner ──────────────────────────────────────────────────────── */}
      <div style={{
        height: BANNER_H, flexShrink: 0,
        display: "flex", alignItems: "center", gap: 7,
        padding: "0 10px", background: C.surface, borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{
          width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
          background: !engineOnline ? C.negative : !ibkrOk ? C.gold : C.positive,
        }} />
        <span style={{ fontSize: 10, color: C.muted, fontFamily: "var(--font-montserrat),system-ui" }}>
          {!engineOnline
            ? "Engine offline — starte Desktop\\start.bat"
            : !ibkrOk
              ? `Engine online${health?.lean === "running" ? " · LEAN" : ""} · IBKR nicht verbunden`
              : `Engine online · IBKR verbunden${health?.paper_mode ? " (Paper)" : ""}`}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 9, color: `${C.muted}50` }}>5000</span>
      </div>

      {/* ── Panels — height = 100dvh minus banner ─────────────────────────────── */}
      <PanelGroup
        orientation="horizontal"
        style={{ flex: 1, minHeight: 0, height: `calc(100dvh - ${BANNER_H}px)` }}
      >
        {/* ── Left: chart + tester ─────────────────────────────────────────────── */}
        <Panel defaultSize={codeOpen ? 55 : 80} minSize={40}>
          <PanelGroup orientation="vertical" style={{ height: "100%" }}>

            {/* CHART */}
            <Panel defaultSize={58} minSize={25} style={{ position: "relative", overflow: "hidden" }}>
              {/* Chart label — absolute, top-left */}
              <div style={{
                position: "absolute", top: 7, left: 8, zIndex: 10,
                display: "flex", alignItems: "center", gap: 8,
                pointerEvents: "none",
              }}>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: "var(--font-montserrat),system-ui" }}>
                  {assetSymbol} · {meta.interval}{meta.group === "Intraday" ? "m" : ""}
                </span>
                {meta.useEma && signal.ema_fast_val != null && (
                  <>
                    <span style={{ fontSize: 9, fontFamily: "var(--font-nunito),monospace", color: C.gold }}>
                      F {signal.ema_fast_val.toFixed(5)}
                    </span>
                    <span style={{ fontSize: 9, fontFamily: "var(--font-nunito),monospace", color: `${C.muted}90` }}>
                      S {signal.ema_slow_val?.toFixed(5)}
                    </span>
                  </>
                )}
              </div>

              {/* Signal + code toggle — absolute, top-right */}
              <div style={{
                position: "absolute", top: 7, right: 8, zIndex: 10,
                display: "flex", alignItems: "center", gap: 7,
              }}>
                {/* Signal badge — text only, no box */}
                <span style={{
                  fontSize: 11, fontWeight: 700, color: sigColor,
                  fontFamily: "var(--font-montserrat),system-ui",
                }}>
                  {sigLabel}
                </span>
                <button onClick={() => setCodeOpen(v => !v)} style={{
                  width: 22, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                  background: codeOpen ? `${C.gold}15` : "none",
                  border: `1px solid ${codeOpen ? C.gold : C.border}`,
                  borderRadius: 3, cursor: "pointer", fontSize: 9,
                  color: codeOpen ? C.gold : C.muted, fontFamily: "monospace",
                }}>{"</>"}</button>
              </div>

              {/* LWChart fills the panel */}
              <LWChart
                bars={chartBars}
                trades={trades}
                emaFast={chartEmaFast}
                emaSlow={chartEmaSlow}
                showEma={meta.useEma}
              />

              {/* Placeholder when no data */}
              {chartBars.length === 0 && (
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center", pointerEvents: "none",
                }}>
                  <span style={{ fontSize: 10, color: `${C.muted}40`, fontFamily: "var(--font-montserrat),system-ui" }}>
                    {engineOnline ? "Chart-Daten werden geladen…" : "Engine offline"}
                  </span>
                </div>
              )}
            </Panel>

            <HHandle />

            {/* STRATEGY TESTER */}
            <Panel defaultSize={42} minSize={18} style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {/* Tester header */}
              <div style={{
                flexShrink: 0, height: 24, display: "flex", alignItems: "center",
                justifyContent: "space-between", padding: "0 10px",
                background: C.surface, borderBottom: `1px solid ${C.border}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 8.5, fontWeight: 700, color: C.muted, fontFamily: "var(--font-montserrat),system-ui", letterSpacing: "0.07em" }}>
                    STRATEGY TESTER — {meta.label}
                  </span>
                  {isRunning && <div style={{ width: 8, height: 8, border: `1.5px solid ${C.gold}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
                  {result?.source && !isRunning && (
                    <span style={{ fontSize: 7.5, color: `${C.muted}70`, fontFamily: "var(--font-montserrat),system-ui" }}>
                      {result.source} · {result.bars?.toLocaleString()} bars
                    </span>
                  )}
                </div>
                <button onClick={() => void runBacktest()} className="tbtn"
                  style={{ fontSize: 8.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, padding: "1px 7px" }}>
                  ▶ Run
                </button>
              </div>

              {/* Tester body */}
              {result?.error ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 11, color: C.negative, fontFamily: "var(--font-montserrat),system-ui" }}>
                    {result.error}
                  </span>
                </div>
              ) : (
                <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                  {/* Equity + Drawdown charts — 63% */}
                  <div style={{ flex: "0 0 63%", display: "flex", flexDirection: "column", minHeight: 0, padding: "3px 0 3px 4px" }}>
                    <div style={{ flex: 7, minHeight: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={equityData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                          <XAxis dataKey="date" tick={{ fontSize: 7.5, fill: C.muted, fontFamily: "var(--font-montserrat),system-ui" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                          <YAxis
                            domain={["auto", "auto"]}
                            tick={{ fontSize: 7.5, fill: C.muted, fontFamily: "var(--font-nunito),monospace" }}
                            tickLine={false} axisLine={false} width={40}
                            tickFormatter={v => `${Number(v).toFixed(0)}`}
                          />
                          <Tooltip
                            contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 8.5 }}
                            labelStyle={{ color: C.muted }}
                            formatter={(v: unknown, name: unknown) => [
                              `${Number(v).toFixed(2)}%`,
                              name === "strategy" ? "Strategie" : "Buy & Hold",
                            ]}
                          />
                          <Line type="monotone" dataKey="strategy" stroke={C.text}    dot={false} strokeWidth={1.5} />
                          <Line type="monotone" dataKey="buyHold"  stroke={"#2a2a2a"} dot={false} strokeWidth={1} strokeDasharray="4 2" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ flex: 3, minHeight: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={ddData} margin={{ top: 2, right: 4, left: -22, bottom: 0 }}>
                          <XAxis dataKey="date" tick={{ fontSize: 7, fill: `${C.muted}70`, fontFamily: "var(--font-montserrat),system-ui" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                          <YAxis
                            domain={["auto", 0]}
                            tick={{ fontSize: 7, fill: `${C.muted}70`, fontFamily: "var(--font-nunito),monospace" }}
                            tickLine={false} axisLine={false} width={40}
                            tickFormatter={v => `${Number(v).toFixed(0)}%`}
                          />
                          <Tooltip
                            contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 8.5 }}
                            formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, "Drawdown"]}
                          />
                          <Area type="monotone" dataKey="dd" stroke={C.negative} fill={`${C.negative}18`} strokeWidth={1} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* KPIs + Trade list — 37% */}
                  <div style={{ flex: "0 0 37%", display: "flex", flexDirection: "column", minHeight: 0, padding: "3px 5px", overflowY: "auto" }}>
                    {/* KPI grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, marginBottom: 5 }}>
                      {KPI_ROWS.map(({ key, label, suffix }) => {
                        const raw = (result?.metrics as Record<string, number> | undefined)?.[key] ?? 0;
                        const val = Number(raw);
                        const neg = key === "maxDD" || key === "avgLoss";
                        const sign = !neg && val > 0 && suffix === "%" ? "+" : "";
                        return (
                          <div key={key} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, padding: "3px 6px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                              <div style={{ width: 3, height: 3, borderRadius: "50%", background: kpiDot(key, val), flexShrink: 0 }} />
                              <span style={{ fontSize: 7, color: C.muted, fontFamily: "var(--font-montserrat),system-ui", letterSpacing: "0.05em" }}>{label}</span>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-nunito),monospace", color: C.text, lineHeight: 1 }}>
                              {sign}{val}{suffix}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Trade list */}
                    {trades.length > 0 && (
                      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, border: `1px solid ${C.border}`, borderRadius: 3 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: C.surface, position: "sticky", top: 0 }}>
                              {["#", "Date", "D", "Entry", "Exit", "PnL%"].map(h => (
                                <th key={h} style={{
                                  padding: "2px 3px", textAlign: h === "PnL%" ? "right" : "left",
                                  fontSize: 7, color: C.muted, fontWeight: 600,
                                  fontFamily: "var(--font-montserrat),system-ui",
                                  borderBottom: `1px solid ${C.border}`,
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...trades].reverse().slice(0, 100).map((t: TradeRecord, i) => {
                              const dir = t.dir ?? t.direction ?? "long";
                              const pnl = (t.pnl_pct * 100).toFixed(2);
                              return (
                                <tr key={i} style={{ background: i % 2 === 0 ? C.surface : "#0C0C0C" }}>
                                  <td style={{ padding: "1px 3px", fontSize: 8, fontFamily: "var(--font-montserrat),system-ui", color: C.muted }}>{trades.length - i}</td>
                                  <td style={{ padding: "1px 3px", fontSize: 8, fontFamily: "var(--font-nunito),monospace", color: C.muted }}>{(t.entry_date ?? "").slice(5)}</td>
                                  <td style={{ padding: "1px 3px", fontSize: 8, fontWeight: 700, color: dir === "short" ? C.negative : C.positive }}>{dir === "short" ? "S" : "L"}</td>
                                  <td style={{ padding: "1px 3px", fontSize: 8, fontFamily: "var(--font-nunito),monospace", color: C.muted }}>{t.entry?.toFixed(4)}</td>
                                  <td style={{ padding: "1px 3px", fontSize: 8, fontFamily: "var(--font-nunito),monospace", color: C.muted }}>{t.exit?.toFixed(4) ?? "—"}</td>
                                  <td style={{ padding: "1px 3px", fontSize: 8, fontFamily: "var(--font-nunito),monospace", textAlign: "right", color: t.win ? C.positive : C.negative }}>
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
            </Panel>
          </PanelGroup>
        </Panel>

        <VHandle />

        {/* ── Sidebar ───────────────────────────────────────────────────────────── */}
        <Panel defaultSize={20} minSize={14} maxSize={28}
          style={{ overflowY: "auto", background: C.surface, borderLeft: `1px solid ${C.border}` }}>
          <div style={{ padding: "8px 11px 20px" }}>
            <SL>Strategy</SL>
            {(Object.keys(STRATEGIES) as Strategy[]).map(id => (
              <button key={id} onClick={() => setStrategy(id)}
                className={`strat-btn${strategy === id ? " active" : ""}`}>
                <span>{STRATEGIES[id].label}</span>
                <span style={{ fontSize: 8.5, fontFamily: "var(--font-nunito),monospace", color: strategy === id ? `${C.gold}80` : `${C.muted}50` }}>
                  {assetType === "futures" ? STRATEGIES[id].futures : STRATEGIES[id].cfd}
                </span>
              </button>
            ))}

            <SL>Asset Type</SL>
            <div style={{ display: "flex", gap: 16 }}>
              {(["futures", "cfd"] as AssetType[]).map(t => (
                <button key={t} onClick={() => setAssetType(t)} className="tbtn"
                  style={{ fontSize: 11, color: assetType === t ? C.gold : C.muted, fontWeight: assetType === t ? 700 : 400 }}>
                  {t === "futures" ? meta.futures : meta.cfd}
                </button>
              ))}
            </div>

            <SL>Zeitraum</SL>
            <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
              {([1, 3, 5, null] as (number | null)[]).map(y => (
                <button key={y ?? "max"} onClick={() => setZeitraum(y)} className="tbtn"
                  style={{ fontSize: 10, color: C.muted, fontWeight: 600, padding: "1px 2px" }}>
                  {y ? `${y}J` : "Max"}
                </button>
              ))}
            </div>
            {([["Von", startDate, setStartDate], ["Bis", endDate, setEndDate]] as [string, string, (v: string) => void][]).map(([lbl, val, setter]) => (
              <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 8.5, color: C.muted, width: 22, flexShrink: 0, fontFamily: "var(--font-montserrat),system-ui" }}>{lbl}</span>
                <input type="date" value={val} onChange={e => setter(e.target.value)} style={{
                  flex: 1, fontSize: 8.5, background: "none",
                  border: "none", borderBottom: `1px solid ${C.border}`,
                  color: C.muted, padding: "2px 0", outline: "none",
                  fontFamily: "var(--font-nunito),monospace",
                }} />
              </div>
            ))}

            <SL>Parameter</SL>
            {PARAM_DEFS[strategy].map(def => (
              <ParamInput key={`${strategy}-${def.key}`} def={def} value={params[def.key] ?? ""} onChange={v => setParam(def.key, v)} />
            ))}

            <SL>Current Signal</SL>
            <div style={{ fontSize: 15, fontWeight: 800, color: sigColor, fontFamily: "var(--font-montserrat),system-ui", letterSpacing: "0.03em", marginBottom: 6 }}>
              {sigLabel}
            </div>
            {meta.useEma && signal.ema_fast_val != null && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {([
                  ["EMA Fast",   signal.ema_fast_val?.toFixed(5),  C.gold],
                  ["EMA Slow",   signal.ema_slow_val?.toFixed(5),  C.muted],
                  ["Last Cross", signal.last_cross_date,            C.muted],
                ] as [string, string | undefined, string][]).filter(([,v]) => v).map(([l, v, col]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 8.5, color: C.muted, fontFamily: "var(--font-montserrat),system-ui" }}>{l}</span>
                    <span style={{ fontSize: 9.5, fontFamily: "var(--font-nunito),monospace", color: col }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {signal.entry != null && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                {([
                  ["Entry", signal.entry?.toFixed(signal.entry > 100 ? 2 : 5), C.text],
                  ["SL",    signal.sl?.toFixed((signal.sl ?? 0) > 100 ? 2 : 5), C.negative],
                  ["TP",    signal.tp?.toFixed((signal.tp ?? 0) > 100 ? 2 : 5), C.positive],
                ] as [string, string | undefined, string][]).filter(([,v]) => v).map(([l, v, col]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 8.5, color: C.muted, fontFamily: "var(--font-montserrat),system-ui" }}>{l}</span>
                    <span style={{ fontSize: 9.5, fontFamily: "var(--font-nunito),monospace", color: col }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>

        {/* ── Code Panel ───────────────────────────────────────────────────────── */}
        {codeOpen && (
          <>
            <VHandle />
            <Panel defaultSize={25} minSize={18} maxSize={45}
              style={{ display: "flex", flexDirection: "column", background: C.bg, borderLeft: `1px solid ${C.border}` }}>
              <div style={{
                flexShrink: 0, height: 26, display: "flex", alignItems: "center",
                justifyContent: "space-between", padding: "0 8px",
                background: C.surface, borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: 8.5, color: C.muted, fontFamily: "monospace" }}>{codeFile || "strategy.py"}</span>
                <div style={{ display: "flex", gap: 5 }}>
                  <button onClick={() => void saveCode()} disabled={codeSaving} className="tbtn"
                    style={{ fontSize: 8.5, color: codeSaving ? C.muted : C.gold, border: `1px solid ${codeSaving ? C.border : C.gold}30`, borderRadius: 3, padding: "1px 7px" }}>
                    {codeSaving ? "…" : "Speichern"}
                  </button>
                  <button onClick={() => void runBacktest()} className="tbtn"
                    style={{ fontSize: 8.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, padding: "1px 7px" }}>
                    Run
                  </button>
                  <button onClick={() => setCodeOpen(false)} className="tbtn"
                    style={{ fontSize: 11, color: C.muted }}>✕</button>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <MonacoEditor height="100%" language="python" value={codeContent}
                  onChange={v => setCodeContent(v ?? "")} theme="vs-dark"
                  options={{
                    fontSize: 12, fontFamily: "'Fira Code', 'Consolas', monospace",
                    minimap: { enabled: false }, lineNumbers: "on",
                    scrollBeyondLastLine: false, wordWrap: "on",
                    renderLineHighlight: "none", overviewRulerBorder: false,
                    hideCursorInOverviewRuler: true, padding: { top: 8 },
                  }}
                />
              </div>
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}

// ── ParamInput ─────────────────────────────────────────────────────────────────
function ParamInput({ def, value, onChange }: {
  def: ParamDef; value: number | string; onChange: (v: number | string) => void;
}) {
  const base: React.CSSProperties = {
    fontSize: 9, background: "none",
    border: "none", borderBottom: `1px solid ${C.border}`,
    color: C.muted, outline: "none",
    fontFamily: "var(--font-nunito),monospace",
  };

  if (def.type === "select") {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
        <span style={{ fontSize: 9, color: C.muted, fontFamily: "var(--font-montserrat),system-ui" }}>{def.label}</span>
        <select value={value as string} onChange={e => onChange(e.target.value)}
          style={{ ...base, border: "none", borderBottom: `1px solid ${C.border}` }}>
          {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  if (def.type === "slider") {
    return (
      <div style={{ padding: "3px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: C.muted, fontFamily: "var(--font-montserrat),system-ui" }}>{def.label}</span>
          <span style={{ fontSize: 9.5, fontFamily: "var(--font-nunito),monospace", color: C.text }}>{value}</span>
        </div>
        <input type="range" min={def.min} max={def.max} step={def.step} value={value as number}
          onChange={e => onChange((def.step ?? 1) < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10))}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontSize: 9, color: C.muted, fontFamily: "var(--font-montserrat),system-ui" }}>{def.label}</span>
      <input type="number" min={def.min} max={def.max} step={def.step} value={value as number}
        onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); }}
        style={{ ...base, width: 66, textAlign: "right" }}
      />
    </div>
  );
}
