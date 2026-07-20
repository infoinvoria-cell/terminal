import type { ChatResult, ProviderHealth, SentinelProvider } from "./types";
import { getSentinelEnvConfig } from "./provider-status";

const DEFAULT_MODEL = "llama3.2";

type OllamaTagsResponse = { models?: { name: string }[] };
type OllamaChatResponse = { message?: { content?: string } };

export const ollamaProvider: SentinelProvider = {
  id: "ollama",
  label: "Ollama",
  type: "local",
  supportsStreaming: true,

  async healthCheck(): Promise<ProviderHealth> {
    const config = getSentinelEnvConfig();
    const model = config.ollamaModel ?? DEFAULT_MODEL;
    const baseUrl = config.ollamaBaseUrl;
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Ollama ${response.status}`);
      const data = await response.json() as OllamaTagsResponse;
      const models = data.models?.map((m) => m.name) ?? [];
      return {
        configured: true,
        available: true,
        usable: true,
        enabled: true,
        reason: "ready",
        message: "Ollama ready",
        model,
        models,
        supportsStreaming: true,
      };
    } catch (error) {
      return {
        configured: true,
        available: false,
        usable: false,
        enabled: true,
        reason: "offline",
        message: error instanceof Error ? error.message : "Ollama offline",
        model,
        models: [],
        supportsStreaming: true,
      };
    }
  },

  async sendMessage({ messages }): Promise<ChatResult> {
    const config = getSentinelEnvConfig();
    const model = config.ollamaModel ?? DEFAULT_MODEL;
    const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}`);
    const data = await response.json() as OllamaChatResponse;
    const answer = data.message?.content?.trim() ?? "";
    if (!answer) throw new Error("Ollama returned empty answer");
    return { answer, model, provider: "ollama" };
  },

  async streamMessage({ messages }): Promise<ReadableStream<Uint8Array>> {
    const config = getSentinelEnvConfig();
    const model = config.ollamaModel ?? DEFAULT_MODEL;
    const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
    });
    if (!response.ok) throw new Error(`Ollama stream ${response.status}`);
    if (!response.body) throw new Error("No response body");
    return response.body;
  },
};
