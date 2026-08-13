/**
 * SENTINEL ROUTER INTEGRATION TESTS
 *
 * Tests the real provider-router.ts ask() through mocked provider transports.
 * vi.mock calls are hoisted by Vitest — factories must be entirely self-contained
 * with no references to module-scope variables (including helpers defined as const).
 *
 * Covers:
 *   Test A: 429 rate_limited → fallback to Mistral
 *   Test B: quota_exhausted → fallback to Mistral
 *   Test C: offline / network error → fallback to Mistral
 *   Test D: paid_only → Free Firewall blocks at tryProvider → Mistral handles
 *   Test E: unknown_pricing → Free Firewall blocks → Mistral handles
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Provider mocks — each factory is fully self-contained (no external refs).
// groq and mistral are made "usable" so they appear in the routing order.
// All others return "disabled" so they are never tried.
// ---------------------------------------------------------------------------

vi.mock("@/lib/sentinel/providers/groq-provider", () => ({
  groqProvider: {
    id: "groq", label: "Groq", type: "custom", supportsStreaming: true,
    healthCheck: vi.fn(() => Promise.resolve({
      configured: true, available: true, usable: true, enabled: true,
      reason: "ready", message: "ready",
      model: "llama-3.3-70b-versatile",
      models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
      supportsStreaming: true,
    })),
    sendMessage: vi.fn(),
    streamMessage: vi.fn(),
  },
}));

vi.mock("@/lib/sentinel/providers/mistral-provider", () => ({
  mistralProvider: {
    id: "mistral", label: "Mistral", type: "custom", supportsStreaming: true,
    healthCheck: vi.fn(() => Promise.resolve({
      configured: true, available: true, usable: true, enabled: true,
      reason: "ready", message: "ready",
      model: "mistral-small-latest", models: ["mistral-small-latest"],
      supportsStreaming: true,
    })),
    sendMessage: vi.fn(() => Promise.resolve({
      answer: "OK", model: "mistral-small-latest", provider: "mistral", tokensUsed: 10,
    })),
    streamMessage: vi.fn(),
  },
}));

vi.mock("@/lib/sentinel/providers/cerebras-provider", () => ({
  cerebrasProvider: {
    id: "cerebras", label: "Cerebras", type: "custom", supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({ configured: false, available: false, usable: false, enabled: false, reason: "disabled", message: "not in test", model: null, models: [], supportsStreaming: false })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  },
}));
vi.mock("@/lib/sentinel/providers/cohere-provider", () => ({
  cohereProvider: {
    id: "cohere", label: "Cohere", type: "custom", supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({ configured: false, available: false, usable: false, enabled: false, reason: "disabled", message: "not in test", model: null, models: [], supportsStreaming: false })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  },
}));
vi.mock("@/lib/sentinel/providers/anthropic-provider", () => ({
  anthropicProvider: {
    id: "anthropic", label: "Anthropic", type: "custom", supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({ configured: false, available: false, usable: false, enabled: false, reason: "disabled", message: "not in test", model: null, models: [], supportsStreaming: false })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  },
}));
vi.mock("@/lib/sentinel/providers/openrouter-provider", () => ({
  openrouterProvider: {
    id: "openrouter", label: "OpenRouter", type: "custom", supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({ configured: false, available: false, usable: false, enabled: false, reason: "disabled", message: "not in test", model: null, models: [], supportsStreaming: false })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  },
}));
vi.mock("@/lib/sentinel/providers/gemini-provider", () => ({
  geminiProvider: {
    id: "gemini", label: "Gemini", type: "custom", supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({ configured: false, available: false, usable: false, enabled: false, reason: "disabled", message: "not in test", model: null, models: [], supportsStreaming: false })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  },
}));
vi.mock("@/lib/sentinel/providers/github-models-provider", () => ({
  githubModelsProvider: {
    id: "github-models", label: "GitHub Models", type: "custom", supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({ configured: false, available: false, usable: false, enabled: false, reason: "disabled", message: "not in test", model: null, models: [], supportsStreaming: false })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  },
}));
vi.mock("@/lib/sentinel/providers/cloudflare-provider", () => ({
  cloudflareProvider: {
    id: "cloudflare", label: "Cloudflare", type: "custom", supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({ configured: false, available: false, usable: false, enabled: false, reason: "disabled", message: "not in test", model: null, models: [], supportsStreaming: false })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  },
}));
vi.mock("@/lib/sentinel/providers/huggingface-provider", () => ({
  huggingfaceProvider: {
    id: "huggingface", label: "HuggingFace", type: "custom", supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({ configured: false, available: false, usable: false, enabled: false, reason: "disabled", message: "not in test", model: null, models: [], supportsStreaming: false })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  },
}));
vi.mock("@/lib/sentinel/providers/ollama-provider", () => ({
  ollamaProvider: {
    id: "ollama", label: "Ollama", type: "custom", supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({ configured: false, available: false, usable: false, enabled: false, reason: "disabled", message: "not in test", model: null, models: [], supportsStreaming: false })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  },
}));
vi.mock("@/lib/sentinel/providers/local-provider", () => ({
  localProvider: {
    id: "local", label: "Local", type: "custom", supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({ configured: false, available: false, usable: false, enabled: false, reason: "disabled", message: "not in test", model: null, models: [], supportsStreaming: false })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  },
}));
vi.mock("@/lib/sentinel/providers/custom-provider", () => ({
  customProvider: {
    id: "custom", label: "Custom", type: "custom", supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({ configured: false, available: false, usable: false, enabled: false, reason: "disabled", message: "not in test", model: null, models: [], supportsStreaming: false })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports AFTER mocks
// ---------------------------------------------------------------------------

import { ask } from "@/lib/sentinel/providers/provider-router";
import { groqProvider } from "@/lib/sentinel/providers/groq-provider";
import { mistralProvider } from "@/lib/sentinel/providers/mistral-provider";
import * as catalog from "@/lib/sentinel/catalog/model-catalog";
import type { DiscoveredModel } from "@/lib/sentinel/catalog/discovered-model-types";

const TEST_MSG = [{ role: "user" as const, content: "OK" }];

const FREE_MISTRAL_MODEL: DiscoveredModel = {
  provider: "mistral",
  modelId: "mistral-small-latest",
  displayName: "Mistral Small",
  availability: "available",
  pricing: { verifiedFree: true, inputPriceUsdPerMillion: 0, outputPriceUsdPerMillion: 0, source: "mistral-la-plateforme-free", verifiedAtUtc: "2025-01-01T00:00:00Z" },
  capabilities: { text: true, vision: false, audioInput: false, audioOutput: false, streaming: true, nativeTools: true, structuredOutput: true, reasoning: false, embeddings: false, reranking: false },
  limits: { contextWindow: 128000, maxOutputTokens: 8192, requestsPerMinute: 5, requestsPerDay: null, tokensPerMinute: null, tokensPerDay: null },
  statusSource: "official_config",
  fetchedAtUtc: new Date().toISOString(),
  expiresAtUtc: new Date(Date.now() + 6 * 3600_000).toISOString(),
};

// ---------------------------------------------------------------------------
// Env: only groq + mistral configured → only these two in routing order
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "test-groq-key-integration");
  vi.stubEnv("MISTRAL_API_KEY", "test-mistral-key-integration");
  vi.stubEnv("CEREBRAS_API_KEY", "");
  vi.stubEnv("COHERE_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GITHUB_MODELS_API_KEY", "");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
  vi.stubEnv("HF_TOKEN", "");

  vi.mocked(groqProvider.sendMessage).mockReset();
  vi.mocked(mistralProvider.sendMessage).mockReset();
  vi.mocked(mistralProvider.sendMessage).mockResolvedValue({
    answer: "OK", model: "mistral-small-latest", provider: "mistral", tokensUsed: 10,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Test A: 429 rate_limited → fallback to Mistral
// ---------------------------------------------------------------------------

describe("Router failover — Test A: 429 rate limited", () => {
  it("falls back to Mistral when Groq returns 429, fallbackUsed=true", async () => {
    vi.mocked(groqProvider.sendMessage).mockRejectedValue(
      new Error("groq 429: Too Many Requests — rate limited"),
    );

    const result = await ask(TEST_MSG, { profile: "auto_balanced" });

    expect(result.provider).toBe("mistral");
    expect(result.diagnostics.fallbackUsed).toBe(true);
    expect(result.diagnostics.activeProvider).toBe("mistral");
    expect(result.answer).toBe("OK");
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(vi.mocked(groqProvider.sendMessage)).toHaveBeenCalled();
    expect(vi.mocked(mistralProvider.sendMessage)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test B: quota_exhausted → fallback to Mistral
// ---------------------------------------------------------------------------

describe("Router failover — Test B: quota exhausted", () => {
  it("falls back to Mistral when Groq signals quota exhausted", async () => {
    vi.mocked(groqProvider.sendMessage).mockRejectedValue(
      new Error("Groq quota exhausted — daily limit reached"),
    );

    const result = await ask(TEST_MSG, { profile: "auto_balanced" });

    expect(result.provider).toBe("mistral");
    expect(result.diagnostics.fallbackUsed).toBe(true);
    expect(result.answer).toBe("OK");
    expect(vi.mocked(groqProvider.sendMessage)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test C: offline / network error → fallback to Mistral
// ---------------------------------------------------------------------------

describe("Router failover — Test C: provider offline / unreachable", () => {
  it("falls back to Mistral when Groq times out", async () => {
    vi.mocked(groqProvider.sendMessage).mockRejectedValue(
      new Error("groq timeout after 30000ms"),
    );

    const result = await ask(TEST_MSG, { profile: "auto_balanced" });

    expect(result.provider).toBe("mistral");
    expect(result.diagnostics.fallbackUsed).toBe(true);
    expect(result.answer).toBe("OK");
  });

  it("falls back when Groq raises a network / fetch error", async () => {
    vi.mocked(groqProvider.sendMessage).mockRejectedValue(new TypeError("fetch failed"));

    const result = await ask(TEST_MSG, { profile: "auto_balanced" });

    expect(result.provider).toBe("mistral");
    expect(result.diagnostics.fallbackUsed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test D: paid_only → Free Firewall blocks at tryProvider → Mistral handles
// ---------------------------------------------------------------------------

describe("Router failover — Test D: paid model → Free Firewall blocks before sendMessage", () => {
  it("Groq sendMessage is NOT called when catalog model is paid; Mistral handles", async () => {
    const groqRealModel = catalog.getModelsForProvider("groq")[0];
    if (!groqRealModel) { console.warn("No groq models — skip D"); return; }

    const paidGroqModel: DiscoveredModel = {
      ...groqRealModel,
      pricing: {
        verifiedFree: false,
        inputPriceUsdPerMillion: 0.10,
        outputPriceUsdPerMillion: 0.10,
        source: "test-paid",
        verifiedAtUtc: "2025-01-01T00:00:00Z",
      },
    };

    // Spy on getModelsForProvider so tryProvider("groq") sees a paid model.
    // getAllModels() is untouched → isProviderVerifiedFree still returns true for groq
    // → groq stays in routing order → router attempts groq → FreeFirewall blocks.
    const spy = vi.spyOn(catalog, "getModelsForProvider").mockImplementation((provider) => {
      if (provider === "groq") return [paidGroqModel];
      if (provider === "mistral") return [FREE_MISTRAL_MODEL];
      return [];
    });

    try {
      const result = await ask(TEST_MSG, { profile: "auto_balanced" });
      expect(vi.mocked(groqProvider.sendMessage)).not.toHaveBeenCalled();
      expect(result.provider).toBe("mistral");
      expect(result.answer).toBe("OK");
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Test E: unknown_pricing → Free Firewall blocks → Mistral
// ---------------------------------------------------------------------------

describe("Router failover — Test E: unknown pricing → Free Firewall blocks before sendMessage", () => {
  it("Groq sendMessage is NOT called when pricing is null (unknown); Mistral handles", async () => {
    const groqRealModel = catalog.getModelsForProvider("groq")[0];
    if (!groqRealModel) { console.warn("No groq models — skip E"); return; }

    const unknownPricingModel: DiscoveredModel = {
      ...groqRealModel,
      pricing: {
        verifiedFree: true,
        inputPriceUsdPerMillion: null as unknown as number,
        outputPriceUsdPerMillion: null as unknown as number,
        source: "test-unknown",
        verifiedAtUtc: "2025-01-01T00:00:00Z",
      },
    };

    const spy = vi.spyOn(catalog, "getModelsForProvider").mockImplementation((provider) => {
      if (provider === "groq") return [unknownPricingModel];
      if (provider === "mistral") return [FREE_MISTRAL_MODEL];
      return [];
    });

    try {
      const result = await ask(TEST_MSG, { profile: "auto_balanced" });
      expect(vi.mocked(groqProvider.sendMessage)).not.toHaveBeenCalled();
      expect(result.provider).toBe("mistral");
      expect(result.answer).toBe("OK");
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Diagnostic structure validation
// ---------------------------------------------------------------------------

describe("Router diagnostics — structure on fallback result", () => {
  it("includes all required fields when fallback occurs", async () => {
    vi.mocked(groqProvider.sendMessage).mockRejectedValue(new Error("429"));
    const result = await ask(TEST_MSG, { profile: "auto_balanced" });

    const d = result.diagnostics;
    expect(d.mode).toBeDefined();
    expect(d.profile).toBe("auto_balanced");
    expect(typeof d.fallbackUsed).toBe("boolean");
    expect(d.fallbackUsed).toBe(true);
    expect(d.activeProvider).toBe("mistral");
    expect(d.fallbackProvider).toBe("mistral");
  });

  it("fallbackUsed=false when Groq succeeds on first attempt", async () => {
    vi.mocked(groqProvider.sendMessage).mockResolvedValue({
      answer: "Groq says OK",
      model: "llama-3.3-70b-versatile",
      provider: "groq",
      tokensUsed: 42,
    });

    const result = await ask(TEST_MSG, { profile: "auto_balanced" });

    expect(result.provider).toBe("groq");
    expect(result.diagnostics.fallbackUsed).toBe(false);
    expect(result.diagnostics.activeProvider).toBe("groq");
    expect(vi.mocked(mistralProvider.sendMessage)).not.toHaveBeenCalled();
  });
});
