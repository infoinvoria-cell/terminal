"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useIsMobile } from "./useIsMobile";
import { MobileLiveView } from "./MobileLiveView";

// data-mobile-version="bottom-nav-final-v3"

// Count open_position=true across all 3 wave1 groups
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

function IconMonitoring() {
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

function IconPortfolio() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <line x1="12" y1="7" x2="5" y2="16" />
      <line x1="12" y1="7" x2="19" y2="16" />
      <line x1="7" y1="18" x2="17" y2="18" strokeOpacity="0.35" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// Stacked-layers icon for the central global-navigation circle
function IconLayers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 22 8.5 12 15 2 8.5 12 2" />
      <polyline points="2 14 12 20.5 22 14" />
    </svg>
  );
}

// ─── Global navigation sheet (opened by the central layer circle) ───────────────

type NavTarget = { label: string; href?: string; action?: "live" | "refresh"; icon: React.ReactNode };

function navIcon(d: string) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function GlobalNavSheet({ onClose, onLive, liveCount }: { onClose: () => void; onLive: () => void; liveCount: number }) {
  const router = useRouter();
  const targets: NavTarget[] = [
    { label: "Monitoring", href: "/monitoring", icon: navIcon("M3 12h4l3-8 4 16 3-8h4") },
    { label: "Portfolio", href: "/portfolio", icon: navIcon("M3 3v18h18 M7 14l4-4 3 3 5-6") },
    { label: "Live Signale", action: "live", icon: navIcon("M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0") },
    { label: "Sentinel", href: "/sentinel", icon: navIcon("M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z") },
    { label: "Seasonality", href: "/seasonality", icon: navIcon("M8 2v4 M16 2v4 M3 10h18 M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z") },
    { label: "Track Record", href: "/track-record", icon: navIcon("M3 3v18h18 M7 16l4-6 3 3 5-8") },
    { label: "Aktualisieren", action: "refresh", icon: navIcon("M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15") },
  ];

  const go = (t: NavTarget) => {
    if (t.action === "live") { onClose(); onLive(); return; }
    if (t.action === "refresh") { onClose(); window.location.reload(); return; }
    if (t.href) { onClose(); router.push(t.href); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2100, display: "flex", flexDirection: "column" }} data-mobile-version="bottom-nav-final-v3">
      <div style={{ flex: 1, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div
        style={{
          background: "#090a0c",
          borderTop: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "18px 18px 0 0",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.16)" }} />
        </div>
        <div style={{ padding: "6px 16px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.34)" }}>
          Navigation
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "8px 14px 4px" }}>
          {targets.map((t) => (
            <button
              key={t.label}
              onClick={() => go(t)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10, padding: "11px 12px",
                color: "rgba(255,255,255,0.82)", cursor: "pointer",
                WebkitTapHighlightColor: "transparent", textAlign: "left",
              }}
            >
              <span style={{ color: "rgba(232,208,122,0.85)", display: "inline-flex", flexShrink: 0 }}>{t.icon}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600 }}>{t.label}</span>
              {t.action === "live" && liveCount > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 700, background: "rgba(184,150,46,0.18)", border: "1px solid rgba(184,150,46,0.35)", color: "#b8962e", borderRadius: 999, padding: "1px 6px" }}>
                  {liveCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 16px 2px", fontSize: 8, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
          Research only · Keine Trading-Freigabe · Keine Approved-Freigabe
        </div>
      </div>
    </div>
  );
}

// ─── Live slide-up sheet ────────────────────────────────────────────────────────

function LiveSheet({ onClose, liveCount }: { onClose: () => void; liveCount: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div
        style={{
          background: "#090a0c",
          borderTop: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "18px 18px 0 0",
          maxHeight: "82dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          style={{
            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.88)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Live Signale
            </span>
            {liveCount > 0 && (
              <span style={{ fontSize: 9, fontWeight: 700, background: "rgba(184,150,46,0.18)", border: "1px solid rgba(184,150,46,0.35)", color: "#b8962e", borderRadius: 999, padding: "1px 7px" }}>
                {liveCount} offen
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.36)", cursor: "pointer", padding: "4px 8px", fontSize: 18, lineHeight: 1 }}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}>
          <MobileLiveView />
        </div>
      </div>
    </div>
  );
}

export function MobileBottomNav() {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const [liveCount, setLiveCount] = useState<number>(0);
  const [liveOpen, setLiveOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    fetchLiveCount().then(setLiveCount);
  }, []);

  useEffect(() => {
    const handler = () => setLiveOpen(true);
    window.addEventListener("invoria-mobile-live-open", handler);
    return () => window.removeEventListener("invoria-mobile-live-open", handler);
  }, []);

  const handleLive = useCallback(() => setLiveOpen(true), []);

  if (!isMobile) return null;

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
    color: isAct ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.36)",
    fontSize: 9,
    fontWeight: isAct ? 600 : 400,
    letterSpacing: "0.02em",
    cursor: "pointer",
    textDecoration: "none",
    WebkitTapHighlightColor: "transparent",
  });

  return (
    <>
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
          borderTop: "1px solid rgba(255,255,255,0.07)",
          boxSizing: "border-box",
        }}
        aria-label="Mobile Navigation"
        data-mobile-version="bottom-nav-final-v3"
      >
        {/* Sentinel */}
        <Link href="/sentinel" style={itemStyle(active("/sentinel"))} aria-label="Sentinel">
          <Image
            src="/Sentinel.png"
            alt="Sentinel"
            width={22}
            height={22}
            style={{
              opacity: active("/sentinel") ? 1 : 0.38,
              objectFit: "contain",
              filter: active("/sentinel") ? "none" : "grayscale(0.6) brightness(0.7)",
            }}
          />
          <span>Sentinel</span>
        </Link>

        {/* Monitoring */}
        <Link href="/monitoring" style={itemStyle(active("/monitoring"))} aria-label="Monitoring">
          <IconMonitoring />
          <span>Monitoring</span>
        </Link>

        {/* Center: global navigation layer-circle (no text) */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Navigation öffnen"
            style={{
              position: "relative",
              top: -14,
              width: 52,
              height: 52,
              borderRadius: 999,
              background: "radial-gradient(circle at 50% 35%, #1a1c20 0%, #0c0d10 100%)",
              border: "1px solid rgba(232,208,122,0.30)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.55), 0 0 0 4px rgba(8,8,10,0.94)",
              color: navOpen ? "#e8d07a" : "rgba(232,208,122,0.78)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <IconLayers />
          </button>
        </div>

        {/* Portfolio */}
        <Link href="/portfolio" style={itemStyle(active("/portfolio"))} aria-label="Portfolio">
          <IconPortfolio />
          <span>Portfolio</span>
        </Link>

        {/* Live */}
        <button
          style={{ ...itemStyle(liveOpen) } as React.CSSProperties}
          onClick={handleLive}
          aria-label="Live Signale"
        >
          <span style={{ position: "relative", display: "inline-flex" }}>
            <IconBell />
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
          <span>Live</span>
        </button>
      </nav>

      {liveOpen && <LiveSheet onClose={() => setLiveOpen(false)} liveCount={liveCount} />}
      {navOpen && <GlobalNavSheet onClose={() => setNavOpen(false)} onLive={handleLive} liveCount={liveCount} />}
    </>
  );
}
