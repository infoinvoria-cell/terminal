"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 60 * 60 * 1000;
const LS_ATTEMPTS = "supa_gate_attempts";
const LS_LOCKED = "supa_gate_locked_until";
// Fixed email — only the password is shown to the user
const GATE_EMAIL = process.env.NEXT_PUBLIC_GATE_EMAIL ?? "gate@capitalife.internal";

function getLockoutState(): { attempts: number; lockedUntil: number | null } {
  try {
    const attempts = parseInt(localStorage.getItem(LS_ATTEMPTS) ?? "0", 10) || 0;
    const raw = parseInt(localStorage.getItem(LS_LOCKED) ?? "0", 10) || null;
    return { attempts, lockedUntil: raw && raw > Date.now() ? raw : null };
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

export function SupabaseAuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [fading, setFading] = useState(false);
  const [password, setPassword] = useState("");
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const { lockedUntil } = getLockoutState();
    setLockedUntil(lockedUntil);

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
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
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading || !password.trim() || (lockedUntil && lockedUntil > tick)) return;
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: GATE_EMAIL,
      password,
    });

    if (error) {
      const state = recordFailure();
      setLockedUntil(state.lockedUntil);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPassword("");
      inputRef.current?.focus();
    } else {
      clearLockout();
      setFading(true);
    }
    setLoading(false);
  }

  if (!ready) return null;

  if (session) return <>{children}</>;

  const locked = Boolean(lockedUntil && lockedUntil > tick);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        opacity: fading ? 0 : 1,
        transition: fading ? "opacity 0.45s ease" : undefined,
        pointerEvents: fading ? "none" : undefined,
      }}
    >
      {/* Logo */}
      <img
        src="/CAPITALIFE_Logo.png"
        alt="Capitalife"
        style={{ width: 200, marginBottom: 40, userSelect: "none" }}
        draggable={false}
      />

      {/* Password row */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: 8,
          animation: shake ? "gate-shake 0.45s ease" : undefined,
        }}
      >
        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={locked || loading}
          autoFocus
          autoComplete="current-password"
          placeholder="••••••••"
          style={{
            background: "#1c1d20",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 12,
            color: "#fff",
            fontSize: 15,
            padding: "11px 18px",
            outline: "none",
            width: 220,
            letterSpacing: "0.12em",
          }}
        />
        <button
          type="submit"
          disabled={locked || loading || !password.trim()}
          style={{
            background: locked ? "rgba(226,202,122,0.25)" : "#e2ca7a",
            border: "none",
            borderRadius: 12,
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: locked ? "not-allowed" : "pointer",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
          aria-label="Enter"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 9h12M10 4l5 5-5 5" stroke="#17181d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      <style>{`
        @keyframes gate-shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-5px); }
          80%      { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
