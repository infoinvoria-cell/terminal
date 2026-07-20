"use client";

import { useMemo } from "react";
import { Area, ComposedChart, Line, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import type { DrawdownCurvePoint } from "@/lib/monitoring/types";
import useObservedElementSize from "@/components/monitoring/useObservedElementSize";
import { buildStrategyTesterPhaseMarkers, LIVE_START, WF_OOS_START } from "@/components/monitoring/strategyTesterPhaseMarkers";

type Props = {
  data: DrawdownCurvePoint[];
  maxDrawdownPercent?: number;
  avgDrawdownPercent?: number;
  top5DrawdownsPercent?: number[];
  timeRangeFrom?: string | null;
  fillContainer?: boolean;
};

function fmtPct(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(1)}%`;
}

function fmtDate(value: unknown): string {
  const s = String(value || "");
  return s.length >= 7 ? s.slice(0, 7) : s.slice(0, 10);
}

function fmtSignedPct(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.0%";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function MiniKpiCard({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div
      className="st-mini-kpi-card st-mini-kpi-card--drawdown"
      title={title ?? `${label} ${value}`}
      style={{
        display: "grid",
        justifyItems: "start",
        gap: 2,
        minWidth: 92,
        padding: "6px 9px",
        borderRadius: 10,
        border: "1px solid rgba(216, 91, 104, 0.34)",
        background: "rgba(24, 11, 14, 0.9)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        backdropFilter: "blur(8px)",
        textAlign: "left",
      }}
    >
      <span
        className="st-mini-kpi-label"
        style={{
          display: "block",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#8f7a80",
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <strong
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1.15,
          color: "#f08b95",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

export default function StrategyTesterDrawdownChart({
  data,
  maxDrawdownPercent,
  avgDrawdownPercent,
  top5DrawdownsPercent,
  timeRangeFrom,
  fillContainer = false,
}: Props) {
  const { ref: chartRef, size } = useObservedElementSize<HTMLDivElement>();
  const maxDD = Number(maxDrawdownPercent ?? 0);
  const avgDD = Number(avgDrawdownPercent ?? 0);

  const filteredData = useMemo(() => {
    if (!timeRangeFrom) return data;
    const idx = data.findIndex((p) => (p.time || "") >= timeRangeFrom);
    if (idx <= 0) return data;
    return [data[idx - 1], ...data.slice(idx)];
  }, [data, timeRangeFrom]);
  const segmentedData = useMemo(
    () => filteredData.map((point) => {
      const date = String(point.time || "").slice(0, 10);
      const value = Number(point.value || 0);
      return {
        ...point,
        ddTest: date < WF_OOS_START ? value : null,
        ddMid: date >= WF_OOS_START && date < LIVE_START ? value : null,
        ddLive: date >= LIVE_START ? value : null,
      };
    }),
    [filteredData],
  );

  const top5 = useMemo(() => {
    if (top5DrawdownsPercent?.length) return top5DrawdownsPercent;
    const negVals = filteredData.filter((p) => p.value < 0).map((p) => Math.abs(p.value));
    return negVals.sort((a, b) => b - a).slice(0, 5);
  }, [filteredData, top5DrawdownsPercent]);
  const phaseMarkers = useMemo(
    () => buildStrategyTesterPhaseMarkers(segmentedData.map((point) => ({ time: point.time }))),
    [segmentedData],
  );

  const yDomain = useMemo(() => {
    if (!segmentedData.length) return ["auto", 0] as [string, number];
    const vals = segmentedData.map((p) => p.value).filter((v) => Number.isFinite(v));
    if (!vals.length) return ["auto", 0] as [string, number];
    const min = Math.min(...vals);
    const pad = Math.abs(min) * 0.06 + 0.5;
    return [Math.floor(min - pad), 0] as [number, number];
  }, [segmentedData]);

  if (!segmentedData?.length) return null;
  const top5Label = top5.length
    ? top5.slice(0, 5).map((v) => fmtSignedPct(-Math.abs(v))).join(" / ")
    : "n/a";
  const maxDdLabel = Number.isFinite(maxDD) ? fmtPct(-Math.abs(maxDD)) : "n/a";
  const avgDdLabel = Number.isFinite(avgDD) ? fmtPct(avgDD <= 0 ? avgDD : -Math.abs(avgDD)) : "n/a";
  const hasChartSize = size.width > 0 && size.height > 0;
  const compactStats = hasChartSize && size.width < 460;
  const showTop5Chip = !compactStats || top5.length <= 1;

  const wrapClass = fillContainer ? "st-chart-fill" : "st-chart-wrap st-chart-wrap-drawdown";

  return (
    <div className="st-section-fill">
      <div
        className="st-section-header"
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}
      >
        <span className="st-section-title">Drawdown</span>
        <div
          className="st-section-stats"
          style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 6, marginLeft: "auto" }}
        >
          <MiniKpiCard label="Max DD" value={maxDdLabel} title={`Max Drawdown ${maxDdLabel}`} />
          <MiniKpiCard label="Avg DD" value={avgDdLabel} title={`Average Drawdown ${avgDdLabel}`} />
          {showTop5Chip ? (
            <MiniKpiCard
              label={compactStats ? "Top-5" : "Top-5 DD"}
              value={top5.length ? fmtPct(-Math.abs(top5[0])) : "n/a"}
              title={`Top-5 DD: ${top5Label}`}
            />
          ) : null}
        </div>
      </div>
      <div ref={chartRef} className={wrapClass}>
        {hasChartSize ? (
          <ComposedChart width={Math.max(size.width, 1)} height={Math.max(size.height, 1)} data={segmentedData} margin={{ top: 4, right: 18, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="ddFillTest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#95a2b3" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#95a2b3" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="ddFillMid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D85B68" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#D85B68" stopOpacity={0.015} />
              </linearGradient>
              <linearGradient id="ddFillLive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D6B24A" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#D6B24A" stopOpacity={0.015} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tickFormatter={fmtDate}
              tick={{ fill: "#7f8a9d", fontSize: 9 }}
              axisLine={{ stroke: "rgba(255,255,255,0.16)" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={52}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(v: unknown) => `${Number(v).toFixed(0)}%`}
              tick={{ fill: "#7f8a9d", fontSize: 9 }}
              axisLine={{ stroke: "rgba(255,255,255,0.14)" }}
              tickLine={false}
              width={42}
            />
            <Tooltip
              formatter={(value: unknown) => [fmtPct(value), "Drawdown"]}
              labelFormatter={(label: unknown) => String(label || "").slice(0, 10)}
              contentStyle={{
                background: "#0B0E12",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                color: "#F5F7FA",
                fontSize: 10,
              }}
            />
            {phaseMarkers.segments.map((segment) => (
              <ReferenceArea
                key={segment.id}
                x1={segment.start}
                x2={segment.end}
                ifOverflow="extendDomain"
                fill="transparent"
                strokeOpacity={0}
                label={{
                  value: segment.label,
                  position: segment.labelPosition,
                  offset: segment.labelOffset,
                  fill: segment.labelColor,
                  fontSize: 10,
                }}
              />
            ))}
            {phaseMarkers.markers.map((marker) => (
              <ReferenceLine
                key={marker.id}
                x={marker.date}
                stroke={marker.color}
                strokeDasharray="4 5"
                strokeWidth={1}
                ifOverflow="extendDomain"
              />
            ))}
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
            <Area
              type="monotone"
              dataKey="ddTest"
              fill="url(#ddFillTest)"
              stroke="none"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ddTest"
              stroke="rgba(160,171,186,0.72)"
              strokeWidth={1.2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="ddMid"
              fill="url(#ddFillMid)"
              stroke="none"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ddMid"
              stroke="#D85B68"
              strokeWidth={1.35}
              dot={false}
              activeDot={{ r: 3, fill: "#D85B68", stroke: "none" }}
              connectNulls
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="ddLive"
              fill="url(#ddFillLive)"
              stroke="none"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ddLive"
              stroke="#D6B24A"
              strokeWidth={1.35}
              dot={false}
              activeDot={{ r: 3, fill: "#D6B24A", stroke: "none" }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        ) : null}
      </div>
    </div>
  );
}
