"use client";

/**
 * Capitalife Design Reference — INTERNAL / DEVELOPMENT ONLY
 *
 * Demonstrates canonical primitives, tokens, and visual language.
 * Used as the golden reference for agent visual QA.
 * All values are synthetic — no real portfolio data.
 *
 * Route: /design-reference — not linked from sidebar, not for public use.
 * Protected: renders a 404-equivalent in production (NODE_ENV !== "development").
 */

import { notFound } from "next/navigation";
import { MetricCard, SectionHeader, DataTable } from "@/components/ui/primitives";
import { COLORS, GRADIENTS, CHART_CARD_STYLE, HEADER_SPAN_STYLE, RADIUS, BORDER_STANDARD, PILL_CSS, FONTS } from "@/lib/design-tokens";
import { useState } from "react";

// ── Synthetic sample data ─────────────────────────────────────────────────────

const SAMPLE_KPIS = [
  { label: "TOTAL RETURN", value: "+47.2%", tone: "default" as const },
  { label: "MAX DRAWDOWN", value: "-8.5%", tone: "risk" as const },
  { label: "SHARPE RATIO", value: "1.030", tone: "default" as const },
  { label: "CALMAR RATIO", value: "2.14", tone: "default" as const },
  { label: "PROFIT FACTOR", value: "1.38", tone: "default" as const },
  { label: "ANNUALIZED p.a.", value: "+18.3%", tone: "default" as const },
];

const SAMPLE_TABLE_ROWS = [
  { strategy: "EUR/USD M6E", cagr: "+22.4%", sharpe: "1.14", maxdd: "-6.2%", pf: "1.42" },
  { strategy: "DAX FDAX1", cagr: "+18.1%", sharpe: "0.94", maxdd: "-9.8%", pf: "1.28" },
  { strategy: "GLD Trend", cagr: "+14.7%", sharpe: "1.30", maxdd: "-4.5%", pf: "1.61" },
  { strategy: "ZM Momentum", cagr: "+9.2%", sharpe: "0.78", maxdd: "-12.1%", pf: "1.14" },
];

const SAMPLE_STATUS = [
  { label: "White Swan", status: "LIVE" as const },
  { label: "Sentinel", status: "LIVE" as const },
  { label: "Engine", status: "OFFLINE" as const },
  { label: "Brain", status: "LOCAL" as const },
];

// ── Pill state demo ───────────────────────────────────────────────────────────

const CHART_TABS = ["Equity", "Drawdown", "Bars"] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DesignReferencePage() {
  // Block in production — this is a dev/QA tool, never a public product route
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const [activeTab, setActiveTab] = useState<(typeof CHART_TABS)[number]>("Equity");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PILL_CSS + `
        .dr-row-hover:hover { background: rgba(255,255,255,0.02) !important; }
      ` }} />

      <div style={{
        padding: "24px 24px 48px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 32,
        background: COLORS.PAGE_BG,
        minHeight: "100%",
        overflowY: "auto",
      }}>

        {/* ── Page header ───────────────────────────────────────────────────── */}
        <div>
          <div style={{
            fontFamily: FONTS.MONTSERRAT,
            fontSize: 9,
            fontWeight: 700,
            color: COLORS.TEXT_INACTIVE,
            letterSpacing: "2px",
            textTransform: "uppercase",
            marginBottom: 6,
          }}>
            INTERNAL · DESIGN REFERENCE
          </div>
          <div style={{
            fontFamily: FONTS.NUNITO,
            fontSize: 28,
            fontWeight: 700,
            color: COLORS.TEXT_HEADER,
            lineHeight: 1,
            letterSpacing: "-0.01em",
          }}>
            Capitalife Design System
          </div>
          <div style={{
            fontFamily: FONTS.MONTSERRAT,
            fontSize: 11,
            color: COLORS.TEXT_MUTED,
            marginTop: 6,
          }}>
            Golden reference for agent visual QA · All values synthetic
          </div>
        </div>

        {/* ── Section 1: Metric grid (compact) ──────────────────────────────── */}
        <section>
          <SectionHeader>PERFORMANCE OVERVIEW</SectionHeader>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 8,
          }}>
            {SAMPLE_KPIS.map((kpi) => (
              <MetricCard
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                tone={kpi.tone}
              />
            ))}
          </div>
        </section>

        {/* ── Section 2: Chart card row ──────────────────────────────────────── */}
        <section>
          <SectionHeader>CHART CARDS</SectionHeader>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>

            {/* Chart card 1 — Equity */}
            <div style={{ ...CHART_CARD_STYLE }}>
              <div style={{
                padding: "10px 14px 8px",
                borderBottom: `1px solid ${COLORS.DIVIDER}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <span style={HEADER_SPAN_STYLE}>EQUITY CURVE</span>
                <span style={{
                  fontFamily: FONTS.NUNITO,
                  fontSize: 11,
                  color: COLORS.TEXT_PRIMARY,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  +47.2%
                </span>
              </div>
              <div style={{
                height: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: COLORS.TEXT_INACTIVE,
                fontFamily: FONTS.MONTSERRAT,
                fontSize: 9,
              }}>
                [equity chart]
              </div>
            </div>

            {/* Chart card 2 — Drawdown (risk tone) */}
            <div style={{ ...CHART_CARD_STYLE }}>
              <div style={{
                padding: "10px 14px 8px",
                borderBottom: `1px solid ${COLORS.DIVIDER}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <span style={HEADER_SPAN_STYLE}>MAX DRAWDOWN</span>
                <span style={{
                  fontFamily: FONTS.NUNITO,
                  fontSize: 11,
                  color: COLORS.GOLD,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  -8.5%
                </span>
              </div>
              <div style={{
                height: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: COLORS.TEXT_INACTIVE,
                fontFamily: FONTS.MONTSERRAT,
                fontSize: 9,
              }}>
                [drawdown chart · gold line]
              </div>
            </div>

            {/* Chart card 3 — Bar */}
            <div style={{ ...CHART_CARD_STYLE }}>
              <div style={{
                padding: "10px 14px 8px",
                borderBottom: `1px solid ${COLORS.DIVIDER}`,
              }}>
                <span style={HEADER_SPAN_STYLE}>MONTHLY RETURNS</span>
              </div>
              <div style={{
                height: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: COLORS.TEXT_INACTIVE,
                fontFamily: FONTS.MONTSERRAT,
                fontSize: 9,
              }}>
                [bar chart · white/gold]
              </div>
            </div>

          </div>
        </section>

        {/* ── Section 3: Pill control demo ──────────────────────────────────── */}
        <section>
          <SectionHeader>CONTROLS — PILL PATTERN</SectionHeader>
          <div style={{
            display: "inline-flex",
            gap: 4,
            background: "rgba(255,255,255,0.03)",
            borderRadius: RADIUS.kpi,
            padding: 4,
            border: BORDER_STANDARD,
          }}>
            {CHART_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={tab === activeTab ? "rc-pill rc-active" : "rc-pill rc-inactive"}
                style={{
                  padding: "5px 14px",
                  fontFamily: FONTS.MONTSERRAT,
                  fontSize: 10,
                  fontWeight: 700,
                  color: tab === activeTab ? COLORS.TEXT_ACTIVE : COLORS.TEXT_INACTIVE,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </section>

        {/* ── Section 4: Data table ──────────────────────────────────────────── */}
        <section>
          <SectionHeader>DATA TABLE</SectionHeader>
          <DataTable
            columns={[
              { key: "strategy", label: "STRATEGY", align: "left" },
              { key: "cagr", label: "CAGR", align: "right" },
              { key: "sharpe", label: "SHARPE", align: "right" },
              {
                key: "maxdd",
                label: "MAX DD",
                align: "right",
                tone: () => "risk",
              },
              { key: "pf", label: "PF", align: "right" },
            ]}
            rows={SAMPLE_TABLE_ROWS}
          />
        </section>

        {/* ── Section 5: Status row ─────────────────────────────────────────── */}
        <section>
          <SectionHeader>COMPACT STATUS ROW</SectionHeader>
          <div style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}>
            {SAMPLE_STATUS.map(({ label, status }) => {
              const isLive = status === "LIVE";
              const isLocal = status === "LOCAL";
              return (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    background: GRADIENTS.KPI_BG,
                    borderRadius: 6,
                    border: BORDER_STANDARD,
                  }}
                >
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: isLive ? COLORS.TEXT_PRIMARY : isLocal ? COLORS.GOLD : COLORS.TEXT_INACTIVE,
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: FONTS.MONTSERRAT,
                    fontSize: 10,
                    fontWeight: 600,
                    color: COLORS.TEXT_PRIMARY,
                  }}>
                    {label}
                  </span>
                  <span style={{
                    fontFamily: FONTS.MONTSERRAT,
                    fontSize: 9,
                    color: isLive ? COLORS.TEXT_MUTED : isLocal ? COLORS.GOLD : COLORS.TEXT_INACTIVE,
                  }}>
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Section 6: Token reference ────────────────────────────────────── */}
        <section>
          <SectionHeader>DESIGN TOKEN SWATCHES</SectionHeader>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { name: "PAGE_BG", color: COLORS.PAGE_BG },
              { name: "KPI gradient start", color: "#26262D" },
              { name: "KPI gradient end", color: "#111114" },
              { name: "CHART gradient start", color: "#17171B" },
              { name: "BORDER", color: "rgba(255,255,255,0.055)" },
              { name: "TEXT_PRIMARY", color: COLORS.TEXT_PRIMARY },
              { name: "TEXT_MUTED", color: COLORS.TEXT_MUTED },
              { name: "GOLD (#C9A84C)", color: "#C9A84C" },
              { name: "GOLD LIVE (#D6B24A)", color: COLORS.GOLD },
              { name: "TEXT_INACTIVE", color: COLORS.TEXT_INACTIVE },
            ].map(({ name, color }) => (
              <div key={name} style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                background: GRADIENTS.KPI_BG,
                borderRadius: 6,
                border: BORDER_STANDARD,
              }}>
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: color,
                  border: "1px solid rgba(255,255,255,0.1)",
                  flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: FONTS.MONTSERRAT,
                  fontSize: 9,
                  color: COLORS.TEXT_MUTED,
                  letterSpacing: "0.5px",
                }}>
                  {name}
                </span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </>
  );
}
