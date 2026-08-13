"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import { extractDrawdownEvents } from "@/lib/modeling/transforms";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  performanceSeries: AnalyticsSeriesPoint[];
  progress: number;
};

/** Header-right stats — pass as topRight to StableModelCard. */
export function DrawdownRecoveryStats({ performanceSeries, progress }: Props) {
  const events = useMemo(() => {
    const n = Math.max(2, Math.ceil(performanceSeries.length * progress));
    return extractDrawdownEvents(performanceSeries.slice(0, n));
  }, [performanceSeries, progress]);
  const recovered = events.filter((e) => e.recoveryDays !== null).length;
  const open = events.filter((e) => e.recoveryDays === null).length;
  const maxDD = events[0]?.depth;
  if (!events.length) return null;
  const items = [
    { k: "ev", v: String(events.length), pos: true },
    { k: "rec", v: String(recovered), pos: recovered === events.length },
    { k: "open", v: String(open), pos: open === 0 },
    { k: "max", v: maxDD ? `${maxDD.toFixed(1)}%` : "—", pos: false },
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

export function DrawdownRecoveryModel({ performanceSeries, progress }: Props) {
  const events = useMemo(() => {
    const n = Math.max(2, Math.ceil(performanceSeries.length * progress));
    return extractDrawdownEvents(performanceSeries.slice(0, n));
  }, [performanceSeries, progress]);

  const scatterData = useMemo(() =>
    events
      .filter((e) => e.recoveryDays !== null)
      .map((e) => ({
        depth: Math.abs(e.depth),
        recovery: e.recoveryDays!,
        label: e.troughDate.slice(0, 7),
      })),
    [events],
  );

  if (!performanceSeries.length) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textMuted, fontSize: 11, fontFamily: FONT_LABEL }}>
        DATA UNAVAILABLE
      </div>
    );
  }

  return (
    <div style={{ height: "100%", minHeight: 0 }}>
        {scatterData.length < 2 ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textLabel, fontSize: 10, fontFamily: FONT_LABEL }}>
            INSUFFICIENT COMPLETED DRAWDOWN EVENTS
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 8, bottom: 20, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={MC_COLORS.axis.grid} />
              <XAxis
                dataKey="depth"
                name="Depth %"
                type="number"
                tick={{ fontSize: 9, fill: MC_COLORS.axis.tick, fontFamily: FONT_NUM }}
                tickLine={false}
                axisLine={{ stroke: MC_COLORS.axis.line }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                label={{ value: "Drawdown depth %", position: "insideBottom", offset: -8, fontSize: 9, fill: MC_COLORS.textLabel, fontFamily: FONT_LABEL }}
              />
              <YAxis
                dataKey="recovery"
                name="Recovery days"
                type="number"
                tick={{ fontSize: 9, fill: MC_COLORS.axis.tick, fontFamily: FONT_NUM }}
                tickLine={false}
                axisLine={{ stroke: MC_COLORS.axis.line }}
                width={40}
                label={{ value: "Days", angle: -90, position: "insideLeft", fontSize: 9, fill: MC_COLORS.textLabel, fontFamily: FONT_LABEL }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as { depth: number; recovery: number; label: string };
                  return (
                    <div style={{ background: "#12131a", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, padding: "7px 10px", fontSize: 10, fontFamily: FONT_LABEL }}>
                      <div style={{ color: MC_COLORS.textMuted, marginBottom: 2 }}>{d.label}</div>
                      <div style={{ color: MC_COLORS.gold }}>Depth: −{d.depth.toFixed(1)}%</div>
                      <div style={{ color: MC_COLORS.whiteDim }}>Recovery: {d.recovery} days</div>
                    </div>
                  );
                }}
              />
              <Scatter data={scatterData} fill={MC_COLORS.gold} opacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
  );
}
