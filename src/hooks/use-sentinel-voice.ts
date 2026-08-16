"use client";

/**
 * useSentinelVoice — shared voice hook for Desktop + Mobile Sentinel
 *
 * Provides:
 *   - Local Kokoro TTS (via /api/sentinel/tts proxy)
 *   - Browser SpeechSynthesis fallback (en-GB)
 *   - spokenBrief extraction
 *   - Auto-speak after answer complete
 *   - Play / pause / stop
 *   - Voice selector state (persisted)
 *   - TTS health / status
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

/** Which synthesis path actually produced audio for the current/last utterance. */
export type VoiceBackend = "local-sidecar" | "browser-kokoro" | "browser-speech" | null;

export interface SentinelVoiceState {
  // Current state
  status: VoiceStatus;
  muted: boolean;
  voiceId: string;
  speed: number;
  autoSpeak: boolean;
  localTTSAvailable: boolean;
  voiceDropOpen: boolean;
  backend: VoiceBackend;
  browserKokoroSupported: boolean;

  // Actions
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

  // Check local sidecar health on mount and periodically. This is the
  // Desktop/local-Capitalife path — never reachable from a public deployment.
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

  const speakViaBrowserFallback = useCallback((brief: string) => {
    setBackend("browser-speech");
    setStatus("speaking");
    speakBrowser(
      brief,
      speed,
      () => setStatus("speaking"),
      () => setStatus("idle")
    );
  }, [speed]);

  /**
   * Backend priority (per architecture):
   *   1. Local Kokoro sidecar   — Desktop / local Capitalife (best quality+speed)
   *   2. Browser-local Kokoro   — Mobile / Vercel, runs on-device, no localhost needed
   *   3. Browser SpeechSynthesis — universal fallback, always available
   * Sentinel text chat must remain fully usable even if every voice path fails.
   */
  const doSpeak = useCallback(async (brief: string) => {
    if (!brief.trim()) return;
    if (muted) return;

    stop(); // a new answer always cancels any audio still playing from a previous one
    lastBriefRef.current = brief;

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
      // Sidecar reachable but synthesis failed (e.g. model not loaded) — fall through.
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
      // Browser Kokoro unsupported, failed to load, or failed to synthesize — fall through.
    }

    speakViaBrowserFallback(brief);
  }, [muted, voiceId, speed, localTTSAvailable, browserKokoroSupported, stop, speakViaBrowserFallback]);

  const speakBrief = useCallback((fullAnswer: string) => {
    const brief = extractSpokenBrief(fullAnswer);
    if (!brief) return;
    doSpeak(brief);
  }, [doSpeak]);

  const replay = useCallback(() => {
    if (lastBriefRef.current) {
      doSpeak(lastBriefRef.current);
    }
  }, [doSpeak]);

  return {
    status,
    muted,
    voiceId,
    speed,
    autoSpeak,
    localTTSAvailable,
    voiceDropOpen,
    backend,
    browserKokoroSupported,
    setMuted,
    setVoiceId,
    setSpeed,
    setAutoSpeak,
    setVoiceDropOpen,
    speakBrief,
    pause,
    resume,
    stop,
    replay,
  };
}
