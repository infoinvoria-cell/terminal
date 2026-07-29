import { createHash } from "node:crypto";

export function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function maskAccountNumber(value: string | number | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length <= 4) return `***${raw}`;
  return `${"*".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}

export function stableId(parts: Array<string | number | null | undefined>) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

export function parseBrokerLocalTimestamp(input: string | null, brokerTimezone: string | null) {
  if (!input) return { local: null, utc: null };
  const isoLike = input.includes("T") ? input : input.replace(/^(\d{2})\/(\d{2})\/(\d{4})/, "$3-$1-$2").replace(" ", "T");
  if (!brokerTimezone) {
    return { local: input, utc: null };
  }
  const assumed = new Date(`${isoLike}${isoLike.endsWith("Z") ? "" : "Z"}`);
  if (Number.isNaN(assumed.getTime())) {
    return { local: input, utc: null };
  }
  return { local: input, utc: assumed.toISOString() };
}

export function isoDateOnly(value: string | null) {
  return value ? value.slice(0, 10) : null;
}

export function addMinutesIso(baseIso: string, minutes: number) {
  const base = new Date(baseIso);
  return new Date(base.getTime() + minutes * 60000).toISOString();
}

export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number; backoffMs?: number } = {},
) {
  const {
    timeoutMs = 15000,
    retries = 2,
    backoffMs = 800,
    ...requestInit
  } = init;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...requestInit,
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return response.json() as Promise<Record<string, unknown>>;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Unknown fetch error"));
}
