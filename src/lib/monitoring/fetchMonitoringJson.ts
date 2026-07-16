"use client";

import { getJson, setJson } from "@/lib/monitoring/data/monitoringDataCache";

type FetchMonitoringJsonOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  cacheKey?: string;
  ttlMs?: number;
  cacheMode?: RequestCache;
  skipCache?: boolean;
};

const DEFAULT_TIMEOUT_MS = 6_000;

const inflightJson = new Map<string, Promise<unknown | null>>();
const cachedAtByKey = new Map<string, number>();

function normalizeKey(url: string, cacheKey?: string): string {
  const preferred = String(cacheKey || "").trim();
  if (preferred) return preferred;
  return String(url || "").trim();
}

function isFresh(key: string, ttlMs?: number): boolean {
  if (!Number.isFinite(ttlMs) || Number(ttlMs) <= 0) return false;
  const cachedAt = cachedAtByKey.get(key);
  if (!Number.isFinite(cachedAt)) return false;
  return Date.now() - Number(cachedAt) <= Number(ttlMs);
}

export async function fetchMonitoringWithTimeout(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal?: AbortSignal,
  cacheMode: RequestCache = "no-store",
): Promise<Response> {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
  const handleAbort = () => controller.abort();

  try {
    if (signal) {
      if (signal.aborted) controller.abort();
      signal.addEventListener("abort", handleAbort, { once: true });
    }
    return await fetch(url, {
      cache: cacheMode,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timerId);
    if (signal) {
      signal.removeEventListener("abort", handleAbort);
    }
  }
}

export async function fetchMonitoringJson<T>(
  url: string,
  options: FetchMonitoringJsonOptions = {},
): Promise<T | null> {
  const {
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    cacheKey,
    ttlMs,
    cacheMode = "no-store",
    skipCache = false,
  } = options;

  const key = normalizeKey(url, cacheKey);
  if (!key) return null;
  if (signal?.aborted) return null;

  if (!skipCache) {
    const cached = getJson(key);
    if (cached !== null && (!Number.isFinite(ttlMs) || isFresh(key, ttlMs))) {
      return cached as T;
    }
  }

  const pending = inflightJson.get(key) as Promise<T | null> | undefined;
  if (pending) {
    return pending;
  }

  const request = (async () => {
    try {
      const response = await fetchMonitoringWithTimeout(url, timeoutMs, signal, cacheMode);
      if (!response.ok || signal?.aborted) return null;
      const json = (await response.json()) as T;
      if (signal?.aborted) return null;
      setJson(key, json);
      cachedAtByKey.set(key, Date.now());
      return json;
    } catch {
      return null;
    } finally {
      inflightJson.delete(key);
    }
  })();

  inflightJson.set(key, request);
  return request;
}
