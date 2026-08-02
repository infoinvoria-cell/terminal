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

// Fire once on app mount: ping Flask, auto-start if offline (local dev only).
function FlaskAutoStart() {
  useEffect(() => {
    fetch("/api/start-services")
      .then((r) => r.json() as Promise<{ ok: boolean }>)
      .then((d) => {
        if (!d.ok) {
          fetch("/api/start-services", { method: "POST" }).catch(() => null);
        }
      })
      .catch(() => {
        fetch("/api/start-services", { method: "POST" }).catch(() => null);
      });
  }, []);
  return null;
}

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
      <FlaskAutoStart />
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
