import type { ChatResult, ProviderHealth, SentinelChatArgs, SentinelProvider } from "./types";
import { calculateOutputBudget, estimateTokens } from "./model-capabilities";
import { getSentinelEnvConfig } from "./provider-status";
import { makeOpenAISSEStream, throwProviderHttpError } from "@/lib/sentinel/usage/streaming";
import { classifyTask } from "@/lib/sentinel/routing/task-classifier";

// Groq model lineup 2025: groq/compound (openai/gpt-oss-120b, 8K TPM), groq/compound-mini, openai/gpt-oss-20b
// Context budget trimmer in ensemble.ts trims to 8K window before calling this provider.
const DEFAULT_MODEL = "groq/compound";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_ENDPOINT = "https://api.groq.com/openai/v1/models";

// Runtime model cache
let cachedGroqModels: string[] = [];
let cacheExpiry = 0;

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

async function fetchGroqModels(apiKey: string): Promise<string[]> {
  if (Date.now() < cacheExpiry && cachedGroqModels.length > 0) {
    return cachedGroqModels;
  }
  try {
    const response = await fetch(GROQ_MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const data = await response.json() as { data?: { id: string }[] };
    const models = (data.data ?? []).map((m) => m.id);
    cachedGroqModels = models;
    cacheExpiry = Date.now() + 6 * 3600_000;
    return models;
  } catch {
    return [];
  }
}

function selectGroqModel(task: string, availableModels: string[]): string {
  const sentinelTask = classifyTask(task);
  const envModel = getSentinelEnvConfig().groqModel;

  function findModel(...preferences: string[]): string | null {
    for (const pref of preferences) {
      const match = availableModels.find(
        (m) => m === pref || m.startsWith(pref)
      );
      if (match) return match;
    }
    return null;
  }

  let selected: string | null = null;

  // Context budget trimming happens in ensemble.ts before this provider is called.
  // All compound models share 8K TPM limit — trimmer ensures messages fit.
  switch (sentinelTask) {
    case "simple_dashboard_lookup":
    case "simple_chat":
      selected = findModel("groq/compound-mini", "openai/gpt-oss-20b", "groq/compound");
      break;
    case "coding":
    case "code_review":
    case "structured_output":
      selected = findModel("qwen/qwen3.6-27b", "openai/gpt-oss-120b", "groq/compound");
      break;
    case "reasoning":
    case "financial_analysis":
      selected = findModel("openai/gpt-oss-120b", "qwen/qwen3.6-27b", "groq/compound");
      break;
    case "long_context":
    case "summarization":
    case "brain_rag":
      selected = findModel("openai/gpt-oss-120b", "groq/compound", "openai/gpt-oss-20b");
      break;
    default:
      selected = findModel("groq/compound", "openai/gpt-oss-20b");
      break;
  }

  return selected ?? envModel ?? DEFAULT_MODEL;
}

export const groqProvider: SentinelProvider = {
  id: "groq",
  label: "Groq",
  type: "custom",
  supportsStreaming: true,

  async healthCheck(): Promise<ProviderHealth> {
    const key = getApiKey();
    const configuredModel = getSentinelEnvConfig().groqModel ?? DEFAULT_MODEL;
    if (!key) {
      return { configured: false, available: false, usable: false, enabled: false, reason: "key_missing", message: "GROQ_API_KEY missing", model: configuredModel, models: [], supportsStreaming: true };
    }
    cachedGroqModels = await fetchGroqModels(key);
    const models = cachedGroqModels.length > 0 ? cachedGroqModels : [configuredModel];
    return { configured: true, available: true, usable: true, enabled: true, reason: "ready", message: "Groq ready", model: configuredModel, models, supportsStreaming: true };
  },

  async sendMessage({ messages, signal }: SentinelChatArgs & { signal?: AbortSignal }): Promise<ChatResult> {
    const key = getApiKey();
    if (!key) throw new Error("GROQ_API_KEY missing");

    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const model = cachedGroqModels.length > 0
      ? selectGroqModel(typeof lastUserMsg === "string" ? lastUserMsg : JSON.stringify(lastUserMsg), cachedGroqModels)
      : (getSentinelEnvConfig().groqModel ?? DEFAULT_MODEL);

    const inputTokens = estimateTokens(JSON.stringify(messages));
    const max_tokens = calculateOutputBudget("groq", model, inputTokens);

    let response: Response;
    try {
      response = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, max_tokens }),
        signal,
      });
    } catch (error) {
      throw new Error(friendlyError(error));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throwProviderHttpError("groq", response.status, text);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
    };
    const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) throw new Error("Groq returned empty answer");
    const inTok = data.usage?.prompt_tokens;
    const outTok = data.usage?.completion_tokens;
    const hasRealCounts = inTok !== undefined && outTok !== undefined;
    return { answer, model, provider: "groq", tokensUsed: data.usage?.total_tokens, ...(hasRealCounts ? { inputTokens: inTok, outputTokens: outTok, hasRealCounts: true } : {}) };
  },

  async streamMessage({ messages, signal }: SentinelChatArgs & { signal?: AbortSignal }): Promise<ReadableStream<Uint8Array>> {
    const key = getApiKey();
    if (!key) throw new Error("GROQ_API_KEY missing");

    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const model = cachedGroqModels.length > 0
      ? selectGroqModel(typeof lastUserMsg === "string" ? lastUserMsg : JSON.stringify(lastUserMsg), cachedGroqModels)
      : (getSentinelEnvConfig().groqModel ?? DEFAULT_MODEL);

    const inputTokens = estimateTokens(JSON.stringify(messages));
    const max_tokens = calculateOutputBudget("groq", model, inputTokens);

    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens, stream: true }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throwProviderHttpError("groq", response.status, text);
    }

    return makeOpenAISSEStream(response, { providerId: "groq", modelId: model });
  },
};
