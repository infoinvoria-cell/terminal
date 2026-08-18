import { describe, it, expect } from "vitest";
import { getCoreInvestMetricsForTier, getCoreInvestLiveReadiness, getCoreInvestAvailableTiers } from "@/lib/sentinel/tools/core-invest-tool";

describe("Core Invest tool — real v2 data, not hardcoded", () => {
  it("returns real investorNet metrics for the €10k tier", () => {
    const result = getCoreInvestMetricsForTier(10000, "investorNet");
    expect(result.status).toBe("AVAILABLE");
    expect(result.metrics?.CAGR).toBeCloseTo(13.57, 1);
    expect(result.metrics?.maxDDPct).toBeCloseTo(33.21, 1);
    expect(result.metrics?.basis).toBe("investorNet");
  });

  it("gross vs investorNet are genuinely different values — never conflated", () => {
    const investor = getCoreInvestMetricsForTier(10000, "investorNet");
    const gross = getCoreInvestMetricsForTier(10000, "gross");
    expect(investor.metrics?.CAGR).not.toBe(gross.metrics?.CAGR);
    expect(gross.metrics?.CAGR).toBeCloseTo(18.32, 1);
  });

  it("reports BLOCKED with a structured reason for an unknown tier", () => {
    const result = getCoreInvestMetricsForTier(999999);
    expect(result.status).toBe("BLOCKED");
    expect(result.failureReason).toBeTruthy();
  });

  it("live readiness never upgrades RESEARCH_ONLY to live-ready", () => {
    const result = getCoreInvestLiveReadiness();
    expect(result.status).toBe("AVAILABLE");
    expect(result.liveReadiness?.classification).toBe("RESEARCH_ONLY");
    expect(result.liveReadiness?.wouldTradeToday).toBe("NO");
    expect(result.liveReadiness?.reason).toMatch(/EXTERNAL_REQUIRED|no live/i);
  });

  it("available tiers list is non-empty and includes 10000", () => {
    const tiers = getCoreInvestAvailableTiers();
    expect(tiers).toContain("10000");
  });
});
