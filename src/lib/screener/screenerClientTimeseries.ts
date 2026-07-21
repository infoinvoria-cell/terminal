// Stub — screener timeseries client
import type { TimeseriesResponse } from "@/lib/globe/globe-types";

export function screenerTimeseriesCacheKey(assetId: string, dataSource: string): string {
  return `screener:${assetId}:${dataSource}`;
}

export function timeseriesHasValidOhlcv(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.ohlcv) && (d.ohlcv as unknown[]).length > 0;
}

const memoryCache = new Map<string, TimeseriesResponse>();

export function readScreenerTimeseriesMemory(key: string): TimeseriesResponse | null {
  return memoryCache.get(key) ?? null;
}

export function writeScreenerTimeseriesMemory(key: string, data: TimeseriesResponse): void {
  memoryCache.set(key, data);
}

export async function fetchScreenerTimeseriesWithFallback(_opts: {
  assetId: string;
  timeframe: string;
  preferredSource?: string;
  continuousMode?: string;
}): Promise<TimeseriesResponse | null> {
  return null;
}
