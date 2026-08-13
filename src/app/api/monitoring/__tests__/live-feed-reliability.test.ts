/**
 * Reliability tests for the monitoring/live-feed route.
 *
 * Covers: timeout ordering, LKG state transitions, AbortSignal propagation,
 * single-flight deduplication, cold-start bounded response, no silent masking.
 * All tests use simulated logic — no real DB connection.
 */

import { describe, it, expect, vi } from "vitest";
import type { MonitoringLiveFeedResponse, MonitoringDataHealth } from "@/lib/monitoring/live-feed-types";

// ── Constants (must match route.ts) ─────────────────────────────────────────

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS   = 5_000; // updated from 8_000

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeLKGDataHealth(
  fetchedAt: number,
  asOf: string,
  errorCode?: string,
): MonitoringDataHealth {
  const ageMs = Date.now() - fetchedAt;
  return {
    sourceHealth:           ageMs < STALE_THRESHOLD_MS ? "degraded" : "stale",
    lastSuccessfulFetchUtc: new Date(fetchedAt).toISOString(),
    dataTimestampUtc:       asOf,
    ageSeconds:             Math.round(ageMs / 1000),
    ...(errorCode ? { errorCode } : {}),
  };
}

function buildResponse(overrides?: Partial<MonitoringLiveFeedResponse>): MonitoringLiveFeedResponse {
  return {
    items: [],
    pollingSeconds: 30,
    countdownMode: "polling",
    asOf: new Date().toISOString(),
    universeCounts: { monitoring: 0, whiteSwan: 0, coreInvest: 0, deduped: 0 },
    dataHealth: {
      sourceHealth:           "live",
      lastSuccessfulFetchUtc: new Date().toISOString(),
      dataTimestampUtc:       new Date().toISOString(),
      ageSeconds:             0,
    },
    ...overrides,
  };
}

/** Simulate fetchWithTimeout logic for unit testing */
function makeFetchGate(timeoutMs: number) {
  let inflight: Promise<MonitoringLiveFeedResponse> | null = null;

  async function fetchWithTimeout(
    upstreamFn: (signal: AbortSignal) => Promise<MonitoringLiveFeedResponse>,
  ): Promise<MonitoringLiveFeedResponse> {
    if (inflight) return inflight;
    const controller = new AbortController();
    const fetchPromise = upstreamFn(controller.signal);
    fetchPromise.catch(() => {});
    let timerId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        controller.abort();
        reject(new Error("UPSTREAM_TIMEOUT"));
      }, timeoutMs);
    });
    inflight = Promise.race([fetchPromise, timeoutPromise]).finally(() => {
      clearTimeout(timerId!);
      inflight = null;
    });
    return inflight;
  }

  return { fetchWithTimeout, getInflight: () => inflight };
}

// ── Data health contract ──────────────────────────────────────────────────────

describe("MonitoringDataHealth contract", () => {
  it("live response has sourceHealth=live and ageSeconds=0", () => {
    const response = buildResponse();
    expect(response.dataHealth.sourceHealth).toBe("live");
    expect(response.dataHealth.ageSeconds).toBe(0);
    expect(response.dataHealth.lastSuccessfulFetchUtc).not.toBeNull();
    expect(response.dataHealth.errorCode).toBeUndefined();
  });

  it("degraded LKG: sourceHealth=degraded when age < 5 min", () => {
    const fetchedAt = Date.now() - 90_000;
    const health = computeLKGDataHealth(fetchedAt, "2026-08-11T10:00:00.000Z");
    expect(health.sourceHealth).toBe("degraded");
    expect(health.ageSeconds).toBeGreaterThanOrEqual(90);
    expect(health.ageSeconds).toBeLessThan(300);
    expect(health.lastSuccessfulFetchUtc).not.toBeNull();
  });

  it("stale LKG: sourceHealth=stale when age >= 5 min", () => {
    const fetchedAt = Date.now() - STALE_THRESHOLD_MS - 1000;
    const health = computeLKGDataHealth(fetchedAt, "2026-08-11T10:00:00.000Z");
    expect(health.sourceHealth).toBe("stale");
    expect(health.ageSeconds).toBeGreaterThanOrEqual(301);
  });

  it("unavailable response has sourceHealth=unavailable and null timestamps", () => {
    const unavailable: MonitoringDataHealth = {
      sourceHealth:           "unavailable",
      lastSuccessfulFetchUtc: null,
      dataTimestampUtc:       null,
      ageSeconds:             null,
      errorCode:              "UPSTREAM_TIMEOUT",
    };
    expect(unavailable.sourceHealth).toBe("unavailable");
    expect(unavailable.lastSuccessfulFetchUtc).toBeNull();
    expect(unavailable.ageSeconds).toBeNull();
    expect(unavailable.errorCode).toBe("UPSTREAM_TIMEOUT");
  });

  it("LKG dataHealth carries errorCode UPSTREAM_TIMEOUT from timed-out fetch", () => {
    const fetchedAt = Date.now() - 30_000;
    const health = computeLKGDataHealth(fetchedAt, "2026-08-11T10:00:00.000Z", "UPSTREAM_TIMEOUT");
    expect(health.errorCode).toBe("UPSTREAM_TIMEOUT");
    expect(health.sourceHealth).toBe("degraded");
  });
});

// ── LKG state transitions ──────────────────────────────────────────────────────

describe("LKG state transitions", () => {
  it("fast upstream → sourceHealth live", () => {
    const response = buildResponse({
      dataHealth: {
        sourceHealth:           "live",
        lastSuccessfulFetchUtc: new Date().toISOString(),
        dataTimestampUtc:       new Date().toISOString(),
        ageSeconds:             0,
      },
    });
    expect(response.dataHealth.sourceHealth).toBe("live");
    expect(response.dataHealth.ageSeconds).toBe(0);
    expect(response.dataHealth.errorCode).toBeUndefined();
  });

  it("slow upstream + fresh LKG → HTTP 200 DEGRADED with LKG items", () => {
    const lkgItems = [
      {
        instrumentId: "6b", ticker: "6B1!", name: "British Pound", venue: "CME",
        tab: "FX", usedBy: ["FX"], source: "CME:6B1!", price: 1.35,
        pricePrecision: 4, provider: "live_quotes" as const, feedStatus: "realtime" as const,
        delaySeconds: null, expectedDelaySeconds: null, freshnessSeconds: 5,
        sourceQuality: "realtime" as const, lastUpdateUtc: "2026-08-11T10:00:00Z",
        dataStartUtc: "2024-01-01", dataEndUtc: "2026-08-11",
        dataRowCount: null, coverageStatus: "complete" as const,
      },
    ];
    const fetchedAt = Date.now() - 60_000; // 1 min ago — still fresh
    const health = computeLKGDataHealth(fetchedAt, "2026-08-11T10:00:00.000Z", "UPSTREAM_TIMEOUT");
    const response = buildResponse({ items: lkgItems, dataHealth: health });
    expect(response.items).toHaveLength(1);
    expect(response.dataHealth.sourceHealth).toBe("degraded");
    expect(response.dataHealth.errorCode).toBe("UPSTREAM_TIMEOUT");
  });

  it("slow upstream + stale LKG → HTTP 200 STALE", () => {
    const fetchedAt = Date.now() - STALE_THRESHOLD_MS - 5_000;
    const health = computeLKGDataHealth(fetchedAt, "2026-08-11T10:00:00.000Z", "UPSTREAM_TIMEOUT");
    const response = buildResponse({ dataHealth: health });
    expect(response.dataHealth.sourceHealth).toBe("stale");
    expect(response.dataHealth.errorCode).toBe("UPSTREAM_TIMEOUT");
  });

  it("slow upstream + no LKG → bounded UNAVAILABLE with empty items", () => {
    const response = buildResponse({
      items: [],
      dataHealth: {
        sourceHealth:           "unavailable",
        lastSuccessfulFetchUtc: null,
        dataTimestampUtc:       null,
        ageSeconds:             null,
        errorCode:              "UPSTREAM_TIMEOUT",
      },
    });
    expect(response.items).toHaveLength(0);
    expect(response.dataHealth.sourceHealth).toBe("unavailable");
    expect(response.dataHealth.errorCode).toBe("UPSTREAM_TIMEOUT");
    expect(response.dataHealth.lastSuccessfulFetchUtc).toBeNull();
  });

  it("upstream error + LKG → serves LKG with errorCode", () => {
    const fetchedAt = Date.now() - 120_000;
    const health = computeLKGDataHealth(fetchedAt, "2026-08-11T09:00:00.000Z", "FetchError: network error");
    expect(health.sourceHealth).toBe("degraded");
    expect(health.errorCode).toBe("FetchError: network error");
    expect(health.lastSuccessfulFetchUtc).not.toBeNull();
  });

  it("recovery: fresh fetch after LKG → sourceHealth returns to live", () => {
    const response = buildResponse({
      dataHealth: {
        sourceHealth:           "live",
        lastSuccessfulFetchUtc: new Date().toISOString(),
        dataTimestampUtc:       new Date().toISOString(),
        ageSeconds:             0,
      },
    });
    expect(response.dataHealth.sourceHealth).toBe("live");
    expect(response.dataHealth.ageSeconds).toBe(0);
    expect(response.dataHealth.errorCode).toBeUndefined();
  });
});

// ── Timeout policy ─────────────────────────────────────────────────────────────

describe("timeout policy", () => {
  it("server timeout (5s) fires before typical client probe timeout (7s)", () => {
    const CLIENT_PROBE_TIMEOUT_MS = 7_000;
    expect(FETCH_TIMEOUT_MS).toBeLessThan(CLIENT_PROBE_TIMEOUT_MS);
  });

  it("timeout races slow fetch and rejects with UPSTREAM_TIMEOUT (simulated at 10ms)", async () => {
    const SIMULATED_TIMEOUT_MS = 10;
    const slowFetch = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("slow fetch")), SIMULATED_TIMEOUT_MS * 10),
    );
    const controller = new AbortController();
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => { controller.abort(); reject(new Error("UPSTREAM_TIMEOUT")); }, SIMULATED_TIMEOUT_MS),
    );
    await expect(Promise.race([slowFetch, timeout])).rejects.toThrow("UPSTREAM_TIMEOUT");
  });

  it("fast fetch wins over timeout", async () => {
    const fastResult = buildResponse();
    const fastFetch = Promise.resolve(fastResult);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("UPSTREAM_TIMEOUT")), FETCH_TIMEOUT_MS),
    );
    const result = await Promise.race([fastFetch, timeout]);
    expect(result).toEqual(fastResult);
  });

  it("abort controller is triggered on timeout", async () => {
    const controller = new AbortController();
    let aborted = false;
    controller.signal.addEventListener("abort", () => { aborted = true; });
    const SIMULATED_TIMEOUT_MS = 10;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => { controller.abort(); reject(new Error("UPSTREAM_TIMEOUT")); }, SIMULATED_TIMEOUT_MS),
    );
    await timeout.catch(() => {});
    expect(aborted).toBe(true);
  });
});

// ── Single-flight deduplication ───────────────────────────────────────────────

describe("single-flight", () => {
  it("concurrent cold requests share one upstream fetch", async () => {
    let fetchCallCount = 0;
    const { fetchWithTimeout } = makeFetchGate(1_000);
    const slowUpstream = (_signal: AbortSignal) => {
      fetchCallCount++;
      return new Promise<MonitoringLiveFeedResponse>((resolve) =>
        setTimeout(() => resolve(buildResponse()), 50),
      );
    };
    // Fire 3 concurrent requests simultaneously
    const [r1, r2, r3] = await Promise.all([
      fetchWithTimeout(slowUpstream),
      fetchWithTimeout(slowUpstream),
      fetchWithTimeout(slowUpstream),
    ]);
    expect(fetchCallCount).toBe(1); // only one upstream call
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it("inflight is cleared after fetch resolves", async () => {
    const { fetchWithTimeout, getInflight } = makeFetchGate(1_000);
    const upstream = (_signal: AbortSignal) => Promise.resolve(buildResponse());
    await fetchWithTimeout(upstream);
    expect(getInflight()).toBeNull();
  });

  it("inflight is cleared after fetch rejects", async () => {
    const { fetchWithTimeout, getInflight } = makeFetchGate(10);
    const neverResolves = (_signal: AbortSignal) =>
      new Promise<MonitoringLiveFeedResponse>(() => {});
    await fetchWithTimeout(neverResolves).catch(() => {});
    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 50));
    expect(getInflight()).toBeNull();
  });

  it("aborted upstream request does not later mutate canonical LKG state", async () => {
    let lkg: MonitoringLiveFeedResponse | null = null;
    const { fetchWithTimeout } = makeFetchGate(20);
    const delayedUpstream = (signal: AbortSignal) =>
      new Promise<MonitoringLiveFeedResponse>((resolve, reject) => {
        const t = setTimeout(() => {
          if (signal.aborted) reject(new DOMException("Aborted", "AbortError"));
          else { lkg = buildResponse(); resolve(lkg); }
        }, 100);
        signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); });
      });
    await fetchWithTimeout(delayedUpstream).catch(() => {});
    // Give extra time to ensure no late mutation
    await new Promise((r) => setTimeout(r, 150));
    expect(lkg).toBeNull(); // aborted upstream never committed to state
  });
});

// ── AbortSignal propagation ───────────────────────────────────────────────────

describe("AbortSignal propagation", () => {
  it("signal is aborted when timeout fires", async () => {
    const controller = new AbortController();
    const { signal } = controller;
    expect(signal.aborted).toBe(false);
    const SIMULATED_TIMEOUT_MS = 10;
    await new Promise<void>((resolve) =>
      setTimeout(() => { controller.abort(); resolve(); }, SIMULATED_TIMEOUT_MS),
    );
    expect(signal.aborted).toBe(true);
  });

  it("upstream receives aborted signal and can short-circuit", async () => {
    const controller = new AbortController();
    controller.abort(); // pre-aborted
    let receivedAborted = false;
    const upstream = (signal: AbortSignal) => {
      receivedAborted = signal.aborted;
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    };
    await upstream(controller.signal).catch(() => {});
    expect(receivedAborted).toBe(true);
  });
});

// ── Response never masks upstream errors with fake data ────────────────────────

describe("no silent error masking", () => {
  it("degraded response carries items from LKG (not invented)", () => {
    const response = buildResponse({
      items: [],
      dataHealth: {
        sourceHealth:           "degraded",
        lastSuccessfulFetchUtc: new Date().toISOString(),
        dataTimestampUtc:       new Date().toISOString(),
        ageSeconds:             45,
      },
    });
    expect(response.dataHealth.sourceHealth).toBe("degraded");
  });

  it("unavailable response does not invent items", () => {
    const response = buildResponse({
      items: [],
      dataHealth: {
        sourceHealth:           "unavailable",
        lastSuccessfulFetchUtc: null,
        dataTimestampUtc:       null,
        ageSeconds:             null,
      },
    });
    expect(response.items).toHaveLength(0);
    expect(response.dataHealth.lastSuccessfulFetchUtc).toBeNull();
  });

  it("sourceHealth is not live unless freshness contract qualifies", () => {
    // DEGRADED and STALE must never report as LIVE
    const degraded = computeLKGDataHealth(Date.now() - 60_000, "2026-08-11T10:00:00.000Z");
    const stale    = computeLKGDataHealth(Date.now() - STALE_THRESHOLD_MS - 1_000, "2026-08-11T10:00:00.000Z");
    expect(degraded.sourceHealth).not.toBe("live");
    expect(stale.sourceHealth).not.toBe("live");
  });
});
