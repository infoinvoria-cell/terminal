"use client";

import { useEffect, useRef, useState } from "react";

type ProviderUsage = {
  provider: string;
  tokensUsed: number;
  tokensAvailable: number;
  dailyLimit: number;
  resetAt: string;
  unlimited: boolean;
};

type ProviderStatus = {
  id: string;
  usable: boolean;
  model: string | null;
  label?: string;
};

type StatusPayload = {
  activeProvider: string | null;
  providers: ProviderStatus[];
};

type Props = {
  activeProvider: string | null;
};

const SIZE   = 18;
const STROKE = 2.5;
const R      = (SIZE - STROKE) / 2;
const CIRC   = 2 * Math.PI * R;

function fmtNum(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtResetBerlin(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
    }) + " Berlin";
  } catch {
    return "—";
  }
}

function providerLabel(id: string): string {
  const map: Record<string, string> = {
    groq: "Groq", mistral: "Mistral", anthropic: "Anthropic",
    ollama: "Ollama", local: "Lokal", custom: "Custom",
  };
  return map[id] ?? id;
}

export function TokenRing({ activeProvider }: Props) {
  const [allUsage,  setAllUsage]  = useState<Record<string, ProviderUsage>>({});
  const [status,    setStatus]    = useState<StatusPayload | null>(null);
  const [open,      setOpen]      = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const provider = activeProvider ?? status?.activeProvider ?? "groq";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [usageRes, statusRes] = await Promise.all([
          fetch("/api/sentinel/token-usage"),
          fetch("/api/sentinel/status", { cache: "no-store" }),
        ]);
        if (!cancelled) {
          if (usageRes.ok)  setAllUsage(await usageRes.json() as Record<string, ProviderUsage>);
          if (statusRes.ok) setStatus(await statusRes.json() as StatusPayload);
        }
      } catch { /* ignore */ }
    }

    void load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Close on outside click / touch
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent | TouchEvent) => {
      if (!popupRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    window.addEventListener("touchstart", h);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("touchstart", h); };
  }, [open]);

  const usage     = allUsage[provider] ?? null;
  const used      = usage?.tokensUsed  ?? 0;
  const limit     = usage?.dailyLimit  ?? 0;
  const unlimited = usage?.unlimited   ?? false;
  const fraction  = (unlimited || !limit) ? 0 : Math.min(1, used / limit);
  const dashOffset = CIRC * (1 - fraction);

  const ringColor = unlimited || !usage
    ? "rgba(255,255,255,0.18)"
    : fraction >= 0.9 ? "#ef4444"
    : fraction >= 0.7 ? "#f59e0b"
    : "#e2ca7a";

  // Model for active provider from status
  const activeModel = status?.providers.find(p => p.id === provider)?.model ?? null;

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Token-Verbrauch"
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          width: SIZE, height: SIZE, borderRadius: "50%",
          opacity: usage ? 1 : 0.35,
          transition: "opacity 200ms ease",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="#2a2a2a" strokeWidth={STROKE} />
          {unlimited || !usage ? (
            <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={STROKE} />
          ) : (
            <circle
              cx={SIZE/2} cy={SIZE/2} r={R} fill="none"
              stroke={ringColor} strokeWidth={STROKE}
              strokeDasharray={CIRC} strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 500ms ease, stroke 300ms ease" }}
            />
          )}
        </svg>
      </button>

      {/* ── Popup ── */}
      {open && (
        <div
          ref={popupRef}
          style={{
            position: "absolute",
            bottom: "calc(100% + 10px)",
            right: 0,
            width: 230,
            background: "#111315",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 12,
            padding: "14px 14px 12px",
            zIndex: 500,
            boxShadow: "0 12px 40px rgba(0,0,0,0.70)",
            fontFamily: "var(--font-montserrat,sans-serif)",
            fontSize: 12,
            color: "#c8cdd6",
          }}
        >
          {/* ── Active provider + model ── */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)", marginBottom: 5 }}>
              Aktiver Provider
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 700, color: "#ffffff", fontSize: 13 }}>
                {providerLabel(provider)}
              </span>
              {activeModel && (
                <span style={{ fontSize: 10, color: "rgba(214,184,108,0.70)", fontWeight: 600, textAlign: "right", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeModel}
                </span>
              )}
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 10 }} />

          {/* ── Usage block ── */}
          {unlimited ? (
            <p style={{ margin: 0, color: "rgba(255,255,255,0.38)", fontSize: 11 }}>
              Kein Token-Limit für diesen Provider.
            </p>
          ) : !usage ? (
            <p style={{ margin: 0, color: "rgba(255,255,255,0.28)", fontSize: 11 }}>
              Keine Daten verfügbar.
            </p>
          ) : (
            <>
              {/* Progress bar */}
              <div style={{ height: 5, borderRadius: 3, background: "#1e2024", overflow: "hidden", marginBottom: 8 }}>
                <div style={{
                  height: "100%",
                  width: `${(fraction * 100).toFixed(1)}%`,
                  background: ringColor,
                  borderRadius: 3,
                  transition: "width 400ms ease",
                }} />
              </div>

              <Row label="Verbraucht" value={`${fmtNum(used)} / ${fmtNum(limit)}`} accent={ringColor} />
              <Row label="Noch verfügbar" value={fmtNum(Math.max(0, limit - used))} />
              <Row label="Reset" value={fmtResetBerlin(usage.resetAt)} />

              <div style={{ marginTop: 6, textAlign: "right" }}>
                <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.22)", fontWeight: 600 }}>
                  {(fraction * 100).toFixed(1)}% verbraucht
                </span>
              </div>
            </>
          )}

          {/* ── All providers ── */}
          {Object.keys(allUsage).length > 1 && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "10px 0 8px" }} />
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: 6 }}>
                Alle Provider
              </div>
              {Object.values(allUsage).map(u => {
                const f = u.unlimited || !u.dailyLimit ? null : Math.min(1, u.tokensUsed / u.dailyLimit);
                const isActive = u.provider === provider;
                const color = f == null ? "rgba(255,255,255,0.18)"
                  : f >= 0.9 ? "#ef4444" : f >= 0.7 ? "#f59e0b" : "#e2ca7a";
                return (
                  <div key={u.provider} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    {/* Mini ring */}
                    <svg width={12} height={12} viewBox="0 0 12 12" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
                      <circle cx={6} cy={6} r={4.5} fill="none" stroke="#2a2a2a" strokeWidth={1.8} />
                      {f != null && (
                        <circle cx={6} cy={6} r={4.5} fill="none" stroke={color} strokeWidth={1.8}
                          strokeDasharray={2 * Math.PI * 4.5} strokeDashoffset={2 * Math.PI * 4.5 * (1 - f)}
                          strokeLinecap="round" />
                      )}
                    </svg>
                    <span style={{ flex: 1, fontSize: 11, color: isActive ? "#ffffff" : "rgba(255,255,255,0.50)", fontWeight: isActive ? 700 : 400 }}>
                      {providerLabel(u.provider)}
                    </span>
                    <span style={{ fontSize: 10, color: isActive ? color : "rgba(255,255,255,0.30)", fontWeight: 600 }}>
                      {u.unlimited ? "∞" : `${fmtNum(u.tokensUsed)}/${fmtNum(u.dailyLimit)}`}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
      <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 11 }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent ?? "#e2e6ed", fontSize: 11.5 }}>{value}</span>
    </div>
  );
}
