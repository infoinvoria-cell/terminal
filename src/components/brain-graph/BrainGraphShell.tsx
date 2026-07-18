"use client";

import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";

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

// ── Node style by degree ──────────────────────────────────────────────────────

function nodeStyle(degree: number, topThreshold: number) {
  if (degree >= topThreshold) return { r: 10,  fill: "#e2ca7a" };
  if (degree >= 4)            return { r: 6,   fill: "#f0dfa0" };
  if (degree >= 1)            return { r: 4,   fill: "#aaaaaa" };
  return                             { r: 2.5, fill: "#555555" };
}

// ── Canvas graph ──────────────────────────────────────────────────────────────

type D3Node = SimulationNodeDatum & NetworkNode;
type D3Link = SimulationLinkDatum<D3Node>;

function BrainCanvas({ data }: { data: NetworkData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef    = useRef<ReturnType<typeof forceSimulation<D3Node>> | null>(null);
  const nodesRef  = useRef<D3Node[]>([]);
  const linksRef  = useRef<D3Link[]>([]);

  // Pan/zoom state
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Hover state
  const [hoveredNode, setHoveredNode] = useState<D3Node | null>(null);
  const [selectedNode, setSelectedNode] = useState<D3Node | null>(null);
  const hoveredRef  = useRef<D3Node | null>(null);
  const selectedRef = useRef<D3Node | null>(null);

  const topThreshold = (() => {
    const ds = data.nodes.map((n) => n.degree).sort((a, b) => a - b);
    return ds[Math.floor(ds.length * 0.95)] ?? 999;
  })();

  // Init simulation — deferred to rAF so canvas has layout dimensions
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Defer past layout — setTimeout(0) fires after browser layout is committed
    timerId = setTimeout(() => {
      const parent = canvas.parentElement;
      const W = parent?.clientWidth  || 1200;
      const H = parent?.clientHeight || 800;
      canvas.width  = W;
      canvas.height = H;

      const simNodes: D3Node[] = data.nodes.map((n) => ({ ...n }));
      const idMap = new Map(simNodes.map((n) => [n.id, n]));
      const simLinks: D3Link[] = data.links
        .filter((l) => idMap.has(l.source) && idMap.has(l.target))
        .map((l) => ({ source: l.source, target: l.target }));

      nodesRef.current = simNodes;
      linksRef.current = simLinks;

      // Spread initial positions around center
      for (const n of simNodes) {
        n.x = W / 2 + (Math.random() - 0.5) * W * 0.5;
        n.y = H / 2 + (Math.random() - 0.5) * H * 0.5;
      }

      const sim = forceSimulation<D3Node>(simNodes)
        .force("charge", forceManyBody<D3Node>().strength(-2))
        .force(
          "link",
          forceLink<D3Node, D3Link>(simLinks)
            .id((d) => d.id)
            .distance(10)
            .strength(1.0),
        )
        .force("center", forceCenter(W / 2, H / 2).strength(1.0))
        .stop();

      sim.tick(300);

      // Bounding-box fit
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of simNodes) {
        if (n.x == null) continue;
        if (n.x  < minX) minX = n.x;
        if (n.x  > maxX) maxX = n.x;
        if (n.y! < minY) minY = n.y!;
        if (n.y! > maxY) maxY = n.y!;
      }
      const gw    = maxX - minX || 1;
      const gh    = maxY - minY || 1;
      const scale = Math.min((W * 0.85) / gw, (H * 0.85) / gh);
      const cx    = (minX + maxX) / 2;
      const cy    = (minY + maxY) / 2;
      viewRef.current = { scale, x: W / 2 - cx * scale, y: H / 2 - cy * scale };

      simRef.current = sim;
      draw();
    }, 0);

    return () => { clearTimeout(timerId); simRef.current?.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Draw function
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y, scale } = viewRef.current;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const hov = hoveredRef.current;
    const sel = selectedRef.current;
    const activeId = sel?.id ?? hov?.id ?? null;

    // Build neighbour set for active node
    const neighbours = new Set<string>();
    if (activeId) {
      for (const lk of linksRef.current) {
        const s = typeof lk.source === "object" ? (lk.source as D3Node).id : String(lk.source);
        const t = typeof lk.target === "object" ? (lk.target as D3Node).id : String(lk.target);
        if (s === activeId) neighbours.add(t);
        if (t === activeId) neighbours.add(s);
      }
    }

    // Draw edges
    ctx.lineWidth = 0.5;
    for (const lk of linksRef.current) {
      const s = lk.source as D3Node;
      const t = lk.target as D3Node;
      if (s.x == null || t.x == null) continue;
      const isActive = activeId && (s.id === activeId || t.id === activeId);
      ctx.globalAlpha = activeId ? (isActive ? 0.75 : 0.06) : 0.18;
      ctx.strokeStyle = isActive ? "#888888" : "#333333";
      ctx.beginPath();
      ctx.moveTo(s.x, s.y!);
      ctx.lineTo(t.x!, t.y!);
      ctx.stroke();
    }

    // Draw nodes
    ctx.globalAlpha = 1;
    for (const n of nodesRef.current) {
      if (n.x == null) continue;
      const style  = nodeStyle(n.degree, topThreshold);
      const isActive  = n.id === activeId;
      const isNeighbor = neighbours.has(n.id);
      const isDimmed   = !!activeId && !isActive && !isNeighbor;

      ctx.globalAlpha = isDimmed ? 0.12 : 1;

      // Glow for top/hovered nodes
      if (isActive || style.r >= 6) {
        ctx.shadowColor  = style.fill;
        ctx.shadowBlur   = isActive ? 12 : 6;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = style.fill;
      ctx.beginPath();
      ctx.arc(n.x, n.y!, isActive ? style.r + 2 : style.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur   = 0;
    ctx.globalAlpha  = 1;

    // Draw hover label
    if (hov?.x != null) {
      const style = nodeStyle(hov.degree, topThreshold);
      const label = hov.label.length > 40 ? hov.label.slice(0, 38) + "…" : hov.label;
      const sub   = `deg ${hov.degree}`;
      const bw    = Math.max(100, label.length * 6.5 + 20);

      ctx.fillStyle    = "rgba(7,8,12,0.92)";
      ctx.strokeStyle  = "rgba(255,255,255,0.08)";
      ctx.lineWidth    = 0.6;
      roundRect(ctx, hov.x! + style.r + 8, hov.y! - 18, bw, 34, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = style.fill;
      ctx.font      = "bold 11px Montserrat,system-ui,sans-serif";
      ctx.fillText(label, hov.x! + style.r + 15, hov.y! - 5);
      ctx.fillStyle = "#6b7280";
      ctx.font      = "9px Montserrat,system-ui,sans-serif";
      ctx.fillText(sub, hov.x! + style.r + 15, hov.y! + 9);
    }

    ctx.restore();
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // Resize: re-run sim init when container changes size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;
    const ro = new ResizeObserver(() => {
      if (!nodesRef.current.length) return;
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    });
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screen → simulation coordinates
  function toSim(cx: number, cy: number) {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const { x, y, scale } = viewRef.current;
    return {
      sx: (cx - rect.left - x) / scale,
      sy: (cy - rect.top  - y) / scale,
    };
  }

  // Find nearest node within hit radius
  function findNode(cx: number, cy: number): D3Node | null {
    const { sx, sy } = toSim(cx, cy);
    let best: D3Node | null = null;
    let bestD2 = 200; // max hit px² in sim space
    for (const n of nodesRef.current) {
      if (n.x == null) continue;
      const dx = n.x - sx, dy = n.y! - sy;
      const d2 = dx * dx + dy * dy;
      const r  = nodeStyle(n.degree, topThreshold).r + 4;
      if (d2 < r * r && d2 < bestD2) { bestD2 = d2; best = n; }
    }
    return best;
  }

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect  = canvas.getBoundingClientRect();
      const mx    = e.clientX - rect.left;
      const my    = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      const v     = viewRef.current;
      const ns    = Math.max(0.1, Math.min(10, v.scale * factor));
      viewRef.current = {
        scale: ns,
        x: mx - (mx - v.x) * (ns / v.scale),
        y: my - (my - v.y) * (ns / v.scale),
      };
      draw();
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Pan
    if (dragRef.current) {
      viewRef.current = {
        ...viewRef.current,
        x: dragRef.current.ox + e.clientX - dragRef.current.startX,
        y: dragRef.current.oy + e.clientY - dragRef.current.startY,
      };
      draw();
      return;
    }
    // Hover
    const found = findNode(e.clientX, e.clientY);
    if (found?.id !== hoveredRef.current?.id) {
      hoveredRef.current = found;
      setHoveredNode(found);
      draw();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasDrag = dragRef.current &&
      (Math.abs(e.clientX - dragRef.current.startX) > 3 || Math.abs(e.clientY - dragRef.current.startY) > 3);
    dragRef.current = null;
    if (!wasDrag) {
      const found = findNode(e.clientX, e.clientY);
      selectedRef.current = found?.id === selectedRef.current?.id ? null : found;
      setSelectedNode(selectedRef.current);
      draw();
    }
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        style={{ background: "#07080a" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { hoveredRef.current = null; setHoveredNode(null); draw(); }}
      />
      {selectedNode && (
        <NodePanel
          node={selectedNode}
          topThreshold={topThreshold}
          onClose={() => { selectedRef.current = null; setSelectedNode(null); draw(); }}
        />
      )}
    </div>
  );
}

// ── Node detail panel ─────────────────────────────────────────────────────────

function NodePanel({ node, topThreshold, onClose }: { node: D3Node; topThreshold: number; onClose: () => void }) {
  const style = nodeStyle(node.degree, topThreshold);
  return (
    <div className="absolute right-0 top-0 h-full w-[240px] border-l border-white/[0.05] bg-[#09090c]/95 backdrop-blur-sm"
         style={{ boxShadow: "-8px 0 32px rgba(0,0,0,0.6)" }}>
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#555]">Node</span>
        <button type="button" onClick={onClose} className="text-[#555] hover:text-white transition text-sm">✕</button>
      </div>
      <div className="p-4 text-[11px]">
        <div className="mb-4 flex gap-2 items-start">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full inline-block" style={{ background: style.fill }} />
          <span className="break-all font-medium text-[#e8eaed] leading-[1.5]">{node.label}</span>
        </div>
        <Row label="Quelle"      value={node.source === "brain" ? "Capitalife Brain" : "Dashboard"} />
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
      <div className="text-[#c9ced4]">Updated {status?.lastUpdated
        ? new Date(status.lastUpdated).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "--"}</div>
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
