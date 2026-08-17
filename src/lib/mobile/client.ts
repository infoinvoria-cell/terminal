// ── Mobile API client helpers ─────────────────────────────────────────────────
// Safe for use in both server components and client components.
// All functions call /api/mobile/* — no direct Brain/vault access.

import type {
  MobileSystemHealth,
  MobileHomeSummary,
  MobileAnalyticsSummary,
  MobileBrainStatus,
  MobileBrainSearchResult,
  MobileBrainDocResponse,
  MobileDocManifestEntry,
  MobileSentinelStatus,
  MobileExecutionStatus,
  MobileMarketsResponse,
  MobileWhiteSwanSummary,
  MobileResearchSummary,
  MobileHealthV2,
  MobileBrainProjectionManifest,
} from "@/lib/mobile/types";

async function mobileGet<T>(path: string, init?: RequestInit): Promise<T> {
  const base =
    typeof window !== "undefined"
      ? ""
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  const res = await fetch(`${base}/api/mobile${path}`, {
    cache: "no-store",
    ...init,
  });
  if (!res.ok) throw new Error(`Mobile API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Phase 1 helpers ───────────────────────────────────────────────────────────

/** System mode + brain/supabase availability */
export function getMobileStatus(): Promise<MobileSystemHealth> {
  return mobileGet<MobileSystemHealth>("/status");
}

/** @deprecated Use getMobileStatus() */
export const getMobileHealth = getMobileStatus;

/** Home screen — KPIs + subsystem statuses */
export function getMobileHome(): Promise<MobileHomeSummary> {
  return mobileGet<MobileHomeSummary>("/home");
}

/** Analytics — White Swan + Invest performance metrics */
export function getMobileAnalytics(): Promise<MobileAnalyticsSummary> {
  return mobileGet<MobileAnalyticsSummary>("/analytics");
}

/** Brain graph node/link counts + projection info */
export function getMobileBrainStatus(): Promise<MobileBrainStatus> {
  return mobileGet<MobileBrainStatus>("/brain/status");
}

/**
 * Brain search — uses vault locally, projection on Vercel.
 * Same query works in both environments.
 */
export function searchMobileBrain(
  query: string,
  max = 8,
): Promise<MobileBrainSearchResult> {
  const params = new URLSearchParams({ q: query, max: String(max) });
  return mobileGet<MobileBrainSearchResult>(`/brain/search?${params}`);
}

/** Sentinel AI provider availability */
export function getMobileSentinelStatus(): Promise<MobileSentinelStatus> {
  return mobileGet<MobileSentinelStatus>("/sentinel");
}

// ── Phase 2 helpers ───────────────────────────────────────────────────────────

/** System health V2 — 15 service categories with VERCEL_REAL classification */
export function getMobileHealthV2(): Promise<MobileHealthV2> {
  return mobileGet<MobileHealthV2>("/health");
}

/** Live market quotes from Supabase (8 instruments) */
export function getMobileMarkets(): Promise<MobileMarketsResponse> {
  return mobileGet<MobileMarketsResponse>("/markets");
}

/** White Swan portfolio summary (static committed JSON) */
export function getMobileWhiteSwan(capital?: number): Promise<MobileWhiteSwanSummary> {
  const params = capital ? `?capital=${capital}` : "";
  return mobileGet<MobileWhiteSwanSummary>(`/white-swan${params}`);
}

/** Research hub — all research system statuses */
export function getMobileResearch(): Promise<MobileResearchSummary> {
  return mobileGet<MobileResearchSummary>("/research");
}

/** Execution status (always disabled — read only, no broker calls) */
export function getMobileExecution(): Promise<MobileExecutionStatus> {
  return mobileGet<MobileExecutionStatus>("/execution");
}

// ── Phase 3 — Brain Projection helpers ───────────────────────────────────────

/**
 * List safe Brain document IDs.
 * Works on Vercel (static projection) and locally (vault whitelist).
 */
export async function getMobileBrainDocManifest(): Promise<MobileDocManifestEntry[]> {
  const base =
    typeof window !== "undefined"
      ? ""
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  const res = await fetch(`${base}/api/mobile/brain/doc/manifest`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Brain doc manifest → ${res.status}`);
  const data = (await res.json()) as { documents: MobileDocManifestEntry[] };
  return data.documents;
}

/** Fetch a single safe Brain document by whitelisted ID */
export async function getMobileBrainDocument(id: string): Promise<MobileBrainDocResponse> {
  const base =
    typeof window !== "undefined"
      ? ""
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  const res = await fetch(`${base}/api/mobile/brain/doc?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Brain doc ${id} → ${res.status}`);
  return res.json() as Promise<MobileBrainDocResponse>;
}

// Suppress unused import warning — MobileBrainProjectionManifest used by route types
export type { MobileBrainProjectionManifest };
