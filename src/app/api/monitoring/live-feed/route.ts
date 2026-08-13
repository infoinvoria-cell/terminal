import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { buildMonitoringLiveFeedView } from "@/lib/market-data/live-feed-view";
import type { MonitoringLiveFeedResponse, MonitoringDataHealth } from "@/lib/monitoring/live-feed-types";
import { getFailureRequestId, shouldInjectFailure } from "@/lib/server/capitalife-failure-injection";
import { logServerFailure } from "@/lib/runtime/capitalife-errors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ── Last-Known-Good in-process cache ─────────────────────────────────────────
// Persists across requests within the same Node process lifetime.
// Bounded by STALE_THRESHOLD_MS: callers see DEGRADED (< 5 min) or STALE (>= 5 min).

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
// Server must resolve (live or LKG) BEFORE the client probe times out.
// Ordering: FETCH_TIMEOUT_MS (5 s) < client probe timeout (~7 s) < socket timeout.
const FETCH_TIMEOUT_MS = 5_000;

type LKGEntry = {
  data: MonitoringLiveFeedResponse;
  fetchedAt: number; // Date.now()
};

let _lkg: LKGEntry | null = null;
// Single-flight: concurrent requests share one in-progress upstream fetch.
let _inflight: Promise<MonitoringLiveFeedResponse> | null = null;

function getLKGDataHealth(lkg: LKGEntry, errorCode?: string): MonitoringDataHealth {
  const ageMs = Date.now() - lkg.fetchedAt;
  const ageSeconds = Math.round(ageMs / 1000);
  return {
    sourceHealth:           ageMs < STALE_THRESHOLD_MS ? "degraded" : "stale",
    lastSuccessfulFetchUtc: new Date(lkg.fetchedAt).toISOString(),
    dataTimestampUtc:       lkg.data.asOf,
    ageSeconds,
    ...(errorCode ? { errorCode } : {}),
  };
}

// ── Bounded fetch with abort and single-flight ────────────────────────────────

async function fetchWithTimeout(): Promise<MonitoringLiveFeedResponse> {
  if (_inflight) return _inflight;

  const controller = new AbortController();
  const db = createSupabaseServiceClient();
  const fetchPromise = buildMonitoringLiveFeedView(db, controller.signal);

  // Suppress the AbortError that fires on fetchPromise after the race settles —
  // without this handler it becomes an unhandled rejection in Node.
  fetchPromise.catch(() => {});

  let timerId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      controller.abort();
      reject(new Error("UPSTREAM_TIMEOUT"));
    }, FETCH_TIMEOUT_MS);
  });

  _inflight = Promise.race([fetchPromise, timeoutPromise]).finally(() => {
    clearTimeout(timerId!);
    _inflight = null;
  });

  return _inflight;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    if (shouldInjectFailure(request, "monitoring-live-feed")) {
      throw new Error("MONITORING_LIVE_FEED_FAILURE");
    }
    const result = await fetchWithTimeout();
    const now = Date.now();
    const dataHealth: MonitoringDataHealth = {
      sourceHealth:           "live",
      lastSuccessfulFetchUtc: new Date(now).toISOString(),
      dataTimestampUtc:       result.asOf,
      ageSeconds:             0,
    };
    const response = { ...result, dataHealth };
    _lkg = { data: response, fetchedAt: now };
    return NextResponse.json(response);
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : String(error);
    logServerFailure({
      route: "/api/monitoring/live-feed",
      module: "monitoring-live-feed",
      error,
      errorCode,
      requestId: getFailureRequestId(request),
    });
    // Upstream failed — serve Last-Known-Good if available.
    if (_lkg) {
      return NextResponse.json({ ..._lkg.data, dataHealth: getLKGDataHealth(_lkg, errorCode) });
    }
    // No LKG yet — return bounded UNAVAILABLE (not raw error, not invented items).
    return NextResponse.json(
      {
        items: [],
        pollingSeconds: 30,
        countdownMode: "polling",
        asOf: new Date().toISOString(),
        universeCounts: { monitoring: 0, whiteSwan: 0, coreInvest: 0, deduped: 0 },
        dataHealth: {
          sourceHealth:           "unavailable",
          lastSuccessfulFetchUtc: null,
          dataTimestampUtc:       null,
          ageSeconds:             null,
          errorCode,
        },
      } satisfies MonitoringLiveFeedResponse,
    );
  }
}
