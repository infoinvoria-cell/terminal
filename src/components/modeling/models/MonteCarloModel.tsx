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
import type { MonteCarloResult } from "@/lib/modeling/types";

type Props = {
  result: MonteCarloResult | null;
  progress: number;
};

const SAMPLE_PATH_COUNT = 40;

export function MonteCarloModel({ result, progress }: Props) {
  if (!result || !result.params.returns.length) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: "rgba(175,175,175,0.5)", fontSize: 11 }}>
        MODEL DATA UNAVAILABLE · requires return series
      </div>
    );
  }

  const { percentiles, paths, actualPath } = result;
  const horizon = result.params.horizon;

  const visibleSteps = Math.max(2, Math.ceil((horizon + 1) * progress));

  const chartData = useMemo(() => {
    return Array.from({ length: visibleSteps }, (_, t) => ({
      t,
      p10: percentiles.p10[t] ?? 100,
      p25: percentiles.p25[t] ?? 100,
      p50: percentiles.p50[t] ?? 100,
      p75: percentiles.p75[t] ?? 100,
      p90: percentiles.p90[t] ?? 100,
      actual: actualPath[t] ?? null,
    }));
  }, [visibleSteps, percentiles, actualPath]);

  const visiblePaths = useMemo(() => {
    const step = Math.max(1, Math.floor(paths.length / SAMPLE_PATH_COUNT));
    return paths.filter((_, i) => i % step === 0).slice(0, SAMPLE_PATH_COUNT);
  }, [paths]);

  const sampleData = useMemo(() => {
    return Array.from({ length: visibleSteps }, (_, t) => {
      const row: Record<string, number | null> = { t };
      for (let i = 0; i < visiblePaths.length; i++) {
        row[`path${i}`] = visiblePaths[i]?.[t] ?? null;
      }
      return row;
    });
  }, [visibleSteps, visiblePaths]);

  const domainMax = Math.ceil((percentiles.p90[horizon] ?? 200) * 1.05);
  const domainMin = Math.floor((percentiles.p10[horizon] ?? 50) * 0.95);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Legend */}
      <div style={{ display: "flex", gap: 12, paddingLeft: 8, alignItems: "center", flexShrink: 0 }}>
        {[
          { color: "rgba(201,168,76,0.18)", label: "P10–P90" },
          { color: "rgba(201,168,76,0.30)", label: "P25–P75" },
          { color: "#C9A84C", label: "Median" },
          { color: "rgba(215,215,215,0.5)", label: "Actual" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 14, height: 2, background: color, borderRadius: 1 }} />
            <span style={{ fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)", fontSize: 8.5, color: "rgba(175,175,175,0.5)", letterSpacing: "0.06em" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Sample paths (faint) + Confidence bands */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {/* Sample paths layer */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sampleData} margin={{ top: 4, right: 8, bottom: 10, left: 4 }}>
              <XAxis dataKey="t" hide />
              <YAxis hide domain={[domainMin, domainMax]} />
              {visiblePaths.map((_, i) => (
                <Line
                  key={`path${i}`}
                  type="monotone"
                  dataKey={`path${i}`}
                  stroke="rgba(175,175,175,0.07)"
                  strokeWidth={0.6}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Percentile bands layer */}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 10, left: 4 }}>
            <defs>
              <linearGradient id="ms-mc-90" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(201,168,76,0.06)" />
                <stop offset="100%" stopColor="rgba(201,168,76,0.02)" />
              </linearGradient>
              <linearGradient id="ms-mc-75" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(201,168,76,0.14)" />
                <stop offset="100%" stopColor="rgba(201,168,76,0.06)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="t"
              tick={{ fontSize: 10, fill: "#6a7280", fontFamily: "var(--font-numbers,'Nunito',sans-serif)" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickFormatter={(v: number) => `M${v}`}
              minTickGap={30}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#6a7280", fontFamily: "var(--font-numbers,'Nunito',sans-serif)" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickFormatter={(v: number) => `${v.toFixed(0)}`}
              domain={[domainMin, domainMax]}
              width={50}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as { t: number; p10: number; p25: number; p50: number; p75: number; p90: number; actual: number | null };
                return (
                  <div style={{ background: "#17171b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "7px 10px", fontSize: 10, fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)" }}>
                    <div style={{ color: "rgba(194,194,194,0.6)", marginBottom: 4 }}>Month {label}</div>
                    {[
                      { k: "p90", label: "P90", c: "rgba(201,168,76,0.5)" },
                      { k: "p75", label: "P75", c: "rgba(201,168,76,0.65)" },
                      { k: "p50", label: "Median", c: "#C9A84C" },
                      { k: "p25", label: "P25", c: "rgba(201,168,76,0.65)" },
                      { k: "p10", label: "P10", c: "rgba(201,168,76,0.5)" },
                    ].map(({ k, label: l, c }) => (
                      <div key={k} style={{ color: c, display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span>{l}</span>
                        <span style={{ fontWeight: 600 }}>{Number(row[k as keyof typeof row] ?? 100).toFixed(1)}</span>
                      </div>
                    ))}
                    {row.actual !== null && (
                      <div style={{ color: "rgba(215,215,215,0.6)", marginTop: 4, display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span>Actual</span>
                        <span style={{ fontWeight: 600 }}>{row.actual.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            {/* P10-P90 outer band */}
            <Area type="monotone" dataKey="p90" stroke="none" fill="url(#ms-mc-90)" dot={false} connectNulls isAnimationActive={false} />
            <Area type="monotone" dataKey="p10" stroke="none" fill="#0b0b0e" dot={false} connectNulls isAnimationActive={false} />
            {/* P25-P75 inner band */}
            <Area type="monotone" dataKey="p75" stroke="none" fill="url(#ms-mc-75)" dot={false} connectNulls isAnimationActive={false} />
            <Area type="monotone" dataKey="p25" stroke="none" fill="#0b0b0e" dot={false} connectNulls isAnimationActive={false} />
            {/* Median */}
            <Line type="monotone" dataKey="p50" stroke="#C9A84C" strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />
            {/* Actual path */}
            <Line type="monotone" dataKey="actual" stroke="rgba(215,215,215,0.55)" strokeWidth={1.4} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
