"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Compact mobile portfolio overview: headline KPI cards + a cumulative
// performance area chart + a row of secondary stats. Purely presentational —
// all numbers are computed server-side from the same loader the desktop uses.

const GOLD = "#e2ca7a";
const CARD_BG = "#1c1d20";
const CARD_BORDER = "rgba(255,255,255,0.06)";

export type HomeKpi = { label: string; value: string; positive?: boolean };
export type HomeStat = { label: string; value: string };
export type SeriesPoint = { label: string; value: number };

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function KpiCard({ kpi }: { kpi: HomeKpi }) {
  const accent = kpi.positive === undefined ? "#fafafa" : kpi.positive ? GOLD : "#e06c6c";
  return (
    <Card style={{ padding: "14px 14px 15px" }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.4)",
        }}
      >
        {kpi.label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 22,
          fontWeight: 700,
          color: accent,
          fontFamily: "var(--font-montserrat), sans-serif",
          letterSpacing: "-0.01em",
        }}
      >
        {kpi.value}
      </div>
    </Card>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SeriesPoint }>;
}) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        background: "rgba(12,13,16,0.95)",
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 10,
        padding: "7px 10px",
        fontSize: 11.5,
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>{p.label}</div>
      <div style={{ color: GOLD, fontWeight: 700 }}>
        {p.value >= 0 ? "+" : ""}
        {p.value.toFixed(1)}%
      </div>
    </div>
  );
}

export function MobileHomeView({
  kpis,
  series,
  stats,
}: {
  kpis: HomeKpi[];
  series: SeriesPoint[];
  stats: HomeStat[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Headline KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      {/* Performance chart */}
      <Card style={{ padding: "14px 6px 10px 6px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            padding: "0 10px 8px",
          }}
        >
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: "#fafafa",
              fontFamily: "var(--font-montserrat), sans-serif",
            }}
          >
            Performance
          </span>
          <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
            Kumuliert · monatlich
          </span>
        </div>
        {series.length > 1 ? (
          <div style={{ height: 168, width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="mobileGold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.12)" }} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={GOLD}
                  strokeWidth={2}
                  fill="url(#mobileGold)"
                  dot={false}
                  activeDot={{ r: 3, fill: GOLD, stroke: "#0c0d10", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            style={{
              height: 168,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.35)",
              fontSize: 12,
            }}
          >
            Keine Performance-Daten verfügbar
          </div>
        )}
      </Card>

      {/* Secondary stats */}
      {stats.length > 0 && (
        <Card style={{ padding: "4px 4px" }}>
          <div style={{ display: "flex" }}>
            {stats.map((s, i) => (
              <div
                key={s.label}
                style={{
                  flex: 1,
                  padding: "12px 8px",
                  textAlign: "center",
                  borderLeft: i === 0 ? "none" : `1px solid ${CARD_BORDER}`,
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#fafafa",
                    fontFamily: "var(--font-montserrat), sans-serif",
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
