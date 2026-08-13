/**
 * DataManager — Central Source-Status & Cache Layer
 *
 * Server-side singleton (Node runtime).
 * Tracks per-asset data quality: historical / delayed / live / stale / unavailable.
 * Components and API routes must not make their own external requests — they read
 * from this manager or from the API routes that call it.
 *
 * NOT imported in edge runtime — use only in Node API routes.
 */

import type {
  DataSourceStatus,
  ProviderId,
  QuoteWithStatus,
  DelayMinutes,
} from "./types";
import { STALE_THRESHOLD_MS, UNAVAILABLE_THRESHOLD_MS } from "./types";
import { getAssetByLiveSymbol } from "./asset-registry";

// ── Cache entry ───────────────────────────────────────────────────────────────

interface CacheEntry {
  quote: QuoteWithStatus
  cachedAt: number
  ttlMs: number
}

// ── Singleton state ───────────────────────────────────────────────────────────

const _cache = new Map<string, CacheEntry>()

// TTL by provider (ms)
const PROVIDER_TTL: Record<ProviderId, number> = {
  local_csv:       24 * 60 * 60 * 1_000, // 24 h — historical, doesn't change
  tv_cache:         5 * 60 * 1_000,       // 5 min — refreshed by Railway worker
  supabase_quotes:  8 * 1_000,            // 8 s — upserted every 5 s by worker
  supabase_ohlc:    5 * 60 * 1_000,       // 5 min — daily OHLC
  dukascopy:        3 * 1_000,            // 3 s — real-time, very short TTL
  synthetic:        0,                    // never cache synthetic data
}

// ── Status derivation ─────────────────────────────────────────────────────────

export function deriveStatus(
  provider: ProviderId,
  updatedAt: string | null,
): DataSourceStatus {
  if (provider === "synthetic")   return "unavailable"
  if (provider === "local_csv")   return "historical"
  if (provider === "dukascopy")   return "live"

  if (!updatedAt) return "unavailable"

  const age = Date.now() - new Date(updatedAt).getTime()

  if (age > UNAVAILABLE_THRESHOLD_MS) return "unavailable"
  if (age > STALE_THRESHOLD_MS)       return "stale"

  // Supabase live_quotes and tv_cache are TradingView-delayed (~15 min)
  if (provider === "supabase_quotes" || provider === "tv_cache") return "delayed"
  if (provider === "supabase_ohlc")  return "delayed"

  return "delayed"
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Store a quote received from any provider.
 * The quote is available to any caller via getQuote().
 */
export function putQuote(
  symbol: string,
  raw: {
    open: number; high: number; low: number; close: number; volume: number
    timestamp: string; updatedAt: string
  },
  provider: ProviderId,
): QuoteWithStatus {
  const status = deriveStatus(provider, raw.updatedAt)
  const asset = getAssetByLiveSymbol(symbol)
  const delayMinutes: DelayMinutes =
    provider === "dukascopy" ? 0
    : provider === "local_csv" ? null
    : 15

  const quote: QuoteWithStatus = {
    symbol: symbol.toUpperCase(),
    ...raw,
    status,
    provider,
    delayMinutes,
  }

  _cache.set(symbol.toUpperCase(), {
    quote,
    cachedAt: Date.now(),
    ttlMs: PROVIDER_TTL[provider],
  })

  return quote
}

/**
 * Retrieve a cached quote. Returns null if missing or expired.
 * Callers must check quote.status before displaying as live.
 */
export function getQuote(symbol: string): QuoteWithStatus | null {
  const entry = _cache.get(symbol.toUpperCase())
  if (!entry) return null

  const age = Date.now() - entry.cachedAt
  if (entry.ttlMs > 0 && age > entry.ttlMs) {
    // Expired but still return with stale status rather than null,
    // so UI can show "last known price" with a stale badge.
    return { ...entry.quote, status: age > UNAVAILABLE_THRESHOLD_MS ? "unavailable" : "stale" }
  }

  return entry.quote
}

/**
 * Bulk-ingest quotes from Supabase live_quotes response.
 * Called by /api/live-quotes after each Supabase SELECT.
 */
export function ingestSupabaseQuotes(
  rows: Array<{
    symbol: string; open: number; high: number; low: number
    close: number; volume: number; timestamp: string; updated_at: string
  }>,
): void {
  for (const r of rows) {
    putQuote(
      r.symbol,
      {
        open: r.open, high: r.high, low: r.low, close: r.close,
        volume: r.volume, timestamp: r.timestamp, updatedAt: r.updated_at,
      },
      "supabase_quotes",
    )
  }
}

/**
 * Get the current data status for a given asset id.
 * Used by UI status badges and the globe overlay.
 */
export function getAssetStatus(assetId: string): DataSourceStatus {
  const { getAssetById } = require("./asset-registry") as typeof import("./asset-registry")
  const asset = getAssetById(assetId)
  if (!asset) return "unavailable"
  const q = getQuote(asset.liveQuotesSymbol)
  if (!q) return "unavailable"
  return q.status
}

/**
 * Export a snapshot of all cached quotes (for /api/live-quotes response).
 * Filters out expired entries.
 */
export function getAllQuotes(): QuoteWithStatus[] {
  const now = Date.now()
  const result: QuoteWithStatus[] = []
  for (const [, entry] of _cache) {
    const age = now - entry.cachedAt
    const status: DataSourceStatus =
      age > UNAVAILABLE_THRESHOLD_MS ? "unavailable"
      : age > STALE_THRESHOLD_MS     ? "stale"
      : entry.quote.status
    result.push({ ...entry.quote, status })
  }
  return result
}

/**
 * Purge all cache entries (for testing).
 */
export function clearCache(): void {
  _cache.clear()
}
