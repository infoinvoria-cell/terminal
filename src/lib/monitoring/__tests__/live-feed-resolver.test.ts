import { describe, expect, it } from "vitest";
import { buildDedupedLiveFeedUniverse, resolveFeedStatus } from "@/lib/monitoring/live-feed-resolver";

describe("buildDedupedLiveFeedUniverse", () => {
  it("dedupes symbols across monitoring and invest tabs", () => {
    const result = buildDedupedLiveFeedUniverse(
      [
        { tab: "Indizes", symbol: "NQ1!", requestSymbol: "NQ1!" },
        { tab: "Invest", symbol: "NQ1!", requestSymbol: "NQ1!" },
        { tab: "Agrar", symbol: "ZW1!", requestSymbol: "ZW1!" },
      ],
      [{ symbol: "NQ1!" }, { symbol: "ZW1!" }],
    );

    expect(result.assets).toHaveLength(2);
    // WS instruments already in monitoring get "White Swan" added to usedBy for provenance.
    expect(result.assets.find((asset) => asset.ticker === "NQ1!")?.usedBy).toContain("Indizes");
    expect(result.assets.find((asset) => asset.ticker === "NQ1!")?.usedBy).toContain("Invest");
    expect(result.assets.find((asset) => asset.ticker === "NQ1!")?.usedBy).toContain("White Swan");
    expect(result.counts).toEqual({
      monitoring: 2,
      whiteSwan: 2,
      coreInvest: 1,
      deduped: 2,
    });
  });

  it("adds real WS instruments not in monitoring to the canonical union", () => {
    // New behavior: WS real instruments (no _ in ticker) are added even if not in monitoring.
    const result = buildDedupedLiveFeedUniverse(
      [{ tab: "Indizes", symbol: "ES1!", requestSymbol: "ES1!" }],
      [{ symbol: "GC1!", group: "Metalle" }],
    );

    expect(result.counts.whiteSwan).toBe(1);
    expect(result.counts.deduped).toBe(2);
    expect(result.assets.find((a) => a.ticker === "GC1!")?.usedBy).toEqual(["White Swan"]);
  });

  it("excludes WS strategy identifiers — primary: canonical route set, fallback: underscore", () => {
    // Canonical set from strategy_runtime_routes.json (universeSymbol != asset).
    const canonicalStrategyIds = new Set(["DE30EUR_1H", "DE30EUR_2H", "EURUSD_30M", "GBPUSD_30M"]);

    const result = buildDedupedLiveFeedUniverse(
      [{ tab: "Indizes", symbol: "ES1!", requestSymbol: "ES1!" }],
      [
        { symbol: "EURUSD_30M" },        // in canonical set → excluded
        { symbol: "DE30EUR_1H" },        // in canonical set → excluded
        { symbol: "NAS100USD_E_STEP_INVEST" }, // not in set but has _ → fallback excludes
        { symbol: "EURUSD", group: "Forex" },  // real instrument → included
      ],
      [],
      canonicalStrategyIds,
    );

    expect(result.assets.map((a) => a.ticker)).not.toContain("EURUSD_30M");
    expect(result.assets.map((a) => a.ticker)).not.toContain("DE30EUR_1H");
    expect(result.assets.map((a) => a.ticker)).not.toContain("NAS100USD_E_STEP_INVEST");
    expect(result.assets.map((a) => a.ticker)).toContain("EURUSD");
  });
});

describe("resolveFeedStatus", () => {
  it("marks realtime only when a live price exists and no delay is known", () => {
    expect(
      resolveFeedStatus({
        hasLivePrice: true,
        liveAgeMs: 2_000,
        delaySeconds: 0,
        hasFallbackPrice: false,
      }),
    ).toBe("realtime");
  });

  it("marks delayed when a live price exists but metadata reports delay", () => {
    expect(
      resolveFeedStatus({
        hasLivePrice: true,
        liveAgeMs: 5_000,
        delaySeconds: 900,
        hasFallbackPrice: false,
      }),
    ).toBe("delayed");
  });

  it("marks stale and offline by age", () => {
    expect(
      resolveFeedStatus({
        hasLivePrice: true,
        liveAgeMs: 45 * 60 * 1000,
        delaySeconds: 900,
        hasFallbackPrice: false,
      }),
    ).toBe("stale");

    expect(
      resolveFeedStatus({
        hasLivePrice: true,
        liveAgeMs: 3 * 60 * 60 * 1000,
        delaySeconds: 900,
        hasFallbackPrice: false,
      }),
    ).toBe("offline");
  });

  it("stays unavailable when only historical fallback data exists", () => {
    expect(
      resolveFeedStatus({
        hasLivePrice: false,
        liveAgeMs: null,
        delaySeconds: null,
        hasFallbackPrice: true,
      }),
    ).toBe("unavailable");
  });
});
