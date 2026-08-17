// ── Mobile API client helpers ─────────────────────────────────────────────────
// Safe for use in both server components and client components.
// All functions call /api/mobile/* — no direct Brain/vault access.

import type {
  MobileSystemHealth,
  MobileHomeSummary,
  MobileAnalyticsSummary,
  MobileBrainStatus,
  MobileBrainSearchResult,
  MobileSentinelStatus,
} from "@/lib/mobile/types";

async function mobileGet<T>(path: string, init?: RequestInit): Promise<T> {
  const base = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  const res = await fetch(`${base}/api/mobile${path}`, {
    cache: "no-store",
    ...init,
  });
  if (!res.ok) throw new Error(`Mobile API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export function getMobileHealth(): Promise<MobileSystemHealth> {
  return mobileGet<MobileSystemHealth>("/status");
}

export function getMobileHome(): Promise<MobileHomeSummary> {
  return mobileGet<MobileHomeSummary>("/home");
}

export function getMobileAnalytics(): Promise<MobileAnalyticsSummary> {
  return mobileGet<MobileAnalyticsSummary>("/analytics");
}

export function getMobileBrainStatus(): Promise<MobileBrainStatus> {
  return mobileGet<MobileBrainStatus>("/brain/status");
}

export function searchMobileBrain(
  query: string,
  max = 8,
): Promise<MobileBrainSearchResult> {
  const params = new URLSearchParams({ q: query, max: String(max) });
  return mobileGet<MobileBrainSearchResult>(`/brain/search?${params}`);
}

export function getMobileSentinelStatus(): Promise<MobileSentinelStatus> {
  return mobileGet<MobileSentinelStatus>("/sentinel");
}
