"use client";

import React, { useState } from "react";
import type { UniversalKpiStrings } from "@/components/dashboard/universal-kpi-strip";

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
}

const PAGE_BG = "#0c0d10";
const CARD_BG = "#1c1d20";
const BORDER = "1px solid rgba(255,255,255,0.06)";
const GOLD = "#e2ca7a";
const MUTED = "rgba(255,255,255,0.38)";
const RED = "#f87171";

const TIME_FILTERS = ["YTD", "1J", "3J", "5J", "Max"];

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

export function MobileAnalyticsView({ universal }: Props) {
  const [activeFilter, setActiveFilter] = useState(0);

  const kpiCards = [
    { label: "Total Return", value: universal.totalReturn24m },
    { label: "Max Drawdown", value: universal.maxDrawdown },
    { label: "Compounded Return", value: universal.compoundedReturn ?? "—" },
    { label: "Annualisiert", value: universal.annualizedReturn ?? "—" },
  ];

  const strategies = [
    {
      name: "White Swan",
      logo: "/branding/white-swan-icon.png",
      badge: "+97.2%",
      logoType: "img" as const,
    },
    {
      name: "Core Invest",
      logo: "/branding/capitalife-favicon.png",
      badge: "+42.1%",
      logoType: "img" as const,
    },
    {
      name: "Anomaly",
      logo: null,
      badge: "+18.5%",
      logoType: "letter" as const,
    },
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
            marginBottom: 16,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {TIME_FILTERS.map((filter, i) => (
            <button
              key={filter}
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
              {filter}
            </button>
          ))}
        </div>

        {/* Chart Placeholder */}
        <div
          style={{
            height: 180,
            background: "#0A0A0A",
            borderRadius: 14,
            border: BORDER,
            marginBottom: 28,
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            style={{ position: "absolute", bottom: 0, left: 0, width: "100%", opacity: 0.18 }}
            height="100"
            viewBox="0 0 375 100"
            preserveAspectRatio="none"
          >
            <path
              d="M0 80 C40 70, 60 40, 100 35 S160 20, 200 25 S280 10, 320 15 S360 30, 375 28"
              stroke={GOLD}
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M0 80 C40 70, 60 40, 100 35 S160 20, 200 25 S280 10, 320 15 S360 30, 375 28 L375 100 L0 100 Z"
              fill={GOLD}
              opacity="0.15"
            />
          </svg>
          <span
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.3)",
              fontWeight: 500,
              zIndex: 1,
            }}
          >
            Equity Curve — demnächst
          </span>
        </div>

        {/* Strategie-Übersicht */}
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          Strategie-Übersicht
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {strategies.map((s) => (
            <div
              key={s.name}
              style={{
                background: CARD_BG,
                border: BORDER,
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              {/* Logo */}
              {s.logoType === "img" && s.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.logo}
                  alt={s.name}
                  style={{ width: 32, height: 32, borderRadius: 8, objectFit: "contain" }}
                />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "rgba(226,202,122,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    color: GOLD,
                  }}
                >
                  A
                </div>
              )}

              {/* Name */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "white" }}>{s.name}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                  Daten werden geladen…
                </div>
              </div>

              {/* Badge */}
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 20,
                  background: "rgba(226,202,122,0.12)",
                  border: `1px solid rgba(226,202,122,0.25)`,
                  fontSize: 12,
                  fontWeight: 700,
                  color: GOLD,
                }}
              >
                {s.badge}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
