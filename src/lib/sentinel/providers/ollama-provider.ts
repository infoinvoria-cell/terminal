import type { ChatResult, ProviderHealth, SentinelChatArgs, SentinelProvider } from "./types";
import { getSentinelEnvConfig } from "./provider-status";
import { activateLocalAgents, matchLocalAgent } from "./local-agent-registry";
import { classifyTask } from "@/lib/sentinel/routing/task-classifier";

const DEFAULT_MODEL = "llama3.2";

type OllamaTagsResponse = { models?: { name: string }[] };
type OllamaChatResponse = { message?: { content?: string } };

// Runtime cache for available models (cleared on each healthcheck)
let cachedAvailableModels: string[] = [];

function getModel(userMessage?: string): string {
  const config = getSentinelEnvConfig();
  // If a specific model is configured, always use it
  if (config.ollamaModel) return config.ollamaModel;
  // Otherwise pick the best agent for the task
  if (userMessage && cachedAvailableModels.length > 0) {
    const task = classifyTask(userMessage);
    const agents = activateLocalAgents(cachedAvailableModels);
    const agent = matchLocalAgent(task, agents);
    if (agent?.availableModel) return agent.availableModel;
  }
  // Fallback to first available or default
  return cachedAvailableModels[0] ?? DEFAULT_MODEL;
}

export const ollamaProvider: SentinelProvider = {
  id: "ollama",
  label: "Ollama",
  type: "local",
  supportsStreaming: true,

  async healthCheck(): Promise<ProviderHealth> {
    const config = getSentinelEnvConfig();
    const baseUrl = config.ollamaBaseUrl;
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Ollama ${response.status}`);
      const data = await response.json() as OllamaTagsResponse;
      const models = data.models?.map((m) => m.name) ?? [];

      // Update runtime cache for task-based model selection
      cachedAvailableModels = models;

      const primaryModel = config.ollamaModel ?? models[0] ?? DEFAULT_MODEL;
      return {
        configured: true,
        available: true,
        usable: true,
        enabled: true,
        reason: "ready",
        message: `Ollama ready — ${models.length} model${models.length !== 1 ? "s" : ""} available`,
        model: primaryModel,
        models,
        supportsStreaming: true,
      };
    } catch (error) {
      cachedAvailableModels = [];
      return {
        configured: true,
        available: false,
        usable: false,
        enabled: true,
        reason: "offline",
        message: error instanceof Error ? error.message : "Ollama offline",
        model: config.ollamaModel ?? DEFAULT_MODEL,
        models: [],
        supportsStreaming: true,
      };
    }
  },

  async sendMessage({ messages }: SentinelChatArgs): Promise<ChatResult> {
    const config = getSentinelEnvConfig();
    const lastMsg = messages.findLast(m => m.role === "user")?.content ?? "";
    const model = getModel(lastMsg);
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

  async streamMessage({ messages }: SentinelChatArgs): Promise<ReadableStream<Uint8Array>> {
    const config = getSentinelEnvConfig();
    const lastMsg = messages.findLast(m => m.role === "user")?.content ?? "";
    const model = getModel(lastMsg);
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
