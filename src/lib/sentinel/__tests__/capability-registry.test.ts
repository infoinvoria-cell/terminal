import { describe, it, expect } from "vitest";
import { getCapabilityRegistry, PERMISSIONS, summarizeCapabilitiesForPrompt } from "@/lib/sentinel/capability-registry";

describe("capability registry — honesty checks", () => {
  it("never claims AVAILABLE for a source with no wired code path", () => {
    const caps = getCapabilityRegistry();
    const unwired = caps.filter((c) =>
      ["globe_context", "monitoring_context", "market_data", "physical_intelligence_context"].includes(c.id)
    );
    for (const c of unwired) {
      expect(c.availability).not.toBe("AVAILABLE");
    }
  });

  it("live order authority is NO", () => {
    expect(PERMISSIONS.liveOrderAuthority).toBe("NO");
  });

  it("forbidden permissions never appear in granted list", () => {
    const overlap = PERMISSIONS.granted.filter((g) => (PERMISSIONS.forbidden as readonly string[]).includes(g));
    expect(overlap).toEqual([]);
  });

  it("forbidden list covers all destructive/authority actions", () => {
    expect(PERMISSIONS.forbidden).toContain("PLACE_ORDER");
    expect(PERMISSIONS.forbidden).toContain("CANCEL_ORDER");
    expect(PERMISSIONS.forbidden).toContain("MOVE_MONEY");
    expect(PERMISSIONS.forbidden).toContain("MODIFY_BROKER");
    expect(PERMISSIONS.forbidden).toContain("READ_SECRET");
    expect(PERMISSIONS.forbidden).toContain("WRITE_ARBITRARY_FILE");
    expect(PERMISSIONS.forbidden).toContain("BYPASS_AUTH");
  });

  it("prompt summary never includes secret-shaped strings", () => {
    const summary = summarizeCapabilitiesForPrompt();
    expect(summary).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(summary).not.toMatch(/api[_-]?key/i);
  });

  it("white_swan_context capability explicitly warns against hardcoded numbers", () => {
    const caps = getCapabilityRegistry();
    const ws = caps.find((c) => c.id === "white_swan_context");
    expect(ws?.note.toLowerCase()).toContain("not");
    expect(ws?.note).toMatch(/hardcod|unavailable/i);
  });
});

describe("static system prompt — no hardcoded stale White Swan numbers", () => {
  it("SENTINEL_SYSTEM_PROMPT contains no numeric MaxDD/CAGR/Sharpe table", async () => {
    const { SENTINEL_SYSTEM_PROMPT } = await import("@/lib/sentinel/providers/provider-router");
    expect(SENTINEL_SYSTEM_PROMPT).not.toMatch(/-0\.86\s*%/);
    expect(SENTINEL_SYSTEM_PROMPT).not.toMatch(/-3\.02\s*%/);
    expect(SENTINEL_SYSTEM_PROMPT).not.toMatch(/-5\.84\s*%/);
  });

  it("capitalife-context static fallback contains no per-sleeve numeric performance table", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/lib/sentinel/capitalife-context.ts", "utf-8");
    expect(src).not.toMatch(/Agrar Final\s*\|\s*1\.94/);
    expect(src).not.toMatch(/-0\.86\s*%/);
  });
});
