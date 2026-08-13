import type {
  ChatResult,
  ProviderHealth,
  SentinelChatArgs,
  SentinelProvider,
  SentinelProviderId,
} from "./types";
import { recordRequest, recordHttpError } from "@/lib/sentinel/store/usage-store";
import { setLastContextUsage } from "@/lib/sentinel/store/context-store";

// Cloudflare Workers AI has a daily neuron budget for free-tier usage.
// Usage is returned via response headers (cf-aig-request-cost / usage.request_units).

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

function getAccountId(): string | null {
  return process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || null;
}

function getApiToken(): string | null {
  return process.env.CLOUDFLARE_API_TOKEN?.trim() || null;
}

function getModel(): string {
  return process.env.CLOUDFLARE_MODEL?.trim() || DEFAULT_MODEL;
}

function buildEndpoint(accountId: string, model: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

export const cloudflareProvider: SentinelProvider = {
  id: "cloudflare" as SentinelProviderId,
  label: "Cloudflare AI",
  type: "custom",
  supportsStreaming: false,

  async healthCheck(): Promise<ProviderHealth> {
    const accountId = getAccountId();
    const token = getApiToken();
    const model = getModel();
    if (!accountId || !token) {
      return {
        configured: false,
        available: false,
        usable: false,
        enabled: false,
        reason: "not_configured",
        message: "CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN missing",
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
      message: "Cloudflare AI ready",
      model,
      models: [model],
      supportsStreaming: false,
    };
  },

  async sendMessage({ messages, signal }: SentinelChatArgs): Promise<ChatResult> {
    const accountId = getAccountId();
    const token = getApiToken();
    if (!accountId || !token) {
      throw new Error("CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN missing");
    }
    const model = getModel();
    const endpoint = buildEndpoint(accountId, model);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages, max_tokens: 2048 }),
        signal,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Cloudflare AI fetch error: ${msg}`);
    }

    if (!response.ok) {
      recordHttpError("cloudflare", response.status);
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`Cloudflare AI ${response.status}: ${text}`);
    }

    const data = await response.json() as { result?: { response?: string } };
    const answer = data.result?.response?.trim() ?? "";
    if (!answer) throw new Error("Cloudflare AI returned empty answer");

    const costHeader = response.headers.get("cf-aig-request-cost");
    const estimated = costHeader ? parseInt(costHeader, 10) || 100 : 100;

    recordRequest({ provider: "cloudflare", inputTokens: estimated, outputTokens: 0, success: true });
    setLastContextUsage({
      providerId: "cloudflare",
      modelId: model,
      inputTokensUsed: estimated,
      contextWindowTokens: 8192,
      reservedOutputTokens: null,
      measuredAtUtc: new Date().toISOString(),
      status: "estimated",
    });

    return {
      answer,
      model,
      provider: "cloudflare" as SentinelProviderId,
    };
  },
};
