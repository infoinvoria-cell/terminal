import { filterValidOhlcvSeries, inspectOhlcvPoint } from "@/lib/candleIntegrity";
import type { OhlcvPoint, TimeseriesResponse } from "@/lib/globe/globe-types";

export function sanitizeOhlcvPoint(point: OhlcvPoint | null | undefined): OhlcvPoint | null {
  const inspected = inspectOhlcvPoint(point);
  if (!inspected.valid || !inspected.point) return null;
  return {
    t: inspected.point.t,
    open: inspected.point.open,
    high: inspected.point.high,
    low: inspected.point.low,
    close: inspected.point.close,
    volume: inspected.point.volume ?? null,
  };
}

export function sanitizeOhlcvSeries(points: OhlcvPoint[] | null | undefined): OhlcvPoint[] {
  return filterValidOhlcvSeries(points).map((row) => ({
    t: row.t,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume ?? null,
  }));
}

export function sanitizeTimeseriesPayload(payload: TimeseriesResponse | null | undefined): TimeseriesResponse | null {
  if (!payload) return null;
  return {
    ...payload,
    ohlcv: sanitizeOhlcvSeries(payload.ohlcv),
  };
}
