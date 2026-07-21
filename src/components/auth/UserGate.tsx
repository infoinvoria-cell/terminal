"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { APP_USERS, AppUser, CL_USER_KEY, UserProvider } from "@/context/user-context";
import Image from "next/image";
import IntroAnimation from "@/components/IntroAnimation";

const GATE_PASSWORD = process.env.NEXT_PUBLIC_GATE_PASSWORD ?? "inno";
const CL_GATE_KEY = "cl_gate_ok";
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 60 * 60 * 1000;
const LS_ATTEMPTS = "cl_gate_attempts";
const LS_LOCKED = "cl_gate_locked_until";

function getLockout(): { attempts: number; lockedUntil: number | null } {
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
      return { attempts: next, lockedUntil: until };
    }
    return { attempts: next, lockedUntil: null };
  } catch { return { attempts: 1, lockedUntil: null }; }
}

function clearLockout() {
  try {
    localStorage.removeItem(LS_ATTEMPTS);
    localStorage.removeItem(LS_LOCKED);
  } catch { /* ignore */ }
}

// ── Password screen ───────────────────────────────────────────────────────────

function PasswordScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const { lockedUntil } = getLockout();
    setLockedUntil(lockedUntil);
  }, []);

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
      onSuccess();
    } else {
      const state = recordFailure();
      setLockedUntil(state.lockedUntil);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPassword("");
      inputRef.current?.focus();
    }
    setLoading(false);
  }

  const locked = Boolean(lockedUntil && lockedUntil > tick);
  const remaining = lockedUntil ? Math.max(0, lockedUntil - tick) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
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
              width: "100%",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 0,
              color: "#fff",
              fontSize: 19,
              padding: "13px 48px 13px 2px",
              outline: "none",
              letterSpacing: "0.16em",
              boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            disabled={locked || loading || !password.trim()}
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              padding: "4px 2px",
              cursor: locked || !password.trim() ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: password.trim() && !locked ? 1 : 0.3,
              transition: "opacity 0.2s",
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

// ── User selection screen ─────────────────────────────────────────────────────

const USER_LABELS = ["User 1", "User 2", "User 3"] as const;

function UserCard({ user, label, index, onSelect }: { user: AppUser; label: string; index: number; onSelect: (user: AppUser) => void }) {
  const [playing, setPlaying] = useState(false);
  const pendingUser = useRef<AppUser | null>(null);

  function handleClick() {
    if (playing) return;
    pendingUser.current = user;
    setPlaying(true);
  }

  return (
    <>
      {playing && (
        <IntroAnimation
          forcePlay
          onComplete={() => {
            setPlaying(false);
            if (pendingUser.current) onSelect(pendingUser.current);
          }}
        />
      )}
      <button
        onClick={handleClick}
        disabled={playing}
        aria-label={label}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: playing ? "default" : "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
          transition: "transform 0.2s, opacity 0.2s",
          opacity: playing ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          if (playing) return;
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.06)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        }}
      >
        {/* Avatar */}
        <div style={{ marginBottom: 18, width: 100, height: 100, borderRadius: "50%", overflow: "hidden" }}>
          <Image
            src={index === 0 ? "/profile.png" : "/profile_jeroen.png"}
            alt={user.name}
            width={100}
            height={100}
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
          />
        </div>

        {/* Main label */}
        <span style={{
          color: "#f0e6c8",
          fontSize: 15,
          fontWeight: 700,
          fontFamily: "var(--font-montserrat, sans-serif)",
          letterSpacing: "0.03em",
          lineHeight: 1,
          marginBottom: 7,
        }}>
          {label}
        </span>

        {/* Subtext */}
        <span style={{
          color: "rgba(255,255,255,0.38)",
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1,
        }}>
          {user.name}
        </span>
      </button>
    </>
  );
}

function UserSelectScreen({ onSelect }: { onSelect: (user: AppUser) => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ display: "flex", gap: 72 }}>
        {APP_USERS.map((user, i) => (
          <UserCard key={user.id} user={user} label={USER_LABELS[i]} index={i} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

// ── Gate orchestrator ─────────────────────────────────────────────────────────

function resolveInitialState(): { gateOk: boolean; user: AppUser | null } {
  try {
    const gateOk = localStorage.getItem(CL_GATE_KEY) === "1";
    const userId = localStorage.getItem(CL_USER_KEY) as AppUser["id"] | null;
    const user = userId ? (APP_USERS.find(u => u.id === userId) ?? null) : null;
    return { gateOk, user };
  } catch {
    return { gateOk: false, user: null };
  }
}

export function UserGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [gateOk, setGateOk] = useState(false);
  const [user, setUserState] = useState<AppUser | null>(null);

  useEffect(() => {
    const state = resolveInitialState();
    setGateOk(state.gateOk);
    setUserState(state.user);
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!gateOk) {
    return <PasswordScreen onSuccess={() => setGateOk(true)} />;
  }

  if (!user) {
    return (
      <UserSelectScreen
        onSelect={(u) => {
          try { localStorage.setItem(CL_USER_KEY, u.id); } catch { /* ignore */ }
          setUserState(u);
        }}
      />
    );
  }

  return (
    <UserProvider initialUser={user}>
      {children}
    </UserProvider>
  );
}
