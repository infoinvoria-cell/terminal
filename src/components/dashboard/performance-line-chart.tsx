"use client";

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
import { ChartYearBands } from "@/components/dashboard/chart-year-bands";
import type { LinePoint } from "@/lib/trades-analytics";
import { yAxisDomainLine } from "@/lib/trades-analytics";

type PerformanceLineChartProps = {
  data: LinePoint[];
  showYearBands?: boolean;
};

export function PerformanceLineChart({
  data,
  showYearBands = true,
}: PerformanceLineChartProps) {
  const [yMin, yMax] = yAxisDomainLine(data);
  const tickInterval =
    data.length > 16 ? Math.max(0, Math.floor(data.length / 10) - 1) : 0;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="h-full min-h-0 w-full min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 4, left: -12, bottom: -2 }}
          >
          <CartesianGrid
            stroke="rgba(42,43,48,0.22)"
            vertical={false}
            strokeDasharray="0"
          />
          <ReferenceLine
            y={0}
            stroke="rgba(161,161,170,0.35)"
            strokeWidth={1}
          />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#6b6b6b", fontSize: 11 }}
            interval={tickInterval}
            height={30}
            angle={data.length > 14 ? -32 : data.length > 8 ? -22 : 0}
            textAnchor={data.length > 8 ? "end" : "middle"}
          />
          <YAxis
            domain={[yMin, yMax]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#6b6b6b", fontSize: 11 }}
            width={42}
          />
          <Tooltip
            content={({ active, label, payload }) => {
              if (!active || !payload?.length) return null;
              const v = (payload[0]?.payload as LinePoint)?.cumulativePct;
              return (
                <div className="rounded-xl border border-[#2a2b30] bg-[#1c1d20] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
                  <p className="text-[11px] font-medium text-[#8a8a8a] [font-family:var(--font-montserrat),sans-serif]">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                    {typeof v === "number"
                      ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%`
                      : "—"}
                  </p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="cumulativePct"
            stroke="#a1a1aa"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#e2ca7a", stroke: "#1c1d20", strokeWidth: 1 }}
          />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartYearBands data={data} enabled={showYearBands} />
    </div>
  );
}
