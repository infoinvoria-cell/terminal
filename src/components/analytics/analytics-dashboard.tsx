"use client";

import { useEffect, useMemo, useState, useEffectEvent } from "react";
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
// Core Invest target weights (Core Invest v1 spec 2026-07-10)
const LIVE_DEFAULT_WEIGHTS: Record<string, number> = { SPY: 15, SPMO: 35, QQQ: 15, GLD: 10, WHITE_SWAN_NAS_EMA: 7.5, QQQ_PINE_2_EMA: 7.5, COPPER_HG: 5, CHF_6S: 5 };
const LIVE_ORIGINAL_WEIGHTS: Record<string, number> = { SPY: 15, SPMO: 35, QQQ: 15, GLD: 10, WHITE_SWAN_NAS_EMA: 7.5, QQQ_PINE_2_EMA: 7.5, COPPER_HG: 5, CHF_6S: 5 };
const LIVE_ASSET_SYMBOLS = ["SPY", "SPMO", "QQQ", "GLD", "WHITE_SWAN_NAS_EMA", "QQQ_PINE_2_EMA", "COPPER_HG", "CHF_6S"] as const;
const LIVE_ASSET_LABELS: Record<string, string> = { SPY: "SPY", SPMO: "SPMO", QQQ: "QQQ passive", GLD: "GLD", WHITE_SWAN_NAS_EMA: "QQQ Pine 1", QQQ_PINE_2_EMA: "QQQ Pine 2 EMA", COPPER_HG: "Copper/HG", CHF_6S: "CHF/6S" };

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
        { label: "Status", value: dataset.tab === "combined" ? "Preview" : "Internal" },
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
      ["Strategy", "Core Invest"],
      ["Live Scope", "Forward tracking"],
      ["Phase A", `QQQ Pine 100% from ${dataset.qqpineForwardDate ?? "2025-05-01"}`],
      ["Phase B", `Full mix from ${dataset.portfolioLiveDate ?? "2026-05-01"}`],
      ["ETF Core", "SPY · SPMO · QQQ · GLD (75%)"],
      ["Sleeves", "QQQ Pine 1 · Pine 2 EMA · HG · CHF (25%)"],
      ["Benchmark", `SPY from ${dataset.qqpineForwardDate ?? "2025-05-01"}`],
      ["Execution", "none · not live"],
      ["AuM", "EUR 0"],
      ["Caveat", "Research/Pre-Fund · not live execution"],
    ];
  }

  if (dataset.tab === "invest" && dataset.mode === "backtest") {
    const adaptiveStart = dataset.metrics.adaptiveStart ? String(dataset.metrics.adaptiveStart) : "n/a";
    const fullCoreStart = dataset.metrics.fullCoreStart ? String(dataset.metrics.fullCoreStart) : "n/a";
    return [
      ["Strategy", "Core Invest"],
      ["ETF Core", "SPY · SPMO · QQQ · GLD (75%)"],
      ["Sleeves", "QQQ Pine 1 · Pine 2 EMA · HG · CHF (25%)"],
      ["Proxy Start", "2000-01-31"],
      ["WF/OOS", "2008-01-31 – 2023-12-31"],
      ["Forward", "ab 2024-01-31"],
      ["Adaptive Start", adaptiveStart],
      ["Full-Core Start", fullCoreStart],
      ["Market Data", "OHLC + QQQ Pine + HG + CHF"],
      ["Execution", "none · not live"],
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

  if (dataset.mode === "backtest") {
    const isCombined = dataset.tab === "combined";
    return [
      ["Registry", isCombined ? "combined preview sources" : "final_production_sleeves.json v2"],
      ["Sleeves", formatCount(dataset.metrics.strategyCount ?? dataset.groups.length)],
      ["Entries", formatCount(dataset.groups.reduce((sum, group) => sum + (group.assets ?? 0), 0))],
      ["Zeitraum", `${dataset.period.start ?? "n/a"} - ${dataset.period.end ?? "n/a"}`],
      ["Gewichte", isCombined ? "open / preview" : "open"],
      ["Status", isCombined ? "internal preview, not final" : "internal OOS/backtest"],
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
              <Image src="/branding/white-swan-icon.png" alt="White Swan" width={15} height={15} className="rounded-sm object-contain" />
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
            <EmptyHint message={dataset.mode === "live" ? "Keine belegte Live-/Forward-Serie fuer diesen Modus." : "Keine sichtbare Performance-Serie fuer diesen Modus."} />
          )}
        </div>
      </div>
      <PerformanceLegend dataset={dataset} lineMode={lineMode} visibleGroups={visibleGroups} />
    </Card>
  );
}

function KpiGrid({ cards }: { cards: KpiCard[] }) {
  return (
    <Card className="p-3">
      <div className="grid h-full min-h-0 grid-cols-2 gap-2 xl:grid-cols-3">
        {cards.slice(0, 12).map((card) => (
          <div
            key={card.label}
            className="flex min-h-[88px] flex-col justify-between rounded-[16px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] px-3 py-2.5 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.45)]"
          >
            <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
              {card.label}
            </p>
            <div className="flex items-end justify-between gap-1">
              <p className="line-clamp-2 text-[18px] font-bold leading-tight tracking-tight text-white [font-family:var(--font-nunito),sans-serif]">
                {card.value}
              </p>
              {card.delta ? (
                <p
                  className="mb-0.5 text-[10px] font-semibold [font-family:var(--font-montserrat),sans-serif]"
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

function DrawdownCard({ dataset, visibleSeries }: { dataset: AnalyticsDataset; visibleSeries: AnalyticsSeriesPoint[] }) {
  const chartSeries = useMemo(() => {
    const datasetSeries = filterSeries(dataset.drawdownSeries, "Max");
    const source = datasetSeries.length ? datasetSeries : computeDrawdown(visibleSeries);
    return downsampleSeries(source);
  }, [dataset.drawdownSeries, visibleSeries]);

  return (
    <Card>
      <CardHeader title="Drawdown" />
      <div className="min-h-0 flex-1 px-2 pb-1.5 pt-1">
        <div className="h-full min-h-[58px]">
          {chartSeries.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartSeries} margin={{ top: 3, right: 10, bottom: 0, left: -12 }}>
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
  const maxRows = 10;
  const limited = rows.slice(0, maxRows);
  const pairs: Array<[[string, string], [string, string] | null]> = [];
  for (let index = 0; index < limited.length; index += 2) {
    pairs.push([limited[index]!, limited[index + 1] ?? null]);
  }
  return (
    <Card>
      <CardHeader title="Overview" />
      <div className="flex flex-1 flex-col justify-between gap-0.5 px-4 py-2">
        {pairs.map(([left, right]) => (
          <div key={left[0]} className="grid grid-cols-2 gap-x-4">
            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
              <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">{left[0]}</p>
              <p className="line-clamp-1 text-[10px] text-zinc-200 [font-family:var(--font-montserrat),sans-serif]">{left[1]}</p>
            </div>
            {right ? (
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">{right[0]}</p>
                <p className="line-clamp-1 text-[10px] text-zinc-200 [font-family:var(--font-montserrat),sans-serif]">{right[1]}</p>
              </div>
            ) : <div />}
          </div>
        ))}
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
    const wInput = weights[sym] ?? 0;
    const iconSrc = INVEST_ICONS[sym];
    return (
      <div className={cn(
        "flex items-center gap-1.5 rounded-[8px] border px-2 py-1.5 transition-colors",
        isOn ? "border-white/[0.12] bg-white/[0.03]" : "border-white/[0.05]",
      )}>
        {iconSrc && (
          <img
            src={iconSrc}
            alt={LIVE_ASSET_LABELS[sym]}
            width={22}
            height={22}
            className={cn("shrink-0 rounded-full object-cover", isOn ? "opacity-100" : "opacity-30")}
            style={{ borderRadius: "9999px" }}
          />
        )}
        <button
          type="button"
          onClick={() => onToggle(sym)}
          className="min-w-0 flex-1 text-left"
        >
          <span className={cn(
            "block truncate text-[9px] font-medium leading-tight [font-family:var(--font-montserrat),sans-serif]",
            isOn ? "text-zinc-200" : "text-zinc-600",
          )}>
            {LIVE_ASSET_LABELS[sym]}
          </span>
          <span className="text-[8px] text-zinc-700 [font-family:var(--font-montserrat),sans-serif]">
            {isOn ? "on" : "off"}
          </span>
        </button>
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={wInput}
          disabled={!isOn}
          onChange={(e) => onWeightChange(sym, Math.max(0, Number(e.target.value)))}
          className="w-10 rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 text-right text-[10px] text-white disabled:opacity-30 [font-family:var(--font-montserrat),sans-serif] focus:border-white/20 focus:outline-none"
        />
        <span className="text-[8px] text-zinc-700 [font-family:var(--font-montserrat),sans-serif]">%</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader title="Core Invest" />
      <div className="flex flex-1 flex-col px-3 py-2.5 gap-1.5">
        {assetPairs.map(([left, right]) => (
          <div key={left} className="grid grid-cols-2 gap-1.5">
            <AssetCell sym={left} />
            {right ? (
              <AssetCell sym={right} />
            ) : (
              <div className="flex items-center justify-between px-1">
                <span className="text-[9px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
                  Σ {totalW.toFixed(1)}%
                </span>
                <button
                  type="button"
                  onClick={onReset}
                  className="text-[9px] text-zinc-600 hover:text-zinc-300 [font-family:var(--font-montserrat),sans-serif] transition-colors"
                >
                  ↺ Reset
                </button>
              </div>
            )}
          </div>
        ))}
        <p className="mt-0.5 text-[8px] text-zinc-700 [font-family:var(--font-montserrat),sans-serif]">
          Core Invest · Research Scenario · not live execution
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

  const baseDataset = useMemo(() => getAnalyticsDataset(tab, mode, fsportfolio, capalifeData), [tab, mode, fsportfolio, capalifeData]);
  const dataset = useMemo(() => {
    if (tab === "invest") {
      return buildScopedInvestDataset(fsportfolio, mode, investWeights, investEnabled, startFilter, baseDataset);
    }
    return baseDataset;
  }, [baseDataset, tab, mode, fsportfolio, investWeights, investEnabled, startFilter]);
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
    <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden">
      <TopTabs tab={tab} mode={mode} onTabChange={setTab} onModeChange={setMode} />

      <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden pr-1">
        <div className="grid min-h-full grid-cols-12 gap-4 xl:h-full xl:grid-rows-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,3fr)]">
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
            <KpiGrid cards={buildKpiCards(dataset, lineMode, dataset.benchmarkSeries, capalifeData)} />
          </div>

          <div className="col-span-12 xl:col-span-8">
            <DrawdownCard dataset={dataset} visibleSeries={filteredPerformanceSeries} />
          </div>

          <div className="col-span-12 xl:col-span-4">
            <OverviewCard rows={buildOverviewRows(dataset)} />
          </div>

          <div className="col-span-12 md:col-span-4">
            <BarsCard title="Annual Returns" items={filteredAnnualReturns} />
          </div>

          <div className="col-span-12 md:col-span-4">
            <BarsCard title="Monthly Returns" items={dataset.monthlyReturns} />
          </div>

          <div className="col-span-12 md:col-span-4">
            {tab === "invest" ? (
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
