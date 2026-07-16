"use client";

import { useMemo } from "react";
import { Area, ComposedChart, Line, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import type { PerformanceCurvePoint } from "@/lib/monitoring/types";
import useObservedElementSize from "@/components/monitoring/useObservedElementSize";
import { buildStrategyTesterPhaseMarkers, LIVE_START, WF_OOS_START } from "@/components/monitoring/strategyTesterPhaseMarkers";

type Props = {
  data: PerformanceCurvePoint[];
  timeRangeFrom?: string | null;
  totalReturnPercent?: number;
  cagr?: number;
  fillContainer?: boolean;
};

function fmtPct(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtDate(value: unknown): string {
  const s = String(value || "");
  return s.length >= 7 ? s.slice(0, 7) : s.slice(0, 10);
}

function MiniKpiCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="st-mini-kpi-card"
      title={`${label} ${value}`}
      style={{
        display: "grid",
        justifyItems: "start",
        gap: 2,
        minWidth: 92,
        padding: "6px 9px",
        borderRadius: 10,
        border: "1px solid rgba(232, 237, 244, 0.16)",
        background: "rgba(12, 14, 18, 0.92)",
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
          color: "#7c8798",
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
          color: "#eef2f7",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

export default function StrategyTesterEquityChart({
  data,
  timeRangeFrom,
  totalReturnPercent,
  cagr,
  fillContainer = false,
}: Props) {
  const { ref: chartRef, size } = useObservedElementSize<HTMLDivElement>();
  // data.value is already return-% from strategy performance engine.
  const pctData = useMemo(() => {
    if (!data?.length) return [];
    const filtered = timeRangeFrom
      ? (() => {
          const idx = data.findIndex((p) => (p.time || "") >= timeRangeFrom);
          if (idx <= 0) return data;
          return [data[idx - 1], ...data.slice(idx)];
        })()
      : data;

    return filtered.map((p) => ({
      time: p.time,
      pct: Math.round(Number(p.value || 0) * 100) / 100,
      pctTest: String(p.time || "").slice(0, 10) < WF_OOS_START ? Math.round(Number(p.value || 0) * 100) / 100 : null,
      pctMid: String(p.time || "").slice(0, 10) >= WF_OOS_START && String(p.time || "").slice(0, 10) < LIVE_START ? Math.round(Number(p.value || 0) * 100) / 100 : null,
      pctLive: String(p.time || "").slice(0, 10) >= LIVE_START ? Math.round(Number(p.value || 0) * 100) / 100 : null,
    }));
  }, [data, timeRangeFrom]);

  const phaseMarkers = useMemo(
    () => buildStrategyTesterPhaseMarkers(pctData.map((point) => ({ time: point.time }))),
    [pctData],
  );

  const yDomain = useMemo(() => {
    if (!pctData.length) return ["auto", "auto"] as [string, string];
    const vals = pctData.map((p) => p.pct).filter((v) => Number.isFinite(v));
    if (!vals.length) return ["auto", "auto"] as [string, string];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max(Math.abs(max - min) * 0.06, 1);
    return [Math.floor(min - pad), Math.ceil(max + pad)] as [number, number];
  }, [pctData]);

  if (!pctData.length) return null;
  const hasChartSize = size.width > 0 && size.height > 0;
  const chartKey = `${pctData.length}:${timeRangeFrom ?? "all"}`;
  const compactStats = hasChartSize && size.width < 460;

  const wrapClass = fillContainer
    ? "st-chart-fill"
    : "st-chart-wrap st-chart-wrap-equity";

  return (
    <div className={`st-section-fill ${fillContainer ? "fill" : ""}`}>
      {/* Co-located layout CSS. The shared rules in MonitoringPage's global block are
          dropped for these child-only selectors in the production build, which left the
          chart wrapper with zero height (no curve drawn). Declared here so the equity
          and drawdown curves fill their container like the Agrar tester. */}
      <style jsx global>{`
        .st-section-fill {
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .st-section-fill.fill { height: 100%; }
        .st-section-header {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 4px 4px 2px;
        }
        .st-section-stats {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
        }
        .st-section-title {
          color: #f5f7fa;
          font-size: 11px;
          font-weight: 700;
        }
        .st-chart-fill {
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
        }
      `}</style>
      <div
        className="st-section-header"
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}
      >
        <span className="st-section-title">Equity Curve</span>
        <div
          className="st-section-stats"
          style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 6, marginLeft: "auto" }}
        >
          {totalReturnPercent !== undefined && (
            <MiniKpiCard
              label={compactStats ? "Net" : "Net Return"}
              value={fmtPct(totalReturnPercent)}
            />
          )}
          {cagr !== undefined && (
            <MiniKpiCard
              label="CAGR"
              value={`${fmtPct(cagr)} p.a.`}
            />
          )}
        </div>
      </div>
      <div ref={chartRef} className={wrapClass}>
        {hasChartSize ? (
          <ComposedChart key={chartKey} width={Math.max(size.width, 1)} height={Math.max(size.height, 1)} data={pctData} margin={{ top: 4, right: 18, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="eqGradTest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#aab4c2" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#aab4c2" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="eqGradMid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f4f6fa" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#f4f6fa" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="eqLiveGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D6B24A" stopOpacity={0.16} />
                <stop offset="100%" stopColor="#D6B24A" stopOpacity={0.01} />
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
              formatter={(value: unknown) => [fmtPct(value), "Return"]}
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
            <ReferenceLine
              y={0}
              stroke="rgba(255,255,255,0.34)"
              strokeDasharray="5 4"
              strokeWidth={1.1}
            />
            <Area
              type="monotone"
              dataKey="pctTest"
              fill="url(#eqGradTest)"
              stroke="none"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="pctMid"
              fill="url(#eqGradMid)"
              stroke="none"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="pctLive"
              fill="url(#eqLiveGlow)"
              stroke="none"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="pctTest"
              stroke="rgba(183,192,204,0.72)"
              strokeWidth={1.3}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="pctMid"
              stroke="#F5F7FA"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: "#F5F7FA", stroke: "none" }}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="pctLive"
              stroke="#D6B24A"
              strokeWidth={1.8}
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
