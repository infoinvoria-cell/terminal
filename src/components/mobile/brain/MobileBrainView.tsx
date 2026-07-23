"use client";
import { useEffect, useState } from "react";

const GOLD = "#e2ca7a";
const CARD_BG = "#1c1d20";
const CARD_BORDER = "rgba(255,255,255,0.06)";

const FOLDER_LABELS: Record<string, string> = {
  "00_Index":                  "Index",
  "04_Strategies":             "Strategies",
  "09_AI":                     "AI",
  "13_Manuals":                "Manuals",
  "16_Backtesting_Validation": "Backtesting",
  "17_Haftungsdach_QA":        "Haftung",
};

const FOLDER_COLORS: Record<string, string> = {
  "00_Index":                  "#f0dfa0",
  "04_Strategies":             "#e2ca7a",
  "09_AI":                     "#ffffff",
  "13_Manuals":                "#c8cdd4",
  "16_Backtesting_Validation": "#9ca0aa",
  "17_Haftungsdach_QA":        "#6b7280",
};

type BrainStatus = {
  brain: { nodeCount: number; linkCount: number; builtAt: string | null; exists: boolean };
  dashboard: { nodeCount: number; linkCount: number };
  graphifyStatus: "available" | "partial" | "missing";
  lastUpdated: string | null;
  vaultSizeGb: number | null;
  changes: { title: string; status: "ok" | "partial" | "missing"; updatedAt: string | null }[];
};

type NetworkNode = {
  id: string;
  label: string;
  folder: string;
  preview: string;
  degree: number;
  community: number | null;
  source: "brain" | "dashboard";
};

type NetworkData = { nodes: NetworkNode[]; links: { source: string; target: string }[]; source?: string };

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

function TopHubsList({ nodes }: { nodes: NetworkNode[] }) {
  const top = [...nodes].sort((a, b) => b.degree - a.degree).slice(0, 10);
  if (top.length === 0) return null;
  return (
    <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px 8px", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Top Knoten
      </div>
      {top.map((node, i) => {
        const color = FOLDER_COLORS[node.folder] ?? "#888";
        const folderLabel = FOLDER_LABELS[node.folder] ?? node.folder;
        return (
          <div key={node.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: i === 0 ? "none" : `1px solid ${CARD_BORDER}` }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.label}</div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.32)", marginTop: 1 }}>{folderLabel}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, flexShrink: 0 }}>{node.degree}</span>
          </div>
        );
      })}
    </div>
  );
}

function FolderBreakdown({ nodes }: { nodes: NetworkNode[] }) {
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    counts[node.folder] = (counts[node.folder] ?? 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (entries.length === 0) return null;
  const max = entries[0][1];
  return (
    <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ordner</div>
      {entries.map(([folder, count]) => {
        const color = FOLDER_COLORS[folder] ?? "#888";
        const label = FOLDER_LABELS[folder] ?? folder;
        const pct = (count / max) * 100;
        return (
          <div key={folder}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>{count}</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.6s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MobileBrainView() {
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/brain-graph/status")
      .then((r) => r.json())
      .then((j) => setStatus(j as BrainStatus))
      .catch(() => setError(true));

    fetch("/api/brain-graph/network")
      .then((r) => r.json())
      .then((j) => setNetwork(j as NetworkData))
      .catch(() => { /* non-fatal — network graph optional */ });
  }, []);

  // Use network data for accurate counts when available; fall back to status
  const totalNodes = network
    ? network.nodes.length
    : (status?.brain.nodeCount ?? 0) + (status?.dashboard.nodeCount ?? 0);
  const totalLinks = network
    ? network.links.length
    : (status?.brain.linkCount ?? 0) + (status?.dashboard.linkCount ?? 0);

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
              <StatCard label="Knoten" value={status || network ? totalNodes.toLocaleString("de-DE") : "–"} sub="Nodes im Graphen" />
              <StatCard label="Links" value={status || network ? totalLinks.toLocaleString("de-DE") : "–"} sub="Verbindungen" />
            </div>
            {status && (
              <div style={{ display: "flex", gap: 10 }}>
                <StatCard label="Vault" value={status.vaultSizeGb !== null ? `${status.vaultSizeGb} GB` : "–"} sub="Vault-Größe" />
                <StatCard label="Aktualisiert" value={fmtDate(status.lastUpdated)} sub={status.graphifyStatus} />
              </div>
            )}

            {/* Network-derived panels — only shown when network data is loaded */}
            {network && network.nodes.length > 0 && (
              <>
                <FolderBreakdown nodes={network.nodes} />
                <TopHubsList nodes={network.nodes} />
              </>
            )}

            {status && (
              <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "12px 14px 8px", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Systemstatus</div>
                {status.changes.map((c, i) => {
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

            {/* Source badge */}
            {network?.source && (
              <div style={{ textAlign: "center" }}>
                <span style={{
                  display: "inline-block",
                  fontSize: 10, fontWeight: 700,
                  color: network.source === "obsidian-api" ? "#a78bfa" : "rgba(255,255,255,0.30)",
                  background: network.source === "obsidian-api" ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${network.source === "obsidian-api" ? "rgba(124,58,237,0.30)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 6, padding: "3px 10px", letterSpacing: "0.05em", textTransform: "uppercase",
                }}>
                  {network.source === "obsidian-api" ? "Obsidian Live" : network.source}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
