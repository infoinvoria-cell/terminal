// White Swan Analytics — V/S/M Signal Conflict Logic
// Pure functions — no side effects, no external calls, no order generation.

import type { AgriStrategyKind } from "@/lib/agri/agri-v2-registry";
import type { AgriVsmConflictResult } from "./agri-strategy-types";

/** Maps a V/S/M kind to the MonitoringStrategyKind used by the tester engine. */
export function kindToTesterStrategyKind(kind: AgriStrategyKind): "macro_valuation" | "seasonal" {
  return kind === "seasonal" ? "seasonal" : "macro_valuation";
}

/**
 * Combines directions from multiple active kinds.
 * Rule: LONG + SHORT = CONFLICT (no automatic net signal).
 * NONE from one kind is ignored when another kind produces a directional signal.
 */
export function combineKindDirections(
  kindDirections: Array<{ kind: AgriStrategyKind; direction: "LONG" | "SHORT" | "NONE" }>,
): AgriVsmConflictResult {
  const longKinds = kindDirections.filter((k) => k.direction === "LONG").map((k) => k.kind);
  const shortKinds = kindDirections.filter((k) => k.direction === "SHORT").map((k) => k.kind);

  if (longKinds.length > 0 && shortKinds.length > 0) {
    return { conflict: true, direction: "CONFLICT", longKinds, shortKinds };
  }
  if (longKinds.length > 0) return { conflict: false, direction: "LONG" };
  if (shortKinds.length > 0) return { conflict: false, direction: "SHORT" };
  return { conflict: false, direction: "NONE" };
}

/**
 * Given a set of active V/S/M kinds for an asset, returns the suggested
 * MonitoringStrategyWorkspace selectedStrategyType value.
 *
 * Single kind → its matching type.
 * Multiple or empty → "all".
 */
export function kindsToWorkspaceStrategyType(
  activeKinds: AgriStrategyKind[],
): "valuation" | "seasonal" | "macro" | "all" {
  if (activeKinds.length !== 1) return "all";
  const [kind] = activeKinds;
  if (kind === "seasonal") return "seasonal";
  if (kind === "valuation") return "valuation";
  if (kind === "macro") return "macro";
  return "all";
}
