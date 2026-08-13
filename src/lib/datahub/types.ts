/**
 * CapitalifeDataHub — canonical type system.
 *
 * Design principles:
 *  - One authoritative state per topic. No parallel competing states.
 *  - Every value carries provenance: source, provider, timestamps.
 *  - Freshness is computed from age, not from optimism.
 *  - Stale data is never silently served as live.
 */

// ─── Freshness / Status ───────────────────────────────────────────────────────

/** Age-based freshness classification. Thresholds defined in TopicPolicy. */
export type Freshness =
  | "live"        // within staleAfterMs
  | "delayed"     // delayed but still usable
  | "stale"       // past staleAfterMs, last-known-good active
  | "expired"     // past expiredAfterMs, value should not be trusted
  | "unavailable" // no value ever received

/** Provider/DataHub health status. */
export type DataStatus =
  | "healthy"     // operating normally
  | "degraded"    // operating with reduced quality (stale, partial)
  | "error"       // last operation failed
  | "unavailable" // provider/topic not configured or permanently absent

// ─── DataHub Topic State ──────────────────────────────────────────────────────

/**
 * Canonical state for one DataHub topic.
 * All consumers read THIS — never raw provider payloads.
 */
export interface DataHubTopicState<T> {
  topic: string

  value: T | null

  /** Origin system: "supabase", "flask_engine", "bar_builder", etc. */
  source: string
  /** Provider ID: "tradingview", "ibkr", "csv", etc. */
  provider: string | null
  /** Provider-native symbol: "6E1!", "CME:6E1!", etc. */
  providerSymbol: string | null

  /** Timestamp from the provider (exchange event time). */
  sourceTimestampUtc: string | null
  /** When the DataHub received this value. */
  receivedAtUtc: string | null
  /** When the DataHub last published this topic. */
  publishedAtUtc: string | null

  /** Age of the value in ms, computed at read time. null if no value. */
  ageMs: number | null

  freshness: Freshness
  status: DataStatus

  /** Monotonically increasing publish counter. */
  sequence: number

  /** SHA-256 of the value, for cache invalidation. null if not computed. */
  dataHash: string | null

  lastError: string | null
  lastErrorAtUtc: string | null

  totalPublishes: number
  totalErrors: number
}

// ─── Topic Policy ─────────────────────────────────────────────────────────────

export interface TopicPolicy {
  /** Null = never expires from TTL alone. */
  ttlMs: number | null
  /** Minimum interval between re-fetches in polling mode. */
  minRefreshIntervalMs: number | null
  /** Timeout for a single fetch/subscribe attempt. */
  refreshTimeoutMs: number | null
  /** True = data is pushed by provider, not polled. */
  pushOnly: boolean
  /** Deduplicate publishes within this window. */
  coalesceWithinMs: number
  /** Keep last value after TTL expiry (as stale), vs. clearing to null. */
  keepLastKnownGood: boolean
  /** Age threshold for "delayed" freshness. */
  delayedAfterMs: number
  /** Age threshold for "stale" freshness. */
  staleAfterMs: number
  /** Age threshold for "expired" freshness. Value is unreliable. */
  expiredAfterMs: number | null
}

// ─── Normalized Market Quote ──────────────────────────────────────────────────

/** Source-quality classification for incoming quotes. */
export type SourceQuality = "realtime" | "delayed" | "indicative" | "unknown"

/**
 * Canonical market quote. Provider adapters produce ONLY this — no raw payloads
 * reach consumers.
 */
export interface NormalizedMarketQuote {
  instrumentId: string
  assetType: "futures" | "spot" | "cfd" | "index" | "etf"

  provider: string
  providerSymbol: string

  /** Exchange event timestamp (lp_time from TV, or best available). */
  providerTimestampUtc: string
  /** When this app received/normalized the quote. */
  receivedTimestampUtc: string

  bid: number | null
  ask: number | null
  last: number | null
  mid: number | null

  /** The price used for chart rendering and bar building. */
  chartPrice: number

  /** Monotonically increasing sequence from provider. null if not available. */
  sequence: number | null
  sourceQuality: SourceQuality
}

// ─── Canonical Bar ────────────────────────────────────────────────────────────

/**
 * Output of the BarBuilder. Used by chart, backtest, signal engine — same type.
 */
export interface CanonicalBar {
  instrumentId: string
  timeframe: string

  /** Bucket open time, ISO UTC. */
  bucketStartUtc: string
  /** Bucket close time (exclusive), ISO UTC. */
  bucketEndUtc: string

  open: number
  high: number
  low: number
  close: number

  volume: number | null

  /** Number of quotes used to build this bar. */
  tickCount: number

  /** True = bar is finalized (bucket has closed). False = currently forming. */
  isFinal: boolean

  /** Data origin: "chart_series", "historical_csv", "bar_builder_live", etc. */
  source: string

  firstTickUtc: string | null
  lastTickUtc: string | null
}

// ─── Instrument Registry ──────────────────────────────────────────────────────

export type AssetType = "futures" | "spot" | "cfd" | "index" | "etf"
export type AssetClass =
  | "forex_futures"
  | "equity_index_futures"
  | "commodity_futures"
  | "etf"
  | "fx_spot"
  | "fx_cfd"

export type DataAvailability = "ready" | "partial" | "unavailable"

export interface MaintenanceRule {
  /** Local exchange time hour at which maintenance starts (0-23). */
  startHour: number
  endHour: number
  timezone: string
  /** ISO weekdays (0=Mon…6=Sun) on which the break applies. */
  appliesDow: number[]
  description: string
}

export interface ElectronicSession {
  description: string
  timezone: string
  openDow: number
  openHour: number
  closeDow: number
  closeHour: number
}

export interface StrategyTradingWindow {
  timezone: string
  startHour: number
  startMin: number
  endHour: number
  endMin: number
  tradeDays: number[]
  note?: string
}

export interface InstrumentDefinition {
  id: string
  underlyingId: string
  marketType: AssetType

  assetClass: AssetClass
  assetType: AssetType

  name: string
  exchange: string | null
  venue: string | null
  exchangeTimezone: string
  tradingCalendar: string

  historicalProvider: string | null
  historicalSymbol: string | null
  historicalAvailability: DataAvailability

  liveProvider: string | null
  liveSymbol: string | null
  liveAvailability: DataAvailability

  tickSize: number
  precision: number
  multiplier: number | null

  supportedTimeframes: string[]

  electronicSession: ElectronicSession | null
  maintenanceBreak: MaintenanceRule | null
  strategyTradingWindow: StrategyTradingWindow | null

  /** If true, a futures proxy is used for historical analysis of this CFD/spot asset. */
  proxyAvailable: boolean
  proxyInstrumentId: string | null
}

// ─── Gap Classification ───────────────────────────────────────────────────────

export type BucketClassification =
  | "actual"              // bar exists and is valid
  | "market_closed"       // weekend / permanent close
  | "maintenance"         // daily exchange maintenance break
  | "holiday"             // exchange holiday (future: calendar lookup)
  | "expected_no_trade"   // known low-liquidity period
  | "source_missing"      // provider had no data (external gap)
  | "pipeline_failure"    // we expected data but our pipeline failed
  | "future"              // bucket hasn't started yet

export interface BucketStatus {
  bucketStartUtc: string
  bucketEndUtc: string
  classification: BucketClassification
  hasActualBar: boolean
  note?: string
}

// ─── Provider Interface ───────────────────────────────────────────────────────

export interface ProviderCapabilities {
  providerId: string
  liveQuotes: boolean
  historicalBars: boolean
  websocket: boolean
  polling: boolean
  supportsFutures: boolean
  supportsFxSpot: boolean
  supportsCfd: boolean
  supportsEquityIndex: boolean
  supportsEtf: boolean
  available: boolean
  delaySeconds: number | null  // null = realtime
  maxHistoricalDepth: string | null  // e.g. "10y", "2y"
  requiresApiKey: boolean
  configured: boolean
}

export interface MarketDataProvider {
  readonly id: string
  readonly capabilities: ProviderCapabilities
  getStatus(): Promise<{ connected: boolean; lastHeartbeatUtc: string | null }>
}

// ─── DataHub Introspection ────────────────────────────────────────────────────

export interface TopicInfo {
  topic: string
  policy: TopicPolicy
  subscriberCount: number
  lastPublishUtc: string | null
  ageMs: number | null
  freshness: Freshness
  status: DataStatus
  publishCount: number
  errorCount: number
  lastError: string | null
}
