// Modeling Studio — absolute color contract.
// POSITIVE = WHITE · NEGATIVE = GOLD · NEUTRAL = GRAY
// Zero exceptions: no red, green, blue, orange, purple.

export const MC_COLORS = {
  bg: "#0a0a0c",
  card: {
    bg: "linear-gradient(180deg, #141416 0%, #0a0a0c 100%)",
    border: "rgba(255,255,255,0.055)",
  },
  textPrimary: "rgba(241,241,241,0.88)",
  textMuted: "rgba(165,165,165,0.5)",
  textLabel: "rgba(125,125,125,0.5)",
  // Equity series → WHITE
  equity: {
    line: "rgba(238,238,238,0.80)",
    fill0: "rgba(238,238,238,0.12)",
    fill1: "rgba(238,238,238,0.01)",
  },
  // Drawdown → GOLD
  drawdown: {
    line: "#C9A84C",
    fill0: "rgba(201,168,76,0.24)",
    fill1: "rgba(201,168,76,0.02)",
  },
  // Return bins: positive bins → WHITE, negative bins → GOLD
  distPositive: "rgba(215,215,215,0.52)",
  distNegative: "rgba(201,168,76,0.55)",
  distPositiveHigh: "rgba(215,215,215,0.82)",
  distNegativeHigh: "rgba(201,168,76,0.85)",
  // Monte Carlo paths
  mc: {
    pathStroke: "rgba(205,205,205,0.016)",
    bestLine: "rgba(238,238,238,0.90)",
    worstLine: "#C9A84C",
    medianLine: "rgba(205,205,205,0.65)",
    bandInner0: "rgba(205,205,205,0.08)",
    bandOuter0: "rgba(205,205,205,0.03)",
  },
  // Axis / grid
  axis: {
    line: "rgba(255,255,255,0.08)",
    tick: "#6a7280",
    grid: "rgba(255,255,255,0.04)",
    zero: "rgba(255,255,255,0.11)",
  },
  // Named values
  gold: "#C9A84C",
  goldDim: "rgba(201,168,76,0.45)",
  goldMuted: "rgba(201,168,76,0.18)",
  white: "rgba(238,238,238,0.88)",
  whiteDim: "rgba(205,205,205,0.52)",
  whiteMuted: "rgba(205,205,205,0.18)",
  gray: "rgba(165,165,165,0.50)",
} as const;

export const BOX_STYLE: React.CSSProperties = {
  background: "linear-gradient(180deg, #141416 0%, #0a0a0c 100%)",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.055)",
  overflow: "hidden",
  position: "relative",
};

export const FONT_LABEL = "var(--font-montserrat,'Montserrat',sans-serif)";
export const FONT_NUM = "var(--font-numbers,'Nunito',sans-serif)";

import type React from "react";
