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
import { buildDistribution } from "@/lib/modeling/transforms";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  returns: number[];
  progress: number;
};

/** Header-right stats — pass as topRight to StableModelCard. */
export function ReturnDistStats({ returns, progress }: Props) {
  const visible = useMemo(() => {
    const n = Math.max(5, Math.ceil(returns.length * progress));
    return returns.slice(0, n).map((r) => r * 100);
  }, [returns, progress]);
  const { stats } = useMemo(() => buildDistribution(visible, 28), [visible]);
  if (!stats.n) return null;
  const items = [
    { k: "μ", v: `${stats.mean >= 0 ? "+" : ""}${stats.mean.toFixed(1)}%`, pos: stats.mean >= 0 },
    { k: "σ", v: `${stats.std.toFixed(1)}%`, pos: true },
    { k: "sk", v: stats.skew.toFixed(2), pos: stats.skew >= 0 },
    { k: "n", v: String(stats.n), pos: true },
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

export function ReturnDistributionModel({ returns, progress }: Props) {
  const visibleReturns = useMemo(() => {
    const n = Math.max(5, Math.ceil(returns.length * progress));
    return returns.slice(0, n);
  }, [returns, progress]);

  const { bins, stats } = useMemo(
    () => buildDistribution(visibleReturns.map((r) => r * 100), 28),
    [visibleReturns],
  );

  if (!returns.length) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textMuted, fontSize: 11, fontFamily: FONT_LABEL }}>
        DATA UNAVAILABLE
      </div>
    );
  }

  const maxFreq = Math.max(...bins.map((b) => b.freq), 0.001);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={bins} margin={{ top: 4, right: 8, bottom: 10, left: 4 }} barCategoryGap={1}>
        <XAxis
          dataKey="midpoint"
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          tick={{ fontSize: 9, fill: MC_COLORS.axis.tick, fontFamily: FONT_NUM }}
          tickLine={false}
          axisLine={{ stroke: MC_COLORS.axis.line }}
          minTickGap={24}
        />
        <YAxis hide domain={[0, maxFreq * 1.15]} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const bin = payload[0]?.payload as { midpoint: number; count: number; freq: number };
            return (
              <div style={{ background: "#12131a", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, padding: "7px 10px", fontSize: 10, fontFamily: FONT_LABEL }}>
                <div style={{ color: MC_COLORS.textMuted, marginBottom: 2 }}>{bin.midpoint.toFixed(2)}%</div>
                <div style={{ color: MC_COLORS.white }}>{bin.count} returns ({(bin.freq * 100).toFixed(1)}%)</div>
              </div>
            );
          }}
        />
        <ReferenceLine x={stats.mean} stroke={MC_COLORS.goldDim} strokeDasharray="4 3" strokeWidth={1.2} />
        <ReferenceLine x={stats.var95} stroke={MC_COLORS.goldMuted} strokeDasharray="2 4" strokeWidth={1} />
        <Bar dataKey="freq" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {bins.map((entry, i) => {
            const isNeg = entry.midpoint < 0;
            const intensity = entry.freq / maxFreq;
            return (
              <Cell
                key={i}
                fill={isNeg
                  ? `rgba(201,168,76,${0.3 + intensity * 0.55})`
                  : `rgba(215,215,215,${0.28 + intensity * 0.54})`
                }
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
