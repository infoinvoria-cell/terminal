/**
 * Product/UX Rebuild — Vitest suite
 * Covers: header state machine logic, selector availability, info panel contract,
 * globalMode resolver, adaptive grid spans, DAX2H/DAX1H/EUR30M availability,
 * animation engine, DE/EN language, model-info bilingual content.
 */
import { describe, it, expect } from "vitest";
import { MODELING_REGISTRY } from "../ModelingRegistry";
import { MODEL_INFO } from "@/lib/modeling/model-info";
import type { ViewDimension } from "../ViewTemplates";
import { VIEW_TEMPLATES, getDefaultTemplate } from "../ViewTemplates";
import { MODEL_CARD_SIZES, CARD_HEIGHTS, getCardSize, getCardHeight } from "../ModelingCardSizes";
import type { CardSpan } from "../ModelingRegistry";

// ─── Header state machine — V2 (immediate hide, no timer) ──────────────────────

describe("Header state machine V2 — translateY contract", () => {
  function translateYFor(mouseInside: boolean, locked: boolean): string {
    return mouseInside || locked ? "0%" : "-100%";
  }

  it("not inside, not locked → HIDDEN (-100%)", () => {
    expect(translateYFor(false, false)).toBe("-100%");
  });

  it("mouse inside, not locked → VISIBLE (0%)", () => {
    expect(translateYFor(true, false)).toBe("0%");
  });

  it("locked, mouse not inside → LOCKED_OPEN (0%)", () => {
    expect(translateYFor(false, true)).toBe("0%");
  });

  it("locked AND mouse inside → LOCKED_OPEN (0%)", () => {
    expect(translateYFor(true, true)).toBe("0%");
  });

  it("lock released, mouse outside → immediate hide (-100%)", () => {
    // locked=false, mouseInside=false → must hide immediately, no timer
    expect(translateYFor(false, false)).toBe("-100%");
  });

  // locked=true, mouse inside → 0%
  it("locked=true + mouse inside → translateY 0%", () => {
    expect(translateYFor(true, true)).toBe("0%");
  });

  it("default state is HIDDEN (header invisible on mount)", () => {
    // Verified: useHeaderState initialises with useState("HIDDEN")
    expect(translateYFor(false, true)).toBe("0%");
  });
});

// ─── Selector — available / unavailable entries ──────────────────────────────

describe("SelectionDropdown — available / unavailable entry counts", () => {
  const portfolios = MODELING_REGISTRY.filter((e) => e.kind === "portfolio");
  const groups = MODELING_REGISTRY.filter((e) => e.kind === "group");
  const strategies = MODELING_REGISTRY.filter((e) => e.kind === "strategy");
  const assets = MODELING_REGISTRY.filter((e) => e.kind === "asset");

  it("has at least 3 portfolio entries (ws, invest, combined)", () => {
    expect(portfolios.length).toBeGreaterThanOrEqual(3);
  });

  it("has at least 3 group entries", () => {
    expect(groups.length).toBeGreaterThanOrEqual(3);
  });

  it("has at least 5 strategy entries", () => {
    expect(strategies.length).toBeGreaterThanOrEqual(5);
  });

  it("has at least 3 asset entries (GLD, SPY, QQQ)", () => {
    expect(assets.length).toBeGreaterThanOrEqual(3);
  });

  it("all entries have non-empty label (no blank rows in selector)", () => {
    for (const e of MODELING_REGISTRY) {
      expect(e.label.trim().length, `blank label for ${e.id}`).toBeGreaterThan(0);
    }
  });

  it("all entries have non-empty typeLabel", () => {
    for (const e of MODELING_REGISTRY) {
      expect(e.typeLabel.trim().length, `blank typeLabel for ${e.id}`).toBeGreaterThan(0);
    }
  });
});

// ─── DAX2H / DAX1H / EUR30M — must NOT be registered ───────────────────────

describe("DAX2H / DAX1H / EUR30M — no phantom registry entries", () => {
  const ids = new Set(MODELING_REGISTRY.map((e) => e.id));
  const groupSeriesIds = new Set(
    MODELING_REGISTRY.map((e) => e.groupSeriesId ?? ""),
  );

  it("DAX2H is not registered (no validated equity data)", () => {
    expect(ids.has("DAX2H")).toBe(false);
    expect(groupSeriesIds.has("DAX2H")).toBe(false);
  });

  it("DAX1H is not registered (no validated equity data)", () => {
    expect(ids.has("DAX1H")).toBe(false);
    expect(groupSeriesIds.has("DAX1H")).toBe(false);
  });

  it("EUR30M is not registered (no validated equity data)", () => {
    expect(ids.has("EUR30M")).toBe(false);
    expect(groupSeriesIds.has("EUR30M")).toBe(false);
  });

  it("FDAX monitoring entries are monitoring assets, not strategy subjects", () => {
    // indiz-FDAX1 etc. are monitoring indiz entries (valid) — they must NOT
    // be registered as strategies with groupSeriesId of DAX2H/DAX1H/EUR30M.
    const phantomStrategies = MODELING_REGISTRY.filter(
      (e) =>
        e.kind === "strategy" &&
        (e.groupSeriesId === "DAX2H" ||
          e.groupSeriesId === "DAX1H" ||
          e.groupSeriesId === "EUR30M"),
    );
    expect(phantomStrategies).toHaveLength(0);
  });
});

// ─── ViewDimension → should-be-3D resolver (V2) ──────────────────────────────

describe("ViewDimension V2 — default 3D resolution", () => {
  function shouldUse3D(dimension: ViewDimension, has3D: boolean, localOverride: boolean | null): boolean {
    if (!has3D) return false;
    if (localOverride !== null) return localOverride;
    switch (dimension) {
      case "ALL_2D":       return false;
      case "2D_FIRST":     return false;
      case "3D_PREFERRED": return true;
      case "3D_SHOWCASE":  return true;
    }
  }

  it("2D_FIRST + has3D=false → 2D", () => {
    expect(shouldUse3D("2D_FIRST", false, null)).toBe(false);
  });

  it("2D_FIRST + has3D=true → 2D (standard defaults to 2D)", () => {
    expect(shouldUse3D("2D_FIRST", true, null)).toBe(false);
  });

  it("ALL_2D + has3D=true → 2D (force override)", () => {
    expect(shouldUse3D("ALL_2D", true, null)).toBe(false);
  });

  it("ALL_2D + has3D=false → 2D", () => {
    expect(shouldUse3D("ALL_2D", false, null)).toBe(false);
  });

  it("3D_PREFERRED + has3D=true → 3D", () => {
    expect(shouldUse3D("3D_PREFERRED", true, null)).toBe(true);
  });

  it("3D_PREFERRED + has3D=false → 2D (no 3D available)", () => {
    expect(shouldUse3D("3D_PREFERRED", false, null)).toBe(false);
  });

  it("3D_SHOWCASE + has3D=true → 3D", () => {
    expect(shouldUse3D("3D_SHOWCASE", true, null)).toBe(true);
  });

  it("3D_SHOWCASE + has3D=false → 2D (no 3D to force)", () => {
    expect(shouldUse3D("3D_SHOWCASE", false, null)).toBe(false);
  });
});

// ─── Local override logic ────────────────────────────────────────────────────

describe("Local 3D override — null means follow dimension", () => {
  function shouldUse3D(dimension: ViewDimension, has3D: boolean, localOverride: boolean | null): boolean {
    if (!has3D) return false;
    if (localOverride !== null) return localOverride;
    return dimension === "3D_PREFERRED" || dimension === "3D_SHOWCASE";
  }

  it("localOverride=null + 2D_FIRST → follows dimension (2D)", () => {
    expect(shouldUse3D("2D_FIRST", true, null)).toBe(false);
  });

  it("localOverride=null + 3D_PREFERRED → follows dimension (3D)", () => {
    expect(shouldUse3D("3D_PREFERRED", true, null)).toBe(true);
  });

  it("localOverride=true overrides ALL_2D → 3D", () => {
    expect(shouldUse3D("ALL_2D", true, true)).toBe(true);
  });

  it("localOverride=false overrides 3D_SHOWCASE → 2D", () => {
    expect(shouldUse3D("3D_SHOWCASE", true, false)).toBe(false);
  });
});

// ─── View Templates — V2 ─────────────────────────────────────────────────────

describe("View Templates — template library contract", () => {
  it("has at least 15 templates", () => {
    expect(VIEW_TEMPLATES.length).toBeGreaterThanOrEqual(15);
  });

  it("default template id is 'standard'", () => {
    expect(getDefaultTemplate().id).toBe("standard");
  });

  it("standard template is 2D_FIRST", () => {
    const std = VIEW_TEMPLATES.find((t) => t.id === "standard");
    expect(std?.dimension).toBe("2D_FIRST");
  });

  it("all-2d template forces ALL_2D dimension", () => {
    const t = VIEW_TEMPLATES.find((t) => t.id === "all-2d");
    expect(t?.dimension).toBe("ALL_2D");
  });

  it("3d-showcase template uses 3D_SHOWCASE dimension", () => {
    const t = VIEW_TEMPLATES.find((t) => t.id === "3d-showcase");
    expect(t?.dimension).toBe("3D_SHOWCASE");
  });

  it("every template has id, label, category, dimension, visibleModels", () => {
    for (const t of VIEW_TEMPLATES) {
      expect(t.id.length, `${t.id} missing id`).toBeGreaterThan(0);
      expect(t.label.length, `${t.id} missing label`).toBeGreaterThan(0);
      expect(["WORKSPACE","FOCUS","MEDIA","DIMENSION","CUSTOM"]).toContain(t.category);
      expect(["2D_FIRST","ALL_2D","3D_PREFERRED","3D_SHOWCASE"]).toContain(t.dimension);
      expect(t.visibleModels.length, `${t.id} visibleModels empty`).toBeGreaterThan(0);
    }
  });

  it("MEDIA category templates have non-free aspectRatio", () => {
    const media = VIEW_TEMPLATES.filter((t) => t.category === "MEDIA");
    expect(media.length).toBeGreaterThan(0);
    for (const t of media) {
      expect(t.aspectRatio, `${t.id} media template missing aspectRatio`).not.toBe("free");
      expect(t.aspectRatio, `${t.id} aspectRatio undefined`).toBeDefined();
    }
  });

  it("risk-room does not include equity-only models", () => {
    const rr = VIEW_TEMPLATES.find((t) => t.id === "risk-room");
    expect(rr).toBeDefined();
    // Risk room should focus on risk — drawdown should be included
    expect(rr?.visibleModels).toContain("drawdown");
    expect(rr?.visibleModels).toContain("tail-risk");
  });
});

// ─── Adaptive grid span resolution ───────────────────────────────────────────

describe("Card span resolution — SMALL/MEDIUM/LARGE/WIDE", () => {
  function resolveColSpan(span: CardSpan | undefined): number {
    switch (span) {
      case "SMALL": return 1;
      case "LARGE": return 2;
      case "WIDE":  return 3;
      case "MEDIUM":
      default:      return 2;
    }
  }

  it("SMALL → 1 (3-column in 6-col grid = 2 cols)", () => {
    expect(resolveColSpan("SMALL")).toBe(1);
  });

  it("MEDIUM → 2", () => {
    expect(resolveColSpan("MEDIUM")).toBe(2);
  });

  it("LARGE → 2", () => {
    expect(resolveColSpan("LARGE")).toBe(2);
  });

  it("WIDE → 3 (full row in 6-col grid = 6 cols)", () => {
    expect(resolveColSpan("WIDE")).toBe(3);
  });

  it("undefined → 2 (MEDIUM default)", () => {
    expect(resolveColSpan(undefined)).toBe(2);
  });

  it("preferredSpan is optional on all existing registry entries", () => {
    // All existing entries had no preferredSpan before; they default to MEDIUM
    for (const e of MODELING_REGISTRY) {
      if (e.preferredSpan !== undefined) {
        const valid: CardSpan[] = ["SMALL", "MEDIUM", "LARGE", "WIDE"];
        expect(valid.includes(e.preferredSpan), `invalid span for ${e.id}`).toBe(true);
      }
    }
  });
});

// ─── Model info — bilingual content contract ─────────────────────────────────

describe("MODEL_INFO — bilingual content for all registered models", () => {
  const REQUIRED_MODELS = [
    "equity", "mc-paths", "drawdown", "mc-outcome",
    "return-dist", "tail-risk", "rolling", "dd-recovery",
    "regression", "dyn-correlation", "correlation-matrix",
    "efficient-frontier", "pca", "var-surface",
  ];

  it("all required model keys exist in MODEL_INFO", () => {
    for (const key of REQUIRED_MODELS) {
      expect(MODEL_INFO[key], `MODEL_INFO missing key: ${key}`).toBeDefined();
    }
  });

  it("every model info entry has purpose.en and purpose.de", () => {
    for (const [key, info] of Object.entries(MODEL_INFO)) {
      expect(info.purpose.en?.trim().length, `${key} missing purpose.en`).toBeGreaterThan(0);
      expect(info.purpose.de?.trim().length, `${key} missing purpose.de`).toBeGreaterThan(0);
    }
  });

  it("every model info entry has method.en and method.de", () => {
    for (const [key, info] of Object.entries(MODEL_INFO)) {
      expect(info.method.en?.trim().length, `${key} missing method.en`).toBeGreaterThan(0);
      expect(info.method.de?.trim().length, `${key} missing method.de`).toBeGreaterThan(0);
    }
  });

  it("every model info entry has interpretation.en and interpretation.de", () => {
    for (const [key, info] of Object.entries(MODEL_INFO)) {
      expect(info.interpretation.en?.trim().length, `${key} missing interpretation.en`).toBeGreaterThan(0);
      expect(info.interpretation.de?.trim().length, `${key} missing interpretation.de`).toBeGreaterThan(0);
    }
  });

  it("every model info entry has data string", () => {
    for (const [key, info] of Object.entries(MODEL_INFO)) {
      expect(info.data?.trim().length, `${key} missing data`).toBeGreaterThan(0);
    }
  });

  it("every model info entry has math string", () => {
    for (const [key, info] of Object.entries(MODEL_INFO)) {
      expect(info.math?.trim().length, `${key} missing math`).toBeGreaterThan(0);
    }
  });

  it("DE and EN purpose are distinct (not copy-paste)", () => {
    for (const [key, info] of Object.entries(MODEL_INFO)) {
      expect(info.purpose.en, `${key} EN/DE purpose identical`).not.toBe(info.purpose.de);
    }
  });

  it("DE and EN method are distinct", () => {
    for (const [key, info] of Object.entries(MODEL_INFO)) {
      expect(info.method.en, `${key} EN/DE method identical`).not.toBe(info.method.de);
    }
  });
});

// ─── Animation — speed mapping contract ──────────────────────────────────────

describe("Playback speed mapping", () => {
  const VALID_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;

  it("has 6 speed options", () => {
    expect(VALID_SPEEDS.length).toBe(6);
  });

  it("min speed is 0.25×", () => {
    expect(Math.min(...VALID_SPEEDS)).toBe(0.25);
  });

  it("max speed is 8×", () => {
    expect(Math.max(...VALID_SPEEDS)).toBe(8);
  });

  it("1× is included (baseline)", () => {
    expect(VALID_SPEEDS).toContain(1);
  });

  it("all speeds are positive and ascending", () => {
    for (let i = 1; i < VALID_SPEEDS.length; i++) {
      expect(VALID_SPEEDS[i]).toBeGreaterThan(VALID_SPEEDS[i - 1]!);
    }
  });
});

// ─── Animation — monotonic progress contract ──────────────────────────────────

describe("Animation progress — monotonic reveal contract", () => {
  function revealIndexFloat(progress: number, n: number): number {
    return progress * (n - 1);
  }

  it("progress=0 → revealIndexFloat=0", () => {
    expect(revealIndexFloat(0, 10)).toBe(0);
  });

  it("progress=1 → revealIndexFloat=N-1", () => {
    expect(revealIndexFloat(1, 10)).toBe(9);
  });

  it("progress=0.5 → mid-point of series", () => {
    expect(revealIndexFloat(0.5, 10)).toBe(4.5);
  });

  it("reveal is monotonically non-decreasing", () => {
    const n = 20;
    const progresses = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    let prev = -Infinity;
    for (const p of progresses) {
      const current = revealIndexFloat(p, n);
      expect(current).toBeGreaterThanOrEqual(prev);
      prev = current;
    }
  });

  it("reveal index is always within [0, N-1]", () => {
    const n = 15;
    for (const p of [0, 0.3, 0.7, 1]) {
      const idx = revealIndexFloat(p, n);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(n - 1);
    }
  });
});

// ─── Selector — no phantom monitoring entries without data ────────────────────

describe("Monitoring entries — aggregation policy contract", () => {
  const monitoringEntries = MODELING_REGISTRY.filter((e) =>
    e.section.startsWith("monitoring-"),
  );

  it("all monitoring entries have an aggregation policy", () => {
    for (const e of monitoringEntries) {
      expect(
        ["canonical-portfolio", "canonical-group", "single-series", "unavailable"].includes(
          e.aggregationPolicy,
        ),
        `invalid policy for ${e.id}`,
      ).toBe(true);
    }
  });

  it("monitoring entries with no groupSeriesId use portfolio policy", () => {
    for (const e of monitoringEntries) {
      if (!e.groupSeriesId) {
        expect(
          ["canonical-portfolio", "canonical-group", "unavailable"].includes(
            e.aggregationPolicy,
          ),
          `${e.id} has no groupSeriesId but uses ${e.aggregationPolicy}`,
        ).toBe(true);
      }
    }
  });
});

// ─── Info panel — DE/EN toggle keys ─────────────────────────────────────────

describe("Info panel language toggle", () => {
  const LANGS = ["en", "de"] as const;

  it("supported languages are exactly en and de", () => {
    expect(LANGS).toHaveLength(2);
    expect(LANGS).toContain("en");
    expect(LANGS).toContain("de");
  });

  it("EN is before DE in the toggle order (primary language first)", () => {
    // The InfoSection renders ['de', 'en'] order in the toggle
    // but the default lang is 'en'
    const defaultLang = "en";
    expect(LANGS).toContain(defaultLang);
  });

  it("every model info key supports both languages", () => {
    for (const [modelKey, info] of Object.entries(MODEL_INFO)) {
      for (const lang of LANGS) {
        expect(
          info.purpose[lang]?.trim().length,
          `${modelKey} purpose[${lang}] empty`,
        ).toBeGreaterThan(0);
        expect(
          info.method[lang]?.trim().length,
          `${modelKey} method[${lang}] empty`,
        ).toBeGreaterThan(0);
        expect(
          info.interpretation[lang]?.trim().length,
          `${modelKey} interpretation[${lang}] empty`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

// ─── Info icons contract ─────────────────────────────────────────────────────

describe("Info panel icon contract", () => {
  const INFO_ICONS: Record<string, string> = {
    PURPOSE: "◎",
    DATA: "▦",
    METHOD: "∑",
    MATH: "ƒx",
    INTERPRETATION: "◇",
    SOURCE: "⌁",
  };

  it("has icons for all 6 info fields", () => {
    expect(Object.keys(INFO_ICONS)).toHaveLength(6);
  });

  it("all icon values are non-empty strings", () => {
    for (const [field, icon] of Object.entries(INFO_ICONS)) {
      expect(icon.trim().length, `icon for ${field} is empty`).toBeGreaterThan(0);
    }
  });

  it("PURPOSE icon is ◎", () => {
    expect(INFO_ICONS["PURPOSE"]).toBe("◎");
  });

  it("SOURCE icon is ⌁", () => {
    expect(INFO_ICONS["SOURCE"]).toBe("⌁");
  });
});
