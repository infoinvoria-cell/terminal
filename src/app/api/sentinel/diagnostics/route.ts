export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getBrainContextStatus, getSentinelEnvConfig } from "@/lib/sentinel/providers/provider-status";
import { getCapalifeContext } from "@/lib/sentinel/capitalife-context";
import { getCapabilities } from "@/lib/sentinel/providers/model-capabilities";
import { getAllProviderStates } from "@/lib/sentinel/store/usage-store";

const CLOUD_PROVIDERS = [
  { id: "groq", keyEnv: "GROQ_API_KEY", model: "llama-3.3-70b-versatile" },
  { id: "cerebras", keyEnv: "CEREBRAS_API_KEY", model: "llama-3.3-70b" },
  { id: "mistral", keyEnv: "MISTRAL_API_KEY", model: "mistral-small-latest" },
  { id: "cohere", keyEnv: "COHERE_API_KEY", model: "command-r-plus" },
  { id: "anthropic", keyEnv: "ANTHROPIC_API_KEY", model: "claude-3-5-sonnet-latest" },
  { id: "openrouter", keyEnv: "OPENROUTER_API_KEY", model: "meta-llama/llama-3.3-70b-instruct:free" },
  { id: "gemini", keyEnv: "GEMINI_API_KEY", model: "gemini-1.5-flash" },
  { id: "github-models", keyEnv: "GITHUB_TOKEN", model: "meta-llama-3.1-8b-instruct" },
  { id: "cloudflare", keyEnv: "CLOUDFLARE_API_TOKEN", model: "@cf/meta/llama-3.1-8b-instruct" },
  { id: "huggingface", keyEnv: "HF_TOKEN", model: "meta-llama/Meta-Llama-3-8B-Instruct" },
] as const;

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && !request.headers.get("x-sentinel-local")) {
    return NextResponse.json({ status: "diagnostics restricted in production" }, { status: 403 });
  }

  const config = getSentinelEnvConfig();
  const generatedAt = new Date().toISOString();

  // Providers
  const providers = CLOUD_PROVIDERS.map(({ id, keyEnv, model }) => {
    const configured = Boolean(process.env[keyEnv]?.trim());
    const caps = getCapabilities(id, model);
    return {
      id,
      configured,
      model,
      contextWindow: caps?.contextWindow ?? null,
      maxOutputTokens: caps?.maxOutputTokens ?? null,
      streaming: caps?.supportsStreaming ?? false,
    };
  });

  // Brain
  let brain: Record<string, unknown> = { available: false, pathConfigured: false };
  try {
    const brainStatus = getBrainContextStatus(config);
    let cacheAgeMs = 0;
    try {
      const { getBrainCacheStatus } = await import("@/lib/sentinel/capitalife-context");
      const cacheInfo = getBrainCacheStatus();
      cacheAgeMs = cacheInfo.ageMs;
    } catch { /* optional */ }
    brain = {
      available: brainStatus.available,
      pathConfigured: brainStatus.pathConfigured,
      mode: brainStatus.mode,
      message: brainStatus.message,
      cacheAgeMs,
    };
  } catch { /* partial */ }

  // Graphify
  let graphify: Record<string, unknown> = { available: false };
  try {
    const { getGraphStats } = await import("@/lib/sentinel/graphify-retrieval");
    graphify = getGraphStats();
  } catch { /* optional */ }

  // Quota
  let quota: Record<string, unknown> = {};
  try {
    const states = getAllProviderStates();
    quota = Object.fromEntries(
      Object.entries(states).map(([id, entry]) => [
        id,
        entry
          ? { tokensToday: entry.inputTokens + entry.outputTokens, requestsToday: entry.requestCount, blocked: Boolean(entry.blockedUntil && new Date(entry.blockedUntil) > new Date()) }
          : { tokensToday: 0, requestsToday: 0, blocked: false },
      ]),
    );
  } catch { /* optional */ }

  // Context budget
  let contextBudget: Record<string, unknown> = {};
  try {
    const ctx = getCapalifeContext();
    contextBudget = { estimatedTokens: Math.ceil(ctx.length / 3.5) };
  } catch { /* optional */ }

  // Capacity summary
  let capacity: Record<string, unknown> = {};
  try {
    const { getCapacitySummary } = await import("@/lib/sentinel/capacity/token-capacity-planner");
    const { getAllModels } = await import("@/lib/sentinel/catalog/model-catalog");
    const configuredIds = CLOUD_PROVIDERS.filter(({ keyEnv }) => !!process.env[keyEnv]?.trim()).map(({ id }) => id as string);
    const allModels = getAllModels();
    const summary = getCapacitySummary(configuredIds);
    capacity = {
      measuredAtUtc: summary.measuredAtUtc,
      totalConfiguredProviders: summary.totalConfiguredProviders,
      totalVerifiedProviders: summary.totalVerifiedProviders,
      totalAvailableModels: summary.totalAvailableModels,
      totalVerifiedFreeModels: summary.totalVerifiedFreeModels,
      largestContextWindow: summary.largestContextWindow,
      largestOutputLimit: summary.largestOutputLimit,
      estimatedRemainingRequestsToday: summary.estimatedRemainingRequestsToday,
      estimatedRemainingTokensToday: summary.estimatedRemainingTokensToday,
      freeOnlyPolicy: true,
      catalogTotalModels: allModels.length,
    };
  } catch { /* optional */ }

  return NextResponse.json({
    generatedAt,
    providers,
    brain,
    graphify,
    quota,
    capacity,
    config: { mode: config.mode, brainEnabled: config.brainContextEnabled, streamingEnabled: true, freeOnlyPolicy: true },
    contextBudget,
    availableProfiles: ["auto_balanced", "maximum_quality", "maximum_context", "maximum_output", "aggressive_free_usage", "privacy_local"],
  });
}
