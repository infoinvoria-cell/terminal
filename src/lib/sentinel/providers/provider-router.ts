import { classifyMessage } from "@/lib/sentinel/model-registry";
import { classifyTask } from "@/lib/sentinel/routing/task-classifier";
import { TASK_REQUIREMENTS } from "@/lib/sentinel/routing/task-classifier";
import { getCapalifeContextConditional } from "@/lib/sentinel/capitalife-context";
import { getDailyTokens, getDailyRequests, isBlocked, GROQ_FREE_DAILY_TOKEN_LIMIT } from "@/lib/sentinel/store/usage-store";
import { checkFreePolicy, isFreeModel } from "@/lib/sentinel/policy/free-policy";
import { compactConversation } from "@/lib/sentinel/context/conversation-compactor";
import { getAllModels, getModelsForProvider } from "@/lib/sentinel/catalog/model-catalog";
import { anthropicProvider } from "./anthropic-provider";
import { cerebrasProvider } from "./cerebras-provider";
import { cloudflareProvider } from "./cloudflare-provider";
import { cohereProvider } from "./cohere-provider";
import { customProvider } from "./custom-provider";
import { geminiProvider } from "./gemini-provider";
import { githubModelsProvider } from "./github-models-provider";
import { groqProvider } from "./groq-provider";
import { huggingfaceProvider } from "./huggingface-provider";
import { localProvider } from "./local-provider";
import { mistralProvider } from "./mistral-provider";
import { ollamaProvider } from "./ollama-provider";
import { openrouterProvider } from "./openrouter-provider";
import { buildProviderStatus, getBrainContextStatus, getSentinelEnvConfig } from "./provider-status";
import type { ChatMessage, ChatResult, ProviderStatus, SentinelProvider, SentinelProviderId, SentinelRouterMode } from "./types";

const SENTINEL_SYSTEM_PROMPT = `Du bist Sentinel — KI-Assistent im Capitalife Terminal von Jeroen.

Persönlichkeit:
- Locker, direkt, casual — wie ein smarter Kumpel
- Immer "du", nie "Sie"
- Kein "Gerne", kein "Natürlich", kein "Selbstverständlich"
- Bei Begrüßung: "Was geht" oder ähnlich kurz
- Trading-Experte: Futures, Strategien, Portfolio — kein Basis-Erklären
- Ehrlich und direkt, auch wenn die Antwort unbequem ist

Formatting:
- Nutze **fett** für wichtige Begriffe, Zahlen, Instrumente
- Nutze Bullet-Listen (- Punkt) für Aufzählungen ab 3 Items
- Nutze Absätze für längere Antworten — kein Textwand
- Emojis gezielt einsetzen: 1-3 pro Antwort, passt zum Kontext
- Kurze Antworten bleiben kurz — kein unnötiges Padding
- Status-Reports und Listen klar strukturieren`;

function prepareMessages(messages: ChatMessage[]): ChatMessage[] {
  const result = compactConversation(messages, { maxTurns: 20, keepRecentTurns: 6, maxTokensEstimate: 8000 });
  return result.messages;
}

function withSystemPrompt(messages: ChatMessage[]): ChatMessage[] {
  if (messages.some((m) => m.role === "system")) return messages;
  const lastUserMsg = messages.findLast((m) => m.role === "user")?.content ?? "";
  const context = getCapalifeContextConditional(lastUserMsg);
  const fullPrompt = `${SENTINEL_SYSTEM_PROMPT}\n\n${context}`;
  return [{ role: "system", content: fullPrompt }, ...messages];
}

const PROVIDERS: Record<SentinelProviderId, SentinelProvider> = {
  local: localProvider,
  ollama: ollamaProvider,
  groq: groqProvider,
  cerebras: cerebrasProvider,
  mistral: mistralProvider,
  cohere: cohereProvider,
  anthropic: anthropicProvider,
  custom: customProvider,
  openrouter: openrouterProvider,
  gemini: geminiProvider,
  "github-models": githubModelsProvider,
  cloudflare: cloudflareProvider,
  huggingface: huggingfaceProvider,
};

// Quality weights: higher = preferred for general tasks
const PROVIDER_QUALITY_WEIGHT: Record<string, number> = {
  anthropic: 0.95,
  gemini: 0.90,    // long context, vision, free tier
  groq: 0.85,      // fast, good models
  cerebras: 0.82,  // fast large models
  cohere: 0.78,    // good RAG/tool use
  mistral: 0.75,
  openrouter: 0.70,
  "github-models": 0.65,
  cloudflare: 0.50, // small/fast only
  huggingface: 0.45,
  custom: 0.60,
  ollama: 0.30,   // privacy fallback
  local: 0.20,    // last resort
};

// Routing profiles
export type RoutingProfile =
  | "auto_balanced"
  | "maximum_quality"
  | "maximum_context"
  | "maximum_output"
  | "aggressive_free_usage"
  | "privacy_local";


// Returns scarcity ratio [0,1] where 1 = plenty of quota, 0 = exhausted.
// Thresholds from autopilot spec: >50% normal, 20-50% selective, 5-20% high-value only, <5% reserve, 0% blocked.
function getProviderScarcityRatio(providerId: string): number {
  try {
    if (isBlocked(providerId)) return 0;

    // Check request-based limits against catalog
    const models = getModelsForProvider(providerId);
    const dailyReqLimit = models[0]?.limits?.requestsPerDay ?? null;
    const dailyReqs = getDailyRequests(providerId);

    if (dailyReqLimit != null && dailyReqLimit > 0) {
      const used = dailyReqs / dailyReqLimit;
      return Math.max(0, 1 - used);
    }

    // Token-based fallback for Groq
    if (providerId === "groq") {
      const used = getDailyTokens("groq") / GROQ_FREE_DAILY_TOKEN_LIMIT;
      return Math.max(0, 1 - used);
    }

    // No limit info — assume plenty
    return 1.0;
  } catch {
    return 1.0;
  }
}

function getProviderQuotaScore(providerId: string): number {
  const ratio = getProviderScarcityRatio(providerId);
  // Map scarcity ratio to routing score penalty
  if (ratio === 0) return 0;       // exhausted — remove from routing
  if (ratio < 0.05) return 0.3;   // reserve only — low score
  if (ratio < 0.20) return 0.6;   // high-value only
  if (ratio < 0.50) return 0.8;   // selective use
  return 1.0;                      // normal
}

function isProviderVerifiedFree(providerId: string): boolean {
  const models = getAllModels().filter((m) => m.provider === providerId);
  if (models.length === 0) {
    // Providers with no catalog entry: local and ollama are always free
    return providerId === "local" || providerId === "ollama";
  }
  return models.some((m) => isFreeModel(m));
}

function scoreProviderForTask(
  providerId: string,
  userMessage: string,
): number {
  try {
    const task = classifyTask(userMessage);
    const reqs = TASK_REQUIREMENTS[task];
    const models = getModelsForProvider(providerId);
    if (!models.length) return 1.0; // local/ollama — no catalog, always pass

    const hasCapableModel = models.some((m) => {
      if (reqs.needsVision && !m.capabilities.vision) return false;
      if (reqs.needsTools && !m.capabilities.nativeTools) return false;
      if (reqs.needsStructuredOutput && !m.capabilities.structuredOutput) return false;
      if ((m.limits.contextWindow ?? 0) < reqs.minContextWindow) return false;
      return true;
    });

    if (!hasCapableModel) return 0.5; // capable model missing — slight penalty, don't block entirely

    // Bonus for preferred characteristics
    let bonus = 0;
    if (reqs.preferFast && (providerId === "groq" || providerId === "cerebras")) bonus = 0.15;
    if (reqs.preferLargeContext && providerId === "gemini") bonus = 0.20;
    return 1.0 + bonus;
  } catch {
    return 1.0;
  }
}

function scoreProvider(
  providerId: SentinelProviderId,
  status: ProviderStatus,
  profile: RoutingProfile,
  userMessage?: string,
): number {
  if (!status.usable) return 0;

  // Hard block: if provider is rate-limited
  if (isBlocked(providerId)) return 0;

  // Privacy local: only local/ollama
  if (profile === "privacy_local") {
    return providerId === "local" || providerId === "ollama" ? 1.0 : 0;
  }

  // Free-only enforcement: never route to paid provider
  // Local/ollama always pass; cloud providers need verified free status
  if (providerId !== "local" && providerId !== "ollama") {
    if (!isProviderVerifiedFree(providerId)) return 0;
  }

  const quality = PROVIDER_QUALITY_WEIGHT[providerId] ?? 0.5;
  const quota = getProviderQuotaScore(providerId);

  // Profile adjustments
  let contextBonus = 0;
  if (profile === "maximum_context") {
    // Prefer providers with large context windows
    if (providerId === "gemini") contextBonus = 0.3;
    else if (providerId === "groq" || providerId === "cohere") contextBonus = 0.1;
  }

  let qualityBonus = 0;
  if (profile === "maximum_quality") {
    if (providerId === "anthropic" || providerId === "gemini") qualityBonus = 0.2;
    else if (providerId === "groq" || providerId === "cerebras") qualityBonus = 0.1;
  }

  let speedBonus = 0;
  if (profile === "auto_balanced") {
    if (providerId === "groq" || providerId === "cerebras") speedBonus = 0.1;
  }

  // Aggressive free usage: lower penalty for providers with remaining quota
  let aggressiveBonus = 0;
  if (profile === "aggressive_free_usage") {
    aggressiveBonus = quota * 0.2;
  }

  const taskFit = userMessage ? scoreProviderForTask(providerId, userMessage) : 1.0;
  const raw = (quality + contextBonus + qualityBonus + speedBonus + aggressiveBonus) * taskFit;
  const score = Math.min(1.5, raw) * quota;
  return score;
}

export type RouterDiagnostics = {
  mode: SentinelRouterMode;
  profile: RoutingProfile;
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
  const validIds: SentinelProviderId[] = [
    "local", "ollama", "groq", "cerebras", "mistral", "cohere", "anthropic",
    "custom", "openrouter", "gemini", "github-models", "cloudflare", "huggingface",
  ];
  if (normalized === "github") return "github-models";
  return validIds.includes(normalized as SentinelProviderId) ? (normalized as SentinelProviderId) : null;
}

function normalizeProfile(input?: string): RoutingProfile {
  const valid: RoutingProfile[] = [
    "auto_balanced", "maximum_quality", "maximum_context",
    "maximum_output", "aggressive_free_usage", "privacy_local",
  ];
  const normalized = input?.trim().toLowerCase().replace(/-/g, "_") as RoutingProfile;
  return valid.includes(normalized) ? normalized : "auto_balanced";
}

function modeToProvider(mode: SentinelRouterMode): SentinelProviderId | null {
  if (mode === "auto") return null;
  return mode;
}

function providerAllowed(providerId: SentinelProviderId, config = getSentinelEnvConfig()): boolean {
  if (providerId === "local" || providerId === "ollama") return true;
  if (providerId === "groq") return !!process.env.GROQ_API_KEY?.trim();
  if (providerId === "cerebras") return !!process.env.CEREBRAS_API_KEY?.trim();
  if (providerId === "mistral") return !!process.env.MISTRAL_API_KEY?.trim();
  if (providerId === "cohere") return !!process.env.COHERE_API_KEY?.trim();
  if (providerId === "anthropic") return !!process.env.ANTHROPIC_API_KEY?.trim();
  if (providerId === "openrouter") return !!process.env.OPENROUTER_API_KEY?.trim();
  if (providerId === "gemini") return !!process.env.GEMINI_API_KEY?.trim();
  if (providerId === "github-models") return !!process.env.GITHUB_TOKEN?.trim();
  if (providerId === "cloudflare") return !!(process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN?.trim());
  if (providerId === "huggingface") return !!process.env.HF_TOKEN?.trim();
  if (providerId === "custom") return config.allowCustomApi;
  return false;
}

// System Status: queries all configured providers for health.
// Free Firewall is enforced at request dispatch time in tryProvider() and stream().
// Ollama offline does NOT degrade cloud-provider status — only cloud provider health affects the overall status score.
async function getProviderStatuses(activeProvider: SentinelProviderId | null): Promise<ProviderStatus[]> {
  const config = getSentinelEnvConfig();
  const healthEntries = await Promise.all(
    Object.values(PROVIDERS).map(async (provider) => {
      if (!providerAllowed(provider.id, config)) {
        return buildProviderStatus(
          provider,
          {
            configured: false,
            enabled: false,
            available: false,
            usable: false,
            reason: "disabled",
            message: provider.id === "custom" ? "Custom API disabled" : "API provider disabled",
            model: null,
          },
          activeProvider,
        );
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

function buildScoredProviderOrder(
  mode: SentinelRouterMode,
  requestedProvider: SentinelProviderId | null,
  providers: ProviderStatus[],
  profile: RoutingProfile,
  userMessage?: string,
): SentinelProviderId[] {
  const config = getSentinelEnvConfig();
  const explicit = requestedProvider ?? modeToProvider(mode);
  if (explicit) return providerAllowed(explicit, config) ? [explicit] : [];

  // Privacy mode: only local/ollama
  if (profile === "privacy_local") {
    return (["local", "ollama"] as SentinelProviderId[]).filter((id) => {
      const s = providers.find((p) => p.id === id);
      return s?.usable === true;
    });
  }

  // Score all providers
  const scored = providers
    .filter((p) => providerAllowed(p.id, config))
    .map((p) => ({ id: p.id, score: scoreProvider(p.id, p, profile, userMessage) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((p) => p.id);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, providerId: SentinelProviderId): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${providerId} timeout after ${timeoutMs}ms`)), timeoutMs);
      promise.finally(() => clearTimeout(timer)).catch(() => undefined);
    }),
  ]);
}

async function tryProvider(providerId: SentinelProviderId, messages: ChatMessage[], signal?: AbortSignal): Promise<{ result: ChatResult | null; error: string | null }> {
  // Pre-request: verify this provider has at least one verified-free model.
  // local/ollama are always free; cloud providers need catalog verification.
  // Free Firewall is enforced at request dispatch time in tryProvider() and stream().
  if (providerId !== "local" && providerId !== "ollama") {
    const models = getModelsForProvider(providerId);
    if (models.length > 0) {
      const policyResult = checkFreePolicy(models[0]);
      if (!policyResult.allowed) {
        return { result: null, error: `[FreeFirewall] ${policyResult.detail}` };
      }
    }
  }

  const config = getSentinelEnvConfig();
  try {
    const category = classifyMessage(messages.findLast((message) => message.role === "user")?.content ?? "");
    const task = PROVIDERS[providerId].sendMessage({ messages, category, signal });
    const result = providerId === "local" && config.mode === "auto" ? await withTimeout(task, config.localTimeoutMs, providerId) : await task;
    return { result, error: null };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function healthCheckProviders(activeProvider: SentinelProviderId | null = null): Promise<SentinelStatusPayload> {
  const config = getSentinelEnvConfig();
  const brain = getBrainContextStatus(config);
  const initialProviders = await getProviderStatuses(activeProvider);
  const usableProviders = buildScoredProviderOrder(config.mode, null, initialProviders, "auto_balanced");
  const activeProviderIsUsable = activeProvider ? initialProviders.find((provider) => provider.id === activeProvider)?.usable === true : false;
  const selectedActiveProvider = activeProviderIsUsable ? activeProvider : usableProviders[0] ?? null;
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

export async function ask(
  messages: ChatMessage[],
  options?: { requestedProvider?: string; profile?: string; signal?: AbortSignal },
): Promise<RouterResult> {
  messages = prepareMessages(messages);
  messages = withSystemPrompt(messages);
  const config = getSentinelEnvConfig();
  const requestedProvider = normalizeRequestedProvider(options?.requestedProvider);
  const profile = normalizeProfile(options?.profile);
  const statuses = await getProviderStatuses(null);
  const byId = new Map(statuses.map((provider) => [provider.id, provider]));
  const explicitProvider = requestedProvider ?? modeToProvider(config.mode);
  const lastUserMsg = messages.findLast((m) => m.role === "user")?.content ?? "";
  const order = explicitProvider
    ? [explicitProvider]
    : buildScoredProviderOrder(config.mode, requestedProvider, statuses, profile, lastUserMsg);

  let firstError: string | null = null;
  for (let index = 0; index < order.length; index += 1) {
    const providerId = order[index]!;
    const providerStatus = byId.get(providerId);
    if (!explicitProvider && providerStatus?.usable === false) continue;
    const { result, error } = await tryProvider(providerId, messages, options?.signal);
    if (result) {
      const fallbackProvider = index > 0 ? providerId : null;
      return {
        ...result,
        fallbackUsed: index > 0,
        diagnostics: {
          mode: config.mode,
          profile,
          requestedProvider,
          activeProvider: providerId,
          fallbackProvider,
          fallbackUsed: index > 0,
        },
      };
    }
    if (!firstError && (explicitProvider || providerStatus?.usable)) firstError = `${providerId}: ${error ?? "unknown error"}`;
  }

  throw new Error(firstError ?? "Kein Provider verfügbar. Prüfe API-Keys in .env.local.");
}

export async function stream(
  messages: ChatMessage[],
  options?: { requestedProvider?: string; profile?: string; signal?: AbortSignal },
): Promise<{ stream: ReadableStream<Uint8Array>; provider: SentinelProviderId; mode: SentinelRouterMode; tokensUsed?: number }> {
  messages = prepareMessages(messages);
  messages = withSystemPrompt(messages);
  const config = getSentinelEnvConfig();
  const requestedProvider = normalizeRequestedProvider(options?.requestedProvider);
  const profile = normalizeProfile(options?.profile);
  const statuses = await getProviderStatuses(null);
  const byId = new Map(statuses.map((provider) => [provider.id, provider]));
  const explicitProvider = requestedProvider ?? modeToProvider(config.mode);
  const lastUserMsg = messages.findLast((m) => m.role === "user")?.content ?? "";
  const order = explicitProvider
    ? [explicitProvider]
    : buildScoredProviderOrder(config.mode, requestedProvider, statuses, profile, lastUserMsg);
  const encoder = new TextEncoder();
  let lastError: string | null = null;

  for (const providerId of order) {
    const providerStatus = byId.get(providerId);
    if (!explicitProvider && providerStatus?.usable === false) continue;
    const provider = PROVIDERS[providerId];
    const category = classifyMessage(messages.findLast((message) => message.role === "user")?.content ?? "");

    // Pre-request Free Firewall check for streaming path.
    // Free Firewall is enforced at request dispatch time in tryProvider() and stream().
    if (providerId !== "local" && providerId !== "ollama") {
      const models = getModelsForProvider(providerId);
      if (models.length > 0) {
        const policyResult = checkFreePolicy(models[0]);
        if (!policyResult.allowed) {
          lastError = `[FreeFirewall] ${policyResult.detail}`;
          continue;
        }
      }
    }

    if (provider.streamMessage) {
      try {
        const task = provider.streamMessage({ messages, category, signal: options?.signal });
        const providerStream = providerId === "local" && config.mode === "auto" ? await withTimeout(task, config.localTimeoutMs, providerId) : await task;
        return { stream: providerStream, provider: providerId, mode: config.mode };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      continue;
    }

    const { result, error } = await tryProvider(providerId, messages, options?.signal);
    if (result) {
      return {
        provider: result.provider,
        mode: config.mode,
        tokensUsed: result.tokensUsed,
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(result.answer));
            controller.close();
          },
        }),
      };
    }

    if (explicitProvider || providerStatus?.usable) lastError = error ?? lastError;
  }

  throw new Error(lastError ?? "Kein Provider verfügbar. Prüfe API-Keys in .env.local.");
}
