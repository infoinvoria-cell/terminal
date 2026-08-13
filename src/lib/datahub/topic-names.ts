/**
 * Canonical DataHub topic name constants and builder helpers.
 *
 * Topic naming convention:
 *   <domain>.<entity>.<instrument>[.<timeframe>]
 *
 * All topic strings must be lowercase, dot-separated, no spaces.
 */

// ─── Topic Prefixes ───────────────────────────────────────────────────────────

export const TOPIC_PREFIX = {
  MARKET_QUOTE:   "market.quote",
  MARKET_BAR:     "market.bar",
  MARKET_SESSION: "market.session",
  ENGINE_STRATEGY:"engine.strategy",
  ENGINE_SIGNAL:  "engine.signal",
  DATAHUB_HEALTH: "datahub.health",
} as const

// ─── Topic Builders ───────────────────────────────────────────────────────────

/** Live quote topic for an instrument. */
export function topicMarketQuote(instrumentId: string): string {
  return `${TOPIC_PREFIX.MARKET_QUOTE}.${instrumentId.toLowerCase()}`
}

/** OHLC bar topic for an instrument + timeframe. */
export function topicMarketBar(instrumentId: string, timeframe: string): string {
  return `${TOPIC_PREFIX.MARKET_BAR}.${instrumentId.toLowerCase()}.${timeframe.toLowerCase()}`
}

/** Market session status topic for an instrument. */
export function topicMarketSession(instrumentId: string): string {
  return `${TOPIC_PREFIX.MARKET_SESSION}.${instrumentId.toLowerCase()}`
}

/** Engine strategy state topic. */
export function topicEngineStrategy(strategyId: string): string {
  return `${TOPIC_PREFIX.ENGINE_STRATEGY}.${strategyId.toLowerCase()}`
}

/** Engine signal topic for a strategy. */
export function topicEngineSignal(strategyId: string): string {
  return `${TOPIC_PREFIX.ENGINE_SIGNAL}.${strategyId.toLowerCase()}`
}

/** DataHub health topic for a provider. */
export function topicDatahubHealth(providerId: string): string {
  return `${TOPIC_PREFIX.DATAHUB_HEALTH}.${providerId.toLowerCase()}`
}

// ─── Known Topic Constants ────────────────────────────────────────────────────

export const TOPICS = {
  // Market quotes
  QUOTE_6E:     topicMarketQuote("6e"),
  QUOTE_EURUSD: topicMarketQuote("eurusd"),
  QUOTE_GC:     topicMarketQuote("gc"),
  QUOTE_YM:     topicMarketQuote("ym"),
  QUOTE_NQ:     topicMarketQuote("nq"),
  QUOTE_ES:     topicMarketQuote("es"),
  QUOTE_FDAX:   topicMarketQuote("fdax"),

  // 30M bars
  BAR_6E_30M:   topicMarketBar("6e", "30m"),
  BAR_GC_30M:   topicMarketBar("gc", "30m"),
  BAR_YM_30M:   topicMarketBar("ym", "30m"),
  BAR_NQ_30M:   topicMarketBar("nq", "30m"),
  BAR_ES_30M:   topicMarketBar("es", "30m"),

  // 1H bars
  BAR_FDAX_1H:  topicMarketBar("fdax", "1h"),

  // 2H bars
  BAR_FDAX_2H:  topicMarketBar("fdax", "2h"),

  // Session status
  SESSION_6E:   topicMarketSession("6e"),
  SESSION_FDAX: topicMarketSession("fdax"),

  // Engine strategies
  STRATEGY_EUR_30M:  topicEngineStrategy("eur_30m"),
  STRATEGY_GC_30M:   topicEngineStrategy("gc_30m"),
  STRATEGY_YM_30M:   topicEngineStrategy("ym_30m"),
  STRATEGY_NQ_30M:   topicEngineStrategy("nq_30m"),
  STRATEGY_ES_30M:   topicEngineStrategy("es_30m"),
  STRATEGY_FDAX_1H:  topicEngineStrategy("fdax_1h"),

  // Engine signals
  SIGNAL_EUR_30M:  topicEngineSignal("eur_30m"),
  SIGNAL_GC_30M:   topicEngineSignal("gc_30m"),
  SIGNAL_YM_30M:   topicEngineSignal("ym_30m"),
  SIGNAL_NQ_30M:   topicEngineSignal("nq_30m"),
  SIGNAL_ES_30M:   topicEngineSignal("es_30m"),
  SIGNAL_FDAX_1H:  topicEngineSignal("fdax_1h"),

  // DataHub health
  HEALTH_SUPABASE:  topicDatahubHealth("supabase"),
  HEALTH_FLASK:     topicDatahubHealth("flask"),
} as const

// ─── Topic Parsing ────────────────────────────────────────────────────────────

export type ParsedTopic = {
  domain: string
  entity: string
  instrumentId: string | null
  timeframe: string | null
  raw: string
}

export function parseTopic(topic: string): ParsedTopic {
  const parts = topic.split(".")
  if (parts.length < 3) {
    return { domain: parts[0] ?? "", entity: parts[1] ?? "", instrumentId: null, timeframe: null, raw: topic }
  }
  const [domain, entity, instrument, timeframe] = parts
  return {
    domain:       domain ?? "",
    entity:       entity ?? "",
    instrumentId: instrument ?? null,
    timeframe:    timeframe ?? null,
    raw: topic,
  }
}

/** Check if a topic belongs to a given prefix family. */
export function isTopicFamily(topic: string, prefix: string): boolean {
  return topic.startsWith(prefix + ".")
}
