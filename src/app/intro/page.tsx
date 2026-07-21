"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_USERS, AppUser, CL_USER_KEY } from "@/context/user-context";
import IntroAnimation from "@/components/intro/IntroAnimation";

const CL_GATE_KEY = "cl_gate_ok";

export default function IntroPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(CL_GATE_KEY) !== "1") { router.replace("/gate"); return; }
      const userId = localStorage.getItem(CL_USER_KEY) as AppUser["id"] | null;
      const user = userId ? (APP_USERS.find(u => u.id === userId) ?? null) : null;
      if (!user) { router.replace("/select"); return; }
    } catch { /* ignore */ }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000" }}>
      <IntroAnimation forcePlay onComplete={() => router.push("/")} />
    </div>
  );
}
