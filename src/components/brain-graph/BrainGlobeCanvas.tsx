"use client";

// The rotating node-sphere canvas from the Brain page, extracted so it can be
// reused elsewhere (e.g. next to Sentinel's Aurum mark) without duplicating
// the projection/animation logic. BrainGraphShell imports this same module.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type NetworkNode = {
  id: string;
  label: string;
  folder: string;
  preview: string;
  degree: number;
  community: number | null;
  source: "brain" | "dashboard";
  nodeType?: string;
  navActions?: Record<string, string>;
};

export type NetworkLink = { source: string; target: string };
export type NetworkData = { nodes: NetworkNode[]; links: NetworkLink[]; source?: string };

// Random uniform sphere — phi via arccos gives uniform latitude (no pole clustering)
function randomSphere(n: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = 2 * Math.PI * Math.random();
    const s = Math.sin(phi);
    pts.push([s * Math.cos(theta), Math.cos(phi), s * Math.sin(theta)]);
  }
  return pts;
}

type CanvasProps = {
  data: NetworkData;
  spinning: boolean;
  onSelect: (n: NetworkNode | null) => void;
  selected: NetworkNode | null;
  interactive?: boolean;
  /** Scales node radii down (e.g. 0.6) without touching the /brain page default of 1. */
  dotScale?: number;
};

export function BrainGlobeCanvas({ data, spinning, onSelect, selected, interactive = true, dotScale = 1 }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef(0);
  const rafRef = useRef<number>(0);
  const projRef = useRef<{ px: number; py: number; idx: number }[]>([]);
  const [dims, setDims] = useState({ w: 1200, h: 800 });

  const spinningRef = useRef(spinning);
  const selectedRef = useRef(selected);
  const dataRef = useRef(data);
  useEffect(() => { spinningRef.current = spinning; }, [spinning]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { dataRef.current = data; }, [data]);

  const { spherePos, nodeSizeR, top5Set } = useMemo(() => {
    const n = data.nodes.length;
    const sp = randomSphere(n);

    const byDeg = data.nodes
      .map((nd, i) => ({ i, deg: nd.degree }))
      .sort((a, b) => b.deg - a.deg);

    const hubIndexes = byDeg.filter((node) => node.deg > 0).slice(0, 5).map((node) => node.i);
    const top5Set = new Set(hubIndexes);
    const hubRank = new Map(hubIndexes.map((index, rank) => [index, rank]));
    const nodeIndex = new Map(data.nodes.map((node, index) => [node.id, index]));
    const clusterMembers = new Map(hubIndexes.map((index) => [index, new Set<number>()]));

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

    const nodeSizeR = new Float32Array(n);
    byDeg.forEach(({ i }, rank) => {
      if (rank < n * 0.02) nodeSizeR[i] = 7 * dotScale;
      else if (rank < n * 0.08) nodeSizeR[i] = 4 * dotScale;
      else if (rank < n * 0.20) nodeSizeR[i] = 2 * dotScale;
      else nodeSizeR[i] = 1 * dotScale;
    });

    return { spherePos: sp, nodeSizeR, top5Set };
  }, [data, dotScale]);

  const spherePosRef = useRef(spherePos);
  const nodeSizeRRef = useRef(nodeSizeR);
  const top5Ref = useRef(top5Set);
  useEffect(() => { spherePosRef.current = spherePos; }, [spherePos]);
  useEffect(() => { nodeSizeRRef.current = nodeSizeR; }, [nodeSizeR]);
  useEffect(() => { top5Ref.current = top5Set; }, [top5Set]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

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
      const cx = canvas!.width / 2;
      const cy = canvas!.height / 2;
      const angle = angleRef.current;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const sizeR = nodeSizeRRef.current;
      const top5 = top5Ref.current;

      const projected = sp.map(([x, y, z], i) => {
        const rx = x * cosA - z * sinA;
        const rz = x * sinA + z * cosA;
        const px = cx + rx * scale;
        const py = cy - y * scale;
        const depth = rz;
        const t = (depth + 1) / 2;
        const alpha = 0.15 + 0.85 * t;
        const r = sizeR[i] ?? 1;
        const nodeAlpha = r >= 7 ? Math.min(0.97, alpha * 1.2)
          : r >= 4 ? Math.min(0.90, alpha * 1.05)
            : r >= 2 ? alpha * 0.85
              : alpha * 0.65;
        return { px, py, depth, alpha: nodeAlpha, r, idx: i };
      });

      projRef.current = projected.map(({ px, py, idx }) => ({ px, py, idx }));

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
    document.addEventListener("pointerdown", onNavIntent, true);
    document.addEventListener("mousedown", onNavIntent, true);
    document.addEventListener("click", onNavIntent, true);

    function loop(ts: number) {
      rafRef.current = requestAnimationFrame(loop);
      if (typeof document !== "undefined" && document.hidden) return;
      if (ts < pausedUntil) return;
      if (ts - lastFrame < FRAME_MS) return;
      lastFrame = ts;

      const spinning = spinningRef.current;
      if (spinning) angleRef.current += 0.0008;

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
    if (!interactive) return;
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
  }, [onSelect, interactive]);

  return (
    <div
      ref={containerRef}
      className="brain-stage absolute inset-0"
      onClick={onClick}
      style={{ cursor: interactive ? "crosshair" : "default", pointerEvents: interactive ? "auto" : "none" }}
    >
      <canvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        className="brain-canvas block pointer-events-none"
      />
    </div>
  );
}

export async function brainGraphFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as T | { error?: string; message?: string } | null;
  if (!response.ok) {
    throw new Error((body as { error?: string; message?: string } | null)?.error ?? `HTTP_${response.status}`);
  }
  return body as T;
}
