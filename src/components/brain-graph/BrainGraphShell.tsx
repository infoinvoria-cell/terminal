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

function shortDateTime(value: string | null) {
  if (!value) return "--.-- ----";
  try {
    return new Date(value).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function shortDate(value: string | null) {
  if (!value) return "--.--";
  try {
    return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  } catch {
    return value;
  }
}

function graphNodeTone(node: NetworkNode) {
  const file = (node.sourceFile ?? "").toLowerCase();
  const label = node.label.toLowerCase();
  if (file.includes("ai_project_brain_current") || label.includes("source of truth")) {
    return { fill: "#f6edd4", stroke: "#e1c873", text: "#fffaf0" };
  }
  if (
    file.includes("strategy") ||
    file.includes("portfolio") ||
    file.includes("graphify") ||
    label.includes("strategy") ||
    label.includes("portfolio") ||
    label.includes("graphify") ||
    label.includes("sentinel") ||
    label.includes("signal") ||
    label.includes("monitoring")
  ) {
    return { fill: "rgba(214,189,104,0.18)", stroke: "rgba(214,189,104,0.88)", text: "#f6ebbe" };
  }
  if (node.degree >= 20) {
    return { fill: "rgba(244,245,247,0.20)", stroke: "rgba(244,245,247,0.56)", text: "#f4f5f7" };
  }
  if (node.degree >= 8) {
    return { fill: "rgba(201,205,210,0.14)", stroke: "rgba(211,215,220,0.34)", text: "#dfe3e8" };
  }
  if (node.source === "brain") {
    return { fill: "rgba(234,236,239,0.12)", stroke: "rgba(232,235,239,0.22)", text: "#ebeef2" };
  }
  return { fill: "rgba(120,124,130,0.10)", stroke: "rgba(158,163,169,0.22)", text: "#d0d4d8" };
}

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
  const nodeMap = useMemo(() => new Map((data?.nodes ?? []).map((node) => [node.id, node])), [data]);

  useEffect(() => {
    setTransform({ scale: 1.14, x: 0, y: 0 });
  }, [data]);

  const onWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    setTransform((current) => ({
      ...current,
      scale: Math.max(0.82, Math.min(2.8, current.scale + (event.deltaY < 0 ? 0.08 : -0.08))),
    }));
  }, []);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = {
      x: transform.x,
      y: transform.y,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    setTransform((current) => ({ ...current, x: dragRef.current!.x + dx, y: dragRef.current!.y + dy }));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

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
      <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
        {data.links.map((link, index) => {
          const source = nodeMap.get(link.source);
          const target = nodeMap.get(link.target);
          if (!source || !target) return null;
          const active = selectedId && (link.source === selectedId || link.target === selectedId);
          return (
            <line
              key={`${link.source}-${link.target}-${index}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={active ? "rgba(225,200,115,0.26)" : "rgba(255,255,255,0.09)"}
              strokeWidth={active ? 1.0 : 0.62}
            />
          );
        })}
        {data.nodes.map((node) => {
          const tone = graphNodeTone(node);
          const selected = node.id === selectedId;
          const hovered = node.id === hoveredId;
          const active = selected || hovered;
          const radius = node.degree >= 20 ? 7.8 : node.degree >= 8 ? 4.8 : 2.4;
          return (
            <g
              key={node.id}
              transform={`translate(${node.x} ${node.y})`}
              onClick={() => onSelect(node)}
              onMouseEnter={() => onHover(node)}
              onMouseLeave={() => onHover(null)}
              className="cursor-pointer"
            >
              <circle
                r={radius + (active ? 3.2 : 0)}
                fill={active ? "rgba(214,189,104,0.09)" : "transparent"}
                stroke={active ? "#e2ca7a" : "transparent"}
                strokeWidth={active ? 1.2 : 0}
              />
              <circle r={radius} fill={tone.fill} stroke={tone.stroke} strokeWidth={active ? 1.05 : 0.82} />
              {active ? (
                <g transform={`translate(${radius + 8} -4)`}>
                  <rect
                    x={-5}
                    y={-12}
                    rx={4}
                    width={Math.max(104, node.label.length * 6.6)}
                    height={30}
                    fill="rgba(10,11,14,0.90)"
                    stroke="rgba(255,255,255,0.08)"
                  />
                  <text x={4} y={0} fill={tone.text} fontSize="11" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
                    {node.label}
                  </text>
                  <text x={4} y={13} fill="rgba(163,168,176,0.88)" fontSize="9" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
                    {(node.fileType ?? "unknown")} · {node.degree} links
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

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

export function BrainGraphShell() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);

  useEffect(() => {
    fetch("/api/brain-graph/status").then((response) => response.json()).then((data: StatusData) => setStatus(data)).catch(() => null);
    fetch("/api/brain-graph/network").then((response) => response.json()).then((data: NetworkData) => setNetwork(data)).catch(() => null);
  }, []);

  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#07080a]">
        <Sidebar />
        <main className="relative min-h-0 flex-1 overflow-hidden bg-[#07080a]">
          <div className="absolute inset-0">
            <BrainNetworkGraph
              data={network}
              selectedId={selectedNode?.id ?? null}
              hoveredId={hoveredNode?.id ?? null}
              onSelect={setSelectedNode}
              onHover={setHoveredNode}
            />
          </div>
          <BrainLatestMiniText status={status} />
        </main>
      </div>
    </HomeDashboardProvider>
  );
}
