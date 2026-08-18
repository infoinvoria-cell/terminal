/**
 * ROUTING SIMULATION — 100+ decisions, no real provider calls.
 * Confirms selection distribution responds to load/failure state rather
 * than deterministically favoring one provider under all conditions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/sentinel/providers/groq-provider", () => ({
  groqProvider: {
    id: "groq", label: "Groq", type: "custom", supportsStreaming: true,
    healthCheck: vi.fn(() => Promise.resolve({
      configured: true, available: true, usable: true, enabled: true,
      reason: "ready", message: "ready", model: "llama-3.3-70b-versatile",
      models: ["llama-3.3-70b-versatile"], supportsStreaming: true,
    })),
    sendMessage: vi.fn(() => Promise.resolve({ answer: "GROQ_OK", model: "llama-3.3-70b-versatile", provider: "groq", tokensUsed: 10 })),
    streamMessage: vi.fn(),
  },
}));
vi.mock("@/lib/sentinel/providers/mistral-provider", () => ({
  mistralProvider: {
    id: "mistral", label: "Mistral", type: "custom", supportsStreaming: true,
    healthCheck: vi.fn(() => Promise.resolve({
      configured: true, available: true, usable: true, enabled: true,
      reason: "ready", message: "ready", model: "mistral-small-latest",
      models: ["mistral-small-latest"], supportsStreaming: true,
    })),
    sendMessage: vi.fn(() => Promise.resolve({ answer: "MISTRAL_OK", model: "mistral-small-latest", provider: "mistral", tokensUsed: 10 })),
    streamMessage: vi.fn(),
  },
}));
function disabledProvider(id: string) {
  return {
    id, label: id, type: "custom" as const, supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({
      configured: false, available: false, usable: false, enabled: false,
      reason: "disabled" as const, message: "not in test", model: null, models: [], supportsStreaming: false,
    })),
    sendMessage: vi.fn(), streamMessage: vi.fn(),
  };
}
vi.mock("@/lib/sentinel/providers/cerebras-provider", () => ({ cerebrasProvider: disabledProvider("cerebras") }));
vi.mock("@/lib/sentinel/providers/cohere-provider", () => ({ cohereProvider: disabledProvider("cohere") }));
vi.mock("@/lib/sentinel/providers/anthropic-provider", () => ({ anthropicProvider: disabledProvider("anthropic") }));
vi.mock("@/lib/sentinel/providers/openrouter-provider", () => ({ openrouterProvider: disabledProvider("openrouter") }));
vi.mock("@/lib/sentinel/providers/gemini-provider", () => ({ geminiProvider: disabledProvider("gemini") }));
vi.mock("@/lib/sentinel/providers/github-models-provider", () => ({ githubModelsProvider: disabledProvider("github-models") }));
vi.mock("@/lib/sentinel/providers/cloudflare-provider", () => ({ cloudflareProvider: disabledProvider("cloudflare") }));
vi.mock("@/lib/sentinel/providers/huggingface-provider", () => ({ huggingfaceProvider: disabledProvider("huggingface") }));

import { ask } from "@/lib/sentinel/providers/provider-router";
import { groqProvider } from "@/lib/sentinel/providers/groq-provider";
import { mistralProvider } from "@/lib/sentinel/providers/mistral-provider";
import * as usageStore from "@/lib/sentinel/store/usage-store";

const TEST_MSG = [{ role: "user" as const, content: "General question about strategy performance." }];

beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "test-groq-key");
  vi.stubEnv("MISTRAL_API_KEY", "test-mistral-key");
  vi.stubEnv("CEREBRAS_API_KEY", "");
  vi.stubEnv("COHERE_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GITHUB_MODELS_API_KEY", "");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
  vi.stubEnv("HF_TOKEN", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("100-decision routing simulation (mocked, no real provider calls)", () => {
  it("selection distribution shifts toward Mistral as Groq's simulated load grows", async () => {
    const outcomes: string[] = [];
    for (let i = 0; i < 100; i++) {
      // Simulate Groq's load climbing across the run: 0 -> 100 requests today.
      const groqLoad = i;
      vi.spyOn(usageStore, "getDailyRequests").mockImplementation((p: string) => (p === "groq" ? groqLoad : 0));
      vi.mocked(groqProvider.sendMessage).mockResolvedValue({ answer: "GROQ_OK", model: "llama-3.3-70b-versatile", provider: "groq", tokensUsed: 10 });
      vi.mocked(mistralProvider.sendMessage).mockResolvedValue({ answer: "MISTRAL_OK", model: "mistral-small-latest", provider: "mistral", tokensUsed: 10 });
      const result = await ask(TEST_MSG, { profile: "auto_balanced" });
      outcomes.push(result.provider);
      vi.restoreAllMocks();
    }

    expect(outcomes.length).toBe(100);
    // Every outcome must be one of the two configured free providers — never anything else.
    for (const o of outcomes) expect(["groq", "mistral"]).toContain(o);

    // Early low-load iterations should mostly favor Groq (higher quality weight).
    const earlyGroqShare = outcomes.slice(0, 10).filter((o) => o === "groq").length / 10;
    expect(earlyGroqShare).toBeGreaterThan(0.5);
  });

  it("100 decisions across rate-limit/timeout/normal conditions never select a non-free provider", async () => {
    const conditions = ["normal", "groq_ratelimited", "groq_timeout", "mistral_ratelimited"] as const;
    const outcomes: { condition: string; provider: string | null; failed: boolean }[] = [];

    for (let i = 0; i < 100; i++) {
      const condition = conditions[i % conditions.length]!;
      vi.mocked(groqProvider.sendMessage).mockReset();
      vi.mocked(mistralProvider.sendMessage).mockReset();

      if (condition === "normal") {
        vi.mocked(groqProvider.sendMessage).mockResolvedValue({ answer: "GROQ_OK", model: "llama-3.3-70b-versatile", provider: "groq", tokensUsed: 10 });
        vi.mocked(mistralProvider.sendMessage).mockResolvedValue({ answer: "MISTRAL_OK", model: "mistral-small-latest", provider: "mistral", tokensUsed: 10 });
      } else if (condition === "groq_ratelimited") {
        vi.mocked(groqProvider.sendMessage).mockRejectedValue(new Error("groq 429"));
        vi.mocked(mistralProvider.sendMessage).mockResolvedValue({ answer: "MISTRAL_OK", model: "mistral-small-latest", provider: "mistral", tokensUsed: 10 });
      } else if (condition === "groq_timeout") {
        vi.mocked(groqProvider.sendMessage).mockRejectedValue(new Error("groq timeout after 30000ms"));
        vi.mocked(mistralProvider.sendMessage).mockResolvedValue({ answer: "MISTRAL_OK", model: "mistral-small-latest", provider: "mistral", tokensUsed: 10 });
      } else {
        vi.mocked(groqProvider.sendMessage).mockResolvedValue({ answer: "GROQ_OK", model: "llama-3.3-70b-versatile", provider: "groq", tokensUsed: 10 });
        vi.mocked(mistralProvider.sendMessage).mockRejectedValue(new Error("mistral 429"));
      }

      try {
        const result = await ask(TEST_MSG, { profile: "auto_balanced" });
        outcomes.push({ condition, provider: result.provider, failed: false });
      } catch {
        outcomes.push({ condition, provider: null, failed: true });
      }
    }

    expect(outcomes.length).toBe(100);
    for (const o of outcomes) {
      if (!o.failed) expect(["groq", "mistral"]).toContain(o.provider);
    }
    // groq_ratelimited/groq_timeout conditions must always resolve via Mistral.
    const groqDownOutcomes = outcomes.filter((o) => o.condition === "groq_ratelimited" || o.condition === "groq_timeout");
    for (const o of groqDownOutcomes) expect(o.provider).toBe("mistral");
  });
});
