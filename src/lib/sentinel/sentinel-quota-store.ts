// Persistent file-based quota tracking — survives server restarts
// Stored in .next/sentinel-quota.json (gitignored, created on first write)
import fs from "fs";
import path from "path";

export const GROQ_FREE_DAILY_TOKEN_LIMIT = 14_400;

type QuotaEntry = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  failureCount: number;
  rateLimitCount: number;
  lastErrorCode: string | null;
  lastSuccessAt: string | null;
  blockedUntil: string | null;
};

type QuotaStore = Record<string, QuotaEntry>;

const STORE_PATH = path.join(process.cwd(), ".next", "sentinel-quota.json");

function emptyEntry(date: string): QuotaEntry {
  return { date, inputTokens: 0, outputTokens: 0, requestCount: 0, failureCount: 0, rateLimitCount: 0, lastErrorCode: null, lastSuccessAt: null, blockedUntil: null };
}

function loadStore(): QuotaStore {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as QuotaStore;
  } catch {
    return {};
  }
}

function saveStore(store: QuotaStore): void {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = STORE_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
    fs.renameSync(tmp, STORE_PATH);
  } catch { /* fail silently — quota tracking is best-effort */ }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayKey(provider: string): string {
  return `${provider}:${todayUtc()}`;
}

export function recordRequest(
  provider: string,
  opts: { inputTokens: number; outputTokens: number; success: boolean; rateLimited?: boolean; errorCode?: string },
): void {
  try {
    const store = loadStore();
    const key = todayKey(provider);
    const entry = store[key] ?? emptyEntry(todayUtc());
    entry.inputTokens += opts.inputTokens;
    entry.outputTokens += opts.outputTokens;
    entry.requestCount += 1;
    if (!opts.success) entry.failureCount += 1;
    if (opts.rateLimited) entry.rateLimitCount += 1;
    if (opts.errorCode) entry.lastErrorCode = opts.errorCode;
    if (opts.success) entry.lastSuccessAt = new Date().toISOString();
    store[key] = entry;
    saveStore(store);
  } catch { /* best-effort */ }
}

export function getDailyTokens(provider: string): number {
  try {
    const store = loadStore();
    const entry = store[todayKey(provider)];
    return (entry?.inputTokens ?? 0) + (entry?.outputTokens ?? 0);
  } catch { return 0; }
}

export function getDailyRequests(provider: string): number {
  try {
    const store = loadStore();
    return store[todayKey(provider)]?.requestCount ?? 0;
  } catch { return 0; }
}

export function isRateLimited(provider: string): boolean {
  try {
    const store = loadStore();
    const blockedUntil = store[todayKey(provider)]?.blockedUntil;
    if (!blockedUntil) return false;
    return new Date(blockedUntil).getTime() > Date.now();
  } catch { return false; }
}

export function setRateLimited(provider: string, untilMs: number): void {
  try {
    const store = loadStore();
    const key = todayKey(provider);
    const entry = store[key] ?? emptyEntry(todayUtc());
    entry.blockedUntil = new Date(untilMs).toISOString();
    store[key] = entry;
    saveStore(store);
  } catch { /* best-effort */ }
}

export function clearStaleEntries(): void {
  try {
    const store = loadStore();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let changed = false;
    for (const key of Object.keys(store)) {
      const date = key.split(":")[1];
      if (date && date < cutoff) {
        delete store[key];
        changed = true;
      }
    }
    if (changed) saveStore(store);
  } catch { /* best-effort */ }
}

export function getAllProviderStats(): Record<string, QuotaEntry | null> {
  try {
    const store = loadStore();
    const today = todayUtc();
    const providers = ["groq", "cerebras", "mistral", "cohere", "anthropic"];
    const result: Record<string, QuotaEntry | null> = {};
    for (const p of providers) {
      result[p] = store[`${p}:${today}`] ?? null;
    }
    return result;
  } catch { return {}; }
}
