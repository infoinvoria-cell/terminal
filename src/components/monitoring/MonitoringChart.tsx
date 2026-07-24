"use client";

import { ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from "lightweight-charts";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import TradeSvgOverlay, {
  syncTradeSvgOverlayDom,
  TRADE_SVG_OVERLAY_CLASS,
  type SvgLineLabel,
  type SvgLineSegment,
  type SvgTradeTriangle,
  type SvgTradeZone,
} from "@/components/monitoring/TradeSvgOverlay";
import { getVisibleManualLevels } from "@/components/monitoring/TradeLevelOverlay";
import { MONITORING_CAPITALIFE_TEXT_LOGO, MONITORING_CHART_BACKGROUND } from "@/lib/monitoring/monitoringChartTheme";
import { clampWatermarkOpacity, type MonitoringUiPrefs } from "@/lib/monitoring/monitoringUiPrefs";
import {
  buildLivePriceAxisLabel,
  candleCloseTone,
  formatAxisPrice,
  PRICE_AXIS_COUNTDOWN_COLOR,
  PRICE_AXIS_TEXT_COLOR,
  priceAxisBackgroundColor,
  priceAxisGuideStrokeColor,
  priceAxisLabelBorderColor,
  priceAxisLabelShadowColor,
  type CandleCloseTone,
} from "@/lib/monitoring/candleCloseCountdown";
import { monitoringFeatureFlags } from "@/config/monitoringFeatureFlags";
import {
  buildTradeLifecycleFromRows,
  normalizeLifecycleTradeFromRow,
  type TradeLifecycleSource,
} from "@/lib/monitoring/trades/tradeLifecycleModel";
import { buildTradeLifecycleVisuals, type TradeLifecycleVisualMode } from "@/lib/monitoring/trades/tradeLifecycleVisuals";
import {
  registerMonitoringAnimationFrame,
  registerMonitoringChart,
  registerMonitoringResizeObserver,
  registerMonitoringSubscription,
} from "@/lib/monitoring/runtime/monitoringRuntimeController";
import type { ManualTradeLevels } from "@/lib/trading/types";

type Variant = "large" | "compact";

type BarRow = {
  time: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
};

type RawSignalRow = {
  time: string | null;
  type?: string;
  price?: number | null;
  entry_price?: number | null;
  close?: number | null;
  long_entry?: boolean;
  short_entry?: boolean;
  long_exit?: boolean;
  short_exit?: boolean;
};

type ExitReason =
  | "take_profit"
  | "stop_loss"
  | "manual_close"
  | "strategy_close"
  | "opposite_signal"
  | "partial_close"
  | "unknown";

type TradeRow = {
  tradeId?: string | null;
  direction: "long" | "short";
  entryTime: string;
  exitTime?: string | null;
  entry: number;
  sl?: number | null;
  tp?: number | null;
  exit?: number | null;
  exitReason?: string | undefined;
  status?: string | null;
  isOpen?: boolean | null;
  source?: string | null;
  [key: string]: unknown;
};

const TRADE_STATUS_KEYS = ["status", "tradeStatus", "positionStatus"];

type BoxRow = {
  type: "demand" | "supply";
  strong: boolean;
  start_time: string | null;
  end_time: string | null;
  low: number | null;
  high: number | null;
  active: boolean;
};

type OverlayTrade = {
  id: string;
  direction: "long" | "short";
  status: "open" | "closed" | "pending_signal";
  entryTime: Time;
  entryIndex: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  exitPrice?: number | null;
  exitTime?: Time;
  exitIndex?: number;
  exitReason?: ExitReason;
};

type HorizontalLineSegment = {
  id: string;
  type: "entry" | "sl" | "tp";
  startTime: Time;
  endTime: Time;
  value: number;
  color: string;
};

type TradeOverlay = {
  trades: OverlayTrade[];
  lineSegments: HorizontalLineSegment[];
  futureBars: Array<WhitespaceData<Time>>;
  projectedEndTime: Time | null;
};

type OpenTradeHitTarget = {
  tradeId: string;
  candleX: number;
  candleYMin: number;
  candleYMax: number;
  markerX: number;
  markerY: number;
};

type AutoscaleDebugState = {
  tradeLevelMin: number | null;
  tradeLevelMax: number | null;
  autoscaleLow: number | null;
  autoscaleHigh: number | null;
  wasTradeLevelClampedOrIgnored: boolean;
};

const DEFAULT_TRADE_ENTRY_COLOR = "#F59E0B";
const DEFAULT_TRADE_SL_COLOR = "#FF3B30";
const DEFAULT_TRADE_TP_COLOR = "#22C55E";
const TRADE_ZONE_TP_FILL = "rgba(34, 197, 94, 0.2)";
const TRADE_ZONE_SL_FILL = "rgba(255, 59, 48, 0.2)";

function signedLegDelta(entryPrice: number, legPrice: number, direction: "long" | "short"): number {
  return direction === "long" ? legPrice - entryPrice : entryPrice - legPrice;
}

function formatSignedDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${Math.abs(delta).toFixed(2)}`;
}

function formatSignedPercent(entryPrice: number, delta: number): string {
  if (entryPrice <= 0) return "--";
  const pct = (delta / entryPrice) * 100;
  const sign = pct >= 0 ? "+" : "-";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

function appendTradeSelectionOverlay(
  trade: OverlayTrade,
  segmentCoordById: Map<string, { x1: number; x2: number; y: number }>,
  width: number,
  zones: SvgTradeZone[],
  labels: SvgLineLabel[],
  colors: { entry: string; sl: string; tp: string },
  maxY = Infinity,
  compactZoneX2?: number,
): void {
  const entrySeg = segmentCoordById.get(`${trade.id}-entry`);
  const slSeg = segmentCoordById.get(`${trade.id}-sl`);
  const tpSeg = segmentCoordById.get(`${trade.id}-tp`);
  if (!entrySeg) return;

  const zoneX1 = entrySeg.x1;
  // compactZoneX2: cap background zone to current candle + ~1 bar (entry/SL/TP lines still extend to full x2)
  const zoneX2 = compactZoneX2 != null
    ? Math.min(entrySeg.x2, Math.max(entrySeg.x1 + 4, compactZoneX2))
    : entrySeg.x2;
  const labelX = Math.min(width - 8, entrySeg.x2 + 6);
  const entryY = entrySeg.y;

  const hasTpSl = (trade.takeProfit != null && trade.takeProfit > 0)
    || (trade.stopLoss != null && trade.stopLoss > 0);
  labels.push({
    id: `${trade.id}-entry-label`,
    type: "entry",
    x: labelX,
    y: entryY,
    color: colors.entry,
    lines: [`ENTRY ${trade.entryPrice.toFixed(2)}`],
  });

  if (tpSeg && trade.takeProfit != null && trade.takeProfit > 0) {
    const tpDelta = signedLegDelta(trade.entryPrice, trade.takeProfit, trade.direction);
    labels.push({
      id: `${trade.id}-tp-label`,
      type: "tp",
      x: labelX,
      y: tpSeg.y,
      color: colors.tp,
      lines: [
        `TP ${trade.takeProfit.toFixed(2)}`,
        `${formatSignedDelta(tpDelta)} / ${formatSignedPercent(trade.entryPrice, tpDelta)}`,
      ],
    });
    zones.push({
      id: `${trade.id}-tp-zone`,
      x1: zoneX1,
      x2: zoneX2,
      yTop: Math.min(entryY, tpSeg.y),
      yBottom: Math.min(maxY, Math.max(entryY, tpSeg.y)),
      fill: TRADE_ZONE_TP_FILL,
    });
  }

  if (slSeg && trade.stopLoss != null && trade.stopLoss > 0) {
    const slDelta = signedLegDelta(trade.entryPrice, trade.stopLoss, trade.direction);
    labels.push({
      id: `${trade.id}-sl-label`,
      type: "sl",
      x: labelX,
      y: slSeg.y,
      color: colors.sl,
      lines: [
        `SL ${trade.stopLoss.toFixed(2)}`,
        `${formatSignedDelta(slDelta)} / ${formatSignedPercent(trade.entryPrice, slDelta)}`,
      ],
    });
    zones.push({
      id: `${trade.id}-sl-zone`,
      x1: zoneX1,
      x2: zoneX2,
      yTop: Math.min(entryY, slSeg.y),
      yBottom: Math.min(maxY, Math.max(entryY, slSeg.y)),
      fill: TRADE_ZONE_SL_FILL,
    });
  }
}

function isPointerInFullscreenHoverZone(
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): boolean {
  if (width <= 0 || height <= 0) return false;
  const centerX = width * 0.5;
  const zoneLeft = centerX - FULLSCREEN_HOVER_ZONE_WIDTH * 0.5;
  const zoneRight = centerX + FULLSCREEN_HOVER_ZONE_WIDTH * 0.5;
  const zoneBottom = height;
  const zoneTop = Math.max(0, height - FULLSCREEN_HOVER_ZONE_HEIGHT);
  return offsetX >= zoneLeft && offsetX <= zoneRight && offsetY >= zoneTop && offsetY <= zoneBottom;
}

export type MonitoringChartData = {
  displaySymbol: string;
  displayName: string;
  tvSymbol?: string;
  badge?: string | null;
  bars: BarRow[];
  signals: RawSignalRow[];
  trades?: TradeRow[];
  boxes: BoxRow[];
  variant?: Variant;
  timeframe?: string | null;
};

type MonitoringChartProps = {
  data: MonitoringChartData;
  maxBars?: number;
  initialVisibleBars?: number;
  allDashboardMode?: boolean;
  showFullscreenControl?: boolean;
  isFullscreen?: boolean;
  onFullscreenRequest?: () => void;
  manualLevels?: ManualTradeLevels | null;
  showManualLevels?: boolean;
  onManualLevelsChange?: (levels: ManualTradeLevels) => void;
  selectedTradeId?: string | null;
  uiPrefs?: MonitoringUiPrefs;
  liveChartAutoView?: boolean;
  // Trend EMA overlays (e.g. Indizes Macro Valuation Alpha V1: Fast EMA 200, Slow EMA 280).
  // Computed from the chart candles; omitted (undefined) for strategies that don't use them.
  trendEmas?: Array<{ key: string; len: number; color: string }>;
};

const DEFAULT_MAX_BARS = 120;
const VISIBLE_BARS = 24;
const COMPACT_VISIBLE_BARS = 10;
const DASHBOARD_VISIBLE_BARS = 20;
const RIGHT_OFFSET = 6;
const COMPACT_RIGHT_OFFSET = 1;
const DASHBOARD_RIGHT_OFFSET = 3;
const RIGHT_EDGE_THRESHOLD = 2;
const HORIZONTAL_WHEEL_BAR_SHIFT = 0.75;
/** Set true only for DOM/CSS verification in browser. */
const DEBUG_FORCE_GO_TO_LATEST = false;
const FULLSCREEN_HOVER_ZONE_WIDTH = 160;
const FULLSCREEN_HOVER_ZONE_HEIGHT = 90;

type VisibleLogicalRange = {
  from: number;
  to: number;
};

function isAtRightEdge(range: VisibleLogicalRange | null, totalBars: number, rightOffset: number): boolean {
  if (!range || totalBars <= 0) return true;
  return range.to >= totalBars + rightOffset - RIGHT_EDGE_THRESHOLD;
}

function latestVisibleRange(totalBars: number, visibleBars: number, rightOffset: number): VisibleLogicalRange {
  return {
    from: Math.max(0, totalBars - visibleBars),
    to: totalBars + rightOffset,
  };
}

/** Initial Y range from candles + trade levels (used once before disabling autoScale for free vertical pan). */
function computeInitialPriceRange(
  candles: Array<{ low: number; high: number }>,
  extraPrices: number[] = [],
): { from: number; to: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const candle of candles) {
    const low = Number(candle.low);
    const high = Number(candle.high);
    if (Number.isFinite(low)) min = Math.min(min, low);
    if (Number.isFinite(high)) max = Math.max(max, high);
  }
  for (const price of extraPrices) {
    if (Number.isFinite(price) && price > 0) {
      min = Math.min(min, price);
      max = Math.max(max, price);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
  const span = Math.max(max - min, Math.abs(max) * 0.001, 1e-6);
  const pad = span * 0.08;
  return { from: min - pad, to: max + pad };
}

const ENTRY_TRIANGLE_PIXEL_OFFSET = 8;
const DASHBOARD_ENTRY_TRIANGLE_PIXEL_OFFSET = 5;
const OPEN_TRADE_FUTURE_BARS = 5;
const DASHBOARD_MARKER_SIZE = 4.5;
const DEFAULT_MARKER_SIZE = 6.5;
const PRICE_AXIS_LABEL_HEIGHT = 28;
const COMPACT_PRICE_AXIS_LABEL_HEIGHT = 22;
const DASHBOARD_PRICE_AXIS_LABEL_HEIGHT = 16;
const PRICE_AXIS_FALLBACK_WIDTH = 54;
const COMPACT_PRICE_AXIS_FALLBACK_WIDTH = 42;
const DASHBOARD_PRICE_AXIS_FALLBACK_WIDTH = 30;
const VISIBLE_TRADE_BUFFER_BARS = 8;

type CurrentPriceGuide = {
  x1: number;
  x2: number;
  y: number;
  stroke: string;
};

function monitoringPriceScaleMargins(isDashboard: boolean, isCompact: boolean): { top: number; bottom: number } {
  if (isDashboard) return { top: 0.08, bottom: 0.08 };
  if (isCompact) return { top: 0.06, bottom: 0.06 };
  return { top: 0.08, bottom: 0.05 };
}

const MONITORING_CHART_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

function monitoringAxisFontSize(isDashboard: boolean, isCompact: boolean, isIntraday = false): number {
  if (isDashboard) return 6;
  if (isCompact) return 8;
  if (isIntraday) return 9;
  return 10;
}

function monitoringAxisTextColor(isDashboard: boolean, isCompact: boolean): string {
  if (isDashboard) return "rgba(210, 218, 230, 0.58)";
  if (isCompact) return "rgba(220, 228, 240, 0.62)";
  return "rgba(228, 236, 248, 0.68)";
}

function isForexDisplaySymbol(displaySymbol: string | null | undefined): boolean {
  const key = String(displaySymbol || "").toUpperCase();
  return key.includes("GBPUSD") || key.includes("EURUSD");
}

/** Europe/Berlin display formatters for intraday charts. The candle data stays in
 *  UTC internally (UTCTimestamp seconds); only the displayed X-axis tick labels and
 *  the crosshair time label are converted to Berlin local time (CET/CEST). This makes
 *  a 07:00 UTC bar read as 09:00 in summer — matching the DAX session window — without
 *  shifting any OHLC value or applying a double offset. Non-intraday (Agrar/daily)
 *  charts never use these and keep the lightweight-charts defaults. */
const BERLIN_TZ = "Europe/Berlin";
const berlinTickTimeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const berlinTickDayFmt = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN_TZ, day: "2-digit", month: "short" });
const berlinTickMonthFmt = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN_TZ, month: "short", year: "numeric" });
const berlinCrosshairFmt = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN_TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** lightweight-charts TickMarkType: 0=Year, 1=Month, 2=DayOfMonth, 3=Time, 4=TimeWithSeconds. */
function berlinIntradayTickMarkFormatter(time: Time, tickMarkType: number): string {
  if (typeof time !== "number") return String(time);
  const d = new Date(time * 1000);
  if (tickMarkType <= 1) return berlinTickMonthFmt.format(d);
  if (tickMarkType === 2) return berlinTickDayFmt.format(d);
  return berlinTickTimeFmt.format(d);
}

function berlinIntradayTimeFormatter(time: Time): string {
  if (typeof time !== "number") return String(time);
  return berlinCrosshairFmt.format(new Date(time * 1000));
}

/** Returns true if the date falls in Central European Summer Time (UTC+2).
 *  CEST runs from the last Sunday of March to the last Sunday of October. */
function isCESTDate(date: Date): boolean {
  const y = date.getUTCFullYear();
  // Last Sunday of March
  const marchlast = new Date(Date.UTC(y, 3, 0));
  marchlast.setUTCDate(marchlast.getUTCDate() - marchlast.getUTCDay());
  // Last Sunday of October
  const octlast = new Date(Date.UTC(y, 10, 0));
  octlast.setUTCDate(octlast.getUTCDate() - octlast.getUTCDay());
  return date >= marchlast && date < octlast;
}

/** Returns true if the UTC time string falls within the Europe/Berlin
 *  trading session for DAX 1H: 08:00–12:00 inclusive (Berlin local time). */
function isDaxSessionTime(utcTimeStr: string): boolean {
  const date = new Date(utcTimeStr);
  if (isNaN(date.getTime())) return true; // don't filter on parse failure
  const offset = isCESTDate(date) ? 2 : 1;
  const berlinHour = (date.getUTCHours() + offset) % 24;
  return berlinHour >= 8 && berlinHour <= 12;
}

/** Returns true if this chart is the DAX 1H strategy that has a session
 *  restriction of Europe/Berlin 08:00–12:00. */
function isDax1HStrategy(
  displaySymbol: string | null | undefined,
  timeframe: string | null | undefined,
  tvSymbol?: string | null | undefined,
): boolean {
  const tf = String(timeframe || "").toUpperCase();
  if (tf !== "1H") return false;
  // Prefer tvSymbol (e.g. "OANDA:DE30EUR") set by MonitoringChartCard from item.tv
  if (tvSymbol) {
    const tv = String(tvSymbol).toUpperCase();
    return tv.includes("DE30EUR");
  }
  // Fallback: match the display label used in INTRADAY_MT_ASSETS (e.g. "DAX40 1H", "DE30EUR")
  const sym = String(displaySymbol || "").toUpperCase();
  return sym.includes("DE30EUR") || sym.includes("DAX40") || sym.includes("DE30");
}

function monitoringRightPriceScaleMinWidth(
  isDashboard: boolean,
  isCompact: boolean,
  isIntraday: boolean,
  isForex: boolean,
): number {
  if (isDashboard) return 36;
  if (isIntraday && isForex) return 56;  // "1,3234" = 6 chars; 56px is tight but readable at 9px
  if (isIntraday) return 62;             // "25.031,80" = 9 chars; 62px matches auto-size at 9px font
  if (isCompact) return 48;
  return 52;
}

const MINI_MODE_MAX_VISIBLE_TRADES = 50;

type PriceAxisLabelState = {
  top: number;
  left: number;
  width: number;
  priceText: string;
  countdownText: string | null;
  tone: CandleCloseTone;
  backgroundColor: string;
};

function round1(value: number | undefined | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.NaN;
  return Math.round(n * 10) / 10;
}

function eqNum(a: number | undefined | null, b: number | undefined | null): boolean {
  return round1(a) === round1(b);
}

function equalSegments(a: SvgLineSegment[], b: SvgLineSegment[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id
      || left.type !== right.type
      || left.color !== right.color
      || !eqNum(left.x1, right.x1)
      || !eqNum(left.x2, right.x2)
      || !eqNum(left.y, right.y)
    ) return false;
  }
  return true;
}

function equalTriangles(a: SvgTradeTriangle[], b: SvgTradeTriangle[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id
      || left.kind !== right.kind
      || left.color !== right.color
      || left.direction !== right.direction
      || !eqNum(left.x, right.x)
      || !eqNum(left.y, right.y)
      || !eqNum(left.size, right.size)
    ) return false;
  }
  return true;
}

function equalOpenTargets(a: OpenTradeHitTarget[], b: OpenTradeHitTarget[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.tradeId !== right.tradeId
      || !eqNum(left.candleX, right.candleX)
      || !eqNum(left.candleYMin, right.candleYMin)
      || !eqNum(left.candleYMax, right.candleYMax)
      || !eqNum(left.markerX, right.markerX)
      || !eqNum(left.markerY, right.markerY)
    ) return false;
  }
  return true;
}

function equalZones(a: SvgTradeZone[], b: SvgTradeZone[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id
      || left.fill !== right.fill
      || !eqNum(left.x1, right.x1)
      || !eqNum(left.x2, right.x2)
      || !eqNum(left.yTop, right.yTop)
      || !eqNum(left.yBottom, right.yBottom)
    ) return false;
  }
  return true;
}

function equalLabels(a: SvgLineLabel[], b: SvgLineLabel[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id
      || left.type !== right.type
      || left.color !== right.color
      || !eqNum(left.x, right.x)
      || !eqNum(left.y, right.y)
      || left.lines.join("|") !== right.lines.join("|")
    ) return false;
  }
  return true;
}

function equalGuide(a: CurrentPriceGuide | null, b: CurrentPriceGuide | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return eqNum(a.x1, b.x1) && eqNum(a.x2, b.x2) && eqNum(a.y, b.y) && a.stroke === b.stroke;
}

function dayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function chartTimeKey(time: Time): string {
  return String(time);
}

function isIntradayChartTf(timeframe: string | null | undefined): boolean {
  const tf = String(timeframe || "D").trim().toUpperCase();
  return tf !== "D" && tf !== "1D" && tf !== "W" && tf !== "M";
}

function normalizeTradeIso(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  const cleaned = text.replace(/ZZ$/i, "Z");
  if (/^\d{4}-\d{2}-\d{2}$/u.test(cleaned)) return `${cleaned}T00:00:00Z`;
  if (cleaned.includes("T")) return cleaned.endsWith("Z") ? cleaned : `${cleaned}Z`;
  return `${cleaned}Z`;
}

function resolveTradeTimeToCandle(
  raw: string | null | undefined,
  candleTimes: Time[],
  isIntraday: boolean,
): Time | null {
  if (!raw) return null;
  if (isIntraday) {
    const iso = normalizeTradeIso(String(raw));
    if (!iso) return null;
    const tsMs = new Date(iso).getTime();
    if (!Number.isFinite(tsMs)) return null;
    const utcSec = Math.floor(tsMs / 1000);
    let best: Time | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const candleTime of candleTimes) {
      if (typeof candleTime !== "number") continue;
      const diff = Math.abs(candleTime - utcSec);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = candleTime;
      }
    }
    // Allow nearest bar within ~3h when timestamps differ slightly (hybrid/engine exports).
    if (best != null && bestDiff <= 10_800) return best;
    return null;
  }
  const day = dayKey(raw);
  if (!day) return null;
  // First try exact match
  const exact = candleTimes.find((candleTime) => {
    const key = chartTimeKey(candleTime);
    return key === day || key.slice(0, 10) === day;
  });
  if (exact != null) return exact;
  // Fallback: nearest candle within 7 calendar days (covers weekends/holidays where
  // the trade date is not a trading day in this exchange's calendar).
  const targetMs = new Date(`${day}T00:00:00Z`).getTime();
  if (!Number.isFinite(targetMs)) return null;
  let best: Time | null = null;
  let bestDiff = 7 * 86_400_000;
  for (const ct of candleTimes) {
    const ctMs = new Date(`${String(ct).slice(0, 10)}T00:00:00Z`).getTime();
    if (!Number.isFinite(ctMs)) continue;
    const diff = Math.abs(ctMs - targetMs);
    if (diff < bestDiff) { bestDiff = diff; best = ct; }
  }
  return best;
}

function inferBarStepSeconds(candles: CandlestickData<Time>[]): number {
  if (candles.length < 2) return 1800;
  const last = candles[candles.length - 1].time;
  const prev = candles[candles.length - 2].time;
  if (typeof last === "number" && typeof prev === "number") {
    const diff = last - prev;
    if (Number.isFinite(diff) && diff > 0) return diff;
  }
  return 1800;
}

function shiftChartTime(last: Time, offset: number, isIntraday: boolean): Time {
  if (isIntraday && typeof last === "number") {
    return (last + offset) as UTCTimestamp;
  }
  return shiftIsoDay(String(last), offset) as Time;
}

function toFiniteNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function safePriceScaleWidth(chart: IChartApi | null | undefined): number | undefined {
  if (!chart) return undefined;
  try {
    const width = chart.priceScale("right").width();
    return Number.isFinite(width) ? Number(width) : undefined;
  } catch {
    return undefined;
  }
}

function pickFiniteNumberFromKeys(row: unknown, keys: string[]): number | undefined {
  const obj = row as Record<string, unknown> | null | undefined;
  if (!obj) return undefined;
  for (const key of keys) {
    const value = Number(obj[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

function pickStringFromKeys(row: unknown, keys: string[]): string | undefined {
  const obj = row as Record<string, unknown> | null | undefined;
  if (!obj) return undefined;
  for (const key of keys) {
    const value = String(obj[key] ?? "").trim();
    if (value) return value;
  }
  return undefined;
}

function normalizeDirectionFromRow(row: unknown): "long" | "short" {
  const text = String(
    pickStringFromKeys(row, ["direction", "side", "tradeSide", "positionSide", "signalDirection"]) || "long",
  ).toLowerCase();
  if (text.includes("short") || text === "sell") return "short";
  return "long";
}

function normalizeExitReason(reason: string | null | undefined): ExitReason {
  const key = String(reason || "").trim().toLowerCase();
  if (!key) return "unknown";
  if (key.includes("tp") || key.includes("take")) return "take_profit";
  if (key.includes("sl") || key.includes("stop")) return "stop_loss";
  if (key.includes("partial")) return "partial_close";
  if (key.includes("opposite")) return "opposite_signal";
  if (key.includes("manual")) return "manual_close";
  if (key.includes("close") || key.includes("trend")) return "strategy_close";
  return "unknown";
}

function parseLooseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "true" || text === "1" || text === "yes") return true;
  if (text === "false" || text === "0" || text === "no") return false;
  return null;
}

function inferOverlayTradeClosedState(row: Record<string, unknown>, exitPrice: number | null): {
  isOpen: boolean;
  hasExitTime: boolean;
  hasExitPrice: boolean;
  explicitOpen: boolean;
  explicitClosed: boolean;
} {
  const status = String(pickStringFromKeys(row, TRADE_STATUS_KEYS) || "").trim().toLowerCase();
  const isOpenFlag = parseLooseBoolean(row.isOpen);
  const closedFlag = parseLooseBoolean(row.closed);
  const exitReason = String(row.exit_reason ?? row.exitReason ?? "").trim().toLowerCase();
  const hasExitTime = Boolean(pickStringFromKeys(row, ["exitTime", "exit_time", "exitDate", "closeTime", "close_time"]));
  const hasExitPrice = exitPrice != null && exitPrice > 0;
  const explicitOpen = isOpenFlag === true || status === "open" || closedFlag === false;
  const explicitClosed = status === "closed" || status === "exit" || closedFlag === true || exitReason === "closed" || exitReason === "exit";
  const closedByExitPair = hasExitTime && hasExitPrice;
  const isClosed = explicitOpen ? false : (explicitClosed || closedByExitPair);
  return {
    isOpen: !isClosed,
    hasExitTime,
    hasExitPrice,
    explicitOpen,
    explicitClosed,
  };
}

function shiftIsoDay(isoDay: string, dayOffset: number): string {
  const parsed = new Date(`${isoDay}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return isoDay;
  parsed.setUTCDate(parsed.getUTCDate() + dayOffset);
  return parsed.toISOString().slice(0, 10);
}

function inferBarStepDays(orderedTimes: string[]): number {
  for (let i = orderedTimes.length - 1; i > 0; i -= 1) {
    const cur = new Date(`${orderedTimes[i]}T00:00:00Z`);
    const prev = new Date(`${orderedTimes[i - 1]}T00:00:00Z`);
    if (!Number.isFinite(cur.getTime()) || !Number.isFinite(prev.getTime())) continue;
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86400000);
    if (Number.isFinite(diff) && diff > 0 && diff <= 10) return diff;
  }
  return 1;
}

function buildTradesFromRows(
  symbol: string,
  candles: CandlestickData<Time>[],
  rows: TradeRow[] | undefined,
  isIntraday: boolean,
): OverlayTrade[] {
  const list = Array.isArray(rows) ? rows : [];
  const orderedTimes = candles.map((row) => row.time);
  const byTimeIndex = new Map<string, number>(orderedTimes.map((time, idx) => [chartTimeKey(time), idx]));
  const out: OverlayTrade[] = [];
  const lastIndex = orderedTimes.length - 1;

  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    const rawRow = row as unknown as Record<string, unknown>;
    const direction = normalizeDirectionFromRow(rawRow);
    const entryTimeRaw = pickStringFromKeys(rawRow, ["entryTime", "entry_time", "entryDate", "openTime", "open_time"]);
    const exitTimeRaw = pickStringFromKeys(rawRow, ["exitTime", "exit_time", "exitDate", "closeTime", "close_time"]);
    const entryPrice =
      pickFiniteNumberFromKeys(rawRow, ["entry", "entryPrice", "entry_price", "openPrice", "price"]);
    const stopLoss =
      pickFiniteNumberFromKeys(rawRow, ["sl", "stopLoss", "stop_loss", "stop_loss_price", "stopPrice", "stop", "initialStop", "stopLossPrice"])
      ?? null;
    const takeProfit =
      pickFiniteNumberFromKeys(rawRow, ["tp", "takeProfit", "take_profit", "take_profit_price", "targetPrice", "target", "takeProfitPrice", "profitTarget"])
      ?? null;
    const exitPrice =
      pickFiniteNumberFromKeys(rawRow, ["exit", "exitPrice", "exit_price", "closePrice"])
      ?? null;
    const entryTime = resolveTradeTimeToCandle(entryTimeRaw ?? row.entryTime, orderedTimes, isIntraday);
    if (entryTime == null) continue;
    const entryKey = chartTimeKey(entryTime);
    const entryIndex = byTimeIndex.get(entryKey);
    if (entryIndex == null) continue;
    const closeState = inferOverlayTradeClosedState(rawRow, exitPrice);
    const exitTime = !closeState.isOpen ? resolveTradeTimeToCandle(exitTimeRaw ?? row.exitTime ?? null, orderedTimes, isIntraday) : null;
    const exitRaw = exitTime != null ? byTimeIndex.get(chartTimeKey(exitTime)) : undefined;
    const hasResolvedExitCandle = exitRaw != null;
    const isEffectivelyClosed = !closeState.isOpen;
    const exitIndex = isEffectivelyClosed
      ? (hasResolvedExitCandle ? Math.max(entryIndex, Math.min(lastIndex, exitRaw)) : entryIndex)
      : lastIndex;
    if (entryPrice == null || entryPrice <= 0) continue;
    out.push({
      id: `${symbol}-row-${i + 1}`,
      direction,
      status: isEffectivelyClosed ? "closed" : "open",
      entryTime,
      entryIndex,
      entryPrice,
      stopLoss,
      takeProfit,
      exitPrice: isEffectivelyClosed ? (exitPrice ?? null) : null,
      exitTime: isEffectivelyClosed ? orderedTimes[exitIndex] : undefined,
      exitIndex: isEffectivelyClosed ? exitIndex : undefined,
      exitReason: isEffectivelyClosed ? normalizeExitReason(pickStringFromKeys(rawRow, ["exitReason", "closeReason", "reason"]) ?? row.exitReason) : undefined,
    });
  }
  return out;
}

function buildLegacyTradeOverlay(data: MonitoringChartData, candles: CandlestickData<Time>[], colors?: { entry: string; sl: string; tp: string }): TradeOverlay {
  if (!candles.length) {
    return {
      trades: [],
      lineSegments: [],
      futureBars: [],
      projectedEndTime: null,
    };
  }

  // isIntraday is derived from the chart timeframe — same function used in prepared useMemo
  // so candle time type (UTCTimestamp vs dayKey) always matches trade matching and futureBars.
  const isIntraday = isIntradayChartTf(data.timeframe);
  const fromRows = buildTradesFromRows(data.displaySymbol, candles, data.trades, isIntraday);
  const trades = fromRows;

  const lastTime = candles[candles.length - 1].time;
  const futureBars: Array<WhitespaceData<Time>> = [];
  let projectedEndTime: Time = lastTime;
  if (isIntraday) {
    const barStepSeconds = inferBarStepSeconds(candles);
    projectedEndTime = shiftChartTime(lastTime, barStepSeconds * OPEN_TRADE_FUTURE_BARS, true);
    for (let step = 1; step <= OPEN_TRADE_FUTURE_BARS; step += 1) {
      futureBars.push({ time: shiftChartTime(lastTime, barStepSeconds * step, true) });
    }
  } else {
    const barStepDays = inferBarStepDays(candles.map((row) => String(row.time)));
    projectedEndTime = shiftChartTime(lastTime, barStepDays * OPEN_TRADE_FUTURE_BARS, false);
    for (let step = 1; step <= OPEN_TRADE_FUTURE_BARS; step += 1) {
      futureBars.push({ time: shiftChartTime(lastTime, barStepDays * step, false) });
    }
  }

  const lineSegments: HorizontalLineSegment[] = [];
  for (const trade of trades) {
    if (trade.status === "closed" && !trade.exitTime) continue;
    const startTime = trade.entryTime;
    const endTime = trade.status === "closed" ? (trade.exitTime ?? trade.entryTime) : projectedEndTime;
    const safeEnd = endTime;

    lineSegments.push({
      id: `${trade.id}-entry`,
      type: "entry",
      startTime,
      endTime: safeEnd,
      value: trade.entryPrice,
      color: colors?.entry ?? DEFAULT_TRADE_ENTRY_COLOR,
    });
    if (trade.stopLoss != null && trade.stopLoss > 0) {
      lineSegments.push({
        id: `${trade.id}-sl`,
        type: "sl",
        startTime,
        endTime: safeEnd,
        value: trade.stopLoss,
        color: colors?.sl ?? DEFAULT_TRADE_SL_COLOR,
      });
    }
    if (trade.takeProfit != null && trade.takeProfit > 0) {
      lineSegments.push({
        id: `${trade.id}-tp`,
        type: "tp",
        startTime,
        endTime: safeEnd,
        value: trade.takeProfit,
        color: colors?.tp ?? DEFAULT_TRADE_TP_COLOR,
      });
    }

  }
  return {
    trades,
    lineSegments,
    futureBars,
    projectedEndTime,
  };
}

function detectLifecycleSource(rows: TradeRow[]): TradeLifecycleSource {
  const raw = String(rows[0]?.source || "").toLowerCase();
  if (raw.includes("reference") || raw.includes("csv")) return "csv_reference";
  if (raw.includes("hybrid")) return "hybrid";
  if (raw.includes("live")) return "live_state";
  if (raw.includes("manual")) return "manual";
  return "engine";
}

function buildTradeOverlayFromLifecycle(data: MonitoringChartData, candles: CandlestickData<Time>[], colors?: { entry: string; sl: string; tp: string }): TradeOverlay {
  if (!candles.length) {
    return {
      trades: [],
      lineSegments: [],
      futureBars: [],
      projectedEndTime: null,
    };
  }
  const tradeRows = Array.isArray(data.trades) ? data.trades : [];
  const lifecycleSource = detectLifecycleSource(tradeRows);
  const lifecycleTrades = buildTradeLifecycleFromRows(tradeRows, {
    strategyId: String(data.displaySymbol || "unknown"),
    symbol: String(data.displaySymbol || "unknown"),
    group: "unknown",
    timeframe: String(data.timeframe || "D"),
    source: lifecycleSource,
  });
  const legacyLifecycleRows = tradeRows
    .map((row, idx) =>
      normalizeLifecycleTradeFromRow(row, {
        strategyId: String(data.displaySymbol || "unknown"),
        symbol: String(data.displaySymbol || "unknown"),
        group: "unknown",
        timeframe: String(data.timeframe || "D"),
        source: lifecycleSource,
      }, idx),
    )
    .filter(Boolean);
  const tradesForVisuals = legacyLifecycleRows.length ? (legacyLifecycleRows as NonNullable<typeof legacyLifecycleRows[number]>[]) : lifecycleTrades;
  const mode: TradeLifecycleVisualMode = data.variant === "compact" ? "mini" : "normal";
  const visuals = buildTradeLifecycleVisuals(tradesForVisuals, candles, null, mode, colors);
  return {
    trades: visuals.overlayTrades.map((trade) => ({
      id: trade.id,
      direction: trade.direction,
      status: trade.status,
      entryTime: trade.entryTime,
      entryIndex: trade.entryIndex,
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      exitPrice: trade.exitPrice ?? null,
      exitTime: trade.exitTime,
      exitIndex: trade.exitIndex,
      exitReason: normalizeExitReason(trade.exitReason),
    })),
    lineSegments: visuals.allLineSegments.map((segment) => ({
      id: segment.id,
      type: segment.type,
      startTime: segment.startTime,
      endTime: segment.endTime,
      value: segment.value,
      color: segment.color,
    })),
    futureBars: visuals.futureBars,
    projectedEndTime: visuals.projectedEndTime,
  };
}

function buildTradeOverlay(data: MonitoringChartData, candles: CandlestickData<Time>[], colors?: { entry: string; sl: string; tp: string }): TradeOverlay {
  if (monitoringFeatureFlags.useNewTradeEngineVisuals && !monitoringFeatureFlags.useLegacyTradeOverlay) {
    return buildTradeOverlayFromLifecycle(data, candles, colors);
  }
  return buildLegacyTradeOverlay(data, candles, colors);
}

function MonitoringChartInner({
  data,
  maxBars = DEFAULT_MAX_BARS,
  initialVisibleBars,
  allDashboardMode = false,
  showFullscreenControl = true,
  isFullscreen = false,
  onFullscreenRequest,
  manualLevels = null,
  showManualLevels = false,
  onManualLevelsChange,
  selectedTradeId: externalSelectedTradeId = null,
  uiPrefs,
  liveChartAutoView = false,
  trendEmas,
}: MonitoringChartProps) {
  const overlayEnabled = monitoringFeatureFlags.enableSvgTradeOverlay;
  const debugRenderingEnabled = monitoringFeatureFlags.enableDebugRendering;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const currentPriceRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSeriesRef = useRef<Array<ISeriesApi<"Line">>>([]);
  const autoscaleDebugRef = useRef<AutoscaleDebugState>({
    tradeLevelMin: null,
    tradeLevelMax: null,
    autoscaleLow: null,
    autoscaleHigh: null,
    wasTradeLevelClampedOrIgnored: false,
  });
  const manualLineRefs = useRef<Array<ISeriesApi<"Line">>>([]);
  const tradeSvgSegmentsRef = useRef<SvgLineSegment[]>([]);
  const tradeTrianglesRef = useRef<SvgTradeTriangle[]>([]);
  const tradeHitTargetsRef = useRef<OpenTradeHitTarget[]>([]);
  const tradeZonesRef = useRef<SvgTradeZone[]>([]);
  const tradeLineLabelsRef = useRef<SvgLineLabel[]>([]);
  const currentPriceGuideRef = useRef<CurrentPriceGuide | null>(null);
  const overlayRenderCountRef = useRef(0);
  const didSetInitialRangeRef = useRef(false);
  const didSetInitialPriceRangeRef = useRef(false);
  const autoFollowRef = useRef(false);
  const isProgrammaticRangeRef = useRef(false);
  const totalBarsRef = useRef(0);
  const prevCandleDataRef = useRef<Array<CandlestickData<Time> | WhitespaceData<Time>> | null>(null);
  const redrawRef = useRef<() => void>(() => undefined);
  const panSyncActiveRef = useRef(false);
  const dragRef = useRef<"entry" | "sl" | "tp" | null>(null);
  const [manualHover, setManualHover] = useState<"entry" | "sl" | "tp" | null>(null);
  const [hovered, setHovered] = useState(false);
  const [showGoToLatest, setShowGoToLatest] = useState(false);
  const [tradeSvgSegments, setTradeSvgSegments] = useState<SvgLineSegment[]>([]);
  const [tradeTriangles, setTradeTriangles] = useState<SvgTradeTriangle[]>([]);
  const [tradeHitTargets, setTradeHitTargets] = useState<OpenTradeHitTarget[]>([]);
  const [tradeZones, setTradeZones] = useState<SvgTradeZone[]>([]);
  const [tradeLineLabels, setTradeLineLabels] = useState<SvgLineLabel[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const selectedTradeIdRef = useRef<string | null>(null);
  const [fullscreenZoneActive, setFullscreenZoneActive] = useState(false);
  const [currentPriceGuide, setCurrentPriceGuide] = useState<CurrentPriceGuide | null>(null);
  const [priceAxisLabel, setPriceAxisLabel] = useState<PriceAxisLabelState | null>(null);
  const [overlayScaleWidth, setOverlayScaleWidth] = useState(0);
  const overlayScaleWidthRef = useRef(0);
  const syncPriceAxisLabelRef = useRef<() => void>(() => undefined);
  const chartDensityRef = useRef({
    visibleBars: VISIBLE_BARS,
    rightOffset: RIGHT_OFFSET,
    isCompact: false,
    isDashboard: false,
  });

  useEffect(() => {
    if (!externalSelectedTradeId) return;
    setSelectedTradeId(externalSelectedTradeId);
  }, [externalSelectedTradeId]);

  const prepared = useMemo(() => {
    // Intraday timeframes (30M, 1H, 2H) use UTCTimestamp (Unix seconds) as the unique
    // candle key so each bar gets its own slot. Daily/weekly/monthly assets use dayKey
    // (string "YYYY-MM-DD"). Both buildTradeOverlay and futureBars use the same mode
    // (isIntradayChartTf) so candlesWithWhitespace is always type-homogeneous.
    const overlayColors = {
      entry: uiPrefs?.overlayEntryColor ?? DEFAULT_TRADE_ENTRY_COLOR,
      sl: uiPrefs?.overlaySlColor ?? DEFAULT_TRADE_SL_COLOR,
      tp: uiPrefs?.overlayTpColor ?? DEFAULT_TRADE_TP_COLOR,
    };
    const isIntraday = isIntradayChartTf(data.timeframe);

    const byTime = new Map<string | number, CandlestickData<Time>>();
    for (const bar of data.bars) {
      const open = toFiniteNumber(bar.open);
      const high = toFiniteNumber(bar.high);
      const low = toFiniteNumber(bar.low);
      const close = toFiniteNumber(bar.close);
      if (open == null || high == null || low == null || close == null) continue;

      if (isIntraday) {
        const iso = String(bar.time || "").replace(/Z$/, "").replace(/\+00:00$/, "");
        if (!iso || iso.length < 16) continue;
        const tsMs = new Date(iso + "Z").getTime();
        if (!Number.isFinite(tsMs)) continue;
        const utcSec = Math.floor(tsMs / 1000) as UTCTimestamp;
        byTime.set(utcSec, { time: utcSec, open, high, low, close });
      } else {
        const day = dayKey(bar.time);
        if (!day) continue;
        byTime.set(day, { time: day as Time, open, high, low, close });
      }
    }
    const sorted = Array.from(byTime.values()).sort((a, b) => {
      const at = typeof a.time === "number" ? a.time : String(a.time);
      const bt = typeof b.time === "number" ? b.time : String(b.time);
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
    const clipped = maxBars > 0 ? sorted.slice(-maxBars) : sorted;
    const overlay = overlayEnabled
      ? buildTradeOverlay(data, clipped, overlayColors)
      : {
          trades: [],
          lineSegments: [],
          futureBars: [],
          projectedEndTime: null,
        };
    return {
      candles: clipped,
      candlesWithWhitespace: [...clipped, ...overlay.futureBars] as Array<CandlestickData<Time> | WhitespaceData<Time>>,
      overlay,
    };
  // Use specific fields instead of the whole data object so badge/displayName
  // changes don't force a full buildTradeOverlay() recompute.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.bars, data.trades, data.timeframe, data.displaySymbol, data.signals, maxBars, overlayEnabled,
      uiPrefs?.overlayEntryColor, uiPrefs?.overlaySlColor, uiPrefs?.overlayTpColor]);

  useEffect(() => {
    const syncPriceAxisLabel = () => {
      const series = candleRef.current;
      const host = hostRef.current;
      const chart = chartRef.current;
      const last = prepared.candles[prepared.candles.length - 1];
      if (!series || !host || !chart || !last) {
        setPriceAxisLabel(null);
        return;
      }
      const close = Number(last.close);
      const open = Number(last.open);
      if (!Number.isFinite(close) || !Number.isFinite(open)) {
        setPriceAxisLabel(null);
        return;
      }
      const yRaw = series.priceToCoordinate(close);
      if (yRaw == null) {
        setPriceAxisLabel(null);
        return;
      }
      const top = Number(yRaw);
      const height = host.clientHeight;
      const labelHeight = chartDensityRef.current.isDashboard
        ? DASHBOARD_PRICE_AXIS_LABEL_HEIGHT
        : chartDensityRef.current.isCompact
          ? COMPACT_PRICE_AXIS_LABEL_HEIGHT
          : PRICE_AXIS_LABEL_HEIGHT;
      if (!Number.isFinite(top) || top < -labelHeight || top > height + labelHeight) {
        setPriceAxisLabel(null);
        return;
      }
      const scaleWidth = safePriceScaleWidth(chart);
      const isIntradayTf = isIntradayChartTf(data.timeframe);
      const isForex = isForexDisplaySymbol(data.displaySymbol);
      const priceScaleMinWidth = monitoringRightPriceScaleMinWidth(
        chartDensityRef.current.isDashboard,
        chartDensityRef.current.isCompact,
        isIntradayTf,
        isForex,
      );
      const fallbackWidth = chartDensityRef.current.isDashboard
        ? DASHBOARD_PRICE_AXIS_FALLBACK_WIDTH
        : chartDensityRef.current.isCompact
          ? COMPACT_PRICE_AXIS_FALLBACK_WIDTH
          : Math.max(PRICE_AXIS_FALLBACK_WIDTH, priceScaleMinWidth);
      const minScaleWidth = Math.max(26, priceScaleMinWidth - 6);
      const scaleColumnWidth =
        typeof scaleWidth === "number" && Number.isFinite(scaleWidth) && scaleWidth >= minScaleWidth
          ? Math.floor(scaleWidth)
          : fallbackWidth;
      const width = scaleColumnWidth;
      const left = Math.max(0, Math.floor(host.clientWidth - scaleColumnWidth));
      const lastRawBar = data.bars[data.bars.length - 1];
      const barTime =
        typeof last.time === "number"
          ? last.time
          : (lastRawBar?.time ?? String(last.time));
      const label = buildLivePriceAxisLabel({
        barTime,
        open,
        close,
        timeframe: data.timeframe,
        tickEverySecond: !Boolean(uiPrefs?.efficientMode),
      });
      const tone = label?.tone ?? candleCloseTone(open, close);
      setPriceAxisLabel({
        top,
        left,
        width,
        priceText: label?.priceText ?? formatAxisPrice(close),
        countdownText: label?.countdownText ?? "--:--",
        tone,
        backgroundColor: label?.backgroundColor ?? priceAxisBackgroundColor(tone),
      });
    };

    syncPriceAxisLabelRef.current = syncPriceAxisLabel;
    syncPriceAxisLabel();
    const timer = window.setInterval(syncPriceAxisLabel, 1000);
    return () => window.clearInterval(timer);
  }, [data.bars, data.timeframe, data.displaySymbol, prepared.candles]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(163, 180, 199, 0.42)",
          width: 1,
          labelVisible: true,
          labelBackgroundColor: "rgba(22, 26, 32, 0.9)",
          visible: hovered,
        },
        horzLine: {
          color: "rgba(163, 180, 199, 0.42)",
          width: 1,
          labelVisible: true,
          labelBackgroundColor: "rgba(22, 26, 32, 0.9)",
          visible: hovered,
        },
      },
    });
  }, [hovered]);

  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle) return;
    const backgroundColor = uiPrefs?.backgroundColor ?? MONITORING_CHART_BACKGROUND;
    const candleUpColor = uiPrefs?.candleUpColor ?? "#FFFFFF";
    const candleDownColor = uiPrefs?.candleDownColor ?? "#D6B44B";
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
      },
    });
    candle.applyOptions({
      upColor: candleUpColor,
      downColor: candleDownColor,
      wickUpColor: candleUpColor,
      wickDownColor: candleDownColor,
    });
  }, [uiPrefs?.backgroundColor, uiPrefs?.candleUpColor, uiPrefs?.candleDownColor]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const isDashboard = allDashboardMode || false;
    const isCompact = data.variant === "compact" || isDashboard;
    const isIntraday = isIntradayChartTf(data.timeframe);
    const isForex = isForexDisplaySymbol(data.displaySymbol);
    const priceScaleMinWidth = monitoringRightPriceScaleMinWidth(isDashboard, isCompact, isIntraday, isForex);
    const efficientMode = Boolean(uiPrefs?.efficientMode);
    const defaultVisibleBars = (isDashboard ? DASHBOARD_VISIBLE_BARS : isCompact ? COMPACT_VISIBLE_BARS : VISIBLE_BARS);
    const visibleBars = initialVisibleBars ?? (efficientMode ? Math.min(20, defaultVisibleBars) : defaultVisibleBars);
    const rightOffset = isDashboard ? DASHBOARD_RIGHT_OFFSET : isCompact ? COMPACT_RIGHT_OFFSET : RIGHT_OFFSET;
    chartDensityRef.current = { visibleBars, rightOffset, isCompact, isDashboard };
    const backgroundColor = uiPrefs?.backgroundColor ?? MONITORING_CHART_BACKGROUND;

    const chart = createChart(host, {
      width: Math.max(80, Math.floor(host.clientWidth)),
      height: Math.max(56, Math.floor(host.clientHeight)),
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor: monitoringAxisTextColor(isDashboard, isCompact),
        fontSize: monitoringAxisFontSize(isDashboard, isCompact, isIntraday),
        fontFamily: MONITORING_CHART_FONT_FAMILY,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(163, 180, 199, 0.42)",
          width: 1,
          labelVisible: true,
          labelBackgroundColor: "rgba(22, 26, 32, 0.9)",
          visible: false,
        },
        horzLine: {
          color: "rgba(163, 180, 199, 0.42)",
          width: 1,
          labelVisible: true,
          labelBackgroundColor: "rgba(22, 26, 32, 0.9)",
          visible: false,
        },
      },
      localization: {
        priceFormatter: (price: number) => formatAxisPrice(price),
        // Intraday: render crosshair time label in Europe/Berlin (data stays UTC).
        ...(isIntraday ? { timeFormatter: berlinIntradayTimeFormatter } : {}),
      },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        alignLabels: true,
        ensureEdgeTickMarksVisible: true,
        scaleMargins: monitoringPriceScaleMargins(isDashboard, isCompact),
        textColor: monitoringAxisTextColor(isDashboard, isCompact),
        minimumWidth: priceScaleMinWidth,
      },
      timeScale: {
        visible: true,
        borderVisible: false,
        rightOffset,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
        timeVisible: isCompact || isIntradayChartTf(data.timeframe),
        secondsVisible: false,
        ticksVisible: true,
        minimumHeight: isDashboard ? 14 : isCompact ? 16 : 20,
        barSpacing: isDashboard ? 2.5 : isCompact ? 5 : undefined,
        minBarSpacing: isDashboard ? 1.5 : isCompact ? 3 : undefined,
        // Intraday: render X-axis tick labels in Europe/Berlin (data stays UTC).
        ...(isIntraday ? { tickMarkFormatter: berlinIntradayTickMarkFormatter } : {}),
      },
      handleScroll: {
        mouseWheel: false, // vertical wheel = zoom (see handleScale), not pan
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      kineticScroll: {
        touch: false,
        mouse: false,
      },
      handleScale: {
        mouseWheel: true, // vertical wheel zooms the chart
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        axisDoubleClickReset: {
          time: true,
          price: true,
        },
      },
    });

    const candleUpColor = uiPrefs?.candleUpColor ?? "#FFFFFF";
    const candleDownColor = uiPrefs?.candleDownColor ?? "#D6B44B";
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: candleUpColor,
      downColor: candleDownColor,
      borderVisible: false,
      wickUpColor: candleUpColor,
      wickDownColor: candleDownColor,
      priceLineVisible: false,
      lastValueVisible: false,
      // Forex pairs (GBPUSD, EURUSD) need 4 decimal places so axis ticks
      // are generated at the correct precision before the localization.priceFormatter
      // applies. Without this, LightweightCharts defaults to 2dp tick precision.
      ...(isForex ? { priceFormat: { type: "price" as const, precision: 4, minMove: 0.0001 } } : {}),
    });

    const currentPriceLine = chart.addSeries(LineSeries, {
      color: "rgba(0, 0, 0, 0)",
      lineWidth: 1,
      lineVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // Trend EMA overlay series (e.g. Indizes EMA 200 / 280). Created once; data set in
    // the candle-data effect. No effect on charts that don't pass trendEmas.
    emaSeriesRef.current = (trendEmas ?? []).map((cfg) =>
      chart.addSeries(LineSeries, {
        color: cfg.color,
        lineWidth: 1,
        lineVisible: true,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }),
    );

    chartRef.current = chart;
    candleRef.current = candle;
    currentPriceRef.current = currentPriceLine;
    const unregisterChart = registerMonitoringChart(chart);

    let redrawRafId: number | null = null;
    let unregisterRedrawRaf: (() => void) | null = null;
    let panSyncRafId: number | null = null;
    let unregisterPanSyncRaf: (() => void) | null = null;

    const scheduleRedraw = () => {
      if (redrawRafId != null) return;
      redrawRafId = requestAnimationFrame(() => {
        redrawRafId = null;
        if (unregisterRedrawRaf) {
          unregisterRedrawRaf();
          unregisterRedrawRaf = null;
        }
        redrawRef.current();
      });
      unregisterRedrawRaf = registerMonitoringAnimationFrame(redrawRafId);
    };

    const stopPanSync = () => {
      panSyncActiveRef.current = false;
      if (panSyncRafId != null) {
        cancelAnimationFrame(panSyncRafId);
        panSyncRafId = null;
      }
      if (unregisterPanSyncRaf) {
        unregisterPanSyncRaf();
        unregisterPanSyncRaf = null;
      }
      scheduleRedraw();
    };

    const panSyncFrame = () => {
      panSyncRafId = null;
      if (unregisterPanSyncRaf) {
        unregisterPanSyncRaf();
        unregisterPanSyncRaf = null;
      }
      redrawRef.current();
      syncPriceAxisLabelRef.current();
      if (panSyncActiveRef.current) {
        panSyncRafId = requestAnimationFrame(panSyncFrame);
        unregisterPanSyncRaf = registerMonitoringAnimationFrame(panSyncRafId);
      }
    };

    const startPanSync = () => {
      panSyncActiveRef.current = true;
      if (panSyncRafId == null) {
        panSyncRafId = requestAnimationFrame(panSyncFrame);
        unregisterPanSyncRaf = registerMonitoringAnimationFrame(panSyncRafId);
      }
    };

    const onPanPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      startPanSync();
    };

    // Throttle via RAF: during layout drag all 25 charts fire simultaneously.
    // Batching into one RAF slot per chart prevents 25 synchronous canvas ops per pixel.
    let pendingW = 0;
    let pendingH = 0;
    let resizeRafId: number | null = null;
    const resizeObserver = new ResizeObserver((entries) => {
      const next = entries[0];
      if (!next) return;
      pendingW = Math.max(120, Math.floor(next.contentRect.width));
      const hMin = isDashboard ? 56 : 140;
      pendingH = Math.max(hMin, Math.floor(next.contentRect.height));
      if (resizeRafId != null) return;
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null;
        chart.resize(pendingW, pendingH);
        scheduleRedraw();
      });
    });
    resizeObserver.observe(host);
    const unregisterResizeObserver = registerMonitoringResizeObserver(resizeObserver);

    requestAnimationFrame(() => {
      syncPriceAxisLabelRef.current();
    });

    const applyVisibleRange = (range: VisibleLogicalRange) => {
      isProgrammaticRangeRef.current = true;
      try {
        chart.timeScale().setVisibleLogicalRange(range);
      } finally {
        isProgrammaticRangeRef.current = false;
      }
    };

    const syncAutoFollowFromRange = () => {
      if (isProgrammaticRangeRef.current) return;
      const range = chart.timeScale().getVisibleLogicalRange();
      const total = totalBarsRef.current;
      const nextAutoFollow = isAtRightEdge(range, total, chartDensityRef.current.rightOffset);
      autoFollowRef.current = nextAutoFollow;
      setShowGoToLatest(!nextAutoFollow && total > 0);
    };

    const onVisibleLogicalRangeChange = () => {
      syncAutoFollowFromRange();
      if (panSyncActiveRef.current) {
        syncPriceAxisLabelRef.current();
        return;
      }
      scheduleRedraw();
      syncPriceAxisLabelRef.current();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);
    const unregisterVisibleLogical = registerMonitoringSubscription(() => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);
    });

    let unregisterVisibleTime: (() => void) | null = null;
    if (overlayEnabled || showManualLevels) {
      const onVisibleTimeRangeChange = () => {
        if (panSyncActiveRef.current) return;
        scheduleRedraw();
      };
      chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleTimeRangeChange);
      unregisterVisibleTime = registerMonitoringSubscription(() => {
        chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleTimeRangeChange);
      });
    }

    host.addEventListener("pointerdown", onPanPointerDown);
    window.addEventListener("pointerup", stopPanSync);
    window.addEventListener("pointercancel", stopPanSync);
    const unregisterPanSync = registerMonitoringSubscription(() => {
      host.removeEventListener("pointerdown", onPanPointerDown);
      window.removeEventListener("pointerup", stopPanSync);
      window.removeEventListener("pointercancel", stopPanSync);
      stopPanSync();
    });

    const onWheel = (event: WheelEvent) => {
      const absX = Math.abs(event.deltaX);
      const absY = Math.abs(event.deltaY);
      if (absX <= 0 || absX < absY * 0.45) return;
      event.preventDefault();
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      const shift = event.deltaX > 0 ? HORIZONTAL_WHEEL_BAR_SHIFT : -HORIZONTAL_WHEEL_BAR_SHIFT;
      applyVisibleRange({
        from: range.from + shift,
        to: range.to + shift,
      });
      syncAutoFollowFromRange();
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    const unregisterWheel = registerMonitoringSubscription(() => {
      host.removeEventListener("wheel", onWheel);
    });

    const onChartClick = (param: { point?: { x: number; y: number } }) => {
      const point = param?.point;
      if (!point) return;
      const px = Number(point.x);
      const py = Number(point.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return;
      let bestId: string | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const target of tradeHitTargetsRef.current) {
        const dx = px - target.markerX;
        const dy = py - target.markerY;
        const markerDistance = Math.hypot(dx, dy);
        const markerHit = markerDistance <= 12;
        const candleHit =
          Math.abs(px - target.candleX) <= 10 &&
          py >= target.candleYMin - 8 &&
          py <= target.candleYMax + 8;
        if (!markerHit && !candleHit) continue;
        const score = markerHit ? markerDistance : Math.abs(px - target.candleX) + 0.5;
        if (score < bestScore) {
          bestScore = score;
          bestId = target.tradeId;
        }
      }
      if (!bestId) return;
      setSelectedTradeId((current) => (current === bestId ? null : bestId));
    };
    chart.subscribeClick(onChartClick);
    const unregisterChartClick = registerMonitoringSubscription(() => {
      chart.unsubscribeClick(onChartClick);
    });

    return () => {
      unregisterChartClick();
      unregisterWheel();
      unregisterPanSync();
      unregisterVisibleLogical();
      if (unregisterVisibleTime) unregisterVisibleTime();
      if (redrawRafId != null) {
        cancelAnimationFrame(redrawRafId);
        redrawRafId = null;
      }
      if (unregisterRedrawRaf) {
        unregisterRedrawRaf();
        unregisterRedrawRaf = null;
      }
      if (panSyncRafId != null) {
        cancelAnimationFrame(panSyncRafId);
        panSyncRafId = null;
      }
      if (unregisterPanSyncRaf) {
        unregisterPanSyncRaf();
        unregisterPanSyncRaf = null;
      }
      panSyncActiveRef.current = false;
      if (resizeRafId != null) {
        cancelAnimationFrame(resizeRafId);
        resizeRafId = null;
      }
      unregisterResizeObserver();
      resizeObserver.disconnect();
      unregisterChart();
      try {
        chart.remove();
      } catch {
        // ignore double-dispose
      }
      chartRef.current = null;
      candleRef.current = null;
      currentPriceRef.current = null;
      emaSeriesRef.current = [];
      manualLineRefs.current = [];
      tradeSvgSegmentsRef.current = [];
      tradeTrianglesRef.current = [];
      tradeHitTargetsRef.current = [];
      tradeZonesRef.current = [];
      tradeLineLabelsRef.current = [];
      currentPriceGuideRef.current = null;
      overlayRenderCountRef.current = 0;
      didSetInitialRangeRef.current = false;
      didSetInitialPriceRangeRef.current = false;
      autoFollowRef.current = false;
      isProgrammaticRangeRef.current = false;
      totalBarsRef.current = 0;
      prevCandleDataRef.current = null;
    };
  }, [allDashboardMode, data.displaySymbol, data.variant, initialVisibleBars, overlayEnabled, showManualLevels]);

  // Live Auto: re-fit Y (always) and X (when liveChartAutoView) whenever data changes
  useEffect(() => {
    didSetInitialPriceRangeRef.current = false;
    if (liveChartAutoView) {
      didSetInitialRangeRef.current = false;
    }
  }, [prepared, liveChartAutoView]);

  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    const currentPriceLine = currentPriceRef.current;
    const canvas = canvasRef.current;
    if (!chart || !candle || !currentPriceLine || !canvas) return;

    const isDashboard = allDashboardMode || false;
    const isCompact = data.variant === "compact" || isDashboard;
    chartDensityRef.current = {
      visibleBars: initialVisibleBars ?? (isDashboard ? DASHBOARD_VISIBLE_BARS : isCompact ? COMPACT_VISIBLE_BARS : VISIBLE_BARS),
      rightOffset: isDashboard ? DASHBOARD_RIGHT_OFFSET : isCompact ? COMPACT_RIGHT_OFFSET : RIGHT_OFFSET,
      isCompact,
      isDashboard,
    };

    // Show hour/minute on time axis for intraday charts (30M/1H/2H)
    const isIntradayTf = isIntradayChartTf(data.timeframe);
    const isForex = isForexDisplaySymbol(data.displaySymbol);
    const priceScaleMinWidth = monitoringRightPriceScaleMinWidth(isDashboard, isCompact, isIntradayTf, isForex);

    chart.applyOptions({
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      kineticScroll: {
        touch: false,
        mouse: false,
      },
      layout: {
        textColor: monitoringAxisTextColor(isDashboard, isCompact),
        fontSize: monitoringAxisFontSize(isDashboard, isCompact, isIntradayTf),
        fontFamily: MONITORING_CHART_FONT_FAMILY,
      },
      localization: {
        priceFormatter: (price: number) => formatAxisPrice(price),
        ...(isIntradayTf ? { timeFormatter: berlinIntradayTimeFormatter } : {}),
      },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        alignLabels: true,
        ensureEdgeTickMarksVisible: true,
        scaleMargins: monitoringPriceScaleMargins(isDashboard, isCompact),
        textColor: monitoringAxisTextColor(isDashboard, isCompact),
        minimumWidth: priceScaleMinWidth,
      },
      timeScale: {
        timeVisible: isCompact || isIntradayChartTf(data.timeframe),
        secondsVisible: false,
        ticksVisible: true,
        minimumHeight: isDashboard ? 14 : isCompact ? 16 : 20,
        ...(isIntradayTf ? { tickMarkFormatter: berlinIntradayTickMarkFormatter } : {}),
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        axisDoubleClickReset: {
          time: true,
          price: true,
        },
      },
    });

    // Incremental update: if only the last bar changed (same time key), use
    // series.update() to avoid view-position reset on 30s auto-refresh ticks.
    const newData = prepared.candlesWithWhitespace;
    const prev = prevCandleDataRef.current;
    let usedUpdate = false;
    if (prev && newData.length > 0 && (newData.length === prev.length || newData.length === prev.length + 1)) {
      const lastNew = newData[newData.length - 1];
      const lastPrev = prev[prev.length - 1];
      // If lengths match, only the tail bar changed; if length grew by 1, append new bar.
      const tailUnchanged = newData.length === prev.length
        ? lastNew && lastPrev && String(lastNew.time) === String(lastPrev.time)
        : true; // new bar appended — always safe to update
      if (tailUnchanged && lastNew) {
        candle.update(lastNew as CandlestickData<Time>);
        usedUpdate = true;
      }
    }
    if (!usedUpdate) {
      candle.setData(newData);
    }
    prevCandleDataRef.current = newData;

    // Trend EMA overlays: compute from the real candle closes (ignoring whitespace) and
    // feed each EMA line series. Standard EMA seeded with the first close.
    if (emaSeriesRef.current.length && (trendEmas?.length ?? 0) > 0) {
      const realCandles = prepared.candles.filter(
        (c): c is typeof c & { close: number } => typeof (c as { close?: unknown }).close === "number",
      );
      (trendEmas ?? []).forEach((cfg, i) => {
        const series = emaSeriesRef.current[i];
        if (!series) return;
        if (realCandles.length < cfg.len) {
          series.setData([]);
          return;
        }
        const mult = 2 / (cfg.len + 1);
        let ema: number | null = null;
        const out: Array<{ time: Time; value: number }> = [];
        for (const c of realCandles) {
          const close = Number((c as { close: number }).close);
          ema = ema === null ? close : close * mult + ema * (1 - mult);
          out.push({ time: c.time, value: ema });
        }
        series.setData(out);
      });
    }

    // Autoscale: open trade levels (entry/SL/TP) are always included in Y range.
    // Closed trade levels use a 15% expansion cap to avoid flattening candles.
    const tradePrices = prepared.overlay.trades.flatMap((t) =>
      [t.stopLoss, t.takeProfit, t.entryPrice].filter((p): p is number => p != null && Number.isFinite(p) && p > 0),
    );
    const openTradePrices = prepared.overlay.trades
      .filter((t) => t.status === "open")
      .flatMap((t) =>
        [t.stopLoss, t.takeProfit, t.entryPrice].filter((p): p is number => p != null && Number.isFinite(p) && p > 0),
      );

    const rightPriceScale = chart.priceScale("right");
    const safeSetAutoScale = (enabled: boolean) => {
      try {
        rightPriceScale.setAutoScale(enabled);
      } catch {
        // Ignore transient pane/price-scale mount timing issues during route changes.
      }
    };
    const releasePriceScaleForVerticalPan = () => {
      if (!chartRef.current) return;
      const scale = chartRef.current.priceScale("right");
      if (!scale.getVisibleRange()) {
        // Use only the visible window of candles for initial Y range, not all 120 bars
        const visibleCount = chartDensityRef.current.visibleBars;
        const visibleCandles = prepared.candles.slice(-visibleCount);
        const scaleExtraPrices = openTradePrices.length > 0 ? openTradePrices : tradePrices;
        const initialRange = computeInitialPriceRange(visibleCandles, scaleExtraPrices);
        if (initialRange) scale.setVisibleRange(initialRange);
      }
      try {
        scale.setAutoScale(false);
      } catch {
        // Ignore transient pane/price-scale mount timing issues during route changes.
      }
    };
    if (!didSetInitialPriceRangeRef.current) {
      safeSetAutoScale(true);
      requestAnimationFrame(() => {
        releasePriceScaleForVerticalPan();
        didSetInitialPriceRangeRef.current = true;
      });
    } else {
      safeSetAutoScale(false);
    }
    if (tradePrices.length > 0) {
      const tradeMin = Math.min(...tradePrices);
      const tradeMax = Math.max(...tradePrices);
      const openMin = openTradePrices.length > 0 ? Math.min(...openTradePrices) : Infinity;
      const openMax = openTradePrices.length > 0 ? Math.max(...openTradePrices) : -Infinity;
      candle.applyOptions({
        autoscaleInfoProvider: (original: () => import("lightweight-charts").AutoscaleInfo | null) => {
          const auto = original();
          const baseMin = auto?.priceRange?.minValue;
          const baseMax = auto?.priceRange?.maxValue;
          if (!Number.isFinite(baseMin) || !Number.isFinite(baseMax)) {
            autoscaleDebugRef.current = {
              tradeLevelMin: tradeMin,
              tradeLevelMax: tradeMax,
              autoscaleLow: Number.isFinite(baseMin) ? Number(baseMin) : null,
              autoscaleHigh: Number.isFinite(baseMax) ? Number(baseMax) : null,
              wasTradeLevelClampedOrIgnored: false,
            };
            return auto;
          }
          const candleMin = Number(baseMin);
          const candleMax = Number(baseMax);
          // Open trades: always include (no cap) — ensures active entry/SL/TP zones are fully visible
          const baseWithOpen = {
            min: Number.isFinite(openMin) ? Math.min(candleMin, openMin) : candleMin,
            max: Number.isFinite(openMax) ? Math.max(candleMax, openMax) : candleMax,
          };
          // Closed trades: cap at 15% of candle span to avoid flattening candles
          const span = Math.max(candleMax - candleMin, Math.abs(candleMax) * 0.001, 1e-6);
          const expandCap = span * 0.15;
          const capMin = candleMin - expandCap;
          const capMax = candleMax + expandCap;
          const includeMin = tradeMin < capMin ? baseWithOpen.min : Math.min(baseWithOpen.min, tradeMin);
          const includeMax = tradeMax > capMax ? baseWithOpen.max : Math.max(baseWithOpen.max, tradeMax);
          const clampedOrIgnored = tradeMin < capMin || tradeMax > capMax;
          autoscaleDebugRef.current = {
            tradeLevelMin: tradeMin,
            tradeLevelMax: tradeMax,
            autoscaleLow: includeMin,
            autoscaleHigh: includeMax,
            wasTradeLevelClampedOrIgnored: clampedOrIgnored,
          };
          return {
            priceRange: {
              minValue: includeMin,
              maxValue: includeMax,
            },
            margins: auto?.margins,
          };
        },
      });
    } else {
      autoscaleDebugRef.current = {
        tradeLevelMin: null,
        tradeLevelMax: null,
        autoscaleLow: null,
        autoscaleHigh: null,
        wasTradeLevelClampedOrIgnored: false,
      };
      candle.applyOptions({ autoscaleInfoProvider: undefined });
    }

    for (const line of manualLineRefs.current) {
      try {
        chart.removeSeries(line);
      } catch {
        // ignore
      }
    }
    manualLineRefs.current = [];
    if (showManualLevels && manualLevels && prepared.candles.length) {
      const lastTime = String(prepared.candles[prepared.candles.length - 1].time);
      const startTime = prepared.candles[Math.max(0, prepared.candles.length - Math.min(24, prepared.candles.length))]?.time ?? prepared.candles[0].time;
      const endTime = lastTime;
      for (const row of getVisibleManualLevels(manualLevels)) {
        const color = row.key === "entry" ? "#F59E0B" : row.key === "sl" ? "#FF3B30" : "#22C55E";
        const line = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        line.setData([
          { time: startTime as Time, value: row.value },
          { time: endTime as Time, value: row.value },
        ]);
        manualLineRefs.current.push(line);
      }
    }
    const last = prepared.candles[prepared.candles.length - 1];
    const lastClose = toFiniteNumber(last?.close);
    currentPriceLine.setData(
      last && lastClose != null
        ? [{ time: last.time, value: lastClose }]
        : [],
    );

    redrawRef.current = () => {
      const host = hostRef.current;
      const series = candleRef.current;
      const chartNow = chartRef.current;
      if (!host || !series || !chartNow) return;
      const width = Math.max(1, Math.floor(host.clientWidth));
      const height = Math.max(1, Math.floor(host.clientHeight));
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (!overlayEnabled && !showManualLevels) {
        if (tradeSvgSegmentsRef.current.length) {
          tradeSvgSegmentsRef.current = [];
          setTradeSvgSegments([]);
        }
        if (tradeTrianglesRef.current.length) {
          tradeTrianglesRef.current = [];
          setTradeTriangles([]);
        }
        if (tradeHitTargetsRef.current.length) {
          tradeHitTargetsRef.current = [];
          setTradeHitTargets([]);
        }
        if (tradeZonesRef.current.length) {
          tradeZonesRef.current = [];
          setTradeZones([]);
        }
        if (tradeLineLabelsRef.current.length) {
          tradeLineLabelsRef.current = [];
          setTradeLineLabels([]);
        }
        if (currentPriceGuideRef.current) {
          currentPriceGuideRef.current = null;
          setCurrentPriceGuide(null);
        }
        syncPriceAxisLabelRef.current();
        return;
      }

      const renderStartMs = performance.now();
      const nextSvgSegments: SvgLineSegment[] = [];
      const nextTradeTriangles: SvgTradeTriangle[] = [];
      const nextTradeHitTargets: OpenTradeHitTarget[] = [];
      const nextTradeZones: SvgTradeZone[] = [];
      const nextTradeLineLabels: SvgLineLabel[] = [];
      let nextCurrentPriceGuide: CurrentPriceGuide | null = null;
      const selectedTradeId = selectedTradeIdRef.current;
      const isDashboardOverlay = chartDensityRef.current.isDashboard;
      const triangleOffset = isDashboardOverlay ? DASHBOARD_ENTRY_TRIANGLE_PIXEL_OFFSET : ENTRY_TRIANGLE_PIXEL_OFFSET;
      const markerSize = isDashboardOverlay ? DASHBOARD_MARKER_SIZE : DEFAULT_MARKER_SIZE;
      const renderedTradeIds = new Set<string>();
      const skippedTradeReasons = new Map<string, number>();
      const skippedTrades: Array<{ id: string; reason: string }> = [];
      const segmentSkipReasonById = new Map<string, string>();
      const tradeById = new Map(prepared.overlay.trades.map((trade) => [trade.id, trade]));
      const segmentCoordById = new Map<string, { x1: number; x2: number; y: number }>();
      const markerByTradeId = new Map<string, { x: number; y: number }>();
      const visibleLogicalRange = chartNow.timeScale().getVisibleLogicalRange();
      const fromIdx = Math.max(0, Math.floor(visibleLogicalRange?.from ?? 0));
      const toIdx = Math.min(prepared.candles.length - 1, Math.ceil(visibleLogicalRange?.to ?? (prepared.candles.length - 1)));
      const rangeStart = Math.max(0, fromIdx - VISIBLE_TRADE_BUFFER_BARS);
      const rangeEnd = Math.max(rangeStart, toIdx + VISIBLE_TRADE_BUFFER_BARS);
      const rawVisibleTrades = prepared.overlay.trades.filter((trade) => {
        if (trade.status === "open") return true;
        const tradeStart = trade.entryIndex;
        const tradeEnd = trade.exitIndex != null ? trade.exitIndex : trade.entryIndex;
        return tradeEnd >= rangeStart && tradeStart <= rangeEnd;
      });
      const openTrades = rawVisibleTrades.filter((trade) => trade.status === "open");
      const closedTrades = rawVisibleTrades
        .filter((trade) => trade.status !== "open")
        .sort((a, b) => b.entryIndex - a.entryIndex);
      const visibleTrades = isDashboardOverlay
        ? [...openTrades, ...closedTrades.slice(0, Math.max(0, MINI_MODE_MAX_VISIBLE_TRADES - openTrades.length))]
        : rawVisibleTrades;
      const visibleTradeIds = new Set(visibleTrades.map((trade) => trade.id));
      const openTradeIds = new Set(visibleTrades.filter((trade) => trade.status === "open").map((trade) => trade.id));
      const hasExecutedTrades = (data.trades?.length ?? 0) > 0;
      let barPixelStep = 14;
      let xLastCandleForCompact: number | null = null;
      if (prepared.candles.length >= 2) {
        const lastIdx = prepared.candles.length - 1;
        const xLastRaw = chartNow.timeScale().timeToCoordinate(prepared.candles[lastIdx].time);
        const xPrevRaw = chartNow.timeScale().timeToCoordinate(prepared.candles[lastIdx - 1].time);
        if (xLastRaw != null && xPrevRaw != null) {
          const diff = Math.abs(Number(xLastRaw) - Number(xPrevRaw));
          if (Number.isFinite(diff) && diff >= 2) barPixelStep = diff;
        }
        if (xLastRaw != null && Number.isFinite(Number(xLastRaw))) {
          xLastCandleForCompact = Number(xLastRaw);
        }
      }
      for (const segment of prepared.overlay.lineSegments) {
        const tradeId = segment.id.replace(/-(entry|sl|tp)$/, "");
        if (!visibleTradeIds.has(tradeId)) {
          segmentSkipReasonById.set(segment.id, "outside_visible_trade_window");
          continue;
        }
        const xStart = chartNow.timeScale().timeToCoordinate(segment.startTime);
        const xEnd = chartNow.timeScale().timeToCoordinate(segment.endTime);
        const y = series.priceToCoordinate(segment.value);
        if (xStart == null || xEnd == null || y == null) {
          segmentSkipReasonById.set(segment.id, "missing_coordinates");
          continue;
        }
        if (!Number.isFinite(segment.value) || segment.value <= 0) {
          segmentSkipReasonById.set(segment.id, "invalid_price");
          continue;
        }
        const x1 = Number(xStart);
        const x2 = Number(xEnd);
        const yCoord = Number(y);
        if (!Number.isFinite(x1) || !Number.isFinite(x2) || !Number.isFinite(yCoord)) {
          segmentSkipReasonById.set(segment.id, "invalid_coordinates");
          continue;
        }
        const trade = tradeById.get(tradeId);
        const minVisualLength = Math.max(2, barPixelStep * 0.75);
        const safeX2Base = x2 <= x1 ? x1 + minVisualLength : x2;
        const compactOpenX2 = openTradeIds.has(tradeId) && xLastCandleForCompact != null
          ? xLastCandleForCompact + barPixelStep * 1.5
          : null;
        const safeX2 = compactOpenX2 != null
          ? Math.max(x1 + minVisualLength, Math.min(compactOpenX2, safeX2Base))
          : safeX2Base;
        if (safeX2 < -16 || x1 > width + 16) {
          segmentSkipReasonById.set(segment.id, "outside_viewport");
          continue;
        }
        nextSvgSegments.push({
          id: segment.id,
          type: segment.type,
          x1,
          x2: safeX2,
          y: yCoord,
          price: segment.value,
          color: segment.color,
          opacity: segment.type === "entry" ? 0.95 : 0.92,
        });
        segmentCoordById.set(segment.id, { x1, x2: safeX2, y: yCoord });
      }

      const lastCloseValue = toFiniteNumber(prepared.candles[prepared.candles.length - 1]?.close);
      const lastCandleTime = prepared.candles.length ? prepared.candles[prepared.candles.length - 1].time : null;
      const candleByTime = new Map<string, CandlestickData<Time>>();
      for (const c of prepared.candles) {
        candleByTime.set(chartTimeKey(c.time), c);
      }
      // Compact overlay: compute x of last candle for zone right-edge capping
      const xLastCandleCoord = lastCandleTime != null
        ? chartNow.timeScale().timeToCoordinate(lastCandleTime)
        : null;
      const xLastCandle = xLastCandleCoord != null && Number.isFinite(Number(xLastCandleCoord))
        ? Number(xLastCandleCoord)
        : null;

      // Session filter for DAX 1H: skip entry markers outside Berlin 08:00–12:00.
      const applyDaxSessionFilterTrades = isDax1HStrategy(data.displaySymbol, data.timeframe, data.tvSymbol);

      for (const trade of visibleTrades) {
        // Skip entries that fall outside the allowed trading session window
        if (applyDaxSessionFilterTrades && !isDaxSessionTime(String(trade.entryTime || ""))) continue;
        const bar = candleByTime.get(chartTimeKey(trade.entryTime));
        if (!bar) {
          const reason = "missing_entry_candle";
          skippedTradeReasons.set(reason, (skippedTradeReasons.get(reason) ?? 0) + 1);
          if (skippedTrades.length < 20) skippedTrades.push({ id: trade.id, reason });
          continue;
        }
        const candleXRaw = chartNow.timeScale().timeToCoordinate(trade.entryTime);
        const highYRaw = series.priceToCoordinate(bar.high);
        const lowYRaw = series.priceToCoordinate(bar.low);
        if (candleXRaw == null || highYRaw == null || lowYRaw == null) {
          const reason = "missing_entry_coordinates";
          skippedTradeReasons.set(reason, (skippedTradeReasons.get(reason) ?? 0) + 1);
          if (skippedTrades.length < 20) skippedTrades.push({ id: trade.id, reason });
          continue;
        }
        const candleX = Number(candleXRaw);
        const candleYMin = Math.min(Number(highYRaw), Number(lowYRaw));
        const candleYMax = Math.max(Number(highYRaw), Number(lowYRaw));
        if (!Number.isFinite(candleX) || !Number.isFinite(candleYMin) || !Number.isFinite(candleYMax)) {
          const reason = "invalid_entry_coordinates";
          skippedTradeReasons.set(reason, (skippedTradeReasons.get(reason) ?? 0) + 1);
          if (skippedTrades.length < 20) skippedTrades.push({ id: trade.id, reason });
          continue;
        }
        const markerY = trade.direction === "long" ? candleYMax + triangleOffset : candleYMin - triangleOffset;
        nextTradeTriangles.push({
          id: `${trade.id}-entry-marker`,
          kind: "entry",
          x: candleX,
          y: markerY,
          color: trade.direction === "long" ? "#22C55E" : "#FF4D5A",
          direction: trade.direction === "long" ? "up" : "down",
          size: markerSize,
        });
        renderedTradeIds.add(trade.id);
        nextTradeHitTargets.push({
          tradeId: trade.id,
          candleX,
          candleYMin,
          candleYMax,
          markerX: candleX,
          markerY,
        });
        markerByTradeId.set(trade.id, { x: candleX, y: markerY });
        if (trade.status === "closed" && trade.exitTime) {
          const exitXRaw = chartNow.timeScale().timeToCoordinate(trade.exitTime);
          const exitPrice = trade.exitPrice != null && Number.isFinite(Number(trade.exitPrice))
            ? Number(trade.exitPrice)
            : Number(bar.close);
          const exitYRaw = Number.isFinite(exitPrice) && exitPrice > 0 ? series.priceToCoordinate(exitPrice) : null;
          if (exitXRaw != null && exitYRaw != null) {
            const exitX = Number(exitXRaw);
            const exitY = Number(exitYRaw);
            if (Number.isFinite(exitX) && Number.isFinite(exitY)) {
              nextTradeTriangles.push({
                id: `${trade.id}-exit-marker`,
                kind: "exit",
                x: exitX,
                y: exitY,
                color: trade.direction === "long" ? "#22C55E" : "#FF4D5A",
                direction: trade.direction === "long" ? "right" : "left",
                size: isDashboardOverlay ? 4 : 5,
              });
            }
          }
        }

        // maxY excludes the time axis area (bottom ~32px of container)
        const zoneMaxY = height - 32;
        if (selectedTradeId === trade.id) {
          appendTradeSelectionOverlay(trade, segmentCoordById, width, nextTradeZones, nextTradeLineLabels, {
            entry: overlayEntryColor,
            sl: overlaySlColor,
            tp: overlayTpColor,
          }, zoneMaxY);
        } else if (!isDashboardOverlay && trade.status === "open") {
          // Compact zone: cap background to last candle + ~1.5 bar widths
          const compactZoneX2 = xLastCandle != null ? xLastCandle + barPixelStep * 1.5 : undefined;
          appendTradeSelectionOverlay(trade, segmentCoordById, width, nextTradeZones, nextTradeLineLabels, {
            entry: overlayEntryColor,
            sl: overlaySlColor,
            tp: overlayTpColor,
          }, zoneMaxY, compactZoneX2);
        }
      }

      // Determine if this is a session-filtered strategy (DAX 1H: Berlin 08:00–12:00).
      const applyDaxSessionFilter = isDax1HStrategy(data.displaySymbol, data.timeframe, data.tvSymbol);

      for (let i = 0; i < data.signals.length; i += 1) {
        const signal = data.signals[i];
        const signalTime = dayKey(signal.time);
        if (!signalTime) continue;
        const signalType = String(signal.type || "").trim().toLowerCase();
        // Only real trade entries — skip all exit/SL/TP/trend markers
        if (signalType !== "long_entry" && signalType !== "short_entry") continue;
        if (hasExecutedTrades) continue;
        // Session filter: skip entries outside the allowed trading window
        if (applyDaxSessionFilter && !isDaxSessionTime(String(signal.time || ""))) continue;
        const xRaw = chartNow.timeScale().timeToCoordinate(signalTime as Time);
        if (xRaw == null) continue;
        const bar = candleByTime.get(signalTime) ?? candleByTime.get(chartTimeKey(signalTime as Time));
        if (!bar) continue;
        let yRaw: number | null = null;
        let color = "#C7CDD6";
        let direction: "up" | "down" | "left" | "right" = "up";
        let kind: "entry" | "exit" = "entry";
        let size = markerSize;
        if (signalType === "long_entry") {
          const lowY = series.priceToCoordinate(bar.low);
          if (lowY == null) continue;
          yRaw = Number(lowY) + triangleOffset;
          color = "#22C55E";
          direction = "up";
          kind = "entry";
          size = markerSize;
        } else if (signalType === "short_entry") {
          const highY = series.priceToCoordinate(bar.high);
          if (highY == null) continue;
          yRaw = Number(highY) - triangleOffset;
          color = "#FF4D5A";
          direction = "down";
          kind = "entry";
          size = markerSize;
        } else {
          const basePrice = toFiniteNumber(signal.price ?? signal.entry_price ?? signal.close ?? bar.close);
          if (basePrice == null || basePrice <= 0) continue;
          const priceY = series.priceToCoordinate(basePrice);
          if (priceY == null) continue;
          yRaw = Number(priceY);
          kind = "exit";
          direction = "left";
          size = isDashboardOverlay ? 3 : 4.5;
          if (signalType === "tp_hit") {
            color = "#22C55E";
          } else if (signalType === "sl_hit") {
            color = "#FF3B30";
          } else if (signalType === "short_exit") {
            color = "#FF4D5A";
          } else if (signalType === "long_exit") {
            color = "#22C55E";
          } else {
            color = "#A7AFBC";
          }
        }
        const x = Number(xRaw);
        const y = Number(yRaw);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < -20 || x > width + 20) continue;
        nextTradeTriangles.push({
          id: `signal-${data.displaySymbol}-${signalType}-${signalTime}-${i}`,
          kind,
          x,
          y,
          color,
          direction,
          size,
        });
      }

      if (lastCandleTime && lastCloseValue != null) {
        const xRaw = chartNow.timeScale().timeToCoordinate(lastCandleTime);
        const yRaw = series.priceToCoordinate(lastCloseValue);
        if (xRaw != null && yRaw != null) {
          const px = Number(xRaw);
          const py = Number(yRaw);
          if (Number.isFinite(px) && Number.isFinite(py)) {
            const lastCandle = prepared.candles[prepared.candles.length - 1];
            const lastOpen = Number(lastCandle?.open);
            const lastClose = Number(lastCandle?.close);
            const tone =
              Number.isFinite(lastOpen) && Number.isFinite(lastClose)
                ? candleCloseTone(lastOpen, lastClose)
                : "bull";
            const scaleWidthRaw = safePriceScaleWidth(chartNow);
            const scaleColumnWidth =
              typeof scaleWidthRaw === "number" && Number.isFinite(scaleWidthRaw) && scaleWidthRaw > 0
                ? Math.floor(scaleWidthRaw)
                : 0;
            const priceScaleLeft =
              scaleColumnWidth > 0 ? Math.max(px, width - scaleColumnWidth) : width - 1;
            nextCurrentPriceGuide = {
              x1: px,
              x2: priceScaleLeft,
              y: py,
              stroke: priceAxisGuideStrokeColor(tone),
            };
          }
        }
      }

      // Compute scale column width for clipping trade overlay zones at the price axis boundary
      const scaleWidthRawForClip = safePriceScaleWidth(chartNow);
      const nextOverlayScaleWidth =
        typeof scaleWidthRawForClip === "number" && Number.isFinite(scaleWidthRawForClip) && scaleWidthRawForClip > 0
          ? Math.floor(scaleWidthRawForClip)
          : 0;
      if (nextOverlayScaleWidth !== overlayScaleWidthRef.current) {
        overlayScaleWidthRef.current = nextOverlayScaleWidth;
        setOverlayScaleWidth(nextOverlayScaleWidth);
      }

      const panning = panSyncActiveRef.current;
      const overlaySvg =
        panning && shellRef.current
          ? shellRef.current.querySelector<SVGSVGElement>(`.${TRADE_SVG_OVERLAY_CLASS}`)
          : null;

      if (panning && overlaySvg) {
        syncTradeSvgOverlayDom(overlaySvg, {
          segments: nextSvgSegments,
          triangles: nextTradeTriangles,
          tradeZones: nextTradeZones,
          lineLabels: nextTradeLineLabels,
          currentPriceGuide: nextCurrentPriceGuide,
        });
        tradeSvgSegmentsRef.current = nextSvgSegments;
        tradeTrianglesRef.current = nextTradeTriangles;
        tradeHitTargetsRef.current = nextTradeHitTargets;
        tradeZonesRef.current = nextTradeZones;
        tradeLineLabelsRef.current = nextTradeLineLabels;
        currentPriceGuideRef.current = nextCurrentPriceGuide;
      } else {
        if (!equalSegments(tradeSvgSegmentsRef.current, nextSvgSegments)) {
          tradeSvgSegmentsRef.current = nextSvgSegments;
          setTradeSvgSegments(nextSvgSegments);
        }

        if (!equalTriangles(tradeTrianglesRef.current, nextTradeTriangles)) {
          tradeTrianglesRef.current = nextTradeTriangles;
          setTradeTriangles(nextTradeTriangles);
        }

        if (!equalOpenTargets(tradeHitTargetsRef.current, nextTradeHitTargets)) {
          tradeHitTargetsRef.current = nextTradeHitTargets;
          setTradeHitTargets(nextTradeHitTargets);
        }

        if (!equalZones(tradeZonesRef.current, nextTradeZones)) {
          tradeZonesRef.current = nextTradeZones;
          setTradeZones(nextTradeZones);
        }

        if (!equalLabels(tradeLineLabelsRef.current, nextTradeLineLabels)) {
          tradeLineLabelsRef.current = nextTradeLineLabels;
          setTradeLineLabels(nextTradeLineLabels);
        }

        if (!equalGuide(currentPriceGuideRef.current, nextCurrentPriceGuide)) {
          currentPriceGuideRef.current = nextCurrentPriceGuide;
          setCurrentPriceGuide(nextCurrentPriceGuide);
        }
      }
      overlayRenderCountRef.current += 1;
      const renderTimeMs = Math.max(0, performance.now() - renderStartMs);
      if (shellRef.current) {
        const visibleCandles = fromIdx <= toIdx ? prepared.candles.slice(fromIdx, toIdx + 1) : [];
        const candleVisibleLow = visibleCandles.length
          ? Math.min(...visibleCandles.map((c) => Number(c.low)).filter((v) => Number.isFinite(v)))
          : null;
        const candleVisibleHigh = visibleCandles.length
          ? Math.max(...visibleCandles.map((c) => Number(c.high)).filter((v) => Number.isFinite(v)))
          : null;
        const visibleTradeLevels = visibleTrades.flatMap((t) =>
          [t.entryPrice, t.stopLoss, t.takeProfit].filter((v): v is number => v != null && Number.isFinite(v) && v > 0),
        );
        const tradeLevelMin = visibleTradeLevels.length ? Math.min(...visibleTradeLevels) : null;
        const tradeLevelMax = visibleTradeLevels.length ? Math.max(...visibleTradeLevels) : null;
        const modelSegmentById = new Map(prepared.overlay.lineSegments.map((s) => [s.id, s]));
        const renderedSegmentIds = new Set(nextSvgSegments.map((seg) => seg.id));
        const entryLineIssues: Array<{ tradeId: string; reason: string }> = [];
        const slLineIssues: Array<{ tradeId: string; reason: string }> = [];
        const tpLineIssues: Array<{ tradeId: string; reason: string }> = [];
        const openLineIssues: Array<{ tradeId: string; lineType: "entry" | "sl" | "tp"; reason: string }> = [];
        const visibleTradeLineTrace: Array<{
          tradeId: string;
          direction: "long" | "short";
          status: "open" | "closed" | "pending_signal";
          entryTime: string;
          entryPrice: number | null;
          exitTime: string | null;
          exitPrice: number | null;
          stopLossPrice: number | null;
          takeProfitPrice: number | null;
          entryLine: { rendered: boolean; reason: string; x1: number | null; x2: number | null; y: number | null };
          stopLossLine: { rendered: boolean; reason: string; x1: number | null; x2: number | null; y: number | null };
          takeProfitLine: { rendered: boolean; reason: string; x1: number | null; x2: number | null; y: number | null };
        }> = [];
        const entryLineReasonCounts: Record<string, number> = {};
        const slLineReasonCounts: Record<string, number> = {};
        const tpLineReasonCounts: Record<string, number> = {};
        let tradesWithEntryPrice = 0;
        let tradesWithEntryLine = 0;
        let tradesWithStopLossPrice = 0;
        let tradesWithStopLossLine = 0;
        let tradesWithTakeProfitPrice = 0;
        let tradesWithTakeProfitLine = 0;
        let openTrades = 0;
        let openTradesWithEntryLine = 0;
        let openTradesWithStopLossLine = 0;
        let openTradesWithTakeProfitLine = 0;
        let openTradesWithLines = 0;
        let closedTrades = 0;
        let closedLinesEndAtExit = 0;
        let openLinesExtendRight = 0;
        for (const trade of visibleTrades) {
          const entryId = `${trade.id}-entry`;
          const slId = `${trade.id}-sl`;
          const tpId = `${trade.id}-tp`;
          const entrySkipReason = segmentSkipReasonById.get(entryId) ?? null;
          const slSkipReason = segmentSkipReasonById.get(slId) ?? null;
          const tpSkipReason = segmentSkipReasonById.get(tpId) ?? null;
          const entryInViewport = entrySkipReason !== "outside_viewport";
          const slInViewport = slSkipReason !== "outside_viewport";
          const tpInViewport = tpSkipReason !== "outside_viewport";
          const hasEntryPrice = Number.isFinite(trade.entryPrice) && trade.entryPrice > 0;
          const hasSlPrice = trade.stopLoss != null && Number.isFinite(Number(trade.stopLoss)) && Number(trade.stopLoss) > 0;
          const hasTpPrice = trade.takeProfit != null && Number.isFinite(Number(trade.takeProfit)) && Number(trade.takeProfit) > 0;
          const hasEntryLine = renderedSegmentIds.has(entryId);
          const hasSlLine = renderedSegmentIds.has(slId);
          const hasTpLine = renderedSegmentIds.has(tpId);
          if (hasEntryPrice && entryInViewport) {
            tradesWithEntryPrice += 1;
            if (hasEntryLine) tradesWithEntryLine += 1;
            else {
              const reason = entrySkipReason ?? "segment_not_rendered";
              entryLineReasonCounts[reason] = (entryLineReasonCounts[reason] ?? 0) + 1;
              if (entryLineIssues.length < 20) entryLineIssues.push({ tradeId: trade.id, reason });
            }
          }
          if (hasSlPrice && slInViewport) {
            tradesWithStopLossPrice += 1;
            if (hasSlLine) tradesWithStopLossLine += 1;
            else {
              const reason = slSkipReason ?? "segment_not_rendered";
              slLineReasonCounts[reason] = (slLineReasonCounts[reason] ?? 0) + 1;
              if (slLineIssues.length < 20) slLineIssues.push({ tradeId: trade.id, reason });
            }
          }
          if (hasTpPrice && tpInViewport) {
            tradesWithTakeProfitPrice += 1;
            if (hasTpLine) tradesWithTakeProfitLine += 1;
            else {
              const reason = tpSkipReason ?? "segment_not_rendered";
              tpLineReasonCounts[reason] = (tpLineReasonCounts[reason] ?? 0) + 1;
              if (tpLineIssues.length < 20) tpLineIssues.push({ tradeId: trade.id, reason });
            }
          }
          if (trade.status === "open") {
            openTrades += 1;
            if (hasEntryLine) openTradesWithEntryLine += 1;
            if (!hasSlPrice || hasSlLine) openTradesWithStopLossLine += 1;
            if (!hasTpPrice || hasTpLine) openTradesWithTakeProfitLine += 1;
            if (hasEntryPrice && !hasEntryLine && openLineIssues.length < 20) {
              openLineIssues.push({ tradeId: trade.id, lineType: "entry", reason: entrySkipReason ?? "segment_not_rendered" });
            }
            if (hasSlPrice && !hasSlLine && openLineIssues.length < 20) {
              openLineIssues.push({ tradeId: trade.id, lineType: "sl", reason: slSkipReason ?? "segment_not_rendered" });
            }
            if (hasTpPrice && !hasTpLine && openLineIssues.length < 20) {
              openLineIssues.push({ tradeId: trade.id, lineType: "tp", reason: tpSkipReason ?? "segment_not_rendered" });
            }
            const hasOpenLines = hasEntryLine && (!hasSlPrice || hasSlLine) && (!hasTpPrice || hasTpLine);
            if (hasOpenLines) openTradesWithLines += 1;
            const modelEntry = modelSegmentById.get(entryId);
            if (
              modelEntry
              && prepared.overlay.projectedEndTime != null
              && String(modelEntry.endTime) === String(prepared.overlay.projectedEndTime)
            ) {
              openLinesExtendRight += 1;
            }
          } else {
            closedTrades += 1;
            const modelEntry = modelSegmentById.get(entryId);
            if (modelEntry && trade.exitTime && String(modelEntry.endTime) === String(trade.exitTime)) {
              closedLinesEndAtExit += 1;
            }
          }

          const marker = markerByTradeId.get(trade.id);
          const markerVisible = marker != null && marker.x >= -16 && marker.x <= width + 16;
          if (debugRenderingEnabled && markerVisible && visibleTradeLineTrace.length < 40) {
            const entrySegModel = modelSegmentById.get(entryId);
            const slSegModel = modelSegmentById.get(slId);
            const tpSegModel = modelSegmentById.get(tpId);
            const entryCoord = segmentCoordById.get(entryId);
            const slCoord = segmentCoordById.get(slId);
            const tpCoord = segmentCoordById.get(tpId);
            const entryReason = hasEntryLine ? "rendered" : (segmentSkipReasonById.get(entryId) ?? (hasEntryPrice ? "segment_not_rendered" : "missing_entry_price"));
            const slReason = hasSlLine ? "rendered" : (segmentSkipReasonById.get(slId) ?? (hasSlPrice ? "segment_not_rendered" : "missing_stop_loss_price"));
            const tpReason = hasTpLine ? "rendered" : (segmentSkipReasonById.get(tpId) ?? (hasTpPrice ? "segment_not_rendered" : "missing_take_profit_price"));
            visibleTradeLineTrace.push({
              tradeId: trade.id,
              direction: trade.direction,
              status: trade.status,
              entryTime: String(trade.entryTime),
              entryPrice: Number.isFinite(trade.entryPrice) ? trade.entryPrice : null,
              exitTime: trade.exitTime ? String(trade.exitTime) : null,
              exitPrice: trade.exitPrice != null && Number.isFinite(Number(trade.exitPrice)) ? Number(trade.exitPrice) : null,
              stopLossPrice: hasSlPrice ? Number(trade.stopLoss) : null,
              takeProfitPrice: hasTpPrice ? Number(trade.takeProfit) : null,
              entryLine: {
                rendered: hasEntryLine,
                reason: entryReason,
                x1: entryCoord?.x1 ?? (entrySegModel ? Number(chartNow.timeScale().timeToCoordinate(entrySegModel.startTime) ?? NaN) : null),
                x2: entryCoord?.x2 ?? (entrySegModel ? Number(chartNow.timeScale().timeToCoordinate(entrySegModel.endTime) ?? NaN) : null),
                y: entryCoord?.y ?? (entrySegModel ? Number(series.priceToCoordinate(entrySegModel.value) ?? NaN) : null),
              },
              stopLossLine: {
                rendered: hasSlLine,
                reason: slReason,
                x1: slCoord?.x1 ?? (slSegModel ? Number(chartNow.timeScale().timeToCoordinate(slSegModel.startTime) ?? NaN) : null),
                x2: slCoord?.x2 ?? (slSegModel ? Number(chartNow.timeScale().timeToCoordinate(slSegModel.endTime) ?? NaN) : null),
                y: slCoord?.y ?? (slSegModel ? Number(series.priceToCoordinate(slSegModel.value) ?? NaN) : null),
              },
              takeProfitLine: {
                rendered: hasTpLine,
                reason: tpReason,
                x1: tpCoord?.x1 ?? (tpSegModel ? Number(chartNow.timeScale().timeToCoordinate(tpSegModel.startTime) ?? NaN) : null),
                x2: tpCoord?.x2 ?? (tpSegModel ? Number(chartNow.timeScale().timeToCoordinate(tpSegModel.endTime) ?? NaN) : null),
                y: tpCoord?.y ?? (tpSegModel ? Number(series.priceToCoordinate(tpSegModel.value) ?? NaN) : null),
              },
            });
          }
        }
        const skipReasons = Array.from(skippedTradeReasons.entries()).reduce<Record<string, number>>((acc, [reason, count]) => {
          acc[reason] = count;
          return acc;
        }, {});
        const overlayDebugPayload: Record<string, unknown> = {
          chartId: `${data.displaySymbol}:${String(data.timeframe || "D")}`,
          overlayTrades: prepared.overlay.trades.length,
          visibleTrades: visibleTrades.length,
          overlayRenderableTrades: renderedTradeIds.size,
          markersRendered: nextTradeTriangles.length,
          linesRendered: nextSvgSegments.length,
          openTradesVisible: visibleTrades.filter((t) => t.status === "open").length,
          skippedTrades: Math.max(0, prepared.overlay.trades.length - renderedTradeIds.size),
          skipReasons,
          first20Skipped: skippedTrades,
          overlayElementsRendered: nextSvgSegments.length + nextTradeTriangles.length + nextTradeZones.length + nextTradeLineLabels.length,
          renderTimeMs: Number(renderTimeMs.toFixed(3)),
          rerenderCount: overlayRenderCountRef.current,
          expensiveFunctions: [
            "lineSegments_filter_visible_window",
            "timeToCoordinate",
            "priceToCoordinate",
            "visible_trade_marker_projection",
          ],
          tradesWithEntryPrice,
          tradesWithEntryLine,
          tradesWithStopLossPrice,
          tradesWithStopLossLine,
          tradesWithTakeProfitPrice,
          tradesWithTakeProfitLine,
          closedTrades,
          closedLinesEndAtExit,
          openTrades,
          openTradesWithEntryLine,
          openTradesWithStopLossLine,
          openTradesWithTakeProfitLine,
          openTradesWithLines,
          openLinesExtendRight,
          missingEntryLineReasons: entryLineReasonCounts,
          missingStopLossLineReasons: slLineReasonCounts,
          missingTakeProfitLineReasons: tpLineReasonCounts,
          first20LineIssues: [
            ...entryLineIssues.map((it) => ({ ...it, lineType: "entry" })),
            ...slLineIssues.map((it) => ({ ...it, lineType: "sl" })),
            ...tpLineIssues.map((it) => ({ ...it, lineType: "tp" })),
          ].slice(0, 20),
          first20OpenLineIssues: openLineIssues,
        };
        if (debugRenderingEnabled) {
          Object.assign(overlayDebugPayload, {
            candleVisibleLow,
            candleVisibleHigh,
            tradeLevelMin,
            tradeLevelMax,
            autoscaleLow: autoscaleDebugRef.current.autoscaleLow,
            autoscaleHigh: autoscaleDebugRef.current.autoscaleHigh,
            wasTradeLevelClampedOrIgnored: autoscaleDebugRef.current.wasTradeLevelClampedOrIgnored,
            visibleTradeLineTrace,
          });
        }
        shellRef.current.dataset.overlayDebug = JSON.stringify(overlayDebugPayload);
      }

      if (showManualLevels && manualLevels) {
        const lastTime = prepared.candles.length ? String(prepared.candles[prepared.candles.length - 1].time) : null;
        const endTime = lastTime;
        const endX = endTime ? chartNow.timeScale().timeToCoordinate(endTime as Time) : null;
        const handleX = endX == null ? width - 14 : Number(endX);
        for (const row of getVisibleManualLevels(manualLevels)) {
          const yBase = series.priceToCoordinate(row.value);
          if (yBase == null) continue;
          const y = Number(yBase);
          const color = row.key === "entry" ? "#F59E0B" : row.key === "sl" ? "#FF3B30" : "#22C55E";
          ctx.beginPath();
          ctx.arc(handleX, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          if (manualHover === row.key || dragRef.current === row.key) {
            ctx.beginPath();
            ctx.arc(handleX, y, 6.5, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(245,247,250,0.72)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      syncPriceAxisLabelRef.current();
    };

    redrawRef.current();

    const total = prepared.candles.length;
    totalBarsRef.current = total;
    if (!total) {
      setShowGoToLatest(false);
      return;
    }

    // Live-Chart-Auto-View: compute minimum visible bars to show signal candle
    if (liveChartAutoView) {
      const openEntryBarsAgo = prepared.overlay.trades
        .filter((t) => t.status === "open")
        .map((t) => (prepared.candles.length - 1) - t.entryIndex)
        .filter((n) => n >= 0);
      const maxBarsAgo = openEntryBarsAgo.length > 0 ? Math.max(...openEntryBarsAgo) : 0;
      const liveVisibleBars = maxBarsAgo > 0
        ? Math.min(14, Math.max(8, maxBarsAgo + 3))
        : 10;
      chartDensityRef.current = { ...chartDensityRef.current, visibleBars: liveVisibleBars };
    }

    const { visibleBars, rightOffset } = chartDensityRef.current;
    const nextRange = latestVisibleRange(total, visibleBars, rightOffset);
    if (!didSetInitialRangeRef.current) {
      isProgrammaticRangeRef.current = true;
      try {
        chart.timeScale().setVisibleLogicalRange(nextRange);
      } finally {
        isProgrammaticRangeRef.current = false;
      }
      didSetInitialRangeRef.current = true;
      autoFollowRef.current = false;
      setShowGoToLatest(false);
      return;
    }

    if (autoFollowRef.current) {
      isProgrammaticRangeRef.current = true;
      try {
        chart.timeScale().setVisibleLogicalRange(nextRange);
      } finally {
        isProgrammaticRangeRef.current = false;
      }
      setShowGoToLatest(false);
    } else if (!DEBUG_FORCE_GO_TO_LATEST) {
      setShowGoToLatest(true);
    }

    if (!DEBUG_FORCE_GO_TO_LATEST) {
      const range = chart.timeScale().getVisibleLogicalRange();
      const atRight = isAtRightEdge(range, total, chartDensityRef.current.rightOffset);
      autoFollowRef.current = atRight;
      setShowGoToLatest(!atRight);
    }
  }, [allDashboardMode, debugRenderingEnabled, initialVisibleBars, liveChartAutoView, manualHover, manualLevels, overlayEnabled, prepared, selectedTradeId, showManualLevels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const series = candleRef.current;
    if (!canvas || !series || !showManualLevels || !manualLevels || !onManualLevelsChange) return;

    let rafId: number | null = null;
    let unregisterRaf: (() => void) | null = null;

    const pickLevel = (offsetY: number): "entry" | "sl" | "tp" | null => {
      const levels = getVisibleManualLevels(manualLevels);
      let best: "entry" | "sl" | "tp" | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const row of levels) {
        const y = series.priceToCoordinate(row.value);
        if (y == null) continue;
        const dist = Math.abs(Number(y) - offsetY);
        if (dist < bestDist) {
          bestDist = dist;
          best = row.key;
        }
      }
      return bestDist <= 10 ? best : null;
    };

    const applyDrag = (offsetY: number) => {
      const key = dragRef.current;
      if (!key) return;
      const nextPrice = Number(series.coordinateToPrice(offsetY as unknown as any));
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) return;
      onManualLevelsChange({
        direction: manualLevels.direction,
        entry: key === "entry" ? nextPrice : manualLevels.entry,
        stopLoss: key === "sl" ? nextPrice : manualLevels.stopLoss,
        takeProfit: key === "tp" ? nextPrice : manualLevels.takeProfit,
      });
    };

    const onMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const y = event.clientY - rect.top;
      if (!dragRef.current) {
        const hit = pickLevel(y);
        setManualHover(hit);
        canvas.style.cursor = hit ? "ns-resize" : "crosshair";
      } else {
        canvas.style.cursor = "ns-resize";
        if (rafId != null) {
          cancelAnimationFrame(rafId);
          if (unregisterRaf) unregisterRaf();
          unregisterRaf = null;
        }
        rafId = requestAnimationFrame(() => applyDrag(y));
        unregisterRaf = registerMonitoringAnimationFrame(rafId);
      }
      redrawRef.current();
    };

    const onMouseDown = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const hit = pickLevel(y);
      if (!hit) return;
      dragRef.current = hit;
      setManualHover(hit);
      event.preventDefault();
      redrawRef.current();
    };

    const onMouseUp = () => {
      dragRef.current = null;
      redrawRef.current();
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        if (unregisterRaf) unregisterRaf();
      }
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.style.cursor = "crosshair";
    };
  }, [manualLevels, onManualLevelsChange, showManualLevels]);

  useEffect(() => {
    if (!selectedTradeId) return;
    if (tradeHitTargets.some((target) => target.tradeId === selectedTradeId)) return;
    setSelectedTradeId(null);
  }, [tradeHitTargets, selectedTradeId]);

  useEffect(() => {
    selectedTradeIdRef.current = selectedTradeId;
    redrawRef.current();
  }, [selectedTradeId]);

  useEffect(() => {
    setSelectedTradeId(null);
  }, [data.displaySymbol]);

  const scrollToLatest = () => {
    const chart = chartRef.current;
    const total = totalBarsRef.current;
    if (!chart || total <= 0) return;
    const { visibleBars, rightOffset } = chartDensityRef.current;
    const nextRange = latestVisibleRange(total, visibleBars, rightOffset);
    isProgrammaticRangeRef.current = true;
    try {
      chart.timeScale().setVisibleLogicalRange(nextRange);
    } finally {
      isProgrammaticRangeRef.current = false;
    }
    autoFollowRef.current = true;
    setShowGoToLatest(false);
  };

  const isCompactChart = data.variant === "compact";
  const isDashboardChart = allDashboardMode;
  const overlayEntryColor = uiPrefs?.overlayEntryColor ?? DEFAULT_TRADE_ENTRY_COLOR;
  const overlaySlColor = uiPrefs?.overlaySlColor ?? DEFAULT_TRADE_SL_COLOR;
  const overlayTpColor = uiPrefs?.overlayTpColor ?? DEFAULT_TRADE_TP_COLOR;
  const watermarkOpacityPct = clampWatermarkOpacity(uiPrefs?.watermarkOpacity ?? 18);
  const watermarkOpacity = watermarkOpacityPct / 100;
  const priceAxisFontSize = monitoringAxisFontSize(isDashboardChart, isCompactChart || isDashboardChart);
  const showGoToLatestButton = DEBUG_FORCE_GO_TO_LATEST || showGoToLatest;
  const showFullscreenButton = showFullscreenControl && fullscreenZoneActive;

  const handleShellMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const next = isPointerInFullscreenHoverZone(x, y, rect.width, rect.height);
    setFullscreenZoneActive((current) => (current === next ? current : next));
  };

  return (
    <div
      ref={shellRef}
      className={`monitoring-chart-shell ${isDashboardChart ? "monitoring-chart-shell--dashboard" : isCompactChart ? "monitoring-chart-shell--compact" : ""}`}
      data-testid="monitoring-chart-shell"
      data-variant={data.variant ?? "large"}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "visible",
        isolation: "isolate",
        cursor: "crosshair",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseMove={handleShellMouseMove}
      onMouseLeave={() => {
        setHovered(false);
        setFullscreenZoneActive(false);
      }}
    >
      <div
        ref={hostRef}
        className="chartHost"
        style={{ position: "absolute", inset: 0, zIndex: 1, cursor: "crosshair" }}
      />
      {uiPrefs?.watermarkEnabled ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <img
            src={MONITORING_CAPITALIFE_TEXT_LOGO}
            alt=""
            draggable={false}
            decoding="async"
            style={{
              maxWidth: isDashboardChart ? "58%" : isCompactChart ? "64%" : "70%",
              maxHeight: isDashboardChart ? "30%" : isCompactChart ? "36%" : "42%",
              width: "auto",
              height: "auto",
              objectFit: "contain",
              opacity: watermarkOpacity,
              filter: `brightness(${0.45 + watermarkOpacity * 1.2}) contrast(1.05)`,
            }}
          />
        </div>
      ) : null}
      {priceAxisLabel ? (
        <div
          className="monitoring-price-axis-label"
          data-testid="monitoring-price-axis-label"
          data-tone={priceAxisLabel.tone}
          style={{
            position: "absolute",
            left: priceAxisLabel.left,
            top: priceAxisLabel.top,
            width: priceAxisLabel.width,
            transform: "translateY(-50%)",
            zIndex: 30,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: 1,
            minHeight: isDashboardChart ? 14 : isCompactChart ? 20 : 24,
            padding: isDashboardChart ? "0px 4px" : isCompactChart ? "1px 5px" : "2px 6px",
            boxSizing: "border-box",
            borderRadius: isDashboardChart ? 3 : isCompactChart ? 4 : 5,
            background: priceAxisLabel.backgroundColor,
            border: `1px solid ${priceAxisLabelBorderColor(priceAxisLabel.tone)}`,
            lineHeight: 1,
            fontFamily: MONITORING_CHART_FONT_FAMILY,
            fontSize: priceAxisFontSize,
            boxShadow: `0 0 0 1px ${priceAxisLabelShadowColor(priceAxisLabel.tone)}, 0 2px 8px rgba(0, 0, 0, 0.38)`,
          }}
        >
          <span
            style={{
              fontSize: priceAxisFontSize,
              fontWeight: 500,
              color: PRICE_AXIS_TEXT_COLOR,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {priceAxisLabel.priceText}
          </span>
          {priceAxisLabel.countdownText ? (
            <span
              style={{
                fontSize: priceAxisFontSize,
                fontWeight: 400,
                color: PRICE_AXIS_COUNTDOWN_COLOR,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {priceAxisLabel.countdownText}
            </span>
          ) : null}
        </div>
      ) : null}
      {overlayEnabled || showManualLevels ? (
        <TradeSvgOverlay
          segments={tradeSvgSegments}
          triangles={tradeTriangles}
          openTradeTargets={tradeHitTargets}
          onToggleOpenTrade={(tradeId) => {
            setSelectedTradeId((current) => (current === tradeId ? null : tradeId));
          }}
          tradeZones={tradeZones}
          lineLabels={tradeLineLabels}
          currentPriceGuide={currentPriceGuide}
          compactMode={isDashboardChart}
          rightClipPx={overlayScaleWidth}
          bottomClipPx={32}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: showManualLevels ? "auto" : "none",
          zIndex: 6,
        }}
      />
      {showGoToLatestButton && prepared.candles.length > 0 ? (
        <button
          type="button"
          data-testid="chart-go-latest-button"
          onClick={(event) => {
            event.stopPropagation();
            scrollToLatest();
          }}
          aria-label="Go to latest candle"
          title="Go to latest"
          style={{
            position: "absolute",
            right: 12,
            bottom: 44,
            zIndex: 100,
            width: 36,
            height: 36,
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            border: "1px solid rgba(255, 255, 255, 0.12)",
            background: fullscreenZoneActive ? "rgba(22, 26, 32, 0.94)" : "rgba(12, 14, 18, 0.82)",
            color: "#e8edf3",
            cursor: "pointer",
            pointerEvents: "auto",
            opacity: fullscreenZoneActive ? 1 : 0.35,
            backdropFilter: "blur(10px)",
            boxShadow: "0 6px 16px rgba(0, 0, 0, 0.28)",
            transition: "opacity 160ms ease, background 160ms ease, border-color 160ms ease",
          }}
        >
          <ChevronRight size={16} strokeWidth={2.4} />
        </button>
      ) : null}
      {showFullscreenControl ? (
        <button
          type="button"
          data-testid="chart-fullscreen-button"
          onClick={(event) => {
            event.stopPropagation();
            onFullscreenRequest?.();
          }}
          onMouseEnter={() => setFullscreenZoneActive(true)}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          style={{
            position: "absolute",
            left: "50%",
            bottom: 44,
            transform: `translateX(-50%) translateY(${showFullscreenButton ? 0 : 4}px)`,
            zIndex: 100,
            width: 40,
            height: 40,
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            border: "1px solid rgba(255, 255, 255, 0.12)",
            background: showFullscreenButton ? "rgba(22, 26, 32, 0.94)" : "rgba(12, 14, 18, 0.82)",
            color: "#e8edf3",
            cursor: "pointer",
            pointerEvents: showFullscreenButton ? "auto" : "none",
            opacity: showFullscreenButton ? 1 : 0,
            visibility: showFullscreenButton ? "visible" : "hidden",
            backdropFilter: "blur(10px)",
            boxShadow: showFullscreenButton ? "0 8px 20px rgba(0, 0, 0, 0.3)" : "none",
            transition:
              "opacity 180ms ease, transform 180ms ease, visibility 180ms ease, background 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
          }}
        >
          {isFullscreen ? <Minimize2 size={18} strokeWidth={2} /> : <Maximize2 size={18} strokeWidth={2} />}
        </button>
      ) : null}
    </div>
  );
}

export default memo(MonitoringChartInner);
