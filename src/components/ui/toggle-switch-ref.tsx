"use client";

import React from "react";

/** Matches TOGGLE_COLORS in ReferenzenControls — verbatim values. */
type ToggleVariant = "light" | "gold" | "dark";

const TOGGLE_COLORS: Record<
  ToggleVariant,
  {
    offTrack: string;
    offKnob: string;
    offBorder: string;
    onTrack: string;
    onKnob: string;
    onBorder: string;
  }
> = {
  /** Light variant — matches ReferenceBottomBoxes Toggle exactly (same hex values). */
  light: {
    offTrack: "#40414a",
    offKnob:  "#6a6b73",
    offBorder: "rgba(255,255,255,0.18)",
    onTrack:  "#8B8B92",
    onKnob:   "#ECECEC",
    onBorder: "rgba(255,255,255,0.38)",
  },
  gold: {
    offTrack: "#2e2a1a",
    offKnob:  "#5a5030",
    offBorder: "rgba(255,255,255,0.12)",
    onTrack:  "#6E6032",
    onKnob:   "#D4B24D",
    onBorder: "rgba(255,255,255,0.22)",
  },
  dark: {
    offTrack: "#1e1f26",
    offKnob:  "#44454f",
    offBorder: "rgba(255,255,255,0.10)",
    onTrack:  "#36373f",
    onKnob:   "#8c8d96",
    onBorder: "rgba(255,255,255,0.22)",
  },
};

interface ToggleSwitchRefProps {
  on: boolean;
  onChange: () => void;
  /** Visual variant. Default: "light" (identical to ReferenceBottomBoxes). */
  variant?: ToggleVariant;
}

/**
 * Toggle switch matching the Toggle in ReferenceBottomBoxes exactly.
 * Dimensions: 36 × 20 px track, 14 × 14 px knob.
 * Supports "light" (default), "gold", and "dark" variants.
 */
export function ToggleSwitchRef({ on, onChange, variant = "light" }: ToggleSwitchRefProps) {
  const c = TOGGLE_COLORS[variant];
  const track  = on ? c.onTrack  : c.offTrack;
  const knob   = on ? c.onKnob   : c.offKnob;
  const border = on ? c.onBorder : c.offBorder;

  return (
    <div
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onChange()}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        cursor: "pointer",
        flexShrink: 0,
        background: track,
        border: `1.5px solid ${border}`,
        position: "relative",
        transition: "background 160ms, border-color 160ms",
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: knob,
          position: "absolute",
          top: "50%",
          transform: "translateY(-50%)",
          left: on ? "calc(100% - 17px)" : 2,
          transition: "left 160ms, background 160ms",
          boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}
