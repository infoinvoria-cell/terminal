import type { NormalizedMarketQuote, CanonicalBar, ProviderCapabilities } from "../types"

/**
 * Interface all market data provider adapters must implement.
 * Adapters produce NormalizedMarketQuote — never raw provider payloads.
 */
export interface MarketDataProviderAdapter {
  readonly id: string
  readonly capabilities: ProviderCapabilities

  /** Check if the provider is reachable and its credentials are valid. */
  getStatus(): Promise<{
    connected: boolean
    lastHeartbeatUtc: string | null
    error: string | null
  }>

  /**
   * Subscribe to live quotes for an instrument.
   * Returns an unsubscribe function.
   */
  subscribeQuote?(
    instrumentId: string,
    providerSymbol: string,
    onQuote: (quote: NormalizedMarketQuote) => void,
    onError: (err: string) => void,
  ): () => void

  /**
   * Fetch historical bars for an instrument.
   * Returns bars sorted ascending by bucketStartUtc.
   */
  fetchHistoricalBars?(
    instrumentId: string,
    providerSymbol: string,
    timeframe: string,
    fromUtc: string,
    toUtc: string,
  ): Promise<CanonicalBar[]>
}

/**
 * Registry of available provider adapters.
 */
const _adapters = new Map<string, MarketDataProviderAdapter>()

export function registerProviderAdapter(adapter: MarketDataProviderAdapter): void {
  _adapters.set(adapter.id, adapter)
}

export function getProviderAdapter(id: string): MarketDataProviderAdapter | null {
  return _adapters.get(id) ?? null
}

export function getAllProviderAdapters(): MarketDataProviderAdapter[] {
  return Array.from(_adapters.values())
}
