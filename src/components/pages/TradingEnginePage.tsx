"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

type Strategy  = "EUR_30M" | "DAX_1H" | "DAX_2H" | "GC_FRI" | "GLD_THU" | "YM_TAT";
type AssetType = "futures" | "cfd";

interface StrategyMeta {
  label: string;
  futures: string;
  cfd: string;
  tvFutures: string;
  tvCfd: string;
  tvInterval: string;
  group: "Intraday" | "Anomaly";
  useEma: boolean;
  params: Record<string, string>;
}

interface BacktestMetrics {
  cagr: number;
  sharpe: number;
  maxDD: number;
  calmar: number;
  trades: number;
  winRate: number;
  profitFactor?: number;
  avgWin?: number;
  avgLoss?: number;
  bestTrade?: number;
  worstTrade?: number;
}

interface TradeRecord {
  entry: number;
  exit?: number;
  win: boolean;
  pnl_pct: number;
  equity: number;
  direction?: string;
}

interface BacktestResult {
  metrics: BacktestMetrics;
  equity: number[];
  drawdown?: number[];
  trades: TradeRecord[];
  error?: string;
}

interface SignalState {
  direction: "long" | "short" | "flat";
  entry?: number;
  sl?: number;
  tp?: number;
  ema_fast_val?: number;
  ema_slow_val?: number;
  last_cross_bars?: number;
  last_cross_date?: string;
  error?: string;
}

// ── Strategy config ────────────────────────────────────────────────────────────

const STRATEGIES: Record<Strategy, StrategyMeta> = {
  EUR_30M: {
    label: "EUR 30M", group: "Intraday", useEma: true,
    futures: "6E1!", cfd: "EURUSD",
    tvFutures: "FX:EURUSD", tvCfd: "FX:EURUSD",
    tvInterval: "30",
    params: { ema_fast: "20", ema_slow: "50", sl_pips: "0.0013", tp_pips: "0.0039", rr: "3:1" },
  },
  DAX_1H: {
    label: "DAX 1H", group: "Intraday", useEma: true,
    futures: "FDAX1!", cfd: "DE30",
    tvFutures: "FOREXCOM:DE30", tvCfd: "FOREXCOM:DE30",
    tvInterval: "60",
    params: { ema_fast: "20", ema_slow: "50", sl_pts: "35", tp_pts: "126", rr: "3.6:1" },
  },
  DAX_2H: {
    label: "DAX 2H", group: "Intraday", useEma: true,
    futures: "FDAX1!", cfd: "DE30",
    tvFutures: "FOREXCOM:DE30", tvCfd: "FOREXCOM:DE30",
    tvInterval: "120",
    params: { ema: "4", atr_len: "14", sl_mult: "0.8×ATR", rr: "3:1", be_at: "1R", session: "09–11 UTC" },
  },
  GC_FRI: {
    label: "GC Friday", group: "Anomaly", useEma: false,
    futures: "GC1!", cfd: "XAUUSD",
    tvFutures: "TVC:GOLD", tvCfd: "TVC:GOLD",
    tvInterval: "D",
    params: { atr_fast: "4", atr_slow: "14", vol_mult: "1.5", sl_mult: "0.75×ATR", rr: "1.25:1" },
  },
  GLD_THU: {
    label: "GLD Thursday", group: "Anomaly", useEma: false,
    futures: "GLD", cfd: "XAUUSD",
    tvFutures: "AMEX:GLD", tvCfd: "AMEX:GLD",
    tvInterval: "D",
    params: { atr_len: "14", sl_mult: "1.5×ATR", rr: "2:1", exit: "Friday close" },
  },
  YM_TAT: {
    label: "YM TAT", group: "Anomaly", useEma: false,
    futures: "YM1!", cfd: "US30",
    tvFutures: "TVC:DJI", tvCfd: "TVC:DJI",
    tvInterval: "D",
    params: { atr_len: "14", sl_mult: "1.0×ATR", rr: "2:1", pattern: "Neg Mon → Tue Long" },
  },
};

const INTRADAY: Strategy[] = ["EUR_30M", "DAX_1H", "DAX_2H"];
const ANOMALY:  Strategy[] = ["GC_FRI", "GLD_THU", "YM_TAT"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10); }
function dateAgo(years: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}
function fmt(v: number | undefined, d = 2, suf = "") { return v == null ? "—" : `${v.toFixed(d)}${suf}`; }

// ── localStorage cache ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

function cacheKey(strategy: string, assetType: string, start: string, end: string) {
  return `te_bt_${strategy}_${assetType}_${start}_${end}`;
}

function readCache(key: string): BacktestResult | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: BacktestResult };
    if (Date.now() - ts > CACHE_TTL_MS) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function writeCache(key: string, data: BacktestResult) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch { /* storage full */ }
}

// ── TradingView widget loader ──────────────────────────────────────────────────

declare global {
  interface Window {
    TradingView?: { widget: new (cfg: Record<string, unknown>) => void };
    _tvScriptReady?: boolean;
    _tvScriptLoadPromise?: Promise<void>;
  }
}

function loadTVScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window._tvScriptReady) return Promise.resolve();
  if (window._tvScriptLoadPromise) return window._tvScriptLoadPromise;
  window._tvScriptLoadPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/tv.js";
    s.async = true;
    s.onload = () => { window._tvScriptReady = true; resolve(); };
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return window._tvScriptLoadPromise;
}

function TradingViewChart({ tvSymbol, tvInterval }: { tvSymbol: string; tvInterval: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef  = useRef(`tv_${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    const containerId = widgetIdRef.current;
    let cancelled = false;
    void (async () => {
      await loadTVScript();
      if (cancelled || !window.TradingView || !document.getElementById(containerId)) return;
      try {
        new window.TradingView.widget({
          autosize: true, symbol: tvSymbol, interval: tvInterval,
          timezone: "Etc/UTC", theme: "dark", style: "1", locale: "en",
          toolbar_bg: "#111214", enable_publishing: false,
          allow_symbol_change: true, save_image: false,
          container_id: containerId, hide_top_toolbar: false,
          withdateranges: true, hide_legend: false,
          studies: ["MASimple@tv-basicstudies"],
        });
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [tvSymbol, tvInterval]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <div id={widgetIdRef.current} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// ── Charts ─────────────────────────────────────────────────────────────────────

function EquityChart({ data }: { data: number[] }) {
  const pts = useMemo(() => data.map((v, i) => ({ i, value: v })), [data]);
  if (!pts.length) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(113,113,122,1)" }}>
      Backtest läuft…
    </div>
  );
  const min = Math.min(...data);
  const max = Math.max(...data);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={pts} margin={{ top: 6, right: 6, bottom: 2, left: 4 }}>
        <XAxis dataKey="i" hide />
        <YAxis tick={{ fill: "rgba(113,113,122,1)", fontSize: 9 }} width={34}
          domain={[min * 0.98, max * 1.02]} tickFormatter={(v: number) => `${v.toFixed(0)}`} />
        <Tooltip
          contentStyle={{ background: "#1c1d20", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, fontSize: 10 }}
          formatter={(v: unknown) => [`${(v as number).toFixed(2)}`, "Equity"]}
          labelFormatter={() => ""}
        />
        <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5}
          dot={false} activeDot={{ r: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function DrawdownChart({ data }: { data: number[] }) {
  const pts = useMemo(() => data.map((v, i) => ({ i, value: v })), [data]);
  if (!pts.length) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={pts} margin={{ top: 4, right: 6, bottom: 2, left: 4 }}>
        <defs>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis dataKey="i" hide />
        <YAxis tick={{ fill: "rgba(113,113,122,1)", fontSize: 9 }} width={34} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
        <Tooltip
          contentStyle={{ background: "#1c1d20", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, fontSize: 10 }}
          formatter={(v: unknown) => [`${(v as number).toFixed(2)}%`, "DD"]}
          labelFormatter={() => ""}
        />
        <Area type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={1}
          fill="url(#ddGrad)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Shared style atoms ─────────────────────────────────────────────────────────

const S = {
  panel: {
    background: "#111214",
    border: "1px solid rgba(255,255,255,0.08)",
    overflow: "hidden" as const,
  },
  secHead: {
    fontSize: 9, fontWeight: 800, letterSpacing: "0.10em",
    textTransform: "uppercase" as const,
    color: "rgba(255,255,255,0.22)",
    padding: "10px 0 5px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    marginBottom: 8,
  },
  label: {
    fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    color: "rgba(113,113,122,1)", marginBottom: 3, display: "block" as const,
  },
  inputStyle: {
    width: "100%", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)", borderRadius: 5,
    padding: "5px 7px", color: "#ffffff", fontSize: 11, outline: "none",
  },
};

function KpiCard({ label, value, color = "#ffffff" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 6, padding: "6px 8px",
    }}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(113,113,122,1)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TradingEnginePage() {
  const [strategy,  setStrategy]  = useState<Strategy>("EUR_30M");
  const [assetType, setAssetType] = useState<AssetType>("futures");
  const [startDate, setStartDate] = useState("2019-01-01");
  const [endDate,   setEndDate]   = useState(todayISO());
  const [result,    setResult]    = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [signal,    setSignal]    = useState<SignalState>({ direction: "flat" });
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const meta     = STRATEGIES[strategy];
  const tvSymbol = assetType === "futures" ? meta.tvFutures : meta.tvCfd;

  // ── Signal fetch ─────────────────────────────────────────────────────────────
  const fetchSignal = useCallback(async () => {
    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signal", strategy, asset_type: assetType }),
      });
      if (res.ok) { setSignal(await res.json()); setLastRefresh(new Date()); }
    } catch { /* keep last */ }
  }, [strategy, assetType]);

  useEffect(() => { void fetchSignal(); }, [fetchSignal]);
  useEffect(() => {
    const id = setInterval(() => { void fetchSignal(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchSignal]);

  // ── Backtest with cache ───────────────────────────────────────────────────────
  const runBacktest = useCallback(async (force = false) => {
    const key = cacheKey(strategy, assetType, startDate, endDate);
    if (!force) {
      const cached = readCache(key);
      if (cached) { setResult(cached); return; }
    }
    setIsRunning(true);
    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backtest", strategy, asset_type: assetType, start_date: startDate, end_date: endDate }),
      });
      if (res.ok) {
        const data = await res.json() as BacktestResult;
        setResult(data);
        if (!data.error) writeCache(key, data);
      }
    } catch { /* no-op */ }
    finally { setIsRunning(false); }
  }, [strategy, assetType, startDate, endDate]);

  useEffect(() => { void runBacktest(); }, [runBacktest]);

  // ── Quick date presets ────────────────────────────────────────────────────────
  function applyPreset(years: number | "max") {
    setStartDate(years === "max" ? "2010-01-01" : dateAgo(years));
    setEndDate(todayISO());
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  function exportJSON() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `backtest_${strategy}_${startDate}_${endDate}.json`,
    });
    a.click(); URL.revokeObjectURL(a.href);
  }
  function exportCSV() {
    if (!result?.trades?.length) return;
    const rows = result.trades.map((t, i) =>
      `${i + 1},${t.direction ?? "long"},${t.entry ?? ""},${t.exit ?? ""},${t.win},${(t.pnl_pct * 100).toFixed(3)},${t.equity.toFixed(2)}`
    );
    const blob = new Blob([["trade,direction,entry,exit,win,pnl_pct,equity", ...rows].join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `trades_${strategy}_${startDate}_${endDate}.csv`,
    });
    a.click(); URL.revokeObjectURL(a.href);
  }

  const m = result?.metrics;
  const signalColor = signal.direction === "long" ? "#34d399" : signal.direction === "short" ? "#f87171" : "rgba(113,113,122,1)";
  const signalBg    = signal.direction === "long" ? "rgba(16,185,129,0.12)" : signal.direction === "short" ? "rgba(239,68,68,0.12)" : "rgba(39,39,42,0.6)";

  // last trade for sidebar
  const lastTrade = result?.trades?.length ? result.trades[result.trades.length - 1] : null;

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden", background: "#0c0d10", gap: 6, padding: 6 }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* ── LEFT 80%: Chart top + Tester bottom ──────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>

        {/* Chart — top 50% */}
        <div style={{ ...S.panel, borderRadius: 10, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* Chart toolbar */}
          <div style={{
            flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em" }}>
              {assetType === "futures" ? meta.futures : meta.cfd}
            </span>
            <span style={{ fontSize: 10, color: "rgba(113,113,122,1)" }}>{meta.label}</span>
            {meta.useEma && (
              <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 14, height: 2, background: "#3b82f6", borderRadius: 1 }} />
                  <span style={{ fontSize: 9, color: "rgba(161,161,170,1)" }}>EMA Fast</span>
                  {signal.ema_fast_val != null && <span style={{ fontSize: 9, fontFamily: "monospace", color: "#3b82f6" }}>{signal.ema_fast_val.toFixed(4)}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 14, height: 2, background: "#f59e0b", borderRadius: 1 }} />
                  <span style={{ fontSize: 9, color: "rgba(161,161,170,1)" }}>EMA Slow</span>
                  {signal.ema_slow_val != null && <span style={{ fontSize: 9, fontFamily: "monospace", color: "#f59e0b" }}>{signal.ema_slow_val.toFixed(4)}</span>}
                </div>
              </div>
            )}
          </div>
          {/* TV widget */}
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <TradingViewChart key={`${tvSymbol}-${meta.tvInterval}`} tvSymbol={tvSymbol} tvInterval={meta.tvInterval} />
          </div>
        </div>

        {/* Strategy Tester — bottom 50% */}
        <div style={{ ...S.panel, borderRadius: 10, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* Tester header */}
          <div style={{
            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(212,212,216,1)", letterSpacing: "0.04em" }}>
              STRATEGY TESTER — {meta.label}
            </span>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {isRunning && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
              <button onClick={() => void runBacktest(true)} disabled={isRunning} style={{
                padding: "3px 10px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.10)",
                background: isRunning ? "rgba(255,255,255,0.04)" : "rgba(37,99,235,0.15)",
                color: isRunning ? "rgba(113,113,122,1)" : "#60a5fa",
                fontSize: 10, fontWeight: 700, cursor: isRunning ? "not-allowed" : "pointer",
              }}>↻ Neu berechnen</button>
              {result && !result.error && (
                <>
                  <button onClick={exportJSON} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(161,161,170,1)", fontSize: 10, cursor: "pointer" }}>JSON</button>
                  <button onClick={exportCSV} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(161,161,170,1)", fontSize: 10, cursor: "pointer" }}>CSV</button>
                </>
              )}
            </div>
          </div>

          {/* Tester body: charts left + KPIs right */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

            {/* Charts — 60% */}
            <div style={{ flex: 6, minWidth: 0, display: "flex", flexDirection: "column", padding: "8px 8px 8px 12px", gap: 4, borderRight: "1px solid rgba(255,255,255,0.05)" }}>
              {result?.error ? (
                <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, color: "#f87171", fontSize: 11 }}>
                  {result.error}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(113,113,122,1)", marginBottom: 2 }}>Equity Curve</div>
                  <div style={{ flex: 3, minHeight: 0 }}>
                    <EquityChart data={result?.equity ?? []} />
                  </div>
                  {result?.drawdown && result.drawdown.length > 0 && (
                    <>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(113,113,122,1)", marginTop: 4 }}>Drawdown</div>
                      <div style={{ flex: 2, minHeight: 0 }}>
                        <DrawdownChart data={result.drawdown} />
                      </div>
                    </>
                  )}
                  {!result && (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(113,113,122,0.6)" }}>
                      Lade Backtest…
                    </div>
                  )}
                </>
              )}
            </div>

            {/* KPIs — 40% */}
            <div style={{ flex: 4, minWidth: 0, padding: "8px 12px 8px 10px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }} className="no-scrollbar">
              {m ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    <KpiCard label="CAGR" value={fmt(m.cagr, 1, "%")} color={m.cagr >= 0 ? "#34d399" : "#f87171"} />
                    <KpiCard label="Sharpe" value={fmt(m.sharpe, 2)} color={m.sharpe >= 1 ? "#34d399" : "#ffffff"} />
                    <KpiCard label="Max DD" value={fmt(m.maxDD, 1, "%")} color="#f87171" />
                    <KpiCard label="Calmar" value={fmt(m.calmar, 2)} />
                    <KpiCard label="Trades" value={String(m.trades ?? "—")} />
                    <KpiCard label="Win Rate" value={fmt(m.winRate, 1, "%")} color={m.winRate >= 50 ? "#34d399" : "#ffffff"} />
                    <KpiCard label="Profit Factor" value={fmt(m.profitFactor, 2)} color={m.profitFactor != null && m.profitFactor >= 1 ? "#34d399" : "#f87171"} />
                    <KpiCard label="Avg Win" value={fmt(m.avgWin, 2, "%")} color="#34d399" />
                    <KpiCard label="Avg Loss" value={fmt(m.avgLoss, 2, "%")} color="#f87171" />
                    <KpiCard label="Best Trade" value={fmt(m.bestTrade, 2, "%")} color="#34d399" />
                    <KpiCard label="Worst Trade" value={fmt(m.worstTrade, 2, "%")} color="#f87171" />
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(113,113,122,0.6)" }}>
                  {isRunning ? "Berechne…" : "Keine Daten"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT SIDEBAR 20% ─────────────────────────────────────────────────── */}
      <div style={{ ...S.panel, borderRadius: 10, width: "20%", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "10px 10px 14px" }}>

          {/* 1. STRATEGY */}
          <div style={S.secHead}>Strategy</div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.18)", textTransform: "uppercase", padding: "2px 2px 3px" }}>Intraday</div>
          {INTRADAY.map((id) => <StratBtn key={id} id={id} active={strategy === id} assetType={assetType} onClick={() => setStrategy(id)} />)}
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.18)", textTransform: "uppercase", padding: "6px 2px 3px" }}>Anomaly</div>
          {ANOMALY.map((id) => <StratBtn key={id} id={id} active={strategy === id} assetType={assetType} onClick={() => setStrategy(id)} />)}

          {/* 2. ASSET TYPE */}
          <div style={{ ...S.secHead, marginTop: 10 }}>Asset Type</div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["futures", "cfd"] as AssetType[]).map((t) => (
              <button key={t} onClick={() => setAssetType(t)} style={{
                flex: 1, padding: "5px 0", borderRadius: 5, cursor: "pointer",
                border: assetType === t ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.06)",
                background: assetType === t ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.02)",
                color: assetType === t ? "#ffffff" : "rgba(113,113,122,1)",
                fontSize: 10, fontWeight: assetType === t ? 700 : 400,
              }}>
                {t === "futures" ? "Futures" : "CFD"}
              </button>
            ))}
          </div>

          {/* 3. ZEITRAUM */}
          <div style={{ ...S.secHead, marginTop: 10 }}>Zeitraum</div>
          <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
            {([1, 3, 5, "max"] as (number | "max")[]).map((y) => (
              <button key={y} onClick={() => applyPreset(y as number | "max")} style={{
                flex: 1, padding: "4px 0", borderRadius: 5, cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
                color: "rgba(161,161,170,1)", fontSize: 9, fontWeight: 600,
              }}>
                {y === "max" ? "Max" : `${y}J`}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div>
              <label style={S.label}>Start</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={S.inputStyle} />
            </div>
            <div>
              <label style={S.label}>Ende</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={S.inputStyle} />
            </div>
          </div>

          {/* 4. PARAMETER */}
          <div style={{ ...S.secHead, marginTop: 10 }}>Parameter — {meta.label}</div>
          {Object.entries(meta.params).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>{k}</span>
              <span style={{ fontSize: 9, color: "rgba(212,212,216,1)", fontFamily: "monospace" }}>{v}</span>
            </div>
          ))}

          {/* 5. CURRENT SIGNAL */}
          <div style={{ ...S.secHead, marginTop: 10 }}>Current Signal</div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "9px 0", background: signalBg,
            border: `1px solid ${signalColor}33`, borderRadius: 7,
            color: signalColor, fontSize: 15, fontWeight: 800, letterSpacing: "0.12em",
            marginBottom: 8,
          }}>
            {signal.direction.toUpperCase()}
          </div>
          {signal.ema_fast_val != null && (
            <div style={{ marginBottom: 6 }}>
              {[
                ["EMA Fast", signal.ema_fast_val?.toFixed(4), "#3b82f6"],
                ["EMA Slow", signal.ema_slow_val?.toFixed(4), "#f59e0b"],
              ].filter(([, v]) => v).map(([l, v, c]) => (
                <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>{l as string}</span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: c as string }}>{v as string}</span>
                </div>
              ))}
              {signal.last_cross_bars != null && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>Letzter Cross</span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(212,212,216,1)" }}>
                    -{signal.last_cross_bars}b {signal.last_cross_date && <span style={{ color: "rgba(113,113,122,0.7)" }}>({signal.last_cross_date})</span>}
                  </span>
                </div>
              )}
            </div>
          )}
          {signal.direction !== "flat" && (
            <div style={{ marginBottom: 6 }}>
              {[
                ["Entry", signal.entry?.toFixed(5)],
                ["SL",    signal.sl?.toFixed(5)],
                ["TP",    signal.tp?.toFixed(5)],
              ].filter(([, v]) => v).map(([l, v]) => (
                <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>{l as string}</span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(212,212,216,1)" }}>{v as string}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 8, color: "rgba(113,113,122,0.5)" }}>
              {lastRefresh ? `${lastRefresh.toLocaleTimeString()} · 30s` : "Fetching…"}
            </span>
            <button onClick={() => void fetchSignal()} style={{
              fontSize: 8, color: "rgba(113,113,122,1)", background: "none",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, padding: "2px 5px", cursor: "pointer",
            }}>↻</button>
          </div>

          {/* 6. LAST TRADE */}
          {lastTrade && (
            <>
              <div style={{ ...S.secHead, marginTop: 10 }}>Last Trade</div>
              {[
                ["Direction", lastTrade.direction === "short" ? "Short" : "Long", lastTrade.direction === "short" ? "#f87171" : "#34d399"],
                ["Entry", lastTrade.entry?.toFixed(4), "rgba(212,212,216,1)"],
                ["Exit",  lastTrade.exit?.toFixed(4) ?? "—", "rgba(212,212,216,1)"],
                ["PnL",   `${lastTrade.win ? "+" : ""}${(lastTrade.pnl_pct * 100).toFixed(2)}%`, lastTrade.win ? "#34d399" : "#f87171"],
              ].map(([l, v, c]) => (
                <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span style={{ fontSize: 9, color: "rgba(113,113,122,1)" }}>{l as string}</span>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: c as string }}>{v as string}</span>
                </div>
              ))}
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Strategy button ────────────────────────────────────────────────────────────

function StratBtn({ id, active, assetType, onClick }: { id: Strategy; active: boolean; assetType: AssetType; onClick: () => void }) {
  const meta  = STRATEGIES[id];
  const asset = assetType === "futures" ? meta.futures : meta.cfd;
  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", padding: "5px 7px", borderRadius: 5,
      border: active ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent",
      background: active ? "rgba(255,255,255,0.10)" : "transparent",
      color: active ? "#ffffff" : "rgba(161,161,170,1)",
      fontSize: 10, fontWeight: active ? 700 : 400, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2,
    }}>
      <span>{meta.label}</span>
      <span style={{ fontSize: 8, color: active ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.18)", fontFamily: "monospace" }}>{asset}</span>
    </button>
  );
}
