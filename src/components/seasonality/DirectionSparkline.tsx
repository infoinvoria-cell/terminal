"use client";

import { memo, useId, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { PatternCandidate } from "@/lib/seasonality/patternSelection";

const C_LONG = "#F2F4F7";
const C_SHORT = "#D8B85E";

export const DirectionSparkline = memo(function DirectionSparkline({
  returns,
  direction,
  size = 62,
  width,
  height,
  invertForShort = false,
}: {
  returns: number[];
  direction: PatternCandidate["direction"] | null | undefined;
  size?: number;
  width?: number;
  height?: number;
  /** Keep legacy visual (flip sign) in some places */
  invertForShort?: boolean;
}) {
  const w = width ?? size;
  const h = height ?? size;
  const gradId = useId().replace(/:/g, "");
  const isShort = direction === "SHORT";
  const stroke = isShort ? C_SHORT : C_LONG;

  const data = useMemo(() => {
    if (returns.length < 2) return [];
    let eq = 1;
    return returns.map((rawR) => {
      const r = invertForShort && isShort ? -rawR : rawR;
      eq *= 1 + r;
      return { v: Number(((eq - 1) * 100).toFixed(1)) };
    });
  }, [returns, invertForShort, isShort]);

  if (data.length < 2) return <div style={{ width: w, height: h }} />;

  const fillStops = isShort
    ? [
        { o: "0%", a: 0.38 },
        { o: "55%", a: 0.16 },
      ]
    : [
        { o: "0%", a: 0.34 },
        { o: "55%", a: 0.14 },
      ];

  return (
    <div style={{ width: w, height: h }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <defs>
            <linearGradient id={`${gradId}-fade`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={fillStops[0].o} stopColor={stroke} stopOpacity={fillStops[0].a} />
              <stop offset={fillStops[1].o} stopColor={stroke} stopOpacity={fillStops[1].a} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gradId}-fade)`}
            fillOpacity={1}
            baseValue="dataMin"
            isAnimationActive={false}
            dot={false}
            activeDot={false}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

