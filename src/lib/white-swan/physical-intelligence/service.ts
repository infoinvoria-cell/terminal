import { fetchNassCropObservations } from "./providers/nass-crop-progress";
import { fetchNoaaVhpObservation } from "./providers/noaa-vhp";
import { unavailableCrudeObservation } from "./providers/crude-maritime";
import type { PhysicalSnapshot } from "./types";

let cached: { expiresAt: number; snapshot: PhysicalSnapshot } | null = null;
const CACHE_MS = 6 * 60 * 60 * 1000;

export async function getCurrentPhysicalSnapshot(now = new Date()): Promise<PhysicalSnapshot> {
  if (cached && cached.expiresAt > now.getTime()) return cached.snapshot;
  const generatedAt = now.toISOString();
  const [nass, cornSatellite, soySatellite, wheatSatellite] = await Promise.all([
    fetchNassCropObservations(generatedAt),
    fetchNoaaVhpObservation("zc_seasonal", "CORN", generatedAt),
    fetchNoaaVhpObservation("zs_seasonal", "SOY", generatedAt),
    fetchNoaaVhpObservation("zw_mzw", "WHEAT", generatedAt),
  ]);
  const observations = [...nass, cornSatellite, soySatellite, wheatSatellite, unavailableCrudeObservation(generatedAt)];
  const snapshot: PhysicalSnapshot = { schemaVersion: "1.1.0", generatedAt, mode: "SHADOW_OBSERVATION_ONLY", positionMultiplier: 1, observations };
  cached = { expiresAt: now.getTime() + CACHE_MS, snapshot };
  return snapshot;
}

export function resetPhysicalSnapshotCache(): void { cached = null; }
