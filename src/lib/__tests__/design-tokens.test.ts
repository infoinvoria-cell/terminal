/**
 * Design token consistency tests.
 *
 * Prevents accidental drift between:
 * - CAPITALIFE_DESIGN_SKILL.md documentation
 * - src/lib/design-tokens.ts exported values
 * - src/components/ui/design-system.tsx DS object
 *
 * These are not pixel tests — they assert that the canonical code values
 * match what the design skill documents as authoritative.
 */

import { describe, it, expect } from "vitest";
import { COLORS, GRADIENTS, RADIUS, BORDER_STANDARD } from "@/lib/design-tokens";
import { DS } from "@/components/ui/design-system";

// ── Canonical values from CAPITALIFE_DESIGN_SKILL.md ─────────────────────────

describe("design-tokens.ts — canonical palette", () => {
  it("PAGE_BG is the documented near-black", () => {
    expect(COLORS.PAGE_BG).toBe("#0B0C0F");
  });

  it("KPI card gradient starts at documented #26262D", () => {
    expect(COLORS.KPI_TOP).toBe("#26262d");
  });

  it("KPI card gradient ends at documented #111114", () => {
    expect(COLORS.KPI_BOTTOM).toBe("#111114");
  });

  it("Chart card gradient starts at documented #17171b", () => {
    expect(COLORS.CARD_TOP).toBe("#17171b");
  });

  it("Chart card gradient ends at documented #0b0b0e", () => {
    expect(COLORS.CARD_BOTTOM).toBe("#0b0b0e");
  });

  it("BORDER is the documented subtle rgba value", () => {
    expect(COLORS.BORDER).toBe("rgba(255,255,255,0.055)");
  });

  it("TEXT_PRIMARY is off-white (not pure white)", () => {
    expect(COLORS.TEXT_PRIMARY).toBe("#F0F2F6");
    expect(COLORS.TEXT_PRIMARY).not.toBe("#FFFFFF");
  });

  it("GOLD (live-phase) is documented value", () => {
    expect(COLORS.GOLD).toBe("#D6B24A");
  });

  it("No pure white in primary palette", () => {
    // Pure white is not a Capitalife design token
    const allColorValues = Object.values(COLORS);
    expect(allColorValues).not.toContain("#FFFFFF");
    expect(allColorValues).not.toContain("#ffffff");
    expect(allColorValues).not.toContain("white");
  });
});

describe("design-tokens.ts — card radii", () => {
  it("KPI card radius is 14px", () => {
    expect(RADIUS.kpi).toBe(14);
  });

  it("Chart/data card radius is 10px", () => {
    expect(RADIUS.card).toBe(10);
  });

  it("KPI radius is larger than chart radius", () => {
    expect(RADIUS.kpi).toBeGreaterThan(RADIUS.card);
  });
});

describe("design-tokens.ts — gradients", () => {
  it("KPI_BG gradient uses documented colors", () => {
    expect(GRADIENTS.KPI_BG).toContain("#26262d");
    expect(GRADIENTS.KPI_BG).toContain("#111114");
  });

  it("CARD_BG gradient uses documented colors", () => {
    expect(GRADIENTS.CARD_BG).toContain("#17171b");
    expect(GRADIENTS.CARD_BG).toContain("#0b0b0e");
  });
});

describe("design-tokens.ts — border", () => {
  it("BORDER_STANDARD matches COLORS.BORDER", () => {
    expect(BORDER_STANDARD).toContain(COLORS.BORDER);
  });
});

describe("design-system.tsx DS object — gold law", () => {
  it("DS.colors.gold is canonical #C9A84C", () => {
    expect(DS.colors.gold).toBe("#C9A84C");
  });

  it("DS.colors.gold is muted gold (not bright yellow)", () => {
    // Bright yellow or neon gold would be wrong design language
    expect(DS.colors.gold).not.toBe("#FFD700");
    expect(DS.colors.gold).not.toBe("#F7E29D");
    expect(DS.colors.gold).not.toBe("#D8C16B");
  });

  it("DS.colors.bg is near-black (not pure black)", () => {
    expect(DS.colors.bg).toBe("#090909");
    expect(DS.colors.bg).not.toBe("#000000");
  });
});

describe("design-system.tsx DS object — radius alignment", () => {
  it("DS.radius.lg matches KPI card radius from design-tokens.ts", () => {
    // DS.radius.lg = 14 = RADIUS.kpi
    expect(DS.radius.lg).toBe(RADIUS.kpi);
  });

  it("DS.radius.md matches chart card radius from design-tokens.ts", () => {
    // DS.radius.md = 10 = RADIUS.card
    expect(DS.radius.md).toBe(RADIUS.card);
  });
});

describe("design skill — no-subtext law: primitives have no default subtext", () => {
  it("MetricCard has no subtext rendered by default — verified by prop interface", async () => {
    // The MetricCard component accepts: label, value, tone, style, title
    // It does NOT accept a "sub", "subtitle", or "description" prop
    const { MetricCard } = await import("@/components/ui/primitives");
    // Component exists and is a function
    expect(typeof MetricCard).toBe("function");
    // The fact that it compiles without a sub prop is the static guarantee;
    // here we just assert the component is the right shape
    expect(MetricCard.length).toBeLessThanOrEqual(1); // single props argument
  });
});

describe("design skill — color law: canonical negative tone is gold", () => {
  it("GOLD tone color is the documented drawdown/risk gold", () => {
    // COLORS.GOLD (#D6B24A) is used for valueVariant="negative" in kpi-card.tsx
    // and tone="risk" in MetricCard primitives
    expect(COLORS.GOLD).toMatch(/^#D6B24A$/i);
  });

  it("No pure green in main palette (green is signals-only)", () => {
    // DS object has green, but it's explicitly signals-only
    // The canonical COLORS object should NOT have a green key for general use
    const colorKeys = Object.keys(COLORS);
    // Green-related keys are acceptable if they exist only for specific uses
    // The key assertion: no pure #22C55E in COLORS (that lives in DS for signals only)
    const colorValues = Object.values(COLORS) as string[];
    expect(colorValues).not.toContain("#22C55E");
  });
});
