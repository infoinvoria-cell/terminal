import type { NextRequest } from "next/server";

export type CapitalifeFailureKey =
  | "investor-db-api"
  | "monitoring-live-feed"
  | "brain-api"
  | "engine-data"
  | "analytics-dataset";

const COOKIE_NAME = "capitalife_failures";
const HEADER_NAME = "x-capitalife-failures";
const QUERY_NAME = "cf_fail";

function parseFailureList(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function getFailureRequestId(request: NextRequest): string | null {
  return request.headers.get("x-request-id") ?? request.headers.get("x-vercel-id");
}

export function shouldInjectFailure(request: NextRequest, key: CapitalifeFailureKey): boolean {
  const url = new URL(request.url);
  const fromQuery = parseFailureList(url.searchParams.get(QUERY_NAME));
  const fromHeader = parseFailureList(request.headers.get(HEADER_NAME));
  const fromCookie = parseFailureList(request.cookies.get(COOKIE_NAME)?.value);
  return fromQuery.has(key) || fromHeader.has(key) || fromCookie.has(key);
}

export function failureModeCookieName() {
  return COOKIE_NAME;
}
