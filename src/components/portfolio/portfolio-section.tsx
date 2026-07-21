"use client";

import { useState } from "react";
import { SecondaryKpiRow } from "@/components/dashboard/secondary-kpi-row";
import {
  PerformanceReportChart,
  type TimeFrame,
  type ViewMode,
} from "@/components/dashboard/performance-report-chart";
import type { CapalifeData } from "@/lib/capitalife-data";
import type { DashboardKpis, SerializedTrade } from "@/lib/trades-analytics";

type PortfolioSectionProps = {
  trades: SerializedTrade[];
  kpis: DashboardKpis;
  capalifeData: CapalifeData;
};

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
      style={{
        height: 30,
        minWidth: 36,
        padding: "0 12px",
        borderRadius: 15,
        fontSize: 11,
        fontFamily: "var(--font-montserrat,sans-serif)",
        fontWeight: 500,
        cursor: "pointer",
        lineHeight: "30px",
        background: active ? "rgba(255,255,255,0.07)" : "transparent",
        border: `1px solid ${active ? "#ffffff" : "rgba(255,255,255,0.09)"}`,
        color: active ? "#ffffff" : "#7a7d87",
        transition: "border-color 0.15s, color 0.15s, background 0.15s",
      }}
    >
      {label}
    </button>
  );
}

export function PortfolioSection({ trades, kpis, capalifeData }: PortfolioSectionProps) {
  const [view, setView] = useState<ViewMode>("Line");
  const [timeframe, setTimeframe] = useState<TimeFrame>("1D");
  const [lastLineTimeframe, setLastLineTimeframe] = useState<TimeFrame>("1D");
  const [lastBarTimeframe, setLastBarTimeframe] = useState<TimeFrame>("1M");
  const [lastTableTimeframe, setLastTableTimeframe] = useState<TimeFrame>("1M");

  function handleViewChange(nextView: ViewMode) {
    setView(nextView);
    if (nextView === "Line") {
      setTimeframe(lastLineTimeframe);
      return;
    }
    if (nextView === "Bar") {
      setTimeframe(lastBarTimeframe);
      return;
    }
    setTimeframe(lastTableTimeframe);
  }

  function handleTimeframeChange(nextTimeframe: TimeFrame) {
    setTimeframe(nextTimeframe);
    if (view === "Line") {
      setLastLineTimeframe(nextTimeframe);
      return;
    }
    if (view === "Bar") {
      setLastBarTimeframe(nextTimeframe);
      return;
    }
    setLastTableTimeframe(nextTimeframe);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* KPI row */}
      <div style={{ flexShrink: 0 }}>
        <SecondaryKpiRow kpis={kpis} trades={trades} />
      </div>

      {/* Section title — OUTSIDE and ABOVE the card */}
      <div
        style={{
          flexShrink: 0,
          padding: "18px 4px 13px",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#c8cad0",
            fontFamily: "var(--font-montserrat,sans-serif)",
            letterSpacing: "0.01em",
          }}
        >
          Performance Overview
        </span>
      </div>

      {/* Chart card — NO separator line inside, buttons top-right */}
      <div
        style={{
          position: "relative",
          flex: "1 1 0",
          minHeight: 0,
          overflow: "hidden",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.06)",
          background: "linear-gradient(180deg, #1c1d20 0%, #141517 100%)",
          boxShadow: "0 12px 32px -12px rgba(0,0,0,0.4)",
        }}
      >
        {/* Controls — inside card, top-right, no separator line above */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            padding: "14px 16px 0",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            {(["1D", "1W", "1M", "3M", "1Y"] as TimeFrame[]).map((tf) => (
              <Btn
                key={tf}
                label={tf}
                active={timeframe === tf}
                onClick={() => handleTimeframeChange(tf)}
              />
            ))}
          </div>
          <div
            style={{
              width: 1,
              height: 14,
              background: "rgba(255,255,255,0.08)",
              flexShrink: 0,
            }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {(["Bar", "Line", "Table"] as ViewMode[]).map((v) => (
              <Btn
                key={v}
                label={v}
                active={view === v}
                onClick={() => handleViewChange(v)}
              />
            ))}
          </div>
        </div>

        {/* Chart — fills entire card, paddingTop keeps clear of buttons */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            paddingTop: 54,
            paddingLeft: 20,
            paddingRight: 14,
            paddingBottom: 12,
          }}
        >
          <PerformanceReportChart trades={trades} timeframe={timeframe} view={view} capalifeData={capalifeData} />
        </div>
      </div>
    </div>
  );
}
