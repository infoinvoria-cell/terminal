"use client";

import type { ReactNode } from "react";

// Shared mobile screen scaffold: a compact sticky header (title + optional right
// slot) over a padded content column. Keeps every /m/* page visually consistent.

const GOLD = "#e2ca7a";

export function MobileScreen({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 16px 12px",
          background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: "#fafafa",
              fontFamily: "var(--font-montserrat), sans-serif",
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 12,
                color: "rgba(255,255,255,0.42)",
                fontWeight: 500,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      </header>
      <div style={{ flex: 1, padding: "4px 16px 16px" }}>{children}</div>
    </div>
  );
}

// Small gold-accented placeholder used by pages that are not yet implemented.
export function MobilePlaceholder({ label }: { label: string }) {
  return (
    <div
      style={{
        marginTop: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        color: "rgba(255,255,255,0.4)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 999,
          border: `1px solid ${GOLD}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: GOLD,
          fontSize: 20,
        }}
      >
        ◐
      </div>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, opacity: 0.7 }}>In Arbeit</span>
    </div>
  );
}
