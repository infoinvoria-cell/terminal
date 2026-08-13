export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getAllModels, getCatalogSummary } from "@/lib/sentinel/catalog/model-catalog";
import { getCapacitySummary } from "@/lib/sentinel/capacity/token-capacity-planner";
import { getAllProviderStates } from "@/lib/sentinel/store/usage-store";
import { activateLocalAgents } from "@/lib/sentinel/providers/local-agent-registry";
import { computeSentinelSystemStatus, RUNTIME_PROBEABLE_PROVIDERS } from "@/lib/sentinel/status/system-status";

const CONFIGURED_PROVIDERS = [
  { id: "groq", keyEnv: "GROQ_API_KEY" },
  { id: "cerebras", keyEnv: "CEREBRAS_API_KEY" },
  { id: "mistral", keyEnv: "MISTRAL_API_KEY" },
  { id: "cohere", keyEnv: "COHERE_API_KEY" },
  { id: "anthropic", keyEnv: "ANTHROPIC_API_KEY" },
  { id: "openrouter", keyEnv: "OPENROUTER_API_KEY" },
  { id: "gemini", keyEnv: "GEMINI_API_KEY" },
  { id: "github-models", keyEnv: "GITHUB_TOKEN" },
  { id: "cloudflare", keyEnv: "CLOUDFLARE_API_TOKEN" },
  { id: "huggingface", keyEnv: "HF_TOKEN" },
] as const;

async function getOllamaModels(): Promise<string[]> {
  try {
    const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434";
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json() as { models?: { name: string }[] };
    return data.models?.map(m => m.name) ?? [];
  } catch { return []; }
}

export async function GET() {
  const configuredProviders = CONFIGURED_PROVIDERS
    .filter(({ keyEnv }) => !!process.env[keyEnv]?.trim())
    .map(({ id }) => id);

  const allModels = getAllModels();
  const catalog = getCatalogSummary();

  let capacity;
  try {
    capacity = getCapacitySummary(configuredProviders);
  } catch {
    capacity = null;
  }

  const usageStates = getAllProviderStates();

  const rawProviderSummaries = CONFIGURED_PROVIDERS.map(({ id, keyEnv }) => {
    const configured = !!process.env[keyEnv]?.trim();
    const models = allModels.filter((m) => m.provider === (id as string));
    const freeModels = models.filter((m) => m.pricing.verifiedFree);
    const state = usageStates[id as string];
    const requestsToday = state?.requestCount ?? 0;
    const tokensToday = state ? state.inputTokens + state.outputTokens : 0;
    const blocked = state?.blockedUntil ? new Date(state.blockedUntil) > new Date() : false;

    const primaryFreeModel = freeModels[0] ?? null;
    const requestsRemainingToday = primaryFreeModel?.limits.requestsPerDay != null
      ? Math.max(0, primaryFreeModel.limits.requestsPerDay - requestsToday)
      : null;
    const tokensRemainingToday = primaryFreeModel?.limits.tokensPerDay != null
      ? Math.max(0, primaryFreeModel.limits.tokensPerDay - tokensToday)
      : null;

    // "ready" only for runtime-probeable providers with a key present.
    // Key-only providers (Cerebras, Cohere, etc.) that cannot be probed are "configured_unverified".
    const runtimeProbeable = RUNTIME_PROBEABLE_PROVIDERS.has(id as string);
    const providerStatus = !configured
      ? "not_configured"
      : blocked
        ? "rate_limited"
        : runtimeProbeable
          ? "ready"
          : "configured_unverified";

    return {
      providerId: id,
      configured,
      runtimeProbeable,
      status: providerStatus,
      modelCount: models.length,
      freeModelCount: freeModels.length,
      requestsToday,
      tokensToday,
      blocked,
      largestContextWindow: models.reduce((max, m) => Math.max(max, m.limits.contextWindow ?? 0), 0) || null,
      largestOutputLimit: models.reduce((max, m) => Math.max(max, m.limits.maxOutputTokens ?? 0), 0) || null,
      rpmLimit: primaryFreeModel?.limits.requestsPerMinute ?? null,
      rpdLimit: primaryFreeModel?.limits.requestsPerDay ?? null,
      tpmLimit: primaryFreeModel?.limits.tokensPerMinute ?? null,
      tpdLimit: primaryFreeModel?.limits.tokensPerDay ?? null,
      requestsRemainingToday,
      tokensRemainingToday,
    };
  });

  // Sort: configured+ready first, then configured+degraded/rate_limited, then not_configured
  const providerSummaries = [...rawProviderSummaries].sort((a, b) => {
    const rank = (p: typeof a) => {
      if (!p.configured) return 2;
      if (p.status === "ready") return 0;
      return 1;
    };
    return rank(a) - rank(b);
  });

  // Local agents — check Ollama
  const ollamaModels = await getOllamaModels();
  const localAgents = activateLocalAgents(ollamaModels).map(a => ({
    id: a.id,
    name: a.name,
    description: a.description,
    primarySkill: a.primarySkill,
    supportedTasks: a.supportedTasks,
    active: a.active,
    availableModel: a.availableModel,
    contextWindow: a.contextWindow,
    speedTier: a.speedTier,
    minVramGb: a.minVramGb,
  }));
  const ollamaOnline = ollamaModels.length > 0;
  const activeLocalAgentCount = localAgents.filter(a => a.active).length;

  // localStatus is independent of cloud systemStatus
  const localStatus: "ready" | "online_no_agents" | "offline" = ollamaOnline
    ? (activeLocalAgentCount > 0 ? "ready" : "online_no_agents")
    : "offline";

  const configuredSet = new Set<string>(configuredProviders);
  // Only runtime-probeable configured providers count as usable
  const usableProviderSet = new Set<string>(
    configuredProviders.filter(id => RUNTIME_PROBEABLE_PROVIDERS.has(id))
  );

  // Three distinct model counts
  const catalogModels = allModels.length;
  const runtimeVerifiableModels = allModels.filter(m => usableProviderSet.has(m.provider)).length;
  const usableFreeModels = allModels.filter(
    m => usableProviderSet.has(m.provider) && m.pricing.verifiedFree
  ).length;

  // Legacy field — total free models from all configured providers (including unverified)
  const totalFreeModels = allModels.filter(
    (m) => configuredSet.has(m.provider) && m.pricing.verifiedFree,
  ).length;

  // Context window from runtime-verified providers only
  const largestContext = allModels
    .filter((m) => usableProviderSet.has(m.provider) && m.pricing.verifiedFree)
    .reduce((max, m) => Math.max(max, m.limits.contextWindow ?? 0), 0);

  const largestOutput = allModels
    .filter((m) => usableProviderSet.has(m.provider) && m.pricing.verifiedFree)
    .reduce((max, m) => Math.max(max, m.limits.maxOutputTokens ?? 0), 0);

  // Counts using strict definitions
  const readyProviderCount = providerSummaries.filter(p => p.status === "ready").length;
  const blockedProviderCount = providerSummaries.filter(p => p.configured && p.blocked).length;
  const configuredButUnverifiedCount = providerSummaries.filter(p => p.status === "configured_unverified").length;
  const systemReady = readyProviderCount > 0;

  // Unified status — same function as /health endpoint
  const systemStatus = computeSentinelSystemStatus(
    providerSummaries.map(p => ({
      id: p.providerId,
      effectivelyReady: p.status === "ready",
      blocked: p.blocked,
    })),
    ollamaOnline,
  );

  // Per-provider remaining capacity (only where quota is known)
  const knownDailyCapacity = providerSummaries
    .filter(p => p.configured && (p.requestsRemainingToday != null || p.tokensRemainingToday != null))
    .map(p => ({
      providerId: p.providerId,
      remainingRequests: p.requestsRemainingToday,
      remainingTokens: p.tokensRemainingToday,
      contextWindow: p.largestContextWindow,
    }));

  const totalKnownDailyRequests = knownDailyCapacity.reduce(
    (sum, p) => sum + (p.remainingRequests ?? 0),
    0,
  );

  const configuredButUnverified = providerSummaries
    .filter(p => p.status === "configured_unverified")
    .map(p => ({ providerId: p.providerId, reason: "key_present_not_runtime_verified" }));

  // Quota source annotations: every displayed limit must declare its source.
  // Catalog values are static and NOT runtime-verified — source = "static_catalog".
  // Runtime-derived values (response headers, usage APIs) are not yet collected.
  type QuotaAnnotation = {
    value: number | null;
    unit: string;
    scope: "per_provider" | "per_model";
    source: "runtime_header" | "provider_error_response" | "official_runtime_endpoint" | "static_catalog" | "unknown";
    quotaVerified: boolean;
    verifiedAtUtc: string | null;
  };

  function staticQuota(value: number | null, unit: string, scope: "per_provider" | "per_model"): QuotaAnnotation {
    return { value, unit, scope, source: "static_catalog", quotaVerified: false, verifiedAtUtc: null };
  }

  const quotaAnnotations: Record<string, {
    requestsPerDay: QuotaAnnotation;
    requestsPerMinute: QuotaAnnotation;
    tokensPerMinute: QuotaAnnotation;
    tokensPerDay: QuotaAnnotation;
  }> = {};

  for (const p of providerSummaries) {
    if (!p.configured) continue;
    quotaAnnotations[p.providerId] = {
      requestsPerDay: staticQuota(p.rpdLimit, "requests/day", "per_provider"),
      requestsPerMinute: staticQuota(p.rpmLimit, "requests/minute", "per_model"),
      tokensPerMinute: staticQuota(p.tpmLimit, "tokens/minute", "per_model"),
      tokensPerDay: staticQuota(p.tpdLimit, "tokens/day", "per_model"),
    };
  }

  return NextResponse.json({
    measuredAtUtc: new Date().toISOString(),
    freeOnlyPolicy: true,
    freeFirewallActive: true,
    systemStatus,
    systemReady,
    readyProviderCount,
    blockedProviderCount,
    configuredButUnverifiedCount,
    configuredButUnverified,
    ollamaOnline,
    localStatus,
    activeLocalAgentCount,
    localAgents,
    configuredProviderCount: configuredProviders.length,
    catalogModels,
    runtimeVerifiableModels,
    usableFreeModels,
    totalFreeModels,
    largestContextWindow: largestContext || null,
    largestOutputLimit: largestOutput || null,
    knownDailyCapacity,
    totalKnownDailyRequests,
    catalog: {
      totalModels: catalog.totalModels,
      byProvider: catalog.byProvider,
      freePolicyEnforced: catalog.freePolicyEnforced,
    },
    capacityPlanner: capacity
      ? {
          estimatedRemainingRequestsToday: capacity.estimatedRemainingRequestsToday,
          estimatedRemainingTokensToday: capacity.estimatedRemainingTokensToday,
        }
      : null,
    quotaAnnotations,
    providers: providerSummaries,
    profiles: [
      "auto_balanced",
      "maximum_quality",
      "maximum_context",
      "maximum_output",
      "aggressive_free_usage",
      "privacy_local",
    ],
  });
}
