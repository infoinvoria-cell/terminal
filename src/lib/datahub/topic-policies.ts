import type { TopicPolicy } from "./types"
import { TOPIC_PREFIX, isTopicFamily } from "./topic-names"

// ─── Shared Policy Presets ────────────────────────────────────────────────────

/** Realtime push-based quote (TV websocket, ~1-2s cadence). */
const POLICY_LIVE_QUOTE: TopicPolicy = {
  ttlMs: 60_000,
  minRefreshIntervalMs: null,
  refreshTimeoutMs: null,
  pushOnly: true,
  coalesceWithinMs: 500,
  keepLastKnownGood: true,
  delayedAfterMs: 15_000,
  staleAfterMs: 90_000,
  expiredAfterMs: 300_000,
}

/** OHLC bar topic — bars built from live quotes, updated on each tick. */
const POLICY_LIVE_BAR: TopicPolicy = {
  ttlMs: null,
  minRefreshIntervalMs: null,
  refreshTimeoutMs: null,
  pushOnly: true,
  coalesceWithinMs: 1_000,
  keepLastKnownGood: true,
  delayedAfterMs: 90_000,
  staleAfterMs: 300_000,
  expiredAfterMs: 900_000,
}

/** Market session status — polled, changes at known event times. */
const POLICY_MARKET_SESSION: TopicPolicy = {
  ttlMs: 60_000,
  minRefreshIntervalMs: 30_000,
  refreshTimeoutMs: 5_000,
  pushOnly: false,
  coalesceWithinMs: 5_000,
  keepLastKnownGood: true,
  delayedAfterMs: 30_000,
  staleAfterMs: 120_000,
  expiredAfterMs: 300_000,
}

/** Engine strategy state — polled from Flask, changes on new bar close. */
const POLICY_ENGINE_STRATEGY: TopicPolicy = {
  ttlMs: 120_000,
  minRefreshIntervalMs: 10_000,
  refreshTimeoutMs: 5_000,
  pushOnly: false,
  coalesceWithinMs: 2_000,
  keepLastKnownGood: true,
  delayedAfterMs: 60_000,
  staleAfterMs: 300_000,
  expiredAfterMs: 600_000,
}

/** Engine signal — low cadence, keep indefinitely. */
const POLICY_ENGINE_SIGNAL: TopicPolicy = {
  ttlMs: null,
  minRefreshIntervalMs: 30_000,
  refreshTimeoutMs: 5_000,
  pushOnly: false,
  coalesceWithinMs: 5_000,
  keepLastKnownGood: true,
  delayedAfterMs: 120_000,
  staleAfterMs: 600_000,
  expiredAfterMs: null,
}

/** DataHub health — push from provider adapters. */
const POLICY_HEALTH: TopicPolicy = {
  ttlMs: 30_000,
  minRefreshIntervalMs: null,
  refreshTimeoutMs: null,
  pushOnly: true,
  coalesceWithinMs: 1_000,
  keepLastKnownGood: false,
  delayedAfterMs: 15_000,
  staleAfterMs: 30_000,
  expiredAfterMs: 60_000,
}

/** Fallback when no specific policy matches. */
const POLICY_DEFAULT: TopicPolicy = {
  ttlMs: 300_000,
  minRefreshIntervalMs: 60_000,
  refreshTimeoutMs: 10_000,
  pushOnly: false,
  coalesceWithinMs: 5_000,
  keepLastKnownGood: true,
  delayedAfterMs: 60_000,
  staleAfterMs: 300_000,
  expiredAfterMs: 600_000,
}

// ─── Policy Registry ──────────────────────────────────────────────────────────

export const TOPIC_POLICIES: Record<string, TopicPolicy> = {}

export function registerTopicPolicy(topic: string, policy: TopicPolicy): void {
  TOPIC_POLICIES[topic] = policy
}

/**
 * Look up the policy for a topic.
 * Falls back to family-level defaults, then POLICY_DEFAULT.
 */
export function getPolicyForTopic(topic: string): TopicPolicy {
  // Exact match
  if (TOPIC_POLICIES[topic]) return TOPIC_POLICIES[topic]

  // Family match
  if (isTopicFamily(topic, TOPIC_PREFIX.MARKET_QUOTE))    return POLICY_LIVE_QUOTE
  if (isTopicFamily(topic, TOPIC_PREFIX.MARKET_BAR))      return POLICY_LIVE_BAR
  if (isTopicFamily(topic, TOPIC_PREFIX.MARKET_SESSION))  return POLICY_MARKET_SESSION
  if (isTopicFamily(topic, TOPIC_PREFIX.ENGINE_STRATEGY)) return POLICY_ENGINE_STRATEGY
  if (isTopicFamily(topic, TOPIC_PREFIX.ENGINE_SIGNAL))   return POLICY_ENGINE_SIGNAL
  if (isTopicFamily(topic, TOPIC_PREFIX.DATAHUB_HEALTH))  return POLICY_HEALTH

  return POLICY_DEFAULT
}

export {
  POLICY_LIVE_QUOTE,
  POLICY_LIVE_BAR,
  POLICY_MARKET_SESSION,
  POLICY_ENGINE_STRATEGY,
  POLICY_ENGINE_SIGNAL,
  POLICY_HEALTH,
  POLICY_DEFAULT,
}
