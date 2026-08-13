"use client";

import { useMemo } from "react";
import type { TradeRecord } from "@/lib/modeling/types";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  trades: TradeRecord[];
  progress?: number;
};

const W = 440, H = 280;
const PAD = { top: 28, right: 20, bottom: 28, left: 52 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export function LLNConvergenceModel({ trades, progress = 1 }: Props) {
  const { winRatePath, band1Upper, band1Lower, finalWR } = useMemo(() => {
    if (!trades.length) return { winRatePath: [], band1Upper: [], band1Lower: [], finalWR: 0 };
    let wins = 0;
    const wr: number[] = [];
    const bu: number[] = [];
    const bl: number[] = [];
    trades.forEach((t, i) => {
      if (t.pnl > 0) wins++;
      const n = i + 1;
      const w = wins / n;
      const sigma = Math.sqrt(w * (1 - w) / Math.max(n, 1));
      wr.push(w);
      bu.push(Math.min(1, w + sigma));
      bl.push(Math.max(0, w - sigma));
    });
    return { winRatePath: wr, band1Upper: bu, band1Lower: bl, finalWR: wr[wr.length - 1] ?? 0 };
  }, [trades]);

  const n = winRatePath.length;
  if (!n) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: FONT_LABEL, fontSize: 9, color: MC_COLORS.textMuted, letterSpacing: "0.1em" }}>NO TRADE DATA</span>
      </div>
    );
  }

  const visible = Math.max(1, Math.round(n * Math.min(progress, 1)));

  function px(i: number) { return PAD.left + (i / (n - 1)) * PLOT_W; }
  function py(wr: number) { return PAD.top + (1 - wr) * PLOT_H; }

  const bandPath = [
    ...band1Upper.slice(0, visible).map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`),
    ...band1Lower.slice(0, visible).reverse().map((v, i) => `L${px(visible - 1 - i).toFixed(1)},${py(v).toFixed(1)}`),
    "Z",
  ].join(" ");

  const wrPath = winRatePath.slice(0, visible)
    .map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`)
    .join(" ");

  const finalWRLine = py(finalWR);

  const ticks = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: "100%", maxHeight: "100%" }}>
        {/* Grid lines */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} y1={py(t)} x2={PAD.left + PLOT_W} y2={py(t)}
              stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            <text x={PAD.left - 4} y={py(t) + 3} textAnchor="end"
              style={{ fontFamily: FONT_NUM, fontSize: 6.5, fill: "rgba(140,140,140,0.45)" }}>
              {(t * 100).toFixed(0)}%
            </text>
          </g>
        ))}

        {/* 50% line */}
        <line x1={PAD.left} y1={py(0.5)} x2={PAD.left + PLOT_W} y2={py(0.5)}
          stroke="rgba(255,255,255,0.10)" strokeWidth={1} strokeDasharray="4,3" />

        {/* ±1σ band */}
        <path d={bandPath} fill="rgba(185,185,185,0.07)" />

        {/* Final WR reference */}
        <line x1={PAD.left} y1={finalWRLine} x2={PAD.left + PLOT_W} y2={finalWRLine}
          stroke="rgba(185,185,185,0.18)" strokeWidth={1} strokeDasharray="2,4" />

        {/* Win rate path */}
        <path d={wrPath} fill="none" stroke="rgba(210,210,210,0.82)" strokeWidth={1.5} />

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_H}
          stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={PAD.left + PLOT_W} y2={PAD.top + PLOT_H}
          stroke="rgba(255,255,255,0.07)" strokeWidth={1} />

        {/* X-axis: trade count ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const i = Math.round(frac * (n - 1));
          return (
            <text key={frac} x={px(i)} y={PAD.top + PLOT_H + 10} textAnchor="middle"
              style={{ fontFamily: FONT_NUM, fontSize: 6, fill: "rgba(140,140,140,0.4)" }}>
              {i + 1}
            </text>
          );
        })}

        {/* Labels */}
        <text x={PAD.left + PLOT_W / 2} y={H - 4} textAnchor="middle"
          style={{ fontFamily: FONT_LABEL, fontSize: 6.5, fill: "rgba(184,184,184,0.35)", letterSpacing: "0.08em" }}>
          TRADE #
        </text>

        {/* KPI badge */}
        <text x={PAD.left + PLOT_W - 4} y={PAD.top + 12} textAnchor="end"
          style={{ fontFamily: FONT_NUM, fontSize: 10, fontWeight: 600, fill: "rgba(215,215,215,0.88)" }}>
          {(finalWR * 100).toFixed(1)}% WIN RATE
        </text>
        <text x={PAD.left + PLOT_W - 4} y={PAD.top + 22} textAnchor="end"
          style={{ fontFamily: FONT_LABEL, fontSize: 6.5, fill: "rgba(140,140,140,0.5)", letterSpacing: "0.06em" }}>
          n={n} TRADES  ±1σ BAND
        </text>
      </svg>
    </div>
  );
}
