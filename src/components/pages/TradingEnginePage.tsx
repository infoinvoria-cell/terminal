"use client";

import {
  useEffect, useRef, useState, useCallback, useMemo,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";

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
type TesterTab = "overview" | "performance" | "trades" | "settings";
interface OhlcBar { time: number; open: number; high: number; low: number; close: number; }

interface StrategyMeta { label: string; futures: string; cfd: string; interval: string; useEma: boolean; icon: string; engine?: string; }
const STRATEGIES: Record<Strategy, StrategyMeta> = {
  EUR_30M: { label: "EUR/USD 30M",    futures: "6E",     cfd: "EURUSD", interval: "30m", useEma: false, icon: "/asset-icons/eurusd.png", engine: "Liquidity Sweep · ATR SL · TP 3R" },
  DAX_1H:  { label: "DAX 1H",         futures: "FDAX1!", cfd: "DE30",   interval: "1H",  useEma: true,  icon: "/asset-icons/dax.png" },
  DAX_2H:  { label: "DAX 2H",         futures: "FDAX1!", cfd: "DE30",   interval: "2H",  useEma: true,  icon: "/asset-icons/dax.png" },
  GC_FRI:  { label: "Gold Friday",    futures: "GC1!",   cfd: "XAUUSD", interval: "D",   useEma: false, icon: "/asset-icons/gold.png" },
  GLD_THU: { label: "Gold Thursday",  futures: "GLD",    cfd: "XAUUSD", interval: "D",   useEma: false, icon: "/asset-icons/gold.png" },
  YM_TAT:  { label: "Dow Jones",      futures: "YM1!",   cfd: "US30",   interval: "D",   useEma: false, icon: "/asset-icons/dow_jones.png" },
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
const DEFAULT_PARAMS: Record<Strategy, Params> = {
  EUR_30M: { fo_pips: 0.00012, sl_atr_mult: 1.5, tp_crv: 3.0, session_start_h: 7, session_end_h: 11, flip_threshold: 0.55, spec_threshold: 0.7, min_candle_size: 0.0008, max_candle_size: 0.005, engulfing_only: 1, use_regime: 1 },
  DAX_1H:  { ema_fast: 20, ema_slow: 50, sl_pts: 35,      tp_pts: 126,     direction: "both", session_start: 8,  session_end: 17 },
  DAX_2H:  { ema_fast: 4,  ema_slow: 20, sl_pts: 50,      tp_pts: 150,     direction: "both", session_start: 8,  session_end: 18 },
  GC_FRI:  { atr_len: 14, sl_mult: 0.75, rr: 1.25 },
  GLD_THU: { atr_len: 14, sl_mult: 1.5,  rr: 2.0  },
  YM_TAT:  { atr_len: 14, sl_mult: 1.0,  rr: 2.0  },
};

// ── Single background color — matches sidebar ────────────────────────────────
const BG      = "#0a0a0c";
const GAP     = "#000000";
const GOLD    = "#C9A84C";
const GOLD_S  = "#C9A84C";
const GOLD_DIM= "rgba(201,168,76,0.12)";
const TXT     = "#F0F0F0";
const MUT     = "#9ca3af";
const DIM     = "#6b7280";
const FAINT   = "#4b5563";
const BORDER  = "rgba(255,255,255,0.06)";
const RED     = "#dc2626";

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
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
function valColor(v: number): string {
  if (v < 0) return GOLD;
  return TXT;
}

type BadgeStatus = "ok" | "warn" | "fail" | "pending";
interface ValidationBadge { label: string; value: string; status: BadgeStatus; tooltip?: string }
const STRATEGY_VALIDATION: Partial<Record<Strategy, ValidationBadge[]>> = {
  EUR_30M: [
    { label: "Basis",        value: "PF 1.275", status: "ok",   tooltip: "2007-2026: 771 Trades, PF=1.275, MaxDD=-19.3%, CAGR=75.1%, Sharpe=0.449 — sl=1.5, be=2.0" },
    { label: "Param Stabil", value: "68%",      status: "ok",   tooltip: "17/25 SL×TP-Varianten profitabel. sl>=1.0 durchgehend robust." },
    { label: "MAX DD",       value: "-19.3%",   status: "ok",   tooltip: "MaxDD -19.3% unter institutionellem Limit von -20%. sl=1.5 + be=2.0." },
    { label: "WF",           value: "ausstehend", status: "pending", tooltip: "Walk-Forward noch nicht berechnet" },
    { label: "Status",       value: "APPROVED_LIVE", status: "ok", tooltip: "EUR 30M v3 FINAL: PF=1.275, MaxDD=-19.3%, Trades=771, Parity=80.7%" },
  ],
};

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

// ── Page ───────────────────────────────────────────────────────────────────────
export default function TradingEnginePage() {
  const [strategy,  setStrategy]  = useState<Strategy>("EUR_30M");
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
  const [codeSaving,  setCodeSaving]  = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sidebar = useResizable(260, 200, 400, "left");
  const codeW   = useResizable(380, 280, 600, "right");

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
    setRunning(true); setBtPhase("Lade Daten...");
    try {
      let data: BacktestResult;
      if (BT_STRATEGIES.has(strategy)) {
        const btAsset = assetType === "cfd" ? "spot" : assetType;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300_000);
        setBtPhase("Berechne Signal...");
        const r = await fetch("http://localhost:5000/backtest", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy, asset_type: btAsset, params, start_date: startDate, end_date: endDate }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        setBtPhase("Fertig ✓");
        const raw = await r.json();
        if (raw.error) {
          data = { metrics: {} as BacktestResult["metrics"], equity: [], drawdown: [], trades: [], error: raw.error };
        } else {
          data = {
            metrics: raw.metrics ?? raw,
            equity: raw.equity_curve ?? raw.equity ?? [],
            drawdown: raw.drawdown ?? [],
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
      setResult({ metrics: {} as BacktestResult["metrics"], equity: [], drawdown: [], trades: [], error: msg.includes("abort") || msg.includes("Abort") ? "Backtest-Timeout — Engine neu starten" : "Engine offline" });
    } finally { setRunning(false); setBtPhase(""); }
  }, [strategy, assetType, params, startDate, endDate]);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => void runBacktest(), 500);
  }, [runBacktest]);
  useEffect(() => { setParams(DEFAULT_PARAMS[strategy]); }, [strategy]);

  useEffect(() => {
    void (async () => {
      try {
        const asset = assetType === "cfd" ? "spot" : assetType;
        const r = await fetch(`http://localhost:5000/chart-data/${strategy}?asset_type=${asset}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
        if (r.ok) setBars(await r.json() as OhlcBar[]);
      } catch {}
    })();
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
  const equityData = useMemo(() => {
    if (!result?.equity?.length) return [];
    const first = result.equity[0] ?? 0;
    const isAbsolute = first > 1000;
    return result.equity.map((v, i) => {
      const y = isAbsolute ? ((v / first) - 1) * 100 : v;
      const bh = result.buy_hold?.[i] != null
        ? (isAbsolute ? ((result.buy_hold[i]! / (result.buy_hold[0] ?? first)) - 1) * 100 : result.buy_hold[i]!)
        : null;
      return { y, bh, x: (result.equity_dates?.[i] ?? "").slice(0, 7) };
    });
  }, [result]);
  const ddData = useMemo(() => {
    if (!result?.drawdown?.length) return [];
    return result.drawdown.map((v, i) => ({ dd: v, x: (result.equity_dates?.[i] ?? "").slice(0, 7) }));
  }, [result]);
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
  const sigLabel = signal.direction === "long" ? "LONG" : signal.direction === "short" ? "SHORT" : "FLAT";
  const assetSym = assetType === "futures" ? meta.futures : meta.cfd;

  return (
    <>
      <style>{`
        @keyframes espin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        input[type=range]{-webkit-appearance:none;height:2px;background:${BORDER};border-radius:2px;outline:none;width:100%;cursor:pointer}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:${GOLD};cursor:pointer}
        input[type=number]{-moz-appearance:textfield}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.4);cursor:pointer}
        select option{background:${BG}}

        .e-root{display:flex;height:100%;width:100%;background:#000;overflow:hidden;color:${TXT};font-family:var(--font-text);gap:10px;padding:10px}
        .e-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}
        .e-chart-wrap{flex:55%;min-height:0;background:${BG};border:1px solid #1e1e1e;border-radius:10px;display:flex;flex-direction:column;overflow:hidden}
        .e-chart-header{height:36px;flex-shrink:0;display:flex;align-items:center;padding:0 12px;gap:8px;border-bottom:1px solid ${BORDER}}
        .e-chart-body{flex:1;position:relative;min-height:0;overflow:hidden}
        .e-chart-footer{height:28px;flex-shrink:0;display:flex;align-items:center;padding:0 10px;gap:3px;border-top:1px solid ${BORDER}}
        .e-tester-wrap{flex:45%;min-height:0;background:${BG};border:1px solid #1e1e1e;border-radius:10px;display:flex;flex-direction:column;overflow:hidden}

        .e-sidebar{width:${sidebar.w}px;flex-shrink:0;overflow-y:auto;overflow-x:hidden;position:relative;display:flex;flex-direction:column;gap:10px}
        .e-sidebar-resize{position:absolute;top:0;left:0;width:3px;height:100%;cursor:col-resize;z-index:5}
        .e-sidebar-resize:hover{background:${GOLD}40}
        .e-sidebar-card{background:${BG};border:1px solid #1e1e1e;border-radius:10px;padding:12px 14px;flex-shrink:0}
        .e-sidebar-card-scroll{background:${BG};border:1px solid #1e1e1e;border-radius:10px;padding:12px 14px;flex:1;overflow-y:auto;min-height:0}

        .e-codepanel{width:${codeW.w}px;flex-shrink:0;background:${BG};border:1px solid #1e1e1e;border-radius:10px;display:flex;flex-direction:column;overflow:hidden;position:relative}
        .e-code-resize{position:absolute;top:0;left:0;width:3px;height:100%;cursor:col-resize;z-index:5}
        .e-code-resize:hover{background:${GOLD}40}

        .e-tester-head{display:flex;align-items:center;height:36px;flex-shrink:0;border-bottom:1px solid ${BORDER};padding:0 12px;gap:0}
        .e-tester-body{flex:1;overflow:hidden;display:flex}

        .e-tab{padding:0 14px;height:36px;display:flex;align-items:center;font-size:11px;font-weight:500;color:${DIM};cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;transition:color .15s,border-color .15s}
        .e-tab:hover{color:${MUT}}
        .e-tab.on{color:${TXT};border-bottom-color:${GOLD}}

        .e-charts-col{display:flex;flex-direction:column;overflow:hidden;border-right:1px solid ${BORDER};padding:4px 2px 4px 6px;flex:1;min-width:0}
        .e-kpi-col{overflow-y:auto;padding:10px 8px;display:flex;flex-direction:column;gap:8px;width:240px;flex-shrink:0}

        .kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:${BORDER};border-radius:8px;overflow:hidden}
        .kpi-tile{background:#0f0f0f;padding:14px 12px 10px;display:flex;flex-direction:column;gap:5px;border:1px solid transparent;transition:border-color .2s;cursor:default}
        .kpi-tile:hover{border-color:rgba(201,168,76,0.25)}
        .kpi-tile-label{font-size:8px;font-weight:600;color:#888;letter-spacing:.1em;text-transform:uppercase;font-family:var(--font-text)}
        .kpi-tile-value{font-size:22px;font-weight:600;font-family:var(--font-numbers);font-variant-numeric:tabular-nums;line-height:1;color:${TXT}}
        .kpi-skel-label{height:7px;width:45%;border-radius:2px;background:linear-gradient(90deg,#1a1a1a 25%,#282828 50%,#1a1a1a 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}
        .kpi-skel-value{height:22px;width:65%;border-radius:3px;margin-top:5px;background:linear-gradient(90deg,#1a1a1a 25%,#282828 50%,#1a1a1a 75%);background-size:200% 100%;animation:shimmer 1.4s infinite .12s}

        .icon-btn{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid ${BORDER};border-radius:5px;background:none;color:#888;cursor:pointer;transition:color .15s,border-color .15s;flex-shrink:0}
        .icon-btn:hover,.icon-btn.active{color:${GOLD};border-color:rgba(201,168,76,0.35)}

        .sl{font-size:9px;font-weight:600;color:${FAINT};letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px}
        .strat-btn{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:11.5px;color:${MUT};background:none;border:1px solid transparent;width:100%;text-align:left;transition:all .15s;margin-bottom:2px}
        .strat-btn:hover{background:rgba(255,255,255,0.02);color:${TXT}}
        .strat-btn.on{color:${TXT};background:${GOLD_DIM};border-color:rgba(201,168,76,0.2)}

        .kpi-row{display:flex;justify-content:space-between;align-items:baseline;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,0.03)}
        .kpi-row:last-child{border-bottom:none}
        .kpi-label{font-size:10px;color:${DIM};letter-spacing:.04em}
        .kpi-value{font-size:15px;font-weight:700;font-family:var(--font-numbers)}

        .trade-tbl{width:100%;border-collapse:collapse}
        .trade-tbl th{padding:6px 8px;font-size:9px;color:${DIM};font-weight:600;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid ${BORDER};text-align:left;position:sticky;top:0;background:${BG};cursor:pointer;user-select:none;white-space:nowrap}
        .trade-tbl th:hover{color:${MUT}}
        .trade-tbl td{padding:4px 8px;font-size:11px;font-family:var(--font-numbers)}

        .tf-btn{padding:2px 7px;font-size:10px;font-weight:600;color:${DIM};background:none;border:1px solid transparent;border-radius:4px;cursor:pointer;transition:all .15s}
        .tf-btn:hover{color:${MUT};border-color:${BORDER}}
        .tf-btn.on{color:${TXT};background:rgba(255,255,255,0.04);border-color:${BORDER}}

        .perf-tbl{width:100%;border-collapse:collapse}
        .perf-tbl tr{border-bottom:1px solid rgba(255,255,255,0.03)}
        .perf-tbl td{padding:8px 14px;font-size:11.5px}
        .perf-tbl td:first-child{color:${DIM};font-size:10.5px}
        .perf-tbl td:last-child{text-align:right;font-family:var(--font-numbers);font-weight:600;color:${TXT}}

        .tbtn{background:none;border:1px solid ${BORDER};color:${DIM};padding:4px 8px;border-radius:4px;cursor:pointer;font-size:10px;transition:all .12s;display:flex;align-items:center;gap:4px}
        .tbtn:hover{color:${TXT};border-color:rgba(255,255,255,0.12)}
        .tbtn.active{color:${GOLD};border-color:rgba(201,168,76,0.3)}

        .settings-drop{position:absolute;top:32px;right:0;background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:12px 16px;z-index:20;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,0.7)}

        .pill{padding:3px 10px;border-radius:4px;font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;border:1px solid transparent}
        .pill.on{color:${TXT};background:rgba(255,255,255,0.06);border-color:${BORDER}}
        .pill:not(.on){color:${DIM}}
        .pill:not(.on):hover{color:${MUT}}
      `}</style>

      <div className="e-root">
        {/* ── Main area ── */}
        <div className="e-main">
          {/* Chart */}
          <div className="e-chart-wrap">
            {/* Header — icon · symbol · interval · buttons only */}
            <div className="e-chart-header">
              <Image src={meta.icon} alt="" width={18} height={18} style={{ borderRadius: 4, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TXT }}>{assetSym}</span>
              <span style={{ fontSize: 10, color: FAINT }}>{meta.interval}</span>
              <div style={{ flex: 1 }} />
              <button className={`icon-btn${codePanel ? " active" : ""}`} onClick={() => setCodePanel(p => !p)} title="Strategy Code">
                <span style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 1 }}>{"</>"}</span>
              </button>
              <div style={{ position: "relative" }}>
                <button className="icon-btn" onClick={() => setShowSettings(s => !s)} title="Engine Settings">
                  <span style={{ fontSize: 13, lineHeight: 1 }}>⚙</span>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: online ? GOLD : FAINT, position: "absolute", top: 3, right: 3 }} />
                </button>
                {showSettings && (
                  <div className="settings-drop">
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
              {hasData ? (
                <ChartComponent data={bars} trades={chartTrades} emaFastData={emaFastData} emaSlowData={emaSlowData}
                  showEma={meta.useEma && (showEmaFast || showEmaSlow)} showEmaFast={showEmaFast} showEmaSlow={showEmaSlow} visibleDays={chartDays}
                  priceLines={signal.direction !== "flat" ? [
                    ...(signal.entry != null ? [{ price: signal.entry, color: "#C9A84C", label: "Entry" }] : []),
                    ...(signal.sl != null    ? [{ price: signal.sl,    color: GOLD, label: "SL" }] : []),
                    ...(signal.tp != null    ? [{ price: signal.tp,    color: TXT,  label: "TP" }] : []),
                  ] : []} />
              ) : (
                <NoData text={online ? "Loading chart data..." : "Start engine to load chart"} />
              )}
            </div>

            {/* Timeframe footer */}
            <div className="e-chart-footer">
              {TIMEFRAMES.map(tf => (
                <button key={tf.label} className={`tf-btn${chartDays === tf.days ? " on" : ""}`} onClick={() => setChartDays(tf.days)}>{tf.label}</button>
              ))}
            </div>
          </div>

          {/* Tester */}
          <div className="e-tester-wrap">
            <div className="e-tester-head">
              {TAB_LABELS.map(t => (
                <button key={t.key} className={`e-tab${testerTab === t.key ? " on" : ""}`} onClick={() => setTesterTab(t.key)}>{t.label}</button>
              ))}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: FAINT, fontFamily: "var(--font-numbers)", flexShrink: 0 }}>
                {hasResult ? `${trades.length} Trades · ${startDate.slice(0, 4)}–${endDate.slice(0, 4)}` : hasData ? `${bars.length.toLocaleString()} Kerzen geladen` : ""}
              </span>
              <button onClick={() => void runBacktest()} disabled={running}
                style={{ marginLeft: 10, fontSize: 10, fontWeight: 600, color: running ? DIM : BG, background: running ? "rgba(255,255,255,0.06)" : GOLD, border: "none", borderRadius: 4, padding: '5px 16px', cursor: running ? 'default' : 'pointer', flexShrink: 0, transition: "all .15s" }}>
                {running ? (btPhase || "Running...") : "Run Backtest"}
              </button>
            </div>

            <div className="e-tester-body">
              {result?.error ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 11, color: DIM }}>{result.error}</span>
                </div>
              ) : testerTab === "overview" ? (
                <>
                  <div className="e-charts-col">
                    {hasResult && equityData.length > 0 ? (
                      <>
                        <div style={{ flex: 7, minHeight: 0 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={equityData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                              <XAxis dataKey="x" tick={{ fontSize: 9, fill: FAINT }} tickLine={{ stroke: BORDER }} axisLine={{ stroke: BORDER }} interval={Math.max(1, Math.floor(equityData.length / 8))} tickFormatter={v => String(v).slice(0, 4)} />
                              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: DIM, fontFamily: 'var(--font-numbers)' }} tickLine={{ stroke: BORDER }} axisLine={{ stroke: BORDER }} width={50} tickFormatter={v => `${Number(v).toFixed(0)}%`} />
                              <Tooltip contentStyle={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 10, fontFamily: 'var(--font-numbers)' }} labelStyle={{ color: DIM }} formatter={(v: unknown, n: unknown) => [`${Number(v).toFixed(2)}%`, n === "y" ? "Strategy" : "Buy & Hold"]} />
                              <Line type="monotone" dataKey="y" stroke="#F5F5F5" dot={false} strokeWidth={1.5} name="Strategy" />
                              {equityData.some(d => d.bh != null) && <Line type="monotone" dataKey="bh" stroke="#333333" dot={false} strokeWidth={1} strokeDasharray="4 3" name="Buy & Hold" />}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <div style={{ flex: 3, minHeight: 0 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={ddData} margin={{ top: 2, right: 6, left: 0, bottom: 0 }}>
                              <XAxis dataKey="x" tick={{ fontSize: 7, fill: FAINT }} tickLine={false} axisLine={false} interval={Math.max(1, Math.floor(ddData.length / 8))} tickFormatter={v => String(v).slice(0, 4)} />
                              <YAxis domain={["auto", 0]} tick={{ fontSize: 8, fill: DIM, fontFamily: 'var(--font-numbers)' }} tickLine={{ stroke: BORDER }} axisLine={{ stroke: BORDER }} width={50} tickFormatter={v => `${Number(v).toFixed(1)}%`} />
                              <Tooltip contentStyle={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 9 }} formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, "Drawdown"]} />
                              <Area type="monotone" dataKey="dd" stroke={GOLD} fill="rgba(201,168,76,0.12)" strokeWidth={1} dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    ) : (
                      <NoData text="Run backtest to see equity curve" />
                    )}
                  </div>
                  <div className="e-kpi-col">
                    {/* Primary tiles — 2-column grid */}
                    <div className="kpi-grid">
                      {(["cagr","maxDD","profitFactor","sharpe","trades","winRate"] as const).map(key => {
                        const kpi = KPIS.find(k => k.key === key)!;
                        const val = metrics?.[key] ?? 0;
                        const col = running ? FAINT
                          : !hasResult ? FAINT
                          : key === "cagr" ? (val > 0 ? GOLD : TXT)
                          : TXT;
                        return (
                          <div key={key} className="kpi-tile">
                            <span className="kpi-tile-label">{kpi.label}</span>
                            {running ? (
                              <>
                                <div className="kpi-skel-label" />
                                <div className="kpi-skel-value" />
                              </>
                            ) : (
                              <span className="kpi-tile-value" style={{ color: col }}>{hasResult ? kpi.fmt(val) : "—"}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Secondary rows */}
                    {(["calmar","avgWin"] as const).map(key => {
                      const kpi = KPIS.find(k => k.key === key)!;
                      const val = metrics?.[key] ?? 0;
                      return (
                        <div key={key} className="kpi-row">
                          <span className="kpi-label">{kpi.label}</span>
                          <span className="kpi-value" style={{ color: TXT }}>{hasResult ? kpi.fmt(val) : "—"}</span>
                        </div>
                      );
                    })}
                    {STRATEGY_VALIDATION[strategy] && (
                      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 8, color: FAINT, letterSpacing: ".08em", textTransform: "uppercase", fontFamily: "var(--font-text)", marginBottom: 2 }}>Validierung</span>
                        {STRATEGY_VALIDATION[strategy]!.map(b => {
                          const valCol = b.status === "pending" ? FAINT : b.status === "fail" ? GOLD : TXT;
                          return (
                            <div key={b.label} title={b.tooltip ?? ""} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${BORDER}`, cursor: b.tooltip ? "help" : "default" }}>
                              <span style={{ fontSize: 9, letterSpacing: ".05em", textTransform: "uppercase", fontFamily: "var(--font-text)", color: FAINT }}>{b.label}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "var(--font-numbers)", color: valCol }}>{b.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : testerTab === "performance" ? (
                <div style={{ flex: 1, overflow: "auto" }}>
                  {hasResult ? (
                    <table className="perf-tbl"><tbody>
                      {PERF_ROWS.map(row => { const val = metrics?.[row.key] ?? 0; return (<tr key={row.key}><td>{row.label}</td><td style={{ color: valColor(val) }}>{row.fmt(val)}</td></tr>); })}
                    </tbody></table>
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
                      <button key={y ?? "max"} onClick={() => setZeitraum(y)} className="tbtn" style={{ fontSize: 10, fontWeight: 600 }}>{y ? `${y}Y` : "Max"}</button>
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
                    style={{ marginTop: 20, fontSize: 11, fontWeight: 600, color: running ? DIM : BG, background: running ? "rgba(255,255,255,0.06)" : GOLD, border: "none", borderRadius: 4, padding: "7px 24px", cursor: running ? "default" : "pointer" }}>
                    Recalculate
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="e-sidebar">
          <div className="e-sidebar-resize" onMouseDown={sidebar.onMouseDown} />

          {/* Card 1: Strategy + Asset Type */}
          <div className="e-sidebar-card">
            <div className="sl">Strategy</div>
            {(Object.keys(STRATEGIES) as Strategy[]).map(id => (
              <button key={id} onClick={() => setStrategy(id)} className={`strat-btn${strategy === id ? " on" : ""}`}>
                <Image src={STRATEGIES[id].icon} alt="" width={24} height={24} style={{ borderRadius: 4, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: strategy === id ? 600 : 400 }}>{STRATEGIES[id].label}</div>
                  <div style={{ fontSize: 9, color: strategy === id ? GOLD_S : FAINT, fontFamily: "var(--font-numbers)", marginTop: 1 }}>
                    {assetType === "futures" ? STRATEGIES[id].futures : STRATEGIES[id].cfd}
                  </div>
                </div>
              </button>
            ))}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
              <div className="sl">Asset Type</div>
              <div style={{ display: "flex", gap: 6 }}>
                <span onClick={() => setAssetType("futures")} className={`pill${assetType === "futures" ? " on" : ""}`}>Futures</span>
                <span onClick={() => setAssetType("cfd")} className={`pill${assetType === "cfd" ? " on" : ""}`}>CFD</span>
              </div>
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
              <div className="sl">Date Range</div>
              <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                {([1, 3, 5, null] as (number | null)[]).map(y => (
                  <span key={y ?? "max"} onClick={() => setZeitraum(y)} className="pill" style={{ cursor: "pointer" }}>{y ? `${y}Y` : "Max"}</span>
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

          {/* Card 2: Parameters */}
          <div className="e-sidebar-card-scroll">
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
          </div>

          {/* Card 3: Live Signal */}
          <div className="e-sidebar-card">
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
        </div>

        {/* ── Code panel ── */}
        {codePanel && (
          <div className="e-codepanel">
            <div className="e-code-resize" onMouseDown={codeW.onMouseDown} />
            <div style={{ padding: '8px 14px 8px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: TXT, fontFamily: 'var(--font-numbers)', fontWeight: 500 }}>
                {strategy.toLowerCase()}_strategy.py
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={async () => {
                  setCodeSaving(true);
                  try { await fetch(`http://localhost:5000/strategy-code/${strategy}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: strategyCode }) }); } finally { setCodeSaving(false); }
                }} disabled={codeSaving} className="tbtn">{codeSaving ? "Saving..." : "Save"}</button>
                <button onClick={async () => {
                  setRunning(true);
                  try {
                    const r = await fetch('http://localhost:5000/bt/run-custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: strategyCode, strategy, asset_type: assetType, params }), signal: AbortSignal.timeout(30_000) });
                    const data = await r.json();
                    if (data.error) { setResult({ metrics: {} as BacktestResult["metrics"], equity: [], drawdown: [], trades: [], error: data.error }); }
                    else if (data.equity_curve) { setResult({ metrics: data as BacktestResult["metrics"], equity: data.equity_curve, drawdown: [], trades: [], equity_dates: [] }); }
                  } catch (e) { setResult({ metrics: {} as BacktestResult["metrics"], equity: [], drawdown: [], trades: [], error: e instanceof Error ? e.message : "Error" }); }
                  finally { setRunning(false); }
                }} disabled={running} style={{ fontSize: 10, fontWeight: 600, color: running ? DIM : BG, background: running ? "rgba(255,255,255,0.06)" : GOLD, border: "none", borderRadius: 4, padding: '4px 14px', cursor: running ? 'default' : 'pointer' }}>
                  {running ? "..." : "Run"}
                </button>
                <button onClick={() => setCodePanel(false)} className="tbtn" style={{ padding: "4px 6px" }}>{"✕"}</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <MonacoEditor height="100%" language="python" theme="vs-dark" value={strategyCode} onChange={v => setStrategyCode(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, wordWrap: 'on' }} />
            </div>
          </div>
        )}
      </div>

      {showSettings && <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setShowSettings(false)} />}
    </>
  );
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
