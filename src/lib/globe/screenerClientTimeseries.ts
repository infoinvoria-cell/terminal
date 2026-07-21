// Stub for globe port
import type { TimeseriesResponse } from "@/lib/globe/globe-types";

export type TimeseriesPoint = { time: number; value: number };

export async function fetchClientTimeseries(_assetId: string, _options?: unknown): Promise<TimeseriesPoint[]> {
  return [];
}

export async function fetchScreenerTimeseriesWithFallback(
  _args: unknown,
): Promise<TimeseriesResponse | null> {
  return null;
}

export function readScreenerTimeseriesMemory(_key: string): TimeseriesResponse | null {
  return null;
}

export function screenerTimeseriesCacheKey(_assetId: string, _source?: string): string {
  return `${_assetId}:${_source ?? "default"}`;
}

export function timeseriesHasValidOhlcv(_payload: unknown): boolean {
  return false;
}

export function writeScreenerTimeseriesMemory(_key: string, _value: unknown): void {
  // no-op stub
}
