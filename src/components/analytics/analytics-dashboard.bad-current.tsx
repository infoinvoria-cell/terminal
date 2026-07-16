"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Layers, TrendingUp } from "lucide-react";
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

type StartFilter = "1970" | "2000" | "2008" | "2020" | "Max";
type LineMode = "portfolio" | "groups";

const START_FILTERS: StartFilter[] = ["1970", "2000", "2008", "2020", "Max"];

const GROUP_COLORS: Record<string, string> = {
  Agrar: "#f3f4f6",
  Metalle: "#d1d5db",
  Energy: "#b9bec8",
  Indizes: "#a1a7b3",
  Forex: "#8f96a4",
  Invest: "#e5e7eb",
};

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("rounded-[18px] border bg-[#17181b] shadow-[0_18px_45px_rgba(0,0,0,0.22)]", className)}
      style={{ borderColor: "rgba(255,255,255,0.075)" }}
    >
      {children}
    </div>
  );
}

function CardTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
      <p className="text-[12px] font-medium tracking-[0.04em] text-[#8d8f98] [font-family:var(--font-montserrat),sans-serif]">{title}</p>
      {right}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#12131a]/95 px-3 py-2 text-[11px] shadow-xl [font-family:var(--font-montserrat),sans-serif]">
      <p className="mb-1 text-zinc-500">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value >= 0 ? "+" : ""}
          {entry.value.toFixed(2)}%
        </p>
      ))}
    </div>
  );
}

function EmptyHint({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">{message}</div>;
}

function formatAxisDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function formatMetricLabel(label: string) {
  return label
    .replace(/Pct$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function filterSeries(series: AnalyticsSeriesPoint[], startFilter: StartFilter) {
  if (startFilter === "Max") return series;
  return series.filter((point) => point.date.slice(0, 4) >= startFilter);
}

function downsampleSeries(series: AnalyticsSeriesPoint[], maxPoints = 900) {
  if (series.length <= maxPoints) return series;
  const step = Math.ceil(series.length / maxPoints);
  return series.filter((_, index) => index % step === 0 || index === series.length - 1);
}

function aggregateGroupSeries(groupSeries: Record<string, AnalyticsSeriesPoint[]>, activeGroups: string[]) {
  const selected = activeGroups.filter((group) => groupSeries[group]?.length);
  if (!selected.length) return [];
  const dates = [...new Set(selected.flatMap((group) => groupSeries[group].map((point) => point.date)))].sort();
  const lastValues = new Map<string, number>();

  return dates
    .map((date) => {
      const values: number[] = [];
      for (const group of selected) {
        const point = groupSeries[group].find((entry) => entry.date === date);
        if (point) lastValues.set(group, point.value);
        const current = lastValues.get(group);
        if (current !== undefined) values.push(current);
      }
      if (!values.length) return null;
      return { date, value: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) };
    })
    .filter((point): point is AnalyticsSeriesPoint => point !== null);
}

function computeDrawdown(series: AnalyticsSeriesPoint[]) {
  let peak = -Infinity;
  return series.map((point) => {
    const equity = 1 + point.value / 100;
    peak = Math.max(peak, equity);
    return { date: point.date, value: Number((((equity / peak) - 1) * 100).toFixed(2)) };
  });
}

function compactSourceLabel(dataset: AnalyticsDataset) {
  if (dataset.mode === "live") {
    if (dataset.tab === "whiteSwan") return "Performance Report";
    return "No live source";
  }
  if (dataset.tab === "whiteSwan") return "Invoria Equity Curves";
  if (dataset.tab === "invest") return "Invest Engine Trades";
  return "White Swan + Invest Proxy";
}

function overviewRows(dataset: AnalyticsDataset) {
  if (dataset.mode === "live") {
    return [
      ["Portfolio", dataset.title],
      ["Datenbasis", compactSourceLabel(dataset)],
      ["Zeitraum", `${dataset.period.start ?? "n/a"} - ${dataset.period.end ?? "n/a"}`],
      ["Groups", String(dataset.groups.length)],
      ["Entries", String(dataset.groups.reduce((sum, group) => sum + (group.assets ?? 0), 0))],
      ["Caveat", dataset.notes[0] ?? "n/a"],
    ];
  }
  return [
    ["Portfolio", dataset.title],
    ["Datenbasis", compactSourceLabel(dataset)],
    ["Zeitraum", `${dataset.period.start ?? "n/a"} - ${dataset.period.end ?? "n/a"}`],
    ["Sleeves", String(dataset.metrics.strategyCount ?? dataset.groups.length)],
    ["Entries", String(dataset.groups.reduce((sum, group) => sum + (group.assets ?? 0), 0))],
    ["Caveat", dataset.notes[0] ?? "n/a"],
  ];
}

function metricEntries(dataset: AnalyticsDataset) {
  const raw = Object.entries(dataset.metrics);
  const preferred =
    dataset.mode === "live"
      ? ["totalReturnPct", "compoundedPct", "maxDrawdownPct", "annualizedPct", "sharpe", "trades"]
      : ["totalReturnPct", "cagrPct", "maxDrawdownPct", "tradeCount", "dataPoints", "strategyCount"];

  const ordered = preferred
    .map((key) => raw.find(([label]) => label === key))
    .filter((entry): entry is [string, string | number] => Boolean(entry));

  return ordered.length ? ordered : raw.slice(0, 6);
}

function MetricPanel({ dataset }: { dataset: AnalyticsDataset }) {
  const entries = metricEntries(dataset);
  return (
    <Card className="h-[330px] p-3">
      <div className="grid h-full grid-cols-2 grid-rows-3 gap-3">
        {entries.map(([label, value]) => (
          <div
            key={label}
            className="flex min-h-0 flex-col justify-between rounded-[14px] border bg-[#15161a] px-4 py-3"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
              {formatMetricLabel(label)}
            </p>
            <p className="text-[24px] font-bold leading-none tracking-tight text-white [font-family:var(--font-nunito),sans-serif]">
              {String(value || "n/a")}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PerformanceChart({
  dataset,
  startFilter,
  lineMode,
  benchmarkEnabled,
  activeGroups,
  onStartFilter,
  onLineMode,
  onBenchmarkToggle,
}: {
  dataset: AnalyticsDataset;
  startFilter: StartFilter;
  lineMode: LineMode;
  benchmarkEnabled: boolean;
  activeGroups: string[];
  onStartFilter: (filter: StartFilter) => void;
  onLineMode: (mode: LineMode) => void;
  onBenchmarkToggle: () => void;
}) {
  const baseSeries =
    lineMode === "groups" && Object.keys(dataset.groupSeries).length
      ? aggregateGroupSeries(dataset.groupSeries, activeGroups)
      : dataset.performanceSeries;

  const performanceSeries = downsampleSeries(filterSeries(baseSeries, startFilter));
  const benchmarkSeries = downsampleSeries(filterSeries(dataset.benchmarkSeries, startFilter));
  const groupKeys = activeGroups.filter((group) => dataset.groupSeries[group]?.length);

  const chartData = useMemo(() => {
    const rows = new Map<string, Record<string, string | number>>();
    for (const point of performanceSeries) {
      rows.set(point.date, { date: point.date, portfolio: point.value });
    }
    if (lineMode === "groups") {
      for (const group of groupKeys) {
        for (const point of downsampleSeries(filterSeries(dataset.groupSeries[group], startFilter))) {
          const row = rows.get(point.date) ?? { date: point.date };
          row[group] = point.value;
          rows.set(point.date, row);
        }
      }
    }
    if (benchmarkEnabled) {
      for (const point of benchmarkSeries) {
        const row = rows.get(point.date) ?? { date: point.date };
        row.benchmark = point.value;
        rows.set(point.date, row);
      }
    }
    return [...rows.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [benchmarkEnabled, benchmarkSeries, dataset.groupSeries, groupKeys, lineMode, performanceSeries, startFilter]);

  return (
    <Card className="h-[330px] overflow-hidden">
      <CardTitle
        title={dataset.mode === "backtest" ? "Backtest Performance" : "Live Performance"}
        right={
          <div className="flex max-w-[360px] flex-wrap justify-end gap-2">
            {START_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => onStartFilter(filter)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[10px] [font-family:var(--font-montserrat),sans-serif]",
                  startFilter === filter ? "border-white/30 text-white" : "border-white/[0.06] text-zinc-500",
                )}
              >
                {filter}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onLineMode("portfolio")}
              className={cn(
                "rounded-full border px-3 py-1 text-[10px] [font-family:var(--font-montserrat),sans-serif]",
                lineMode === "portfolio" ? "border-white/30 text-white" : "border-white/[0.06] text-zinc-500",
              )}
            >
              Portfolio
            </button>
            <button
              type="button"
              onClick={() => onLineMode("groups")}
              className={cn(
                "rounded-full border px-3 py-1 text-[10px] [font-family:var(--font-montserrat),sans-serif]",
                lineMode === "groups" ? "border-white/30 text-white" : "border-white/[0.06] text-zinc-500",
              )}
            >
              Groups
            </button>
            <button
              type="button"
              disabled={!dataset.benchmarkSeries.length}
              onClick={onBenchmarkToggle}
              className={cn(
                "rounded-full border px-3 py-1 text-[10px] [font-family:var(--font-montserrat),sans-serif]",
                benchmarkEnabled ? "border-white/30 text-white" : "border-white/[0.06] text-zinc-500",
                !dataset.benchmarkSeries.length && "cursor-not-allowed opacity-35",
              )}
            >
              Benchmark S&P
            </button>
          </div>
        }
      />
      <div className="flex items-center justify-between px-4 pt-2">
        <p className="text-[10px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">{compactSourceLabel(dataset)}</p>
        <p className="text-[10px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
          {dataset.period.start ?? "n/a"} - {dataset.period.end ?? "n/a"}
        </p>
      </div>
      <div className="px-2 pt-2">
        <div className="h-[260px]">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="perf-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(243,244,246,0.15)" />
                    <stop offset="100%" stopColor="rgba(243,244,246,0.01)" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.045)" />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 9, fill: "#686b73" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 9, fill: "#686b73" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value > 0 ? "+" : ""}${value.toFixed(0)}%`} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.10)", strokeWidth: 1 }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
                <Area type="monotone" dataKey="portfolio" name="Portfolio" stroke="#f3f4f6" strokeWidth={1.6} fill="url(#perf-fill)" dot={false} />
                {lineMode === "groups" &&
                  groupKeys.map((group) => (
                    <Line key={group} type="monotone" dataKey={group} name={group} stroke={GROUP_COLORS[group] ?? "#a1a1aa"} strokeWidth={1.1} dot={false} />
                  ))}
                {benchmarkEnabled && <Line type="monotone" dataKey="benchmark" name="S&P 500" stroke="#7c3aed" strokeWidth={1.25} dot={false} />}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyHint message="No data found for the selected mode and filters." />
          )}
        </div>
      </div>
    </Card>
  );
}

function DrawdownChart({ dataset, visibleSeries }: { dataset: AnalyticsDataset; visibleSeries: AnalyticsSeriesPoint[] }) {
  const chartSeries = useMemo(() => {
    const datasetSeries = filterSeries(dataset.drawdownSeries, "Max");
    return downsampleSeries(datasetSeries.length ? datasetSeries : computeDrawdown(visibleSeries));
  }, [dataset.drawdownSeries, visibleSeries]);

  return (
    <Card className="h-[190px] overflow-hidden">
      <CardTitle title="Drawdown" />
      <div className="px-2 pt-2">
        <div className="h-[132px]">
          {chartSeries.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartSeries} margin={{ top: 2, right: 10, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="drawdown-fill" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="rgba(164,88,88,0.28)" />
                    <stop offset="100%" stopColor="rgba(164,88,88,0.03)" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 8, fill: "#686b73" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 8, fill: "#686b73" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
                <Area type="monotone" dataKey="value" name="Drawdown" stroke="rgba(180,100,100,0.82)" strokeWidth={1.4} fill="url(#drawdown-fill)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyHint message="No drawdown series available." />
          )}
        </div>
      </div>
    </Card>
  );
}

function BarsChart({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  return (
    <Card className="h-[190px] overflow-hidden">
      <CardTitle title={title} />
      <div className="px-2 pt-2">
        <div className="h-[132px]">
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
                    <Cell key={item.label} fill={item.value >= 0 ? "rgba(229,231,235,0.88)" : "rgba(164,88,88,0.82)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyHint message="No data available." />
          )}
        </div>
      </div>
    </Card>
  );
}

function OverviewPanel({ dataset }: { dataset: AnalyticsDataset }) {
  const rows = overviewRows(dataset);
  return (
    <Card className="h-[190px] overflow-hidden">
      <CardTitle title="Overview" />
      <div className="grid gap-2 px-4 py-3">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
            <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">{label}</p>
            <p className="truncate text-[11px] text-zinc-200 [font-family:var(--font-montserrat),sans-serif]">{value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ControlPanel({
  dataset,
  startFilter,
  lineMode,
  benchmarkEnabled,
  activeGroups,
  onStartFilter,
  onLineMode,
  onBenchmarkToggle,
  onToggleGroup,
}: {
  dataset: AnalyticsDataset;
  startFilter: StartFilter;
  lineMode: LineMode;
  benchmarkEnabled: boolean;
  activeGroups: string[];
  onStartFilter: (filter: StartFilter) => void;
  onLineMode: (mode: LineMode) => void;
  onBenchmarkToggle: () => void;
  onToggleGroup: (group: string) => void;
}) {
  return (
    <Card className="h-[190px] overflow-hidden">
      <CardTitle title="Control Panel" />
      <div className="flex h-[138px] flex-col gap-3 px-4 py-3">
        <div>
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">Zeitraum</p>
          <div className="flex flex-wrap gap-2">
            {START_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => onStartFilter(filter)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] [font-family:var(--font-montserrat),sans-serif]",
                  startFilter === filter ? "border-white/30 text-white" : "border-white/[0.06] text-zinc-500",
                )}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">Linien</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onLineMode("portfolio")}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] [font-family:var(--font-montserrat),sans-serif]",
                lineMode === "portfolio" ? "border-white/30 text-white" : "border-white/[0.06] text-zinc-500",
              )}
            >
              Portfolio
            </button>
            <button
              type="button"
              onClick={() => onLineMode("groups")}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] [font-family:var(--font-montserrat),sans-serif]",
                lineMode === "groups" ? "border-white/30 text-white" : "border-white/[0.06] text-zinc-500",
              )}
            >
              Groups
            </button>
            <button
              type="button"
              disabled={!dataset.benchmarkSeries.length}
              onClick={onBenchmarkToggle}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] [font-family:var(--font-montserrat),sans-serif]",
                benchmarkEnabled ? "border-white/30 text-white" : "border-white/[0.06] text-zinc-500",
                !dataset.benchmarkSeries.length && "cursor-not-allowed opacity-35",
              )}
            >
              Benchmark S&P
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">Gruppen</p>
          <div className="grid grid-cols-2 gap-2">
            {dataset.groups.map((group) => {
              const active = activeGroups.includes(group.id);
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => onToggleGroup(group.id)}
                  className="flex items-center justify-between rounded-[10px] border border-white/[0.06] px-3 py-2 text-left hover:bg-white/[0.02]"
                >
                  <span className="text-[10px] text-zinc-300 [font-family:var(--font-montserrat),sans-serif]">{group.label}</span>
                  <span className={cn("text-[10px] [font-family:var(--font-montserrat),sans-serif]", active ? "text-white" : "text-zinc-600")}>{active ? "on" : "off"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function AnalyticsDashboard() {
  const [tab, setTab] = useState<AnalyticsTab>("whiteSwan");
  const [mode, setMode] = useState<AnalyticsMode>("live");
  const [startFilter, setStartFilter] = useState<StartFilter>("Max");
  const [lineMode, setLineMode] = useState<LineMode>("portfolio");
  const [benchmarkEnabled, setBenchmarkEnabled] = useState(false);

  const dataset = getAnalyticsDataset(tab, mode);
  const [activeGroups, setActiveGroups] = useState<string[]>(dataset.groups.map((group) => group.id));

  useEffect(() => {
    setActiveGroups(dataset.groups.map((group) => group.id));
    setStartFilter("Max");
    setLineMode("portfolio");
    setBenchmarkEnabled(false);
  }, [dataset]);

  const visiblePerformanceSeries =
    lineMode === "groups" && Object.keys(dataset.groupSeries).length
      ? aggregateGroupSeries(dataset.groupSeries, activeGroups)
      : dataset.performanceSeries;

  const filteredPerformanceSeries = filterSeries(visiblePerformanceSeries, startFilter);
  const filteredAnnual = dataset.annualReturns.filter((item) => startFilter === "Max" || item.label >= startFilter);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-x-hidden overflow-y-auto pr-1">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {([
            { id: "whiteSwan", label: "White Swan" },
            { id: "invest", label: "Invest" },
            { id: "combined", label: "Combined" },
          ] as Array<{ id: AnalyticsTab; label: string }>).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-all [font-family:var(--font-montserrat),sans-serif]",
                tab === item.id ? "border-white/20 bg-white/[0.06] text-white" : "border-transparent text-zinc-500 hover:border-white/[0.06] hover:text-zinc-300",
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
              onClick={() => setMode(item)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.08em] [font-family:var(--font-montserrat),sans-serif]",
                mode === item ? "border-white/20 text-white" : "border-white/[0.06] text-zinc-500",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          <PerformanceChart
            dataset={dataset}
            startFilter={startFilter}
            lineMode={lineMode}
            benchmarkEnabled={benchmarkEnabled}
            activeGroups={activeGroups}
            onStartFilter={setStartFilter}
            onLineMode={setLineMode}
            onBenchmarkToggle={() => setBenchmarkEnabled((current) => !current)}
          />
        </div>

        <div className="col-span-12 xl:col-span-4">
          <MetricPanel dataset={dataset} />
        </div>

        <div className="col-span-12 xl:col-span-8">
          <DrawdownChart dataset={dataset} visibleSeries={filteredPerformanceSeries} />
        </div>

        <div className="col-span-12 xl:col-span-4">
          <OverviewPanel dataset={dataset} />
        </div>

        <div className="col-span-12 md:col-span-6 xl:col-span-4">
          <BarsChart title="Annual Returns" items={filteredAnnual} />
        </div>

        <div className="col-span-12 md:col-span-6 xl:col-span-4">
          <BarsChart title="Monthly Returns" items={dataset.monthlyReturns} />
        </div>

        <div className="col-span-12 xl:col-span-4">
          <ControlPanel
            dataset={dataset}
            startFilter={startFilter}
            lineMode={lineMode}
            benchmarkEnabled={benchmarkEnabled}
            activeGroups={activeGroups}
            onStartFilter={setStartFilter}
            onLineMode={setLineMode}
            onBenchmarkToggle={() => setBenchmarkEnabled((current) => !current)}
            onToggleGroup={(group) =>
              setActiveGroups((current) => (current.includes(group) ? current.filter((item) => item !== group) : [...current, group]))
            }
          />
        </div>
      </div>
    </div>
  );
}
