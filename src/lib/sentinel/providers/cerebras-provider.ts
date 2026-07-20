import type { ChatResult, ProviderHealth, SentinelProvider } from "./types";

const DEFAULT_MODEL = "llama-3.3-70b";
const CEREBRAS_ENDPOINT = "https://api.cerebras.ai/v1/chat/completions";

function getApiKey(): string | null {
  return process.env.CEREBRAS_API_KEY?.trim() || null;
}

export const cerebrasProvider: SentinelProvider = {
  id: "cerebras",
  label: "Cerebras",
  type: "custom",
  supportsStreaming: false,

  async healthCheck(): Promise<ProviderHealth> {
    const key = getApiKey();
    const model = process.env.CEREBRAS_MODEL?.trim() || DEFAULT_MODEL;
    if (!key) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "key_missing",
        message: "CEREBRAS_API_KEY missing",
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
      message: "Cerebras ready",
      model,
      models: [model],
      supportsStreaming: false,
    };
  },

  async sendMessage({ messages }): Promise<ChatResult> {
    const key = getApiKey();
    if (!key) throw new Error("CEREBRAS_API_KEY missing");
    const model = process.env.CEREBRAS_MODEL?.trim() || DEFAULT_MODEL;

    let response: Response;
    try {
      response = await fetch(CEREBRAS_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, max_tokens: 1024 }),
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`Cerebras ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) throw new Error("Cerebras returned empty answer");
    return { answer, model, provider: "cerebras", tokensUsed: data.usage?.total_tokens };
  },
};
