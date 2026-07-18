"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";

type ChangeItem = {
  title: string;
  source: string;
  status: "ok" | "partial" | "missing";
  updatedAt: string | null;
};

type StatusData = {
  lastUpdated: string | null;
  changes: ChangeItem[];
};

type NetworkNode = {
  id: string;
  label: string;
  fileType: string | null;
  sourceFile: string | null;
  sourceLocation: string | null;
  degree: number;
  community: number | null;
  source: "brain" | "dashboard";
  x: number;
  y: number;
};

type NetworkLink = {
  source: string;
  target: string;
};

type NetworkData = {
  nodes: NetworkNode[];
  links: NetworkLink[];
};

type NodeColor = {
  fill: string;
  stroke: string;
  glow: string;
  label: string;
  category: string;
};

// ── Color clusters ──────────────────────────────────────────────────────────

const CLUSTER_LEGEND: Array<{ category: string; stroke: string; label: string }> = [
  { category: "ai",          stroke: "#4ade80", label: "AI / Brain" },
  { category: "strategies",  stroke: "#e2ca7a", label: "Strategien" },
  { category: "manuals",     stroke: "#60a5fa", label: "Manuals" },
  { category: "backtest",    stroke: "#a78bfa", label: "Backtesting" },
  { category: "qa",          stroke: "#fb923c", label: "QA / Haftung" },
  { category: "index",       stroke: "#d0d4d8", label: "Index" },
  { category: "components",  stroke: "#22d3ee", label: "Components" },
  { category: "lib",         stroke: "#818cf8", label: "Lib / Hooks" },
  { category: "routes",      stroke: "#34d399", label: "Routes / API" },
  { category: "other",       stroke: "#6b7280", label: "Sonstiges" },
];

function getNodeColor(node: NetworkNode): NodeColor {
  const file = (node.sourceFile ?? "").replace(/\\/g, "/").toLowerCase();

  if (node.source === "brain") {
    if (file.includes("/09_ai/"))
      return { fill: "rgba(74,222,128,0.16)", stroke: "#4ade80", glow: "#4ade80", label: "#6ee7b7", category: "ai" };
    if (file.includes("/04_strategies/"))
      return { fill: "rgba(226,202,122,0.18)", stroke: "#e2ca7a", glow: "#e2ca7a", label: "#f0e2a2", category: "strategies" };
    if (file.includes("/13_manuals/"))
      return { fill: "rgba(96,165,250,0.14)", stroke: "#60a5fa", glow: "#60a5fa", label: "#93c5fd", category: "manuals" };
    if (file.includes("/16_backtesting"))
      return { fill: "rgba(167,139,250,0.14)", stroke: "#a78bfa", glow: "#a78bfa", label: "#c4b5fd", category: "backtest" };
    if (file.includes("/17_haftungsdach"))
      return { fill: "rgba(251,146,60,0.14)", stroke: "#fb923c", glow: "#fb923c", label: "#fdba74", category: "qa" };
    if (file.includes("/00_index/"))
      return { fill: "rgba(208,212,216,0.16)", stroke: "#d0d4d8", glow: "#d0d4d8", label: "#e0e4ea", category: "index" };
    return { fill: "rgba(180,184,192,0.10)", stroke: "rgba(190,196,204,0.40)", glow: "#b0b8c0", label: "#b8c0ca", category: "other" };
  }

  // dashboard source
  if (file.includes("src/components/"))
    return { fill: "rgba(34,211,238,0.12)", stroke: "#22d3ee", glow: "#22d3ee", label: "#67e8f9", category: "components" };
  if (file.includes("src/lib/") || file.includes("src/hooks/") || file.includes("src/context/"))
    return { fill: "rgba(129,140,248,0.12)", stroke: "#818cf8", glow: "#818cf8", label: "#a5b4fc", category: "lib" };
  if (file.includes("src/app/"))
    return { fill: "rgba(52,211,153,0.12)", stroke: "#34d399", glow: "#34d399", label: "#6ee7b7", category: "routes" };
  return { fill: "rgba(100,110,120,0.08)", stroke: "rgba(130,140,150,0.30)", glow: "#6b7280", label: "#9ca3af", category: "other" };
}

function getNodeRadius(degree: number): number {
  if (degree >= 30) return 9;
  if (degree >= 20) return 7;
  if (degree >= 12) return 5;
  if (degree >= 6)  return 3.5;
  return 2.2;
}

function shortDateTime(value: string | null) {
  if (!value) return "--.-- ----";
  try {
    return new Date(value).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return value; }
}

function shortDate(value: string | null) {
  if (!value) return "--.--";
  try {
    return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  } catch { return value; }
}

// ── SVG defs: glow filters ──────────────────────────────────────────────────

function SvgDefs() {
  return (
    <defs>
      <filter id="glow-sm" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-md" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="4.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-lg" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="7" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="edge-glow" x="-20%" y="-200%" width="140%" height="500%">
        <feGaussianBlur stdDeviation="1.8" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

// ── Graph canvas ─────────────────────────────────────────────────────────────

function BrainNetworkGraph({
  data,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}: {
  data: NetworkData | null;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (node: NetworkNode) => void;
  onHover: (node: NetworkNode | null) => void;
}) {
  const [transform, setTransform] = useState({ scale: 1.14, x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const nodeMap = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);

  // Pre-compute active node IDs and their neighbors
  const activeId = selectedId ?? hoveredId;
  const activeNeighbors = useMemo(() => {
    if (!activeId || !data) return new Set<string>();
    const neighbors = new Set<string>();
    for (const link of data.links) {
      if (link.source === activeId) neighbors.add(link.target);
      if (link.target === activeId) neighbors.add(link.source);
    }
    return neighbors;
  }, [activeId, data]);

  useEffect(() => { setTransform({ scale: 1.14, x: 0, y: 0 }); }, [data]);

  const onWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    setTransform((cur) => ({
      ...cur,
      scale: Math.max(0.5, Math.min(4, cur.scale * (event.deltaY < 0 ? 1.1 : 0.9))),
    }));
  }, []);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = { x: transform.x, y: transform.y, startX: event.clientX, startY: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    setTransform((cur) => ({ ...cur, x: dragRef.current!.x + dx, y: dragRef.current!.y + dy }));
  };

  const endDrag = () => { dragRef.current = null; };

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex h-full min-h-[620px] items-center justify-center text-center">
        <div>
          <div className="text-[14px] text-[#f4f4f5]">Graph index not available</div>
          <div className="mt-2 text-[10px] text-[#6f747c]">Run Graphify/RTK index build</div>
        </div>
      </div>
    );
  }

  const colorMap = new Map(data.nodes.map((n) => [n.id, getNodeColor(n)]));
  const alwaysLabelDegree = 18;

  return (
    <svg
      viewBox="0 0 1600 1080"
      className="h-full w-full cursor-grab active:cursor-grabbing"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <SvgDefs />

      <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>

        {/* ── Dim edge layer (all non-active edges) ──────────────────────── */}
        {data.links.map((link, i) => {
          const src = nodeMap.get(link.source);
          const tgt = nodeMap.get(link.target);
          if (!src || !tgt) return null;
          const isActive = activeId && (link.source === activeId || link.target === activeId);
          if (isActive) return null;
          return (
            <line
              key={`dim-${link.source}-${link.target}-${i}`}
              x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
              stroke="rgba(255,255,255,0.055)"
              strokeWidth={0.5}
            />
          );
        })}

        {/* ── Active edge layer (glowing) ────────────────────────────────── */}
        {data.links.map((link, i) => {
          const src = nodeMap.get(link.source);
          const tgt = nodeMap.get(link.target);
          if (!src || !tgt) return null;
          const isActive = activeId && (link.source === activeId || link.target === activeId);
          if (!isActive) return null;
          const color = colorMap.get(activeId!) ?? { stroke: "#e2ca7a" };
          return (
            <line
              key={`act-${link.source}-${link.target}-${i}`}
              x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
              stroke={color.stroke}
              strokeWidth={1.1}
              strokeOpacity={0.55}
              filter="url(#edge-glow)"
            />
          );
        })}

        {/* ── Nodes ─────────────────────────────────────────────────────── */}
        {data.nodes.map((node) => {
          const color = colorMap.get(node.id)!;
          const isSelected = node.id === selectedId;
          const isHovered = node.id === hoveredId;
          const isNeighbor = activeNeighbors.has(node.id);
          const isActive = isSelected || isHovered;
          const isDimmed = activeId !== null && !isActive && !isNeighbor;
          const r = getNodeRadius(node.degree);

          const filter = isSelected
            ? "url(#glow-lg)"
            : isHovered
            ? "url(#glow-md)"
            : node.degree >= 20
            ? "url(#glow-sm)"
            : undefined;

          const fillOpacity = isDimmed ? 0.25 : 1;
          const strokeOpacity = isDimmed ? 0.18 : 1;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x} ${node.y})`}
              onClick={() => onSelect(node)}
              onMouseEnter={() => onHover(node)}
              onMouseLeave={() => onHover(null)}
              className="cursor-pointer"
              style={{ opacity: fillOpacity }}
            >
              {/* Outer ring for selected */}
              {isSelected && (
                <circle
                  r={r + 5}
                  fill="transparent"
                  stroke={color.stroke}
                  strokeWidth={1}
                  strokeOpacity={0.35}
                  filter="url(#glow-md)"
                />
              )}
              {/* Core node */}
              <circle
                r={r}
                fill={color.fill}
                stroke={color.stroke}
                strokeWidth={isActive ? 1.2 : 0.75}
                strokeOpacity={strokeOpacity}
                filter={filter}
              />
              {/* Always-visible label for high-degree nodes */}
              {node.degree >= alwaysLabelDegree && !isActive && (
                <text
                  x={r + 5}
                  y={4}
                  fill={color.label}
                  fontSize="9"
                  opacity={isDimmed ? 0.2 : 0.72}
                  style={{ fontFamily: "Montserrat, system-ui, sans-serif", pointerEvents: "none" }}
                >
                  {node.label.length > 28 ? node.label.slice(0, 26) + "…" : node.label}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Hover / selected tooltip ──────────────────────────────────── */}
        {(hoveredId ?? selectedId) && (() => {
          const node = nodeMap.get(hoveredId ?? selectedId ?? "");
          if (!node) return null;
          const color = colorMap.get(node.id)!;
          const r = getNodeRadius(node.degree);
          const labelText = node.label.length > 36 ? node.label.slice(0, 34) + "…" : node.label;
          const subText = `${node.fileType ?? "?"} · ${node.degree} Verbindungen`;
          const boxW = Math.max(130, Math.max(labelText.length, subText.length) * 6.4 + 20);
          const boxX = node.x + r + 10;
          const boxY = node.y - 18;

          return (
            <g key="tooltip" style={{ pointerEvents: "none" }}>
              <rect
                x={boxX - 6} y={boxY - 2}
                rx={5} ry={5}
                width={boxW} height={36}
                fill="rgba(7,8,10,0.92)"
                stroke={color.stroke}
                strokeWidth={0.7}
                strokeOpacity={0.5}
              />
              <text x={boxX + 2} y={boxY + 12} fill={color.label} fontSize="11" fontWeight="600"
                style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
                {labelText}
              </text>
              <text x={boxX + 2} y={boxY + 25} fill="rgba(160,168,178,0.85)" fontSize="9"
                style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
                {subText}
              </text>
            </g>
          );
        })()}

      </g>
    </svg>
  );
}

// ── Node detail side panel ───────────────────────────────────────────────────

function NodeDetailPanel({ node, onClose }: { node: NetworkNode; onClose: () => void }) {
  const color = getNodeColor(node);
  const cluster = CLUSTER_LEGEND.find((c) => c.category === color.category);
  const filePath = node.sourceFile ?? "—";
  const shortPath = filePath.length > 60 ? "…" + filePath.slice(-58) : filePath;

  return (
    <div
      className="absolute right-0 top-0 z-30 flex h-full w-[260px] flex-col border-l border-white/[0.06] bg-[#0b0c10]/95 backdrop-blur-sm"
      style={{ boxShadow: "-8px 0 32px rgba(0,0,0,0.55)" }}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">Node Info</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[#6b7280] transition hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 text-[11px]">
        {/* Color dot + label */}
        <div className="mb-4 flex items-start gap-2">
          <span
            className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: color.stroke, boxShadow: `0 0 6px ${color.stroke}` }}
          />
          <span className="break-all leading-4 text-[#f4f5f7] font-medium">{node.label}</span>
        </div>

        <Row label="Kategorie" value={cluster?.label ?? color.category} valueColor={color.label} />
        <Row label="Quelle" value={node.source === "brain" ? "Capitalife Brain" : "Dashboard"} />
        <Row label="Typ" value={node.fileType ?? "—"} />
        <Row label="Verbindungen" value={String(node.degree)} valueColor="#e2ca7a" />
        {node.community !== null && <Row label="Community" value={`#${node.community}`} />}

        <div className="mt-4 border-t border-white/[0.05] pt-3">
          <div className="mb-1 text-[9px] uppercase tracking-[0.15em] text-[#6b7280]">Pfad</div>
          <div className="break-all text-[9px] leading-4 text-[#8b9098]">{shortPath}</div>
        </div>

        {node.sourceLocation && (
          <div className="mt-3">
            <div className="mb-1 text-[9px] uppercase tracking-[0.15em] text-[#6b7280]">Symbol</div>
            <div className="break-all text-[9px] leading-4 text-[#8b9098]">{node.sourceLocation}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[#6b7280]">{label}</span>
      <span className="text-right" style={{ color: valueColor ?? "#c8cdd4" }}>{value}</span>
    </div>
  );
}

// ── Cluster legend ───────────────────────────────────────────────────────────

function ClusterLegend({ hasPanel }: { hasPanel: boolean }) {
  return (
    <div
      className="pointer-events-none absolute z-20 flex flex-col gap-1.5"
      style={{ bottom: 48, right: hasPanel ? 276 : 16 }}
    >
      {CLUSTER_LEGEND.map((item) => (
        <div key={item.category} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ background: item.stroke, boxShadow: `0 0 5px ${item.stroke}60` }}
          />
          <span className="text-[9px] text-[#6b7280]">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Status strip ─────────────────────────────────────────────────────────────

function BrainLatestMiniText({ status }: { status: StatusData | null }) {
  const latestItems = (status?.changes ?? [])
    .filter((item) => item.title.toLowerCase() !== "context pack available")
    .slice(0, 4);

  return (
    <div className="pointer-events-none absolute bottom-6 left-5 z-20 text-[10px] leading-5 text-[#8b9098]">
      <div className="text-[#c9ced4]">Updated {shortDateTime(status?.lastUpdated ?? null)}</div>
      {latestItems.map((item, index) => (
        <div key={`${item.title}-${index}`}>
          <span className="mr-2 text-[#d6bd68]">{shortDate(item.updatedAt)}</span>
          <span>{item.title}</span>
        </div>
      ))}
      <div className="pt-1 text-[#6f747c]">Graphify ist Index · Brain bleibt Source of Truth</div>
    </div>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

export function BrainGraphShell() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);

  useEffect(() => {
    fetch("/api/brain-graph/status")
      .then((r) => r.json())
      .then((d: StatusData) => setStatus(d))
      .catch(() => null);
    fetch("/api/brain-graph/network")
      .then((r) => r.json())
      .then((d: NetworkData) => setNetwork(d))
      .catch(() => null);
  }, []);

  const handleSelect = (node: NetworkNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  };

  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#07080a]">
        <Sidebar />
        <main className="relative min-h-0 flex-1 overflow-hidden bg-[#07080a]">
          {/* Graph canvas */}
          <div
            className="absolute inset-0"
            style={{ right: selectedNode ? 260 : 0, transition: "right 0.2s ease" }}
          >
            <BrainNetworkGraph
              data={network}
              selectedId={selectedNode?.id ?? null}
              hoveredId={hoveredNode?.id ?? null}
              onSelect={handleSelect}
              onHover={setHoveredNode}
            />
          </div>

          {/* Status strip */}
          <BrainLatestMiniText status={status} />

          {/* Cluster legend */}
          <ClusterLegend hasPanel={!!selectedNode} />

          {/* Node detail panel */}
          {selectedNode && (
            <NodeDetailPanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </main>
      </div>
    </HomeDashboardProvider>
  );
}
