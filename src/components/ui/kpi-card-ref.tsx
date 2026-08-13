"use client";

import React from "react";
import {
  KPI_CARD_STYLE,
  LABEL_STYLE,
  VALUE_STYLE,
  COLORS,
} from "@/lib/design-tokens";

interface KpiCardRefProps {
  label: string;
  value: string;
  /** Optional annotation shown in gold below the value (e.g. "p.a.", "+0.3%") */
  extra?: string;
  flexGrow?: number;
  height?: number;
  style?: React.CSSProperties;
}

/**
 * KPI card matching /referenzen KpiCard exactly.
 * Montserrat for label · Nunito for value · gold for extra.
 * Based on KPI_CARD_STYLE (height 84, padding 11/14/12, border-radius 14).
 */
export function KpiCardRef({ label, value, extra, flexGrow, height, style }: KpiCardRefProps) {
  const composed: React.CSSProperties = {
    ...KPI_CARD_STYLE,
    ...(flexGrow !== undefined ? { flexGrow } : {}),
    ...(height !== undefined ? { height } : {}),
    ...style,
  };

  return (
    <div style={composed}>
      <span style={{ ...LABEL_STYLE, fontSize: 10, letterSpacing: "0.04em" }}>
        {label}
      </span>

      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <strong style={{ ...VALUE_STYLE, fontSize: 18 }}>
          {value}
        </strong>
        {extra && (
          <span
            style={{
              ...VALUE_STYLE,
              fontSize: 11,
              fontWeight: 600,
              color: COLORS.GOLD,
            }}
          >
            {extra}
          </span>
        )}
      </div>
    </div>
  );
}
