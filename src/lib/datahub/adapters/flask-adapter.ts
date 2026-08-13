/**
 * FlaskAdapter — populates the Next.js consumer-cache DataHub from Flask Engine.
 *
 * Authority chain:
 *   Flask Engine (authoritative) → HTTP REST → FlaskAdapter → DataHub (cache)
 *
 * Called server-side from /api/datahub/sync/* routes.
 * NOT a long-running subscriber — called on-demand per request.
 */

import type { CanonicalBar } from "../types"
import {
  getDataHub,
  topicMarketBar,
  topicMarketSession,
  topicDatahubHealth,
} from "../index"

const FLASK_BASE = process.env.FLASK_ENGINE_URL ?? "http://localhost:5000"
const FETCH_TIMEOUT_MS = 4000

// ─── Chart Data ───────────────────────────────────────────────────────────────

interface FlaskChartDataResponse {
  bars: Array<{
    time: number       // epoch seconds (UTC) — NOT time_utc
    open: number
    high: number
    low: number
    close: number
    volume?: number | null
    is_final?: boolean
    tick?: boolean
  }>
  meta: {
    strategy: string
    timeframe: string
    data_hash?: string | null
    monitoring_bars_merged?: number
  }
}

interface SyncBarsResult {
  synced: boolean
  openBarPublished: boolean
  finalBarsCount: number
  lastFinalBarUtc: string | null
  openBarBucketUtc: string | null
  error: string | null
}

export async function syncBarsFromFlask(
  strategy: string,
  assetType: string,
  instrumentId: string,
  timeframe: string,
): Promise<SyncBarsResult> {
  const hub = getDataHub()
  const now = new Date().toISOString()

  try {
    const url = `${FLASK_BASE}/chart-data/${strategy}?asset_type=${assetType}&limit=10`
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    })

    if (!resp.ok) {
      hub.publishError(topicMarketBar(instrumentId, timeframe), `Flask ${resp.status}`, { source: "flask" })
      return { synced: false, openBarPublished: false, finalBarsCount: 0, lastFinalBarUtc: null, openBarBucketUtc: null, error: `HTTP ${resp.status}` }
    }

    const data = (await resp.json()) as FlaskChartDataResponse
    const bars = data?.bars ?? []

    let finalCount = 0
    let lastFinalUtc: string | null = null
    let openBarUtc: string | null = null

    for (const b of bars) {
      const isFinal = b.is_final !== false && !b.tick
      const tfSec = timeframeToSec(timeframe)
      const bucketStartSec = b.time  // already epoch seconds
      const bucketEndSec = bucketStartSec + tfSec

      const canonical: CanonicalBar = {
        instrumentId,
        timeframe,
        bucketStartUtc: new Date(bucketStartSec * 1000).toISOString(),
        bucketEndUtc:   new Date(bucketEndSec   * 1000).toISOString(),
        open:  b.open,
        high:  b.high,
        low:   b.low,
        close: b.close,
        volume: b.volume ?? null,
        tickCount: 0,
        isFinal,
        source: isFinal ? "flask.monitoring_ohlc.final" : "flask.monitoring_ohlc.open",
        firstTickUtc: null,
        lastTickUtc: null,
      }

      const topic = isFinal
        ? topicMarketBar(instrumentId, timeframe)
        : topicMarketBar(instrumentId, `${timeframe}.open`)

      const barUtc = new Date(b.time * 1000).toISOString()
      hub.publish(topic, canonical, {
        source: "flask.chart-data",
        provider: "tradingview",
        providerSymbol: strategy,
        sourceTimestampUtc: barUtc,
        dataHash: isFinal ? (data.meta?.data_hash ?? null) : null,
      })

      if (isFinal) {
        finalCount++
        lastFinalUtc = barUtc
      } else {
        openBarUtc = barUtc
      }
    }

    return {
      synced: true,
      openBarPublished: openBarUtc !== null,
      finalBarsCount: finalCount,
      lastFinalBarUtc: lastFinalUtc,
      openBarBucketUtc: openBarUtc,
      error: null,
    }
  } catch (err) {
    const msg = String(err)
    hub.publishError(topicMarketBar(instrumentId, timeframe), msg, { source: "flask" })
    return { synced: false, openBarPublished: false, finalBarsCount: 0, lastFinalBarUtc: null, openBarBucketUtc: null, error: msg }
  }
}

// ─── Session Status ───────────────────────────────────────────────────────────

interface SyncSessionResult {
  synced: boolean
  marketStatus: string | null
  error: string | null
}

export async function syncSessionFromFlask(
  strategy: string,
  instrumentId: string,
): Promise<SyncSessionResult> {
  const hub = getDataHub()

  try {
    const url = `${FLASK_BASE}/market-status?strategy=${strategy}`
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    })
    if (!resp.ok) {
      return { synced: false, marketStatus: null, error: `HTTP ${resp.status}` }
    }
    const data = (await resp.json()) as Record<string, unknown>
    hub.publish(topicMarketSession(instrumentId), data, {
      source: "flask.market-status",
      provider: null,
      providerSymbol: null,
      sourceTimestampUtc: typeof data.timestampUtc === "string" ? data.timestampUtc : null,
    })
    return { synced: true, marketStatus: typeof data.marketStatus === "string" ? data.marketStatus : null, error: null }
  } catch (err) {
    return { synced: false, marketStatus: null, error: String(err) }
  }
}

// ─── Feed Health ──────────────────────────────────────────────────────────────

interface SyncFeedResult {
  synced: boolean
  feedStatus: string | null
  feedPid: number | null
  heartbeatAgeMs: number | null
  error: string | null
}

export async function syncFeedStatusFromFlask(): Promise<SyncFeedResult> {
  const hub = getDataHub()

  try {
    const url = `${FLASK_BASE}/feed/status`
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    })
    if (!resp.ok) {
      return { synced: false, feedStatus: null, feedPid: null, heartbeatAgeMs: null, error: `HTTP ${resp.status}` }
    }
    const data = (await resp.json()) as {
      status: string
      pid: number | null
      heartbeatAgeMs: number | null
      lastHeartbeatUtc: string | null
    }
    hub.publish(topicDatahubHealth("tv_live_feed"), data, {
      source: "flask.feed-status",
      provider: "tradingview",
      providerSymbol: null,
      sourceTimestampUtc: data.lastHeartbeatUtc ?? null,
    })
    return {
      synced: true,
      feedStatus: data.status,
      feedPid: data.pid,
      heartbeatAgeMs: data.heartbeatAgeMs,
      error: null,
    }
  } catch (err) {
    return { synced: false, feedStatus: null, feedPid: null, heartbeatAgeMs: null, error: String(err) }
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function timeframeToSec(tf: string): number {
  const map: Record<string, number> = {
    "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400,
  }
  return map[tf.toLowerCase()] ?? 1800
}
