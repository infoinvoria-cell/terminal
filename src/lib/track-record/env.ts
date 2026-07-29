import type { SyncMode } from "@/lib/track-record/types";

function hasEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function getTrackRecordEnv() {
  const vercelStaticIpFlag = process.env.VERCEL_STATIC_IPS_ENABLED ?? process.env.VERCEL_HAS_STATIC_IPS ?? "";
  return {
    syncMode: (process.env.TRACK_RECORD_SYNC_MODE === "live" ? "live" : "mock") as SyncMode,
    myfxbookEmail: process.env.MYFXBOOK_EMAIL ?? "",
    myfxbookPassword: process.env.MYFXBOOK_PASSWORD ?? "",
    myfxbookAccountId: process.env.MYFXBOOK_ACCOUNT_ID ?? "",
    myfxbookBrokerTimezone: process.env.MYFXBOOK_BROKER_TIMEZONE ?? "",
    darwinexAccessToken: process.env.DARWINEX_ACCESS_TOKEN ?? "",
    darwinexClientId: process.env.DARWINEX_CLIENT_ID ?? "",
    darwinexClientSecret: process.env.DARWINEX_CLIENT_SECRET ?? "",
    darwinexRefreshToken: process.env.DARWINEX_REFRESH_TOKEN ?? "",
    darwinexProductId: process.env.DARWINEX_PRODUCT_ID ?? "",
    darwinexInfoUrl: process.env.DARWINEX_INFO_URL ?? "",
    darwinexHistoryUrl: process.env.DARWINEX_HISTORY_URL ?? "",
    darwinexQuotesUrl: process.env.DARWINEX_QUOTES_URL ?? "",
    darwinexInvestorUrl: process.env.DARWINEX_INVESTOR_URL ?? "",
    cronSecret: process.env.CRON_SECRET ?? process.env.TRACK_RECORD_SYNC_TOKEN ?? "",
    vercelStaticIpConfigured: vercelStaticIpFlag === "1" || vercelStaticIpFlag.toLowerCase() === "true",
    hasSupabase: hasEnv("NEXT_PUBLIC_SUPABASE_URL") && hasEnv("SUPABASE_SERVICE_ROLE_KEY"),
    hasMyfxbookCredentials: hasEnv("MYFXBOOK_EMAIL") && hasEnv("MYFXBOOK_PASSWORD"),
    hasMyfxbookAccountId: hasEnv("MYFXBOOK_ACCOUNT_ID"),
    hasDarwinexCredentials:
      hasEnv("DARWINEX_ACCESS_TOKEN")
      || (hasEnv("DARWINEX_CLIENT_ID") && hasEnv("DARWINEX_CLIENT_SECRET") && hasEnv("DARWINEX_REFRESH_TOKEN")),
    hasDarwinexProductId: hasEnv("DARWINEX_PRODUCT_ID"),
    vercelDetected: Boolean(process.env.VERCEL),
  };
}

export function ensureCronSecret(request: Request) {
  const { cronSecret } = getTrackRecordEnv();
  if (!cronSecret) return true;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const direct = request.headers.get("x-track-record-token") ?? "";
  return bearer === cronSecret || direct === cronSecret;
}
