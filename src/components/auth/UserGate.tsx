"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { APP_USERS, AppUser, CL_USER_KEY, UserProvider } from "@/context/user-context";
import Image from "next/image";

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
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <Image src="/logo.png" alt="Capitalife" width={200} height={50} style={{ objectFit: "contain", marginBottom: 40, userSelect: "none" }} priority draggable={false} />
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, animation: shake ? "gate-shake 0.45s ease" : undefined }}>
        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={locked || loading}
          autoFocus
          autoComplete="current-password"
          placeholder="••••••••"
          style={{ background: "#1c1d20", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, color: "#fff", fontSize: 15, padding: "11px 18px", outline: "none", width: 220, letterSpacing: "0.12em" }}
        />
        <button
          type="submit"
          disabled={locked || loading || !password.trim()}
          style={{ background: locked ? "rgba(226,202,122,0.25)" : "#e2ca7a", border: "none", borderRadius: 12, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: locked ? "not-allowed" : "pointer", flexShrink: 0 }}
          aria-label="Enter"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 9h12M10 4l5 5-5 5" stroke="#17181d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
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

function UserSelectScreen({ onSelect }: { onSelect: (user: AppUser) => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <Image src="/logo.png" alt="Capitalife" width={160} height={40} style={{ objectFit: "contain", marginBottom: 48, userSelect: "none" }} priority draggable={false} />
      <div style={{ display: "flex", gap: 14 }}>
        {APP_USERS.map((user) => (
          <button
            key={user.id}
            onClick={() => onSelect(user)}
            style={{
              background: "#111214",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 20,
              padding: "24px 20px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              width: 130,
              transition: "border-color 0.2s, background 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(226,202,122,0.5)";
              (e.currentTarget as HTMLButtonElement).style.background = "#18191d";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.10)";
              (e.currentTarget as HTMLButtonElement).style.background = "#111214";
            }}
          >
            {user.avatar ? (
              <Image src={user.avatar} alt={user.name} width={52} height={52} style={{ borderRadius: "50%", objectFit: "contain", background: "#1c1d20" }} />
            ) : (
              <div style={{
                width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#e2ca7a,#b8962e)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, color: "#17181d", letterSpacing: "0.03em",
              }}>
                {user.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
              </div>
            )}
            <span style={{ color: "#e8e8e8", fontSize: 13, fontWeight: 600, textAlign: "center", lineHeight: 1.3 }}>
              {user.name}
            </span>
          </button>
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
