"use client";
import { useState, useEffect } from "react";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomNav } from "./MobileBottomNav";

const STORAGE_KEY = "m_header_hidden";

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

  return (
    <div style={{ position: "relative", minHeight: "100dvh", background: "#0c0d10", overflowX: "hidden" }}>
      <MobileHeader hidden={headerHidden} />
      <main style={{
        minHeight: "100dvh",
        overflowY: "auto",
        paddingTop: headerHidden ? 0 : 52,
        paddingBottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
        transition: "padding-top 200ms ease",
      }}>
        {children}
      </main>
      <MobileBottomNav headerHidden={headerHidden} onToggleHeader={toggleHeader} />
    </div>
  );
}
