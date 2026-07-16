export type CandleCloseTone = "bull" | "bear";



const MS_MINUTE = 60 * 1000;

const MS_HOUR = 60 * MS_MINUTE;

const MS_DAY = 24 * MS_HOUR;

const FIVE_MIN_MS = 5 * MS_MINUTE;



export const PRICE_AXIS_BULL_BG = "#FFFFFF";

export const PRICE_AXIS_BEAR_BG = "#D6B44B";

export const PRICE_AXIS_BULL_STROKE = "#FFFFFF";

export const PRICE_AXIS_BEAR_STROKE = "#D6B44B";

export const PRICE_AXIS_TEXT_COLOR = "#0A0A0A";

export const PRICE_AXIS_COUNTDOWN_COLOR = "#6E737C";



/** Countdown debug fields: timeframe, candleStart, expectedClose, countdownMs (see resolve + buildLivePriceAxisLabel). */

export type CandleCloseCountdownDebug = {

  timeframe: string;

  candleStart: number;

  expectedClose: number;

  countdownMs: number;

};



export function normalizeChartTimeframe(raw: string | null | undefined): string {

  const key = String(raw || "D").trim().toUpperCase();

  if (key === "1D" || key === "DAY" || key === "DAILY") return "D";

  return key;

}



export function timeframeDurationMs(timeframe: string | null | undefined): number | null {

  const tf = normalizeChartTimeframe(timeframe);

  if (tf === "D") return MS_DAY;

  const minuteMatch = /^(\d+)M$/.exec(tf);

  if (minuteMatch) {

    const minutes = Number(minuteMatch[1]);

    return Number.isFinite(minutes) && minutes > 0 ? minutes * MS_MINUTE : null;

  }

  const hourMatch = /^(\d+)H$/.exec(tf);

  if (hourMatch) {

    const hours = Number(hourMatch[1]);

    return Number.isFinite(hours) && hours > 0 ? hours * MS_HOUR : null;

  }

  return null;

}



export function parseBarOpenMs(time: string | number | null | undefined): number | null {

  if (time == null) return null;

  if (typeof time === "number" && Number.isFinite(time)) {

    return time > 1e12 ? time : time * 1000;

  }

  const raw = String(time).trim();

  if (!raw) return null;

  if (/^\d{10,13}$/.test(raw)) {

    const n = Number(raw);

    if (!Number.isFinite(n)) return null;

    return raw.length >= 13 ? n : n * 1000;

  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {

    const ms = Date.parse(`${raw}T00:00:00Z`);

    return Number.isFinite(ms) ? ms : null;

  }

  const ms = Date.parse(raw.includes("T") ? raw : `${raw}T00:00:00Z`);

  return Number.isFinite(ms) ? ms : null;

}



export function getCandleCloseMs(barOpenMs: number, timeframe: string | null | undefined): number | null {

  const duration = timeframeDurationMs(timeframe);

  if (duration == null || !Number.isFinite(barOpenMs)) return null;

  return barOpenMs + duration;

}



export type CandleCloseTiming = {

  candleOpenTime: number;

  candleCloseTime: number;

  remainingMs: number;

  debug: CandleCloseCountdownDebug;

};



/** Align to the active candle period from the last bar open; advance if that close is in the past. */

export function resolveActiveCandleCloseTiming(

  barOpenMs: number,

  timeframe: string | null | undefined,

  nowMs: number = Date.now(),

): CandleCloseTiming | null {

  const duration = timeframeDurationMs(timeframe);

  const tf = normalizeChartTimeframe(timeframe);

  if (duration == null || !Number.isFinite(barOpenMs)) return null;



  let candleOpenTime = barOpenMs;

  let candleCloseTime = candleOpenTime + duration;



  if (nowMs >= candleCloseTime) {

    const elapsed = nowMs - barOpenMs;

    const periods = Math.max(1, Math.floor(elapsed / duration));

    candleOpenTime = barOpenMs + periods * duration;

    candleCloseTime = candleOpenTime + duration;

    if (nowMs >= candleCloseTime) {

      candleOpenTime = candleCloseTime;

      candleCloseTime = candleOpenTime + duration;

    }

  }



  let remainingMs = candleCloseTime - nowMs;

  if (remainingMs <= 0) return null;

  if (remainingMs > duration) return null;



  remainingMs = Math.min(remainingMs, duration);



  return {

    candleOpenTime,

    candleCloseTime,

    remainingMs,

    debug: {

      timeframe: tf,

      candleStart: candleOpenTime,

      expectedClose: candleCloseTime,

      countdownMs: remainingMs,

    },

  };

}



function pad2(value: number): string {

  return String(value).padStart(2, "0");

}



export function formatCountdownToClose(

  remainingMs: number,

  timeframe: string | null | undefined,

  options?: { tickEverySecond?: boolean },

): string {

  const tickEverySecond = options?.tickEverySecond ?? true;

  const duration = timeframeDurationMs(timeframe);

  const tf = normalizeChartTimeframe(timeframe);

  if (duration == null) return "--:--";



  const safeRemaining = Math.max(0, remainingMs);

  if (safeRemaining <= 0 || safeRemaining > duration) return "--:--";



  const cappedMs = Math.min(safeRemaining, duration);

  const totalSec = Math.floor(cappedMs / 1000);



  const minuteMatch = /^(\d+)M$/.exec(tf);

  if (minuteMatch) {

    const minutes = Math.floor(totalSec / 60);

    const seconds = totalSec % 60;

    if (!tickEverySecond) return `${pad2(minutes)}`;

    return `${pad2(minutes)}:${pad2(seconds)}`;

  }



  const hourMatch = /^(\d+)H$/.exec(tf);

  if (hourMatch) {

    const maxHours = Number(hourMatch[1]);

    const hours = Math.floor(totalSec / 3600);

    const minutes = Math.floor((totalSec % 3600) / 60);

    const seconds = totalSec % 60;

    if (maxHours >= 2) {

      if (!tickEverySecond) return `${pad2(hours)}:${pad2(minutes)}`;

      return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;

    }

    if (!tickEverySecond) return `${pad2(minutes)}`;

    return `${pad2(minutes)}:${pad2(seconds)}`;

  }



  if (tf === "D") {

    if (tickEverySecond && cappedMs < MS_DAY) {

      const hours = Math.floor(totalSec / 3600);

      const minutes = Math.floor((totalSec % 3600) / 60);

      const seconds = totalSec % 60;

      return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;

    }

    const rounded = Math.max(FIVE_MIN_MS, Math.round(cappedMs / FIVE_MIN_MS) * FIVE_MIN_MS);

    const roundedSec = Math.floor(rounded / 1000);

    const hours = Math.floor(roundedSec / 3600);

    const minutes = Math.floor((roundedSec % 3600) / 60);

    return `${pad2(hours)}:${pad2(minutes)}`;

  }



  const minutes = Math.floor(totalSec / 60);

  const seconds = totalSec % 60;

  return `${pad2(minutes)}:${pad2(seconds)}`;

}



export function candleCloseTone(open: number, close: number): CandleCloseTone {

  return close >= open ? "bull" : "bear";

}



export function priceAxisBackgroundColor(tone: CandleCloseTone): string {

  return tone === "bull" ? PRICE_AXIS_BULL_BG : PRICE_AXIS_BEAR_BG;

}



export function priceAxisGuideStrokeColor(tone: CandleCloseTone): string {

  return tone === "bull" ? PRICE_AXIS_BULL_STROKE : PRICE_AXIS_BEAR_STROKE;

}



export function priceAxisLabelBorderColor(tone: CandleCloseTone): string {

  return tone === "bull" ? "rgba(255, 255, 255, 0.42)" : "rgba(214, 180, 75, 0.55)";

}



export function priceAxisLabelShadowColor(tone: CandleCloseTone): string {

  return tone === "bull" ? "rgba(255, 255, 255, 0.12)" : "rgba(214, 180, 75, 0.2)";

}



export function formatAxisPrice(value: number): string {

  const abs = Math.abs(value);

  const fractionDigits = abs >= 1000 ? 2 : abs >= 10 ? 2 : abs >= 1 ? 4 : 5;

  return new Intl.NumberFormat("de-DE", {

    minimumFractionDigits: fractionDigits,

    maximumFractionDigits: fractionDigits,

  }).format(value);

}



export function buildLivePriceAxisLabel(input: {

  barTime: string | number | null | undefined;

  open: number;

  close: number;

  timeframe?: string | null;

  nowMs?: number;

  tickEverySecond?: boolean;

}): {

  priceText: string;

  countdownText: string | null;

  tone: CandleCloseTone;

  backgroundColor: string;

} | null {

  const openMs = parseBarOpenMs(input.barTime);

  if (openMs == null || !Number.isFinite(input.close) || !Number.isFinite(input.open)) return null;



  const tone = candleCloseTone(input.open, input.close);

  const timing = resolveActiveCandleCloseTiming(openMs, input.timeframe, input.nowMs);

  const countdownText = timing

    ? formatCountdownToClose(timing.remainingMs, input.timeframe, { tickEverySecond: input.tickEverySecond ?? true })

    : "--:--";



  return {

    priceText: formatAxisPrice(input.close),

    countdownText,

    tone,

    backgroundColor: priceAxisBackgroundColor(tone),

  };

}


