export type LimitSource =
  | "response_header"
  | "provider_usage_api"
  | "provider_models_api"
  | "official_config"
  | "conservative_fallback"
  | "unknown";

export type LimitConfidence = "high" | "medium" | "low";

export type MeasuredLimit = {
  value: number | null;
  source: LimitSource;
  confidence: LimitConfidence;
  measuredAtUtc: string;
  expiresAtUtc: string | null;
};

export type ProviderRateLimitHeaders = {
  requestsLimit: MeasuredLimit;
  requestsRemaining: MeasuredLimit;
  requestsReset: MeasuredLimit; // timestamp ms when limit resets
  tokensLimit: MeasuredLimit;
  tokensRemaining: MeasuredLimit;
  tokensReset: MeasuredLimit;
  inputTokensLimit: MeasuredLimit;
  inputTokensRemaining: MeasuredLimit;
  outputTokensLimit: MeasuredLimit;
  outputTokensRemaining: MeasuredLimit;
  retryAfterMs: MeasuredLimit;
};

export type ProviderErrorClass =
  | "unauthorized"
  | "model_unavailable"
  | "billing_required"
  | "rate_limit_minute"
  | "rate_limit_daily"
  | "rate_limit_monthly"
  | "provider_overload"
  | "model_deprecated"
  | "context_too_large"
  | "output_too_large"
  | "unknown";

export type ModelTokenCapacity = {
  providerId: string;
  modelId: string;
  contextWindow: MeasuredLimit;
  maxInputTokens: MeasuredLimit;
  maxOutputTokens: MeasuredLimit;
  limits: {
    requestsPerMinute: MeasuredLimit;
    requestsPerDay: MeasuredLimit;
    requestsPerMonth: MeasuredLimit;
    inputTokensPerMinute: MeasuredLimit;
    outputTokensPerMinute: MeasuredLimit;
    tokensPerMinute: MeasuredLimit;
    tokensPerDay: MeasuredLimit;
    tokensPerMonth: MeasuredLimit;
    concurrentRequests: MeasuredLimit;
  };
  remaining: {
    requestsMinute: MeasuredLimit;
    requestsDay: MeasuredLimit;
    requestsMonth: MeasuredLimit;
    tokensMinute: MeasuredLimit;
    tokensDay: MeasuredLimit;
    tokensMonth: MeasuredLimit;
  };
  resetAt: {
    minuteUtc: string | null;
    dayUtc: string | null;
    monthUtc: string | null;
  };
  freeStatus:
    | "verified_free"
    | "trial_free"
    | "free_quota_exhausted"
    | "unknown"
    | "paid";
  health:
    | "ready"
    | "degraded"
    | "rate_limited"
    | "quota_exhausted"
    | "unauthorized"
    | "unavailable"
    | "not_verified";
  measuredAtUtc: string;
};

export type CapacitySummary = {
  measuredAtUtc: string;
  totalConfiguredProviders: number;
  totalVerifiedProviders: number;
  totalAvailableModels: number;
  totalVerifiedFreeModels: number;
  largestContextWindow: number | null;
  largestOutputLimit: number | null;
  estimatedRemainingRequestsToday: number | null;
  estimatedRemainingTokensToday: number | null;
  providers: ProviderCapacityEntry[];
};

export type ProviderCapacityEntry = {
  providerId: string;
  status: string;
  modelCount: number;
  freeModelCount: number;
  requestCapacity: { perMinute: number | null; perDay: number | null; remaining: number | null };
  tokenCapacity: { perMinute: number | null; perDay: number | null; remaining: number | null };
  nextResetUtc: string | null;
};
