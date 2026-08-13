"use client";

import { useMemo } from "react";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import { computeCorrelationMatrix } from "@/lib/modeling/transforms";
import { FONT_LABEL, FONT_NUM, MC_COLORS } from "@/lib/modeling/colors";

type Props = {
  seriesMap: Record<string, AnalyticsSeriesPoint[]>;
};

function corrColor(v: number): string {
  // positive → white, zero → gray, negative → gold
  if (v >= 0) {
    const t = Math.min(v, 1);
    const g = Math.round(90 + t * 150);
    return `rgb(${g},${g},${g})`;
  }
  const t = Math.min(-v, 1);
  // gold: #C9A84C = rgb(201,168,76)
  const r = Math.round(60 + t * 141);
  const g = Math.round(60 + t * 108);
  const b = Math.round(60 + t * 16);
  return `rgb(${r},${g},${b})`;
}

export function CorrelationMatrixModel({ seriesMap }: Props) {
  const result = useMemo(() => computeCorrelationMatrix(seriesMap), [seriesMap]);

  if (!result) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: FONT_LABEL, fontSize: 9, color: MC_COLORS.textMuted, letterSpacing: "0.1em" }}>
          NEED ≥ 2 COMPONENTS WITH COMMON HISTORY
        </span>
      </div>
    );
  }

  const { labels, matrix } = result;
  const k = labels.length;
  const CELL = Math.min(Math.floor(240 / k), 56);
  const LABEL_W = 80;
  const LABEL_H = 24;
  const GRID_W = k * CELL;
  const GRID_H = k * CELL;
  const SVG_W = LABEL_W + GRID_W + 12;
  const SVG_H = LABEL_H + GRID_H + 8;

  // Short label (last 12 chars)
  const shortLabel = (s: string) => s.length > 12 ? s.slice(-12) : s;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ maxWidth: "100%", maxHeight: "100%", overflow: "visible" }}
      >
        {/* Column labels (rotated) */}
        {labels.map((label, j) => (
          <text
            key={`col-${j}`}
            x={LABEL_W + j * CELL + CELL / 2}
            y={LABEL_H - 4}
            textAnchor="end"
            transform={`rotate(-45, ${LABEL_W + j * CELL + CELL / 2}, ${LABEL_H - 4})`}
            style={{ fontFamily: FONT_LABEL, fontSize: 7, fill: "rgba(184,184,184,0.6)", letterSpacing: "0.04em" }}
          >
            {shortLabel(label)}
          </text>
        ))}

        {/* Row labels */}
        {labels.map((label, i) => (
          <text
            key={`row-${i}`}
            x={LABEL_W - 5}
            y={LABEL_H + i * CELL + CELL / 2 + 3}
            textAnchor="end"
            style={{ fontFamily: FONT_LABEL, fontSize: 7, fill: "rgba(184,184,184,0.6)", letterSpacing: "0.04em" }}
          >
            {shortLabel(label)}
          </text>
        ))}

        {/* Matrix cells */}
        {matrix.map((row, i) =>
          row.map((v, j) => {
            const x = LABEL_W + j * CELL;
            const y = LABEL_H + i * CELL;
            const isDiag = i === j;
            // diagonal = dark neutral (value is always +1, not negative → no gold)
            const fill = isDiag ? "rgba(255,255,255,0.06)" : corrColor(v);
            const textFill = isDiag ? "rgba(184,184,184,0.55)" :
              Math.abs(v) > 0.5 ? "#0a0a0c" : "rgba(215,215,215,0.75)";
            return (
              <g key={`${i}-${j}`}>
                <rect
                  x={x + 1} y={y + 1}
                  width={CELL - 2} height={CELL - 2}
                  fill={fill}
                  rx={2}
                />
                <text
                  x={x + CELL / 2} y={y + CELL / 2 + 4}
                  textAnchor="middle"
                  style={{ fontFamily: FONT_NUM, fontSize: 8, fill: textFill, fontWeight: 600 }}
                >
                  {isDiag ? "—" : v.toFixed(2)}
                </text>
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
