/**
 * Normalizes raw provider payloads into NormalizedMarketQuote.
 * Only this module knows about provider-specific shapes.
 */

import type { NormalizedMarketQuote, SourceQuality } from "../types"

// ─── Supabase live_quotes row shape (current source) ─────────────────────────

export interface SupabaseLiveQuoteRow {
  asset_id: string
  asset_type: string
  price: number
  lp_time?: string | null
  inserted_at?: string | null
  provider?: string | null
  provider_symbol?: string | null
}

/**
 * Normalize a Supabase live_quotes row into NormalizedMarketQuote.
 */
export function normalizeSupabaseQuote(
  row: SupabaseLiveQuoteRow,
  receivedAtUtc: string,
): NormalizedMarketQuote {
  // Derive instrument id: lowercase the asset_id, strip "1!" futures suffix for lookup key
  const rawId = (row.asset_id ?? "").toLowerCase()
  const instrumentId = rawId.replace(/1!$/, "")

  const assetType = toAssetType(row.asset_type)
  const providerTimestampUtc = row.lp_time ?? receivedAtUtc

  return {
    instrumentId,
    assetType,
    provider: row.provider ?? "supabase",
    providerSymbol: row.provider_symbol ?? row.asset_id,
    providerTimestampUtc,
    receivedTimestampUtc: receivedAtUtc,
    bid: null,
    ask: null,
    last: row.price,
    mid: null,
    chartPrice: row.price,
    sequence: null,
    sourceQuality: sourceQualityFor(row.provider ?? "supabase"),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toAssetType(
  raw: string | null | undefined,
): NormalizedMarketQuote["assetType"] {
  switch ((raw ?? "").toLowerCase()) {
    case "futures": return "futures"
    case "spot":    return "spot"
    case "cfd":     return "cfd"
    case "index":   return "index"
    case "etf":     return "etf"
    default:        return "futures"
  }
}

function sourceQualityFor(provider: string): SourceQuality {
  switch (provider.toLowerCase()) {
    case "tradingview":
    case "ibkr":
      return "realtime"
    case "supabase":
      // Supabase rows originate from TV → consider realtime
      return "realtime"
    default:
      return "unknown"
  }
}
