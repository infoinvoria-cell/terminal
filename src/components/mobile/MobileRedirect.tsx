"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Viewport-width based routing between the desktop app and the (mobile)/m shell.
// < 768px  → send the user to the matching /m/* page.
// >= 768px → if the user is on a /m/* page, send them back to the desktop page.
// Mounted once in the root layout. Renders nothing. Desktop pages/components are
// untouched — this only performs client-side navigation based on window width.

const MOBILE_MAX = 767; // < 768px counts as mobile (matches useDevice)

const isMobilePath = (p: string) => p === "/m" || p.startsWith("/m/");

function desktopToMobile(p: string): string {
  if (isMobilePath(p)) return "";
  if (p === "/") return "/m/home";
  if (p.startsWith("/sentinel")) return "/m/sentinel";
  if (p.startsWith("/signal")) return "/m/signale";
  if (p.startsWith("/brain")) return "/m/brain";
  if (p.startsWith("/settings")) return "/m/settings";
  // Any other desktop route has no dedicated mobile page → land on Home.
  return "/m/home";
}

function mobileToDesktop(p: string): string {
  if (!isMobilePath(p)) return "";
  if (p.startsWith("/m/sentinel")) return "/sentinel";
  if (p.startsWith("/m/signale")) return "/signal";
  if (p.startsWith("/m/brain")) return "/brain-graph";
  if (p.startsWith("/m/settings")) return "/settings";
  return "/";
}

export function MobileRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname) return;

    const evaluate = () => {
      const isMobileWidth = window.innerWidth <= MOBILE_MAX;
      if (isMobileWidth) {
        const target = desktopToMobile(pathname);
        if (target && target !== pathname) router.replace(target);
      } else {
        const target = mobileToDesktop(pathname);
        if (target && target !== pathname) router.replace(target);
      }
    };

    evaluate();

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(evaluate);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [pathname, router]);

  return null;
}
