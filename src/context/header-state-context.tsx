"use client";

import { createContext, useContext, useEffect, useState } from "react";

const COOKIE_KEY = "fmd_header_hidden";
const EXPANDED_H  = 72; // must match Topbar's EXPANDED_H

function writeCookie(hidden: boolean) {
  document.cookie = `${COOKIE_KEY}=${hidden ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
}

type HeaderStateCtx = {
  headerHidden: boolean;
  toggleHeader: () => void;
};

const HeaderCtx = createContext<HeaderStateCtx>({
  headerHidden: false,
  toggleHeader: () => {},
});

export function HeaderStateProvider({
  children,
  initialHidden,
}: {
  children: React.ReactNode;
  initialHidden: boolean;
}) {
  const [headerHidden, setHeaderHidden] = useState(initialHidden);

  // Keep CSS variable and cookie in sync
  useEffect(() => {
    document.documentElement.style.setProperty("--header-height", `${headerHidden ? 0 : EXPANDED_H}px`);
  }, [headerHidden]);

  function toggleHeader() {
    const next = !headerHidden;
    setHeaderHidden(next);
    writeCookie(next);
    // Keep legacy event listeners (HeaderDivider etc.) in sync
    window.dispatchEvent(new CustomEvent("header-visibility-toggle", { detail: { hidden: next } }));
  }

  return (
    <HeaderCtx.Provider value={{ headerHidden, toggleHeader }}>
      {children}
    </HeaderCtx.Provider>
  );
}

export function useHeaderState() {
  return useContext(HeaderCtx);
}
