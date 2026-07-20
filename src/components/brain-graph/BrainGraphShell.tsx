"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { HeaderDivider } from "@/components/dashboard/header-divider";

// ── Types ─────────────────────────────────────────────────────────────────────

type NetworkNode = {
  id: string;
  label: string;
  folder: string;
  preview: string;
  degree: number;
  community: number | null;
  source: "brain" | "dashboard";
};

type NetworkLink = { source: string; target: string };
type NetworkData  = { nodes: NetworkNode[]; links: NetworkLink[]; source?: string };

type StatusData = {
  lastUpdated: string | null;
  changes: { title: string; updatedAt: string | null }[];
};

// ── Folder metadata ───────────────────────────────────────────────────────────

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

// ── Fibonacci sphere ──────────────────────────────────────────────────────────

function fibonacciSphere(n: number): [number, number, number][] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / Math.max(n - 1, 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push([Math.cos(theta) * r, y, Math.sin(theta) * r]);
  }
  return pts;
}

// ── Globe canvas ──────────────────────────────────────────────────────────────

type CanvasProps = {
  data: NetworkData;
  spinning: boolean;
  onSelect: (n: NetworkNode | null) => void;
  selected: NetworkNode | null;
};

function GlobeCanvas({ data, spinning, onSelect, selected }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const angleRef     = useRef(0);
  const rafRef       = useRef<number>(0);
  const projRef      = useRef<{ px: number; py: number; idx: number }[]>([]);
  const [dims, setDims] = useState({ w: 1200, h: 800 });

  // Refs that the RAF loop reads so it never needs to restart
  const spinningRef = useRef(spinning);
  const selectedRef = useRef(selected);
  const dataRef     = useRef(data);
  useEffect(() => { spinningRef.current = spinning; }, [spinning]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { dataRef.current = data; }, [data]);

  // Pre-compute sphere positions, link pairs, and per-node size jitter — only when data changes
  const { spherePos, linkPairs, sizeJitter } = useMemo(() => {
    const raw = fibonacciSphere(data.nodes.length);

    // Map high-degree nodes → equatorial positions, isolates → poles
    // Sort positions by |y| ascending (|y|≈0 = equator, |y|≈1 = pole)
    const sortedPos = [...raw].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
    // Sort node indices by degree descending
    const byDeg = data.nodes
      .map((nd, i) => ({ i, deg: nd.degree }))
      .sort((a, b) => b.deg - a.deg);
    // Assign: highest-degree node → most equatorial position
    const sp: [number, number, number][] = new Array(data.nodes.length);
    for (let k = 0; k < byDeg.length; k++) sp[byDeg[k].i] = sortedPos[k];

    const idxMap = new Map(data.nodes.map((nd, i) => [nd.id, i]));
    const lp: [number, number][] = [];
    for (const l of data.links) {
      const si = idxMap.get(l.source);
      const ti = idxMap.get(l.target);
      if (si != null && ti != null) lp.push([si, ti]);
    }
    // 15% of nodes get a random size boost (pre-computed to avoid per-frame flicker)
    const jitter = new Float32Array(data.nodes.length);
    for (let i = 0; i < jitter.length; i++) {
      jitter[i] = Math.random() < 0.15 ? 1.5 + Math.random() * 2 : 1;
    }
    return { spherePos: sp, linkPairs: lp, sizeJitter: jitter };
  }, [data]);

  const spherePosRef  = useRef(spherePos);
  const linkPairsRef  = useRef(linkPairs);
  const sizeJitterRef = useRef(sizeJitter);
  useEffect(() => { spherePosRef.current  = spherePos;  }, [spherePos]);
  useEffect(() => { linkPairsRef.current  = linkPairs;  }, [linkPairs]);
  useEffect(() => { sizeJitterRef.current = sizeJitter; }, [sizeJitter]);

  // Resize observer — drives canvas width/height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Single RAF loop — started once, reads everything via refs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      if (!ctx) return;
      const w = canvas!.width;
      const h = canvas!.height;
      const d = dataRef.current;
      const sp = spherePosRef.current;
      const lp = linkPairsRef.current;
      const sel = selectedRef.current;

      ctx.clearRect(0, 0, w, h);

      const scale = Math.min(w, h) * 0.38;
      const cx = canvas!.width  / 2;
      const cy = canvas!.height / 2;
      const angle = angleRef.current;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const jitter = sizeJitterRef.current;

      // Project nodes to 2D (rotateY around vertical axis)
      const projected = sp.map(([x, y, z], i) => {
        const rx = x * cosA - z * sinA;
        const rz = x * sinA + z * cosA;
        const px = cx + rx * scale;
        const py = cy - y * scale; // y-up in sphere → y-down in canvas
        const depth = rz; // -1 back → 1 front
        const t = (depth + 1) / 2; // 0–1
        const alpha = 0.15 + 0.85 * t;
        const deg = d.nodes[i]?.degree ?? 0;
        // Base size tiers by degree; 15% get a random jitter multiplier (pre-computed)
        const baseR = deg === 0 ? 1 : deg < 3 ? 1 : deg < 8 ? 2 : deg < 25 ? 3.5 : 5;
        const r = baseR * (jitter[i] ?? 1);
        // Bright highlights for high-degree cluster nodes
        const nodeAlpha = deg >= 25 ? Math.min(0.95, alpha * 1.1)
                        : deg >= 8  ? Math.min(0.85, alpha * 0.95)
                        : deg >= 3  ? alpha * 0.75
                        :             alpha * 0.45;
        return { px, py, depth, alpha: nodeAlpha, r, deg, idx: i };
      });

      // Store for hit testing
      projRef.current = projected.map(({ px, py, idx }) => ({ px, py, idx }));

      // Draw links — only between nodes with degree > 2 to reduce noise
      ctx.beginPath();
      ctx.lineWidth = 0.4;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      for (const [si, ti] of lp) {
        const s = projected[si];
        const t = projected[ti];
        if (!s || !t) continue;
        if ((d.nodes[si]?.degree ?? 0) <= 2 || (d.nodes[ti]?.degree ?? 0) <= 2) continue;
        ctx.moveTo(s.px, s.py);
        ctx.lineTo(t.px, t.py);
      }
      ctx.stroke();

      // Draw nodes back → front for depth illusion
      const sorted = [...projected].sort((a, b) => a.depth - b.depth);
      for (const { px, py, alpha, r, deg, idx } of sorted) {
        const isSelected = d.nodes[idx]?.id === sel?.id;
        ctx.beginPath();
        ctx.arc(px, py, isSelected ? r + 2 : r, 0, Math.PI * 2);
        if (isSelected) {
          ctx.fillStyle = "#e2ca7a";
        } else if (deg >= 25) {
          // Bright highlight cluster nodes
          ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, alpha).toFixed(2)})`;
        } else {
          const v = Math.floor(80 + 175 * alpha);
          ctx.fillStyle = `rgba(${v},${v},${v},${alpha.toFixed(2)})`;
        }
        ctx.fill();
      }
    }

    function loop() {
      if (spinningRef.current) angleRef.current += 0.0008;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let nearest: { dist: number; idx: number } | null = null;
    for (const { px, py, idx } of projRef.current) {
      const dist = Math.hypot(px - mx, py - my);
      if (dist < 12 && (!nearest || dist < nearest.dist)) nearest = { dist, idx };
    }
    if (nearest) {
      const node = dataRef.current.nodes[nearest.idx];
      onSelect(selectedRef.current?.id === node.id ? null : node);
    } else {
      onSelect(null);
    }
  }, [onSelect]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        onClick={onClick}
        style={{ display: "block", cursor: "crosshair" }}
      />
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

function StatusStrip({ status, nodeCount, linkCount, dataSource }: {
  status: StatusData | null; nodeCount: number; linkCount: number; dataSource?: string;
}) {
  const date = status?.lastUpdated
    ? new Date(status.lastUpdated).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "--";
  const sourceLabel = dataSource === "obsidian-api" ? "obsidian" : dataSource === "filesystem" ? "fs" : null;
  return (
    <div className="pointer-events-none absolute bottom-4 left-5 z-20 flex items-center gap-2 text-sm text-[#6b7280]">
      <span>{nodeCount} Nodes · {linkCount} Links · {date}</span>
      {sourceLabel && (
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${dataSource === "obsidian-api" ? "bg-[#7c3aed]/20 text-[#a78bfa]" : "bg-white/[0.04] text-[#555]"}`}>
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
  const [spinning, setSpinning] = useState(true);

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
                <GlobeCanvas
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
