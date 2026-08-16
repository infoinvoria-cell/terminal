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

export type VoiceStatus = "idle" | "generating" | "speaking" | "paused" | "offline" | "error";

export interface SentinelVoiceState {
  // Current state
  status: VoiceStatus;
  muted: boolean;
  voiceId: string;
  speed: number;
  autoSpeak: boolean;
  localTTSAvailable: boolean;
  voiceDropOpen: boolean;

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

  const lastBriefRef = useRef<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Check local TTS health on mount and periodically
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

  const doSpeak = useCallback(async (brief: string) => {
    if (!brief.trim()) return;
    if (muted) return;

    stop(); // cancel any existing audio
    lastBriefRef.current = brief;

    const voice = SENTINEL_VOICES.find(v => v.id === voiceId) ?? SENTINEL_VOICES[0];

    if (voice.engine === "kokoro" && localTTSAvailable) {
      setStatus("generating");
      const blob = await synthesizeKokoro(brief, voiceId, speed);
      if (blob) {
        setStatus("speaking");
        audioRef.current = playAudioBlob(
          blob,
          () => setStatus("speaking"),
          () => setStatus("idle")
        );
      } else {
        // Fallback to browser if Kokoro fails
        setStatus("speaking");
        speakBrowser(
          brief,
          speed,
          () => setStatus("speaking"),
          () => setStatus("idle")
        );
      }
    } else {
      // Browser fallback
      setStatus("speaking");
      speakBrowser(
        brief,
        speed,
        () => setStatus("speaking"),
        () => setStatus("idle")
      );
    }
  }, [muted, voiceId, speed, localTTSAvailable, stop]);

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
