import type {
  ChatResult,
  ProviderHealth,
  SentinelChatArgs,
  SentinelProvider,
  SentinelProviderId,
} from "./types";
import { recordRequest, recordHttpError } from "@/lib/sentinel/store/usage-store";
import { setLastContextUsage } from "@/lib/sentinel/store/context-store";

const DEFAULT_MODEL = "meta-llama/Meta-Llama-3-8B-Instruct";

function getApiToken(): string | null {
  return process.env.HF_TOKEN?.trim() || null;
}

function getModel(): string {
  return process.env.HF_MODEL?.trim() || DEFAULT_MODEL;
}

function buildEndpoint(model: string): string {
  return `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;
}

export const huggingfaceProvider: SentinelProvider = {
  id: "huggingface" as SentinelProviderId,
  label: "HuggingFace",
  type: "custom",
  supportsStreaming: false,

  async healthCheck(): Promise<ProviderHealth> {
    const token = getApiToken();
    const model = getModel();
    if (!token) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "key_missing",
        message: "HF_TOKEN missing",
        model,
        models: [],
        supportsStreaming: false,
      };
    }
    return {
      configured: true,
      available: true,
      usable: true,
      enabled: true,
      reason: "ready",
      message: "HuggingFace ready",
      model,
      models: [model],
      supportsStreaming: false,
    };
  },

  async sendMessage({ messages, signal }: SentinelChatArgs): Promise<ChatResult> {
    const token = getApiToken();
    if (!token) throw new Error("HF_TOKEN missing");
    const model = getModel();
    const endpoint = buildEndpoint(model);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, max_tokens: 2048 }),
        signal,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`HuggingFace fetch error: ${msg}`);
    }

    // Block any billing / paid-usage response immediately
    if (response.status === 402) {
      recordHttpError("huggingface", response.status);
      throw new Error("HF billing required — paid usage blocked");
    }

    if (!response.ok) {
      recordHttpError("huggingface", response.status);
      const text = await response.text().catch(() => response.statusText);
      if (text.includes("billing") || text.includes("pay")) {
        throw new Error("HF billing required — paid usage blocked");
      }
      throw new Error(`HuggingFace ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
    };

    // Check for billing signals in the parsed body
    const rawText = JSON.stringify(data);
    if (rawText.includes("billing") || rawText.includes("pay")) {
      throw new Error("HF billing required — paid usage blocked");
    }

    const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) throw new Error("HuggingFace returned empty answer");

    const tokensUsed = data.usage?.total_tokens ?? 0;

    if (tokensUsed > 0) {
      recordRequest({
        provider: "huggingface",
        inputTokens: data.usage?.prompt_tokens ?? tokensUsed,
        outputTokens: data.usage?.completion_tokens ?? 0,
        success: true,
      });
      setLastContextUsage({
        providerId: "huggingface",
        modelId: model,
        inputTokensUsed: data.usage?.prompt_tokens ?? tokensUsed,
        contextWindowTokens: 8192,
        reservedOutputTokens: null,
        measuredAtUtc: new Date().toISOString(),
        status: tokensUsed ? "measured" : "estimated",
      });
    }

    return {
      answer,
      model,
      provider: "huggingface" as SentinelProviderId,
      tokensUsed: data.usage?.total_tokens,
    };
  },
};
