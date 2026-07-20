"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { forceManyBody, forceLink } from "d3-force";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { HeaderDivider } from "@/components/dashboard/header-divider";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// ── Layout cache ──────────────────────────────────────────────────────────────

const LAYOUT_KEY = "brain-graph-layout";

function dataFingerprint(data: NetworkData): string {
  return `${data.nodes.length}:${data.links.length}:${data.nodes.slice(0, 8).map((n) => n.id).join(",")}`;
}

type CachedLayout = { fingerprint: string; positions: Record<string, { x: number; y: number }> };

function loadLayout(fp: string): Record<string, { x: number; y: number }> | null {
  try {
    const raw = sessionStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedLayout;
    return parsed.fingerprint === fp ? parsed.positions : null;
  } catch { return null; }
}

function saveLayout(fp: string, nodes: { id: string; x?: number; y?: number }[]) {
  try {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of nodes) {
      if (n.x != null && n.y != null) positions[n.id] = { x: n.x, y: n.y };
    }
    sessionStorage.setItem(LAYOUT_KEY, JSON.stringify({ fingerprint: fp, positions }));
  } catch { /* non-critical */ }
}

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

type NetworkLink = { source: string; target: string };
type NetworkData  = { nodes: NetworkNode[]; links: NetworkLink[]; source?: string };

type StatusData = {
  lastUpdated: string | null;
  changes: { title: string; updatedAt: string | null }[];
};

// ── Colour / size helpers ─────────────────────────────────────────────────────

const FOLDER_COLORS: Record<string, string> = {
  "00_Index":                  "#f0dfa0",
  "04_Strategies":             "#e2ca7a",
  "09_AI":                     "#ffffff",
  "13_Manuals":                "#c8cdd4",
  "16_Backtesting_Validation": "#9ca0aa",
  "17_Haftungsdach_QA":        "#6b7280",
};

const FOLDER_LABELS: Record<string, string> = {
  "00_Index":                  "Index",
  "04_Strategies":             "Strategies",
  "09_AI":                     "AI",
  "13_Manuals":                "Manuals",
  "16_Backtesting_Validation": "Backtesting",
  "17_Haftungsdach_QA":        "Haftung",
};


// ── Graph canvas ──────────────────────────────────────────────────────────────

type CanvasProps = {
  data: NetworkData;
  spinning: boolean;
  onSelect: (n: NetworkNode | null) => void;
  selected: NetworkNode | null;
};

function BrainCanvas({ data, spinning, onSelect, selected }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef      = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef  = useRef<any>(null);
  const zoomedRef = useRef(false);
  const [dims, setDims] = useState({ w: 1200, h: 800 });

  const fp = dataFingerprint(data);
  const cachedPositions = loadLayout(fp);
  const hasCached = cachedPositions !== null;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (hasCached) return;
    const g = graphRef.current;
    if (!g) return;
    g.d3Force("charge", forceManyBody().strength(-15));
    g.d3Force("link",   forceLink().distance(20).strength(0.8));
  }, [data, hasCached]);

  const graphData = {
    nodes: data.nodes.map(({ x: _x, y: _y, ...n }) => {
      const pos = cachedPositions?.[n.id];
      if (pos) return { ...n, name: n.label, x: pos.x, y: pos.y, fx: pos.x, fy: pos.y };
      return { ...n, name: n.label };
    }),
    links: data.links,
  };

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* Spinning wrapper — CSS rotateY applied here */}
      <div
        ref={wrapRef}
        className={spinning ? "globe-spin" : undefined}
        style={{ width: "100%", height: "100%" }}
      >
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dims.w}
          height={dims.h}
          backgroundColor="#07080a"
          nodeVal={(n) => Math.max(2, Math.log(((n as NetworkNode).degree || 0) + 1) * 3)}
          nodeColor={(n) => {
            const d = (n as NetworkNode).degree;
            return d === 0 ? "#444444" : d < 5 ? "#888888" : d < 20 ? "#cccccc" : "#e2ca7a";
          }}
          nodeLabel={() => ""}
          nodeRelSize={4}
          linkColor={() => "rgba(255,255,255,0.15)"}
          linkWidth={0.5}
          d3AlphaDecay={0.005}
          d3VelocityDecay={0.2}
          warmupTicks={hasCached ? 0 : 500}
          cooldownTicks={0}
          onEngineStop={() => {
            if (zoomedRef.current) return;
            zoomedRef.current = true;
            saveLayout(fp, graphData.nodes as { id: string; x?: number; y?: number }[]);
            graphRef.current?.zoomToFit(800, 100);
          }}
          onNodeClick={(n) => {
            const node = n as NetworkNode;
            onSelect(selected?.id === node.id ? null : node);
          }}
          onBackgroundClick={() => onSelect(null)}
        />
      </div>
    </div>
  );
}

// ── Node detail panel ─────────────────────────────────────────────────────────

function NodePanel({ node, onClose }: { node: NetworkNode; onClose: () => void }) {
  const color = FOLDER_COLORS[node.folder] ?? "#888888";
  const folderLabel = FOLDER_LABELS[node.folder] ?? node.folder;
  return (
    <div
      className="absolute right-0 top-0 h-full w-[260px] border-l border-white/[0.05] bg-[#08090c]/96 backdrop-blur-sm"
      style={{ boxShadow: "-8px 0 32px rgba(0,0,0,0.6)", zIndex: 20 }}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#555]">Node</span>
        <button type="button" onClick={onClose} className="text-[#555] hover:text-white transition text-sm">✕</button>
      </div>
      <div className="p-4 text-[11px]">
        <div className="mb-4 flex gap-2 items-start">
          <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full inline-block" style={{ background: color }} />
          <span className="break-all font-medium text-[#e8eaed] leading-[1.5]">{node.label}</span>
        </div>
        <Row label="Ordner"       value={folderLabel} accent={color} />
        <Row label="Verbindungen" value={String(node.degree)} accent="#e2ca7a" />
        <Row label="Quelle"       value={node.source === "brain" ? "Capitalife Brain" : "Dashboard"} />
        {node.preview && (
          <div className="mt-4">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#555]">Vorschau</div>
            <p className="text-[10px] leading-[1.6] text-[#7a8090] break-words whitespace-pre-wrap">{node.preview}</p>
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
        // Pause icon
        <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
          <rect x="0.5" y="0" width="3.5" height="12" rx="1" />
          <rect x="7" y="0" width="3.5" height="12" rx="1" />
        </svg>
      ) : (
        // Play icon
        <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
          <path d="M0 0 L10 6 L0 12 Z" />
        </svg>
      )}
    </button>
  );
}

// ── Status strip ──────────────────────────────────────────────────────────────

function StatusStrip({ status, nodeCount, linkCount, dataSource }: {
  status: StatusData | null; nodeCount: number; linkCount: number; dataSource?: string;
}) {
  const date = status?.lastUpdated
    ? new Date(status.lastUpdated).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "--";
  const sourceLabel = dataSource === "obsidian-api" ? "obsidian" : dataSource === "filesystem" ? "fs" : null;
  return (
    <div className="pointer-events-none absolute bottom-4 left-5 z-20 flex items-center gap-2 text-[10px] text-[#4a4f58]">
      <span>{nodeCount} Nodes · {linkCount} Links · {date}</span>
      {sourceLabel && (
        <span className={`rounded px-1 py-px text-[8px] font-medium ${dataSource === "obsidian-api" ? "bg-[#7c3aed]/20 text-[#a78bfa]" : "bg-white/[0.04] text-[#4a4f58]"}`}>
          {sourceLabel}
        </span>
      )}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function BrainGraphShell() {
  const [status,   setStatus]   = useState<StatusData | null>(null);
  const [network,  setNetwork]  = useState<NetworkData | null>(null);
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    fetch("/api/brain-graph/status").then((r) => r.json()).then(setStatus).catch(() => null);
    fetch("/api/brain-graph/network").then((r) => r.json()).then(setNetwork).catch(() => null);
  }, []);

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
            {network && network.nodes.length > 0 ? (
              <>
                <BrainCanvas
                  data={network}
                  spinning={spinning}
                  onSelect={setSelected}
                  selected={selected}
                />
                {selected && <NodePanel node={selected} onClose={() => setSelected(null)} />}
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-sm text-[#555]">
                  {network ? "Graph nicht verfügbar" : "Lade Graph…"}
                </div>
              </div>
            )}
            <StatusStrip status={status} nodeCount={nodeCount} linkCount={linkCount} dataSource={network?.source} />
            {network && network.nodes.length > 0 && (
              <PlayButton spinning={spinning} onToggle={() => setSpinning((s) => !s)} />
            )}
          </main>
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
