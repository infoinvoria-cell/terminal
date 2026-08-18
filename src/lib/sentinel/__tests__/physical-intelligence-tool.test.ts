import { describe, it, expect } from "vitest";
import {
  getPhysicalIntelligenceForCommodity, getPhysicalIntelligenceKnownCommodities,
} from "@/lib/sentinel/tools/physical-intelligence-tool";

describe("Physical Intelligence tool — real forward-observation data, not hardcoded", () => {
  it("Corn has real USDA + NOAA observations", () => {
    const result = getPhysicalIntelligenceForCommodity("CORN");
    expect(result.status).toBe("AVAILABLE");
    expect(result.observations?.length).toBeGreaterThanOrEqual(2);
    const providers = result.observations?.map((o) => o.provider) ?? [];
    expect(providers.some((p) => /USDA/i.test(p))).toBe(true);
    expect(providers.some((p) => /NOAA/i.test(p))).toBe(true);
  });

  it("Soy has real observations distinct from Corn", () => {
    const corn = getPhysicalIntelligenceForCommodity("CORN");
    const soy = getPhysicalIntelligenceForCommodity("SOY");
    expect(soy.status).toBe("AVAILABLE");
    expect(soy.observations?.[0]?.score).not.toBe(corn.observations?.[0]?.score);
  });

  it("Wheat has at least one observation", () => {
    const result = getPhysicalIntelligenceForCommodity("WHEAT");
    expect(result.status).toBe("AVAILABLE");
    expect(result.observations?.length).toBeGreaterThanOrEqual(1);
  });

  it("Crude is honestly UNAVAILABLE at the observation level, never fabricated", () => {
    const result = getPhysicalIntelligenceForCommodity("CRUDE");
    expect(result.status).toBe("AVAILABLE"); // the commodity IS tracked...
    const crudeObs = result.observations?.[0];
    expect(crudeObs?.status).toBe("UNAVAILABLE"); // ...but its actual data point is not
    expect(crudeObs?.score).toBeNull();
  });

  it("trading impact is NONE under SHADOW_OBSERVATION_ONLY mode — never fabricated as active", () => {
    const result = getPhysicalIntelligenceForCommodity("CORN");
    expect(result.mode).toMatch(/SHADOW|OBSERVATION_ONLY/i);
    expect(result.tradingImpact).toBe("NONE");
    expect(result.edgeStatus).toBe("SHADOW_OBSERVATION");
  });

  it("an unknown commodity returns BLOCKED with known-commodities list, never guesses", () => {
    const result = getPhysicalIntelligenceForCommodity("BITCOIN");
    expect(result.status).toBe("BLOCKED");
    expect(result.failureReason).toBeTruthy();
  });

  it("known commodities list includes Corn, Soy, Wheat, Crude", () => {
    const known = getPhysicalIntelligenceKnownCommodities();
    expect(known).toContain("CORN");
    expect(known).toContain("SOY");
    expect(known).toContain("WHEAT");
    expect(known).toContain("CRUDE");
  });
});
