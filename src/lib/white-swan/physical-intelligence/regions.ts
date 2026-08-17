import config from "./region-config.json";

export type PhysicalRegion = {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  commodity: "CORN" | "SOY" | "WHEAT" | "CRUDE";
  rationale: string;
  source: string;
};

export const PHYSICAL_REGIONS: Record<"CORN" | "SOY" | "WHEAT" | "CRUDE", PhysicalRegion[]> = {
  CORN: config.corn as PhysicalRegion[],
  SOY: config.soy as PhysicalRegion[],
  WHEAT: config.wheat as PhysicalRegion[],
  CRUDE: config.crude as PhysicalRegion[],
};

export function validatePhysicalRegions(): boolean {
  return Object.values(PHYSICAL_REGIONS).every((regions) => regions.every((region) => {
    const [west, south, east, north] = region.bbox;
    return Boolean(region.id && region.name && region.rationale && region.source)
      && west >= -180 && east <= 180 && west < east && south >= -90 && north <= 90 && south < north;
  }));
}
