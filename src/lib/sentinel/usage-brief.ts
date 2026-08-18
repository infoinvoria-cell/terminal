// Compact, safe, read-only Sentinel usage/status summary — the collaboration
// contract Globe (or any other Capitalife surface) can consume without
// pulling in Sentinel's full internal capacity/diagnostics payloads.
// No secrets, no provider headers, no account identifiers — capacity
// metadata only.
import { getProviderStatuses } from "@/lib/sentinel/sentinel-router";
import { getUsageSummaryForRange } from "@/lib/sentinel/store/usage-store";
import { getLastContextUsage } from "@/lib/sentinel/store/context-store";
import { getDedupedRequestCount } from "@/lib/sentinel/connect/request-dedupe";
import { getCapabilityRegistry, type CapabilityAvailability } from "@/lib/sentinel/capability-registry";

export type SentinelCapacityStatus = "healthy" | "degraded" | "offline";

export type SentinelUsageSummary = {
  freeOnly: true; // server-enforced; not a client-toggleable flag
  providersReady: number;
  providersTotal: number;
  currentProvider: string | null;
  currentModel: string | null;
  contextUsed: number | null;
  contextMax: number | null;
  todayTokens: number;
  weekTokens: number;
  monthTokens: number;
  capacityStatus: SentinelCapacityStatus;
  // Slice-3 additions — process-lifetime counters (reset on server restart,
  // acceptable per this slice's scope). All EXACT counts, never estimates
  // dressed up as measured; there is no "estimatedTokensAvoided" field here
  // because this build does not yet compute one honestly (see Slice 3
  // commit notes) — omit rather than fabricate.
  providerCallsAvoided: number; // == deduped in-flight requests
  // Slice-5 addition — compact, read-only capability summary Globe can
  // consume without pulling the full registry. Sourced live from
  // capability-registry.ts on every call, never hardcoded.
  capabilities: {
    whiteSwan: CapabilityAvailability;
    coreInvest: CapabilityAvailability;
    physicalIntelligence: CapabilityAvailability;
  };
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
function weekStartUtc(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const daysBack = day === 0 ? 6 : day - 1;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack)).toISOString().slice(0, 10);
}
function monthStartUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export async function getSentinelUsageSummary(): Promise<SentinelUsageSummary> {
  const statusPayload = await getProviderStatuses(null);
  const statuses = statusPayload.providers;
  const readyStatuses = statuses.filter((p) => p.usable);
  const configuredStatuses = statuses.filter((p) => p.configured);

  const today = getUsageSummaryForRange(todayUtc(), todayUtc());
  const week = getUsageSummaryForRange(weekStartUtc(), todayUtc());
  const month = getUsageSummaryForRange(monthStartUtc(), todayUtc());

  const ctx = getLastContextUsage();

  const capacityStatus: SentinelCapacityStatus =
    readyStatuses.length === 0 ? "offline" : readyStatuses.length < configuredStatuses.length ? "degraded" : "healthy";

  return {
    freeOnly: true,
    providersReady: readyStatuses.length,
    providersTotal: configuredStatuses.length,
    currentProvider: ctx?.providerId ?? readyStatuses[0]?.id ?? null,
    currentModel: ctx?.modelId ?? null,
    contextUsed: ctx?.inputTokensUsed ?? null,
    contextMax: ctx?.contextWindowTokens ?? null,
    todayTokens: today.inputTokens + today.outputTokens,
    weekTokens: week.inputTokens + week.outputTokens,
    monthTokens: month.inputTokens + month.outputTokens,
    capacityStatus,
    providerCallsAvoided: getDedupedRequestCount(),
    capabilities: (() => {
      const caps = getCapabilityRegistry();
      const find = (id: string) => caps.find((c) => c.id === id)?.availability ?? "BLOCKED";
      return {
        whiteSwan: find("white_swan_context"),
        coreInvest: find("core_invest_context"),
        physicalIntelligence: find("physical_intelligence_context"),
      };
    })(),
  };
}
