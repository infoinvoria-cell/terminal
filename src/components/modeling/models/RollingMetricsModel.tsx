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
import { computeRolling } from "@/lib/modeling/transforms";
import type { RollingMetric } from "@/lib/modeling/types";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  series: AnalyticsSeriesPoint[];
  progress: number;
};

const METRICS: Array<{ id: RollingMetric; label: string }> = [
  { id: "sharpe", label: "SHARPE" },
  { id: "volatility", label: "VOL" },
  { id: "return", label: "RETURN" },
];
const WINDOWS = [12, 24, 36, 60];

export function RollingMetricsModel({ series, progress }: Props) {
  const [metric, setMetric] = useState<RollingMetric>("sharpe");
  const [window_, setWindow] = useState(24);

  const rollingData = useMemo(() => computeRolling(series, metric, window_), [series, metric, window_]);

  const visible = useMemo(() => {
    const n = Math.max(2, Math.ceil(rollingData.length * progress));
    return rollingData.slice(0, n);
  }, [rollingData, progress]);

  if (!series.length) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textMuted, fontSize: 11, fontFamily: FONT_LABEL }}>
        DATA UNAVAILABLE
      </div>
    );
  }

  const lineColor = metric === "sharpe" ? MC_COLORS.gold : MC_COLORS.whiteDim;
  const refVal = metric === "sharpe" ? 1 : 0;
  const formatY = (v: number) => (metric === "sharpe" ? v.toFixed(2) : `${v.toFixed(1)}%`);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, paddingLeft: 8, alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 2 }}>
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetric(m.id)}
              style={{
                background: metric === m.id ? MC_COLORS.goldMuted : "transparent",
                border: `1px solid ${metric === m.id ? MC_COLORS.goldDim : "rgba(255,255,255,0.07)"}`,
                borderRadius: 4,
                padding: "2px 9px",
                color: metric === m.id ? MC_COLORS.gold : MC_COLORS.textMuted,
                fontFamily: FONT_LABEL,
                fontSize: 9,
                cursor: "pointer",
                letterSpacing: "0.07em",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.09)" }} />
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
        {visible.length < 3 ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textLabel, fontSize: 10, fontFamily: FONT_LABEL }}>
            INSUFFICIENT DATA FOR {window_}M WINDOW
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={visible} margin={{ top: 4, right: 8, bottom: 10, left: 4 }}>
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
                tick={{ fontSize: 10, fill: MC_COLORS.axis.tick, fontFamily: FONT_NUM }}
                tickLine={false}
                axisLine={{ stroke: MC_COLORS.axis.line }}
                tickFormatter={formatY}
                width={52}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={{ background: "#12131a", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, padding: "7px 10px", fontSize: 10, fontFamily: FONT_LABEL }}>
                      <div style={{ color: MC_COLORS.textMuted, marginBottom: 3 }}>{String(label).slice(0, 10)}</div>
                      <div style={{ color: lineColor, fontWeight: 600 }}>{formatY(Number(payload[0]?.value ?? 0))}</div>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={refVal} stroke="rgba(255,255,255,0.09)" strokeDasharray="4 3" strokeWidth={1} />
              <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={1.6} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
