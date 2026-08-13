import type { ChatResult, ProviderHealth, SentinelChatArgs, SentinelProvider, SentinelProviderId, SentinelProviderType } from "./types";
import { calculateOutputBudget, estimateTokens } from "./model-capabilities";
import { makeOpenAISSEStream, throwProviderHttpError } from "@/lib/sentinel/usage/streaming";

const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

function getApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

function getModel(): string {
  let model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  if (!model.endsWith(":free")) model = model + ":free";
  return model;
}

function friendlyError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("401")) return "OPENROUTER_API_KEY invalid";
  if (msg.includes("429")) return "OpenRouter quota exhausted";
  if (msg.includes("404")) return "OpenRouter model not found";
  return msg;
}

export const openrouterProvider: SentinelProvider = {
  id: "openrouter" as SentinelProviderId,
  label: "OpenRouter",
  type: "custom" as SentinelProviderType,
  supportsStreaming: true,

  async healthCheck(): Promise<ProviderHealth> {
    const key = getApiKey();
    const model = getModel();
    if (!key) {
      return { configured: false, available: false, usable: false, enabled: false, reason: "key_missing", message: "OPENROUTER_API_KEY missing", model, models: [], supportsStreaming: true };
    }
    return { configured: true, available: true, usable: true, enabled: true, reason: "ready", message: "OpenRouter ready", model, models: [model], supportsStreaming: true };
  },

  async sendMessage({ messages, signal }: SentinelChatArgs): Promise<ChatResult> {
    const key = getApiKey();
    if (!key) throw new Error("OPENROUTER_API_KEY missing");
    const model = getModel();

    const inputTokens = estimateTokens(JSON.stringify(messages));
    const max_tokens = calculateOutputBudget("openrouter", model, inputTokens);
    let response: Response;
    try {
      response = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://capitalife.app",
          "X-Title": "Capitalife Terminal",
        },
        body: JSON.stringify({ model, messages, max_tokens }),
        signal,
      });
    } catch (error) {
      throw new Error(friendlyError(error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throwProviderHttpError("openrouter", response.status, text);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) throw new Error("OpenRouter returned empty answer");
    return { answer, model, provider: "openrouter" as SentinelProviderId, tokensUsed: data.usage?.total_tokens };
  },

  async streamMessage({ messages, signal }: SentinelChatArgs): Promise<ReadableStream<Uint8Array>> {
    const key = getApiKey();
    if (!key) throw new Error("OPENROUTER_API_KEY missing");
    const model = getModel();

    const inputTokens = estimateTokens(JSON.stringify(messages));
    const max_tokens = calculateOutputBudget("openrouter", model, inputTokens);
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://capitalife.app",
        "X-Title": "Capitalife Terminal",
      },
      body: JSON.stringify({ model, messages, max_tokens, stream: true }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throwProviderHttpError("openrouter", response.status, text);
    }

    return makeOpenAISSEStream(response, { providerId: "openrouter", modelId: model });
  },
};
