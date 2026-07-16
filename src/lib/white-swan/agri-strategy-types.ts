// White Swan Analytics — Agri Strategy Types
// Research/monitoring only. No live execution. No order generation.
// usedAsLiveSignal=false, canBePromotedToLiveSignal=false always.

import type { AgriStrategyKind } from "@/lib/agri/agri-v2-registry";

/** A single strategy signal as consumed by White Swan Analytics. */
export type AgriStrategySignal = {
  symbol: string;
  kind: AgriStrategyKind;
  strategyId: string;
  strategyName: string;
  direction: "LONG" | "SHORT" | "NONE" | "CONFLICT";
  tier: "FINAL_CORE" | "FINAL_LIMITED" | "QUARANTINE" | "REJECTED" | "RESEARCH_CANDIDATE";
  isDefault: boolean;
  /** Paper-only — never a live order. */
  paperOnly: true;
};

/** Per-kind summary for a single agri asset. */
export type AgriKindAnalytics = {
  kind: AgriStrategyKind;
  activeStrategies: AgriStrategySignal[];
  combinedDirection: "LONG" | "SHORT" | "NONE" | "CONFLICT";
  conflictDetails?: string;
};

/** Full analytics payload for one agri asset across active V/S/M kinds. */
export type AgriAssetAnalytics = {
  symbol: string;
  displayName: string;
  activeKinds: AgriStrategyKind[];
  kindResults: AgriKindAnalytics[];
  /** Cross-kind combined direction. CONFLICT when LONG and SHORT coexist. */
  overallDirection: "LONG" | "SHORT" | "NONE" | "CONFLICT";
  paperOnly: true;
  generatedAt: string;
};

/** Conflict result when combining signals. */
export type AgriVsmConflictResult =
  | { conflict: false; direction: "LONG" | "SHORT" | "NONE" }
  | { conflict: true; direction: "CONFLICT"; longKinds: AgriStrategyKind[]; shortKinds: AgriStrategyKind[] };
