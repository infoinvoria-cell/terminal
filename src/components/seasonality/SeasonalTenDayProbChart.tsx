"use client";

import { useMemo, useCallback, useRef, memo } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import SafeResponsiveContainer from "@/components/shared/SafeResponsiveContainer";
import type { PatternDataResult, PatternCandidate, OscillatorMode, WinrateBarData } from "@/lib/seasonality/patternSelection";
import styles from "./seasonal.module.css";

const C_AXIS = "#D4DEE8";
const C_AXIS_X = "#677484";
// SYNC: match Seasonal chart line styles exactly
const C_TODAY      = "rgba(200,215,232,0.34)";  // same as SeasonalMainChart C_TODAY_STROKE
const C_HOVER_LINE = "rgba(236,242,250,0.55)";  // dimmer than seasonal hover (bottom chart)
const FONT = "Montserrat, Segoe UI, sans-serif";

const MONTH_TICKS = [
  { slot: 1, label: "Jan" },
  { slot: 21, label: "Feb" },
  { slot: 40, label: "Mar" },
  { slot: 62, label: "Apr" },
  { slot: 83, label: "May" },
  { slot: 104, label: "Jun" },
  { slot: 125, label: "Jul" },
  { slot: 147, label: "Aug" },
  { slot: 169, label: "Sep" },
  { slot: 189, label: "Oct" },
  { slot: 211, label: "Nov" },
  { slot: 232, label: "Dec" },
];

export type { PatternCandidate as SelectedWindow };

interface Props {
  patternData: PatternDataResult | null;
  loading?: boolean;
  hoverDoy: number | null;
  onHoverDoy: (doy: number | null) => void;
  onSelectPattern: (c: PatternCandidate | null) => void;
  selectedPattern: PatternCandidate | null;
  embedded?: boolean;
  todaySlot?: number;
  showToday?: boolean;
  /** Active scanner mode — WR (winrate), SR (sharpe), or QS (quality score). Default WR. */
  mode?: OscillatorMode;
  /** Live QS bars from progressive background computation (used when patternData.qsBars unavailable). */
  qsLiveBars?: Map<number, { slot: number; value: number; candidate: PatternCandidate | null }>;
}

/**
 * Edge-based bar height: barValue = ((winRate - 50) / 50) * 100
 *   50% WR → barValue = 0  (neutral, invisible)
 *   55% WR → barValue = ±10 (tiny)
 *   60% WR → barValue = ±20
 *   79% WR → barValue = ±58 (clearly visible)
 *  100% WR → barValue = ±100 (max)
 *
 * Opacity scales with edge strength so strong signals are bright.
 */
function edgeBarValue(winRate: number, direction: "LONG" | "SHORT"): number {
  const edge = Math.max(0, ((winRate - 50) / 50) * 100);
  return direction === "LONG" ? edge : -edge;
}

function barFill(barValue: number, isSelected: boolean): string {
  if (isSelected) {
    return barValue >= 0
      ? "rgba(240,243,247,0.98)"
      : "rgba(220,196,118,0.98)";
  }
  // Linear intensity scaling by absolute bar height.
  // Small values → darker; large values → brighter.
  const maxAbsValue = 100;
  const strength = Math.min(1, Math.abs(barValue) / maxAbsValue);
  const alpha = Math.min(0.98, 0.18 + strength * 0.82);
  return barValue >= 0
    ? `rgba(240,243,247,${alpha.toFixed(3)})`
    : `rgba(220,196,118,${alpha.toFixed(3)})`;
}

// PERF: memo — only re-renders when patternData, selectedPattern, hoverDoy, or todaySlot change
export const SeasonalTenDayProbChart = memo(function SeasonalTenDayProbChart({
  patternData,
  loading,
  hoverDoy,
  onHoverDoy,
  onSelectPattern,
  selectedPattern,
  embedded,
  todaySlot,
  showToday = true,
  mode = "WR",
  qsLiveBars,
}: Props) {
  /** Round x up to a readable "nice" tick value. */
  function roundUpReadable(x: number): number {
    if (x <= 0) return 0.5;
    const exp = Math.floor(Math.log10(x));
    const base = Math.pow(10, exp);
    const frac = x / base;
    const step = frac <= 1 ? 0.2 : frac <= 2 ? 0.5 : 1;
    return Math.ceil(x / (base * step)) * (base * step);
  }

  /** Dynamic SR domain: scales to actual max Sharpe + 10% headroom. */
  const srDomain = useMemo((): [number, number] => {
    if (mode !== "SR" || !patternData?.srBars?.length) return [-3, 3];
    const maxAbs = Math.max(...patternData.srBars.map(b => Math.abs(b.barValue ?? 0)), 0.1);
    const d = roundUpReadable(maxAbs * 1.1);
    return [-d, d];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, patternData?.srBars]);

  const chartData = useMemo(() => {
    if (!patternData) return [];

    // For QS mode: prefer precomputed qsBars, else convert live bars to WinrateBarData shape
    const qsLiveBarsAsWr: WinrateBarData[] = qsLiveBars && qsLiveBars.size > 0
      ? Array.from(qsLiveBars.values()).map(b => ({
          startSlot: b.slot,
          approxMonthLabel: "",
          bestCandidate: b.candidate,
          barValue: b.value,
        }))
      : [];
    const qsBarsSource: WinrateBarData[] = patternData.qsBars?.length
      ? patternData.qsBars
      : (qsLiveBarsAsWr.length ? qsLiveBarsAsWr : patternData.winrateBars);

    const activeBars =
      mode === "SR" ? (patternData.srBars ?? patternData.winrateBars) :
      mode === "QS" ? qsBarsSource :
      patternData.winrateBars;

    return activeBars.map((bar) => {
      const cand = bar.bestCandidate;
      if (!cand) return { slot: bar.startSlot, value: 0, candidate: null, isSelected: false };

      let value = 0;
      if (mode === "SR") {
        const s = cand.sharpe ?? 0;
        value = cand.direction === "LONG" ? s : -s;
      } else if (mode === "QS") {
        const qs = (cand as PatternCandidate & { qualityScore?: number }).qualityScore ?? 0;
        const mag = Math.max(0, qs - 50) * 2;
        value = cand.direction === "LONG" ? mag : -mag;
      } else {
        value = edgeBarValue(cand.winRate, cand.direction);
      }

      return {
        slot: bar.startSlot,
        value,
        candidate: cand,
        isSelected: selectedPattern?.startSlot === bar.startSlot,
      };
    });
  }, [patternData, selectedPattern, mode]);

  const effectiveTodaySlot = useMemo(() => {
    const source = todaySlot ?? patternData?.todaySlot ?? null;
    return source == null ? null : Math.max(1, Math.min(251, Math.round(source)));
  }, [todaySlot, patternData]);

  const effectiveHoverSlot = hoverDoy == null ? null : Math.max(1, Math.min(251, Math.round(hoverDoy)));
  const selectedSlot = selectedPattern ? Math.max(1, Math.min(251, Math.round(selectedPattern.startSlot))) : null;

  // PERF: RAF throttle + slot change detection
  const lastSlotRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  const handleMouseMove = useCallback((state: Record<string, unknown>) => {
    const payload = (state.activePayload as { payload?: { slot?: number } }[] | undefined)?.[0]?.payload;
    const slot = payload?.slot;
    if (slot == null || slot === lastSlotRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      lastSlotRef.current = slot;
      onHoverDoy(slot);
    });
  }, [onHoverDoy]);

  const handleClick = useCallback((state: Record<string, unknown>) => {
    const payload = (state.activePayload as { payload?: { slot?: number; candidate?: PatternCandidate | null } }[] | undefined)?.[0]?.payload;
    if (!payload?.candidate) return;
    if (selectedPattern?.startSlot === payload.slot) onSelectPattern(null);
    else onSelectPattern(payload.candidate);
  }, [selectedPattern, onSelectPattern]);

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#7E8D9C" }}>
        Loading...
      </div>
    );
  }

  if (!patternData || chartData.length === 0) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#7E8D9C" }}>
        -
      </div>
    );
  }

  return (
    <div className={embedded ? styles.chartSurfaceEmbedded : styles.chartSurface} style={{ height: "100%" }}>
      <SafeResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <ComposedChart
          data={chartData}
          margin={{ top: 4, right: 8, bottom: 16, left: 4 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => onHoverDoy(null)}
          onClick={handleClick}
          style={{ cursor: "pointer" }}
        >
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.03)" vertical={false} />

          <XAxis
            dataKey="slot"
            type="number"
            domain={[1, 252]}
            ticks={MONTH_TICKS.map((t) => t.slot)}
            tickFormatter={(slot: number) => MONTH_TICKS.find((t) => t.slot === slot)?.label ?? ""}
            tick={{ fill: C_AXIS_X, fontSize: 10, fontFamily: FONT, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            interval={0}
            height={18}
          />

          <YAxis
            domain={mode === "SR" ? srDomain : [-100, 100]}
            ticks={mode === "SR" ? [srDomain[0], 0, srDomain[1]] : [-100, 0, 100]}
            tick={{ fill: C_AXIS, fontSize: 10, fontFamily: FONT }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => {
              if (mode === "SR") {
                if (v === 0) return "0";
                const s = v.toFixed(Math.abs(v) < 1 ? 1 : 2);
                return v > 0 ? `+${s}` : s;
              }
              if (mode === "QS") return v === 100 ? "100" : v === -100 ? "-100" : v === 0 ? "50" : "";
              return v === 100 ? "+100%" : v === -100 ? "-100%" : v === 0 ? "50" : "";
            }}
            width={38}
          />

          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4 3" />

          {/* SYNC: Today line — same style as Seasonal chart (strokeWidth, dasharray) */}
          {showToday && effectiveTodaySlot != null && (
            <ReferenceLine
              x={effectiveTodaySlot}
              stroke={C_TODAY}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          )}

          {/* SYNC: Hover line — same dasharray as Seasonal chart hover line */}
          {effectiveHoverSlot != null && effectiveHoverSlot !== effectiveTodaySlot && (
            <ReferenceLine
              x={effectiveHoverSlot}
              stroke={C_HOVER_LINE}
              strokeWidth={1.2}
              strokeDasharray="3 4"
            />
          )}

          {selectedSlot != null && selectedSlot !== effectiveHoverSlot && selectedSlot !== effectiveTodaySlot && (
            <ReferenceLine
              x={selectedSlot}
              stroke="rgba(236,242,250,0.55)"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          )}

          <Bar dataKey="value" isAnimationActive={false} radius={[2, 2, 0, 0]} barSize={4}>
            {chartData.map((d, i) => (
              <Cell
                key={`wr-${i}`}
                fill={barFill(d.value, d.isSelected)}
                stroke={d.isSelected ? (d.value >= 0 ? "rgba(240,243,247,0.98)" : "rgba(220,196,118,0.98)") : "none"}
                strokeWidth={d.isSelected ? 1.2 : 0}
              />
            ))}
          </Bar>
        </ComposedChart>
      </SafeResponsiveContainer>
    </div>
  );
});
