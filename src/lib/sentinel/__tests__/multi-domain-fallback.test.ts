/**
 * ALL-PROVIDERS-DOWN — deterministic fallback for Core Invest and
 * Physical Intelligence, same mechanism as White Swan's Slice 3 fallback.
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
vi.mock("@/lib/sentinel/graphify-retrieval", () => ({ getGraphContext: vi.fn(() => "Keine Treffer") }));
vi.mock("@/lib/sentinel/connect/local-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sentinel/connect/local-router")>();
  return {
    ...actual,
    routeLocally: vi.fn(async () => ({
      suggestedMode: "SINGLE_BEST" as const, requiresBrain: false, requiresGraphify: false,
      requiresTools: false, complexity: "low" as const, parallelism: 1,
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

describe("All providers down — Core Invest deterministic fallback", () => {
  it("Core Invest MaxDD question still returns real figures with zero LLM calls succeeding", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "What is Core Invest's current MaxDD at €10k?" }] });
    expect(result.fallbackUsed).toBe(true);
    expect(result.toolUsed).toBe("get_core_invest_metrics");
    expect(result.answer).toMatch(/33\.21|MaxDD/);
    expect(result.answer).not.toBe("Sentinel Connect: Kein Provider verfügbar. Bitte prüfe Netzwerk und API-Keys.");
  });

  it("live-readiness question still honestly reports RESEARCH_ONLY / NO via deterministic fallback", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Is Core Invest live ready?" }] });
    expect(result.fallbackUsed).toBe(true);
    expect(result.answer).toMatch(/RESEARCH_ONLY/);
    expect(result.answer).toMatch(/\*\*NO\*\*|NO/);
  });
});

describe("All providers down — Physical Intelligence deterministic fallback", () => {
  it("Corn question still returns real observation data with zero LLM calls succeeding", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "What is the current Corn physical state?" }] });
    expect(result.fallbackUsed).toBe(true);
    expect(result.toolUsed).toBe("get_physical_intelligence");
    expect(result.answer).toMatch(/USDA|NOAA/);
    expect(result.answer).toMatch(/NONE/); // trading impact
  });

  it("Crude question still honestly reports UNAVAILABLE via deterministic fallback", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Is Crude validated?" }] });
    expect(result.fallbackUsed).toBe(true);
    expect(result.answer).toMatch(/n\/a|UNAVAILABLE/);
  });
});

describe("All providers down — complex synthesis stays honest, no fabrication", () => {
  it("a non-tool-backed cross-domain reasoning question gets the honest unavailable message", async () => {
    const result = await connectChat({ messages: [{ role: "user", content: "Give me a deep multi-factor risk analysis synthesizing everything you know." }] });
    expect(result.toolUsed).toBeNull();
    expect(result.answer).toBe("Sentinel Connect: Kein Provider verfügbar. Bitte prüfe Netzwerk und API-Keys.");
  });
});
