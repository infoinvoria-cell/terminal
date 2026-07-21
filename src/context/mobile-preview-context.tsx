"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type PreviewMode = "desktop" | "mobile" | "split";
const LS_KEY = "fmd_preview_mode";

type Ctx = { mode: PreviewMode; cycle: () => void };
const Context = createContext<Ctx>({ mode: "desktop", cycle: () => {} });

export function MobilePreviewProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<PreviewMode>("desktop");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY) as PreviewMode | null;
      if (stored === "mobile" || stored === "split") setMode(stored);
    } catch { /* ignore */ }
  }, []);

  const cycle = () => {
    setMode((prev) => {
      const next: PreviewMode = prev === "desktop" ? "mobile" : prev === "mobile" ? "split" : "desktop";
      try { localStorage.setItem(LS_KEY, next); } catch { /* ignore */ }
      return next;
    });
  };

  return <Context.Provider value={{ mode, cycle }}>{children}</Context.Provider>;
}

export function useMobilePreview() {
  return useContext(Context);
}
