"use client";

import { useState, useRef, useEffect } from "react";
import type { AccountViewId } from "@/lib/dashboard/dashboard-page-data";

const M = "var(--font-montserrat,'Montserrat',sans-serif)";

const VIEWS: Array<{ id: AccountViewId; label: string; sub: string }> = [
  { id: "account_a", label: "Acc A", sub: "RoboForex · MT4" },
  { id: "account_b", label: "Acc B", sub: "Vantage · MT5" },
  { id: "combined",  label: "Comb.", sub: "Additive · beide Konten" },
];

type Props = {
  activeView: AccountViewId;
  onViewChange: (view: AccountViewId) => void;
};

export function TrackRecordViewSelector({ activeView, onViewChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = VIEWS.find((v) => v.id === activeView) ?? VIEWS[2];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Hidden testid anchor */}
      <div
        data-testid="track-record-active-view"
        data-value={activeView}
        className="sr-only"
        aria-hidden="true"
      />

      {/* Trigger button */}
      <button
        type="button"
        data-testid="track-record-view-trigger"
        onClick={() => setOpen((o) => !o)}
        className="rc-pill rc-active"
        style={{
          fontFamily: M,
          padding: "5px 9px 5px 11px",
          fontSize: 11,
          fontWeight: 600,
          color: "#F3F3F4",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {active.label}
        {/* Chevron down — two lines forming a V */}
        <svg
          width="8"
          height="5"
          viewBox="0 0 8 5"
          fill="none"
          style={{
            flexShrink: 0,
            opacity: open ? 0.9 : 0.5,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 160ms ease, opacity 160ms ease",
          }}
        >
          <path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 5px)",
            right: 0,
            minWidth: 148,
            background: "#18191f",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
            zIndex: 100,
            overflow: "hidden",
            padding: "3px 0",
          }}
        >
          {VIEWS.filter((v) => v.id !== activeView).map((v) => (
            <button
              key={v.id}
              type="button"
              data-testid={`track-record-view-${v.id.replace("_", "-")}`}
              onClick={() => { onViewChange(v.id); setOpen(false); }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                width: "100%",
                padding: "7px 12px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontFamily: M,
                gap: 1,
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 11, fontWeight: 500, color: "#d8dae0" }}>{v.label}</span>
              <span style={{ fontSize: 9.5, color: "#4a4d57", fontWeight: 400 }}>{v.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
