import { describe, it, expect } from "vitest";
import { getSentinelUsageSummary } from "@/lib/sentinel/usage-brief";

describe("Sentinel usage-brief — collaboration contract for other surfaces (e.g. Globe)", () => {
  it("returns the exact documented shape", async () => {
    const summary = await getSentinelUsageSummary();
    expect(summary).toHaveProperty("freeOnly", true);
    expect(summary).toHaveProperty("providersReady");
    expect(summary).toHaveProperty("providersTotal");
    expect(summary).toHaveProperty("currentProvider");
    expect(summary).toHaveProperty("currentModel");
    expect(summary).toHaveProperty("contextUsed");
    expect(summary).toHaveProperty("contextMax");
    expect(summary).toHaveProperty("todayTokens");
    expect(summary).toHaveProperty("weekTokens");
    expect(summary).toHaveProperty("monthTokens");
    expect(summary).toHaveProperty("capacityStatus");
  });

  it("freeOnly is always true — not a client-controllable flag in the payload shape", async () => {
    const summary = await getSentinelUsageSummary();
    expect(summary.freeOnly).toBe(true);
  });

  it("providersReady never exceeds providersTotal", async () => {
    const summary = await getSentinelUsageSummary();
    expect(summary.providersReady).toBeLessThanOrEqual(summary.providersTotal);
  });

  it("capacityStatus is one of the three documented states", async () => {
    const summary = await getSentinelUsageSummary();
    expect(["healthy", "degraded", "offline"]).toContain(summary.capacityStatus);
  });

  it("serialized payload never contains an API key, secret, or absolute path", async () => {
    const summary = await getSentinelUsageSummary();
    const json = JSON.stringify(summary);
    expect(json).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(json).not.toMatch(/api[_-]?key/i);
    expect(json).not.toMatch(/[C-Zc-z]:\\/);
    expect(json).not.toMatch(/\/home\//);
    expect(json).not.toMatch(/\/Users\//);
  });

  it("token counts are non-negative numbers", async () => {
    const summary = await getSentinelUsageSummary();
    expect(summary.todayTokens).toBeGreaterThanOrEqual(0);
    expect(summary.weekTokens).toBeGreaterThanOrEqual(0);
    expect(summary.monthTokens).toBeGreaterThanOrEqual(0);
  });
});
