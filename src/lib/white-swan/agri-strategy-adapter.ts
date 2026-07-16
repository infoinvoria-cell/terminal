// White Swan Analytics — Agri Strategy Adapter
// Bridges agri-v2-registry + dashboard_snapshot → White Swan Analytics types.
// Research/monitoring/paper only. No live signals, no orders.

import {
  getAllAgriAssets,
  getAgriKindsForAsset,
  getAgriStrategiesForKind,
  type AgriStrategyKind,
} from "@/lib/agri/agri-v2-registry";
import { combineKindDirections, kindsToWorkspaceStrategyType } from "./agri-vsm-selector";
import type { AgriAssetAnalytics, AgriKindAnalytics, AgriStrategySignal } from "./agri-strategy-types";

export { kindsToWorkspaceStrategyType };

/**
 * Returns the available V/S/M kinds for a given agri asset symbol.
 * Source: agri-v2-registry (not dashboard_snapshot — registry is the source of truth for availability).
 */
export function getAvailableKindsForSymbol(symbol: string): { valuation: boolean; seasonal: boolean; macro: boolean } {
  const asset = getAllAgriAssets().find((a) => a.symbol === symbol);
  if (!asset) return { valuation: false, seasonal: false, macro: false };
  return getAgriKindsForAsset(asset.symbol);
}

/**
 * Builds an AgriAssetAnalytics payload for White Swan, given the currently active kinds.
 * All signals are paper-only; directions are NONE since live engine output is not read here —
 * this is a structural adapter, not a signal resolver.
 */
export function buildAgriAssetAnalytics(
  symbol: string,
  activeKinds: AgriStrategyKind[],
): AgriAssetAnalytics {
  const asset = getAllAgriAssets().find((a) => a.symbol === symbol);
  const displayName = asset?.displayName ?? symbol;

  const kindResults: AgriKindAnalytics[] = activeKinds.map((kind) => {
    const strategies = asset ? getAgriStrategiesForKind(asset.symbol, kind) : [];
    const signals: AgriStrategySignal[] = strategies.map((s) => ({
      symbol,
      kind,
      strategyId: s.id,
      strategyName: s.displayLabel,
      direction: "NONE",
      tier: s.tier,
      isDefault: s.tier === "FINAL_CORE",
      paperOnly: true,
    }));

    return {
      kind,
      activeStrategies: signals,
      combinedDirection: "NONE",
    };
  });

  const combined = combineKindDirections(
    kindResults
      .filter((kr): kr is typeof kr & { combinedDirection: "LONG" | "SHORT" | "NONE" } =>
        kr.combinedDirection !== "CONFLICT")
      .map((kr) => ({ kind: kr.kind, direction: kr.combinedDirection })),
  );

  return {
    symbol,
    displayName,
    activeKinds,
    kindResults,
    overallDirection: combined.direction,
    paperOnly: true,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Returns analytics for all agri assets with given active kinds per symbol.
 */
export function buildAllAgriAnalytics(
  activeKindsBySymbol: Record<string, AgriStrategyKind[]>,
): AgriAssetAnalytics[] {
  return getAllAgriAssets().map((asset) =>
    buildAgriAssetAnalytics(asset.symbol, activeKindsBySymbol[asset.symbol] ?? []),
  );
}
