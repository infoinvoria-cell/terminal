import type { ChatResult, ProviderHealth, SentinelChatArgs, SentinelProvider, SentinelProviderId } from "./types";
import { calculateOutputBudget, estimateTokens } from "./model-capabilities";
import { makeOpenAISSEStream, throwProviderHttpError } from "@/lib/sentinel/usage/streaming";

const ENDPOINT = "https://models.inference.ai.azure.com/chat/completions";
const DEFAULT_MODEL = "meta-llama-3.1-8b-instruct";

function getApiKey(): string | null {
  return process.env.GITHUB_TOKEN?.trim() || null;
}

function getModel(): string {
  return process.env.GITHUB_MODELS_MODEL?.trim() || DEFAULT_MODEL;
}

export const githubModelsProvider: SentinelProvider = {
  id: "github-models" as SentinelProviderId,
  label: "GitHub Models",
  type: "custom",
  supportsStreaming: true,

  async healthCheck(): Promise<ProviderHealth> {
    const key = getApiKey();
    const model = getModel();
    if (!key) {
      return { configured: false, available: false, usable: false, enabled: false, reason: "key_missing", message: "GITHUB_TOKEN missing", model, models: [], supportsStreaming: true };
    }

    // Only make a live probe if explicitly requested (burns rate-limited quota otherwise)
    if (process.env.GITHUB_MODELS_VERIFY_ON_STARTUP === "1") {
      try {
        const probe = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
          signal: AbortSignal.timeout(5000),
        });
        if (probe.status === 403) {
          return { configured: true, available: false, usable: false, enabled: true, reason: "not_configured", message: "GitHub token lacks Models access", model, models: [], supportsStreaming: true };
        }
        return { configured: true, available: true, usable: true, enabled: true, reason: "ready", message: "GitHub Models ready", model, models: [model], supportsStreaming: true };
      } catch {
        return { configured: true, available: false, usable: false, enabled: true, reason: "offline", message: "GitHub Models unreachable", model, models: [], supportsStreaming: true };
      }
    }

    // Key-only check — no live probe
    return { configured: true, available: true, usable: true, enabled: true, reason: "ready", message: "GitHub Models ready", model, models: [model], supportsStreaming: true };
  },

  async sendMessage({ messages, signal }: SentinelChatArgs): Promise<ChatResult> {
    const key = getApiKey();
    if (!key) throw new Error("GITHUB_TOKEN missing");
    const model = getModel();

    const inputTokens = estimateTokens(JSON.stringify(messages));
    const max_tokens = calculateOutputBudget("github-models", model, inputTokens);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throwProviderHttpError("github-models", response.status, text);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) throw new Error("GitHub Models returned empty answer");
    return { answer, model, provider: "github-models" as SentinelProviderId, tokensUsed: data.usage?.total_tokens };
  },

  async streamMessage({ messages, signal }: SentinelChatArgs): Promise<ReadableStream<Uint8Array>> {
    const key = getApiKey();
    if (!key) throw new Error("GITHUB_TOKEN missing");
    const model = getModel();

    const inputTokens = estimateTokens(JSON.stringify(messages));
    const max_tokens = calculateOutputBudget("github-models", model, inputTokens);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens, stream: true }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throwProviderHttpError("github-models", response.status, text);
    }

    return makeOpenAISSEStream(response, { providerId: "github-models", modelId: model });
  },
};
