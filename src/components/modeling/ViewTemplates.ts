/**
 * View Template Library — Modeling Studio V2
 *
 * A template controls: which models are visible and in what order.
 * It does NOT change data selection. It does NOT fabricate models.
 * Layout and card sizes are determined by MODEL_CARD_SIZES.
 */

export type ViewCategory = "WORKSPACE" | "FOCUS" | "MEDIA" | "DIMENSION" | "CUSTOM";

export type ViewDimension =
  | "2D_FIRST"      // all 2D by default; user may switch individual cards
  | "ALL_2D"        // force all cards to 2D, no 3D button shown
  | "3D_PREFERRED"  // 3D for cards that have it; 2D fallback
  | "3D_SHOWCASE";  // show only 3D-capable cards, prefer 3D

export type AspectRatio = "free" | "1:1" | "4:5" | "9:16" | "16:9";

export type ViewTemplate = {
  id: string;
  label: string;
  shortLabel?: string;
  category: ViewCategory;
  dimension: ViewDimension;
  aspectRatio: AspectRatio;
  /** Ordered list of model IDs visible in this template. Unavailable models are silently skipped. */
  visibleModels: string[];
};

// ─── All standard model IDs ───────────────────────────────────────────────────

const ALL_HERO = ["equity", "mc-paths", "drawdown", "mc-outcome"] as const;

const ALL_STANDARD = [
  "rolling", "dd-recovery", "regression", "dyn-correlation",
  "var-surface", "rolling-risk-surface", "mc-quantile-surface",
  "correlation-matrix", "efficient-frontier", "pca",
] as const;

const ALL_COMPACT = [
  "return-dist", "tail-risk", "trade-expectancy", "lln-convergence", "path-dependency",
] as const;

const ALL_MODELS = [...ALL_HERO, ...ALL_STANDARD, ...ALL_COMPACT];

// ─── Template definitions ─────────────────────────────────────────────────────

export const VIEW_TEMPLATES: ViewTemplate[] = [
  // ── WORKSPACE ──────────────────────────────────────────────────────────────
  {
    id: "standard",
    label: "Standard",
    category: "WORKSPACE",
    dimension: "2D_FIRST",
    aspectRatio: "free",
    visibleModels: ALL_MODELS,
  },
  {
    id: "core-six",
    label: "Core Six",
    shortLabel: "6",
    category: "WORKSPACE",
    dimension: "2D_FIRST",
    aspectRatio: "free",
    visibleModels: ["equity", "drawdown", "mc-paths", "mc-outcome", "return-dist", "tail-risk"],
  },
  {
    id: "dense-research",
    label: "Dense Research",
    category: "WORKSPACE",
    dimension: "2D_FIRST",
    aspectRatio: "free",
    visibleModels: [
      "equity", "drawdown",
      "return-dist", "tail-risk", "lln-convergence",
      "rolling", "trade-expectancy", "path-dependency",
      "rolling-risk-surface", "var-surface",
    ],
  },
  {
    id: "quant-overview",
    label: "Quant Overview",
    category: "WORKSPACE",
    dimension: "2D_FIRST",
    aspectRatio: "free",
    visibleModels: [
      "equity", "mc-paths",
      "drawdown", "mc-outcome",
      "return-dist", "rolling",
      "regression", "correlation-matrix",
      "efficient-frontier",
    ],
  },
  {
    id: "deep-analysis",
    label: "Deep Analysis",
    category: "WORKSPACE",
    dimension: "2D_FIRST",
    aspectRatio: "free",
    visibleModels: ALL_MODELS,
  },

  // ── FOCUS ──────────────────────────────────────────────────────────────────
  {
    id: "risk-room",
    label: "Risk Room",
    category: "FOCUS",
    dimension: "2D_FIRST",
    aspectRatio: "free",
    visibleModels: [
      "drawdown", "mc-outcome",
      "tail-risk", "var-surface",
      "rolling-risk-surface", "dd-recovery",
    ],
  },
  {
    id: "mc-lab",
    label: "Monte Carlo Lab",
    category: "FOCUS",
    dimension: "3D_PREFERRED",
    aspectRatio: "free",
    visibleModels: [
      "mc-paths", "mc-outcome",
      "mc-quantile-surface", "path-dependency",
    ],
  },
  {
    id: "portfolio-lab",
    label: "Portfolio Lab",
    category: "FOCUS",
    dimension: "2D_FIRST",
    aspectRatio: "free",
    visibleModels: [
      "equity", "efficient-frontier",
      "correlation-matrix", "pca",
      "rolling", "drawdown",
    ],
  },
  {
    id: "trade-lab",
    label: "Trade Lab",
    category: "FOCUS",
    dimension: "2D_FIRST",
    aspectRatio: "free",
    visibleModels: [
      "equity",
      "trade-expectancy", "lln-convergence", "path-dependency",
      "return-dist", "tail-risk",
    ],
  },
  {
    id: "drawdown-lab",
    label: "Drawdown Lab",
    category: "FOCUS",
    dimension: "2D_FIRST",
    aspectRatio: "free",
    visibleModels: [
      "drawdown", "dd-recovery",
      "rolling-risk-surface", "tail-risk",
      "mc-outcome",
    ],
  },

  // ── MEDIA ──────────────────────────────────────────────────────────────────
  {
    id: "social-square",
    label: "Social Square",
    shortLabel: "1:1",
    category: "MEDIA",
    dimension: "2D_FIRST",
    aspectRatio: "1:1",
    visibleModels: ["equity"],
  },
  {
    id: "social-portrait",
    label: "Social Portrait",
    shortLabel: "4:5",
    category: "MEDIA",
    dimension: "2D_FIRST",
    aspectRatio: "4:5",
    visibleModels: ["equity", "drawdown", "mc-outcome"],
  },
  {
    id: "story-reel",
    label: "Story / Reel",
    shortLabel: "9:16",
    category: "MEDIA",
    dimension: "2D_FIRST",
    aspectRatio: "9:16",
    visibleModels: ["equity"],
  },
  {
    id: "video-landscape",
    label: "Video Landscape",
    shortLabel: "16:9",
    category: "MEDIA",
    dimension: "2D_FIRST",
    aspectRatio: "16:9",
    visibleModels: ["equity", "mc-paths", "mc-outcome", "return-dist"],
  },
  {
    id: "presentation",
    label: "Presentation",
    shortLabel: "16:9",
    category: "MEDIA",
    dimension: "2D_FIRST",
    aspectRatio: "16:9",
    visibleModels: ["equity", "drawdown", "mc-outcome", "return-dist", "rolling"],
  },
  {
    id: "chart-showcase",
    label: "Chart Showcase",
    category: "MEDIA",
    dimension: "2D_FIRST",
    aspectRatio: "16:9",
    visibleModels: ["equity", "mc-paths", "drawdown"],
  },

  // ── DIMENSION ──────────────────────────────────────────────────────────────
  {
    id: "all-2d",
    label: "All 2D",
    category: "DIMENSION",
    dimension: "ALL_2D",
    aspectRatio: "free",
    visibleModels: ALL_MODELS,
  },
  {
    id: "3d-preferred",
    label: "3D Preferred",
    category: "DIMENSION",
    dimension: "3D_PREFERRED",
    aspectRatio: "free",
    visibleModels: ALL_MODELS,
  },
  {
    id: "3d-showcase",
    label: "3D Showcase",
    category: "DIMENSION",
    dimension: "3D_SHOWCASE",
    aspectRatio: "free",
    // Only models with real 3D representations
    visibleModels: ["mc-paths", "mc-quantile-surface", "var-surface", "rolling-risk-surface", "dd-recovery"],
  },
];

// ── CUSTOM template (mutable per session — not in the static list) ──────────
export const CUSTOM_TEMPLATE_ID = "custom";

// ─── Lookups ──────────────────────────────────────────────────────────────────

export function getTemplateById(id: string): ViewTemplate | undefined {
  return VIEW_TEMPLATES.find((t) => t.id === id);
}

export function getDefaultTemplate(): ViewTemplate {
  return VIEW_TEMPLATES[0]!;
}

export const TEMPLATE_CATEGORY_ORDER: ViewCategory[] = [
  "WORKSPACE", "FOCUS", "MEDIA", "DIMENSION", "CUSTOM",
];

export const CATEGORY_LABELS: Record<ViewCategory, string> = {
  WORKSPACE: "WORKSPACE",
  FOCUS: "FOCUS",
  MEDIA: "MEDIA",
  DIMENSION: "DIMENSION",
  CUSTOM: "CUSTOM",
};
