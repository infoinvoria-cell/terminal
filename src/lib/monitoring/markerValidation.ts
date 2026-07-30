/**
 * Marker provenance validation — fail-closed.
 *
 * Every visible signal marker (Entry, Exit, Stop) must carry a full provenance
 * record before it may be rendered. Missing any field → marker is suppressed.
 *
 * This is a pure module (no I/O). Wire it into the rendering layer so that
 * markers are filtered before they reach the chart series.
 */

/** All 8 required provenance fields for a renderable marker. */
export type MarkerProvenance = {
  engineId: string;
  engineVersion: string;
  eventId: string;
  calculationTimestamp: string;
  candleTimestamp: string;
  dataVersion: string;
  signalType: string;
  releaseStatus: string;
};

export type MarkerValidationResult =
  | { valid: true; provenance: MarkerProvenance }
  | { valid: false; missingFields: string[] };

/** Validate that an object carries all 8 required marker provenance fields. */
export function validateMarkerProvenance(
  marker: Record<string, unknown>,
): MarkerValidationResult {
  const required: Array<keyof MarkerProvenance> = [
    "engineId",
    "engineVersion",
    "eventId",
    "calculationTimestamp",
    "candleTimestamp",
    "dataVersion",
    "signalType",
    "releaseStatus",
  ];
  const missingFields = required.filter(
    (field) => !marker[field] || String(marker[field]).trim() === "",
  );
  if (missingFields.length > 0) {
    return { valid: false, missingFields };
  }
  return {
    valid: true,
    provenance: {
      engineId: String(marker.engineId),
      engineVersion: String(marker.engineVersion),
      eventId: String(marker.eventId),
      calculationTimestamp: String(marker.calculationTimestamp),
      candleTimestamp: String(marker.candleTimestamp),
      dataVersion: String(marker.dataVersion),
      signalType: String(marker.signalType),
      releaseStatus: String(marker.releaseStatus),
    },
  };
}

/**
 * Filter a marker array to only those that:
 * 1. Carry all 8 required provenance fields
 * 2. Have `releaseStatus === "approved"` (or the caller's override)
 * 3. Have a `dataVersion` that matches `currentDataVersion` when provided
 *
 * Returns the filtered array. Logs suppressed markers to console.warn in dev.
 */
export function filterValidMarkers<T extends Record<string, unknown>>(
  markers: T[],
  options?: {
    signalAllowed?: boolean;
    currentDataVersion?: string;
    currentEngineVersion?: string;
    requireApprovedStatus?: boolean;
  },
): T[] {
  const {
    signalAllowed = true,
    currentDataVersion,
    currentEngineVersion,
    requireApprovedStatus = false,
  } = options ?? {};

  if (!signalAllowed) return [];

  return markers.filter((marker) => {
    const result = validateMarkerProvenance(marker);
    if (!result.valid) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[MarkerValidation] Suppressed marker — missing fields:",
          result.missingFields,
          marker,
        );
      }
      return false;
    }
    const prov = result.provenance;
    if (requireApprovedStatus && prov.releaseStatus !== "approved") {
      return false;
    }
    if (currentDataVersion && prov.dataVersion !== currentDataVersion) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[MarkerValidation] Suppressed stale marker — dataVersion mismatch: marker=${prov.dataVersion} current=${currentDataVersion}`,
        );
      }
      return false;
    }
    if (currentEngineVersion && prov.engineVersion !== currentEngineVersion) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[MarkerValidation] Suppressed stale marker — engineVersion mismatch: marker=${prov.engineVersion} current=${currentEngineVersion}`,
        );
      }
      return false;
    }
    return true;
  });
}
