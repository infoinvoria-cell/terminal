"use client";

export type SentinelRole = "user" | "assistant";
export type SourceItem = { path: string; heading?: string; score: number };
export type AssistantMeta = {
  sources?: SourceItem[];
  confidence?: string;
  oneLiner?: string;
  providerUsed?: string;
  model?: string;
  fallbackUsed?: boolean;
};
export type ChatEntry = { role: SentinelRole; content: string; meta?: AssistantMeta };

export type SentinelProviderStatus = {
  id: "local" | "ollama" | "groq" | "anthropic" | "custom";
  label: string;
  configured: boolean;
  enabled: boolean;
  available: boolean;
  usable: boolean;
  reason: string;
  message: string;
  model: string | null;
  active: boolean;
};

export type SentinelStatusPayload = {
  activeProvider: SentinelProviderStatus["id"] | null;
  mode: "auto" | "local" | "ollama" | "groq" | "anthropic" | "custom";
  fallbackProvider: SentinelProviderStatus["id"] | null;
  providers: SentinelProviderStatus[];
  brain: { available: boolean; loaded: boolean; message: string };
  apisDisabled: boolean;
  customApiDisabled: boolean;
  partnerMode: boolean;
  requireLocalFallback: boolean;
};

export type SentinelRunStatus = "idle" | "queued" | "streaming" | "completed" | "failed" | "cancelled";

export type SentinelCurrentRun = {
  id: string | null;
  provider: SentinelProviderStatus["id"] | null;
  status: SentinelRunStatus;
  startedAt: string | null;
  updatedAt: string | null;
  error: string | null;
};

export type SentinelSessionState = {
  entries: ChatEntry[];
  input: string;
  busy: boolean;
  sending: boolean;
  streamStarted: boolean;
  error: string | null;
  retryText: string | null;
  hasQueued: boolean;
  queueCount: number;
  queuedPreview: string | null;
  status: SentinelStatusPayload | null;
  currentRun: SentinelCurrentRun;
};

export const SENTINEL_HISTORY_KEY = "fmd_sentinel_history";
export const SENTINEL_DRAFT_KEY = "fmd_sentinel_draft";
export const SENTINEL_SESSION_KEY = "fmd_sentinel_session";
export const MAX_HISTORY = 30;

export function lsGet<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function lsClear(key: string) {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
