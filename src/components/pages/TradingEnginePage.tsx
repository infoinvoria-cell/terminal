"use client";

import {
  useEffect, useRef, useState, useCallback, useMemo,
} from "react";
import dynamic from "next/dynamic";

const ChartComponent = dynamic(() => import("@/components/engine/LWChart"), { ssr: false });
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
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
interface OhlcBar { time: number; open: number; high: number; low: number; close: number; }

interface StrategyMeta { label: string; futures: string; cfd: string; interval: string; useEma: boolean; }
const STRATEGIES: Record<Strategy, StrategyMeta> = {
  EUR_30M: { label: "EUR 30M",      futures: "6E",     cfd: "EURUSD", interval: "30m", useEma: true  },
  DAX_1H:  { label: "DAX 1H",       futures: "FDAX1!", cfd: "DE30",   interval: "1H",  useEma: true  },
  DAX_2H:  { label: "DAX 2H",       futures: "FDAX1!", cfd: "DE30",   interval: "2H",  useEma: true  },
  GC_FRI:  { label: "GC Friday",    futures: "GC1!",   cfd: "XAUUSD", interval: "D",   useEma: false },
  GLD_THU: { label: "GLD Thursday", futures: "GLD",    cfd: "XAUUSD", interval: "D",   useEma: false },
  YM_TAT:  { label: "YM TAT",       futures: "YM1!",   cfd: "US30",   interval: "D",   useEma: false },
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
    { key: "ema_fast",      label: "EMA Fast",    type: "slider", min: 3,      max: 100, step: 1      },
    { key: "ema_slow",      label: "EMA Slow",    type: "slider", min: 10,     max: 200, step: 1      },
    { key: "sl_pips",       label: "Stop Loss",   type: "number", min: 0.0001, max: 0.01,step: 0.0001 },
    { key: "tp_pips",       label: "Take Profit", type: "number", min: 0.0001, max: 0.02,step: 0.0001 },
    { key: "direction",     label: "Direction",   type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Sta", type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End", type: "slider", min: 0, max: 23, step: 1 },
  ],
  DAX_1H: [
    { key: "ema_fast",      label: "EMA Fast",    type: "slider", min: 5,  max: 100, step: 1 },
    { key: "ema_slow",      label: "EMA Slow",    type: "slider", min: 10, max: 200, step: 1 },
    { key: "sl_pts",        label: "SL Points",   type: "number", min: 5,  max: 200, step: 1 },
    { key: "tp_pts",        label: "TP Points",   type: "number", min: 10, max: 500, step: 1 },
    { key: "direction",     label: "Direction",   type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Sta", type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End", type: "slider", min: 0, max: 23, step: 1 },
  ],
  DAX_2H: [
    { key: "ema_fast",      label: "EMA Fast",    type: "slider", min: 2,  max: 20,  step: 1 },
    { key: "ema_slow",      label: "EMA Slow",    type: "slider", min: 5,  max: 50,  step: 1 },
    { key: "sl_pts",        label: "SL Points",   type: "number", min: 20, max: 300, step: 5 },
    { key: "tp_pts",        label: "TP Points",   type: "number", min: 30, max: 600, step: 5 },
    { key: "direction",     label: "Direction",   type: "select", options: DIR_OPTS },
    { key: "session_start", label: "Session Sta", type: "slider", min: 0, max: 23, step: 1 },
    { key: "session_end",   label: "Session End", type: "slider", min: 0, max: 23, step: 1 },
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
const DEFAULT_PARAMS: Record<Strategy, Params> = {
  EUR_30M: { ema_fast: 20, ema_slow: 50, sl_pips: 0.0013, tp_pips: 0.0039, direction: "both", session_start: 7,  session_end: 17 },
  DAX_1H:  { ema_fast: 20, ema_slow: 50, sl_pts: 35,      tp_pts: 126,     direction: "both", session_start: 8,  session_end: 17 },
  DAX_2H:  { ema_fast: 4,  ema_slow: 20, sl_pts: 50,      tp_pts: 150,     direction: "both", session_start: 8,  session_end: 18 },
  GC_FRI:  { atr_len: 14, sl_mult: 0.75, rr: 1.25 },
  GLD_THU: { atr_len: 14, sl_mult: 1.5,  rr: 2.0  },
  YM_TAT:  { atr_len: 14, sl_mult: 1.0,  rr: 2.0  },
};

// ── Colors ─────────────────────────────────────────────────────────────────────
// Design system: matches Capitalife Terminal (.claude/skills/design-review.md)
const BG       = "#0c0d10";
const CARD_TOP = "#1c1d20";
const CARD_BOT = "#141517";
const CHART_BG = "#0A0A0A";
const BORDER   = "rgba(255,255,255,0.06)";
const BORDER2  = "rgba(255,255,255,0.04)";
const TEXT     = "#F5F5F5";
const MUTED    = "#a1a1aa";
const MUTED2   = "#71717a";
const GOLD     = "#e2ca7a";
const POS      = "#22C55E";  // trade signals only
const NEG      = "#EF4444";  // trade signals only
// Aliases for inline use
const SURFACE  = CARD_TOP;
const SURFACE2 = CARD_BOT;

// ── Helpers ────────────────────────────────────────────────────────────────────
function calcEma(closes: number[], span: number): number[] {
  const k = 2 / (span + 1);
  const out: number[] = [];
  for (let i = 0; i < closes.length; i++)
    out.push(i === 0 ? closes[0] : closes[i] * k + out[i - 1] * (1 - k));
  return out;
}

const CACHE_TTL = 5 * 60_000;
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
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
}

// ── KPI config ─────────────────────────────────────────────────────────────────
const KPIS = [
  { key: "cagr",         label: "CAGR",    fmt: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, dot: (v: number) => v > 10 ? POS : v > 0 ? GOLD : NEG },
  { key: "sharpe",       label: "SHARPE",  fmt: (v: number) => v.toFixed(2),                           dot: (v: number) => v > 1  ? POS : v > 0.5 ? GOLD : NEG },
  { key: "maxDD",        label: "MAX DD",  fmt: (v: number) => `${v.toFixed(1)}%`,                     dot: (v: number) => v > -10 ? POS : v > -20 ? GOLD : NEG },
  { key: "calmar",       label: "CALMAR",  fmt: (v: number) => v.toFixed(2),                           dot: (v: number) => v > 1  ? POS : v > 0.5 ? GOLD : NEG },
  { key: "trades",       label: "TRADES",  fmt: (v: number) => String(Math.round(v)),                  dot: () => MUTED },
  { key: "winRate",      label: "WIN %",   fmt: (v: number) => `${v.toFixed(1)}%`,                     dot: (v: number) => v > 60 ? POS : v > 50 ? GOLD : NEG },
  { key: "profitFactor", label: "PF",      fmt: (v: number) => v.toFixed(2),                           dot: (v: number) => v > 1.5 ? POS : v > 1 ? GOLD : NEG },
  { key: "avgWin",       label: "AVG WIN", fmt: (v: number) => `+${v.toFixed(2)}%`,                    dot: () => POS },
];


// ── Page ───────────────────────────────────────────────────────────────────────
export default function TradingEnginePage() {
  const [strategy,  setStrategy]  = useState<Strategy>("EUR_30M");
  const [assetType, setAssetType] = useState<AssetType>("futures");
  const [params,    setParams]    = useState<Params>(DEFAULT_PARAMS["EUR_30M"]);
  const [startDate, setStartDate] = useState("2019-01-01");
  const [endDate,   setEndDate]   = useState(new Date().toISOString().slice(0, 10));
  const [result,    setResult]    = useState<BacktestResult | null>(null);
  const [running,   setRunning]   = useState(false);
  const [signal,    setSignal]    = useState<SignalData>({ direction: "flat" });
  const [health,    setHealth]    = useState<EngineHealth | null>(null);
  const [bars,      setBars]      = useState<OhlcBar[]>([]);
  const [codePanel, setCodePanel] = useState(false);
  const [strategyCode, setStrategyCode] = useState("");
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meta   = STRATEGIES[strategy];
  const online = health?.status === "ok";
  const ibkrOk = health?.ibkr === "connected";

  // Health
  const checkHealth = useCallback(async () => {
    try { setHealth(await engineClient.getHealth()); } catch { setHealth(null); }
  }, []);
  useEffect(() => { void checkHealth(); }, [checkHealth]);
  useEffect(() => {
    const id = setInterval(() => void checkHealth(), online ? 30_000 : 10_000);
    return () => clearInterval(id);
  }, [checkHealth, online]);

  // Backtest
  const runBacktest = useCallback(async () => {
    const ck = `bt_${strategy}_${assetType}_${JSON.stringify(params)}_${startDate}_${endDate}`;
    const cached = getCached(ck);
    if (cached) { setResult(cached); return; }
    setRunning(true);
    try {
      const data = await engineClient.postBacktest({ strategy, asset_type: assetType, params, start_date: startDate, end_date: endDate });
      setResult(data);
      if (!data.error) setCached(ck, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ metrics: {} as BacktestResult["metrics"], equity: [], drawdown: [], trades: [], error: msg.includes("30000") ? "Timeout — Zeitraum verkleinern" : "Engine offline" });
    } finally { setRunning(false); }
  }, [strategy, assetType, params, startDate, endDate]);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => void runBacktest(), 400);
  }, [runBacktest]);

  useEffect(() => { setParams(DEFAULT_PARAMS[strategy]); }, [strategy]);

  // Chart bars
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`http://localhost:5000/chart-data/${strategy}?asset_type=${assetType}&limit=2000`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
        if (r.ok) setBars(await r.json() as OhlcBar[]);
      } catch { /* offline */ }
    })();
  }, [strategy, assetType]);

  // Code panel
  useEffect(() => {
    if (!codePanel) return
    void fetch(`http://localhost:5000/strategy-code/${strategy}`)
      .then(r => r.json())
      .then(d => setStrategyCode((d as { code?: string }).code ?? ""))
      .catch(() => undefined)
  }, [codePanel, strategy])

  // Signal
  useEffect(() => {
    void engineClient.getSignal(strategy).then(setSignal).catch(() => undefined);
    const id = setInterval(() => void engineClient.getSignal(strategy).then(setSignal).catch(() => undefined), 30_000);
    return () => clearInterval(id);
  }, [strategy]);

  const trades  = result?.trades ?? [];
  const metrics = result?.metrics as Record<string, number> | undefined;
  const emaFast = Number(params.ema_fast ?? 20);
  const emaSlow = Number(params.ema_slow ?? 50);

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
      win: t.win,
      dir: t.dir ?? t.direction ?? "long",
      pnlPct: t.pnl_pct,
      pnlPips: t.pnl_pips,
    })).sort((a, b) => a.time - b.time),
  [trades]);

  const equityData = useMemo(() => {
    if (!result?.equity?.length) return [];
    const base = Math.abs(result.equity[0] ?? 0) < 5 ? 100 : 0;
    return result.equity.map((v, i) => ({
      y:  base + v,
      bh: result.buy_hold ? base + (result.buy_hold[i] ?? 0) : null,
      x:  (result.equity_dates?.[i] ?? "").slice(0, 4),
    }));
  }, [result]);

  const ddData = useMemo(() => {
    if (!result?.drawdown?.length) return [];
    return result.drawdown.map((v, i) => ({ dd: v, x: (result.equity_dates?.[i] ?? "").slice(0, 4) }));
  }, [result]);

  const setP = useCallback((k: string, v: number | string) => setParams(p => ({ ...p, [k]: v })), []);
  const setZeitraum = useCallback((y: number | null) => {
    const end = new Date().toISOString().slice(0, 10);
    setEndDate(end);
    if (y === null) { setStartDate("2007-01-01"); return; }
    const d = new Date(); d.setFullYear(d.getFullYear() - y);
    setStartDate(d.toISOString().slice(0, 10));
  }, []);

  const sigColor = signal.direction === "long" ? POS : signal.direction === "short" ? NEG : MUTED;
  const sigLabel = signal.direction === "long" ? "LONG ▲" : signal.direction === "short" ? "SHORT ▼" : "FLAT —";
  const assetSym = assetType === "futures" ? meta.futures : meta.cfd;

  return (
    <>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        input[type=range]{-webkit-appearance:none;height:2px;background:${BORDER};border-radius:2px;outline:none;width:100%;cursor:pointer}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:${GOLD};cursor:pointer}
        input[type=number]{-moz-appearance:textfield}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.4);cursor:pointer}
        select option{background:${CARD_TOP}}
        .e-root{display:grid;grid-template-rows:28px 1fr;grid-template-columns:1fr 280px${codePanel ? ' 400px' : ''};height:100%;width:100%;background:${BG};overflow:hidden;color:${TEXT};font-family:var(--font-montserrat,system-ui)}
        .e-codepanel{grid-column:3;grid-row:2;border-left:1px solid ${BORDER};display:flex;flex-direction:column;background:${BG};overflow:hidden}
        .e-status{grid-column:1/-1;grid-row:1;display:flex;align-items:center;gap:8px;padding:0 12px;background:${CARD_TOP};border-bottom:1px solid ${BORDER};flex-shrink:0}
        .e-main{grid-column:1;grid-row:2;display:grid;grid-template-rows:55% 45%;overflow:hidden}
        .e-chart{grid-row:1;position:relative;overflow:hidden;border-bottom:1px solid ${BORDER};width:100%}
        .e-tester{grid-row:2;display:grid;grid-template-columns:65% 35%;overflow:hidden}
        .e-charts-col{display:flex;flex-direction:column;overflow:hidden;border-right:1px solid ${BORDER};padding:4px 2px 4px 6px}
        .e-kpi-col{overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:6px}
        .e-sidebar{grid-column:2;grid-row:2;border-left:1px solid ${BORDER};overflow-y:auto;padding:10px 12px 24px;background:${CARD_TOP}}
        .sl{font-size:8.5px;font-weight:700;color:${MUTED2};letter-spacing:.12em;text-transform:uppercase;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid ${BORDER2}}
        .strat{display:flex;justify-content:space-between;align-items:center;padding:5px 0 5px 8px;border-left:2px solid transparent;border-radius:0 4px 4px 0;cursor:pointer;font-size:11px;color:${MUTED};background:none;border-top:none;border-right:none;border-bottom:none;width:100%;text-align:left;transition:color .15s,border-color .15s,background .15s}
        .strat.on{color:${TEXT};border-left-color:${GOLD};background:linear-gradient(90deg,rgba(226,202,122,0.06) 0%,transparent 80%)}
        .strat:hover:not(.on){color:${TEXT};background:rgba(255,255,255,0.02)}
        .kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
        .kpi-card{padding:7px 9px;background:linear-gradient(to bottom,${CARD_TOP},${CARD_BOT});border-radius:10px;border:1px solid ${BORDER};box-shadow:0 8px 24px -8px rgba(0,0,0,0.45)}
        .kpi-val{font-size:17px;font-weight:800;font-family:var(--font-nunito,monospace);color:${TEXT};line-height:1.1;display:flex;align-items:center;gap:5px}
        .kpi-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;margin-top:2px}
        .kpi-lbl{font-size:8px;color:${MUTED2};letter-spacing:.1em;text-transform:uppercase;margin-top:3px}
        .trade-tbl{width:100%;border-collapse:collapse}
        .trade-tbl th{padding:3px 4px;font-size:7.5px;color:${MUTED2};font-weight:600;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid ${BORDER};text-align:left;position:sticky;top:0;background:${CARD_TOP}}
        .trade-tbl td{padding:2px 4px;font-size:10px;font-family:var(--font-nunito,monospace)}
      `}</style>

      <div className="e-root">
        {/* Status */}
        <div className="e-status">
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: !online ? NEG : !ibkrOk ? GOLD : POS, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: MUTED }}>
            {!online ? "Engine offline — starte Desktop\\start.bat"
              : `Engine online · ${ibkrOk ? `IBKR verbunden${health?.paper_mode ? " (Paper)" : ""}` : "IBKR nicht verbunden"} · localhost:5000`}
          </span>
          {running && <div style={{ marginLeft: 8, width: 8, height: 8, border: `1.5px solid ${GOLD}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .7s linear infinite" }} />}
        </div>

        {/* Main */}
        <div className="e-main">
          {/* Chart */}
          <div className="e-chart">
            <div style={{ position: "absolute", top: 8, left: 10, zIndex: 5, display: "flex", gap: 10, alignItems: "center", pointerEvents: "none" }}>
              <span style={{ fontSize: 11, color: MUTED }}>{assetSym} · {meta.interval}</span>
              {meta.useEma && signal.ema_fast_val != null && (
                <>
                  <span style={{ fontSize: 10, color: GOLD, fontFamily: "var(--font-nunito,monospace)" }}>F {signal.ema_fast_val.toFixed(5)}</span>
                  <span style={{ fontSize: 10, color: `${MUTED}80`, fontFamily: "var(--font-nunito,monospace)" }}>S {signal.ema_slow_val?.toFixed(5)}</span>
                </>
              )}
            </div>
            <div style={{ position: "absolute", top: 8, right: 10, zIndex: 5, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: sigColor }}>{sigLabel}</span>
              <button
                onClick={() => setCodePanel(p => !p)}
                style={{
                  background: 'none', border: `1px solid ${BORDER}`,
                  color: codePanel ? GOLD : MUTED2,
                  padding: '3px 7px', cursor: 'pointer',
                  fontFamily: 'monospace', fontSize: 10, borderRadius: 3,
                }}
              >{'</>'}</button>
            </div>
            <div style={{ width: "100%", height: "100%", minHeight: 400 }}>
              <ChartComponent
                data={bars}
                trades={chartTrades}
                emaFastData={emaFastData}
                emaSlowData={emaSlowData}
                showEma={meta.useEma}
              />
            </div>
            {bars.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <span style={{ fontSize: 11, color: `${MUTED}50` }}>{online ? "Lade Chart-Daten…" : "Engine offline"}</span>
              </div>
            )}
          </div>

          {/* Tester */}
          <div className="e-tester">
            <div className="e-charts-col">
              {result?.error ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 11, color: NEG }}>{result.error}</span>
                </div>
              ) : (
                <>
                  <div style={{ flex: 7, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={equityData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                        <XAxis dataKey="x" tick={{ fontSize: 9, fill: MUTED2, fontFamily: 'var(--font-montserrat,system-ui)' }} tickLine={{ stroke: '#1A1A1A' }} axisLine={{ stroke: '#1A1A1A' }} interval="preserveStartEnd" />
                        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: MUTED2, fontFamily: 'var(--font-nunito,monospace)' }} tickLine={{ stroke: '#1A1A1A' }} axisLine={{ stroke: '#1A1A1A' }} width={45} tickFormatter={v => `${Number(v).toFixed(0)}%`} />
                        <Tooltip contentStyle={{ background: '#111111', border: '1px solid #1A1A1A', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-nunito,monospace)' }} labelStyle={{ color: MUTED2 }} formatter={(v: unknown, n: unknown) => [`${Number(v).toFixed(2)}%`, n === "y" ? "Strategie" : "Buy & Hold"]} />
                        <Line type="monotone" dataKey="y"  stroke={TEXT}    dot={false} strokeWidth={1.5} />
                        <Line type="monotone" dataKey="bh" stroke="#333333" dot={false} strokeWidth={1} strokeDasharray="4 3" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ flex: 3, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={ddData} margin={{ top: 2, right: 6, left: 0, bottom: 0 }}>
                        <XAxis dataKey="x" tick={{ fontSize: 7, fill: `${MUTED}60` }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis domain={["auto", 0]} tick={{ fontSize: 8, fill: MUTED2, fontFamily: 'var(--font-nunito,monospace)' }} tickLine={{ stroke: '#1A1A1A' }} axisLine={{ stroke: '#1A1A1A' }} width={45} tickFormatter={v => `${Number(v).toFixed(1)}%`} />
                        <Tooltip contentStyle={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 4, fontSize: 9 }} formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, "Drawdown"]} />
                        <Area type="monotone" dataKey="dd" stroke={NEG} fill={`${NEG}20`} strokeWidth={1} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>

            <div className="e-kpi-col">
              <div className="kpi-grid">
                {KPIS.map(kpi => {
                  const val = metrics?.[kpi.key] ?? 0;
                  return (
                    <div key={kpi.key} className="kpi-card">
                      <div className="kpi-val">
                        <div className="kpi-dot" style={{ background: kpi.dot(val) }} />
                        {kpi.fmt(val)}
                      </div>
                      <div className="kpi-lbl">{kpi.label}</div>
                    </div>
                  );
                })}
              </div>
              {trades.length > 0 && (
                <div style={{ flex: 1, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 3, minHeight: 0 }}>
                  <table className="trade-tbl">
                    <thead>
                      <tr>{["#", "Datum", "D", "Entry", "Exit", "Pips", "PnL"].map(h => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {[...trades].reverse().slice(0, 120).map((t: TradeRecord, i) => {
                        const dir = t.dir ?? t.direction ?? "long";
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? SURFACE : SURFACE2 }}>
                            <td style={{ color: MUTED }}>{trades.length - i}</td>
                            <td style={{ color: MUTED }}>{(t.entry_date ?? "").slice(5, 10)}</td>
                            <td style={{ fontWeight: 700, color: dir === "short" ? NEG : POS }}>{dir === "short" ? "S" : "L"}</td>
                            <td style={{ color: MUTED }}>{t.entry?.toFixed(4)}</td>
                            <td style={{ color: MUTED }}>{t.exit?.toFixed(4) ?? "—"}</td>
                            <td style={{ textAlign: 'right', color: (t.pnl_pips ?? 0) >= 0 ? POS : NEG, fontFamily: 'var(--font-nunito,monospace)' }}>
                              {t.pnl_pips != null ? `${(t.pnl_pips ?? 0) > 0 ? '+' : ''}${t.pnl_pips.toFixed(0)}p` : '—'}
                            </td>
                            <td style={{ textAlign: "right", color: t.win ? POS : NEG, fontWeight: 600, fontFamily: 'var(--font-nunito,monospace)' }}>
                              {t.win ? "+" : ""}{(t.pnl_pct * 100).toFixed(2)}%
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
        </div>

        {/* Sidebar */}
        <div className="e-sidebar">
          <div className="sl">Strategy</div>
          {(Object.keys(STRATEGIES) as Strategy[]).map(id => (
            <button key={id} onClick={() => setStrategy(id)} className={`strat${strategy === id ? " on" : ""}`}>
              <span>{STRATEGIES[id].label}</span>
              <span style={{ fontSize: 9, color: strategy === id ? `${GOLD}70` : `${MUTED}50`, fontFamily: "var(--font-nunito,monospace)" }}>
                {assetType === "futures" ? STRATEGIES[id].futures : STRATEGIES[id].cfd}
              </span>
            </button>
          ))}

          <div className="sl">Asset</div>
          <div style={{ display: "flex", gap: 10, fontSize: 12, fontWeight: 700 }}>
            <span onClick={() => setAssetType("futures")} style={{ cursor: "pointer", color: assetType === "futures" ? GOLD : MUTED }}>{meta.futures}</span>
            <span style={{ color: BORDER }}>|</span>
            <span onClick={() => setAssetType("cfd")} style={{ cursor: "pointer", color: assetType === "cfd" ? GOLD : MUTED }}>{meta.cfd}</span>
          </div>

          <div className="sl">Zeitraum</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
            {([1, 3, 5, null] as (number | null)[]).map(y => (
              <span key={y ?? "max"} onClick={() => setZeitraum(y)}
                style={{ fontSize: 10, color: MUTED, cursor: "pointer", fontWeight: 600 }}>
                {y ? `${y}J` : "Max"}
              </span>
            ))}
          </div>
          {([["Von", startDate, setStartDate], ["Bis", endDate, setEndDate]] as [string, string, (v: string) => void][]).map(([lbl, val, setter]) => (
            <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 9, color: MUTED, width: 22, flexShrink: 0 }}>{lbl}</span>
              <input type="date" value={val} onChange={e => setter(e.target.value)}
                style={{ flex: 1, fontSize: 9, background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, color: MUTED, outline: "none", padding: "1px 0", fontFamily: "var(--font-nunito,monospace)" }}
              />
            </div>
          ))}

          <div className="sl">Parameter</div>
          {PARAM_DEFS[strategy].map(def => (
            <ParamRow key={`${strategy}-${def.key}`} def={def} value={params[def.key] ?? ""} onChange={v => setP(def.key, v)} />
          ))}

          <div className="sl">Signal</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: sigColor, letterSpacing: ".02em", marginBottom: 8 }}>{sigLabel}</div>
          {meta.useEma && signal.ema_fast_val != null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {([
                ["EMA Fast", signal.ema_fast_val?.toFixed(5), GOLD],
                ["EMA Slow", signal.ema_slow_val?.toFixed(5), `${MUTED}80`],
                ["Last Cross", signal.last_cross_date, MUTED],
              ] as [string, string | undefined, string][]).filter(([, v]) => v).map(([l, v, col]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: MUTED }}>{l}</span>
                  <span style={{ fontSize: 10, color: col, fontFamily: "var(--font-nunito,monospace)" }}>{v}</span>
                </div>
              ))}
            </div>
          )}
          {signal.entry != null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {([
                ["Entry", signal.entry?.toFixed(4), TEXT],
                ["SL",    signal.sl?.toFixed(4),    NEG ],
                ["TP",    signal.tp?.toFixed(4),    POS ],
              ] as [string, string | undefined, string][]).filter(([, v]) => v).map(([l, v, col]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: MUTED }}>{l}</span>
                  <span style={{ fontSize: 10, color: col, fontFamily: "var(--font-nunito,monospace)" }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {codePanel && (
          <div className="e-codepanel">
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: MUTED2, fontFamily: 'monospace' }}>
                {strategy.toLowerCase()}_strategy.py
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => void fetch(`http://localhost:5000/strategy-code/${strategy}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: strategyCode }),
                  })}
                  style={{ fontSize: 9, color: MUTED, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 2, padding: '2px 8px', cursor: 'pointer' }}
                >Speichern</button>
                <button
                  onClick={() => void runBacktest()}
                  style={{ fontSize: 9, color: GOLD, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 2, padding: '2px 8px', cursor: 'pointer' }}
                >Ausführen</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <MonacoEditor
                height="100%"
                language="python"
                theme="vs-dark"
                value={strategyCode}
                onChange={v => setStrategyCode(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, wordWrap: 'on' }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── ParamRow ───────────────────────────────────────────────────────────────────
function ParamRow({ def, value, onChange }: { def: ParamDef; value: number | string; onChange: (v: number | string) => void }) {
  const labelSt: React.CSSProperties = { fontSize: 9.5, color: MUTED };
  const valSt:   React.CSSProperties = { fontSize: 11, color: TEXT, fontFamily: "var(--font-nunito,monospace)", fontWeight: 600 };

  if (def.type === "select") return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <span style={labelSt}>{def.label}</span>
      <select value={value as string} onChange={e => onChange(e.target.value)}
        style={{ ...valSt, background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, outline: "none", cursor: "pointer" }}>
        {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  if (def.type === "slider") return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={labelSt}>{def.label}</span>
        <span style={valSt}>{value}</span>
      </div>
      <input type="range" min={def.min} max={def.max} step={def.step} value={value as number}
        onChange={e => onChange((def.step ?? 1) < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10))}
      />
    </div>
  );

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <span style={labelSt}>{def.label}</span>
      <input type="number" min={def.min} max={def.max} step={def.step} value={value as number}
        onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); }}
        style={{ ...valSt, background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, outline: "none", width: 72, textAlign: "right" }}
      />
    </div>
  );
}
