export type PhysicalComponentId = "zc_seasonal" | "zs_seasonal" | "zw_mzw" | "cl1_seasonal";
export type PhysicalCommodity = "CORN" | "SOY" | "WHEAT" | "CRUDE";
export type PhysicalStatus = "AVAILABLE" | "STALE" | "UNAVAILABLE";
export type DataAccessClass = "FREE" | "FREE_NO_ACCOUNT" | "FREE_ACCOUNT" | "PAID_OPTIONAL" | "PAID_REQUIRED";

export type PhysicalObservation = {
  componentId: PhysicalComponentId;
  commodity: PhysicalCommodity;
  provider: string;
  dataset: string;
  variable: string;
  regionIds: string[];
  observationTimestamp: string | null;
  publicationTimestamp: string | null;
  earliestKnownTimestamp: string | null;
  retrievalTimestamp: string;
  processingVersion: string;
  revisionStatus: "INITIAL" | "REVISED" | "UNKNOWN";
  rawInputs: Record<string, number | string | null>;
  normalizedInputs: Record<string, number | null>;
  score: number | null;
  confidence: number;
  state?: "SUPPORTIVE" | "CONTRADICTORY" | "NEUTRAL" | "STALE" | "UNAVAILABLE";
  status: PhysicalStatus;
  freshnessHours: number | null;
  staleAfterHours: number;
  accessClass: DataAccessClass;
  sourceUrl: string;
  error?: string;
};

export type PhysicalIntelligenceAttachment = {
  componentId: PhysicalComponentId;
  physicalIntelligence: PhysicalObservation | null;
  positionMultiplier: 1;
  shadowOnly: true;
};

export type PhysicalSnapshot = {
  schemaVersion: "1.1.0";
  generatedAt: string;
  mode: "SHADOW_OBSERVATION_ONLY";
  positionMultiplier: 1;
  observations: PhysicalObservation[];
};
