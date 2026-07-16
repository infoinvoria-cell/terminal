import type { ChatResult, ProviderHealth, SentinelProvider } from "./types";
import { getSentinelEnvConfig } from "./provider-status";

const DEFAULT_MODEL = "claude-3-5-sonnet-latest";

function hasKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function getModel(): string {
  return getSentinelEnvConfig().anthropicModel ?? DEFAULT_MODEL;
}

function buildHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
    "anthropic-version": "2023-06-01",
  };
}

export const anthropicProvider: SentinelProvider = {
  id: "anthropic",
  label: "Claude",
  type: "anthropic",
  supportsStreaming: true,

  async healthCheck(): Promise<ProviderHealth> {
    if (!getSentinelEnvConfig().allowPaidApi) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "disabled",
        message: "API provider disabled",
        model: getModel(),
        models: [],
        supportsStreaming: true,
      };
    }
    const configured = hasKey();
    if (!configured) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "key_missing",
        message: "ANTHROPIC_API_KEY missing",
        model: getModel(),
        models: [],
        supportsStreaming: true,
      };
    }

    return {
      configured: true,
      available: true,
      usable: true,
      enabled: true,
      reason: "ready",
      message: "Anthropic key configured",
      model: getModel(),
      models: [getModel()],
      supportsStreaming: true,
    };
  },

  async sendMessage({ messages }): Promise<ChatResult> {
    if (!getSentinelEnvConfig().allowPaidApi) throw new Error("API provider disabled");
    if (!hasKey()) throw new Error("ANTHROPIC_API_KEY missing");
    const model = getModel();
    const systemMessages = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const userMessages = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemMessages || undefined,
        messages: userMessages,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Anthropic ${response.status}: ${details.slice(0, 200)}`);
    }

    const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const answer = (payload.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("").trim();
    if (!answer) throw new Error("Anthropic returned empty answer");
    return { answer, model, provider: "anthropic" };
  },

  async streamMessage({ messages }): Promise<ReadableStream<Uint8Array>> {
    if (!getSentinelEnvConfig().allowPaidApi) throw new Error("API provider disabled");
    if (!hasKey()) throw new Error("ANTHROPIC_API_KEY missing");
    const model = getModel();
    const systemMessages = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const userMessages = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        ...buildHeaders(),
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        stream: true,
        system: systemMessages || undefined,
        messages: userMessages,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok || !response.body) {
      const details = await response.text().catch(() => "");
      throw new Error(`Anthropic ${response.status}: ${details.slice(0, 200)}`);
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
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const eventBlock of events) {
              const dataLines = eventBlock
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim());

              for (const line of dataLines) {
                if (!line || line === "[DONE]") continue;
                try {
                  const payload = JSON.parse(line) as {
                    type?: string;
                    delta?: { text?: string };
                  };
                  const chunk = payload.type === "content_block_delta" ? payload.delta?.text ?? "" : "";
                  if (chunk) controller.enqueue(encoder.encode(chunk));
                } catch {
                  // ignore malformed SSE line
                }
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
