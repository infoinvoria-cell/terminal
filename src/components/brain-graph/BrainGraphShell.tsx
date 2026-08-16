"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CapitalifeStatusPanel } from "@/components/ui/CapitalifeStatusPanel";
import { BrainGlobeCanvas, brainGraphFetcher } from "@/components/brain-graph/BrainGlobeCanvas";
import type { NetworkNode, NetworkData } from "@/components/brain-graph/BrainGlobeCanvas";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusData = {
  lastUpdated: string | null;
  changes: { title: string; updatedAt: string | null }[];
  vaultSizeGb?: number | null;
};

// ── Folder metadata ───────────────────────────────────────────────────────────

const FOLDER_COLORS: Record<string, string> = {
  // User Brain vault folders
  "00_Index":                  "#f0dfa0",
  "04_Strategies":             "#C9A84C",
  "09_AI":                     "#ffffff",
  "13_Manuals":                "#c8cdd4",
  "16_Backtesting_Validation": "#9ca0aa",
  "17_Haftungsdach_QA":        "#6b7280",
  // System / Dashboard nodes (source: "dashboard")
  "00_System/Portfolio":   "#C9A84C",
  "00_System/Strategy":    "#e8b84b",
  "00_System/Instrument":  "#60a5fa",
  "00_System/Market":      "#34d399",
  "00_System/Dataset":     "#a78bfa",
  "00_System/Runtime":     "#f87171",
  "00_System/Asset":       "#fb923c",
};

const FOLDER_LABELS: Record<string, string> = {
  // User Brain vault folders
  "00_Index":                  "Index",
  "04_Strategies":             "Strategies",
  "09_AI":                     "AI",
  "13_Manuals":                "Manuals",
  "16_Backtesting_Validation": "Backtesting",
  "17_Haftungsdach_QA":        "Haftung",
  // System folders
  "00_System/Portfolio":   "Portfolio",
  "00_System/Strategy":    "Strategy",
  "00_System/Instrument":  "Instrument",
  "00_System/Market":      "Market",
  "00_System/Dataset":     "Dataset",
  "00_System/Runtime":     "Runtime",
  "00_System/Asset":       "Asset",
};

// ── Node detail panel ─────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  ENGINE:     "Engine",
  SIGNALS:    "Signals",
  COMPONENTS: "Components",
  MONITORING: "Monitoring",
  ANALYTICS:  "Analytics",
  MODELING:   "Modeling",
  BRAIN:      "Brain",
};

function NodePanel({ node, onClose }: { node: NetworkNode; onClose: () => void }) {
  const color = FOLDER_COLORS[node.folder] ?? "#888888";
  const folderLabel = FOLDER_LABELS[node.folder] ?? node.folder;
  const isSystem = node.source === "dashboard";
  const actions = node.navActions ? Object.entries(node.navActions) : [];

  return (
    <div
      className="absolute right-0 top-0 h-full w-[260px] border-l border-white/[0.05] bg-[#08090c]/96 backdrop-blur-sm"
      style={{ boxShadow: "-8px 0 32px rgba(0,0,0,0.6)", zIndex: 20 }}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#555]">
          {isSystem ? (node.nodeType ?? "System") : "Node"}
        </span>
        <button type="button" onClick={onClose} className="text-[#555] hover:text-white transition text-sm">✕</button>
      </div>
      <div className="p-4 text-[11px]">
        <div className="mb-4 flex gap-2 items-start">
          <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full inline-block" style={{ background: color }} />
          <span className="break-all font-medium text-[#e8eaed] leading-[1.5]">{node.label}</span>
        </div>
        <Row label="Typ"          value={folderLabel} accent={color} />
        <Row label="Verbindungen" value={String(node.degree)} accent="#C9A84C" />
        <Row label="Quelle"       value={isSystem ? "Capitalife System" : "Capitalife Brain"} />
        {node.preview && (
          <div className="mt-4">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#555]">Info</div>
            <p className="text-[10px] leading-[1.6] text-[#7a8090] break-words whitespace-pre-wrap">{node.preview}</p>
          </div>
        )}
        {actions.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#555]">Navigate</div>
            <div className="flex flex-wrap gap-1.5">
              {actions.map(([surface, href]) => (
                <Link
                  key={surface}
                  href={href}
                  style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "3px 9px", borderRadius: 5,
                    border: "1px solid rgba(201,168,76,0.25)",
                    background: "rgba(201,168,76,0.07)",
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                    color: "rgba(201,168,76,0.85)", textDecoration: "none",
                    whiteSpace: "nowrap", textTransform: "uppercase",
                  }}
                >
                  {ACTION_LABELS[surface] ?? surface} ↗
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="mb-2 flex justify-between gap-2">
      <span className="text-[#555]">{label}</span>
      <span style={{ color: accent ?? "#9ca0aa" }}>{value}</span>
    </div>
  );
}

// ── Play / Pause button ───────────────────────────────────────────────────────

function PlayButton({ spinning, onToggle }: { spinning: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={spinning ? "Stop rotation" : "Globe rotation"}
      className="absolute bottom-5 right-5 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-[#0c0e12]/80 text-[#4a4f58] backdrop-blur-sm transition-colors hover:border-white/[0.15] hover:text-[#9ca0aa]"
    >
      {spinning ? (
        <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
          <rect x="0.5" y="0" width="3.5" height="12" rx="1" />
          <rect x="7"   y="0" width="3.5" height="12" rx="1" />
        </svg>
      ) : (
        <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
          <path d="M0 0 L10 6 L0 12 Z" />
        </svg>
      )}
    </button>
  );
}

// ── Status strip ──────────────────────────────────────────────────────────────

const DOT = <span className="text-[#3a3f48] select-none mx-0.5">•</span>;

function StatusStrip({ status, nodeCount, linkCount, dataSource }: {
  status: StatusData | null; nodeCount: number; linkCount: number; dataSource?: string;
}) {
  const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const isObsidian = dataSource === "obsidian-api";
  const isFs = dataSource === "filesystem";
  const brainActive = isObsidian || isFs;
  const gbStr = status?.vaultSizeGb != null
    ? `${Number(status.vaultSizeGb).toFixed(1)} GB`
    : null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-5 z-20 flex items-center text-xs text-[#6b7280]">
      <span>{nodeCount.toLocaleString()} Nodes</span>
      {DOT}
      <span>{linkCount.toLocaleString()} Links</span>
      {gbStr && <>{DOT}<span>{gbStr} Vault</span></>}
      {DOT}
      <span>{today}</span>
      {brainActive && (
        <>
          {DOT}
          <span className="text-[#52b36b]">
            ✓ Brain aktiv
          </span>
        </>
      )}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function BrainGraphShell() {
  const { data: status }  = useSWR<StatusData>("/api/brain-graph/status",  brainGraphFetcher, { refreshInterval: 3_600_000 });
  const { data: network, error: networkError, isLoading: networkLoading } = useSWR<NetworkData>("/api/brain-graph/network", brainGraphFetcher, { refreshInterval: 3_600_000 });
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  const [spinning, setSpinning] = useState(true);

  // The cloud preview returns { error: "unavailable in cloud preview" } with no
  // nodes/links arrays, so guard every array access — network can be a truthy
  // object without a graph.
  const hasGraph = Array.isArray(network?.nodes) && network.nodes.length > 0;
  const nodeCount = network?.nodes?.length ?? 0;
  const linkCount = network?.links?.length ?? 0;

  return (
    <main className="relative min-h-0 flex-1 overflow-hidden">
      {networkLoading ? (
        <CapitalifeStatusPanel tone="loading" title="Brain wird geladen" detail="Graph, Status und Verknüpfungen werden aufgebaut." />
      ) : networkError ? (
        <CapitalifeStatusPanel
          tone="unavailable"
          title="Brain API ist nicht verfügbar"
          detail={`Code: ${networkError.message || "BRAIN_API_UNAVAILABLE"}`}
        />
      ) : hasGraph ? (
        <>
          <BrainGlobeCanvas
            data={network}
            spinning={spinning}
            onSelect={setSelected}
            selected={selected}
          />
          {selected && <NodePanel node={selected} onClose={() => setSelected(null)} />}
        </>
      ) : (
        <CapitalifeStatusPanel
          tone="degraded"
          title="Brain Graph ist aktuell nicht verfügbar"
          detail={(network as { message?: string } | undefined)?.message ?? "Keine synchronisierten Brain-Daten vorhanden."}
        />
      )}
      {!networkError ? <StatusStrip status={status ?? null} nodeCount={nodeCount} linkCount={linkCount} dataSource={network?.source} /> : null}
      {hasGraph && (
        <PlayButton spinning={spinning} onToggle={() => setSpinning((s) => !s)} />
      )}
    </main>
  );
}
