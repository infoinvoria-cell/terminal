"use client";

import React from "react";
import { PILL_CSS, FONTS } from "@/lib/design-tokens";

/**
 * Injects the shared rc-pill CSS once per page.
 * Place <InjectPillCss /> at the top of any component that uses PillButton/SegButton.
 */
export function InjectPillCss() {
  return <style dangerouslySetInnerHTML={{ __html: PILL_CSS }} />;
}

type PillButtonProps = {
  active: boolean;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  /** "tab" for tab-role (aria-selected), "button" for toggle (aria-pressed) */
  role?: "tab" | "button";
  disabled?: boolean;
  padding?: string;
  fontSize?: number;
  fontWeight?: number;
  className?: string;
};

/** Full pill button — used for main tabs, phase selectors, view switches. */
export function PillButton({
  active,
  label,
  icon,
  onClick,
  role = "tab",
  disabled = false,
  padding = "8px 20px",
  fontSize = 13,
  fontWeight,
  className,
}: PillButtonProps) {
  return (
    <button
      role={role}
      aria-pressed={role === "button" ? active : undefined}
      aria-selected={role === "tab" ? active : undefined}
      disabled={disabled}
      tabIndex={0}
      onClick={onClick}
      className={`rc-pill ${active ? "rc-active" : "rc-inactive"} ${className ?? ""}`}
      style={{ padding, fontFamily: FONTS.MONTSERRAT, opacity: disabled ? 0.4 : 1, color: active ? "#F3F3F4" : "#6a6e7a" }}
    >
      {icon}
      <span style={{
        fontSize,
        fontWeight: fontWeight ?? (active ? 600 : 400),
        color: active ? "#F3F3F4" : "#6a6e7a",
        lineHeight: 1,
        whiteSpace: "nowrap",
        fontFamily: FONTS.MONTSERRAT,
        letterSpacing: "0.01em",
      }}>
        {label}
      </span>
    </button>
  );
}

type SegButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  minWidth?: number;
};

/** Segment/time-period pill — compact, used inside filter groups. */
export function SegButton({ active, label, onClick, disabled = false, minWidth = 40 }: SegButtonProps) {
  return (
    <button
      role="radio"
      aria-checked={active}
      disabled={disabled}
      tabIndex={0}
      onClick={onClick}
      className={`rc-pill ${active ? "rc-active" : "rc-inactive"}`}
      style={{ padding: "7px 14px", minWidth, fontFamily: FONTS.MONTSERRAT, opacity: disabled ? 0.4 : 1 }}
    >
      <span style={{
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        color: active ? "#F3F3F4" : "#5a5e6a",
        fontFamily: FONTS.MONTSERRAT,
        lineHeight: 1,
      }}>
        {label}
      </span>
    </button>
  );
}

/** Vertical divider between pill groups. */
export function PillDivider() {
  return (
    <div style={{
      width: 1, height: 22, background: "rgba(255,255,255,0.18)",
      borderRadius: 1, marginInline: 2, alignSelf: "center", flexShrink: 0,
    }} />
  );
}

/** Wrapper row for a group of pills. */
export function PillRow({ children, gap = 4 }: { children: React.ReactNode; gap?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap, flexWrap: "wrap" }}>
      {children}
    </div>
  );
}
