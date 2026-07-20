"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, GitFork, Home, Settings } from "lucide-react";
import { useDevice } from "./useDevice";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Signale", href: "/signal", icon: BellRing },
  { label: "Sentinel", href: "/sentinel", icon: null },
  { label: "Brain", href: "/brain", icon: GitFork },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

function isRouteActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNavigation() {
  const pathname = usePathname();
  const { isMobile } = useDevice();

  if (!isMobile) return null;

  return (
    <nav
      aria-label="Mobile Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-[1000] flex h-[calc(64px+env(safe-area-inset-bottom))] items-start border-t border-white/[0.08] bg-[#08090b]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_48px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
    >
      {NAV_ITEMS.map(({ label, href, icon: Icon }, index) => {
        const active = isRouteActive(pathname, href);
        const isCenter = index === 2;

        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`group relative flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 font-[family-name:var(--font-nunito)] text-[9px] font-semibold tracking-[0.02em] [-webkit-tap-highlight-color:transparent] ${active ? "text-[#e2ca7a]" : "text-zinc-600 active:text-zinc-300"}`}
          >
            {isCenter ? (
              <span className={`absolute -top-3 grid h-[50px] w-[50px] place-items-center rounded-full border bg-[radial-gradient(circle_at_50%_30%,#202228,#0b0c0f_72%)] shadow-[0_7px_20px_rgba(0,0,0,0.62),0_0_0_5px_rgba(8,9,11,0.95)] ${active ? "border-[#e2ca7a]/60" : "border-[#e2ca7a]/30"}`}>
                <Image
                  src="/Sentinel.png"
                  alt=""
                  width={24}
                  height={24}
                  className={`h-6 w-6 object-contain transition-opacity ${active ? "opacity-100" : "opacity-65"}`}
                />
              </span>
            ) : Icon ? (
              <Icon className="h-5 w-5" strokeWidth={1.65} />
            ) : null}
            <span className={isCenter ? "mt-8" : undefined}>{label}</span>
            {active && !isCenter ? <span className="absolute top-0 h-px w-7 bg-[#e2ca7a] shadow-[0_0_10px_rgba(226,202,122,0.55)]" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
