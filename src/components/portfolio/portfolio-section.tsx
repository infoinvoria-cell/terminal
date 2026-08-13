"use client";

import { useState } from "react";
import Image from "next/image";
import { SecondaryKpiRow } from "@/components/dashboard/secondary-kpi-row";
import {
  PerformanceReportChart,
  type TimeFrame,
  type ViewMode,
  type PortfolioDailySeriesPoint,
} from "@/components/dashboard/performance-report-chart";
import type { CapalifeData } from "@/lib/capitalife-data";
import type { TrackRecordOverview } from "@/lib/track-record/types";
import type { DashboardKpis, SerializedTrade } from "@/lib/trades-analytics";
import type { UniversalKpiStrings } from "@/components/dashboard/universal-kpi-strip";
import { InjectPillCss } from "@/components/ui/pill-button";
import type { SpyDailyReturn } from "@/lib/benchmark/spy-data";
import type { SpyBenchmarkKpis } from "@/lib/benchmark/spy-kpis";
import { TrackRecordViewSelector } from "@/components/dashboard/track-record-view-selector";
import type { AccountViewData, AccountViewId } from "@/lib/dashboard/dashboard-page-data";
import { useHeaderState } from "@/context/header-state-context";

type TradeEventSeriesPoint = {
  closeTimeUtc: string;
  closeTimeEpoch: number;
  cumulativeReturn: number;
  tradeId: string;
  symbol: string;
  side: string;
  netProfitLocal: number;
};

type PortfolioSectionProps = {
  trades: SerializedTrade[];
  kpis: DashboardKpis;
  capalifeData: CapalifeData;
  trackRecordOverview: TrackRecordOverview | null;
  spyDailyReturns: SpyDailyReturn[];
  showBenchmark: boolean;
  onBenchmarkChange: (v: boolean) => void;
  spyKpis: SpyBenchmarkKpis | null;
  performanceSeries?: PortfolioDailySeriesPoint[];
  tradeEventSeries?: TradeEventSeriesPoint[];
  /** Portfolio API KPIs from combined-track-record.json — passed to SecondaryKpiRow */
  universal?: Pick<UniversalKpiStrings, "calmar" | "sharpe" | "profitFactor" | "positiveMonths" | "volatility" | "portfolioStartDate">;
  /** Active account view for the 3-way selector */
  activeView?: AccountViewId;
  onViewChange?: (view: AccountViewId) => void;
  accountViews?: AccountViewData[];
};

const M = "var(--font-montserrat,'Montserrat',sans-serif)";

// ── Inline toggle ──────────────────────────────────────────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const track  = on ? "#8B8B92" : "#40414a";
  const knob   = on ? "#ECECEC" : "#6a6b73";
  const border = on ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.18)";
  return (
    <div
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onToggle()}
      style={{
        width: 34, height: 20, borderRadius: 999,
        background: track, border: `1.5px solid ${border}`,
        position: "relative", flexShrink: 0, cursor: "pointer",
        transition: "background 160ms ease",
      }}
    >
      <div style={{
        width: 13, height: 13, borderRadius: "50%", background: knob,
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        left: on ? "calc(100% - 16px)" : 3,
        transition: "left 160ms ease, background 160ms ease",
        boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
      }} />
    </div>
  );
}

function Btn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rc-pill ${active ? "rc-active" : "rc-inactive"}`}
      style={{
        fontFamily: M,
        padding: "5px 11px",
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        color: active ? "#F3F3F4" : "#6a6e7a",
      }}
    >
      {label}
    </button>
  );
}

export function PortfolioSection({
  trades,
  kpis,
  capalifeData,
  trackRecordOverview: _trackRecordOverview,
  spyDailyReturns,
  showBenchmark,
  onBenchmarkChange,
  spyKpis,
  performanceSeries,
  tradeEventSeries,
  universal,
  activeView = "combined",
  onViewChange,
  accountViews,
}: PortfolioSectionProps) {
  const { headerHidden } = useHeaderState();
  const defaultTf: TimeFrame = "1M";
  const defaultView: ViewMode = "Line";
  const [view, setView] = useState<ViewMode>(defaultView);
  const [timeframe, setTimeframe] = useState<TimeFrame>(defaultTf);
  const [lastLineTimeframe, setLastLineTimeframe] = useState<TimeFrame>(defaultTf);
  const [lastBarTimeframe, setLastBarTimeframe] = useState<TimeFrame>("1M");
  const [lastTableTimeframe, setLastTableTimeframe] = useState<TimeFrame>("1M");

  function handleViewChange(nextView: ViewMode) {
    setView(nextView);
    if (nextView === "Line") { setTimeframe(lastLineTimeframe); return; }
    if (nextView === "Bar")  { setTimeframe(lastBarTimeframe);  return; }
    setTimeframe(lastTableTimeframe);
  }

  function handleTimeframeChange(nextTf: TimeFrame) {
    setTimeframe(nextTf);
    if (view === "Line")  { setLastLineTimeframe(nextTf);  return; }
    if (view === "Bar")   { setLastBarTimeframe(nextTf);   return; }
    setLastTableTimeframe(nextTf);
  }

  const hasSpy = spyDailyReturns.length > 0;
  const activeViewData = accountViews?.find((v) => v.id === activeView);
  const methodologyLabel = activeViewData?.methodologyLabel ?? null;

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
          gap: 14,
        }}
      >
        {/* Secondary KPI row */}
        <div style={{ flexShrink: 0 }}>
          <SecondaryKpiRow
            kpis={kpis}
            trades={trades}
            capalifeData={capalifeData}
            showBenchmark={showBenchmark}
            spyKpis={spyKpis}
            universal={universal}
          />
        </div>

        {/* Performance Overview card */}
        <div
          style={{
            position: "relative",
            flex: "1 1 0",
            minHeight: headerHidden
              ? "clamp(500px, calc(100vh - 254px), 730px)"
              : "clamp(475px, calc(100vh - 279px), 700px)",
            overflow: "hidden",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.055)",
            background: "linear-gradient(to bottom, #17171b, #0b0b0e)",
            boxShadow: "0 12px 32px -12px rgba(0,0,0,0.4)",
          }}
        >
          {/* Header: title LEFT — controls RIGHT */}
          <div
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0,
              padding: "11px 14px 0",
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            {/* LEFT: title + methodology label */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "#f5f7fa",
                  fontFamily: M,
                  letterSpacing: "0.03em",
                  flexShrink: 0,
                }}
              >
                Performance Overview
              </span>
              {false && methodologyLabel && (
                <span
                  data-testid="track-record-fee-basis"
                  style={{
                    fontSize: 9,
                    color: "#4a4d56",
                    fontFamily: M,
                    letterSpacing: "0.02em",
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {methodologyLabel}
                </span>
              )}
            </div>

            {/* RIGHT: benchmark area + separator + timeframe + separator + view + separator + account selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {/* Benchmark toggle area — only when SPY data available */}
              {hasSpy && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 10, color: "#5a5d66", fontFamily: M }}>
                      Benchmark
                    </span>
                    <Toggle on={showBenchmark} onToggle={() => onBenchmarkChange(!showBenchmark)} />
                    {/* SPY legend — only when active */}
                    {showBenchmark && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, opacity: 0.9 }}>
                        <Image
                          src="/assets/invest/spy.png"
                          alt="SPY"
                          width={14}
                          height={14}
                          style={{ borderRadius: 2, objectFit: "contain" }}
                          unoptimized
                        />
                        <span style={{ fontSize: 9, color: "#ef5555", fontFamily: M, fontWeight: 600 }}>
                          S&amp;P 500
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Separator — extra margin left so Benchmark area doesn't crowd the line */}
                  <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.18)", flexShrink: 0, marginLeft: 6 }} />
                </>
              )}

              {/* Timeframe buttons */}
              <div style={{ display: "flex", gap: 3 }}>
                {(["1D", "1W", "1M", "3M", "1Y"] as TimeFrame[]).map((tf) => (
                  <Btn key={tf} label={tf} active={timeframe === tf} onClick={() => handleTimeframeChange(tf)} />
                ))}
              </div>
              {/* Separator */}
              <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.18)", flexShrink: 0 }} />
              {/* View buttons */}
              <div style={{ display: "flex", gap: 3 }}>
                {(["Bar", "Line", "Table"] as ViewMode[]).map((v) => (
                  <Btn key={v} label={v} active={view === v} onClick={() => handleViewChange(v)} />
                ))}
              </div>

              {/* Account view selector — only when multiple views available */}
              {accountViews && accountViews.length > 1 && onViewChange && (
                <>
                  {/* Separator */}
                  <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.18)", flexShrink: 0, marginRight: 6 }} />
                  <TrackRecordViewSelector
                    activeView={activeView}
                    onViewChange={onViewChange}
                  />
                </>
              )}
            </div>
          </div>

          {/* Chart area */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              paddingTop: 44,
              paddingLeft: 16,
              paddingRight: 12,
              paddingBottom: 6,
            }}
          >
            <PerformanceReportChart
              trades={trades}
              timeframe={timeframe}
              view={view}
              capalifeData={capalifeData}
              showBenchmark={showBenchmark}
              spyDailyReturns={spyDailyReturns}
              performanceSeries={performanceSeries}
              tradeEventSeries={tradeEventSeries}
            />
          </div>
        </div>
      </div>
    </>
  );
}
