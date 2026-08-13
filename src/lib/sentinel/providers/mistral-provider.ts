import type { ChatResult, ProviderHealth, SentinelChatArgs, SentinelProvider } from "./types";
import { calculateOutputBudget, estimateTokens } from "./model-capabilities";
import { makeOpenAISSEStream, throwProviderHttpError } from "@/lib/sentinel/usage/streaming";

const DEFAULT_MODEL = "mistral-small-latest";
const MISTRAL_ENDPOINT = "https://api.mistral.ai/v1/chat/completions";

function getApiKey(): string | null {
  return process.env.MISTRAL_API_KEY?.trim() || null;
}

export const mistralProvider: SentinelProvider = {
  id: "mistral",
  label: "Mistral",
  type: "custom",
  supportsStreaming: true,

  async healthCheck(): Promise<ProviderHealth> {
    const key = getApiKey();
    const model = process.env.MISTRAL_MODEL?.trim() || DEFAULT_MODEL;
    if (!key) {
      return { configured: false, available: false, usable: false, enabled: false, reason: "key_missing", message: "MISTRAL_API_KEY missing", model, models: [], supportsStreaming: true };
    }
    return { configured: true, available: true, usable: true, enabled: true, reason: "ready", message: "Mistral ready", model, models: [model], supportsStreaming: true };
  },

  async sendMessage({ messages, signal }: SentinelChatArgs & { signal?: AbortSignal }): Promise<ChatResult> {
    const key = getApiKey();
    if (!key) throw new Error("MISTRAL_API_KEY missing");
    const model = process.env.MISTRAL_MODEL?.trim() || DEFAULT_MODEL;
    const inputTokens = estimateTokens(JSON.stringify(messages));
    const max_tokens = calculateOutputBudget("mistral", model, inputTokens);

    let response: Response;
    try {
      response = await fetch(MISTRAL_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, max_tokens }),
        signal,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throwProviderHttpError("mistral", response.status, text);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) throw new Error("Mistral returned empty answer");
    return { answer, model, provider: "mistral", tokensUsed: data.usage?.total_tokens };
  },

  async streamMessage({ messages, signal }: SentinelChatArgs & { signal?: AbortSignal }): Promise<ReadableStream<Uint8Array>> {
    const key = getApiKey();
    if (!key) throw new Error("MISTRAL_API_KEY missing");
    const model = process.env.MISTRAL_MODEL?.trim() || DEFAULT_MODEL;
    const inputTokens = estimateTokens(JSON.stringify(messages));
    const max_tokens = calculateOutputBudget("mistral", model, inputTokens);

    const response = await fetch(MISTRAL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens, stream: true }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`Mistral stream ${response.status}: ${text}`);
    }

    return makeOpenAISSEStream(response, { providerId: "mistral", modelId: model });
  },
};
