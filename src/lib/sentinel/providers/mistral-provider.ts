import type { ChatResult, ProviderHealth, SentinelProvider } from "./types";

const DEFAULT_MODEL = "mistral-small-latest";
const MISTRAL_ENDPOINT = "https://api.mistral.ai/v1/chat/completions";

function getApiKey(): string | null {
  return process.env.MISTRAL_API_KEY?.trim() || null;
}

export const mistralProvider: SentinelProvider = {
  id: "mistral",
  label: "Mistral",
  type: "custom",
  supportsStreaming: false,

  async healthCheck(): Promise<ProviderHealth> {
    const key = getApiKey();
    const model = process.env.MISTRAL_MODEL?.trim() || DEFAULT_MODEL;
    if (!key) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "key_missing",
        message: "MISTRAL_API_KEY missing",
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
      message: "Mistral ready",
      model,
      models: [model],
      supportsStreaming: false,
    };
  },

  async sendMessage({ messages }): Promise<ChatResult> {
    const key = getApiKey();
    if (!key) throw new Error("MISTRAL_API_KEY missing");
    const model = process.env.MISTRAL_MODEL?.trim() || DEFAULT_MODEL;

    let response: Response;
    try {
      response = await fetch(MISTRAL_ENDPOINT, {
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
      throw new Error(`Mistral ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) throw new Error("Mistral returned empty answer");
    return { answer, model, provider: "mistral", tokensUsed: data.usage?.total_tokens };
  },
};
