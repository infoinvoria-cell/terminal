import type { ChatMessage, ChatResult, ProviderHealth, SentinelChatArgs, SentinelProvider, SentinelProviderId, SentinelProviderType } from "./types";
import { calculateOutputBudget, estimateTokens } from "./model-capabilities";
import { recordRequest, recordHttpError } from "@/lib/sentinel/store/usage-store";
import { setLastContextUsage } from "@/lib/sentinel/store/context-store";
import { getAllModels } from "@/lib/sentinel/catalog/model-catalog";
import { classifyTask } from "@/lib/sentinel/routing/task-classifier";

const DEFAULT_MODEL = "gemini-2.0-flash";

// Module-level model cache
let cachedGeminiModels: { id: string; contextWindow: number; outputLimit: number; vision: boolean; }[] = [];
let gCacheExpiry = 0;

function getApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function resolveContextWindow(modelId: string): number | null {
  // Check dynamic cache first
  const cached = cachedGeminiModels.find(m => m.id === modelId);
  if (cached) return cached.contextWindow;
  try {
    const m = getAllModels().find(m => m.provider === "gemini" && m.modelId === modelId)
      ?? getAllModels().find(m => m.provider === "gemini");
    return m?.limits?.contextWindow ?? null;
  } catch { return null; }
}

async function fetchGeminiModels(apiKey: string): Promise<typeof cachedGeminiModels> {
  const now = Date.now();
  if (cachedGeminiModels.length > 0 && now < gCacheExpiry) {
    return cachedGeminiModels;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) return [];

    const data = await response.json() as {
      models?: {
        name: string;
        displayName: string;
        inputTokenLimit: number;
        outputTokenLimit: number;
        supportedGenerationMethods: string[];
      }[];
    };

    const models = (data.models ?? [])
      .filter(m =>
        m.supportedGenerationMethods.includes("generateContent") &&
        /gemini/.test(m.name)
      )
      .map(m => ({
        id: m.name.replace("models/", ""),
        contextWindow: m.inputTokenLimit,
        outputLimit: m.outputTokenLimit,
        vision: m.displayName.includes("Flash") || m.displayName.includes("Pro"),
      }));

    cachedGeminiModels = models;
    gCacheExpiry = now + 6 * 60 * 60 * 1000; // 6 hours
    return models;
  } catch {
    return [];
  }
}

function selectGeminiModel(task: string, models: typeof cachedGeminiModels): string {
  const fallback = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  if (models.length === 0) return fallback;

  const classified = classifyTask(task);

  const byContext = [...models].sort((a, b) => b.contextWindow - a.contextWindow);

  if (
    classified === "long_context" ||
    classified === "brain_rag" ||
    classified === "graph_rag" ||
    classified === "summarization"
  ) {
    return byContext[0]?.id ?? fallback;
  }

  if (classified === "vision") {
    const visionByContext = byContext.filter(m => m.vision);
    return visionByContext[0]?.id ?? byContext[0]?.id ?? fallback;
  }

  if (classified === "reasoning" || classified === "financial_analysis") {
    const flash25 = models.find(m => m.id === "gemini-2.5-flash");
    if (flash25) return flash25.id;
    return byContext[0]?.id ?? fallback;
  }

  // default
  const flash20 = models.find(m => m.id === "gemini-2.0-flash");
  if (flash20) return flash20.id;
  const anyFlash = models.find(m => m.id.includes("flash"));
  return anyFlash?.id ?? fallback;
}

type GeminiPart = { text: string };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
type GeminiSystemInstruction = { parts: GeminiPart[] };

type ConvertedMessages = {
  contents: GeminiContent[];
  systemInstruction?: GeminiSystemInstruction;
};

function convertMessages(messages: ChatMessage[]): ConvertedMessages {
  let systemInstruction: GeminiSystemInstruction | undefined;
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = { parts: [{ text: msg.content }] };
    } else if (msg.role === "user") {
      contents.push({ role: "user", parts: [{ text: msg.content }] });
    } else if (msg.role === "assistant") {
      contents.push({ role: "model", parts: [{ text: msg.content }] });
    }
  }

  return { contents, systemInstruction };
}

function throwGeminiHttpError(status: number, body: string): never {
  try { recordHttpError("gemini", status); } catch { /* best-effort */ }
  if (status === 402) throw new Error("[BILLING] Gemini requires payment — blocked by free-only policy.");
  if (status === 401 || status === 403) throw new Error(`Gemini ${status}: unauthorized — check GEMINI_API_KEY.`);
  if (status === 429) throw new Error("Gemini rate limited (429) — retrying with next provider.");
  throw new Error(`Gemini ${status}: ${body.slice(0, 200)}`);
}

function getLastUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

export const geminiProvider: SentinelProvider = {
  id: "gemini" as SentinelProviderId,
  label: "Google Gemini",
  type: "custom" as SentinelProviderType,
  supportsStreaming: true,

  async healthCheck(): Promise<ProviderHealth> {
    const key = getApiKey();
    const staticModel = getModel();
    if (!key) {
      return { configured: false, available: false, usable: false, enabled: false, reason: "key_missing", message: "GEMINI_API_KEY missing", model: staticModel, models: [], supportsStreaming: true };
    }

    const models = await fetchGeminiModels(key);
    const modelIds = models.length > 0 ? models.map(m => m.id) : [staticModel];
    const largestContext = models.length > 0
      ? Math.max(...models.map(m => m.contextWindow))
      : null;
    const message = largestContext != null
      ? `Google Gemini ready — ${models.length} models, largest context ${largestContext.toLocaleString()} tokens`
      : "Google Gemini ready";
    const activeModel = models.length > 0 ? (models.find(m => m.id === staticModel)?.id ?? models[0].id) : staticModel;

    return { configured: true, available: true, usable: true, enabled: true, reason: "ready", message, model: activeModel, models: modelIds, supportsStreaming: true };
  },

  async sendMessage({ messages, signal }: SentinelChatArgs): Promise<ChatResult> {
    const key = getApiKey();
    if (!key) throw new Error("GEMINI_API_KEY missing");

    const models = await fetchGeminiModels(key);
    const lastUserMsg = getLastUserMessage(messages);
    const model = selectGeminiModel(lastUserMsg, models);

    const { contents, systemInstruction } = convertMessages(messages);

    const inputTokens = estimateTokens(JSON.stringify(messages));
    const maxOutputTokens = calculateOutputBudget("gemini", model, inputTokens);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens },
    };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throwGeminiHttpError(response.status, text);
    }

    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!answer) throw new Error("Gemini returned empty answer");

    const promptTokens = data.usageMetadata?.promptTokenCount ?? inputTokens;
    const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    try {
      recordRequest({ provider: "gemini", inputTokens: promptTokens, outputTokens: completionTokens, success: true });
      setLastContextUsage({
        providerId: "gemini",
        modelId: model,
        inputTokensUsed: promptTokens,
        contextWindowTokens: resolveContextWindow(model),
        reservedOutputTokens: null,
        measuredAtUtc: new Date().toISOString(),
        status: "measured",
      });
    } catch { /* best-effort */ }

    return { answer, model, provider: "gemini" as SentinelProviderId, tokensUsed: promptTokens + completionTokens };
  },

  async streamMessage({ messages, signal }: SentinelChatArgs): Promise<ReadableStream<Uint8Array>> {
    const key = getApiKey();
    if (!key) throw new Error("GEMINI_API_KEY missing");

    const models = await fetchGeminiModels(key);
    const lastUserMsg = getLastUserMessage(messages);
    const model = selectGeminiModel(lastUserMsg, models);

    const { contents, systemInstruction } = convertMessages(messages);

    const inputTokens = estimateTokens(JSON.stringify(messages));
    const maxOutputTokens = calculateOutputBudget("gemini", model, inputTokens);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${key}&alt=sse`;
    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens },
    };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throwGeminiHttpError(response.status, text);
    }

    const contextWindow = resolveContextWindow(model);
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
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (!raw) continue;
              try {
                const json = JSON.parse(raw) as {
                  candidates?: { content?: { parts?: { text?: string }[] } }[];
                  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
                };
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) controller.enqueue(encoder.encode(text));

                // Gemini includes usageMetadata in the last streaming chunk
                if (!usageRecorded && json.usageMetadata?.promptTokenCount != null) {
                  usageRecorded = true;
                  const promptTokens = json.usageMetadata.promptTokenCount;
                  const completionTokens = json.usageMetadata.candidatesTokenCount ?? 0;
                  try {
                    recordRequest({ provider: "gemini", inputTokens: promptTokens, outputTokens: completionTokens, success: true });
                    setLastContextUsage({
                      providerId: "gemini",
                      modelId: model,
                      inputTokensUsed: promptTokens,
                      contextWindowTokens: contextWindow,
                      reservedOutputTokens: null,
                      measuredAtUtc: new Date().toISOString(),
                      status: "measured",
                    });
                  } catch { /* best-effort */ }
                }
              } catch { /* skip malformed */ }
            }
          }

          if (!usageRecorded) {
            try {
              setLastContextUsage({ providerId: "gemini", modelId: model, inputTokensUsed: null, contextWindowTokens: contextWindow, reservedOutputTokens: null, measuredAtUtc: new Date().toISOString(), status: "unknown" });
            } catch { /* best-effort */ }
          }

          controller.close();
        } catch (error) {
          try { recordRequest({ provider: "gemini", inputTokens: 0, outputTokens: 0, success: false }); } catch { /* best-effort */ }
          controller.error(error);
        }
      },
    });
  },
};
