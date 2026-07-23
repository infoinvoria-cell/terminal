"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";


function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <polyline points="9 21 9 12 15 12 15 21" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconBellRing() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M5.5 2.1A10 10 0 0 0 2.29 6" />
      <path d="M18.5 2.1A10 10 0 0 1 21.71 6" />
    </svg>
  );
}

function IconMessageSquare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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

// Sidebar icons for drop-up
function IconGlobe() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}

function IconGitFork() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/>
      <line x1="6" y1="9" x2="6" y2="15"/><path d="M18 9a9 9 0 0 1-9 9"/>
    </svg>
  );
}

function IconChartColumn() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9"/><rect x="9.5" y="7" width="4" height="14"/>
      <rect x="16" y="3" width="4" height="18"/>
    </svg>
  );
}

function IconPackage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </svg>
  );
}

function IconPieChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
    </svg>
  );
}

function IconNetwork() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
      <line x1="12" y1="7" x2="5.2" y2="17.1"/><line x1="12" y1="7" x2="18.8" y2="17.1"/>
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function IconPanelTop() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/>
    </svg>
  );
}

const SIDEBAR_GROUPS = [
  {
    label: "Navigation",
    items: [
      { href: "/m/home",       label: "Home",        Icon: IconHome },
      { href: "/m/sentinel",   label: "Sentinel",    Icon: IconMessageSquare },
      { href: "/m/brain",      label: "Brain",       Icon: IconGitFork },
      { href: "/globe",        label: "Globe",       Icon: IconGlobe },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/m/signale",    label: "Signale",     Icon: IconBellRing },
      { href: "/m/monitoring", label: "Monitoring",  Icon: IconActivity },
      { href: "/m/analytics",  label: "Analytics",   Icon: IconChartColumn },
    ],
  },
  {
    label: "Manager",
    items: [
      { href: "/m/manager",        label: "Manager",    Icon: IconBriefcase },
      { href: "/m/investors-crm",  label: "Investoren", Icon: IconPieChart },
      { href: "/m/onboarding",     label: "Onboarding", Icon: IconUsers },
      { href: "/vermittler",       label: "Vermittler", Icon: IconNetwork },
    ],
  },
];

const NAV_ITEMS = [
  { href: "/m/home",      label: "Home",       Icon: IconHome          },
  { href: "/m/monitoring", label: "Monitoring", Icon: IconActivity      },
  null, // center layers button
  { href: "/m/signale",   label: "Signale",    Icon: IconBellRing      },
  { href: "/m/sentinel",  label: "Sentinel",   Icon: IconMessageSquare },
];

type Props = {
  headerHidden: boolean;
  onToggleHeader: () => void;
};

export function MobileBottomNav({ headerHidden, onToggleHeader }: Props) {
  const pathname = usePathname();
  const [layersOpen, setLayersOpen] = useState(false);
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Drop-up overlay backdrop */}
      {layersOpen && (
        <div
          onClick={() => setLayersOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 998,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        />
      )}

      {/* Drop-up panel */}
      <div
        style={{
          position: "fixed",
          left: 0, right: 0,
          bottom: `calc(68px + env(safe-area-inset-bottom, 0px) + 20px)`,
          zIndex: 999,
          transform: layersOpen ? "translateY(0)" : "translateY(calc(100% + 20px))",
          transition: "transform 260ms cubic-bezier(0.16,1,0.3,1)",
          background: "linear-gradient(180deg,#1c1d20 0%,#141517 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderBottom: "none",
          borderRadius: "20px 20px 0 0",
          padding: "16px 0 8px",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: "rgba(255,255,255,0.15)",
          margin: "0 auto 16px",
        }} />

        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 8 }}>
            <p style={{
              margin: "0 0 4px",
              padding: "0 20px",
              fontSize: 10, fontWeight: 600,
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              fontFamily: "var(--font-montserrat,sans-serif)",
            }}>
              {group.label}
            </p>
            {group.items.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setLayersOpen(false)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 20px",
                  color: active(href) ? "#ffffff" : "rgba(255,255,255,0.7)",
                  textDecoration: "none",
                  fontSize: 14, fontWeight: active(href) ? 700 : 500,
                  fontFamily: "var(--font-montserrat,sans-serif)",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <Icon />
                {label}
              </Link>
            ))}
          </div>
        ))}

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "8px 20px" }} />

        {/* Header toggle */}
        <button
          onClick={() => { onToggleHeader(); setLayersOpen(false); }}
          style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%",
            padding: "10px 20px",
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.7)", textDecoration: "none",
            fontSize: 14, fontWeight: 500,
            fontFamily: "var(--font-montserrat,sans-serif)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <IconPanelTop />
          Header {headerHidden ? "einblenden" : "ausblenden"}
        </button>

        {/* Settings */}
        <Link
          href="/settings"
          onClick={() => setLayersOpen(false)}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 20px",
            color: active("/settings") ? "#ffffff" : "rgba(255,255,255,0.7)",
            textDecoration: "none",
            fontSize: 14, fontWeight: active("/settings") ? 700 : 500,
            fontFamily: "var(--font-montserrat,sans-serif)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <IconSettings />
          Settings
        </Link>
      </div>

      {/* Bottom nav bar — floating Dynamic Island pill */}
      <div style={{
        position: "fixed",
        bottom: 0, left: 0, right: 0,
        zIndex: 1000,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        pointerEvents: "none",
      }}>
        <nav
          aria-label="Mobile Navigation"
          style={{
            pointerEvents: "auto",
            margin: "0 12px 10px",
            height: 68,
            display: "flex", alignItems: "center",
            background: "rgba(14,15,18,0.93)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            border: "1px solid rgba(255,255,255,0.13)",
            borderRadius: 30,
            boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
            overflow: "hidden",
          } as React.CSSProperties}
        >
          {NAV_ITEMS.map((item) => {
            if (item === null) {
              return (
                <div key="layers" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <button
                    onClick={() => setLayersOpen(v => !v)}
                    aria-label="Alle Seiten"
                    style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: layersOpen ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${layersOpen ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.18)"}`,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: layersOpen ? "#ffffff" : "rgba(255,255,255,0.5)",
                      transition: "background 150ms, border-color 150ms, color 150ms",
                      WebkitTapHighlightColor: "transparent",
                      flexShrink: 0,
                    }}
                  >
                    <IconLayers />
                  </button>
                </div>
              );
            }
            const { href, label, Icon } = item;
            const isActive = active(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setLayersOpen(false)}
                aria-label={label}
                style={{
                  flex: 1,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: 4, height: "100%",
                  color: isActive ? "#ffffff" : "rgba(255,255,255,0.38)",
                  textDecoration: "none",
                  fontSize: 9.5, fontWeight: isActive ? 700 : 400,
                  letterSpacing: "0.04em", textTransform: "uppercase",
                  WebkitTapHighlightColor: "transparent",
                  transition: "color 120ms ease",
                }}
              >
                <Icon />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
