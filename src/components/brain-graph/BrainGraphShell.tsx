"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { HeaderDivider } from "@/components/dashboard/header-divider";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="text-sm text-[#555]">Lade Graph…</span>
    </div>
  ),
});

// ── Types ─────────────────────────────────────────────────────────────────────

type NetworkNode = {
  id: string;
  label: string;
  folder: string;
  preview: string;
  degree: number;
  community: number | null;
  source: "brain" | "dashboard";
  x?: number;
  y?: number;
};

type NetworkLink = { source: string | NetworkNode; target: string | NetworkNode };
type NetworkData = { nodes: NetworkNode[]; links: NetworkLink[]; source?: string };

// ── Folder metadata ───────────────────────────────────────────────────────────

const FOLDER_COLORS: Record<string, string> = {
  "00_Index":                  "#f0dfa0",
  "02_Strategy":               "#e2ca7a",
  "04_Strategies":             "#e2ca7a",
  "09_AI":                     "#ffffff",
  "13_Manuals":                "#c8cdd4",
  "16_Backtesting_Validation": "#9ca0aa",
  "17_Haftungsdach_QA":        "#6b7280",
  "90_Inbox":                  "#6a8faf",
};

const FOLDER_LABELS: Record<string, string> = {
  "00_Index":                  "Index",
  "02_Strategy":               "Strategy",
  "04_Strategies":             "Strategies",
  "09_AI":                     "AI",
  "13_Manuals":                "Manuals",
  "16_Backtesting_Validation": "Backtesting",
  "17_Haftungsdach_QA":        "Haftung",
  "90_Inbox":                  "Inbox",
};

function nodeColor(node: NetworkNode): string {
  return FOLDER_COLORS[node.folder] ?? "#3a4050";
}

function nodeVal(node: NetworkNode): number {
  if (node.degree >= 50) return 64;
  if (node.degree >= 20) return 25;
  if (node.degree >= 5)  return 9;
  if (node.degree >= 1)  return 4;
  return 2;
}

// ── Node detail panel ─────────────────────────────────────────────────────────

function NodePanel({ node, onClose }: { node: NetworkNode; onClose: () => void }) {
  const color = nodeColor(node);
  const folderLabel = FOLDER_LABELS[node.folder] ?? node.folder;
  return (
    <div
      className="pointer-events-auto absolute right-0 top-0 z-20 h-full w-[260px] border-l border-white/[0.05] bg-[#08090c]/96 backdrop-blur-sm"
      style={{ boxShadow: "-8px 0 32px rgba(0,0,0,0.6)" }}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#555]">Node</span>
        <button type="button" onClick={onClose} className="text-[#555] transition hover:text-white text-sm">✕</button>
      </div>
      <div className="p-4 text-[11px]">
        <div className="mb-4 flex items-start gap-2">
          <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          <span className="break-all font-medium leading-[1.5] text-[#e8eaed]">{node.label}</span>
        </div>
        <Row label="Ordner"       value={folderLabel} accent={color} />
        <Row label="Verbindungen" value={String(node.degree)} accent="#e2ca7a" />
        <Row label="Quelle"       value={node.source === "brain" ? "Capitalife Brain" : "Dashboard"} />
        {node.preview && (
          <div className="mt-4">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#555]">Vorschau</div>
            <p className="whitespace-pre-wrap break-words text-[10px] leading-[1.6] text-[#7a8090]">{node.preview}</p>
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

// ── Status strip ──────────────────────────────────────────────────────────────

const DOT = <span className="mx-0.5 select-none text-[#3a3f48]">•</span>;

function StatusStrip({ nodeCount, linkCount, dataSource }: {
  nodeCount: number; linkCount: number; dataSource?: string;
}) {
  const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const sourceLabel =
    dataSource === "supabase"     ? "supabase" :
    dataSource === "obsidian-api" ? "obsidian" :
    dataSource === "filesystem"   ? "fs"       : null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-5 z-20 flex items-center text-xs text-[#6b7280]">
      <span>{nodeCount} Nodes</span>
      {DOT}
      <span>{linkCount} Links</span>
      {DOT}
      <span>{today}</span>
      {sourceLabel && (
        <span className="ml-2 rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-[#555]">
          {sourceLabel}
        </span>
      )}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  const entries = Object.entries(FOLDER_LABELS).filter(([k]) => FOLDER_COLORS[k]);
  return (
    <div className="pointer-events-none absolute left-5 top-4 z-20 flex flex-col gap-1">
      {entries.map(([folder, label]) => (
        <div key={folder} className="flex items-center gap-1.5 text-[10px] text-[#555]">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: FOLDER_COLORS[folder] }} />
          {label}
        </div>
      ))}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

const swrFetcher = (url: string) => fetch(url).then((r) => r.json());

export function BrainGraphShell() {
  const { data: network } = useSWR<NetworkData>("/api/brain-graph/network", swrFetcher, {
    refreshInterval: 3_600_000,
  });
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const handleNodeClick = useCallback((node: object) => {
    const n = node as NetworkNode;
    setSelected((prev) => (prev?.id === n.id ? null : n));
  }, []);

  const handleBgClick = useCallback(() => {
    setSelected(null);
  }, []);

  const paintNode = useCallback((node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n = node as NetworkNode & { x: number; y: number };
    const isSelected = selected?.id === n.id;
    const r = Math.sqrt(nodeVal(n)) * 1.4;

    ctx.beginPath();
    ctx.arc(n.x, n.y, isSelected ? r + 2 : r, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#ffffff" : nodeColor(n);
    ctx.globalAlpha = n.degree === 0 ? 0.25 : 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();
    }

    if (n.degree >= 10 && globalScale >= 1.8) {
      const fontSize = Math.max(8, 11 / globalScale);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.textAlign = "center";
      ctx.fillText(n.label, n.x, n.y + r + fontSize + 2);
    }
  }, [selected]);

  const nodeCount = network?.nodes.length ?? 0;
  const linkCount = network?.links.length ?? 0;

  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#07080a]">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar sectionLabel="Brain Graph" />
          <HeaderDivider />
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <div ref={containerRef} className="absolute inset-0">
              {network && network.nodes.length > 0 ? (
                <ForceGraph2D
                  graphData={{ nodes: network.nodes, links: network.links }}
                  width={dims.w}
                  height={dims.h}
                  backgroundColor="#07080a"
                  nodeId="id"
                  nodeLabel={(n) => (n as NetworkNode).label}
                  nodeColor={(n) => nodeColor(n as NetworkNode)}
                  nodeVal={(n) => nodeVal(n as NetworkNode)}
                  nodeRelSize={1}
                  linkColor={() => "rgba(255,255,255,0.06)"}
                  linkWidth={0.8}
                  linkDirectionalParticles={0}
                  onNodeClick={handleNodeClick}
                  onBackgroundClick={handleBgClick}
                  nodeCanvasObject={paintNode}
                  nodeCanvasObjectMode={() => "replace"}
                  cooldownTicks={200}
                  d3AlphaDecay={0.02}
                  d3VelocityDecay={0.4}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <div className="text-sm text-[#555]">
                    {network ? "Graph nicht verfügbar" : "Lade Graph…"}
                  </div>
                  {network && (network as { message?: string }).message && (
                    <div className="max-w-sm text-center text-xs text-[#444]">
                      {(network as { message?: string }).message}
                    </div>
                  )}
                </div>
              )}
            </div>
            {selected && <NodePanel node={selected} onClose={() => setSelected(null)} />}
            <Legend />
            <StatusStrip nodeCount={nodeCount} linkCount={linkCount} dataSource={network?.source} />
          </main>
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
