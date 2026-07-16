import OpenAI from "openai";
import type { ChatResult, ProviderHealth, SentinelProvider } from "./types";
import { getSentinelEnvConfig } from "./provider-status";

const MODEL_CANDIDATES = ["gpt-4.1", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo"];

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? new OpenAI({ apiKey: key }) : null;
}

async function resolveModel(client: OpenAI): Promise<{ model: string; validated: boolean; warning?: string } | null> {
  const configured = getSentinelEnvConfig().openaiModel;
  try {
    const list = await client.models.list();
    const ids = new Set(list.data.map((item) => item.id));
    if (configured) {
      if (ids.has(configured)) return { model: configured, validated: true };
      const warning = `Model "${configured}" not in OpenAI model list`;
      for (const candidate of MODEL_CANDIDATES) {
        if (ids.has(candidate)) return { model: candidate, validated: true, warning };
      }
      return { model: configured, validated: false, warning };
    }
    for (const candidate of MODEL_CANDIDATES) {
      if (ids.has(candidate)) return { model: candidate, validated: true };
    }
  } catch {
    if (configured) return { model: configured, validated: false };
    return { model: MODEL_CANDIDATES[0], validated: false };
  }
  return null;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("429")) return "OpenAI quota exhausted";
  if (message.includes("401") || message.includes("Incorrect API key")) return "OpenAI API key invalid";
  if (message.includes("model_not_found") || message.includes("does not exist")) return "OpenAI model not found";
  return message;
}

export const openaiProvider: SentinelProvider = {
  id: "openai",
  label: "OpenAI",
  type: "openai",
  supportsStreaming: false,

  async healthCheck(): Promise<ProviderHealth> {
    const config = getSentinelEnvConfig();
    if (!config.allowPaidApi) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "disabled",
        message: "API provider disabled",
        model: config.openaiModel,
        models: [],
        supportsStreaming: false,
      };
    }
    const client = getClient();
    const configuredModel = config.openaiModel;
    if (!client) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "key_missing",
        message: "OPENAI_API_KEY missing",
        model: configuredModel,
        models: [],
        supportsStreaming: false,
      };
    }

    try {
      const resolved = await resolveModel(client);
      if (!resolved) {
        return {
          configured: true,
          available: false,
          usable: false,
          enabled: true,
          reason: "error",
          message: "No OpenAI model resolved",
          model: configuredModel,
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
        message: resolved.warning ?? "OpenAI ready",
        model: resolved.model,
        models: [resolved.model],
        supportsStreaming: false,
      };
    } catch (error) {
      return {
        configured: true,
        available: false,
        usable: false,
        enabled: true,
        reason: "offline",
        message: friendlyError(error),
        model: configuredModel,
        models: [],
        supportsStreaming: false,
      };
    }
  },

  async sendMessage({ messages }): Promise<ChatResult> {
    if (!getSentinelEnvConfig().allowPaidApi) throw new Error("API provider disabled");
    const client = getClient();
    if (!client) throw new Error("OPENAI_API_KEY missing");
    const resolved = await resolveModel(client);
    if (!resolved) throw new Error("No OpenAI model resolved");

    const completion = await client.chat.completions.create({
      model: resolved.model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      max_tokens: 1024,
    });

    const answer = (completion.choices[0]?.message?.content ?? "").trim();
    if (!answer) throw new Error("OpenAI returned empty answer");
    return { answer, model: resolved.model, provider: "openai" };
  },
};
