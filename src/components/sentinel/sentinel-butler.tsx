"use client";

import { useEffect, useRef, useState } from "react";
import { useGlobalPage } from "@/context/global-page-context";
import { useSentinelChat } from "@/hooks/use-sentinel-chat";

const BUTLER_STORAGE_KEY = "fmd_sentinel_butler_chat";

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function IconSend() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function IconExpand() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

// ── Sentinel robot icon ───────────────────────────────────────────────────────

function SentinelMini({ size = 24, animate = false }: { size?: number; animate?: boolean }) {
  return (
    <img
      src="/assets/sentinel/sentinel-robot.png"
      alt="Sentinel"
      width={size}
      height={size}
      style={{
        borderRadius: "9999px",
        objectFit: "cover",
        filter: animate ? "drop-shadow(0 0 5px rgba(216,192,113,0.55))" : undefined,
        transition: "filter 0.3s ease",
      }}
    />
  );
}

// ── Markdown renderer (minimal) ───────────────────────────────────────────────

function ButlerMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) { elements.push(<div key={i} style={{ height: 6 }} />); i++; continue; }
    if (line.startsWith("## ")) {
      elements.push(<p key={i} style={{ fontWeight: 700, fontSize: 12, color: "#e8eaed", margin: "4px 0 2px" }}>{line.slice(3)}</p>);
    } else if (line.startsWith("### ")) {
      elements.push(<p key={i} style={{ fontWeight: 600, fontSize: 11, color: "#d0d3d9", margin: "3px 0 1px" }}>{line.slice(4)}</p>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(<p key={i} style={{ margin: "1px 0", paddingLeft: 10, color: "#c8cad0", fontSize: 12 }}>• {renderInline(line.slice(2))}</p>);
    } else if (line.startsWith("---")) {
      elements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.07)", margin: "6px 0" }} />);
    } else {
      elements.push(<p key={i} style={{ margin: "2px 0", color: "#c8cad0", fontSize: 12, lineHeight: 1.55 }}>{renderInline(line)}</p>);
    }
    i++;
  }
  return <div>{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "#e8eaed", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 3, padding: "0 3px", fontSize: 11, fontFamily: "monospace", color: "#c8cad0" }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

// ── Main Butler component ─────────────────────────────────────────────────────

export function SentinelButler() {
  const [open, setOpen] = useState(false);
  const { currentPage, currentTab, currentMode, visibleTitle } = useGlobalPage();
  const { messages, busy, input, setInput, send, clearChat, hasQueued } = useSentinelChat(BUTLER_STORAGE_KEY);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const pageCtx = { page: currentPage, tab: currentTab, mode: currentMode, visibleTitle };

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, autoScroll]);

  // Detect manual scroll up
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distFromBottom < 80);
  };

  // Focus textarea when opened
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 120);
  }, [open]);

  // External toggle (e.g. from topbar button)
  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("sentinel-butler-toggle", handler);
    return () => window.removeEventListener("sentinel-butler-toggle", handler);
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    send(text, pageCtx);
    setAutoScroll(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`;
  };

  const goToSentinelPage = () => {
    // Navigate to sentinel page via sidebar click simulation or context setter
    // The simplest approach: dispatch a custom event the fund-manager-home listens to
    window.dispatchEvent(new CustomEvent("sentinel-butler-open-full"));
    setOpen(false);
  };

  return (
    <>
      {/* Inline styles for animations */}
      <style>{`
        @keyframes butler-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes butler-spin-rev { from { transform: rotate(0deg) } to { transform: rotate(-360deg) } }
        @keyframes butler-pulse { 0%,100% { opacity:0.6; transform:scale(1) } 50% { opacity:1; transform:scale(1.04) } }
        .butler-btn:hover { background: rgba(255,255,255,0.07) !important; transform: scale(1.03); }
        .butler-btn:active { transform: scale(0.97); }
        .butler-scrollbar::-webkit-scrollbar { width: 4px; }
        .butler-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .butler-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 2px; }
        .butler-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
        .butler-input:focus { outline: none; }
        .butler-action-btn { background:none; border:none; cursor:pointer; padding:4px; border-radius:6px; transition:background 0.15s,color 0.15s; }
        .butler-action-btn:hover { background:rgba(255,255,255,0.08); }
      `}</style>

      {/* Pop-up */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 80,
            right: 24,
            zIndex: 8999,
            width: "min(420px, calc(100vw - 48px))",
            maxHeight: "calc(100vh - 120px)",
            display: "flex",
            flexDirection: "column",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(16,17,20,0.97)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 24px 64px -12px rgba(0,0,0,0.85), 0 0 0 1px rgba(214,184,108,0.06)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px 10px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              flexShrink: 0,
            }}
          >
            <SentinelMini size={20} animate={busy} />
            <span
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: 600,
                color: "#e8eaed",
                fontFamily: "var(--font-montserrat,sans-serif)",
                letterSpacing: "0.01em",
              }}
            >
              Sentinel
            </span>
            {/* Page context chip */}
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#8a7a4a",
                background: "rgba(214,184,108,0.09)",
                border: "1px solid rgba(214,184,108,0.18)",
                borderRadius: 20,
                padding: "2px 8px",
                fontFamily: "var(--font-montserrat,sans-serif)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {visibleTitle}
            </span>
            {/* Expand to full sentinel */}
            <button
              type="button"
              className="butler-action-btn"
              onClick={goToSentinelPage}
              aria-label="Volle Sentinel-Seite öffnen"
              title="Volle Sentinel-Seite"
              style={{ color: "#555", transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#aaa")}
              onMouseLeave={e => (e.currentTarget.style.color = "#555")}
            >
              <IconExpand />
            </button>
            {/* Clear */}
            <button
              type="button"
              className="butler-action-btn"
              onClick={clearChat}
              aria-label="Chat leeren"
              title="Chat leeren"
              style={{ color: "#555", transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#aaa")}
              onMouseLeave={e => (e.currentTarget.style.color = "#555")}
            >
              <IconTrash />
            </button>
            {/* Close */}
            <button
              type="button"
              className="butler-action-btn"
              onClick={() => setOpen(false)}
              aria-label="Schließen"
              style={{ color: "#555", transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#ccc")}
              onMouseLeave={e => (e.currentTarget.style.color = "#555")}
            >
              <IconClose />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="butler-scrollbar"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px 14px 6px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 180,
              maxHeight: "calc(100vh - 260px)",
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingTop: 24,
                  paddingBottom: 12,
                }}
              >
                <SentinelMini size={36} />
                <p
                  style={{
                    fontSize: 12,
                    color: "#555",
                    textAlign: "center",
                    fontFamily: "var(--font-montserrat,sans-serif)",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Sentinel aktiv · Seite: <strong style={{ color: "#7a6a3a" }}>{visibleTitle}</strong>
                  <br />Frage stellen oder Brain durchsuchen.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                {msg.role === "user" ? (
                  <div
                    style={{
                      maxWidth: "82%",
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      borderRadius: "14px 14px 4px 14px",
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#d8dae0",
                      fontFamily: "var(--font-montserrat,sans-serif)",
                      lineHeight: 1.5,
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.content}
                  </div>
                ) : (
                  <div
                    style={{
                      maxWidth: "92%",
                      paddingLeft: 4,
                    }}
                  >
                    {msg.content ? (
                      <ButlerMarkdown text={msg.content} />
                    ) : (
                      <span style={{ fontSize: 11, color: "#555", fontStyle: "italic" }}>
                        Sentinel formuliert…
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {hasQueued && (
              <p style={{ fontSize: 10, color: "#6a5a30", textAlign: "center", margin: "2px 0", fontFamily: "var(--font-montserrat,sans-serif)" }}>
                1 Nachricht in Warteschlange
              </p>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div
            style={{
              flexShrink: 0,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              padding: "10px 12px 12px",
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
            }}
          >
            <textarea
              ref={textareaRef}
              className="butler-input"
              rows={1}
              placeholder={
                busy
                  ? "Tippen erlaubt — wird nach Antwort gesendet…"
                  : `Frage auf ${visibleTitle}…`
              }
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 12,
                padding: "8px 12px",
                fontSize: 12,
                color: "#d8dae0",
                fontFamily: "var(--font-montserrat,sans-serif)",
                resize: "none",
                lineHeight: 1.5,
                minHeight: 34,
                maxHeight: 100,
                overflowY: "auto",
                caretColor: "#d6b86c",
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() && !busy}
              aria-label="Senden"
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: input.trim()
                  ? "rgba(214,184,108,0.14)"
                  : "rgba(255,255,255,0.04)",
                color: input.trim() ? "#d6b86c" : "#444",
                cursor: input.trim() ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s, color 0.15s",
                flexShrink: 0,
              }}
            >
              <IconSend />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
