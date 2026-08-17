import type { PhysicalObservation } from "../types";

export function unavailableCrudeObservation(retrievalTimestamp = new Date().toISOString()): PhysicalObservation {
  return {
    componentId: "cl1_seasonal", commodity: "CRUDE", provider: "Global Fishing Watch / AIS candidate", dataset: "Vessel presence / maritime activity proxy",
    variable: "maritime_activity_proxy", regionIds: ["gulf_mexico_oil_flow"], observationTimestamp: null, publicationTimestamp: null,
    earliestKnownTimestamp: null, retrievalTimestamp, processingVersion: "V1-provider-not-configured", revisionStatus: "UNKNOWN", rawInputs: {},
    normalizedInputs: {}, score: null, confidence: 0, status: "UNAVAILABLE", freshnessHours: null, staleAfterHours: 72,
    accessClass: "FREE_ACCOUNT", sourceUrl: "https://globalfishingwatch.org/datasets-and-code/", error: "No authenticated vessel-activity feed configured; no maritime score asserted.",
  };
}
