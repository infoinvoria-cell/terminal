"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, ChevronDown, ChevronRight, Copy, Grid2x2, Mic, MicOff,
  Pencil, Plus, RefreshCw, Send, Trash2, Volume2, VolumeX, X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { SentinelProviderStatusBar } from "@/components/sentinel/sentinel-provider-status";
import { useSentinelSession } from "@/components/sentinel/sentinel-session-provider";
import { lsGet, lsSet } from "@/lib/sentinel/sentinel-session-store";
import type { ChatEntry, SourceItem } from "@/lib/sentinel/sentinel-session-store";

// ── Types ───────────────────────────────────────────────────────────────────

type SentinelFavoritePrompt = {
  id: string;
  title: string;
  prompt: string;
  category: "trades" | "signals" | "risk" | "strategy" | "portfolio" | "project" | "custom";
  createdAt: string;
  updatedAt: string;
};

// ── Constants ───────────────────────────────────────────────────────────────

const MUTE_KEY = "fmd_sentinel_muted";
const FAVORITES_KEY = "fmd_sentinel_favorites";
const FULLSCREEN_KEY = "fmd_sentinel_fullscreen";
const TA_MAX_H = 130; // ~5 lines

const DEFAULT_FAVORITES: SentinelFavoritePrompt[] = [
  { id: "d1", title: "Portfolio Status",    category: "portfolio", prompt: "Aktueller Portfolio Status — Version, Sleeves, Entries.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d2", title: "Sleeve Kennzahlen",   category: "strategy",  prompt: "Alle 5 Production Sleeves mit CAGR, Sharpe, Max DD.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d3", title: "V1 Blocker",          category: "project",   prompt: "Was sind die offenen Blocker für WS_PORTFOLIO_V1?", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d4", title: "Track Record",        category: "trades",    prompt: "Statement-based Track Record Zusammenfassung.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d5", title: "Compliance",          category: "risk",      prompt: "Compliance Regeln — Do Not Say Register.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d6", title: "Universe Zählung",    category: "strategy",  prompt: "Universe 42, Production 35, Seasonal 21 — Unterschiede erklären.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d7", title: "Performance Report",  category: "trades",    prompt: "Performance Kennzahlen aus dem Performance Report.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// ── localStorage helpers ─────────────────────────────────────────────────────

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

function pickGermanMaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices().filter(v => /de(-|_)/i.test(v.lang));
  if (!voices.length) return null;
  for (const key of ["stefan", "hans", "markus", "male", "männlich", "google deutsch"]) {
    const hit = voices.find(v => v.name.toLowerCase().includes(key));
    if (hit) return hit;
  }
  return voices[0];
}

// ── Aurum Rings ──────────────────────────────────────────────────────────────

function AurumRings({ voiceLevel = 0 }: { voiceLevel?: number }) {
  const scale = 1 + voiceLevel * 0.06;
  const glowBoost = voiceLevel * 0.35;
  const fixed = (value: number) => Number(value.toFixed(4));
  return (
    <div className="aur-wrap" style={{ transform: `scale(${scale})`, transition: voiceLevel > 0 ? "transform 0.08s ease-out" : "transform 0.3s ease-out" }}>
      <svg className="aur-svg" viewBox="0 0 260 260" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="130" cy="130" r="118" stroke="rgba(214,184,108,0.08)" strokeWidth="0.7" />
        <circle cx="130" cy="130" r="108" stroke="rgba(214,184,108,0.06)" strokeWidth="0.6" />
        <circle cx="130" cy="130" r="100" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(214,184,108,0.13)" strokeWidth="1.0" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(255,255,255,0.06)" strokeWidth="0.7" />
        <circle cx="130" cy="130" r="62"  stroke="rgba(214,184,108,0.10)" strokeWidth="0.7" />
        <circle cx="130" cy="130" r="100" stroke="#d6b86c" strokeWidth={2.6 + voiceLevel * 0.8}
          strokeDasharray="138 490" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 ${5 + glowBoost * 12}px rgba(214,184,108,${0.65 + glowBoost})) drop-shadow(0 0 12px rgba(214,184,108,0.25))` }}
          className="aur-arc1" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(244,239,230,0.65)" strokeWidth="1.8"
          strokeDasharray="160 353" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 4px rgba(244,239,230,0.30))" }}
          className="aur-arc2" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(214,184,108,0.75)" strokeWidth={1.6 + voiceLevel * 0.5}
          strokeDasharray="90 365" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 ${5 + glowBoost * 8}px rgba(214,184,108,${0.40 + glowBoost * 0.5}))` }}
          className="aur-arc3" />
        <circle cx="130" cy="130" r="62"  stroke="rgba(244,239,230,0.50)" strokeWidth="1.2"
          strokeDasharray="70 319" strokeLinecap="round"
          className="aur-arc4" />
        {Array.from({ length: 36 }).map((_, i) => {
          const a = (i * 10 * Math.PI) / 180;
          const inner = 95, outer = i % 6 === 0 ? 91 : 93;
          return (
            <line key={i}
              x1={fixed(130 + inner * Math.cos(a))} y1={fixed(130 + inner * Math.sin(a))}
              x2={fixed(130 + outer * Math.cos(a))} y2={fixed(130 + outer * Math.sin(a))}
              stroke={i % 6 === 0 ? "rgba(214,184,108,0.55)" : "rgba(214,184,108,0.28)"}
              strokeWidth={i % 6 === 0 ? "1.2" : "0.7"} />
          );
        })}
        <circle cx="130" cy="130" r="44" fill="url(#aurGlow)" />
        <defs>
          <radialGradient id="aurGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgba(214,184,108,0.12)" />
            <stop offset="50%"  stopColor="rgba(214,184,108,0.05)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
      </svg>
      <div className="aur-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Sentinel.png" alt="Sentinel" width={48} height={48} className="aur-icon" />
      </div>
      <style jsx>{`
        .aur-wrap { position:relative;width:220px;height:220px;flex:0 0 auto;transform-origin:center; }
        .aur-svg { width:220px;height:220px;overflow:visible; }
        .aur-arc1 { transform-box:view-box;transform-origin:50% 50%;animation:aur-cw 18s linear infinite; }
        .aur-arc2 { transform-box:view-box;transform-origin:50% 50%;animation:aur-ccw 24s linear infinite; }
        .aur-arc3 { transform-box:view-box;transform-origin:50% 50%;animation:aur-cw 14s linear infinite; }
        .aur-arc4 { transform-box:view-box;transform-origin:50% 50%;animation:aur-ccw 30s linear infinite; }
        @keyframes aur-cw  { to { transform:rotate(360deg); } }
        @keyframes aur-ccw { to { transform:rotate(-360deg); } }
        .aur-center { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none; }
        .aur-icon { object-fit:contain;animation:aur-breathe 4s ease-in-out infinite; }
        @keyframes aur-breathe {
          0%,100% { opacity:0.65;filter:drop-shadow(0 0 4px rgba(214,184,108,0.30)); }
          50%      { opacity:0.88;filter:drop-shadow(0 0 9px rgba(214,184,108,0.55)) drop-shadow(0 0 18px rgba(214,184,108,0.20)); }
        }
      `}</style>
    </div>
  );
}

// ── Mini Aurum ───────────────────────────────────────────────────────────────

function MiniAurumRings() {
  return (
    <div className="maur-wrap">
      <svg className="maur-svg" viewBox="0 0 260 260" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="130" cy="130" r="100" stroke="rgba(255,255,255,0.10)" strokeWidth="1.0" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(214,184,108,0.18)" strokeWidth="1.2" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(255,255,255,0.08)" strokeWidth="0.9" />
        <circle cx="130" cy="130" r="100" stroke="#d6b86c" strokeWidth="3.5"
          strokeDasharray="138 490" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 6px rgba(214,184,108,0.75))" }}
          className="maur-arc1" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(244,239,230,0.70)" strokeWidth="2.2"
          strokeDasharray="160 353" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 3px rgba(244,239,230,0.35))" }}
          className="maur-arc2" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(214,184,108,0.80)" strokeWidth="2.0"
          strokeDasharray="90 365" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 4px rgba(214,184,108,0.50))" }}
          className="maur-arc3" />
      </svg>
      <div className="maur-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Sentinel.png" alt="" width={14} height={14} className="maur-icon" />
      </div>
      <style jsx>{`
        .maur-wrap { position:relative;width:46px;height:46px;flex:0 0 46px; }
        .maur-svg { width:46px;height:46px;overflow:visible; }
        .maur-arc1 { transform-box:view-box;transform-origin:50% 50%;animation:maur-cw 18s linear infinite; }
        .maur-arc2 { transform-box:view-box;transform-origin:50% 50%;animation:maur-ccw 24s linear infinite; }
        .maur-arc3 { transform-box:view-box;transform-origin:50% 50%;animation:maur-cw 14s linear infinite; }
        @keyframes maur-cw  { to { transform:rotate(360deg); } }
        @keyframes maur-ccw { to { transform:rotate(-360deg); } }
        .maur-center { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none; }
        .maur-icon { object-fit:contain;opacity:0.90;animation:maur-breathe 3s ease-in-out infinite; }
        @keyframes maur-breathe {
          0%,100% { opacity:0.70; }
          50%      { opacity:1.00; }
        }
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
    <div className="snt-src">
      <button type="button" className="snt-src-toggle" onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={8} /> : <ChevronRight size={8} />}
        <span>{sources.length} {sources.length === 1 ? "Quelle" : "Quellen"}</span>
        {confidence && <span style={{ color: confColor, marginLeft: 2, fontSize: 9 }}>{confidence}</span>}
      </button>
      {open && (
        <ul className="snt-src-list">
          {sources.map((s, i) => {
            const parts = s.path.replace(/\\/g, "/").split("/");
            const name = parts[parts.length - 1].replace(/\.md$/, "");
            return (
              <li key={i} className="snt-src-item">
                <span className="snt-src-folder">{parts.slice(0, -1).join("/")}/</span>
                <span className="snt-src-name">{name}</span>
                {s.heading && <span className="snt-src-heading"> § {s.heading}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <style jsx>{`
        .snt-src { margin-top:4px; }
        .snt-src-toggle { display:inline-flex;align-items:center;gap:4px;background:none;border:none;color:rgba(120,132,148,0.55);font-size:9.5px;cursor:pointer;padding:2px 4px;border-radius:4px;letter-spacing:0.02em;transition:color .15s,background .15s; }
        .snt-src-toggle:hover { color:rgba(180,192,210,0.75);background:rgba(255,255,255,0.03); }
        .snt-src-toggle span:first-of-type { color:rgba(214,184,108,0.4);font-size:8.5px; }
        .snt-src-list { list-style:none;margin:4px 0 0;padding:0 0 0 10px;display:flex;flex-direction:column;gap:2px;border-left:1px solid rgba(255,255,255,0.05); }
        .snt-src-item { font-size:9.5px;color:rgba(100,112,128,0.7);line-height:1.35; }
        .snt-src-folder { opacity:0.4; }
        .snt-src-name { color:rgba(130,148,168,0.75); }
        .snt-src-heading { color:rgba(100,112,128,0.55);font-style:italic; }
      `}</style>
    </div>
  );
}

// ── Loading indicator ────────────────────────────────────────────────────────

function AurumLoading() {
  return (
    <div className="snt-aload">
      <MiniAurumRings />
      <span className="snt-aload-label">Sentinel antwortet…</span>
      <style jsx>{`
        .snt-aload { display:inline-flex;align-items:center;gap:10px;padding:4px 0; }
        .snt-aload-label {
          font-size:12px;color:rgba(214,184,108,0.65);letter-spacing:0.04em;font-weight:400;
          animation:snt-fade-pulse 2s ease-in-out infinite;
        }
        @keyframes snt-fade-pulse {
          0%,100% { opacity:0.50; }
          50%      { opacity:1.00; }
        }
      `}</style>
    </div>
  );
}

// ── Markdown renderer ────────────────────────────────────────────────────────

function parseInline(text: string, kp: string): React.ReactNode[] {
  const re = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+)`)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let ki = 0;
  let match;
  re.lastIndex = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    if (match[2] !== undefined)      parts.push(<span key={`${kp}-b${ki++}`} className="sm-bold">{match[2]}</span>);
    else if (match[4] !== undefined) parts.push(<span key={`${kp}-i${ki++}`} className="sm-italic">{match[4]}</span>);
    else if (match[6] !== undefined) parts.push(<span key={`${kp}-c${ki++}`} className="sm-code">{match[6]}</span>);
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

function SentinelMarkdown({ content }: { content: string }) {
  const lines = (content ?? "").split("\n");
  const nodes: React.ReactNode[] = [];
  const listItems: React.ReactNode[] = [];

  const flushList = (key: string) => {
    if (listItems.length > 0) {
      nodes.push(<ul key={key} className="sm-ul">{[...listItems]}</ul>);
      listItems.length = 0;
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const kp = `sm-${i}`;

    if (trimmed.startsWith("## ")) {
      flushList(`ul-${i}`);
      nodes.push(<div key={kp} className="sm-h2">{parseInline(trimmed.slice(3), kp)}</div>);
    } else if (trimmed.startsWith("### ")) {
      flushList(`ul-${i}`);
      nodes.push(<div key={kp} className="sm-h3">{parseInline(trimmed.slice(4), kp)}</div>);
    } else if (trimmed === "---") {
      flushList(`ul-${i}`);
      nodes.push(<hr key={kp} className="sm-hr" />);
    } else if (/^[-*]\s/.test(trimmed)) {
      listItems.push(<li key={kp} className="sm-li">{parseInline(trimmed.slice(2), kp)}</li>);
    } else if (/^\d+\.\s/.test(trimmed)) {
      listItems.push(<li key={kp} className="sm-li">{parseInline(trimmed.replace(/^\d+\.\s/, ""), kp)}</li>);
    } else if (!trimmed) {
      flushList(`ul-${i}`);
      if (nodes.length > 0) nodes.push(<div key={kp} className="sm-gap" />);
    } else {
      flushList(`ul-${i}`);
      nodes.push(<p key={kp} className="sm-p">{parseInline(line, kp)}</p>);
    }
  });

  flushList("ul-end");

  return (
    <div className="sm-root">
      {nodes}
      <style jsx>{`
        .sm-root { display:flex;flex-direction:column;gap:0; }
        .sm-h2 { font-size:14px;font-weight:600;color:#d6b86c;margin:12px 0 5px;letter-spacing:-0.01em;line-height:1.35; }
        .sm-h2:first-child { margin-top:0; }
        .sm-h3 { font-size:12.5px;font-weight:600;color:rgba(214,184,108,0.80);margin:9px 0 3px;line-height:1.35; }
        .sm-h3:first-child { margin-top:0; }
        .sm-p { margin:0;padding:2px 0;font-size:inherit;line-height:1.65;white-space:pre-wrap;word-break:break-word; }
        .sm-ul { margin:4px 0 4px 4px;padding-left:16px;display:flex;flex-direction:column;gap:3px;list-style:disc; }
        .sm-li { font-size:inherit;line-height:1.6;color:inherit; }
        .sm-hr { border:none;border-top:1px solid rgba(214,184,108,0.12);margin:10px 0; }
        .sm-gap { height:8px; }
        .sm-bold { color:rgba(225,232,245,0.96);font-weight:600; }
        .sm-italic { color:rgba(200,210,230,0.82);font-style:italic; }
        .sm-code { background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.08);border-radius:3px;padding:1px 5px;font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:11px;color:#e6d5a8;letter-spacing:0; }
      `}</style>
    </div>
  );
}

// ── Message Actions (Copy + Regenerate) ──────────────────────────────────────

function MessageActions({ content, onRegenerate, regenDisabled }: { content: string; onRegenerate: () => void; regenDisabled?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* no clipboard permission */ }
  };

  return (
    <div className="mact-row">
      <button type="button" className={`mact-btn${copied ? " mact-copied" : ""}`} onClick={handleCopy} title="Antwort kopieren">
        {copied ? <Check size={11} /> : <Copy size={11} />}
        <span>{copied ? "Kopiert" : "Kopieren"}</span>
      </button>
      <button type="button" className="mact-btn" onClick={onRegenerate} title="Antwort neu generieren" disabled={regenDisabled}>
        <RefreshCw size={11} />
        <span>Neu</span>
      </button>
      <style jsx>{`
        .mact-row { display:inline-flex;align-items:center;gap:4px;margin-top:8px; }
        .mact-btn {
          display:inline-flex;align-items:center;gap:5px;
          background:none;border:1px solid rgba(255,255,255,0.06);border-radius:5px;
          color:rgba(155,165,180,0.50);font-size:10.5px;font-family:inherit;
          padding:3px 8px;cursor:pointer;letter-spacing:0.01em;
          transition:color .15s,border-color .15s,background .15s;
        }
        .mact-btn:hover:not(:disabled) { color:rgba(210,220,235,0.88);border-color:rgba(255,255,255,0.14);background:rgba(255,255,255,0.04); }
        .mact-btn:disabled { opacity:0.25;cursor:default; }
        .mact-copied { color:rgba(100,200,140,0.82) !important;border-color:rgba(100,200,140,0.22) !important; }
      `}</style>
    </div>
  );
}

// ── Favorites Dropdown ────────────────────────────────────────────────────────

function FavoritesDropdown({
  favorites, onSelect, onDelete, onRename, onAdd,
}: {
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
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div className="fav-wrap" ref={ref}>
      <button type="button" className={`fav-toggle ${open ? "fav-toggle-active" : ""}`}
        onClick={() => setOpen(o => !o)} title="Quick Prompts">
        <Grid2x2 size={14} />
      </button>
      {open && (
        <div className="fav-menu">
          <div className="fav-menu-head">
            <span>Quick Prompts</span>
            <button type="button" className="fav-add-btn" onClick={() => { onAdd(); setOpen(false); }} title="Neuer Favorit">
              <Plus size={10} />
            </button>
          </div>
          <div className="fav-list">
            {favorites.map(f => (
              <div key={f.id} className="fav-item">
                <button type="button" className="fav-item-btn" onClick={() => { onSelect(f); setOpen(false); }} title={f.prompt}>
                  {f.title}
                </button>
                <div className="fav-item-acts">
                  <button type="button" className="fav-ia" onClick={() => onRename(f.id)} title="Umbenennen"><Pencil size={9} /></button>
                  <button type="button" className="fav-ia fav-del" onClick={() => onDelete(f.id)} title="Löschen"><X size={9} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <style jsx>{`
        .fav-wrap { position:relative;flex:0 0 auto;align-self:flex-end;margin-bottom:2px; }
        .fav-toggle { display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;background:none;border:none;border-radius:50%;color:rgba(255,255,255,0.40);cursor:pointer;transition:color .15s,background .15s; }
        .fav-toggle:hover,.fav-toggle-active { color:rgba(255,255,255,0.85);background:rgba(255,255,255,0.06); }
        .fav-menu { position:absolute;bottom:calc(100% + 8px);left:0;width:210px;background:#0a0c11;border:1px solid rgba(214,184,108,0.12);border-radius:8px;z-index:200;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.7),0 0 20px rgba(214,184,108,0.04); }
        .fav-menu-head { display:flex;align-items:center;justify-content:space-between;padding:7px 10px 5px;border-bottom:1px solid rgba(255,255,255,0.06); }
        .fav-menu-head span { font-size:10px;color:#5a6270;letter-spacing:0.05em;text-transform:uppercase; }
        .fav-add-btn { display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:none;border:1px dashed rgba(255,255,255,0.15);border-radius:50%;color:#4a5260;cursor:pointer; }
        .fav-add-btn:hover { color:#d6b86c;border-color:rgba(214,184,108,0.4); }
        .fav-list { padding:4px 0; }
        .fav-item { display:flex;align-items:center;padding:0 6px 0 10px;height:30px; }
        .fav-item:hover { background:rgba(255,255,255,0.04); }
        .fav-item-btn { flex:1;text-align:left;background:none;border:none;color:#9aa3b0;font-size:11.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0; }
        .fav-item:hover .fav-item-btn { color:#d6b86c; }
        .fav-item-acts { display:inline-flex;gap:1px;opacity:0;transition:opacity .15s; }
        .fav-item:hover .fav-item-acts { opacity:1; }
        .fav-ia { display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:none;border:none;color:#4a5260;cursor:pointer;border-radius:3px; }
        .fav-ia:hover { color:#aab2bf; }
        .fav-del:hover { color:#ff6b72 !important; }
      `}</style>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SentinelDashboard() {
  const {
    entries,
    setEntries,
    input,
    setInput,
    busy,
    streamStarted,
    error,
    retryText,
    hasQueued,
    queueCount,
    status,
    currentRun,
    send,
    clearHistory,
  } = useSentinelSession();
  const [favorites, setFavorites] = useState<SentinelFavoritePrompt[]>(() => {
    try {
      const saved = lsGet<unknown>(FAVORITES_KEY, null);
      if (Array.isArray(saved) && saved.length > 0) return saved as SentinelFavoritePrompt[];
    } catch { /* ignore */ }
    return DEFAULT_FAVORITES;
  });
  const [listening, setListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [muted, setMuted] = useState<boolean>(() => { try { return lsGet<string>(MUTE_KEY, "0") === "1"; } catch { return false; } });
  const [fullscreen, setFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseInputRef = useRef("");
  const interimRef = useRef("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    setMounted(true);
    try { setFullscreen(lsGet<string>(FULLSCREEN_KEY, "0") === "1"); } catch { /* ignore */ }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.getVoices();
    try { setMicAvailable(Boolean(getSpeechRecognition())); } catch { setMicAvailable(false); }
  }, []);

  useEffect(() => { lsSet(FAVORITES_KEY, favorites); }, [favorites]);
  useEffect(() => { lsSet(MUTE_KEY, muted ? "1" : "0"); }, [muted]);
  useEffect(() => { if (mounted) lsSet(FULLSCREEN_KEY, fullscreen ? "1" : "0"); }, [fullscreen, mounted]);

  useEffect(() => {
    if (!fullscreen) { document.body.style.overflow = ""; return; }
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [fullscreen]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      try { analyserRef.current?.disconnect(); } catch { /* ignore */ }
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      try { audioContextRef.current?.close(); } catch { /* ignore */ }
    };
  }, []);

  // Smart autoscroll: only pull to bottom if user is near the bottom
  useEffect(() => {
    if (userScrolledUp) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, busy, userScrolledUp]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setUserScrolledUp(distFromBottom > 120);
  }, []);

  const speak = useCallback((text: string) => {
    if (muted || typeof window === "undefined" || !window.speechSynthesis || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "de-DE"; u.rate = 1.85; u.pitch = 0.9;
      const voice = pickGermanMaleVoice();
      if (voice) u.voice = voice;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }, [muted]);

  const stopVoiceAnalysis = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    try { analyserRef.current?.disconnect(); } catch { /* ignore */ }
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    try { audioContextRef.current?.close(); } catch { /* ignore */ }
    audioContextRef.current = null;
    analyserRef.current = null;
    mediaStreamRef.current = null;
    setVoiceLevel(0);
  }, []);

  const startVoiceAnalysis = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) sum += dataArr[i] * dataArr[i];
        const rms = Math.sqrt(sum / dataArr.length) / 128;
        setVoiceLevel(Math.min(1, rms * 2.2));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch { /* permission denied */ }
  }, []);

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    interimRef.current = "";
    try { rec?.stop(); } catch { /* ignore */ }
    stopVoiceAnalysis();
    setListening(false);
  }, [stopVoiceAnalysis]);

  const toggleMic = useCallback(() => {
    if (listening) { stopListening(); return; }
    const Rec = getSpeechRecognition();
    if (!Rec) return;
    baseInputRef.current = input;
    interimRef.current = "";
    const rec = new Rec();
    rec.lang = "de-DE";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = (e.results[i] as unknown as { [i: number]: { transcript: string } })[0]?.transcript || "";
        if (e.results[i].isFinal) finalText += t + " ";
        else interimText += t;
      }
      if (finalText) { baseInputRef.current = (baseInputRef.current + " " + finalText).trim(); interimRef.current = ""; }
      else interimRef.current = interimText;
      setInput((baseInputRef.current + (interimText ? " " + interimText : "")).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") stopListening();
    };
    rec.onend = () => {
      if (recognitionRef.current === rec) { try { rec.start(); } catch { /* ignore */ } }
    };
    recognitionRef.current = rec;
    setListening(true);
    try { rec.start(); startVoiceAnalysis(); }
    catch { recognitionRef.current = null; setListening(false); }
  }, [listening, input, stopListening, startVoiceAnalysis]);

  const resetTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }
  };

  const sendWithUiReset = useCallback(async (overrideText?: string, entriesOverride?: ChatEntry[]) => {
    if (listening) stopListening();
    const text = (overrideText ?? input).trim();
    if (!text) return;
    setUserScrolledUp(false);
    baseInputRef.current = "";
    interimRef.current = "";
    resetTextareaHeight();
    await send(overrideText, entriesOverride);
  }, [input, listening, send, stopListening]);

  const regenerate = useCallback((assistantIdx: number) => {
    if (busy) return;
    const userEntry = entries.slice(0, assistantIdx).reverse().find(e => e.role === "user");
    if (!userEntry) return;
    const trimmedEntries = entries.slice(0, assistantIdx);
    setEntries(trimmedEntries);
    void sendWithUiReset(userEntry.content, trimmedEntries);
  }, [entries, busy, sendWithUiReset, setEntries]);


  const addFavorite = useCallback(() => {
    const text = input.trim();
    const title = window.prompt(text ? "Titel für diesen Favoriten:" : "Titel für neuen Favoriten:", text ? text.slice(0, 40) : "");
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendWithUiReset();
    }
  };

  const onTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (listening) { baseInputRef.current = val; interimRef.current = ""; }
    // Auto-grow: up to TA_MAX_H, then internal scroll
    e.target.style.height = "auto";
    const newH = Math.min(e.target.scrollHeight, TA_MAX_H);
    e.target.style.height = `${newH}px`;
    e.target.style.overflowY = e.target.scrollHeight > TA_MAX_H ? "auto" : "hidden";
  };

  const effectiveVoiceLevel = listening && voiceLevel === 0
    ? (Math.sin(Date.now() / 400) * 0.5 + 0.5) * 0.3
    : voiceLevel;
  const visibleEntries = mounted ? entries : [];
  const visibleBusy = mounted ? busy : false;
  const visibleStreamStarted = mounted ? streamStarted : false;
  const visibleError = mounted ? error : null;
  const visibleRetryText = mounted ? retryText : null;
  const visibleHasQueued = mounted ? hasQueued : false;
  const visibleInput = mounted ? input : "";

  const panel = (
    <aside className={`snt${fullscreen ? " snt-fullscreen" : ""}`}>

      {/* ── Header ── */}
      <header className="snt-head">
        <div className="snt-head-l">
          <div className="snt-title">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Sentinel.png" alt="Sentinel" width={15} height={15} style={{ objectFit: "contain" }} />
            <span>Sentinel</span>
          </div>
          {mounted ? <SentinelProviderStatusBar status={status} currentRun={currentRun} queueCount={queueCount} /> : null}
        </div>
        <div className="snt-head-r">
          <button type="button" className="snt-ico" onClick={() => setMuted(m => !m)} title={muted ? "Stimme an" : "Stimme aus"}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {visibleEntries.length > 0 && (
            <button type="button" className="snt-ico" onClick={clearHistory} title="Verlauf löschen">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </header>

      {/* ── Chat scroll ── */}
      <div className="snt-scroll" ref={scrollRef} onScroll={handleScroll}>
        {visibleEntries.length === 0 && !visibleBusy ? (
          <div className="snt-empty">
            <div className={`snt-empty-rings${fullscreen ? " snt-empty-rings-fs" : ""}`}>
              <AurumRings voiceLevel={listening ? effectiveVoiceLevel : 0} />
            </div>
            <p className="snt-hero-text">
              {listening ? "Ich höre zu…" : "Geben Sie mir eine Aufgabe, Sir."}
            </p>
          </div>
        ) : (
          <div className="snt-chat-feed">
            {visibleEntries.map((entry, i) => (
              <div key={i} className={`snt-bwrap ${entry.role === "user" ? "snt-bwrap-u" : "snt-bwrap-b"}`}>
                <div className={`snt-msg ${entry.role === "user" ? "snt-msg-u" : "snt-msg-b"}`}>
                  {entry.role === "assistant"
                    ? <SentinelMarkdown content={entry.content} />
                    : entry.content}
                </div>
                {entry.role === "assistant" && entry.meta?.sources?.length ? (
                  <SourcesToggle sources={entry.meta.sources} confidence={entry.meta.confidence} />
                ) : null}
                {entry.role === "assistant" && entry.content && (
                  <MessageActions
                    content={entry.content}
                    onRegenerate={() => regenerate(i)}
                    regenDisabled={visibleBusy}
                  />
                )}
              </div>
            ))}
            {visibleBusy && !visibleStreamStarted && (
              <div className="snt-bwrap snt-bwrap-b">
                <AurumLoading />
              </div>
            )}
            {visibleError && (
              <div className="snt-error-wrap">
                <span className="snt-error">{visibleError}</span>
                {visibleRetryText && (
                  <button type="button" className="snt-retry" onClick={() => void sendWithUiReset(visibleRetryText ?? undefined)}>
                    Erneut versuchen
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Scroll fade above input ── */}
      <div className="snt-fade" aria-hidden="true" />

      {/* ── Queue indicator ── */}
      {visibleHasQueued && (
        <div className="snt-queue-hint">
          <span>1 Nachricht in Warteschlange — wird nach aktueller Antwort gesendet</span>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="snt-hero-bar">
        <div className="snt-hero-pill">
          <FavoritesDropdown
            favorites={favorites}
            onSelect={f => void sendWithUiReset(f.prompt)}
            onDelete={deleteFavorite}
            onRename={renameFavorite}
            onAdd={addFavorite}
          />
          <textarea
            ref={textareaRef}
            className="snt-ta"
            rows={1}
            placeholder={listening ? "Spricht…" : visibleBusy ? "Tippen erlaubt — wird nach Antwort gesendet…" : "Sentinel fragen…"}
            value={visibleInput}
            onChange={onTextareaChange}
            onKeyDown={onKeyDown}
          />
          {visibleInput.trim() && (
            <button type="button" className="snt-pill-ico snt-pill-send snt-pill-aligned" onClick={() => void sendWithUiReset()} title={visibleBusy ? "Als Naechstes senden" : "Senden"}>
              <Send size={14} />
            </button>
          )}
          {micAvailable && (
            <button type="button"
              className={`snt-pill-ico snt-pill-mic snt-pill-aligned${listening ? " snt-pill-rec" : ""}`}
              onClick={toggleMic}
              title={listening ? "Aufnahme stoppen" : "Mikrofon"}>
              {listening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .snt {
          position:relative;display:flex;flex-direction:column;height:100%;min-height:0;width:100%;
          background:transparent;color:#e2e6ed;font-size:13px;
          font-family:var(--font-montserrat,"Montserrat",system-ui,-apple-system,sans-serif);
        }
        .snt.snt-fullscreen {
          position:fixed;inset:0;z-index:2147483000;width:100vw;width:100dvw;
          height:100vh;height:100dvh;border-radius:0;isolation:isolate;
        }
        /* header */
        .snt-head {
          flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;
          padding:7px 10px 6px;background:transparent;
        }
        .snt-head-l { display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0;flex:1 1 auto; }
        .snt-title { display:inline-flex;align-items:center;gap:7px;font-size:19px;font-weight:500;color:#f5f5f7;letter-spacing:0; }
        .snt-head-r { display:inline-flex;align-items:center;gap:3px; }
        .snt-ico { display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:transparent;color:rgba(255,255,255,0.40);border:none;border-radius:6px;cursor:pointer;transition:color .15s,background .15s; }
        .snt-ico:hover { color:#f5f5f7;background:rgba(255,255,255,0.06); }
        /* scroll */
        .snt-scroll {
          flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;
          padding:8px 8px 0;display:flex;flex-direction:column;align-items:center;
        }
        .snt-scroll::-webkit-scrollbar { width:3px; }
        .snt-scroll::-webkit-scrollbar-track { background:transparent; }
        .snt-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.06);border-radius:3px; }
        .snt-scroll::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,0.12); }
        /* empty state */
        .snt-empty {
          flex:1;align-self:stretch;display:flex;flex-direction:column;align-items:center;
          justify-content:center;padding:0 20px 90px;overflow:hidden;gap:0;
        }
        .snt-empty-rings { flex:0 0 auto;display:flex;align-items:center;justify-content:center;margin-bottom:72px; }
        .snt-empty-rings-fs { transform:scale(1.3);transform-origin:center;margin-bottom:90px; }
        .snt-hero-text { font-size:27px;color:rgba(210,214,220,0.80);letter-spacing:-0.02em;font-weight:400;text-align:center;margin:0; }
        /* chat feed */
        .snt-chat-feed {
          display:flex;flex-direction:column;gap:20px;
          width:min(920px,calc(100vw - 420px));
          padding-bottom:120px;
        }
        @media (max-width: 860px) {
          .snt-head { gap:10px; }
          .snt-head-l { gap:7px; }
        }
        .snt-bwrap { display:flex;flex-direction:column; }
        .snt-bwrap-u { align-items:flex-end; }
        .snt-bwrap-b { align-items:flex-start; }
        .snt-msg { font-size:12.5px;line-height:1.65;white-space:pre-wrap;word-break:break-word; }
        .snt-msg-u {
          max-width:68%;background:#1c1e24;color:#d4d9e4;
          border:1px solid rgba(255,255,255,0.07);border-radius:18px;border-bottom-right-radius:4px;
          padding:11px 14px;
        }
        .snt-msg-b { max-width:84%;color:#cecece; }
        .snt-error-wrap { display:flex;flex-direction:column;gap:5px;padding:4px 3px; }
        .snt-error { font-size:11.5px;color:#ff6b72;line-height:1.4; }
        .snt-retry { align-self:flex-start;background:rgba(255,107,114,0.10);border:1px solid rgba(255,107,114,0.25);color:#ff9ba0;font-size:11px;padding:4px 10px;border-radius:5px;cursor:pointer;font-family:inherit;transition:background .15s; }
        .snt-retry:hover { background:rgba(255,107,114,0.18); }
        /* queue hint */
        .snt-queue-hint {
          flex:0 0 auto;display:flex;justify-content:center;padding:0 12px 2px;
          animation:snt-fade-pulse 2s ease-in-out infinite;
        }
        .snt-queue-hint span {
          font-size:10px;color:rgba(214,184,108,0.50);letter-spacing:0.02em;
          [font-family:var(--font-montserrat),sans-serif];
        }
        /* scroll fade — gradient above input bar */
        .snt-fade {
          flex:0 0 auto;height:0;position:relative;z-index:5;pointer-events:none;margin-top:-56px;
        }
        .snt-fade::after {
          content:'';display:block;height:56px;
          background:linear-gradient(to bottom, transparent 0%, rgba(10,11,14,0.85) 80%, rgba(10,11,14,0.97) 100%);
        }
        /* input bar */
        .snt-hero-bar {
          flex:0 0 auto;position:relative;padding:6px 12px 32px;background:transparent;isolation:isolate;
          display:flex;justify-content:center;z-index:10;
        }
        .snt-hero-bar::before {
          content:'';position:absolute;inset:-40px -60px 0;
          background:radial-gradient(ellipse at 50% 100%,rgba(184,161,93,0.06) 0%,rgba(184,161,93,0.02) 40%,transparent 70%);
          pointer-events:none;z-index:-1;
        }
        .snt-hero-pill {
          position:relative;display:flex;align-items:flex-end;gap:0;
          width:min(920px,calc(100vw - 420px));min-height:54px;
          background:rgba(13,14,17,0.97);border:1px solid rgba(255,255,255,0.10);border-radius:28px;
          padding:10px 12px 10px 10px;
          box-shadow:0 0 0 1px rgba(255,255,255,0.02),0 16px 60px rgba(0,0,0,0.50),0 24px 100px rgba(184,161,93,0.07);
          backdrop-filter:blur(20px) saturate(1.4);transition:border-color .25s,box-shadow .25s;
        }
        .snt-hero-pill:focus-within { border-color:rgba(255,255,255,0.15); }
        .snt-ta {
          flex:1;resize:none;
          min-height:34px;
          max-height:${TA_MAX_H}px;
          overflow-y:hidden;
          scrollbar-width:thin;
          scrollbar-color:rgba(255,255,255,0.10) transparent;
          background:transparent;color:#f5f5f7;border:none;outline:none;
          padding:6px 8px 6px;font-size:15px;line-height:1.5;font-family:inherit;
          align-self:flex-end;margin-bottom:0;
        }
        .snt-ta::-webkit-scrollbar { width:3px; }
        .snt-ta::-webkit-scrollbar-track { background:transparent; }
        .snt-ta::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.10);border-radius:3px; }
        .snt-ta::placeholder { color:#65686f;letter-spacing:0.01em;font-size:14px; }
        .snt-ta:focus,.snt-ta:focus-visible { outline:none !important;box-shadow:none !important;border:none !important; }
        .snt-ta:disabled { opacity:0.6;cursor:not-allowed; }
        .snt-pill-ico {
          flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
          width:30px;height:30px;border-radius:50%;background:none;border:none;
          color:rgba(255,255,255,0.40);cursor:pointer;transition:color .15s,background .15s;
        }
        .snt-pill-ico:hover { color:rgba(255,255,255,0.88);background:rgba(255,255,255,0.07); }
        .snt-pill-ico:disabled { opacity:0.18;cursor:default; }
        .snt-pill-ico:focus,.snt-pill-ico:focus-visible { outline:none;box-shadow:none; }
        /* align icons to bottom of pill */
        .snt-pill-aligned { align-self:flex-end;margin-bottom:0; }
        .snt-pill-send { color:rgba(255,255,255,0.48); }
        .snt-pill-mic { color:rgba(255,255,255,0.40); }
        .snt-pill-rec { color:#ff6b72 !important; }
        /* fullscreen overrides */
        .snt.snt-fullscreen .snt-scroll { padding:0;align-items:center; }
        .snt.snt-fullscreen .snt-chat-feed { width:100%;max-width:1180px;padding:24px 48px 140px;gap:24px; }
        .snt.snt-fullscreen .snt-msg-b { max-width:min(860px,92%);padding:0;border-radius:0;border:none;background:transparent;box-shadow:none;backdrop-filter:none;font-size:14px;line-height:1.72;color:rgba(210,220,235,0.90); }
        .snt.snt-fullscreen .snt-msg-u { max-width:min(680px,78%);padding:12px 16px;border-radius:14px;border-bottom-right-radius:4px;font-size:13.5px;background:rgba(22,26,36,0.88); }
        .snt.snt-fullscreen .snt-empty { justify-content:center;gap:0;padding:0 80px 160px; }
        .snt.snt-fullscreen .snt-hero-text { font-size:34px;letter-spacing:-0.02em; }
        .snt.snt-fullscreen .snt-hero-bar { padding:6px 0 48px;display:flex;justify-content:center; }
        .snt.snt-fullscreen .snt-hero-pill { width:min(70vw,960px);padding:12px 14px 12px 10px; }
        .snt.snt-fullscreen .snt-ta { font-size:18px;padding:6px 8px; }
      `}</style>
    </aside>
  );

  if (mounted && fullscreen && typeof document !== "undefined") {
    return createPortal(panel, document.body);
  }
  return panel;
}
