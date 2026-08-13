// Server-only: Node.js fs module — do not import from client code.
// Persistent file-based usage tracking stored in .runtime/sentinel/provider-usage.json
import fs from "fs";
import path from "path";

export const GROQ_FREE_DAILY_TOKEN_LIMIT = 14_400;

export type ProviderUsageState = {
  provider: string;
  date: string; // UTC YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  failureCount: number;
  rateLimitCount: number;
  blockedUntil: string | null; // ISO or null
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
};

export type ProviderUsageEvent = {
  provider: string;
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  rateLimited?: boolean;
  errorCode?: string;
};

export type ProviderBlockEvent = {
  provider: string;
  blockedUntilMs: number;
  reason: string;
};

export type UsageStore = Record<string, ProviderUsageState>; // key: "provider:YYYY-MM-DD"

const STORE_PATH = path.join(process.cwd(), ".runtime", "sentinel", "provider-usage.json");

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function storeKey(provider: string, date: string): string {
  return `${provider}:${date}`;
}

function emptyState(provider: string, date: string): ProviderUsageState {
  return {
    provider,
    date,
    inputTokens: 0,
    outputTokens: 0,
    requestCount: 0,
    failureCount: 0,
    rateLimitCount: 0,
    blockedUntil: null,
    lastSuccessAt: null,
    lastErrorCode: null,
  };
}

const LOCK_PATH = STORE_PATH + ".lock";
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 3_000;

function ensureDir(): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Acquire an exclusive file lock using O_CREAT|O_EXCL atomicity.
// Spins until the lock is acquired or the timeout expires.
// Removes stale locks (older than LOCK_STALE_MS) to prevent deadlocks.
function acquireLock(): boolean {
  ensureDir();
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx" });
      return true;
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") return false;
      // Check if lock is stale
      try {
        const stat = fs.statSync(LOCK_PATH);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(LOCK_PATH);
        }
      } catch { /* ignore */ }
    }
  }
  return false;
}

function releaseLock(): void {
  try { fs.unlinkSync(LOCK_PATH); } catch { /* already gone */ }
}

function withLock<T>(fn: () => T): T {
  const acquired = acquireLock();
  try {
    return fn();
  } finally {
    if (acquired) releaseLock();
  }
}

function loadStore(): UsageStore {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as UsageStore;
  } catch {
    return {};
  }
}

function saveStore(store: UsageStore): void {
  try {
    ensureDir();
    const content = JSON.stringify(store, null, 2);
    const tmp = STORE_PATH + ".tmp";
    fs.writeFileSync(tmp, content, "utf-8");
    // renameSync can fail transiently on Windows when a just-exited process still
    // holds a handle to the destination. Retry twice before falling back to a
    // direct write (safe because the caller holds the file lock).
    let renamed = false;
    for (let attempt = 0; attempt < 3 && !renamed; attempt++) {
      try {
        fs.renameSync(tmp, STORE_PATH);
        renamed = true;
      } catch { /* retry */ }
    }
    if (!renamed) {
      fs.writeFileSync(STORE_PATH, content, "utf-8");
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  } catch { /* best-effort */ }
}

function loadAndSave(updater: (store: UsageStore) => void): void {
  withLock(() => {
    const store = loadStore();
    updater(store);
    saveStore(store);
  });
}

export function getProviderState(provider: string): ProviderUsageState {
  try {
    const store = loadStore();
    const today = todayUtc();
    return store[storeKey(provider, today)] ?? emptyState(provider, today);
  } catch {
    return emptyState(provider, todayUtc());
  }
}

export function recordRequest(event: ProviderUsageEvent): void {
  try {
    loadAndSave((store) => {
      const today = todayUtc();
      const key = storeKey(event.provider, today);
      const entry = store[key] ?? emptyState(event.provider, today);
      entry.inputTokens += event.inputTokens;
      entry.outputTokens += event.outputTokens;
      entry.requestCount += 1;
      if (!event.success) entry.failureCount += 1;
      if (event.rateLimited) entry.rateLimitCount += 1;
      if (event.errorCode) entry.lastErrorCode = event.errorCode;
      if (event.success) entry.lastSuccessAt = new Date().toISOString();
      store[key] = entry;
    });
  } catch { /* best-effort */ }
}

export function blockProvider(event: ProviderBlockEvent): void {
  try {
    loadAndSave((store) => {
      const today = todayUtc();
      const key = storeKey(event.provider, today);
      const entry = store[key] ?? emptyState(event.provider, today);
      entry.blockedUntil = new Date(event.blockedUntilMs).toISOString();
      store[key] = entry;
    });
  } catch { /* best-effort */ }
}

export function resetExpiredLimits(nowUtcMs: number): void {
  try {
    loadAndSave((store) => {
      for (const key of Object.keys(store)) {
        const entry = store[key];
        if (entry.blockedUntil && new Date(entry.blockedUntil).getTime() <= nowUtcMs) {
          entry.blockedUntil = null;
        }
      }
    });
  } catch { /* best-effort */ }
}

export function getDailyTokens(provider: string): number {
  try {
    const entry = getProviderState(provider);
    return entry.inputTokens + entry.outputTokens;
  } catch { return 0; }
}

export function getDailyRequests(provider: string): number {
  try {
    return getProviderState(provider).requestCount;
  } catch { return 0; }
}

export function isBlocked(provider: string): boolean {
  try {
    const blockedUntil = getProviderState(provider).blockedUntil;
    if (!blockedUntil) return false;
    return new Date(blockedUntil).getTime() > Date.now();
  } catch { return false; }
}

export function clearStaleEntries(olderThanDays = 7): void {
  try {
    loadAndSave((store) => {
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      for (const key of Object.keys(store)) {
        const date = key.split(":")[1];
        if (date && date < cutoff) delete store[key];
      }
    });
  } catch { /* best-effort */ }
}

export function getUsageSummaryForRange(
  fromDateUtc: string,
  toDateUtc: string,
): { inputTokens: number; outputTokens: number; requests: number } {
  try {
    const store = loadStore();
    let inputTokens = 0, outputTokens = 0, requests = 0;
    for (const [key, entry] of Object.entries(store)) {
      const date = key.split(":")[1] ?? "";
      if (date >= fromDateUtc && date <= toDateUtc) {
        inputTokens += entry.inputTokens;
        outputTokens += entry.outputTokens;
        requests += entry.requestCount;
      }
    }
    return { inputTokens, outputTokens, requests };
  } catch {
    return { inputTokens: 0, outputTokens: 0, requests: 0 };
  }
}

// Circuit Breaker: record HTTP error codes and apply appropriate block durations
export function recordHttpError(provider: string, statusCode: number): void {
  try {
    loadAndSave((store) => {
      const today = todayUtc();
      const key = storeKey(provider, today);
      const entry = store[key] ?? emptyState(provider, today);
      entry.failureCount += 1;
      entry.lastErrorCode = String(statusCode);

      if (statusCode === 429) {
        entry.rateLimitCount += 1;
        const blockUntil = Date.now() + 60_000;
        if (!entry.blockedUntil || new Date(entry.blockedUntil).getTime() < blockUntil) {
          entry.blockedUntil = new Date(blockUntil).toISOString();
        }
        if (entry.rateLimitCount >= 3) {
          entry.blockedUntil = new Date(Date.now() + 5 * 60_000).toISOString();
        }
      } else if (statusCode === 402) {
        entry.blockedUntil = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      } else if (statusCode === 401 || statusCode === 403) {
        entry.blockedUntil = new Date(Date.now() + 60 * 60_000).toISOString();
      } else if (statusCode >= 500) {
        const blockUntil = Date.now() + 30_000;
        if (!entry.blockedUntil || new Date(entry.blockedUntil).getTime() < blockUntil) {
          entry.blockedUntil = new Date(blockUntil).toISOString();
        }
      }
      store[key] = entry;
    });
  } catch { /* best-effort */ }
}

export function getEarliestUsageDate(): string | null {
  try {
    const store = loadStore();
    const dates = Object.keys(store)
      .map(k => k.split(":")[1])
      .filter((d): d is string => !!d);
    if (dates.length === 0) return null;
    return dates.sort()[0] ?? null;
  } catch { return null; }
}

export function getAllProviderStates(): Record<string, ProviderUsageState | null> {
  try {
    const store = loadStore();
    const today = todayUtc();
    const providers = ["groq", "cerebras", "mistral", "cohere", "anthropic", "gemini", "openrouter", "github-models", "cloudflare", "huggingface", "ollama", "local"];
    const result: Record<string, ProviderUsageState | null> = {};
    for (const p of providers) {
      result[p] = store[storeKey(p, today)] ?? null;
    }
    return result;
  } catch { return {}; }
}
