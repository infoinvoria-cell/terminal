"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import useSWR from "swr";
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
  vaultSizeGb?: number | null;
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

// ── Random uniform sphere ─────────────────────────────────────────────────────
// phi via arccos gives uniform latitude (no pole clustering)

function randomSphere(n: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const phi   = Math.acos(2 * Math.random() - 1);
    const theta = 2 * Math.PI * Math.random();
    const s = Math.sin(phi);
    pts.push([s * Math.cos(theta), Math.cos(phi), s * Math.sin(theta)]);
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

  // Random uniform sphere + hub clustering + percentile-based dot sizes
  const { spherePos, nodeSizeR, top5Set } = useMemo(() => {
    const n = data.nodes.length;
    const sp = randomSphere(n);

    // Rank nodes by degree
    const byDeg = data.nodes
      .map((nd, i) => ({ i, deg: nd.degree }))
      .sort((a, b) => b.deg - a.deg);

    const top5Set = new Set(byDeg.slice(0, 5).map((x) => x.i));

    // Hub clustering: nodes with degree > 5 get nudged 20-40% toward nearest hub (within 15°)
    const hubArr = byDeg.filter((x) => x.deg > 5).map((x) => x.i);
    const COS15 = Math.cos(Math.PI / 12);
    for (const hi of hubArr) {
      const [hx, hy, hz] = sp[hi];
      let bestDot = -Infinity;
      let bestJ = -1;
      for (const hj of hubArr) {
        if (hj === hi) continue;
        const [jx, jy, jz] = sp[hj];
        const dot = hx * jx + hy * jy + hz * jz;
        if (dot > bestDot) { bestDot = dot; bestJ = hj; }
      }
      if (bestJ >= 0 && bestDot < COS15) {
        const t = 0.2 + Math.random() * 0.2;
        const [jx, jy, jz] = sp[bestJ];
        const nx = hx + (jx - hx) * t;
        const ny = hy + (jy - hy) * t;
        const nz = hz + (jz - hz) * t;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        sp[hi] = [nx / len, ny / len, nz / len];
      }
    }

    // Percentile sizes: top 2% → 7px, top 8% → 4px, top 20% → 2px, rest → 1px
    const nodeSizeR = new Float32Array(n);
    byDeg.forEach(({ i }, rank) => {
      if (rank < n * 0.02)      nodeSizeR[i] = 7;
      else if (rank < n * 0.08) nodeSizeR[i] = 4;
      else if (rank < n * 0.20) nodeSizeR[i] = 2;
      else                      nodeSizeR[i] = 1;
    });

    return { spherePos: sp, nodeSizeR, top5Set };
  }, [data]);

  const spherePosRef  = useRef(spherePos);
  const nodeSizeRRef  = useRef(nodeSizeR);
  const top5Ref       = useRef(top5Set);
  useEffect(() => { spherePosRef.current  = spherePos;  }, [spherePos]);
  useEffect(() => { nodeSizeRRef.current  = nodeSizeR;  }, [nodeSizeR]);
  useEffect(() => { top5Ref.current       = top5Set;    }, [top5Set]);

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
      const sel = selectedRef.current;

      ctx.clearRect(0, 0, w, h);

      const scale = Math.min(w, h) * 0.38;
      const cx = canvas!.width  / 2;
      const cy = canvas!.height / 2;
      const angle = angleRef.current;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const sizeR = nodeSizeRRef.current;
      const top5  = top5Ref.current;

      // Project nodes to 2D (rotateY around vertical axis)
      const projected = sp.map(([x, y, z], i) => {
        const rx = x * cosA - z * sinA;
        const rz = x * sinA + z * cosA;
        const px = cx + rx * scale;
        const py = cy - y * scale;
        const depth = rz;
        const t = (depth + 1) / 2;
        const alpha = 0.15 + 0.85 * t;
        const r = sizeR[i] ?? 1;
        const nodeAlpha = r >= 7  ? Math.min(0.97, alpha * 1.2)
                        : r >= 4  ? Math.min(0.90, alpha * 1.05)
                        : r >= 2  ? alpha * 0.80
                        :           alpha * 0.38;
        return { px, py, depth, alpha: nodeAlpha, r, idx: i };
      });

      // Store for hit testing
      projRef.current = projected.map(({ px, py, idx }) => ({ px, py, idx }));

      // Draw nodes back → front for depth illusion
      const sorted = [...projected].sort((a, b) => a.depth - b.depth);
      for (const { px, py, alpha, r, idx } of sorted) {
        const isSelected = d.nodes[idx]?.id === sel?.id;
        ctx.beginPath();
        ctx.arc(px, py, isSelected ? r + 2 : r, 0, Math.PI * 2);
        if (isSelected) {
          ctx.fillStyle = "#e2ca7a";
        } else if (top5.has(idx)) {
          ctx.fillStyle = `rgba(255,255,255,${Math.min(0.95, alpha).toFixed(2)})`;
        } else {
          const v = Math.floor(80 + 175 * alpha);
          ctx.fillStyle = `rgba(${v},${v},${v},${alpha.toFixed(2)})`;
        }
        ctx.fill();
      }
    }

    function loop() {
      if (spinningRef.current) angleRef.current += 0.0004;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
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
    <div ref={containerRef} className="absolute inset-0" onClick={onClick} style={{ cursor: "crosshair" }}>
      <canvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        style={{ display: "block", pointerEvents: "none" }}
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

const DOT = <span className="text-[#3a3f48] select-none mx-0.5">•</span>;

function StatusStrip({ status, nodeCount, linkCount, dataSource }: {
  status: StatusData | null; nodeCount: number; linkCount: number; dataSource?: string;
}) {
  const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const isObsidian = dataSource === "obsidian-api";
  const isFs = dataSource === "filesystem";
  const brainActive = isObsidian || isFs;
  const gbStr = status?.vaultSizeGb != null ? `${status.vaultSizeGb} GB` : null;
  const sourceLabel = isObsidian ? "obsidian" : isFs ? "fs" : null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-5 z-20 flex items-center text-sm text-[#6b7280]">
      <span>{nodeCount} Nodes</span>
      {DOT}
      <span>{linkCount} Links</span>
      {gbStr && <>{DOT}<span>{gbStr}</span></>}
      {DOT}
      <span>{today}</span>
      {brainActive && (
        <>
          {DOT}
          <span className={isObsidian ? "text-white/70" : "text-[#6b7280]"}>
            {isObsidian ? "✓" : "○"} Capitalife Brain Active
          </span>
        </>
      )}
      {sourceLabel && (
        <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${isObsidian ? "bg-[#7c3aed]/20 text-[#a78bfa]" : "bg-white/[0.04] text-[#555]"}`}>
          {sourceLabel}
        </span>
      )}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

const swrFetcher = (url: string) => fetch(url).then((r) => r.json());

export function BrainGraphShell() {
  const { data: status }  = useSWR<StatusData>("/api/brain-graph/status",  swrFetcher, { refreshInterval: 3_600_000 });
  const { data: network } = useSWR<NetworkData>("/api/brain-graph/network", swrFetcher, { refreshInterval: 3_600_000 });
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  const [spinning, setSpinning] = useState(true);

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
            <StatusStrip status={status ?? null} nodeCount={nodeCount} linkCount={linkCount} dataSource={network?.source} />
            {network && network.nodes.length > 0 && (
              <PlayButton spinning={spinning} onToggle={() => setSpinning((s) => !s)} />
            )}
          </main>
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
