import type { ChatMessage, ChatResult, ProviderHealth, SentinelProvider } from "./types";

const DEFAULT_MODEL = "command-r-plus";
const COHERE_ENDPOINT = "https://api.cohere.com/v2/chat";

function getApiKey(): string | null {
  return process.env.COHERE_API_KEY?.trim() || null;
}

function toCohereMessages(messages: ChatMessage[]): { role: string; content: string }[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
    content: m.content,
  }));
}

export const cohereProvider: SentinelProvider = {
  id: "cohere",
  label: "Cohere",
  type: "custom",
  supportsStreaming: false,

  async healthCheck(): Promise<ProviderHealth> {
    const key = getApiKey();
    const model = process.env.COHERE_MODEL?.trim() || DEFAULT_MODEL;
    if (!key) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "key_missing",
        message: "COHERE_API_KEY missing",
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
      message: "Cohere ready",
      model,
      models: [model],
      supportsStreaming: false,
    };
  },

  async sendMessage({ messages }): Promise<ChatResult> {
    const key = getApiKey();
    if (!key) throw new Error("COHERE_API_KEY missing");
    const model = process.env.COHERE_MODEL?.trim() || DEFAULT_MODEL;

    let response: Response;
    try {
      response = await fetch(COHERE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: toCohereMessages(messages),
          max_tokens: 1024,
        }),
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`Cohere ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      message?: { content?: { type: string; text: string }[] };
      usage?: { tokens?: { output_tokens?: number; input_tokens?: number } };
    };
    const content = data.message?.content;
    const answer = content?.find((c) => c.type === "text")?.text?.trim() ?? "";
    if (!answer) throw new Error("Cohere returned empty answer");
    const tokens = (data.usage?.tokens?.input_tokens ?? 0) + (data.usage?.tokens?.output_tokens ?? 0);
    return { answer, model, provider: "cohere", tokensUsed: tokens || undefined };
  },
};
