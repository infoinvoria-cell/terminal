import type { PhysicalObservation } from "./types";

export function clampScore(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

/** Transparent condition score: current good+excellent minus prior-year good+excellent, ×5. */
export function cropConditionScore(currentGoodExcellent: number, priorYearGoodExcellent: number): number {
  if (![currentGoodExcellent, priorYearGoodExcellent].every(Number.isFinite)) {
    throw new Error("crop condition inputs must be finite");
  }
  return clampScore((currentGoodExcellent - priorYearGoodExcellent) * 5);
}

export function freshnessHours(observationTimestamp: string | null, now = new Date()): number | null {
  if (!observationTimestamp) return null;
  const age = now.getTime() - new Date(observationTimestamp).getTime();
  return age >= 0 ? age / 3_600_000 : null;
}

export function resolvePhysicalStatus(observation: Pick<PhysicalObservation, "score" | "freshnessHours" | "staleAfterHours" | "earliestKnownTimestamp">, now = new Date()): "AVAILABLE" | "STALE" | "UNAVAILABLE" {
  if (observation.score == null || observation.earliestKnownTimestamp == null) return "UNAVAILABLE";
  if (new Date(observation.earliestKnownTimestamp).getTime() > now.getTime()) return "UNAVAILABLE";
  if (observation.freshnessHours != null && observation.freshnessHours > observation.staleAfterHours) return "STALE";
  return "AVAILABLE";
}
