"use client";

import { useEffect, useState } from "react";

const GOLD = "#e2ca7a";
const CARD_BG = "#1c1d20";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const PREF_KEY = "fmd_settings_preferred_provider";

type ProviderStatus = {
  id: string;
  label: string;
  configured: boolean;
  usable: boolean;
  message: string;
  model: string | null;
  active: boolean;
};

type SentinelStatus = {
  activeProvider: string | null;
  providers: ProviderStatus[];
};

type AppInfo = {
  version: string;
  branch: string;
  nextVersion: string;
  nodeVersion: string;
  commits: { hash: string; message: string; date: string }[];
};

function ProviderCard({
  p,
  isActive,
  isPreferred,
  onSetPreferred,
}: {
  p: ProviderStatus;
  isActive: boolean;
  isPreferred: boolean;
  onSetPreferred: (id: string) => void;
}) {
  const statusColor = p.usable ? "#4ade80" : p.configured ? GOLD : "rgba(255,255,255,0.2)";
  const statusLabel = p.usable ? "bereit" : p.configured ? "konfiguriert" : "fehlt";

  return (
    <div
      onClick={() => p.usable && onSetPreferred(p.id)}
      style={{
        background: CARD_BG,
        border: `1px solid ${isActive ? GOLD + "60" : isPreferred ? GOLD + "30" : CARD_BORDER}`,
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: p.usable ? "pointer" : "default",
        opacity: p.configured ? 1 : 0.55,
      }}
    >
      <div style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: `2px solid ${isPreferred ? GOLD : "rgba(255,255,255,0.2)"}`,
        background: isPreferred ? GOLD : "transparent",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {isPreferred && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0c0d10" }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#fafafa" }}>{p.label}</span>
          {isActive && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: GOLD, border: `1px solid ${GOLD}50`, borderRadius: 5, padding: "1px 5px", textTransform: "uppercase" as const }}>
              aktiv
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, border: `1px solid ${statusColor}50`, borderRadius: 6, padding: "2px 6px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
            {statusLabel}
          </span>
        </div>
        {p.model && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.model}
          </div>
        )}
        {p.message && !p.usable && (
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.message}
          </div>
        )}
      </div>
    </div>
  );
}

export function MobileSettingsView() {
  const [status, setStatus] = useState<SentinelStatus | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [preferred, setPreferred] = useState<string | null>(null);
  const [statusErr, setStatusErr] = useState(false);

  useEffect(() => {
    try { setPreferred(localStorage.getItem(PREF_KEY)); } catch { /* ignore */ }
    fetch("/api/sentinel/status")
      .then((r) => r.json())
      .then((j) => setStatus(j as SentinelStatus))
      .catch(() => setStatusErr(true));
    fetch("/api/settings/info")
      .then((r) => r.json())
      .then((j) => setInfo(j as AppInfo))
      .catch(() => { /* non-critical */ });
  }, []);

  const handleSetPreferred = (id: string) => {
    setPreferred(id);
    try { localStorage.setItem(PREF_KEY, id); } catch { /* ignore */ }
  };

  const usable = status?.providers.filter((p) => p.usable) ?? [];
  const others = status?.providers.filter((p) => !p.usable) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 20, padding: "16px 16px 12px",
        background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))",
      }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-montserrat), sans-serif" }}>
          Einstellungen
        </h1>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>
          Provider & Präferenzen
        </p>
      </header>

      <div style={{ padding: "4px 16px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Sentinel Provider */}
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Sentinel Provider
          </div>
          {statusErr ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center", paddingTop: 12 }}>Provider-Status nicht erreichbar</div>
          ) : !status ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: 12 }}>Lädt…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {usable.map((p) => (
                <ProviderCard key={p.id} p={p} isActive={p.id === status.activeProvider} isPreferred={p.id === preferred} onSetPreferred={handleSetPreferred} />
              ))}
              {others.length > 0 && usable.length > 0 && (
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)", padding: "4px 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Nicht verfügbar
                </div>
              )}
              {others.map((p) => (
                <ProviderCard key={p.id} p={p} isActive={false} isPreferred={false} onSetPreferred={handleSetPreferred} />
              ))}
            </div>
          )}
          {preferred && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 10, lineHeight: 1.5 }}>
              Bevorzugter Provider wird lokal gespeichert und gilt beim nächsten Sentinel-Aufruf.
            </p>
          )}
        </section>

        {/* App Info */}
        {info && (
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              App-Info
            </div>
            <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, overflow: "hidden" }}>
              {([["Version", `v${info.version}`], ["Next.js", info.nextVersion], ["Node", info.nodeVersion], ["Branch", info.branch]] as [string, string][]).map(([k, v], i) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderTop: i === 0 ? "none" : `1px solid ${CARD_BORDER}` }}>
                  <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.45)" }}>{k}</span>
                  <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent commits */}
        {info && info.commits.length > 0 && (
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Letzte Commits
            </div>
            <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, overflow: "hidden" }}>
              {info.commits.slice(0, 5).map((c, i) => (
                <div key={c.hash} style={{ padding: "9px 14px", borderTop: i === 0 ? "none" : `1px solid ${CARD_BORDER}` }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <code style={{ fontSize: 10, color: GOLD, fontFamily: "monospace", flexShrink: 0 }}>{c.hash}</code>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.message}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>{c.date}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
