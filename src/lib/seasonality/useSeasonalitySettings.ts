"use client";

import { useState, useCallback } from "react";

/** Capitalife text logo on seasonal chart (bottom-left overlay). */
export const SEASONAL_CHART_LOGO_SRC = "/CAPITALIFE_Logo.png";

export interface SeasonalityUiSettings {
  hoverPreview: boolean;
  fastMode: boolean;
  showToday: boolean;
  showPatternHighlight: boolean;
  chartGradient: boolean;
  formulaMode: "avg" | "median";
  chartLogoEnabled: boolean;
  /** 0–100 */
  chartLogoOpacity: number;
  /** Width in px */
  chartLogoSize: number;
  /** Offset from left (px) */
  chartLogoPosX: number;
  /** Offset from bottom of chart area (px) */
  chartLogoPosY: number;
}

const DEFAULTS: SeasonalityUiSettings = {
  hoverPreview: true,
  fastMode: true,
  showToday: true,
  showPatternHighlight: true,
  chartGradient: true,
  formulaMode: "avg",
  chartLogoEnabled: true,
  chartLogoOpacity: 70,
  chartLogoSize: 200,
  chartLogoPosX: 60,
  chartLogoPosY: 60,
};

const STORAGE_KEY = "seasonalityUiSettings";

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function readStorage(): SeasonalityUiSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SeasonalityUiSettings>;
      return {
        ...DEFAULTS,
        ...parsed,
        chartLogoOpacity: clampNum(parsed.chartLogoOpacity, 0, 100, DEFAULTS.chartLogoOpacity),
        chartLogoSize: clampNum(parsed.chartLogoSize, 40, 280, DEFAULTS.chartLogoSize),
        chartLogoPosX: clampNum(parsed.chartLogoPosX, 0, 400, DEFAULTS.chartLogoPosX),
        chartLogoPosY: clampNum(parsed.chartLogoPosY, 0, 400, DEFAULTS.chartLogoPosY),
      };
    }
  } catch { /* ignore */ }
  return DEFAULTS;
}

export function useSeasonalitySettings() {
  const [settings, setSettings] = useState<SeasonalityUiSettings>(readStorage);

  const updateSetting = useCallback(<K extends keyof SeasonalityUiSettings>(
    key: K,
    value: SeasonalityUiSettings[K],
  ) => {
    setSettings(prev => {
      let next = { ...prev, [key]: value };
      if (key === "chartLogoOpacity") next.chartLogoOpacity = clampNum(value, 0, 100, prev.chartLogoOpacity);
      if (key === "chartLogoSize") next.chartLogoSize = clampNum(value, 40, 280, prev.chartLogoSize);
      if (key === "chartLogoPosX") next.chartLogoPosX = clampNum(value, 0, 400, prev.chartLogoPosX);
      if (key === "chartLogoPosY") next.chartLogoPosY = clampNum(value, 0, 400, prev.chartLogoPosY);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { settings, updateSetting };
}
