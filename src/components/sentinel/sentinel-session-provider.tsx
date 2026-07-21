"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ChatEntry,
  lsClear,
  lsGet,
  lsSet,
  MAX_HISTORY,
  SENTINEL_DRAFT_KEY,
  SENTINEL_HISTORY_KEY,
  SENTINEL_SESSION_KEY,
  sentinelHistoryKey,
  type SentinelCurrentRun,
  type SentinelSessionState,
  type SentinelStatusPayload,
} from "@/lib/sentinel/sentinel-session-store";

type SentinelSessionContextValue = SentinelSessionState & {
  setInput: (value: string) => void;
  setEntries: React.Dispatch<React.SetStateAction<ChatEntry[]>>;
  send: (overrideText?: string, entriesOverride?: ChatEntry[]) => Promise<void>;
  clearHistory: () => void;
  refreshStatus: () => Promise<void>;
};

const DEFAULT_RUN: SentinelCurrentRun = {
  id: null,
  provider: null,
  status: "idle",
  startedAt: null,
  updatedAt: null,
  error: null,
};

const SentinelSessionContext = createContext<SentinelSessionContextValue | null>(null);

function loadInitialEntries(): ChatEntry[] {
  try {
    const raw = lsGet<unknown>(SENTINEL_HISTORY_KEY, []);
    if (!Array.isArray(raw)) {
      lsClear(SENTINEL_HISTORY_KEY);
      return [];
    }
    return (raw as ChatEntry[]).filter((entry) => entry && typeof entry === "object" && (entry.content || "").trim());
  } catch {
    lsClear(SENTINEL_HISTORY_KEY);
    return [];
  }
}

function loadInitialSession(): Partial<SentinelSessionState> {
  return lsGet<Partial<SentinelSessionState>>(SENTINEL_SESSION_KEY, {});
}

function nowIso() {
  return new Date().toISOString();
}

export function SentinelSessionProvider({ children, userId }: { children: React.ReactNode; userId?: string }) {
  const historyKey = userId ? sentinelHistoryKey(userId) : SENTINEL_HISTORY_KEY;
  const initialSession = loadInitialSession();
  const [entries, setEntries] = useState<ChatEntry[]>(() => {
    if (userId) {
      try {
        const raw = lsGet<unknown>(sentinelHistoryKey(userId), []);
        if (!Array.isArray(raw)) return [];
        return (raw as ChatEntry[]).filter((e) => e && typeof e === "object" && (e.content || "").trim());
      } catch { return []; }
    }
    return loadInitialEntries();
  });
  const [input, setInput] = useState(() => lsGet<string>(SENTINEL_DRAFT_KEY, ""));
  const [busy, setBusy] = useState(Boolean(initialSession.busy));
  const [sending, setSending] = useState(Boolean(initialSession.sending));
  const [streamStarted, setStreamStarted] = useState(Boolean(initialSession.streamStarted));
  const [error, setError] = useState<string | null>(initialSession.error ?? null);
  const [retryText, setRetryText] = useState<string | null>(initialSession.retryText ?? null);
  const [status, setStatus] = useState<SentinelStatusPayload | null>(initialSession.status ?? null);
  const [currentRun, setCurrentRun] = useState<SentinelCurrentRun>(initialSession.currentRun ?? DEFAULT_RUN);
  const [queuedPreview, setQueuedPreview] = useState<string | null>(initialSession.queuedPreview ?? null);

  const entriesRef = useRef(entries);
  const inputRef = useRef(input);
  const queuedMsgRef = useRef<string | null>(initialSession.queuedPreview ?? null);
  const queueInFlightRef = useRef(false);

  useEffect(() => {
    entriesRef.current = entries;
    lsSet(historyKey, entries.slice(-MAX_HISTORY));
  }, [entries]);

  useEffect(() => {
    inputRef.current = input;
    lsSet(SENTINEL_DRAFT_KEY, input);
  }, [input]);

  useEffect(() => {
    lsSet(SENTINEL_SESSION_KEY, {
      busy,
      sending,
      streamStarted,
      error,
      retryText,
      status,
      currentRun,
      hasQueued: Boolean(queuedMsgRef.current),
      queueCount: queuedMsgRef.current ? 1 : 0,
      queuedPreview,
    } satisfies Partial<SentinelSessionState>);
  }, [busy, sending, streamStarted, error, retryText, status, currentRun, queuedPreview]);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/sentinel/status", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as SentinelStatusPayload;
      setStatus((previous) => {
        const providerIsUsable = currentRun.provider
          ? payload.providers.find((provider) => provider.id === currentRun.provider)?.usable === true
          : false;
        if (currentRun.provider && providerIsUsable) {
          return { ...payload, activeProvider: currentRun.provider };
        }
        return payload;
      });
    } catch {
      setStatus((previous) => previous);
    }
  }, [currentRun.provider]);

  useEffect(() => {
    void refreshStatus();
    const id = window.setInterval(() => {
      void refreshStatus();
    }, 20000);
    return () => window.clearInterval(id);
  }, [refreshStatus]);

  const send = useCallback(async (overrideText?: string, entriesOverride?: ChatEntry[]) => {
    const text = (overrideText ?? inputRef.current).trim();
    if (!text) return;

    if (busy) {
      queuedMsgRef.current = text;
      setQueuedPreview(text);
      setCurrentRun((previous) => ({
        ...previous,
        status: previous.status === "streaming" ? "queued" : previous.status,
        updatedAt: nowIso(),
      }));
      setInput("");
      return;
    }

    const baseEntries = entriesOverride ?? entriesRef.current;
    const nextEntries = [...baseEntries, { role: "user", content: text } satisfies ChatEntry];
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    setInput("");
    setError(null);
    setRetryText(null);
    setBusy(true);
    setSending(true);
    setStreamStarted(false);
    setCurrentRun({
      id: `run-${Date.now()}`,
      provider: null,
      status: "streaming",
      startedAt: nowIso(),
      updatedAt: nowIso(),
      error: null,
    });

    const historyMessages = nextEntries.slice(-MAX_HISTORY).map((entry) => ({ role: entry.role, content: entry.content }));

    try {
      const res = await fetch("/api/sentinel/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyMessages, stream: true }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      const providerUsed = res.headers.get("x-sentinel-provider") as SentinelStatusPayload["activeProvider"];
      const tokensUsedHeader = res.headers.get("x-sentinel-tokens-used");

      if (providerUsed) {
        setCurrentRun((previous) => ({ ...previous, provider: providerUsed, updatedAt: nowIso() }));
        setStatus((previous) => previous ? { ...previous, activeProvider: providerUsed } : previous);
      }

      if (tokensUsedHeader && providerUsed) {
        const tokens = parseInt(tokensUsedHeader, 10);
        if (!isNaN(tokens) && tokens > 0) {
          void fetch("/api/sentinel/token-usage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: providerUsed, tokens }),
          }).catch(() => { /* ignore */ });
        }
      }

      if (!res.ok || contentType.includes("application/json")) {
        setSending(false);
        let data: { offline?: boolean; autoStartFailed?: boolean; detail?: string } = {};
        try {
          data = await res.json() as typeof data;
        } catch {
          // ignore
        }
        const message = data.detail?.trim()
          ? data.detail
          : data.autoStartFailed
            ? "Sentinel konnte Ollama nicht automatisch starten.\nBitte prüfen Sie, ob Ollama installiert ist und ausgeführt werden kann.\nErwartet: http://localhost:11434"
            : "Sentinel ist offline. Bitte Ollama starten.\nErwartet: http://localhost:11434";
        const failedEntries = [...nextEntries, { role: "assistant", content: message, meta: { sources: [] } } satisfies ChatEntry];
        entriesRef.current = failedEntries;
        setEntries(failedEntries);
        setError(message);
        setRetryText(text);
        setCurrentRun((previous) => ({ ...previous, status: "failed", error: message, updatedAt: nowIso() }));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Sentinel stream missing");

      const decoder = new TextDecoder();
      let fullContent = "";
      let entryAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;

        if (!entryAdded) {
          setSending(false);
          setStreamStarted(true);
          const withAssistant = [...entriesRef.current, { role: "assistant", content: fullContent, meta: { sources: [] } } satisfies ChatEntry];
          entriesRef.current = withAssistant;
          setEntries(withAssistant);
          entryAdded = true;
        } else {
          setEntries((previous) => {
            const updated = [...previous];
            const last = updated.length - 1;
            if (updated[last]?.role === "assistant") {
              updated[last] = { ...updated[last], content: fullContent };
            }
            entriesRef.current = updated;
            return updated;
          });
        }

        setCurrentRun((previous) => ({ ...previous, status: "streaming", updatedAt: nowIso() }));
      }

      if (!entryAdded) {
        const fallbackContent = fullContent || "Sentinel hat keine Antwort gesendet.";
        const finalEntries = [...entriesRef.current, { role: "assistant", content: fallbackContent, meta: { sources: [] } } satisfies ChatEntry];
        entriesRef.current = finalEntries;
        setEntries(finalEntries);
      }

      setCurrentRun((previous) => ({ ...previous, status: "completed", error: null, updatedAt: nowIso() }));
      setError(null);
      setRetryText(null);
    } catch (fetchError) {
      const message = fetchError instanceof Error && fetchError.message
        ? `Netzwerkfehler beim Erreichen von Sentinel.\n${fetchError.message}`
        : "Netzwerkfehler beim Erreichen von Sentinel.";
      const failedEntries = [...entriesRef.current, { role: "assistant", content: message, meta: { sources: [] } } satisfies ChatEntry];
      entriesRef.current = failedEntries;
      setEntries(failedEntries);
      setError(message);
      setRetryText(text);
      setCurrentRun((previous) => ({ ...previous, status: "failed", error: message, updatedAt: nowIso() }));
    } finally {
      setSending(false);
      setStreamStarted(false);
      setBusy(false);
      void refreshStatus();
    }
  }, [busy, refreshStatus]);

  useEffect(() => {
    if (busy || queueInFlightRef.current || !queuedMsgRef.current) return;
    const nextMessage = queuedMsgRef.current;
    queuedMsgRef.current = null;
    setQueuedPreview(null);
    queueInFlightRef.current = true;
    void send(nextMessage).finally(() => {
      queueInFlightRef.current = false;
    });
  }, [busy, send]);

  const clearHistory = useCallback(() => {
    setEntries([]);
    entriesRef.current = [];
    setError(null);
    setRetryText(null);
    setCurrentRun(DEFAULT_RUN);
    queuedMsgRef.current = null;
    setQueuedPreview(null);
    lsClear(historyKey);
    lsClear(SENTINEL_SESSION_KEY);
  }, []);

  const value = useMemo<SentinelSessionContextValue>(() => ({
    entries,
    input,
    busy,
    sending,
    streamStarted,
    error,
    retryText,
    hasQueued: Boolean(queuedMsgRef.current),
    queueCount: queuedMsgRef.current ? 1 : 0,
    queuedPreview,
    status,
    currentRun,
    setInput,
    setEntries,
    send,
    clearHistory,
    refreshStatus,
  }), [entries, input, busy, sending, streamStarted, error, retryText, queuedPreview, status, currentRun, send, clearHistory, refreshStatus]);

  return (
    <SentinelSessionContext.Provider value={value}>
      {children}
    </SentinelSessionContext.Provider>
  );
}

export function useSentinelSession() {
  const context = useContext(SentinelSessionContext);
  if (!context) throw new Error("useSentinelSession must be used within SentinelSessionProvider");
  return context;
}
