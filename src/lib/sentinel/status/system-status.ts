/**
 * Single source of truth for Sentinel system status.
 * Both /api/sentinel/health and /api/sentinel/capacity use this function.
 */

export type SentinelSystemStatus = "healthy" | "limited" | "local_fallback" | "offline";

/**
 * Providers that support runtime verification via a models-list API endpoint.
 * Only these count toward effective cloud-route capacity.
 * Key-only providers (Cerebras, Cohere, GitHub Models, etc.) are excluded.
 */
export const RUNTIME_PROBEABLE_PROVIDERS = new Set([
  "groq",
  "gemini",
  "mistral",
  "openrouter",
]);

export interface ProviderStatusInput {
  id: string;
  /** true if the provider has a verified route (key present + in RUNTIME_PROBEABLE_PROVIDERS, or runtimeVerified=true from probing) */
  effectivelyReady: boolean;
  /** true if the circuit breaker is currently open */
  blocked: boolean;
}

/**
 * Compute the unified Sentinel system status.
 *
 * HEALTHY:        ≥ 2 effective cloud routes available (unblocked).
 * LIMITED:        exactly 1 effective cloud route available.
 * LOCAL_FALLBACK: no effective cloud route, but Ollama is online.
 * OFFLINE:        no route at all.
 */
export function computeSentinelSystemStatus(
  providers: ProviderStatusInput[],
  ollamaOnline: boolean,
): SentinelSystemStatus {
  const readyCount = providers.filter((p) => p.effectivelyReady && !p.blocked).length;

  if (readyCount >= 2) return "healthy";
  if (readyCount === 1) return "limited";
  if (ollamaOnline) return "local_fallback";
  return "offline";
}
