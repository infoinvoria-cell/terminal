"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export interface LoadingContextValue {
  isLoading: boolean;
  setLoading: (loading: boolean, key?: string) => void;
}

const LoadingCtx = createContext<LoadingContextValue>({
  isLoading: false,
  setLoading: () => {},
});

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect page navigation via pathname change
  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;
    setKeys(prev => new Set([...prev, "__nav"]));
    if (navTimer.current) clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => {
      setKeys(prev => { const n = new Set(prev); n.delete("__nav"); return n; });
    }, 700);
  }, [pathname]);

  // Global event bus for in-page loading (backtest, fetch, etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      const { loading, key = "__page" } = (e as CustomEvent<{ loading: boolean; key?: string }>).detail;
      setKeys(prev => {
        const n = new Set(prev);
        if (loading) n.add(key); else n.delete(key);
        return n;
      });
    };
    window.addEventListener("capitalife-loading", handler);
    return () => window.removeEventListener("capitalife-loading", handler);
  }, []);

  const setLoading = useCallback((loading: boolean, key = "__page") => {
    setKeys(prev => {
      const n = new Set(prev);
      if (loading) n.add(key); else n.delete(key);
      return n;
    });
  }, []);

  return (
    <LoadingCtx.Provider value={{ isLoading: keys.size > 0, setLoading }}>
      {children}
    </LoadingCtx.Provider>
  );
}

export function useLoading() {
  return useContext(LoadingCtx);
}

/** Usable outside React components */
export function emitLoading(loading: boolean, key = "__page") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("capitalife-loading", { detail: { loading, key } }));
}
