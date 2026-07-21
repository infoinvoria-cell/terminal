"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

// data-mobile-version="capitalife-bottom-nav-v1"
// Adapted from Invoria MobileBottomNav (bottom-nav-final-v3):
// same raised-center-circle pattern, Sentinel.png as center, /m/* routes.

async function fetchLiveCount(): Promise<number> {
  let count = 0;
  await Promise.all(
    (["agrar", "intraday", "indices"] as const).map(async (g) => {
      try {
        const r = await fetch(`/generated/monitoring/wave1/${g}/signals.json`, { cache: "no-store" });
        if (!r.ok) return;
        const rows = await r.json();
        if (Array.isArray(rows)) {
          rows.forEach((s: { open_position?: boolean }) => { if (s.open_position) count++; });
        }
      } catch { /* ignore */ }
    })
  );
  return count;
}

function IconHome() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <polyline points="9 21 9 12 15 12 15 21" />
    </svg>
  );
}

function IconSignale() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="4" y2="14" />
      <rect x="2.5" y="8.5" width="3" height="4" rx="0.5" fill="currentColor" fillOpacity="0.45" />
      <line x1="9" y1="4" x2="9" y2="13" />
      <rect x="7.5" y="6" width="3" height="5" rx="0.5" fill="currentColor" fillOpacity="0.45" />
      <line x1="14.5" y1="8" x2="14.5" y2="16" />
      <rect x="13" y="10" width="3" height="4" rx="0.5" fill="currentColor" fillOpacity="0.45" />
      <line x1="20" y1="5" x2="20" y2="12" />
      <rect x="18.5" y="7" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.45" />
      <line x1="2" y1="19.5" x2="22" y2="19.5" strokeOpacity="0.25" />
    </svg>
  );
}

function IconBrain() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-4.78 3 3 0 0 1 .36-5.58 2.5 2.5 0 0 1 3.17-3.68z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-4.78 3 3 0 0 0-.36-5.58 2.5 2.5 0 0 0-3.17-3.68z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const GOLD = "#e2ca7a";

export function MobileBottomNav() {
  const pathname = usePathname();
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    fetchLiveCount().then(setLiveCount);
  }, []);

  const active = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const itemStyle = (isAct: boolean): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    padding: "8px 0 6px",
    flex: 1,
    background: "none",
    border: "none",
    color: isAct ? GOLD : "rgba(255,255,255,0.36)",
    fontSize: 9,
    fontWeight: isAct ? 700 : 400,
    letterSpacing: "0.02em",
    cursor: "pointer",
    textDecoration: "none",
    WebkitTapHighlightColor: "transparent",
  });

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-end",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "rgba(8,8,10,0.94)",
        backdropFilter: "blur(28px) saturate(1.8)",
        WebkitBackdropFilter: "blur(28px) saturate(1.8)",
        borderTop: `1px solid ${GOLD}22`,
        boxSizing: "border-box",
      }}
      aria-label="Mobile Navigation"
      data-mobile-version="capitalife-bottom-nav-v1"
    >
      {/* Home */}
      <Link href="/m/home" style={itemStyle(active("/m/home"))} aria-label="Home">
        <IconHome />
        <span>Home</span>
      </Link>

      {/* Signale — with live badge */}
      <Link href="/m/signale" style={{ ...itemStyle(active("/m/signale")), position: "relative" }} aria-label="Signale">
        <span style={{ position: "relative", display: "inline-flex" }}>
          <IconSignale />
          {liveCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -6,
                minWidth: 14,
                height: 14,
                borderRadius: 999,
                background: "#b8962e",
                color: "#fff",
                fontSize: 7.5,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 2px",
                lineHeight: 1,
                border: "1.5px solid rgba(8,8,10,0.9)",
              }}
            >
              {liveCount}
            </span>
          )}
        </span>
        <span>Signale</span>
      </Link>

      {/* Sentinel — raised center circle */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
        <Link
          href="/m/sentinel"
          aria-label="Sentinel"
          style={{
            position: "relative",
            top: -14,
            width: 52,
            height: 52,
            borderRadius: 999,
            background: `radial-gradient(circle at 50% 35%, #1a1c20 0%, #0c0d10 100%)`,
            border: `1px solid ${GOLD}4d`,
            boxShadow: `0 6px 18px rgba(0,0,0,0.55), 0 0 0 4px rgba(8,8,10,0.94)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Image
            src="/Sentinel.png"
            alt="Sentinel"
            width={30}
            height={30}
            style={{
              objectFit: "contain",
              borderRadius: "50%",
              opacity: active("/m/sentinel") ? 1 : 0.72,
              filter: active("/m/sentinel") ? `drop-shadow(0 0 6px ${GOLD}60)` : "grayscale(0.3) brightness(0.85)",
            }}
          />
        </Link>
      </div>

      {/* Brain */}
      <Link href="/m/brain" style={itemStyle(active("/m/brain"))} aria-label="Brain">
        <IconBrain />
        <span>Brain</span>
      </Link>

      {/* Settings */}
      <Link href="/m/settings" style={itemStyle(active("/m/settings"))} aria-label="Settings">
        <IconSettings />
        <span>Settings</span>
      </Link>
    </nav>
  );
}
