"use client";

import { useMemo } from "react";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import { computeEfficientFrontier } from "@/lib/modeling/transforms";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  seriesMap: Record<string, AnalyticsSeriesPoint[]>;
};

const W = 440, H = 300;
const PAD = { top: 16, right: 16, bottom: 36, left: 52 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function toSvgX(vol: number, minVol: number, maxVol: number) {
  if (maxVol === minVol) return PAD.left + PLOT_W / 2;
  return PAD.left + ((vol - minVol) / (maxVol - minVol)) * PLOT_W;
}
function toSvgY(ret: number, minRet: number, maxRet: number) {
  if (maxRet === minRet) return PAD.top + PLOT_H / 2;
  return PAD.top + PLOT_H - ((ret - minRet) / (maxRet - minRet)) * PLOT_H;
}

export function EfficientFrontierModel({ seriesMap }: Props) {
  const result = useMemo(() => computeEfficientFrontier(seriesMap), [seriesMap]);

  if (!result) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: FONT_LABEL, fontSize: 9, color: MC_COLORS.textMuted, letterSpacing: "0.1em" }}>
          NEED ≥ 2 COMPONENTS WITH ≥ 12 MONTHS COMMON HISTORY
        </span>
      </div>
    );
  }

  const { sampledPortfolios, frontierPoints, minVol, maxSharpe, individualAssets, method, componentCount, observationCount } = result;

  const allVols = [
    ...sampledPortfolios.map((p) => p.vol),
    ...individualAssets.map((a) => a.vol),
    ...frontierPoints.map((p) => p.vol),
  ].filter(isFinite);
  const allRets = [
    ...sampledPortfolios.map((p) => p.ret),
    ...individualAssets.map((a) => a.ret),
    ...frontierPoints.map((p) => p.ret),
  ].filter(isFinite);

  const minV = Math.min(...allVols) * 0.90;
  const maxV = Math.max(...allVols) * 1.06;
  const minR = Math.min(...allRets) * (Math.min(...allRets) < 0 ? 1.12 : 0.88);
  const maxR = Math.max(...allRets) * 1.08;

  const sx = (v: number) => toSvgX(v, minV, maxV);
  const sy = (r: number) => toSvgY(r, minR, maxR);

  // Sort frontier by vol for line drawing
  const sortedFrontier = [...frontierPoints].sort((a, b) => a.vol - b.vol);
  const frontierPath = sortedFrontier.length > 1
    ? sortedFrontier.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.vol).toFixed(1)},${sy(p.ret).toFixed(1)}`).join(" ")
    : "";

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: "100%", maxHeight: "100%" }}>
        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_H} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={PAD.left + PLOT_W} y2={PAD.top + PLOT_H} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

        {/* Axis labels */}
        <text x={PAD.left + PLOT_W / 2} y={H - 2} textAnchor="middle" style={{ fontFamily: FONT_LABEL, fontSize: 7, fill: "rgba(184,184,184,0.45)", letterSpacing: "0.08em" }}>ANNUAL VOL</text>
        <text x={10} y={PAD.top + PLOT_H / 2} textAnchor="middle" transform={`rotate(-90, 10, ${PAD.top + PLOT_H / 2})`} style={{ fontFamily: FONT_LABEL, fontSize: 7, fill: "rgba(184,184,184,0.45)", letterSpacing: "0.08em" }}>ANNUAL RETURN</text>

        {/* Sampled portfolio cloud — very subtle gray */}
        {sampledPortfolios.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.vol)} cy={sy(p.ret)}
            r={1.5}
            fill="rgba(170,170,170,0.14)"
          />
        ))}

        {/* True optimized frontier — white line */}
        {frontierPath && (
          <path d={frontierPath} fill="none" stroke="rgba(228,228,228,0.85)" strokeWidth={1.8} />
        )}

        {/* Individual assets */}
        {individualAssets.map((a, i) => (
          <g key={`asset-${i}`}>
            <circle cx={sx(a.vol)} cy={sy(a.ret)} r={4} fill="rgba(135,135,135,0.45)" stroke="rgba(175,175,175,0.7)" strokeWidth={1} />
            <text x={sx(a.vol) + 6} y={sy(a.ret) + 3} style={{ fontFamily: FONT_LABEL, fontSize: 6.5, fill: "rgba(184,184,184,0.65)" }}>
              {a.label.length > 9 ? a.label.slice(0, 9) : a.label}
            </text>
          </g>
        ))}

        {/* Min-Vol marker — subtle white */}
        {minVol.vol < Infinity && (
          <g>
            <circle cx={sx(minVol.vol)} cy={sy(minVol.ret)} r={5} fill="rgba(255,255,255,0.08)" stroke="rgba(228,228,228,0.75)" strokeWidth={1.5} />
            <text x={sx(minVol.vol) + 7} y={sy(minVol.ret) - 5} style={{ fontFamily: FONT_LABEL, fontSize: 7, fill: "rgba(215,215,215,0.80)", letterSpacing: "0.05em" }}>MIN-VOL</text>
          </g>
        )}

        {/* Max-Sharpe marker — stronger white */}
        {maxSharpe.sharpe > -Infinity && (
          <g>
            <circle cx={sx(maxSharpe.vol)} cy={sy(maxSharpe.ret)} r={6} fill="rgba(255,255,255,0.14)" stroke="rgba(242,242,242,0.92)" strokeWidth={1.8} />
            <text x={sx(maxSharpe.vol) + 8} y={sy(maxSharpe.ret) - 5} style={{ fontFamily: FONT_LABEL, fontSize: 7, fill: "rgba(242,242,242,0.88)", letterSpacing: "0.05em" }}>MAX SHARPE · FRONTIER GRID</text>
          </g>
        )}

        {/* Stats legend */}
        <text x={PAD.left + 4} y={PAD.top + 10} style={{ fontFamily: FONT_NUM, fontSize: 7.5, fill: "rgba(205,205,205,0.65)" }}>
          Min-Vol: σ={minVol.vol < Infinity ? (minVol.vol * 100).toFixed(1) : "—"}%  μ={minVol.vol < Infinity ? (minVol.ret * 100).toFixed(1) : "—"}%
        </text>
        <text x={PAD.left + 4} y={PAD.top + 20} style={{ fontFamily: FONT_NUM, fontSize: 7.5, fill: "rgba(215,215,215,0.65)" }}>
          Max-Sharpe: SR={maxSharpe.sharpe > -Infinity ? maxSharpe.sharpe.toFixed(2) : "—"}
        </text>

        {/* Method label */}
        <text x={W - PAD.right} y={PAD.top + 10} textAnchor="end" style={{ fontFamily: FONT_LABEL, fontSize: 6, fill: "rgba(138,138,138,0.45)", letterSpacing: "0.07em" }}>
          {method} · k={componentCount} · n={observationCount}mo
        </text>
      </svg>
    </div>
  );
}
