"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  series: AnalyticsSeriesPoint[];
  benchmarkSeries?: AnalyticsSeriesPoint[];
  showBenchmark?: boolean;
  progress: number;
};

export function EquityCurveModel({ series, benchmarkSeries = [], showBenchmark = false, progress }: Props) {
  const visible = useMemo(() => {
    const n = Math.max(2, Math.ceil(series.length * progress));
    return series.slice(0, n);
  }, [series, progress]);

  const bmMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of benchmarkSeries) map.set(p.date, p.value);
    return map;
  }, [benchmarkSeries]);

  const chartData = useMemo(() => visible.map((p) => ({
    date: p.date,
    portfolio: p.value,
    benchmark: showBenchmark ? (bmMap.get(p.date) ?? null) : undefined,
  })), [visible, bmMap, showBenchmark]);

  if (!series.length) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textMuted, fontSize: 11, fontFamily: FONT_LABEL }}>
        DATA UNAVAILABLE
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 10, left: 4 }}>
        <defs>
          <linearGradient id="ms-eq-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={MC_COLORS.equity.fill0} />
            <stop offset="100%" stopColor={MC_COLORS.equity.fill1} />
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
          tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
          width={54}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div style={{ background: "#12131a", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, padding: "7px 10px", fontSize: 10, fontFamily: FONT_LABEL }}>
                <div style={{ color: MC_COLORS.textMuted, marginBottom: 3 }}>{String(label).slice(0, 10)}</div>
                {payload.map((entry) => (
                  <div key={String(entry.name)} style={{ color: entry.name === "portfolio" ? MC_COLORS.white : MC_COLORS.whiteDim, fontWeight: 600 }}>
                    {Number(entry.value) >= 0 ? "+" : ""}{Number(entry.value).toFixed(2)}%
                  </div>
                ))}
              </div>
            );
          }}
        />
        <ReferenceLine y={0} stroke={MC_COLORS.axis.zero} strokeWidth={1} />
        <Area
          type="monotone"
          dataKey="portfolio"
          stroke={MC_COLORS.equity.line}
          strokeWidth={1.6}
          fill="url(#ms-eq-fill)"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        {showBenchmark && benchmarkSeries.length > 0 && (
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke={MC_COLORS.gray}
            strokeWidth={1}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
