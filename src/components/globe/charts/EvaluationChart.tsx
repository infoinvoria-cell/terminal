"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineWidth,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";

import ChartErrorBoundary from "@/components/globe/charts/ChartErrorBoundary";
import { designTokens, withAlpha } from "@/lib/globe/designTokens";
import { candlestickColors, type ScreenerCandlePaletteId } from "@/lib/globe/screenerCandlePalette";
import type { EvaluationResponse } from "@/lib/globe/globe-types";

type Props = {
  payload: EvaluationResponse | null;
  mode?: "v10" | "v20";
  timeframe?: "M" | "W" | "D" | "4H" | "1H";
  syncRange?: { visibleSpan: number; rightOffset: number } | null;
  loopReplayTick?: number;
  active?: boolean;
  screenerCandlePalette?: ScreenerCandlePaletteId;
};

type SymbolCode = "COMB" | "XAU" | "USD" | "US10Y" | "OIL";
type SymbolMeta = { code: SymbolCode; rank: number };
type ThresholdLine = { owner: ISeriesApi<"Line">; line: IPriceLine };
type ZoneKind = "base" | "high" | "low";

const HIGH_THRESHOLD = 75;
const LOW_THRESHOLD = -75;

/** Screener: width 1 baseline; width 2 only in ±75 extreme band. */
const STROKE_SCREENER_BASE = 1 as const satisfies LineWidth;
const STROKE_SCREENER_EXTREME = 2 as const satisfies LineWidth;
/** Globe / non-screener: same 1 / 2 rule as screener. */
const STROKE_GLOBE_BASE = 1 as const satisfies LineWidth;
const STROKE_GLOBE_EXTREME = 2 as const satisfies LineWidth;

/**
 * Valuation factor base colors (line body outside extremes).
 * COMB = royal blue; DXY/readable green; gold; Treasuries = clear orange.
 */
const VALUATION_BASE_COLORS: Record<SymbolCode, string> = {
  COMB: "#4169E1",
  XAU: "#e8c547",
  USD: "#4caf7a",
  US10Y: "#f97316",
  OIL: "#2ec4b6",
};

function toTs(value: string): UTCTimestamp {
  return Math.floor(new Date(value).getTime() / 1000) as UTCTimestamp;
}

function matchSymbol(row: { label?: string; id?: string; symbol?: string }): SymbolMeta | null {
  const label = `${String(row.label || "")} ${String(row.id || "")} ${String(row.symbol || "")}`.toLowerCase();
  if (label.includes("combined")) return { code: "COMB", rank: 0 };
  if (label.includes("gold") || label.includes("gc1!") || label.includes("xau")) return { code: "XAU", rank: 1 };
  const usdIndex =
    label.includes("dollar")
    || label.includes("dxy")
    || /\bdxy\b/.test(label)
    || (label.includes("usd") && label.includes("index"));
  if (usdIndex) return { code: "USD", rank: 2 };
  if (
    label.includes("oil")
    || label.includes("wti")
    || label.includes("crude")
    || label.includes("cl1!")
    || label.includes("brent")
  ) return { code: "OIL", rank: 4 };
  if (label.includes("10y") || label.includes("bond") || label.includes("anleihe") || label.includes("zb1!") || label.includes("tnx")) {
    return { code: "US10Y", rank: 3 };
  }
  return null;
}

function startOfIsoWeek(ts: number): number {
  const date = new Date(ts * 1000);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  date.setUTCHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

function startOfUtcMonth(ts: number): number {
  const date = new Date(ts * 1000);
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
}

function expandDailyPoints(
  points: Array<{ time: UTCTimestamp; value: number }>,
  stepHours: number,
): Array<{ time: UTCTimestamp; value: number }> {
  const output: Array<{ time: UTCTimestamp; value: number }> = [];
  for (const point of points) {
    for (let hour = 0; hour < 24; hour += stepHours) {
      output.push({
        time: (Number(point.time) + (hour * 3600)) as UTCTimestamp,
        value: point.value,
      });
    }
  }
  return output;
}

function transformPointsForTimeframe(
  points: Array<{ time: UTCTimestamp; value: number }>,
  timeframe: NonNullable<Props["timeframe"]>,
): Array<{ time: UTCTimestamp; value: number }> {
  const sorted = [...points].sort((left, right) => Number(left.time) - Number(right.time));
  if (timeframe === "D") return sorted;
  if (timeframe === "1H") return expandDailyPoints(sorted, 1);
  if (timeframe === "4H") return expandDailyPoints(sorted, 4);

  const buckets = new Map<number, { time: UTCTimestamp; value: number }>();
  for (const point of sorted) {
    const key = timeframe === "W" ? startOfIsoWeek(Number(point.time)) : startOfUtcMonth(Number(point.time));
    buckets.set(key, { time: key as UTCTimestamp, value: point.value });
  }
  return Array.from(buckets.values()).sort((left, right) => Number(left.time) - Number(right.time));
}

function colorForCode(code: SymbolCode): string {
  return VALUATION_BASE_COLORS[code];
}

/** Short tags shown at the right edge next to each valuation factor line. */
function shortLabelForCode(code: SymbolCode): string {
  if (code === "COMB") return "COM";
  if (code === "USD") return "DXY";
  if (code === "XAU") return "XAU";
  if (code === "US10Y") return "YLD";
  return "OIL";
}

type LineLabelSpec = {
  series: ISeriesApi<"Line">;
  value: number;
  text: string;
  color: string;
};

function zoneForValue(value: number): ZoneKind {
  if (value > HIGH_THRESHOLD) return "high";
  if (value < LOW_THRESHOLD) return "low";
  return "base";
}

function strokeForZone(
  zone: ZoneKind,
  baseColor: string,
  screenerCandlePalette?: ScreenerCandlePaletteId,
): { color: string; lineWidth: LineWidth } {
  if (zone === "base") {
    return {
      color: baseColor,
      lineWidth: screenerCandlePalette ? STROKE_SCREENER_BASE : STROKE_GLOBE_BASE,
    };
  }

  if (screenerCandlePalette) {
    const c = candlestickColors(screenerCandlePalette);
    if (zone === "high") {
      return { color: c.downColor, lineWidth: STROKE_SCREENER_EXTREME };
    }
    return { color: c.upColor, lineWidth: STROKE_SCREENER_EXTREME };
  }

  if (zone === "high") {
    return { color: designTokens.chart.candleDown, lineWidth: STROKE_GLOBE_EXTREME };
  }
  return { color: designTokens.chart.candleUp, lineWidth: STROKE_GLOBE_EXTREME };
}

type ValPoint = { time: UTCTimestamp; value: number };

/** True if the segment crosses the horizontal threshold strictly between endpoints (sign change). */
function crossesHighInterior(v0: number, v1: number): boolean {
  return (v0 - HIGH_THRESHOLD) * (v1 - HIGH_THRESHOLD) < 0;
}

function crossesLowInterior(v0: number, v1: number): boolean {
  return (v0 - LOW_THRESHOLD) * (v1 - LOW_THRESHOLD) < 0;
}

function interiorThresholdCuts(t0: number, v0: number, t1: number, v1: number): Array<{ time: UTCTimestamp; value: number }> {
  const cuts: Array<{ t: number; v: number }> = [];
  if (Math.abs(v1 - v0) < 1e-12) return [];

  const pushCross = (threshold: number, crosses: (a: number, b: number) => boolean) => {
    if (!crosses(v0, v1)) return;
    const u = (threshold - v0) / (v1 - v0);
    if (u <= 0 || u >= 1) return;
    const t = t0 + u * (t1 - t0);
    cuts.push({ t: Math.floor(t), v: threshold });
  };

  pushCross(HIGH_THRESHOLD, crossesHighInterior);
  pushCross(LOW_THRESHOLD, crossesLowInterior);

  cuts.sort((a, b) => a.t - b.t);
  const deduped: Array<{ time: UTCTimestamp; value: number }> = [];
  for (const c of cuts) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.time - c.t) < 2) continue;
    deduped.push({ time: c.t as UTCTimestamp, value: c.v });
  }
  return deduped;
}

function subSegmentsForEdge(a: ValPoint, b: ValPoint): Array<{ a: ValPoint; b: ValPoint; zone: ZoneKind }> {
  const t0 = Number(a.time);
  const t1 = Number(b.time);
  const cuts = interiorThresholdCuts(t0, a.value, t1, b.value);
  const chain: ValPoint[] = [a, ...cuts, b];
  const out: Array<{ a: ValPoint; b: ValPoint; zone: ZoneKind }> = [];
  for (let i = 0; i < chain.length - 1; i += 1) {
    const p = chain[i];
    const q = chain[i + 1];
    const midV = (p.value + q.value) / 2;
    out.push({ a: p, b: q, zone: zoneForValue(midV) });
  }
  return out;
}

function buildColoredSegments(points: ValPoint[]): Array<{ points: ValPoint[]; zone: ZoneKind }> {
  if (!points.length) return [];
  if (points.length === 1) return [{ points, zone: zoneForValue(points[0].value) }];

  type Edge = { a: ValPoint; b: ValPoint; zone: ZoneKind };
  const edges: Edge[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    edges.push(...subSegmentsForEdge(points[i], points[i + 1]));
  }

  const merged: Array<{ points: ValPoint[]; zone: ZoneKind }> = [];
  for (const e of edges) {
    const last = merged[merged.length - 1];
    if (
      last
      && last.zone === e.zone
      && last.points.length > 0
      && Number(last.points[last.points.length - 1].time) === Number(e.a.time)
    ) {
      last.points.push(e.b);
    } else {
      merged.push({ points: [e.a, e.b], zone: e.zone });
    }
  }
  return merged;
}

function addSegmentedLineSeries(
  chart: IChartApi,
  points: ValPoint[],
  baseColor: string,
  screenerCandlePalette?: ScreenerCandlePaletteId,
): Array<ISeriesApi<"Line">> {
  if (!points.length) return [];
  if (points.length === 1) {
    const style = strokeForZone(zoneForValue(points[0].value), baseColor, screenerCandlePalette);
    const single = chart.addSeries(LineSeries, {
      color: style.color,
      lineWidth: style.lineWidth,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    single.setData(points);
    return [single];
  }

  const seriesList: Array<ISeriesApi<"Line">> = [];
  for (const seg of buildColoredSegments(points)) {
    if (seg.points.length < 2) continue;
    const style = strokeForZone(seg.zone, baseColor, screenerCandlePalette);
    const series = chart.addSeries(LineSeries, {
      color: style.color,
      lineWidth: style.lineWidth,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    series.setData(seg.points);
    seriesList.push(series);
  }
  return seriesList;
}

function addFixedScaleBounds(chart: IChartApi, from: UTCTimestamp, to: UTCTimestamp): Array<ISeriesApi<"Line">> {
  const sharedOptions = {
    color: "rgba(0,0,0,0)",
    lineWidth: 1 as const,
    lastValueVisible: false,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  };
  const top = chart.addSeries(LineSeries, sharedOptions);
  const bottom = chart.addSeries(LineSeries, sharedOptions);
  top.setData([{ time: from, value: 100 }, { time: to, value: 100 }]);
  bottom.setData([{ time: from, value: -100 }, { time: to, value: -100 }]);
  return [top, bottom];
}

function EvaluationChartInner({
  payload,
  mode = "v20",
  timeframe = "D",
  syncRange = null,
  loopReplayTick = 0,
  active = true,
  screenerCandlePalette,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Array<ISeriesApi<"Line">>>([]);
  const thresholdLinesRef = useRef<ThresholdLine[]>([]);
  const lineLabelSpecsRef = useRef<LineLabelSpec[]>([]);
  const [lineLabelLayouts, setLineLabelLayouts] = useState<Array<{ top: number; text: string; color: string }>>([]);

  const dataCount = useMemo(
    () =>
      Math.max(
        1,
        ...((Array.isArray(payload?.series) ? payload!.series : []).map((row) =>
          transformPointsForTimeframe(
            (Array.isArray(row.points) ? row.points : [])
              .map((point) => {
                const value = mode === "v10" ? (point.v10 ?? point.v20) : (point.v20 ?? point.v10);
                if (value == null || Number.isNaN(value)) return null;
                return { time: toTs(point.t), value: Number(value) };
              })
              .filter((point): point is { time: UTCTimestamp; value: number } => point !== null),
            timeframe,
          ).length,
        )),
      ),
    [mode, payload, timeframe],
  );

  const applySyncRange = useCallback((chart: IChartApi) => {
    if (syncRange?.visibleSpan == null || syncRange?.rightOffset == null) {
      chart.timeScale().fitContent();
      return;
    }
    const span = Math.max(20, Math.min(220, Number(syncRange.visibleSpan)));
    const rightOffset = Math.max(0, Math.min(28, Number(syncRange.rightOffset)));
    const to = (dataCount - 1) + rightOffset;
    const from = Math.max(-5, to - span);
    chart.timeScale().setVisibleLogicalRange({ from, to });
  }, [dataCount, syncRange]);

  const updateLineLabelLayouts = useCallback(() => {
    const chart = chartRef.current;
    const host = hostRef.current;
    if (!chart || !host) return;
    const raw: Array<{ top: number; text: string; color: string }> = [];
    for (const spec of lineLabelSpecsRef.current) {
      const y = spec.series.priceToCoordinate(spec.value);
      if (y == null || !Number.isFinite(y)) continue;
      const top = Math.max(6, Math.min(host.clientHeight - 6, y));
      raw.push({ top, text: spec.text, color: spec.color });
    }
    raw.sort((a, b) => a.top - b.top);
    for (let i = 1; i < raw.length; i += 1) {
      if (raw[i].top - raw[i - 1].top < 12) {
        raw[i] = { ...raw[i], top: raw[i - 1].top + 12 };
      }
    }
    setLineLabelLayouts(raw);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: screenerCandlePalette ? "#e8f0ff" : designTokens.text.muted,
        fontSize: screenerCandlePalette ? 11 : 10,
        attributionLogo: false,
      },
      rightPriceScale: {
        borderColor: screenerCandlePalette ? withAlpha(designTokens.text.secondary, 0.22) : designTokens.stroke.panel,
        autoScale: true,
        scaleMargins: { top: 0.05, bottom: 0.08 },
        minimumWidth: 48,
      },
      timeScale: {
        borderColor: screenerCandlePalette ? withAlpha(designTokens.text.secondary, 0.22) : designTokens.stroke.panel,
        rightOffset: 8,
        barSpacing: 8.2,
      },
      grid: {
        vertLines: { color: "rgba(0,0,0,0)" },
        horzLines: { color: "rgba(0,0,0,0)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: withAlpha(designTokens.text.secondary, 0.34),
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: designTokens.background.surfaceMuted,
        },
        horzLine: {
          color: withAlpha(designTokens.text.secondary, 0.34),
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: designTokens.background.surfaceMuted,
        },
      },
      handleScroll: false,
      handleScale: false,
      localization: { locale: "en-US" },
    });

    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRefs.current = [];
      thresholdLinesRef.current = [];
      lineLabelSpecsRef.current = [];
    };
  }, [screenerCandlePalette]);

  useEffect(() => {
    const chart = chartRef.current;
    const host = hostRef.current;
    if (!chart || !host) return;
    const onLayout = () => {
      window.requestAnimationFrame(updateLineLabelLayouts);
    };
    const ro = new ResizeObserver(onLayout);
    ro.observe(host);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onLayout);
    chart.timeScale().subscribeVisibleTimeRangeChange(onLayout);
    onLayout();
    return () => {
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onLayout);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onLayout);
    };
  }, [screenerCandlePalette, updateLineLabelLayouts]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let loopFrame: number | null = null;

    for (const entry of thresholdLinesRef.current) {
      try {
        entry.owner.removePriceLine(entry.line);
      } catch (_error) {
        // no-op
      }
    }
    thresholdLinesRef.current = [];

    for (const series of seriesRefs.current) {
      try {
        chart.removeSeries(series);
      } catch (_error) {
        // no-op
      }
    }
    seriesRefs.current = [];

    const labelSpecs: LineLabelSpec[] = [];

    const visibleSpan = Math.max(24, Math.min(220, Number(syncRange?.visibleSpan ?? 110)));
    const loopEnabled = active ? loopReplayTick > 0 : false;
    const factorRows = [...(Array.isArray(payload?.series) ? payload!.series : [])]
      .map((row) => ({ row, symbol: matchSymbol(row) }))
      .filter((entry): entry is { row: NonNullable<EvaluationResponse["series"]>[number]; symbol: SymbolMeta } => entry.symbol !== null)
      .sort((left, right) => left.symbol.rank - right.symbol.rank);

    let minTime: UTCTimestamp | null = null;
    let maxTime: UTCTimestamp | null = null;
    const loopTargets: Array<{ series: ISeriesApi<"Line">; data: Array<{ time: UTCTimestamp; value: number }> }> = [];

    for (const { row, symbol } of factorRows) {
      const transformed = transformPointsForTimeframe(
        (Array.isArray(row.points) ? row.points : [])
          .map((point) => {
            const value = mode === "v10" ? (point.v10 ?? point.v20) : (point.v20 ?? point.v10);
            if (value == null || Number.isNaN(value)) return null;
            return { time: toTs(point.t), value: Number(value) };
          })
          .filter((point): point is { time: UTCTimestamp; value: number } => point !== null),
        timeframe,
      );
      if (!transformed.length) continue;

      const visibleData = loopEnabled ? transformed.slice(Math.max(0, transformed.length - visibleSpan)) : transformed;
      minTime = minTime == null || Number(visibleData[0].time) < Number(minTime) ? visibleData[0].time : minTime;
      maxTime = maxTime == null || Number(visibleData[visibleData.length - 1].time) > Number(maxTime) ? visibleData[visibleData.length - 1].time : maxTime;

      if (loopEnabled) {
        const series = chart.addSeries(LineSeries, {
          color: colorForCode(symbol.code),
          lineWidth: screenerCandlePalette ? STROKE_SCREENER_BASE : STROKE_GLOBE_BASE,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        const seed = visibleData.slice(0, Math.max(2, Math.min(3, visibleData.length)));
        series.setData(seed);
        seriesRefs.current.push(series);
        loopTargets.push({ series, data: visibleData });
        const lastV = visibleData[visibleData.length - 1]?.value;
        if (lastV != null && Number.isFinite(lastV)) {
          labelSpecs.push({
            series,
            value: lastV,
            text: shortLabelForCode(symbol.code),
            color: colorForCode(symbol.code),
          });
        }
      } else {
        const segmented = addSegmentedLineSeries(chart, transformed, colorForCode(symbol.code), screenerCandlePalette);
        seriesRefs.current.push(...segmented);
        const lastV = transformed[transformed.length - 1]?.value;
        const lastSeg = segmented[segmented.length - 1];
        if (lastSeg && lastV != null && Number.isFinite(lastV)) {
          labelSpecs.push({
            series: lastSeg,
            value: lastV,
            text: shortLabelForCode(symbol.code),
            color: colorForCode(symbol.code),
          });
        }
      }
    }

    if (minTime != null && maxTime != null) {
      seriesRefs.current.push(...addFixedScaleBounds(chart, minTime, maxTime));
    }

    const thresholdOwner = seriesRefs.current[0];
    if (thresholdOwner) {
      const highColor = screenerCandlePalette
        ? withAlpha(candlestickColors(screenerCandlePalette).downColor, 0.42)
        : withAlpha(designTokens.chart.candleDown, 0.55);
      const lowColor = screenerCandlePalette
        ? withAlpha(candlestickColors(screenerCandlePalette).upColor, 0.42)
        : withAlpha(designTokens.chart.candleUp, 0.55);
      const high = thresholdOwner.createPriceLine({
        price: HIGH_THRESHOLD,
        color: highColor,
        lineStyle: LineStyle.Solid,
        lineWidth: 1,
        axisLabelVisible: false,
        title: "",
      });
      const low = thresholdOwner.createPriceLine({
        price: LOW_THRESHOLD,
        color: lowColor,
        lineStyle: LineStyle.Solid,
        lineWidth: 1,
        axisLabelVisible: false,
        title: "",
      });
      thresholdLinesRef.current = [
        { owner: thresholdOwner, line: high },
        { owner: thresholdOwner, line: low },
      ];
    }

    if (loopTargets.length) {
      const total = Math.max(2, ...loopTargets.map((target) => target.data.length));
      const startLength = 2;
      let shown = startLength;
      const startedAt = performance.now();
      const pointsPerSecond = 34;
      const animate = (now: number) => {
        const targetLength = Math.max(
          startLength,
          Math.min(total, Math.floor(startLength + (((now - startedAt) / 1000) * pointsPerSecond))),
        );
        if (targetLength !== shown) {
          shown = targetLength;
          for (const target of loopTargets) {
            target.series.setData(target.data.slice(0, Math.min(target.data.length, shown)));
          }
        }
        if (shown < total) {
          loopFrame = window.requestAnimationFrame(animate);
        }
      };
      loopFrame = window.requestAnimationFrame(animate);
    }

    lineLabelSpecsRef.current = labelSpecs;
    window.requestAnimationFrame(updateLineLabelLayouts);

    applySyncRange(chart);
    window.requestAnimationFrame(() => {
      applySyncRange(chart);
      updateLineLabelLayouts();
    });

    return () => {
      if (loopFrame != null) window.cancelAnimationFrame(loopFrame);
    };
  }, [active, applySyncRange, loopReplayTick, mode, payload, screenerCandlePalette, syncRange?.visibleSpan, timeframe, updateLineLabelLayouts]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    applySyncRange(chart);
  }, [applySyncRange]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      {lineLabelLayouts.length ? (
        <div className="pointer-events-none absolute inset-y-1 right-0 z-[3] w-11" aria-hidden="true">
          {lineLabelLayouts.map((entry, idx) => (
            <span
              key={`${entry.text}-${idx}`}
              className="absolute right-0 -translate-y-1/2 text-[9px] font-semibold leading-none tracking-tight"
              style={{
                top: entry.top,
                color: entry.color,
                textShadow: "0 0 6px rgba(4,10,18,0.92), 0 1px 2px rgba(4,10,18,0.85)",
              }}
            >
              {entry.text}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function EvaluationChart(props: Props) {
  return (
    <ChartErrorBoundary>
      <EvaluationChartInner {...props} />
    </ChartErrorBoundary>
  );
}
