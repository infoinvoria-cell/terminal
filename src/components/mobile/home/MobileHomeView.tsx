"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Design tokens — exact desktop values, scaled for 375px ───────────────

const GOLD        = "#e2ca7a";
const PAGE_BG     = "#0c0d10";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const CARD_SHADOW = "0 20px 40px -16px rgba(0,0,0,0.55)";
const LABEL_COLOR = "rgba(255,255,255,0.45)";
const MUTED_DIM   = "rgba(255,255,255,0.28)";

function cardBase(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: "linear-gradient(180deg,#1c1d20 0%,#141517 100%)",
    border: `1px solid ${CARD_BORDER}`,
    borderRadius: 20,
    boxShadow: CARD_SHADOW,
    ...extra,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────

export type MobileKpi = { label: string; value: string; positive: boolean };
export type SeriesPoint = { date: string; value: number };
export type MobileSecondary = {
  calmar: string;
  bestMonth: string;
  worstMonth: string;
  posMonths: string;
  assets: string | number;
  strategies: string | number;
};
export type MobileStats = { assets: number; strategies: number; ytd: number };

// ── Primary KPI card (mirrors desktop KpiCard) ────────────────────────────

function PrimaryKpiCard({ label, value, positive }: MobileKpi) {
  return (
    <div style={cardBase({ padding: "14px 16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 108 })}>
      <p style={{
        margin: 0, fontSize: 11, fontWeight: 500, color: LABEL_COLOR,
        fontFamily: "var(--font-montserrat,sans-serif)", letterSpacing: "0.01em", lineHeight: 1.3,
      }}>
        {label}
      </p>
      <p style={{
        margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1,
        letterSpacing: "-0.02em", fontFamily: "var(--font-nunito,sans-serif)",
        color: positive ? "#ffffff" : "rgba(161,161,170,1)",
      }}>
        {value}
      </p>
    </div>
  );
}

// ── Secondary KPI card (mirrors desktop SecondaryCard) ────────────────────

function SecondaryKpiCard({
  label, value, delta, deltaPositive, sub,
}: {
  label: string; value: string; delta?: string; deltaPositive?: boolean; sub?: string;
}) {
  return (
    <div style={cardBase({ padding: "12px 12px 14px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 90 })}>
      <p style={{
        margin: 0, fontSize: 10, fontWeight: 500, color: LABEL_COLOR,
        fontFamily: "var(--font-montserrat,sans-serif)", letterSpacing: "0.01em", lineHeight: 1.3,
      }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 4, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 19, fontWeight: 700, lineHeight: 1,
          letterSpacing: "-0.02em", fontFamily: "var(--font-nunito,sans-serif)",
          color: "#ffffff", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {value}
        </p>
        {delta && deltaPositive !== undefined && (
          deltaPositive ? (
            <span style={{
              flexShrink: 0, border: "1px solid rgba(226,202,122,0.35)", borderRadius: 999,
              padding: "2px 5px", fontSize: 9, fontWeight: 700, color: GOLD,
              fontFamily: "var(--font-nunito,sans-serif)", lineHeight: 1.4, whiteSpace: "nowrap",
            }}>
              {delta}
            </span>
          ) : (
            <span style={{
              flexShrink: 0, fontSize: 9, fontWeight: 600,
              color: "rgba(161,161,170,0.7)", fontFamily: "var(--font-nunito,sans-serif)",
              lineHeight: 1.4,
            }}>
              {delta}
            </span>
          )
        )}
      </div>
      {sub && (
        <p style={{ margin: 0, fontSize: 9, color: MUTED_DIM, fontFamily: "var(--font-montserrat,sans-serif)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────

function ChartTip({ active, payload }: { active?: boolean; payload?: { value: number }[] }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div style={{
      background: "#1c1d20", border: "1px solid rgba(42,43,48,1)",
      borderRadius: 10, padding: "6px 10px", boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
    }}>
      <p style={{
        margin: 0, fontSize: 12, fontWeight: 700,
        fontFamily: "var(--font-nunito,sans-serif)",
        color: v >= 0 ? GOLD : "rgba(161,161,170,1)",
      }}>
        {v >= 0 ? "+" : ""}{v.toFixed(2)}%
      </p>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────

export function MobileHomeView({
  kpis,
  series,
  stats,
  secondary,
}: {
  kpis: MobileKpi[];
  series: SeriesPoint[];
  stats: MobileStats;
  secondary: MobileSecondary;
}) {
  const latest = series[series.length - 1]?.value ?? 0;

  const secCards = [
    { label: "Calmar Ratio",  value: secondary.calmar },
    { label: "Best Month",    value: secondary.bestMonth,  delta: secondary.bestMonth  !== "–" ? secondary.bestMonth  : undefined, deltaPositive: true  },
    { label: "Worst Month",   value: secondary.worstMonth, delta: secondary.worstMonth !== "–" ? secondary.worstMonth : undefined, deltaPositive: false },
    { label: "Pos. Months",   value: secondary.posMonths },
    { label: "Assets",        value: String(secondary.assets) },
    { label: "Strategies",    value: String(secondary.strategies), sub: "10 approaches" },
  ];

  return (
    <div style={{ minHeight: "100%", background: PAGE_BG }}>

      {/* Header */}
      <header style={{ padding: "22px 16px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <p style={{
          margin: "0 0 4px",
          fontSize: 10, fontWeight: 600, color: LABEL_COLOR,
          fontFamily: "var(--font-montserrat,sans-serif)",
          letterSpacing: "0.07em", textTransform: "uppercase",
        }}>
          HOME
        </p>
        <h1 style={{
          margin: 0, fontSize: 20, fontWeight: 700, color: "#fafafa",
          fontFamily: "var(--font-montserrat,sans-serif)", letterSpacing: "-0.01em",
        }}>
          Portfolio
        </h1>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: LABEL_COLOR, fontFamily: "var(--font-montserrat,sans-serif)", fontWeight: 500 }}>
          Capitalife · White Swan
        </p>
      </header>

      {/* Content */}
      <div style={{ padding: "16px 14px 24px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* 2×2 Primary KPI grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {kpis.map(k => <PrimaryKpiCard key={k.label} {...k} />)}
        </div>

        {/* Cumulative performance chart card */}
        <div style={cardBase({ overflow: "hidden" })}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "16px 16px 4px" }}>
            <span style={{
              fontSize: 10, fontWeight: 600, color: LABEL_COLOR,
              fontFamily: "var(--font-montserrat,sans-serif)",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              Kumulierte Performance
            </span>
            <span style={{
              fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em",
              fontFamily: "var(--font-nunito,sans-serif)",
              color: latest >= 0 ? GOLD : "rgba(161,161,170,1)",
            }}>
              {latest >= 0 ? "+" : ""}{latest.toFixed(1)}%
            </span>
          </div>
          <div style={{ width: "100%", height: 148 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 10, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="mGold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(42,43,48,0.22)" strokeDasharray="0" vertical={false} />
                <ReferenceLine y={0} stroke="rgba(161,161,170,0.3)" strokeWidth={1} />
                <XAxis dataKey="date" hide />
                <YAxis
                  tick={{ fill: MUTED_DIM, fontSize: 9 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${v}%`}
                />
                <Tooltip content={<ChartTip />} />
                <Area
                  type="monotone" dataKey="value"
                  stroke={GOLD} strokeWidth={1.8}
                  fill="url(#mGold)" dot={false}
                  activeDot={{ r: 3, fill: GOLD, stroke: "#1c1d20", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3×2 Secondary KPI grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {secCards.map(c => <SecondaryKpiCard key={c.label} {...c} />)}
        </div>

        {/* YTD — full-width row */}
        <div style={cardBase({ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" })}>
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 500, color: LABEL_COLOR,
            fontFamily: "var(--font-montserrat,sans-serif)", letterSpacing: "0.01em",
          }}>
            YTD Return
          </p>
          <p style={{
            margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em",
            fontFamily: "var(--font-nunito,sans-serif)",
            color: stats.ytd >= 0 ? "#ffffff" : "rgba(161,161,170,1)",
          }}>
            {stats.ytd ? `${stats.ytd >= 0 ? "+" : ""}${stats.ytd.toFixed(1)}%` : "–"}
          </p>
        </div>

      </div>
    </div>
  );
}
