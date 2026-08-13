"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import { computeRollingCorrelation } from "@/lib/modeling/transforms";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  series: AnalyticsSeriesPoint[];
  benchmarkSeries: AnalyticsSeriesPoint[];
  progress: number;
};

const WINDOWS = [12, 24, 36];

export function DynamicCorrelationModel({ series, benchmarkSeries, progress }: Props) {
  const [window_, setWindow] = useState(24);

  const corrData = useMemo(() => {
    if (!series.length || !benchmarkSeries.length) return [];
    const n = Math.max(2, Math.ceil(series.length * progress));
    return computeRollingCorrelation(series.slice(0, n), benchmarkSeries, window_);
  }, [series, benchmarkSeries, window_, progress]);

  if (!series.length || !benchmarkSeries.length) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textMuted, fontSize: 11, fontFamily: FONT_LABEL }}>
        {!benchmarkSeries.length ? "NO BENCHMARK DATA" : "DATA UNAVAILABLE"}
      </div>
    );
  }

  const lastCorr = corrData[corrData.length - 1]?.correlation ?? null;
  const avgCorr = corrData.length ? corrData.reduce((s, p) => s + p.correlation, 0) / corrData.length : null;

  // Color: positive correlation → white, negative → gold
  function corrColor(v: number) {
    return v >= 0 ? MC_COLORS.whiteDim : MC_COLORS.gold;
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      {/* KPIs + window selector */}
      <div style={{ display: "flex", gap: 0, paddingLeft: 8, flexShrink: 0, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 18, flex: 1 }}>
          {[
            { label: "CURRENT", value: lastCorr !== null ? lastCorr.toFixed(3) : "—", pos: (lastCorr ?? 0) >= 0 },
            { label: "AVERAGE", value: avgCorr !== null ? avgCorr.toFixed(3) : "—", pos: (avgCorr ?? 0) >= 0 },
          ].map(({ label, value, pos }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontFamily: FONT_LABEL, fontSize: 8, letterSpacing: "0.1em", color: MC_COLORS.textLabel, textTransform: "uppercase" }}>{label}</span>
              <span style={{ fontFamily: FONT_NUM, fontSize: 12, color: pos ? MC_COLORS.white : MC_COLORS.gold, fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              style={{
                background: window_ === w ? "rgba(255,255,255,0.05)" : "transparent",
                border: `1px solid ${window_ === w ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 4,
                padding: "2px 7px",
                color: window_ === w ? MC_COLORS.white : MC_COLORS.textMuted,
                fontFamily: FONT_NUM,
                fontSize: 9,
                cursor: "pointer",
              }}
            >
              {w}M
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {corrData.length < 3 ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textLabel, fontSize: 10, fontFamily: FONT_LABEL }}>
            INSUFFICIENT DATA FOR {window_}M WINDOW
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={corrData} margin={{ top: 4, right: 8, bottom: 10, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={MC_COLORS.axis.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(0, 7)}
                tick={{ fontSize: 10, fill: MC_COLORS.axis.tick, fontFamily: FONT_NUM }}
                tickLine={false}
                axisLine={{ stroke: MC_COLORS.axis.line }}
                minTickGap={40}
              />
              <YAxis
                domain={[-1, 1]}
                tick={{ fontSize: 10, fill: MC_COLORS.axis.tick, fontFamily: FONT_NUM }}
                tickLine={false}
                axisLine={{ stroke: MC_COLORS.axis.line }}
                tickFormatter={(v: number) => v.toFixed(1)}
                width={36}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const v = Number(payload[0]?.value ?? 0);
                  return (
                    <div style={{ background: "#12131a", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, padding: "7px 10px", fontSize: 10, fontFamily: FONT_LABEL }}>
                      <div style={{ color: MC_COLORS.textMuted, marginBottom: 3 }}>{String(label).slice(0, 10)}</div>
                      <div style={{ color: corrColor(v), fontWeight: 600 }}>ρ = {v.toFixed(3)}</div>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke={MC_COLORS.axis.zero} strokeWidth={1} />
              <ReferenceLine y={0.5} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" strokeWidth={1} />
              <ReferenceLine y={-0.5} stroke={MC_COLORS.goldMuted} strokeDasharray="3 3" strokeWidth={1} />
              <Line type="monotone" dataKey="correlation" stroke={MC_COLORS.whiteDim} strokeWidth={1.6} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ paddingLeft: 8, flexShrink: 0, fontFamily: FONT_LABEL, fontSize: 8, color: MC_COLORS.textLabel, letterSpacing: "0.07em" }}>
        ROLLING CORRELATION vs S&P 500 · GOLD = NEGATIVE (DIVERSIFICATION)
      </div>
    </div>
  );
}
