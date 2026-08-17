import { describe, expect, it, vi } from "vitest";

const fetchOptionalGlobeJson = vi.hoisted(() => vi.fn());

vi.mock("@/lib/globe/api", () => ({ fetchOptionalGlobeJson }));

import {
  buildPhysicalRegions,
  getPhysicalIntelligence,
  type PhysicalIntelResponse,
} from "@/lib/globe/physical-intelligence";

const snapshot: PhysicalIntelResponse = {
  generatedAt: "2026-08-17T12:00:00.000Z",
  mode: "SHADOW_OBSERVATION_ONLY",
  positionMultiplier: 1,
  observations: [
    {
      componentId: "corn-usda",
      commodity: "CORN",
      provider: "USDA",
      variable: "crop_condition",
      regionIds: ["us_corn_belt"],
      observationTimestamp: "2026-08-16T00:00:00.000Z",
      publicationTimestamp: null,
      retrievalTimestamp: "2026-08-17T12:00:00.000Z",
      score: -55,
      confidence: 0.88,
      state: "CONTRADICTORY",
      status: "AVAILABLE",
      freshnessHours: 12,
      staleAfterHours: 168,
      accessClass: "FREE_NO_ACCOUNT",
      sourceUrl: "https://example.test/usda",
      rawInputs: {},
    },
    {
      componentId: "corn-noaa",
      commodity: "CORN",
      provider: "NOAA",
      variable: "vhi",
      regionIds: ["us_corn_belt"],
      observationTimestamp: "2026-08-16T00:00:00.000Z",
      publicationTimestamp: null,
      retrievalTimestamp: "2026-08-17T12:00:00.000Z",
      score: -30,
      confidence: 0.7,
      state: "CONTRADICTORY",
      status: "AVAILABLE",
      freshnessHours: 12,
      staleAfterHours: 72,
      accessClass: "FREE_NO_ACCOUNT",
      sourceUrl: "https://example.test/noaa",
      rawInputs: {},
    },
    {
      componentId: "soy-noaa",
      commodity: "SOY",
      provider: "NOAA",
      variable: "vhi",
      regionIds: ["us_soy_production"],
      observationTimestamp: "2026-08-10T00:00:00.000Z",
      publicationTimestamp: null,
      retrievalTimestamp: "2026-08-17T12:00:00.000Z",
      score: null,
      confidence: 0,
      state: "STALE",
      status: "STALE",
      freshnessHours: 180,
      staleAfterHours: 72,
      accessClass: "FREE_NO_ACCOUNT",
      sourceUrl: "https://example.test/noaa",
      rawInputs: {},
    },
  ],
};

describe("Globe physical intelligence adapter", () => {
  it("normalizes official and VHI observations into real bounded regions", () => {
    const regions = buildPhysicalRegions(snapshot);
    const corn = regions.find((region) => region.commodity === "CORN");

    expect(corn).toMatchObject({
      id: "us_corn_belt",
      label: "US Corn Belt",
      bbox: [-104.1, 36.9, -80, 49.4],
      score: -55,
      officialScore: -55,
      vhiScore: -30,
      state: "CONTRADICTORY",
      source: "USDA",
    });
  });

  it("keeps stale/unavailable input observation-only and never invents a score", () => {
    const regions = buildPhysicalRegions(snapshot);
    const soy = regions.find((region) => region.commodity === "SOY");

    expect(soy).toMatchObject({
      score: null,
      officialScore: null,
      vhiScore: null,
      state: "STALE",
    });
  });

  it("fails closed when the optional provider is unavailable", async () => {
    fetchOptionalGlobeJson.mockResolvedValueOnce(null);

    await expect(getPhysicalIntelligence()).resolves.toBeNull();
    expect(fetchOptionalGlobeJson).toHaveBeenCalledWith(
      "/api/white-swan/physical-intelligence",
      6 * 60 * 60 * 1000,
      null,
    );
  });
});
