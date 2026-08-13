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
export function TailRiskStats({ returns, progress }: Props) {
  const visible = useMemo(() => {
    const n = Math.max(5, Math.ceil(returns.length * progress));
    return returns.slice(0, n).map((r) => r * 100);
  }, [returns, progress]);
  const { bins, stats } = useMemo(() => buildDistribution(visible, 24), [visible]);
  const tailBins = bins.filter((b) => b.midpoint <= stats.var95);
  const tailCount = tailBins.reduce((s, b) => s + b.count, 0);
  const tailPct = visible.length > 0 ? (tailCount / visible.length) * 100 : 0;
  if (!stats.n) return null;
  const items = [
    { k: "VaR", v: `${stats.var95.toFixed(1)}%`, pos: false },
    { k: "CVaR", v: `${stats.cvar95.toFixed(1)}%`, pos: false },
    { k: "sk", v: stats.skew.toFixed(2), pos: stats.skew >= 0 },
    { k: "tail", v: `${tailPct.toFixed(0)}%`, pos: false },
  ];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {items.map(({ k, v, pos }) => (
        <span key={k} style={{ fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)", fontSize: 9, color: pos ? "rgba(210,210,210,0.80)" : MC_COLORS.gold, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
          <span style={{ color: MC_COLORS.textLabel, fontSize: 7.5, marginRight: 2 }}>{k}</span>{v}
        </span>
      ))}
    </div>
  );
}

export function TailRiskModel({ returns, progress }: Props) {
  const visible = useMemo(() => {
    const n = Math.max(5, Math.ceil(returns.length * progress));
    return returns.slice(0, n).map((r) => r * 100);
  }, [returns, progress]);

  const { bins, stats } = useMemo(() => buildDistribution(visible, 24), [visible]);

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
            const b = payload[0]?.payload as { midpoint: number; count: number; freq: number };
            const isTail = b.midpoint <= stats.var95;
            return (
              <div style={{ background: "#12131a", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, padding: "7px 10px", fontSize: 10, fontFamily: FONT_LABEL }}>
                <div style={{ color: MC_COLORS.textMuted, marginBottom: 2 }}>{b.midpoint.toFixed(2)}%{isTail ? " · TAIL" : ""}</div>
                <div style={{ color: MC_COLORS.white }}>{b.count} ({(b.freq * 100).toFixed(1)}%)</div>
              </div>
            );
          }}
        />
        <ReferenceLine x={stats.var95} stroke={MC_COLORS.gold} strokeDasharray="4 3" strokeWidth={1.5} />
        <ReferenceLine x={stats.cvar95} stroke={MC_COLORS.goldDim} strokeDasharray="2 4" strokeWidth={1} />
        <Bar dataKey="freq" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {bins.map((entry, i) => {
            const isTail = entry.midpoint <= stats.var95;
            const intensity = entry.freq / maxFreq;
            return (
              <Cell
                key={i}
                fill={isTail
                  ? `rgba(201,168,76,${0.45 + intensity * 0.45})`
                  : `rgba(215,215,215,${0.2 + intensity * 0.45})`
                }
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
