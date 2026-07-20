"use client";

import { useEffect, useState } from "react";

const HEADER_HIDDEN_KEY = "fmd_header_hidden";

export function HeaderDivider() {
  const [hidden,  setHidden]  = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(HEADER_HIDDEN_KEY) === "1") setHidden(true);
    } catch { /* ignore */ }
    setMounted(true);

    const onVisibility = (e: CustomEvent<{ hidden: boolean }>) => setHidden(e.detail.hidden);
    window.addEventListener("header-visibility-toggle", onVisibility as EventListener);
    return () => window.removeEventListener("header-visibility-toggle", onVisibility as EventListener);
  }, []);

  return (
    <div
      aria-hidden
      style={{
        height: hidden ? 0 : 9,
        overflow: "hidden",
        flexShrink: 0,
        transition: mounted ? "height 200ms ease" : "none",
      }}
    >
      <div className="mx-8 my-1 h-px bg-gradient-to-r from-transparent via-[#e2ca7a]/65 to-transparent" />
    </div>
  );
}
