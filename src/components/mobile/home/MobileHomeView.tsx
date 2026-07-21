"use client";

import { useState } from "react";
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

// ── Design tokens ─────────────────────────────────────────────────────────────

const GOLD        = "#e2ca7a";
const PAGE_BG     = "#0c0d10";
const CARD_BG     = "linear-gradient(180deg,#1c1d20 0%,#141517 100%)";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const CARD_SHADOW = "0 12px 28px -10px rgba(0,0,0,0.55)";
const LABEL_COLOR = "rgba(255,255,255,0.42)";
const MUTED_DIM   = "rgba(255,255,255,0.25)";

function card(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: CARD_BG,
    border: `1px solid ${CARD_BORDER}`,
    borderRadius: 16,
    boxShadow: CARD_SHADOW,
    ...extra,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Top KPI card (compact, single-row) ───────────────────────────────────────

function TopKpi({ label, value, positive }: MobileKpi) {
  return (
    <div style={card({
      padding: "10px 8px 12px",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      minHeight: 72,
    })}>
      <p style={{
        margin: 0, fontSize: 9, fontWeight: 600, color: LABEL_COLOR,
        fontFamily: "var(--font-montserrat,sans-serif)",
        letterSpacing: "0.01em", lineHeight: 1.3,
        textTransform: "uppercase",
      }}>
        {label}
      </p>
      <p style={{
        margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1,
        letterSpacing: "-0.02em",
        fontFamily: "var(--font-nunito,sans-serif)",
        color: positive ? "#ffffff" : "rgba(161,161,170,1)",
        wordBreak: "break-all",
      }}>
        {value}
      </p>
    </div>
  );
}

// ── Secondary KPI card (thin, 3×2 grid) ──────────────────────────────────────

function SecKpi({ label, value, delta, deltaPositive }: {
  label: string; value: string; delta?: string; deltaPositive?: boolean;
}) {
  return (
    <div style={card({
      padding: "8px 10px 10px",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      minHeight: 58,
    })}>
      <p style={{
        margin: 0, fontSize: 8.5, fontWeight: 600, color: LABEL_COLOR,
        fontFamily: "var(--font-montserrat,sans-serif)",
        textTransform: "uppercase", letterSpacing: "0.01em", lineHeight: 1.3,
      }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1,
          letterSpacing: "-0.02em",
          fontFamily: "var(--font-nunito,sans-serif)",
          color: "#ffffff", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {value}
        </p>
        {delta != null && deltaPositive != null && (
          deltaPositive ? (
            <span style={{
              flexShrink: 0,
              border: "1px solid rgba(226,202,122,0.32)", borderRadius: 999,
              padding: "1px 4px", fontSize: 8, fontWeight: 700, color: GOLD,
              fontFamily: "var(--font-nunito,sans-serif)", lineHeight: 1.4, whiteSpace: "nowrap",
            }}>
              {delta}
            </span>
          ) : (
            <span style={{
              flexShrink: 0, fontSize: 8, fontWeight: 600,
              color: "rgba(161,161,170,0.65)",
              fontFamily: "var(--font-nunito,sans-serif)", lineHeight: 1.4,
            }}>
              {delta}
            </span>
          )
        )}
      </div>
    </div>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function ChartTip({ active, payload }: { active?: boolean; payload?: { value: number }[] }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div style={{
      background: "#1c1d20", border: "1px solid rgba(42,43,48,1)",
      borderRadius: 10, padding: "6px 10px",
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

// ── Main view ─────────────────────────────────────────────────────────────────

type HomeTab = "portfolio" | "trades";

export function MobileHomeView({
  kpis,
  series,
  secondary,
}: {
  kpis: MobileKpi[];
  series: SeriesPoint[];
  stats: MobileStats;
  secondary: MobileSecondary;
}) {
  const [tab, setTab] = useState<HomeTab>("portfolio");
  const latest = series[series.length - 1]?.value ?? 0;

  const secCards = [
    { label: "Calmar",       value: secondary.calmar },
    { label: "Best Month",   value: secondary.bestMonth,  delta: secondary.bestMonth  !== "–" ? secondary.bestMonth  : undefined, deltaPositive: true  },
    { label: "Worst Month",  value: secondary.worstMonth, delta: secondary.worstMonth !== "–" ? secondary.worstMonth : undefined, deltaPositive: false },
    { label: "Pos. Months",  value: secondary.posMonths },
    { label: "Assets",       value: String(secondary.assets) },
    { label: "Strategies",   value: String(secondary.strategies) },
  ];

  return (
    <div style={{
      height: "calc(100dvh - 52px - 64px - env(safe-area-inset-bottom, 16px) - 8px)",
      display: "flex", flexDirection: "column",
      background: PAGE_BG,
      overflow: "hidden",
    }}>
      {/* Page header */}
      <div style={{ padding: "12px 16px 8px", flexShrink: 0 }}>
        <p style={{
          margin: "0 0 2px",
          fontSize: 10, fontWeight: 600, color: LABEL_COLOR,
          fontFamily: "var(--font-montserrat,sans-serif)",
          letterSpacing: "0.07em", textTransform: "uppercase",
        }}>
          HOME
        </p>
        <h1 style={{
          margin: 0, fontSize: 18, fontWeight: 700, color: "#fafafa",
          fontFamily: "var(--font-montserrat,sans-serif)", letterSpacing: "-0.01em",
        }}>
          Portfolio
        </h1>
      </div>

      {/* 4 KPIs in single row */}
      <div style={{ padding: "0 12px 8px", flexShrink: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
          {kpis.map(k => <TopKpi key={k.label} {...k} />)}
        </div>
      </div>

      {/* Portfolio / Trades tab buttons */}
      <div style={{ padding: "0 12px 8px", flexShrink: 0, display: "flex", gap: 6 }}>
        {(["portfolio", "trades"] as HomeTab[]).map(t => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: active ? "linear-gradient(180deg,#1c1d20 0%,#141517 100%)" : "transparent",
                border: active ? `1px solid rgba(255,255,255,0.12)` : "1px solid transparent",
                borderRadius: 20, padding: "4px 12px",
                color: active ? "#ffffff" : "rgba(255,255,255,0.38)",
                fontSize: 11, fontWeight: active ? 600 : 500,
                fontFamily: "var(--font-montserrat,sans-serif)",
                cursor: "pointer", WebkitTapHighlightColor: "transparent",
                boxShadow: active ? "inset 0 -1px 0 0 rgba(255,255,255,0.08)" : "none",
                transition: "all 120ms",
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* 6 secondary KPI cards — 3×2 thin */}
      <div style={{ padding: "0 12px 8px", flexShrink: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
          {secCards.map(c => <SecKpi key={c.label} {...c} />)}
        </div>
      </div>

      {/* Performance Overview — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, padding: "0 12px 10px", display: "flex", flexDirection: "column" }}>
        <p style={{
          margin: "0 0 6px",
          fontSize: 10, fontWeight: 600, color: LABEL_COLOR,
          fontFamily: "var(--font-montserrat,sans-serif)",
          textTransform: "uppercase", letterSpacing: "0.06em",
          flexShrink: 0,
        }}>
          Performance Overview
        </p>
        <div style={{ ...card(), flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "10px 14px 4px", flexShrink: 0 }}>
            <span style={{
              fontSize: 9, fontWeight: 600, color: LABEL_COLOR,
              fontFamily: "var(--font-montserrat,sans-serif)",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              Kumuliert
            </span>
            <span style={{
              fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em",
              fontFamily: "var(--font-nunito,sans-serif)",
              color: latest >= 0 ? GOLD : "rgba(161,161,170,1)",
            }}>
              {latest >= 0 ? "+" : ""}{latest.toFixed(1)}%
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="mGold2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(42,43,48,0.22)" strokeDasharray="0" vertical={false} />
                <ReferenceLine y={0} stroke="rgba(161,161,170,0.28)" strokeWidth={1} />
                <XAxis dataKey="date" hide />
                <YAxis
                  tick={{ fill: MUTED_DIM, fontSize: 9 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${v}%`}
                />
                <Tooltip content={<ChartTip />} />
                <Area
                  type="monotone" dataKey="value"
                  stroke={GOLD} strokeWidth={1.8}
                  fill="url(#mGold2)" dot={false}
                  activeDot={{ r: 3, fill: GOLD, stroke: "#1c1d20", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
