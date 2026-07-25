/**
 * Pattern Quality — shared types and utilities for PFWF quality state.
 * Quality is exclusively derived from Strict Pattern Family Walk-Forward OOS.
 */

import type { PatternFamilyWFResult } from "./patternFamilyWalkForward";
import { PFWF_CONFIG_VERSION } from "./patternFamilyWalkForward";
import type { PatternCandidate } from "./patternSelection";
import { SEASONALITY_QUALITY_RISK_INPUT_VERSION } from "./versions";

// Default WF config used in all auto-run quality checks.
export const QUALITY_DEFAULT_INITIAL_TRAINING_YEARS = 10;
export const QUALITY_DEFAULT_OOS_BLOCK_YEARS        = 2;

/** Lifecycle state for a single quality run. */
export type PatternQualityEntry =
  | { status: "loading" }
  | { status: "done"; result: PatternFamilyWFResult }
  | { status: "error" };

/**
 * Fully-versioned cache key.
 *
 * Format: pfwf:{configVersion}:{assetId}:{direction}:S{startSlot}:H{holdingDays}:IT{initialTraining}:OOS{oosBlock}
 *
 * Changing initialTrainingYears, oosBlockYears, or PFWF_CONFIG_VERSION automatically invalidates
 * old cached results — preventing stale quality from a wrong configuration from being served.
 */
export function patternQualityKey(
  assetId:              string,
  pattern:              PatternCandidate,
  initialTrainingYears: number = QUALITY_DEFAULT_INITIAL_TRAINING_YEARS,
  oosBlockYears:        number = QUALITY_DEFAULT_OOS_BLOCK_YEARS,
): string {
  return [
    "pfwf",
    PFWF_CONFIG_VERSION,
    SEASONALITY_QUALITY_RISK_INPUT_VERSION,
    assetId,
    pattern.direction,
    `S${pattern.startSlot}`,
    `H${pattern.holdingDays}`,
    `IT${initialTrainingYears}`,
    `OOS${oosBlockYears}`,
  ].join(":");
}

/** Map a PatternQualityEntry to display-ready values for the quality ring. */
export function qualityDisplayFromEntry(entry: PatternQualityEntry | null | undefined): {
  pct:   number;
  empty: boolean;
  note:  string;
  color: string;
} {
  const C_WHITE   = "#F0F3F7";
  const C_GOLD    = "#DCC476";
  const C_TEXT_3  = "#6A7785";
  const C_SILVER  = "#A8B4C4";

  if (!entry || entry.status === "error") {
    return { pct: 50, empty: true, note: "Not tested", color: C_TEXT_3 };
  }
  if (entry.status === "loading") {
    return { pct: 50, empty: true, note: "Calculating…", color: C_TEXT_3 };
  }

  const q = entry.result.quality;
  const score = q.qualityScore ?? 0;

  // Use numeric score for ring fill; status for label
  switch (q.status) {
    case "Excellent":
      return { pct: score, empty: false, note: `${score} · Excellent`, color: C_WHITE };
    case "Strong":
      return { pct: score, empty: false, note: `${score} · Strong`,   color: C_WHITE };
    case "Promising":
      return { pct: score, empty: false, note: `${score} · Promising`, color: C_SILVER };
    case "Weak":
      return { pct: score, empty: false, note: `${score} · Weak`,      color: C_GOLD };
    case "Failed":
      return { pct: score, empty: false, note: `${score} · Failed`,    color: C_GOLD };
    case "Insufficient OOS sample":
      return { pct: 50,    empty: true,  note: "Insufficient",          color: C_TEXT_3 };
    default:
      return { pct: 50,    empty: true,  note: "Not tested",            color: C_TEXT_3 };
  }
}
