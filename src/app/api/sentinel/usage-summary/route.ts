export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getAllProviderStates, getUsageSummaryForRange, getEarliestUsageDate } from "@/lib/sentinel/store/usage-store";
import { getLastContextUsage } from "@/lib/sentinel/store/context-store";
import { getAllModels } from "@/lib/sentinel/catalog/model-catalog";

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

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekStartUtc(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const daysBack = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack));
  return monday.toISOString().slice(0, 10);
}

function monthStartUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export async function GET() {
  const today = todayUtc();
  const weekStart = weekStartUtc();
  const monthStart = monthStartUtc();

  const configuredProviderIds = CONFIGURED_PROVIDERS
    .filter(({ keyEnv }) => !!process.env[keyEnv as keyof typeof process.env]?.trim())
    .map(({ id }) => id as string);

  const allModels = getAllModels();
  const providerStates = getAllProviderStates();

  // Today: sum all providers
  let todayInput = 0, todayOutput = 0, todayRequests = 0;
  for (const state of Object.values(providerStates)) {
    if (!state) continue;
    todayInput += state.inputTokens;
    todayOutput += state.outputTokens;
    todayRequests += state.requestCount;
  }

  // Known daily TOKEN limit: only catalog-verified tokensPerDay values
  let knownDailyTokenLimit = 0;
  let configuredWithFreeModels = 0;
  let providersWithKnownTpd = 0;
  for (const pid of configuredProviderIds) {
    const freeModels = allModels.filter(m => m.provider === pid && m.pricing.verifiedFree);
    if (freeModels.length > 0) configuredWithFreeModels++;
    const maxTpd = freeModels.reduce((max, m) => Math.max(max, m.limits.tokensPerDay ?? 0), 0);
    if (maxTpd > 0) {
      knownDailyTokenLimit += maxTpd;
      providersWithKnownTpd++;
    }
  }

  const limitCoverage: "complete" | "partial" | "unknown" =
    knownDailyTokenLimit === 0 ? "unknown"
    : providersWithKnownTpd < configuredWithFreeModels ? "partial"
    : "complete";

  // Week and month from actual store range
  const week = getUsageSummaryForRange(weekStart, today);
  const month = getUsageSummaryForRange(monthStart, today);

  // Earliest date we have usage data — to show "Messdaten seit X" when partial
  const dataAvailableSince = getEarliestUsageDate();

  // Context from last measured run
  const activeContext = getLastContextUsage();

  return NextResponse.json({
    measuredAtUtc: new Date().toISOString(),
    today: {
      inputTokens: todayInput,
      outputTokens: todayOutput,
      totalTokens: todayInput + todayOutput,
      requests: todayRequests,
      knownDailyTokenLimit: knownDailyTokenLimit > 0 ? knownDailyTokenLimit : null,
      limitCoverage,
    },
    week: {
      inputTokens: week.inputTokens,
      outputTokens: week.outputTokens,
      totalTokens: week.inputTokens + week.outputTokens,
      requests: week.requests,
      fromUtc: weekStart,
      toUtc: today,
    },
    month: {
      inputTokens: month.inputTokens,
      outputTokens: month.outputTokens,
      totalTokens: month.inputTokens + month.outputTokens,
      requests: month.requests,
      fromUtc: monthStart,
      toUtc: today,
    },
    dataAvailableSince,
    activeContext,
  });
}
