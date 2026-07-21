"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { APP_USERS, AppUser, CL_USER_KEY } from "@/context/user-context";
import IntroAnimation from "@/components/intro/IntroAnimation";

const CL_GATE_KEY = "cl_gate_ok";
const USER_LABELS = ["User 1", "User 2", "User 3"] as const;

function UserCard({ user, label, index, onSelect }: {
  user: AppUser; label: string; index: number; onSelect: (user: AppUser) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const pendingRef = useRef<AppUser | null>(null);

  function handleClick() {
    if (playing) return;
    pendingRef.current = user;
    setPlaying(true);
  }

  return (
    <>
      {playing && (
        <IntroAnimation
          forcePlay
          onComplete={() => {
            setPlaying(false);
            if (pendingRef.current) onSelect(pendingRef.current);
          }}
        />
      )}
      <button
        onClick={handleClick}
        disabled={playing}
        aria-label={label}
        style={{
          background: "none", border: "none", padding: 0,
          cursor: playing ? "default" : "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
          transition: "transform 0.2s, opacity 0.2s",
          opacity: playing ? 0.5 : 1,
        }}
        onMouseEnter={(e) => { if (!playing) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.06)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
      >
        <div style={{ marginBottom: 18, width: 100, height: 100, borderRadius: "50%", overflow: "hidden" }}>
          <Image
            src={index === 0 ? "/profile.png" : "/profile_jeroen.png"}
            alt={user.name}
            width={100}
            height={100}
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
          />
        </div>
        <span style={{ color: "#f0e6c8", fontSize: 15, fontWeight: 700, fontFamily: "var(--font-montserrat, sans-serif)", letterSpacing: "0.03em", lineHeight: 1, marginBottom: 7 }}>
          {label}
        </span>
        <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 13, fontWeight: 500, lineHeight: 1 }}>
          {user.name}
        </span>
      </button>
    </>
  );
}

export default function SelectPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(CL_GATE_KEY) !== "1") { router.replace("/gate"); return; }
      const userId = localStorage.getItem(CL_USER_KEY) as AppUser["id"] | null;
      const user = userId ? (APP_USERS.find(u => u.id === userId) ?? null) : null;
      if (user) { router.replace("/"); return; }
    } catch { /* ignore */ }
    setReady(true);
  }, [router]);

  function handleSelect(user: AppUser) {
    try { localStorage.setItem(CL_USER_KEY, user.id); } catch { /* ignore */ }
    router.push("/");
  }

  if (!ready) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 72 }}>
        {APP_USERS.map((user, i) => (
          <UserCard key={user.id} user={user} label={USER_LABELS[i]} index={i} onSelect={handleSelect} />
        ))}
      </div>
    </div>
  );
}
