"use client";

import { useEffect, useRef } from "react";
import { useSentinelChat } from "@/hooks/use-sentinel-chat";

// Mobile Sentinel chat. Uses the exact same streaming endpoint + hook the desktop
// butler uses (useSentinelChat → POST /api/sentinel/chat, stream:true). Adds a
// mobile-first layout: scrolling message column + a fixed input bar above the tab
// bar, and the Aurum icon (rotating gold arcs) as the assistant identity/spinner.

const GOLD = "#e2ca7a";
const GOLD_DEEP = "#d6b86c";
const CARD_BG = "#1c1d20";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const STORAGE_KEY = "fmd_mobile_sentinel_chat";
const INPUT_BAR_H = 60;

const SUGGESTIONS = [
  "Wie ist der aktuelle Portfolio-Status?",
  "Welche Signale sind offen?",
  "Fasse die White-Swan-Strategie zusammen.",
];

// ── Aurum icon: rotating concentric gold arcs around the Sentinel mark ──────────
function AurumIcon({ size = 30, spinning = false }: { size?: number; spinning?: boolean }) {
  const s = size;
  return (
    <span style={{ position: "relative", display: "inline-flex", width: s, height: s, flexShrink: 0 }}>
      <svg
        width={s}
        height={s}
        viewBox="0 0 260 260"
        style={{ position: "absolute", inset: 0, animation: spinning ? "aur-cw 3.2s linear infinite" : undefined }}
      >
        <circle cx="130" cy="130" r="120" fill="none" stroke={GOLD} strokeOpacity="0.9" strokeWidth="6" strokeDasharray="150 250" strokeLinecap="round" />
        <circle cx="130" cy="130" r="120" fill="none" stroke={GOLD} strokeOpacity="0.9" strokeWidth="6" strokeDasharray="150 250" strokeDashoffset="400" strokeLinecap="round" />
      </svg>
      <svg
        width={s}
        height={s}
        viewBox="0 0 260 260"
        style={{ position: "absolute", inset: 0, animation: spinning ? "aur-ccw 2.4s linear infinite" : undefined }}
      >
        <circle cx="130" cy="130" r="92" fill="none" stroke={GOLD_DEEP} strokeOpacity="0.75" strokeWidth="7" strokeDasharray="110 200" strokeLinecap="round" />
      </svg>
      <img
        src="/Sentinel.png"
        alt="Sentinel"
        width={s * 0.62}
        height={s * 0.62}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          objectFit: "cover",
        }}
      />
    </span>
  );
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "82%",
            background: `${GOLD}14`,
            border: `1px solid ${GOLD}30`,
            borderRadius: "14px 14px 4px 14px",
            padding: "9px 12px",
            fontSize: 13.5,
            lineHeight: 1.5,
            color: "#f4f0e6",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {content}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
      <AurumIcon size={26} spinning={content === ""} />
      <div
        style={{
          maxWidth: "82%",
          background: CARD_BG,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: "4px 14px 14px 14px",
          padding: "9px 12px",
          fontSize: 13.5,
          lineHeight: 1.55,
          color: "rgba(255,255,255,0.9)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minHeight: 18,
        }}
      >
        {content === "" ? (
          <span style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>Sentinel denkt nach…</span>
        ) : (
          content
        )}
      </div>
    </div>
  );
}

export function MobileSentinelView() {
  const { messages, busy, input, setInput, send, clearChat } = useSentinelChat(STORAGE_KEY);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    send(text, { page: "mobile-sentinel" });
  };

  const empty = messages.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <style>{`
        @keyframes aur-cw { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes aur-ccw { from { transform: rotate(0deg) } to { transform: rotate(-360deg) } }
      `}</style>

      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "16px 16px 12px",
          background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AurumIcon size={30} spinning={busy} />
          <div>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-montserrat), sans-serif" }}>
              Sentinel
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: busy ? GOLD : "rgba(255,255,255,0.42)", fontWeight: 600 }}>
              {busy ? "antwortet…" : "KI-Assistent"}
            </p>
          </div>
        </div>
        {!empty && (
          <button
            onClick={clearChat}
            aria-label="Chat löschen"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 9,
              color: "rgba(255,255,255,0.5)",
              fontSize: 11,
              fontWeight: 600,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Neu
          </button>
        )}
      </header>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: `4px 16px calc(${INPUT_BAR_H}px + 20px)`,
        }}
      >
        {empty ? (
          <div style={{ marginTop: 30, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16 }}>
            <AurumIcon size={64} spinning={false} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-montserrat), sans-serif" }}>
                Guten Tag.
              </div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.45)", marginTop: 4, maxWidth: 240 }}>
                Frag mich zu Portfolio, Signalen oder Strategien.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", marginTop: 4 }}>
              {SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  onClick={() => send(sug, { page: "mobile-sentinel" })}
                  style={{
                    textAlign: "left",
                    background: CARD_BG,
                    border: `1px solid ${CARD_BORDER}`,
                    borderRadius: 12,
                    padding: "11px 13px",
                    color: "rgba(255,255,255,0.78)",
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)
        )}
        <div ref={endRef} />
      </div>

      {/* Fixed input bar — sits just above the bottom tab bar */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: "calc(66px + env(safe-area-inset-bottom, 0px))",
          zIndex: 30,
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          padding: "8px 12px",
          background: "rgba(12,13,16,0.96)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: `1px solid ${CARD_BORDER}`,
        }}
      >
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            const ta = e.target;
            ta.style.height = "auto";
            ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
              if (taRef.current) taRef.current.style.height = "auto";
            }
          }}
          rows={1}
          placeholder="Nachricht an Sentinel…"
          style={{
            flex: 1,
            resize: "none",
            background: CARD_BG,
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 12,
            padding: "10px 12px",
            color: "#fafafa",
            fontSize: 14,
            lineHeight: 1.4,
            outline: "none",
            maxHeight: 96,
            fontFamily: "var(--font-nunito), sans-serif",
          }}
        />
        <button
          onClick={() => {
            submit();
            if (taRef.current) taRef.current.style.height = "auto";
          }}
          disabled={!input.trim()}
          aria-label="Senden"
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: 12,
            border: "none",
            background: input.trim() ? GOLD : "rgba(255,255,255,0.08)",
            color: input.trim() ? "#0c0d10" : "rgba(255,255,255,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: input.trim() ? "pointer" : "default",
            transition: "background 140ms ease",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
