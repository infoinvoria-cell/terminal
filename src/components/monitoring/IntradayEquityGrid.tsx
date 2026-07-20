"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CurvePoint { date: string; equity: number }

interface PeriodStats {
  n: number;
  cagr: number;
  maxDD: number;
  mar: number;
  sharpe: number;
  pf: number;
  wr: number;
}

interface StrategyPeriod {
  period: string;
  curve: CurvePoint[];
  stats: PeriodStats;
}

interface StrategyData {
  id: string;
  title: string;
  subtitle: string;
  symbol: string;
  timeframe: string;
  color: string;
  wfFolds: string;
  wfGate: string;
  is: StrategyPeriod;
  oos: StrategyPeriod;
}

interface EquityJson {
  strategies: StrategyData[];
  generatedAt: string;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number | undefined;
  return (
    <div style={{
      background: "rgba(13,17,23,0.95)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 8,
      padding: "6px 10px",
      fontSize: 11,
      color: "#e6edf3",
    }}>
      <div style={{ opacity: 0.6, marginBottom: 2 }}>{label}</div>
      {v !== undefined && (
        <div><strong>{v >= 100 ? "+" : ""}{(v - 100).toFixed(1)}%</strong> (={v.toFixed(1)})</div>
      )}
    </div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 1,
      padding: "4px 8px",
      borderRadius: 7,
      background: highlight ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
      border: `1px solid rgba(255,255,255,${highlight ? "0.12" : "0.06"})`,
      minWidth: 52,
    }}>
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.45, color: "#e6edf3" }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3", lineHeight: 1.2 }}>
        {value}
      </span>
    </div>
  );
}

// ── Toggle button ─────────────────────────────────────────────────────────────

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "2px 10px",
        borderRadius: 5,
        border: "1px solid rgba(255,255,255,0.15)",
        background: active ? "rgba(255,255,255,0.12)" : "transparent",
        color: active ? "#e6edf3" : "rgba(230,237,243,0.4)",
        fontSize: 10,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: "0.04em",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

// ── Single strategy card ───────────────────────────────────────────────────────

function StrategyCard({ data }: { data: StrategyData }) {
  const [view, setView] = useState<"oos" | "is">("oos");
  const period = view === "oos" ? data.oos : data.is;
  const stats   = period.stats;

  // Normalize curve to start=100 relative within the view
  const chartData = useMemo(() => {
    if (!period.curve.length) return [];
    const base = period.curve[0].equity;
    return period.curve.map((p) => ({
      date: p.date,
      equity: parseFloat(((p.equity / base) * 100).toFixed(2)),
    }));
  }, [period.curve]);

  const minEq = useMemo(() => Math.min(...chartData.map((d) => d.equity)) * 0.995, [chartData]);
  const maxEq = useMemo(() => Math.max(...chartData.map((d) => d.equity)) * 1.005, [chartData]);

  const isPositive = stats.cagr >= 0;
  const colorStr   = data.color;

  return (
    <div style={{
      background: "rgba(13,17,23,0.92)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 12,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      height: "100%",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px 6px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3", lineHeight: 1.2 }}>
            <span style={{ color: colorStr, marginRight: 6 }}>●</span>
            {data.title}
          </div>
          <div style={{ fontSize: 10, opacity: 0.5, color: "#e6edf3", marginTop: 2 }}>
            {data.symbol} · {data.timeframe} · {data.subtitle}
          </div>
        </div>
        {/* IS / OOS toggle */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0, paddingTop: 2 }}>
          <ToggleBtn label={`OOS ${data.oos.period}`} active={view === "oos"} onClick={() => setView("oos")} />
          <ToggleBtn label={`IS ${data.is.period}`}   active={view === "is"}  onClick={() => setView("is")}  />
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, padding: "0 8px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "rgba(230,237,243,0.35)" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minEq, maxEq]}
              tick={{ fontSize: 9, fill: "rgba(230,237,243,0.35)" }}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v: number) => `${(v - 100).toFixed(0)}%`}
            />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={colorStr}
              strokeWidth={1.8}
              fill={colorStr}
              fillOpacity={0.08}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: colorStr }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Stats bar */}
      <div style={{
        padding: "6px 10px 10px",
        display: "flex",
        gap: 5,
        flexWrap: "wrap",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        marginTop: 4,
      }}>
        <StatPill label="CAGR" value={`${stats.cagr >= 0 ? "+" : ""}${stats.cagr.toFixed(1)}%`} highlight={isPositive} />
        <StatPill label="MaxDD" value={`${stats.maxDD.toFixed(1)}%`} />
        <StatPill label="MAR" value={stats.mar.toFixed(3)} highlight={stats.mar >= 1} />
        <StatPill label="Sharpe" value={stats.sharpe.toFixed(2)} />
        <StatPill label="PF" value={stats.pf >= 99 ? "∞" : stats.pf.toFixed(2)} />
        <StatPill label="Trades" value={stats.n.toLocaleString()} />
        <StatPill label="WF" value={data.wfFolds} />
        <div style={{
          display: "flex",
          alignItems: "center",
          fontSize: 9,
          opacity: 0.35,
          color: "#e6edf3",
          marginLeft: "auto",
          paddingRight: 2,
          maxWidth: 160,
          textAlign: "right",
        }}>
          {data.wfGate}
        </div>
      </div>
    </div>
  );
}

// ── Main grid component ────────────────────────────────────────────────────────

export default function IntradayEquityGrid() {
  const [strategies, setStrategies] = useState<StrategyData[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/intraday-equity.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<EquityJson>;
      })
      .then((d) => {
        setStrategies(d.strategies);
        setGeneratedAt(d.generatedAt ?? "");
      })
      .catch((e: unknown) => {
        setError(String(e instanceof Error ? e.message : e));
      });
  }, []);

  if (error) {
    return (
      <div style={{ color: "rgba(230,237,243,0.4)", padding: 24, fontSize: 12 }}>
        Equity-Daten nicht verfügbar: {error}
      </div>
    );
  }

  if (!strategies) {
    return (
      <div style={{ color: "rgba(230,237,243,0.35)", padding: 24, fontSize: 12 }}>
        Lade Equity-Kurven …
      </div>
    );
  }

  // Ordered layout: DAX2H, DAX1H, EUR30m, GBP30m
  const ORDER = ["DAX2H", "DAX1H", "EUR30m", "GBP30m"];
  const ordered = ORDER.map((id) => strategies.find((s) => s.id === id)).filter(Boolean) as StrategyData[];

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      gap: 0,
      overflow: "hidden",
    }}>
      {/* 2×2 grid */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: 6,
        padding: "6px 6px 0",
      }}>
        {ordered.map((s) => (
          <StrategyCard key={s.id} data={s} />
        ))}
      </div>

      {/* Footer: v3-F portfolio stats */}
      <div style={{
        padding: "6px 10px 8px",
        fontSize: 10,
        color: "rgba(230,237,243,0.35)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span>
          Portfolio v3-F · EUR 40% / DAX1H 40% / GBP 5% / DAX2H 15% · OOS MAR 1.732 · MaxDD 8.1% · Sharpe 1.526
        </span>
        {generatedAt && <span>Stand: {generatedAt}</span>}
      </div>
    </div>
  );
}
