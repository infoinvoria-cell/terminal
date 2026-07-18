"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";

// ForceGraph2D uses browser APIs — load on client only
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

type NetworkNode = {
  id: string;
  label: string;
  degree: number;
  community: number | null;
  source: "brain" | "dashboard";
};

type NetworkLink = { source: string; target: string };
type NetworkData  = { nodes: NetworkNode[]; links: NetworkLink[] };

type StatusData = {
  lastUpdated: string | null;
  changes: { title: string; updatedAt: string | null }[];
};

// ── Node colour / size helpers ────────────────────────────────────────────────

function topThreshold(nodes: NetworkNode[]): number {
  const ds = nodes.map((n) => n.degree).sort((a, b) => a - b);
  return ds[Math.floor(ds.length * 0.95)] ?? 999;
}

function nodeColor(degree: number, top: number): string {
  if (degree >= top) return "#e2ca7a";
  if (degree >= 4)   return "#f0dfa0";
  if (degree >= 1)   return "#888888";
  return "#444444";
}

function nodeVal(degree: number, top: number): number {
  if (degree >= top) return 12;
  if (degree >= 4)   return 5;
  if (degree >= 1)   return 2.5;
  return 1;
}

// ── Graph canvas ──────────────────────────────────────────────────────────────

function BrainCanvas({ data }: { data: NetworkData }) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 1200, h: 800 });
  const [selected, setSelected] = useState<NetworkNode | null>(null);

  const top = topThreshold(data.nodes);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDims({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const graphData = {
    nodes: data.nodes.map((n) => ({ ...n, name: n.label })),
    links: data.links,
  };

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ForceGraph2D
        graphData={graphData}
        width={dims.w}
        height={dims.h}
        backgroundColor="#07080a"
        // Node appearance
        nodeVal={(n) => nodeVal((n as NetworkNode).degree, top)}
        nodeColor={(n) => nodeColor((n as NetworkNode).degree, top)}
        nodeLabel={(n) => (n as NetworkNode).label}
        // Link appearance
        linkColor={() => "#2a2a2a"}
        linkWidth={0.5}
        // Force config — tight Obsidian-style layout
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.4}
        cooldownTicks={200}
        cooldownTime={8000}
        // Interaction
        onNodeClick={(n) => {
          const node = n as NetworkNode;
          setSelected((prev) => (prev?.id === node.id ? null : node));
        }}
        onBackgroundClick={() => setSelected(null)}
      />
      {selected && (
        <NodePanel node={selected} top={top} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ── Node detail panel ─────────────────────────────────────────────────────────

function NodePanel({ node, top, onClose }: { node: NetworkNode; top: number; onClose: () => void }) {
  const color = nodeColor(node.degree, top);
  return (
    <div
      className="absolute right-0 top-0 h-full w-[240px] border-l border-white/[0.05] bg-[#09090c]/95 backdrop-blur-sm"
      style={{ boxShadow: "-8px 0 32px rgba(0,0,0,0.6)" }}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#555]">Node</span>
        <button type="button" onClick={onClose} className="text-[#555] hover:text-white transition text-sm">✕</button>
      </div>
      <div className="p-4 text-[11px]">
        <div className="mb-4 flex gap-2 items-start">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full inline-block" style={{ background: color }} />
          <span className="break-all font-medium text-[#e8eaed] leading-[1.5]">{node.label}</span>
        </div>
        <Row label="Quelle"       value={node.source === "brain" ? "Capitalife Brain" : "Dashboard"} />
        <Row label="Verbindungen" value={String(node.degree)} accent="#e2ca7a" />
        {node.community !== null && <Row label="Community" value={`#${node.community}`} />}
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

function fmt(v: string | null) {
  if (!v) return "--.--.";
  try { return new Date(v).toLocaleString("de-DE", { day: "2-digit", month: "2-digit" }); } catch { return v; }
}

function StatusStrip({ status }: { status: StatusData | null }) {
  const items = (status?.changes ?? []).filter((c) => c.title !== "context pack available").slice(0, 4);
  return (
    <div className="pointer-events-none absolute bottom-5 left-5 z-20 text-[10px] leading-5 text-[#8b9098]">
      <div className="text-[#c9ced4]">
        Updated {status?.lastUpdated
          ? new Date(status.lastUpdated).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
          : "--"}
      </div>
      {items.map((c, i) => (
        <div key={i}><span className="mr-2 text-[#d6bd68]">{fmt(c.updatedAt)}</span>{c.title}</div>
      ))}
      <div className="pt-1 text-[#4b5058]">Graphify ist Index · Brain bleibt Source of Truth</div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function BrainGraphShell() {
  const [status,  setStatus]  = useState<StatusData | null>(null);
  const [network, setNetwork] = useState<NetworkData | null>(null);

  useEffect(() => {
    fetch("/api/brain-graph/status").then((r) => r.json()).then(setStatus).catch(() => null);
    fetch("/api/brain-graph/network").then((r) => r.json()).then(setNetwork).catch(() => null);
  }, []);

  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#07080a]">
        <Sidebar />
        <main className="relative min-h-0 flex-1 overflow-hidden">
          {network && network.nodes.length > 0
            ? <BrainCanvas data={network} />
            : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="text-sm text-[#f4f4f5]">
                    {network ? "Graph index not available" : "Loading graph…"}
                  </div>
                  {network && <div className="mt-1 text-[10px] text-[#555]">Run Graphify/RTK index build</div>}
                </div>
              </div>
            )}
          <StatusStrip status={status} />
        </main>
      </div>
    </HomeDashboardProvider>
  );
}
