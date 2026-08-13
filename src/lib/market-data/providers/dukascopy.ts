/**
 * Dukascopy Live Quote Provider
 *
 * Free public instrument quote API — no auth required.
 * Used ONLY for:
 *   1. Real-time signal confirmation (on-demand, not permanent polling)
 *   2. Forex/CFD assets with dukascopyInstrument defined in the registry
 *
 * Rate limit: max 10 requests per minute, 1 s cooldown between requests.
 * Supported: all major Forex pairs + precious metals spot.
 *
 * Endpoint:
 *   https://www.dukascopy.com/plugins/fxMarketWatch/quote?instrument=EUR%2FUSD
 *
 * Response shape (raw):
 *   { Instrument, Bid, Ask, High, Low, Open, Timestamp }
 */

const DUKASCOPY_BASE =
  "https://www.dukascopy.com/plugins/fxMarketWatch/quote";

/** Supported Dukascopy instruments → normalised pair string */
export const DUKASCOPY_INSTRUMENTS: Record<string, string> = {
  "EUR/USD": "EUR/USD",
  "GBP/USD": "GBP/USD",
  "USD/JPY": "USD/JPY",
  "USD/CHF": "USD/CHF",
  "AUD/USD": "AUD/USD",
  "USD/CAD": "USD/CAD",
  "NZD/USD": "NZD/USD",
  "EUR/GBP": "EUR/GBP",
  "EUR/JPY": "EUR/JPY",
  "GBP/JPY": "GBP/JPY",
  "AUD/CAD": "AUD/CAD",
  "EUR/CHF": "EUR/CHF",
  "USD/MXN": "USD/MXN",
  "USD/ZAR": "USD/ZAR",
  "USD/TRY": "USD/TRY",
  "XAU/USD": "XAU/USD",
  "XAG/USD": "XAG/USD",
  "XPT/USD": "XPT/USD",
};

export interface DukascopyQuote {
  instrument: string
  bid: number
  ask: number
  mid: number   // (bid + ask) / 2
  high: number
  low: number
  open: number
  timestamp: string
  fetchedAt: string
}

interface RawDukascopyResponse {
  Instrument?: string
  Bid?: string | number
  Ask?: string | number
  High?: string | number
  Low?: string | number
  Open?: string | number
  Timestamp?: string
}

// ── Rate-limit state (module-level singleton) ─────────────────────────────────

let _lastFetchAt = 0
let _fetchCount = 0
let _windowStart = 0
const MAX_PER_MINUTE = 10
const MIN_INTERVAL_MS = 1_000  // 1 s minimum between any two requests

/**
 * Fetch a live quote for the given Dukascopy instrument string.
 * Returns null on rate-limit, network error, or unsupported instrument.
 */
export async function fetchDukascopyQuote(
  instrument: string,
): Promise<DukascopyQuote | null> {
  if (!DUKASCOPY_INSTRUMENTS[instrument]) {
    console.warn(`[Dukascopy] Unsupported instrument: ${instrument}`)
    return null
  }

  const now = Date.now()

  // Enforce 1 s cooldown
  if (now - _lastFetchAt < MIN_INTERVAL_MS) {
    console.warn(`[Dukascopy] Rate cooldown — too soon (${now - _lastFetchAt}ms since last)`)
    return null
  }

  // Enforce 10 req/min window
  if (now - _windowStart > 60_000) {
    _windowStart = now
    _fetchCount = 0
  }
  if (_fetchCount >= MAX_PER_MINUTE) {
    console.warn(`[Dukascopy] Rate limit reached (${MAX_PER_MINUTE}/min)`)
    return null
  }

  _lastFetchAt = now
  _fetchCount++

  const url = `${DUKASCOPY_BASE}?instrument=${encodeURIComponent(instrument)}`

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json, text/plain, */*",
        Referer: "https://www.dukascopy.com/",
      },
      signal: AbortSignal.timeout(5_000),
    })

    if (!res.ok) {
      console.error(`[Dukascopy] HTTP ${res.status} for ${instrument}`)
      return null
    }

    const raw = (await res.json()) as RawDukascopyResponse

    const bid = parseFloat(String(raw.Bid ?? "0"))
    const ask = parseFloat(String(raw.Ask ?? "0"))
    const high = parseFloat(String(raw.High ?? "0"))
    const low = parseFloat(String(raw.Low ?? "0"))
    const open = parseFloat(String(raw.Open ?? "0"))

    if (!bid || !ask) {
      console.warn(`[Dukascopy] Empty quote for ${instrument}`, raw)
      return null
    }

    return {
      instrument,
      bid,
      ask,
      mid: (bid + ask) / 2,
      high,
      low,
      open,
      timestamp: raw.Timestamp ?? new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.error(`[Dukascopy] Fetch error for ${instrument}:`, err)
    return null
  }
}

/**
 * Batch-fetch quotes for multiple instruments.
 * Respects the per-minute rate limit — returns null for any that exceed it.
 */
export async function fetchDukascopyQuotes(
  instruments: string[],
): Promise<Map<string, DukascopyQuote | null>> {
  const results = new Map<string, DukascopyQuote | null>()
  for (const inst of instruments) {
    results.set(inst, await fetchDukascopyQuote(inst))
    // small pause between batch requests to respect rate limit
    await new Promise(r => setTimeout(r, 1_100))
  }
  return results
}
