"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown, ChevronRight, Grid2x2, Maximize2, Mic, MicOff,
  Minimize2, Pencil, Plus, Send, Star, Trash2, Volume2, VolumeX, X,
} from "lucide-react";
import type { LiveSignalsFeed } from "@/lib/monitoring/liveSignalsFeed";
import { collectRealMonitoringSignals } from "@/lib/monitoring/collectRealMonitoringSignals";

// ── Types ───────────────────────────────────────────────────────────────────

type Role = "user" | "assistant";
type Provider = "ollama" | "claude" | "openai";

type SentinelFavoritePrompt = {
  id: string;
  title: string;
  prompt: string;
  category: "trades" | "signals" | "risk" | "strategy" | "portfolio" | "project" | "custom";
  createdAt: string;
  updatedAt: string;
};

type SourceItem = { path: string; heading?: string; score: number };
type AssistantMeta = { sources?: SourceItem[]; confidence?: string; oneLiner?: string; providerUsed?: string };
type ChatEntry = { role: Role; content: string; meta?: AssistantMeta };

// ── Constants ───────────────────────────────────────────────────────────────

const HISTORY_KEY = "monitoring_sentinel_history";
const MUTE_KEY = "monitoring_sentinel_muted";
const FAVORITES_KEY = "monitoring_sentinel_favorite_prompts";
const DRAFT_KEY = "monitoring_sentinel_draft";
const FULLSCREEN_KEY = "monitoring_sentinel_fullscreen";
const MAX_HISTORY = 30;

const DEFAULT_FAVORITES: SentinelFavoritePrompt[] = [
  { id: "d1", title: "Echte offene Trades", category: "trades", prompt: "Welche aktuellen Trades sind wirklich offen und bestätigt? Bitte unterscheide zwischen bestätigten offenen Trades, Pending-Signalen, Watch-Signalen und nur historischen/geschlossenen Signalen. Nenne Symbol, Strategie, Entry, SL, TP, Quelle und ob es Research-only ist.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d2", title: "Pending vs bestätigt", category: "signals", prompt: "Welche Signale sind aktuell nur pending oder erst beim Kerzenschluss valide, und welche sind bereits bestätigt offen? Bitte erkläre kurz je Signal die Validierungslogik.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d3", title: "Risiko-Regeln", category: "risk", prompt: "Welche Risikoregeln gelten pro Strategiegruppe aktuell? Bitte nenne SL/TP, ATR, Break-Even, Trailing, Position-Sizing und ob die Regeln vollständig implementiert oder nur teilweise dokumentiert sind.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d4", title: "Live Readiness", category: "strategy", prompt: "Welche Strategiegruppen sind aktuell live-ready, partial oder not-ready? Bitte keine Live-Freigabe geben, sondern Research-only Status mit Hauptblockern nennen.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d5", title: "Offene Trades mit Levels", category: "trades", prompt: "Zeige mir alle aktuell offenen Trades mit Entry, aktuellem Preis, Stop Loss, Take Profit, Alter des Signals, Quelle und Status.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d6", title: "Nächste Fixes", category: "project", prompt: "Was sind die wichtigsten nächsten technischen Fixes im Invoria Dashboard? Bitte priorisiere Monitoring, Strategy Engines, Seasonality und Portfolio.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "d7", title: "Aktueller Strategiestand", category: "strategy", prompt: "Gib mir den aktuellen Stand aller Strategien. Unterscheide live-ready, advanced partial, partial und not-ready/unknown. Nenne wichtigste Blocker und nächsten Schritt. Kurz und effizient.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// ── localStorage safe ────────────────────────────────────────────────────────

function lsGet<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed as T;
  } catch { return fallback; }
}
function lsSet(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
function lsClear(key: string) {
  try { if (typeof window !== "undefined") window.localStorage.removeItem(key); } catch { /* ignore */ }
}

// ── Live context builder ─────────────────────────────────────────────────────

function buildLiveContext(feed: LiveSignalsFeed | undefined): string | undefined {
  if (!feed) return undefined;
  const { open, closed } = collectRealMonitoringSignals(feed);
  if (!open.length && !closed.length) return undefined;
  const fmt = (n: number | null) => n != null ? n.toFixed(2) : "—";
  const lines: string[] = [`Live-Signals (${new Date().toLocaleTimeString("de-DE")}, Quelle: live_state)`];
  if (open.length) {
    lines.push(`\nOffen (${open.length}):`);
    for (const s of open.slice(0, 10))
      lines.push(`  ${s.symbol} | ${s.strategy} | ${s.direction.toUpperCase()} | Entry:${fmt(s.entryPrice)} SL:${fmt(s.stopLossPrice)} TP:${fmt(s.takeProfitPrice)} | ${s.sourceLabel} | Research-only`);
  }
  if (closed.length) {
    lines.push(`\nGeschlossen diese Woche (${closed.length}):`);
    for (const s of closed.slice(0, 5)) {
      const pl = s.plPct != null ? `${s.plPct > 0 ? "+" : ""}${s.plPct.toFixed(1)}%` : "?";
      lines.push(`  ${s.symbol} | ${s.strategy} | PL:${pl}`);
    }
  }
  lines.push("\nHINWEIS: Für Live-Bestätigung Monitoring-Tab prüfen.");
  return lines.join("\n");
}

// ── Web Speech API ───────────────────────────────────────────────────────────

type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};
function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
function pickGermanMaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices().filter(v => /de(-|_)/i.test(v.lang));
  if (!voices.length) return null;
  for (const key of ["stefan","hans","markus","male","männlich","google deutsch"]) {
    const hit = voices.find(v => v.name.toLowerCase().includes(key));
    if (hit) return hit;
  }
  return voices[0];
}

// ── Aurum Rings (empty state) ────────────────────────────────────────────────

function AurumRings({ voiceLevel = 0 }: { voiceLevel?: number }) {
  // voiceLevel: 0-1, drives subtle scale + glow boost during listening
  const scale = 1 + voiceLevel * 0.06;
  const glowBoost = voiceLevel * 0.35;
  return (
    <div className="aur-wrap" style={{
      transform: `scale(${scale})`,
      transition: voiceLevel > 0 ? "transform 0.08s ease-out" : "transform 0.3s ease-out",
    }}>
      <svg className="aur-svg" viewBox="0 0 260 260" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Ghost halos */}
        <circle cx="130" cy="130" r="118" stroke="rgba(214,184,108,0.08)" strokeWidth="0.7" />
        <circle cx="130" cy="130" r="108" stroke="rgba(214,184,108,0.06)" strokeWidth="0.6" />
        {/* Base rings */}
        <circle cx="130" cy="130" r="100" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(214,184,108,0.13)" strokeWidth="1.0" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(255,255,255,0.06)" strokeWidth="0.7" />
        <circle cx="130" cy="130" r="62"  stroke="rgba(214,184,108,0.10)" strokeWidth="0.7" />
        {/* Rotating arc 1 — gold, slow CW */}
        <circle cx="130" cy="130" r="100" stroke="#d6b86c" strokeWidth={2.6 + voiceLevel * 0.8}
          strokeDasharray="138 490" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 ${5 + glowBoost * 12}px rgba(214,184,108,${0.65 + glowBoost})) drop-shadow(0 0 12px rgba(214,184,108,0.25))` }}
          className="aur-arc1" />
        {/* Rotating arc 2 — white, slow CCW */}
        <circle cx="130" cy="130" r="88"  stroke="rgba(244,239,230,0.65)" strokeWidth="1.8"
          strokeDasharray="160 353" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 4px rgba(244,239,230,0.30))" }}
          className="aur-arc2" />
        {/* Rotating arc 3 — gold inner */}
        <circle cx="130" cy="130" r="74"  stroke="rgba(214,184,108,0.75)" strokeWidth={1.6 + voiceLevel * 0.5}
          strokeDasharray="90 365" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 ${5 + glowBoost * 8}px rgba(214,184,108,${0.40 + glowBoost * 0.5}))` }}
          className="aur-arc3" />
        {/* Rotating arc 4 — white */}
        <circle cx="130" cy="130" r="62"  stroke="rgba(244,239,230,0.50)" strokeWidth="1.2"
          strokeDasharray="70 319" strokeLinecap="round"
          className="aur-arc4" />
        {/* Tick marks on outer ring */}
        {Array.from({ length: 36 }).map((_, i) => {
          const a = (i * 10 * Math.PI) / 180;
          const inner = 95, outer = i % 6 === 0 ? 91 : 93;
          return (
            <line key={i}
              x1={130 + inner * Math.cos(a)} y1={130 + inner * Math.sin(a)}
              x2={130 + outer * Math.cos(a)} y2={130 + outer * Math.sin(a)}
              stroke={i % 6 === 0 ? "rgba(214,184,108,0.55)" : "rgba(214,184,108,0.28)"}
              strokeWidth={i % 6 === 0 ? "1.2" : "0.7"} />
          );
        })}
        {/* Center glow */}
        <circle cx="130" cy="130" r="44" fill="url(#aurGlow)" />
        <defs>
          <radialGradient id="aurGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgba(214,184,108,0.12)" />
            <stop offset="50%"  stopColor="rgba(214,184,108,0.05)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
      </svg>
      {/* Sentinel icon in center */}
      <div className="aur-center">
        <img src="/Sentinel.png" alt="Sentinel" width={38} height={38} className="aur-icon" />
      </div>
      <style jsx>{`
        .aur-wrap {
          position: relative;
          width: 200px;
          height: 200px;
          flex: 0 0 auto;
          transform-origin: center;
        }
        .aur-svg {
          width: 200px;
          height: 200px;
          overflow: visible;
        }
        .aur-arc1 { transform-origin: 130px 130px; animation: aur-cw  18s linear infinite; }
        .aur-arc2 { transform-origin: 130px 130px; animation: aur-ccw 24s linear infinite; }
        .aur-arc3 { transform-origin: 130px 130px; animation: aur-cw  14s linear infinite; }
        .aur-arc4 { transform-origin: 130px 130px; animation: aur-ccw 30s linear infinite; }
        @keyframes aur-cw  { to { transform: rotate(360deg); } }
        @keyframes aur-ccw { to { transform: rotate(-360deg); } }
        .aur-center {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          pointer-events: none;
        }
        .aur-icon {
          object-fit: contain;
          animation: aur-breathe 4s ease-in-out infinite;
        }
        @keyframes aur-breathe {
          0%, 100% { opacity: 0.65; filter: drop-shadow(0 0 4px rgba(214,184,108,0.30)); }
          50% { opacity: 0.88; filter: drop-shadow(0 0 9px rgba(214,184,108,0.55)) drop-shadow(0 0 18px rgba(214,184,108,0.20)); }
        }
      `}</style>
    </div>
  );
}

// ── Mini Aurum (chat-mode branding) ─────────────────────────────────────────

function MiniAurumRings() {
  return (
    <div className="maur-wrap">
      <svg className="maur-svg" viewBox="0 0 260 260" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="130" cy="130" r="100" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(214,184,108,0.13)" strokeWidth="1.0" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(255,255,255,0.06)" strokeWidth="0.7" />
        <circle cx="130" cy="130" r="62"  stroke="rgba(214,184,108,0.10)" strokeWidth="0.7" />
        <circle cx="130" cy="130" r="100" stroke="#d6b86c" strokeWidth="2.8"
          strokeDasharray="138 490" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 5px rgba(214,184,108,0.6))" }}
          className="maur-arc1" />
        <circle cx="130" cy="130" r="88"  stroke="rgba(244,239,230,0.60)" strokeWidth="1.8"
          strokeDasharray="160 353" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 3px rgba(244,239,230,0.25))" }}
          className="maur-arc2" />
        <circle cx="130" cy="130" r="74"  stroke="rgba(214,184,108,0.70)" strokeWidth="1.6"
          strokeDasharray="90 365" strokeLinecap="round"
          className="maur-arc3" />
      </svg>
      <div className="maur-center">
        <img src="/Sentinel.png" alt="" width={14} height={14} className="maur-icon" />
      </div>
      <style jsx>{`
        .maur-wrap { position:relative;width:46px;height:46px;flex:0 0 46px; }
        .maur-svg { width:46px;height:46px;overflow:visible; }
        .maur-arc1 { transform-origin:130px 130px;animation:aur-cw 18s linear infinite; }
        .maur-arc2 { transform-origin:130px 130px;animation:aur-ccw 24s linear infinite; }
        .maur-arc3 { transform-origin:130px 130px;animation:aur-cw 14s linear infinite; }
        .maur-center { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none; }
        .maur-icon { object-fit:contain;opacity:0.82; }
      `}</style>
    </div>
  );
}

// ── Sources Toggle ───────────────────────────────────────────────────────────

function SourcesToggle({ sources, confidence }: { sources: SourceItem[]; confidence?: string }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  const confColor = confidence === "high" ? "#d6b86c" : confidence === "medium" ? "rgba(255,255,255,0.55)" : "#ff6b72";
  return (
    <div className="snt-src">
      <button type="button" className="snt-src-toggle" onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={8} /> : <ChevronRight size={8} />}
        <span>{sources.length} Quellen</span>
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
        .snt-src { margin-top: 4px; }
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

// ── Aurum Loading (no box — inline rings + label) ────────────────────────────

function AurumLoading({ phase }: { phase: "retrieval" | "thinking" | "generic" }) {
  const label = phase === "retrieval" ? "Brain wird geprüft…" : phase === "thinking" ? "Sentinel formuliert…" : "Sentinel denkt…";
  return (
    <div className="snt-aload">
      <MiniAurumRings />
      <span className="snt-aload-label">{label}</span>
      <style jsx>{`
        .snt-aload { display:inline-flex;align-items:center;gap:8px;padding:4px 0; }
        .snt-aload-label { font-size:11px;color:rgba(214,184,108,0.50);letter-spacing:0.05em;font-weight:400; }
      `}</style>
    </div>
  );
}

// ── Assistant Text (formatted with bold label lines) ─────────────────────────

const LABEL_TERMS = new Set([
  "status","aktuell","blocker","nächster schritt","wichtig","hinweis","quelle",
  "trade","risiko","ziel","stand","signal","strategie","offene trades","pending",
  "live-ready","advanced partial","partial","not-ready","not-ready/unknown",
]);

function AssistantText({ content }: { content: string }) {
  const lines = (content ?? "").split("\n");
  return (
    <div className="snt-atext">
      {lines.map((line, i) => {
        const trimmed = line.trimStart();
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx > 0 && colonIdx <= 24) {
          const label = trimmed.slice(0, colonIdx).toLowerCase().trim();
          if (LABEL_TERMS.has(label)) {
            const rest = trimmed.slice(colonIdx + 1);
            return (
              <p key={i} className="snt-atext-p">
                <span className="snt-atext-lbl">{trimmed.slice(0, colonIdx)}:</span>
                {rest}
              </p>
            );
          }
        }
        if (!trimmed) return <div key={i} className="snt-atext-gap" />;
        return <p key={i} className="snt-atext-p">{line}</p>;
      })}
      <style jsx>{`
        .snt-atext { display:flex;flex-direction:column;gap:0; }
        .snt-atext-p { margin:0;padding:0;font-size:inherit;line-height:inherit;white-space:pre-wrap;word-break:break-word; }
        .snt-atext-lbl { color:rgba(220,228,240,0.92);font-weight:600;font-size:inherit; }
        .snt-atext-gap { height:6px; }
      `}</style>
    </div>
  );
}

// ── Favorites Dropdown ───────────────────────────────────────────────────────

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
        .fav-wrap { position:relative; }
        .fav-toggle { display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;background:none;border:none;border-radius:50%;color:rgba(255,255,255,0.45);cursor:pointer;transition:color .15s,background .15s; }
        .fav-toggle:hover,.fav-toggle-active { color:rgba(255,255,255,0.85);background:rgba(255,255,255,0.06); }
        .fav-menu { position:absolute;bottom:calc(100% + 6px);left:0;width:210px;background:#0a0c11;border:1px solid rgba(214,184,108,0.12);border-radius:8px;z-index:200;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.7),0 0 20px rgba(214,184,108,0.04); }
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

// ── Main Component ───────────────────────────────────────────────────────────

type Props = { onResizeStart?: (e: React.PointerEvent) => void; halved?: boolean; feed?: LiveSignalsFeed };

export default function SentinelPanel({ onResizeStart, halved = false, feed }: Props) {

  const [entries, setEntries] = useState<ChatEntry[]>(() => {
    try {
      const DUMMY_EXACT = ["text nachricht", "sentinel text", "lorem ipsum", "dummy", "placeholder"];
      const STALE_CONTAINS = ["ollama-anbindung strukturieren", "brain-verbindung prüfen", "sentinel technisch verbessern", "chat-funktion reparieren"];
      const raw = lsGet<unknown>(HISTORY_KEY, []);
      // Guard: must be a real array, otherwise wipe and start fresh
      if (!Array.isArray(raw)) { lsClear(HISTORY_KEY); return []; }
      return (raw as ChatEntry[]).filter(e => {
        if (!e || typeof e !== "object") return false;
        const c = (e.content || "").trim().toLowerCase();
        if (!c) return false;
        if (DUMMY_EXACT.some(d => c === d)) return false;
        if (e.role === "assistant" && STALE_CONTAINS.some(s => c.includes(s))) return false;
        return true;
      });
    } catch { lsClear(HISTORY_KEY); return []; }
  });
  const [favorites, setFavorites] = useState<SentinelFavoritePrompt[]>(() => {
    try {
      const saved = lsGet<unknown>(FAVORITES_KEY, null);
      if (Array.isArray(saved) && saved.length > 0) return saved as SentinelFavoritePrompt[];
    } catch { /* ignore */ }
    return DEFAULT_FAVORITES;
  });
  const [input, setInput] = useState(() => { try { return lsGet<string>(DRAFT_KEY, ""); } catch { return ""; } });
  const [busy, setBusy] = useState(false);
  const [loadPhase, setLoadPhase] = useState<"retrieval" | "thinking" | "generic">("generic");
  const [error, setError] = useState<string | null>(null);
  const [retryText, setRetryText] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [muted, setMuted] = useState<boolean>(() => { try { return lsGet<string>(MUTE_KEY, "0") === "1"; } catch { return false; } });
  // fullscreen always starts false to avoid SSR/hydration mismatch — restored client-side in useEffect
  const [fullscreen, setFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [provider, setProvider] = useState<Provider>("ollama");
  const [providers, setProviders] = useState<Record<Provider, boolean>>({ ollama: true, claude: false, openai: false });
  const [micAvailable] = useState(() => { try { return Boolean(getSpeechRecognition()); } catch { return false; } });

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseInputRef = useRef(""); // finalized transcript text
  const interimRef = useRef(""); // current interim transcript
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  // Restore client-only state after hydration — prevents SSR mismatch
  useEffect(() => {
    setMounted(true);
    try { setFullscreen(lsGet<string>(FULLSCREEN_KEY, "0") === "1"); } catch { /* ignore */ }
  }, []);

  useEffect(() => { lsSet(HISTORY_KEY, entries.slice(-MAX_HISTORY)); }, [entries]);
  useEffect(() => { lsSet(FAVORITES_KEY, favorites); }, [favorites]);
  useEffect(() => { lsSet(MUTE_KEY, muted ? "1" : "0"); }, [muted]);
  useEffect(() => { lsSet(DRAFT_KEY, input); }, [input]);
  useEffect(() => { if (mounted) lsSet(FULLSCREEN_KEY, fullscreen ? "1" : "0"); }, [fullscreen, mounted]);

  // Body scroll lock + ESC when fullscreen
  useEffect(() => {
    if (!fullscreen) { document.body.style.overflow = ""; return; }
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [fullscreen]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      try { analyserRef.current?.disconnect(); } catch { /* ignore */ }
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      try { audioContextRef.current?.close(); } catch { /* ignore */ }
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/sentinel/providers").then(r => r.ok ? r.json() : null).then(d => { if (alive && d) setProviders(p => ({ ...p, ...d })); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, busy]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.getVoices();
  }, []);

  const liveContext = useMemo(() => buildLiveContext(feed), [feed]);

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

  // ── Voice analysis (Web Audio API) ────────────────────────────────────────

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
    } catch {
      // permission denied or not available — fallback: simple pulse via listening state
    }
  }, []);

  // ── Mic toggle (continuous, no auto-send) ─────────────────────────────────

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null; // null first — prevents onend auto-restart
    interimRef.current = "";
    try { rec?.stop(); } catch { /* ignore */ }
    stopVoiceAnalysis();
    setListening(false);
  }, [stopVoiceAnalysis]);

  const toggleMic = useCallback(() => {
    if (listening) { stopListening(); return; }

    const Rec = getSpeechRecognition();
    if (!Rec) return;

    // Capture current input as base before recognition starts
    baseInputRef.current = input;
    interimRef.current = "";

    const rec = new Rec();
    rec.lang = "de-DE";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript || "";
        if (e.results[i].isFinal) finalText += t + " ";
        else interimText += t;
      }
      if (finalText) {
        baseInputRef.current = (baseInputRef.current + " " + finalText).trim();
        interimRef.current = "";
      } else {
        interimRef.current = interimText;
      }
      const combined = (baseInputRef.current + (interimText ? " " + interimText : "")).trim();
      setInput(combined);
    };

    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stopListening();
      }
      // no-speech, audio-capture, network — non-fatal, let onend restart handle it
    };

    rec.onend = () => {
      // Restart if still the active recognition (browser auto-stops)
      if (recognitionRef.current === rec) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };

    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
      startVoiceAnalysis();
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  }, [listening, input, stopListening, startVoiceAnalysis]);

  const send = useCallback(async (overrideText?: string) => {
    // Stop listening before sending (keep text, just stop mic)
    if (listening) stopListening();

    const text = (overrideText ?? input).trim();
    if (!text || busy) return;
    setError(null);
    setRetryText(null);
    const newEntry: ChatEntry = { role: "user", content: text };
    const nextEntries = [...entries, newEntry];
    setEntries(nextEntries);
    setInput("");
    baseInputRef.current = "";
    interimRef.current = "";
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setBusy(true);
    setLoadPhase("retrieval");
    const historyMessages = nextEntries.slice(-MAX_HISTORY).map(e => ({ role: e.role, content: e.content }));
    setTimeout(() => setLoadPhase("thinking"), 1200);
    try {
      const res = await fetch("/api/sentinel/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyMessages, provider, liveContext }),
      });
      if (!res.ok) {
        let detail = "";
        try { const j = await res.json(); detail = j?.detail || ""; } catch { /* ignore */ }
        const detailLower = detail.toLowerCase();
        let msg = "";
        if (res.status === 503) msg = "Sentinel Backend ist nicht erreichbar.";
        else if (res.status === 502 || detailLower.includes("ollama") || detailLower.includes("connection")) msg = "Ollama ist offline. Starte Ollama lokal und prüfe Port 11434.";
        else if (res.status === 504 || detailLower.includes("timeout")) msg = "Ollama antwortet zu langsam oder ist beschäftigt.";
        else if (detailLower.includes("out of memory") || detailLower.includes("oom")) msg = "Ollama: Zu wenig VRAM — Modell zu groß.";
        else if (detailLower.includes("model") && detailLower.includes("not found")) msg = `Modell nicht verfügbar: ${detail}`;
        else msg = detail || `Fehler ${res.status}`;
        setError(msg);
        setRetryText(text);
        return;
      }
      const data = await res.json();
      setEntries(prev => [...prev, { role: "assistant", content: data.reply || "", meta: { sources: data.sources || [], confidence: data.confidence, oneLiner: data.oneLiner, providerUsed: data.providerUsed } }]);
      speak(data.oneLiner || "");
    } catch {
      setError("Sentinel Backend ist nicht erreichbar.");
      setRetryText(text);
    } finally {
      setBusy(false);
    }
  }, [input, busy, entries, provider, liveContext, speak, listening, stopListening]);

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

  const retryLastMessage = useCallback(() => {
    if (!retryText) return;
    // Remove the failed user message from entries before resending
    setEntries(prev => prev.filter(e => !(e.role === "user" && e.content === retryText)));
    setError(null);
    setTimeout(() => send(retryText), 50);
  }, [retryText, send]);

  const clearHistory = useCallback(() => {
    setEntries([]);
    try { window.localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const onTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    // Keep baseInput in sync when user edits manually (interim text discarded)
    if (listening) {
      baseInputRef.current = val;
      interimRef.current = "";
    }
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
  };

  const showProviderToggle = providers.claude || providers.openai;
  const saveCurrentAsFav = (content: string) => {
    const title = window.prompt("Titel für diesen Favoriten:", content.slice(0, 40));
    if (!title?.trim()) return;
    setFavorites(prev => [...prev, { id: `s-${Date.now()}`, title: title.trim(), prompt: content, category: "custom", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  };

  // Fallback pulse scale when voiceLevel is 0 but listening (no audio permission)
  const effectiveVoiceLevel = listening && voiceLevel === 0
    ? (Math.sin(Date.now() / 400) * 0.5 + 0.5) * 0.3
    : voiceLevel;

  const panel = (
    <aside className={`snt${halved && !fullscreen ? " snt-halved" : ""}${fullscreen ? " snt-fullscreen" : ""}`}>
      {onResizeStart && (
        <div className="snt-resize" role="separator" aria-orientation="vertical"
          aria-label="Sentinel Breite" onPointerDown={onResizeStart} />
      )}

      {/* ── Header ── */}
      <header className="snt-head">
        <div className="snt-title">
          <img src="/Sentinel.png" alt="Sentinel" width={15} height={15} style={{ objectFit: "contain" }} />
          <span>Sentinel</span>
        </div>
        <div className="snt-head-r">
          {showProviderToggle && (
            <select className="snt-provider" value={provider} onChange={e => setProvider(e.target.value as Provider)}>
              <option value="ollama">Ollama</option>
              {providers.claude && <option value="claude">Claude</option>}
              {providers.openai && <option value="openai">OpenAI</option>}
            </select>
          )}
          <button type="button" className="snt-ico" onClick={() => setMuted(m => !m)} title={muted ? "Stimme an" : "Stimme aus"}>
            {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
          {entries.length > 0 && (
            <button type="button" className="snt-ico" onClick={clearHistory} title="Verlauf löschen">
              <Trash2 size={11} />
            </button>
          )}
          <button type="button" className="snt-ico" onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? "Vollbild beenden" : "Vollbild"}>
            {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </header>

      {/* ── Chat scroll ── */}
      <div className="snt-scroll" ref={scrollRef}>
        {entries.length === 0 && !busy ? (
          <div className="snt-empty">
            <div className={`snt-empty-rings${fullscreen ? " snt-empty-rings-fs" : ""}`}>
              <AurumRings voiceLevel={listening ? effectiveVoiceLevel : 0} />
            </div>
            <p className="snt-hero-text">
              {listening ? "Ich höre zu…" : "Geben Sie mir eine Aufgabe, Sir"}
            </p>
          </div>
        ) : (
          <div className="snt-chat-feed">
            {entries.map((entry, i) => (
              <div key={i} className={`snt-bwrap ${entry.role === "user" ? "snt-bwrap-u" : "snt-bwrap-b"}`}>
                <div className={`snt-msg ${entry.role === "user" ? "snt-msg-u" : "snt-msg-b"}`}>
                  {entry.role === "assistant"
                    ? <AssistantText content={entry.content} />
                    : entry.content}
                </div>
                {entry.role === "user" && (
                  <button type="button" className="snt-star" title="Als Favorit speichern" onClick={() => saveCurrentAsFav(entry.content)}>
                    <Star size={9} />
                  </button>
                )}
              </div>
            ))}
            {busy && (
              <div className="snt-bwrap snt-bwrap-b">
                <AurumLoading phase={loadPhase} />
              </div>
            )}
            {error && (
              <div className="snt-error-wrap">
                <span className="snt-error">{error}</span>
                {retryText && (
                  <button type="button" className="snt-retry" onClick={retryLastMessage}>
                    Erneut versuchen
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Hero Input ── */}
      <div className="snt-hero-bar">
        <div className="snt-hero-pill">
          {/* Left: Favorites */}
          <FavoritesDropdown
            favorites={favorites}
            onSelect={f => send(f.prompt)}
            onDelete={deleteFavorite}
            onRename={renameFavorite}
            onAdd={addFavorite}
          />
          {/* Center: input */}
          <textarea
            ref={textareaRef}
            className="snt-ta"
            rows={1}
            placeholder={listening ? "Spricht…" : "Sentinel fragen…"}
            value={input}
            onChange={onTextareaChange}
            onKeyDown={onKeyDown}
            disabled={busy}
          />
          {/* Send button: visible when there is text */}
          {input.trim() && (
            <button type="button" className="snt-pill-ico snt-pill-send" onClick={() => send()}
              disabled={busy} title="Senden">
              <Send size={14} />
            </button>
          )}
          {/* Mic button: always visible when supported */}
          {micAvailable && (
            <button type="button"
              className={`snt-pill-ico snt-pill-mic${listening ? " snt-pill-rec" : ""}`}
              onClick={toggleMic}
              title={listening ? "Aufnahme stoppen" : "Mikrofon"}>
              {listening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .snt {
          position: relative;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          background: #060709;
          color: #e2e6ed;
          font-size: 13px;
          font-family: var(--font-montserrat, "Montserrat", system-ui, -apple-system, sans-serif);
        }
        .snt.snt-fullscreen {
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          width: 100vw;
          width: 100dvw;
          height: 100vh;
          height: 100dvh;
          border-radius: 0;
          isolation: isolate;
        }
        .snt.snt-halved {
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        /* dark gradient shadow between live area above and sentinel below */
        .snt.snt-halved::before {
          content: '';
          position: absolute;
          top: -72px;
          left: 0;
          right: 0;
          height: 72px;
          background: linear-gradient(180deg,
            transparent 0%,
            rgba(3,4,7,0.35) 35%,
            rgba(3,4,7,0.72) 65%,
            rgba(3,4,7,0.94) 100%
          );
          pointer-events: none;
          z-index: 10;
        }

        /* resize handle */
        .snt-resize {
          position: absolute; top: 0; left: 0; width: 7px; height: 100%;
          cursor: col-resize; z-index: 30; touch-action: none;
          background: linear-gradient(90deg, rgba(255,255,255,0.08), transparent 70%);
        }
        .snt-resize:hover { background: linear-gradient(90deg, rgba(214,184,108,0.18), transparent 70%); }

        /* header */
        .snt-head {
          flex: 0 0 auto;
          display: flex; align-items: center; justify-content: space-between;
          padding: 7px 10px 6px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: #050608;
        }
        .snt-title { display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:#e2e6ed;letter-spacing:0.03em; }
        .snt-head-r { display:inline-flex;align-items:center;gap:3px; }
        .snt-provider { background:#0a0c10;color:#7a8491;border:1px solid rgba(255,255,255,0.08);border-radius:4px;font-size:10px;padding:2px 4px;cursor:pointer; }
        .snt-ico { display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:transparent;color:rgba(255,255,255,0.45);border:none;border-radius:4px;cursor:pointer; }
        .snt-ico:hover { color:rgba(255,255,255,0.85);background:rgba(255,255,255,0.05); }

        /* scroll */
        .snt-scroll {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 8px 8px 4px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .snt-scroll::-webkit-scrollbar { width: 5px; }
        .snt-scroll::-webkit-scrollbar-track { background: transparent; }
        .snt-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .snt-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

        /* empty state */
        .snt-empty {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 0 20px 24px;
          overflow: hidden;
        }
        .snt-empty-rings {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .snt-empty > * { position: relative; z-index: 1; }
        .snt-hero-text {
          font-size: 15px;
          color: rgba(255,255,255,0.78);
          letter-spacing: 0.03em;
          font-weight: 300;
          text-align: center;
          margin: 0;
        }

        /* chat feed wrapper (centered in fullscreen, flex in panel) */
        .snt-chat-feed { display:flex;flex-direction:column;gap:5px;width:100%; }

        /* bubbles */
        .snt-bwrap { display:flex;flex-direction:column; }
        .snt-bwrap-u { align-items:flex-end; }
        .snt-bwrap-b { align-items:flex-start; }
        .snt-msg { max-width:88%;padding:7px 10px;border-radius:10px;font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word; }
        .snt-msg-u { background:rgba(26,30,40,0.92);color:#d8dde6;border:1px solid rgba(255,255,255,0.06);border-bottom-right-radius:3px; }
        .snt-msg-b { background:rgba(8,10,15,0.72);color:#c8d0dc;border:1px solid rgba(255,255,255,0.055);border-bottom-left-radius:3px;backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(0,0,0,0.35); }
        .snt-star { align-self:flex-end;margin-top:2px;background:none;border:none;color:#333a45;cursor:pointer;padding:2px 3px;opacity:0;transition:opacity .15s,color .15s; }
        .snt-bwrap:hover .snt-star { opacity:1; }
        .snt-star:hover { color:#d6b86c; }
        .snt-error-wrap { display:flex;flex-direction:column;gap:5px;padding:4px 3px; }
        .snt-error { font-size:11.5px;color:#ff6b72;line-height:1.4; }
        .snt-retry { align-self:flex-start;background:rgba(255,107,114,0.10);border:1px solid rgba(255,107,114,0.25);color:#ff9ba0;font-size:11px;padding:4px 10px;border-radius:5px;cursor:pointer;font-family:inherit;transition:background .15s; }
        .snt-retry:hover { background:rgba(255,107,114,0.18);color:#ffbdc0; }

        /* ── Hero Input Bar ── */
        .snt-hero-bar {
          flex: 0 0 auto;
          position: relative;
          padding: 6px 12px 16px;
          background: transparent;
          isolation: isolate;
        }
        .snt-hero-bar::before {
          content: '';
          position: absolute;
          inset: -40px -60px 0;
          background: radial-gradient(ellipse at 50% 100%,
            rgba(214,184,108,0.13) 0%,
            rgba(214,184,108,0.05) 40%,
            transparent 70%
          );
          pointer-events: none;
          z-index: -1;
        }
        /* pill container */
        .snt-hero-pill {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0;
          background: rgba(5,6,8,0.92);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 100px;
          padding: 8px 10px 8px 8px;
          box-shadow:
            0 8px 32px rgba(0,0,0,0.85),
            0 0 0 1px rgba(255,255,255,0.04) inset;
          backdrop-filter: blur(20px) saturate(1.6);
          transition: border-color .25s, box-shadow .25s;
        }
        .snt-hero-pill:focus-within {
          border-color: rgba(255,255,255,0.12);
          box-shadow:
            0 8px 36px rgba(0,0,0,0.88),
            0 0 0 1px rgba(255,255,255,0.07) inset;
        }
        /* textarea inside pill — no scrollbars, no resize, no arrows */
        .snt-ta {
          flex: 1;
          resize: none;
          max-height: 100px;
          overflow: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
          background: transparent;
          color: #dde1e8;
          border: none;
          outline: none;
          padding: 5px 6px;
          font-size: 12.5px;
          line-height: 1.45;
          font-family: inherit;
        }
        .snt-ta::-webkit-scrollbar { display: none !important; }
        .snt-ta::placeholder { color: rgba(180,170,148,0.28); letter-spacing: 0.02em; }
        .snt-ta:focus,
        .snt-ta:focus-visible {
          outline: none !important;
          box-shadow: none !important;
          -webkit-box-shadow: none !important;
          border: none !important;
        }
        /* remove all button focus rings inside pill */
        .snt-pill-ico:focus,
        .snt-pill-ico:focus-visible,
        .fav-toggle:focus,
        .fav-toggle:focus-visible { outline: none; box-shadow: none; }
        /* icons inside pill */
        .snt-pill-ico {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: none;
          border: none;
          color: rgba(255,255,255,0.45);
          cursor: pointer;
          transition: color .15s, background .15s;
        }
        .snt-pill-ico:hover { color: rgba(255,255,255,0.88); background: rgba(255,255,255,0.07); }
        .snt-pill-ico:disabled { opacity: 0.2; cursor: default; }
        .snt-pill-send { color: rgba(255,255,255,0.50); }
        .snt-pill-send:hover { color: rgba(255,255,255,0.92) !important; background: rgba(255,255,255,0.08) !important; }
        /* mic: normal = subtle white, active = red accent only (no bg flood) */
        .snt-pill-mic { color: rgba(255,255,255,0.45); }
        .snt-pill-mic:hover { color: rgba(255,255,255,0.85); }
        .snt-pill-rec { color: #ff6b72 !important; }
        .snt-pill-rec:hover { color: #ff4a52 !important; background: rgba(255,59,70,0.10) !important; }

        /* ── Fullscreen overrides ── */
        .snt.snt-fullscreen .snt-scroll {
          padding: 0;
          align-items: center;
        }
        .snt.snt-fullscreen .snt-chat-feed {
          width: 100%;
          max-width: 1180px;
          padding: 24px 48px 16px;
          gap: 10px;
        }
        .snt.snt-fullscreen .snt-bwrap {
          width: 100%;
        }
        .snt.snt-fullscreen .snt-bwrap-u {
          align-items: flex-end;
        }
        .snt.snt-fullscreen .snt-bwrap-b {
          align-items: flex-start;
        }
        .snt.snt-fullscreen .snt-msg-b {
          max-width: min(860px, 92%);
          padding: 0;
          border-radius: 0;
          border: none;
          background: transparent;
          box-shadow: none;
          backdrop-filter: none;
          font-size: 14px;
          line-height: 1.72;
          color: rgba(210,220,235,0.90);
        }
        .snt-msg-sender-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 6px;
          opacity: 0.55;
        }
        .snt-msg-sender-lbl {
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(214,184,108,0.65);
        }
        .snt.snt-fullscreen .snt-msg-u {
          max-width: min(680px, 78%);
          padding: 12px 16px;
          border-radius: 14px;
          border-bottom-right-radius: 4px;
          font-size: 13.5px;
          background: rgba(22,26,36,0.88);
          border: 1px solid rgba(255,255,255,0.07);
          color: #d4dae4;
        }
        .snt.snt-fullscreen .snt-error-wrap {
          max-width: min(820px, 90%);
          padding: 8px 4px;
        }
        .snt.snt-fullscreen .snt-empty {
          justify-content: center;
          gap: 0;
          padding: 0 80px 140px;
        }
        .snt-empty-rings-fs {
          flex: 0 0 auto !important;
          transform: scale(1.65);
          transform-origin: center;
          margin-bottom: 80px;
        }
        .snt.snt-fullscreen .snt-hero-text {
          font-size: 18px;
          color: rgba(255,255,255,0.82);
          letter-spacing: 0.06em;
          margin-bottom: 0;
        }
        .snt.snt-fullscreen .snt-hero-bar {
          padding: 6px 0 36px;
          display: flex;
          justify-content: center;
        }
        .snt.snt-fullscreen .snt-hero-bar::before {
          inset: -60px 0 0;
          background: radial-gradient(ellipse at 50% 100%,
            rgba(214,184,108,0.16) 0%,
            rgba(214,184,108,0.07) 40%,
            transparent 70%
          );
        }
        .snt.snt-fullscreen .snt-hero-pill {
          width: min(70vw, 920px);
          padding: 12px 14px 12px 10px;
        }
        .snt.snt-fullscreen .snt-ta {
          font-size: 14px;
          padding: 6px 8px;
        }
        .snt-chat-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 0 8px;
          opacity: 0.65;
        }
        .snt-chat-brand-label {
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(214,184,108,0.60);
        }

        /* ── Mobile / iPhone overrides ─────────────────────────────────────── */
        @media (max-width: 640px) {
          /* Panel mode: full-height standalone */
          .snt {
            font-size: 14px;
          }
          /* Larger touch targets for header icons */
          .snt-ico {
            width: 36px;
            height: 36px;
            border-radius: 8px;
          }
          /* Messages: slightly larger on small screen */
          .snt-msg {
            max-width: 94%;
            font-size: 13.5px;
            line-height: 1.62;
          }
          /* Input bar: add safe-area bottom padding for iPhone home indicator */
          .snt-hero-bar {
            padding: 6px 10px max(16px, env(safe-area-inset-bottom));
          }
          /* Pill: full width, bigger tap area */
          .snt-hero-pill {
            padding: 10px 10px 10px 8px;
          }
          /* Pill icons: bigger tap target (44px iOS minimum) */
          .snt-pill-ico {
            width: 40px;
            height: 40px;
          }
          /* Textarea: slightly larger text */
          .snt-ta {
            font-size: 14px;
            padding: 6px 8px;
          }
          /* Hero text: more readable */
          .snt-hero-text {
            font-size: 16px;
          }
          /* Assistant text: readable on small screen */
          .snt-atext-p {
            font-size: 13.5px;
            line-height: 1.65;
          }
        }

        /* Fullscreen on mobile */
        @media (max-width: 640px) {
          .snt.snt-fullscreen .snt-chat-feed {
            padding: 16px 14px 8px;
          }
          .snt.snt-fullscreen .snt-msg-b {
            max-width: 100%;
            font-size: 14px;
          }
          .snt.snt-fullscreen .snt-msg-u {
            max-width: 88%;
            font-size: 13.5px;
          }
          .snt.snt-fullscreen .snt-hero-bar {
            padding: 6px 14px max(20px, env(safe-area-inset-bottom));
          }
          .snt.snt-fullscreen .snt-hero-pill {
            width: 100%;
            max-width: 100%;
          }
          .snt.snt-fullscreen .snt-empty {
            padding: 0 20px 80px;
          }
        }
      `}</style>
    </aside>
  );

  // Only use portal after client mount to prevent SSR hydration mismatch
  if (mounted && fullscreen && typeof document !== "undefined") {
    return createPortal(panel, document.body);
  }
  return panel;
}
