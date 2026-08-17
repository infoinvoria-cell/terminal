import { describe, expect, it } from "vitest";
import { filterGlobeLabels, type GlobeLabelCandidate } from "@/lib/globe/label-policy";

const point = (overrides: Partial<GlobeLabelCandidate> = {}): GlobeLabelCandidate => ({
  lat: 40,
  lng: -90,
  kind: "asset",
  assetId: "",
  category: "Markets",
  ...overrides,
});

describe("Globe label policy", () => {
  it("keeps the selected object and higher-priority intelligence first", () => {
    const result = filterGlobeLabels([
      point({ assetId: "other", kind: "asset" }),
      point({ assetId: "event", kind: "event", eventSeverity: "CRITICAL", lat: 10, lng: 10 }),
      point({ assetId: "selected", kind: "asset" }),
    ], { selectedAssetId: "selected", detailLevel: 3, satelliteMode: false, physicalIntelEnabled: false });

    expect(result.map((item) => item.assetId)).toContain("selected");
    expect(result.map((item) => item.assetId)).toContain("event");
  });

  it("suppresses colliding lower-priority labels", () => {
    const result = filterGlobeLabels([
      point({ assetId: "critical", kind: "event", eventSeverity: "HIGH" }),
      point({ assetId: "nearby", kind: "asset", lat: 41, lng: -89 }),
      point({ assetId: "far", kind: "asset", lat: 20, lng: -20 }),
    ], { selectedAssetId: "", detailLevel: 3, satelliteMode: false, physicalIntelEnabled: false });

    expect(result.map((item) => item.assetId)).toEqual(expect.arrayContaining(["critical", "far"]));
    expect(result.map((item) => item.assetId)).not.toContain("nearby");
  });

  it("uses a separate minimal satellite policy", () => {
    const result = filterGlobeLabels([
      point({ assetId: "selected" }),
      point({ assetId: "context", lat: 15, lng: 15 }),
      point({ assetId: "physical", kind: "region", category: "Physical Intelligence", lat: 35, lng: -95 }),
      point({ assetId: "low-event", kind: "event", eventSeverity: "LOW", lat: 50, lng: 30 }),
      point({ assetId: "high-event", kind: "event", eventSeverity: "HIGH", lat: 55, lng: 30 }),
    ], { selectedAssetId: "selected", detailLevel: 3, satelliteMode: true, physicalIntelEnabled: true });

    expect(result.map((item) => item.assetId)).toEqual(expect.arrayContaining(["selected", "physical", "high-event"]));
    expect(result.map((item) => item.assetId)).not.toContain("context");
    expect(result.map((item) => item.assetId)).not.toContain("low-event");
  });
});
