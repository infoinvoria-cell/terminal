"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, ChevronDown, ChevronRight, Clock, Copy, Grid2x2, Mic, MicOff,
  Pencil, Plus, RotateCcw, Send, SquarePen, Trash2, Volume2, VolumeX, X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { SentinelProviderStatusBar } from "@/components/sentinel/sentinel-provider-status";
import { useSentinelSession } from "@/components/sentinel/sentinel-session-provider";
import { SentinelCapacityPanel } from "@/components/sentinel/SentinelCapacityPanel";
import { SentinelAurumLogo } from "@/components/sentinel/SentinelAurumLogo";
import ReactMarkdown from "react-markdown";
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

function getGermanVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter(v => /de(-|_)/i.test(v.lang));
}

function pickBestGermanVoice(voices: SpeechSynthesisVoice[], preferredUri?: string | null): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  if (preferredUri) {
    const pref = voices.find(v => v.voiceURI === preferredUri);
    if (pref) return pref;
  }
  // Priority: Neural de-DE > Microsoft Stefan/Hedda > any de-DE
  const priority = [
    (v: SpeechSynthesisVoice) => /neural/i.test(v.name) && /de[-_]/i.test(v.lang),
    (v: SpeechSynthesisVoice) => /microsoft\s+stefan/i.test(v.name),
    (v: SpeechSynthesisVoice) => /microsoft\s+hedda/i.test(v.name),
    (v: SpeechSynthesisVoice) => /microsoft/i.test(v.name) && /de[-_]/i.test(v.lang),
    (v: SpeechSynthesisVoice) => /google/i.test(v.name) && /de[-_]/i.test(v.lang),
  ];
  for (const test of priority) {
    const hit = voices.find(test);
    if (hit) return hit;
  }
  return voices[0];
}

// ── Aurum Logo Animation (sequential reveal, left → right, 7.2s loop) ────────

const LOGO_PIECES = [
  { clip: "inset(0 76% 0 0)",   delay: "0s" },
  { clip: "inset(0 57% 0 21%)", delay: ".45s" },
  { clip: "inset(0 43% 0 36%)", delay: ".90s" },
  { clip: "inset(0 25% 0 50%)", delay: "1.35s" },
  { clip: "inset(0 0 0 67%)",   delay: "1.8s" },
];

function AurumLogoAnimation({ active = false, voiceLevel = 0 }: { active?: boolean; voiceLevel?: number }) {
  if (active) {
    return (
      <div style={{ width: 80, height: 72, position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sentinel-logo.png"
          alt=""
          aria-hidden
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            filter: `drop-shadow(0 0 ${6 + voiceLevel * 14}px rgba(201,168,76,${0.55 + voiceLevel * 0.35}))`,
            transition: "filter 0.1s ease-out",
          }}
        />
      </div>
    );
  }
  return (
    <div className="aur-logo-wrap">
      {LOGO_PIECES.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src="/sentinel-logo.png"
          alt=""
          aria-hidden
          className="aur-logo-piece"
          style={{ clipPath: p.clip, animationDelay: p.delay }}
        />
      ))}
      <style jsx>{`
        .aur-logo-wrap { position:relative; width:80px; height:72px; }
        .aur-logo-piece {
          position:absolute; inset:0; width:100%; height:100%; object-fit:contain;
          opacity:0; transform:translateY(6px) scale(.985);
          animation:aur-logo-reveal 7.2s infinite cubic-bezier(.22,.61,.36,1);
          will-change:opacity,transform;
        }
        @keyframes aur-logo-reveal {
          0%  { opacity:0; transform:translateY(7px) scale(.982); }
          8%  { opacity:0; transform:translateY(7px) scale(.982); }
          20% { opacity:1; transform:translateY(0) scale(1); }
          76% { opacity:1; transform:translateY(0) scale(1); }
          92% { opacity:0; transform:translateY(-2px) scale(1); }
          100%{ opacity:0; transform:translateY(-2px) scale(1); }
        }
        @media (prefers-reduced-motion:reduce) {
          .aur-logo-piece { animation:none; opacity:1; transform:none; }
        }
      `}</style>
    </div>
  );
}

// ── Aurum Rings ──────────────────────────────────────────────────────────────

// 5 bars — same size in both modes, animate during voice
const BAR_CFG = [
  { h: 24, dur: 0.55 },
  { h: 38, dur: 0.42 },
  { h: 52, dur: 0.38 },
  { h: 38, dur: 0.48 },
  { h: 24, dur: 0.52 },
];
const TOTAL_H = 60;

function AurumWaves({ voiceLevel = 0, speaking = false }: { voiceLevel?: number; speaking?: boolean }) {
  const barW = 3;
  const gap = 10;
  const totalW = BAR_CFG.length * barW + (BAR_CFG.length - 1) * gap;
  const active = voiceLevel > 0.05 || speaking;

  return (
    <svg width={totalW} height={TOTAL_H} viewBox={`0 0 ${totalW} ${TOTAL_H}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      {BAR_CFG.map((cfg, i) => {
        const h = cfg.h;
        const x = i * (barW + gap);
        const y = (TOTAL_H - h) / 2;
        return (
          <rect
            key={i}
            x={x} y={y} width={barW} height={h}
            rx={barW / 2}
            fill="#C9A84C"
            opacity={active ? (i === 2 ? 1 : 0.72) : 0.30}
            className={active ? `aur-bar aur-bar-${i}` : undefined}
            style={active && i === 2 ? { filter: "drop-shadow(0 0 3px rgba(226,202,122,0.6))" } : undefined}
          />
        );
      })}
      <style jsx>{`
        ${BAR_CFG.map((cfg, i) => `
          @keyframes aur-bar-kf-${i} {
            0%,100% { transform: scaleY(0.5); }
            50%     { transform: scaleY(1); }
          }
          .aur-bar-${i} {
            transform-origin: center;
            transform-box: fill-box;
            animation: aur-bar-kf-${i} ${cfg.dur}s ease-in-out infinite;
            animation-delay: ${(i * 0.07).toFixed(2)}s;
          }
        `).join("")}
      `}</style>
    </svg>
  );
}

function AurumRings({ voiceLevel = 0, speaking = false }: { voiceLevel?: number; speaking?: boolean }) {
  const active = speaking || voiceLevel > 0.2;
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
        <circle cx="130" cy="130" r="100" stroke="#C9A84C" strokeWidth={2.6 + voiceLevel * 0.8}
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
        <SentinelAurumLogo size={112} />
      </div>
      <style jsx>{`
        .aur-wrap { position:relative;width:320px;height:320px;flex:0 0 auto;transform-origin:center; }
        .aur-svg { width:320px;height:320px;overflow:visible; }
        .aur-arc1 { transform-box:view-box;transform-origin:50% 50%;animation:aur-cw 18s linear infinite; }
        .aur-arc2 { transform-box:view-box;transform-origin:50% 50%;animation:aur-ccw 48s linear infinite; }
        .aur-arc3 { transform-box:view-box;transform-origin:50% 50%;animation:aur-cw 28s linear infinite; }
        .aur-arc4 { transform-box:view-box;transform-origin:50% 50%;animation:aur-ccw 72s linear infinite; }
        @keyframes aur-cw  { to { transform:rotate(360deg); } }
        @keyframes aur-ccw { to { transform:rotate(-360deg); } }
        .aur-center { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none; }
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
        <circle cx="130" cy="130" r="100" stroke="#C9A84C" strokeWidth="3.5"
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
        <img src="/sentinel-logo.png" alt="" width={18} height={18} className="maur-icon" />
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
  const confColor = confidence === "high" ? "#C9A84C" : confidence === "medium" ? "rgba(255,255,255,0.55)" : "#ff6b72";
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

// ── Sentinel Spinner (icon + spinning gold ring) ──────────────────────────────

function SentinelSpinner() {
  return (
    <div className="snt-sp-wrap">
      <div className="snt-sp-ring" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/sentinel-logo.png" alt="" width={24} height={24} className="snt-sp-icon" />
      <style jsx>{`
        .snt-sp-wrap {
          position:relative;width:28px;height:28px;flex:0 0 28px;
          display:flex;align-items:center;justify-content:center;
        }
        .snt-sp-ring {
          position:absolute;inset:0;border-radius:50%;
          border:1.5px solid rgba(226,202,122,0.15);
          border-top-color:#C9A84C;
          animation:snt-spin 1.2s linear infinite;
        }
        @keyframes snt-spin { to { transform:rotate(360deg); } }
        .snt-sp-icon { object-fit:contain;opacity:0.88; }
      `}</style>
    </div>
  );
}

// ── Loading indicator ────────────────────────────────────────────────────────

function AurumLoading() {
  return (
    <div className="snt-aload">
      <SentinelSpinner />
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

function SentinelMarkdown({ content }: { content: string }) {
  return (
    <div className="sm-root">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="sm-p">{children}</p>,
          strong: ({ children }) => <strong className="sm-bold">{children}</strong>,
          em: ({ children }) => <em className="sm-italic">{children}</em>,
          h1: ({ children }) => <div className="sm-h1">{children}</div>,
          h2: ({ children }) => <div className="sm-h2">{children}</div>,
          h3: ({ children }) => <div className="sm-h3">{children}</div>,
          ul: ({ children }) => <ul className="sm-ul">{children}</ul>,
          ol: ({ children }) => <ol className="sm-ul sm-ol">{children}</ol>,
          li: ({ children }) => <li className="sm-li">{children}</li>,
          hr: () => <hr className="sm-hr" />,
          code: ({ children }) => <code className="sm-code">{children}</code>,
        }}
      >
        {content ?? ""}
      </ReactMarkdown>
      <style jsx>{`
        .sm-root { display:flex;flex-direction:column;gap:0; }
        .sm-h1 { font-size:16px;font-weight:700;color:#C9A84C;margin:12px 0 6px;letter-spacing:-0.02em;line-height:1.3; }
        .sm-h1:first-child { margin-top:0; }
        .sm-h2 { font-size:14px;font-weight:600;color:#C9A84C;margin:10px 0 4px;letter-spacing:-0.01em;line-height:1.35; }
        .sm-h2:first-child { margin-top:0; }
        .sm-h3 { font-size:12.5px;font-weight:600;color:rgba(214,184,108,0.80);margin:8px 0 3px;line-height:1.35; }
        .sm-h3:first-child { margin-top:0; }
        .sm-p { margin:0 0 6px;font-size:inherit;line-height:1.65;word-break:break-word; }
        .sm-p:last-child { margin-bottom:0; }
        .sm-ul { margin:4px 0 6px 4px;padding-left:16px;display:flex;flex-direction:column;gap:3px;list-style:disc; }
        .sm-ol { list-style:decimal; }
        .sm-li { font-size:inherit;line-height:1.6;color:inherit; }
        .sm-hr { border:none;border-top:1px solid rgba(214,184,108,0.12);margin:10px 0; }
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
      {/* Aurum mini — alternating arc directions like fullscreen */}
      <svg width="22" height="22" viewBox="0 0 260 260" fill="none" style={{ flexShrink:0, marginRight:5 }}>
        <circle cx="130" cy="130" r="100" stroke="rgba(255,255,255,0.10)" strokeWidth="6" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(214,184,108,0.18)" strokeWidth="7" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        {/* arc1 cw — starts at top */}
        <circle cx="130" cy="130" r="100" stroke="#C9A84C" strokeWidth="18"
          strokeDasharray="138 490" strokeLinecap="round"
          transform="rotate(-90 130 130)"
          style={{ filter:"drop-shadow(0 0 8px rgba(214,184,108,0.85))" }} />
        {/* arc2 ccw — starts at bottom-right */}
        <circle cx="130" cy="130" r="88"  stroke="rgba(244,239,230,0.70)" strokeWidth="13"
          strokeDasharray="160 353" strokeLinecap="round"
          transform="rotate(110 130 130)" />
        {/* arc3 cw — starts at left */}
        <circle cx="130" cy="130" r="74"  stroke="rgba(214,184,108,0.80)" strokeWidth="12"
          strokeDasharray="90 365" strokeLinecap="round"
          transform="rotate(200 130 130)" />
      </svg>
      <button type="button" className={`mact-btn${copied ? " mact-copied" : ""}`} onClick={handleCopy} title={copied ? "Kopiert" : "Kopieren"}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <button type="button" className="mact-btn" onClick={onRegenerate} title="Neu generieren" disabled={regenDisabled}>
        <RotateCcw size={12} />
      </button>
      <style jsx>{`
        .mact-row { display:inline-flex;align-items:center;gap:3px;margin-top:6px; }
        .mact-btn {
          display:inline-flex;align-items:center;justify-content:center;
          width:26px;height:26px;
          background:none;border:1px solid rgba(255,255,255,0.06);border-radius:6px;
          color:rgba(155,165,180,0.45);cursor:pointer;
          transition:color .15s,border-color .15s,background .15s;
        }
        .mact-btn:hover:not(:disabled) { color:rgba(210,220,235,0.88);border-color:rgba(255,255,255,0.14);background:rgba(255,255,255,0.04); }
        .mact-btn:disabled { opacity:0.20;cursor:default; }
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
        .fav-wrap { position:relative;flex:0 0 auto;align-self:center; }
        .fav-toggle { display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;background:none;border:none;border-radius:50%;color:rgba(255,255,255,0.40);cursor:pointer;transition:color .15s,background .15s; }
        .fav-toggle:hover,.fav-toggle-active { color:rgba(255,255,255,0.85);background:rgba(255,255,255,0.06); }
        .fav-menu { position:absolute;bottom:calc(100% + 8px);left:0;width:210px;background:linear-gradient(to bottom,#26262d,#111114);border:1px solid rgba(255,255,255,0.055);border-radius:10px;z-index:200;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.7); }
        .fav-menu-head { display:flex;align-items:center;justify-content:space-between;padding:7px 10px 5px;border-bottom:1px solid rgba(255,255,255,0.055); }
        .fav-menu-head span { font-size:10px;color:rgba(180,192,210,0.6);letter-spacing:0.05em;text-transform:uppercase;font-family:var(--font-montserrat,'Montserrat',sans-serif); }
        .fav-add-btn { display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:none;border:1px dashed rgba(255,255,255,0.15);border-radius:50%;color:#4a5260;cursor:pointer; }
        .fav-add-btn:hover { color:#D6B24A;border-color:rgba(214,178,74,0.4); }
        .fav-list { padding:4px 0; }
        .fav-item { display:flex;align-items:center;padding:0 6px 0 10px;height:30px; }
        .fav-item:hover { background:rgba(255,255,255,0.04); }
        .fav-item-btn { flex:1;text-align:left;background:none;border:none;color:#9aa3b0;font-size:11.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0; }
        .fav-item:hover .fav-item-btn { color:#D6B24A; }
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
    savedSessions,
    loadSession,
    deleteSession,
    renameSession,
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
  const [speaking, setSpeaking] = useState(false);
  const [germanVoices, setGermanVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string | null>(() => { try { const v = lsGet<string>("snt_voice_uri", ""); return v || null; } catch { return null; } });
  const [voiceDropOpen, setVoiceDropOpen] = useState(false);
  const voiceDropRef = useRef<HTMLDivElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Opening animation
  const GREETING_DE = "Yo was geht ab Bro, Sentinel hier...";
  const GREETING_EN = "Hello Sir, how can I assist you today...";
  const [greetingLang, setGreetingLang] = useState<"de" | "en">("de");
  const GREETING = greetingLang === "de" ? GREETING_DE : GREETING_EN;
  const [animPhase, setAnimPhase] = useState<"avatar" | "typing" | "done">("avatar");
  const [typedText, setTypedText] = useState("");

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
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const load = () => { const v = getGermanVoices(); if (v.length) setGermanVoices(v); };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
    try { setMicAvailable(Boolean(getSpeechRecognition())); } catch { setMicAvailable(false); }
  }, []);

  useEffect(() => { lsSet(FAVORITES_KEY, favorites); }, [favorites]);
  useEffect(() => { lsSet(MUTE_KEY, muted ? "1" : "0"); }, [muted]);
  useEffect(() => { if (mounted) lsSet(FULLSCREEN_KEY, fullscreen ? "1" : "0"); }, [fullscreen, mounted]);
  useEffect(() => { lsSet("snt_voice_uri", selectedVoiceUri ?? ""); }, [selectedVoiceUri]);
  useEffect(() => {
    if (!voiceDropOpen) return;
    const h = (e: MouseEvent) => { if (!voiceDropRef.current?.contains(e.target as Node)) setVoiceDropOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [voiceDropOpen]);

  // Opening animation — only in empty state
  useEffect(() => {
    if (entries.length > 0) { setAnimPhase("done"); setTypedText(GREETING); return; }
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const t1 = setTimeout(() => {
      setAnimPhase("typing");
      let i = 0;
      intervalId = setInterval(() => {
        i++;
        setTypedText(GREETING.slice(0, i));
        if (i >= GREETING.length) {
          clearInterval(intervalId!); intervalId = null;
          setTimeout(() => setAnimPhase("done"), 200);
        }
      }, 30);
    }, 500);
    return () => { clearTimeout(t1); if (intervalId) clearInterval(intervalId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      u.lang = "de-DE"; u.rate = 0.95; u.pitch = 0.9;
      const voices = getGermanVoices();
      const voice = pickBestGermanVoice(voices, selectedVoiceUri);
      if (voice) u.voice = voice;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }, [muted, selectedVoiceUri]);

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
      {/* ── Chat scroll ── */}
      <div className="snt-scroll" ref={scrollRef} onScroll={handleScroll}>
        {visibleEntries.length === 0 && !visibleBusy ? (
          <div className="snt-empty">
            <div className={`snt-empty-rings snt-anim-rings${fullscreen ? " snt-empty-rings-fs" : ""}`}>
              <AurumRings voiceLevel={listening ? effectiveVoiceLevel : 0} speaking={speaking} />
            </div>
            <p
              className="snt-hero-text"
              onClick={() => { if (animPhase === "done" && !listening) setGreetingLang(l => (l === "de" ? "en" : "de")); }}
              style={{ cursor: animPhase === "done" && !listening ? "pointer" : "default" }}
            >
              {listening ? "Ich höre zu…" : (animPhase === "done" ? GREETING : typedText)}
              {!listening && animPhase === "typing" && <span className="snt-cursor">|</span>}
            </p>
          </div>
        ) : (
          <div className="snt-chat-feed">
            {visibleEntries.map((entry, i) => (
              <div key={i} className={`snt-bwrap ${entry.role === "user" ? "snt-bwrap-u" : "snt-bwrap-b"}`}>
                {entry.role === "assistant" && (
                  <div className="snt-bot-avatar" aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/sentinel-logo.png" alt="" style={{ width: 20, height: 22, objectFit: "contain", opacity: 0.85 }} />
                  </div>
                )}
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

      {/* ── Scroll fade above input — only when there are messages ── */}
      {visibleEntries.length > 0 && <div className="snt-fade" aria-hidden="true" />}

      {/* ── Queue indicator ── */}
      {visibleHasQueued && (
        <div className="snt-queue-hint">
          <span>1 Nachricht in Warteschlange — wird nach aktueller Antwort gesendet</span>
        </div>
      )}

      {/* ── Input bar ── */}
      <div
        className="snt-hero-bar"
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          opacity: animPhase === "done" ? 1 : 0,
          transition: animPhase === "done" ? "opacity 200ms ease" : "none",
        }}
      >
        {/* Pill: Vorlagen | textarea | Send | Mic */}
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
            placeholder={listening ? "Listening…" : visibleBusy ? "Tippen erlaubt — wird nach Antwort gesendet…" : "Ask Sentinel"}
            value={visibleInput}
            onChange={onTextareaChange}
            onKeyDown={onKeyDown}
          />
          {visibleInput.trim() && (
            <button type="button" className="snt-pill-ico snt-pill-send snt-pill-aligned" onClick={() => void sendWithUiReset()} title={visibleBusy ? "Als Nächstes senden" : "Senden"}>
              <Send size={14} />
            </button>
          )}
          {micAvailable && (
            <button type="button"
              className={`snt-pill-mic-btn snt-pill-aligned${listening ? " snt-pill-rec" : ""}`}
              onClick={toggleMic}
              title={listening ? "Aufnahme stoppen" : "Mikrofon"}>
              {listening ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
          )}
        </div>

        {/* Toolbar row: left actions | right controls — matches pill width */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"50%", paddingLeft:4, paddingRight:4 }}>
          {/* Links: chat-Aktionen */}
          <div style={{ display:"flex", alignItems:"center", gap:2 }}>
            <button type="button" className="snt-pill-ico" onClick={clearHistory} title="Neuer Chat">
              <SquarePen size={14} />
            </button>
            <button type="button" className="snt-pill-ico" onClick={() => setHistoryOpen(o => !o)} title="Chat-Verlauf">
              <Clock size={14} />
            </button>
            <button type="button" className="snt-pill-ico" onClick={addFavorite} title="Zu Favoriten hinzufügen">
              <Plus size={14} />
            </button>
          </div>
          {/* Rechts: audio + provider */}
          <div style={{ display:"flex", alignItems:"center", gap:2 }}>
            <button type="button" className="snt-pill-ico" onClick={() => setMuted(m => !m)} title={muted ? "Stimme an" : "Stimme aus"}>
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            {germanVoices.length > 0 && (
              <div ref={voiceDropRef} style={{ position:"relative" }}>
                <button
                  type="button"
                  className="snt-pill-ico"
                  style={{ opacity: muted ? 0.35 : 1 }}
                  onClick={() => setVoiceDropOpen(o => !o)}
                  title="Stimme wählen"
                >
                  <ChevronDown size={13} />
                </button>
                {voiceDropOpen && (
                  <div style={{
                    position:"absolute", bottom:"calc(100% + 6px)", left:0,
                    background:"linear-gradient(to bottom, #26262d, #111114)", border:"1px solid rgba(255,255,255,0.055)",
                    borderRadius:10, padding:"6px 0", zIndex:300,
                    boxShadow:"0 8px 32px rgba(0,0,0,0.6)",
                    minWidth:220, maxHeight:280, overflowY:"auto",
                    fontFamily:"var(--font-text)", fontSize:12,
                  }}>
                    <p style={{ padding:"4px 12px 6px", fontSize:10, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"rgba(255,255,255,0.35)", margin:0 }}>
                      DE Stimme
                    </p>
                    {germanVoices.map(v => {
                      const active = selectedVoiceUri ? v.voiceURI === selectedVoiceUri : v === pickBestGermanVoice(germanVoices, null);
                      return (
                        <button
                          key={v.voiceURI}
                          type="button"
                          onClick={() => { setSelectedVoiceUri(v.voiceURI); setVoiceDropOpen(false); }}
                          style={{
                            display:"flex", alignItems:"center", gap:8, width:"100%",
                            padding:"6px 12px", background:"none", border:"none",
                            color: active ? "#C9A84C" : "rgba(200,210,220,0.8)",
                            cursor:"pointer", textAlign:"left", fontSize:12,
                            fontFamily:"inherit",
                          }}
                        >
                          {active && <Check size={11} style={{ flexShrink:0, color:"#C9A84C" }} />}
                          {!active && <span style={{ width:11, flexShrink:0 }} />}
                          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {visibleEntries.length > 0 && (
              <button type="button" className="snt-pill-ico" onClick={clearHistory} title="Verlauf löschen">
                <Trash2 size={15} />
              </button>
            )}
            <SentinelCapacityPanel activeProvider={currentRun.provider ?? status?.activeProvider ?? null} />
          </div>
        </div>
      </div>

      {/* ── Chat-Verlauf Panel ── */}
      {historyOpen && (
        <div
          style={{
            position:"absolute", top:0, right:0, bottom:0, width:270,
            background:"linear-gradient(to bottom, #26262d, #111114)", borderLeft:"1px solid rgba(255,255,255,0.055)",
            display:"flex", flexDirection:"column", zIndex:200,
            boxShadow:"-8px 0 32px rgba(0,0,0,0.5)",
            animation:"snt-slide-in 180ms ease",
          }}
        >
          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px 10px", borderBottom:"1px solid rgba(255,255,255,0.055)", flexShrink:0 }}>
            <span style={{ fontSize:12, fontWeight:700, color:"rgba(180,192,210,0.6)", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"var(--font-montserrat,'Montserrat',sans-serif)" }}>Verlauf</span>
            <button type="button" onClick={() => setHistoryOpen(false)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", cursor:"pointer", padding:4, display:"flex", alignItems:"center" }}>
              <X size={14} />
            </button>
          </div>

          {/* List */}
          <div style={{ flex:1, overflowY:"auto", padding:"6px 0" }}>
            {savedSessions.length === 0 && (
              <p style={{ padding:"20px 16px", fontSize:11.5, color:"rgba(255,255,255,0.25)", textAlign:"center", margin:0 }}>
                Noch keine gespeicherten Chats.<br />Starte einen neuen Chat — der alte wird hier gespeichert.
              </p>
            )}
            {savedSessions.map(session => (
              <div
                key={session.id}
                style={{ padding:"8px 12px", cursor:"pointer", borderRadius:8, margin:"2px 6px", transition:"background .12s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {renamingId === session.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => { if (renameValue.trim()) renameSession(session.id, renameValue.trim()); setRenamingId(null); }}
                    onKeyDown={e => { if (e.key === "Enter") { if (renameValue.trim()) renameSession(session.id, renameValue.trim()); setRenamingId(null); } if (e.key === "Escape") setRenamingId(null); }}
                    style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:6, padding:"4px 7px", color:"#fff", fontSize:12, fontFamily:"inherit", outline:"none" }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <div
                    onClick={() => { loadSession(session.id); setHistoryOpen(false); }}
                    style={{ display:"flex", flexDirection:"column", gap:3 }}
                  >
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:"#F0F2F6", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
                        {session.title}
                      </span>
                      <div style={{ display:"flex", gap:2, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                        <button type="button" title="Umbenennen" onClick={() => { setRenamingId(session.id); setRenameValue(session.title); }} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.25)", cursor:"pointer", padding:3, display:"flex", alignItems:"center" }}>
                          <Pencil size={11} />
                        </button>
                        <button type="button" title="Löschen" onClick={() => deleteSession(session.id)} style={{ background:"none", border:"none", color:"rgba(255,100,100,0.35)", cursor:"pointer", padding:3, display:"flex", alignItems:"center" }}>
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                    <span style={{ fontSize:10.5, color:"rgba(255,255,255,0.28)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {session.preview || "—"}
                    </span>
                    <span style={{ fontSize:9.5, color:"rgba(255,255,255,0.18)", letterSpacing:"0.02em" }}>
                      {new Date(session.createdAt).toLocaleDateString("de-DE", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .snt {
          position:relative;display:flex;flex-direction:column;flex:1;min-height:0;width:100%;
          background:transparent;color:#e2e6ed;font-size:13px;
          font-family:var(--font-text);
        }
        .snt::after {
          content:'';position:absolute;bottom:-280px;left:50%;transform:translateX(-50%);
          width:2000px;height:560px;border-radius:50%;
          background:radial-gradient(circle,rgba(201,168,76,0.13) 0%,rgba(201,168,76,0.05) 45%,transparent 72%);
          filter:blur(38px);
          pointer-events:none;z-index:0;
        }
        .snt.snt-fullscreen {
          position:fixed;inset:0;z-index:2147483000;width:100vw;width:100dvw;
          height:100vh;height:100dvh;border-radius:0;isolation:isolate;
        }
        /* header */
        .snt-head {
          flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;
          padding:7px 10px 6px;background:transparent;
          border-bottom:1px solid rgba(255,255,255,0.15);
        }
        .snt-head-l { display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0;flex:1 1 auto; }
        .snt-title { display:inline-flex;align-items:center;gap:7px;font-size:19px;font-weight:700;color:#F0F2F6;letter-spacing:0;font-family:var(--font-montserrat,'Montserrat',sans-serif); }
        .snt-head-r { display:inline-flex;align-items:center;gap:3px; }
        .snt-ico { display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:transparent;color:rgba(255,255,255,0.50);border:none;border-radius:6px;cursor:pointer;transition:color .15s,background .15s; }
        .snt-ico:hover { color:#ffffff;background:rgba(255,255,255,0.08); }
        /* scroll */
        .snt-scroll {
          flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;
          padding:8px 8px 0;display:flex;flex-direction:column;align-items:center;
        }
        .snt-scroll::-webkit-scrollbar { width:2px; }
        .snt-scroll::-webkit-scrollbar-track { background:transparent; }
        .snt-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12);border-radius:2px; }
        .snt-scroll::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,0.22); }
        /* empty state */
        .snt-empty {
          flex:1;align-self:stretch;display:flex;flex-direction:column;align-items:center;
          justify-content:center;padding:0 20px 90px;overflow:hidden;gap:0;
        }
        .snt-empty-rings { flex:0 0 auto;display:flex;align-items:center;justify-content:center;margin-bottom:56px;transform:scale(1.45);transform-origin:center; }
        .snt-empty-rings-fs { transform:scale(1.85);transform-origin:center;margin-bottom:90px; }
        @keyframes snt-slide-in {
          from { transform:translateX(100%); opacity:0; }
          to   { transform:translateX(0);    opacity:1; }
        }
        /* avatar enter animation */
        @keyframes snt-avatar-enter {
          from { opacity:0;transform:scale(0.8); }
          to   { opacity:1;transform:scale(1); }
        }
        .snt-anim-rings { animation:snt-avatar-enter 400ms cubic-bezier(0.4,0,0.2,1) both; }
        /* typewriter cursor */
        .snt-cursor {
          display:inline-block;margin-left:1px;
          animation:snt-blink 0.7s step-end infinite;
          color:rgba(226,202,122,0.85);font-weight:300;
        }
        @keyframes snt-blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
        .snt-hero-text { font-size:22px;color:#F0F2F6;letter-spacing:-0.01em;font-weight:600;text-align:center;margin:0;min-height:1.4em;font-family:var(--font-montserrat,'Montserrat',sans-serif); }
        /* chat feed */
        .snt-chat-feed {
          display:flex;flex-direction:column;gap:16px;
          width:50%;min-width:400px;
          padding-bottom:120px;
        }
        @media (max-width: 860px) {
          .snt-chat-feed { width:100%;min-width:0; }
          .snt-head { gap:10px; }
          .snt-head-l { gap:7px; }
        }
        .snt-bwrap { display:flex;flex-direction:column; }
        .snt-bwrap-u { align-items:flex-end; }
        .snt-bwrap-b { align-items:flex-start; }
        .snt-bot-avatar { display:flex;align-items:center;margin-bottom:4px;padding-left:2px;opacity:0.6; }
        .snt-msg { font-size:13px;line-height:1.65;white-space:pre-wrap;word-break:break-word;font-weight:500; }
        .snt-msg-u {
          max-width:68%;background:linear-gradient(to bottom,#26262d,#111114);color:#F0F2F6;
          border:1px solid rgba(255,255,255,0.055);border-radius:14px;border-bottom-right-radius:4px;
          padding:11px 14px;font-weight:500;
        }
        .snt-msg-b {
          max-width:84%;color:#e8eaed;font-weight:500;
          background:transparent;border:none;border-radius:0;
          padding:2px 0;
        }
        .snt-error-wrap { display:flex;flex-direction:column;gap:5px;padding:4px 3px; }
        .snt-error { font-size:11.5px;color:#ff6b72;line-height:1.4;font-weight:600; }
        .snt-retry { align-self:flex-start;background:rgba(255,107,114,0.10);border:1px solid rgba(255,107,114,0.30);color:#ff9ba0;font-size:11px;padding:4px 10px;border-radius:5px;cursor:pointer;font-family:inherit;transition:background .15s;font-weight:600; }
        .snt-retry:hover { background:rgba(255,107,114,0.18); }
        /* queue hint */
        .snt-queue-hint {
          flex:0 0 auto;display:flex;justify-content:center;padding:0 12px 2px;
          animation:snt-fade-pulse 2s ease-in-out infinite;
        }
        .snt-queue-hint span {
          font-size:10px;color:rgba(214,184,108,0.60);letter-spacing:0.02em;font-weight:600;
        }
        /* scroll fade — only fades chat text, never blocks the glow */
        .snt-fade {
          flex:0 0 auto;height:0;position:relative;z-index:5;pointer-events:none;
          margin-top:-56px;
        }
        .snt-fade::after {
          content:'';display:block;height:56px;
          background:linear-gradient(to bottom,transparent 0%,rgba(10,11,14,0.55) 100%);
        }
        /* input bar */
        .snt-hero-bar {
          flex:0 0 auto;position:relative;padding:6px 12px 10px;background:transparent;isolation:isolate;
          display:flex;justify-content:center;z-index:10;
        }
        .snt-hero-bar::before {
          content:'';position:absolute;inset:-40px -60px 0;
          background:radial-gradient(ellipse at 50% 100%,rgba(184,161,93,0.04) 0%,transparent 70%);
          pointer-events:none;z-index:-1;
        }
        .snt-hero-pill {
          position:relative;display:flex;align-items:center;gap:6px;
          width:50%;min-height:56px;
          background:#0e0f11;
          backdrop-filter:none;
          -webkit-backdrop-filter:none;
          border:1px solid rgba(200,210,230,0.22);border-radius:28px;
          padding:8px 12px 8px 18px;
          box-shadow:0 2px 16px rgba(0,0,0,0.55),inset 0 1px 0 rgba(255,255,255,0.05);
          transition:border-color .2s,box-shadow .2s;
        }
        .snt-hero-pill:focus-within {
          border-color:rgba(255,255,255,0.40);
          box-shadow:0 0 0 1px rgba(255,255,255,0.12),0 4px 24px rgba(0,0,0,0.40);
        }
        .snt-ta {
          flex:1;resize:none;
          min-height:40px;
          max-height:${TA_MAX_H}px;
          overflow-y:hidden;
          scrollbar-width:thin;
          scrollbar-color:rgba(255,255,255,0.12) transparent;
          background:transparent;color:#ffffff;border:none;outline:none;
          padding:9px 8px;font-size:15px;line-height:1.5;font-family:inherit;font-weight:500;
          align-self:center;margin-bottom:0;
        }
        .snt-ta::-webkit-scrollbar { width:2px; }
        .snt-ta::-webkit-scrollbar-track { background:transparent; }
        .snt-ta::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.14);border-radius:2px; }
        .snt-ta::placeholder { color:rgba(255,255,255,0.28);letter-spacing:0.01em;font-size:14px; }
        .snt-ta:focus,.snt-ta:focus-visible { outline:none !important;box-shadow:none !important;border:none !important; }
        .snt-ta:disabled { opacity:0.5;cursor:not-allowed; }
        .snt-pill-ico {
          flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
          width:30px;height:30px;border-radius:50%;background:none;border:none;
          color:rgba(255,255,255,0.50);cursor:pointer;transition:color .15s,background .15s;
        }
        .snt-pill-ico:hover { color:#ffffff;background:rgba(255,255,255,0.09); }
        .snt-pill-ico:disabled { opacity:0.18;cursor:default; }
        .snt-pill-ico:focus,.snt-pill-ico:focus-visible { outline:none;box-shadow:none; }
        .snt-pill-aligned { align-self:center;margin-bottom:0; }
        .snt-pill-send { color:rgba(255,255,255,0.55); }
        .snt-pill-mic-btn {
          flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
          width:36px;height:36px;border-radius:50%;
          background:rgba(255,255,255,0.10);border:none;
          color:rgba(255,255,255,0.75);cursor:pointer;
          transition:background .15s,color .15s;
        }
        .snt-pill-mic-btn:hover { background:rgba(255,255,255,0.16);color:#ffffff; }
        .snt-pill-mic-btn:focus,.snt-pill-mic-btn:focus-visible { outline:none;box-shadow:none; }
        .snt-pill-rec { background:rgba(255,107,114,0.16) !important;color:#ff6b72 !important; }
        /* fullscreen overrides */
        .snt.snt-fullscreen .snt-scroll { padding:0;align-items:center; }
        .snt.snt-fullscreen .snt-chat-feed { width:100%;max-width:1180px;padding:24px 48px 140px;gap:24px; }
        .snt.snt-fullscreen .snt-msg-b { max-width:min(860px,92%);padding:12px 16px;font-size:14px;line-height:1.72;color:#e8eaed; }
        .snt.snt-fullscreen .snt-msg-u { max-width:min(680px,78%);padding:12px 16px;border-radius:14px;border-bottom-right-radius:4px;font-size:13.5px; }
        .snt.snt-fullscreen .snt-empty { justify-content:center;gap:0;padding:0 80px 160px; }
        .snt.snt-fullscreen .snt-hero-text { font-size:28px;letter-spacing:-0.01em; }
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
