"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
} from "lightweight-charts";

// ── Types ──────────────────────────────────────────────────────────────────────

type Strategy = "EUR_30M" | "DAX_1H" | "DAX_2H" | "GC_FRI" | "GLD_THU" | "YM_TAT";
type AssetType = "futures" | "cfd";
type Period = "1M" | "3M" | "1Y" | "Max";

interface StrategyMeta {
  label: string;
  asset: string;
  group: "Intraday" | "Anomaly";
  useEma: boolean;
  params: Record<string, string>;
}

interface BacktestResult {
  cagr?: number;
  sharpe?: number;
  max_drawdown?: number;
  calmar?: number;
  trades?: number;
  win_rate?: number;
  equity_curve?: Array<{ date: string; value: number }>;
  [key: string]: unknown;
}

interface SignalState {
  direction: "long" | "short" | "flat";
  entry?: number;
  sl?: number;
  tp?: number;
  pnl?: number;
}

// ── Strategy config ────────────────────────────────────────────────────────────

const STRATEGIES: Record<Strategy, StrategyMeta> = {
  EUR_30M: {
    label: "EUR 30M",
    asset: "6E1!",
    group: "Intraday",
    useEma: true,
    params: {
      ema_fast: "20",
      ema_slow: "50",
      sl_pips: "0.0013",
      tp_pips: "0.0039",
      rr: "3:1",
    },
  },
  DAX_1H: {
    label: "DAX 1H",
    asset: "FDAX1!",
    group: "Intraday",
    useEma: true,
    params: {
      ema_fast: "20",
      ema_slow: "50",
      sl_pts: "35",
      tp_pts: "126",
      rr: "3.6:1",
    },
  },
  DAX_2H: {
    label: "DAX 2H",
    asset: "FDAX1!",
    group: "Intraday",
    useEma: true,
    params: {
      ema: "4",
      atr_len: "14",
      sl_mult: "0.8×ATR",
      rr: "3:1",
      be_at: "1R",
      session: "09-11 UTC",
    },
  },
  GC_FRI: {
    label: "GC Friday",
    asset: "GC1!",
    group: "Anomaly",
    useEma: false,
    params: {
      atr_fast: "4",
      atr_slow: "14",
      vol_mult: "1.5",
      sl_mult: "0.75×ATR",
      rr: "1.25:1",
    },
  },
  GLD_THU: {
    label: "GLD Thursday",
    asset: "GLD",
    group: "Anomaly",
    useEma: false,
    params: {
      atr_len: "14",
      sl_mult: "1.5×ATR",
      rr: "2:1",
      exit: "Friday close",
    },
  },
  YM_TAT: {
    label: "YM TAT",
    asset: "YM1!",
    group: "Anomaly",
    useEma: false,
    params: {
      atr_len: "14",
      sl_mult: "1.0×ATR",
      rr: "2:1",
      pattern: "Neg Mon → Tue Long",
    },
  },
};

const INTRADAY_STRATEGIES: Strategy[] = ["EUR_30M", "DAX_1H", "DAX_2H"];
const ANOMALY_STRATEGIES: Strategy[] = ["GC_FRI", "GLD_THU", "YM_TAT"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtNum(v: number | undefined, decimals = 2, suffix = ""): string {
  if (v == null) return "—";
  return `${v.toFixed(decimals)}${suffix}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StrategyButton({
  id,
  active,
  onClick,
}: {
  id: Strategy;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "6px 10px",
        borderRadius: 6,
        border: active ? "1px solid rgba(255,255,255,0.20)" : "1px solid transparent",
        background: active ? "rgba(255,255,255,0.10)" : "transparent",
        color: active ? "#ffffff" : "rgba(161,161,170,1)",
        fontSize: 12,
        fontWeight: active ? 700 : 400,
        cursor: "pointer",
        transition: "all 120ms ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "rgba(212,212,216,1)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "rgba(161,161,170,1)";
      }}
    >
      <span>{STRATEGIES[id].label}</span>
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
        {STRATEGIES[id].asset}
      </span>
    </button>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: "0.10em",
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.25)",
      padding: "10px 2px 4px",
    }}>
      {label}
    </div>
  );
}

function ParamRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "3px 0",
      borderBottom: "1px solid rgba(255,255,255,0.03)",
    }}>
      <span style={{ fontSize: 11, color: "rgba(161,161,170,1)" }}>{k}</span>
      <span style={{ fontSize: 11, color: "rgba(228,228,231,1)", fontFamily: "monospace" }}>{v}</span>
    </div>
  );
}

function SignalBadge({ direction }: { direction: "long" | "short" | "flat" }) {
  const map = {
    long: {
      bg: "rgba(16,185,129,0.15)",
      color: "#34d399",
      border: "rgba(16,185,129,0.30)",
      label: "LONG",
    },
    short: {
      bg: "rgba(239,68,68,0.15)",
      color: "#f87171",
      border: "rgba(239,68,68,0.30)",
      label: "SHORT",
    },
    flat: {
      bg: "rgba(39,39,42,1)",
      color: "rgba(113,113,122,1)",
      border: "rgba(63,63,70,1)",
      label: "FLAT",
    },
  };
  const s = map[direction];
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 0",
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 8,
      color: s.color,
      fontSize: 16,
      fontWeight: 800,
      letterSpacing: "0.12em",
    }}>
      {s.label}
    </div>
  );
}

// ── Lightweight chart ──────────────────────────────────────────────────────────

const MOCK_CANDLES: CandlestickData<Time>[] = (() => {
  const out: CandlestickData<Time>[] = [];
  let close = 1.1050;
  const startMs = Date.now() - 90 * 24 * 3600 * 1000;
  for (let i = 0; i < 90; i++) {
    const d = new Date(startMs + i * 24 * 3600 * 1000);
    const open = close;
    const change = (Math.random() - 0.48) * 0.003;
    close = parseFloat((open + change).toFixed(5));
    const high = parseFloat((Math.max(open, close) + Math.random() * 0.001).toFixed(5));
    const low = parseFloat((Math.min(open, close) - Math.random() * 0.001).toFixed(5));
    const time = d.toISOString().slice(0, 10) as Time;
    out.push({ time, open, high, low, close });
  }
  return out;
})();

function buildEma(candles: CandlestickData<Time>[], period: number): LineData<Time>[] {
  const k = 2 / (period + 1);
  let ema = candles[0]!.close;
  return candles.map((c) => {
    ema = c.close * k + ema * (1 - k);
    return { time: c.time, value: parseFloat(ema.toFixed(5)) };
  });
}

interface CandleChartProps {
  strategy: Strategy;
  period: Period;
  isLive: boolean;
}

function CandleChart({ strategy, isLive }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const emaFastRef = useRef<ISeriesApi<"Line", Time> | null>(null);
  const emaSlowRef = useRef<ISeriesApi<"Line", Time> | null>(null);

  const showEma = STRATEGIES[strategy].useEma;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#0c0d10" },
        textColor: "rgba(161,161,170,0.8)",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        vertLine: { color: "rgba(255,255,255,0.15)", labelBackgroundColor: "#1c1d20" },
        horzLine: { color: "rgba(255,255,255,0.15)", labelBackgroundColor: "#1c1d20" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        textColor: "rgba(161,161,170,0.7)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });
    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "rgba(34,197,94,0.6)",
      wickDownColor: "rgba(239,68,68,0.6)",
    });
    candleSeriesRef.current = candleSeries;
    candleSeries.setData(MOCK_CANDLES);

    // EMA lines
    const emaFast = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    emaFastRef.current = emaFast;

    const emaSlow = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    emaSlowRef.current = emaSlow;

    chart.timeScale().fitContent();

    // Resize observer
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Update EMA visibility when strategy changes
  useEffect(() => {
    if (!emaFastRef.current || !emaSlowRef.current) return;
    if (showEma) {
      emaFastRef.current.setData(buildEma(MOCK_CANDLES, 20));
      emaSlowRef.current.setData(buildEma(MOCK_CANDLES, 50));
    } else {
      emaFastRef.current.setData([]);
      emaSlowRef.current.setData([]);
    }
  }, [showEma, strategy]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {/* Live dot overlay */}
      <div style={{
        position: "absolute",
        top: 8,
        right: 8,
        display: "flex",
        alignItems: "center",
        gap: 5,
        background: "rgba(0,0,0,0.55)",
        borderRadius: 20,
        padding: "3px 8px",
        backdropFilter: "blur(4px)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isLive ? "#22c55e" : "rgba(113,113,122,1)",
          boxShadow: isLive ? "0 0 6px #22c55e" : "none",
          animation: isLive ? "pulse 2s ease-in-out infinite" : "none",
        }} />
        <span style={{ fontSize: 9, color: isLive ? "#86efac" : "rgba(113,113,122,1)", fontWeight: 700, letterSpacing: "0.06em" }}>
          {isLive ? "LIVE" : "—"}
        </span>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
    </div>
  );
}

// ── Equity mini-chart (recharts) ───────────────────────────────────────────────

function EquityMiniChart({ data }: { data: Array<{ date: string; value: number }> }) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        height: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        color: "rgba(113,113,122,1)",
      }}>
        Equity curve wird nach Backtest angezeigt
      </div>
    );
  }

  const formatted = data.map((d) => ({ date: d.date.slice(5), value: d.value }));
  const min = Math.min(...data.map((d) => d.value));
  const max = Math.max(...data.map((d) => d.value));

  return (
    <div style={{ height: 200, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formatted} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="date"
            tick={{ fill: "rgba(113,113,122,1)", fontSize: 9 }}
            axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
            tickLine={false}
            interval="preserveStartEnd"
            tickCount={4}
          />
          <YAxis
            tick={{ fill: "rgba(113,113,122,1)", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            domain={[min * 0.98, max * 1.02]}
            tickFormatter={(v: number) => `${v.toFixed(0)}`}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: "#1c1d20",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 6,
              fontSize: 11,
              color: "#ffffff",
            }}
            labelStyle={{ color: "rgba(161,161,170,1)" }}
            formatter={(v: unknown) => [`${(v as number).toFixed(2)}`, "Equity"]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: "#3b82f6" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Backtest result table ──────────────────────────────────────────────────────

function BacktestTable({ result }: { result: BacktestResult }) {
  const rows: Array<{ label: string; value: string; tone?: string }> = [
    { label: "CAGR", value: fmtNum(result.cagr, 1, "%") },
    { label: "Sharpe", value: fmtNum(result.sharpe, 2) },
    { label: "Max DD", value: result.max_drawdown != null ? `-${Math.abs(result.max_drawdown).toFixed(1)}%` : "—", tone: "negative" },
    { label: "Calmar", value: fmtNum(result.calmar, 2) },
    { label: "Trades", value: result.trades != null ? String(result.trades) : "—" },
    { label: "Win Rate", value: fmtNum(result.win_rate, 0, "%") },
  ];

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.label}
            style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.025)" : "transparent" }}
          >
            <td style={{
              padding: "5px 10px",
              color: "rgba(161,161,170,1)",
              fontWeight: 500,
              borderRadius: i === 0 ? "4px 0 0 0" : i === rows.length - 1 ? "0 0 0 4px" : undefined,
            }}>
              {r.label}
            </td>
            <td style={{
              padding: "5px 10px",
              color: r.tone === "negative" ? "#f87171" : "#ffffff",
              fontWeight: 700,
              textAlign: "right",
              fontFamily: "monospace",
            }}>
              {r.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TradingEnginePage() {
  const [strategy, setStrategy] = useState<Strategy>("EUR_30M");
  const [assetType, setAssetType] = useState<AssetType>("futures");
  const [period, setPeriod] = useState<Period>("3M");
  const [startDate, setStartDate] = useState("2019-01-01");
  const [endDate, setEndDate] = useState(todayISO());
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [signal, setSignal] = useState<SignalState>({ direction: "flat" });
  const [isLive] = useState(false);

  const meta = STRATEGIES[strategy];

  // Fetch signal when strategy or assetType changes
  const fetchSignal = useCallback(async () => {
    try {
      const res = await fetch("/api/engine/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, asset_type: assetType }),
      });
      if (res.ok) {
        const data = (await res.json()) as SignalState;
        setSignal(data);
      }
    } catch {
      // keep last signal on network error
    }
  }, [strategy, assetType]);

  useEffect(() => {
    void fetchSignal();
  }, [fetchSignal]);

  const runBacktest = async () => {
    setIsRunning(true);
    setBacktestResult(null);
    try {
      const res = await fetch("/api/engine/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy,
          asset_type: assetType,
          start_date: startDate,
          end_date: endDate,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as BacktestResult;
        setBacktestResult(data);
      }
    } catch {
      // no-op
    } finally {
      setIsRunning(false);
    }
  };

  const exportJson = () => {
    if (!backtestResult) return;
    const blob = new Blob([JSON.stringify(backtestResult, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backtest_${strategy}_${startDate}_${endDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 6,
    padding: "6px 8px",
    color: "#ffffff",
    fontSize: 12,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "rgba(161,161,170,1)",
    marginBottom: 4,
    display: "block",
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.10em",
    textTransform: "uppercase" as const,
    color: "rgba(255,255,255,0.25)",
    padding: "12px 0 6px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    marginBottom: 10,
  };

  return (
    <div style={{
      display: "flex",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      background: "#0c0d10",
      gap: 8,
      padding: 8,
    }}>

      {/* ── LEFT PANEL: Strategy ─────────────────────────────────────────────── */}
      <div style={{
        width: 280,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "#111214",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}>
        <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>

          {/* Strategy Switcher */}
          <div style={sectionHeaderStyle}>Strategy</div>

          <GroupLabel label="Intraday" />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 6 }}>
            {INTRADAY_STRATEGIES.map((id) => (
              <StrategyButton key={id} id={id} active={strategy === id} onClick={() => setStrategy(id)} />
            ))}
          </div>

          <GroupLabel label="Anomaly" />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 14 }}>
            {ANOMALY_STRATEGIES.map((id) => (
              <StrategyButton key={id} id={id} active={strategy === id} onClick={() => setStrategy(id)} />
            ))}
          </div>

          {/* Asset Type Toggle */}
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>Asset Type</div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["futures", "cfd"] as AssetType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setAssetType(t)}
                  style={{
                    flex: 1,
                    padding: "5px 0",
                    borderRadius: 6,
                    border: assetType === t ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.06)",
                    background: assetType === t ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
                    color: assetType === t ? "#ffffff" : "rgba(113,113,122,1)",
                    fontSize: 11,
                    fontWeight: assetType === t ? 700 : 400,
                    cursor: "pointer",
                    textTransform: "capitalize",
                    transition: "all 120ms ease",
                  }}
                >
                  {t === "futures" ? "Futures" : "CFD"}
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div style={{ marginBottom: 14 }}>
            <div style={sectionHeaderStyle}>Parameters — {meta.label}</div>
            {Object.entries(meta.params).map(([k, v]) => (
              <ParamRow key={k} k={k} v={v} />
            ))}
          </div>

          {/* Current Signal */}
          <div style={{ marginBottom: 14 }}>
            <div style={sectionHeaderStyle}>Current Signal</div>
            <SignalBadge direction={signal.direction} />
          </div>

          {/* Last Trade */}
          <div>
            <div style={sectionHeaderStyle}>Last Trade</div>
            {(
              [
                { label: "Entry", value: signal.entry != null ? String(signal.entry) : "—" },
                { label: "SL", value: signal.sl != null ? String(signal.sl) : "—" },
                { label: "TP", value: signal.tp != null ? String(signal.tp) : "—" },
                {
                  label: "PnL",
                  value: signal.pnl != null ? `${signal.pnl > 0 ? "+" : ""}${signal.pnl.toFixed(2)}` : "—",
                },
              ] as const
            ).map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "4px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                }}
              >
                <span style={{ fontSize: 11, color: "rgba(161,161,170,1)" }}>{row.label}</span>
                <span style={{
                  fontSize: 11,
                  color: row.label === "PnL" && signal.pnl != null
                    ? signal.pnl >= 0 ? "#34d399" : "#f87171"
                    : "rgba(228,228,231,1)",
                  fontFamily: "monospace",
                }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CENTER PANEL: Chart ───────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background: "#111214",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}>
        {/* Toolbar */}
        <div style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em" }}>
              {meta.asset}
            </span>
            <span style={{ fontSize: 10, color: "rgba(113,113,122,1)" }}>
              {meta.label}
            </span>
          </div>

          {/* Timeframe switcher */}
          <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
            {(["1M", "3M", "1Y", "Max"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: "3px 9px",
                  borderRadius: 5,
                  border: period === p ? "1px solid rgba(255,255,255,0.15)" : "1px solid transparent",
                  background: period === p ? "rgba(255,255,255,0.08)" : "transparent",
                  color: period === p ? "#ffffff" : "rgba(113,113,122,1)",
                  fontSize: 11,
                  fontWeight: period === p ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 100ms ease",
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* EMA legend */}
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

        {/* Chart */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <CandleChart strategy={strategy} period={period} isLive={isLive} />
        </div>
      </div>

      {/* ── RIGHT PANEL: Backtest ─────────────────────────────────────────────── */}
      <div style={{
        width: 320,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "#111214",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}>
        <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>

          <div style={sectionHeaderStyle}>Backtest</div>

          {/* Date range */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Run button */}
          <button
            onClick={() => void runBacktest()}
            disabled={isRunning}
            style={{
              width: "100%",
              padding: "9px 0",
              borderRadius: 7,
              border: "none",
              background: isRunning ? "#1d4ed8" : "#2563eb",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 700,
              cursor: isRunning ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "background 150ms ease",
              marginBottom: 16,
            }}
            onMouseEnter={(e) => {
              if (!isRunning) (e.currentTarget as HTMLButtonElement).style.background = "#1d4ed8";
            }}
            onMouseLeave={(e) => {
              if (!isRunning) (e.currentTarget as HTMLButtonElement).style.background = "#2563eb";
            }}
          >
            {isRunning ? (
              <>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
                >
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Running…
              </>
            ) : (
              "Run Backtest"
            )}
          </button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

          {/* Results */}
          {backtestResult && (
            <>
              <div style={{ marginBottom: 12 }}>
                <BacktestTable result={backtestResult} />
              </div>

              {/* Equity curve */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                overflow: "hidden",
                marginBottom: 12,
              }}>
                <div style={{
                  padding: "8px 10px 4px",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.25)",
                }}>
                  Equity Curve
                </div>
                <EquityMiniChart data={backtestResult.equity_curve ?? []} />
              </div>

              {/* Export */}
              <button
                onClick={exportJson}
                style={{
                  width: "100%",
                  padding: "7px 0",
                  borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(212,212,216,1)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 120ms ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                }}
              >
                Export JSON
              </button>
            </>
          )}

          {!backtestResult && !isRunning && (
            <div style={{
              padding: "24px 0",
              textAlign: "center",
              fontSize: 11,
              color: "rgba(113,113,122,1)",
            }}>
              Run a backtest to see results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
