/**
 * Sentinel Voice — local/free TTS library
 *
 * Architecture:
 *   Sentinel UI → /api/sentinel/tts (Next.js proxy) → localhost:5050 (Kokoro FastAPI)
 *   Fallback: browser SpeechSynthesis (en-GB)
 */

// ── Voice registry ────────────────────────────────────────────────────────────

export type VoiceEngine = "kokoro" | "browser";

export interface SentinelVoice {
  id: string;
  label: string;
  engine: VoiceEngine;
  lang: string;
  description: string;
  license: string;
  isDefault?: boolean;
}

export const SENTINEL_VOICES: SentinelVoice[] = [
  {
    id: "kokoro:bm_george",
    label: "Sentinel — George",
    engine: "kokoro",
    lang: "en-GB",
    description: "British male · calm · institutional",
    license: "Apache-2.0",
    isDefault: true,
  },
  {
    id: "kokoro:bm_fable",
    label: "Sentinel — Fable",
    engine: "kokoro",
    lang: "en-GB",
    description: "British male · measured · clear",
    license: "Apache-2.0",
  },
  {
    id: "kokoro:bm_daniel",
    label: "Sentinel — Daniel",
    engine: "kokoro",
    lang: "en-GB",
    description: "British male · understated",
    license: "Apache-2.0",
  },
  {
    id: "kokoro:bm_lewis",
    label: "Sentinel — Lewis",
    engine: "kokoro",
    lang: "en-GB",
    description: "British male · warm",
    license: "Apache-2.0",
  },
  {
    id: "browser:en-GB",
    label: "System Voice",
    engine: "browser",
    lang: "en-GB",
    description: "Browser native (fallback)",
    license: "system",
  },
];

export const DEFAULT_VOICE_ID = "kokoro:bm_george";
const VOICE_KEY = "snt_voice_id_v2";
const MUTE_KEY = "fmd_sentinel_muted";
const SPEED_KEY = "snt_voice_speed";
const AUTO_SPEAK_KEY = "snt_auto_speak";

// ── Persistence ───────────────────────────────────────────────────────────────

export function loadVoiceId(): string {
  if (typeof localStorage === "undefined") return DEFAULT_VOICE_ID;
  return localStorage.getItem(VOICE_KEY) || DEFAULT_VOICE_ID;
}

export function saveVoiceId(id: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(VOICE_KEY, id);
}

export function loadMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function saveMuted(v: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MUTE_KEY, v ? "1" : "0");
}

export function loadSpeed(): number {
  if (typeof localStorage === "undefined") return 1.0;
  const s = parseFloat(localStorage.getItem(SPEED_KEY) || "1.0");
  return isNaN(s) ? 1.0 : Math.max(0.85, Math.min(1.15, s));
}

export function saveSpeed(v: number): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SPEED_KEY, String(v));
}

export function loadAutoSpeak(): boolean {
  if (typeof localStorage === "undefined") return true;
  const v = localStorage.getItem(AUTO_SPEAK_KEY);
  return v === null ? true : v === "1";
}

export function saveAutoSpeak(v: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AUTO_SPEAK_KEY, v ? "1" : "0");
}

// ── Pronunciation normalization ────────────────────────────────────────────────

const PRONUNCIATION_MAP: [RegExp, string][] = [
  // Currency pairs
  [/EUR\/USD/g, "euro dollar"],
  [/GBP\/USD/g, "pound dollar"],
  [/USD\/JPY/g, "dollar yen"],
  [/EUR\/GBP/g, "euro pound"],
  [/USD\/CHF/g, "dollar swiss franc"],
  // Futures / instruments
  [/\bNQ1?\b/g, "Nasdaq futures"],
  [/\bES1?\b/g, "S&P futures"],
  [/\bYM1?\b/g, "Dow futures"],
  [/\bMNQ1?\b/g, "Micro Nasdaq"],
  [/\bMGC\b/g, "Micro Gold"],
  [/\bM6E\b/g, "Micro Euro futures"],
  [/\bM6B\b/g, "Micro British Pound"],
  [/\bFDXS\b/g, "Dax Scalper"],
  [/\bFDAX\b/g, "Dax futures"],
  [/\b6B1?\b/g, "British Pound futures"],
  [/\b6E1?\b/g, "Euro futures"],
  [/\bGC1?\b/g, "Gold futures"],
  // Indices
  [/\bS&P 500\b/gi, "S and P 500"],
  [/\bS&P\b/gi, "S and P"],
  [/\bDAX\b/g, "Dax"],
  [/\bNASDAQ\b/g, "Nasdaq"],
  // Companies / Brokers
  [/\bIBKR\b/g, "Interactive Brokers"],
  // Financial terms
  [/\bP&L\b/gi, "P and L"],
  [/\bCAGR\b/g, "compound annual growth rate"],
  [/\bMaxDD\b/gi, "maximum drawdown"],
  [/\bSharpe\b/g, "Sharpe ratio"],
  [/\bVIX\b/g, "volatility index"],
  [/\bATR\b/g, "average true range"],
  [/\bVWAP\b/g, "volume weighted average price"],
  // Capitalife-specific
  [/\bWhite Swan\b/g, "White Swan"],
  [/\bCapitalife\b/g, "Capitalife"],
  [/\bSentinel\b/g, "Sentinel"],
  // Numbers with % — make them more natural
  [/(\d+(?:\.\d+)?)\s*%/g, "$1 percent"],
  // EUR amounts
  [/€\s*(\d+(?:[,.]\d+)*)/g, "$1 euros"],
  [/(\d+(?:[,.]\d+)*)\s*€/g, "$1 euros"],
];

export function normalizePronunciation(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PRONUNCIATION_MAP) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

// ── Spoken brief extraction ────────────────────────────────────────────────────

const MAX_SPOKEN_WORDS = 60;

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")        // code blocks
    .replace(/`[^`]*`/g, "")              // inline code
    .replace(/!\[.*?\]\(.*?\)/g, "")      // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text only
    .replace(/^#{1,6}\s+.*$/gm, "")       // headings — drop the whole title line, not just the marker
    .replace(/^\s*[-*+]\s+/gm, "")        // bullets
    .replace(/^\s*\d+\.\s+/gm, "")        // numbered lists
    .replace(/^\s*[|].*$/gm, "")          // table rows
    .replace(/^\s*[-|:]+\s*$/gm, "")      // table separators
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1") // bold/italic
    // underscore italic/bold: only strip single-underscore-delimited *phrases* bounded by
    // whitespace/punctuation, so identifiers like NO_ROBUST_EDGE_FOUND are left intact
    .replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")        // strikethrough
    .replace(/^>\s*/gm, "")              // blockquotes
    .replace(/https?:\/\/\S+/g, "")       // URLs
    .replace(/\s{2,}/g, " ")              // multiple spaces
    .trim();
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  // End at sentence boundary if possible
  const truncated = words.slice(0, maxWords).join(" ");
  const lastPeriod = Math.max(truncated.lastIndexOf("."), truncated.lastIndexOf("!"), truncated.lastIndexOf("?"));
  if (lastPeriod > truncated.length * 0.5) {
    return truncated.slice(0, lastPeriod + 1);
  }
  return truncated + ".";
}

function extractFirstSentences(text: string, maxWords: number): string {
  // Split on sentence-ending punctuation
  const sentenceRe = /[^.!?]+[.!?]+/g;
  const sentences: string[] = [];
  let words = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceRe.exec(text)) !== null) {
    const s = match[0].trim();
    if (!s) continue;
    const w = s.split(/\s+/).length;
    if (words + w > maxWords && sentences.length > 0) break;
    sentences.push(s);
    words += w;
    if (words >= maxWords) break;
  }

  if (!sentences.length) return truncateToWords(text, maxWords);
  return sentences.join(" ");
}

/**
 * Extracts a short spoken brief from a full Sentinel answer.
 * Never exceeds MAX_SPOKEN_WORDS words (~20 seconds of speech).
 * Strips all Markdown, tables, code, URLs.
 */
export function extractSpokenBrief(fullAnswer: string): string {
  if (!fullAnswer?.trim()) return "";

  const clean = stripMarkdown(fullAnswer);
  if (!clean) return "";

  const brief = extractFirstSentences(clean, MAX_SPOKEN_WORDS);
  const normalized = normalizePronunciation(brief);

  // Final word count guard
  return truncateToWords(normalized, MAX_SPOKEN_WORDS);
}

// ── Audio cache ────────────────────────────────────────────────────────────────

interface CacheEntry {
  blob: Blob;
  ts: number;
}

const MAX_CACHE_ENTRIES = 50;
const audioCache = new Map<string, CacheEntry>();

function cacheKey(voiceId: string, text: string, speed: number): string {
  // Simple deterministic key — no crypto needed for this use case
  return `${voiceId}|${speed}|${text}`;
}

function pruneCache(): void {
  if (audioCache.size <= MAX_CACHE_ENTRIES) return;
  // Remove oldest entries
  const entries = [...audioCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  for (const [k] of entries.slice(0, audioCache.size - MAX_CACHE_ENTRIES)) {
    audioCache.delete(k);
  }
}

export function getCachedAudio(voiceId: string, text: string, speed: number): Blob | null {
  const entry = audioCache.get(cacheKey(voiceId, text, speed));
  return entry ? entry.blob : null;
}

export function setCachedAudio(voiceId: string, text: string, speed: number, blob: Blob): void {
  audioCache.set(cacheKey(voiceId, text, speed), { blob, ts: Date.now() });
  pruneCache();
}

// ── TTS health check ──────────────────────────────────────────────────────────

let _localTTSAvailable: boolean | null = null;
let _healthCheckTs = 0;
const HEALTH_TTL_MS = 30_000;

export async function checkLocalTTSHealth(): Promise<boolean> {
  const now = Date.now();
  if (_localTTSAvailable !== null && now - _healthCheckTs < HEALTH_TTL_MS) {
    return _localTTSAvailable;
  }
  try {
    const res = await fetch("/api/sentinel/tts/health", { signal: AbortSignal.timeout(3000) });
    _localTTSAvailable = res.ok;
  } catch {
    _localTTSAvailable = false;
  }
  _healthCheckTs = Date.now();
  return _localTTSAvailable ?? false;
}

export function invalidateTTSHealthCache(): void {
  _localTTSAvailable = null;
}

// ── Kokoro synthesis via API ─────────────────────────────────────────────────

export async function synthesizeKokoro(
  text: string,
  voiceId: string,
  speed: number
): Promise<Blob | null> {
  const cached = getCachedAudio(voiceId, text, speed);
  if (cached) return cached;

  const kokoroVoice = voiceId.replace("kokoro:", "");
  try {
    const res = await fetch("/api/sentinel/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: kokoroVoice, speed }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    setCachedAudio(voiceId, text, speed, blob);
    return blob;
  } catch {
    return null;
  }
}

// ── Browser TTS fallback ─────────────────────────────────────────────────────

function getBritishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  // Prefer en-GB over en-US
  const priority = [
    (v: SpeechSynthesisVoice) => /en[-_]GB/i.test(v.lang) && /neural/i.test(v.name),
    (v: SpeechSynthesisVoice) => /en[-_]GB/i.test(v.lang) && /microsoft/i.test(v.name),
    (v: SpeechSynthesisVoice) => /en[-_]GB/i.test(v.lang),
    (v: SpeechSynthesisVoice) => /en[-_]US/i.test(v.lang) && /neural/i.test(v.name),
    (v: SpeechSynthesisVoice) => /en/i.test(v.lang),
  ];
  for (const test of priority) {
    const v = voices.find(test);
    if (v) return v;
  }
  return voices[0] ?? null;
}

let _browserUtterance: SpeechSynthesisUtterance | null = null;

export function speakBrowser(
  text: string,
  speed: number,
  onStart: () => void,
  onEnd: () => void
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  _browserUtterance = new SpeechSynthesisUtterance(text);
  _browserUtterance.lang = "en-GB";
  _browserUtterance.rate = speed;
  _browserUtterance.pitch = 0.95;
  const voice = getBritishVoice();
  if (voice) _browserUtterance.voice = voice;
  _browserUtterance.onstart = onStart;
  _browserUtterance.onend = onEnd;
  _browserUtterance.onerror = onEnd;
  window.speechSynthesis.speak(_browserUtterance);
}

export function cancelBrowserSpeech(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  _browserUtterance = null;
}

// ── Audio element playback ────────────────────────────────────────────────────

let _audioEl: HTMLAudioElement | null = null;

export function playAudioBlob(
  blob: Blob,
  onStart: () => void,
  onEnd: () => void
): HTMLAudioElement {
  if (_audioEl) {
    _audioEl.pause();
    _audioEl.src = "";
  }
  const url = URL.createObjectURL(blob);
  _audioEl = new Audio(url);
  _audioEl.onplay = onStart;
  _audioEl.onended = () => { URL.revokeObjectURL(url); onEnd(); };
  _audioEl.onerror = () => { URL.revokeObjectURL(url); onEnd(); };
  _audioEl.play().catch(onEnd);
  return _audioEl;
}

export function pauseAudio(): void {
  _audioEl?.pause();
}

export function resumeAudio(): void {
  _audioEl?.play().catch(() => {});
}

export function stopAudio(): void {
  if (_audioEl) {
    _audioEl.pause();
    _audioEl.src = "";
    _audioEl = null;
  }
  cancelBrowserSpeech();
}
