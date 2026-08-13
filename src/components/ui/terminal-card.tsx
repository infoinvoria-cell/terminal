"use client";

import React from "react";
import { CHART_CARD_STYLE } from "@/lib/design-tokens";

interface TerminalCardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Simple card wrapper using CHART_CARD_STYLE from design-tokens.
 * Background: linear-gradient(to bottom, #17171b, #0b0b0e)
 * Border: 1px solid rgba(255,255,255,0.055)
 * Border-radius: 10px, overflow: hidden, position: relative.
 */
export function TerminalCard({ children, style, className }: TerminalCardProps) {
  return (
    <div
      className={className}
      style={{ ...CHART_CARD_STYLE, ...style }}
    >
      {children}
    </div>
  );
}
