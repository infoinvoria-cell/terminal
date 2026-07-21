// Stub for globe port
import type { OhlcvPoint } from "@/lib/globe/globe-types";
import type { PineZone } from "@/lib/globe/screenerTypes";

export type Zone = PineZone;

export function getSupplyDemandZones(_data: unknown[]): PineZone[] {
  return [];
}

export function buildSupplyDemandZones(_ohlcv: unknown[], _options?: unknown): PineZone[] {
  return [];
}

export function dedupeNearDuplicateZones<T extends PineZone>(zones: T[], _threshold?: number): T[] {
  return zones;
}

export function pickRelevantZones(_candles: OhlcvPoint[], zones: PineZone[], _maxZones?: number): { demand: PineZone | null; supply: PineZone | null } {
  const demand = zones.find((z) => z.kind === "demand") ?? null;
  const supply = zones.find((z) => z.kind === "supply") ?? null;
  return { demand, supply };
}
