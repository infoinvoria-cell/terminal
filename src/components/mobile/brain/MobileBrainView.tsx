"use client";
import { useEffect, useState } from "react";

const GOLD = "#C9A84C";
const CARD_BG = "#1F1F1F";
const CARD_BORDER = "rgba(255,255,255,0.06)";

// Matches the actual /api/brain-graph/status response (a lightweight health
// check, not a data snapshot — see src/app/api/brain-graph/status/route.ts).
type BrainStatus = {
  available: boolean;
  pathConfigured: boolean;
  brainFile: boolean;
  snapshotFile: boolean;
};

// Matches /api/brain-graph/network (same endpoint the desktop Brain page uses).
type BrainNetwork = {
  nodes: { id: string }[];
  links: { source: string; target: string }[];
  source?: string;
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ flex: 1, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: GOLD, fontFamily: "var(--font-text), sans-serif", lineHeight: 1.1, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function GlobeSpinner({ size = 120 }: { size?: number }) {
  const r = size / 2;
  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      <style>{`
        @keyframes globe-cw  { to { transform: rotateY(360deg)  } }
        @keyframes globe-ccw { to { transform: rotateX(360deg)  } }
        .clife-globe-shell { position:absolute;inset:0;border-radius:50%;border:1.5px solid ${GOLD}38;background:radial-gradient(circle at 35% 35%,${GOLD}18 0%,transparent 70%),${CARD_BG} }
        .clife-globe-ring  { position:absolute;inset:0;border-radius:50% }
        .clife-globe-ring-h{ animation:globe-cw  6s linear infinite }
        .clife-globe-ring-v{ animation:globe-ccw 9s linear infinite;transform-origin:center }
        .clife-globe-dot   { position:absolute;border-radius:50%;background:${GOLD};animation:globe-cw 4s linear infinite;transform-origin:${r}px ${r}px }
      `}</style>
      <div className="clife-globe-shell" />
      <div className="clife-globe-ring clife-globe-ring-h" style={{ border: `1.5px solid ${GOLD}50` }} />
      <div className="clife-globe-ring clife-globe-ring-v" style={{ border: `1.5px solid ${GOLD}40` }} />
      <div className="clife-globe-dot" style={{ width: 6, height: 6, top: r - 3, left: r - 3 + (r - 8) }} />
    </div>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  const dot = ok ? "#22C55E" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: `1px solid ${CARD_BORDER}` }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0, display: "inline-block" }} />
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

export function MobileBrainView() {
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [network, setNetwork] = useState<BrainNetwork | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/brain-graph/status").then((r) => r.json()).then((j) => setStatus(j as BrainStatus)).catch(() => setError(true));
    fetch("/api/brain-graph/network").then((r) => r.json()).then((j) => setNetwork(j as BrainNetwork)).catch(() => null);
  }, []);

  const nodeCount = network?.nodes?.length ?? 0;
  const linkCount = network?.links?.length ?? 0;
  const hasGraph = Array.isArray(network?.nodes) && nodeCount > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "16px 16px 12px", background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))" }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-text), sans-serif" }}>Brain</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>Capitalife Knowledge Graph</p>
      </header>

      <div style={{ padding: "8px 16px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
          <GlobeSpinner size={130} />
        </div>

        {error ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Brain nicht erreichbar</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <StatCard label="Knoten" value={hasGraph ? nodeCount.toLocaleString("de-DE") : "–"} sub={network?.source ?? "Nodes im Graphen"} />
              <StatCard label="Links" value={hasGraph ? linkCount.toLocaleString("de-DE") : "–"} sub="Verbindungen" />
            </div>
            {status && (
              <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "12px 14px 8px", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Systemstatus</div>
                <StatusRow ok={status.pathConfigured} label="Brain-Pfad konfiguriert" />
                <StatusRow ok={status.brainFile} label="Brain-Datei vorhanden" />
                <StatusRow ok={status.snapshotFile} label="Snapshot vorhanden" />
                <StatusRow ok={hasGraph} label="Graph geladen" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
