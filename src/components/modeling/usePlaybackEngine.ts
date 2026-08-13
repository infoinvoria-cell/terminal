"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4 | 8;
export type PlaybackState = "IDLE" | "COUNTDOWN" | "PLAYING" | "PAUSED" | "COMPLETE";

export type PlaybackEngine = {
  state: PlaybackState;
  countdown: number;        // 10..0, only meaningful during COUNTDOWN
  progress: number;         // 0..1
  speed: PlaybackSpeed;
  delay10s: boolean;
  isPlaying: boolean;       // convenience: state === "PLAYING"
  play: () => void;
  pause: () => void;        // cancels countdown OR pauses playback
  restart: () => void;      // → IDLE, progress=0 (explicit replay start / ↺ button)
  readyFull: () => void;    // → IDLE, progress=1 (selection change: show full data immediately)
  setSpeed: (s: PlaybackSpeed) => void;
  toggleDelay: () => void;
};

const RATE = 0.12; // full animation in ~8s at 1x

export function usePlaybackEngine(): PlaybackEngine {
  const [state, setState] = useState<PlaybackState>("IDLE");
  const [countdown, setCountdown] = useState(10);
  const [progress, setProgress] = useState(1);
  const [speed, setSpeedState] = useState<PlaybackSpeed>(1);
  const [delay10s, setDelay10s] = useState(false);

  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const speedRef = useRef<PlaybackSpeed>(1);
  const cdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<PlaybackState>("IDLE");

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { stateRef.current = state; }, [state]);

  // ── RAF animation loop (runs only when state=PLAYING) ──────────────────────
  useEffect(() => {
    if (state !== "PLAYING") {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    lastTimeRef.current = 0;

    const tick = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = time;
      setProgress((prev) => {
        const next = prev + dt * RATE * speedRef.current;
        if (next >= 1) {
          setState("COMPLETE");
          return 1;
        }
        return next;
      });
      if (stateRef.current === "PLAYING") {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state]);

  // ── Countdown ticker (runs only when state=COUNTDOWN) ──────────────────────
  useEffect(() => {
    if (state !== "COUNTDOWN") {
      if (cdTimerRef.current) clearInterval(cdTimerRef.current);
      return;
    }

    setCountdown(10);

    let remaining = 10;
    cdTimerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        if (cdTimerRef.current) clearInterval(cdTimerRef.current);
        setState("PLAYING");
        lastTimeRef.current = 0;
      }
    }, 1000);

    return () => {
      if (cdTimerRef.current) clearInterval(cdTimerRef.current);
    };
  }, [state]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const play = useCallback(() => {
    setProgress((prev) => (prev >= 1 ? 0 : prev));
    lastTimeRef.current = 0;
    if (delay10s) {
      setState("COUNTDOWN");
    } else {
      setState("PLAYING");
    }
  }, [delay10s]);

  const pause = useCallback(() => {
    if (stateRef.current === "COUNTDOWN") {
      setState("IDLE");
    } else {
      cancelAnimationFrame(rafRef.current);
      setState("PAUSED");
    }
  }, []);

  const restart = useCallback(() => {
    if (cdTimerRef.current) clearInterval(cdTimerRef.current);
    cancelAnimationFrame(rafRef.current);
    setState("IDLE");
    setProgress(0);
    setCountdown(10);
    lastTimeRef.current = 0;
  }, []);

  const readyFull = useCallback(() => {
    if (cdTimerRef.current) clearInterval(cdTimerRef.current);
    cancelAnimationFrame(rafRef.current);
    setState("IDLE");
    setProgress(1);
    setCountdown(10);
    lastTimeRef.current = 0;
  }, []);

  const setSpeed = useCallback((s: PlaybackSpeed) => {
    setSpeedState(s);
    speedRef.current = s;
  }, []);

  const toggleDelay = useCallback(() => setDelay10s((v) => !v), []);

  return {
    state,
    countdown,
    progress,
    speed,
    delay10s,
    isPlaying: state === "PLAYING",
    play,
    pause,
    restart,
    readyFull,
    setSpeed,
    toggleDelay,
  };
}
