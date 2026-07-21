"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import type { UniversalKpiStrings } from "@/components/dashboard/universal-kpi-strip";
import type { TimeFrame, ViewMode } from "@/components/dashboard/performance-report-chart";
import type { SerializedTrade } from "@/lib/trades-analytics";
import type { CapalifeData } from "@/lib/capitalife-data";

const PerformanceReportChart = dynamic(
  () => import("@/components/dashboard/performance-report-chart").then(m => m.PerformanceReportChart),
  { ssr: false, loading: () => <div style={{ height: 220 }} /> }
);

type PortfolioKpis = {
  totalReturn24mPct: number;
  maxDrawdownPct: number;
  ytdReturnDisplayPct: number;
  winRate?: number;
  totalTrades?: number;
};

interface Props {
  universal: UniversalKpiStrings;
  kpis: PortfolioKpis;
  trades: SerializedTrade[];
  capalifeData: CapalifeData;
}

const PAGE_BG = "#0c0d10";
const CARD_BG = "#1c1d20";
const BORDER = "1px solid rgba(255,255,255,0.06)";
const GOLD = "#e2ca7a";
const MUTED = "rgba(255,255,255,0.38)";
const RED = "#f87171";

const TIME_FILTERS: { label: string; tf: TimeFrame; view: ViewMode }[] = [
  { label: "1D",  tf: "1D", view: "Line" },
  { label: "1W",  tf: "1W", view: "Line" },
  { label: "1M",  tf: "1M", view: "Bar"  },
  { label: "3M",  tf: "3M", view: "Bar"  },
  { label: "1J",  tf: "1Y", view: "Bar"  },
];

function isPositive(val: string) {
  return val.startsWith("+") || (!val.startsWith("-") && parseFloat(val) > 0);
}

function isNegative(val: string) {
  return val.startsWith("-");
}

function KpiCard({ label, value }: { label: string; value: string }) {
  const color = isNegative(value) ? RED : isPositive(value) ? GOLD : "white";
  return (
    <div
      style={{
        background: CARD_BG,
        border: BORDER,
        borderRadius: 14,
        padding: "16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: MUTED,
          fontFamily: "var(--font-montserrat, sans-serif)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 22,
          fontWeight: 700,
          color,
          fontFamily: "var(--font-montserrat, sans-serif)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function MobileAnalyticsView({ universal, trades, capalifeData }: Props) {
  const [activeFilter, setActiveFilter] = useState(0);
  const active = TIME_FILTERS[activeFilter];

  const kpiCards = [
    { label: "Total Return", value: universal.totalReturn24m },
    { label: "Max Drawdown", value: universal.maxDrawdown },
    { label: "Compounded Return", value: universal.compoundedReturn ?? "—" },
    { label: "Annualisiert", value: universal.annualizedReturn ?? "—" },
  ];

  return (
    <div
      style={{
        minHeight: "100%",
        paddingBottom: 32,
        background: PAGE_BG,
        fontFamily: "var(--font-montserrat, sans-serif)",
        color: "white",
      }}
    >
      {/* Sticky Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: PAGE_BG,
          borderBottom: BORDER,
          padding: "20px 20px 16px",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "white",
          }}
        >
          Analytics
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED, fontWeight: 500 }}>
          Portfolio Performance
        </p>
      </div>

      <div style={{ padding: "20px 16px 0" }}>
        {/* 2×2 KPI Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 20,
          }}
        >
          {kpiCards.map((card) => (
            <KpiCard key={card.label} label={card.label} value={card.value} />
          ))}
        </div>

        {/* Time Filter Pills */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {TIME_FILTERS.map((filter, i) => (
            <button
              key={filter.label}
              onClick={() => setActiveFilter(i)}
              style={{
                flexShrink: 0,
                padding: "6px 16px",
                borderRadius: 20,
                border: activeFilter === i ? `1px solid ${GOLD}` : BORDER,
                background: activeFilter === i ? "rgba(226,202,122,0.12)" : CARD_BG,
                color: activeFilter === i ? GOLD : MUTED,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "var(--font-montserrat, sans-serif)",
                cursor: "pointer",
                letterSpacing: "0.04em",
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Equity Chart */}
        <div
          style={{
            background: "#0A0A0A",
            borderRadius: 14,
            border: BORDER,
            marginBottom: 28,
            overflow: "hidden",
            minHeight: 220,
          }}
        >
          <PerformanceReportChart
            trades={trades}
            timeframe={active.tf}
            view={active.view}
            capalifeData={capalifeData}
          />
        </div>
      </div>
    </div>
  );
}
