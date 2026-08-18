// In-flight request deduplication for Sentinel Connect.
// If two identical eligible requests arrive concurrently, only one provider
// call is made; both callers receive the same result. Scope is per-process
// (server-side, in-memory) — never shared across users/sessions beyond what
// the key itself encodes, and never used for private/session-scoped content.
import type { ConnectRequest, ConnectResult } from "./connect-router";

export type DedupeScope = "PUBLIC_SAFE" | "SESSION_PRIVATE" | "NO_CACHE";

const inFlight = new Map<string, Promise<ConnectResult>>();

let dedupedRequestCount = 0;

export function getDedupedRequestCount(): number {
  return dedupedRequestCount;
}

// Only the last user message + mode matter for the deterministic tool-backed
// fast path this slice targets — conversation history is intentionally
// excluded from the key so identical KPI questions dedupe even if asked at
// different points in a session, but see classifyDedupeScope() for the
// actual eligibility gate (history-bearing/private requests never dedupe).
export function buildDedupeKey(req: ConnectRequest): string {
  const lastUser = req.messages.findLast((m) => m.role === "user")?.content ?? "";
  const normalized = lastUser.trim().toLowerCase().replace(/\s+/g, " ");
  return `${req.mode ?? "auto"}::${normalized}`;
}

// Conservative by design — default to NO_CACHE/no-dedupe unless a request
// is provably safe to share: single-turn (no prior conversation), so no
// session-specific context could leak between two different callers who
// happen to type the same question.
export function classifyDedupeScope(req: ConnectRequest): DedupeScope {
  const hasHistory = req.messages.length > 1;
  if (hasHistory) return "SESSION_PRIVATE"; // never dedupe across sessions
  return "PUBLIC_SAFE";
}

export function isDedupeEligible(req: ConnectRequest): boolean {
  return classifyDedupeScope(req) === "PUBLIC_SAFE";
}

/**
 * Runs `execute()` with in-flight deduplication when the request is eligible.
 * Ineligible requests always execute independently (no sharing, no dedupe).
 */
export async function withRequestDedupe(
  req: ConnectRequest,
  execute: () => Promise<ConnectResult>,
): Promise<ConnectResult> {
  if (!isDedupeEligible(req)) return execute();

  const key = buildDedupeKey(req);
  const existing = inFlight.get(key);
  if (existing) {
    dedupedRequestCount += 1;
    return existing;
  }

  const promise = execute().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

// Test-only reset.
export function _testResetDedupe(): void {
  inFlight.clear();
  dedupedRequestCount = 0;
}
