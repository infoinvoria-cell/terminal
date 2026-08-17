import type { NextRequest } from "next/server";

export type ApiRouteClass =
  | "PUBLIC_READ_ONLY"
  | "LOCAL_ONLY"
  | "AUTHENTICATED_READ"
  | "AUTHENTICATED_WRITE"
  | "INTERNAL_SERVICE"
  | "BROKER_SENSITIVE"
  | "PRIVATE_DATA_SENSITIVE"
  | "DEV_ONLY";

export type ApiAuthorizationDecision = {
  allowed: boolean;
  status: 200 | 403 | 404;
  routeClass: ApiRouteClass;
  reason: string;
};

const PUBLIC_PREFIXES = [
  "/api/assets",
  "/api/events/",
  "/api/geo/",
  "/api/news/",
  "/api/overlay/",
  "/api/prices/globe",
  "/api/spy-returns",
  "/api/seasonality/deep/",
  "/api/seasonality/next-signal",
  "/api/seasonality/validation",
  "/api/auth/simple-gate",
] as const;

const DEV_ONLY_PREFIXES = [
  "/api/auto-start",
  "/api/start-services",
  "/api/debug-home",
  "/api/dev/",
] as const;

const BROKER_PREFIXES = [
  "/api/monitoring/trade-execution",
  "/api/mobile/execution",
] as const;

const PRIVATE_PREFIXES = [
  "/api/admin/",
  "/api/brain/",
  "/api/brain-graph/",
  "/api/investor-db",
  "/api/investors-crm",
  "/api/mobile/brain/",
  "/api/track-record/",
] as const;

const LOCAL_PREFIXES = [
  "/api/engine",
  "/api/sentinel/",
  "/api/system-graph",
  "/api/system/health",
  "/api/datahub/sync",
  "/api/components-cache",
] as const;

const INTERNAL_PREFIXES = [
  "/api/components-cache",
  "/api/datahub/sync",
  "/api/market-data/confirm",
  "/api/sentinel/connect/health",
  "/api/sentinel/connect/providers",
] as const;

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function classifyApiRoute(pathname: string): ApiRouteClass {
  if (startsWithAny(pathname, PUBLIC_PREFIXES)) return "PUBLIC_READ_ONLY";
  if (startsWithAny(pathname, DEV_ONLY_PREFIXES)) return "DEV_ONLY";
  if (startsWithAny(pathname, BROKER_PREFIXES)) return "BROKER_SENSITIVE";
  if (startsWithAny(pathname, PRIVATE_PREFIXES)) {
    return /\/migrate$|\/cleanup-z-rows$|\/sync$|\/\[?id?\]?$/i.test(pathname)
      ? "AUTHENTICATED_WRITE"
      : "PRIVATE_DATA_SENSITIVE";
  }
  if (startsWithAny(pathname, INTERNAL_PREFIXES)) return "INTERNAL_SERVICE";
  if (startsWithAny(pathname, LOCAL_PREFIXES)) return "LOCAL_ONLY";
  if (pathname.startsWith("/api/monitoring/")) return "AUTHENTICATED_READ";
  if (pathname.startsWith("/api/core-invest/") || pathname.startsWith("/api/white-swan-")) return "AUTHENTICATED_READ";
  return "PUBLIC_READ_ONLY";
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function hasInternalToken(request: Request): boolean {
  const expected = process.env.CAPITALIFE_LOCAL_API_TOKEN?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const header = request.headers.get("x-capitalife-internal-token")?.trim();
  return bearer === expected || header === expected;
}

export function authorizeApiRequest(request: Request | NextRequest): ApiAuthorizationDecision {
  const pathname = new URL(request.url).pathname;
  const routeClass = classifyApiRoute(pathname);

  if (routeClass === "PUBLIC_READ_ONLY") {
    return { allowed: true, status: 200, routeClass, reason: "public-read-only" };
  }

  const internal = hasInternalToken(request);
  const hostname = new URL(request.url).hostname;
  const loopback = isLoopbackHostname(hostname);
  const cloud = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV);
  const productionDisabled = process.env.CAPITALIFE_API_PRODUCTION_DISABLED === "true";

  if (routeClass === "DEV_ONLY" && (process.env.NODE_ENV === "production" || cloud || productionDisabled)) {
    return { allowed: false, status: 404, routeClass, reason: "dev-route-disabled-in-production" };
  }

  if (internal) {
    return { allowed: true, status: 200, routeClass, reason: "internal-token" };
  }

  if (cloud && routeClass !== "AUTHENTICATED_READ") {
    return { allowed: false, status: 404, routeClass, reason: "local-sensitive-route-disabled-in-cloud" };
  }

  if (loopback) {
    return { allowed: true, status: 200, routeClass, reason: "loopback-local" };
  }

  return { allowed: false, status: 403, routeClass, reason: "non-loopback-request-requires-internal-token" };
}
