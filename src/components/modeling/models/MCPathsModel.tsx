"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MonteCarloResult } from "@/lib/modeling/types";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  result: MonteCarloResult | null;
  progress: number;
};

export function MCPathsModel({ result, progress }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { bestIdx, worstIdx } = useMemo(() => {
    if (!result?.paths.length) return { bestIdx: -1, worstIdx: -1 };
    const paths = result.paths;
    const horizon = result.params.horizon;
    let bi = 0, wi = 0;
    for (let i = 1; i < paths.length; i++) {
      const v = paths[i]![horizon] ?? paths[i]![paths[i]!.length - 1] ?? 100;
      const vb = paths[bi]![horizon] ?? paths[bi]![paths[bi]!.length - 1] ?? 100;
      const vw = paths[wi]![horizon] ?? paths[wi]![paths[wi]!.length - 1] ?? 100;
      if (v > vb) bi = i;
      if (v < vw) wi = i;
    }
    return { bestIdx: bi, worstIdx: wi };
  }, [result]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !result?.paths.length) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = container.clientWidth;
    const H = container.clientHeight;
    if (W < 10 || H < 10) return;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pad = { top: 10, right: 10, bottom: 26, left: 40 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    const { paths, percentiles, actualPath } = result;
    const horizon = result.params.horizon;
    const visibleT = Math.max(2, Math.ceil((horizon + 1) * progress));

    // Y domain: include best and worst paths entirely — no clipping
    const bestPath = paths[bestIdx] ?? [];
    const worstPath = paths[worstIdx] ?? [];
    const allHighs = [percentiles.p90[horizon] ?? 200, bestPath[horizon] ?? 200, bestPath.reduce((m, v) => Math.max(m, v), 0)];
    const allLows = [percentiles.p10[horizon] ?? 50, worstPath[horizon] ?? 50, worstPath.reduce((m, v) => Math.min(m, v), Infinity)];
    const rawMax = Math.max(...allHighs);
    const rawMin = Math.max(0, Math.min(...allLows));
    const yMax = rawMax * 1.08;
    const yMin = Math.max(0, rawMin * 0.90);

    function xScale(t: number) { return pad.left + (t / horizon) * cw; }
    function yScale(v: number) {
      if (yMax <= yMin) return pad.top + ch / 2;
      return pad.top + ch - ((v - yMin) / (yMax - yMin)) * ch;
    }

    // Clear
    ctx.clearRect(0, 0, W, H);

    // ── ALL background paths (one batch stroke call for all 10k) ──────────
    ctx.beginPath();
    ctx.strokeStyle = "rgba(185,200,218,0.016)";
    ctx.lineWidth = 0.5;
    for (let si = 0; si < paths.length; si++) {
      if (si === bestIdx || si === worstIdx) continue;
      const path = paths[si]!;
      ctx.moveTo(xScale(0), yScale(path[0] ?? 100));
      const end = Math.min(visibleT, path.length);
      for (let t = 1; t < end; t++) {
        ctx.lineTo(xScale(t), yScale(path[t] ?? 100));
      }
    }
    ctx.stroke();

    // ── P10–P90 outer band ─────────────────────────────────────────────────
    const bandEnd = Math.min(visibleT, horizon + 1);
    ctx.beginPath();
    ctx.fillStyle = MC_COLORS.mc.bandOuter0;
    ctx.moveTo(xScale(0), yScale(percentiles.p90[0] ?? 100));
    for (let t = 1; t < bandEnd; t++) ctx.lineTo(xScale(t), yScale(percentiles.p90[t] ?? 100));
    for (let t = bandEnd - 1; t >= 0; t--) ctx.lineTo(xScale(t), yScale(percentiles.p10[t] ?? 100));
    ctx.closePath();
    ctx.fill();

    // ── P25–P75 inner band ─────────────────────────────────────────────────
    ctx.beginPath();
    ctx.fillStyle = MC_COLORS.mc.bandInner0;
    ctx.moveTo(xScale(0), yScale(percentiles.p75[0] ?? 100));
    for (let t = 1; t < bandEnd; t++) ctx.lineTo(xScale(t), yScale(percentiles.p75[t] ?? 100));
    for (let t = bandEnd - 1; t >= 0; t--) ctx.lineTo(xScale(t), yScale(percentiles.p25[t] ?? 100));
    ctx.closePath();
    ctx.fill();

    // ── Worst path — GOLD ─────────────────────────────────────────────────
    if (worstIdx >= 0) {
      const wp = paths[worstIdx]!;
      ctx.beginPath();
      ctx.strokeStyle = MC_COLORS.mc.worstLine;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([]);
      ctx.moveTo(xScale(0), yScale(wp[0] ?? 100));
      for (let t = 1; t < Math.min(visibleT, wp.length); t++) ctx.lineTo(xScale(t), yScale(wp[t] ?? 100));
      ctx.stroke();
    }

    // ── Median ─────────────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.strokeStyle = MC_COLORS.mc.medianLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.moveTo(xScale(0), yScale(percentiles.p50[0] ?? 100));
    for (let t = 1; t < bandEnd; t++) ctx.lineTo(xScale(t), yScale(percentiles.p50[t] ?? 100));
    ctx.stroke();

    // ── Best path — WHITE ─────────────────────────────────────────────────
    if (bestIdx >= 0) {
      const bp = paths[bestIdx]!;
      ctx.beginPath();
      ctx.strokeStyle = MC_COLORS.mc.bestLine;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([]);
      ctx.moveTo(xScale(0), yScale(bp[0] ?? 100));
      for (let t = 1; t < Math.min(visibleT, bp.length); t++) ctx.lineTo(xScale(t), yScale(bp[t] ?? 100));
      ctx.stroke();
    }

    // ── Actual path — dashed ────────────────────────────────────────────────
    if (actualPath.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(185,200,218,0.55)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.moveTo(xScale(0), yScale(actualPath[0] ?? 100));
      for (let t = 1; t < Math.min(visibleT, actualPath.length); t++) ctx.lineTo(xScale(t), yScale(actualPath[t] ?? 100));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Baseline 100 ───────────────────────────────────────────────────────
    if (100 >= yMin && 100 <= yMax) {
      ctx.beginPath();
      ctx.strokeStyle = MC_COLORS.axis.zero;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 4]);
      ctx.moveTo(pad.left, yScale(100));
      ctx.lineTo(W - pad.right, yScale(100));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── X axis ticks ────────────────────────────────────────────────────────
    ctx.fillStyle = MC_COLORS.axis.tick;
    ctx.font = `9px ${FONT_NUM}`;
    ctx.textAlign = "center";
    const tickCount = Math.min(7, horizon);
    for (let i = 0; i <= tickCount; i++) {
      const t = Math.round((i / tickCount) * horizon);
      ctx.fillText(`M${t}`, xScale(t), H - 8);
    }

    // ── Y axis ticks ────────────────────────────────────────────────────────
    ctx.textAlign = "right";
    ctx.font = `9px ${FONT_NUM}`;
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = yMin + ((yMax - yMin) * i) / yTicks;
      ctx.fillText(`${v.toFixed(0)}`, pad.left - 5, yScale(v) + 3);
    }

  }, [result, progress, bestIdx, worstIdx]);

  if (!result || !result.params.returns.length) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MC_COLORS.textMuted, fontSize: 11, fontFamily: FONT_LABEL }}>
        DATA UNAVAILABLE
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Inline legend */}
      <div style={{ position: "absolute", top: 2, right: 6, display: "flex", gap: 10, alignItems: "center", zIndex: 1, pointerEvents: "none" }}>
        {[
          { color: MC_COLORS.mc.bestLine, label: "BEST" },
          { color: MC_COLORS.mc.medianLine, label: "MED" },
          { color: MC_COLORS.mc.worstLine, label: "WORST" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 10, height: 1.5, background: color, borderRadius: 1 }} />
            <span style={{ fontFamily: FONT_LABEL, fontSize: 7.5, color: MC_COLORS.textLabel, letterSpacing: "0.06em" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
      </div>
    </div>
  );
}
