"use client";
import { useState, useEffect } from "react";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomNav } from "./MobileBottomNav";

const STORAGE_KEY = "m_header_hidden";

// Nav height must match MobileBottomNav exactly
const NAV_H = "calc(72px + env(safe-area-inset-bottom, 28px) + 10px)";
const HEADER_H = 52;

export function MobileLayoutClient({ children }: { children: React.ReactNode }) {
  const [headerHidden, setHeaderHidden] = useState(false);

  useEffect(() => {
    try {
      setHeaderHidden(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
  }, []);

  const toggleHeader = () => {
    setHeaderHidden(v => {
      const next = !v;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const headerPx = headerHidden ? 0 : HEADER_H;

  return (
    <div style={{ position: "relative", height: "100dvh", overflow: "hidden", background: "#0c0d10" }}>
      <MobileHeader hidden={headerHidden} />

      {/* Exact slice between header and nav — children fill 100% of this */}
      <main
        style={{
          position: "absolute",
          top: headerPx,
          left: 0,
          right: 0,
          bottom: NAV_H,
          overflowY: "auto",
          overflowX: "hidden",
          transition: "top 200ms ease",
        }}
      >
        {children}
      </main>

      <MobileBottomNav headerHidden={headerHidden} onToggleHeader={toggleHeader} />
    </div>
  );
}
