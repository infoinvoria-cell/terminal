export const signalColors = {
  bullPrimary: "#00ff08",
  bearPrimary: "#ff0000",
} as const;

export const designTokens = {
  signal: {
    bull: signalColors.bullPrimary,
    bear: signalColors.bearPrimary,
    neutral: "#7F93B8",
  },
  analytics: {
    baseline: "#7F93B8",
    threshold: "#8EA3C7",
    grid: "rgba(127, 147, 184, 0.28)",
  },
  zone: {
    demand: "rgba(0,255,8,0.20)",
    demandStrong: "rgba(0,255,8,0.30)",
    supply: "rgba(255,0,0,0.20)",
    supplyStrong: "rgba(255,0,0,0.30)",
  },
  background: {
    canvas: "#0c0d10",
    panel: "rgba(28, 29, 32, 0.8)",
    panelStrong: "rgba(20, 21, 25, 0.9)",
    surface: "rgba(12, 24, 45, 0.72)",
    surfaceMuted: "rgba(10, 19, 35, 0.86)",
  },
  chart: {
    accent: "#2962ff",
    candleUp: "#f4f4f5",
    candleDown: "#71717a",
    factorCombined: signalColors.bullPrimary,
    factorGold: "rgba(255,0,0,0.78)",
    factorDollar: "rgba(0,255,8,0.72)",
    factorUs10y: signalColors.bearPrimary,
  },
  text: {
    primary: "#eef5ff",
    secondary: "#c9d8f1",
    muted: "#95a8bf",
    subtle: "#7f92b4",
  },
  stroke: {
    soft: "rgba(120, 160, 255, 0.14)",
    panel: "rgba(109,132,160,0.35)",
    accent: "rgba(41,98,255,0.40)",
  },
} as const;

export function withAlpha(hex: string, alpha: number): string {
  const clean = String(hex || "").replace("#", "");
  const normalized = clean.length === 3
    ? clean.split("").map((char) => `${char}${char}`).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${Number.isFinite(red) ? red : 0}, ${Number.isFinite(green) ? green : 0}, ${Number.isFinite(blue) ? blue : 0}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function signalTone(direction: "LONG" | "SHORT" | "NEUTRAL" | undefined) {
  if (direction === "LONG") {
    return {
      color: designTokens.signal.bull,
      fill: withAlpha(designTokens.signal.bull, 0.18),
      glow: withAlpha(designTokens.signal.bull, 0.48),
    };
  }
  if (direction === "SHORT") {
    return {
      color: designTokens.signal.bear,
      fill: withAlpha(designTokens.signal.bear, 0.18),
      glow: withAlpha(designTokens.signal.bear, 0.48),
    };
  }
  return {
    color: designTokens.signal.neutral,
    fill: withAlpha(designTokens.signal.neutral, 0.16),
    glow: withAlpha(designTokens.signal.neutral, 0.30),
  };
}
