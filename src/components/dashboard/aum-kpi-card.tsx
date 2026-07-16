"use client";

import { useEffect, useState } from "react";

const LS_KEY = "fund-manager:aum-visible";

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
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
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "linear-gradient(180deg,#1c1d20 0%,#141517 100%)",
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
            color: "var(--dash-muted, #6b6b6b)",
            fontFamily: "var(--font-montserrat,sans-serif)",
            margin: 0,
          }}
        >
          Risk adjusted AuM
        </p>
        <button
          type="button"
          onClick={toggle}
          aria-label={visible ? "AuM verbergen" : "AuM anzeigen"}
          style={{
            background: "none",
            border: "none",
            padding: 2,
            cursor: "pointer",
            color: "#4a4d54",
            lineHeight: 0,
            flexShrink: 0,
            transition: "color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#a0a3aa")}
          onMouseLeave={e => (e.currentTarget.style.color = "#4a4d54")}
        >
          {mounted ? (visible ? <EyeIcon /> : <EyeOffIcon />) : <EyeIcon />}
        </button>
      </div>
      <p
        style={{
          fontSize: 30,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: "#ffffff",
          fontFamily: "var(--font-nunito,sans-serif)",
          margin: 0,
          transition: "opacity 0.2s",
          opacity: mounted && !visible ? 0.35 : 1,
        }}
      >
        {mounted && !visible ? "—" : value}
      </p>
    </div>
  );
}
