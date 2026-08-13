/**
 * Shared Cartesian chart geometry tokens — Modeling Studio V2
 *
 * All standard 2D charts (equity, drawdown, rolling metrics, LLN, path dependency,
 * histograms, scatter, etc.) use these tokens by card size class.
 * 3D scenes use their own Modeling3DFrame contract (see StableModelCard).
 * Matrices/heatmaps are exempt from Cartesian x/y spacing but still use the header/padding.
 */

import type { CardSizeClass } from "./ModelingCardSizes";

export type ChartFrameTokens = {
  /** recharts margin top */
  marginTop: number;
  /** recharts margin right */
  marginRight: number;
  /** recharts margin bottom (space below x-axis ticks) */
  marginBottom: number;
  /** recharts margin left (space for y-axis ticks) */
  marginLeft: number;
  /** Tick label font size */
  tickFontSize: number;
  /** Target x-axis tick count (hint; exact count may vary by chart) */
  xTargetTicks: number;
  /** Target y-axis tick count */
  yTargetTicks: number;
  /** Grid line opacity (0–1) */
  gridOpacity: number;
  /** Axis line opacity (0–1) */
  axisOpacity: number;
  /** Min pixel gap between x-axis ticks before Recharts hides them */
  xMinTickGap: number;
};

export const CHART_FRAME: Record<CardSizeClass, ChartFrameTokens> = {
  COMPACT: {
    marginTop:    4,
    marginRight:  6,
    marginBottom: 16,
    marginLeft:   4,
    tickFontSize: 8,
    xTargetTicks: 4,
    yTargetTicks: 4,
    gridOpacity:  0.055,
    axisOpacity:  0.12,
    xMinTickGap:  20,
  },
  STANDARD: {
    marginTop:    6,
    marginRight:  8,
    marginBottom: 18,
    marginLeft:   8,
    tickFontSize: 9,
    xTargetTicks: 5,
    yTargetTicks: 5,
    gridOpacity:  0.065,
    axisOpacity:  0.14,
    xMinTickGap:  24,
  },
  WIDE: {
    marginTop:    8,
    marginRight:  10,
    marginBottom: 20,
    marginLeft:   10,
    tickFontSize: 9,
    xTargetTicks: 7,
    yTargetTicks: 5,
    gridOpacity:  0.065,
    axisOpacity:  0.14,
    xMinTickGap:  28,
  },
  HERO: {
    marginTop:    8,
    marginRight:  12,
    marginBottom: 22,
    marginLeft:   12,
    tickFontSize: 10,
    xTargetTicks: 7,
    yTargetTicks: 6,
    gridOpacity:  0.075,
    axisOpacity:  0.15,
    xMinTickGap:  32,
  },
};

/** Convenience: get frame tokens for a given model ID. */
import { getCardSize } from "./ModelingCardSizes";

export function getChartFrame(modelId: string): ChartFrameTokens {
  return CHART_FRAME[getCardSize(modelId)];
}
