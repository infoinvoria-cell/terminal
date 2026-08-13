import { describe, it, expect, vi } from "vitest";

// Mock usage-store so the module can be imported without a real store
vi.mock("../store/usage-store", () => ({
  getProviderState: vi.fn(() => "active"),
  getDailyTokens: vi.fn(() => 0),
  getDailyRequests: vi.fn(() => 0),
  isBlocked: vi.fn(() => false),
}));

// Mock model-catalog so capacity planner has no catalog dependency in tests
vi.mock("../catalog/model-catalog", () => ({
  getAllModels: vi.fn(() => []),
}));

import { parseRateLimitHeaders, classifyProviderError } from "../capacity/token-capacity-planner";

describe("parseRateLimitHeaders", () => {
  it("parses x-ratelimit-limit-requests", () => {
    const headers = new Headers({ "x-ratelimit-limit-requests": "30" });
    const result = parseRateLimitHeaders(headers);
    expect(result.requestsLimit?.value).toBe(30);
    expect(result.requestsLimit?.source).toBe("response_header");
    expect(result.requestsLimit?.confidence).toBe("high");
  });

  it("parses x-ratelimit-remaining-requests", () => {
    const headers = new Headers({ "x-ratelimit-remaining-requests": "15" });
    const result = parseRateLimitHeaders(headers);
    expect(result.requestsRemaining?.value).toBe(15);
  });

  it("converts retry-after seconds to milliseconds", () => {
    const headers = new Headers({ "retry-after": "60" });
    const result = parseRateLimitHeaders(headers);
    expect(result.retryAfterMs?.value).toBe(60_000);
  });

  it("returns null values for empty headers", () => {
    const headers = new Headers();
    const result = parseRateLimitHeaders(headers);
    expect(result.requestsLimit?.value).toBeNull();
    expect(result.requestsLimit?.source).toBe("unknown");
  });

  it("parses ratelimit-limit fallback header", () => {
    const headers = new Headers({ "ratelimit-limit": "100" });
    const result = parseRateLimitHeaders(headers);
    expect(result.requestsLimit?.value).toBe(100);
  });
});

describe("classifyProviderError", () => {
  it("classifies 401 as unauthorized", () => {
    expect(classifyProviderError(401, "", "groq")).toBe("unauthorized");
  });

  it("classifies 402 as billing_required", () => {
    expect(classifyProviderError(402, "", "openrouter")).toBe("billing_required");
  });

  it("classifies 403 as model_unavailable", () => {
    expect(classifyProviderError(403, "", "github-models")).toBe("model_unavailable");
  });

  it("classifies 429 with daily body as rate_limit_daily", () => {
    expect(classifyProviderError(429, "daily quota exceeded", "groq")).toBe("rate_limit_daily");
    expect(classifyProviderError(429, "day limit reached", "groq")).toBe("rate_limit_daily");
  });

  it("classifies 429 with monthly body as rate_limit_monthly", () => {
    expect(classifyProviderError(429, "monthly limit exceeded", "groq")).toBe("rate_limit_monthly");
  });

  it("classifies plain 429 as rate_limit_minute", () => {
    expect(classifyProviderError(429, "rate limit", "groq")).toBe("rate_limit_minute");
  });

  it("classifies 413 as context_too_large", () => {
    expect(classifyProviderError(413, "", "gemini")).toBe("context_too_large");
  });

  it("classifies 503 as provider_overload", () => {
    expect(classifyProviderError(503, "", "groq")).toBe("provider_overload");
  });

  it("classifies Gemini RESOURCE_EXHAUSTED as rate_limit_daily", () => {
    expect(classifyProviderError(429, "RESOURCE_EXHAUSTED quota exceeded", "gemini")).toBe("rate_limit_daily");
  });

  it("classifies OpenRouter No endpoints as model_unavailable", () => {
    expect(classifyProviderError(429, "No endpoints available", "openrouter")).toBe("model_unavailable");
  });
});
