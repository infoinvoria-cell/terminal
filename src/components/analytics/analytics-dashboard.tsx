"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useEffectEvent } from "react";
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
import type { CapalifeData, WsPortfolioEquityFile } from "@/lib/capitalife-data";
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
const LIVE_DEFAULT_WEIGHTS: Record<string, number> = { SPY: 5, SPMO: 5, QQQ: 45, GLD: 25, WHITE_SWAN_NAS_EMA: 5, QQQ_PINE_2_EMA: 5, COPPER_HG: 5, CHF_6S: 5 };
const LIVE_ORIGINAL_WEIGHTS: Record<string, number> = { SPY: 5, SPMO: 5, QQQ: 45, GLD: 25, WHITE_SWAN_NAS_EMA: 5, QQQ_PINE_2_EMA: 5, COPPER_HG: 5, CHF_6S: 5 };
const LIVE_ASSET_SYMBOLS = ["SPY", "SPMO", "QQQ", "GLD", "WHITE_SWAN_NAS_EMA", "QQQ_PINE_2_EMA", "COPPER_HG", "CHF_6S"] as const;
const LIVE_ASSET_LABELS: Record<string, string> = { SPY: "SPY", SPMO: "SPMO", QQQ: "QQQ passive", GLD: "GLD", WHITE_SWAN_NAS_EMA: "QQQ Pine 1", QQQ_PINE_2_EMA: "QQQ Pine 2 EMA", COPPER_HG: "Copper/HG", CHF_6S: "CHF/6S" };

// ── White Swan v1.1 constants ─────────────────────────────────────────────────
const WS_STRATEGY_IDS = [
  "GC1 Friday Long", "GLD Thursday Long", "YM1 TAT",
  "UKX Valuation", "CT1 Macro A", "NQ1 Trend LO",
  "Intraday MT v3-F",
] as const;
// v1.1 frozen weights: 6 WS × 0.70 + Intraday 30%
const WS_FROZEN_WEIGHTS: Record<string, number> = {
  "GC1 Friday Long":   13.86,
  "GLD Thursday Long": 13.86,
  "YM1 TAT":           13.86,
  "UKX Valuation":     13.86,
  "CT1 Macro A":        7.56,
  "NQ1 Trend LO":       7.00,
  "Intraday MT v3-F":  30.00,
};
const WS_STRATEGY_SHORT: Record<string, string> = {
  "GC1 Friday Long":   "GC1! Friday",
  "GLD Thursday Long": "GLD Thursday",
  "YM1 TAT":           "YM1! TAT",
  "UKX Valuation":     "UKX Val",
  "CT1 Macro A":       "CT1 Macro",
  "NQ1 Trend LO":      "NQ1 Trend",
  "Intraday MT v3-F":  "Intraday v3-F",
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
  Intraday: "#f3f4f6",
  Agrar: "#d7dbe3",
  Metalle: "#c9ccd3",
  Energy: "#bbbec8",
  Indizes: "#aeb2bc",
  Aktien: "#9ea3af",
  Forex: "#8f96a4",
  Anomalien: "#7f8696",
  Invest: "#e8eaef",
  SPY: "#d4d8e0",
  SPMO: "#b0b5be",
  QQQ: "#8d939f",
  GLD: "#7a8090",
  WHITE_SWAN_NAS_EMA: "#e8d89a",
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
    <div className="rounded-lg border border-white/[0.08] bg-[#12131a]/95 px-3 py-2 text-[11px] shadow-xl [font-family:var(--font-montserrat),sans-serif]">
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
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border bg-[#17181b] shadow-[0_18px_45px_rgba(0,0,0,0.22)]",
        className,
      )}
      style={{ borderColor: "rgba(255,255,255,0.075)" }}
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
        <p className="text-[12px] font-medium tracking-[0.04em] text-[#8d8f98] [font-family:var(--font-montserrat),sans-serif]">{title}</p>
        {subtitle ? <p className="mt-1 text-[10px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
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
        "shrink-0 rounded-full border [font-family:var(--font-montserrat),sans-serif] transition-colors",
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
    return [
      ["Strategy", "Core Invest v2.0"],
      ["Version", "v2.0 — frozen 2026-07-20 · APPROVED"],
      ["ETF Core", "QQQ 45% · GLD 25% · SPMO 5% · SPY 5% (80%)"],
      ["Sleeves", "Pine1 5% · Pine2 5% · HG1! 5% · 6S1! 5% (20%)"],
      ["OOS CAGR", "17.11% (2019–2026)"],
      ["OOS Sharpe", "1.152"],
      ["OOS MaxDD", "−21.7%"],
      ["OOS Calmar", "0.787"],
      ["WF Beat", "60% · PASS"],
      ["Gate", "APPROVED v2.0 · Frozen 2026-07-20"],
      ["Execution", "none · Paper Trading only"],
    ];
  }

  if (dataset.tab === "invest" && dataset.mode === "backtest") {
    const adaptiveStart = dataset.metrics.adaptiveStart ? String(dataset.metrics.adaptiveStart) : "n/a";
    const fullCoreStart = dataset.metrics.fullCoreStart ? String(dataset.metrics.fullCoreStart) : "n/a";
    return [
      ["Strategy", "Core Invest v2.0"],
      ["ETF Core", "QQQ 45% · GLD 25% · SPMO 5% · SPY 5% (80%)"],
      ["Sleeves", "Pine1 5% · Pine2 5% · HG1! 5% · 6S1! 5% (20%)"],
      ["IS (2000-2018)", "CAGR 7.79% · Sh 0.669 · DD -34.5% · Cal 0.226"],
      ["OOS (2019-2026)", "CAGR 17.11% · Sh 1.152 · DD -21.7% · Cal 0.787"],
      ["WF Beat", "60% · PASS"],
      ["Gate", "APPROVED v2.0 · Frozen 2026-07-20"],
      ["Adaptive Start", adaptiveStart],
      ["Full-Core Start", fullCoreStart],
      ["Market Data", "OHLC + QQQ Pine + HG + CHF"],
      ["Execution", "none · Paper Trading only"],
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
      ["Portfolio", "White Swan v1.1"],
      ["Strategien", "7 (6 WS + Intraday)"],
      ["GC1 Friday Long", "13.86%"],
      ["GLD Thursday Long", "13.86%"],
      ["YM1 TAT", "13.86%"],
      ["UKX Valuation", "13.86%"],
      ["CT1 Macro A", "7.56%"],
      ["NQ1 Trend LO", "7.00%"],
      ["Intraday MT v3-F", "30.00%"],
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
              "flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors [font-family:var(--font-montserrat),sans-serif]",
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
              "rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.08em] [font-family:var(--font-montserrat),sans-serif]",
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

function PerformanceLegend({
  dataset,
  lineMode,
  visibleGroups,
}: {
  dataset: AnalyticsDataset;
  lineMode: LineMode;
  visibleGroups: string[];
}) {
  const legendItems =
    lineMode === "assets"
      ? visibleGroups.map((group) => ({
          key: group,
          label: dataset.groups.find((item) => item.id === group)?.label ?? group,
          color: GROUP_LINE_COLORS[group] ?? "#a1a1aa",
        }))
      : lineMode === "benchmark"
        ? [
            { key: "portfolio", label: "Portfolio", color: "#f3f4f6" },
            { key: "benchmark", label: "SPY", color: GROUP_LINE_COLORS.benchmark },
          ]
        : [];

  if (!legendItems.length) return null;

  return (
    <div className="flex flex-wrap gap-3 px-4 pb-2 text-[10px] text-zinc-400 [font-family:var(--font-montserrat),sans-serif]">
      {legendItems.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function PerformanceCard({
  dataset,
  startFilter,
  lineMode,
  benchmarkEnabled,
  activeGroups,
  compounded,
  onStartFilter,
  onLineMode,
  onCompounded,
}: {
  dataset: AnalyticsDataset;
  startFilter: StartFilter;
  lineMode: LineMode;
  benchmarkEnabled: boolean;
  activeGroups: string[];
  compounded: boolean;
  onStartFilter: (filter: StartFilter) => void;
  onLineMode: (mode: LineMode) => void;
  onCompounded: (v: boolean) => void;
}) {
  const baseSeries =
    lineMode === "assets" && Object.keys(dataset.groupSeries).length
      ? aggregateGroupSeries(dataset.groupSeries, activeGroups)
      : dataset.performanceSeries;

  const rawPerformanceSeries = downsampleSeries(filterSeries(baseSeries, startFilter));
  const rawBenchmarkSeries = downsampleSeries(filterSeries(dataset.benchmarkSeries, startFilter));
  const performanceSeries = compounded ? rawPerformanceSeries : toNonCompounded(rawPerformanceSeries);
  const benchmarkSeries = compounded ? rawBenchmarkSeries : toNonCompounded(rawBenchmarkSeries);
  const visibleGroups = activeGroups.filter((group) => dataset.groupSeries[group]?.length);

  const chartData = useMemo(() => {
    const rows = new Map<string, Record<string, string | number>>();
    for (const point of performanceSeries) {
      rows.set(point.date, { date: point.date, portfolio: point.value });
    }

    if (lineMode === "assets") {
      for (const group of visibleGroups) {
        const rawGroup = downsampleSeries(filterSeries(dataset.groupSeries[group], startFilter));
        const groupSeries = compounded ? rawGroup : toNonCompounded(rawGroup);
        for (const point of groupSeries) {
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

    return [...rows.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)));
  }, [benchmarkEnabled, benchmarkSeries, compounded, dataset.groupSeries, lineMode, performanceSeries, startFilter, visibleGroups]);

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
                <YAxis tick={{ fontSize: 9, fill: "#686b73" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value > 0 ? "+" : ""}${value.toFixed(0)}%`} />
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
                      <text x={(props.viewBox?.x ?? 0) + 4} y={(props.viewBox?.y ?? 0) + 14} fill="#67e8f9" fontSize={9} fontFamily="var(--font-montserrat),sans-serif">QQQ Pine Fwd</text>
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
                      <text x={(props.viewBox?.x ?? 0) + 4} y={(props.viewBox?.y ?? 0) + 14} fill="#6ee7b7" fontSize={9} fontFamily="var(--font-montserrat),sans-serif">Portfolio Live</text>
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
                      strokeWidth={1.1}
                      dot={false}
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
      <PerformanceLegend dataset={dataset} lineMode={lineMode} visibleGroups={visibleGroups} />
    </Card>
  );
}

function KpiGrid({ cards }: { cards: KpiCard[] }) {
  return (
    <Card className="p-2">
      <div className="grid h-full min-h-0 grid-cols-2 gap-1 xl:grid-cols-3">
        {cards.slice(0, 12).map((card) => (
          <div
            key={card.label}
            className="flex min-h-0 flex-col justify-between rounded-[10px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] px-2.5 py-1.5"
          >
            <p className="text-[8px] font-medium uppercase tracking-[0.08em] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
              {card.label}
            </p>
            <div className="flex items-end justify-between gap-1">
              <p className="line-clamp-1 text-[13px] font-bold leading-tight tracking-tight text-white [font-family:var(--font-nunito),sans-serif]">
                {card.value}
              </p>
              {card.delta ? (
                <p
                  className="mb-0.5 shrink-0 text-[9px] font-semibold [font-family:var(--font-montserrat),sans-serif]"
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
                    <stop offset="0%" stopColor="rgba(124,58,67,0.30)" />
                    <stop offset="100%" stopColor="rgba(124,58,67,0.04)" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 8, fill: "#686b73" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 8, fill: "#686b73" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
                <Area type="monotone" dataKey="value" name="Drawdown" stroke="rgba(172,96,104,0.86)" strokeWidth={1.45} fill="url(#analytics-drawdown-fill)" dot={false} />
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
                    <Cell key={item.label} fill={item.value >= 0 ? "rgba(232,234,239,0.88)" : "rgba(138,78,78,0.82)"} />
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
                <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">{item.left[0]}</p>
                <p className="line-clamp-1 text-[10px] text-zinc-200 [font-family:var(--font-montserrat),sans-serif]">{item.left[1]}</p>
              </div>
              {item.right ? (
                <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">{item.right[0]}</p>
                  <p className="line-clamp-1 text-[10px] text-zinc-200 [font-family:var(--font-montserrat),sans-serif]">{item.right[1]}</p>
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
  file: WsPortfolioEquityFile | null,
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
        <span className="min-w-0 flex-1 block truncate text-[8px] font-medium leading-tight text-zinc-200 [font-family:var(--font-montserrat),sans-serif]">
          {label}
        </span>
        <input
          type="number" min={0} max={100} step={5} value={value}
          onChange={e => onChange(Math.min(100, Math.max(0, Number(e.target.value))))}
          className="w-7 rounded border border-white/[0.08] bg-white/[0.04] px-0.5 py-0.5 text-right text-[8px] text-white [font-family:var(--font-montserrat),sans-serif] focus:border-white/20 focus:outline-none"
        />
        <span className="text-[7px] text-zinc-700 [font-family:var(--font-montserrat),sans-serif]">%</span>
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
          <span className="text-[8px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
            Σ {wsWeight + ciWeight}%
          </span>
          <button
            type="button" onClick={onReset}
            className="text-[8px] text-zinc-600 hover:text-zinc-300 [font-family:var(--font-montserrat),sans-serif] transition-colors"
          >
            ↺ Reset
          </button>
        </div>
        <div className="border-t border-white/[0.06] pt-1">
          <p className="mb-0.5 text-[8px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
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
        <p className="mt-0.5 text-[7px] text-zinc-700 [font-family:var(--font-montserrat),sans-serif]">
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

  // 8 assets in 4 rows of 2: [Pine1|SPY] [SPMO|QQQ] [GLD|Pine2] [Copper|CHF]
  const assetPairs: Array<[string, string | null]> = [
    ["WHITE_SWAN_NAS_EMA", "SPY"],
    ["SPMO", "QQQ"],
    ["GLD", "QQQ_PINE_2_EMA"],
    ["COPPER_HG", "CHF_6S"],
  ];

  const INVEST_ICONS: Record<string, string> = {
    WHITE_SWAN_NAS_EMA: "/assets/invest/qqq.png",
    SPY: "/assets/invest/spy.png",
    SPMO: "/assets/invest/spmo.png",
    QQQ: "/assets/invest/qqq.png",
    GLD: "/assets/invest/gld.png",
    QQQ_PINE_2_EMA: "/assets/invest/qqq.png",
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
            "block truncate text-[8px] font-medium leading-tight [font-family:var(--font-montserrat),sans-serif]",
            isOn ? "text-zinc-200" : "text-zinc-600",
          )}>
            {LIVE_ASSET_LABELS[sym]}
          </span>
          <span className="text-[7px] text-zinc-700 [font-family:var(--font-montserrat),sans-serif]">
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
          className="w-7 rounded border border-white/[0.08] bg-white/[0.04] px-0.5 py-0.5 text-right text-[8px] text-white disabled:opacity-30 [font-family:var(--font-montserrat),sans-serif] focus:border-white/20 focus:outline-none"
        />
        <span className="text-[7px] text-zinc-700 [font-family:var(--font-montserrat),sans-serif]">%</span>
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
          <span className="text-[8px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
            Σ {totalW.toFixed(1)}%
          </span>
          <button
            type="button"
            onClick={onReset}
            className="text-[8px] text-zinc-600 hover:text-zinc-300 [font-family:var(--font-montserrat),sans-serif] transition-colors"
          >
            ↺ Reset
          </button>
        </div>
        <p className="mt-0.5 text-[7px] text-zinc-700 [font-family:var(--font-montserrat),sans-serif]">
          Core Invest v2.0 · PAPER_ONLY · Frozen 2026-07-20
        </p>
      </div>
    </Card>
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
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">Zeitraum</p>
          <div className="flex flex-wrap gap-2">
            {START_FILTERS.map((filter) => (
              <PillButton key={filter} active={startFilter === filter} onClick={() => onStartFilter(filter)}>
                {filter}
              </PillButton>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">Linien</p>
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
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
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
                  <span className="text-[10px] [font-family:var(--font-montserrat),sans-serif]">{group.label}</span>
                  <span className="text-[10px] [font-family:var(--font-montserrat),sans-serif]">
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
            "block truncate text-[8px] font-medium leading-tight [font-family:var(--font-montserrat),sans-serif]",
            isOn ? (isIntraday ? "text-amber-300" : "text-zinc-200") : "text-zinc-600",
          )}>
            {WS_STRATEGY_SHORT[id]}
          </span>
          <span className={cn(
            "text-[7px] [font-family:var(--font-montserrat),sans-serif]",
            isIntraday ? "text-amber-700" : "text-zinc-700",
          )}>
            {isIntraday ? "v3-F · EUR/DAX/GBP/DAX2H" : isOn ? "on" : "off"}
          </span>
        </button>
        <input
          type="number" min={0} max={100} step={0.5}
          value={weights[id] ?? 0}
          disabled={!isOn}
          onChange={e => onWeightChange(id, Math.max(0, Number(e.target.value)))}
          className="w-7 rounded border border-white/[0.08] bg-white/[0.04] px-0.5 py-0.5 text-right text-[8px] text-white disabled:opacity-30 [font-family:var(--font-montserrat),sans-serif] focus:border-white/20 focus:outline-none"
        />
        <span className="text-[7px] text-zinc-700 [font-family:var(--font-montserrat),sans-serif]">%</span>
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
          <span className="text-[8px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
            Σ {totalW.toFixed(1)}%
          </span>
          <button
            type="button" onClick={onReset}
            className="text-[8px] text-zinc-600 hover:text-zinc-300 [font-family:var(--font-montserrat),sans-serif] transition-colors"
          >
            ↺ Reset
          </button>
        </div>
        <div className="border-t border-white/[0.06] pt-1">
          <p className="mb-0.5 text-[8px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
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
        <p className="mt-0.5 text-[7px] text-zinc-700 [font-family:var(--font-montserrat),sans-serif]">
          White Swan v1.1 · PAPER_ONLY · Frozen 2026-07-20
        </p>
      </div>
    </Card>
  );
}

type UploadSlot = { key: string; label: string; hint: string };

function DataUploadBar({ slots, onUpload }: { slots: UploadSlot[]; onUpload: (key: string, data: unknown) => void }) {
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [status, setStatus] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const slot of slots) {
      try { init[slot.key] = !!localStorage.getItem(slot.key); } catch { init[slot.key] = false; }
    }
    return init;
  });

  const handleFile = useCallback((key: string, file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target?.result as string);
        localStorage.setItem(key, JSON.stringify(data));
        setStatus(prev => ({ ...prev, [key]: true }));
        onUpload(key, data);
      } catch { /* ignore bad JSON */ }
    };
    reader.readAsText(file);
  }, [onUpload]);

  const handleClear = useCallback((key: string) => {
    localStorage.removeItem(key);
    setStatus(prev => ({ ...prev, [key]: false }));
    onUpload(key, null);
  }, [onUpload]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[8px] uppercase tracking-[0.1em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">Cache</span>
      {slots.map(slot => (
        <div key={slot.key} className="flex items-center gap-0.5">
          <button
            type="button"
            title={slot.hint}
            onClick={() => fileRefs.current[slot.key]?.click()}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] transition-colors [font-family:var(--font-montserrat),sans-serif] ${
              status[slot.key]
                ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-400"
                : "border-white/[0.06] text-zinc-600 hover:border-white/[0.12] hover:text-zinc-400"
            }`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${status[slot.key] ? "bg-emerald-500" : "bg-zinc-700"}`} />
            {slot.label}
          </button>
          {status[slot.key] && (
            <button
              type="button"
              title="Cache leeren"
              onClick={() => handleClear(slot.key)}
              className="text-[9px] text-zinc-700 hover:text-zinc-500 [font-family:var(--font-montserrat),sans-serif]"
            >✕</button>
          )}
          <input
            ref={el => { fileRefs.current[slot.key] = el; }}
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFile(slot.key, file);
              e.target.value = "";
            }}
          />
        </div>
      ))}
    </div>
  );
}

const UPLOAD_SLOTS: UploadSlot[] = [
  { key: "cap:an:ci", label: "CI Data", hint: "JSON: { backtest: Record<symbol,Record<date,return>>, live: Record<symbol,Record<date,return>>, livePhaseBStart?: string }" },
  { key: "cap:an:ws-equity", label: "WS BT Equity", hint: "portfolio_f10_equity.json — volle Datei inkl. meta, isOosSplit, equityCurve" },
  { key: "cap:an:ws-live", label: "WS Live Curve", hint: "JSON: [{date: string, value: number}] — live account equity series" },
];

export function AnalyticsDashboard({ fsportfolio, capalifeData }: { fsportfolio: FSPortfolioSnapshot; capalifeData: CapalifeData }) {
  const router = useRouter();
  const [tab, setTab] = useState<AnalyticsTab>("whiteSwan");
  const [mode, setMode] = useState<AnalyticsMode>("live");
  const [startFilter, setStartFilter] = useState<StartFilter>("Max");
  const [lineMode, setLineMode] = useState<LineMode>("portfolio");
  const [benchmarkEnabled, setBenchmarkEnabled] = useState(false);
  const [compounded, setCompounded] = useState(true);
  const [investWeights, setInvestWeights] = useState<Record<string, number>>({ ...LIVE_DEFAULT_WEIGHTS });
  const [investEnabled, setInvestEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(LIVE_ASSET_SYMBOLS.map((sym) => [sym, true]))
  );
  const [wsWeights, setWsWeights] = useState<Record<string, number>>(() => {
    try { const s = typeof window !== "undefined" ? localStorage.getItem("ws-weights") : null; return s ? (JSON.parse(s) as Record<string, number>) : { ...WS_FROZEN_WEIGHTS }; } catch { return { ...WS_FROZEN_WEIGHTS }; }
  });
  const [wsEnabled, setWsEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(WS_STRATEGY_IDS.map(id => [id, true] as [string, boolean]))
  );
  const [wsRiskMultiplier, setWsRiskMultiplier] = useState<number>(() => {
    try { const s = typeof window !== "undefined" ? localStorage.getItem("ws-risk-multiplier") : null; return s ? Number(s) : 2.5; } catch { return 2.5; }
  });
  const [combinedWsWeight, setCombinedWsWeight] = useState(50);

  // localStorage cache state for uploaded data files
  type CiCache = { backtest: Record<string, Record<string, number>> | null; live: Record<string, Record<string, number>> | null; livePhaseBStart: string | null };
  const [ciCache, setCiCache] = useState<CiCache | null>(null);
  const [wsEquityCache, setWsEquityCache] = useState<WsPortfolioEquityFile | null>(null);
  const [wsLiveSeriesCache, setWsLiveSeriesCache] = useState<AnalyticsSeriesPoint[] | null>(null);

  useEffect(() => {
    try { localStorage.setItem("ws-weights", JSON.stringify(wsWeights)); } catch { /* ignore */ }
  }, [wsWeights]);
  useEffect(() => {
    try { localStorage.setItem("ws-risk-multiplier", String(wsRiskMultiplier)); } catch { /* ignore */ }
  }, [wsRiskMultiplier]);

  // Load cached uploads from localStorage on mount
  useEffect(() => {
    try {
      const ci = localStorage.getItem("cap:an:ci");
      if (ci) setCiCache(JSON.parse(ci) as CiCache);
      const wsEq = localStorage.getItem("cap:an:ws-equity");
      if (wsEq) setWsEquityCache(JSON.parse(wsEq) as WsPortfolioEquityFile);
      const wsLive = localStorage.getItem("cap:an:ws-live");
      if (wsLive) setWsLiveSeriesCache(JSON.parse(wsLive) as AnalyticsSeriesPoint[]);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCacheUpload = useCallback((key: string, data: unknown) => {
    if (key === "cap:an:ci") setCiCache((data as CiCache) ?? null);
    else if (key === "cap:an:ws-equity") setWsEquityCache((data as WsPortfolioEquityFile) ?? null);
    else if (key === "cap:an:ws-live") setWsLiveSeriesCache((data as AnalyticsSeriesPoint[]) ?? null);
  }, []);

  const mergedFsportfolio = useMemo<FSPortfolioSnapshot>(() => {
    if (!ciCache) return fsportfolio;
    return {
      ...fsportfolio,
      backtest: ciCache.backtest
        ? { ...fsportfolio.backtest, backtestAssetDailyReturns: ciCache.backtest }
        : fsportfolio.backtest,
      live: ciCache.live
        ? { ...fsportfolio.live, forwardAssetDailyReturns: ciCache.live, ...(ciCache.livePhaseBStart ? { forwardPhaseBStart: ciCache.livePhaseBStart } : {}) }
        : fsportfolio.live,
    };
  }, [fsportfolio, ciCache]);

  const mergedCapalifeData = useMemo<CapalifeData>(() => {
    if (!wsEquityCache) return capalifeData;
    return { ...capalifeData, wsPortfolioEquity: wsEquityCache };
  }, [capalifeData, wsEquityCache]);

  const baseDataset = useMemo(() => getAnalyticsDataset(tab, mode, mergedFsportfolio, mergedCapalifeData), [tab, mode, mergedFsportfolio, mergedCapalifeData]);
  const ciBaseForCombined = useMemo(() => tab === "combined" ? getAnalyticsDataset("invest", "backtest", mergedFsportfolio, mergedCapalifeData) : null, [tab, mergedFsportfolio, mergedCapalifeData]);
  const dataset = useMemo(() => {
    let computed: ReturnType<typeof getAnalyticsDataset>;
    if (tab === "invest") {
      computed = buildScopedInvestDataset(mergedFsportfolio, mode, investWeights, investEnabled, startFilter, baseDataset);
    } else if (tab === "whiteSwan" && mode === "backtest") {
      computed = buildScopedWsDataset(baseDataset, wsWeights, wsEnabled, wsRiskMultiplier);
    } else if (tab === "combined" && ciBaseForCombined) {
      const ciScoped = buildScopedInvestDataset(mergedFsportfolio, "backtest", investWeights, investEnabled, startFilter, ciBaseForCombined);
      const wsDatasetForCombined = buildWsDatasetFromEquityFile(mergedCapalifeData.wsPortfolioEquity, ciScoped.benchmarkSeries);
      computed = buildCombinedDataset(wsDatasetForCombined, ciScoped, combinedWsWeight / 100);
    } else {
      computed = baseDataset;
    }
    // Override WS live equity with user-uploaded live curve if available
    if (tab === "whiteSwan" && mode === "live" && wsLiveSeriesCache?.length) {
      const liveDrawdown = computeDrawdown(wsLiveSeriesCache);
      return { ...computed, performanceSeries: wsLiveSeriesCache, drawdownSeries: liveDrawdown };
    }
    return computed;
  }, [baseDataset, ciBaseForCombined, tab, mode, mergedFsportfolio, mergedCapalifeData, investWeights, investEnabled, startFilter, wsWeights, wsEnabled, wsRiskMultiplier, combinedWsWeight, wsLiveSeriesCache]);
  const [activeGroups, setActiveGroups] = useState<string[]>(dataset.groups.map((group) => group.id));
  const refreshAnalytics = useEffectEvent(() => {
    if (tab === "invest") router.refresh();
  });
  useGlobalRefresh(refreshAnalytics, { enabled: tab === "invest" });

  useEffect(() => {
    const defaults = dataset.groups.filter((group) => dataset.groupSeries[group.id]?.length).map((group) => group.id);
    setActiveGroups(defaults);
    setStartFilter("Max");
    setLineMode(dataset.mode === "live" && dataset.tab === "invest" && !dataset.performanceSeries.length && defaults.length ? "assets" : "portfolio");
    setBenchmarkEnabled(false);
    setCompounded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mode]);

  const visiblePerformanceSeries =
    lineMode === "assets" && activeGroups.length && Object.keys(dataset.groupSeries).length
      ? aggregateGroupSeries(dataset.groupSeries, activeGroups)
      : dataset.performanceSeries;

  const filteredPerformanceSeries = filterSeries(visiblePerformanceSeries, startFilter);
  const filteredAnnualReturns = tab === "invest"
    ? dataset.annualReturns
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
    <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between gap-4">
        <TopTabs tab={tab} mode={mode} onTabChange={setTab} onModeChange={setMode} />
        <DataUploadBar slots={UPLOAD_SLOTS} onUpload={handleCacheUpload} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden pr-1">
        <div className="grid min-h-full grid-cols-12 gap-3 xl:h-full xl:grid-rows-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,3fr)]">
          <div className="col-span-12 xl:col-span-8">
            <PerformanceCard
              dataset={dataset}
              startFilter={startFilter}
              lineMode={lineMode}
              benchmarkEnabled={benchmarkEnabled}
              activeGroups={activeGroups}
              compounded={compounded}
              onStartFilter={setStartFilter}
              onLineMode={setLineMode}
              onCompounded={setCompounded}
            />
          </div>

          <div className="col-span-12 xl:col-span-4">
            <KpiGrid cards={buildKpiCards(dataset, lineMode, dataset.benchmarkSeries, mergedCapalifeData)} />
          </div>

          <div className="col-span-12 xl:col-span-8">
            <DrawdownCard dataset={dataset} visibleSeries={filteredPerformanceSeries} benchmarkEnabled={benchmarkEnabled} lineMode={lineMode} />
          </div>

          <div className="col-span-12 xl:col-span-4">
            <OverviewCard rows={buildOverviewRows(dataset)} />
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
                for (const bar of dataset.monthlyReturns) {
                  const m = parseInt(bar.label.slice(5, 7), 10) - 1;
                  if (m >= 0 && m < 12) groups[m]!.push(bar.value);
                }
                return groups.map((vals, i) => ({
                  label: MONTHS[i]!,
                  value: vals.length ? Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)) : 0,
                }));
              })() : dataset.monthlyReturns}
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
              <LiveControlPanel
                weights={investWeights}
                enabled={investEnabled}
                onWeightChange={(sym, val) => setInvestWeights((prev) => ({ ...prev, [sym]: val }))}
                onToggle={(sym) => setInvestEnabled((prev) => ({ ...prev, [sym]: !(prev[sym] !== false) }))}
                onReset={() => {
                  setInvestWeights({ ...LIVE_DEFAULT_WEIGHTS });
                  setInvestEnabled(Object.fromEntries(LIVE_ASSET_SYMBOLS.map((s) => [s, true])));
                }}
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
                  setWsEnabled(Object.fromEntries(WS_STRATEGY_IDS.map(id => [id, true])));
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
