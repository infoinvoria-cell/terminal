"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  SIMPLE_ACCESS_LOCKOUT_MS,
  SIMPLE_ACCESS_MAX_ATTEMPTS,
  clearSimpleAccess,
  getSimpleAccessState,
  isSimpleAccessPasswordValid,
  registerSimpleAccessFailure,
  unlockSimpleAccess,
} from "@/lib/auth/simple-access";

type SimpleAccessGateProps = {
  children: React.ReactNode;
  expectedPassword: string;
};

function formatLockout(msRemaining: number) {
  const totalMinutes = Math.max(1, Math.ceil(msRemaining / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.ceil(totalMinutes / 60);
  if (totalHours < 48) return `${totalHours}h`;
  const totalDays = Math.ceil(totalHours / 24);
  return `${totalDays}d`;
}

export function SimpleAccessGate({
  children,
  expectedPassword,
}: SimpleAccessGateProps) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const state = getSimpleAccessState();
    setUnlocked(state.unlocked);
    setAttempts(state.attempts);
    setLockedUntil(state.lockedUntil);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const interval = window.setInterval(() => {
      const nextState = getSimpleAccessState();
      setAttempts(nextState.attempts);
      setLockedUntil(nextState.lockedUntil);
      setUnlocked(nextState.unlocked);
      setTick(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [lockedUntil]);

  const lockoutActive = Boolean(lockedUntil && lockedUntil > tick);
  const remainingAttempts = Math.max(0, SIMPLE_ACCESS_MAX_ATTEMPTS - attempts);
  const lockoutRemaining = lockedUntil ? Math.max(0, lockedUntil - tick) : 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lockoutActive) return;

    if (isSimpleAccessPasswordValid(input, expectedPassword)) {
      unlockSimpleAccess();
      setUnlocked(true);
      setAttempts(0);
      setLockedUntil(null);
      setError(null);
      setInput("");
      return;
    }

    const nextState = registerSimpleAccessFailure();
    setAttempts(nextState.attempts);
    setLockedUntil(nextState.lockedUntil);
    setUnlocked(false);
    setError("Access denied.");
    setInput("");
  }

  function handleLogout() {
    clearSimpleAccess();
    setUnlocked(false);
    setAttempts(0);
    setLockedUntil(null);
    setInput("");
    setError(null);
  }

  if (!ready) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-[#0c0d10] text-white">
        <div className="rounded-[28px] border border-white/8 bg-white/5 px-6 py-5 text-sm text-white/60">
          Loading terminal...
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0c0d10] px-6 py-10 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(191,157,74,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />
        <div className="relative w-full max-w-[420px] rounded-[30px] border border-[#2b2d33] bg-[#121318]/95 p-8 shadow-[0_28px_120px_rgba(0,0,0,0.42)] backdrop-blur">
          <div className="mb-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-[#bf9d4a]">
              Internal Preview
            </p>
            <h1 className="mt-4 text-[32px] font-semibold tracking-[-0.04em] text-white">
              Capitalife Terminal
            </h1>
            <p className="mt-3 text-sm text-white/60">
              Research &amp; Monitoring only
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
                Access Word
              </span>
              <input
                type="password"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={lockoutActive}
                autoFocus
                className="w-full rounded-2xl border border-white/10 bg-[#0b0c10] px-4 py-3 text-sm text-white outline-none transition focus:border-[#bf9d4a]/70"
                placeholder="Enter access word"
              />
            </label>

            <button
              type="submit"
              disabled={lockoutActive || !input.trim()}
              className="w-full rounded-2xl bg-[#bf9d4a] px-4 py-3 text-sm font-semibold text-[#17181d] transition hover:bg-[#d2b56b] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Enter Terminal
            </button>
          </form>

          <div className="mt-4 min-h-10 text-sm text-white/58">
            {error ? <p className="text-[#ff7f7f]">{error}</p> : null}
            {!lockoutActive && attempts > 0 ? (
              <p>
                {remainingAttempts > 0
                  ? `${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining.`
                  : null}
              </p>
            ) : null}
            {lockoutActive ? (
              <p className="text-[#ffb38c]">
                Access denied. Locked for {formatLockout(lockoutRemaining)}.
              </p>
            ) : null}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-white/8 pt-4 text-[11px] uppercase tracking-[0.18em] text-white/38">
            <span>Preview gate only</span>
            <span>{Math.round(SIMPLE_ACCESS_LOCKOUT_MS / 3_600_000)}h lockout after 3 fails</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
