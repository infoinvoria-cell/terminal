import { fetchOptionalGlobeJson } from "@/lib/globe/api";

export type PhysicalCommodity = "CORN" | "SOY" | "WHEAT" | "CRUDE";
export type PhysicalState = "SUPPORTIVE" | "CONTRADICTORY" | "NEUTRAL" | "STALE" | "UNAVAILABLE";

export type PhysicalObservation = {
  componentId: string;
  commodity: PhysicalCommodity;
  provider: string;
  variable: string;
  regionIds: string[];
  observationTimestamp: string | null;
  publicationTimestamp: string | null;
  retrievalTimestamp: string;
  score: number | null;
  confidence: number;
  state?: PhysicalState;
  status: "AVAILABLE" | "STALE" | "UNAVAILABLE";
  freshnessHours: number | null;
  staleAfterHours: number;
  accessClass: string;
  sourceUrl: string;
  rawInputs: Record<string, number | string | null>;
}

export type PhysicalIntelResponse = {
  schemaVersion?: string;
  generatedAt: string;
  mode: "SHADOW_OBSERVATION_ONLY";
  positionMultiplier: 1;
  observations: PhysicalObservation[];
};

export type PhysicalRegionOverlay = {
  id: string;
  label: string;
  commodity: Exclude<PhysicalCommodity, "CRUDE">;
  bbox: [number, number, number, number];
  score: number | null;
  state: PhysicalState;
  updatedAt: string;
  source: string;
  freshnessHours: number | null;
  officialScore: number | null;
  vhiScore: number | null;
};

export const PHYSICAL_REGION_BBOXES: Record<string, {
  label: string;
  commodity: Exclude<PhysicalCommodity, "CRUDE">;
  bbox: [number, number, number, number];
}> = {
  us_corn_belt: { label: "US Corn Belt", commodity: "CORN", bbox: [-104.1, 36.9, -80.0, 49.4] },
  us_soy_production: { label: "US Soy Production", commodity: "SOY", bbox: [-106.7, 29.5, -75.0, 49.4] },
  us_wheat_production: { label: "US Wheat Plains", commodity: "WHEAT", bbox: [-112.0, 25.0, -94.0, 49.4] },
};

const PHYSICAL_API_TTL = 6 * 60 * 60 * 1000;

export async function getPhysicalIntelligence(): Promise<PhysicalIntelResponse | null> {
  return fetchOptionalGlobeJson<PhysicalIntelResponse | null>(
    "/api/white-swan/physical-intelligence",
    PHYSICAL_API_TTL,
    null,
  );
}

export function buildPhysicalRegions(snapshot: PhysicalIntelResponse | null): PhysicalRegionOverlay[] {
  if (!snapshot) return [];
  return Object.entries(PHYSICAL_REGION_BBOXES).flatMap(([id, config]) => {
    const observations = (snapshot.observations ?? []).filter((row) => row.commodity === config.commodity);
    const observation = observations.find((row) => row.provider.toLowerCase().includes("usda"))
      ?? observations.find((row) => row.provider.toLowerCase().includes("noaa"))
      ?? observations[0];
    if (!observation) return [];
    const official = observations.find((row) => row.provider.toLowerCase().includes("usda"));
    const vhi = observations.find((row) => row.provider.toLowerCase().includes("noaa"));
    return [{
      id,
      label: config.label,
      commodity: config.commodity,
      bbox: config.bbox,
      score: observation.score,
      state: observation.state ?? (observation.status === "AVAILABLE" ? "NEUTRAL" : observation.status),
      updatedAt: observation.observationTimestamp ?? observation.retrievalTimestamp,
      source: observation.provider,
      freshnessHours: observation.freshnessHours,
      officialScore: official?.score ?? null,
      vhiScore: vhi?.score ?? null,
    }];
  });
}

export function physicalObservationFor(
  snapshot: PhysicalIntelResponse | null,
  commodity: PhysicalCommodity,
): PhysicalObservation | null {
  return snapshot?.observations?.find((row) => row.commodity === commodity) ?? null;
}
