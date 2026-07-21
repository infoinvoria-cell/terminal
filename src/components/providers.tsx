"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { GlobalPageProvider } from "@/context/global-page-context";
import { HeaderStateProvider } from "@/context/header-state-context";
import { UserGate } from "@/components/auth/UserGate";
import { useUser } from "@/context/user-context";
import { SentinelButler } from "@/components/sentinel/sentinel-butler";
import { SentinelSessionProvider } from "@/components/sentinel/sentinel-session-provider";

const LAST_PAGE_KEY = "fmd_last_page";

function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname && pathname !== "/") {
      try { window.localStorage.setItem(LAST_PAGE_KEY, pathname); } catch { /* ignore */ }
    }
  }, [pathname]);
  return null;
}

// Inner wrapper — reads user from context, mounts per-user sentinel provider
function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  return (
    <SentinelSessionProvider key={user?.id ?? "anon"} userId={user?.id}>
      <RouteTracker />
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
