import { describe, expect, it } from "vitest";
import { WS_STRATEGIES } from "@/lib/components/ws-strategy-data";
import { cropConditionScore, resolvePhysicalStatus } from "./scoring";
import { attachShadowPhysicalIntelligence, canonicalPositionMultiplier, hypotheticalShadowMultiplier, preserveCanonicalExecution } from "./shadow";
import { validatePhysicalRegions } from "./regions";

describe("White Swan Physical Intelligence V1", () => {
  it("keeps the canonical active registry count unchanged", () => {
    expect(WS_STRATEGIES.filter((row) => row.status === "active")).toHaveLength(17);
    expect(WS_STRATEGIES.filter((row) => row.status === "active")).toHaveLength(17);
  });

  it("cannot change canonical position sizing", () => {
    const attachment = attachShadowPhysicalIntelligence("zc_seasonal", null);
    expect(attachment?.positionMultiplier).toBe(1);
    expect(canonicalPositionMultiplier()).toBe(1);
  });

  it("uses the original behavior when physical data is absent or stale", () => {
    expect(hypotheticalShadowMultiplier(null)).toBe(1);
    expect(resolvePhysicalStatus({ score: -80, earliestKnownTimestamp: "2026-08-01T00:00:00Z", freshnessHours: 400, staleAfterHours: 336 })).toBe("STALE");
    expect(hypotheticalShadowMultiplier({ score: -80, status: "STALE" } as never)).toBe(1);
  });

  it("rejects unavailable/future observations", () => {
    expect(resolvePhysicalStatus({ score: null, earliestKnownTimestamp: null, freshnessHours: null, staleAfterHours: 1 })).toBe("UNAVAILABLE");
    expect(resolvePhysicalStatus({ score: 20, earliestKnownTimestamp: "2026-08-18T00:00:00Z", freshnessHours: 0, staleAfterHours: 1 }, new Date("2026-08-17T00:00:00Z"))).toBe("UNAVAILABLE");
  });

  it("calculates the documented score deterministically", () => {
    expect(cropConditionScore(61, 72)).toBe(-55);
    expect(cropConditionScore(72, 61)).toBe(55);
  });

  it("validates explicit region configuration", () => {
    expect(validatePhysicalRegions()).toBe(true);
  });

  it("keeps the hypothetical filter separate from canonical trading", () => {
    const attachment = attachShadowPhysicalIntelligence("zs_seasonal", { score: -55, status: "AVAILABLE" } as never);
    expect(attachment?.shadowOnly).toBe(true);
    expect(attachment?.positionMultiplier).toBe(1);
    expect(hypotheticalShadowMultiplier({ score: -55, status: "AVAILABLE" } as never)).toBe(0.95);
  });

  it("proves shadow mode preserves trades, positions, PnL and margin", () => {
    const original = [{ tradeId: "T1", position: 1, pnl: 42.5, margin: 520 }, { tradeId: "T2", position: 0, pnl: 0, margin: 0 }];
    const shadow = preserveCanonicalExecution(original);
    expect(shadow).toEqual(original);
    expect(shadow.map((row) => row.tradeId)).toEqual(original.map((row) => row.tradeId));
    expect(shadow.map((row) => row.position)).toEqual(original.map((row) => row.position));
    expect(shadow.reduce((sum, row) => sum + row.pnl, 0)).toBe(original.reduce((sum, row) => sum + row.pnl, 0));
    expect(shadow.reduce((sum, row) => sum + row.margin, 0)).toBe(original.reduce((sum, row) => sum + row.margin, 0));
  });
});
