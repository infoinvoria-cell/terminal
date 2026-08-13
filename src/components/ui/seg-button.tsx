"use client";

import React, { useEffect } from "react";
import { PILL_CSS, FONTS, COLORS } from "@/lib/design-tokens";

/** Module-level guard — reuses the same CSS flag as pill-button when both are on the page. */
let segCssInjected = false;

function injectSegCss(): void {
  if (segCssInjected || typeof document === "undefined") return;
  // Only inject if no pill CSS is already present
  if (!document.querySelector("[data-rc-pill]")) {
    const style = document.createElement("style");
    style.setAttribute("data-rc-pill", "1");
    style.textContent = PILL_CSS;
    document.head.appendChild(style);
  }
  segCssInjected = true;
}

interface SegButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

/**
 * Smaller segment / time-range button (e.g. 1M, 3M, 1Y).
 * Shares .rc-pill CSS with PillButton. Uses role="radio" with aria-checked.
 * Padding: 7px 16px, minWidth 44, fontSize 13.
 */
export function SegButton({ active, label, onClick }: SegButtonProps) {
  useEffect(() => {
    injectSegCss();
  }, []);

  return (
    <button
      role="radio"
      aria-checked={active}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onClick()}
      className={`rc-pill ${active ? "rc-active" : "rc-inactive"}`}
      style={{ padding: "7px 16px", minWidth: 44 }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          color: active ? COLORS.TEXT_ACTIVE : COLORS.TEXT_INACTIVE_SEG,
          fontFamily: FONTS.MONTSERRAT,
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </button>
  );
}
