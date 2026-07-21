"use client";
import { useEffect, useState } from "react";

const GOLD = "#e2ca7a";
const CARD_BG = "#1c1d20";
const CARD_BORDER = "rgba(255,255,255,0.06)";

type BrainStatus = {
  brain: { nodeCount: number; linkCount: number; builtAt: string | null; exists: boolean };
  dashboard: { nodeCount: number; linkCount: number };
  graphifyStatus: "available" | "partial" | "missing";
  lastUpdated: string | null;
  vaultSizeGb: number | null;
  changes: { title: string; status: "ok" | "partial" | "missing"; updatedAt: string | null }[];
};

function fmtDate(iso: string | null) {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "2-digit" });
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ flex: 1, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: GOLD, fontFamily: "var(--font-montserrat), sans-serif", lineHeight: 1.1, marginTop: 3 }}>{value}</div>
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

export function MobileBrainView() {
  const [data, setData] = useState<BrainStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/brain-graph/status").then((r) => r.json()).then((j) => setData(j as BrainStatus)).catch(() => setError(true));
  }, []);

  const totalNodes = (data?.brain.nodeCount ?? 0) + (data?.dashboard.nodeCount ?? 0);
  const totalLinks = (data?.brain.linkCount ?? 0) + (data?.dashboard.linkCount ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "16px 16px 12px", background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))" }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-montserrat), sans-serif" }}>Brain</h1>
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
              <StatCard label="Knoten" value={data ? totalNodes.toLocaleString("de-DE") : "–"} sub="Nodes im Graphen" />
              <StatCard label="Links" value={data ? totalLinks.toLocaleString("de-DE") : "–"} sub="Verbindungen" />
            </div>
            {data && (
              <div style={{ display: "flex", gap: 10 }}>
                <StatCard label="Vault" value={data.vaultSizeGb !== null ? `${data.vaultSizeGb} GB` : "–"} sub="Vault-Größe" />
                <StatCard label="Aktualisiert" value={fmtDate(data.lastUpdated)} sub={data.graphifyStatus} />
              </div>
            )}
            {data && (
              <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "12px 14px 8px", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Systemstatus</div>
                {data.changes.map((c, i) => {
                  const dot = c.status === "ok" ? "#4ade80" : c.status === "partial" ? GOLD : "rgba(255,255,255,0.2)";
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 14px", borderTop: i === 0 ? "none" : `1px solid ${CARD_BORDER}` }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0, marginTop: 4, display: "inline-block" }} />
                      <div>
                        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", fontWeight: 500 }}>{c.title}</div>
                        {c.updatedAt && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.32)", marginTop: 1 }}>{fmtDate(c.updatedAt)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
