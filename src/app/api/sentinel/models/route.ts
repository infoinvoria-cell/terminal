export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getAllModels, getCatalogSummary } from "@/lib/sentinel/catalog/model-catalog";

export async function GET() {
  const models = getAllModels().map((m) => ({
    provider: m.provider,
    modelId: m.modelId,
    displayName: m.displayName,
    availability: m.availability,
    verifiedFree: m.pricing.verifiedFree,
    capabilities: m.capabilities,
    contextWindow: m.limits.contextWindow,
    maxOutputTokens: m.limits.maxOutputTokens,
    rpmLimit: m.limits.requestsPerMinute,
    rdLimit: m.limits.requestsPerDay,
    tpmLimit: m.limits.tokensPerMinute,
    tpdLimit: m.limits.tokensPerDay,
    fetchedAtUtc: m.fetchedAtUtc,
  }));

  const summary = getCatalogSummary();

  return NextResponse.json({ models, summary });
}
