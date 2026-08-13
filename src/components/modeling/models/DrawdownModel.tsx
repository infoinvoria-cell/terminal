"use client";

import { useMemo } from "react";
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
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import { extractDrawdownEvents } from "@/lib/modeling/transforms";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  drawdownSeries: AnalyticsSeriesPoint[];
  performanceSeries: AnalyticsSeriesPoint[];
  progress: number;
};

export function DrawdownModel({ drawdownSeries, performanceSeries, progress }: Props) {
  const visible = useMemo(() => {
    const n = Math.max(2, Math.ceil(drawdownSeries.length * progress));
    return drawdownSeries.slice(0, n);
  }, [drawdownSeries, progress]);

  const events = useMemo(() => extractDrawdownEvents(performanceSeries), [performanceSeries]);
  const worstThree = events.slice(0, 3);

  if (!drawdownSeries.length) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textMuted, fontSize: 11, fontFamily: FONT_LABEL }}>
        DATA UNAVAILABLE
      </div>
    );
  }

  const minVal = Math.min(...visible.map((p) => p.value), 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={visible} margin={{ top: 8, right: 8, bottom: 10, left: 4 }}>
        <defs>
          <linearGradient id="ms-dd-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={MC_COLORS.drawdown.fill0} />
            <stop offset="100%" stopColor={MC_COLORS.drawdown.fill1} />
          </linearGradient>
        </defs>
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
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          domain={[Math.floor(minVal * 1.1), 0]}
          width={50}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const val = Number(payload[0]?.value ?? 0);
            return (
              <div style={{ background: "#12131a", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, padding: "7px 10px", fontSize: 10, fontFamily: FONT_LABEL }}>
                <div style={{ color: MC_COLORS.textMuted, marginBottom: 3 }}>{String(label).slice(0, 10)}</div>
                <div style={{ color: MC_COLORS.gold, fontWeight: 600 }}>{val.toFixed(2)}%</div>
              </div>
            );
          }}
        />
        <ReferenceLine y={0} stroke={MC_COLORS.axis.zero} strokeWidth={1} />
        {worstThree.map((ev, i) => (
          <ReferenceLine
            key={ev.troughDate}
            x={ev.troughDate}
            stroke={`rgba(201,168,76,${0.5 - i * 0.12})`}
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        ))}
        <Area
          type="monotone"
          dataKey="value"
          stroke={MC_COLORS.drawdown.line}
          strokeWidth={1.5}
          fill="url(#ms-dd-fill)"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
