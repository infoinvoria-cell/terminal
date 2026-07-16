import type { MonitoringCandle } from "@/lib/monitoring/loadMonitoringCandles";

type CachedCandles = {
  source: string;
  timeframe: string;
  version: string;
  bars: MonitoringCandle[];
  usedAt: number;
};

type CachedJson = {
  value: unknown;
  usedAt: number;
};

const candlesByKey = new Map<string, CachedCandles>();
const jsonByPath = new Map<string, CachedJson>();

function normalizeSource(source: string): string {
  return String(source || "").trim().toUpperCase();
}

function normalizeTimeframe(timeframe: string): string {
  return String(timeframe || "D").trim().toUpperCase();
}

function normalizeVersion(version?: string | null): string {
  return String(version || "").trim();
}

function candleKey(source: string, timeframe: string, version?: string | null): string {
  return `${normalizeSource(source)}|${normalizeTimeframe(timeframe)}|${normalizeVersion(version)}`;
}

export function getCandles(source: string, timeframe: string, maxBars: number, version?: string | null): MonitoringCandle[] | null {
  const key = candleKey(source, timeframe, version);
  const row = candlesByKey.get(key);
  if (!row) return null;
  row.usedAt = Date.now();
  if (maxBars > 0) return row.bars.slice(-maxBars);
  return row.bars.slice();
}

export function setCandles(source: string, timeframe: string, bars: MonitoringCandle[], version?: string | null): void {
  const key = candleKey(source, timeframe, version);
  candlesByKey.set(key, {
    source: normalizeSource(source),
    timeframe: normalizeTimeframe(timeframe),
    version: normalizeVersion(version),
    bars: bars.slice(),
    usedAt: Date.now(),
  });
}

export function getJson(path: string): unknown | null {
  const key = String(path || "").trim();
  const row = jsonByPath.get(key);
  if (!row) return null;
  row.usedAt = Date.now();
  return row.value;
}

export function setJson(path: string, value: unknown): void {
  const key = String(path || "").trim();
  if (!key) return;
  jsonByPath.set(key, { value, usedAt: Date.now() });
}

export function clearInactive(activeKeys: string[] = []): void {
  const active = new Set(activeKeys.map((k) => String(k || "").trim().toUpperCase()));
  for (const [key] of candlesByKey.entries()) {
    if (!active.has(key.toUpperCase())) candlesByKey.delete(key);
  }
}

export function clearCandles(): void {
  candlesByKey.clear();
}

export function clearAll(): void {
  candlesByKey.clear();
  jsonByPath.clear();
}
