"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const GOLD = "#e2ca7a";

// Same icons as desktop sidebar (lucide-style SVG)
function IconActivity() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
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

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <polyline points="9 21 9 12 15 12 15 21" />
    </svg>
  );
}

function IconBellRing() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <line x1="2" y1="8" x2="2" y2="8" />
      <path d="M5.5 2.1A10 10 0 0 0 2.29 6" />
      <path d="M18.5 2.1A10 10 0 0 1 21.71 6" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/monitoring",  label: "Monitoring", Icon: IconActivity      },
  { href: "/m/sentinel",  label: "Sentinel",   Icon: IconMessageSquare },
  { href: "/m/home",      label: "Home",       Icon: IconHome          },
  { href: "/m/signale",   label: "Signale",    Icon: IconBellRing      },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        height: `calc(60px + env(safe-area-inset-bottom, 0px))`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "rgba(8,8,10,0.96)",
        backdropFilter: "blur(24px) saturate(1.8)",
        WebkitBackdropFilter: "blur(24px) saturate(1.8)",
        borderTop: `1px solid rgba(226,202,122,0.14)`,
        boxSizing: "border-box",
      }}
      aria-label="Mobile Navigation"
      data-mobile-version="capitalife-bottom-nav-v3"
    >
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive = active(href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              height: "100%",
              color: isActive ? GOLD : "rgba(255,255,255,0.4)",
              textDecoration: "none",
              fontSize: 9.5,
              fontWeight: isActive ? 700 : 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
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
  );
}
