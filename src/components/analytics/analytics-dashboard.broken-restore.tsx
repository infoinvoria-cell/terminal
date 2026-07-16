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
const GROUP_LINE_COLORS: Record<string, string> = {
  Agrar: "#f3f4f6",
  Metalle: "#c9ccd3",
  Energy: "#b8bbc4",
  Indizes: "#9ea2ad",
  Forex: "#8f949f",
  Invest: "#e5e7eb",
};

function ShellCard({ children, className, bodyClassName }: { children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <div
      className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border bg-[#17181b] shadow-[0_18px_45px_rgba(0,0,0,0.22)]", className)}
      style={{ borderColor: "rgba(255,255,255,0.075)" }}
    >
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </div>
  );
}

function CardHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
      <p className="text-[12px] font-medium tracking-[0.04em] text-[#8d8f98] [font-family:var(--font-montserrat),sans-serif]">{title}</p>
      {right}
    </div>
  );
}

function TooltipBox({
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

function EmptyBlock({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">{message}</div>;
}

function formatAxisDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function filterSeries(series: AnalyticsSeriesPoint[], startFilter: StartFilter) {
  if (startFilter === "Max") return series;
  return series.filter((point) => point.date.slice(0, 4) >= startFilter);
}

function buildAggregatedGroupSeries(groupSeries: Record<string, AnalyticsSeriesPoint[]>, activeGroups: string[]) {
  const selectedGroups = activeGroups.filter((group) => groupSeries[group]?.length);
  if (!selectedGroups.length) return [];
  const allDates = [...new Set(selectedGroups.flatMap((group) => groupSeries[group].map((point) => point.date)))].sort();
  const lastKnownValues = new Map<string, number>();

  return allDates
    .map((date) => {
      const visibleValues: number[] = [];
      for (const group of selectedGroups) {
        const current = groupSeries[group].find((point) => point.date === date);
        if (current) lastKnownValues.set(group, current.value);
        const value = lastKnownValues.get(group);
        if (value !== undefined) visibleValues.push(value);
      }
      if (!visibleValues.length) return null;
      return {
        date,
        value: Number((visibleValues.reduce((sum, current) => sum + current, 0) / visibleValues.length).toFixed(2)),
      };
    })
    .filter((point): point is AnalyticsSeriesPoint => point !== null);
}

function buildDrawdownSeries(series: AnalyticsSeriesPoint[]) {
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

function compactMetricLabel(label: string) {
  return label
    .replace(/Pct$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function pickMetricEntries(dataset: AnalyticsDataset) {
  const raw = Object.entries(dataset.metrics);
  const preferred =
    dataset.mode === "live"
      ? ["totalReturnPct", "compoundedPct", "maxDrawdownPct", "annualizedPct", "sharpe", "trades"]
      : ["totalReturnPct", "cagrPct", "maxDrawdownPct", "tradeCount", "dataPoints", "strategyCount"];

  const ordered = preferred
    .map((key) => raw.find(([label]) => label === key))
    .filter((entry): entry is [string, number | string] => Boolean(entry));

  if (ordered.length) return ordered;
  return raw.slice(0, 6);
}

function MetricsPanel({ dataset }: { dataset: AnalyticsDataset }) {
  const entries = pickMetricEntries(dataset);
  return (
    <div className="grid h-full grid-cols-2 gap-3 xl:grid-cols-3">
      {entries.map(([label, value]) => (
        <ShellCard key={label} className="min-h-[84px] border-white/[0.06] bg-[#15161a] shadow-none">
          <div className="flex h-full flex-col justify-between px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
              {compactMetricLabel(label)}
            </p>
            <p className="text-[22px] font-bold leading-none tracking-tight text-white [font-family:var(--font-nunito),sans-serif]">
              {String(value || "n/a")}
            </p>
          </div>
        </ShellCard>
      ))}
    </div>
  );
}

function ControlChip({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[10px] [font-family:var(--font-montserrat),sans-serif]",
        active ? "border-white/30 text-white" : "border-white/[0.06] text-zinc-500",
        disabled && "cursor-not-allowed opacity-35",
      )}
    >
      {label}
    </button>
  );
}

function PerformanceCard({
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
      ? buildAggregatedGroupSeries(dataset.groupSeries, activeGroups)
      : dataset.performanceSeries;

  const performanceSeries = filterSeries(baseSeries, startFilter);
  const benchmarkSeries = filterSeries(dataset.benchmarkSeries, startFilter);
  const groupKeys = activeGroups.filter((group) => dataset.groupSeries[group]?.length);

  const chartData = useMemo(() => {
    const rows = new Map<string, Record<string, string | number>>();
    for (const point of performanceSeries) rows.set(point.date, { date: point.date, portfolio: point.value });
    if (lineMode === "groups") {
      for (const group of groupKeys) {
        for (const point of filterSeries(dataset.groupSeries[group], startFilter)) {
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
    <ShellCard>
      <CardHeader
        title={dataset.mode === "backtest" ? "Backtest Performance" : "Live Performance"}
        right={
          <div className="flex max-w-[360px] flex-wrap justify-end gap-2">
            {START_FILTERS.map((filter) => (
              <ControlChip key={filter} active={startFilter === filter} label={filter} onClick={() => onStartFilter(filter)} />
            ))}
            <ControlChip active={lineMode === "portfolio"} label="Portfolio" onClick={() => onLineMode("portfolio")} />
            <ControlChip active={lineMode === "groups"} label="Groups" onClick={() => onLineMode("groups")} />
            <ControlChip
              active={benchmarkEnabled}
              disabled={!dataset.benchmarkSeries.length}
              label="Benchmark S&P"
              onClick={onBenchmarkToggle}
            />
          </div>
        }
      />
      <div className="flex items-center justify-between px-4 pt-2">
        <p className="text-[10px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">{dataset.sourceLabel}</p>
        <p className="text-[10px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
          {dataset.period.start ?? "n/a"} - {dataset.period.end ?? "n/a"}
        </p>
      </div>
      <div className="min-h-0 flex-1 px-2 pb-3 pt-2">
        {chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="analytics-perf-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(243,244,246,0.15)" />
                  <stop offset="100%" stopColor="rgba(243,244,246,0.01)" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.045)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatAxisDate}
                tick={{ fontSize: 9, fill: "#686b73" }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#686b73" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => `${value > 0 ? "+" : ""}${value.toFixed(0)}%`}
              />
              <Tooltip content={<TooltipBox />} cursor={{ stroke: "rgba(255,255,255,0.10)", strokeWidth: 1 }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
              <Area
                type="monotone"
                dataKey="portfolio"
                name="Portfolio"
                stroke="#f3f4f6"
                strokeWidth={1.6}
                fill="url(#analytics-perf-fill)"
                dot={false}
                activeDot={{ r: 3, fill: "#f3f4f6" }}
              />
              {lineMode === "groups" &&
                groupKeys.map((group) => (
                  <Line key={group} type="monotone" dataKey={group} name={group} stroke={GROUP_LINE_COLORS[group] ?? "#a1a1aa"} strokeWidth={1.1} dot={false} />
                ))}
              {benchmarkEnabled && <Line type="monotone" dataKey="benchmark" name="S&P 500" stroke="#7c3aed" strokeWidth={1.25} dot={false} />}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyBlock message="No data found for the selected mode and filters." />
        )}
      </div>
    </ShellCard>
  );
}

function DrawdownCard({ series }: { series: AnalyticsSeriesPoint[] }) {
  const data = useMemo(() => buildDrawdownSeries(series), [series]);
  return (
    <ShellCard>
      <CardHeader title="Drawdown" />
      <div className="min-h-0 flex-1 px-2 pb-3 pt-2">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 10, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="analytics-dd-fill" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="rgba(164,88,88,0.28)" />
                  <stop offset="100%" stopColor="rgba(164,88,88,0.03)" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 9, fill: "#686b73" }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 9, fill: "#686b73" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
              <Tooltip content={<TooltipBox />} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
              <Area type="monotone" dataKey="value" name="Drawdown" stroke="rgba(180,100,100,0.82)" strokeWidth={1.45} fill="url(#analytics-dd-fill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyBlock message="No drawdown series available." />
        )}
      </div>
    </ShellCard>
  );
}

function OverviewCard({ dataset }: { dataset: AnalyticsDataset }) {
  const rows =
    dataset.mode === "live"
      ? [
          ["Portfolio", dataset.title],
          ["Datenbasis", dataset.sourceLabel],
          ["Zeitraum", `${dataset.period.start ?? "n/a"} - ${dataset.period.end ?? "n/a"}`],
          ["Accounts", dataset.groupBars.length ? dataset.groupBars.map((item) => item.label).join(", ") : "n/a"],
          ["Trades", String(dataset.metrics.trades ?? "n/a")],
          ["Audit", dataset.notes[0] ?? "n/a"],
        ]
      : [
          ["Registry", dataset.sourceLabel],
          ["Zeitraum", `${dataset.period.start ?? "n/a"} - ${dataset.period.end ?? "n/a"}`],
          ["Sleeves", String(dataset.metrics.strategyCount ?? dataset.groups.length)],
          ["Entries", String(dataset.groups.reduce((sum, group) => sum + (group.assets ?? 0), 0))],
          ["Datenpunkte", String(dataset.metrics.dataPoints ?? dataset.performanceSeries.length)],
          ["Benchmark", dataset.benchmarkSeries.length ? "available" : "missing"],
          ["Weights", "open"],
          ["Hinweis", dataset.notes[0] ?? "n/a"],
        ];

  return (
    <ShellCard>
      <CardHeader title="Overview" />
      <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
        {rows.slice(0, 8).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">{label}</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-200 [font-family:var(--font-montserrat),sans-serif]">{value}</p>
          </div>
        ))}
      </div>
    </ShellCard>
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
    <ShellCard>
      <CardHeader title="Control Panel" />
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        <div>
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">Zeitraum</p>
          <div className="flex flex-wrap gap-2">
            {START_FILTERS.map((filter) => (
              <ControlChip key={filter} active={startFilter === filter} label={filter} onClick={() => onStartFilter(filter)} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">Linien</p>
          <div className="flex flex-wrap gap-2">
            <ControlChip active={lineMode === "portfolio"} label="Portfolio" onClick={() => onLineMode("portfolio")} />
            <ControlChip active={lineMode === "groups"} label="Groups" onClick={() => onLineMode("groups")} />
            <ControlChip active={benchmarkEnabled} disabled={!dataset.benchmarkSeries.length} label="Benchmark S&P" onClick={onBenchmarkToggle} />
          </div>
        </div>
        <div className="min-h-0">
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
    </ShellCard>
  );
}

function BarsCard({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  return (
    <ShellCard>
      <CardHeader title={title} />
      <div className="min-h-0 flex-1 px-2 pb-3 pt-2">
        {items.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={items} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="label" tick={{ fontSize: 8, fill: "#686b73" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
              <YAxis tick={{ fontSize: 8, fill: "#686b73" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value}%`} />
              <Tooltip content={<TooltipBox />} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {items.map((item) => (
                  <Cell key={item.label} fill={item.value >= 0 ? "rgba(229,231,235,0.88)" : "rgba(164,88,88,0.82)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyBlock message="No data found for this box." />
        )}
      </div>
    </ShellCard>
  );
}

function DetailsCard({
  groupBars,
  strategyBars,
}: {
  groupBars: Array<{ label: string; value: number }>;
  strategyBars: Array<{ label: string; value: number }>;
}) {
  const hasGroupBars = groupBars.length > 0;
  const hasStrategyBars = strategyBars.length > 0;
  if (!hasGroupBars && !hasStrategyBars) return null;

  return (
    <div className="grid grid-cols-12 gap-4">
      {hasGroupBars ? (
        <div className={cn("col-span-12", hasStrategyBars ? "xl:col-span-6" : "xl:col-span-12")}>
          <BarsCard title="Gruppen" items={groupBars} />
        </div>
      ) : null}
      {hasStrategyBars ? (
        <div className={cn("col-span-12", hasGroupBars ? "xl:col-span-6" : "xl:col-span-12")}>
          <BarsCard title="Strategien" items={strategyBars} />
        </div>
      ) : null}
    </div>
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
      ? buildAggregatedGroupSeries(dataset.groupSeries, activeGroups)
      : dataset.performanceSeries;

  const filteredPerformanceSeries = filterSeries(visiblePerformanceSeries, startFilter);
  const filteredAnnualBars = dataset.annualReturns.filter((item) => startFilter === "Max" || item.label >= startFilter);
  const filteredGroupBars = dataset.groupBars.filter((item) => !item.group || activeGroups.includes(item.group));
  const filteredStrategyBars = dataset.strategyBars.filter((item) => !item.group || activeGroups.includes(item.group));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
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

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full min-h-0 grid-cols-12 gap-4">
          <div className="col-span-12 xl:col-span-8">
            <div className="h-[320px] min-h-0">
              <PerformanceCard
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
          </div>

          <div className="col-span-12 xl:col-span-4">
            <div className="h-[320px] min-h-0">
              <MetricsPanel dataset={dataset} />
            </div>
          </div>

          <div className="col-span-12 xl:col-span-8">
            <div className="h-[180px] min-h-0">
              <DrawdownCard series={filteredPerformanceSeries} />
            </div>
          </div>

          <div className="col-span-12 xl:col-span-4">
            <div className="h-[180px] min-h-0">
              <OverviewCard dataset={dataset} />
            </div>
          </div>

          <div className="col-span-12 md:col-span-6 xl:col-span-4">
            <div className="h-[180px] min-h-0">
              <BarsCard title="Annual Returns" items={filteredAnnualBars} />
            </div>
          </div>

          <div className="col-span-12 md:col-span-6 xl:col-span-4">
            <div className="h-[180px] min-h-0">
              <BarsCard title="Monthly Returns" items={dataset.monthlyReturns} />
            </div>
          </div>

          <div className="col-span-12 xl:col-span-4">
            <div className="h-[180px] min-h-0">
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
      </div>

      <DetailsCard groupBars={filteredGroupBars} strategyBars={filteredStrategyBars} />
    </div>
  );
}
