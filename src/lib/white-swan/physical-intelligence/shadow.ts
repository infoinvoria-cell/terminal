import type { PhysicalComponentId, PhysicalIntelligenceAttachment, PhysicalObservation } from "./types";

const TARGETS = new Set<PhysicalComponentId>(["zc_seasonal", "zs_seasonal", "cl1_seasonal"]);

export function attachShadowPhysicalIntelligence(componentId: string, observation: PhysicalObservation | null): PhysicalIntelligenceAttachment | null {
  if (!TARGETS.has(componentId as PhysicalComponentId)) return null;
  return { componentId: componentId as PhysicalComponentId, physicalIntelligence: observation, positionMultiplier: 1, shadowOnly: true };
}

export function hypotheticalShadowMultiplier(observation: PhysicalObservation | null): 0.95 | 1 {
  if (!observation || observation.status !== "AVAILABLE" || observation.score == null) return 1;
  return observation.score <= -50 ? 0.95 : 1;
}

export function canonicalPositionMultiplier(): 1 {
  return 1;
}

export type CanonicalExecutionRow = {
  tradeId: string;
  position: number;
  pnl: number;
  margin: number;
};

/** V1 identity projection: shadow metadata is deliberately not an execution transform. */
export function preserveCanonicalExecution<T extends CanonicalExecutionRow>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}
