/**
 * Capitalife Terminal — Shared Design Tokens
 * Source-of-truth: src/components/referenzen/*
 * All values extracted verbatim from live component code.
 */

import type React from "react";

// ─── Colors ──────────────────────────────────────────────────────────────────

export const COLORS = {
  /** Page / deepest background (candlestick chart BG, also used as tooltip BG base) */
  PAGE_BG: "#0B0C0F",

  /** Tooltip and phase-pill overlay background */
  TOOLTIP_BG: "#0B0E12",

  /** Phase pill label background */
  PHASE_PILL_BG: "#0A0C12",

  /** Chart card gradient — top stop */
  CARD_TOP: "#17171b",

  /** Chart card gradient — bottom stop */
  CARD_BOTTOM: "#0b0b0e",

  /** KPI card gradient — top stop (also: BottomBoxes, Controls active pill bg) */
  KPI_TOP: "#26262d",

  /** KPI card gradient — bottom stop */
  KPI_BOTTOM: "#111114",

  /** Standard card / KPI border */
  BORDER: "rgba(255,255,255,0.055)",

  /** Inner divider lines (Overview/Assets rows) */
  DIVIDER: "rgba(255,255,255,0.032)",

  /** Primary text / value color */
  TEXT_PRIMARY: "#F0F2F6",

  /** Active pill / icon text */
  TEXT_ACTIVE: "#F3F3F4",

  /** Header / chart title text */
  TEXT_HEADER: "#f5f7fa",

  /** Asset symbol label */
  TEXT_SYMBOL: "#e8eaf0",

  /** Muted label color (KPI labels, overview row labels) */
  TEXT_MUTED: "rgba(180,192,210,0.6)",

  /** Softer muted label (OverviewBox row labels) */
  TEXT_MUTED_SOFT: "rgba(180,192,210,0.58)",

  /** Asset name · exchange muted text */
  TEXT_MUTED_DIM: "rgba(180,192,210,0.45)",

  /** Inactive pill / icon label */
  TEXT_INACTIVE: "#6a6e7a",

  /** Segment pill inactive text (smaller segments) */
  TEXT_INACTIVE_SEG: "#5a5e6a",

  /** Axis tick labels */
  AXIS_TICK: "#7f8a9d",

  /** Tooltip date text */
  TOOLTIP_DATE: "#7c8798",

  /** Gold — primary accent, positive values, live-phase lines */
  GOLD: "#D6B24A",

  /** Gold bright — live-phase drawdown line */
  GOLD_BRIGHT: "#E8C95A",

  /** Gold dim — test-phase drawdown fill/line */
  GOLD_DIM: "rgba(186,148,62,0.55)",

  /** Vertical divider between pill groups */
  VDIVIDER: "rgba(255,255,255,0.18)",
} as const;

// ─── Fonts ────────────────────────────────────────────────────────────────────

export const FONTS = {
  /** UI labels, section headers, pill text, asset symbols */
  MONTSERRAT: "var(--font-montserrat, 'Montserrat', sans-serif)",

  /** Numeric values, KPI values, axis ticks, tooltip values */
  NUNITO: "var(--font-numbers, 'Nunito', sans-serif)",
} as const;

// ─── Gradients ────────────────────────────────────────────────────────────────

export const GRADIENTS = {
  /** KPI cards, BottomBoxes, Controls active pill background */
  KPI_BG: "linear-gradient(to bottom, #26262d, #111114)",

  /** Chart card containers (equity, drawdown, bar, candlestick wrappers) */
  CARD_BG: "linear-gradient(to bottom, #17171b, #0b0b0e)",

  /** Page / deepest background — use as solid hex */
  PAGE_BG: "#0B0C0F",
} as const;

// ─── Composed Style Objects ───────────────────────────────────────────────────

/** Matches KpiCard in ReferenzenPage.tsx (height 84, padding 11/14/12) */
export const KPI_CARD_STYLE: React.CSSProperties = {
  height: 84,
  padding: "11px 14px 12px",
  boxSizing: "border-box",
  background: GRADIENTS.KPI_BG,
  borderRadius: 14,
  border: `1px solid ${COLORS.BORDER}`,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

/** Matches chart card containers (BOX) in ReferenzenPage.tsx */
export const CHART_CARD_STYLE: React.CSSProperties = {
  background: GRADIENTS.CARD_BG,
  borderRadius: 10,
  border: `1px solid ${COLORS.BORDER}`,
  overflow: "hidden",
  position: "relative",
  flexShrink: 0,
};

/** Chart header title span — 11px, 700, #f5f7fa, Montserrat, letterSpacing 0.04em */
export const HEADER_SPAN_STYLE: React.CSSProperties = {
  color: COLORS.TEXT_HEADER,
  fontSize: 11,
  fontWeight: 700,
  fontFamily: FONTS.MONTSERRAT,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

/** Dim label style — Montserrat, muted color, used for KPI/row labels */
export const LABEL_STYLE: React.CSSProperties = {
  fontFamily: FONTS.MONTSERRAT,
  color: COLORS.TEXT_MUTED,
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1,
};

/** Numeric value style — Nunito, #F0F2F6, tabular-nums */
export const VALUE_STYLE: React.CSSProperties = {
  fontFamily: FONTS.NUNITO,
  color: COLORS.TEXT_PRIMARY,
  fontVariantNumeric: "tabular-nums",
  fontWeight: 700,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

// ─── Pill / Button CSS ────────────────────────────────────────────────────────

/**
 * Global CSS string for .rc-pill, .rc-active, .rc-inactive.
 * Inject via <style dangerouslySetInnerHTML={{ __html: PILL_CSS }} />.
 * Active bg uses KPI_BG gradient (= #26262d → #111114).
 */
export const PILL_CSS = `
  .rc-pill {
    border-radius: 999px;
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease;
    outline: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .rc-pill:focus-visible { outline: 2px solid rgba(180,200,220,0.45); outline-offset: 2px; }

  .rc-active {
    background: ${GRADIENTS.KPI_BG};
    border: 1.5px solid rgba(255,255,255,0.28);
  }
  .rc-active:hover { border-color: rgba(255,255,255,0.42); }

  .rc-inactive {
    background: transparent;
    border: 1.5px solid transparent;
  }
  .rc-inactive:hover {
    background: ${GRADIENTS.KPI_BG};
    border-color: rgba(255,255,255,0.18);
  }

  .rc-toggle { cursor: pointer; transition: background 160ms ease; border-radius: 999px; }
  .rc-toggle:hover { filter: brightness(1.12); }
  .rc-toggle:focus-visible { outline: 2px solid rgba(180,200,220,0.45); outline-offset: 3px; border-radius: 999px; }

  .rc-icon-btn {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; border: 1.5px solid transparent;
    transition: background 160ms ease, border-color 160ms ease;
    outline: none; flex-shrink: 0;
  }
  .rc-icon-btn:focus-visible { outline: 2px solid rgba(180,200,220,0.45); outline-offset: 2px; }

  .rc-icon-active {
    background: ${GRADIENTS.KPI_BG};
    border-color: rgba(255,255,255,0.28);
  }
  .rc-icon-active:hover { border-color: rgba(255,255,255,0.44); }

  .rc-icon-inactive {
    background: transparent;
    border-color: transparent;
  }
  .rc-icon-inactive:hover {
    background: ${GRADIENTS.KPI_BG};
    border-color: rgba(255,255,255,0.18);
  }
`;

/** Active pill — inline style equivalent of .rc-active */
export const ACTIVE_PILL_STYLE: React.CSSProperties = {
  background: GRADIENTS.KPI_BG,
  border: "1.5px solid rgba(255,255,255,0.28)",
  borderRadius: 999,
  cursor: "pointer",
  outline: "none",
  display: "flex",
  alignItems: "center",
};

/** Inactive pill — inline style equivalent of .rc-inactive */
export const INACTIVE_PILL_STYLE: React.CSSProperties = {
  background: "transparent",
  border: "1.5px solid transparent",
  borderRadius: 999,
  cursor: "pointer",
  outline: "none",
  display: "flex",
  alignItems: "center",
};

// ─── Border ───────────────────────────────────────────────────────────────────

/** Standard 1px border used on all cards and KPI tiles */
export const BORDER_STANDARD = "1px solid rgba(255,255,255,0.055)";

// ─── Border Radius ────────────────────────────────────────────────────────────

export const RADIUS = {
  /** Chart card containers, BottomBoxes */
  card: 10,

  /** KPI tile cards */
  kpi: 14,
} as const;
