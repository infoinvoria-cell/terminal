"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import ChartErrorBoundary from "@/components/globe/charts/ChartErrorBoundary";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type LogicalRange,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";

import { GlobeApi } from "@/lib/globe/api";
import { designTokens, signalTone, withAlpha } from "@/lib/globe/designTokens";
import { buildGlobeSeasonalityAnalysis } from "@/lib/globe/globeSeasonality";
import { sanitizeOhlcvSeries } from "@/lib/globe/ohlcv";
import {
  fetchScreenerTimeseriesWithFallback,
  readScreenerTimeseriesMemory,
  screenerTimeseriesCacheKey,
  timeseriesHasValidOhlcv,
  writeScreenerTimeseriesMemory,
} from "@/lib/screener/screenerClientTimeseries";

/** Screener chart is valid only with a real history window. */
const MIN_SCREENER_OHLCV_BARS = 50;
import { candlestickColors, zoneFillColors, type ScreenerCandlePaletteId } from "@/lib/screener/screenerCandlePalette";
import { buildSupplyDemandZones, dedupeNearDuplicateZones, pickRelevantZones } from "@/lib/screener/supplyDemand";
import type { PineSignalMarker, PineZone } from "@/lib/screener/screenerTypes";
import type { EvaluationResponse, OhlcvPoint, SeasonalityResponse, TimeseriesResponse } from "@/lib/globe/globe-types";

type Props = {
  payload: TimeseriesResponse | null;
  evaluation?: EvaluationResponse | null;
  seasonality?: SeasonalityResponse | null;
  dataSource?: "tradingview" | "dukascopy" | "yahoo";
  title?: string;
  sourceLabel?: string;
  goldThemeEnabled?: boolean;
  themePrimary?: string;
  isPanelLoading?: boolean;
  isFullscreen?: boolean;
  active?: boolean;
  onToggleFullscreen?: () => void;
  loopReplayTick?: number;
  onTimeRangeChange?: (range: { visibleSpan: number; rightOffset: number } | null) => void;
  onRecentSignalChange?: (signal: { direction: "bullish" | "bearish"; lines: string[]; ageBars: number } | null) => void;
  onTimeframeChange?: (timeframe: CandleChartTimeframeKey) => void;
  serverMarkers?: PineSignalMarker[];
  screenerZones?: PineZone[];
  toolbarHost?: HTMLElement | null;
  topLeftOverlay?: ReactNode;
  toolbarOverlay?: ReactNode;
  focusNearestZones?: boolean;
  renderAllActiveZones?: boolean;
  /** Screener page: parent-owned Zones/Signals/TF controls rendered outside the chart. */
  screenerToolbar?: CandleChartScreenerToolbar | null;
  /** Screener page: memory cache + 3s timeout + source fallback chain per request. */
  screenerAcceleratedFetch?: boolean;
  /** Screener page: hide built-in chart toolbar (parent renders controls). */
  hideBuiltinChartToolbar?: boolean;
  /** Screener page: do not paint title overlay on canvas area. */
  suppressTitleOverlay?: boolean;
  /** Screener page: candle + zone palette. */
  screenerCandlePalette?: ScreenerCandlePaletteId;
  /** Trading chart page: render zones thicker and extended to the right. */
  emphasizeZones?: boolean;
  /** Trading chart page: zone visibility filters. */
  zoneVisibility?: {
    active: boolean;
    historical: boolean;
    strongOnly: boolean;
  };
  disableZoneDedupe?: boolean;
  tradeOverlays?: Array<{
    direction: "LONG" | "SHORT";
    entryTime: string;
    exitTime: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    breakEven: number;
    breakEvenTriggered?: boolean;
  }>;
  tradeMarkers?: Array<{
    type: "ENTRY" | "EXIT";
    direction: "LONG" | "SHORT";
    time: string;
    price: number;
  }>;
};

type ZoneRect = {
  kind: "demand" | "supply";
  strength: "normal" | "strong";
  label?: string;
  left: number;
  width: number;
  top: number;
  height: number;
  fill: string;
  opacity: number;
};

type SignalOverlayMarker = {
  time: UTCTimestamp;
  direction: "LONG" | "SHORT";
};

type SignalGlyph = {
  x: number;
  y: number;
  direction: "LONG" | "SHORT";
};

type ExecutionGlyph = {
  x: number;
  y: number;
  direction: "LONG" | "SHORT";
  type: "ENTRY" | "EXIT";
};

type TradeLineGlyph = {
  x1: number;
  x2: number;
  y: number;
  color: string;
  dashed?: boolean;
};

type CandleBar = { time: UTCTimestamp; open: number; high: number; low: number; close: number };

type EvalFlags = { longOk: boolean; shortOk: boolean };

type ZoneRuntime = PineZone & {
  startTs: number;
  endTs: number;
};

export type CandleChartTimeframeKey = "M" | "W" | "D" | "4H" | "1H";
type ContinuousMode = "regular" | "backadjusted";

export type CandleChartScreenerToolbar = {
  timeframe: CandleChartTimeframeKey;
  onTimeframeChange: (tf: CandleChartTimeframeKey) => void;
  zonesEnabled: boolean;
  onZonesEnabledChange: (value: boolean) => void;
  signalsEnabled: boolean;
  onSignalsEnabledChange: (value: boolean) => void;
};

const VAL_HIGH = 75;
const VAL_LOW = -75;
const TIMEFRAME_BARS: Record<CandleChartTimeframeKey, number> = {
  M: 100,
  W: 100,
  D: 100,
  "4H": 100,
  "1H": 100,
};

/** Map seasonal hold (calendar days) to bar count on the active chart timeframe (orientation only). */
function seasonalityProjectionBarSpan(holdCalendarDays: number, tf: CandleChartTimeframeKey): number {
  const h = Math.max(1, Math.round(holdCalendarDays));
  if (tf === "1H") return Math.min(h * 24, 220);
  if (tf === "4H") return Math.min(h * 6, 140);
  if (tf === "W") return Math.max(2, Math.min(Math.max(1, Math.ceil(h / 7)), 48));
  if (tf === "M") return Math.min(h, 80);
  return Math.min(h, 96);
}

const TF_SECONDS_FALLBACK: Record<CandleChartTimeframeKey, number> = {
  M: 30 * 24 * 60 * 60,
  W: 7 * 24 * 60 * 60,
  D: 24 * 60 * 60,
  "4H": 4 * 60 * 60,
  "1H": 60 * 60,
};

const PLOT_SAFE_MARGIN_TOP = 4;
const PLOT_SAFE_MARGIN_LEFT = 2;
const PLOT_SAFE_MARGIN_RIGHT = 62;
const PLOT_SAFE_MARGIN_BOTTOM = 22;
const SCREENER_ZONE_MARGIN_RIGHT = 78;
const SCREENER_ZONE_MARGIN_BOTTOM = 56;

function toTs(value: string): UTCTimestamp {
  return Math.floor(new Date(value).getTime() / 1000) as UTCTimestamp;
}

function dayKeyFromTs(value: string | number): string {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = String(hex || "").replace("#", "");
  const norm = clean.length === 3
    ? clean.split("").map((c) => `${c}${c}`).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  const r = parseInt(norm.slice(0, 2), 16);
  const g = parseInt(norm.slice(2, 4), 16);
  const b = parseInt(norm.slice(4, 6), 16);
  const rr = Number.isFinite(r) ? r : 77;
  const gg = Number.isFinite(g) ? g : 135;
  const bb = Number.isFinite(b) ? b : 254;
  return `rgba(${rr},${gg},${bb},${Math.max(0, Math.min(1, alpha))})`;
}

function isCoreValuationLabel(label: string): boolean {
  const l = String(label || "").toLowerCase();
  if (l.includes("asset") || l.includes("combined")) return true;
  if (l.includes("gold")) return true;
  if (l.includes("dollar") || l.includes("dxy") || l.includes("usd")) return true;
  if (l.includes("10y") || l.includes("bond") || l.includes("anleihe")) return true;
  return false;
}

function buildEvalFlagsMap(evaluation: EvaluationResponse | null): Map<number, EvalFlags> {
  const map = new Map<number, EvalFlags>();
  if (!evaluation?.series?.length) return map;

  for (const row of evaluation.series) {
    if (!isCoreValuationLabel(row.label)) continue;
    for (const pt of row.points ?? []) {
      const v10 = Number(pt.v10);
      const v20 = Number(pt.v20);
      if (!Number.isFinite(v10) || !Number.isFinite(v20)) continue;
      const ts = Number(toTs(pt.t));
      const current = map.get(ts) ?? { longOk: false, shortOk: false };
      if (v10 < VAL_LOW || v20 < VAL_LOW) current.longOk = true;
      if (v10 > VAL_HIGH || v20 > VAL_HIGH) current.shortOk = true;
      map.set(ts, current);
    }
  }
  return map;
}

function buildZoneRuntime(zones: PineZone[]): ZoneRuntime[] {
  return zones
    .map((z) => {
      const start = Number(toTs(String(z.start)));
      const end = Number(toTs(String(z.end)));
      const low = Number(z.low);
      const high = Number(z.high);
      if (![start, end, low, high].every(Number.isFinite)) return null;
      return {
        ...z,
        startTs: Math.min(start, end),
        endTs: Math.max(start, end),
        low: Math.min(low, high),
        high: Math.max(low, high),
      };
    })
    .filter((z): z is ZoneRuntime => z !== null);
}

function selectRenderedZones(
  candles: OhlcvPoint[],
  zones: ZoneRuntime[],
  showHistorical: boolean,
  focusNearest: boolean,
  renderAllActive: boolean,
): ZoneRuntime[] {
  if (!zones.length) return [];
  if (renderAllActive) {
    const visible = showHistorical
      ? zones.filter((zone) => zone.state !== "ARCHIVED")
      : zones.filter((zone) => zone.active);
    return [...visible].sort((left, right) => {
      if (left.active !== right.active) return left.active ? -1 : 1;
      if (left.kind !== right.kind) return left.kind === "demand" ? -1 : 1;
      if (left.strength !== right.strength) return left.strength === "strong" ? -1 : 1;
      return left.startIndex - right.startIndex;
    });
  }
  if (showHistorical && !focusNearest) {
    return [...zones].sort((left, right) => left.startIndex - right.startIndex);
  }

  const picked = pickRelevantZones(candles, zones);
  const ids = new Set<string>();
  const out: ZoneRuntime[] = [];
  const add = (zone: PineZone | null | undefined) => {
    if (!zone || ids.has(zone.id)) return;
    const match = zones.find((candidate) => candidate.id === zone.id);
    if (!match || !match.active) return;
    ids.add(match.id);
    out.push(match);
  };

  add(picked.demand);
  add(picked.supply);

  return out.sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    const leftTouched = left.state === "TOUCHED" ? 1 : 0;
    const rightTouched = right.state === "TOUCHED" ? 1 : 0;
    if (leftTouched !== rightTouched) return rightTouched - leftTouched;
    const leftMatured = left.maturedAtIndex != null ? 1 : 0;
    const rightMatured = right.maturedAtIndex != null ? 1 : 0;
    if (leftMatured !== rightMatured) return rightMatured - leftMatured;
    if (left.strength !== right.strength) return left.strength === "strong" ? -1 : 1;
    return (right.touchedAtIndex ?? -1) - (left.touchedAtIndex ?? -1);
  });
}

function buildSignalMarkers(
  bars: CandleBar[],
  evaluation: EvaluationResponse | null,
  zones: ZoneRuntime[],
): SignalOverlayMarker[] {
  if (!bars.length) return [];
  const evalFlags = buildEvalFlagsMap(evaluation);
  if (!evalFlags.size) return [];

  const markers: SignalOverlayMarker[] = [];
  let lastDirection = "";
  let lastLongTouchIndex = -Infinity;
  let lastShortTouchIndex = -Infinity;

  for (let i = 0; i < bars.length; i += 1) {
    const dayFlags = evalFlags.get(Number(bars[i].time)) ?? evalFlags.get(Number(toTs(`${dayKeyFromTs(Number(bars[i].time))}T00:00:00Z`)));
    const longZoneTouched = zones.some((zone) =>
      zone.kind === "demand"
      && zone.startIndex < i
      && i <= zone.endIndex
      && bars[i].high >= zone.low
      && bars[i].low <= zone.high
    );
    const shortZoneTouched = zones.some((zone) =>
      zone.kind === "supply"
      && zone.startIndex < i
      && i <= zone.endIndex
      && bars[i].high >= zone.low
      && bars[i].low <= zone.high
    );
    if (longZoneTouched) lastLongTouchIndex = i;
    if (shortZoneTouched) lastShortTouchIndex = i;

    const longActive = Boolean(dayFlags?.longOk) && lastLongTouchIndex >= (i - 3) && bars[i].close > bars[i].open;
    const shortActive = Boolean(dayFlags?.shortOk) && lastShortTouchIndex >= (i - 3) && bars[i].close < bars[i].open;

    if (shortActive && lastDirection !== "short") {
      markers.push({
        time: bars[i].time,
        direction: "SHORT",
      });
    }
    if (longActive && lastDirection !== "long") {
      markers.push({
        time: bars[i].time,
        direction: "LONG",
      });
    }

    lastDirection = longActive ? "long" : shortActive ? "short" : "";
  }

  return markers.slice(-120);
}

function normalizePayloadTimeframe(payload: TimeseriesResponse | null | undefined): CandleChartTimeframeKey | null {
  const tf = String(payload?.diagnostics?.timeframe || "").trim().toUpperCase();
  if (tf === "1H" || tf === "H1") return "1H";
  if (tf === "4H" || tf === "H4") return "4H";
  if (tf === "W") return "W";
  if (tf === "M") return "M";
  if (tf === "D" || !tf) return "D";
  return null;
}

function canServeTimeframeFromPayload(payload: TimeseriesResponse | null | undefined, timeframe: CandleChartTimeframeKey): boolean {
  const payloadTf = normalizePayloadTimeframe(payload);
  if (!payloadTf) return false;
  return payloadTf === timeframe;
}

function rowsForRequestedTimeframe(payload: TimeseriesResponse | null | undefined, _timeframe: CandleChartTimeframeKey): OhlcvPoint[] {
  const raw = payload?.ohlcv;
  const ordered = Array.isArray(raw)
    ? [...raw].sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
    : [];
  const strictRows = sanitizeOhlcvSeries(ordered);
  if (!strictRows.length) return [];
  return strictRows;
}

function inferBarStepSeconds(timeframe: CandleChartTimeframeKey, bars: CandleBar[]): number {
  const fallback = TF_SECONDS_FALLBACK[timeframe] ?? (24 * 60 * 60);
  if (bars.length < 4) return fallback;
  const diffs: number[] = [];
  const start = Math.max(1, bars.length - 64);
  for (let i = start; i < bars.length; i += 1) {
    const d = Number(bars[i].time) - Number(bars[i - 1].time);
    if (Number.isFinite(d) && d > 0) diffs.push(d);
  }
  if (!diffs.length) return fallback;
  diffs.sort((a, b) => a - b);
  const mid = Math.floor(diffs.length / 2);
  const median = diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
  return Number.isFinite(median) && median > 0 ? median : fallback;
}

function trimmedPriceRangeFromBars(bars: CandleBar[]): { minValue: number; maxValue: number } | null {
  if (!Array.isArray(bars) || bars.length < 5) return null;
  const prices: number[] = [];
  for (const bar of bars) {
    if (Number.isFinite(bar.open)) prices.push(bar.open);
    if (Number.isFinite(bar.high)) prices.push(bar.high);
    if (Number.isFinite(bar.low)) prices.push(bar.low);
    if (Number.isFinite(bar.close)) prices.push(bar.close);
  }
  if (prices.length < 20) return null;
  prices.sort((left, right) => left - right);
  const trim = Math.floor(prices.length * 0.01);
  const minIndex = Math.max(0, trim);
  const maxIndex = Math.max(minIndex + 1, prices.length - 1 - trim);
  const minValue = prices[minIndex] ?? NaN;
  const maxValue = prices[maxIndex] ?? NaN;
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return null;
  if (maxValue <= minValue) return null;
  return { minValue, maxValue };
}

function mergeTimeseriesPayload(
  prev: TimeseriesResponse | null | undefined,
  next: TimeseriesResponse,
): TimeseriesResponse {
  if (!prev) return next;
  if (String(prev.assetId || "") !== String(next.assetId || "")) return next;
  const prevBars = Array.isArray(prev.ohlcv) ? prev.ohlcv : [];
  const nextBars = Array.isArray(next.ohlcv) ? next.ohlcv : [];
  if (!nextBars.length) return prev;

  const MIN = MIN_SCREENER_OHLCV_BARS;

  const mergeLastBarIfSameEnd = (): TimeseriesResponse | null => {
    const lastNext = nextBars[nextBars.length - 1];
    const lastPrevT = String(prevBars[prevBars.length - 1]?.t ?? "");
    if (!lastNext || !lastPrevT || String(lastNext.t) !== lastPrevT) return null;
    const mergedBars = [...prevBars];
    mergedBars[mergedBars.length - 1] = lastNext;
    return { ...next, ohlcv: mergedBars };
  };

  // Never replace full history with a short/stub poll response (was causing single-candle charts).
  if (prevBars.length >= MIN && nextBars.length < prevBars.length) {
    return mergeLastBarIfSameEnd() ?? prev;
  }
  if (nextBars.length < prevBars.length) {
    return mergeLastBarIfSameEnd() ?? prev;
  }

  if (!prevBars.length) return next;

  if (prevBars.length !== nextBars.length) {
    return nextBars.length >= MIN ? next : prev;
  }

  const prevFirst = prevBars[0];
  const nextFirst = nextBars[0];
  if (String(prevFirst?.t || "") !== String(nextFirst?.t || "")) {
    return nextBars.length >= MIN ? next : prev;
  }

  const mergedBars = [...prevBars];
  mergedBars[mergedBars.length - 1] = nextBars[nextBars.length - 1]!;
  return {
    ...next,
    ohlcv: mergedBars,
  };
}

function CandleChartInner({
  payload,
  evaluation = null,
  seasonality = null,
  dataSource = "tradingview",
  title = "Asset",
  sourceLabel = "TradingView",
  goldThemeEnabled = false,
  themePrimary = "#4d87fe",
  isPanelLoading = false,
  isFullscreen = false,
  active = true,
  onToggleFullscreen,
  loopReplayTick = 0,
  onTimeRangeChange,
  onRecentSignalChange,
  onTimeframeChange,
  serverMarkers,
  screenerZones,
  toolbarHost = null,
  topLeftOverlay = null,
  toolbarOverlay = null,
  focusNearestZones = false,
  renderAllActiveZones = false,
  screenerToolbar = null,
  screenerAcceleratedFetch = false,
  hideBuiltinChartToolbar = false,
  suppressTitleOverlay = false,
  screenerCandlePalette,
  emphasizeZones = false,
  zoneVisibility,
  disableZoneDedupe = false,
  tradeOverlays = [],
  tradeMarkers = [],
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const activeRef = useRef(active);
  const updateOverlayRef = useRef<() => void>(() => {});
  const currentSliceOffsetRef = useRef(0);
  const pendingSignalsRef = useRef<SignalOverlayMarker[]>([]);
  const stageTimerRef = useRef<number | null>(null);
  const loopAnimFrameRef = useRef<number | null>(null);
  const dataLenRef = useRef(0);
  const currentBarsRef = useRef<CandleBar[]>([]);
  const [internalTf, setInternalTf] = useState<CandleChartTimeframeKey>("D");
  const [internalZones, setInternalZones] = useState(true);
  const [internalSignals, setInternalSignals] = useState(true);
  const timeframe = screenerToolbar?.timeframe ?? internalTf;
  const setTimeframe = (tf: CandleChartTimeframeKey) => {
    screenerToolbar?.onTimeframeChange(tf);
    if (!screenerToolbar) setInternalTf(tf);
  };
  const zonesEnabled = screenerToolbar?.zonesEnabled ?? internalZones;
  const setZonesEnabled = (value: boolean) => {
    screenerToolbar?.onZonesEnabledChange(value);
    if (!screenerToolbar) setInternalZones(value);
  };
  const signalsEnabled = screenerToolbar?.signalsEnabled ?? internalSignals;
  const setSignalsEnabled = (value: boolean) => {
    screenerToolbar?.onSignalsEnabledChange(value);
    if (!screenerToolbar) setInternalSignals(value);
  };
  const [zones, setZones] = useState<ZoneRect[]>([]);
  const [signalGlyphs, setSignalGlyphs] = useState<SignalGlyph[]>([]);
  const [executionGlyphs, setExecutionGlyphs] = useState<ExecutionGlyph[]>([]);
  const [tradeLineGlyphs, setTradeLineGlyphs] = useState<TradeLineGlyph[]>([]);
  const [continuousMode, setContinuousMode] = useState<ContinuousMode>("regular");
  const [tfPayloads, setTfPayloads] = useState<Record<string, TimeseriesResponse | null>>({});
  const [tfLoading, setTfLoading] = useState(false);
  const [noDataMessage, setNoDataMessage] = useState<string>("");
  const payloadSymbol = String(payload?.symbol ?? "").toUpperCase();
  const isFutureLikeAsset = /1!$|=F$|USOIL|NG1!|RB1!|ZW1!|ZC1!|ZS1!|ZL1!|KC1!|SB1!|CC1!|CT1!|OJ1!|LE1!|HE1!|ES1!|NQ1!|YM1!|RTY1!|FDAX1!/.test(payloadSymbol);
  const payloadAssetId = String(payload?.assetId ?? "").trim();
  const tfPayloadKey = `${payloadAssetId}:${dataSource}:${timeframe}:${continuousMode}`;
  const tfPayloadKeyRef = useRef(tfPayloadKey);
  tfPayloadKeyRef.current = tfPayloadKey;
  const latestPayloadRef = useRef(payload);
  latestPayloadRef.current = payload;
  const primaryAccent = goldThemeEnabled ? themePrimary : designTokens.chart.accent;
  const stickPalette = screenerCandlePalette ? candlestickColors(screenerCandlePalette) : null;
  const candleUpColor = stickPalette?.upColor ?? designTokens.chart.candleUp;
  const candleDownColor = stickPalette?.downColor ?? designTokens.chart.candleDown;
  const zonePalette = screenerCandlePalette ? zoneFillColors(screenerCandlePalette) : null;
  const activeBtnClass = goldThemeEnabled
    ? "border border-[#e2ca7a]/75 bg-[#e2ca7a]/24 text-[#fff2cf]"
    : "border border-[#d4af37]/70 bg-[rgba(212,175,55,0.14)] text-[#f2f2f2] shadow-[0_0_10px_rgba(212,175,55,0.12)]";
  const inactiveBtnClass = "border border-zinc-600/75 bg-[rgba(8,8,8,0.84)] text-zinc-300";
  const titleBorderColor = goldThemeEnabled ? "rgba(226,202,122,0.58)" : designTokens.stroke.accent;
  const titleTextColor = goldThemeEnabled ? "#fff3d1" : designTokens.text.secondary;
  const hasServerMarkers = Array.isArray(serverMarkers);
  const safeServerMarkers = Array.isArray(serverMarkers) ? serverMarkers : [];
  const hasServerZones = Array.isArray(screenerZones);
  const safeScreenerZones = Array.isArray(screenerZones) ? screenerZones : [];
  const safeTradeMarkers = useMemo(() => (Array.isArray(tradeMarkers) ? tradeMarkers : []), [tradeMarkers]);
  const showZones = zonesEnabled;
  const showSignals = signalsEnabled;
  const bothEnabled = zonesEnabled && signalsEnabled;
  const showHistoricalZones = zonesEnabled && !signalsEnabled;

  const prevFullBarsLenRef = useRef(0);
  const histRenderKeyRef = useRef("");
  const autoFitRenderKeyRef = useRef("");

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    canvas.width = Math.floor(width * devicePixelRatio);
    canvas.height = Math.floor(height * devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    for (const zone of zones) {
      context.save();
      context.globalAlpha = zone.opacity;
      context.fillStyle = zone.fill;
      context.fillRect(zone.left, zone.top, zone.width, zone.height);
      if (zone.label) {
        const labelPadX = 6;
        const labelHeight = 16;
        const labelWidth = Math.min(zone.width - 6, Math.max(54, (zone.label.length * 6.1) + 12));
        if (labelWidth > 24 && zone.height >= 18) {
          const labelTop = Math.max(zone.top + 4, 4);
          const labelLeft = Math.max(zone.left + 4, 4);
          context.globalAlpha = Math.min(1, zone.opacity + 0.14);
          context.fillStyle = zone.kind === "demand"
            ? "rgba(4, 34, 16, 0.90)"
            : "rgba(46, 10, 12, 0.90)";
          context.fillRect(labelLeft, labelTop, labelWidth, labelHeight);
          context.globalAlpha = 1;
          context.fillStyle = "#f4f8ff";
          context.font = "700 10px Inter, system-ui, sans-serif";
          context.textBaseline = "middle";
          context.fillText(zone.label, labelLeft + labelPadX, labelTop + (labelHeight / 2));
        }
      }
      context.restore();
    }

    for (const marker of signalGlyphs) {
      const tone = signalTone(marker.direction);
      const size = marker.direction === "LONG" ? 3.4 : 3.4;
      context.save();
      context.fillStyle = tone.color;
      context.shadowColor = "transparent";
      context.shadowBlur = 0;
      context.beginPath();
      if (marker.direction === "LONG") {
        context.moveTo(marker.x, marker.y);
        context.lineTo(marker.x - size, marker.y + size + 2);
        context.lineTo(marker.x + size, marker.y + size + 2);
      } else {
        context.moveTo(marker.x, marker.y);
        context.lineTo(marker.x - size, marker.y - (size + 2));
        context.lineTo(marker.x + size, marker.y - (size + 2));
      }
      context.closePath();
      context.fill();
      context.restore();
    }

    for (const marker of executionGlyphs) {
      context.save();
      const isEntry = marker.type === "ENTRY";
      const size = isEntry ? 2.4 : 2.0;
      const isLong = marker.direction === "LONG";
      const color = isLong ? "#00ff88" : "#ff3b3b";
      context.fillStyle = color;
      context.shadowColor = "transparent";
      context.shadowBlur = 0;
      const pointsUp = isEntry ? isLong : !isLong;
      context.beginPath();
      if (pointsUp) {
        context.moveTo(marker.x, marker.y - size);
        context.lineTo(marker.x - size, marker.y + size);
        context.lineTo(marker.x + size, marker.y + size);
      } else {
        context.moveTo(marker.x, marker.y + size);
        context.lineTo(marker.x - size, marker.y - size);
        context.lineTo(marker.x + size, marker.y - size);
      }
      context.closePath();
      context.fill();
      context.restore();
    }

    for (const line of tradeLineGlyphs) {
      context.save();
      context.strokeStyle = line.color;
      context.globalAlpha = 0.9;
      context.lineWidth = 1.25;
      if (line.dashed) context.setLineDash([5, 4]);
      context.beginPath();
      context.moveTo(line.x1, line.y);
      context.lineTo(line.x2, line.y);
      context.stroke();
      context.restore();
    }

  }, [executionGlyphs, signalGlyphs, tradeLineGlyphs, zones]);

  useEffect(() => {
    const p = latestPayloadRef.current;
    if (!payloadAssetId || !p) {
      setTfPayloads({});
      return;
    }
    if (continuousMode === "backadjusted") {
      const dKey = `${payloadAssetId}:${dataSource}:D:${continuousMode}`;
      setTfPayloads({ [dKey]: p });
    } else {
      setTfPayloads({});
    }
  }, [continuousMode, dataSource, payload?.updatedAt, payloadAssetId]);

  const screenerAccelInflightRef = useRef<string | null>(null);
  const tfFetchGenRef = useRef(0);

  useEffect(() => {
    const assetId = payloadAssetId;
    if (!assetId) return;
    if (timeframe === "D" && canServeTimeframeFromPayload(payload, "D")) {
      setTfLoading(false);
      return;
    }

    if (screenerAcceleratedFetch && screenerAccelInflightRef.current === tfPayloadKey) return;

    tfFetchGenRef.current += 1;
    const fetchGen = tfFetchGenRef.current;

    let cancelled = false;
    const cacheKey = screenerTimeseriesCacheKey(assetId, dataSource);
    if (screenerAcceleratedFetch) {
      screenerAccelInflightRef.current = tfPayloadKey;
      const mem = readScreenerTimeseriesMemory(cacheKey);
      if (mem && timeseriesHasValidOhlcv(mem)) {
        setTfPayloads((prev) => ({ ...prev, [tfPayloadKey]: mem }));
        setTfLoading(false);
      } else {
        setTfLoading(true);
      }
    } else {
      setTfLoading(true);
    }

    const finish = () => {
      if (!cancelled) setTfLoading(false);
    };

    const removeTfSlot = () => {
      setTfPayloads((prev) => {
        if (!(tfPayloadKey in prev)) return prev;
        const next = { ...prev };
        delete next[tfPayloadKey];
        return next;
      });
    };

    if (screenerAcceleratedFetch) {
      void fetchScreenerTimeseriesWithFallback({
        assetId,
        timeframe,
        preferredSource: dataSource,
        continuousMode,
      })
        .then((res) => {
          if (cancelled || fetchGen !== tfFetchGenRef.current) return;
          if (!res) {
            removeTfSlot();
            return;
          }
          writeScreenerTimeseriesMemory(
            screenerTimeseriesCacheKey(
              assetId,
              String(res.sourceUsed ?? dataSource).toLowerCase(),
            ),
            res,
          );
          setTfPayloads((prev) => ({ ...prev, [tfPayloadKey]: res }));
        })
        .catch((err) => {
          console.error("FETCH ERROR", "CandleChart fetchScreenerTimeseriesWithFallback", err);
          if (cancelled || fetchGen !== tfFetchGenRef.current) return;
          removeTfSlot();
        })
        .finally(() => {
          if (screenerAcceleratedFetch && screenerAccelInflightRef.current === tfPayloadKey) {
            screenerAccelInflightRef.current = null;
          }
          finish();
        });
    } else {
      GlobeApi.getTimeseries(assetId, timeframe, dataSource, continuousMode)
        .then((res) => {
          if (cancelled || fetchGen !== tfFetchGenRef.current) return;
          setTfPayloads((prev) => ({ ...prev, [tfPayloadKey]: res }));
        })
        .catch(() => {
          if (cancelled || fetchGen !== tfFetchGenRef.current) return;
          removeTfSlot();
        })
        .finally(finish);
    }

    return () => {
      cancelled = true;
      if (screenerAcceleratedFetch && screenerAccelInflightRef.current === tfPayloadKey) {
        screenerAccelInflightRef.current = null;
      }
    };
  }, [continuousMode, dataSource, payload, payload?.updatedAt, payloadAssetId, screenerAcceleratedFetch, tfPayloadKey, timeframe]);

  const activePayload = useMemo(() => {
    if (timeframe === "D" && canServeTimeframeFromPayload(payload, "D")) return payload;
    return tfPayloads[tfPayloadKey] ?? (canServeTimeframeFromPayload(payload, timeframe) ? payload : null);
  }, [payload, tfPayloadKey, tfPayloads, timeframe]);

  const allRowsForHist = useMemo(
    () => rowsForRequestedTimeframe(activePayload, timeframe),
    [activePayload, timeframe],
  );
  useEffect(() => {
    prevFullBarsLenRef.current = 0;
    histRenderKeyRef.current = "";
  }, [continuousMode, String(activePayload?.assetId ?? payload?.assetId ?? ""), timeframe]);

  const screenerBarCount = allRowsForHist.length;
  const screenerChartDataPending = Boolean(screenerAcceleratedFetch && tfLoading);

  const seasonalityAnalysis = useMemo(
    () => buildGlobeSeasonalityAnalysis(payload?.ohlcv ?? activePayload?.ohlcv ?? [], seasonality),
    [activePayload?.ohlcv, payload?.ohlcv, seasonality],
  );
  const seasonalityDirection = seasonalityAnalysis.stats.direction;
  const seasonalityHasEdge = seasonalityAnalysis.stats.interpretation !== "No seasonal edge";

  useEffect(() => {
    onTimeframeChange?.(timeframe);
  }, [onTimeframeChange, timeframe]);

  useEffect(() => {
    const assetId = String(payload?.assetId ?? "").trim();
    if (!active || !assetId) return;
    // Daily chart in regular mode is refreshed by App-level scheduler (5m).
    if (timeframe === "D" && continuousMode === "regular") return;
    const refreshMs = 5 * 60 * 1000;
    const timer = window.setInterval(() => {
      const keyAtTick = tfPayloadKeyRef.current;
      const apply = (res: TimeseriesResponse | null) => {
        if (tfPayloadKeyRef.current !== keyAtTick || !res) return;
        setTfPayloads((prev) => {
          if (tfPayloadKeyRef.current !== keyAtTick) return prev;
          const current = prev[keyAtTick] ?? (timeframe === "D" && continuousMode === "backadjusted" ? payload : null);
          const merged = mergeTimeseriesPayload(current, res);
          return { ...prev, [keyAtTick]: merged };
        });
      };
      if (screenerAcceleratedFetch) {
        void fetchScreenerTimeseriesWithFallback({
          assetId,
          timeframe,
          preferredSource: dataSource,
          continuousMode,
        }).then(apply);
        return;
      }
      GlobeApi.getTimeseries(assetId, timeframe, dataSource, continuousMode).then(apply).catch((err) => {
        console.error("FETCH ERROR", "CandleChart GlobeApi.getTimeseries refresh", err);
      });
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [active, continuousMode, dataSource, payload?.assetId, screenerAcceleratedFetch, tfPayloadKey, timeframe]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#b8af98",
        fontSize: 11,
        attributionLogo: false,
      },
      rightPriceScale: {
        borderColor: "rgba(226,202,122,0.24)",
        scaleMargins: { top: 0.04, bottom: 0.02 },
        minimumWidth: 62,
      },
      timeScale: {
        borderColor: "rgba(226,202,122,0.24)",
        secondsVisible: false,
        rightOffset: 10,
        barSpacing: 8.4,
        fixLeftEdge: false,
      },
      grid: {
        vertLines: { color: "rgba(0,0,0,0)" },
        horzLines: { color: "rgba(0,0,0,0)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(216,206,182,0.42)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "rgba(12,12,12,0.94)",
        },
        horzLine: {
          color: "rgba(216,206,182,0.42)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "rgba(12,12,12,0.94)",
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
      },
    });

    const cs = stickPalette ?? {
      upColor: candleUpColor,
      downColor: candleDownColor,
      wickUpColor: candleUpColor,
      wickDownColor: candleDownColor,
      borderUpColor: candleUpColor,
      borderDownColor: candleDownColor,
    };
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: cs.upColor,
      downColor: cs.downColor,
      wickUpColor: cs.wickUpColor,
      wickDownColor: cs.wickDownColor,
      borderUpColor: cs.borderUpColor,
      borderDownColor: cs.borderDownColor,
      borderVisible: true,
      priceLineVisible: false,
      lastValueVisible: true,
      autoscaleInfoProvider: (
        baseImplementation: () => { priceRange?: { minValue: number; maxValue: number }; margins?: { above: number; below: number } } | null,
      ) => {
        const base = baseImplementation();
        const trimmed = trimmedPriceRangeFromBars(currentBarsRef.current);
        if (!trimmed) return base;
        return {
          ...(base ?? {}),
          priceRange: {
            minValue: trimmed.minValue,
            maxValue: trimmed.maxValue,
          },
        };
      },
    });

    chartRef.current = chart;
    seriesRef.current = candles;

    const onRange = () => {
      if (!activeRef.current) return;
      updateOverlayRef.current();
      if (!onTimeRangeChange) return;
      const logical: LogicalRange | null = chart.timeScale().getVisibleLogicalRange();
      if (!logical) {
        onTimeRangeChange(null);
        return;
      }
      const dataLen = Math.max(1, dataLenRef.current);
      const lastIndex = dataLen - 1;
      const span = Math.max(20, Number(logical.to) - Number(logical.from));
      const rightOffset = Math.max(0, Number(logical.to) - lastIndex);
      onTimeRangeChange({
        visibleSpan: span,
        rightOffset,
      });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chart.timeScale().subscribeVisibleTimeRangeChange(onRange);
    const hostObserver = new ResizeObserver(() => {
      if (!activeRef.current) return;
      updateOverlayRef.current();
    });
    hostObserver.observe(host);
    const zoneRefreshTimer = window.setInterval(() => {
      if (!activeRef.current) return;
      updateOverlayRef.current();
    }, 120);

    return () => {
      if (stageTimerRef.current != null) {
        window.clearTimeout(stageTimerRef.current);
        stageTimerRef.current = null;
      }
      if (loopAnimFrameRef.current != null) {
        window.cancelAnimationFrame(loopAnimFrameRef.current);
        loopAnimFrameRef.current = null;
      }
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onRange);
      hostObserver.disconnect();
      window.clearInterval(zoneRefreshTimer);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setZones([]);
      setSignalGlyphs([]);
      setExecutionGlyphs([]);
      setTradeLineGlyphs([]);
    };
  }, [candleDownColor, candleUpColor, onTimeRangeChange, screenerCandlePalette]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const host = hostRef.current;
    if (!series || !chart || !host) return;
    const renderKey = `${String(activePayload?.assetId || payload?.assetId || "")}:${timeframe}:${continuousMode}`;
    if (histRenderKeyRef.current !== renderKey) {
      histRenderKeyRef.current = renderKey;
      prevFullBarsLenRef.current = 0;
      autoFitRenderKeyRef.current = "";
    }

    if (stageTimerRef.current != null) {
      window.clearTimeout(stageTimerRef.current);
      stageTimerRef.current = null;
    }
    if (loopAnimFrameRef.current != null) {
      window.cancelAnimationFrame(loopAnimFrameRef.current);
      loopAnimFrameRef.current = null;
    }

    const strictRows = [...allRowsForHist].sort(
      (a, b) => new Date(a.t).getTime() - new Date(b.t).getTime(),
    );

    const fullBars = strictRows
      .map((row) => ({
        time: toTs(row.t),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
      }))
      .filter((row): row is CandleBar => [row.open, row.high, row.low, row.close].every(Number.isFinite));

    if (fullBars.length < MIN_SCREENER_OHLCV_BARS) {
      console.error("INVALID DATA - TOO SHORT", fullBars.length);
      series.setData([]);
      currentBarsRef.current = [];
      dataLenRef.current = 0;
      currentSliceOffsetRef.current = 0;
      setZones([]);
      setSignalGlyphs([]);
      setExecutionGlyphs([]);
      setTradeLineGlyphs([]);
      pendingSignalsRef.current = [];
      onRecentSignalChange?.(null);
      setNoDataMessage("");
      return;
    }

    const computedZones = buildZoneRuntime(
      hasServerZones ? safeScreenerZones : buildSupplyDemandZones(strictRows, 1),
    );
    let enabledZones = showZones
      ? (disableZoneDedupe
        ? selectRenderedZones(strictRows, computedZones, showHistoricalZones, focusNearestZones, renderAllActiveZones)
        : dedupeNearDuplicateZones(
            selectRenderedZones(strictRows, computedZones, showHistoricalZones, focusNearestZones, renderAllActiveZones),
          ))
      : [];

    const applySignals = (bars: CandleBar[]) => {
      if (showSignals) {
        const markers = hasServerMarkers
          ? safeServerMarkers
            .map((marker) => ({
              time: toTs(marker.t),
              direction: marker.direction,
            } satisfies SignalOverlayMarker))
            .filter((marker) => bars.some((bar) => Number(bar.time) === Number(marker.time)))
          : buildSignalMarkers(
            bars,
            evaluation,
            enabledZones,
          );
        pendingSignalsRef.current = markers;
        if (onRecentSignalChange) {
          const minIdx = Math.max(0, bars.length - 4);
          const thresholdTs = Number(bars[minIdx]?.time ?? 0);
          const recent = markers.filter((m) => Number(m.time) >= thresholdTs);
          if (recent.length) {
            const latest = recent[recent.length - 1];
            const bearish = latest.direction === "SHORT";
            const trend = String(activePayload?.indicators?.trend ?? "Neutral");
            const trendBull = trend.toLowerCase().startsWith("bull");
            const markerTime = Number(latest.time);
            let ageBars = 0;
            for (let i = bars.length - 1; i >= 0; i -= 1) {
              if (Number(bars[i].time) === markerTime) {
                ageBars = bars.length - 1 - i;
                break;
              }
            }
            onRecentSignalChange({
              direction: bearish ? "bearish" : "bullish",
              ageBars,
              lines: bearish
                ? [
                    "Bearish supply retest with full valuation confirmation",
                    seasonalityDirection === "SHORT" && seasonalityHasEdge ? "Dominant seasonality is bearish" : "Seasonality filter not aligned",
                    trendBull ? "Momentum losing traction" : "Momentum already weakening",
                  ]
                : [
                    "Bullish demand retest with full valuation confirmation",
                    seasonalityDirection === "LONG" && seasonalityHasEdge ? "Dominant seasonality is bullish" : "Seasonality filter not aligned",
                    trendBull ? "Momentum trend supportive" : "Momentum stabilizing from pullback",
                  ],
            });
          } else {
            onRecentSignalChange(null);
          }
        }
      } else {
        pendingSignalsRef.current = [];
        setSignalGlyphs([]);
        onRecentSignalChange?.(null);
      }
    };

    const projectOverlay = (bars: CandleBar[], sliceOffset: number) => {
      const width = host.clientWidth;
      const heightLimit = host.clientHeight;
      const zoneLeftBound = PLOT_SAFE_MARGIN_LEFT;
      const rightM = screenerToolbar ? SCREENER_ZONE_MARGIN_RIGHT : PLOT_SAFE_MARGIN_RIGHT;
      const bottomM = screenerToolbar ? SCREENER_ZONE_MARGIN_BOTTOM : PLOT_SAFE_MARGIN_BOTTOM;
      const zoneRightBound = Math.max(zoneLeftBound + 24, width - rightM);
      const zoneTopBound = PLOT_SAFE_MARGIN_TOP;
      const zoneBottomBound = Math.max(zoneTopBound + 28, heightLimit - bottomM);
      const scale = chart.timeScale();
      const visibleLogical = scale.getVisibleLogicalRange();
      const latestGlobalIndex = sliceOffset + Math.max(0, bars.length - 1);

      const next: ZoneRect[] = [];
      const nextSignals: SignalGlyph[] = [];
      const nextExecution: ExecutionGlyph[] = [];
      const nextTradeLines: TradeLineGlyph[] = [];
      const zoneOriginBarIndex = (zone: ZoneRuntime) => {
        const raw =
          typeof zone.originIndex === "number"
            ? Math.min(zone.originIndex, zone.startIndex, zone.creationBarIndex)
            : Math.min(zone.startIndex, zone.creationBarIndex);
        return Math.max(0, raw);
      };

      const pushZone = (
        zone: ZoneRuntime,
        fill: string,
        opacity: number,
      ) => {
        const endIndex = Math.max(zone.startIndex, zone.active ? latestGlobalIndex : (zone.breakIndex ?? zone.endIndex));
        const logicalStart = zoneOriginBarIndex(zone) - sliceOffset;
        const logicalEnd = endIndex - sliceOffset + 1;
        if (!Number.isFinite(logicalStart) || !Number.isFinite(logicalEnd)) return;

        const visibleFrom = Number(visibleLogical?.from ?? logicalStart);
        const visibleTo = Number(visibleLogical?.to ?? logicalEnd);
        if (logicalEnd < visibleFrom || logicalStart > visibleTo) {
          return;
        }

        const yA = series.priceToCoordinate(zone.low);
        const yB = series.priceToCoordinate(zone.high);
        if (yA == null || yB == null) return;
        let top = Math.min(yA, yB);
        let height = Math.max(3, Math.abs(yA - yB));
        if (emphasizeZones) {
          const boosted = Math.max(16, height + 10);
          const center = top + (height / 2);
          top = center - (boosted / 2);
          height = boosted;
        }
        const bottom = top + height;
        if (bottom < zoneTopBound || top > zoneBottomBound) return;
        const clampedTop = Math.max(zoneTopBound, top);
        const clampedBottom = Math.min(zoneBottomBound, bottom);
        top = clampedTop;
        height = Math.max(1, clampedBottom - clampedTop);

        const renderStart = Math.max(logicalStart, visibleFrom);
        const renderEnd = Math.min(logicalEnd, visibleTo + 1);
        const startX = scale.logicalToCoordinate(renderStart as Logical);
        const endX = scale.logicalToCoordinate(renderEnd as Logical);
        if (startX == null || endX == null) return;
        const leftRaw = Math.min(startX, endX);
        const rightRaw = Math.max(startX, endX);
        if (!Number.isFinite(leftRaw) || !Number.isFinite(rightRaw)) return;
        const left = Math.max(zoneLeftBound, leftRaw);
        const right = Math.min(zoneRightBound, rightRaw + (emphasizeZones ? 72 : 0));
        const pixelWidth = right - left;
        if (!Number.isFinite(pixelWidth) || pixelWidth < 12) return;
        next.push({
          kind: zone.kind,
          strength: (zone.strength === "strong" ? "strong" : "normal") as "strong" | "normal",
          label: focusNearestZones
            ? `${zone.kind === "demand" ? "Demand" : "Supply"}`
            : undefined,
          left,
          width: pixelWidth,
          top,
          height,
          fill,
          opacity,
        });
      };

      const zoneSource = enabledZones.filter((zone) => {
        const showActive = zoneVisibility?.active ?? true;
        const showHistorical = zoneVisibility?.historical ?? true;
        const strongOnly = zoneVisibility?.strongOnly ?? false;
        const isHistorical = !zone.active || zone.historical || zone.broken || zone.state === "ARCHIVED";
        if (!showActive && zone.active && !isHistorical) return false;
        if (!showHistorical && isHistorical) return false;
        if (strongOnly && zone.strength !== "strong") return false;
        return showActive || showHistorical;
      });
      const fillBase = zonePalette ?? {
        demand: designTokens.zone.demand,
        demandStrong: designTokens.zone.demandStrong,
        supply: designTokens.zone.supply,
        supplyStrong: designTokens.zone.supplyStrong,
      };

      for (const z of zoneSource) {
        const fill = z.kind === "demand"
          ? (z.strength === "strong" ? fillBase.demandStrong : fillBase.demand)
          : (z.strength === "strong" ? fillBase.supplyStrong : fillBase.supply);
        const opacity =
          z.state === "TOUCHED" ? (zonePalette ? (emphasizeZones ? 0.92 : 0.82) : (emphasizeZones ? 0.97 : 0.92))
            : z.state === "MATURED" ? (zonePalette ? (emphasizeZones ? 0.82 : 0.70) : (emphasizeZones ? 0.86 : 0.78))
              : z.state === "ACTIVE" ? (zonePalette ? (emphasizeZones ? 0.72 : 0.58) : (emphasizeZones ? 0.78 : 0.68))
                : z.state === "BROKEN" ? (zonePalette ? 0.28 : 0.36)
                  : (zonePalette ? 0.16 : 0.20);
        pushZone(z, fill, opacity);
      }

      next.sort((left, right) => left.top - right.top);
      const stacked: ZoneRect[] = [];
      for (const zone of next) {
        let adjustedTop = zone.top;
        for (const prior of stacked) {
          const sameKind = prior.kind === zone.kind;
          const overlapTop = Math.max(prior.top, adjustedTop);
          const overlapBottom = Math.min(prior.top + prior.height, adjustedTop + zone.height);
          const overlapHeight = Math.max(0, overlapBottom - overlapTop);
          const overlapRatio = overlapHeight / Math.max(1, Math.min(prior.height, zone.height));
          if (!sameKind || overlapRatio < 0.72) continue;
          adjustedTop = Math.min(zoneBottomBound - zone.height, prior.top + 4);
        }
        stacked.push({ ...zone, top: adjustedTop });
      }

      for (const marker of pendingSignalsRef.current) {
        const localIndex = bars.findIndex((bar) => Number(bar.time) === Number(marker.time));
        if (localIndex < 0) continue;
        const logical = localIndex as Logical;
        const x = scale.logicalToCoordinate(logical);
        const bar = bars[localIndex];
        const baseY = marker.direction === "LONG"
          ? series.priceToCoordinate(bar.low)
          : series.priceToCoordinate(bar.high);
        if (x == null || baseY == null) continue;
        const y = marker.direction === "LONG" ? baseY + 8 : baseY - 8;
        nextSignals.push({ x, y, direction: marker.direction });
      }

      const barTimeToIndex = new Map<number, number>();
      const barDayToIndex = new Map<string, number>();
      for (let i = 0; i < bars.length; i += 1) {
        barTimeToIndex.set(Number(bars[i].time), i);
        const day = dayKeyFromTs(Number(bars[i].time));
        if (!barDayToIndex.has(day)) {
          barDayToIndex.set(day, i);
        }
      }
      for (const trade of tradeOverlays) {
        const entryTs = Number(toTs(trade.entryTime));
        const exitTs = Number(toTs(trade.exitTime));
        const entryBarIndex = barTimeToIndex.get(entryTs);
        const exitBarIndex = barTimeToIndex.get(exitTs);
        if (entryBarIndex == null || exitBarIndex == null) continue;
        const x1 = scale.logicalToCoordinate(entryBarIndex as Logical);
        const x2 = scale.logicalToCoordinate(exitBarIndex as Logical);
        if (x1 == null || x2 == null) continue;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const levels = [
          { value: Number(trade.stopLoss), color: "#ef4444", dashed: false, enabled: true },
          { value: Number(trade.takeProfit), color: "#22c55e", dashed: false, enabled: true },
          { value: Number(trade.breakEven), color: "#9ca3af", dashed: true, enabled: Boolean(trade.breakEvenTriggered) },
        ];
        for (const level of levels) {
          if (!level.enabled || !Number.isFinite(level.value)) continue;
          const y = series.priceToCoordinate(level.value);
          if (y == null || !Number.isFinite(y)) continue;
          nextTradeLines.push({
            x1: left,
            x2: right,
            y,
            color: level.color,
            dashed: level.dashed,
          });
        }
      }

      for (const marker of safeTradeMarkers) {
        const markerTs = Number(toTs(marker.time));
        const directIndex = barTimeToIndex.get(markerTs);
        const byDayIndex = barDayToIndex.get(String(marker.time).slice(0, 10));
        const barIndex = directIndex ?? byDayIndex;
        if (barIndex == null) continue;
        const x = scale.logicalToCoordinate(barIndex as Logical);
        const y = series.priceToCoordinate(Number(marker.price));
        if (x == null || y == null || !Number.isFinite(y)) continue;
        nextExecution.push({
          x,
          y,
          direction: marker.direction,
          type: marker.type,
        });
      }

      setZones(stacked);
      setSignalGlyphs(nextSignals);
      setExecutionGlyphs(nextExecution);
      setTradeLineGlyphs(nextTradeLines);
    };

    updateOverlayRef.current = () => projectOverlay(currentBarsRef.current, currentSliceOffsetRef.current);

    const projectionSpanBars =
      screenerToolbar && seasonality?.currentPattern
        ? seasonalityProjectionBarSpan(Number(seasonality.currentPattern.duration ?? 1), timeframe)
        : 0;

    const setVisibleWindow = (bars: CandleBar[]) => {
      const totalBars = bars.length;
      if (!Number.isFinite(totalBars) || totalBars <= 0) return;
      if (autoFitRenderKeyRef.current !== renderKey) {
        chart.timeScale().fitContent();
        autoFitRenderKeyRef.current = renderKey;
      }
    };

    const effectiveLoopReplayTick = active ? loopReplayTick : 0;

    if (fullBars.length) {
      setNoDataMessage("");
      if (effectiveLoopReplayTick > 0) {
        const baseBars = fullBars;
        const visibleSpan = Math.max(24, Math.min(220, TIMEFRAME_BARS[timeframe] ?? 100));
        // Loop animation should replay only the standard visible chart window,
        // not the full history.
        const animBars = baseBars.slice(Math.max(0, baseBars.length - visibleSpan));
        const animationOffset = Math.max(0, strictRows.length - animBars.length);
        const total = animBars.length;
        const startLen = Math.max(2, Math.min(total, 3));
        let shown = startLen;
        const startBars = animBars.slice(0, startLen);
        series.setData(startBars);
        currentBarsRef.current = startBars;
        currentSliceOffsetRef.current = animationOffset;
        dataLenRef.current = startBars.length;
        applySignals(startBars);
        setVisibleWindow(startBars);
        projectOverlay(startBars, currentSliceOffsetRef.current);

        const t0 = performance.now();
        const pointsPerSecond = 34;
        const animate = (now: number) => {
          const target = Math.max(
            startLen,
            Math.min(total, Math.floor(startLen + ((now - t0) / 1000) * pointsPerSecond)),
          );
          if (target !== shown) {
            shown = target;
            const nextBars = animBars.slice(0, shown);
            series.setData(nextBars);
            currentBarsRef.current = nextBars;
            currentSliceOffsetRef.current = animationOffset;
            dataLenRef.current = nextBars.length;
            if (shown % 4 === 0 || shown >= total) {
              applySignals(nextBars);
              setVisibleWindow(nextBars);
              projectOverlay(nextBars, currentSliceOffsetRef.current);
            }
          }
          if (shown < total) {
            loopAnimFrameRef.current = window.requestAnimationFrame(animate);
          } else {
            const doneBars = animBars;
            currentSliceOffsetRef.current = animationOffset;
            applySignals(doneBars);
            setVisibleWindow(doneBars);
            projectOverlay(doneBars, currentSliceOffsetRef.current);
            loopAnimFrameRef.current = null;
          }
        };
        loopAnimFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        const initialBars = fullBars;
        series.setData(initialBars);
        currentBarsRef.current = initialBars;
        currentSliceOffsetRef.current = 0;
        applySignals(initialBars);
        dataLenRef.current = initialBars.length;
        setVisibleWindow(initialBars);
        projectOverlay(initialBars, currentSliceOffsetRef.current);
      }
    } else {
      series.setData([]);
      onRecentSignalChange?.(null);
      dataLenRef.current = 0;
      currentBarsRef.current = [];
      currentSliceOffsetRef.current = 0;
      setZones([]);
      setSignalGlyphs([]);
      setExecutionGlyphs([]);
      setTradeLineGlyphs([]);
      pendingSignalsRef.current = [];
      onTimeRangeChange?.(null);
      if (tfLoading && screenerAcceleratedFetch) {
        setNoDataMessage("");
      } else {
        setNoDataMessage("Market data unavailable for this asset.");
      }
      return;
    }

    prevFullBarsLenRef.current = fullBars.length;
  }, [active, activePayload, allRowsForHist, candleDownColor, candleUpColor, disableZoneDedupe, emphasizeZones, evaluation, focusNearestZones, hasServerMarkers, hasServerZones, loopReplayTick, onRecentSignalChange, onTimeRangeChange, renderAllActiveZones, safeScreenerZones, safeTradeMarkers, screenerAcceleratedFetch, screenerCandlePalette, screenerToolbar, seasonality, seasonalityAnalysis, seasonalityDirection, seasonalityHasEdge, safeServerMarkers, showHistoricalZones, showSignals, showZones, tfLoading, timeframe, tradeOverlays, zoneVisibility]);

  const timeseries = activePayload;

  const awaitingChartData = Boolean(isPanelLoading || tfLoading || screenerChartDataPending);
  const sortedForCount = Array.isArray(timeseries?.ohlcv)
    ? [...timeseries.ohlcv].sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
    : [];
  const ohlcvCount = sanitizeOhlcvSeries(sortedForCount).length;
  const showUnavailableState = !awaitingChartData && (!timeseries || ohlcvCount < MIN_SCREENER_OHLCV_BARS);

  const toolbarNode = hideBuiltinChartToolbar ? null : (
    <div className="flex justify-end">
      <div className="scroll-thin flex min-w-0 flex-wrap items-center justify-end gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap px-0 py-0">
        {toolbarOverlay ? (
          <div className="flex shrink-0 items-center justify-end gap-1">
            {toolbarOverlay}
          </div>
        ) : null}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setZonesEnabled(!zonesEnabled)}
            className={`rounded px-1.5 py-[2px] text-[9px] font-semibold transition ${
              zonesEnabled
                ? activeBtnClass
                : inactiveBtnClass
            }`}
          >
            Zones
          </button>
          <button
            type="button"
            onClick={() => setSignalsEnabled(!signalsEnabled)}
            className={`rounded px-1.5 py-[2px] text-[9px] font-semibold transition ${
              signalsEnabled
                ? activeBtnClass
                : inactiveBtnClass
            }`}
          >
            Signals
          </button>
          <span
            className={`rounded px-1.5 py-[2px] text-[9px] font-semibold transition ${
              bothEnabled
                ? activeBtnClass
                : inactiveBtnClass
            }`}
            aria-label="Both derived state"
            title="Derived from Zones + Signals"
          >
            Both
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {(["M", "W", "D", "4H", "1H"] as CandleChartTimeframeKey[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`rounded px-1 py-[2px] text-[9px] font-semibold transition ${
                timeframe === tf
                  ? activeBtnClass
                  : inactiveBtnClass
              }`}
            >
              {tf}
            </button>
          ))}
          {tfLoading && (
            <span className="ml-1 text-[9px] font-semibold text-slate-300">...</span>
          )}
        </div>

        {isFutureLikeAsset && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setContinuousMode("regular")}
              className={`rounded px-1.5 py-[2px] text-[9px] font-semibold transition ${
                continuousMode === "regular"
                  ? activeBtnClass
                  : inactiveBtnClass
              }`}
            >
              Regular
            </button>
            <button
              type="button"
              onClick={() => setContinuousMode("backadjusted")}
              className={`rounded px-1.5 py-[2px] text-[9px] font-semibold transition ${
                continuousMode === "backadjusted"
                  ? activeBtnClass
                  : inactiveBtnClass
              }`}
            >
              Back-adj
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative h-full w-full overflow-hidden">

      {suppressTitleOverlay ? null : topLeftOverlay ? (
        <div className="absolute left-2.5 top-2 z-[6] max-w-[calc(100%-220px)]">
          {topLeftOverlay}
        </div>
      ) : (
        <div
          className="pointer-events-none absolute left-2.5 top-2 z-[4] inline-flex items-center gap-2 rounded-md border bg-transparent px-2 py-1 text-[10px] font-semibold"
          style={{
            borderColor: titleBorderColor,
            color: titleTextColor,
          }}
        >
          <span>{title}</span>
        </div>
      )}

      {toolbarHost ? createPortal(toolbarNode, toolbarHost) : (
        <div
          className="absolute right-3 top-1.5 z-[4] flex justify-end"
          style={{ maxWidth: "calc(100% - 240px)" }}
        >
          {toolbarNode}
        </div>
      )}

      {onToggleFullscreen ? (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className={`ivq-chart-fullscreen-btn absolute right-3 top-2 z-[5] ${isFullscreen ? "is-visible" : ""}`}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={14} strokeWidth={1.9} /> : <Maximize2 size={14} strokeWidth={1.9} />}
        </button>
      ) : null}

      <div className={`absolute inset-x-0 bottom-0 ${toolbarHost || hideBuiltinChartToolbar ? "top-0" : "top-11"}`}>
        <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 z-[1] h-full w-full" />
        <div
          ref={hostRef}
          className="relative z-[2] h-full w-full"
          title={suppressTitleOverlay ? undefined : (sourceLabel ? `${title} - ${sourceLabel}` : title)}
        />
      </div>
      {(isPanelLoading || tfLoading || screenerChartDataPending) ? (
        <div className="pointer-events-none absolute inset-0 z-[6] grid place-items-center bg-[rgba(0,0,0,0.42)]">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2"
            style={{
              borderColor: hexToRgba(primaryAccent, 0.25),
              borderTopColor: primaryAccent,
            }}
          />
        </div>
      ) : null}
      {(showUnavailableState || noDataMessage) ? (
        <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center bg-[rgba(0,0,0,0.58)] px-3 text-center text-[11px] font-medium text-zinc-300">
          {noDataMessage || "Market data unavailable for this source window."}
        </div>
      ) : null}
    </div>
  );
}

export default function CandleChart(props: Props) {
  return (
    <ChartErrorBoundary>
      <CandleChartInner {...props} />
    </ChartErrorBoundary>
  );
}
