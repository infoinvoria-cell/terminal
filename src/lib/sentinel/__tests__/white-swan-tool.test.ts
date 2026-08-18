import { describe, it, expect } from "vitest";
import {
  getWhiteSwanRiskModesForTier,
  getWhiteSwanSpComparison,
  getWhiteSwanAvailableTiers,
} from "@/lib/sentinel/tools/white-swan-tool";

describe("White Swan tool — real v7 data, not hardcoded", () => {
  it("returns the corrected 15k-tier MaxDD (~20.17%), not the old stale 4.66% bug", () => {
    const result = getWhiteSwanRiskModesForTier(15000);
    expect(result.status).toBe("AVAILABLE");
    const mode1x = result.tierData?.modes.find((m) => m.id === "1.0x");
    expect(mode1x).toBeDefined();
    expect(mode1x?.maxDDPct).toBeCloseTo(20.17, 1);
    expect(mode1x?.maxDDPct).not.toBeCloseTo(4.66, 1);
  });

  it("returns two risk modes at the 50k tier (1.0x and MAX)", () => {
    const result = getWhiteSwanRiskModesForTier(50000);
    expect(result.status).toBe("AVAILABLE");
    const ids = result.tierData?.modes.map((m) => m.id).sort();
    expect(ids).toEqual(["1.0x", "MAX"]);
  });

  it("reports BLOCKED with a structured reason for an unknown tier — never guesses", () => {
    const result = getWhiteSwanRiskModesForTier(999999);
    expect(result.status).toBe("BLOCKED");
    expect(result.failureReason).toBeTruthy();
    expect(result.tiers?.length).toBeGreaterThan(0);
  });

  it("every result includes the running-peak MaxDD methodology explanation", () => {
    const result = getWhiteSwanRiskModesForTier(15000);
    expect(result.maxDDMethodology).toMatch(/runningPeak|running-peak/);
  });

  it("S&P comparison at 15k reflects real benchmark data with provenance", () => {
    const result = getWhiteSwanSpComparison(15000);
    expect(result.status).toBe("AVAILABLE");
    expect(result.spComparison?.tier).toBe(15000);
    expect(result.spComparison?.whiteSwanMaxDD).toBeCloseTo(20.17, 1);
    expect(result.source).toContain("analytics-generated.json");
  });

  it("available tiers list is non-empty and includes 15000", () => {
    const tiers = getWhiteSwanAvailableTiers();
    expect(tiers).toContain("15000");
  });
});

describe("no-stale-number regression — old MaxDD bug must never reappear", () => {
  it("no source file contains the old stale per-sleeve numeric table pattern", async () => {
    const fs = await import("fs");
    const files = [
      "src/lib/sentinel/capitalife-context.ts",
      "src/lib/sentinel/providers/provider-router.ts",
      "src/lib/sentinel/capability-registry.ts",
      "src/lib/sentinel/tools/white-swan-tool.ts",
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf-8");
      expect(src, `${f} must not contain the old stale -4.66% figure`).not.toMatch(/-?4\.66\s*%/);
      expect(src, `${f} must not contain the old stale -0.86% figure`).not.toMatch(/-0\.86\s*%/);
      expect(src, `${f} must not contain the old stale -3.02% figure`).not.toMatch(/-3\.02\s*%/);
      expect(src, `${f} must not contain the old stale -5.84% figure`).not.toMatch(/-5\.84\s*%/);
    }
  });
});
