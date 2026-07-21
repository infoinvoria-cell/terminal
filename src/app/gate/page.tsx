"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const GATE_PASSWORD = process.env.NEXT_PUBLIC_GATE_PASSWORD ?? "inno";
const CL_GATE_KEY = "cl_gate_ok";
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 60 * 60 * 1000;
const LS_ATTEMPTS = "cl_gate_attempts";
const LS_LOCKED = "cl_gate_locked_until";

function getLockout() {
  try {
    const attempts = parseInt(localStorage.getItem(LS_ATTEMPTS) ?? "0", 10) || 0;
    const raw = parseInt(localStorage.getItem(LS_LOCKED) ?? "0", 10) || null;
    return { attempts, lockedUntil: raw && raw > Date.now() ? raw : null };
  } catch { return { attempts: 0, lockedUntil: null }; }
}

function recordFailure() {
  try {
    const prev = parseInt(localStorage.getItem(LS_ATTEMPTS) ?? "0", 10) || 0;
    const next = prev + 1;
    localStorage.setItem(LS_ATTEMPTS, String(next));
    if (next >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_MS;
      localStorage.setItem(LS_LOCKED, String(until));
      return { lockedUntil: until };
    }
    return { lockedUntil: null };
  } catch { return { lockedUntil: null }; }
}

function clearLockout() {
  try { localStorage.removeItem(LS_ATTEMPTS); localStorage.removeItem(LS_LOCKED); } catch { /* ignore */ }
}

export default function GatePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(CL_GATE_KEY) === "1") {
        router.replace("/select");
        return;
      }
    } catch { /* ignore */ }
    const { lockedUntil } = getLockout();
    setLockedUntil(lockedUntil);
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => {
      setTick(Date.now());
      if (Date.now() >= lockedUntil) { clearLockout(); setLockedUntil(null); }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const locked = Boolean(lockedUntil && lockedUntil > tick);
    if (loading || !password.trim() || locked) return;
    setLoading(true);
    if (password === GATE_PASSWORD) {
      clearLockout();
      try { localStorage.setItem(CL_GATE_KEY, "1"); } catch { /* ignore */ }
      router.push("/select");
    } else {
      const state = recordFailure();
      setLockedUntil(state.lockedUntil);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPassword("");
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  if (!ready) return null;

  const locked = Boolean(lockedUntil && lockedUntil > tick);
  const remaining = lockedUntil ? Math.max(0, lockedUntil - tick) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <Image
        src="/CAPITALIFE_Logo.png"
        alt="Capitalife"
        width={340}
        height={85}
        style={{ objectFit: "contain", marginBottom: 64, userSelect: "none", mixBlendMode: "lighten" }}
        priority
        draggable={false}
      />
      <form onSubmit={handleSubmit} style={{ animation: shake ? "gate-shake 0.45s ease" : undefined }}>
        <div style={{ position: "relative", width: 320 }}>
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
              width: "100%", background: "transparent", border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.18)", borderRadius: 0,
              color: "#fff", fontSize: 19, padding: "13px 48px 13px 2px",
              outline: "none", letterSpacing: "0.16em", boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            disabled={locked || loading || !password.trim()}
            style={{
              position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", padding: "4px 2px",
              cursor: locked || !password.trim() ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: password.trim() && !locked ? 1 : 0.3, transition: "opacity 0.2s",
            }}
            aria-label="Enter"
          >
            <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
              <path d="M4 10h12M11 5l5 5-5 5" stroke="#e2ca7a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>
      {locked && (
        <p style={{ marginTop: 16, color: "rgba(255,179,140,0.9)", fontSize: 13 }}>
          Gesperrt für {Math.max(1, Math.ceil(remaining / 60_000))}m
        </p>
      )}
      <style>{`@keyframes gate-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}`}</style>
    </div>
  );
}
