/**
 * Capitalife Design System — single source of truth for all visual tokens.
 * Import from here instead of hardcoding colours, radii or sizes in components.
 */

// ── Palette ───────────────────────────────────────────────────────────────────

export const DS = {
  // Card backgrounds
  card: {
    /** Default dark card (KPI, analytics shell) */
    bg: "#0d0f12",
    /** Slightly lighter surface */
    surface: "#121417",
    /** Active / selected state */
    active: "#151719",
    /** Gradient card (home KPI) – from/to as CSS */
    gradientFrom: "#1F1F1F",
    gradientTo: "#13131A",
  },

  // Borders
  border: {
    subtle: "rgba(255,255,255,0.06)",
    medium: "rgba(255,255,255,0.10)",
    active: "transparent", // replaced by glow
  },

  // Text
  text: {
    primary: "#F5F5F5",
    secondary: "rgba(255,255,255,0.45)",
    muted: "rgba(255,255,255,0.30)",
    label: "rgba(255,255,255,0.35)",
  },

  // Accent
  accent: {
    gold: "#D8C16B",
    goldLight: "#F7E29D",
    goldDim: "rgba(216,188,103,0.20)",
    blue: "#3B82F6",
  },

  // Signal colours
  signal: {
    long: "#22C55E",
    short: "#EF4444",
    pending: "#D8BC67",
    neutral: "rgba(255,255,255,0.35)",
  },

  // Chart – candle (master = MonitoringChart)
  candle: {
    bg: "#0A0A0A",
    up: "#FFFFFF",
    down: "#C9A84C",
    font: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
    fontSize: 11,
    crosshairColor: "rgba(255,255,255,0.12)",
    gridColor: "rgba(255,255,255,0.04)",
    axisTextColor: "#6B7280",
  },

  // Chart – equity / performance (master = analytics PerformanceCard)
  equity: {
    /** Main portfolio line */
    lineColor: "#F3F4F6",
    /** Benchmark line */
    benchmarkColor: "#D8C071",
    /** Area gradient top */
    fillTop: "rgba(244,245,247,0.16)",
    /** Area gradient bottom */
    fillBottom: "rgba(244,245,247,0.02)",
    gridColor: "rgba(255,255,255,0.04)",
    axisTextColor: "#6B7280",
    tooltipBg: "#111216",
  },

  // Chart – drawdown (master = analytics DrawdownCard)
  drawdown: {
    lineColor: "#C4AE60",
    fillTop: "rgba(201,168,76,0.12)",
    fillBottom: "rgba(201,168,76,0)",
    oosPhaseColor: "#D85B68",
    livePhaseColor: "#D6B24A",
  },

  // KPI card (master = dashboard/kpi-card.tsx)
  kpi: {
    minHeight: 132,
    radius: 20,
    labelSize: 14,
    valueSize: 30,
    subtitleSize: 11,
  },

  // Signal card (master = signal/SignalCard.tsx)
  signalCard: {
    height: 112,
    radius: 16,
    iconSize: 24,
  },

  // Radii
  radius: {
    card: 18,
    kpi: 20,
    signalCard: 16,
    chip: 6,
  },
} as const;
