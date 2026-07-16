import { ensureOllamaRunning } from "@/lib/ollama/ensure-ollama";
import { classifyMessage, getAvailableModels, selectModel } from "@/lib/sentinel/model-registry";
import { getSentinelEnvConfig } from "./provider-status";
import type { ChatResult, ProviderHealth, SentinelChatArgs, SentinelProvider } from "./types";

async function resolveLocalModel(category?: SentinelChatArgs["category"]): Promise<string> {
  const config = getSentinelEnvConfig();
  if (config.ollamaModel) return config.ollamaModel;
  const inferredCategory = category ?? "general";
  const selected = await selectModel(inferredCategory);
  return selected.model;
}

export const localProvider: SentinelProvider = {
  id: "local",
  label: "Local",
  type: "local",
  supportsStreaming: true,

  async healthCheck(): Promise<ProviderHealth> {
    const config = getSentinelEnvConfig();
    try {
      const models = await getAvailableModels();
      const chatModels = models.filter((model) => model.capabilities.includes("completion")).map((model) => model.name);
      return {
        configured: true,
        available: chatModels.length > 0,
        usable: chatModels.length > 0,
        enabled: true,
        reason: chatModels.length > 0 ? "ready" : "offline",
        message: chatModels.length > 0 ? "Ollama reachable" : "No local completion model available",
        model: config.ollamaModel ?? chatModels[0] ?? null,
        models: chatModels,
        supportsStreaming: true,
      };
    } catch (error) {
      return {
        configured: true,
        available: false,
        usable: false,
        enabled: true,
        reason: "offline",
        message: error instanceof Error ? error.message : String(error),
        model: config.ollamaModel,
        models: [],
        supportsStreaming: true,
      };
    }
  },

  async sendMessage({ messages, category }): Promise<ChatResult> {
    const config = getSentinelEnvConfig();
    const ensure = await ensureOllamaRunning();
    if (!ensure.ok) {
      throw new Error(`Ollama offline: ${ensure.detail}`);
    }

    const inferredCategory = category ?? classifyMessage(messages.findLast((message) => message.role === "user")?.content ?? "");
    const model = await resolveLocalModel(inferredCategory);
    const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        think: config.ollamaThink,
        options: { num_predict: 1024 },
      }),
      signal: AbortSignal.timeout(150_000),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Ollama /api/chat ${response.status}: ${details.slice(0, 200)}`);
    }

    const payload = await response.json() as { message?: { content?: string } };
    const answer = (payload.message?.content ?? "").trim();
    if (!answer) throw new Error("Ollama returned empty answer");
    return { answer, model, provider: "local" };
  },

  async streamMessage({ messages, category }): Promise<ReadableStream<Uint8Array>> {
    const config = getSentinelEnvConfig();
    const ensure = await ensureOllamaRunning();
    if (!ensure.ok) {
      throw new Error(`Ollama offline: ${ensure.detail}`);
    }

    const inferredCategory = category ?? classifyMessage(messages.findLast((message) => message.role === "user")?.content ?? "");
    const model = await resolveLocalModel(inferredCategory);
    const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        think: config.ollamaThink,
        options: { num_predict: 1024 },
      }),
      signal: AbortSignal.timeout(150_000),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Ollama /api/chat ${response.status}: ${details.slice(0, 200)}`);
    }

    if (!response.body) {
      const fallback = await this.sendMessage({ messages, category });
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(fallback.answer));
          controller.close();
        },
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    return new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const payload = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
                const chunk = payload.message?.content ?? "";
                if (chunk) controller.enqueue(encoder.encode(chunk));
                if (payload.done) {
                  controller.close();
                  return;
                }
              } catch {
                // ignore malformed NDJSON
              }
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
      cancel() {
        reader.cancel().catch(() => undefined);
      },
    });
  },
};
