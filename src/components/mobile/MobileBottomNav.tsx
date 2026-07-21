"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

const GOLD = "#e2ca7a";
const NAV_H = 76; // nav bar height in px (excl. safe area)

async function fetchLiveCount(): Promise<number> {
  let count = 0;
  await Promise.all(
    (["agrar", "intraday", "indices"] as const).map(async (g) => {
      try {
        const r = await fetch(`/generated/monitoring/wave1/${g}/signals.json`, { cache: "no-store" });
        if (!r.ok) return;
        const rows = await r.json();
        if (Array.isArray(rows)) rows.forEach((s: { open_position?: boolean }) => { if (s.open_position) count++; });
      } catch { /* ignore */ }
    })
  );
  return count;
}

// ── Icons ──────────────────────────────────────────────────────────────────

function IconMonitoring() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconSentinel() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-4.78 3 3 0 0 1 .36-5.58 2.5 2.5 0 0 1 3.17-3.68z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-4.78 3 3 0 0 0-.36-5.58 2.5 2.5 0 0 0-3.17-3.68z" />
    </svg>
  );
}

function IconSignale() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="4" y2="14" />
      <rect x="2.5" y="8.5" width="3" height="4" rx="0.5" fill="currentColor" fillOpacity="0.45" />
      <line x1="9" y1="4" x2="9" y2="13" />
      <rect x="7.5" y="6" width="3" height="5" rx="0.5" fill="currentColor" fillOpacity="0.45" />
      <line x1="14.5" y1="8" x2="14.5" y2="16" />
      <rect x="13" y="10" width="3" height="4" rx="0.5" fill="currentColor" fillOpacity="0.45" />
      <line x1="20" y1="5" x2="20" y2="12" />
      <rect x="18.5" y="7" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.45" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
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

// ── Nav item styles ────────────────────────────────────────────────────────

function navItem(isActive: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flex: 1,
    paddingTop: 10,
    paddingBottom: 8,
    background: "none",
    border: "none",
    color: isActive ? GOLD : "rgba(255,255,255,0.42)",
    fontSize: 9.5,
    fontWeight: isActive ? 700 : 400,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    cursor: "pointer",
    textDecoration: "none",
    WebkitTapHighlightColor: "transparent",
    transition: "color 120ms ease",
  };
}

// ── Dropdown menu items ────────────────────────────────────────────────────

const DROPDOWN_ITEMS = [
  { href: "/m/brain",    label: "Brain",    Icon: IconBrain    },
  { href: "/m/settings", label: "Settings", Icon: IconSettings },
];

// ── Component ─────────────────────────────────────────────────────────────

export function MobileBottomNav() {
  const pathname = usePathname();
  const [liveCount, setLiveCount] = useState(0);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchLiveCount().then(setLiveCount); }, []);

  // Close dropdown on outside tap
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: TouchEvent | MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener("touchstart", handler);
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("mousedown", handler);
    };
  }, [dropOpen]);

  // Close dropdown on route change
  useEffect(() => { setDropOpen(false); }, [pathname]);

  const active = (path: string) => pathname === path || pathname.startsWith(path + "/");
  const anyDropActive = DROPDOWN_ITEMS.some(i => active(i.href));

  return (
    <>
      {/* ── Dropdown sheet ──────────────────────────────────────────── */}
      <div
        ref={dropRef}
        style={{
          position: "fixed",
          bottom: `calc(${NAV_H}px + env(safe-area-inset-bottom, 0px))`,
          left: 0,
          right: 0,
          zIndex: 999,
          background: "rgba(10,10,13,0.97)",
          backdropFilter: "blur(24px) saturate(1.6)",
          WebkitBackdropFilter: "blur(24px) saturate(1.6)",
          borderTop: `1px solid rgba(226,202,122,0.15)`,
          borderBottom: "none",
          padding: "10px 0 6px",
          transform: dropOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 220ms cubic-bezier(0.4,0,0.2,1)",
          pointerEvents: dropOpen ? "auto" : "none",
        }}
      >
        {DROPDOWN_ITEMS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 28px",
              color: active(href) ? GOLD : "rgba(255,255,255,0.72)",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: active(href) ? 700 : 500,
              letterSpacing: "0.01em",
              WebkitTapHighlightColor: "transparent",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <Icon />
            {label}
            {active(href) && (
              <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: GOLD }} />
            )}
          </Link>
        ))}
      </div>

      {/* ── Main nav bar ────────────────────────────────────────────── */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          height: `calc(${NAV_H}px + env(safe-area-inset-bottom, 0px))`,
          display: "flex",
          alignItems: "flex-start",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingTop: 0,
          background: "rgba(8,8,10,0.96)",
          backdropFilter: "blur(32px) saturate(1.9)",
          WebkitBackdropFilter: "blur(32px) saturate(1.9)",
          borderTop: `1.5px solid ${GOLD}28`,
          boxSizing: "border-box",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
        }}
        aria-label="Mobile Navigation"
        data-mobile-version="capitalife-bottom-nav-v2"
      >
        {/* 1 — Monitoring */}
        <Link href="/monitoring" style={navItem(active("/monitoring"))} aria-label="Monitoring">
          <IconMonitoring />
          <span>Monitoring</span>
        </Link>

        {/* 2 — Sentinel */}
        <Link href="/m/sentinel" style={navItem(active("/m/sentinel"))} aria-label="Sentinel">
          <IconSentinel />
          <span>Sentinel</span>
        </Link>

        {/* 3 — Home (raised circle center) */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 0 }}>
          <Link
            href="/m/home"
            aria-label="Home"
            style={{
              position: "relative",
              top: -20,
              width: 58,
              height: 58,
              borderRadius: "50%",
              background: "radial-gradient(circle at 50% 35%, #1e2024 0%, #0c0d10 100%)",
              border: `1.5px solid ${GOLD}55`,
              boxShadow: `0 0 0 5px rgba(8,8,10,0.96), 0 8px 24px rgba(0,0,0,0.65), 0 0 16px rgba(226,202,122,0.10)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              WebkitTapHighlightColor: "transparent",
              flexShrink: 0,
            }}
          >
            <Image
              src="/CAPITALIFE_ICON.png"
              alt="Home"
              width={32}
              height={32}
              style={{
                objectFit: "contain",
                opacity: active("/m/home") ? 1 : 0.65,
                filter: active("/m/home")
                  ? `drop-shadow(0 0 7px ${GOLD}70)`
                  : "grayscale(0.25) brightness(0.8)",
                transition: "opacity 150ms, filter 150ms",
              }}
            />
          </Link>
        </div>

        {/* 4 — Livesignale */}
        <Link
          href="/m/signale"
          style={{ ...navItem(active("/m/signale")), position: "relative" }}
          aria-label="Livesignale"
        >
          <span style={{ position: "relative", display: "inline-flex" }}>
            <IconSignale />
            {liveCount > 0 && (
              <span style={{
                position: "absolute", top: -4, right: -7,
                minWidth: 14, height: 14, borderRadius: 999,
                background: "#c0881a", color: "#fff",
                fontSize: 7.5, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 2px", lineHeight: 1,
                border: "1.5px solid rgba(8,8,10,0.95)",
              }}>
                {liveCount}
              </span>
            )}
          </span>
          <span>Livesignale</span>
        </Link>

        {/* 5 — Layers / Mehr */}
        <button
          type="button"
          onClick={() => setDropOpen(v => !v)}
          style={{
            ...navItem(dropOpen || anyDropActive),
            color: dropOpen
              ? GOLD
              : anyDropActive
              ? GOLD
              : "rgba(255,255,255,0.42)",
          }}
          aria-label="Mehr Seiten"
          aria-expanded={dropOpen}
        >
          <span style={{
            display: "inline-flex",
            transition: "transform 200ms ease",
            transform: dropOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}>
            <IconLayers />
          </span>
          <span>Mehr</span>
        </button>
      </nav>
    </>
  );
}
