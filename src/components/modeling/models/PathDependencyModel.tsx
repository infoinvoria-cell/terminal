"use client";

import { useMemo } from "react";
import type { TradeRecord } from "@/lib/modeling/types";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  trades: TradeRecord[];
  progress?: number;
};

const W = 440, H = 280;
const PAD = { top: 28, right: 20, bottom: 28, left: 60 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const PATHS = 500;

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0xffffffff);
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function PathDependencyModel({ trades, progress = 1 }: Props) {
  const { paths, quantiles, canonical } = useMemo(() => {
    if (trades.length < 4) return { paths: [], quantiles: [], canonical: [] };
    const pnls = trades.map((t) => t.pnl);
    const n = pnls.length;

    const allPaths: number[][] = [];
    for (let p = 0; p < PATHS; p++) {
      const rng = lcg(p * 6571 + 9001);
      const shuffled = shuffle(pnls, rng);
      let cum = 0;
      allPaths.push(shuffled.map((v) => (cum += v)));
    }

    // Canonical (original order)
    let cum = 0;
    const canonical = pnls.map((v) => (cum += v));

    // Per-step quantiles
    const quantiles = Array.from({ length: n }, (_, ti) => {
      const vals = allPaths.map((p) => p[ti]!).sort((a, b) => a - b);
      const q = (frac: number) => vals[Math.floor(frac * (vals.length - 1))]!;
      return { p10: q(0.10), p25: q(0.25), p50: q(0.50), p75: q(0.75), p90: q(0.90) };
    });

    return { paths: allPaths, quantiles, canonical };
  }, [trades]);

  const n = quantiles.length;
  if (!n) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: FONT_LABEL, fontSize: 9, color: MC_COLORS.textMuted, letterSpacing: "0.1em" }}>NEED ≥ 4 TRADES</span>
      </div>
    );
  }

  const visible = Math.max(1, Math.round(n * Math.min(progress, 1)));
  const allEnds = paths.map((p) => p[p.length - 1]!);
  const minVal = Math.min(...allEnds, ...canonical);
  const maxVal = Math.max(...allEnds, ...canonical);
  const pad = (maxVal - minVal) * 0.05 || 1;

  function px(i: number) { return PAD.left + (i / (n - 1)) * PLOT_W; }
  function py(v: number) { return PAD.top + (1 - (v - minVal + pad) / (maxVal - minVal + 2 * pad)) * PLOT_H; }

  const bandPath90 = [
    ...quantiles.slice(0, visible).map((q, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(q.p90).toFixed(1)}`),
    ...quantiles.slice(0, visible).reverse().map((q, i) => `L${px(visible - 1 - i).toFixed(1)},${py(q.p10).toFixed(1)}`),
    "Z",
  ].join(" ");
  const bandPath50 = [
    ...quantiles.slice(0, visible).map((q, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(q.p75).toFixed(1)}`),
    ...quantiles.slice(0, visible).reverse().map((q, i) => `L${px(visible - 1 - i).toFixed(1)},${py(q.p25).toFixed(1)}`),
    "Z",
  ].join(" ");
  const medianPath = quantiles.slice(0, visible)
    .map((q, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(q.p50).toFixed(1)}`).join(" ");
  const canonicalPath = canonical.slice(0, visible)
    .map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");

  // Terminal distribution mini histogram
  const finalVals = paths.map((p) => p[n - 1]!).sort((a, b) => a - b);
  const HBINS = 12;
  const hMin = finalVals[0]!;
  const hMax = finalVals[finalVals.length - 1]!;
  const hRange = hMax - hMin || 1;
  const hBins = Array.from({ length: HBINS }, (_, i) => {
    const lo = hMin + i * (hRange / HBINS);
    const hi = lo + hRange / HBINS;
    return { lo, hi, count: 0 };
  });
  for (const v of finalVals) {
    const idx = Math.min(HBINS - 1, Math.floor((v - hMin) / (hRange / HBINS)));
    if (hBins[idx]) hBins[idx]!.count++;
  }
  const maxHBin = Math.max(...hBins.map((b) => b.count), 1);
  const HBAR_H = 40;
  const HBAR_W = PLOT_W / HBINS - 1;
  const hY = PAD.top;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: "100%", maxHeight: "100%" }}>
        {/* Bands */}
        <path d={bandPath90} fill="rgba(100,140,180,0.06)" />
        <path d={bandPath50} fill="rgba(100,140,180,0.12)" />

        {/* Median */}
        <path d={medianPath} fill="none" stroke="rgba(140,165,188,0.55)" strokeWidth={1.5} />

        {/* Canonical path */}
        <path d={canonicalPath} fill="none" stroke="rgba(201,168,76,0.85)" strokeWidth={1.5} />

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_H}
          stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={PAD.left + PLOT_W} y2={PAD.top + PLOT_H}
          stroke="rgba(255,255,255,0.07)" strokeWidth={1} />

        {/* Y axis labels */}
        {[minVal, (minVal + maxVal) / 2, maxVal].map((tick, i) => (
          <text key={i} x={PAD.left - 4} y={py(tick) + 3} textAnchor="end"
            style={{ fontFamily: FONT_NUM, fontSize: 6.5, fill: "rgba(140,140,140,0.4)" }}>
            {tick.toFixed(0)}
          </text>
        ))}

        {/* Legend */}
        <line x1={PAD.left + PLOT_W - 70} y1={PAD.top + 10} x2={PAD.left + PLOT_W - 58} y2={PAD.top + 10}
          stroke="rgba(201,168,76,0.85)" strokeWidth={1.5} />
        <text x={PAD.left + PLOT_W - 55} y={PAD.top + 13}
          style={{ fontFamily: FONT_LABEL, fontSize: 6, fill: "rgba(201,168,76,0.7)" }}>ACTUAL ORDER</text>
        <line x1={PAD.left + PLOT_W - 70} y1={PAD.top + 21} x2={PAD.left + PLOT_W - 58} y2={PAD.top + 21}
          stroke="rgba(140,165,188,0.55)" strokeWidth={1.5} />
        <text x={PAD.left + PLOT_W - 55} y={PAD.top + 24}
          style={{ fontFamily: FONT_LABEL, fontSize: 6, fill: "rgba(140,165,188,0.6)" }}>MEDIAN ({PATHS} SHUFFLES)</text>

        {/* X label */}
        <text x={PAD.left + PLOT_W / 2} y={H - 4} textAnchor="middle"
          style={{ fontFamily: FONT_LABEL, fontSize: 6.5, fill: "rgba(184,184,184,0.35)", letterSpacing: "0.08em" }}>
          TRADE #
        </text>
      </svg>
    </div>
  );
}
