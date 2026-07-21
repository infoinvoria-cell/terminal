"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 60 * 60 * 1000; // 1h

const LS_ATTEMPTS = "supa_gate_attempts";
const LS_LOCKED = "supa_gate_locked_until";

function getLockoutState(): { attempts: number; lockedUntil: number | null } {
  try {
    const attempts = parseInt(localStorage.getItem(LS_ATTEMPTS) ?? "0", 10) || 0;
    const lockedUntil = parseInt(localStorage.getItem(LS_LOCKED) ?? "0", 10) || null;
    return { attempts, lockedUntil: lockedUntil && lockedUntil > Date.now() ? lockedUntil : null };
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
}

function recordFailure(): { attempts: number; lockedUntil: number | null } {
  try {
    const prev = parseInt(localStorage.getItem(LS_ATTEMPTS) ?? "0", 10) || 0;
    const next = prev + 1;
    localStorage.setItem(LS_ATTEMPTS, String(next));
    if (next >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_MS;
      localStorage.setItem(LS_LOCKED, String(until));
      return { attempts: next, lockedUntil: until };
    }
    return { attempts: next, lockedUntil: null };
  } catch {
    return { attempts: 1, lockedUntil: null };
  }
}

function clearLockout() {
  try {
    localStorage.removeItem(LS_ATTEMPTS);
    localStorage.removeItem(LS_LOCKED);
  } catch { /* ignore */ }
}

function formatLockout(ms: number) {
  const mins = Math.max(1, Math.ceil(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  return `${Math.ceil(mins / 60)}h`;
}

export function SupabaseAuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const { attempts, lockedUntil } = getLockoutState();
    setAttempts(attempts);
    setLockedUntil(lockedUntil);

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const id = window.setInterval(() => {
      setTick(Date.now());
      if (Date.now() >= lockedUntil) {
        clearLockout();
        setLockedUntil(null);
        setAttempts(0);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading || (lockedUntil && lockedUntil > tick)) return;

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const state = recordFailure();
      setAttempts(state.attempts);
      setLockedUntil(state.lockedUntil);
      setError("E-Mail oder Passwort falsch.");
      setPassword("");
    } else {
      clearLockout();
      setAttempts(0);
      setLockedUntil(null);
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
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

  if (session) {
    return <>{children}</>;
  }

  const lockoutActive = Boolean(lockedUntil && lockedUntil > tick);
  const remaining = lockedUntil ? Math.max(0, lockedUntil - tick) : 0;
  const remainingAttempts = Math.max(0, MAX_ATTEMPTS - attempts);

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

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
              E-Mail
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={lockoutActive || loading}
              autoFocus
              autoComplete="email"
              className="w-full rounded-2xl border border-white/10 bg-[#0b0c10] px-4 py-3 text-sm text-white outline-none transition focus:border-[#bf9d4a]/70"
              placeholder="email@capitalife.com"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
              Passwort
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={lockoutActive || loading}
              autoComplete="current-password"
              className="w-full rounded-2xl border border-white/10 bg-[#0b0c10] px-4 py-3 text-sm text-white outline-none transition focus:border-[#bf9d4a]/70"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={lockoutActive || loading || !email.trim() || !password.trim()}
            className="w-full rounded-2xl bg-[#bf9d4a] px-4 py-3 text-sm font-semibold text-[#17181d] transition hover:bg-[#d2b56b] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? "Anmelden…" : "Enter Terminal"}
          </button>
        </form>

        <div className="mt-4 min-h-10 text-sm">
          {error && <p className="text-[#ff7f7f]">{error}</p>}
          {!lockoutActive && attempts > 0 && remainingAttempts > 0 && (
            <p className="text-white/50">
              {remainingAttempts} Versuch{remainingAttempts === 1 ? "" : "e"} verbleibend.
            </p>
          )}
          {lockoutActive && (
            <p className="text-[#ffb38c]">
              Gesperrt für {formatLockout(remaining)}.
            </p>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-white/8 pt-4 text-[11px] uppercase tracking-[0.18em] text-white/38">
          <span>Supabase Auth</span>
          <span>1h Sperre nach 3 Fehlversuchen</span>
        </div>
      </div>
    </div>
  );
}
