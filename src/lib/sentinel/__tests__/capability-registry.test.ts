import { describe, it, expect } from "vitest";
import { getCapabilityRegistry, PERMISSIONS, summarizeCapabilitiesForPrompt } from "@/lib/sentinel/capability-registry";

describe("capability registry — honesty checks", () => {
  it("never claims AVAILABLE for a source with no wired code path", () => {
    const caps = getCapabilityRegistry();
    const unwired = caps.filter((c) =>
      ["globe_context", "monitoring_context", "market_data"].includes(c.id)
    );
    for (const c of unwired) {
      expect(c.availability).not.toBe("AVAILABLE");
      expect(c.availability).not.toBe("AVAILABLE_LOCAL");
    }
  });

  it("core_invest_context and physical_intelligence_context are AVAILABLE_LOCAL now that Slice 4 wired them, but never plain AVAILABLE (deployment not proven)", () => {
    const caps = getCapabilityRegistry();
    const coreInvest = caps.find((c) => c.id === "core_invest_context");
    const physical = caps.find((c) => c.id === "physical_intelligence_context");
    expect(coreInvest?.availability).toBe("AVAILABLE_LOCAL");
    expect(physical?.availability).toBe("AVAILABLE_LOCAL");
    expect(coreInvest?.note).toMatch(/RESEARCH_ONLY/);
    expect(physical?.note).toMatch(/SHADOW_OBSERVATION/);
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

  it("white_swan_context is AVAILABLE_LOCAL — live-chat wired, but not deployment-proven", () => {
    const caps = getCapabilityRegistry();
    const ws = caps.find((c) => c.id === "white_swan_context");
    expect(ws?.availability).toBe("AVAILABLE_LOCAL");
    expect(ws?.note).toMatch(/verified live/i);
    expect(ws?.note).toMatch(/untracked in git/i);
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
