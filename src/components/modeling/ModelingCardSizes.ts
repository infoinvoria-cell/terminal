/**
 * Per-model card size metadata — V2
 *
 * The size belongs to the MODEL, not the registry selection entry.
 * Return Distribution is always COMPACT regardless of whether SPY or White Swan is selected.
 */

export type CardSizeClass = "COMPACT" | "STANDARD" | "WIDE" | "HERO";

/** Canonical pixel height for each size class (chart + header). */
export const CARD_HEIGHTS: Record<CardSizeClass, number> = {
  HERO:     520,
  STANDARD: 340,
  WIDE:     380,
  COMPACT:  240,
};

/** Column allocation within a 6-column CSS grid row (used internally). */
export const CARD_COLS: Record<CardSizeClass, number> = {
  HERO:     3, // 3/6 = 50% (hero always paired 2-up)
  STANDARD: 3, // 3/6 = 50%
  WIDE:     6, // full width
  COMPACT:  2, // 2/6 ≈ 33%
};

/**
 * Per-model size class.
 * Models not listed here default to STANDARD.
 */
export const MODEL_CARD_SIZES: Record<string, CardSizeClass> = {
  // Hero section
  "equity":               "HERO",
  "mc-paths":             "HERO",
  "drawdown":             "HERO",
  "mc-outcome":           "HERO",

  // Wide — genuine complexity that benefits from full width
  "efficient-frontier":   "WIDE",

  // Standard — balanced 50/50
  "rolling":              "STANDARD",
  "dd-recovery":          "STANDARD",
  "regression":           "STANDARD",
  "dyn-correlation":      "STANDARD",
  "var-surface":          "STANDARD",
  "rolling-risk-surface": "STANDARD",
  "mc-quantile-surface":  "STANDARD",
  "correlation-matrix":   "STANDARD",
  "pca":                  "STANDARD",

  // Compact — dense info, works at 1/3 width
  "return-dist":          "COMPACT",
  "tail-risk":            "COMPACT",
  "trade-expectancy":     "COMPACT",
  "lln-convergence":      "COMPACT",
  "path-dependency":      "COMPACT",
};

export function getCardSize(modelId: string): CardSizeClass {
  return MODEL_CARD_SIZES[modelId] ?? "STANDARD";
}

export function getCardHeight(modelId: string): number {
  return CARD_HEIGHTS[getCardSize(modelId)];
}
