"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import { computeRegression } from "@/lib/modeling/transforms";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  series: AnalyticsSeriesPoint[];
  benchmarkSeries: AnalyticsSeriesPoint[];
  progress: number;
};

export function RegressionModel({ series, benchmarkSeries, progress }: Props) {
  const reg = useMemo(() => {
    if (!series.length || !benchmarkSeries.length) return null;
    const n = Math.max(5, Math.ceil(series.length * progress));
    return computeRegression(series.slice(0, n), benchmarkSeries.slice(0, n));
  }, [series, benchmarkSeries, progress]);

  if (!reg) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textMuted, fontSize: 11, fontFamily: FONT_LABEL }}>
        {!benchmarkSeries.length ? "NO BENCHMARK DATA" : "INSUFFICIENT DATA"}
      </div>
    );
  }

  const { alpha, beta, r2, points, fittedLine } = reg;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 8, bottom: 10, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={MC_COLORS.axis.grid} />
        <XAxis
          dataKey="x"
          name="Benchmark"
          type="number"
          tick={{ fontSize: 9, fill: MC_COLORS.axis.tick, fontFamily: FONT_NUM }}
          tickLine={false}
          axisLine={{ stroke: MC_COLORS.axis.line }}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          label={{ value: "Benchmark return %", position: "insideBottom", offset: -6, fontSize: 9, fill: MC_COLORS.textLabel, fontFamily: FONT_LABEL }}
        />
        <YAxis
          dataKey="y"
          name="Strategy"
          type="number"
          tick={{ fontSize: 9, fill: MC_COLORS.axis.tick, fontFamily: FONT_NUM }}
          tickLine={false}
          axisLine={{ stroke: MC_COLORS.axis.line }}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          width={46}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload as { x: number; y: number; date?: string };
            return (
              <div style={{ background: "#12131a", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, padding: "7px 10px", fontSize: 10, fontFamily: FONT_LABEL }}>
                {d.date && <div style={{ color: MC_COLORS.textMuted, marginBottom: 2 }}>{d.date.slice(0, 7)}</div>}
                <div style={{ color: MC_COLORS.whiteDim }}>BM: {d.x.toFixed(2)}%</div>
                <div style={{ color: MC_COLORS.white, fontWeight: 600 }}>Strat: {d.y.toFixed(2)}%</div>
              </div>
            );
          }}
        />
        <Scatter data={points} fill={MC_COLORS.whiteMuted} opacity={0.7} />
        <Line
          data={fittedLine}
          dataKey="y"
          stroke={MC_COLORS.gold}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          type="linear"
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Header-right stats — pass as topRight to StableModelCard. */
export function RegressionStats({ series, benchmarkSeries, progress }: Props) {
  const reg = useMemo(() => {
    if (!series.length || !benchmarkSeries.length) return null;
    const n = Math.max(5, Math.ceil(series.length * progress));
    return computeRegression(series.slice(0, n), benchmarkSeries.slice(0, n));
  }, [series, benchmarkSeries, progress]);
  if (!reg) return null;
  const { alpha, beta, r2, points } = reg;
  const items = [
    { k: "α", v: `${alpha >= 0 ? "+" : ""}${alpha.toFixed(2)}%`, pos: alpha >= 0 },
    { k: "β", v: beta.toFixed(2), pos: true },
    { k: "R²", v: r2.toFixed(2), pos: true },
    { k: "n", v: String(points.length), pos: true },
  ];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {items.map(({ k, v, pos }) => (
        <span key={k} style={{ fontFamily: FONT_NUM, fontSize: 9, color: pos ? "rgba(210,210,210,0.80)" : MC_COLORS.gold, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
          <span style={{ color: MC_COLORS.textLabel, fontSize: 7.5, marginRight: 2 }}>{k}</span>{v}
        </span>
      ))}
    </div>
  );
}
