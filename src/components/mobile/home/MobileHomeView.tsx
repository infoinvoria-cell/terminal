"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const GOLD = "#e2ca7a";
const CARD_BG = "#1c1d20";
const CARD_BORDER = "rgba(255,255,255,0.06)";

type Kpi = { label: string; value: string; positive: boolean };
type SeriesPoint = { date: string; value: number };
type Stats = { assets: number; strategies: number; ytd: number };

function KpiCard({ label, value, positive }: Kpi) {
  return (
    <div style={{
      flex: 1,
      background: CARD_BG,
      border: `1px solid ${CARD_BORDER}`,
      borderRadius: 14,
      padding: "12px 14px",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: positive ? GOLD : "#f87171", fontFamily: "var(--font-montserrat), sans-serif", lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { value: number }[] }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div style={{ background: "#16171a", border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
      <span style={{ color: v >= 0 ? GOLD : "#f87171", fontWeight: 700 }}>
        {v >= 0 ? "+" : ""}{v.toFixed(1)}%
      </span>
    </div>
  );
}

export function MobileHomeView({ kpis, series, stats }: { kpis: Kpi[]; series: SeriesPoint[]; stats: Stats }) {
  const latest = series[series.length - 1]?.value ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header */}
      <header style={{
        padding: "20px 16px 10px",
        background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))",
      }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-montserrat), sans-serif" }}>
          Portfolio
        </h1>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>
          Capitalife · White Swan
        </p>
      </header>

      <div style={{ padding: "8px 16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* KPI grid 2×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>

        {/* Chart */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "14px 6px 10px 0", overflow: "hidden" }}>
          <div style={{ padding: "0 14px 10px" }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              Kumulierte Performance
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: latest >= 0 ? GOLD : "#f87171", marginLeft: 10, fontFamily: "var(--font-montserrat), sans-serif" }}>
              {latest >= 0 ? "+" : ""}{latest.toFixed(1)}%
            </span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={series} margin={{ top: 4, right: 10, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="mobileGold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="value" stroke={GOLD} strokeWidth={1.8} fill="url(#mobileGold)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: "Assets", value: stats.assets || "–" },
            { label: "Strategien", value: stats.strategies || "–" },
            { label: "YTD", value: stats.ytd ? `${stats.ytd > 0 ? "+" : ""}${stats.ytd.toFixed(1)}%` : "–" },
          ].map(({ label, value }) => (
            <div key={label} style={{
              flex: 1,
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 12,
              padding: "10px 12px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fafafa", marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
