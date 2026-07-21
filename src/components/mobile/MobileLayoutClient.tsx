"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomNav } from "./MobileBottomNav";

const STORAGE_KEY = "m_header_hidden";

// Nav height must match MobileBottomNav exactly
const NAV_H = "calc(76px + env(safe-area-inset-bottom, 34px) + 14px)";
const HEADER_H = 52;

// Pages where header is always hidden (no toggle)
const NO_HEADER_PREFIXES = ["/m/monitoring"];

export function MobileLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const forceNoHeader = NO_HEADER_PREFIXES.some(p => pathname.startsWith(p));
  const [headerHidden, setHeaderHidden] = useState(false);

  useEffect(() => {
    if (forceNoHeader) return;
    try {
      setHeaderHidden(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
  }, [forceNoHeader]);

  const toggleHeader = () => {
    if (forceNoHeader) return;
    setHeaderHidden(v => {
      const next = !v;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const effectiveHidden = forceNoHeader || headerHidden;
  const headerPx = effectiveHidden ? 0 : HEADER_H;

  return (
    <div style={{ position: "relative", height: "100dvh", overflow: "hidden", background: "#0c0d10" }}>
      <MobileHeader hidden={effectiveHidden} />

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

      <MobileBottomNav headerHidden={effectiveHidden} onToggleHeader={toggleHeader} />
    </div>
  );
}
