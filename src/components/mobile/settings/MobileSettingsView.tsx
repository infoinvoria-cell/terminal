"use client";
import { useEffect, useState } from "react";

const GOLD = "#C9A84C";
const CARD_BG = "#1F1F1F";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const PREF_KEY = "fmd_settings_preferred_provider";

type ProviderStatus = { id: string; label: string; configured: boolean; usable: boolean; message: string; model: string | null; active: boolean };
type SentinelStatus = { activeProvider: string | null; providers: ProviderStatus[] };

function ProviderCard({ p, isActive, isPreferred, onSet }: { p: ProviderStatus; isActive: boolean; isPreferred: boolean; onSet: (id: string) => void }) {
  const statusColor = p.usable ? "#22C55E" : p.configured ? GOLD : "rgba(255,255,255,0.2)";
  return (
    <div onClick={() => p.usable && onSet(p.id)} style={{
      background: CARD_BG, border: `1px solid ${isActive ? GOLD + "60" : isPreferred ? GOLD + "30" : CARD_BORDER}`,
      borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
      cursor: p.usable ? "pointer" : "default", opacity: p.configured ? 1 : 0.55,
    }}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${isPreferred ? GOLD : "rgba(255,255,255,0.2)"}`, background: isPreferred ? GOLD : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isPreferred && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0c0d10" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#fafafa" }}>{p.label}</span>
          {isActive && <span style={{ fontSize: 9.5, fontWeight: 700, color: GOLD, border: `1px solid ${GOLD}50`, borderRadius: 5, padding: "1px 5px", textTransform: "uppercase" as const }}>aktiv</span>}
          <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, border: `1px solid ${statusColor}50`, borderRadius: 6, padding: "2px 6px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
            {p.usable ? "bereit" : p.configured ? "konfiguriert" : "fehlt"}
          </span>
        </div>
        {p.model && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.model}</div>}
        {p.message && !p.usable && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.message}</div>}
      </div>
    </div>
  );
}

export function MobileSettingsView() {
  const [status, setStatus] = useState<SentinelStatus | null>(null);
  const [preferred, setPreferred] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    try { setPreferred(localStorage.getItem(PREF_KEY)); } catch { /* ignore */ }
    fetch("/api/sentinel/status").then((r) => r.json()).then((j) => setStatus(j as SentinelStatus)).catch(() => setErr(true));
  }, []);

  const onSet = (id: string) => {
    setPreferred(id);
    try { localStorage.setItem(PREF_KEY, id); } catch { /* ignore */ }
  };

  const usable = status?.providers.filter((p) => p.usable) ?? [];
  const others = status?.providers.filter((p) => !p.usable) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "16px 16px 12px", background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))" }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-text), sans-serif" }}>Einstellungen</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>Provider & Präferenzen</p>
      </header>

      <div style={{ padding: "4px 16px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Sentinel Provider</div>
          {err ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center", paddingTop: 12 }}>Provider-Status nicht erreichbar</div>
          ) : !status ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: 12 }}>Lädt…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {usable.map((p) => <ProviderCard key={p.id} p={p} isActive={p.id === status.activeProvider} isPreferred={p.id === preferred} onSet={onSet} />)}
              {others.length > 0 && usable.length > 0 && (
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)", padding: "4px 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Nicht verfügbar</div>
              )}
              {others.map((p) => <ProviderCard key={p.id} p={p} isActive={false} isPreferred={false} onSet={onSet} />)}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
