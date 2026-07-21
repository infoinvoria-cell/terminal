"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { APP_USERS, AppUser, CL_USER_KEY, UserProvider } from "@/context/user-context";

const CL_GATE_KEY = "cl_gate_ok";
const AUTH_PATHS = new Set(["/gate", "/select", "/intro"]);

export function UserGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    setReady(false);
    try {
      const gateOk = localStorage.getItem(CL_GATE_KEY) === "1";
      const userId = localStorage.getItem(CL_USER_KEY) as AppUser["id"] | null;
      const resolvedUser = userId ? (APP_USERS.find(u => u.id === userId) ?? null) : null;

      if (!AUTH_PATHS.has(pathname)) {
        if (!gateOk) { router.replace("/gate"); return; }
        if (!resolvedUser) { router.replace("/select"); return; }
      }

      setUser(resolvedUser);
      setReady(true);
    } catch {
      setReady(true);
    }
  }, [pathname, router]);

  if (!ready) return null;
  return <UserProvider initialUser={user}>{children}</UserProvider>;
}
