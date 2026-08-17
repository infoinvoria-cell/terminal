import type { ChatMessage, ChatResult, ProviderHealth, SentinelChatArgs, SentinelProvider } from "./types";
import { calculateOutputBudget, estimateTokens } from "./model-capabilities";
import { recordRequest, recordHttpError } from "@/lib/sentinel/store/usage-store";
import { setLastContextUsage } from "@/lib/sentinel/store/context-store";

const DEFAULT_MODEL = "command-r-plus";
const COHERE_ENDPOINT = "https://api.cohere.com/v2/chat";

// Cohere free tier: command-r7b-12-2024 is available on free; command-r-plus is trial-limited
const FREE_MODEL = "command-r7b-12-2024";
const COHERE_CONTEXT_WINDOW = 128000;

function getApiKey(): string | null {
  return process.env.COHERE_API_KEY?.trim() || null;
}

function getModel(): string {
  return process.env.COHERE_MODEL?.trim() || FREE_MODEL;
}

function toCohereMessages(messages: ChatMessage[]): { role: string; content: string }[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
    content: m.content,
  }));
}

function throwCohereHttpError(status: number, body: string): never {
  try { recordHttpError("cohere", status); } catch { /* best-effort */ }
  if (status === 402) throw new Error("[BILLING] Cohere requires payment — blocked by free-only policy.");
  if (status === 401 || status === 403) throw new Error(`Cohere ${status}: unauthorized — check COHERE_API_KEY.`);
  if (status === 429) throw new Error("Cohere rate limited (429) — retrying with next provider.");
  throw new Error(`Cohere ${status}: ${body.slice(0, 200)}`);
}

export const cohereProvider: SentinelProvider = {
  id: "cohere",
  label: "Cohere",
  type: "custom",
  supportsStreaming: true,

  async healthCheck(): Promise<ProviderHealth> {
    const key = getApiKey();
    const model = getModel();
    if (!key) {
      return { configured: false, available: false, usable: false, enabled: false, reason: "key_missing", message: "COHERE_API_KEY missing", model, models: [], supportsStreaming: true };
    }
    return { configured: true, available: true, usable: true, enabled: true, reason: "ready", message: "Cohere ready", model, models: [model], supportsStreaming: true };
  },

  async sendMessage({ messages, signal }: SentinelChatArgs & { signal?: AbortSignal }): Promise<ChatResult> {
    const key = getApiKey();
    if (!key) throw new Error("COHERE_API_KEY missing");
    const model = getModel();
    const inputTokens = estimateTokens(JSON.stringify(messages));
    const max_tokens = calculateOutputBudget("cohere", model, inputTokens);

    let response: Response;
    try {
      response = await fetch(COHERE_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: toCohereMessages(messages), max_tokens }),
        signal,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throwCohereHttpError(response.status, text);
    }

    const data = await response.json() as {
      message?: { content?: { type: string; text: string }[] };
      usage?: { tokens?: { output_tokens?: number; input_tokens?: number } };
    };
    const content = data.message?.content;
    const answer = content?.find((c) => c.type === "text")?.text?.trim() ?? "";
    if (!answer) throw new Error("Cohere returned empty answer");

    const inTok = data.usage?.tokens?.input_tokens ?? inputTokens;
    const outTok = data.usage?.tokens?.output_tokens ?? 0;
    try {
      recordRequest({ provider: "cohere", inputTokens: inTok, outputTokens: outTok, success: true });
      setLastContextUsage({ providerId: "cohere", modelId: model, inputTokensUsed: inTok, contextWindowTokens: COHERE_CONTEXT_WINDOW, reservedOutputTokens: null, measuredAtUtc: new Date().toISOString(), status: "measured" });
    } catch { /* best-effort */ }

    return { answer, model, provider: "cohere", tokensUsed: inTok + outTok, inputTokens: inTok, outputTokens: outTok, hasRealCounts: true };
  },

  async streamMessage({ messages, signal }: SentinelChatArgs & { signal?: AbortSignal }): Promise<ReadableStream<Uint8Array>> {
    const key = getApiKey();
    if (!key) throw new Error("COHERE_API_KEY missing");
    const model = getModel();
    const inputTokens = estimateTokens(JSON.stringify(messages));
    const max_tokens = calculateOutputBudget("cohere", model, inputTokens);

    const response = await fetch(COHERE_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: toCohereMessages(messages), max_tokens, stream: true }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throwCohereHttpError(response.status, text);
    }

    const encoder = new TextEncoder();
    let usageRecorded = false;

    return new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              // Cohere v2 streaming uses SSE format: each line is prefixed with "data: "
              if (!trimmed.startsWith("data: ")) continue;
              const jsonStr = trimmed.slice(6).trim();
              if (jsonStr === "[DONE]") { controller.close(); return; }
              try {
                const json = JSON.parse(jsonStr) as {
                  type?: string;
                  delta?: { message?: { content?: { type?: string; text?: string } } };
                  usage?: { tokens?: { input_tokens?: number; output_tokens?: number } };
                };

                if (json.type === "content-delta") {
                  const text = json.delta?.message?.content?.text;
                  if (text) controller.enqueue(encoder.encode(text));
                } else if (json.type === "message-end") {
                  // usage is in the message-end event
                  if (!usageRecorded && json.usage?.tokens) {
                    usageRecorded = true;
                    const inTok = json.usage.tokens.input_tokens ?? inputTokens;
                    const outTok = json.usage.tokens.output_tokens ?? 0;
                    try {
                      recordRequest({ provider: "cohere", inputTokens: inTok, outputTokens: outTok, success: true });
                      setLastContextUsage({ providerId: "cohere", modelId: model, inputTokensUsed: inTok, contextWindowTokens: COHERE_CONTEXT_WINDOW, reservedOutputTokens: null, measuredAtUtc: new Date().toISOString(), status: "measured" });
                    } catch { /* best-effort */ }
                  }
                  controller.close();
                  return;
                } else if (json.type === "stream-end") {
                  controller.close();
                  return;
                }
              } catch { /* skip malformed */ }
            }
          }

          if (!usageRecorded) {
            try {
              setLastContextUsage({ providerId: "cohere", modelId: model, inputTokensUsed: null, contextWindowTokens: COHERE_CONTEXT_WINDOW, reservedOutputTokens: null, measuredAtUtc: new Date().toISOString(), status: "unknown" });
            } catch { /* best-effort */ }
          }

          controller.close();
        } catch (error) {
          try { recordRequest({ provider: "cohere", inputTokens: 0, outputTokens: 0, success: false }); } catch { /* best-effort */ }
          controller.error(error);
        }
      },
    });
  },
};
