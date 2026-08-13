/**
 * Unified Market-Data Types
 *
 * DataSourceStatus describes what quality of data is currently available
 * for a given asset. UI components must render the correct badge/warning.
 *
 * Flow:
 *   historical  → loaded from local CSV / TV cache files (no live feed)
 *   delayed     → sourced from Supabase live_quotes (TradingView worker, ~10-15 min lag)
 *   live        → sourced from Dukascopy or another zero-delay provider
 *   stale       → last successful update > STALE_THRESHOLD_MS ago
 *   unavailable → no data at all for this asset
 */

export type DataSourceStatus =
  | "historical"
  | "delayed"
  | "live"
  | "stale"
  | "unavailable";

/** How the data is delayed (in minutes), 0 = real-time */
export type DelayMinutes = 0 | 15 | null;

/** Provider identifiers — used in registry and DataManager */
export type ProviderId =
  | "local_csv"       // histdata CSVs on Desktop
  | "tv_cache"        // TradingView local file cache (~15 min delayed)
  | "supabase_quotes" // Supabase live_quotes table (TradingView Railway worker)
  | "supabase_ohlc"   // Supabase monitoring_ohlc table
  | "dukascopy"       // Dukascopy real-time tick (Forex/CFD only)
  | "synthetic"       // last-resort placeholder — must never be shown as real

/** Asset class — drives default update interval and provider priority */
export type AssetClass =
  | "intraday_forex"    // 6E1!, EURUSD — 5 s poll, Dukascopy confirmation
  | "intraday_futures"  // FDAX1!, NQ1! — 5 s poll
  | "daily_etf"         // QQQ, SPY — 30 s poll
  | "daily_futures"     // GC1!, CL1! — 30 s poll
  | "daily_index"       // VIX, DXY — 30 s poll
  | "daily_fx"          // major FX, cross pairs — 30 s poll, Dukascopy confirmation
  | "daily_stocks"      // AAPL, MSFT — 30 s poll
  | "daily_commodities" // ZC1!, ZW1! — 30 s poll
  | "daily_bonds"       // ZB1!, US10Y — 30 s poll

export interface AssetDefinition {
  id: string
  name: string
  class: AssetClass
  /** TradingView symbol (exchange:symbol) — canonical identifier */
  tvSymbol: string
  /** Symbol used in Supabase live_quotes */
  liveQuotesSymbol: string
  /** Dukascopy instrument string (e.g. "EUR/USD"), null if not supported */
  dukascopyInstrument: string | null
  /** Primary/fallback provider chain for OHLC history */
  historyProviders: ProviderId[]
  /** Polling interval in ms for live price updates */
  pollIntervalMs: 5_000 | 30_000
  /** Approximate delay of the live data feed in minutes */
  liveDelayMinutes: DelayMinutes
  /** Exchange / session timezone for staleness detection */
  sessionTimezone: string
}

export interface QuoteWithStatus {
  symbol: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: string
  updatedAt: string
  /** Current data quality status */
  status: DataSourceStatus
  /** Which provider delivered this quote */
  provider: ProviderId
  /** Approximate delay vs. real market in minutes */
  delayMinutes: DelayMinutes
}

export interface OhlcBar {
  t: string       // ISO-8601 timestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OhlcResponse {
  assetId: string
  symbol: string
  source: ProviderId
  status: DataSourceStatus
  delayMinutes: DelayMinutes
  updatedAt: string
  ohlcv: OhlcBar[]
}

/** Used by the realtime-gate for signal confirmation */
export interface SignalConfirmContext {
  assetId: string
  direction: "long" | "short"
  /** Price level the signal depends on (e.g. sweep recovery level) */
  thresholdPrice: number
  /** Candle close time (UTC ISO-8601) */
  candleCloseAt: string
  /** Strategy identifier */
  strategyId: string
}

export interface ConfirmationResult {
  confirmed: boolean
  currentPrice: number | null
  thresholdPrice: number
  direction: "long" | "short"
  provider: ProviderId
  delayMinutes: DelayMinutes
  checkedAt: string
  reason: string
}

export const STALE_THRESHOLD_MS = 30 * 60 * 1000   // 30 min
export const UNAVAILABLE_THRESHOLD_MS = 2 * 60 * 60 * 1000  // 2 h

// ─── TradingView cache types (used by tradingview-cache.ts) ──────────────────

export type TradingViewCacheStatus = "ok" | "stale" | "error" | "missing"
export type TradingViewAuthMode = "login" | "nologin" | "unavailable"

export interface TradingViewIntervalStatus {
  status: TradingViewCacheStatus
  fetched_at: string | null
  last_date: string | null
  rows: number
  path?: string | null
}

export interface TradingViewSymbolStatus {
  status: TradingViewCacheStatus
  error?: string | null
  intervals: Record<string, TradingViewIntervalStatus>
  last_bar_time: string | null
  last_fetch: string | null
  rows_1m: number
  rows_1D: number
}

export interface TradingViewManifest {
  source: string
  package: string
  auth_mode: TradingViewAuthMode
  cache_dir: string
  updated_at: string | null
  poll_seconds: number
  stale_after_seconds: number
  warning?: string
  symbols: Record<string, TradingViewSymbolStatus>
}

export interface TradingViewStatusFile {
  source: string
  auth_mode: TradingViewAuthMode
  cache_dir: string
  updated_at: string | null
  poll_seconds: number
  stale_after_seconds: number
  overall_status: TradingViewCacheStatus
  warning?: string
  symbols: Record<string, TradingViewSymbolStatus>
}

export interface TradingViewBar {
  time?: number      // Unix timestamp (seconds)
  date?: string      // ISO date string (YYYY-MM-DD)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface TradingViewHistoryPayload {
  symbol: string
  exchange: string | null
  interval: string
  source: string
  fetched_at: string | null
  auth_mode: string
  bars: TradingViewBar[]
}

export interface TradingViewLatestBar {
  symbol: string
  exchange: string | null
  interval: string
  source: string
  mode: string
  fetched_at: string | null
  bar_time: string | null
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  status: TradingViewCacheStatus
}

export interface MarketDataStatus {
  cacheAvailable: boolean
  manifestPath: string | null
  statusPath: string | null
  cacheDir: string
  updatedAt: string | null
  authMode: TradingViewAuthMode
  pollSeconds: number
  staleAfterSeconds: number
  overallStatus: TradingViewCacheStatus
  warning?: string
  symbols: Record<string, TradingViewSymbolStatus>
}
