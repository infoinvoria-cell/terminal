"use client";

import { useMemo } from "react";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import { computePCA } from "@/lib/modeling/transforms";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  seriesMap: Record<string, AnalyticsSeriesPoint[]>;
};

export function PCAModel({ seriesMap }: Props) {
  const result = useMemo(() => computePCA(seriesMap), [seriesMap]);

  if (!result) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: FONT_LABEL, fontSize: 9, color: MC_COLORS.textMuted, letterSpacing: "0.1em" }}>
          NEED ≥ 2 COMPONENTS WITH COMMON HISTORY
        </span>
      </div>
    );
  }

  const { labels, components } = result;
  const displayComps = components.slice(0, Math.min(components.length, 6));
  const k = labels.length;

  const W = 440, H = 300;
  const BAR_AREA_H = 100;
  const PAD_L = 8, PAD_R = 12, PAD_T = 20;
  const BAR_GAP = 4;
  const BAR_W = Math.max(8, Math.floor((W - PAD_L - PAD_R - (displayComps.length - 1) * BAR_GAP) / displayComps.length));
  const LOADING_TOP = PAD_T + BAR_AREA_H + 24;
  const LOADING_H = H - LOADING_TOP - 12;

  const maxExplained = Math.max(...displayComps.map((c) => c.explainedVariance), 0.01);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: "100%", flex: 1, minHeight: 0 }}>
        {/* Explained variance bars */}
        {displayComps.map((comp, i) => {
          const barH = (comp.explainedVariance / maxExplained) * BAR_AREA_H;
          const x = PAD_L + i * (BAR_W + BAR_GAP);
          const y = PAD_T + BAR_AREA_H - barH;
          return (
            <g key={`bar-${i}`}>
              <rect x={x} y={y} width={BAR_W} height={barH}
                fill={`rgba(180,190,200,${0.25 + 0.45 * (1 - i / displayComps.length)})`}
                rx={1}
              />
              {/* Cumulative line dot */}
              <circle cx={x + BAR_W / 2} cy={PAD_T + BAR_AREA_H - comp.cumulativeVariance * BAR_AREA_H}
                r={2.5} fill="rgba(201,168,76,0.85)" />
              <text x={x + BAR_W / 2} y={y - 3} textAnchor="middle"
                style={{ fontFamily: FONT_NUM, fontSize: 6.5, fill: "rgba(215,215,215,0.65)" }}>
                {(comp.explainedVariance * 100).toFixed(0)}%
              </text>
              <text x={x + BAR_W / 2} y={PAD_T + BAR_AREA_H + 10} textAnchor="middle"
                style={{ fontFamily: FONT_LABEL, fontSize: 6, fill: "rgba(184,184,184,0.5)", letterSpacing: "0.05em" }}>
                PC{i + 1}
              </text>
            </g>
          );
        })}

        {/* Cumulative line */}
        {displayComps.length > 1 && (
          <polyline
            points={displayComps.map((c, i) =>
              `${PAD_L + i * (BAR_W + BAR_GAP) + BAR_W / 2},${PAD_T + BAR_AREA_H - c.cumulativeVariance * BAR_AREA_H}`
            ).join(" ")}
            fill="none" stroke="rgba(201,168,76,0.5)" strokeWidth={1} strokeDasharray="2,2"
          />
        )}

        {/* Explained variance axis */}
        {[0, 0.25, 0.5, 0.75, 1.0].map((tick) => (
          <text key={tick}
            x={W - PAD_R} y={PAD_T + BAR_AREA_H - tick * BAR_AREA_H + 3}
            textAnchor="end" style={{ fontFamily: FONT_NUM, fontSize: 6, fill: "rgba(140,140,140,0.4)" }}>
            {(tick * 100).toFixed(0)}%
          </text>
        ))}
        <text x={W - PAD_R} y={PAD_T - 6} textAnchor="end"
          style={{ fontFamily: FONT_LABEL, fontSize: 6.5, fill: "rgba(184,184,184,0.4)", letterSpacing: "0.06em" }}>
          EXPL. VAR
        </text>

        {/* Loadings heatmap */}
        <text x={PAD_L} y={LOADING_TOP - 5}
          style={{ fontFamily: FONT_LABEL, fontSize: 7, fill: "rgba(184,184,184,0.45)", letterSpacing: "0.08em" }}>
          LOADINGS
        </text>

        {displayComps.map((comp, i) => {
          const x = PAD_L + i * (BAR_W + BAR_GAP);
          return comp.loadings.slice(0, k).map((loading, j) => {
            const cellH = Math.max(8, Math.floor(LOADING_H / k));
            const y = LOADING_TOP + j * cellH;
            const absL = Math.abs(loading);
            const isPos = loading >= 0;
            const alpha = 0.12 + absL * 0.75;
            // positive = white, negative = gold, near-zero = gray
            const fill = isPos ? `rgba(220,220,220,${alpha})` : `rgba(201,168,76,${alpha})`;
            return (
              <g key={`load-${i}-${j}`}>
                <rect x={x} y={y} width={BAR_W} height={cellH - 1} fill={fill} rx={1} />
                {absL > 0.2 && (
                  <text x={x + BAR_W / 2} y={y + cellH / 2 + 3} textAnchor="middle"
                    style={{ fontFamily: FONT_NUM, fontSize: 5.5, fill: "rgba(238,238,238,0.7)" }}>
                    {loading.toFixed(2)}
                  </text>
                )}
              </g>
            );
          });
        })}

        {/* Row labels (component names) */}
        {labels.slice(0, k).map((label, j) => {
          const cellH = Math.max(8, Math.floor(LOADING_H / k));
          const y = LOADING_TOP + j * cellH + cellH / 2 + 3;
          const shortL = label.length > 14 ? label.slice(-14) : label;
          return (
            <text key={`label-${j}`} x={PAD_L + displayComps.length * (BAR_W + BAR_GAP) + 3} y={y}
              style={{ fontFamily: FONT_LABEL, fontSize: 6, fill: "rgba(184,184,184,0.5)" }}>
              {shortL}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
