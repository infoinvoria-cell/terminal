export type MonitoringLanguage = "en" | "de";

/** Watermark visibility 5–40 (%), applied to logo opacity in chart background. */
export const WATERMARK_OPACITY_MIN = 5;
export const WATERMARK_OPACITY_MAX = 40;
export const DEFAULT_WATERMARK_OPACITY = 18;

export type MonitoringUiPrefs = {
  language: MonitoringLanguage;
  watermarkEnabled: boolean;
  /** Logo opacity in percent (5–40). */
  watermarkOpacity: number;
  backgroundColor: string | null;
  candleUpColor: string | null;
  candleDownColor: string | null;
  overlayEntryColor: string | null;
  overlaySlColor: string | null;
  overlayTpColor: string | null;
  efficientMode: boolean;
  /** Vertical split: % of monitoringMainWorkspace height for the chart area (20–80). null = default 62. */
  chartSplitPct: number | null;
  /** Width in px of the KPI/strategy-tester side panel (200–480). null = default 300. */
  rightPanelWidthPx: number | null;
  /** Width in px of the parameters column (160–400). null = default 220. */
  inputPanelWidthPx: number | null;
  /** Whether the parameters column is visible. true = visible (default). */
  paramsPanelVisible: boolean;
};

export const DEFAULT_MONITORING_UI_PREFS: MonitoringUiPrefs = {
  language: "en",
  watermarkEnabled: false,
  watermarkOpacity: DEFAULT_WATERMARK_OPACITY,
  backgroundColor: null,
  candleUpColor: null,
  candleDownColor: null,
  overlayEntryColor: null,
  overlaySlColor: null,
  overlayTpColor: null,
  efficientMode: false,
  chartSplitPct: null,
  rightPanelWidthPx: null,
  inputPanelWidthPx: null,
  paramsPanelVisible: true,
};

const STORAGE_KEY = "invoria:monitoring:ui-prefs:v1";

export function loadMonitoringUiPrefs(): MonitoringUiPrefs {
  if (typeof window === "undefined") return DEFAULT_MONITORING_UI_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MONITORING_UI_PREFS;
    const parsed = JSON.parse(raw) as Partial<MonitoringUiPrefs>;
    return {
      ...DEFAULT_MONITORING_UI_PREFS,
      ...parsed,
      language: parsed.language === "de" ? "de" : "en",
      backgroundColor: parsed.backgroundColor ? String(parsed.backgroundColor) : null,
      candleUpColor: parsed.candleUpColor ? String(parsed.candleUpColor) : null,
      candleDownColor: parsed.candleDownColor ? String(parsed.candleDownColor) : null,
      overlayEntryColor: parsed.overlayEntryColor ? String(parsed.overlayEntryColor) : null,
      overlaySlColor: parsed.overlaySlColor ? String(parsed.overlaySlColor) : null,
      overlayTpColor: parsed.overlayTpColor ? String(parsed.overlayTpColor) : null,
      watermarkEnabled: Boolean(parsed.watermarkEnabled),
      watermarkOpacity: clampWatermarkOpacity(
        typeof parsed.watermarkOpacity === "number" ? parsed.watermarkOpacity : DEFAULT_WATERMARK_OPACITY,
      ),
      efficientMode: Boolean(parsed.efficientMode),
      chartSplitPct: typeof parsed.chartSplitPct === "number" && Number.isFinite(parsed.chartSplitPct)
        ? Math.min(80, Math.max(20, parsed.chartSplitPct))
        : null,
      rightPanelWidthPx: typeof parsed.rightPanelWidthPx === "number" && Number.isFinite(parsed.rightPanelWidthPx)
        ? Math.min(480, Math.max(200, parsed.rightPanelWidthPx))
        : null,
      inputPanelWidthPx: typeof parsed.inputPanelWidthPx === "number" && Number.isFinite(parsed.inputPanelWidthPx)
        ? Math.min(400, Math.max(160, parsed.inputPanelWidthPx))
        : null,
      paramsPanelVisible: typeof parsed.paramsPanelVisible === "boolean" ? parsed.paramsPanelVisible : true,
    };
  } catch {
    return DEFAULT_MONITORING_UI_PREFS;
  }
}

export function clampWatermarkOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WATERMARK_OPACITY;
  return Math.min(WATERMARK_OPACITY_MAX, Math.max(WATERMARK_OPACITY_MIN, Math.round(value)));
}

export function saveMonitoringUiPrefs(next: MonitoringUiPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

const TERM_DE_TRANSLATIONS: Record<string, string> = {
  Wheat: "Weizen",
  Corn: "Mais",
  Cocoa: "Kakao",
  "Orange Juice": "Orangensaft",
  Gold: "Gold",
  Silver: "Silber",
  Palladium: "Palladium",
  Platinum: "Platin",
  "Crude Oil": "Rohöl",
  Nasdaq: "Nasdaq",
  "S&P 500": "S&P 500",
  DAX: "DAX",
  "Dow Jones": "Dow Jones",
  Apple: "Apple",
  Microsoft: "Microsoft",
  Nvidia: "Nvidia",
  Google: "Google",
  Amazon: "Amazon",
  Meta: "Meta",
};

export function translateMonitoringTerm(term: string, language: MonitoringLanguage): string {
  if (language !== "de") return term;
  const key = String(term || "").trim();
  return TERM_DE_TRANSLATIONS[key] ?? key;
}

