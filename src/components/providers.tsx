"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GlobalPageProvider } from "@/context/global-page-context";
import { HeaderStateProvider } from "@/context/header-state-context";
import { SupabaseAuthGate } from "@/components/auth/SupabaseAuthGate";
import { SentinelButler } from "@/components/sentinel/sentinel-butler";
import { SentinelSessionProvider } from "@/components/sentinel/sentinel-session-provider";

const LAST_PAGE_KEY = "fmd_last_page";
const RESTORE_FLAG = "fmd_restore";

// Saves current path to localStorage on every navigation (skips root)
function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname && pathname !== "/") {
      try { window.localStorage.setItem(LAST_PAGE_KEY, pathname); } catch { /* ignore */ }
    }
  }, [pathname]);
  return null;
}

// After a logo-triggered hard nav to /, restores the last non-root page
function PageRestorer() {
  const router = useRouter();
  useEffect(() => {
    try {
      const shouldRestore = window.sessionStorage.getItem(RESTORE_FLAG) === "1";
      if (!shouldRestore) return;
      window.sessionStorage.removeItem(RESTORE_FLAG);
      const last = window.localStorage.getItem(LAST_PAGE_KEY);
      if (last && last !== "/") router.replace(last);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function ClientProviders({
  children,
  initialHeaderHidden,
}: {
  children: React.ReactNode;
  initialHeaderHidden: boolean;
}) {
  return (
    <GlobalPageProvider>
      <HeaderStateProvider initialHidden={initialHeaderHidden}>
        <SentinelSessionProvider>
          <SupabaseAuthGate>
            <RouteTracker />
            <PageRestorer />
            {children}
            <SentinelButler />
          </SupabaseAuthGate>
        </SentinelSessionProvider>
      </HeaderStateProvider>
    </GlobalPageProvider>
  );
}
