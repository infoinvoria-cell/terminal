import type { ChatResult, ProviderHealth, SentinelProvider } from "./types";
import { getSentinelEnvConfig } from "./provider-status";

function hasKey(): boolean {
  return Boolean(process.env.CUSTOM_CHAT_API_KEY?.trim());
}

export const customProvider: SentinelProvider = {
  id: "custom",
  label: "Custom",
  type: "custom",
  supportsStreaming: false,

  async healthCheck(): Promise<ProviderHealth> {
    const config = getSentinelEnvConfig();
    if (!config.allowCustomApi) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "disabled",
        message: "Custom API disabled",
        model: config.customModel,
        models: [],
        supportsStreaming: false,
      };
    }
    if (!config.customApiUrl) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "endpoint_missing",
        message: "CUSTOM_CHAT_API_URL missing",
        model: config.customModel,
        models: [],
        supportsStreaming: false,
      };
    }

    if (!hasKey()) {
      return {
        configured: true,
        available: false,
        usable: false,
        enabled: false,
        reason: "key_missing",
        message: "CUSTOM_CHAT_API_KEY missing",
        model: config.customModel,
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
      message: "Custom chat endpoint configured",
      model: config.customModel,
      models: config.customModel ? [config.customModel] : [],
      supportsStreaming: false,
    };
  },

  async sendMessage({ messages }): Promise<ChatResult> {
    const config = getSentinelEnvConfig();
    if (!config.allowCustomApi) throw new Error("Custom API disabled");
    if (!config.customApiUrl) throw new Error("CUSTOM_CHAT_API_URL missing");
    if (!hasKey()) throw new Error("CUSTOM_CHAT_API_KEY missing");

    const response = await fetch(config.customApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CUSTOM_CHAT_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model: config.customModel,
        messages,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Custom provider ${response.status}: ${details.slice(0, 200)}`);
    }

    const payload = await response.json() as { answer?: string; reply?: string; content?: string };
    const answer = (payload.answer ?? payload.reply ?? payload.content ?? "").trim();
    if (!answer) throw new Error("Custom provider returned empty answer");
    return { answer, model: config.customModel ?? "custom", provider: "custom" };
  },
};
