/**
 * Core Invest — Single Source of Truth for asset colors.
 * Used in: MonitoringGrid (candle cards, benchmark chart, donuts, legend, signals table).
 * Never define these inline; always import from here.
 */

export const CORE_INVEST_COLORS = {
  spy:       "#e24f6c",
  spmo:      "#0065ff",
  qqq:       "#448af4",
  gld:       "#ffe66e",
  qqqPine1:  "#018eb7",
  qqqPine2:  "#58b4cf",
  copper:    "#ce7c54",
  chf:       "#ff0000",
  portfolio: "#ffffff",
} as const;

export type CoreInvestAssetId = keyof typeof CORE_INVEST_COLORS;

/** Returns the canonical color for a Core Invest asset ID, or a neutral fallback. */
export function getCoreInvestColor(id: string): string {
  return (CORE_INVEST_COLORS as Record<string, string>)[id] ?? "#9CA3AF";
}
