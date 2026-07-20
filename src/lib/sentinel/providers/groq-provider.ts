import type { ChatResult, ProviderHealth, SentinelProvider } from "./types";
import { getSentinelEnvConfig } from "./provider-status";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

function getApiKey(): string | null {
  return process.env.GROQ_API_KEY?.trim() || null;
}

function friendlyError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("401")) return "GROQ_API_KEY invalid";
  if (msg.includes("429")) return "Groq quota exhausted";
  if (msg.includes("404")) return "Groq model not found";
  return msg;
}

export const groqProvider: SentinelProvider = {
  id: "groq",
  label: "Groq",
  type: "custom",
  supportsStreaming: false,

  async healthCheck(): Promise<ProviderHealth> {
    const key = getApiKey();
    const model = getSentinelEnvConfig().groqModel ?? DEFAULT_MODEL;
    if (!key) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "key_missing",
        message: "GROQ_API_KEY missing",
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
      message: "Groq ready",
      model,
      models: [model],
      supportsStreaming: false,
    };
  },

  async sendMessage({ messages }): Promise<ChatResult> {
    const key = getApiKey();
    if (!key) throw new Error("GROQ_API_KEY missing");
    const model = getSentinelEnvConfig().groqModel ?? DEFAULT_MODEL;

    let response: Response;
    try {
      response = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, max_tokens: 1024 }),
      });
    } catch (error) {
      throw new Error(friendlyError(error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`Groq ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) throw new Error("Groq returned empty answer");
    return { answer, model, provider: "groq", tokensUsed: data.usage?.total_tokens };
  },
};
