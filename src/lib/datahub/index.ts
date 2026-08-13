/**
 * CapitalifeDataHub — public exports.
 * Import from here, not from internal modules.
 */

// Core
export { CapitalifeDataHub, getDataHub, _resetDataHubForTests } from "./hub"

// Types
export type {
  DataHubTopicState,
  TopicPolicy,
  NormalizedMarketQuote,
  CanonicalBar,
  InstrumentDefinition,
  BucketStatus,
  BucketClassification,
  Freshness,
  DataStatus,
  SourceQuality,
  AssetType,
  AssetClass,
  TopicInfo,
  ProviderCapabilities,
  MarketDataProvider,
} from "./types"

// Topic names
export {
  TOPICS,
  TOPIC_PREFIX,
  topicMarketQuote,
  topicMarketBar,
  topicMarketSession,
  topicEngineStrategy,
  topicEngineSignal,
  topicDatahubHealth,
  parseTopic,
  isTopicFamily,
} from "./topic-names"

// Topic policies
export { getPolicyForTopic, POLICY_LIVE_QUOTE, POLICY_LIVE_BAR } from "./topic-policies"

// Instrument registry
export {
  getInstrument,
  getAllInstruments,
  registerInstrument,
} from "./market/instrument-registry"

// Bar builder
export {
  BarBuilder,
  getBarBuilder,
  timeframeToSeconds,
  bucketStartEpochSec,
  _resetBarBuildersForTests,
} from "./market/bar-builder"

// Quote normalizer
export {
  normalizeSupabaseQuote,
} from "./market/quote-normalizer"
export type { SupabaseLiveQuoteRow } from "./market/quote-normalizer"

// Gap classifier
export {
  classifyGaps,
  countMissingBuckets,
} from "./market/gap-classifier"
export type { GapClassifierOptions } from "./market/gap-classifier"

// Provider registry
export {
  registerProviderAdapter,
  getProviderAdapter,
  getAllProviderAdapters,
} from "./providers/types"
export type { MarketDataProviderAdapter } from "./providers/types"

// Architecture documentation
export { DATAHUB_ARCHITECTURE } from "./architecture"
