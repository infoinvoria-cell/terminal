"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { BarChart3, LineChart, Table } from "lucide-react";
import { FilterSwitch } from "@/components/dashboard/filter-switch";
import { PerformanceYearTable } from "@/components/dashboard/performance-year-table";
import { useHomeDashboard } from "@/context/home-dashboard-context";
import { cn } from "@/lib/utils";
import { InjectPillCss, PillButton } from "@/components/ui/pill-button";
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
    <PillButton
      key={mode}
      active={view === mode}
      label={label}
      icon={<Icon style={{ width: 14, height: 14, flexShrink: 0, opacity: view === mode ? 1 : 0.5 }} strokeWidth={1.65} />}
      onClick={() => setView(mode)}
      role="button"
      padding="7px 14px"
      fontSize={12}
    />
  );

  return (
    <>
      <InjectPillCss />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.055)",
          background: "linear-gradient(to bottom, #17171b, #0b0b0e)",
          boxShadow: "0 12px 32px -12px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "10px 14px 8px", flexShrink: 0, flexWrap: "wrap" }}>
          {view !== "table" ? (
            <FilterSwitch value={range} onChange={setRange} />
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {viewBtn("bar", "Bar", BarChart3)}
            {viewBtn("line", "Line", LineChart)}
            {viewBtn("table", "Table", Table)}
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
    </>
  );
}

export function ChartSectionHeader() {
  const { rrReportingMode, setRrReportingMode } = useHomeDashboard();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-[11px] font-bold tracking-[0.04em] text-[#f5f7fa] [font-family:var(--font-montserrat,'Montserrat',sans-serif)]">
          Performance Overview
        </h2>
        <p className="mt-0.5 text-[11px] text-[rgba(180,192,210,0.45)] [font-family:var(--font-montserrat,'Montserrat',sans-serif)]">
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
            "rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors [font-family:var(--font-montserrat,'Montserrat',sans-serif)]",
            rrReportingMode
              ? "border border-[#D6B24A]/45 bg-[#2a2516] text-[#D6B24A]"
              : "border border-white/[0.08] bg-white/[0.03] text-[#F0F2F6] hover:border-white/12 hover:bg-white/[0.05]"
          )}
        >
          x4
        </button>
        <button
          type="button"
          className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-[#F0F2F6] transition-colors hover:border-white/12 hover:bg-white/[0.05] [font-family:var(--font-montserrat,'Montserrat',sans-serif)]"
        >
          Add Benchmark +
        </button>
      </div>
    </div>
  );
}
