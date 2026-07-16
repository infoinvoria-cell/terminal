"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartYearBands } from "@/components/dashboard/chart-year-bands";
import type { ChartPoint } from "@/lib/trades-analytics";
import { yAxisDomain } from "@/lib/trades-analytics";

type PerformanceChartProps = {
  data: ChartPoint[];
  showYearBands?: boolean;
};

export function PerformanceChart({
  data,
  showYearBands = true,
}: PerformanceChartProps) {
  const [yMin, yMax] = yAxisDomain(data);
  const tickInterval =
    data.length > 16 ? Math.max(0, Math.floor(data.length / 10) - 1) : 0;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="h-full min-h-0 w-full min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barCategoryGap="38%"
            margin={{ top: 4, right: 4, left: -12, bottom: -2 }}
          >
          <defs>
            <linearGradient
              id="perfBarTonalSplit"
              x1="0"
              y1="1"
              x2="0"
              y2="0"
              gradientUnits="objectBoundingBox"
            >
              <stop offset="0%" stopColor="#3f3f46" />
              <stop offset="58%" stopColor="#6f6d65" />
              <stop offset="100%" stopColor="#e2ca7a" />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="rgba(42,43,48,0.22)"
            strokeDasharray="0"
            vertical={false}
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
            ticks={buildTicks(yMin, yMax)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#6b6b6b", fontSize: 11 }}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.02)" }}
            content={({ active, label, payload }) => {
              if (!active || !payload?.length) return null;
              const total = (payload[0]?.payload as ChartPoint)?.total;
              return (
                <div className="rounded-xl border border-[#2a2b30] bg-[#1c1d20] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
                  <p className="text-[11px] font-medium text-[#8a8a8a] [font-family:var(--font-montserrat),sans-serif]">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                    {typeof total === "number"
                      ? `${total > 0 ? "+" : ""}${total.toFixed(2)}%`
                      : "—"}
                  </p>
                </div>
              );
            }}
          />
          <Bar
            dataKey="total"
            fill="url(#perfBarTonalSplit)"
            radius={[2, 2, 2, 2]}
            maxBarSize={10}
            name="Total %"
          />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartYearBands data={data} enabled={showYearBands} />
    </div>
  );
}

function buildTicks(min: number, max: number): number[] {
  const step = 5;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-6; v += step) out.push(v);
  return out.length ? out : [min, 0, max];
}
