// Stub — supply/demand zone builder
import type { OhlcvPoint } from "@/lib/globe/globe-types";
import type { PineZone } from "@/lib/screener/screenerTypes";

export function buildSupplyDemandZones(_ohlcv: unknown[], _level?: number): PineZone[] {
  return [];
}

export function dedupeNearDuplicateZones<T extends PineZone>(zones: T[]): T[] {
  return zones;
}

export function pickRelevantZones(
  _candles: OhlcvPoint[],
  _zones: PineZone[],
): { demand: PineZone | null; supply: PineZone | null } {
  return { demand: null, supply: null };
}
