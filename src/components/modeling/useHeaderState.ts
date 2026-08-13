"use client";

import { useCallback, useState } from "react";

export type HeaderState = "HIDDEN" | "VISIBLE" | "LOCKED_OPEN";

/**
 * Immediate-hide header state machine.
 *
 * Visible ONLY while: mouse is inside the hot-zone or header, OR locked=true.
 * No timers. No scroll-triggered reveals. No lingering.
 *
 * Hot-zone: 12–16px strip at top. When header slides into view, it overlays
 * the hot-zone, so the transition from zone→header is seamless.
 */
export function useHeaderState(locked: boolean) {
  const [mouseInside, setMouseInside] = useState(false);

  const onHotZoneEnter  = useCallback(() => setMouseInside(true), []);
  const onHeaderMouseEnter = useCallback(() => setMouseInside(true), []);
  const onHeaderMouseLeave = useCallback(() => setMouseInside(false), []);

  const isVisible = mouseInside || locked;
  const state: HeaderState = locked ? "LOCKED_OPEN" : mouseInside ? "VISIBLE" : "HIDDEN";
  const translateY = isVisible ? "0%" : "-100%";

  return { state, isVisible, translateY, onHotZoneEnter, onHeaderMouseEnter, onHeaderMouseLeave };
}
