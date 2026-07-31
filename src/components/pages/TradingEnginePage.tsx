"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

type Strategy  = "EUR_30M" | "DAX_1H" | "DAX_2H" | "GC_FRI" | "GLD_THU" | "YM_TAT";
type AssetType = "futures" | "cfd";
type Period    = "1M" | "3M" | "1Y" | "Max";

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
  entry_date?: string;
  exit_date?: string;
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
    tvFutures: "EUREX:FDAX1!", tvCfd: "SPREADEX:DE30",
    tvInterval: "60",
    params: { ema_fast: "20", ema_slow: "50", sl_pts: "35", tp_pts: "126", rr: "3.6:1" },
  },
  DAX_2H: {
    label: "DAX 2H", group: "Intraday", useEma: true,
    futures: "FDAX1!", cfd: "DE30",
    tvFutures: "EUREX:FDAX1!", tvCfd: "SPREADEX:DE30",
    tvInterval: "120",
    params: { ema: "4", atr_len: "14", sl_mult: "0.8×ATR", rr: "3:1", be_at: "1R", session: "09–11 UTC" },
  },
  GC_FRI: {
    label: "GC Friday", group: "Anomaly", useEma: false,
    futures: "GC1!", cfd: "XAUUSD",
    tvFutures: "COMEX:GC1!", tvCfd: "TVC:GOLD",
    tvInterval: "D",
    params: { atr_fast: "4", atr_slow: "14", vol_mult: "1.5", sl_mult: "0.75×ATR", rr: "1.25:1" },
  },
  GLD_THU: {
    label: "GLD Thursday", group: "Anomaly", useEma: false,
    futures: "GLD", cfd: "XAUUSD",
    tvFutures: "AMEX:GLD", tvCfd: "TVC:GOLD",
    tvInterval: "D",
    params: { atr_len: "14", sl_mult: "1.5×ATR", rr: "2:1", exit: "Friday close" },
  },
  YM_TAT: {
    label: "YM TAT", group: "Anomaly", useEma: false,
    futures: "YM1!", cfd: "US30",
    tvFutures: "CBOT:YM1!", tvCfd: "TVC:DJI",
    tvInterval: "D",
    params: { atr_len: "14", sl_mult: "1.0×ATR", rr: "2:1", pattern: "Neg Mon → Tue Long" },
  },
};

const INTRADAY: Strategy[] = ["EUR_30M", "DAX_1H", "DAX_2H"];
const ANOMALY:  Strategy[] = ["GC_FRI", "GLD_THU", "YM_TAT"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmt(v: number | undefined, d = 2, suf = "") { return v == null ? "—" : `${v.toFixed(d)}${suf}`; }
function fmtPct(v: number | undefined) { return v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`; }

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
    s.onerror = () => resolve(); // fail silently
    document.head.appendChild(s);
  });
  return window._tvScriptLoadPromise;
}

interface TVChartProps { tvSymbol: string; tvInterval: string; }

function TradingViewChart({ tvSymbol, tvInterval }: TVChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef  = useRef(`tv_${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    const containerId = widgetIdRef.current;
    let cancelled = false;

    const create = async () => {
      await loadTVScript();
      if (cancelled || !window.TradingView || !document.getElementById(containerId)) return;
      try {
        new window.TradingView.widget({
          autosize: true,
          symbol: tvSymbol,
          interval: tvInterval,
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#111214",
          enable_publishing: false,
          allow_symbol_change: true,
          save_image: false,
          container_id: containerId,
          hide_top_toolbar: false,
          withdateranges: true,
          hide_legend: false,
          studies: ["MASimple@tv-basicstudies"],
        });
      } catch { /* widget creation failed silently */ }
    };

    void create();
    return () => { cancelled = true; };
  }, [tvSymbol, tvInterval]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <div id={widgetIdRef.current} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// ── Drawdown chart ─────────────────────────────────────────────────────────────

function DrawdownChart({ data }: { data: number[] }) {
  if (!data?.length) return null;
  const pts = data.map((v, i) => ({ i, value: v }));
  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={pts} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
        <defs>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis dataKey="i" hide />
        <YAxis tick={{ fill: "rgba(113,113,122,1)", fontSize: 8 }} width={28} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
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

// ── Equity chart ───────────────────────────────────────────────────────────────

function EquityChart({ data }: { data: number[] }) {
  if (!data?.length) return (
    <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(113,113,122,1)" }}>
      Backtest ausführen um Equity Curve zu sehen
    </div>
  );
  const pts = data.map((v, i) => ({ i, value: v }));
  const min = Math.min(...data);
  const max = Math.max(...data);
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={pts} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <XAxis dataKey="i" hide />
        <YAxis tick={{ fill: "rgba(113,113,122,1)", fontSize: 8 }} width={32}
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

// ── Trade list ─────────────────────────────────────────────────────────────────

function TradeList({ trades }: { trades: TradeRecord[] }) {
  if (!trades?.length) return null;
  return (
    <div style={{ maxHeight: 200, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
        <thead>
          <tr style={{ position: "sticky", top: 0, background: "#111214" }}>
            {["#", "Dir", "Entry", "Exit", "PnL%"].map((h) => (
              <th key={h} style={{ padding: "3px 6px", textAlign: "right", color: "rgba(113,113,122,1)", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.slice(-50).reverse().map((t, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
              <td style={{ padding: "2px 6px", color: "rgba(113,113,122,1)" }}>{trades.length - i}</td>
              <td style={{ padding: "2px 6px", color: t.direction === "short" ? "#f87171" : "#34d399", textAlign: "right" }}>
                {t.direction === "short" ? "S" : "L"}
              </td>
              <td style={{ padding: "2px 6px", textAlign: "right", fontFamily: "monospace", color: "rgba(228,228,231,1)" }}>
                {t.entry?.toFixed(4) ?? "—"}
              </td>
              <td style={{ padding: "2px 6px", textAlign: "right", fontFamily: "monospace", color: "rgba(228,228,231,1)" }}>
                {t.exit?.toFixed(4) ?? "—"}
              </td>
              <td style={{ padding: "2px 6px", textAlign: "right", fontFamily: "monospace", color: t.win ? "#34d399" : "#f87171" }}>
                {fmtPct(t.pnl_pct * 100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Shared style atoms ─────────────────────────────────────────────────────────

const S = {
  panel: {
    background: "#111214",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    overflow: "hidden" as const,
  },
  sectionHead: {
    fontSize: 9, fontWeight: 800, letterSpacing: "0.10em",
    textTransform: "uppercase" as const,
    color: "rgba(255,255,255,0.25)",
    padding: "12px 0 6px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    marginBottom: 10,
  },
  label: {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "rgba(161,161,170,1)", marginBottom: 4, display: "block" as const,
  },
  input: {
    width: "100%", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6,
    padding: "6px 8px", color: "#ffffff", fontSize: 12, outline: "none",
  },
};

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TradingEnginePage() {
  const [strategy,  setStrategy]  = useState<Strategy>("EUR_30M");
  const [assetType, setAssetType] = useState<AssetType>("futures");
  const [period,    setPeriod]    = useState<Period>("3M");
  const [startDate, setStartDate] = useState("2019-01-01");
  const [endDate,   setEndDate]   = useState(todayISO());
  const [result,    setResult]    = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [signal,    setSignal]    = useState<SignalState>({ direction: "flat" });
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const meta     = STRATEGIES[strategy];
  const tvSymbol = assetType === "futures" ? meta.tvFutures : meta.tvCfd;
  const asset    = assetType === "futures" ? meta.futures   : meta.cfd;

  // ── Signal fetch + 30s auto-refresh ─────────────────────────────────────────
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

  // ── Auto-run backtest on strategy / assetType / dates change ─────────────────
  useEffect(() => {
    void runBacktest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy, assetType, startDate, endDate]);

  // ── Backtest ──────────────────────────────────────────────────────────────────
  async function runBacktest() {
    setIsRunning(true); setResult(null);
    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backtest", strategy, asset_type: assetType, start_date: startDate, end_date: endDate }),
      });
      if (res.ok) setResult(await res.json());
    } catch { /* no-op */ }
    finally { setIsRunning(false); }
  }

  // ── Exports ──────────────────────────────────────────────────────────────────
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
    const header = "trade,direction,entry,exit,win,pnl_pct,equity";
    const rows = result.trades.map((t, i) =>
      `${i + 1},${t.direction ?? "long"},${t.entry ?? ""},${t.exit ?? ""},${t.win},${(t.pnl_pct * 100).toFixed(3)},${t.equity.toFixed(2)}`
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `trades_${strategy}_${startDate}_${endDate}.csv`,
    });
    a.click(); URL.revokeObjectURL(a.href);
  }

  // ── Metric rows ───────────────────────────────────────────────────────────────
  const m = result?.metrics;
  const metricRows = m ? [
    ["CAGR",          fmt(m.cagr, 1, "%"),           m.cagr >= 0 ? "#34d399" : "#f87171"],
    ["Sharpe",        fmt(m.sharpe, 2),               "#ffffff"],
    ["Max DD",        fmt(m.maxDD, 1, "%"),            "#f87171"],
    ["Calmar",        fmt(m.calmar, 2),               "#ffffff"],
    ["Trades",        String(m.trades ?? "—"),        "#ffffff"],
    ["Win Rate",      fmt(m.winRate, 1, "%"),          "#ffffff"],
    ["Profit Factor", fmt(m.profitFactor, 2),         m.profitFactor != null && m.profitFactor >= 1 ? "#34d399" : "#f87171"],
    ["Avg Win",       fmt(m.avgWin, 2, "%"),           "#34d399"],
    ["Avg Loss",      fmt(m.avgLoss, 2, "%"),          "#f87171"],
    ["Best Trade",    fmt(m.bestTrade, 2, "%"),        "#34d399"],
    ["Worst Trade",   fmt(m.worstTrade, 2, "%"),       "#f87171"],
  ] as [string, string, string][] : [];

  const signalColor = signal.direction === "long" ? "#34d399" : signal.direction === "short" ? "#f87171" : "rgba(113,113,122,1)";
  const signalBg    = signal.direction === "long" ? "rgba(16,185,129,0.12)" : signal.direction === "short" ? "rgba(239,68,68,0.12)" : "rgba(39,39,42,0.8)";

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden", background: "#0c0d10", gap: 8, padding: 8 }}>

      {/* ── LEFT: Strategy + Signal ──────────────────────────────────────────── */}
      <div style={{ ...S.panel, width: 260, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>

          <div style={S.sectionHead}>Strategy</div>

          {/* Intraday group */}
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.2)", textTransform: "uppercase", padding: "4px 2px 3px" }}>Intraday</div>
          {INTRADAY.map((id) => (
            <StratBtn key={id} id={id} active={strategy === id} assetType={assetType} onClick={() => setStrategy(id)} />
          ))}

          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.2)", textTransform: "uppercase", padding: "8px 2px 3px" }}>Anomaly</div>
          {ANOMALY.map((id) => (
            <StratBtn key={id} id={id} active={strategy === id} assetType={assetType} onClick={() => setStrategy(id)} />
          ))}

          {/* Asset Type */}
          <div style={{ margin: "14px 0 10px" }}>
            <div style={S.label}>Asset Type</div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["futures", "cfd"] as AssetType[]).map((t) => (
                <button key={t} onClick={() => setAssetType(t)} style={{
                  flex: 1, padding: "5px 0", borderRadius: 6, cursor: "pointer",
                  border: assetType === t ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.06)",
                  background: assetType === t ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
                  color: assetType === t ? "#ffffff" : "rgba(113,113,122,1)",
                  fontSize: 11, fontWeight: assetType === t ? 700 : 400, textTransform: "capitalize",
                }}>
                  {t === "futures" ? "Futures" : "CFD"}
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div style={S.sectionHead}>Parameters — {meta.label}</div>
          {Object.entries(meta.params).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <span style={{ fontSize: 10, color: "rgba(161,161,170,1)" }}>{k}</span>
              <span style={{ fontSize: 10, color: "rgba(228,228,231,1)", fontFamily: "monospace" }}>{v}</span>
            </div>
          ))}

          {/* Signal */}
          <div style={{ ...S.sectionHead, marginTop: 14 }}>Current Signal</div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "10px 0", background: signalBg,
            border: `1px solid ${signalColor}33`, borderRadius: 8,
            color: signalColor, fontSize: 16, fontWeight: 800, letterSpacing: "0.12em",
            marginBottom: 10,
          }}>
            {signal.direction.toUpperCase()}
          </div>

          {/* EMA values */}
          {(signal.ema_fast_val != null || signal.ema_slow_val != null) && (
            <div style={{ marginBottom: 10 }}>
              {signal.ema_fast_val != null && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span style={{ fontSize: 10, color: "rgba(113,113,122,1)" }}>EMA Fast</span>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "#3b82f6" }}>{signal.ema_fast_val.toFixed(4)}</span>
                </div>
              )}
              {signal.ema_slow_val != null && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span style={{ fontSize: 10, color: "rgba(113,113,122,1)" }}>EMA Slow</span>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "#f59e0b" }}>{signal.ema_slow_val.toFixed(4)}</span>
                </div>
              )}
              {signal.last_cross_bars != null && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span style={{ fontSize: 10, color: "rgba(113,113,122,1)" }}>Letzter Cross</span>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(228,228,231,1)" }}>
                    vor {signal.last_cross_bars} Bars
                    {signal.last_cross_date && <span style={{ color: "rgba(113,113,122,1)" }}> ({signal.last_cross_date})</span>}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Entry / SL / TP */}
          {signal.direction !== "flat" && (
            <>
              <div style={S.sectionHead}>Position</div>
              {[
                ["Entry", signal.entry?.toFixed(5) ?? "—"],
                ["SL",    signal.sl?.toFixed(5)    ?? "—"],
                ["TP",    signal.tp?.toFixed(5)    ?? "—"],
              ].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ fontSize: 10, color: "rgba(161,161,170,1)" }}>{l}</span>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(228,228,231,1)" }}>{v}</span>
                </div>
              ))}
            </>
          )}

          {/* Last refresh */}
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, color: "rgba(113,113,122,0.6)" }}>
              {lastRefresh ? `${lastRefresh.toLocaleTimeString()} · auto 30s` : "Fetching…"}
            </span>
            <button onClick={() => void fetchSignal()} style={{
              fontSize: 9, color: "rgba(113,113,122,1)", background: "none", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 4, padding: "2px 6px", cursor: "pointer",
            }}>↻ Refresh</button>
          </div>
        </div>
      </div>

      {/* ── CENTER: TradingView Chart ─────────────────────────────────────────── */}
      <div style={{ ...S.panel, flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Toolbar */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em" }}>{asset}</span>
            <span style={{ fontSize: 10, color: "rgba(113,113,122,1)" }}>{meta.label}</span>
          </div>
          <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
            {(["1M", "3M", "1Y", "Max"] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: "3px 9px", borderRadius: 5, cursor: "pointer",
                border: period === p ? "1px solid rgba(255,255,255,0.15)" : "1px solid transparent",
                background: period === p ? "rgba(255,255,255,0.08)" : "transparent",
                color: period === p ? "#ffffff" : "rgba(113,113,122,1)",
                fontSize: 11, fontWeight: period === p ? 700 : 400,
              }}>{p}</button>
            ))}
          </div>
          {meta.useEma && (
            <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 2, background: "#3b82f6", borderRadius: 1 }} />
                <span style={{ fontSize: 9, color: "rgba(161,161,170,1)" }}>EMA Fast</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 2, background: "#f59e0b", borderRadius: 1 }} />
                <span style={{ fontSize: 9, color: "rgba(161,161,170,1)" }}>EMA Slow</span>
              </div>
            </div>
          )}
        </div>

        {/* TV Widget */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <TradingViewChart key={`${tvSymbol}-${meta.tvInterval}`} tvSymbol={tvSymbol} tvInterval={meta.tvInterval} />
        </div>
      </div>

      {/* ── RIGHT: Backtest Panel ─────────────────────────────────────────────── */}
      <div style={{ ...S.panel, width: 300, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>

          <div style={S.sectionHead}>Backtest</div>

          {/* Dates */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <div>
              <label style={S.label}>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={S.input} />
            </div>
            <div>
              <label style={S.label}>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={S.input} />
            </div>
          </div>

          {/* Run button */}
          <button onClick={() => void runBacktest()} disabled={isRunning} style={{
            width: "100%", padding: "9px 0", borderRadius: 7, border: "none",
            background: isRunning ? "#1d4ed8" : "#2563eb", color: "#ffffff",
            fontSize: 13, fontWeight: 700, cursor: isRunning ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            marginBottom: 16,
          }}>
            {isRunning ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Berechnung…
              </>
            ) : "↻ Neu berechnen"}
          </button>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

          {/* Error */}
          {result?.error && (
            <div style={{ padding: "8px 10px", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, color: "#f87171", fontSize: 11, marginBottom: 12 }}>
              {result.error}
            </div>
          )}

          {/* Metrics table */}
          {m && !result?.error && (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 12 }}>
                <tbody>
                  {metricRows.map(([label, val, color], i) => (
                    <tr key={label} style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.025)" : "transparent" }}>
                      <td style={{ padding: "4px 8px", color: "rgba(161,161,170,1)", fontWeight: 500 }}>{label}</td>
                      <td style={{ padding: "4px 8px", color, fontWeight: 700, textAlign: "right", fontFamily: "monospace" }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Equity curve */}
              <div style={S.sectionHead}>Equity Curve</div>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden", marginBottom: 8, padding: "4px 0" }}>
                <EquityChart data={result.equity ?? []} />
              </div>

              {/* Drawdown chart */}
              {result.drawdown && result.drawdown.length > 0 && (
                <>
                  <div style={{ ...S.sectionHead, marginTop: 8 }}>Drawdown</div>
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden", marginBottom: 8, padding: "4px 0" }}>
                    <DrawdownChart data={result.drawdown} />
                  </div>
                </>
              )}

              {/* Trade list */}
              {result.trades?.length > 0 && (
                <>
                  <div style={S.sectionHead}>Trades (letzte 50)</div>
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
                    <TradeList trades={result.trades} />
                  </div>
                </>
              )}

              {/* Export buttons */}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={exportJSON} style={{
                  flex: 1, padding: "6px 0", borderRadius: 6, cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)",
                  color: "rgba(212,212,216,1)", fontSize: 10, fontWeight: 600,
                }}>Export JSON</button>
                <button onClick={exportCSV} style={{
                  flex: 1, padding: "6px 0", borderRadius: 6, cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)",
                  color: "rgba(212,212,216,1)", fontSize: 10, fontWeight: 600,
                }}>Export CSV</button>
              </div>
            </>
          )}

          {!result && !isRunning && (
            <div style={{ padding: "24px 0", textAlign: "center", fontSize: 11, color: "rgba(113,113,122,1)" }}>
              Run a backtest to see results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Strategy button ────────────────────────────────────────────────────────────

function StratBtn({ id, active, assetType, onClick }: { id: Strategy; active: boolean; assetType: AssetType; onClick: () => void }) {
  const meta = STRATEGIES[id];
  const asset = assetType === "futures" ? meta.futures : meta.cfd;
  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: 6,
      border: active ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent",
      background: active ? "rgba(255,255,255,0.10)" : "transparent",
      color: active ? "#ffffff" : "rgba(161,161,170,1)",
      fontSize: 11, fontWeight: active ? 700 : 400, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 2,
    }}>
      <span>{meta.label}</span>
      <span style={{ fontSize: 9, color: active ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>{asset}</span>
    </button>
  );
}
