"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const MOBILE_MAX = 767;

const isMobilePath = (p: string) => p === "/m" || p.startsWith("/m/");

export function desktopToMobile(p: string): string {
  if (p.startsWith("/about/inno")) return "/m/about/inno";
  if (p.startsWith("/about")) return "/m/about";
  if (p.startsWith("/sentinel")) return "/m/sentinel";
  if (p.startsWith("/signal")) return "/m/signale";
  if (p.startsWith("/brain")) return "/m/brain";
  if (p.startsWith("/white-swan")) return "/m/white-swan";
  if (p.startsWith("/settings")) return "/m/settings";
  if (p.startsWith("/execution")) return "/m/execution";
  if (p.startsWith("/research")) return "/m/research";
  return "/m/home";
}

export function mobileToDesktop(p: string): string {
  if (p.startsWith("/m/about/inno")) return "/about/inno";
  if (p.startsWith("/m/about")) return "/about";
  if (p.startsWith("/m/sentinel")) return "/sentinel";
  if (p.startsWith("/m/signale")) return "/signal";
  if (p.startsWith("/m/brain")) return "/brain";
  if (p.startsWith("/m/white-swan")) return "/white-swan";
  if (p.startsWith("/m/settings")) return "/settings";
  if (p.startsWith("/m/execution")) return "/execution";
  if (p.startsWith("/m/research")) return "/research";
  return "/";
}

export function MobileRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let rafId: number;
    const check = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const mobile = window.innerWidth <= MOBILE_MAX;
        if (mobile && !isMobilePath(pathname)) {
          router.replace(desktopToMobile(pathname));
        } else if (!mobile && isMobilePath(pathname)) {
          router.replace(mobileToDesktop(pathname));
        }
      });
    };
    check();
    window.addEventListener("resize", check, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", check);
    };
  }, [pathname, router]);

  return null;
}
