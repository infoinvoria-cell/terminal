"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Layers, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import {
  type AnalyticsDataset,
  type AnalyticsMode,
  type AnalyticsSeriesPoint,
  type AnalyticsTab,
  getAnalyticsDataset,
} from "@/lib/analytics/portfolio-data";
import type { CapalifeData } from "@/lib/capitalife-data";
import { CI_PORTFOLIO_KPIS } from "@/lib/components/ws-strategy-data";
import type { EquityPoint, FSPortfolioSnapshot } from "@/lib/fsportfolio/types";
import { aggregateReturns, computePortfolioMetrics } from "@/lib/fsportfolio/metrics";
import { useGlobalRefresh } from "@/hooks/use-global-refresh";

type StartFilter = "YTD" | "1Y" | "3Y" | "5Y" | "2015" | "2008" | "Max";
type LineMode = "portfolio" | "assets" | "benchmark";
type KpiCard = { label: string; value: string; delta?: string | null; deltaGold?: boolean; deltaNeutral?: boolean };

function toNonCompounded(series: AnalyticsSeriesPoint[]): AnalyticsSeriesPoint[] {
  if (!series.length) return series;
  let cumSimple = 0;
  return series.map((point, index) => {
    if (index === 0) {
      cumSimple = point.value;
    } else {
      const prevEquity = 1 + (series[index - 1]!.value) / 100;
      const currEquity = 1 + point.value / 100;
      const dailyR = prevEquity > 0 ? (currEquity / prevEquity - 1) * 100 : 0;
      cumSimple += dailyR;
    }
    return { ...point, value: Number(cumSimple.toFixed(2)) };
  });
}

function computeBenchmarkTotalReturn(benchmarkSeries: AnalyticsSeriesPoint[]): number | null {
  if (!benchmarkSeries.length) return null;
  return benchmarkSeries.at(-1)?.value ?? null;
}

function computeBenchmarkMaxDD(benchmarkSeries: AnalyticsSeriesPoint[]): number | null {
  if (!benchmarkSeries.length) return null;
  let peak = -Infinity;
  let maxDD = 0;
  for (const point of benchmarkSeries) {
    const equity = 1 + point.value / 100;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? (equity / peak - 1) * 100 : 0;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

function computeBenchmarkCagr(benchmarkSeries: AnalyticsSeriesPoint[]): number | null {
  if (benchmarkSeries.length < 2) return null;
  const first = benchmarkSeries[0]!;
  const last = benchmarkSeries.at(-1)!;
  const years = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years <= 0) return null;
  const totalReturn = 1 + last.value / 100;
  return (Math.pow(totalReturn, 1 / years) - 1) * 100;
}

const LIVE_PHASE_A_START = "2025-05-01";
const LIVE_PHASE_B_START = "2026-05-01";
// Core Invest target weights (Core Invest v2.0 — frozen 2026-07-20)
const LIVE_DEFAULT_WEIGHTS: Record<string, number> = { SPY: 5, SPMO: 5, QQQ: 45, GLD: 25, WHITE_SWAN_NAS_EMA: 10, COPPER_HG: 5, CHF_6S: 5 };
const LIVE_ORIGINAL_WEIGHTS: Record<string, number> = { SPY: 5, SPMO: 5, QQQ: 45, GLD: 25, WHITE_SWAN_NAS_EMA: 10, COPPER_HG: 5, CHF_6S: 5 };
const LIVE_ASSET_SYMBOLS = ["SPY", "SPMO", "QQQ", "GLD", "WHITE_SWAN_NAS_EMA", "COPPER_HG", "CHF_6S"] as const;
const LIVE_ASSET_LABELS: Record<string, string> = { SPY: "SPY", SPMO: "SPMO", QQQ: "QQQ passive", GLD: "GLD", WHITE_SWAN_NAS_EMA: "QQQ Pine 1", COPPER_HG: "Copper/HG", CHF_6S: "CHF/6S" };

// ── White Swan v1.1 constants ─────────────────────────────────────────────────
const WS_STRATEGY_IDS = [
  "GC1 Friday Long", "GLD Thursday Long", "YM1 TAT",
  "UKX Valuation", "CT1 Macro A", "NQ1 Trend LO",
  "Intraday MT v3-F",
  "NVDA Valuation", "ZARUSD Valuation", "GC1 Valuation",
  "MSFT Valuation", "BRLUSD Valuation", "SEKUSD Valuation",
] as const;
// The analytics control covers a selected 77% subset of the 100% component
// registry. Keep the real subtotal visible; buildScopedWsDataset normalizes only
// when calculating an explicitly user-selected scenario.
const WS_FROZEN_WEIGHTS: Record<string, number> = {
  "GC1 Friday Long":   2,   // Anomaly — v1.2 approved, IS+OOS WF validated
  "GLD Thursday Long": 2,   // Anomaly — v1.2 approved
  "YM1 TAT":           4,   // Anomaly — v1.2 highest weight (best diversification)
  "UKX Valuation":     2,   // Valuation
  "CT1 Macro A":       9,   // Macro
  "NQ1 Trend LO":      3,   // Trend
  "Intraday MT v3-F":  32,  // three White Swan components: EUR 14 / DAX1H 14 / DAX2H 4
  "NVDA Valuation":    3,   // Valuation
  "ZARUSD Valuation":  3,   // Valuation
  "GC1 Valuation":     3,   // Valuation
  "MSFT Valuation":    2,   // Valuation
  "BRLUSD Valuation":  2,   // Valuation
  "SEKUSD Valuation":  2,   // Valuation
};
// All portfolio strategies enabled by default (anomaly now fully in portfolio)
const WS_DEFAULT_ENABLED: Record<string, boolean> = {
  "GC1 Friday Long":   true,
  "GLD Thursday Long": true,
  "YM1 TAT":           true,
  "UKX Valuation":     true,
  "CT1 Macro A":       true,
  "NQ1 Trend LO":      true,
  "Intraday MT v3-F":  true,
  "NVDA Valuation":    true,
  "ZARUSD Valuation":  true,
  "GC1 Valuation":     true,
  "MSFT Valuation":    true,
  "BRLUSD Valuation":  true,
  "SEKUSD Valuation":  true,
};
const WS_STRATEGY_SHORT: Record<string, string> = {
  "GC1 Friday Long":   "GC1 Friday",
  "GLD Thursday Long": "GLD Thursday",
  "YM1 TAT":           "YM1 TAT",
  "UKX Valuation":     "UKX Val",
  "CT1 Macro A":       "CT1 Macro",
  "NQ1 Trend LO":      "NQ1 Trend",
  "Intraday MT v3-F":  "Intraday",
  "NVDA Valuation":    "NVDA Val",
  "ZARUSD Valuation":  "ZAR Val",
  "GC1 Valuation":     "GC1 Val",
  "MSFT Valuation":    "MSFT Val",
  "BRLUSD Valuation":  "BRL Val",
  "SEKUSD Valuation":  "SEK Val",
};
const WS_INTRADAY_ID = "Intraday MT v3-F" as const;

function SwanIcon({ size = 16 }: { size?: number }) {
  return (
    <img
      src="/branding/white-swan-logo.png"
      alt="White Swan"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

function buildScopedWsDataset(
  baseDataset: AnalyticsDataset,
  wsWeights: Record<string, number>,
  wsEnabled: Record<string, boolean>,
  wsRiskMultiplier: number,
): AnalyticsDataset {
  const groupSeries = baseDataset.groupSeries;

  // Convert cumulative % equity curves → per-month decimal returns
  const stratMonthlyR: Record<string, Record<string, number>> = {};
  for (const stratId of WS_STRATEGY_IDS) {
    const curve = groupSeries[stratId];
    if (!curve?.length) continue;
    const monthR: Record<string, number> = {};
    let prevCum = 0;
    for (const point of curve) {
      const month = point.date.slice(0, 7);
      monthR[month] = (1 + point.value / 100) / (1 + prevCum / 100) - 1;
      prevCum = point.value;
    }
    stratMonthlyR[stratId] = monthR;
  }

  const allMonths = [...new Set(
    (WS_STRATEGY_IDS as readonly string[]).flatMap(id => Object.keys(stratMonthlyR[id] ?? {}))
  )].sort();

  const activeStrats = WS_STRATEGY_IDS.filter(id => wsEnabled[id] !== false && stratMonthlyR[id]);
  const rawTotalW = activeStrats.reduce((s, id) => s + (wsWeights[id] ?? 0), 0);
  const normW: Record<string, number> = {};
  for (const id of activeStrats) normW[id] = rawTotalW > 0 ? (wsWeights[id] ?? 0) / rawTotalW : 0;

  let equity = 100;
  const performanceSeries: AnalyticsSeriesPoint[] = [];
  const monthlyRetsRec: Record<string, number> = {};

  for (const month of allMonths) {
    const avail = activeStrats.filter(id => stratMonthlyR[id]![month] !== undefined);
    const availW = avail.reduce((s, id) => s + (normW[id] ?? 0), 0);
    let r = 0;
    if (availW > 0) {
      for (const id of avail) r += stratMonthlyR[id]![month]! * (normW[id] ?? 0) / availW;
    }
    r *= wsRiskMultiplier;
    equity *= 1 + r;
    monthlyRetsRec[month] = r;
    // pick a real date from any strategy curve for that month, else use month-28
    const date =
      Object.values(groupSeries).flatMap(c => c ?? []).find(p => p.date.startsWith(month))?.date
      ?? `${month}-28`;
    performanceSeries.push({ date, value: Number((equity - 100).toFixed(2)) });
  }

  const drawdownSeries = computeDrawdown(performanceSeries);

  // Annual returns
  const annualGroups = new Map<string, number[]>();
  for (const [month, r] of Object.entries(monthlyRetsRec)) {
    const yr = month.slice(0, 4);
    if (!annualGroups.has(yr)) annualGroups.set(yr, []);
    annualGroups.get(yr)!.push(r);
  }
  const annualReturns = [...annualGroups.entries()].sort().map(([yr, rs]) => ({
    label: yr,
    value: Number(((rs.reduce((s, r) => s * (1 + r), 1) - 1) * 100).toFixed(2)),
  }));
  const monthlyReturns = allMonths.map(m => ({
    label: m,
    value: Number(((monthlyRetsRec[m] ?? 0) * 100).toFixed(2)),
  }));

  // Compute metrics (monthly annualization: sqrt(12))
  const mDec = allMonths.map(m => monthlyRetsRec[m] ?? 0);
  const n = mDec.length;
  const totalReturn = equity - 100;
  const cagrPct = n > 0 ? (Math.pow(equity / 100, 12 / n) - 1) * 100 : 0;
  const meanM = n > 0 ? mDec.reduce((s, r) => s + r, 0) / n : 0;
  const varM = n > 1 ? mDec.reduce((s, r) => s + (r - meanM) ** 2, 0) / (n - 1) : 0;
  const stdM = Math.sqrt(varM);
  const annualizedVolatilityPct = stdM * Math.sqrt(12) * 100;
  const sharpe = stdM > 0 ? (meanM / stdM) * Math.sqrt(12) : 0;
  const downRets = mDec.filter(r => r < 0);
  const downVar = downRets.length > 0 ? downRets.reduce((s, r) => s + r * r, 0) / downRets.length : 0;
  const sortino = downVar > 0 ? (meanM / Math.sqrt(downVar)) * Math.sqrt(12) : null;
  const maxDrawdownPct = Math.min(...drawdownSeries.map(p => p.value), 0);
  const calmar = maxDrawdownPct < 0 ? cagrPct / Math.abs(maxDrawdownPct) : null;
  const positiveMonthsPct = n > 0 ? (mDec.filter(r => r > 0).length / n) * 100 : null;
  const worstYearPct = annualReturns.length ? Math.min(...annualReturns.map(a => a.value)) : null;

  const metrics: Record<string, number | string> = {
    totalReturnPct: totalReturn,
    cagrPct,
    maxDrawdownPct,
    annualizedVolatilityPct,
    sharpe,
    sortino: sortino ?? "n/a",
    calmar: calmar ?? "n/a",
    positiveMonthsPct: positiveMonthsPct ?? "n/a",
    worstYearPct: worstYearPct ?? "n/a",
    correlationToSpy: "n/a",
    betaToSpy: "n/a",
    tradeCount: "OOS 2019+",
    dataPoints: n,
  };

  return { ...baseDataset, performanceSeries, drawdownSeries, annualReturns, monthlyReturns, metrics };
}

function computeBenchmarkExtended(series: AnalyticsSeriesPoint[]) {
  if (series.length < 10) return null;
  const dailyReturns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const p = 1 + series[i - 1]!.value / 100;
    const c = 1 + series[i]!.value / 100;
    if (p > 0) dailyReturns.push(c / p - 1);
  }
  const n = dailyReturns.length;
  if (n < 5) return null;
  const mean = dailyReturns.reduce((s, r) => s + r, 0) / n;
  const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const vol = Math.sqrt(variance * 252) * 100;
  const cagr = computeBenchmarkCagr(series);
  const cagrDec = (cagr ?? 0) / 100;
  const sharpe = vol > 0 ? cagrDec / (vol / 100) : null;
  const downReturns = dailyReturns.filter(r => r < 0);
  const downVarSq = downReturns.length > 1 ? downReturns.reduce((s, r) => s + r * r, 0) / downReturns.length : 0;
  const downVol = downVarSq > 0 ? Math.sqrt(downVarSq * 252) : null;
  const sortino = downVol && downVol > 0 ? cagrDec / downVol : null;
  const maxDD = computeBenchmarkMaxDD(series);
  const calmar = maxDD !== null && maxDD < 0 ? cagrDec / Math.abs(maxDD / 100) : null;
  const monthGroups = new Map<string, number[]>();
  for (let i = 1; i < series.length; i++) {
    const mth = series[i]!.date.slice(0, 7);
    const p = 1 + series[i - 1]!.value / 100;
    const c = 1 + series[i]!.value / 100;
    if (p > 0) { if (!monthGroups.has(mth)) monthGroups.set(mth, []); monthGroups.get(mth)!.push(c / p - 1); }
  }
  const monthlyReturns = [...monthGroups.values()].map(rs => rs.reduce((s, r) => s * (1 + r), 1) - 1);
  const posMonths = monthlyReturns.length > 0 ? (monthlyReturns.filter(r => r > 0).length / monthlyReturns.length) * 100 : null;
  return { vol, sharpe, sortino, calmar, posMonths };
}

const START_FILTERS: StartFilter[] = ["Max", "2008", "2015", "5Y", "3Y", "1Y", "YTD"];
const GROUP_ORDER = ["Intraday", "Agrar", "Metalle", "Energy", "Indizes", "Aktien", "Forex", "Anomalien", "Invest"] as const;
const GROUP_LINE_COLORS: Record<string, string> = {
  // White Swan strategy groups
  Intraday: "#f3f4f6",
  Agrar: "#d7dbe3",
  Metalle: "#c9ccd3",
  Energy: "#bbbec8",
  Indizes: "#aeb2bc",
  Aktien: "#9ea3af",
  Forex: "#8f96a4",
  Anomalien: "#7f8696",
  Invest: "#e8eaef",
  SPMO: "#b0b5be",
  WHITE_SWAN_NAS_EMA: "#e8d89a",
  // Core Invest sleeve groups
  "Core Gross": "#C9A84C",
  ETF_FACTOR: "#d4d8e0",
  DEFENSIVE: "#b8c2d0",
  MANAGED_FUTURES: "#a0aab8",
  // Core Invest ETF assets — stable white/grey/gold palette
  SPY:  "#f0f0f2",
  QQQ:  "#dcdfe6",
  RSP:  "#c8cdd8",
  IWM:  "#b4baca",
  EFA:  "#a0a8bc",
  EEM:  "#8c96ae",
  QUAL: "#e8d48a",
  MTUM: "#d8c478",
  VLUE: "#c8b468",
  USMV: "#b8a458",
  GLD:  "#f0dc80",
  IEF:  "#98a8c0",
  BIL:  "#889ab2",
  benchmark: "#d8c071",
};

function formatPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatPercentNoPlus(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(digits)}%`;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
}

function formatCount(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "n/a";
  return String(value);
}

function parseMetricNumber(value: number | string | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function filterSeries(series: AnalyticsSeriesPoint[], startFilter: StartFilter) {
  if (startFilter === "Max" || !series.length) return series;
  if (startFilter === "2008") return series.filter((p) => p.date >= "2008-01-01");
  if (startFilter === "2015") return series.filter((p) => p.date >= "2015-01-01");
  const lastDate = new Date(`${series.at(-1)!.date}T00:00:00Z`);
  let startBoundary = new Date(lastDate);
  if (startFilter === "YTD") {
    startBoundary = new Date(Date.UTC(lastDate.getUTCFullYear(), 0, 1));
  } else if (startFilter === "1Y") {
    startBoundary.setUTCFullYear(startBoundary.getUTCFullYear() - 1);
  } else if (startFilter === "3Y") {
    startBoundary.setUTCFullYear(startBoundary.getUTCFullYear() - 3);
  } else if (startFilter === "5Y") {
    startBoundary.setUTCFullYear(startBoundary.getUTCFullYear() - 5);
  }
  const startKey = startBoundary.toISOString().slice(0, 10);
  return series.filter((point) => point.date >= startKey || point.date.slice(0, 7) >= startKey.slice(0, 7));
}

function downsampleSeries(series: AnalyticsSeriesPoint[], maxPoints = 420) {
  if (series.length <= maxPoints) return series;
  const step = Math.ceil(series.length / maxPoints);
  return series.filter((_, index) => index % step === 0 || index === series.length - 1);
}

// Rebase a cumulative-% series so its first point is 0% and every later point is
// measured relative to it. Without this, clicking a year filter (1Y/3Y/YTD/2015…)
// leaves the curve at its absolute inception-to-date value — e.g. "1Y" would start
// the line at +50% instead of 0%, which reads as a wrong/misleading chart. A series
// value v means equity ratio (1 + v/100); rebasing to the new first point v0 gives
// ((1 + v/100) / (1 + v0/100) - 1) * 100.
function rebaseSeries(series: AnalyticsSeriesPoint[]): AnalyticsSeriesPoint[] {
  if (series.length < 2) return series;
  const v0 = series[0]!.value;
  const base = 1 + v0 / 100;
  if (!Number.isFinite(base) || base === 0) return series;
  return series.map((point) => ({
    ...point,
    value: Number((((1 + point.value / 100) / base - 1) * 100).toFixed(2)),
  }));
}

function computeDrawdown(series: AnalyticsSeriesPoint[]) {
  let peak = -Infinity;
  return series.map((point) => {
    const equity = 1 + point.value / 100;
    peak = Math.max(peak, equity);
    return {
      date: point.date,
      value: Number((((equity / peak) - 1) * 100).toFixed(2)),
    };
  });
}

function aggregateGroupSeries(groupSeries: Record<string, AnalyticsSeriesPoint[]>, activeGroups: string[]) {
  const selected = activeGroups.filter((group) => groupSeries[group]?.length);
  if (!selected.length) return [];

  const rows = new Map<string, Record<string, number>>();
  const lastValues = new Map<string, number>();

  for (const group of selected) {
    for (const point of groupSeries[group]) {
      const row = rows.get(point.date) ?? {};
      row[group] = point.value;
      rows.set(point.date, row);
    }
  }

  return [...rows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => {
      const visible: number[] = [];
      for (const group of selected) {
        const next = values[group];
        if (next !== undefined) lastValues.set(group, next);
        const current = lastValues.get(group);
        if (current !== undefined) visible.push(current);
      }
      if (!visible.length) return null;
      return {
        date,
        value: Number((visible.reduce((sum, current) => sum + current, 0) / visible.length).toFixed(2)),
      };
    })
    .filter((point): point is AnalyticsSeriesPoint => point !== null);
}

function formatAxisDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#12131a]/95 px-3 py-2 text-[11px] shadow-xl [font-family:var(--font-text),sans-serif]">
      <p className="mb-1 text-zinc-500">{String(label ?? "")}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {Number(entry.value) >= 0 ? "+" : ""}
          {Number(entry.value).toFixed(2)}%
        </p>
      ))}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border bg-[#0d0f12] shadow-[0_18px_45px_rgba(0,0,0,0.30)]",
        className,
      )}
      style={{ borderColor: "rgba(255,255,255,0.07)" }}
    >
      {children}
    </div>
  );
}

function CardHeader({
  title,
  right,
  subtitle,
  bordered = true,
}: {
  title: string;
  right?: React.ReactNode;
  subtitle?: string;
  bordered?: boolean;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 py-3", bordered && "border-b border-white/[0.06]")}>
      <div>
        <p className="text-[12px] font-medium tracking-[0.04em] text-[#8d8f98] [font-family:var(--font-text),sans-serif]">{title}</p>
        {subtitle ? <p className="mt-1 text-[10px] text-zinc-500 [font-family:var(--font-text),sans-serif]">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-zinc-500 [font-family:var(--font-text),sans-serif]">
      {message}
    </div>
  );
}

function PillButton({
  active,
  disabled,
  children,
  onClick,
  compact = false,
}: {
  active: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border [font-family:var(--font-text),sans-serif] transition-colors",
        compact ? "px-2 py-0.5 text-[9px]" : "px-3 py-1 text-[10px]",
        active
          ? "border-white/40 bg-white/[0.06] text-white"
          : "border-white/[0.08] bg-transparent text-zinc-500 hover:border-white/[0.14] hover:text-zinc-300",
        disabled && "cursor-not-allowed opacity-35 hover:border-white/[0.08] hover:text-zinc-500",
      )}
    >
      {children}
    </button>
  );
}

function buildKpiCards(
  dataset: AnalyticsDataset,
  lineMode: LineMode,
  benchmarkSeries: AnalyticsSeriesPoint[],
  capalifeData: CapalifeData,
): KpiCard[] {
  const inBenchmark = lineMode === "benchmark";
  const bTotal = inBenchmark ? computeBenchmarkTotalReturn(benchmarkSeries) : null;
  const bMaxDD = inBenchmark ? computeBenchmarkMaxDD(benchmarkSeries) : null;
  const bCagr = inBenchmark ? computeBenchmarkCagr(benchmarkSeries) : null;

  function deltaCard(
    label: string,
    value: string,
    portfolioVal: number | null,
    benchmarkVal: number | null,
    higherIsBetter = true,
    fmt: "pct" | "ratio" = "pct",
  ): KpiCard {
    if (!inBenchmark || portfolioVal === null || benchmarkVal === null) return { label, value };
    const diff = portfolioVal - benchmarkVal;
    const gold = higherIsBetter ? diff > 0 : diff < 0;
    const sign = diff > 0 ? "+" : "";
    const delta = fmt === "ratio" ? `${sign}${diff.toFixed(2)}` : `${sign}${diff.toFixed(1)}%`;
    return { label, value, delta, deltaGold: gold };
  }

  if (dataset.tab === "invest" && dataset.mode === "backtest") {
    const pTotal = parseMetricNumber(dataset.metrics.totalReturnPct);
    const pCagr = parseMetricNumber(dataset.metrics.cagrPct);
    const pMaxDD = parseMetricNumber(dataset.metrics.maxDrawdownPct);
    const pVol = parseMetricNumber(dataset.metrics.annualizedVolatilityPct);
    const pSharpe = parseMetricNumber(dataset.metrics.sharpe);
    const pSortino = parseMetricNumber(dataset.metrics.sortino);
    const pCalmar = parseMetricNumber(dataset.metrics.calmar);
    const pPosM = parseMetricNumber(dataset.metrics.positiveMonthsPct);
    const bExt = inBenchmark ? computeBenchmarkExtended(benchmarkSeries) : null;
    return [
      deltaCard("Total Return", formatPercent(pTotal), pTotal, bTotal),
      deltaCard("CAGR", formatPercent(pCagr), pCagr, bCagr),
      deltaCard("Max Drawdown", formatPercent(pMaxDD), pMaxDD, bMaxDD, true),
      deltaCard("Volatility", formatPercentNoPlus(pVol), pVol, bExt?.vol ?? null, false),
      deltaCard("Sharpe", formatNumber(pSharpe), pSharpe, bExt?.sharpe ?? null, true, "ratio"),
      deltaCard("Sortino", formatNumber(pSortino), pSortino, bExt?.sortino ?? null, true, "ratio"),
      deltaCard("Calmar", formatNumber(pCalmar, 1), pCalmar, bExt?.calmar ?? null, true, "ratio"),
      deltaCard("Pos. Months", formatPercentNoPlus(pPosM), pPosM, bExt?.posMonths ?? null),
      { label: "Corr. to SPY", value: formatNumber(parseMetricNumber(dataset.metrics.correlationToSpy)) },
      { label: "Beta to SPY", value: formatNumber(parseMetricNumber(dataset.metrics.betaToSpy)) },
      { label: "Worst Year", value: formatPercent(parseMetricNumber(dataset.metrics.worstYearPct)) },
      { label: "Data / Trades", value: `${formatCount(dataset.metrics.dataPoints)} / ${formatCount(dataset.metrics.tradeCount)}` },
    ];
  }

  if (dataset.tab === "invest" && dataset.mode === "live") {
    const isShadowLive = dataset.metrics.dataStatus === "SHADOW_LIVE";
    const pTotal = parseMetricNumber(dataset.metrics.totalReturnPct);
    const pCagr = parseMetricNumber(dataset.metrics.cagrPct);
    const pMaxDD = parseMetricNumber(dataset.metrics.maxDrawdownPct);
    const pVol = parseMetricNumber(dataset.metrics.annualizedVolatilityPct);
    const pSharpe = parseMetricNumber(dataset.metrics.sharpe);
    const pSortino = parseMetricNumber(dataset.metrics.sortino);
    const pCalmar = parseMetricNumber(dataset.metrics.calmar);
    const pPosM = parseMetricNumber(dataset.metrics.positiveMonthsPct);
    const bExt = inBenchmark ? computeBenchmarkExtended(benchmarkSeries) : null;
    if (isShadowLive) {
      // Shadow live: forward KPIs as pending, context backtest KPIs labeled as Context
      return [
        { label: "Forward Return", value: "pending" },
        { label: "Forward CAGR", value: "pending" },
        { label: "Forward Max DD", value: "pending" },
        { label: "Forward Volatility", value: "pending" },
        { label: "Forward Sharpe", value: "pending" },
        { label: "Forward Days", value: "0" },
        { label: "Context CAGR", value: formatPercent(pCagr), delta: "backtest", deltaNeutral: true },
        { label: "Context Max DD", value: formatPercent(pMaxDD), delta: "backtest", deltaNeutral: true },
        { label: "Context Sharpe", value: formatNumber(pSharpe), delta: "backtest", deltaNeutral: true },
        { label: "Context Corr.", value: formatNumber(parseMetricNumber(dataset.metrics.correlationToSpy)) },
        { label: "Broker", value: String(dataset.metrics.brokerStatus ?? "OFFLINE") },
        { label: "Forward Start", value: String(dataset.metrics.shadowForwardStart ?? "Waiting for Market Data") },
        { label: "Active Assets", value: String(dataset.metrics.activeAssets ?? "n/a") },
        { label: "Market Data", value: String(dataset.metrics.latestMarketData ?? "n/a") },
        { label: "Latest Signal", value: String(dataset.metrics.latestSignal ?? "n/a") },
      ];
    }
    return [
      deltaCard("Total Return", formatPercent(pTotal), pTotal, bTotal),
      deltaCard("CAGR", formatPercent(pCagr), pCagr, bCagr),
      deltaCard("Max Drawdown", formatPercent(pMaxDD), pMaxDD, bMaxDD, true),
      deltaCard("Volatility", formatPercentNoPlus(pVol), pVol, bExt?.vol ?? null, false),
      deltaCard("Sharpe", formatNumber(pSharpe), pSharpe, bExt?.sharpe ?? null, true, "ratio"),
      deltaCard("Sortino", formatNumber(pSortino), pSortino, bExt?.sortino ?? null, true, "ratio"),
      deltaCard("Calmar", formatNumber(pCalmar, 1), pCalmar, bExt?.calmar ?? null, true, "ratio"),
      { label: "QQQ Signal", value: formatCount(dataset.metrics.currentSignal) },
      { label: "Assets OK", value: formatCount(dataset.metrics.assetsOk) },
      deltaCard("Pos. Months", formatPercentNoPlus(pPosM), pPosM, bExt?.posMonths ?? null),
      { label: "Market Data", value: formatCount(dataset.metrics.marketDataStatus) },
      { label: "Data / Trades", value: `${formatCount(dataset.metrics.dataPoints)} / ${formatCount(dataset.metrics.tradeCount)}` },
    ];
  }

  if (dataset.mode === "backtest" && dataset.tab === "whiteSwan") {
    const pTotal = parseMetricNumber(dataset.metrics.totalReturnPct);
    const pCagr = parseMetricNumber(dataset.metrics.cagrPct);
    const pMaxDD = parseMetricNumber(dataset.metrics.maxDrawdownPct);
    const pVol = parseMetricNumber(dataset.metrics.annualizedVolatilityPct);
    const pSharpe = parseMetricNumber(dataset.metrics.sharpe);
    const pSortino = parseMetricNumber(dataset.metrics.sortino);
    const pCalmar = parseMetricNumber(dataset.metrics.calmar);
    const pPosM = parseMetricNumber(dataset.metrics.positiveMonthsPct);
    const bExt = inBenchmark ? computeBenchmarkExtended(benchmarkSeries) : null;
    return [
      deltaCard("Total Return", formatPercent(pTotal), pTotal, bTotal),
      deltaCard("CAGR", formatPercent(pCagr), pCagr, bCagr),
      deltaCard("Max Drawdown", formatPercent(pMaxDD), pMaxDD, bMaxDD, true),
      deltaCard("Volatility", formatPercentNoPlus(pVol), pVol, bExt?.vol ?? null, false),
      deltaCard("Sharpe", formatNumber(pSharpe), pSharpe, bExt?.sharpe ?? null, true, "ratio"),
      deltaCard("Sortino", formatNumber(pSortino), pSortino, bExt?.sortino ?? null, true, "ratio"),
      deltaCard("Calmar", formatNumber(pCalmar, 1), pCalmar, bExt?.calmar ?? null, true, "ratio"),
      deltaCard("Pos. Months", formatPercentNoPlus(pPosM), pPosM, bExt?.posMonths ?? null),
      { label: "Corr. to SPY", value: formatNumber(parseMetricNumber(dataset.metrics.correlationToSpy)) },
      { label: "Beta to SPY", value: formatNumber(parseMetricNumber(dataset.metrics.betaToSpy)) },
      { label: "Worst Year", value: formatPercent(parseMetricNumber(dataset.metrics.worstYearPct)) },
      { label: "Data / Trades", value: `${formatCount(dataset.metrics.dataPoints)} / ${formatCount(dataset.metrics.tradeCount)}` },
    ];
  }

  if (dataset.mode === "live" && dataset.tab === "whiteSwan") {
    const official = capalifeData.whiteSwanCombinedEvidence.official_kpis;
    return [
      { label: "Total Return", value: formatPercent(official.combined_return_pct, 1) },
      { label: "Compounded", value: formatPercent(official.compounded_return_pct, 1) },
      { label: "Max Drawdown", value: formatPercent(official.max_drawdown_pct, 2) },
      { label: "Annualized", value: formatPercent(official.annualized_return_pct, 1) },
      { label: "Sharpe", value: formatNumber(official.sharpe, 2) },
      { label: "Calmar", value: formatNumber(official.calmar, 1) },
      { label: "Profit Factor", value: formatNumber(official.profit_factor, 2) },
      { label: "Account 1", value: formatPercent(official.account1_return_pct, 2) },
      { label: "Account 2", value: formatPercent(official.account2_return_pct, 2) },
      { label: "Pos. Months", value: "18 / 26" },
      { label: "Assets", value: formatCount(official.assets) },
      { label: "Sleeves", value: formatCount(official.sleeves) },
    ];
  }

  if (dataset.tab === "combined") {
    const pTotal = parseMetricNumber(dataset.metrics.totalReturnPct);
    const pCagr = parseMetricNumber(dataset.metrics.cagrPct);
    const pMaxDD = parseMetricNumber(dataset.metrics.maxDrawdownPct);
    const pSharpe = parseMetricNumber(dataset.metrics.sharpe);
    const pCalmar = parseMetricNumber(dataset.metrics.calmar);
    const pPosM = parseMetricNumber(dataset.metrics.positiveMonthsPct);
    const bExt = inBenchmark ? computeBenchmarkExtended(benchmarkSeries) : null;
    const wsG = dataset.groups.find(g => g.id === "White Swan");
    const ciG = dataset.groups.find(g => g.id === "Core Invest");
    return [
      deltaCard("Total Return", formatPercent(pTotal), pTotal, bTotal),
      deltaCard("CAGR", formatPercent(pCagr), pCagr, bCagr),
      deltaCard("Max Drawdown", formatPercent(pMaxDD), pMaxDD, bMaxDD, true),
      deltaCard("Sharpe", formatNumber(pSharpe), pSharpe, bExt?.sharpe ?? null, true, "ratio"),
      deltaCard("Calmar", formatNumber(pCalmar, 1), pCalmar, bExt?.calmar ?? null, true, "ratio"),
      deltaCard("Pos. Months", formatPercentNoPlus(pPosM), pPosM, bExt?.posMonths ?? null),
      { label: "White Swan", value: wsG ? `${Math.round((wsG.weight ?? 0) * 100)}%` : "50%", delta: "F+10%" },
      { label: "Core Invest", value: ciG ? `${Math.round((ciG.weight ?? 0) * 100)}%` : "50%", delta: "v2.0" },
      { label: "Zeitraum", value: dataset.period.start && dataset.period.end ? `${dataset.period.start.slice(0, 4)}–${dataset.period.end.slice(0, 4)}` : "n/a" },
      { label: "Data Points", value: formatCount(dataset.metrics.dataPoints) },
      { label: "Source", value: "WS Backtest + CI v2.0" },
      { label: "Status", value: "Research Preview" },
    ];
  }

  const metrics = dataset.metrics;
  const entryCount = dataset.groups.reduce((sum, group) => sum + (group.assets ?? 0), 0);
  const baseCards: KpiCard[] = dataset.mode === "backtest"
    ? [
        { label: "CAGR", value: formatPercent(parseMetricNumber(metrics.cagrPct)) },
        { label: "Total Return", value: formatPercent(parseMetricNumber(metrics.totalReturnPct)) },
        { label: "Max Drawdown", value: formatPercent(parseMetricNumber(metrics.maxDrawdownPct)) },
        { label: "Sharpe", value: formatNumber(parseMetricNumber(metrics.sharpe)) },
        { label: "Calmar", value: formatNumber(parseMetricNumber(metrics.calmar), 1) },
        { label: "Profit Factor", value: formatNumber(parseMetricNumber(metrics.profitFactor)) },
        { label: "Trades", value: formatCount(metrics.tradeCount) },
        { label: "Data Points", value: formatCount(metrics.dataPoints ?? dataset.performanceSeries.length) },
        { label: "Sleeves", value: formatCount(metrics.strategyCount ?? dataset.groups.length) },
        { label: "Entries", value: formatCount(entryCount) },
        { label: "Zeitraum", value: dataset.period.start && dataset.period.end ? `${dataset.period.start.slice(0, 4)}-${dataset.period.end.slice(0, 4)}` : "n/a" },
        { label: "Status", value: "Internal" },
      ]
    : [
        { label: "Status", value: formatCount(metrics.status) },
        { label: "Reason", value: formatCount(metrics.reason) },
        { label: "Source", value: "n/a" },
        { label: "Period", value: "n/a" },
        { label: "Assets", value: formatCount(dataset.groups.reduce((sum, group) => sum + (group.assets ?? 0), 0) || "n/a") },
        { label: "Strategies", value: formatCount(dataset.groups.reduce((sum, group) => sum + (group.strategies ?? 0), 0) || "n/a") },
        { label: "Series", value: formatCount(dataset.performanceSeries.length || "n/a") },
        { label: "Drawdown", value: formatCount(dataset.drawdownSeries.length || "n/a") },
        { label: "Benchmark", value: dataset.benchmarkSeries.length ? "available" : "n/a" },
        { label: "Mode", value: "No live source" },
        { label: "Review", value: "pending" },
        { label: "Audit", value: "n/a" },
      ];

  return baseCards.map((card) => ({
    ...card,
    value:
      card.value.length > 20 &&
      !["Reason", "Data Coverage", "Market Data", "QQQ Invest Pine Return", "Portfolio Return", "Live Status"].includes(card.label)
        ? `${card.value.slice(0, 20)}...`
        : card.value,
  }));
}

function buildOverviewRows(dataset: AnalyticsDataset): Array<[string, string]> {
  if (dataset.tab === "invest" && dataset.mode === "live") {
    const m = dataset.metrics;
    const status = String(m.dataStatus ?? "SHADOW_LIVE");
    return [
      ["Status", status],
      ["Strategy", String(m.portfolioName ?? "Core Invest Active Alpha 2")],
      ["Version", String(m.strategyVersion ?? "v2.0-demo-audit")],
      ["Period", String(m.period ?? dataset.period.start ? `${dataset.period.start} – ${dataset.period.end}` : "n/a")],
      ["Start NAV", String(m.startCapital ?? "n/a")],
      ["Gross Exposure", String(m.grossLongExposure ?? "n/a")],
      ["Exposure Cap", String(m.longExposureCap ?? "n/a")],
      ["Fee Model", String(m.feeModel ?? "n/a")],
      ["Gates", m.gatesTotal ? `${String(m.gatesPassed)} PASS · ${String(m.gatesFailed)} FAIL / ${String(m.gatesTotal)}` : "n/a"],
      ["Broker", String(m.brokerStatus ?? "OFFLINE")],
      ["Execution", String(m.executionStatus ?? "none")],
      ["Mode", String(m.mode ?? "no live trading")],
    ];
  }

  if (dataset.tab === "invest" && dataset.mode === "backtest") {
    const m = dataset.metrics;
    const status = String(m.dataStatus ?? "REFERENCE_BACKTEST");
    const isScenario = status === "SCENARIO";
    const runId = m.runId ? String(m.runId) : null;
    return [
      ["Status", isScenario && runId ? `SCENARIO · ${runId}` : status],
      ["Strategy", String(m.portfolioName ?? "Core Invest Active Alpha 2")],
      ["Version", String(m.strategyVersion ?? "v2.0-demo-audit")],
      ["Period", String(m.period ?? (dataset.period.start ? `${dataset.period.start} – ${dataset.period.end}` : "n/a"))],
      ["Start NAV", String(m.startCapital ?? "n/a")],
      ["Gross Exposure", String(m.grossLongExposure ?? "n/a")],
      ["Exposure Cap", String(m.longExposureCap ?? "n/a")],
      ["Fee Model", String(m.feeModel ?? "n/a")],
      ["SPY CAGR", m.spyCagrPct !== undefined ? formatPercent(parseMetricNumber(m.spyCagrPct)) : "n/a"],
      ["Rolling 5Y", String(m.rolling5yOutperformance ?? "n/a")],
      ["Rolling 10Y", String(m.rolling10yOutperformance ?? "n/a")],
      ["Gates", m.gatesTotal ? `${String(m.gatesPassed)} PASS · ${String(m.gatesFailed)} FAIL / ${String(m.gatesTotal)}` : "n/a"],
      ["Mode", String(m.mode ?? "no live trading")],
    ];
  }

  if (dataset.mode === "live" && dataset.tab === "whiteSwan") {
    return [
      ["Portfolio", "White Swan"],
      ["Datenbasis", "Performance Report"],
      ["Zeitraum", "11.04.2024 - 01.07.2026"],
      ["Account 1", "+73.19%"],
      ["Account 2", "+23.96%"],
      ["Combined", "+97.2%"],
      ["Audit", "statement-based, not independently audited"],
      ["AuM", "EUR0 / no live portfolio"],
    ];
  }

  if (dataset.tab === "combined") {
    const wsG = dataset.groups.find(g => g.id === "White Swan");
    const ciG = dataset.groups.find(g => g.id === "Core Invest");
    const wsW = wsG ? Math.round((wsG.weight ?? 0.5) * 100) : 50;
    const ciW = ciG ? Math.round((ciG.weight ?? 0.5) * 100) : 50;
    const pCagr = parseMetricNumber(dataset.metrics.cagrPct);
    const pMaxDD = parseMetricNumber(dataset.metrics.maxDrawdownPct);
    const pSharpe = parseMetricNumber(dataset.metrics.sharpe);
    const pCalmar = parseMetricNumber(dataset.metrics.calmar);
    return [
      ["Portfolio", "Combined · WS + Core Invest"],
      ["White Swan", `${wsW}% (F+10%)`],
      ["Core Invest", `${ciW}% (v2.0)`],
      ["__sep__", ""],
      ["CAGR", formatPercent(pCagr)],
      ["Max DD", formatPercent(pMaxDD)],
      ["Sharpe", formatNumber(pSharpe)],
      ["Calmar", formatNumber(pCalmar, 1)],
      ["__sep__", ""],
      ["Zeitraum", dataset.period.start && dataset.period.end ? `${dataset.period.start.slice(0, 7)} – ${dataset.period.end.slice(0, 7)}` : "n/a"],
      ["Benchmark", "SPY (gestrichelt)"],
      ["Status", "Research Preview · not live"],
    ];
  }

  if (dataset.mode === "backtest" && dataset.tab === "whiteSwan") {
    return [
      ["Portfolio", "White Swan"],
      ["Auswahl", "7 Komponentengruppen"],
      ["GC1 Friday Long", "13.86%"],
      ["GLD Thursday Long", "13.86%"],
      ["YM1 TAT", "13.86%"],
      ["UKX Valuation", "13.86%"],
      ["CT1 Macro A", "7.56%"],
      ["NQ1 Trend LO", "7.00%"],
      ["Intraday-Komponenten", "30.00%"],
      ["__sep__", ""],
      ["OOS ab", "2019-01-01"],
      ["Status", "PAPER_ONLY · Frozen 2026-07-20"],
    ];
  }

  if (dataset.mode === "backtest") {
    return [
      ["Registry", "final_production_sleeves.json v2"],
      ["Sleeves", formatCount(dataset.metrics.strategyCount ?? dataset.groups.length)],
      ["Entries", formatCount(dataset.groups.reduce((sum, group) => sum + (group.assets ?? 0), 0))],
      ["Zeitraum", `${dataset.period.start ?? "n/a"} - ${dataset.period.end ?? "n/a"}`],
      ["Gewichte", "open"],
      ["Status", "internal OOS/backtest"],
      ["Source", dataset.sourceLabel],
      ["Track Record", "not external track record"],
    ];
  }

  return [
    ["Portfolio", dataset.title],
    ["Datenbasis", "No live source found"],
    ["Zeitraum", "n/a"],
    ["Status", "live not available"],
    ["Audit", "n/a"],
    ["AuM", "EUR0 / no live portfolio"],
  ];
}

function buildControlGroups(dataset: AnalyticsDataset) {
  const available = new Set(dataset.groups.map((group) => group.id));
  return GROUP_ORDER.map((label) => {
    const id = String(label);
    const fallback = dataset.groups.find((group) => group.label === id);
    const key = available.has(id) ? id : fallback?.id;
    const hasSeries = key ? Boolean(dataset.groupSeries[key]?.length) : false;
    return {
      id: key ?? id,
      label: id,
      disabled: !key || !hasSeries,
    };
  });
}

function TopTabs({
  tab,
  mode,
  onTabChange,
  onModeChange,
}: {
  tab: AnalyticsTab;
  mode: AnalyticsMode;
  onTabChange: (tab: AnalyticsTab) => void;
  onModeChange: (mode: AnalyticsMode) => void;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        {([
          { id: "whiteSwan", label: "White Swan" },
          { id: "invest", label: "Core Invest" },
          { id: "combined", label: "Combined" },
        ] as Array<{ id: AnalyticsTab; label: string }>).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors [font-family:var(--font-text),sans-serif]",
              tab === item.id
                ? "border-white/40 bg-white/[0.06] text-white"
                : "border-transparent text-zinc-500 hover:border-white/[0.08] hover:text-zinc-300",
            )}
          >
            {item.id === "whiteSwan" ? (
              <SwanIcon size={14} />
            ) : item.id === "invest" ? (
              <TrendingUp size={14} strokeWidth={1.8} />
            ) : (
              <Layers size={14} strokeWidth={1.8} />
            )}
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
{(["live", "backtest"] as AnalyticsMode[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onModeChange(item)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.08em] [font-family:var(--font-text),sans-serif]",
              mode === item
                ? "border-white/40 bg-white/[0.06] text-white"
                : "border-white/[0.08] text-zinc-500 hover:border-white/[0.14] hover:text-zinc-300",
            )}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function Sp500Icon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="S&P 500">
      <rect width="14" height="14" rx="3" fill="#1a1d21" />
      <text x="7" y="10.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#d8c071" fontFamily="sans-serif">SP</text>
    </svg>
  );
}

function PerformanceLegend({
  dataset,
  lineMode,
  visibleGroups,
  allAssetGroups,
  primaryAsset,
  onPrimaryAsset,
  onToggleGroup,
  onSelectAll,
  onClear,
}: {
  dataset: AnalyticsDataset;
  lineMode: LineMode;
  visibleGroups: string[];
  allAssetGroups: string[];
  primaryAsset: string | null;
  onPrimaryAsset: (id: string) => void;
  onToggleGroup: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  if (lineMode === "assets") {
    return (
      <div className="flex flex-col gap-1 px-4 pb-2 text-[10px] text-zinc-400 [font-family:var(--font-text),sans-serif]">
        <div className="flex items-center gap-2 mb-0.5">
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded px-2 py-0.5 border border-white/10 hover:border-white/20 hover:text-zinc-200 transition-colors"
          >
            All
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded px-2 py-0.5 border border-white/10 hover:border-white/20 hover:text-zinc-200 transition-colors"
          >
            Clear
          </button>
          <span className="text-zinc-600 text-[9px]">★ = primary (KPIs / Drawdown / Annual)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {allAssetGroups.map((group) => {
            const label = dataset.groups.find((item) => item.id === group)?.label ?? group;
            const color = GROUP_LINE_COLORS[group] ?? "#a1a1aa";
            const isPrimary = primaryAsset === group;
            const isVisible = visibleGroups.includes(group);
            return (
              <span key={group} className="flex items-center">
                <button
                  type="button"
                  onClick={() => isVisible ? onPrimaryAsset(group) : onToggleGroup(group)}
                  title={isVisible ? (isPrimary ? "Primary (click to deselect primary)" : "Set as primary") : "Click to select"}
                  className={cn(
                    "flex items-center gap-1.5 rounded-l-full border px-2 py-0.5 transition-colors",
                    isVisible
                      ? isPrimary
                        ? "border-white/20 bg-white/[0.06] text-white border-r-0"
                        : "border-white/10 text-zinc-300 border-r-0"
                      : "border-transparent rounded-full text-zinc-600 opacity-40",
                  )}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: isVisible ? color : "#555" }} />
                  <span>{label}</span>
                  {isPrimary && <span className="text-[9px] text-[#d8c071]">★</span>}
                </button>
                {isVisible && (
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group)}
                    title="Deselect"
                    className="rounded-r-full border border-l-0 border-white/10 px-1.5 py-0.5 text-[9px] text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  if (lineMode === "benchmark") {
    const ciLabel = dataset.tab === "invest" ? "Core Invest" : "Portfolio";
    return (
      <div className="flex flex-wrap gap-4 px-4 pb-2 text-[10px] text-zinc-400 [font-family:var(--font-text),sans-serif]">
        <div className="flex items-center gap-2">
          <Image src="/CAPITALIFE_ICON.png" alt="Capitalife" width={14} height={14} className="rounded-sm opacity-90" />
          <span style={{ color: "#f3f4f6" }}>{ciLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Sp500Icon size={14} />
          <span style={{ color: GROUP_LINE_COLORS.benchmark }}>S&amp;P 500</span>
        </div>
      </div>
    );
  }

  return null;
}

type PeriodMode = "own" | "common";

function PerformanceCard({
  dataset,
  startFilter,
  lineMode,
  benchmarkEnabled,
  activeGroups,
  compounded,
  primaryAsset,
  periodMode,
  onStartFilter,
  onLineMode,
  onCompounded,
  onPrimaryAsset,
  onToggleGroup,
  onSelectAll,
  onClear,
  onPeriodMode,
}: {
  dataset: AnalyticsDataset;
  startFilter: StartFilter;
  lineMode: LineMode;
  benchmarkEnabled: boolean;
  activeGroups: string[];
  compounded: boolean;
  primaryAsset: string | null;
  periodMode: PeriodMode;
  onStartFilter: (filter: StartFilter) => void;
  onLineMode: (mode: LineMode) => void;
  onCompounded: (v: boolean) => void;
  onPrimaryAsset: (id: string) => void;
  onToggleGroup: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onPeriodMode: (m: PeriodMode) => void;
}) {
  const baseSeries =
    lineMode === "assets" && Object.keys(dataset.groupSeries).length
      ? aggregateGroupSeries(dataset.groupSeries, activeGroups)
      : dataset.performanceSeries;

  const rawPerformanceSeries = rebaseSeries(downsampleSeries(filterSeries(baseSeries, startFilter)));
  const rawBenchmarkSeries = rebaseSeries(downsampleSeries(filterSeries(dataset.benchmarkSeries, startFilter)));
  const performanceSeries = compounded ? rawPerformanceSeries : toNonCompounded(rawPerformanceSeries);
  const benchmarkSeries = compounded ? rawBenchmarkSeries : toNonCompounded(rawBenchmarkSeries);
  const visibleGroups = activeGroups.filter((group) => dataset.groupSeries[group]?.length);
  const allAssetGroups = dataset.groups.filter((g) => dataset.groupSeries[g.id]?.length).map((g) => g.id);

  // Common Period start: latest inception date among all visible assets.
  const commonStartDate = useMemo<string | null>(() => {
    if (lineMode !== "assets" || periodMode !== "common" || !visibleGroups.length) return null;
    let latest = "1900-01-01";
    for (const g of visibleGroups) {
      const inception = dataset.assetMeta?.[g]?.inceptionDate ?? dataset.groupSeries[g]?.[0]?.date ?? "1900-01-01";
      if (inception > latest) latest = inception;
    }
    return latest;
  }, [lineMode, periodMode, visibleGroups, dataset.assetMeta, dataset.groupSeries]);

  // Dynamic Y-axis domain — from visible finite values after period filter.
  const assetYDomain = useMemo<[number, number] | undefined>(() => {
    if (lineMode !== "assets" || !visibleGroups.length) return undefined;
    let minV = Infinity, maxV = -Infinity;
    for (const group of visibleGroups) {
      let raw = filterSeries(dataset.groupSeries[group] ?? [], startFilter);
      if (commonStartDate) raw = raw.filter((p) => p.date >= commonStartDate);
      const rebased = rebaseSeries(raw);
      const data = compounded ? rebased : toNonCompounded(rebased);
      for (const p of data) {
        if (!Number.isFinite(p.value)) continue;
        if (p.value < minV) minV = p.value;
        if (p.value > maxV) maxV = p.value;
      }
    }
    if (!isFinite(minV)) return undefined;
    const pad = Math.max((maxV - minV) * 0.08, 5);
    return [Math.floor(minV - pad), Math.ceil(maxV + pad)];
  }, [lineMode, visibleGroups, dataset.groupSeries, dataset.assetMeta, startFilter, compounded, commonStartDate]);

  const chartData = useMemo(() => {
    const rows = new Map<string, Record<string, string | number>>();

    if (lineMode !== "assets") {
      for (const point of performanceSeries) {
        rows.set(point.date, { date: point.date, portfolio: point.value });
      }
    }

    if (lineMode === "assets") {
      // Merge asset series into outer-join row map.
      // connectNulls=false: rows without a value for a given asset leave that key absent,
      // producing an authentic gap (no carry-forward at chart level either).
      for (const group of visibleGroups) {
        let raw = filterSeries(dataset.groupSeries[group] ?? [], startFilter);
        if (commonStartDate) raw = raw.filter((p) => p.date >= commonStartDate);
        const rebased = rebaseSeries(raw);
        const groupData = compounded ? rebased : toNonCompounded(rebased);
        for (const point of groupData) {
          if (!Number.isFinite(point.value)) continue;
          const row = rows.get(point.date) ?? { date: point.date };
          row[group] = point.value;
          rows.set(point.date, row);
        }
      }
    }

    if (benchmarkEnabled || lineMode === "benchmark") {
      for (const point of benchmarkSeries) {
        const row = rows.get(point.date) ?? { date: point.date };
        row.benchmark = point.value;
        rows.set(point.date, row);
      }
    }

    const sorted = [...rows.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)));
    // Row-level downsample after merge — preserves date alignment across all series.
    if (lineMode === "assets" && sorted.length > 600) {
      const step = Math.ceil(sorted.length / 600);
      return sorted.filter((_, i) => i % step === 0 || i === sorted.length - 1);
    }
    return sorted;
  }, [benchmarkEnabled, benchmarkSeries, compounded, dataset.groupSeries, lineMode, performanceSeries, startFilter, visibleGroups, commonStartDate]);

  return (
    <Card>
      <CardHeader
        title={dataset.mode === "live" ? "Live Performance" : "Backtest Performance"}
        right={
          <div className="flex flex-nowrap items-center gap-1">
            {START_FILTERS.map((filter) => (
              <PillButton compact key={filter} active={startFilter === filter} onClick={() => onStartFilter(filter)}>
                {filter}
              </PillButton>
            ))}
            <span className="mx-0.5 h-3 w-px shrink-0 bg-white/10" />
            <PillButton compact active={lineMode === "portfolio"} onClick={() => onLineMode("portfolio")}>P</PillButton>
            <PillButton compact active={lineMode === "assets"} onClick={() => onLineMode("assets")}>A</PillButton>
            <PillButton compact active={lineMode === "benchmark"} disabled={!dataset.benchmarkSeries.length} onClick={() => onLineMode("benchmark")}>BM</PillButton>
            <span className="mx-0.5 h-3 w-px shrink-0 bg-white/10" />
            <PillButton compact active={compounded} onClick={() => onCompounded(!compounded)}>Comp</PillButton>
            {lineMode === "assets" && (
              <>
                <span className="mx-0.5 h-3 w-px shrink-0 bg-white/10" />
                <PillButton compact active={periodMode === "own"} onClick={() => onPeriodMode("own")}>Own</PillButton>
                <PillButton compact active={periodMode === "common"} onClick={() => onPeriodMode("common")}>Com</PillButton>
              </>
            )}
          </div>
        }
      />
      <div className="min-h-0 flex-1 px-2 pb-1.5 pt-1">
        <div className="h-full min-h-[128px]">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="analytics-performance-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(244,245,247,0.16)" />
                    <stop offset="100%" stopColor="rgba(244,245,247,0.02)" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.045)" />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 9, fill: "#686b73" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis width={44} tick={{ fontSize: 9, fill: "#686b73" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value > 0 ? "+" : ""}${value.toFixed(0)}%`} domain={assetYDomain ?? ["auto", "auto"]} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.10)", strokeWidth: 1 }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
                {dataset.oosStartDate && dataset.mode !== "live" ? (
                  <ReferenceLine
                    x={dataset.oosStartDate}
                    stroke="rgba(210,214,222,0.32)"
                    strokeDasharray="4 4"
                    label={{ value: "WF/OOS", position: "insideTopRight", fill: "#8d8f98", fontSize: 9 }}
                  />
                ) : null}
                {dataset.fullCoreStartDate && dataset.mode !== "live" ? (
                  <ReferenceLine
                    x={dataset.fullCoreStartDate}
                    stroke="rgba(139,92,246,0.22)"
                    strokeDasharray="3 5"
                    label={{ value: "Full Core", position: "insideTopLeft", fill: "#8d8f98", fontSize: 9 }}
                  />
                ) : null}
                {dataset.qqpineForwardDate ? (
                  <ReferenceLine
                    x={dataset.qqpineForwardDate}
                    stroke="rgba(103,232,249,0.45)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    label={(props: { viewBox?: { x?: number; y?: number } }) => (
                      <text x={(props.viewBox?.x ?? 0) + 4} y={(props.viewBox?.y ?? 0) + 14} fill="#67e8f9" fontSize={9} fontFamily="var(--font-text),sans-serif">QQQ Pine Fwd</text>
                    )}
                  />
                ) : null}
                {dataset.portfolioLiveDate ? (
                  <ReferenceLine
                    x={dataset.portfolioLiveDate}
                    stroke="rgba(52,211,153,0.45)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    label={(props: { viewBox?: { x?: number; y?: number } }) => (
                      <text x={(props.viewBox?.x ?? 0) + 4} y={(props.viewBox?.y ?? 0) + 14} fill="#6ee7b7" fontSize={9} fontFamily="var(--font-text),sans-serif">Portfolio Live</text>
                    )}
                  />
                ) : null}
                <Area type="monotone" dataKey="portfolio" name="Portfolio" stroke={lineMode === "assets" ? "transparent" : "#f3f4f6"} strokeWidth={lineMode === "assets" ? 0 : 1.6} fill={lineMode === "assets" ? "none" : "url(#analytics-performance-fill)"} dot={false} />
                {lineMode === "assets" &&
                  visibleGroups.map((group) => (
                    <Line
                      key={group}
                      type="monotone"
                      dataKey={group}
                      name={dataset.groups.find((item) => item.id === group)?.label ?? group}
                      stroke={GROUP_LINE_COLORS[group] ?? "#a1a1aa"}
                      strokeWidth={1.2}
                      dot={false}
                      connectNulls={false}
                    />
                  ))}
                {benchmarkEnabled || lineMode === "benchmark" ? (
                  <Line type="monotone" dataKey="benchmark" name="SPY" stroke="#d8c071" strokeWidth={1.2} dot={false} />
                ) : null}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyHint message={
              dataset.mode === "live" && dataset.tab === "whiteSwan"
                ? "Live-Daten ab Juli 2026 aus Forward Logger — in Vorbereitung."
                : dataset.mode === "live"
                  ? "Keine belegte Live-/Forward-Serie fuer diesen Modus."
                  : "Keine sichtbare Performance-Serie fuer diesen Modus."
            } />
          )}
        </div>
      </div>
      {lineMode === "assets" && commonStartDate && (
        <div className="px-4 pb-1 text-[9px] text-zinc-500 [font-family:var(--font-text),sans-serif]">
          Common period from {commonStartDate}
        </div>
      )}
      <PerformanceLegend dataset={dataset} lineMode={lineMode} visibleGroups={visibleGroups} allAssetGroups={allAssetGroups} primaryAsset={primaryAsset} onPrimaryAsset={onPrimaryAsset} onToggleGroup={onToggleGroup} onSelectAll={onSelectAll} onClear={onClear} />
    </Card>
  );
}

function KpiGrid({ cards }: { cards: KpiCard[] }) {
  return (
    <Card className="p-3">
      <div className="grid h-full min-h-0 grid-cols-2 gap-2 xl:grid-cols-3">
        {cards.slice(0, 15).map((card) => (
          <div
            key={card.label}
            className="flex min-h-[88px] flex-col justify-between rounded-[16px] border border-white/[0.07] bg-gradient-to-b from-[#141618] to-[#0d0f12] px-3 py-2.5 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.55)]"
          >
            <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-500 [font-family:var(--font-text),sans-serif]">
              {card.label}
            </p>
            <div className="flex items-end justify-between gap-1">
              <p className="line-clamp-2 text-[18px] font-bold leading-tight tracking-tight text-white [font-family:var(--font-numbers),sans-serif]">
                {card.value}
              </p>
              {card.delta ? (
                <p
                  className="mb-0.5 text-[10px] font-semibold [font-family:var(--font-text),sans-serif]"
                  style={{ color: card.deltaNeutral ? "#71717a" : card.deltaGold ? "#d8c071" : "#b66a6a" }}
                >
                  {card.delta}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DrawdownCard({ dataset, visibleSeries, benchmarkEnabled, lineMode }: { dataset: AnalyticsDataset; visibleSeries: AnalyticsSeriesPoint[]; benchmarkEnabled: boolean; lineMode: LineMode }) {
  const bmActive = benchmarkEnabled || lineMode === "benchmark";
  const { chartData, hasBm } = useMemo(() => {
    const datasetSeries = filterSeries(dataset.drawdownSeries, "Max");
    const portDD = downsampleSeries(datasetSeries.length ? datasetSeries : computeDrawdown(visibleSeries));
    if (!bmActive || !dataset.benchmarkSeries.length) {
      return { chartData: portDD, hasBm: false };
    }
    const spyDD = downsampleSeries(computeDrawdown(dataset.benchmarkSeries));
    const spyMap = new Map<string, number>(spyDD.map(p => [p.date, p.value]));
    // forward-fill SPY DD onto portfolio dates
    let lastSpy = 0;
    const merged = portDD.map(p => {
      const s = spyMap.get(p.date);
      if (s !== undefined) lastSpy = s;
      return { date: p.date, value: p.value, spy: lastSpy };
    });
    return { chartData: merged, hasBm: true };
  }, [dataset.drawdownSeries, dataset.benchmarkSeries, visibleSeries, bmActive]);

  return (
    <Card>
      <CardHeader title="Drawdown" />
      <div className="min-h-0 flex-1 px-2 pb-1.5 pt-1">
        <div className="h-full min-h-[58px]">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 3, right: 10, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="analytics-drawdown-fill" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="rgba(196,174,96,0.22)" />
                    <stop offset="100%" stopColor="rgba(226,202,122,0.03)" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 8, fill: "#686b73" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 8, fill: "#686b73" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
                <Area type="monotone" dataKey="value" name="Drawdown" stroke="rgba(196,174,96,0.82)" strokeWidth={1.45} fill="url(#analytics-drawdown-fill)" dot={false} />
                {hasBm && (
                  <Line type="monotone" dataKey="spy" name="SPY DD" stroke="#d8c071" strokeWidth={1.1} strokeDasharray="4 3" dot={false} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyHint message="Keine Drawdown-Serie sichtbar." />
          )}
        </div>
      </div>
    </Card>
  );
}

function BarsCard({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="min-h-0 flex-1 px-2 pb-1.5 pt-1">
        <div className="h-full min-h-[60px]">
          {items.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={items} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: "#686b73" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
                <YAxis tick={{ fontSize: 8, fill: "#686b73" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value}%`} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {items.map((item) => (
                    <Cell key={item.label} fill={item.value >= 0 ? "rgba(232,234,239,0.88)" : "rgba(196,174,96,0.52)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyHint message="Keine Daten vorhanden." />
          )}
        </div>
      </div>
    </Card>
  );
}

function OverviewCard({ rows }: { rows: Array<[string, string]> }) {
  type Item = { type: "sep" } | { type: "pair"; left: [string, string]; right: [string, string] | null };
  const items: Item[] = [];
  const dataRows = rows.slice(0, 20);
  let i = 0;
  while (i < dataRows.length) {
    if (dataRows[i]![0] === "__sep__") {
      items.push({ type: "sep" });
      i += 1;
    } else if (dataRows[i + 1]?.[0] === "__sep__") {
      items.push({ type: "pair", left: dataRows[i]!, right: null });
      i += 1; // leave __sep__ for next iteration
    } else {
      items.push({ type: "pair", left: dataRows[i]!, right: dataRows[i + 1] ?? null });
      i += 2;
    }
  }
  return (
    <Card>
      <CardHeader title="Overview" />
      <div className="flex flex-1 flex-col justify-between gap-0.5 px-4 py-2">
        {items.map((item, idx) =>
          item.type === "sep" ? (
            <div key={`sep-${idx}`} className="border-t border-white/[0.06] my-0.5" />
          ) : (
            <div key={item.left[0]} className="grid grid-cols-2 gap-x-4">
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-text),sans-serif]">{item.left[0]}</p>
                <p className="line-clamp-1 text-[10px] text-zinc-200 [font-family:var(--font-text),sans-serif]">{item.left[1]}</p>
              </div>
              {item.right ? (
                <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-text),sans-serif]">{item.right[0]}</p>
                  <p className="line-clamp-1 text-[10px] text-zinc-200 [font-family:var(--font-text),sans-serif]">{item.right[1]}</p>
                </div>
              ) : <div />}
            </div>
          )
        )}
      </div>
    </Card>
  );
}

function getActiveDates(allDates: string[], startFilter: StartFilter): string[] {
  if (startFilter === "Max" || !allDates.length) return allDates;
  if (startFilter === "2008") return allDates.filter((d) => d >= "2008-01-01");
  if (startFilter === "2015") return allDates.filter((d) => d >= "2015-01-01");
  const last = allDates.at(-1)!;
  const lastDate = new Date(`${last}T00:00:00Z`);
  let start = new Date(lastDate);
  if (startFilter === "YTD") start = new Date(Date.UTC(lastDate.getUTCFullYear(), 0, 1));
  else if (startFilter === "1Y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  else if (startFilter === "3Y") start.setUTCFullYear(start.getUTCFullYear() - 3);
  else if (startFilter === "5Y") start.setUTCFullYear(start.getUTCFullYear() - 5);
  const startKey = start.toISOString().slice(0, 10);
  return allDates.filter((d) => d >= startKey);
}

function buildScopedInvestDataset(
  fsportfolio: FSPortfolioSnapshot,
  mode: AnalyticsMode,
  weights: Record<string, number>,
  enabled: Record<string, boolean>,
  startFilter: StartFilter,
  baseDataset: AnalyticsDataset,
): AnalyticsDataset {
  let assetReturns: Record<string, Record<string, number>>;
  let dateSpine: string[];
  let phaseBStart: string | null = null;

  if (mode === "backtest") {
    assetReturns = fsportfolio.backtest.backtestAssetDailyReturns;
    if (!assetReturns || Object.keys(assetReturns).length === 0) return baseDataset;
    const spyR = assetReturns.SPY ?? {};
    const qqqR = assetReturns.QQQ ?? {};
    dateSpine = Object.keys(spyR).filter((d) => d >= "2000-01-03" && d in qqqR).sort();
  } else {
    assetReturns = fsportfolio.live.forwardAssetDailyReturns;
    dateSpine = Object.keys(assetReturns.WHITE_SWAN_NAS_EMA ?? {}).sort();
    phaseBStart = fsportfolio.live.forwardPhaseBStart;
  }

  if (!dateSpine.length) return baseDataset;

  const activeDates = getActiveDates(dateSpine, startFilter);
  if (!activeDates.length) return baseDataset;

  const activeSyms = LIVE_ASSET_SYMBOLS.filter((sym) => enabled[sym] !== false);
  const totalW = activeSyms.reduce((s, sym) => s + (weights[sym] ?? 0), 0);
  const normW: Record<string, number> = {};
  for (const sym of activeSyms) normW[sym] = totalW > 0 ? (weights[sym] ?? 0) / totalW : 0;

  let equity = 100;
  const portfolioDailyReturns: Record<string, number> = {};
  const equityCurve: EquityPoint[] = [];
  const spyDailyReturns = assetReturns.SPY ?? {};

  for (const date of activeDates) {
    let r: number;
    if (phaseBStart !== null && date < phaseBStart) {
      r = assetReturns.WHITE_SWAN_NAS_EMA?.[date] ?? 0;
    } else {
      const avail = activeSyms.filter((sym) => assetReturns[sym]?.[date] !== undefined);
      const dayW = avail.reduce((s, sym) => s + (normW[sym] ?? 0), 0);
      r = dayW > 0
        ? avail.reduce((s, sym) => s + (assetReturns[sym]![date]! * (normW[sym] ?? 0)) / dayW, 0)
        : 0;
    }
    equity *= 1 + r;
    portfolioDailyReturns[date] = r;
    equityCurve.push({ date, value: Number(equity.toFixed(4)) });
  }

  const performanceSeries: AnalyticsSeriesPoint[] = equityCurve.map((p) => ({
    date: p.date,
    value: Number((p.value - 100).toFixed(2)),
  }));
  const drawdownSeries = computeDrawdown(performanceSeries);

  let spyEq = 100;
  const filteredSpyReturns: Record<string, number> = {};
  const benchmarkEquity: EquityPoint[] = [];
  for (const date of activeDates) {
    const r = spyDailyReturns[date] ?? 0;
    spyEq *= 1 + r;
    filteredSpyReturns[date] = r;
    benchmarkEquity.push({ date, value: Number(spyEq.toFixed(4)) });
  }
  const benchmarkSeries: AnalyticsSeriesPoint[] = benchmarkEquity.map((p) => ({
    date: p.date,
    value: Number((p.value - 100).toFixed(2)),
  }));

  const groupSeries: Record<string, AnalyticsSeriesPoint[]> = {};
  for (const sym of LIVE_ASSET_SYMBOLS) {
    const symR = assetReturns[sym] ?? {};
    let symEq: number | null = null;
    const curve: AnalyticsSeriesPoint[] = [];
    for (const date of activeDates) {
      if (symR[date] !== undefined) {
        if (symEq === null) symEq = 100;
        symEq *= 1 + symR[date]!;
      }
      // carry-forward: include every active date once asset has started, fills gaps
      if (symEq !== null) {
        curve.push({ date, value: Number((symEq - 100).toFixed(2)) });
      }
    }
    if (curve.length) groupSeries[sym] = curve;
  }

  const annualReturns = aggregateReturns(portfolioDailyReturns, "year").map((p) => ({
    label: p.date, value: Number(p.value.toFixed(2)),
  }));
  const monthlyReturns = aggregateReturns(portfolioDailyReturns, "month").map((p) => ({
    label: p.date, value: Number(p.value.toFixed(2)),
  }));

  const fwdMetrics = computePortfolioMetrics({
    initialCapital: 100,
    equityCurve,
    dailyReturns: portfolioDailyReturns,
    benchmarkDailyReturns: filteredSpyReturns,
    transactionCostAmount: 0,
    turnoverPct: null,
  });

  const metrics: Record<string, number | string> = {
    ...baseDataset.metrics,
    totalReturnPct: fwdMetrics?.totalReturnPct ?? "n/a",
    cagrPct: fwdMetrics?.cagrPct ?? "n/a",
    maxDrawdownPct: fwdMetrics?.maxDrawdownPct ?? "n/a",
    annualizedVolatilityPct: fwdMetrics?.annualizedVolatilityPct ?? "n/a",
    sharpe: fwdMetrics?.sharpe ?? "n/a",
    sortino: fwdMetrics?.sortino ?? "n/a",
    calmar: fwdMetrics?.calmar ?? "n/a",
    positiveMonthsPct: fwdMetrics?.positiveMonthsPct ?? "n/a",
    betaToSpy: fwdMetrics?.betaToSpy ?? "n/a",
    correlationToSpy: fwdMetrics?.correlationToSpy ?? "n/a",
    dataPoints: equityCurve.length,
  };

  return { ...baseDataset, performanceSeries, drawdownSeries, benchmarkSeries, groupSeries, annualReturns, monthlyReturns, metrics };
}

// ── WS dataset from portfolio_f10_equity.json (monthly equity curve) ─────
function buildWsDatasetFromEquityFile(
  file: import("@/lib/capitalife-data").WsPortfolioEquityFile | null,
  benchmarkSeries: AnalyticsSeriesPoint[],
): AnalyticsDataset {
  const empty: AnalyticsDataset = {
    tab: "whiteSwan", mode: "backtest", title: "White Swan F+10%",
    sourceLabel: "portfolio_f10_equity.json", sourceFiles: [],
    period: {}, groups: [], performanceSeries: [], drawdownSeries: [],
    benchmarkSeries, groupSeries: {}, annualReturns: [], monthlyReturns: [],
    groupBars: [], strategyBars: [], metrics: {}, notes: [],
  };
  if (!file?.equityCurve?.length) return empty;
  const curve = file.equityCurve;
  const v0 = curve[0]!.value;
  if (!v0) return empty;
  const performanceSeries: AnalyticsSeriesPoint[] = curve.map(p => ({
    date: p.time,
    value: Number(((p.value / v0 - 1) * 100).toFixed(2)),
  }));
  const drawdownSeries = computeDrawdown(performanceSeries);
  const start = curve[0]!.time;
  const end = curve.at(-1)!.time;
  return { ...empty, performanceSeries, drawdownSeries, period: { start, end }, benchmarkSeries };
}

// ── Combined dataset (WS F+10% + CI v2.0, monthly spine from WS) ─────────
function buildCombinedDataset(
  wsDataset: AnalyticsDataset,
  ciDataset: AnalyticsDataset,
  wsWeight: number, // 0–1
): AnalyticsDataset {
  const ciWeight = 1 - wsWeight;
  const wsSeries = wsDataset.performanceSeries;
  const ciSeries = ciDataset.performanceSeries;

  const emptyResult = (): AnalyticsDataset => ({
    tab: "combined", mode: "backtest", title: "Combined Portfolio",
    sourceLabel: `WS F+10% ${Math.round(wsWeight * 100)}% · CI v2.0 ${Math.round(ciWeight * 100)}%`,
    sourceFiles: [], period: {}, groups: [], performanceSeries: [], drawdownSeries: [],
    benchmarkSeries: wsDataset.benchmarkSeries, groupSeries: {}, annualReturns: [],
    monthlyReturns: [], groupBars: [], strategyBars: [], metrics: {}, notes: [],
  });
  if (!wsSeries.length || !ciSeries.length) return emptyResult();

  // CI daily → sorted date array + value map for floor-lookup
  const ciSorted = [...ciSeries].sort((a, b) => a.date.localeCompare(b.date));
  const ciDates = ciSorted.map(p => p.date);
  const ciByDate = new Map<string, number>(ciSorted.map(p => [p.date, p.value]));
  function ciFloor(wsDate: string): number {
    let lo = 0, hi = ciDates.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ciDates[mid]! <= wsDate) lo = mid; else hi = mid - 1; }
    const d = ciDates[lo]; return (d && d <= wsDate) ? (ciByDate.get(d) ?? 0) : 0;
  }

  let prevWsCum = wsSeries[0]?.value ?? 0;
  let prevCiCum = wsSeries.length ? ciFloor(wsSeries[0]!.date) : 0;
  let equity = 100;
  const performanceSeries: AnalyticsSeriesPoint[] = [];
  const monthlyRets: number[] = [];
  const annualGroups = new Map<string, number[]>();

  for (const wsPoint of wsSeries) {
    const wsCum = wsPoint.value;
    const ciCum = ciFloor(wsPoint.date);
    const wsR = (1 + wsCum / 100) / (1 + prevWsCum / 100) - 1;
    const ciR = (1 + ciCum / 100) / (1 + prevCiCum / 100) - 1;
    const r = wsR * wsWeight + ciR * ciWeight;
    equity *= 1 + r;
    prevWsCum = wsCum; prevCiCum = ciCum;
    performanceSeries.push({ date: wsPoint.date, value: Number((equity - 100).toFixed(2)) });
    monthlyRets.push(r);
    const yr = wsPoint.date.slice(0, 4);
    if (!annualGroups.has(yr)) annualGroups.set(yr, []);
    annualGroups.get(yr)!.push(r);
  }

  const drawdownSeries = computeDrawdown(performanceSeries);
  const annualReturns = [...annualGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([yr, rets]) => ({
    label: yr, value: Number(((rets.reduce((p, r) => p * (1 + r), 1) - 1) * 100).toFixed(2)),
  }));
  const monthlyReturns = wsSeries.map((p, i) => ({
    label: p.date.slice(0, 7), value: Number(((monthlyRets[i] ?? 0) * 100).toFixed(2)),
  }));

  const n = monthlyRets.length;
  const meanM = n > 0 ? monthlyRets.reduce((s, r) => s + r, 0) / n : 0;
  const varM = n > 1 ? monthlyRets.reduce((s, r) => s + (r - meanM) ** 2, 0) / (n - 1) : 0;
  const stdM = Math.sqrt(varM);
  const nYears = n / 12;
  const finalEq = equity / 100;
  const cagrPct = nYears > 0 ? (Math.pow(finalEq, 1 / nYears) - 1) * 100 : 0;
  const sharpe = stdM > 0 ? (meanM / stdM) * Math.sqrt(12) : 0;
  const maxDdPct = Math.min(...drawdownSeries.map(p => p.value), 0);
  const calmar = maxDdPct < 0 ? cagrPct / Math.abs(maxDdPct) : 0;
  const posMonths = n > 0 ? (monthlyRets.filter(r => r > 0).length / n) * 100 : 0;

  const start = wsSeries[0]?.date; const end = wsSeries.at(-1)?.date;
  const benchmarkSeries = wsDataset.benchmarkSeries.filter(p => (!start || p.date >= start) && (!end || p.date <= end));
  const groupSeries: Record<string, AnalyticsSeriesPoint[]> = {
    "White Swan": wsSeries,
    "Core Invest": ciSeries.filter(p => (!start || p.date >= start) && (!end || p.date <= end)),
  };

  return {
    tab: "combined", mode: "backtest", title: "Combined Portfolio",
    sourceLabel: `WS F+10% ${Math.round(wsWeight * 100)}% · CI v2.0 ${Math.round(ciWeight * 100)}%`,
    sourceFiles: [], period: { start, end },
    groups: [
      { id: "White Swan", label: "White Swan F+10%", active: true, weight: wsWeight },
      { id: "Core Invest", label: "Core Invest v2.0", active: true, weight: ciWeight },
    ],
    performanceSeries, drawdownSeries, benchmarkSeries, groupSeries, annualReturns, monthlyReturns,
    groupBars: [], strategyBars: [],
    metrics: {
      totalReturnPct: finalEq > 0 ? (finalEq - 1) * 100 : 0,
      cagrPct, maxDrawdownPct: maxDdPct, sharpe, calmar,
      positiveMonthsPct: posMonths, dataPoints: n,
    },
    notes: [],
  };
}

function CombinedControlPanel({
  wsWeight,
  riskMultiplier,
  onWsWeightChange,
  onRiskChange,
  onReset,
}: {
  wsWeight: number;
  riskMultiplier: number;
  onWsWeightChange: (v: number) => void;
  onRiskChange: (m: number) => void;
  onReset: () => void;
}) {
  const ciWeight = 100 - wsWeight;

  function AllocCell({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
      <div className="flex items-center gap-1 rounded-[8px] border border-white/[0.12] bg-white/[0.03] px-1.5 py-0.5">
        <span className="min-w-0 flex-1 block truncate text-[8px] font-medium leading-tight text-zinc-200 [font-family:var(--font-text),sans-serif]">
          {label}
        </span>
        <input
          type="number" min={0} max={100} step={5} value={value}
          onChange={e => onChange(Math.min(100, Math.max(0, Number(e.target.value))))}
          className="w-7 rounded border border-white/[0.08] bg-white/[0.04] px-0.5 py-0.5 text-right text-[8px] text-white [font-family:var(--font-text),sans-serif] focus:border-white/20 focus:outline-none"
        />
        <span className="text-[7px] text-zinc-700 [font-family:var(--font-text),sans-serif]">%</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader title="Gewichtung anpassen" />
      <div className="flex flex-1 flex-col px-3 py-1.5 gap-0.5">
        <div className="grid grid-cols-2 gap-1">
          <AllocCell label="White Swan" value={wsWeight} onChange={onWsWeightChange} />
          <AllocCell label="Core Invest" value={ciWeight} onChange={v => onWsWeightChange(100 - v)} />
        </div>
        <div className="flex items-center justify-between px-0.5 pt-0.5">
          <span className="text-[8px] text-zinc-600 [font-family:var(--font-text),sans-serif]">
            Σ {wsWeight + ciWeight}%
          </span>
          <button
            type="button" onClick={onReset}
            className="text-[8px] text-zinc-600 hover:text-zinc-300 [font-family:var(--font-text),sans-serif] transition-colors"
          >
            ↺ Reset
          </button>
        </div>
        <div className="border-t border-white/[0.06] pt-1">
          <p className="mb-0.5 text-[8px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-text),sans-serif]">
            Gesamtrisiko (WS)
          </p>
          <div className="flex gap-1">
            {([1, 1.5, 2, 2.5, 3] as const).map(m => (
              <PillButton key={m} active={riskMultiplier === m} onClick={() => onRiskChange(m)}>
                {m}×
              </PillButton>
            ))}
          </div>
        </div>
        <p className="mt-0.5 text-[7px] text-zinc-700 [font-family:var(--font-text),sans-serif]">
          Combined · Research Preview · not live
        </p>
      </div>
    </Card>
  );
}

function LiveControlPanel({
  weights,
  enabled,
  onWeightChange,
  onToggle,
  onReset,
}: {
  weights: Record<string, number>;
  enabled: Record<string, boolean>;
  onWeightChange: (sym: string, val: number) => void;
  onToggle: (sym: string) => void;
  onReset: () => void;
}) {
  const activeSyms = LIVE_ASSET_SYMBOLS.filter((sym) => enabled[sym] !== false);
  const totalW = activeSyms.reduce((s, sym) => s + (weights[sym] ?? 0), 0);

  // 7 assets in 4 rows: [Pine1|SPY] [SPMO|QQQ] [GLD|Copper] [CHF|–]
  const assetPairs: Array<[string, string | null]> = [
    ["WHITE_SWAN_NAS_EMA", "SPY"],
    ["SPMO", "QQQ"],
    ["GLD", "COPPER_HG"],
    ["CHF_6S", null],
  ];

  const INVEST_ICONS: Record<string, string> = {
    WHITE_SWAN_NAS_EMA: "/assets/invest/qqq.png",
    SPY: "/assets/invest/spy.png",
    SPMO: "/assets/invest/spmo.png",
    QQQ: "/assets/invest/qqq.png",
    GLD: "/assets/invest/gld.png",
  };

  function AssetCell({ sym }: { sym: string }) {
    const isOn = enabled[sym] !== false;
    return (
      <div className={cn(
        "flex items-center gap-1 rounded-[8px] border px-1.5 py-0.5 transition-colors",
        isOn ? "border-white/[0.12] bg-white/[0.03]" : "border-white/[0.05]",
      )}>
        <button
          type="button"
          onClick={() => onToggle(sym)}
          className="min-w-0 flex-1 text-left"
        >
          <span className={cn(
            "block truncate text-[8px] font-medium leading-tight [font-family:var(--font-text),sans-serif]",
            isOn ? "text-zinc-200" : "text-zinc-600",
          )}>
            {LIVE_ASSET_LABELS[sym]}
          </span>
          <span className="text-[7px] text-zinc-700 [font-family:var(--font-text),sans-serif]">
            {isOn ? "on" : "off"}
          </span>
        </button>
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={weights[sym] ?? 0}
          disabled={!isOn}
          onChange={(e) => onWeightChange(sym, Math.max(0, Number(e.target.value)))}
          className="w-7 rounded border border-white/[0.08] bg-white/[0.04] px-0.5 py-0.5 text-right text-[8px] text-white disabled:opacity-30 [font-family:var(--font-text),sans-serif] focus:border-white/20 focus:outline-none"
        />
        <span className="text-[7px] text-zinc-700 [font-family:var(--font-text),sans-serif]">%</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader title="Core Invest" />
      <div className="flex flex-1 flex-col px-3 py-1.5 gap-0.5">
        {assetPairs.map(([left, right]) => (
          <div key={left} className="grid grid-cols-2 gap-1">
            <AssetCell sym={left} />
            {right && <AssetCell sym={right} />}
          </div>
        ))}
        <div className="flex items-center justify-between px-0.5 pt-0.5">
          <span className="text-[8px] text-zinc-600 [font-family:var(--font-text),sans-serif]">
            Σ {totalW.toFixed(1)}%
          </span>
          <button
            type="button"
            onClick={onReset}
            className="text-[8px] text-zinc-600 hover:text-zinc-300 [font-family:var(--font-text),sans-serif] transition-colors"
          >
            ↺ Reset
          </button>
        </div>
        <p className="mt-0.5 text-[7px] text-zinc-700 [font-family:var(--font-text),sans-serif]">
          Core Invest v2.0 · PAPER_ONLY · Frozen 2026-07-20
        </p>
      </div>
    </Card>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ScenarioStatus = "idle" | "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED" | "CANCELLED";
type RebalanceMode  = "auto_cash" | "proportional" | "manual";
interface ScenarioRun { runId: string; status: ScenarioStatus; phase: string; metrics?: Record<string, number>; }
interface ScenarioEquityCurves { performance: Array<{date:string;value:number}>; drawdown: Array<{date:string;value:number}>; benchmark: Array<{date:string;value:number}>; }
interface DraftRisk { exposure_cap: number; financing_spread: number; fee_rate: number; }

const ETF_TICKERS = ["SPY","QQQ","RSP","IWM","QUAL","MTUM","VLUE","USMV","EFA","EEM","GLD","IEF","BIL"] as const;
const BASELINE_RISK: DraftRisk = { exposure_cap: 1.60, financing_spread: 0.015, fee_rate: 0.25 };
// Canonical Core Invest v2.0 ETF weights (gross ~1.4x)
const CI_ETF_DEFAULTS: Record<string, number> = {
  SPY: 0.56, QQQ: 0.28, RSP: 0.084, IWM: 0.0639,
  QUAL: 0.084, MTUM: 0.084, VLUE: 0.1601, USMV: 0.084,
};

function InvestControlPanel({
  dataset,
  onScenarioResult,
  onResetScenario,
}: {
  dataset: AnalyticsDataset;
  onScenarioResult: (ec: ScenarioEquityCurves, annual: unknown, metrics: Record<string, number>, run: ScenarioRun) => void;
  onResetScenario: () => void;
}) {
  const [activeTab,     setActiveTab]     = useState<"allocation"|"risk"|"scenario">("allocation");
  const [draftWeights,  setDraftWeights]  = useState<Record<string, number>>({});
  const [draftRisk,     setDraftRisk]     = useState<DraftRisk>({ ...BASELINE_RISK });
  const [rebalMode,     setRebalMode]     = useState<RebalanceMode>("auto_cash");
  const [scenarioRun,   setScenarioRun]   = useState<ScenarioRun | null>(null);
  const [scenarioActive,setScenarioActive]= useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const baselineWeights = useMemo<Record<string,number>>(() => {
    if (dataset.etfWeights && Object.keys(dataset.etfWeights).length > 0) return dataset.etfWeights as Record<string,number>;
    const w: Record<string,number> = {};
    for (const g of dataset.groups) {
      if ((ETF_TICKERS as readonly string[]).includes(g.id) && (g.weight ?? 0) > 0) w[g.id] = g.weight ?? 0;
    }
    return Object.keys(w).length > 0 ? w : CI_ETF_DEFAULTS;
  }, [dataset]);

  const activeEtfs = ETF_TICKERS.filter(t => Math.abs(baselineWeights[t] ?? 0) > 0.001 || Math.abs(draftWeights[t] ?? 0) > 0.001);
  const col1 = activeEtfs.slice(0, Math.ceil(activeEtfs.length / 2));
  const col2 = activeEtfs.slice(Math.ceil(activeEtfs.length / 2));

  const effectiveW = useMemo(() => {
    const m: Record<string,number> = { ...baselineWeights };
    for (const [t,w] of Object.entries(draftWeights)) m[t] = w;
    return m;
  }, [baselineWeights, draftWeights]);

  const longSum  = activeEtfs.filter(t => t !== "BIL").reduce((s,t) => s + Math.max(0, effectiveW[t] ?? 0), 0);
  const shortSum = activeEtfs.filter(t => t !== "BIL").reduce((s,t) => s + Math.max(0, -(effectiveW[t] ?? 0)), 0);
  const cashW    = effectiveW["BIL"] ?? 0;
  const grossW   = longSum + shortSum;
  const netW     = longSum - shortSum;
  const capHard  = 1.60;
  const overCap  = grossW > capHard + 0.001;

  const hasChanges =
    Object.keys(draftWeights).some(t => Math.abs((draftWeights[t] ?? 0) - (baselineWeights[t] ?? 0)) > 0.0005) ||
    draftRisk.exposure_cap !== BASELINE_RISK.exposure_cap ||
    draftRisk.financing_spread !== BASELINE_RISK.financing_spread ||
    draftRisk.fee_rate !== BASELINE_RISK.fee_rate;

  const isRunning  = scenarioRun?.status === "QUEUED" || scenarioRun?.status === "RUNNING";
  const isComplete = scenarioRun?.status === "COMPLETE";

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const pollStatus = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/core-invest/scenarios/${runId}`);
      if (!res.ok) return;
      const data = await res.json() as { status: {run_id:string;status:ScenarioStatus;phase:string}; result?: {metrics:Record<string,number>}; equityCurves?: ScenarioEquityCurves; annualReturns?: unknown };
      const st = data.status;
      setScenarioRun({ runId, status: st.status, phase: st.phase, metrics: data.result?.metrics });
      if (st.status === "COMPLETE") {
        stopPolling();
        if (data.result && data.equityCurves) {
          onScenarioResult(data.equityCurves, data.annualReturns, data.result.metrics, { runId, status: "COMPLETE", phase: "Complete", metrics: data.result.metrics });
          setScenarioActive(true);
        }
        setActiveTab("scenario");
      } else if (st.status === "FAILED" || st.status === "CANCELLED") {
        stopPolling(); setActiveTab("scenario");
      }
    } catch { /* keep polling */ }
  }, [stopPolling, onScenarioResult]);

  const handleRun = useCallback(async () => {
    stopPolling(); setScenarioActive(false);
    setScenarioRun({ runId: "…", status: "QUEUED", phase: "Queued" });
    setActiveTab("scenario");
    try {
      const res = await fetch("/api/core-invest/scenarios", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ draft_weights: draftWeights, risk_params: { ...draftRisk }, rebalance_mode: rebalMode }) });
      if (!res.ok) { const e = await res.json() as {error?:string}; setScenarioRun({ runId:"error", status:"FAILED", phase: e.error ?? "Request failed" }); return; }
      const { run_id } = await res.json() as { run_id: string };
      setScenarioRun({ runId: run_id, status: "QUEUED", phase: "Queued" });
      void pollStatus(run_id);
      pollRef.current = setInterval(() => void pollStatus(run_id), 1500);
    } catch (e) { setScenarioRun({ runId:"error", status:"FAILED", phase: String(e) }); }
  }, [draftWeights, draftRisk, rebalMode, stopPolling, pollStatus]);

  const handleCancel = useCallback(async () => {
    if (!scenarioRun?.runId || scenarioRun.runId === "error" || scenarioRun.runId === "…") return;
    stopPolling();
    try { await fetch(`/api/core-invest/scenarios/${scenarioRun.runId}`, { method:"POST" }); } catch { /* ignore */ }
    setScenarioRun(prev => prev ? { ...prev, status:"CANCELLED", phase:"Cancelled" } : null);
  }, [scenarioRun, stopPolling]);

  const handleReset = useCallback(() => { setDraftWeights({}); setDraftRisk({ ...BASELINE_RISK }); }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Restart polling if a run is still active when component remounts (e.g. after Fast Refresh)
  useEffect(() => {
    const s = scenarioRun?.status;
    if ((s === "QUEUED" || s === "RUNNING") && scenarioRun?.runId && scenarioRun.runId !== "…" && !pollRef.current) {
      const runId = scenarioRun.runId;
      void pollStatus(runId);
      pollRef.current = setInterval(() => void pollStatus(runId), 1500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Row for one ETF ──
  function AssetRow({ ticker }: { ticker: string }) {
    const base  = baselineWeights[ticker] ?? 0;
    const draft = draftWeights[ticker] ?? base;
    const delta = draft - base;
    const pct   = +(draft * 100).toFixed(2);
    return (
      <div className="flex items-center gap-0.5 h-[30px]">
        <span className="w-[24px] shrink-0 text-[11px] font-bold text-zinc-200 [font-family:var(--font-text),sans-serif]">{ticker}</span>
        <span className="w-[18px] shrink-0 text-right text-[10px] text-zinc-600 [font-family:var(--font-text),sans-serif]">{Math.round(base*100)}</span>
        <button type="button" onClick={() => setDraftWeights(p => ({ ...p, [ticker]: Math.max(-0.5, (p[ticker] ?? base) - 0.01) }))}
          className="flex h-[30px] w-[26px] shrink-0 items-center justify-center rounded border border-white/[0.10] text-zinc-400 hover:text-white text-[13px] [font-family:var(--font-text),sans-serif]">−</button>
        <input type="number" value={pct} step={1} min={-50} max={250}
          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setDraftWeights(p => ({ ...p, [ticker]: Math.round(v*100)/10000 })); }}
          className={cn("min-w-[72px] flex-1 h-[30px] rounded border bg-white/[0.05] px-1 text-center text-[12px] font-semibold text-white [font-family:var(--font-text),sans-serif] focus:outline-none focus:border-[#C9A84C]/40",
            Math.abs(delta) > 0.0005 ? "border-[#C9A84C]/20 bg-[#C9A84C]/[0.04]" : "border-white/[0.10]")} />
        <button type="button" onClick={() => setDraftWeights(p => ({ ...p, [ticker]: Math.min(2.5, (p[ticker] ?? base) + 0.01) }))}
          className="flex h-[30px] w-[26px] shrink-0 items-center justify-center rounded border border-white/[0.10] text-zinc-400 hover:text-white text-[13px] [font-family:var(--font-text),sans-serif]">+</button>
        <span className="w-[26px] shrink-0 text-right text-[10px] font-bold [font-family:var(--font-text),sans-serif]"
          style={{ color: Math.abs(delta) < 0.0005 ? "#3f3f46" : delta > 0 ? "#22C55E" : "#c4ae60" }}>
          {Math.abs(delta) < 0.0005 ? "—" : `${delta>0?"+":""}${Math.round(delta*100)}%`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border border-white/[0.06] bg-gradient-to-b from-[#19191d] to-[#111214]">

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.05] px-3 py-2">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#C9A84C]/80 [font-family:var(--font-text),sans-serif]">Control Panel</p>
        <div className="flex gap-1.5">
          {scenarioActive && <span className="rounded-[3px] border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-1.5 py-0.5 text-[7.5px] font-bold uppercase text-[#C9A84C] [font-family:var(--font-text),sans-serif]">SCENARIO</span>}
          {hasChanges && !isRunning && <span className="rounded-[3px] border border-zinc-600/40 bg-zinc-700/20 px-1.5 py-0.5 text-[7.5px] font-bold uppercase text-zinc-400 [font-family:var(--font-text),sans-serif]">DRAFT</span>}
          {isRunning && <span className="flex items-center gap-1 rounded-[3px] border border-[#C9A84C]/20 bg-[#C9A84C]/5 px-1.5 py-0.5 text-[7.5px] font-bold uppercase text-[#C9A84C] [font-family:var(--font-text),sans-serif]"><span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#C9A84C]" />RUNNING</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-0.5 border-b border-white/[0.05] px-2 py-1">
        {(["allocation","risk","scenario"] as const).map(t => (
          <button key={t} type="button" onClick={() => setActiveTab(t)}
            className={cn("flex-1 rounded-[4px] py-[5px] text-[9px] font-bold uppercase tracking-[0.10em] [font-family:var(--font-text),sans-serif]",
              activeTab === t ? "bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20" : "border border-transparent text-zinc-600 hover:text-zinc-400")}>
            {t === "allocation" ? "Allocation" : t === "risk" ? "Risk" : "Scenario"}
          </button>
        ))}
      </div>

      {/* Body: left (tab content) + right (exposure + actions) */}
      <div className="flex min-h-0 flex-1 overflow-hidden px-3 py-2 gap-0">

        {/* LEFT: tab content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pr-3">

          {activeTab === "allocation" && (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
              {/* Rebalance mode */}
              <div className="flex shrink-0 gap-1">
                {(["auto_cash","proportional","manual"] as RebalanceMode[]).map(m => (
                  <button key={m} type="button" onClick={() => setRebalMode(m)}
                    className={cn("flex-1 rounded-[4px] py-[4px] text-[8.5px] font-bold uppercase tracking-[0.09em] [font-family:var(--font-text),sans-serif]",
                      rebalMode === m ? "bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20" : "border border-white/[0.07] text-zinc-600 hover:text-zinc-400")}>
                    {m === "auto_cash" ? "Auto Cash" : m === "proportional" ? "Prop." : "Manual"}
                  </button>
                ))}
              </div>
              {/* 2-column asset grid */}
              <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
                {[col1, col2].map((col, ci) => (
                  <div key={ci} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                    {col.map(ticker => <AssetRow key={ticker} ticker={ticker} />)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "risk" && (
            <div className="flex min-h-0 flex-1 flex-col justify-around gap-2 overflow-hidden py-1">
              {([
                { label:"Exposure Cap",     key:"exposure_cap"     as const, unit:"x"  as const, base:1.60,  min:0.5,  max:3.0,  step:0.05  },
                { label:"Financing Spread", key:"financing_spread" as const, unit:"%" as const, base:0.015, min:0,    max:0.1,  step:0.001 },
                { label:"Perf Fee",         key:"fee_rate"         as const, unit:"%" as const, base:0.25,  min:0,    max:0.5,  step:0.01  },
              ] as const).map(({ label, key, unit, base, min, max, step }) => {
                const toD = (v:number) => unit === "%" ? +(v*100).toFixed(1) : +v.toFixed(2);
                const frD = (v:number) => unit === "%" ? v/100 : v;
                const draft = draftRisk[key];
                const delta = draft - base;
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] font-bold text-zinc-300 [font-family:var(--font-text),sans-serif]">{label}</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[8px] text-zinc-600 [font-family:var(--font-text),sans-serif]">base {toD(base)}{unit}</span>
                        {Math.abs(delta) > 1e-6 && <span className="text-[10px] font-bold [font-family:var(--font-text),sans-serif]" style={{color:delta>0?"#22C55E":"#c4ae60"}}>{delta>0?"+":""}{toD(delta)}{unit}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="range" min={toD(min)} max={toD(max)} step={toD(step)} value={toD(draft)} onChange={e => setDraftRisk(p => ({...p,[key]:frD(parseFloat(e.target.value))}))} className="flex-1 h-1.5 cursor-pointer accent-[#C9A84C]" />
                      <input type="number" min={toD(min)} max={toD(max)} step={toD(step)} value={toD(draft)} onChange={e=>{const v=frD(parseFloat(e.target.value));if(!isNaN(v)&&v>=min&&v<=max)setDraftRisk(p=>({...p,[key]:v}));}} className="w-[58px] h-[28px] rounded border border-white/[0.10] bg-white/[0.05] px-1 text-center text-[12px] font-semibold text-white [font-family:var(--font-text),sans-serif] focus:outline-none" />
                      <span className="w-4 text-[9px] text-zinc-600 [font-family:var(--font-text),sans-serif]">{unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "scenario" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden py-1">
              {!scenarioRun ? (
                <p className="text-[9px] italic text-zinc-600 [font-family:var(--font-text),sans-serif] mt-2 text-center">Adjust weights or risk params, then Run Scenario.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className={cn("text-[9px] font-bold uppercase [font-family:var(--font-text),sans-serif]",
                      isRunning?"text-[#C9A84C]":isComplete?"text-[#22C55E]":"text-[#EF4444]")}>{scenarioRun.status}</span>
                    <span className="text-[8px] text-zinc-600 [font-family:var(--font-text),sans-serif]">{scenarioRun.runId}</span>
                  </div>
                  {isRunning && (
                    <div className="space-y-1">
                      <div className="text-[8.5px] text-zinc-500 [font-family:var(--font-text),sans-serif]">{scenarioRun.phase || "Waiting…"}</div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-[#C9A84C]/60 transition-all" style={{width:`${Math.min(95,20)}%`}} />
                      </div>
                    </div>
                  )}
                  {isComplete && scenarioRun.metrics && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {([["CAGR",`${scenarioRun.metrics.cagr_pct?.toFixed(2)}%`],["Max DD",`${scenarioRun.metrics.max_drawdown_pct?.toFixed(1)}%`],["Sharpe",`${scenarioRun.metrics.sharpe?.toFixed(2)}`],["Vol",`${scenarioRun.metrics.volatility_pct?.toFixed(1)}%`]] as [string,string][]).map(([k,v])=>(
                        <div key={k} className="flex justify-between items-baseline">
                          <span className="text-[8.5px] text-zinc-500 [font-family:var(--font-text),sans-serif]">{k}</span>
                          <span className="text-[11px] font-bold text-zinc-100 [font-family:var(--font-text),sans-serif]">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isComplete && <p className="mt-auto text-[8px] text-zinc-600 [font-family:var(--font-text),sans-serif]">SCENARIO · UNSAVED · {scenarioRun.runId}</p>}
                </>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Exposure + always-visible actions */}
        <div className="flex w-[148px] shrink-0 flex-col gap-2 border-l border-white/[0.05] pl-3">
          <div className="space-y-1">
            <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-zinc-700 [font-family:var(--font-text),sans-serif]">Exposure</p>
            {([["Long",longSum,"#C9A84C"],["Gross",grossW,overCap?"#EF4444":"#C9A84C"],["Net",netW,"#a1a1aa"],["Cash",cashW,"#3B82F6"]] as [string,number,string][]).map(([l,v,c])=>(
              <div key={l} className="flex items-center justify-between gap-1">
                <span className="text-[8.5px] text-zinc-600 [font-family:var(--font-text),sans-serif]">{l}</span>
                <span className="text-[10px] font-bold [font-family:var(--font-text),sans-serif]" style={{color:c}}>{Math.round(v*100)}%</span>
              </div>
            ))}
            <div className="border-t border-white/[0.05] pt-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[8.5px] text-zinc-600 [font-family:var(--font-text),sans-serif]">{overCap?"OVER":"Room"}</span>
                <span className="text-[10px] font-bold [font-family:var(--font-text),sans-serif]" style={{color:overCap?"#EF4444":"#52525b"}}>{overCap?`+${Math.round((grossW-capHard)*100)}%`:`${Math.round((capHard-grossW)*100)}%`}</span>
              </div>
            </div>
          </div>

          {/* Actions — always visible */}
          <div className="mt-auto space-y-1.5 border-t border-white/[0.05] pt-2">
            <button type="button" onClick={handleReset} className="w-full rounded-[5px] border border-white/[0.10] py-[5px] text-[9px] font-bold uppercase tracking-[0.10em] text-zinc-400 hover:text-zinc-200 [font-family:var(--font-text),sans-serif]">Reset</button>
            {isRunning
              ? <button type="button" onClick={handleCancel} className="w-full rounded-[5px] border border-[#EF4444]/30 py-[5px] text-[9px] font-bold uppercase tracking-[0.10em] text-[#EF4444]/80 [font-family:var(--font-text),sans-serif]">Cancel</button>
              : <button type="button" onClick={handleRun} disabled={!hasChanges} className={cn("w-full rounded-[5px] border py-[5px] text-[9px] font-bold uppercase tracking-[0.10em] [font-family:var(--font-text),sans-serif]",hasChanges?"border-[#C9A84C]/30 bg-[#C9A84C]/10 text-[#C9A84C] hover:bg-[#C9A84C]/20":"border-white/[0.06] text-zinc-700 cursor-not-allowed")}>Run Scenario</button>
            }
            {isComplete && <>
              <button type="button" onClick={() => setScenarioActive(v => !v)} className="w-full rounded-[5px] border border-white/[0.10] py-[5px] text-[9px] font-bold uppercase tracking-[0.10em] text-zinc-400 hover:text-zinc-200 [font-family:var(--font-text),sans-serif]">{scenarioActive?"View Base":"View Scen."}</button>
              <button type="button" onClick={() => { setScenarioActive(false); onResetScenario(); }} className="w-full rounded-[5px] border border-white/[0.10] py-[5px] text-[9px] font-bold uppercase tracking-[0.10em] text-zinc-400 hover:text-zinc-200 [font-family:var(--font-text),sans-serif]">Close</button>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlPanel({
  dataset,
  startFilter,
  lineMode,
  activeGroups,
  onStartFilter,
  onLineMode,
  onToggleGroup,
}: {
  dataset: AnalyticsDataset;
  startFilter: StartFilter;
  lineMode: LineMode;
  activeGroups: string[];
  onStartFilter: (filter: StartFilter) => void;
  onLineMode: (mode: LineMode) => void;
  onToggleGroup: (group: string) => void;
}) {
  const controlGroups =
    dataset.tab === "invest"
      ? dataset.groups.map((group) => ({
          id: group.id,
          label: group.label,
          disabled: !dataset.groupSeries[group.id]?.length,
        }))
      : buildControlGroups(dataset);

  return (
    <Card>
      <CardHeader title="Control Panel" />
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <div>
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-text),sans-serif]">Zeitraum</p>
          <div className="flex flex-wrap gap-2">
            {START_FILTERS.map((filter) => (
              <PillButton key={filter} active={startFilter === filter} onClick={() => onStartFilter(filter)}>
                {filter}
              </PillButton>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-text),sans-serif]">Linien</p>
          <div className="flex flex-wrap gap-2">
            <PillButton active={lineMode === "portfolio"} onClick={() => onLineMode("portfolio")}>
              Portfolio
            </PillButton>
            <PillButton active={lineMode === "assets"} onClick={() => onLineMode("assets")}>
              Assets
            </PillButton>
            <PillButton active={lineMode === "benchmark"} disabled={!dataset.benchmarkSeries.length} onClick={() => onLineMode("benchmark")}>
              Benchmark
            </PillButton>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-text),sans-serif]">
            {dataset.tab === "invest" ? "Assets" : "Gruppen"}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {controlGroups.map((group) => {
              const active = activeGroups.includes(group.id);
              return (
                <button
                  key={group.label}
                  type="button"
                  disabled={group.disabled}
                  onClick={() => onToggleGroup(group.id)}
                  className={cn(
                    "flex items-center justify-between rounded-[10px] border px-2.5 py-1.5 text-left transition-colors",
                    group.disabled
                      ? "cursor-not-allowed border-white/[0.05] text-zinc-700 opacity-50"
                      : active
                        ? "border-white/20 bg-white/[0.05] text-white"
                        : "border-white/[0.06] text-zinc-300 hover:bg-white/[0.02]",
                  )}
                >
                  <span className="text-[10px] [font-family:var(--font-text),sans-serif]">{group.label}</span>
                  <span className="text-[10px] [font-family:var(--font-text),sans-serif]">
                    {group.disabled ? "n/a" : active ? "on" : "off"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function WsLiveControlPanel({
  weights,
  enabled,
  riskMultiplier,
  onWeightChange,
  onToggle,
  onRiskChange,
  onReset,
}: {
  weights: Record<string, number>;
  enabled: Record<string, boolean>;
  riskMultiplier: number;
  onWeightChange: (id: string, val: number) => void;
  onToggle: (id: string) => void;
  onRiskChange: (mult: number) => void;
  onReset: () => void;
}) {
  const activeIds = WS_STRATEGY_IDS.filter(id => enabled[id] !== false);
  const totalW = activeIds.reduce((s, id) => s + (weights[id] ?? 0), 0);

  // 6 WS strategies in 3 rows of 2; Intraday gets its own full-width row
  const wsPairs: Array<[string, string]> = [
    ["GC1 Friday Long", "GLD Thursday Long"],
    ["YM1 TAT",         "UKX Valuation"],
    ["CT1 Macro A",     "NQ1 Trend LO"],
  ];

  function StratCell({ id, wide = false }: { id: string; wide?: boolean }) {
    const isOn = enabled[id] !== false;
    const isIntraday = id === WS_INTRADAY_ID;
    return (
      <div className={cn(
        "flex items-center gap-1 rounded-[8px] border px-1.5 py-0.5 transition-colors",
        isOn
          ? isIntraday
            ? "border-amber-500/30 bg-amber-500/[0.04]"
            : "border-white/[0.12] bg-white/[0.03]"
          : "border-white/[0.05]",
      )}>
        <button type="button" onClick={() => onToggle(id)} className="min-w-0 flex-1 text-left">
          <span className={cn(
            "block truncate text-[8px] font-medium leading-tight [font-family:var(--font-text),sans-serif]",
            isOn ? (isIntraday ? "text-amber-300" : "text-zinc-200") : "text-zinc-600",
          )}>
            {WS_STRATEGY_SHORT[id]}
          </span>
          <span className={cn(
            "text-[7px] [font-family:var(--font-text),sans-serif]",
            isIntraday ? "text-amber-700" : "text-zinc-700",
          )}>
            {isIntraday ? "White Swan · EUR/DAX1H/DAX2H" : isOn ? "on" : "off"}
          </span>
        </button>
        <input
          type="number" min={0} max={100} step={0.5}
          value={weights[id] ?? 0}
          disabled={!isOn}
          onChange={e => onWeightChange(id, Math.max(0, Number(e.target.value)))}
          className="w-7 rounded border border-white/[0.08] bg-white/[0.04] px-0.5 py-0.5 text-right text-[8px] text-white disabled:opacity-30 [font-family:var(--font-text),sans-serif] focus:border-white/20 focus:outline-none"
        />
        <span className="text-[7px] text-zinc-700 [font-family:var(--font-text),sans-serif]">%</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader title="Gewichtung anpassen" />
      <div className="flex flex-1 flex-col px-3 py-1.5 gap-0.5">
        {/* 6 WS strategies in 2-column grid */}
        {wsPairs.map(([left, right]) => (
          <div key={left} className="grid grid-cols-2 gap-1">
            <StratCell id={left} />
            <StratCell id={right} />
          </div>
        ))}
        {/* Intraday group — full-width, visually distinct */}
        <div className="border-t border-amber-500/20 pt-0.5">
          <StratCell id={WS_INTRADAY_ID} wide />
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between px-0.5 pt-0.5">
          <span className="text-[8px] text-zinc-600 [font-family:var(--font-text),sans-serif]">
            Σ {totalW.toFixed(1)}%
          </span>
          <button
            type="button" onClick={onReset}
            className="text-[8px] text-zinc-600 hover:text-zinc-300 [font-family:var(--font-text),sans-serif] transition-colors"
          >
            ↺ Reset
          </button>
        </div>
        <div className="border-t border-white/[0.06] pt-1">
          <p className="mb-0.5 text-[8px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-text),sans-serif]">
            Gesamtrisiko
          </p>
          <div className="flex gap-1">
            {([1, 1.5, 2, 2.5, 3] as const).map(m => (
              <PillButton key={m} active={riskMultiplier === m} onClick={() => onRiskChange(m)}>
                {m}×
              </PillButton>
            ))}
          </div>
        </div>
        <p className="mt-0.5 text-[7px] text-zinc-700 [font-family:var(--font-text),sans-serif]">
          White Swan v1.1 · PAPER_ONLY · Frozen 2026-07-20
        </p>
      </div>
    </Card>
  );
}

export function AnalyticsDashboard({ fsportfolio, capalifeData }: { fsportfolio: FSPortfolioSnapshot | undefined; capalifeData: CapalifeData }) {
  const router = useRouter();
  const [tab, setTab] = useState<AnalyticsTab>("whiteSwan");
  const [mode, setMode] = useState<AnalyticsMode>("live");
  const [startFilter, setStartFilter] = useState<StartFilter>("Max");
  const [lineMode, setLineMode] = useState<LineMode>("portfolio");
  const [benchmarkEnabled, setBenchmarkEnabled] = useState(false);
  const [compounded, setCompounded] = useState(true);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("own");
  const [investWeights, setInvestWeights] = useState<Record<string, number>>({ ...LIVE_DEFAULT_WEIGHTS });
  const [investEnabled, setInvestEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(LIVE_ASSET_SYMBOLS.map((sym) => [sym, true]))
  );
  const [wsWeights, setWsWeights] = useState<Record<string, number>>(() => {
    try { const s = typeof window !== "undefined" ? localStorage.getItem("ws-weights") : null; return s ? (JSON.parse(s) as Record<string, number>) : { ...WS_FROZEN_WEIGHTS }; } catch { return { ...WS_FROZEN_WEIGHTS }; }
  });
  const [wsEnabled, setWsEnabled] = useState<Record<string, boolean>>(
    () => ({ ...WS_DEFAULT_ENABLED })
  );
  const [anomalyGroupSeries, setAnomalyGroupSeries] = useState<Record<string, AnalyticsSeriesPoint[]>>({});
  const [brainValSeries, setBrainValSeries]         = useState<Record<string, AnalyticsSeriesPoint[]>>({});
  const [wsRiskMultiplier, setWsRiskMultiplier] = useState<number>(() => {
    try { const s = typeof window !== "undefined" ? localStorage.getItem("ws-risk-multiplier") : null; return s ? Number(s) : 2.5; } catch { return 2.5; }
  });
  const [combinedWsWeight, setCombinedWsWeight] = useState(50);

  // Scenario state for Core Invest
  const [scenarioCurves,  setScenarioCurves]  = useState<ScenarioEquityCurves | null>(null);
  const [scenarioAnnual,  setScenarioAnnual]  = useState<Array<{label:string;value:number;spy?:number;partial?:boolean}>|null>(null);
  const [scenarioMetrics, setScenarioMetrics] = useState<Record<string,number|string>|null>(null);
  const [scenarioActive,  setScenarioActive]  = useState(false);
  const [scenarioRunId,   setScenarioRunId]   = useState<string | null>(null);

  const handleScenarioResult = useCallback((curves: ScenarioEquityCurves, annual: unknown, metrics: Record<string,number>, run: ScenarioRun) => {
    // Normalize Python snake_case keys to the camelCase keys buildKpiCards reads from
    const m = metrics;
    const normalized: Record<string, number | string> = { ...m };
    if (m.total_return_pct !== undefined)   normalized.totalReturnPct          = m.total_return_pct;
    if (m.cagr_pct !== undefined)           normalized.cagrPct                 = m.cagr_pct;
    if (m.volatility_pct !== undefined)     normalized.annualizedVolatilityPct = m.volatility_pct;
    if (m.max_drawdown_pct !== undefined)   normalized.maxDrawdownPct          = m.max_drawdown_pct;
    if (m.positive_months_pct !== undefined) normalized.positiveMonthsPct      = m.positive_months_pct;
    if (m.beta_to_spy !== undefined)        normalized.betaToSpy               = m.beta_to_spy;
    if (m.correlation_to_spy !== undefined) normalized.correlationToSpy        = m.correlation_to_spy;
    if (m.worst_year_pct !== undefined)     normalized.worstYearPct            = m.worst_year_pct;
    if (m.data_points !== undefined)        normalized.dataPoints              = m.data_points;
    // tradeCount: scenario runs don't have a separate trade list — show "Scenario"
    normalized.tradeCount = "Scenario";
    setScenarioCurves(curves);
    setScenarioAnnual(annual as Array<{label:string;value:number;spy?:number;partial?:boolean}>|null);
    setScenarioMetrics(normalized);
    setScenarioRunId(run.runId ?? null);
    setScenarioActive(true);
  }, []);

  const handleResetScenario = useCallback(() => {
    setScenarioCurves(null); setScenarioAnnual(null); setScenarioMetrics(null); setScenarioRunId(null); setScenarioActive(false);
  }, []);

  useEffect(() => {
    try { localStorage.setItem("ws-weights", JSON.stringify(wsWeights)); } catch { /* ignore */ }
  }, [wsWeights]);
  useEffect(() => {
    try { localStorage.setItem("ws-risk-multiplier", String(wsRiskMultiplier)); } catch { /* ignore */ }
  }, [wsRiskMultiplier]);

  // Load anomaly OOS equity curves from individual trade JSON files (trade-level resolution)
  useEffect(() => {
    const files: Array<[string, string]> = [
      ["GC1 Friday Long",   "/data/anomaly/gc1_friday_long.json"],
      ["GLD Thursday Long", "/data/anomaly/gld_thursday_long.json"],
      ["YM1 TAT",           "/data/anomaly/ym1_tat.json"],
    ];
    Promise.all(
      files.map(([id, url]) =>
        fetch(url).then(r => r.ok ? r.json() : null).then(d => ({ id, d })).catch(() => ({ id, d: null }))
      )
    ).then(results => {
      const series: Record<string, AnalyticsSeriesPoint[]> = {};
      for (const { id, d } of results) {
        const oos: Array<{ time: string; value: number }> = d?.equityCurve?.oos ?? [];
        if (!oos.length) continue;
        const base = oos[0].value;
        series[id] = oos.map(p => ({ date: p.time, value: Number(((p.value / base - 1) * 100).toFixed(2)) }));
      }
      setAnomalyGroupSeries(series);
    });
  }, []);

  // Load Brain valuation equity curves (daily normalized CSV → monthly % change)
  useEffect(() => {
    const files: Array<[string, string]> = [
      ["NVDA Valuation",   "stocks/NVDA"],
      ["ZARUSD Valuation", "forex/ZARUSD"],
      ["GC1 Valuation",    "metals_energy/GC1"],
      ["MSFT Valuation",   "stocks/MSFT"],
      ["BRLUSD Valuation", "forex/BRLUSD"],
      ["SEKUSD Valuation", "forex/SEKUSD"],
    ];
    Promise.all(
      files.map(([id, key]) =>
        fetch(`/api/monitoring/brain-equity?key=${encodeURIComponent(key)}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => ({ id, pts: (d?.pts ?? []) as Array<{ time: string; value: number }> }))
          .catch(() => ({ id, pts: [] as Array<{ time: string; value: number }> }))
      )
    ).then(results => {
      const series: Record<string, AnalyticsSeriesPoint[]> = {};
      for (const { id, pts } of results) {
        if (!pts.length) continue;
        // downsample daily → monthly: last trading day per month
        const byMonth: Record<string, AnalyticsSeriesPoint> = {};
        for (const p of pts) {
          const mo = p.time.slice(0, 7);
          byMonth[mo] = { date: p.time, value: p.value };
        }
        series[id] = Object.entries(byMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, p]) => p);
      }
      if (Object.keys(series).length) setBrainValSeries(series);
    });
  }, []);

  const baseDataset = useMemo(() => getAnalyticsDataset(tab, mode, fsportfolio, capalifeData), [tab, mode, fsportfolio, capalifeData]);
  // Merge trade-level anomaly curves + Brain valuation daily curves into the base groupSeries
  const baseDatasetWithTrades = useMemo(() => {
    const extra = { ...anomalyGroupSeries, ...brainValSeries };
    if (!Object.keys(extra).length) return baseDataset;
    return { ...baseDataset, groupSeries: { ...baseDataset.groupSeries, ...extra } };
  }, [baseDataset, anomalyGroupSeries, brainValSeries]);
  const ciBaseForCombined = useMemo(() => tab === "combined" ? getAnalyticsDataset("invest", "backtest", fsportfolio, capalifeData) : null, [tab, fsportfolio, capalifeData]);
  const dataset = useMemo(() => {
    if (tab === "invest") {
      // Scoped per-asset weighting needs a ready snapshot (local, with OHLC).
      // Without it (e.g. Vercel: the base is the Pine backtest fallback), render
      // the base dataset directly so the curve/metrics show instead of an empty
      // recomputation.
      // Only scope when the snapshot has full history (adaptiveStartDate ≤ 2005).
      // Sparse Supabase data (post-2005 start) produces misleading metrics — fall back to baseDataset (Pine).
      return baseDataset;
    }
    if (tab === "whiteSwan" && mode === "backtest") {
      return buildScopedWsDataset(baseDatasetWithTrades, wsWeights, wsEnabled, wsRiskMultiplier);
    }
    if (tab === "combined" && ciBaseForCombined) {
      const ciScoped = fsportfolio?.backtest?.ready
        ? buildScopedInvestDataset(fsportfolio, "backtest", investWeights, investEnabled, startFilter, ciBaseForCombined)
        : ciBaseForCombined;
      const wsDatasetForCombined = buildWsDatasetFromEquityFile(capalifeData.wsPortfolioEquity, ciScoped.benchmarkSeries);
      return buildCombinedDataset(wsDatasetForCombined, ciScoped, combinedWsWeight / 100);
    }
    return baseDataset;
  }, [baseDataset, ciBaseForCombined, tab, mode, fsportfolio, investWeights, investEnabled, startFilter, wsWeights, wsEnabled, wsRiskMultiplier, combinedWsWeight, capalifeData.wsPortfolioEquity]);
  const [activeGroups, setActiveGroups] = useState<string[]>(dataset.groups.map((group) => group.id));
  const [primaryAsset, setPrimaryAsset] = useState<string | null>(null);
  const refreshAnalytics = useCallback(() => {
    if (tab === "invest") router.refresh();
  }, [tab, router]);
  useGlobalRefresh(refreshAnalytics, { enabled: tab === "invest" });

  const handlePrimaryAsset = useCallback((id: string) => {
    setPrimaryAsset((prev) => (prev === id ? null : id));
  }, []);

  const handleToggleGroup = useCallback((id: string) => {
    setActiveGroups((prev) => {
      if (prev.includes(id)) {
        setPrimaryAsset((p) => (p === id ? null : p));
        return prev.filter((g) => g !== id);
      }
      return [...prev, id];
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setActiveGroups(dataset.groups.filter((g) => dataset.groupSeries[g.id]?.length).map((g) => g.id));
  }, [dataset]);

  const handleClearGroups = useCallback(() => {
    setActiveGroups([]);
    setPrimaryAsset(null);
  }, []);

  useEffect(() => {
    const allWithData = dataset.groups.filter((group) => dataset.groupSeries[group.id]?.length).map((group) => group.id);
    // Default to SPY, QQQ, RSP for Core Invest asset mode; otherwise all groups
    const DEFAULT_ASSET_SET = ["SPY", "QQQ", "RSP"];
    const isInvest = dataset.tab === "invest";
    const defaults = isInvest
      ? DEFAULT_ASSET_SET.filter((id) => allWithData.includes(id)).length >= 2
        ? DEFAULT_ASSET_SET.filter((id) => allWithData.includes(id))
        : allWithData
      : allWithData;
    setActiveGroups(defaults);
    setPrimaryAsset(isInvest ? "SPY" : null);
    setStartFilter("Max");
    setLineMode(dataset.mode === "live" && dataset.tab === "invest" && !dataset.performanceSeries.length && defaults.length ? "assets" : "portfolio");
    setBenchmarkEnabled(false);
    setCompounded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mode]);

  // Active dataset: merges scenario curves when scenario is active on invest tab
  const activeDataset = useMemo(() => {
    if (tab !== "invest" || mode === "live" || !scenarioActive || !scenarioCurves) return dataset;
    const scenarioOverrides: Record<string, number | string> = scenarioMetrics
      ? Object.fromEntries(Object.entries(scenarioMetrics).map(([k, v]) => [k, v]))
      : {};
    if (scenarioRunId) {
      scenarioOverrides.dataStatus = "SCENARIO";
      scenarioOverrides.runId = scenarioRunId;
    }
    return {
      ...dataset,
      performanceSeries: scenarioCurves.performance,
      drawdownSeries:    scenarioCurves.drawdown,
      benchmarkSeries:   scenarioCurves.benchmark ?? dataset.benchmarkSeries,
      annualReturns:     scenarioAnnual ?? dataset.annualReturns,
      metrics: { ...dataset.metrics, ...scenarioOverrides },
    };
  }, [tab, scenarioActive, scenarioCurves, scenarioAnnual, scenarioMetrics, scenarioRunId, dataset]);

  // When in asset mode with a primary asset selected, compute KPIs from fullGroupSeries.
  // fullGroupSeries contains all real trading days (not display-downsampled points).
  const primaryAssetDataset = useMemo((): AnalyticsDataset | null => {
    if (lineMode !== "assets") return null;
    const assetId = primaryAsset ?? (activeGroups.find((g) => activeDataset.groupSeries[g]?.length) ?? null);
    if (!assetId) return null;
    // Prefer full daily series for KPI math; fall back to display series if unavailable.
    const raw = activeDataset.fullGroupSeries?.[assetId] ?? activeDataset.groupSeries[assetId];
    if (!raw?.length) return null;
    const filtered = rebaseSeries(filterSeries(raw, startFilter));
    if (filtered.length < 2) return null;
    // Compute daily returns from cumulative % series
    const dailyReturns: Record<string, number> = {};
    for (let i = 1; i < filtered.length; i++) {
      const prev = filtered[i - 1]!;
      const curr = filtered[i]!;
      const r = (1 + curr.value / 100) / (1 + prev.value / 100) - 1;
      dailyReturns[curr.date] = r;
    }
    const daily = Object.values(dailyReturns);
    const n = daily.length;
    const totalReturn = filtered.at(-1)!.value;
    const startDate = new Date(`${filtered[0]!.date}T00:00:00Z`);
    const endDate = new Date(`${filtered.at(-1)!.date}T00:00:00Z`);
    const years = Math.max(1 / 365, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    const cagr = (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100;
    const avgR = n ? daily.reduce((s, v) => s + v, 0) / n : 0;
    const variance = n ? daily.reduce((s, v) => s + (v - avgR) ** 2, 0) / n : 0;
    const vol = Math.sqrt(variance) * Math.sqrt(252) * 100;
    const downside = daily.filter((v) => v < 0);
    const downVar = downside.length ? downside.reduce((s, v) => s + v ** 2, 0) / downside.length : 0;
    const sortino = downVar > 0 ? (avgR * 252) / (Math.sqrt(downVar) * Math.sqrt(252)) : 0;
    const sharpe = vol > 0 ? (cagr) / vol : 0;
    // Drawdown from filtered series
    const drawdownSeries = computeDrawdown(filtered);
    const maxDD = drawdownSeries.reduce((mn, p) => Math.min(mn, p.value), 0);
    const calmar = maxDD < 0 ? cagr / Math.abs(maxDD) : 0;
    // Annual returns from cumulative series
    const annualMap = new Map<string, { startVal: number; endVal: number }>();
    for (const p of filtered) {
      const year = p.date.slice(0, 4);
      if (!annualMap.has(year)) annualMap.set(year, { startVal: p.value, endVal: p.value });
      annualMap.get(year)!.endVal = p.value;
    }
    const annualReturns = [...annualMap.entries()].map(([year, { startVal, endVal }]) => ({
      label: year,
      value: Number(((((1 + endVal / 100) / (1 + startVal / 100)) - 1) * 100).toFixed(2)),
    }));
    // Monthly returns
    const monthlyReturns = (activeDataset.monthlyReturns.length ? activeDataset.monthlyReturns : []);
    const posMonths = annualReturns.filter((b) => b.value >= 0).length;
    const metrics: Record<string, number | string> = {
      ...activeDataset.metrics,
      totalReturnPct: Number(totalReturn.toFixed(2)),
      cagrPct: Number(cagr.toFixed(2)),
      maxDrawdownPct: Number(maxDD.toFixed(2)),
      annualizedVolatilityPct: Number(vol.toFixed(2)),
      sharpe: Number(sharpe.toFixed(2)),
      sortino: Number(sortino.toFixed(2)),
      calmar: Number(calmar.toFixed(2)),
      positiveMonthsPct: annualReturns.length ? Number(((posMonths / annualReturns.length) * 100).toFixed(1)) : "n/a",
      dataPoints: filtered.length,
      tradeCount: assetId,
      dataStatus: `ASSET · ${assetId}`,
      assetFullPoints: activeDataset.assetMeta?.[assetId]?.fullPoints ?? filtered.length,
      assetDisplayPoints: activeDataset.assetMeta?.[assetId]?.displayPoints ?? filtered.length,
      assetMaxDailyReturnPct: activeDataset.assetMeta?.[assetId]?.maxDailyReturnPct ?? "n/a",
    };
    return {
      ...activeDataset,
      performanceSeries: filtered,
      drawdownSeries,
      annualReturns,
      monthlyReturns,
      metrics,
    };
  }, [lineMode, primaryAsset, activeGroups, activeDataset, startFilter]);

  const effectiveDataset = (lineMode === "assets" && primaryAssetDataset) ? primaryAssetDataset : activeDataset;

  const visiblePerformanceSeries =
    lineMode === "assets" && activeGroups.length && Object.keys(activeDataset.groupSeries).length
      ? aggregateGroupSeries(activeDataset.groupSeries, activeGroups)
      : activeDataset.performanceSeries;

  const filteredPerformanceSeries = rebaseSeries(filterSeries(visiblePerformanceSeries, startFilter));
  const filteredAnnualReturns = tab === "invest"
    ? effectiveDataset.annualReturns
    : dataset.annualReturns.filter((item) => {
        if (startFilter === "Max") return true;
        if (startFilter === "2008") return Number(item.label.slice(0, 4)) >= 2008;
        if (startFilter === "2015") return Number(item.label.slice(0, 4)) >= 2015;
        const endYear = Number(dataset.period.end?.slice(0, 4) ?? item.label.slice(0, 4));
        const itemYear = Number(item.label.slice(0, 4));
        if (startFilter === "YTD" || startFilter === "1Y") return itemYear >= endYear;
        if (startFilter === "3Y") return itemYear >= endYear - 2;
        if (startFilter === "5Y") return itemYear >= endYear - 4;
        return true;
      });

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden">
      <TopTabs tab={tab} mode={mode} onTabChange={setTab} onModeChange={setMode} />

      <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden pr-1">
        <div className="grid min-h-full grid-cols-12 gap-4 xl:h-full xl:grid-rows-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,4fr)]">
          <div className="col-span-12 xl:col-span-8">
            <PerformanceCard
              dataset={activeDataset}
              startFilter={startFilter}
              lineMode={lineMode}
              benchmarkEnabled={benchmarkEnabled}
              activeGroups={activeGroups}
              compounded={compounded}
              primaryAsset={primaryAsset}
              periodMode={periodMode}
              onStartFilter={setStartFilter}
              onLineMode={setLineMode}
              onCompounded={setCompounded}
              onPrimaryAsset={handlePrimaryAsset}
              onToggleGroup={handleToggleGroup}
              onSelectAll={handleSelectAll}
              onClear={handleClearGroups}
              onPeriodMode={setPeriodMode}
            />
          </div>

          <div className="col-span-12 xl:col-span-4">
            <KpiGrid cards={buildKpiCards(effectiveDataset, lineMode, effectiveDataset.benchmarkSeries, capalifeData)} />
          </div>

          <div className="col-span-12 xl:col-span-8">
            <DrawdownCard dataset={effectiveDataset} visibleSeries={filteredPerformanceSeries} benchmarkEnabled={benchmarkEnabled} lineMode={lineMode} />
          </div>

          <div className="col-span-12 xl:col-span-4">
            <OverviewCard rows={buildOverviewRows(activeDataset)} />
          </div>

          <div className="col-span-12 md:col-span-4">
            <BarsCard title="Annual Returns" items={filteredAnnualReturns} />
          </div>

          <div className="col-span-12 md:col-span-4">
            <BarsCard
              title={tab === "whiteSwan" && mode === "backtest" ? "Seasonality (Ø Jan–Dez)" : "Monthly Returns"}
              items={tab === "whiteSwan" && mode === "backtest" ? (() => {
                const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                const groups: number[][] = Array.from({ length: 12 }, () => []);
                for (const bar of effectiveDataset.monthlyReturns) {
                  const m = parseInt(bar.label.slice(5, 7), 10) - 1;
                  if (m >= 0 && m < 12) groups[m]!.push(bar.value);
                }
                return groups.map((vals, i) => ({
                  label: MONTHS[i]!,
                  value: vals.length ? Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)) : 0,
                }));
              })() : effectiveDataset.monthlyReturns}
            />
          </div>

          <div className="col-span-12 md:col-span-4">
            {tab === "combined" ? (
              <CombinedControlPanel
                wsWeight={combinedWsWeight}
                riskMultiplier={wsRiskMultiplier}
                onWsWeightChange={setCombinedWsWeight}
                onRiskChange={setWsRiskMultiplier}
                onReset={() => setCombinedWsWeight(50)}
              />
            ) : tab === "invest" ? (
              <InvestControlPanel
                dataset={dataset}
                onScenarioResult={handleScenarioResult}
                onResetScenario={handleResetScenario}
              />
            ) : tab === "whiteSwan" && mode === "backtest" ? (
              <WsLiveControlPanel
                weights={wsWeights}
                enabled={wsEnabled}
                riskMultiplier={wsRiskMultiplier}
                onWeightChange={(id, val) => setWsWeights(prev => ({ ...prev, [id]: val }))}
                onToggle={id => setWsEnabled(prev => ({ ...prev, [id]: !(prev[id] !== false) }))}
                onRiskChange={setWsRiskMultiplier}
                onReset={() => {
                  setWsWeights({ ...WS_FROZEN_WEIGHTS });
                  setWsEnabled({ ...WS_DEFAULT_ENABLED });
                  setWsRiskMultiplier(2.5);
                }}
              />
            ) : tab === "whiteSwan" ? (
              <ControlPanel
                dataset={dataset}
                startFilter={startFilter}
                lineMode={lineMode}
                activeGroups={activeGroups}
                onStartFilter={setStartFilter}
                onLineMode={setLineMode}
                onToggleGroup={group => setActiveGroups(cur => cur.includes(group) ? cur.filter(g => g !== group) : [...cur, group])}
              />
            ) : (
              <ControlPanel
                dataset={dataset}
                startFilter={startFilter}
                lineMode={lineMode}
                activeGroups={activeGroups}
                onStartFilter={setStartFilter}
                onLineMode={setLineMode}
                onToggleGroup={(group) =>
                  setActiveGroups((current) =>
                    current.includes(group) ? current.filter((item) => item !== group) : [...current, group],
                  )
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
