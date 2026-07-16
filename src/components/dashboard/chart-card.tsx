"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { BarChart3, LineChart, Table } from "lucide-react";
import { FilterSwitch } from "@/components/dashboard/filter-switch";
import { PerformanceYearTable } from "@/components/dashboard/performance-year-table";
import { useHomeDashboard } from "@/context/home-dashboard-context";
import { cn } from "@/lib/utils";
import {
  buildChartSeries,
  buildCumulativeLineSeries,
  deserializeTrades,
  type SerializedTrade,
  type TimeRange,
} from "@/lib/trades-analytics";

const PerformanceChart = dynamic(
  () =>
    import("@/components/dashboard/performance-chart").then(
      (m) => m.PerformanceChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[48px] flex-1 rounded-lg bg-white/[0.02]" aria-hidden />
    ),
  }
);

const PerformanceLineChart = dynamic(
  () =>
    import("@/components/dashboard/performance-line-chart").then(
      (m) => m.PerformanceLineChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[48px] flex-1 rounded-lg bg-white/[0.02]" aria-hidden />
    ),
  }
);

type ChartCardProps = {
  trades: SerializedTrade[];
};

type ViewMode = "bar" | "line" | "table";

export function ChartCard({ trades }: ChartCardProps) {
  const [range, setRange] = useState<TimeRange>("1M");
  const [view, setView] = useState<ViewMode>("bar");

  const rows = useMemo(() => deserializeTrades(trades), [trades]);

  const chartData = useMemo(
    () => buildChartSeries(rows, range),
    [rows, range]
  );

  const lineData = useMemo(
    () => buildCumulativeLineSeries(rows, range),
    [rows, range]
  );

  const showYearBands = range !== "1Y" && view !== "table";

  const viewBtn = (mode: ViewMode, label: string, Icon: typeof BarChart3) => (
    <button
      type="button"
      onClick={() => setView(mode)}
      aria-pressed={view === mode}
      className={cn(
        "flex items-center gap-1.5 text-[13px] font-medium transition-colors [font-family:var(--font-montserrat),sans-serif]",
        view === mode
          ? "rounded-md border border-[#e2ca7a]/40 bg-gradient-to-b from-[#1c1d20] to-[#141517] px-3 py-1.5 font-semibold text-white shadow-[inset_0_-1px_0_0_rgba(226,202,122,0.5)]"
          : "border-0 bg-transparent px-2.5 py-1.5 text-zinc-500 hover:text-zinc-300"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.65} />
      {label}
    </button>
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/[0.06] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.4)]",
        "bg-gradient-to-b from-[#1c1d20] to-[#141517]"
      )}
    >
      <div className="flex shrink-0 flex-col gap-2 px-4 pb-2 pt-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {view !== "table" ? (
            <FilterSwitch value={range} onChange={setRange} />
          ) : null}
          <div className="flex flex-wrap items-center gap-1">
            {viewBtn("bar", "Bar", BarChart3)}
            {viewBtn("line", "Line", LineChart)}
            {viewBtn("table", "Table", Table)}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "flex min-h-0 w-full flex-1 flex-col overflow-hidden px-2 pb-2",
          view === "table" && "min-h-0 overflow-y-auto"
        )}
      >
        {view === "table" ? (
          <PerformanceYearTable trades={trades} />
        ) : view === "bar" ? (
          <PerformanceChart data={chartData} showYearBands={showYearBands} />
        ) : (
          <PerformanceLineChart data={lineData} showYearBands={showYearBands} />
        )}
      </div>
    </div>
  );
}

export function ChartSectionHeader() {
  const { rrReportingMode, setRrReportingMode } = useHomeDashboard();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-[15px] font-bold tracking-tight text-white [font-family:var(--font-montserrat),sans-serif]">
          Performance Overview
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
          Statement-based historical performance. Not independently audited.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={rrReportingMode}
          onClick={() => setRrReportingMode(!rrReportingMode)}
          aria-label="x4 ab Mai 2025"
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors [font-family:var(--font-montserrat),sans-serif]",
            rrReportingMode
              ? "border border-[#e2ca7a]/45 bg-[#2a2516] text-[#e2ca7a]"
              : "border border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-white/12 hover:bg-white/[0.05]"
          )}
        >
          x4
        </button>
        <button
          type="button"
          className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-zinc-300 transition-colors hover:border-white/12 hover:bg-white/[0.05] [font-family:var(--font-montserrat),sans-serif]"
        >
          Add Benchmark +
        </button>
      </div>
    </div>
  );
}
