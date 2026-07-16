"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SentinelRole = "user" | "assistant";
export type SentinelMessage = { role: SentinelRole; content: string };

export type PageContext = {
  page: string;
  tab?: string;
  mode?: string;
  visibleTitle?: string;
};

function lsGet<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

function lsSet(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export function useSentinelChat(storageKey?: string) {
  const [messages, setMessages] = useState<SentinelMessage[]>(() =>
    storageKey ? lsGet<SentinelMessage[]>(storageKey, []) : []
  );
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const queuedRef = useRef<string | null>(null);
  const queuedCtxRef = useRef<PageContext | undefined>(undefined);
  const [hasQueued, setHasQueued] = useState(false);
  const prevBusyRef = useRef(false);

  const persist = useCallback(
    (msgs: SentinelMessage[]) => {
      if (storageKey) lsSet(storageKey, msgs);
    },
    [storageKey]
  );

  const send = useCallback(
    async (text: string, pageContext?: PageContext) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (busy) {
        queuedRef.current = trimmed;
        queuedCtxRef.current = pageContext;
        setHasQueued(true);
        setInput("");
        return;
      }

      const userMsg: SentinelMessage = { role: "user", content: trimmed };
      const newMsgs = [...messages, userMsg];
      const withPlaceholder: SentinelMessage[] = [...newMsgs, { role: "assistant", content: "" }];
      setMessages(withPlaceholder);
      setBusy(true);
      setInput("");

      try {
        const res = await fetch("/api/sentinel/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMsgs,
            stream: true,
            source: "butler",
            pageContext,
          }),
        });

        if (!res.ok || !res.body) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: "Sentinel nicht erreichbar." };
            return updated;
          });
          setBusy(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          const snap = accumulated;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: snap };
            return updated;
          });
        }

        const finalMsgs: SentinelMessage[] = [
          ...newMsgs,
          { role: "assistant", content: accumulated || "Sentinel hat keine Antwort gesendet." },
        ];
        setMessages(finalMsgs);
        persist(finalMsgs);
      } catch {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Verbindung zu Sentinel unterbrochen.",
          };
          return updated;
        });
      } finally {
        setBusy(false);
      }
    },
    [messages, busy, persist]
  );

  // Auto-fire queued message when busy transitions to false
  useEffect(() => {
    const wasJustCompleted = prevBusyRef.current && !busy;
    prevBusyRef.current = busy;
    if (wasJustCompleted && queuedRef.current) {
      const msg = queuedRef.current;
      const ctx = queuedCtxRef.current;
      queuedRef.current = null;
      queuedCtxRef.current = undefined;
      setHasQueued(false);
      send(msg, ctx);
    }
  }, [busy, send]);

  const clearChat = useCallback(() => {
    setMessages([]);
    if (storageKey) {
      try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  }, [storageKey]);

  return { messages, busy, input, setInput, send, clearChat, hasQueued };
}
