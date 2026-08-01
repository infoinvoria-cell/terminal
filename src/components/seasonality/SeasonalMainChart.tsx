"use client";

import { useMemo, useCallback, useId, useRef, memo } from "react";
import {
  Area,
  Line,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import SafeResponsiveContainer from "@/components/shared/SafeResponsiveContainer";
import type { DailySeasonalResult, DailySeasonalPoint } from "@/lib/seasonality/dailySeasonalChart";
import { todayTradingDaySlot } from "@/lib/seasonality/tenDayProbability";
import type { PatternCandidate } from "@/lib/seasonality/patternSelection";
import styles from "./seasonal.module.css";

const C_WHITE = "#F0F3F7";
const C_GOLD = "#DCC476";
const C_AXIS = "#D4DEE8";
const C_GRID = "rgba(255,255,255,0.04)";
const C_ZERO = "rgba(255,255,255,0.18)";
const C_MARKER = "rgba(236,242,250,0.90)";
const C_TODAY_STROKE = "rgba(200,215,232,0.34)";
const C_LONG = "#E8EDF3";   // positive = white
const C_SHORT = "#D6B867";  // negative = gold
const FONT = "Montserrat, Segoe UI, sans-serif";

interface SplitPoint {
  doy: number;
  above: number | null;
  below: number | null;
  seasonal: number;
  sampleSize: number;
}

function buildSplitData(points: DailySeasonalPoint[]): SplitPoint[] {
  const out: SplitPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    if (prev && prev.seasonal !== 0 && p.seasonal !== 0 && (prev.seasonal > 0) !== (p.seasonal > 0)) {
      const t = Math.abs(prev.seasonal) / (Math.abs(prev.seasonal) + Math.abs(p.seasonal));
      out.push({
        doy: parseFloat((prev.dayOfYear + (p.dayOfYear - prev.dayOfYear) * t).toFixed(2)),
        above: 0,
        below: 0,
        seasonal: 0,
        sampleSize: 0,
      });
    }
    out.push({
      doy: p.dayOfYear,
      above: p.seasonal >= 0 ? parseFloat(p.seasonal.toFixed(3)) : null,
      below: p.seasonal <= 0 ? parseFloat(p.seasonal.toFixed(3)) : null,
      seasonal: parseFloat(p.seasonal.toFixed(3)),
      sampleSize: p.sampleSize,
    });
  }
  return out;
}

function monthTicksFromBoundaries(monthBoundaries: DailySeasonalResult["monthBoundaries"]) {
  return monthBoundaries.map((b) => b.startDayOfYear);
}

function monthLabelAt(doy: number, monthBoundaries: DailySeasonalResult["monthBoundaries"]) {
  return monthBoundaries.find((b) => b.startDayOfYear === doy)?.label ?? "";
}

function isInPatternRange(slot: number, start: number, end: number): boolean {
  const s = Math.max(1, Math.min(252, Math.round(start)));
  const e = Math.max(1, Math.min(252, Math.round(end)));
  if (s <= e) return slot >= s && slot <= e;
  return slot >= s || slot <= e;
}

function directionColor(direction: PatternCandidate["direction"]): string {
  return direction === "LONG" ? C_LONG : C_SHORT;
}

function todayLineLabel(props: { viewBox?: { x?: number; y?: number } }) {
  const x = props.viewBox?.x;
  const y = props.viewBox?.y;
  if (x == null || y == null) return null;
  return (
    <text x={x} y={y - 9} textAnchor="middle" fill="rgba(200,215,232,0.28)" fontSize={11.5} fontWeight={700} fontFamily={FONT}>
      Today
    </text>
  );
}

interface CurveProps {
  result: DailySeasonalResult;
  hoverDoy: number | null;
  onHoverDoy: (doy: number | null) => void;
  onClickDoy?: (doy: number | null) => void;
  embedded?: boolean;
  activePattern?: PatternCandidate | null;
  selectedPattern?: PatternCandidate | null;
  todaySlot?: number;
  // Visual settings (from gear menu)
  showToday?: boolean;
  showPatternHighlight?: boolean;
  chartGradient?: boolean;
}

function SeasonalCurveChartInner({ result, hoverDoy, onHoverDoy, onClickDoy, embedded, activePattern, selectedPattern, todaySlot, showToday = true, showPatternHighlight = true, chartGradient = true }: CurveProps) {
  const computedTodayDoy = useMemo(() => todayTradingDaySlot(), []);
  const todayDoy = todaySlot ?? computedTodayDoy;
  const gradId = useId().replace(/:/g, "");

  const overlayPattern = activePattern ?? selectedPattern ?? null;

  const data = useMemo(() => buildSplitData(result.points), [result.points]);
  // chartData now only rebuilds when locked pattern changes, not on every hover
  const chartData = useMemo(() => {
    if (!overlayPattern) return data;
    return data.map((p) => ({
      ...p,
      activeSegment: isInPatternRange(p.doy, overlayPattern.startSlot, overlayPattern.endSlot) ? p.seasonal : null,
    }));
  }, [overlayPattern, data]);
  const monthTicks = useMemo(() => monthTicksFromBoundaries(result.monthBoundaries), [result.monthBoundaries]);
  const activeColor = overlayPattern ? directionColor(overlayPattern.direction) : C_MARKER;

  // PERF: RAF throttle + slot change detection — prevents flood of state updates
  const lastSlotRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  const onMove = useCallback((s: any) => {
    const l = typeof s?.activeLabel === "number" ? s.activeLabel : null;
    if (l === lastSlotRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      lastSlotRef.current = l;
      onHoverDoy(l);
    });
  }, [onHoverDoy]);

  const onClick = useCallback((s: any) => {
    if (!onClickDoy) return;
    const l = typeof s?.activeLabel === "number" ? s.activeLabel : null;
    onClickDoy(l);
  }, [onClickDoy]);

  const minV = Math.min(...result.points.map((p) => p.seasonal));
  const maxV = Math.max(...result.points.map((p) => p.seasonal));
  const pad = Math.max(Math.abs(maxV - minV) * 0.06, 0.4);
  const dimOpacity = overlayPattern && selectedPattern
    && (
      overlayPattern.startSlot !== selectedPattern.startSlot
      || overlayPattern.endSlot !== selectedPattern.endSlot
      || overlayPattern.direction !== selectedPattern.direction
    )
    ? 0.4
    : 1;

  return (
    <div className={embedded ? styles.chartSurfaceEmbedded : styles.chartSurface} style={{ height: "100%" }} tabIndex={-1}>
      <SafeResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <ComposedChart
          data={chartData}
          margin={{ top: 18, right: 8, bottom: 18, left: 4 }}  // SYNC: left(4)+yAxis(38)=42
          onMouseMove={onMove}
          onClick={onClick}
        >
          <defs>
            <linearGradient id={`${gradId}-bull`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(240,243,247,0.68)" />
              <stop offset="50%" stopColor="rgba(240,243,247,0.28)" />
              <stop offset="100%" stopColor="rgba(240,243,247,0.02)" />
            </linearGradient>
            <linearGradient id={`${gradId}-bear`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgba(220,196,118,0.62)" />
              <stop offset="50%" stopColor="rgba(220,196,118,0.22)" />
              <stop offset="100%" stopColor="rgba(220,196,118,0.02)" />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="2 8" stroke={C_GRID} vertical={false} />
          <XAxis
            dataKey="doy"
            type="number"
            domain={[1, 252]}
            ticks={monthTicks}
            tickFormatter={(v: number) => monthLabelAt(v, result.monthBoundaries)}
            tick={{ fill: C_AXIS, fontSize: 12, fontFamily: FONT, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            height={22}
          />
          <YAxis
            domain={[minV - pad, maxV + pad]}
            tick={{ fill: C_AXIS, fontSize: 12, fontFamily: FONT }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${Math.abs(v) < 0.05 ? "0" : v.toFixed(0)}`}
            width={38}
            tickCount={5}
          />

          <ReferenceLine y={0} stroke={C_ZERO} strokeWidth={1} strokeDasharray="4 3" />

          {/* Chart Gradient setting */}
          {chartGradient && (
            <>
              <Area type="monotone" dataKey="above" stroke="none" fill={`url(#${gradId}-bull)`}
                fillOpacity={dimOpacity}
                baseValue={0} connectNulls={false} isAnimationActive={false} activeDot={false} />
              <Area type="monotone" dataKey="below" stroke="none" fill={`url(#${gradId}-bear)`}
                fillOpacity={dimOpacity}
                baseValue={0} connectNulls={false} isAnimationActive={false} activeDot={false} />
            </>
          )}

          {/* Show Today setting */}
          {showToday && (
            <ReferenceLine
              x={todayDoy}
              stroke={C_TODAY_STROKE}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              ifOverflow="visible"
              label={todayLineLabel}
            />
          )}

          {hoverDoy != null && hoverDoy !== todayDoy && (
            <ReferenceLine
              x={hoverDoy}
              stroke={C_MARKER}
              strokeWidth={1.2}
              strokeDasharray="3 4"
              ifOverflow="visible"
            />
          )}

          {/* Show Pattern Highlight setting — gold zone + dashed entry/exit */}
          {overlayPattern && showPatternHighlight && (
            <>
              <ReferenceArea
                x1={overlayPattern.startSlot}
                x2={overlayPattern.endSlot}
                fill={activeColor}
                fillOpacity={0.06}
                ifOverflow="visible"
              />
              <ReferenceLine
                x={overlayPattern.startSlot}
                stroke={activeColor}
                strokeOpacity={0.72}
                strokeWidth={1.2}
                strokeDasharray="4 3"
                ifOverflow="visible"
              />
              <ReferenceLine
                x={overlayPattern.endSlot}
                stroke={activeColor}
                strokeOpacity={0.55}
                strokeWidth={1.2}
                strokeDasharray="4 3"
                ifOverflow="visible"
              />
            </>
          )}

          <Line type="monotone" dataKey="above" stroke={C_WHITE} strokeWidth={2}
            strokeOpacity={dimOpacity}
            dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="below" stroke={C_GOLD} strokeWidth={2}
            strokeOpacity={dimOpacity}
            dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
          {overlayPattern && showPatternHighlight && (
            <Line
              type="monotone"
              dataKey="activeSegment"
              stroke={activeColor}
              strokeWidth={2.4}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </SafeResponsiveContainer>
    </div>
  );
}

// PERF: memo comparison — only re-render when meaningful props change
export const SeasonalCurveChart = memo(SeasonalCurveChartInner, (prev, next) =>
  prev.result === next.result &&
  prev.hoverDoy === next.hoverDoy &&
  prev.embedded === next.embedded &&
  prev.todaySlot === next.todaySlot &&
  prev.activePattern?.startSlot === next.activePattern?.startSlot &&
  prev.activePattern?.endSlot === next.activePattern?.endSlot &&
  prev.activePattern?.direction === next.activePattern?.direction &&
  prev.selectedPattern?.startSlot === next.selectedPattern?.startSlot &&
  prev.selectedPattern?.endSlot === next.selectedPattern?.endSlot &&
  prev.selectedPattern?.direction === next.selectedPattern?.direction
);

export function SeasonalMainChart(props: CurveProps) {
  return <SeasonalCurveChart {...props} />;
}

export function SeasonalOscillatorChart(_props: { result: DailySeasonalResult; hoverDoy: number | null; onHoverDoy: (d: number | null) => void }) {
  return null;
}
