import { describe, expect, it } from "vitest";
import {
  aggregatePortfolioHealth,
  classifyLiveStatus,
  classifyRuntimeStatus,
  evaluateHistoricalStatus,
  evaluateSignalContract,
  type StrategyOperationalHealth,
} from "./operational-health";

describe("institutional operational health", () => {
  it("treats daily quotes as current when market is closed but data is recent", () => {
    const result = classifyLiveStatus({
      nowUtc: "2026-08-11T08:00:00.000Z",
      timeframe: "D",
      provider: "tradingview",
      providerTimestampUtc: "2026-08-10T15:09:51.000Z",
      receivedTimestampUtc: "2026-08-10T15:09:52.000Z",
    });

    expect(result.status).toBe("CURRENT_MARKET_CLOSED");
    expect(result.lagSeconds).toBeGreaterThan(0);
  });

  it("marks stale intraday quotes honestly", () => {
    const result = classifyLiveStatus({
      nowUtc: "2026-08-11T08:00:00.000Z",
      timeframe: "30M",
      provider: "tradingview",
      providerTimestampUtc: "2026-08-10T15:09:51.000Z",
      receivedTimestampUtc: "2026-08-10T15:09:52.000Z",
    });

    expect(result.status).toBe("STALE");
  });

  it("accepts NONE semantics when runtime state is current and no trade is open", () => {
    const runtime = classifyRuntimeStatus({
      nowUtc: "2026-08-11T08:00:00.000Z",
      state: {
        freshness: "CURRENT",
        lastEvaluatedBarUtc: "2026-08-11T07:30:00.000Z",
        currentSignal: null,
        openTrades: [],
      },
    });
    const signal = evaluateSignalContract({
      runtimeStatus: runtime.status,
      state: {
        freshness: "CURRENT",
        lastEvaluatedBarUtc: "2026-08-11T07:30:00.000Z",
        currentSignal: null,
        openTrades: [],
      },
    });

    expect(runtime.status).toBe("LIVE");
    expect(signal.implemented).toBe(true);
    expect(signal.current).toBe(true);
    expect(signal.issues).toEqual([]);
  });

  it("degrades bad historical quality without faking readiness", () => {
    const historical = evaluateHistoricalStatus({
      historicalConfigured: true,
      historicalVerified: true,
      rowCount: 100,
      coverageStatus: "PARTIAL",
      realGapCount: 5,
    });

    expect(historical.ready).toBe(true);
    expect(historical.status).toBe("DEGRADED");
    expect(historical.issues).toContain("HISTORY_REAL_GAPS_PRESENT");
  });

  it("aggregates portfolio health from canonical strategy rows", () => {
    const rows: StrategyOperationalHealth[] = [
      {
        strategyId: "one",
        portfolio: "White Swan",
        instrument: "ES1",
        timeframe: "D",
        researchReady: true,
        historicalDataReady: true,
        runtimeImplemented: true,
        runtimeProcessAvailable: true,
        runtimeOnline: true,
        liveSourceMapped: true,
        liveSourceReachable: true,
        liveSourceFresh: true,
        strategyEvaluableNow: true,
        signalContractImplemented: true,
        signalCurrent: true,
        monitoringMapped: true,
        engineMapped: true,
        brainMapped: true,
        sentinelMapped: true,
        paperBrokerMapped: false,
        researchStatus: "READY",
        historicalDataStatus: "READY",
        liveDataStatus: "LIVE",
        liveDataLagSeconds: 1,
        runtimeStatus: "LIVE",
        runtimeLastEvaluationUtc: "2026-08-11T07:30:00.000Z",
        signalStatus: "LIVE",
        signalLastUpdatedUtc: "2026-08-11T07:30:00.000Z",
        monitoringStatus: "READY",
        engineStatus: "READY",
        brainStatus: "READY",
        sentinelStatus: "READY",
        paperBrokerStatus: "UNAVAILABLE",
        overallOperationalStatus: "LIVE",
        issues: [],
      },
      {
        strategyId: "two",
        portfolio: "White Swan",
        instrument: "GC1",
        timeframe: "D",
        researchReady: true,
        historicalDataReady: false,
        runtimeImplemented: false,
        runtimeProcessAvailable: false,
        runtimeOnline: false,
        liveSourceMapped: false,
        liveSourceReachable: false,
        liveSourceFresh: false,
        strategyEvaluableNow: false,
        signalContractImplemented: false,
        signalCurrent: false,
        monitoringMapped: false,
        engineMapped: false,
        brainMapped: false,
        sentinelMapped: false,
        paperBrokerMapped: false,
        researchStatus: "READY",
        historicalDataStatus: "UNAVAILABLE",
        liveDataStatus: "SOURCE_MISSING",
        liveDataLagSeconds: null,
        runtimeStatus: "UNAVAILABLE",
        runtimeLastEvaluationUtc: null,
        signalStatus: "UNAVAILABLE",
        signalLastUpdatedUtc: null,
        monitoringStatus: "UNAVAILABLE",
        engineStatus: "UNAVAILABLE",
        brainStatus: "UNAVAILABLE",
        sentinelStatus: "UNAVAILABLE",
        paperBrokerStatus: "UNAVAILABLE",
        overallOperationalStatus: "RUNTIME_NOT_IMPLEMENTED",
        issues: ["RUNTIME_ROUTE_MISSING"],
      },
    ];

    const [portfolio] = aggregatePortfolioHealth(rows);
    expect(portfolio.portfolio).toBe("White Swan");
    expect(portfolio.totalStrategies).toBe(2);
    expect(portfolio.runtimeImplemented).toBe(1);
    expect(portfolio.signalCurrent).toBe(1);
    expect(portfolio.unavailable).toBe(1);
  });
});
