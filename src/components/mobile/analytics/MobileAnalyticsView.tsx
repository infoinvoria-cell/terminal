"use client";

import React, { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type AnalyticsDataset,
  type AnalyticsMode,
  type AnalyticsSeriesPoint,
  type AnalyticsTab,
  getAnalyticsDataset,
} from "@/lib/analytics/portfolio-data";
import type { CapalifeData } from "@/lib/capitalife-data";
import type { FSPortfolioSnapshot } from "@/lib/fsportfolio/types";

type StartFilter = "Max" | "YTD" | "1Y" | "3Y" | "5Y" | "2015" | "2008";

interface Props {
  capalifeData: CapalifeData;
  fsportfolio: FSPortfolioSnapshot | undefined;
}

// ─── Theme ──────────────────────────────────────────────────────────────────
const PAGE_BG = "#0c0d10";
const CARD_BG = "#1c1d20";
const BORDER = "1px solid rgba(255,255,255,0.06)";
const GOLD = "#e2ca7a";
const MUTED = "rgba(255,255,255,0.38)";
const GREEN = "#4ade80";
const RED = "#f87171";
const CHART_BG = "#111214";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function startDateFor(filter: StartFilter): string | null {
  const now = new Date("2026-07-25");
  switch (filter) {
    case "Max": return null;
    case "YTD": return `${now.getFullYear()}-01-01`;
    case "1Y": { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); }
    case "3Y": { const d = new Date(now); d.setFullYear(d.getFullYear() - 3); return d.toISOString().slice(0, 10); }
    case "5Y": { const d = new Date(now); d.setFullYear(d.getFullYear() - 5); return d.toISOString().slice(0, 10); }
    case "2015": return "2015-01-01";
    case "2008": return "2008-01-01";
  }
}

function filterSeries(series: AnalyticsSeriesPoint[], from: string | null) {
  if (!from) return series;
  return series.filter((p) => p.date >= from);
}

function filterBars(bars: { label: string; value: number }[], from: string | null) {
  if (!from) return bars;
  return bars.filter((b) => b.label >= from.slice(0, 4));
}

function fmt(value: number | string | undefined | null, sign = true): string {
  if (value === null || value === undefined || value === "") return "n/a";
  if (typeof value === "string") {
    // already formatted string
    if (value === "n/a") return "n/a";
    const n = parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (Number.isNaN(n)) return value;
    return sign ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : `${n.toFixed(2)}%`;
  }
  if (!Number.isFinite(value)) return "n/a";
  return sign ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : `${value.toFixed(2)}%`;
}

function fmtNum(value: number | string | undefined | null, digits = 2): string {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "string") return value === "n/a" ? "n/a" : value;
  if (!Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function rebaseToZero(series: AnalyticsSeriesPoint[], from: string | null): AnalyticsSeriesPoint[] {
  const filtered = filterSeries(series, from);
  if (!filtered.length) return filtered;
  const base = filtered[0]!.value;
  return filtered.map((p) => ({ ...p, value: Number((p.value - base).toFixed(2)) }));
}

function xTick(label: string) {
  if (!label) return "";
  if (/^\d{4}$/.test(label)) return label;
  if (/^\d{4}-\d{2}/.test(label)) return label.slice(0, 7);
  return label;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD_BG, border: BORDER, borderRadius: 14, marginBottom: 14, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px 0", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED }}>
        {title}
      </div>
      <div style={{ padding: "8px 2px 8px" }}>{children}</div>
    </div>
  );
}

function EquityChart({ series }: { series: AnalyticsSeriesPoint[] }) {
  if (!series.length) return <EmptyChart label="No data" />;
  const color = (series.at(-1)?.value ?? 0) >= 0 ? GREEN : RED;
  const thinned = thin(series, 80);
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={thinned} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 8, fill: MUTED }} tickFormatter={xTick} interval="preserveStartEnd" axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 8, fill: MUTED }} tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`} axisLine={false} tickLine={false} width={38} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="2 2" />
        <Tooltip
          contentStyle={{ background: "#1a1b1e", border: BORDER, borderRadius: 8, fontSize: 11 }}
          formatter={(v) => [`${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`, "Return"]}
          labelFormatter={(l) => String(l).slice(0, 7)}
        />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill="url(#eqGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DrawdownChart({ series }: { series: { date: string; value: number }[] }) {
  if (!series.length) return <EmptyChart label="No data" />;
  const thinned = thin(series, 80);
  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={thinned} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={RED} stopOpacity={0.3} />
            <stop offset="95%" stopColor={RED} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 8, fill: MUTED }} tickFormatter={xTick} interval="preserveStartEnd" axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 8, fill: MUTED }} tickFormatter={(v) => `${v.toFixed(0)}%`} axisLine={false} tickLine={false} width={34} />
        <Tooltip
          contentStyle={{ background: "#1a1b1e", border: BORDER, borderRadius: 8, fontSize: 11 }}
          formatter={(v) => [`${Number(v).toFixed(2)}%`, "Drawdown"]}
          labelFormatter={(l) => String(l).slice(0, 7)}
        />
        <Area type="monotone" dataKey="value" stroke={RED} strokeWidth={1.2} fill="url(#ddGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BarsChart({ bars, label }: { bars: { label: string; value: number }[]; label: string }) {
  if (!bars.length) return <EmptyChart label="No data" />;
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={bars} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 7, fill: MUTED }} axisLine={false} tickLine={false} interval={bars.length > 15 ? Math.floor(bars.length / 8) : 0} />
        <YAxis tick={{ fontSize: 8, fill: MUTED }} tickFormatter={(v) => `${v.toFixed(0)}%`} axisLine={false} tickLine={false} width={32} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
        <Tooltip
          contentStyle={{ background: "#1a1b1e", border: BORDER, borderRadius: 8, fontSize: 11 }}
          formatter={(v) => [`${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`, label]}
        />
        <Bar dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={28}>
          {bars.map((b, i) => (
            <Cell key={i} fill={b.value >= 0 ? "rgba(74,222,128,0.75)" : "rgba(248,113,113,0.75)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 12 }}>
      {label}
    </div>
  );
}

function thin<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}

function KpiRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderBottom: BORDER }}>
      <span style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: color ?? "white" }}>{value}</span>
    </div>
  );
}

function kpiColor(value: string): string {
  if (value === "n/a" || !value) return MUTED;
  if (value.startsWith("+") || (value.startsWith("0") && !value.startsWith("0.0"))) return GREEN;
  if (value.startsWith("-")) return RED;
  return "white";
}

function KpiGrid({ dataset }: { dataset: AnalyticsDataset }) {
  const m = dataset.metrics;
  const rows: { label: string; value: string }[] = [
    { label: "Total Return", value: fmt(m.totalReturnPct) },
    { label: "CAGR", value: fmt(m.cagrPct) },
    { label: "Max Drawdown", value: fmt(m.maxDrawdownPct) },
    { label: "Sharpe", value: fmtNum(m.sharpe) },
    { label: "Sortino", value: fmtNum(m.sortino) },
    { label: "Calmar", value: fmtNum(m.calmar) },
    { label: "Volatility p.a.", value: fmt(m.annualizedVolatilityPct, false) },
    { label: "Pos. Months", value: fmt(m.positiveMonthsPct, false) },
    { label: "Worst Year", value: fmt(m.worstYearPct) },
    { label: "Trades / Data Pts", value: `${fmtNum(m.tradeCount, 0)} / ${fmtNum(m.dataPoints, 0)}` },
  ];
  return (
    <div style={{ background: CARD_BG, border: BORDER, borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ padding: "12px 14px 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED }}>
        KPI Grid
      </div>
      {rows.map((r) => (
        <KpiRow key={r.label} label={r.label} value={r.value} color={kpiColor(r.value)} />
      ))}
      {m.period && (
        <div style={{ padding: "8px 14px", fontSize: 10, color: MUTED }}>
          {dataset.period.start?.slice(0, 7)} — {dataset.period.end?.slice(0, 7)}
        </div>
      )}
    </div>
  );
}

// ─── Tab label helpers ────────────────────────────────────────────────────────
const TAB_LABELS: Record<AnalyticsTab, string> = {
  whiteSwan: "White Swan",
  invest: "Core Invest",
  combined: "Combined",
};

const MODE_LABELS: Record<AnalyticsMode, string> = {
  live: "Live",
  backtest: "Backtest",
};

const START_FILTERS: StartFilter[] = ["Max", "YTD", "1Y", "3Y", "5Y", "2015", "2008"];

// ─── Main component ───────────────────────────────────────────────────────────
export function MobileAnalyticsView({ capalifeData, fsportfolio }: Props) {
  const [tab, setTab] = useState<AnalyticsTab>("whiteSwan");
  const [mode, setMode] = useState<AnalyticsMode>("live");
  const [startFilter, setStartFilter] = useState<StartFilter>("Max");

  const dataset = useMemo<AnalyticsDataset>(
    () => getAnalyticsDataset(tab, mode, fsportfolio, capalifeData),
    [tab, mode, fsportfolio, capalifeData],
  );

  const from = startDateFor(startFilter);

  const perfSeries = useMemo(() => rebaseToZero(dataset.performanceSeries, from), [dataset, from]);
  const ddSeries = useMemo(() => filterSeries(dataset.drawdownSeries, from), [dataset, from]);
  const annualBars = useMemo(() => filterBars(dataset.annualReturns, from), [dataset, from]);
  const monthlyBars = useMemo(() => filterSeries(
    dataset.monthlyReturns.map((b) => ({ date: b.label, value: b.value })),
    from,
  ).map((p) => ({ label: p.date, value: p.value })), [dataset, from]);

  const pill = (active: boolean) => ({
    flexShrink: 0 as const,
    padding: "5px 13px",
    borderRadius: 20,
    border: active ? `1px solid ${GOLD}` : BORDER,
    background: active ? "rgba(226,202,122,0.12)" : CARD_BG,
    color: active ? GOLD : MUTED,
    fontSize: 11,
    fontWeight: 600 as const,
    fontFamily: "var(--font-montserrat, sans-serif)",
    cursor: "pointer" as const,
    letterSpacing: "0.04em",
  });

  const tabPill = (t: AnalyticsTab) => ({
    ...pill(tab === t),
    flex: 1 as const,
    textAlign: "center" as const,
  });

  return (
    <div
      style={{
        minHeight: "100%",
        paddingBottom: 40,
        background: PAGE_BG,
        fontFamily: "var(--font-montserrat, sans-serif)",
        color: "white",
      }}
    >
      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: PAGE_BG,
          borderBottom: BORDER,
          padding: "18px 16px 14px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>Analytics</h1>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: MUTED }}>{dataset.title} · {MODE_LABELS[mode]}</p>
      </div>

      <div style={{ padding: "14px 14px 0" }}>
        {/* Tab row */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {(["whiteSwan", "invest", "combined"] as AnalyticsTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabPill(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Mode row */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {(["live", "backtest"] as AnalyticsMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={pill(mode === m)}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Start filter pills */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 14 }}>
          {START_FILTERS.map((f) => (
            <button key={f} onClick={() => setStartFilter(f)} style={pill(startFilter === f)}>
              {f}
            </button>
          ))}
        </div>

        {/* Equity chart */}
        <ChartCard title="Equity Curve">
          <EquityChart series={perfSeries} />
        </ChartCard>

        {/* Drawdown chart */}
        <ChartCard title="Drawdown">
          <DrawdownChart series={ddSeries} />
        </ChartCard>

        {/* Annual returns */}
        <ChartCard title="Annual Returns">
          <BarsChart bars={annualBars} label="Annual" />
        </ChartCard>

        {/* Monthly returns */}
        <ChartCard title="Monthly Returns">
          <BarsChart bars={monthlyBars} label="Monthly" />
        </ChartCard>

        {/* KPI grid */}
        <KpiGrid dataset={dataset} />

        {/* Period/source footer */}
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", textAlign: "center", marginTop: 8, paddingBottom: 8 }}>
          {dataset.sourceLabel}
        </div>
      </div>
    </div>
  );
}
