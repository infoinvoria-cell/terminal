/**
 * CapitalifeDataHub — central pub/sub state store.
 *
 * Design:
 *  - One state object per topic (DataHubTopicState<unknown>).
 *  - Subscribers receive the full state on every publish.
 *  - Coalescing: rapid publishes within coalesceWithinMs collapse to one.
 *  - Last-known-good: stale values are kept until expiredAfterMs.
 *  - No direct raw-provider payloads reach subscribers.
 */

import type {
  DataHubTopicState,
  Freshness,
  DataStatus,
  TopicPolicy,
  TopicInfo,
} from "./types"
import { getPolicyForTopic } from "./topic-policies"

// ─── Internal state entry ─────────────────────────────────────────────────────

interface TopicEntry<T = unknown> {
  state: DataHubTopicState<T>
  policy: TopicPolicy
  subscribers: Set<(state: DataHubTopicState<T>) => void>
  coalesceTimer: ReturnType<typeof setTimeout> | null
  pendingPublish: Partial<DataHubTopicState<T>> | null
}

// ─── Freshness computation ─────────────────────────────────────────────────────

function computeFreshness(ageMs: number | null, policy: TopicPolicy): Freshness {
  if (ageMs === null) return "unavailable"
  if (ageMs <= policy.delayedAfterMs)                                 return "live"
  if (ageMs <= policy.staleAfterMs)                                   return "delayed"
  if (policy.expiredAfterMs === null || ageMs <= policy.expiredAfterMs) return "stale"
  return "expired"
}

function computeStatus(
  freshness: Freshness,
  hasValue: boolean,
  lastError: string | null,
): DataStatus {
  if (!hasValue) return "unavailable"
  if (lastError && freshness === "expired") return "error"
  if (freshness === "expired") return "degraded"
  if (freshness === "stale")   return "degraded"
  if (lastError)               return "degraded"
  return "healthy"
}

// ─── CapitalifeDataHub ────────────────────────────────────────────────────────

export class CapitalifeDataHub {
  private topics = new Map<string, TopicEntry>()

  // ── Topic registration ────────────────────────────────────────────────────

  private ensureTopic<T>(topic: string): TopicEntry<T> {
    if (!this.topics.has(topic)) {
      const policy = getPolicyForTopic(topic)
      const state: DataHubTopicState<T> = {
        topic,
        value: null,
        source: "",
        provider: null,
        providerSymbol: null,
        sourceTimestampUtc: null,
        receivedAtUtc: null,
        publishedAtUtc: null,
        ageMs: null,
        freshness: "unavailable",
        status: "unavailable",
        sequence: 0,
        dataHash: null,
        lastError: null,
        lastErrorAtUtc: null,
        totalPublishes: 0,
        totalErrors: 0,
      }
      this.topics.set(topic, {
        state: state as DataHubTopicState<unknown>,
        policy,
        subscribers: new Set(),
        coalesceTimer: null,
        pendingPublish: null,
      })
    }
    return this.topics.get(topic) as TopicEntry<T>
  }

  // ── Subscribe ─────────────────────────────────────────────────────────────

  subscribe<T>(
    topic: string,
    handler: (state: DataHubTopicState<T>) => void,
  ): () => void {
    const entry = this.ensureTopic<T>(topic)
    entry.subscribers.add(handler as (state: DataHubTopicState<unknown>) => void)

    // Immediate delivery of current state if value exists
    if (entry.state.value !== null) {
      const enriched = this.enrichState(entry)
      handler(enriched as DataHubTopicState<T>)
    }

    return () => {
      entry.subscribers.delete(handler as (state: DataHubTopicState<unknown>) => void)
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  publish<T>(
    topic: string,
    value: T,
    meta: {
      source: string
      provider?: string | null
      providerSymbol?: string | null
      sourceTimestampUtc?: string | null
      dataHash?: string | null
    },
  ): void {
    const entry = this.ensureTopic<T>(topic)
    const policy = entry.policy
    const nowIso = new Date().toISOString()

    const patch: Partial<DataHubTopicState<T>> = {
      value,
      source: meta.source,
      provider: meta.provider ?? entry.state.provider,
      providerSymbol: meta.providerSymbol ?? entry.state.providerSymbol,
      sourceTimestampUtc: meta.sourceTimestampUtc ?? nowIso,
      receivedAtUtc: nowIso,
      lastError: null,
      lastErrorAtUtc: entry.state.lastErrorAtUtc,
      dataHash: meta.dataHash ?? null,
    }

    if (policy.coalesceWithinMs > 0) {
      entry.pendingPublish = { ...(entry.pendingPublish ?? {}), ...patch }
      if (!entry.coalesceTimer) {
        entry.coalesceTimer = setTimeout(() => {
          entry.coalesceTimer = null
          const pending = entry.pendingPublish
          entry.pendingPublish = null
          if (pending) this._applyAndNotify(topic, entry, pending)
        }, policy.coalesceWithinMs)
      }
    } else {
      this._applyAndNotify(topic, entry, patch)
    }
  }

  // ── Publish error ─────────────────────────────────────────────────────────

  publishError(
    topic: string,
    error: string,
    meta: { source: string },
  ): void {
    const entry = this.ensureTopic(topic)
    const nowIso = new Date().toISOString()
    const patch: Partial<DataHubTopicState<unknown>> = {
      source: meta.source,
      receivedAtUtc: nowIso,
      lastError: error,
      lastErrorAtUtc: nowIso,
    }
    // If keepLastKnownGood, don't clear value
    if (!entry.policy.keepLastKnownGood) {
      patch.value = null
    }
    this._applyAndNotify(topic, entry, patch)
  }

  // ── Read current state ────────────────────────────────────────────────────

  getState<T>(topic: string): DataHubTopicState<T> {
    const entry = this.ensureTopic<T>(topic)
    return this.enrichState(entry) as DataHubTopicState<T>
  }

  getValue<T>(topic: string): T | null {
    return this.getState<T>(topic).value
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  listTopics(): TopicInfo[] {
    const now = Date.now()
    const result: TopicInfo[] = []
    for (const [topic, entry] of this.topics) {
      const publishedAt = entry.state.publishedAtUtc ? new Date(entry.state.publishedAtUtc).getTime() : null
      const ageMs = publishedAt !== null ? now - publishedAt : null
      const freshness = computeFreshness(ageMs, entry.policy)
      const status = computeStatus(freshness, entry.state.value !== null, entry.state.lastError)
      result.push({
        topic,
        policy: entry.policy,
        subscriberCount: entry.subscribers.size,
        lastPublishUtc: entry.state.publishedAtUtc,
        ageMs,
        freshness,
        status,
        publishCount: entry.state.totalPublishes,
        errorCount: entry.state.totalErrors,
        lastError: entry.state.lastError,
      })
    }
    return result
  }

  hasTopic(topic: string): boolean {
    return this.topics.has(topic)
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /**
   * Evict topics where expiredAfterMs has passed and no subscribers remain.
   * Call periodically from a maintenance interval.
   */
  evictExpired(): number {
    const now = Date.now()
    let count = 0
    for (const [topic, entry] of this.topics) {
      if (entry.subscribers.size > 0) continue
      const policy = entry.policy
      if (policy.expiredAfterMs === null) continue
      const publishedAt = entry.state.publishedAtUtc ? new Date(entry.state.publishedAtUtc).getTime() : null
      if (publishedAt === null) continue
      const ageMs = now - publishedAt
      if (ageMs > policy.expiredAfterMs) {
        if (entry.coalesceTimer) clearTimeout(entry.coalesceTimer)
        this.topics.delete(topic)
        count++
      }
    }
    return count
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private _applyAndNotify<T>(
    _topic: string,
    entry: TopicEntry<T>,
    patch: Partial<DataHubTopicState<T>>,
  ): void {
    const isError = patch.lastError !== null && patch.lastError !== undefined && !("value" in patch && patch.value !== undefined)

    Object.assign(entry.state, patch)

    if (isError) {
      ; (entry.state as DataHubTopicState<unknown>).totalErrors++
    } else if ("value" in patch) {
      ; (entry.state as DataHubTopicState<unknown>).totalPublishes++
      ; (entry.state as DataHubTopicState<unknown>).publishedAtUtc = patch.receivedAtUtc ?? new Date().toISOString()
      ; (entry.state as DataHubTopicState<unknown>).sequence = (entry.state.sequence ?? 0) + 1
    }

    const enriched = this.enrichState(entry)
    for (const sub of entry.subscribers) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sub(enriched as any)
      } catch {
        // subscriber errors must not crash the hub
      }
    }
  }

  private enrichState<T>(entry: TopicEntry<T>): DataHubTopicState<T> {
    const publishedAt = entry.state.publishedAtUtc ? new Date(entry.state.publishedAtUtc).getTime() : null
    const ageMs = publishedAt !== null ? Date.now() - publishedAt : null
    const freshness = computeFreshness(ageMs, entry.policy)
    const status = computeStatus(freshness, entry.state.value !== null, entry.state.lastError)
    return {
      ...entry.state,
      ageMs,
      freshness,
      status,
    } as DataHubTopicState<T>
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _hub: CapitalifeDataHub | null = null

export function getDataHub(): CapitalifeDataHub {
  if (!_hub) _hub = new CapitalifeDataHub()
  return _hub
}

/** Reset the singleton — for tests only. */
export function _resetDataHubForTests(): void {
  _hub = null
}
