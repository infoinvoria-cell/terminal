"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonteCarloResult } from "@/lib/modeling/types";
import { computeMCOutcomes } from "@/lib/modeling/monte-carlo";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  result: MonteCarloResult | null;
  progress?: number;  // 0..1, default 1; syncs with playback clock
};

// Build a partial MC result using path values at the visible horizon index.
// This keeps MC Outcome synchronized with MC Paths during playback.
function sliceResultToProgress(result: MonteCarloResult, progress: number): MonteCarloResult {
  const horizon = result.params.horizon;
  const visibleT = Math.max(1, Math.ceil(horizon * progress));
  if (visibleT >= horizon) return result;
  const paths = result.paths.map((p) => p.slice(0, visibleT + 1));
  return {
    ...result,
    paths,
    actualPath: result.actualPath.slice(0, visibleT + 1),
    params: { ...result.params, horizon: visibleT },
  };
}

// Exported so ModelingStudio can pass it into ModelBox topRight
export function MCOutcomeStats({ result }: { result: MonteCarloResult | null }) {
  const outcomes = useMemo(() => (result ? computeMCOutcomes(result) : null), [result]);
  if (!outcomes) return null;
  const { p10Final, p50Final, p90Final, probPositive, probDrawdown20 } = outcomes;

  return (
    <>
      {[
        { label: "P10", value: `${p10Final.toFixed(0)}` },
        { label: "MED", value: `${p50Final.toFixed(0)}` },
        { label: "P90", value: `${p90Final.toFixed(0)}` },
        { label: "P+", value: `${probPositive.toFixed(0)}%` },
        { label: "DD20", value: `${probDrawdown20.toFixed(0)}%` },
      ].map(({ label, value }) => (
        <span key={label} style={{
          fontFamily: FONT_LABEL, fontSize: 8, letterSpacing: "0.06em",
          color: MC_COLORS.textLabel, whiteSpace: "nowrap",
        }}>
          {label} <span style={{ color: "rgba(212,212,212,0.75)", fontFamily: FONT_NUM }}>{value}</span>
        </span>
      ))}
    </>
  );
}

export function MCOutcomeDistribution({ result, progress = 1 }: Props) {
  const outcomes = useMemo(() => {
    if (!result) return null;
    const effective = progress < 0.999 ? sliceResultToProgress(result, progress) : result;
    return computeMCOutcomes(effective);
  }, [result, progress]);

  if (!outcomes) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textMuted, fontSize: 11, fontFamily: FONT_LABEL }}>
        RUN MONTE CARLO FIRST
      </div>
    );
  }

  const { finalEquity, p50Final: _p50 } = outcomes;
  const { bins, stats } = finalEquity;
  const maxFreq = Math.max(...bins.map((b) => b.freq), 0.001);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bins} margin={{ top: 6, right: 6, bottom: 16, left: 2 }} barCategoryGap={1}>
            <XAxis
              dataKey="midpoint"
              tickFormatter={(v: number) => `${v.toFixed(0)}`}
              tick={{ fontSize: 8, fill: MC_COLORS.axis.tick, fontFamily: FONT_NUM }}
              tickLine={false}
              axisLine={{ stroke: MC_COLORS.axis.line }}
              minTickGap={30}
            />
            <YAxis hide domain={[0, maxFreq * 1.15]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const bin = payload[0]?.payload as { midpoint: number; count: number; freq: number };
                return (
                  <div style={{ background: "#12131a", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, padding: "6px 10px", fontSize: 10, fontFamily: FONT_LABEL }}>
                    <div style={{ color: MC_COLORS.textMuted, marginBottom: 2 }}>{bin.midpoint.toFixed(0)}</div>
                    <div style={{ color: MC_COLORS.white }}>{bin.count} · {(bin.freq * 100).toFixed(1)}%</div>
                  </div>
                );
              }}
            />
            <ReferenceLine x={stats.median} stroke={MC_COLORS.whiteDim} strokeDasharray="4 3" strokeWidth={1.2} />
            <ReferenceLine x={100} stroke={MC_COLORS.goldDim} strokeDasharray="2 4" strokeWidth={1} />
            <Bar dataKey="freq" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {bins.map((entry, i) => {
                const isBelow = entry.midpoint < 100;
                const intensity = entry.freq / maxFreq;
                return (
                  <Cell
                    key={i}
                    fill={isBelow
                      ? `rgba(201,168,76,${0.28 + intensity * 0.57})`
                      : `rgba(215,215,215,${0.26 + intensity * 0.56})`}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
