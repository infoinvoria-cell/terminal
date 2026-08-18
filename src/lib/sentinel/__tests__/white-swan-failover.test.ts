/**
 * WHITE SWAN TOOL RESULT SURVIVES PROVIDER FAILOVER
 *
 * Uses REAL connectChat() + REAL ask()/scoreProvider — only the individual
 * provider transport modules (groq/mistral) are mocked, so this exercises
 * the actual failover path (not a mocked ask()). Confirms the White Swan
 * tool-injected context reaches whichever provider actually serves the
 * request, Groq or its fallback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/sentinel/providers/groq-provider", () => ({
  groqProvider: {
    id: "groq", label: "Groq", type: "custom", supportsStreaming: true,
    healthCheck: vi.fn(() => Promise.resolve({
      configured: true, available: true, usable: true, enabled: true,
      reason: "ready", message: "ready",
      model: "llama-3.3-70b-versatile", models: ["llama-3.3-70b-versatile"],
      supportsStreaming: true,
    })),
    sendMessage: vi.fn(() => Promise.reject(new Error("groq 429: rate limited"))),
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
    // Echo back the received messages so the test can inspect exactly what
    // Mistral (the failover target) actually received.
    sendMessage: vi.fn(async (args: { messages: { role: string; content: string }[] }) => ({
      answer: JSON.stringify(args.messages),
      model: "mistral-small-latest",
      provider: "mistral",
      tokensUsed: 10,
    })),
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
vi.mock("@/lib/sentinel/providers/local-provider", () => ({ localProvider: disabledProvider("local") }));
vi.mock("@/lib/sentinel/providers/ollama-provider", () => ({ ollamaProvider: disabledProvider("ollama") }));

vi.mock("@/lib/sentinel/graphify-retrieval", () => ({
  getGraphContext: vi.fn(() => "Keine Treffer"),
}));

// Force deterministic single-provider routing (not ensemble) so this test
// exercises the real ask()/scoreProvider failover chain directly.
vi.mock("@/lib/sentinel/connect/local-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sentinel/connect/local-router")>();
  return {
    ...actual,
    routeLocally: vi.fn(async () => ({
      suggestedMode: "SINGLE_BEST" as const,
      requiresBrain: false,
      requiresGraphify: false,
      requiresTools: false,
      complexity: "low" as const,
      parallelism: 1,
    })),
  };
});

import { connectChat } from "@/lib/sentinel/connect/connect-router";
import { groqProvider } from "@/lib/sentinel/providers/groq-provider";
import { mistralProvider } from "@/lib/sentinel/providers/mistral-provider";

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

describe("White Swan tool result survives provider failover", () => {
  it("Groq unavailable, Mistral takes over — tool data still reaches the answering provider", async () => {
    vi.mocked(groqProvider.sendMessage).mockRejectedValue(new Error("groq 429: rate limited"));
    vi.mocked(mistralProvider.sendMessage).mockImplementation(async (args) => ({
      answer: JSON.stringify(args.messages),
      model: "mistral-small-latest",
      provider: "mistral",
      tokensUsed: 10,
    }));

    const result = await connectChat({
      messages: [{ role: "user", content: "What is White Swan €15k MaxDD?" }],
    });

    expect(result.toolUsed).toBe("get_white_swan_risk_modes");
    expect(result.provider).toBe("mistral");
    expect(result.fallbackUsed).toBe(true);

    const sentMessages = JSON.parse(result.answer) as { role: string; content: string }[];
    const userMsg = sentMessages.findLast((m) => m.role === "user");
    expect(userMsg?.content).toMatch(/20\.17/);
    expect(userMsg?.content).not.toMatch(/-?4\.66/);
  });

  it("Groq available — no unnecessary failover, tool data still injected", async () => {
    vi.mocked(groqProvider.sendMessage).mockImplementation(async (args) => ({
      answer: JSON.stringify(args.messages),
      model: "llama-3.3-70b-versatile",
      provider: "groq",
      tokensUsed: 10,
    }));

    const result = await connectChat({
      messages: [{ role: "user", content: "What is White Swan €15k MaxDD?" }],
    });

    expect(result.toolUsed).toBe("get_white_swan_risk_modes");
    expect(result.provider).toBe("groq");
    expect(result.fallbackUsed).toBe(false);

    const sentMessages = JSON.parse(result.answer) as { role: string; content: string }[];
    const userMsg = sentMessages.findLast((m) => m.role === "user");
    expect(userMsg?.content).toMatch(/20\.17/);
  });
});
