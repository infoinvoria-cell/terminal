"use client";

import React from "react";

interface ScrollFadeProps {
  /** "top" fades from the given color downward (color → transparent). */
  position: "top" | "bottom";
  /** Solid hex color of the card background (e.g. "#26262d" for top, "#111114" for bottom). */
  color: string;
  /** Height of the fade overlay in px. Default: top = 36, bottom = 40. */
  height?: number;
}

/**
 * Scroll fade gradient overlay.
 * position: absolute, pointerEvents: none — drop inside a position:relative container.
 *
 * top    → linear-gradient(to bottom, {color}, transparent)
 * bottom → linear-gradient(to bottom, transparent, {color})
 *
 * Matches the fade pattern in AssetsBox (ReferenceBottomBoxes) verbatim.
 */
export function ScrollFade({ position, color, height }: ScrollFadeProps) {
  const defaultHeight = position === "top" ? 36 : 40;
  const h = height ?? defaultHeight;

  const gradient =
    position === "top"
      ? `linear-gradient(to bottom, ${color}, transparent)`
      : `linear-gradient(to bottom, transparent, ${color})`;

  const placement: React.CSSProperties =
    position === "top"
      ? { top: 0 }
      : { bottom: 0 };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        height: h,
        background: gradient,
        pointerEvents: "none",
        ...placement,
      }}
    />
  );
}
