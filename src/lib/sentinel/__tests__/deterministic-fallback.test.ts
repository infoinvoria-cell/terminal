/**
 * DETERMINISTIC ALL-PROVIDERS-DOWN FALLBACK
 *
 * When every free provider fails (including the local privacy fallback),
 * an unambiguous tool-backed fact (White Swan MaxDD) should still be
 * answerable WITHOUT an LLM. Complex/reasoning questions with no such
 * fact must NOT be fabricated — they get the honest "unavailable" message.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function failingProvider(id: string) {
  return {
    id, label: id, type: "custom" as const, supportsStreaming: false,
    healthCheck: vi.fn(() => Promise.resolve({
      configured: true, available: true, usable: true, enabled: true,
      reason: "ready" as const, message: "ready", model: "test-model", models: ["test-model"], supportsStreaming: false,
    })),
    sendMessage: vi.fn(() => Promise.reject(new Error(`${id} 429: rate limited`))),
    streamMessage: vi.fn(),
  };
}
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

vi.mock("@/lib/sentinel/providers/groq-provider", () => ({ groqProvider: failingProvider("groq") }));
vi.mock("@/lib/sentinel/providers/mistral-provider", () => ({ mistralProvider: failingProvider("mistral") }));
vi.mock("@/lib/sentinel/providers/cerebras-provider", () => ({ cerebrasProvider: disabledProvider("cerebras") }));
vi.mock("@/lib/sentinel/providers/cohere-provider", () => ({ cohereProvider: disabledProvider("cohere") }));
vi.mock("@/lib/sentinel/providers/anthropic-provider", () => ({ anthropicProvider: disabledProvider("anthropic") }));
vi.mock("@/lib/sentinel/providers/openrouter-provider", () => ({ openrouterProvider: disabledProvider("openrouter") }));
vi.mock("@/lib/sentinel/providers/gemini-provider", () => ({ geminiProvider: disabledProvider("gemini") }));
vi.mock("@/lib/sentinel/providers/github-models-provider", () => ({ githubModelsProvider: disabledProvider("github-models") }));
vi.mock("@/lib/sentinel/providers/cloudflare-provider", () => ({ cloudflareProvider: disabledProvider("cloudflare") }));
vi.mock("@/lib/sentinel/providers/huggingface-provider", () => ({ huggingfaceProvider: disabledProvider("huggingface") }));
vi.mock("@/lib/sentinel/providers/local-provider", () => ({ localProvider: disabledProvider("local") }));
vi.mock("@/lib/sentinel/providers/ollama-provider", () => ({ ollamaProvider: disabledProvider("ollama") }));

vi.mock("@/lib/sentinel/graphify-retrieval", () => ({
  getGraphContext: vi.fn(() => "Keine Treffer"),
}));

vi.mock("@/lib/sentinel/connect/local-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sentinel/connect/local-router")>();
  return {
    ...actual,
    routeLocally: vi.fn(async () => ({
      suggestedMode: "SINGLE_BEST" as const,
      requiresBrain: false, requiresGraphify: false, requiresTools: false,
      complexity: "low" as const, parallelism: 1,
    })),
  };
});

import { connectChat } from "@/lib/sentinel/connect/connect-router";

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

describe("All providers down — deterministic tool fallback", () => {
  it("White Swan MaxDD question still returns 20.17% with zero LLM calls succeeding", async () => {
    const result = await connectChat({
      messages: [{ role: "user", content: "What is White Swan €15k MaxDD?" }],
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.route).toBe("FALLBACK_CHAIN");
    expect(result.toolUsed).toBe("get_white_swan_risk_modes");
    expect(result.answer).toMatch(/20\.17/);
    expect(result.answer).not.toMatch(/-?4\.66/);
    expect(result.answer).not.toBe("Sentinel Connect: Kein Provider verfügbar. Bitte prüfe Netzwerk und API-Keys.");
  });

  it("a non-tool-backed complex question honestly reports unavailability — no fabrication", async () => {
    const result = await connectChat({
      messages: [{ role: "user", content: "Compare three different portfolio rebalancing strategies for me in depth." }],
    });

    expect(result.toolUsed).toBeNull();
    expect(result.answer).toBe("Sentinel Connect: Kein Provider verfügbar. Bitte prüfe Netzwerk und API-Keys.");
  });

  it("deterministic fallback answer explicitly discloses it is not an AI-synthesized response", async () => {
    const result = await connectChat({
      messages: [{ role: "user", content: "What is White Swan €50k risk modes?" }],
    });
    expect(result.answer).toMatch(/ohne KI-Synthese|Live-Daten/i);
  });
});
