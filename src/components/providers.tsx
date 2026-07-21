"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GlobalPageProvider } from "@/context/global-page-context";
import { HeaderStateProvider } from "@/context/header-state-context";
import { UserGate } from "@/components/auth/UserGate";
import { useUser } from "@/context/user-context";
import { SentinelButler } from "@/components/sentinel/sentinel-butler";
import { SentinelSessionProvider } from "@/components/sentinel/sentinel-session-provider";

const LAST_PAGE_KEY = "fmd_last_page";
const RESTORE_FLAG = "fmd_restore";

function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname && pathname !== "/") {
      try { window.localStorage.setItem(LAST_PAGE_KEY, pathname); } catch { /* ignore */ }
    }
  }, [pathname]);
  return null;
}

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

// Inner wrapper — reads user from context, mounts per-user sentinel provider
function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  return (
    <SentinelSessionProvider key={user?.id ?? "anon"} userId={user?.id}>
      <RouteTracker />
      <PageRestorer />
      {children}
      <SentinelButler />
    </SentinelSessionProvider>
  );
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
        <UserGate>
          <AppShell>
            {children}
          </AppShell>
        </UserGate>
      </HeaderStateProvider>
    </GlobalPageProvider>
  );
}
