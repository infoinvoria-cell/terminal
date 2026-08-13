"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CapitalifeStatusPanel } from "@/components/ui/CapitalifeStatusPanel";

// ── Types ─────────────────────────────────────────────────────────────────────

type NetworkNode = {
  id: string;
  label: string;
  folder: string;
  preview: string;
  degree: number;
  community: number | null;
  source: "brain" | "dashboard";
  /** Present on system (dashboard) nodes only */
  nodeType?: string;
  /** Navigation actions for system nodes: surface → URL */
  navActions?: Record<string, string>;
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

  // Keep the original globe aesthetic, but form a few real clusters around the strongest hubs.
  const { spherePos, nodeSizeR, top5Set } = useMemo(() => {
    const n = data.nodes.length;
    const sp = randomSphere(n);

    // Rank nodes by degree
    const byDeg = data.nodes
      .map((nd, i) => ({ i, deg: nd.degree }))
      .sort((a, b) => b.deg - a.deg);

    const hubIndexes = byDeg.filter((node) => node.deg > 0).slice(0, 5).map((node) => node.i);
    const top5Set = new Set(hubIndexes);
    const hubRank = new Map(hubIndexes.map((index, rank) => [index, rank]));
    const nodeIndex = new Map(data.nodes.map((node, index) => [node.id, index]));
    const clusterMembers = new Map(hubIndexes.map((index) => [index, new Set<number>()]));

    // Direct links decide cluster membership. If two hubs share a node, the stronger hub wins.
    for (const link of data.links) {
      const source = nodeIndex.get(link.source);
      const target = nodeIndex.get(link.target);
      if (source === undefined || target === undefined) continue;
      const sourceRank = hubRank.get(source);
      const targetRank = hubRank.get(target);
      if (sourceRank !== undefined && targetRank === undefined) clusterMembers.get(source)?.add(target);
      if (targetRank !== undefined && sourceRank === undefined) clusterMembers.get(target)?.add(source);
    }

    const claimed = new Set<number>();
    const anchors: [number, number, number][] = [
      [0.00, 0.10, 0.99],
      [0.72, 0.42, 0.55],
      [-0.72, 0.42, 0.55],
      [0.55, -0.68, 0.48],
      [-0.55, -0.68, 0.48],
    ];
    const hash = (value: string) => {
      let result = 2166136261;
      for (let index = 0; index < value.length; index++) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
      }
      return result >>> 0;
    };
    const normalize = (point: [number, number, number]): [number, number, number] => {
      const length = Math.hypot(point[0], point[1], point[2]) || 1;
      return [point[0] / length, point[1] / length, point[2] / length];
    };

    hubIndexes.forEach((hubIndex, rank) => {
      const anchor = normalize(anchors[rank]);
      sp[hubIndex] = anchor;
      const members = [...(clusterMembers.get(hubIndex) ?? [])]
        .filter((index) => !claimed.has(index))
        .sort((a, b) => data.nodes[b].degree - data.nodes[a].degree)
        .slice(0, 120);

      // Build a local tangent plane so dots stay on the globe surface around their hub.
      const reference: [number, number, number] = Math.abs(anchor[1]) < 0.86 ? [0, 1, 0] : [1, 0, 0];
      const tangentA = normalize([
        anchor[1] * reference[2] - anchor[2] * reference[1],
        anchor[2] * reference[0] - anchor[0] * reference[2],
        anchor[0] * reference[1] - anchor[1] * reference[0],
      ]);
      const tangentB: [number, number, number] = [
        anchor[1] * tangentA[2] - anchor[2] * tangentA[1],
        anchor[2] * tangentA[0] - anchor[0] * tangentA[2],
        anchor[0] * tangentA[1] - anchor[1] * tangentA[0],
      ];

      members.forEach((memberIndex, memberRank) => {
        claimed.add(memberIndex);
        const seed = hash(`${data.nodes[hubIndex].id}:${data.nodes[memberIndex].id}`);
        const angle = ((seed % 10000) / 10000) * Math.PI * 2;
        const ring = 0.045 + Math.sqrt((memberRank + 1) / Math.max(1, members.length)) * 0.17;
        const radialJitter = ((seed >>> 12) % 1000) / 1000 * 0.025;
        const distance = ring + radialJitter;
        sp[memberIndex] = normalize([
          anchor[0] + tangentA[0] * Math.cos(angle) * distance + tangentB[0] * Math.sin(angle) * distance,
          anchor[1] + tangentA[1] * Math.cos(angle) * distance + tangentB[1] * Math.sin(angle) * distance,
          anchor[2] + tangentA[2] * Math.cos(angle) * distance + tangentB[2] * Math.sin(angle) * distance,
        ]);
      });
    });

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
                        : r >= 2  ? alpha * 0.85
                        :           alpha * 0.65;
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
          ctx.fillStyle = "#C9A84C";
        } else if (top5.has(idx)) {
          ctx.fillStyle = `rgba(255,255,255,${Math.min(0.95, alpha).toFixed(2)})`;
        } else {
          const v = Math.floor(80 + 175 * alpha);
          ctx.fillStyle = `rgba(${v},${v},${v},${alpha.toFixed(2)})`;
        }
        ctx.fill();
      }
    }

    // A continuous rAF that redraws 1000 nodes every frame saturates the main
    // thread and starves Next's low-priority route transition, so <Link>/router
    // clicks appeared to "hang" on /brain. Fix: (1) briefly pause drawing the
    // moment a nav click starts so the transition can commit, (2) cap at ~30fps,
    // (3) skip the redraw entirely when idle (not spinning, nothing changed).
    const FRAME_MS = 1000 / 30;
    let lastFrame = 0;
    let pausedUntil = 0;
    let prevSelId: string | null = null;
    let prevW = -1;
    let prevH = -1;

    const onNavIntent = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("a,button")) pausedUntil = performance.now() + 600;
    };
    // Cover every input path (mouse, pen, touch, synthetic) — capture phase so
    // the pause is armed before Next's <Link> onClick runs router.push.
    document.addEventListener("pointerdown", onNavIntent, true);
    document.addEventListener("mousedown", onNavIntent, true);
    document.addEventListener("click", onNavIntent, true);

    function loop(ts: number) {
      rafRef.current = requestAnimationFrame(loop);
      if (typeof document !== "undefined" && document.hidden) return;
      if (ts < pausedUntil) return;            // yield the thread during navigation
      if (ts - lastFrame < FRAME_MS) return;   // cap at ~30fps
      lastFrame = ts;

      const spinning = spinningRef.current;
      if (spinning) angleRef.current += 0.0008; // ~same visual speed at 30fps

      // Idle: nothing spinning and nothing changed → no redraw needed.
      const selId = selectedRef.current?.id ?? null;
      if (!spinning && selId === prevSelId && canvas!.width === prevW && canvas!.height === prevH) return;
      prevSelId = selId;
      prevW = canvas!.width;
      prevH = canvas!.height;

      draw();
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("pointerdown", onNavIntent, true);
      document.removeEventListener("mousedown", onNavIntent, true);
      document.removeEventListener("click", onNavIntent, true);
    };
  }, []);

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
    <div ref={containerRef} className="brain-stage absolute inset-0 pointer-events-auto" onClick={onClick} style={{ cursor: "crosshair" }}>
      <canvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        className="brain-canvas block pointer-events-none"
      />
    </div>
  );
}

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

async function swrFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as T | { error?: string; message?: string } | null;
  if (!response.ok) {
    throw new Error((body as { error?: string; message?: string } | null)?.error ?? `HTTP_${response.status}`);
  }
  return body as T;
}

export function BrainGraphShell() {
  const { data: status }  = useSWR<StatusData>("/api/brain-graph/status",  swrFetcher, { refreshInterval: 3_600_000 });
  const { data: network, error: networkError, isLoading: networkLoading } = useSWR<NetworkData>("/api/brain-graph/network", swrFetcher, { refreshInterval: 3_600_000 });
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
          <GlobeCanvas
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
