import { classifyMessage } from "@/lib/sentinel/model-registry";
import { anthropicProvider } from "./anthropic-provider";
import { customProvider } from "./custom-provider";
import { localProvider } from "./local-provider";
import { openaiProvider } from "./openai-provider";
import { buildProviderStatus, getBrainContextStatus, getSentinelEnvConfig } from "./provider-status";
import type { ChatMessage, ChatResult, ProviderStatus, SentinelProvider, SentinelProviderId, SentinelRouterMode } from "./types";

const PROVIDERS: Record<SentinelProviderId, SentinelProvider> = {
  local: localProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
  custom: customProvider,
};

export type RouterDiagnostics = {
  mode: SentinelRouterMode;
  requestedProvider: SentinelProviderId | null;
  activeProvider: SentinelProviderId | null;
  fallbackProvider: SentinelProviderId | null;
  fallbackUsed: boolean;
};

export type RouterResult = ChatResult & {
  diagnostics: RouterDiagnostics;
};

export type SentinelStatusPayload = {
  activeProvider: SentinelProviderId | null;
  mode: SentinelRouterMode;
  fallbackProvider: SentinelProviderId | null;
  providers: ProviderStatus[];
  brain: ReturnType<typeof getBrainContextStatus>;
  apisDisabled: boolean;
  customApiDisabled: boolean;
  partnerMode: boolean;
  requireLocalFallback: boolean;
};

function normalizeRequestedProvider(input?: string): SentinelProviderId | null {
  const normalized = input?.trim().toLowerCase();
  if (normalized === "ollama" || normalized === "local") return "local";
  if (normalized === "openai" || normalized === "anthropic" || normalized === "custom") return normalized;
  return null;
}

function modeToProvider(mode: SentinelRouterMode): SentinelProviderId | null {
  if (mode === "auto") return null;
  return mode;
}

function providerAllowed(providerId: SentinelProviderId, config = getSentinelEnvConfig()): boolean {
  if (providerId === "local") return true;
  if (providerId === "custom") return config.allowCustomApi;
  return config.allowPaidApi;
}

async function getProviderStatuses(activeProvider: SentinelProviderId | null): Promise<ProviderStatus[]> {
  const config = getSentinelEnvConfig();
  const healthEntries = await Promise.all(
    Object.values(PROVIDERS).map(async (provider) => {
      if (!providerAllowed(provider.id, config)) {
        return buildProviderStatus(provider, {
          configured: false,
          enabled: false,
          available: false,
          usable: false,
          reason: "disabled",
          message: provider.id === "custom" ? "Custom API disabled" : "API provider disabled",
          model: null,
        }, activeProvider);
      }
      const health = await provider.healthCheck().catch((error: unknown) => ({
        configured: false,
        available: false,
        usable: false,
        enabled: true,
        reason: "error" as const,
        message: error instanceof Error ? error.message : String(error),
        model: null,
        models: [],
        supportsStreaming: provider.supportsStreaming,
      }));
      return buildProviderStatus(provider, health, activeProvider);
    }),
  );

  return healthEntries;
}

function buildProviderOrder(
  mode: SentinelRouterMode,
  requestedProvider: SentinelProviderId | null,
  providers: ProviderStatus[],
): SentinelProviderId[] {
  const config = getSentinelEnvConfig();
  const explicit = requestedProvider ?? modeToProvider(mode);
  if (explicit) return providerAllowed(explicit, config) ? [explicit] : [];

  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const canAutoUse = (providerId: SentinelProviderId) => byId.get(providerId)?.usable ?? false;

  const ordered: SentinelProviderId[] = [config.defaultProvider];
  const fallbackCandidates: SentinelProviderId[] = ["local", "openai", "anthropic", "custom"];
  for (const candidate of fallbackCandidates) {
    if (!ordered.includes(candidate)) ordered.push(candidate);
  }
  if (config.requireLocalFallback && !ordered.includes("local")) ordered.push("local");
  return ordered.filter((providerId) => providerAllowed(providerId, config) && canAutoUse(providerId));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, providerId: SentinelProviderId): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${providerId} timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      promise.finally(() => clearTimeout(timer)).catch(() => undefined);
    }),
  ]);
}

async function tryProvider(providerId: SentinelProviderId, messages: ChatMessage[]): Promise<{ result: ChatResult | null; error: string | null }> {
  const config = getSentinelEnvConfig();
  try {
    const category = classifyMessage(messages.findLast((message) => message.role === "user")?.content ?? "");
    const task = PROVIDERS[providerId].sendMessage({ messages, category });
    const result = providerId === "local" && config.mode === "auto"
      ? await withTimeout(task, config.localTimeoutMs, providerId)
      : await task;
    return { result, error: null };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function healthCheckProviders(activeProvider: SentinelProviderId | null = null): Promise<SentinelStatusPayload> {
  const config = getSentinelEnvConfig();
  const brain = getBrainContextStatus(config);
  const initialProviders = await getProviderStatuses(activeProvider);
  const usableProviders = buildProviderOrder(config.mode, null, initialProviders);
  const activeProviderIsUsable = activeProvider
    ? initialProviders.find((provider) => provider.id === activeProvider)?.usable === true
    : false;
  const selectedActiveProvider = activeProviderIsUsable
    ? activeProvider
    : usableProviders[0] ?? null;
  const providers = selectedActiveProvider === activeProvider ? initialProviders : await getProviderStatuses(selectedActiveProvider);
  const fallbackProvider = usableProviders.find((providerId) => providerId !== selectedActiveProvider) ?? null;
  return {
    activeProvider: selectedActiveProvider,
    mode: config.mode,
    fallbackProvider,
    providers,
    brain,
    apisDisabled: !config.allowPaidApi,
    customApiDisabled: !config.allowCustomApi,
    partnerMode: config.partnerMode,
    requireLocalFallback: config.requireLocalFallback,
  };
}

export async function ask(messages: ChatMessage[], options?: { requestedProvider?: string }): Promise<RouterResult> {
  const config = getSentinelEnvConfig();
  const requestedProvider = normalizeRequestedProvider(options?.requestedProvider);
  const statuses = await getProviderStatuses(null);
  const byId = new Map(statuses.map((provider) => [provider.id, provider]));
  const explicitProvider = requestedProvider ?? modeToProvider(config.mode);
  const order = explicitProvider ? [explicitProvider] : buildProviderOrder(config.mode, requestedProvider, statuses);

  let firstError: string | null = null;
  for (let index = 0; index < order.length; index += 1) {
    const providerId = order[index]!;
    const providerStatus = byId.get(providerId);
    if (!explicitProvider && providerStatus?.usable === false) continue;
    const { result, error } = await tryProvider(providerId, messages);
    if (result) {
      const fallbackProvider = index > 0 ? providerId : null;
      return {
        ...result,
        fallbackUsed: index > 0,
        diagnostics: {
          mode: config.mode,
          requestedProvider,
          activeProvider: providerId,
          fallbackProvider,
          fallbackUsed: index > 0,
        },
      };
    }
    if (!firstError && (explicitProvider || providerStatus?.usable)) firstError = `${providerId}: ${error ?? "unknown error"}`;
  }

  throw new Error(firstError ?? `Lokales Modell offline. Starte Ollama unter ${config.ollamaBaseUrl}.`);
}

export async function stream(messages: ChatMessage[], options?: { requestedProvider?: string }): Promise<{ stream: ReadableStream<Uint8Array>; provider: SentinelProviderId; mode: SentinelRouterMode }> {
  const config = getSentinelEnvConfig();
  const requestedProvider = normalizeRequestedProvider(options?.requestedProvider);
  const statuses = await getProviderStatuses(null);
  const byId = new Map(statuses.map((provider) => [provider.id, provider]));
  const explicitProvider = requestedProvider ?? modeToProvider(config.mode);
  const order = explicitProvider ? [explicitProvider] : buildProviderOrder(config.mode, requestedProvider, statuses);
  const encoder = new TextEncoder();
  let lastError: string | null = null;

  for (const providerId of order) {
    const providerStatus = byId.get(providerId);
    if (!explicitProvider && providerStatus?.usable === false) continue;
    const provider = PROVIDERS[providerId];
    const category = classifyMessage(messages.findLast((message) => message.role === "user")?.content ?? "");

    if (provider.streamMessage) {
      try {
        const task = provider.streamMessage({ messages, category });
        const providerStream = providerId === "local" && config.mode === "auto"
          ? await withTimeout(task, config.localTimeoutMs, providerId)
          : await task;
        return { stream: providerStream, provider: providerId, mode: config.mode };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      continue;
    }

    const { result, error } = await tryProvider(providerId, messages);
    if (result) {
      return {
        provider: result.provider,
        mode: config.mode,
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(result.answer));
            controller.close();
          },
        }),
      };
    }

    if (explicitProvider || providerStatus?.usable) {
      lastError = error ?? lastError;
    }
  }

  throw new Error(lastError ?? `Lokales Modell offline. Starte Ollama unter ${config.ollamaBaseUrl}.`);
}
