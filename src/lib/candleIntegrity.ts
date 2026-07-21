import type { OhlcvPoint } from "@/lib/globe/globe-types";

export function inspectOhlcvPoint(point: OhlcvPoint | null | undefined): { valid: boolean; point: OhlcvPoint | null } {
  if (!point) return { valid: false, point: null };
  const { open, high, low, close } = point;
  if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return { valid: false, point: null };
  if (high < low || high < open || high < close || low > open || low > close) return { valid: false, point: null };
  return { valid: true, point };
}

export function filterValidOhlcvSeries(points: OhlcvPoint[] | null | undefined): OhlcvPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter((p) => inspectOhlcvPoint(p).valid);
}
