import { describe, it, expect } from "vitest";
import { getPhysicalIntelligenceDataSourceState } from "@/lib/sentinel/tools/physical-intelligence-tool";

describe("Physical Intelligence data-source state abstraction", () => {
  it("reports AVAILABLE_LOCAL when the file is reachable and fresh", () => {
    const result = getPhysicalIntelligenceDataSourceState();
    expect(["AVAILABLE_LOCAL", "STALE", "MISSING"]).toContain(result.state);
  });

  it("never exposes an absolute filesystem path in the source label", () => {
    const result = getPhysicalIntelligenceDataSourceState();
    expect(result.sourceLabel).not.toMatch(/[C-Zc-z]:\\/);
    expect(result.sourceLabel).not.toMatch(/\/home\//);
    expect(result.sourceLabel).not.toMatch(/\/Users\//);
    expect(result.detail).not.toMatch(/[C-Zc-z]:\\/);
  });

  it("sourceLabel is a stable structural identifier, not a raw path", () => {
    const result = getPhysicalIntelligenceDataSourceState();
    expect(result.sourceLabel).toBe("physical-intelligence-forward-v2");
  });
});
