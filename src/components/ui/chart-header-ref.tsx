"use client";

import React from "react";
import { HEADER_SPAN_STYLE } from "@/lib/design-tokens";

interface ChartHeaderRefProps {
  title: string;
  /** Optional ReactNode rendered on the right side of the header. */
  right?: React.ReactNode;
  /** CSS padding string. Default: "10px 16px 6px" (matches referenzen charts). */
  padding?: string;
}

/**
 * Reusable chart card header row.
 * Left: title span using HEADER_SPAN_STYLE (11px, 700, #f5f7fa, Montserrat, letterSpacing 0.04em).
 * Right: optional content (KPI cards, buttons, etc.).
 * Default padding "10px 16px 6px" matches all referenzen chart headers verbatim.
 */
export function ChartHeaderRef({ title, right, padding }: ChartHeaderRefProps) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 8,
        padding: padding ?? "10px 16px 6px",
      }}
    >
      <span style={HEADER_SPAN_STYLE}>{title}</span>

      {right && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          {right}
        </div>
      )}
    </div>
  );
}
