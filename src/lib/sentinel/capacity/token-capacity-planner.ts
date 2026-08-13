import {
  LimitConfidence,
  MeasuredLimit,
  ModelTokenCapacity,
  CapacitySummary,
  ProviderCapacityEntry,
  ProviderRateLimitHeaders,
  ProviderErrorClass,
} from "./limit-types";
import { getAllModels } from "../catalog/model-catalog";
import {
  getProviderState,
  getDailyTokens,
  getDailyRequests,
  isBlocked,
} from "../store/usage-store";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function staticLimit(value: number | null, confidence: LimitConfidence = "medium"): MeasuredLimit {
  return {
    value,
    source: "official_config",
    confidence,
    measuredAtUtc: new Date().toISOString(),
    expiresAtUtc: new Date(Date.now() + 6 * 3600_000).toISOString(),
  };
}

function unknownLimit(): MeasuredLimit {
  return {
    value: null,
    source: "unknown",
    confidence: "low",
    measuredAtUtc: new Date().toISOString(),
    expiresAtUtc: null,
  };
}

function headerLimit(value: number | null, confidence: LimitConfidence = "high"): MeasuredLimit {
  return {
    value,
    source: "response_header",
    confidence,
    measuredAtUtc: new Date().toISOString(),
    expiresAtUtc: new Date(Date.now() + 60_000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// getModelCapacity
// ---------------------------------------------------------------------------

export function getModelCapacity(providerId: string, modelId: string): ModelTokenCapacity {
  const all = getAllModels();
  const model = all.find((m) => m.provider === providerId && m.modelId === modelId);

  const now = new Date().toISOString();

  const usedRequests = getDailyRequests(providerId);
  const usedTokens = getDailyTokens(providerId);
  void getProviderState(providerId); // initializes state if missing
  const blocked = isBlocked(providerId);

  const rpmLimit = model?.limits.requestsPerMinute ?? null;
  const rpdLimit = model?.limits.requestsPerDay ?? null;
  const tpmLimit = model?.limits.tokensPerMinute ?? null;
  const tpdLimit = model?.limits.tokensPerDay ?? null;
  const contextWindow = model?.limits.contextWindow ?? null;
  const maxOutputTokens = model?.limits.maxOutputTokens ?? null;

  const remainingRequestsDay = rpdLimit !== null ? Math.max(0, rpdLimit - usedRequests) : null;
  const remainingTokensDay = tpdLimit !== null ? Math.max(0, tpdLimit - usedTokens) : null;

  const health: ModelTokenCapacity["health"] = blocked
    ? "rate_limited"
    : model == null
    ? "not_verified"
    : "ready";

  const freeStatus: ModelTokenCapacity["freeStatus"] = model?.pricing.verifiedFree
    ? "verified_free"
    : model == null
    ? "unknown"
    : "paid";

  return {
    providerId,
    modelId,
    contextWindow: contextWindow !== null ? staticLimit(contextWindow, "high") : unknownLimit(),
    maxInputTokens: contextWindow !== null ? staticLimit(contextWindow, "medium") : unknownLimit(),
    maxOutputTokens: maxOutputTokens !== null ? staticLimit(maxOutputTokens, "high") : unknownLimit(),
    limits: {
      requestsPerMinute: rpmLimit !== null ? staticLimit(rpmLimit) : unknownLimit(),
      requestsPerDay: rpdLimit !== null ? staticLimit(rpdLimit) : unknownLimit(),
      requestsPerMonth: unknownLimit(),
      inputTokensPerMinute: tpmLimit !== null ? staticLimit(tpmLimit) : unknownLimit(),
      outputTokensPerMinute: unknownLimit(),
      tokensPerMinute: tpmLimit !== null ? staticLimit(tpmLimit) : unknownLimit(),
      tokensPerDay: tpdLimit !== null ? staticLimit(tpdLimit) : unknownLimit(),
      tokensPerMonth: unknownLimit(),
      concurrentRequests: unknownLimit(),
    },
    remaining: {
      requestsMinute: unknownLimit(),
      requestsDay: remainingRequestsDay !== null ? staticLimit(remainingRequestsDay, "medium") : unknownLimit(),
      requestsMonth: unknownLimit(),
      tokensMinute: unknownLimit(),
      tokensDay: remainingTokensDay !== null ? staticLimit(remainingTokensDay, "medium") : unknownLimit(),
      tokensMonth: unknownLimit(),
    },
    resetAt: {
      minuteUtc: null,
      dayUtc: null,
      monthUtc: null,
    },
    freeStatus,
    health,
    measuredAtUtc: now,
  };
}

// ---------------------------------------------------------------------------
// getCapacitySummary
// ---------------------------------------------------------------------------

export function getCapacitySummary(configuredProviders: string[]): CapacitySummary {
  const now = new Date().toISOString();
  const allModels = getAllModels();

  let totalVerifiedProviders = 0;
  let totalAvailableModels = 0;
  let totalVerifiedFreeModels = 0;
  let largestContextWindow: number | null = null;
  let largestOutputLimit: number | null = null;
  let estimatedRemainingRequestsToday: number | null = null;
  let estimatedRemainingTokensToday: number | null = null;

  const providers: ProviderCapacityEntry[] = configuredProviders.map((providerId) => {
    const providerModels = allModels.filter((m) => m.provider === providerId);
    const freeModels = providerModels.filter((m) => m.pricing.verifiedFree);

    const usedRequests = getDailyRequests(providerId);
    const usedTokens = getDailyTokens(providerId);
    void getProviderState(providerId); // side-effect: initializes state if missing

    // Aggregate per-provider limits from the first free model that has them (or best model)
    const referenceModel = freeModels[0] ?? providerModels[0];
    const rpmLimit = referenceModel?.limits.requestsPerMinute ?? null;
    const rpdLimit = referenceModel?.limits.requestsPerDay ?? null;
    const tpmLimit = referenceModel?.limits.tokensPerMinute ?? null;
    const tpdLimit = referenceModel?.limits.tokensPerDay ?? null;

    const remainingRequests = rpdLimit !== null ? Math.max(0, rpdLimit - usedRequests) : null;
    const remainingTokens = tpdLimit !== null ? Math.max(0, tpdLimit - usedTokens) : null;

    // Accumulate global estimates
    if (remainingRequests !== null) {
      estimatedRemainingRequestsToday = (estimatedRemainingRequestsToday ?? 0) + remainingRequests;
    }
    if (remainingTokens !== null) {
      estimatedRemainingTokensToday = (estimatedRemainingTokensToday ?? 0) + remainingTokens;
    }

    // Track largest context / output across all models for this provider
    for (const m of providerModels) {
      const ctx = m.limits.contextWindow;
      const out = m.limits.maxOutputTokens;
      if (ctx !== null) {
        if (largestContextWindow === null || ctx > largestContextWindow) largestContextWindow = ctx;
      }
      if (out !== null) {
        if (largestOutputLimit === null || out > largestOutputLimit) largestOutputLimit = out;
      }
    }

    if (providerModels.length > 0) totalVerifiedProviders++;
    totalAvailableModels += providerModels.length;
    totalVerifiedFreeModels += freeModels.length;

    const blocked = isBlocked(providerId);
    const status = blocked ? "rate_limited" : providerModels.length > 0 ? "ready" : "unknown";

    return {
      providerId,
      status,
      modelCount: providerModels.length,
      freeModelCount: freeModels.length,
      requestCapacity: {
        perMinute: rpmLimit,
        perDay: rpdLimit,
        remaining: remainingRequests,
      },
      tokenCapacity: {
        perMinute: tpmLimit,
        perDay: tpdLimit,
        remaining: remainingTokens,
      },
      nextResetUtc: null,
    };
  });

  return {
    measuredAtUtc: now,
    totalConfiguredProviders: configuredProviders.length,
    totalVerifiedProviders,
    totalAvailableModels,
    totalVerifiedFreeModels,
    largestContextWindow,
    largestOutputLimit,
    estimatedRemainingRequestsToday,
    estimatedRemainingTokensToday,
    providers,
  };
}

// ---------------------------------------------------------------------------
// parseRateLimitHeaders
// ---------------------------------------------------------------------------

function parseHeaderInt(headers: Headers, key: string): number | null {
  const raw = headers.get(key);
  if (raw === null) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

function parseResetTimestamp(raw: string | null): number | null {
  if (raw === null) return null;
  // Try ISO 8601
  if (raw.includes("T") || raw.includes("-")) {
    const ms = Date.parse(raw);
    return isNaN(ms) ? null : ms;
  }
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  // If value looks like epoch seconds (< 1e12), convert to ms
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
}

export function parseRateLimitHeaders(headers: Headers): Partial<ProviderRateLimitHeaders> {
  const result: Partial<ProviderRateLimitHeaders> = {};

  // Requests
  const reqLimit =
    parseHeaderInt(headers, "x-ratelimit-limit-requests") ??
    parseHeaderInt(headers, "ratelimit-limit");
  result.requestsLimit = reqLimit !== null ? headerLimit(reqLimit) : unknownLimit();

  const reqRemaining =
    parseHeaderInt(headers, "x-ratelimit-remaining-requests") ??
    parseHeaderInt(headers, "ratelimit-remaining");
  result.requestsRemaining = reqRemaining !== null ? headerLimit(reqRemaining) : unknownLimit();

  const reqResetRaw =
    headers.get("x-ratelimit-reset-requests") ?? headers.get("ratelimit-reset");
  const reqReset = parseResetTimestamp(reqResetRaw);
  result.requestsReset = reqReset !== null ? headerLimit(reqReset) : unknownLimit();

  // Tokens (combined)
  const tokLimit = parseHeaderInt(headers, "x-ratelimit-limit-tokens");
  result.tokensLimit = tokLimit !== null ? headerLimit(tokLimit) : unknownLimit();

  const tokRemaining = parseHeaderInt(headers, "x-ratelimit-remaining-tokens");
  result.tokensRemaining = tokRemaining !== null ? headerLimit(tokRemaining) : unknownLimit();

  const tokResetRaw = headers.get("x-ratelimit-reset-tokens");
  const tokReset = parseResetTimestamp(tokResetRaw);
  result.tokensReset = tokReset !== null ? headerLimit(tokReset) : unknownLimit();

  // Input tokens
  const inTokLimit = parseHeaderInt(headers, "x-ratelimit-limit-input-tokens");
  result.inputTokensLimit = inTokLimit !== null ? headerLimit(inTokLimit) : unknownLimit();

  const inTokRemaining = parseHeaderInt(headers, "x-ratelimit-remaining-input-tokens");
  result.inputTokensRemaining = inTokRemaining !== null ? headerLimit(inTokRemaining) : unknownLimit();

  // Output tokens
  const outTokLimit = parseHeaderInt(headers, "x-ratelimit-limit-output-tokens");
  result.outputTokensLimit = outTokLimit !== null ? headerLimit(outTokLimit) : unknownLimit();

  const outTokRemaining = parseHeaderInt(headers, "x-ratelimit-remaining-output-tokens");
  result.outputTokensRemaining = outTokRemaining !== null ? headerLimit(outTokRemaining) : unknownLimit();

  // Retry-After (convert seconds to ms)
  const retryAfterRaw = headers.get("retry-after");
  if (retryAfterRaw !== null) {
    const secs = parseFloat(retryAfterRaw);
    result.retryAfterMs = !isNaN(secs) ? headerLimit(Math.round(secs * 1000)) : unknownLimit();
  } else {
    result.retryAfterMs = unknownLimit();
  }

  return result;
}

// ---------------------------------------------------------------------------
// classifyProviderError
// ---------------------------------------------------------------------------

export function classifyProviderError(
  status: number,
  body: string,
  provider: string
): ProviderErrorClass {
  const lower = body.toLowerCase();

  if (status === 401) return "unauthorized";
  if (status === 402) return "billing_required";
  if (status === 403) return "model_unavailable";
  if (status === 413) return "context_too_large";
  if (status === 503 || status === 529) return "provider_overload";

  if (status === 429) {
    // Provider-specific patterns first
    if (body.includes("RESOURCE_EXHAUSTED")) return "rate_limit_daily";
    if (lower.includes("no endpoints")) return "model_unavailable";

    if (lower.includes("month")) return "rate_limit_monthly";
    if (lower.includes("daily") || lower.includes("day")) return "rate_limit_daily";
    return "rate_limit_minute";
  }

  // Provider-specific patterns for non-429
  if (provider === "openrouter" && lower.includes("no endpoints")) return "model_unavailable";

  return "unknown";
}
