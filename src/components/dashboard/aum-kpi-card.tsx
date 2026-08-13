"use client";

import { useEffect, useState } from "react";
import { Database } from "lucide-react";

const LS_KEY = "fund-manager:aum-visible";

function EyeOffIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function AumKpiCard({ value }: { value: string }) {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("previewHideAum") === "1") {
        setVisible(false);
        return;
      }
      const stored = localStorage.getItem(LS_KEY);
      if (stored === "false") setVisible(false);
    } catch { /* ignore */ }
  }, []);

  const toggle = () => {
    const next = !visible;
    setVisible(next);
    try { localStorage.setItem(LS_KEY, String(next)); } catch { /* ignore */ }
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 132,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.055)",
        background: "linear-gradient(to bottom, #26262d, #111114)",
        boxShadow: "0 20px 40px -16px rgba(0,0,0,0.55)",
        padding: "20px 20px 24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <p
          style={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.3,
            color: "rgba(180,192,210,0.6)",
            fontFamily: "var(--font-montserrat, 'Montserrat', sans-serif)",
            margin: 0,
          }}
        >
          Assets Under Management
        </p>
        <Database size={22} style={{ color: "rgba(180,192,210,0.6)", flexShrink: 0 }} strokeWidth={1.6} />
      </div>

      {/* Clickable value — toggles visibility */}
      <button
        type="button"
        onClick={toggle}
        aria-label={mounted && !visible ? "AuM anzeigen" : "AuM verbergen"}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 8,
          lineHeight: 1,
          transition: "opacity 0.2s",
        }}
      >
        {mounted && !visible ? (
          <span style={{ color: "rgba(180,192,210,0.35)", lineHeight: 0 }}>
            <EyeOffIcon />
          </span>
        ) : (
          <span
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#F0F2F6",
              fontFamily: "var(--font-numbers, 'Nunito', sans-serif)",
              lineHeight: 1,
            }}
          >
            {value}
          </span>
        )}
      </button>
    </div>
  );
}
