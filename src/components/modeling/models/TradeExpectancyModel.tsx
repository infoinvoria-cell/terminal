"use client";

import { useMemo } from "react";
import type { TradeRecord } from "@/lib/modeling/types";
import { computeTradeStats } from "@/lib/modeling/transforms";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  trades: TradeRecord[];
};

export function TradeExpectancyModel({ trades }: Props) {
  const stats = useMemo(() => computeTradeStats(trades), [trades]);

  if (!stats.n) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: FONT_LABEL, fontSize: 9, color: MC_COLORS.textMuted, letterSpacing: "0.1em" }}>NO TRADE DATA</span>
      </div>
    );
  }

  const W = 440, H = 300;
  const BAR_AREA_H = 160;
  const PAD = { top: 30, left: 60, right: 20, bottom: 50 };
  const PLOT_W = W - PAD.left - PAD.right;
  const PLOT_H = BAR_AREA_H;

  // PnL distribution: bucket into 20 bins
  const pnls = trades.map((t) => t.pnl);
  const minPnl = Math.min(...pnls);
  const maxPnl = Math.max(...pnls);
  const range = maxPnl - minPnl || 1;
  const BINS = 20;
  const binW = range / BINS;
  const bins = Array.from({ length: BINS }, (_, i) => ({
    lo: minPnl + i * binW,
    hi: minPnl + (i + 1) * binW,
    count: 0,
    isWin: minPnl + (i + 0.5) * binW > 0,
  }));
  for (const p of pnls) {
    const idx = Math.min(Math.floor((p - minPnl) / binW), BINS - 1);
    if (idx >= 0 && bins[idx]) bins[idx]!.count++;
  }
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  const CELL_W = PLOT_W / BINS;
  const zeroX = PAD.left + ((0 - minPnl) / range) * PLOT_W;

  // KPI row
  const kpis = [
    { label: "N", value: String(stats.n) },
    { label: "WIN RATE", value: `${(stats.winRate * 100).toFixed(1)}%`, color: stats.winRate >= 0.5 ? "rgba(210,210,210,0.85)" : "#C9A84C" },
    { label: "AVG WIN", value: stats.avgWin.toFixed(0), color: "rgba(210,210,210,0.85)" },
    { label: "AVG LOSS", value: `-${stats.avgLoss.toFixed(0)}`, color: "#C9A84C" },
    { label: "EXPECT.", value: stats.expectancy.toFixed(0), color: stats.expectancy >= 0 ? "rgba(210,210,210,0.85)" : "#C9A84C" },
    { label: "PROFIT F.", value: stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2), color: stats.profitFactor >= 1 ? "rgba(210,210,210,0.85)" : "#C9A84C" },
  ];

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: "100%", maxHeight: "100%" }}>
        {/* Title */}
        <text x={PAD.left} y={14} style={{ fontFamily: FONT_LABEL, fontSize: 7, fill: "rgba(184,184,184,0.45)", letterSpacing: "0.1em" }}>
          PNL DISTRIBUTION  ({stats.n} TRADES)
        </text>

        {/* Histogram bars */}
        {bins.map((bin, i) => {
          const barH = (bin.count / maxCount) * PLOT_H;
          const x = PAD.left + i * CELL_W;
          const y = PAD.top + PLOT_H - barH;
          return (
            <rect
              key={i}
              x={x + 1} y={y}
              width={Math.max(1, CELL_W - 2)} height={barH}
              fill={bin.isWin ? "rgba(205,205,205,0.55)" : "rgba(201,168,76,0.55)"}
              rx={1}
            />
          );
        })}

        {/* Zero line */}
        <line x1={zeroX} y1={PAD.top} x2={zeroX} y2={PAD.top + PLOT_H}
          stroke="rgba(255,255,255,0.14)" strokeWidth={1} strokeDasharray="3,3" />
        <text x={zeroX} y={PAD.top + PLOT_H + 10} textAnchor="middle"
          style={{ fontFamily: FONT_NUM, fontSize: 6, fill: "rgba(180,200,220,0.35)" }}>0</text>

        {/* Min/Max labels */}
        <text x={PAD.left} y={PAD.top + PLOT_H + 10} style={{ fontFamily: FONT_NUM, fontSize: 6, fill: "rgba(201,168,76,0.55)" }}>
          {minPnl.toFixed(0)}
        </text>
        <text x={PAD.left + PLOT_W} y={PAD.top + PLOT_H + 10} textAnchor="end"
          style={{ fontFamily: FONT_NUM, fontSize: 6, fill: "rgba(205,205,205,0.50)" }}>
          {maxPnl.toFixed(0)}
        </text>

        {/* KPI row */}
        {kpis.map((k, i) => {
          const x = PAD.left + (i / kpis.length) * PLOT_W + PLOT_W / kpis.length / 2;
          const baseY = PAD.top + PLOT_H + 30;
          return (
            <g key={i}>
              <text x={x} y={baseY} textAnchor="middle"
                style={{ fontFamily: FONT_LABEL, fontSize: 6, fill: "rgba(140,140,140,0.55)", letterSpacing: "0.08em" }}>
                {k.label}
              </text>
              <text x={x} y={baseY + 12} textAnchor="middle"
                style={{ fontFamily: FONT_NUM, fontSize: 9, fontWeight: 600, fill: k.color ?? "rgba(215,215,215,0.8)" }}>
                {k.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
