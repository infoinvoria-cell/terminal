"use client";

/**
 * useSentinelVoice — shared voice hook for Desktop + Mobile Sentinel
 *
 * Backend priority:
 *   1. Local Kokoro sidecar   (Desktop/local only, via /api/sentinel/tts)
 *   2. Browser-local Kokoro   (Mobile/Vercel, on-device inference)
 *   3. Browser SpeechSynthesis (universal fallback)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SENTINEL_VOICES,
  DEFAULT_VOICE_ID,
  loadVoiceId,
  saveVoiceId,
  loadMuted,
  saveMuted,
  loadSpeed,
  saveSpeed,
  loadAutoSpeak,
  saveAutoSpeak,
  extractSpokenBrief,
  detectLanguage,
  checkLocalTTSHealth,
  synthesizeKokoro,
  speakBrowser,
  cancelBrowserSpeech,
  playAudioBlob,
  pauseAudio,
  resumeAudio,
  stopAudio,
} from "@/lib/sentinel/sentinel-voice";
import {
  isBrowserKokoroSupported,
  loadBrowserKokoro,
  synthesizeBrowserKokoro,
  getBrowserKokoroState,
} from "@/lib/sentinel/browser-kokoro";

export type VoiceStatus =
  | "idle"
  | "model_loading"
  | "generating"
  | "speaking"
  | "paused"
  | "offline"
  | "error";

export type VoiceBackend = "local-sidecar" | "browser-kokoro" | "browser-speech" | null;

export interface SentinelVoiceState {
  status: VoiceStatus;
  muted: boolean;
  voiceId: string;
  speed: number;
  autoSpeak: boolean;
  localTTSAvailable: boolean;
  voiceDropOpen: boolean;
  backend: VoiceBackend;
  browserKokoroSupported: boolean;

  setMuted: (v: boolean) => void;
  setVoiceId: (id: string) => void;
  setSpeed: (v: number) => void;
  setAutoSpeak: (v: boolean) => void;
  setVoiceDropOpen: (v: boolean) => void;
  speakBrief: (fullAnswer: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  replay: () => void;
}

// Re-export for consumers that want voice metadata
export { SENTINEL_VOICES, DEFAULT_VOICE_ID };

export function useSentinelVoice(): SentinelVoiceState {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [muted, setMutedState] = useState<boolean>(() => (typeof window !== "undefined" ? loadMuted() : false));
  const [voiceId, setVoiceIdState] = useState<string>(() => (typeof window !== "undefined" ? loadVoiceId() : DEFAULT_VOICE_ID));
  const [speed, setSpeedState] = useState<number>(() => (typeof window !== "undefined" ? loadSpeed() : 1.0));
  const [autoSpeak, setAutoSpeakState] = useState<boolean>(() => (typeof window !== "undefined" ? loadAutoSpeak() : true));
  const [localTTSAvailable, setLocalTTSAvailable] = useState(false);
  const [voiceDropOpen, setVoiceDropOpen] = useState(false);
  const [backend, setBackend] = useState<VoiceBackend>(null);
  const [browserKokoroSupported] = useState<boolean>(() => isBrowserKokoroSupported());

  const lastBriefRef = useRef<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await checkLocalTTSHealth();
      if (!cancelled) setLocalTTSAvailable(ok);
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const setMuted = useCallback((v: boolean) => {
    setMutedState(v);
    saveMuted(v);
    if (v) stopAudio();
  }, []);

  const setVoiceId = useCallback((id: string) => {
    setVoiceIdState(id);
    saveVoiceId(id);
  }, []);

  const setSpeed = useCallback((v: number) => {
    setSpeedState(v);
    saveSpeed(v);
  }, []);

  const setAutoSpeak = useCallback((v: boolean) => {
    setAutoSpeakState(v);
    saveAutoSpeak(v);
  }, []);

  const stop = useCallback(() => {
    stopAudio();
    setStatus("idle");
  }, []);

  const pause = useCallback(() => {
    pauseAudio();
    cancelBrowserSpeech();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    resumeAudio();
    setStatus("speaking");
  }, []);

  const speakViaBrowserFallback = useCallback((brief: string, lang: "en" | "de" = "en") => {
    setBackend("browser-speech");
    setStatus("speaking");
    speakBrowser(brief, speed, () => setStatus("speaking"), () => setStatus("idle"), lang);
  }, [speed]);

  const doSpeak = useCallback(async (brief: string) => {
    if (!brief.trim() || muted) return;

    stop();
    lastBriefRef.current = brief;

    const lang = detectLanguage(brief);
    if (lang === "de") {
      speakViaBrowserFallback(brief, "de");
      return;
    }

    const voice = SENTINEL_VOICES.find(v => v.id === voiceId) ?? SENTINEL_VOICES[0];
    const kokoroVoiceName = voiceId.replace("kokoro:", "");

    if (voice.engine === "kokoro" && localTTSAvailable) {
      setStatus("generating");
      const blob = await synthesizeKokoro(brief, voiceId, speed);
      if (blob) {
        setBackend("local-sidecar");
        setStatus("speaking");
        audioRef.current = playAudioBlob(blob, () => setStatus("speaking"), () => setStatus("idle"));
        return;
      }
    }

    if (voice.engine === "kokoro" && !localTTSAvailable && browserKokoroSupported) {
      const current = getBrowserKokoroState();
      if (current.status !== "ready") {
        setStatus("model_loading");
        await loadBrowserKokoro();
      }
      if (getBrowserKokoroState().status === "ready") {
        setStatus("generating");
        const blob = await synthesizeBrowserKokoro(brief, kokoroVoiceName, speed);
        if (blob) {
          setBackend("browser-kokoro");
          setStatus("speaking");
          audioRef.current = playAudioBlob(blob, () => setStatus("speaking"), () => setStatus("idle"));
          return;
        }
      }
    }

    speakViaBrowserFallback(brief);
  }, [muted, voiceId, speed, localTTSAvailable, browserKokoroSupported, stop, speakViaBrowserFallback]);

  const speakBrief = useCallback((fullAnswer: string) => {
    const brief = extractSpokenBrief(fullAnswer);
    if (!brief) return;
    doSpeak(brief);
  }, [doSpeak]);

  const replay = useCallback(() => {
    if (lastBriefRef.current) doSpeak(lastBriefRef.current);
  }, [doSpeak]);

  return {
    status, muted, voiceId, speed, autoSpeak, localTTSAvailable, voiceDropOpen, backend, browserKokoroSupported,
    setMuted, setVoiceId, setSpeed, setAutoSpeak, setVoiceDropOpen, speakBrief, pause, resume, stop, replay,
  };
}
