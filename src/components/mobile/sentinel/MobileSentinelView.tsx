"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, ChevronDown, Copy, Grid2x2, Mic, MicOff,
  Pencil, Plus, RotateCcw, Send, Trash2, Volume2, VolumeX, X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useSentinelSession } from "@/components/sentinel/sentinel-session-provider";
import { TokenRing } from "@/components/sentinel/TokenRing";
import { lsGet, lsSet } from "@/lib/sentinel/sentinel-session-store";
import type { ChatEntry, SourceItem } from "@/lib/sentinel/sentinel-session-store";

// ── Types ────────────────────────────────────────────────────────────────────

type SentinelFavoritePrompt = {
  id: string;
  title: string;
  prompt: string;
  category: "trades" | "signals" | "risk" | "strategy" | "portfolio" | "project" | "custom";
  createdAt: string;
  updatedAt: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const MUTE_KEY      = "fmd_sentinel_muted";
const FAVORITES_KEY = "fmd_sentinel_favorites";
const TA_MAX_H      = 100;
const GREETING      = "Yo was geht ab Bro, Sentinel hier...";

const DEFAULT_FAVORITES: SentinelFavoritePrompt[] = [
  { id: "d1", title: "Portfolio Status",   category: "portfolio", prompt: "Aktueller Portfolio Status — Version, Sleeves, Entries.",           createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d2", title: "Sleeve Kennzahlen",  category: "strategy",  prompt: "Alle 5 Production Sleeves mit CAGR, Sharpe, Max DD.",              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d3", title: "V1 Blocker",         category: "project",   prompt: "Was sind die offenen Blocker für WS_PORTFOLIO_V1?",               createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d4", title: "Track Record",       category: "trades",    prompt: "Statement-based Track Record Zusammenfassung.",                   createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d5", title: "Compliance",         category: "risk",      prompt: "Compliance Regeln — Do Not Say Register.",                       createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d6", title: "Universe Zählung",   category: "strategy",  prompt: "Universe 42, Production 35, Seasonal 21 — Unterschiede erklären.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d7", title: "Performance Report", category: "trades",    prompt: "Performance Kennzahlen aus dem Performance Report.",              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// ── Speech helpers ───────────────────────────────────────────────────────────

type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: { length: number; isFinal: boolean; [i: number]: { [i: number]: { transcript: string } } }[] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] || w["webkitSpeechRecognition"] || null) as (new () => SpeechRecognitionLike) | null;
}

function getGermanVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter(v => /de(-|_)/i.test(v.lang));
}

function pickBestGermanVoice(voices: SpeechSynthesisVoice[], preferredUri?: string | null): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  if (preferredUri) { const pref = voices.find(v => v.voiceURI === preferredUri); if (pref) return pref; }
  const priority = [
    (v: SpeechSynthesisVoice) => /neural/i.test(v.name) && /de[-_]/i.test(v.lang),
    (v: SpeechSynthesisVoice) => /microsoft\s+stefan/i.test(v.name),
    (v: SpeechSynthesisVoice) => /microsoft\s+hedda/i.test(v.name),
    (v: SpeechSynthesisVoice) => /microsoft/i.test(v.name) && /de[-_]/i.test(v.lang),
    (v: SpeechSynthesisVoice) => /google/i.test(v.name) && /de[-_]/i.test(v.lang),
  ];
  for (const test of priority) { const hit = voices.find(test); if (hit) return hit; }
  return voices[0];
}

// ── Aurum Waves ───────────────────────────────────────────────────────────────

const BAR_CFG = [
  { h: 16, dur: 0.55 }, { h: 26, dur: 0.42 }, { h: 36, dur: 0.38 },
  { h: 26, dur: 0.48 }, { h: 16, dur: 0.52 },
];
const BAR_TOTAL_H = 42;

function AurumWaves({ voiceLevel = 0, speaking = false }: { voiceLevel?: number; speaking?: boolean }) {
  const barW = 3, gap = 8;
  const totalW = BAR_CFG.length * barW + (BAR_CFG.length - 1) * gap;
  const active = voiceLevel > 0.05 || speaking;
  return (
    <svg width={totalW} height={BAR_TOTAL_H} viewBox={`0 0 ${totalW} ${BAR_TOTAL_H}`} fill="none">
      {BAR_CFG.map((cfg, i) => (
        <rect key={i} x={i * (barW + gap)} y={(BAR_TOTAL_H - cfg.h) / 2} width={barW} height={cfg.h} rx={barW / 2}
          fill="#e2ca7a"
          opacity={active ? (i === 2 ? 1 : 0.72) : 0.30}
          className={active ? `maw-b maw-b${i}` : undefined}
        />
      ))}
      <style jsx>{`
        ${BAR_CFG.map((c, i) => `
          @keyframes maw-kf${i} { 0%,100% { transform:scaleY(0.5); } 50% { transform:scaleY(1); } }
          .maw-b${i} { transform-origin:center;transform-box:fill-box;animation:maw-kf${i} ${c.dur}s ease-in-out infinite;animation-delay:${(i*0.07).toFixed(2)}s; }
        `).join("")}
      `}</style>
    </svg>
  );
}

// ── Aurum Rings ───────────────────────────────────────────────────────────────

function AurumRings({ voiceLevel = 0, speaking = false, size = 210 }: { voiceLevel?: number; speaking?: boolean; size?: number }) {
  const glowBoost = voiceLevel * 0.35;
  const scale     = 1 + voiceLevel * 0.06;
  const fixed     = (v: number) => Number(v.toFixed(4));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, transform: `scale(${scale})`, transition: voiceLevel > 0 ? "transform 0.08s ease-out" : "transform 0.3s ease-out", transformOrigin: "center" }}>
      <svg width={size} height={size} viewBox="0 0 260 260" fill="none" style={{ overflow: "visible" }}>
        <circle cx="130" cy="130" r="118" stroke="rgba(214,184,108,0.08)" strokeWidth="0.7" />
        <circle cx="130" cy="130" r="100" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(214,184,108,0.13)" strokeWidth="1.0" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(255,255,255,0.06)" strokeWidth="0.7" />
        <circle cx="130" cy="130" r="62"  stroke="rgba(214,184,108,0.10)" strokeWidth="0.7" />
        <circle cx="130" cy="130" r="100" stroke="#d6b86c" strokeWidth={2.6 + voiceLevel * 0.8}
          strokeDasharray="138 490" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 ${5+glowBoost*12}px rgba(214,184,108,${0.65+glowBoost})) drop-shadow(0 0 12px rgba(214,184,108,0.25))` }}
          className="mar-a1" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(244,239,230,0.65)" strokeWidth="1.8"
          strokeDasharray="160 353" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 4px rgba(244,239,230,0.30))" }}
          className="mar-a2" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(214,184,108,0.75)" strokeWidth={1.6 + voiceLevel * 0.5}
          strokeDasharray="90 365" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 ${5+glowBoost*8}px rgba(214,184,108,${0.40+glowBoost*0.5}))` }}
          className="mar-a3" />
        <circle cx="130" cy="130" r="62"  stroke="rgba(244,239,230,0.50)" strokeWidth="1.2"
          strokeDasharray="70 319" strokeLinecap="round"
          className="mar-a4" />
        {Array.from({ length: 36 }).map((_, i) => {
          const a = (i * 10 * Math.PI) / 180;
          return (
            <line key={i}
              x1={fixed(130 + 95 * Math.cos(a))} y1={fixed(130 + 95 * Math.sin(a))}
              x2={fixed(130 + (i % 6 === 0 ? 91 : 93) * Math.cos(a))}
              y2={fixed(130 + (i % 6 === 0 ? 91 : 93) * Math.sin(a))}
              stroke={i % 6 === 0 ? "rgba(214,184,108,0.55)" : "rgba(214,184,108,0.28)"}
              strokeWidth={i % 6 === 0 ? "1.2" : "0.7"} />
          );
        })}
        <circle cx="130" cy="130" r="44" fill="url(#marGlow)" />
        <defs>
          <radialGradient id="marGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(214,184,108,0.12)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <AurumWaves voiceLevel={voiceLevel} speaking={speaking} />
      </div>
      <style jsx>{`
        .mar-a1 { transform-box:view-box;transform-origin:50% 50%;animation:mar-cw 18s linear infinite; }
        .mar-a2 { transform-box:view-box;transform-origin:50% 50%;animation:mar-ccw 24s linear infinite; }
        .mar-a3 { transform-box:view-box;transform-origin:50% 50%;animation:mar-cw 14s linear infinite; }
        .mar-a4 { transform-box:view-box;transform-origin:50% 50%;animation:mar-ccw 30s linear infinite; }
        @keyframes mar-cw  { to { transform:rotate(360deg); } }
        @keyframes mar-ccw { to { transform:rotate(-360deg); } }
      `}</style>
    </div>
  );
}

// ── Mini Aurum ────────────────────────────────────────────────────────────────

function MiniAurumRings() {
  return (
    <div style={{ position: "relative", width: 34, height: 34, flexShrink: 0 }}>
      <svg width="34" height="34" viewBox="0 0 260 260" fill="none" style={{ overflow: "visible" }}>
        <circle cx="130" cy="130" r="100" stroke="rgba(255,255,255,0.10)" strokeWidth="1.0" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(214,184,108,0.18)" strokeWidth="1.2" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(255,255,255,0.08)" strokeWidth="0.9" />
        <circle cx="130" cy="130" r="100" stroke="#d6b86c" strokeWidth="3.5"
          strokeDasharray="138 490" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 6px rgba(214,184,108,0.75))" }}
          className="mni-a1" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(244,239,230,0.70)" strokeWidth="2.2"
          strokeDasharray="160 353" strokeLinecap="round"
          className="mni-a2" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(214,184,108,0.80)" strokeWidth="2.0"
          strokeDasharray="90 365" strokeLinecap="round"
          className="mni-a3" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Sentinel.png" alt="" width={10} height={10} style={{ objectFit: "contain", opacity: 0.9 }} />
      </div>
      <style jsx>{`
        .mni-a1 { transform-box:view-box;transform-origin:50% 50%;animation:mni-cw 18s linear infinite; }
        .mni-a2 { transform-box:view-box;transform-origin:50% 50%;animation:mni-ccw 24s linear infinite; }
        .mni-a3 { transform-box:view-box;transform-origin:50% 50%;animation:mni-cw 14s linear infinite; }
        @keyframes mni-cw  { to { transform:rotate(360deg); } }
        @keyframes mni-ccw { to { transform:rotate(-360deg); } }
      `}</style>
    </div>
  );
}

// ── Sources Toggle ────────────────────────────────────────────────────────────

function SourcesToggle({ sources, confidence }: { sources: SourceItem[]; confidence?: string }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  const confColor = confidence === "high" ? "#d6b86c" : confidence === "medium" ? "rgba(255,255,255,0.55)" : "#ff6b72";
  return (
    <div style={{ marginTop: 4 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "rgba(120,132,148,0.55)", fontSize: 10, cursor: "pointer", padding: "2px 4px", borderRadius: 4, WebkitTapHighlightColor: "transparent" }}>
        <span>{open ? "▾" : "▸"}</span>
        <span>{sources.length} {sources.length === 1 ? "Quelle" : "Quellen"}</span>
        {confidence && <span style={{ color: confColor, marginLeft: 2, fontSize: 9 }}>{confidence}</span>}
      </button>
      {open && (
        <ul style={{ listStyle: "none", margin: "4px 0 0", padding: "0 0 0 10px", display: "flex", flexDirection: "column", gap: 2, borderLeft: "1px solid rgba(255,255,255,0.05)" }}>
          {sources.map((s, i) => {
            const parts = s.path.replace(/\\/g, "/").split("/");
            const name  = parts[parts.length - 1].replace(/\.md$/, "");
            return (
              <li key={i} style={{ fontSize: 10, color: "rgba(100,112,128,0.7)", lineHeight: 1.35 }}>
                <span style={{ opacity: 0.4 }}>{parts.slice(0, -1).join("/")}/</span>
                <span style={{ color: "rgba(130,148,168,0.75)" }}>{name}</span>
                {s.heading && <span style={{ color: "rgba(100,112,128,0.55)", fontStyle: "italic" }}> § {s.heading}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Sentinel Spinner ──────────────────────────────────────────────────────────

function SentinelSpinner() {
  return (
    <div style={{ position: "relative", width: 26, height: 26, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="msnts-ring" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/Sentinel.png" alt="" width={16} height={16} style={{ objectFit: "contain", opacity: 0.88 }} />
      <style jsx>{`
        .msnts-ring { position:absolute;inset:0;border-radius:50%;border:1.5px solid rgba(226,202,122,0.15);border-top-color:#e2ca7a;animation:msnts-spin 1.2s linear infinite; }
        @keyframes msnts-spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}

function AurumLoading() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
      <SentinelSpinner />
      <span className="msnta-label">Sentinel antwortet…</span>
      <style jsx>{`
        .msnta-label { font-size:12px;color:rgba(214,184,108,0.65);letter-spacing:0.04em;font-weight:400;animation:msnta-pulse 2s ease-in-out infinite; }
        @keyframes msnta-pulse { 0%,100% { opacity:0.50; } 50% { opacity:1.00; } }
      `}</style>
    </div>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function SentinelMarkdown({ content }: { content: string }) {
  return (
    <div className="msmd-root">
      <ReactMarkdown
        components={{
          p:      ({ children }) => <p className="msmd-p">{children}</p>,
          strong: ({ children }) => <strong className="msmd-bold">{children}</strong>,
          em:     ({ children }) => <em className="msmd-italic">{children}</em>,
          h2:     ({ children }) => <div className="msmd-h2">{children}</div>,
          h3:     ({ children }) => <div className="msmd-h3">{children}</div>,
          ul:     ({ children }) => <ul className="msmd-ul">{children}</ul>,
          ol:     ({ children }) => <ol className="msmd-ul msmd-ol">{children}</ol>,
          li:     ({ children }) => <li className="msmd-li">{children}</li>,
          hr:     () => <hr className="msmd-hr" />,
          code:   ({ children }) => <code className="msmd-code">{children}</code>,
        }}
      >
        {content ?? ""}
      </ReactMarkdown>
      <style jsx>{`
        .msmd-root { display:flex;flex-direction:column;gap:0; }
        .msmd-h2 { font-size:13px;font-weight:600;color:#d6b86c;margin:10px 0 4px;line-height:1.35; }
        .msmd-h2:first-child { margin-top:0; }
        .msmd-h3 { font-size:12px;font-weight:600;color:rgba(214,184,108,0.80);margin:8px 0 3px;line-height:1.35; }
        .msmd-h3:first-child { margin-top:0; }
        .msmd-p { margin:0 0 6px;font-size:inherit;line-height:1.65;word-break:break-word; }
        .msmd-p:last-child { margin-bottom:0; }
        .msmd-ul { margin:4px 0 6px 4px;padding-left:16px;display:flex;flex-direction:column;gap:3px;list-style:disc; }
        .msmd-ol { list-style:decimal; }
        .msmd-li { font-size:inherit;line-height:1.6;color:inherit; }
        .msmd-hr { border:none;border-top:1px solid rgba(214,184,108,0.12);margin:10px 0; }
        .msmd-bold { color:rgba(225,232,245,0.96);font-weight:600; }
        .msmd-italic { color:rgba(200,210,230,0.82);font-style:italic; }
        .msmd-code { background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.08);border-radius:3px;padding:1px 5px;font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:#e6d5a8; }
      `}</style>
    </div>
  );
}

// ── Message Actions ───────────────────────────────────────────────────────────

function MessageActions({ content, onRegenerate, regenDisabled }: { content: string; onRegenerate: () => void; regenDisabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 6 }}>
      <svg width="18" height="18" viewBox="0 0 260 260" fill="none" style={{ flexShrink: 0, marginRight: 4 }}>
        <circle cx="130" cy="130" r="100" stroke="rgba(255,255,255,0.10)" strokeWidth="6" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(214,184,108,0.18)" strokeWidth="7" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="130" cy="130" r="100" stroke="#d6b86c" strokeWidth="18" strokeDasharray="138 490" strokeLinecap="round" transform="rotate(-90 130 130)" style={{ filter: "drop-shadow(0 0 8px rgba(214,184,108,0.85))" }} />
        <circle cx="130" cy="130" r="88"  stroke="rgba(244,239,230,0.70)" strokeWidth="13" strokeDasharray="160 353" strokeLinecap="round" transform="rotate(110 130 130)" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(214,184,108,0.80)" strokeWidth="12" strokeDasharray="90 365" strokeLinecap="round" transform="rotate(200 130 130)" />
      </svg>
      <button type="button" onClick={handleCopy} title={copied ? "Kopiert" : "Kopieren"}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, background: "none", border: `1px solid ${copied ? "rgba(100,200,140,0.22)" : "rgba(255,255,255,0.06)"}`, borderRadius: 6, color: copied ? "rgba(100,200,140,0.82)" : "rgba(155,165,180,0.45)", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <button type="button" onClick={onRegenerate} disabled={regenDisabled} title="Neu generieren"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, color: "rgba(155,165,180,0.45)", cursor: "pointer", opacity: regenDisabled ? 0.2 : 1, WebkitTapHighlightColor: "transparent" }}>
        <RotateCcw size={12} />
      </button>
    </div>
  );
}

// ── Favorites Dropdown ────────────────────────────────────────────────────────

function FavoritesDropdown({ favorites, onSelect, onDelete, onRename, onAdd }: {
  favorites: SentinelFavoritePrompt[];
  onSelect: (f: SentinelFavoritePrompt) => void;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0, alignSelf: "center" }}>
      <button type="button" onClick={() => setOpen(o => !o)} title="Quick Prompts"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: open ? "rgba(255,255,255,0.06)" : "none", border: "none", borderRadius: "50%", color: open ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.40)", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        <Grid2x2 size={14} />
      </button>
      {open && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: 220, background: "#0a0c11", border: "1px solid rgba(214,184,108,0.12)", borderRadius: 10, zIndex: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.7)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px 5px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 10, color: "#5a6270", letterSpacing: "0.05em", textTransform: "uppercase" }}>Quick Prompts</span>
            <button type="button" onClick={() => { onAdd(); setOpen(false); }}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, background: "none", border: "1px dashed rgba(255,255,255,0.15)", borderRadius: "50%", color: "#4a5260", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
              <Plus size={10} />
            </button>
          </div>
          <div style={{ padding: "4px 0" }}>
            {favorites.map(f => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", padding: "0 6px 0 10px", height: 32 }}>
                <button type="button" onClick={() => { onSelect(f); setOpen(false); }} title={f.prompt}
                  style={{ flex: 1, textAlign: "left", background: "none", border: "none", color: "#9aa3b0", fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: 0, WebkitTapHighlightColor: "transparent" }}>
                  {f.title}
                </button>
                <div style={{ display: "inline-flex", gap: 1 }}>
                  <button type="button" onClick={() => onRename(f.id)}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, background: "none", border: "none", color: "#4a5260", cursor: "pointer", borderRadius: 3, WebkitTapHighlightColor: "transparent" }}>
                    <Pencil size={9} />
                  </button>
                  <button type="button" onClick={() => onDelete(f.id)}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, background: "none", border: "none", color: "#4a5260", cursor: "pointer", borderRadius: 3, WebkitTapHighlightColor: "transparent" }}>
                    <X size={9} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function MobileSentinelView() {
  const {
    entries, setEntries,
    input, setInput,
    busy, streamStarted,
    error, retryText,
    hasQueued,
    status, currentRun,
    send, clearHistory,
  } = useSentinelSession();

  const [favorites,        setFavorites]        = useState<SentinelFavoritePrompt[]>(() => {
    try { const s = lsGet<unknown>(FAVORITES_KEY, null); if (Array.isArray(s) && s.length) return s as SentinelFavoritePrompt[]; } catch { /* ignore */ }
    return DEFAULT_FAVORITES;
  });
  const [listening,        setListening]        = useState(false);
  const [voiceLevel,       setVoiceLevel]       = useState(0);
  const [muted,            setMuted]            = useState<boolean>(() => { try { return lsGet<string>(MUTE_KEY, "0") === "1"; } catch { return false; } });
  const [mounted,          setMounted]          = useState(false);
  const [userScrolledUp,   setUserScrolledUp]   = useState(false);
  const [micAvailable,     setMicAvailable]     = useState(false);
  const [speaking,         setSpeaking]         = useState(false);
  const [germanVoices,     setGermanVoices]     = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string | null>(() => { try { const v = lsGet<string>("snt_voice_uri", ""); return v || null; } catch { return null; } });
  const [voiceDropOpen,    setVoiceDropOpen]    = useState(false);
  const [animPhase,        setAnimPhase]        = useState<"avatar" | "typing" | "done">("avatar");
  const [typedText,        setTypedText]        = useState("");

  const scrollRef      = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseInputRef   = useRef("");
  const interimRef     = useRef("");
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef   = useRef<number>(0);
  const voiceDropRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const load = () => { const v = getGermanVoices(); if (v.length) setGermanVoices(v); };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
    try { setMicAvailable(Boolean(getSpeechRecognition())); } catch { setMicAvailable(false); }
  }, []);

  useEffect(() => { lsSet(FAVORITES_KEY, favorites); }, [favorites]);
  useEffect(() => { lsSet(MUTE_KEY, muted ? "1" : "0"); }, [muted]);
  useEffect(() => { lsSet("snt_voice_uri", selectedVoiceUri ?? ""); }, [selectedVoiceUri]);

  useEffect(() => {
    if (!voiceDropOpen) return;
    const h = (e: MouseEvent | TouchEvent) => { if (!voiceDropRef.current?.contains(e.target as Node)) setVoiceDropOpen(false); };
    window.addEventListener("mousedown", h); window.addEventListener("touchstart", h);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("touchstart", h); };
  }, [voiceDropOpen]);

  // Opening animation
  useEffect(() => {
    if (entries.length > 0) { setAnimPhase("done"); setTypedText(GREETING); return; }
    let iv: ReturnType<typeof setInterval> | null = null;
    const t1 = setTimeout(() => {
      setAnimPhase("typing"); let i = 0;
      iv = setInterval(() => {
        i++; setTypedText(GREETING.slice(0, i));
        if (i >= GREETING.length) { clearInterval(iv!); iv = null; setTimeout(() => setAnimPhase("done"), 200); }
      }, 30);
    }, 400);
    return () => { clearTimeout(t1); if (iv) clearInterval(iv); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      try { analyserRef.current?.disconnect(); } catch { /* ignore */ }
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    };
  }, []);

  // Smart autoscroll
  useEffect(() => {
    if (userScrolledUp) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, busy, userScrolledUp]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setUserScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  }, []);

  const speak = useCallback((text: string) => {
    if (muted || typeof window === "undefined" || !window.speechSynthesis || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "de-DE"; u.rate = 0.95; u.pitch = 0.9;
      const voice = pickBestGermanVoice(getGermanVoices(), selectedVoiceUri);
      if (voice) u.voice = voice;
      u.onstart = () => setSpeaking(true);
      u.onend   = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }, [muted, selectedVoiceUri]);

  const stopVoiceAnalysis = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    try { analyserRef.current?.disconnect(); } catch { /* ignore */ }
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null; analyserRef.current = null; mediaStreamRef.current = null;
    setVoiceLevel(0);
  }, []);

  const startVoiceAnalysis = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        setVoiceLevel(Math.min(1, Math.sqrt(sum / data.length) / 128 * 2.2));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch { /* permission denied */ }
  }, []);

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null; interimRef.current = "";
    try { rec?.stop(); } catch { /* ignore */ }
    stopVoiceAnalysis(); setListening(false);
  }, [stopVoiceAnalysis]);

  const toggleMic = useCallback(() => {
    if (listening) { stopListening(); return; }
    const Rec = getSpeechRecognition();
    if (!Rec) return;
    baseInputRef.current = input; interimRef.current = "";
    const rec = new Rec();
    rec.lang = "de-DE"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = "", interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = (e.results[i] as unknown as { [i: number]: { transcript: string } })[0]?.transcript || "";
        if (e.results[i].isFinal) finalText += t + " "; else interimText += t;
      }
      if (finalText) { baseInputRef.current = (baseInputRef.current + " " + finalText).trim(); interimRef.current = ""; }
      else interimRef.current = interimText;
      setInput((baseInputRef.current + (interimText ? " " + interimText : "")).trim());
    };
    rec.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") stopListening(); };
    rec.onend   = () => { if (recognitionRef.current === rec) { try { rec.start(); } catch { /* ignore */ } } };
    recognitionRef.current = rec;
    setListening(true);
    try { rec.start(); void startVoiceAnalysis(); } catch { recognitionRef.current = null; setListening(false); }
  }, [listening, input, stopListening, startVoiceAnalysis, setInput]);

  const resetTaHeight = () => {
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; textareaRef.current.style.overflowY = "hidden"; }
  };

  const sendWithReset = useCallback(async (overrideText?: string, entriesOverride?: ChatEntry[]) => {
    if (listening) stopListening();
    const text = (overrideText ?? input).trim();
    if (!text) return;
    setUserScrolledUp(false); baseInputRef.current = ""; interimRef.current = "";
    resetTaHeight();
    await send(overrideText, entriesOverride);
  }, [input, listening, send, stopListening]);

  const regenerate = useCallback((assistantIdx: number) => {
    if (busy) return;
    const userEntry = entries.slice(0, assistantIdx).reverse().find(e => e.role === "user");
    if (!userEntry) return;
    const trimmed = entries.slice(0, assistantIdx);
    setEntries(trimmed);
    void sendWithReset(userEntry.content, trimmed);
  }, [entries, busy, sendWithReset, setEntries]);

  const addFavorite = useCallback(() => {
    const text  = input.trim();
    const title = window.prompt(text ? "Titel:" : "Titel für neuen Favoriten:", text ? text.slice(0, 40) : "");
    if (!title?.trim()) return;
    const prompt = text || window.prompt("Prompt:") || "";
    if (!prompt.trim()) return;
    setFavorites(prev => [...prev, { id: `c-${Date.now()}`, title: title.trim(), prompt: prompt.trim(), category: "custom", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  }, [input]);

  const deleteFavorite = useCallback((id: string) => {
    if (!window.confirm("Favorit löschen?")) return;
    setFavorites(prev => prev.filter(f => f.id !== id));
  }, []);

  const renameFavorite = useCallback((id: string) => {
    const fav = favorites.find(f => f.id === id);
    if (!fav) return;
    const t = window.prompt("Neuer Titel:", fav.title);
    if (!t?.trim() || t.trim() === fav.title) return;
    setFavorites(prev => prev.map(f => f.id === id ? { ...f, title: t.trim(), updatedAt: new Date().toISOString() } : f));
  }, [favorites]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendWithReset(); }
  };

  const onTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (listening) { baseInputRef.current = val; interimRef.current = ""; }
    e.target.style.height = "auto";
    const newH = Math.min(e.target.scrollHeight, TA_MAX_H);
    e.target.style.height = `${newH}px`;
    e.target.style.overflowY = e.target.scrollHeight > TA_MAX_H ? "auto" : "hidden";
  };

  // Minimum visual activity while mic is on
  const effectiveVoiceLevel = listening && voiceLevel === 0
    ? (Math.sin(Date.now() / 400) * 0.5 + 0.5) * 0.3
    : voiceLevel;

  const visEnt           = mounted ? entries       : [];
  const visBusy          = mounted ? busy          : false;
  const visStreamStarted = mounted ? streamStarted : false;
  const visError         = mounted ? error         : null;
  const visRetry         = mounted ? retryText     : null;
  const visQueued        = mounted ? hasQueued     : false;
  const visInput         = mounted ? input         : "";

  // Helper for icon buttons
  const iconBtn = (props: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; danger?: boolean }) => ({
    display: "inline-flex" as const, alignItems: "center" as const, justifyContent: "center" as const,
    width: 32, height: 32, borderRadius: "50%",
    background: props.active ? "rgba(255,255,255,0.06)" : "none",
    border: "none",
    color: props.danger ? "#ff6b72" : props.active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.50)",
    cursor: "pointer" as const, flexShrink: 0 as const, alignSelf: "center" as const,
    WebkitTapHighlightColor: "transparent" as const,
  });

  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      background: "#0b0c0f",
      color: "#e2e6ed",
      fontFamily: "var(--font-montserrat,\"Montserrat\",system-ui,-apple-system,sans-serif)",
      fontSize: 13,
    }}>
      {/* Global animation keyframes */}
      <style jsx global>{`
        .ms-enter { animation:ms-enter-kf 400ms cubic-bezier(0.4,0,0.2,1) both; }
        @keyframes ms-enter-kf { from { opacity:0;transform:scale(0.8); } to { opacity:1;transform:scale(1); } }
        .ms-cursor { display:inline-block;margin-left:1px;animation:ms-blink 0.7s step-end infinite;color:rgba(226,202,122,0.85);font-weight:300; }
        @keyframes ms-blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
        .ms-queue { font-size:10px;color:rgba(214,184,108,0.60);letter-spacing:0.02em;font-weight:600;animation:ms-pulse 2s ease-in-out infinite; }
        @keyframes ms-pulse { 0%,100% { opacity:.50; } 50% { opacity:1; } }
        .ms-scroll::-webkit-scrollbar { display:none; }
      `}</style>

      {/* ── Scroll area ── */}
      <div ref={scrollRef} onScroll={handleScroll} className="ms-scroll"
        style={{
          flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
          display: "flex", flexDirection: "column",
          paddingTop: 58,
          paddingBottom: 136,
          scrollbarWidth: "none",
        }}>

        {/* ── Empty / avatar state ── */}
        {visEnt.length === 0 && !visBusy ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px 40px", gap: 0 }}>
            <div className="ms-enter" style={{ marginBottom: 36, flexShrink: 0 }}>
              <AurumRings voiceLevel={listening ? effectiveVoiceLevel : 0} speaking={speaking} size={210} />
            </div>
            <p style={{ fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em", fontWeight: 600, textAlign: "center", margin: 0, minHeight: "1.4em" }}>
              {listening ? "Ich höre zu…" : (animPhase === "done" ? GREETING : typedText)}
              {!listening && animPhase === "typing" && <span className="ms-cursor">|</span>}
            </p>
          </div>
        ) : (
          /* ── Chat feed ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 14px 0" }}>
            {visEnt.map((entry, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: entry.role === "user" ? "flex-end" : "flex-start" }}>

                {/* Assistant label */}
                {entry.role === "assistant" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <MiniAurumRings />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(214,184,108,0.70)", letterSpacing: "0.06em" }}>SENTINEL</span>
                  </div>
                )}

                {/* Message bubble */}
                <div style={{
                  fontSize: 13, lineHeight: 1.65, fontWeight: 500,
                  wordBreak: "break-word",
                  ...(entry.role === "user" ? {
                    maxWidth: "84%", whiteSpace: "pre-wrap",
                    background: "#1a1c22", color: "#ffffff",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: "18px", borderBottomRightRadius: 4,
                    padding: "10px 13px",
                  } : {
                    maxWidth: "100%",
                    color: "#e8eaed", background: "transparent", padding: "2px 0",
                  }),
                }}>
                  {entry.role === "assistant"
                    ? <SentinelMarkdown content={entry.content} />
                    : entry.content}
                </div>

                {/* Sources */}
                {entry.role === "assistant" && entry.meta?.sources?.length ? (
                  <SourcesToggle sources={entry.meta.sources} confidence={entry.meta.confidence} />
                ) : null}

                {/* Copy + Regen */}
                {entry.role === "assistant" && entry.content && (
                  <MessageActions content={entry.content} onRegenerate={() => regenerate(i)} regenDisabled={visBusy} />
                )}
              </div>
            ))}

            {/* Loading */}
            {visBusy && !visStreamStarted && (
              <div style={{ alignSelf: "flex-start" }}><AurumLoading /></div>
            )}

            {/* Error */}
            {visError && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "4px 3px" }}>
                <span style={{ fontSize: 12, color: "#ff6b72", lineHeight: 1.4, fontWeight: 600 }}>{visError}</span>
                {visRetry && (
                  <button type="button" onClick={() => void sendWithReset(visRetry ?? undefined)}
                    style={{ alignSelf: "flex-start", background: "rgba(255,107,114,0.10)", border: "1px solid rgba(255,107,114,0.30)", color: "#ff9ba0", fontSize: 11, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>
                    Erneut versuchen
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Scroll fade ── */}
      <div style={{ flexShrink: 0, height: 0, position: "relative", zIndex: 5, pointerEvents: "none", marginTop: -44 }}>
        <div style={{ height: 44, background: "linear-gradient(to bottom, transparent 0%, rgba(11,12,15,0.95) 80%, rgba(11,12,15,1) 100%)" }} />
      </div>

      {/* ── Queue indicator ── */}
      {visQueued && (
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "0 12px 4px" }}>
          <span className="ms-queue">1 Nachricht in Warteschlange</span>
        </div>
      )}

      {/* ── Input bar — fixed above bottom nav ── */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 64, zIndex: 100,
        padding: "6px 12px 8px",
        opacity: animPhase === "done" ? 1 : 0,
        transition: animPhase === "done" ? "opacity 200ms ease" : "none",
        pointerEvents: animPhase === "done" ? "auto" : "none",
      }}>
        <div style={{
          display: "flex", alignItems: "center",
          minHeight: 52,
          background: "#0d0e11",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 26,
          padding: "6px 8px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.50)",
        }}>
          <FavoritesDropdown
            favorites={favorites}
            onSelect={f => void sendWithReset(f.prompt)}
            onDelete={deleteFavorite}
            onRename={renameFavorite}
            onAdd={addFavorite}
          />

          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={listening ? "Spricht…" : visBusy ? "Tippen möglich — wird danach gesendet…" : "Sentinel fragen…"}
            value={visInput}
            onChange={onTextareaChange}
            onKeyDown={onKeyDown}
            style={{
              flex: 1, resize: "none",
              minHeight: 40, maxHeight: TA_MAX_H, overflowY: "hidden",
              scrollbarWidth: "thin",
              background: "transparent", color: "#ffffff",
              border: "none", outline: "none",
              padding: "9px 6px",
              fontSize: 16,
              lineHeight: 1.5,
              fontFamily: "inherit", fontWeight: 500,
              alignSelf: "center",
            }}
          />

          {visInput.trim() && (
            <button type="button" onClick={() => void sendWithReset()} title={visBusy ? "Als Nächstes senden" : "Senden"}
              style={{ ...iconBtn({}), color: "rgba(255,255,255,0.60)" }}>
              <Send size={15} />
            </button>
          )}

          {micAvailable && (
            <button type="button" onClick={toggleMic} title={listening ? "Aufnahme stoppen" : "Mikrofon"}
              style={{ ...iconBtn({ danger: listening }) }}>
              {listening ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
          )}

          <button type="button" onClick={() => setMuted(m => !m)} title={muted ? "Stimme an" : "Stimme aus"}
            style={{ ...iconBtn({}) }}>
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          {germanVoices.length > 0 && (
            <div ref={voiceDropRef} style={{ position: "relative", alignSelf: "center", flexShrink: 0 }}>
              <button type="button" onClick={() => setVoiceDropOpen(o => !o)} title="Stimme wählen"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, background: "none", border: "none", color: "rgba(255,255,255,0.40)", cursor: "pointer", opacity: muted ? 0.35 : 1, WebkitTapHighlightColor: "transparent" }}>
                <ChevronDown size={12} />
              </button>
              {voiceDropOpen && (
                <div style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, background: "#141517", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "6px 0", zIndex: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.7)", minWidth: 200, maxHeight: 230, overflowY: "auto", fontFamily: "inherit", fontSize: 12 }}>
                  <p style={{ padding: "4px 12px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", margin: 0 }}>DE Stimme</p>
                  {germanVoices.map(v => {
                    const active = selectedVoiceUri ? v.voiceURI === selectedVoiceUri : v === pickBestGermanVoice(germanVoices, null);
                    return (
                      <button key={v.voiceURI} type="button" onClick={() => { setSelectedVoiceUri(v.voiceURI); setVoiceDropOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 12px", background: "none", border: "none", color: active ? "#e2ca7a" : "rgba(200,210,220,0.8)", cursor: "pointer", textAlign: "left", fontSize: 12, fontFamily: "inherit", WebkitTapHighlightColor: "transparent" }}>
                        {active ? <Check size={11} style={{ flexShrink: 0, color: "#e2ca7a" }} /> : <span style={{ width: 11, flexShrink: 0 }} />}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {visEnt.length > 0 && (
            <button type="button" onClick={clearHistory} title="Verlauf löschen"
              style={{ ...iconBtn({}) }}>
              <Trash2 size={15} />
            </button>
          )}

          <div style={{ display: "flex", alignItems: "center", paddingLeft: 4, paddingRight: 2 }}>
            <TokenRing activeProvider={currentRun.provider ?? status?.activeProvider ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}
