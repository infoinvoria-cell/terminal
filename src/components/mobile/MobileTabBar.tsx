"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Radio, Bot, Brain, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Dedicated mobile bottom navigation for the (mobile)/m shell.
// Fully separate from the desktop chrome — 5 tabs, always fixed to the bottom.
// Active state uses the Capitalife gold accent (#e2ca7a).

const GOLD = "#e2ca7a";

type Tab = { href: string; label: string; icon: LucideIcon };

const TABS: Tab[] = [
  { href: "/m/home", label: "Home", icon: Home },
  { href: "/m/signale", label: "Signale", icon: Radio },
  { href: "/m/sentinel", label: "Sentinel", icon: Bot },
  { href: "/m/brain", label: "Brain", icon: Brain },
  { href: "/m/settings", label: "Settings", icon: Settings },
];

export function MobileTabBar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Mobile Navigation"
      data-mobile-tabbar="v1"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "stretch",
        background: "rgba(12,13,16,0.94)",
        backdropFilter: "blur(24px) saturate(1.6)",
        WebkitBackdropFilter: "blur(24px) saturate(1.6)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxSizing: "border-box",
      }}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "9px 0 8px",
              textDecoration: "none",
              color: active ? GOLD : "rgba(255,255,255,0.42)",
              WebkitTapHighlightColor: "transparent",
              transition: "color 140ms ease",
            }}
          >
            <Icon size={21} strokeWidth={active ? 2.1 : 1.7} />
            <span
              style={{
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                letterSpacing: "0.01em",
                fontFamily: "var(--font-nunito), sans-serif",
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
