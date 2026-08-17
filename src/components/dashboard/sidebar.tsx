"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart2,
  BrainCircuit,
  Blocks,
  BellRing,
  BookText,
  CalendarRange,
  ChartColumn,
  ChartCandlestick,
  Calculator,
  Globe,
  HandCoins,
  Home,
  Layers,

  Network,
  PanelTopClose,
  PanelTopOpen,
  PieChart,
  Settings,
  Palette,
  Rows2,
  Smartphone,
  UserRoundPlus,
  Users,
  Handshake,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useHomeDashboard, type DashboardPage } from "@/context/home-dashboard-context";
import { useHeaderState } from "@/context/header-state-context";
import { useUser } from "@/context/user-context";
import { hasPermission } from "@/lib/auth/userPermissions";
import { useLoading } from "@/context/loading-context";
import { CapalifeLogoAnim } from "@/components/ui/capitalife-logo-anim";

const COLLAPSED_W = 72;
const EXPANDED_W = 232;
const ICON_PL = "pl-[18px]";
// Priority routes prefetched eagerly on mount (user's most-travelled paths)
const PRIORITY_ROUTES = [
  "/",
  "/white-swan",
  "/analytics",
  "/brain",
  "/sentinel",
] as const;

// Secondary routes prefetched during idle time only
const SECONDARY_ROUTES = [
  "/globe",
  "/monitoring",
  "/engine",
  "/signal",
  "/signals",
  "/komponenten",
  "/about",
  "/manager",
  "/investors",
  "/settings",
  "/referenzen",
] as const;

// Keep NAV_ROUTES for any legacy consumers
const NAV_ROUTES = [...PRIORITY_ROUTES, ...SECONDARY_ROUTES] as const;

function NavLabel({ label, expanded }: { label: string; expanded: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        maxWidth: expanded ? 148 : 0,
        opacity: expanded ? 1 : 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "var(--font-text)",
        letterSpacing: "0.01em",
        lineHeight: 1,
        display: "inline-block",
      }}
    >
      {label}
    </span>
  );
}

const itemBase = (active: boolean) =>
  cn(
    "flex h-[42px] w-full shrink-0 items-center gap-3 rounded-md border-0 transition-colors",
    ICON_PL,
    active ? "bg-white/[0.08] text-white" : "bg-transparent text-zinc-500 hover:text-zinc-300",
  );

function SidebarIconButton({
  page,
  activePage,
  label,
  icon: Icon,
  onSelect,
  onHover,
  expanded,
}: {
  page: DashboardPage;
  activePage: DashboardPage;
  label: string;
  icon: typeof Home;
  onSelect: (page: DashboardPage) => void;
  onHover: (element: HTMLElement | null) => void;
  expanded: boolean;
}) {
  const active = activePage === page;
  return (
    <button
      type="button"
      onClick={() => onSelect(page)}
      onMouseEnter={(event) => onHover(event.currentTarget)}
      onFocus={(event) => onHover(event.currentTarget)}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={itemBase(active)}
    >
      <Icon className="h-[20px] w-[20px] shrink-0" strokeWidth={1.65} />
      <NavLabel label={label} expanded={expanded} />
    </button>
  );
}

// MessageSquare outline with the real Sentinel logo PNG inside, made monochrome white
const SentinelIcon = (({ className }: { className?: string }) => (
  <span
    className={className}
    style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
  >
    <svg viewBox="0 0 24 24" fill="none" style={{ width: "100%", height: "100%" }} aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src="/sentinel-logo.png"
      alt=""
      aria-hidden
      style={{ position: "absolute", width: "56%", height: "56%", objectFit: "contain", filter: "brightness(0) invert(1)", top: "10%", opacity: 0.9 }}
    />
  </span>
)) as typeof Home;

function SidebarLink({
  href,
  active,
  label,
  icon: Icon,
  onHover,
  expanded,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: typeof Home;
  onHover: (element: HTMLElement | null) => void;
  expanded: boolean;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      prefetch={true}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={itemBase(active)}
      onMouseEnter={(event) => {
        router.prefetch(href);
        onHover(event.currentTarget);
      }}
      onFocus={(event) => onHover(event.currentTarget)}
    >
      <Icon className="h-[20px] w-[20px] shrink-0" strokeWidth={1.65} />
      <NavLabel label={label} expanded={expanded} />
    </Link>
  );
}

function SectionMarker({
  expanded,
  label,
  action,
}: {
  expanded: boolean;
  label?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{ height: 18, width: "100%", flexShrink: 0, position: "relative" }}
      aria-hidden
    >
      {expanded ? (
        <div
          style={{
            paddingLeft: 18,
            paddingRight: 8,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(196,196,204,0.82)",
            fontFamily: "var(--font-text)",
            lineHeight: "18px",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{label ?? ""}</span>
          {action}
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            height: 1,
            width: 52,
            transform: "translateY(-50%)",
            background: "linear-gradient(to right, transparent, rgba(255,255,255,0.18), transparent)",
          }}
        />
      )}
    </div>
  );
}

type PreviewMode = "desktop" | "mobile" | "split";
const PREVIEW_LS_KEY = "fmd_preview_mode";
const P_W = 393;
const P_H = 852;
const P_FP = 14;
const P_R = 48;
const P_OUTER_W = P_W + P_FP * 2;
const P_OUTER_H = P_H + P_FP * 2;

export function toMobileUrl(path: string | null): string {
  if (!path) return "/m/home";
  if (path.startsWith("/about/inno")) return "/m/about/inno";
  if (path.startsWith("/about")) return "/m/about";
  if (path.startsWith("/analytics")) return "/m/analytics";
  if (path.startsWith("/komponenten")) return "/m/komponenten";
  if (path.startsWith("/monitoring")) return "/m/monitoring";
  if (path.startsWith("/signal") || path.startsWith("/signals")) return "/m/signale";
  if (path.startsWith("/brain")) return "/m/brain";
  if (path.startsWith("/settings")) return "/m/settings";
  if (path.startsWith("/onboarding") || path.startsWith("/investors-crm")) return "/m/investors-crm";
  return "/m/home";
}

function computePhoneScale(mounted: boolean): number {
  if (!mounted || typeof window === "undefined") return 0.7;
  const hAvail = Math.min(window.innerHeight - 60, 920);
  const wAvail = window.innerWidth - 80;
  return Math.max(Math.min(hAvail / P_OUTER_H, wAvail / P_OUTER_W, 1), 0.3);
}

function FloatToggleBtn({ onClick, label }: { onClick: (e: React.MouseEvent) => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: "rgba(14,14,18,0.92)",
        border: "1px solid rgba(226,202,122,0.25)",
        borderRadius: 20,
        padding: "7px 14px 7px 10px",
        color: "#C9A84C",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "var(--font-text)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
      }}
    >
      <Smartphone style={{ width: 13, height: 13 }} strokeWidth={1.65} />
      {label}
    </button>
  );
}

function IPhone15Frame({ url, scale }: { url: string; scale: number }) {
  const btnL = { position: "absolute" as const, left: -4, width: 4, borderRadius: "3px 0 0 3px", background: "linear-gradient(to right,#1a1a1c,#2c2c2e)", boxShadow: "-1px 0 3px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" };
  const btnR = { position: "absolute" as const, right: -4, width: 4, borderRadius: "0 3px 3px 0", background: "linear-gradient(to left,#1a1a1c,#2c2c2e)", boxShadow: "1px 0 3px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" };

  return (
    <div style={{ width: P_OUTER_W * scale, height: P_OUTER_H * scale, flexShrink: 0, position: "relative" }}>
      <div style={{ width: P_OUTER_W, height: P_OUTER_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", overflow: "visible" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: P_R, background: "linear-gradient(175deg,#2c2c2e 0%,#1a1a1c 55%,#242426 100%)", boxShadow: "0 0 0 1px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.5), 0 60px 120px rgba(0,0,0,0.85), 0 0 0 0.5px #111" }}>
          <div style={{ position: "absolute", top: P_FP, left: P_FP, right: P_FP, bottom: P_FP, borderRadius: P_R - P_FP, overflow: "hidden", background: "#000" }}>
            <iframe src={url} style={{ width: P_W, height: P_H, border: "none", display: "block" }} title="Mobile Preview" />
            <div style={{ position: "absolute", top: 13, left: "50%", transform: "translateX(-50%)", width: 124, height: 35, background: "#000", borderRadius: 18, zIndex: 10, boxShadow: "0 0 0 1px rgba(255,255,255,0.05), inset 0 0 0 1px rgba(0,0,0,0.9)" }} />
          </div>
        </div>
        <div style={{ ...btnL, top: 96, height: 30 }} />
        <div style={{ ...btnL, top: 142, height: 54 }} />
        <div style={{ ...btnL, top: 212, height: 54 }} />
        <div style={{ ...btnR, top: 178, height: 76 }} />
      </div>
    </div>
  );
}

function SplitView({ mobileUrl, desktopUrl, onCycle }: { mobileUrl: string; desktopUrl: string; onCycle: (e: React.MouseEvent) => void }) {
  const [h, setH] = useState(0);

  useEffect(() => {
    const update = () => {
      const maxByWidth = (window.innerWidth - 80) / (393 / 852 + 16 / 10);
      setH(Math.max(Math.min(maxByWidth, window.innerHeight - 40), 200));
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  if (h < 201) return null;

  const iw = h * (393 / 852);
  const iPad = Math.round(iw * 0.03);
  const iR = Math.round(iw * 0.18);
  const iSW = iw - iPad * 2;
  const iSH = h - iPad * 2;
  const iSc = iSW / 393;
  const bs = h / 651;
  const mw = h * (16 / 10);
  const mPad = Math.round(mw * 0.017);
  const mChin = Math.round(h * 0.04);
  const mR = Math.round(mw * 0.033);
  const mSW = mw - mPad * 2;
  const mSc = mSW / 1280;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", gap: 32, padding: "20px 24px", boxSizing: "border-box" }}>
      <div style={{ width: iw, height: h, flexShrink: 0, position: "relative", borderRadius: iR, background: "linear-gradient(145deg,#454545,#0b0b0b 42%,#2b2b2b)", boxShadow: `0 ${Math.round(h * 0.04)}px ${Math.round(h * 0.1)}px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.16)` }}>
        <div style={{ position: "absolute", top: iPad, left: iPad, width: iSW, height: iSH, borderRadius: iR - iPad, overflow: "hidden", background: "#000" }}>
          <iframe src={mobileUrl} style={{ width: 393, height: 852, border: "none", display: "block", transform: `scale(${iSc})`, transformOrigin: "top left" }} title="Mobile Preview" />
          <div style={{ position: "absolute", top: Math.round(13 * iSc), left: "50%", transform: "translateX(-50%)", width: Math.round(124 * iSc), height: Math.round(35 * iSc), background: "#000", borderRadius: 999, zIndex: 10 }} />
        </div>
        <div style={{ position: "absolute", left: -3, top: Math.round(104 * bs), height: Math.round(26 * bs), width: 3, background: "#242424", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", left: -3, top: Math.round(148 * bs), height: Math.round(50 * bs), width: 3, background: "#242424", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", left: -3, top: Math.round(210 * bs), height: Math.round(50 * bs), width: 3, background: "#242424", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", right: -3, top: Math.round(166 * bs), height: Math.round(74 * bs), width: 3, background: "#242424", borderRadius: "0 3px 3px 0" }} />
      </div>
      <div style={{ width: mw, height: h, flexShrink: 0, position: "relative", borderRadius: mR, background: "linear-gradient(145deg,#4b4b4b,#121212 48%,#343434)", boxShadow: `0 ${Math.round(h * 0.04)}px ${Math.round(h * 0.1)}px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(255,255,255,0.14)` }}>
        <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", width: 5, height: 5, borderRadius: "50%", background: "#080808", zIndex: 2, boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }} />
        <div style={{ position: "absolute", top: mPad, left: mPad, right: mPad, bottom: mChin, borderRadius: Math.round(mR * 0.6), overflow: "hidden", background: "#000" }}>
          <iframe src={desktopUrl} style={{ width: 1280, height: 800, border: "none", display: "block", transform: `scale(${mSc})`, transformOrigin: "top left" }} title="Desktop Preview" />
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: mChin, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: `0 0 ${mR}px ${mR}px` }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.16)" }} />
        </div>
      </div>
      <FloatToggleBtn onClick={onCycle} label="Desktop ->" />
    </div>
  );
}

export function Sidebar() {
  const { page, setPage } = useHomeDashboard();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const { headerHidden, toggleHeader } = useHeaderState();
  const { isLoading } = useLoading();
  const uid = user?.id ?? "";
  const canViewMonitoring = hasPermission(uid, "view:monitoring");
  const canViewAnalytics = hasPermission(uid, "view:analytics");
  const canViewKomponenten = hasPermission(uid, "view:komponenten");
  const canViewBrain = hasPermission(uid, "view:brain");
  const canViewGlobe = hasPermission(uid, "view:globe");
  const canViewPartner = hasPermission(uid, "view:partner_program");
  const canViewExecution = hasPermission(uid, "view:execution");

  const [expanded, setExpanded] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [mounted, setMounted] = useState(false);
  const [phoneScale, setPhoneScale] = useState(0.7);
  const [hoverBox, setHoverBox] = useState<{ top: number; height: number; opacity: number }>({
    top: 0,
    height: 42,
    opacity: 0,
  });
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);

    // Eagerly prefetch the 5 priority routes (user's most-travelled paths), staggered
    const timers: ReturnType<typeof setTimeout>[] = [];
    PRIORITY_ROUTES.forEach((route, i) => {
      timers.push(setTimeout(() => router.prefetch(route), i * 200));
    });

    // Secondary routes: defer until browser is idle to avoid competing with first render
    if (typeof requestIdleCallback !== "undefined") {
      const handle = requestIdleCallback(() => {
        SECONDARY_ROUTES.forEach((route, i) => {
          timers.push(setTimeout(() => router.prefetch(route), i * 300));
        });
      }, { timeout: 8000 });
      return () => {
        cancelIdleCallback(handle);
        timers.forEach(clearTimeout);
      };
    }

    return () => timers.forEach(clearTimeout);
  }, [router]);

  useEffect(() => {
    if (window.top !== window) return;
    try {
      const stored = localStorage.getItem(PREVIEW_LS_KEY);
      if (stored === "2") setPreviewMode("mobile");
      else if (stored === "3") setPreviewMode("split");
    } catch {}
  }, []);

  useEffect(() => {
    const update = () => setPhoneScale(computePhoneScale(true));
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--mobile-preview-left", "0px");
  }, []);

  const cyclePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewMode((prev) => {
      const next: PreviewMode = prev === "desktop" ? "mobile" : prev === "mobile" ? "split" : "desktop";
      const val = next === "desktop" ? "1" : next === "mobile" ? "2" : "3";
      try { localStorage.setItem(PREVIEW_LS_KEY, val); } catch {}
      return next;
    });
  };

  const mobileUrl = toMobileUrl(pathname);
  const desktopUrl = pathname ?? "/";
  const aboutActive = pathname?.startsWith("/about") ?? false;
  const monitoringActive = pathname?.startsWith("/monitoring") ?? false;
  const engineActive = pathname?.startsWith("/engine") ?? false;
  const signalActive = pathname?.startsWith("/signal") ?? false;
  const sentinelActive = pathname?.startsWith("/sentinel") ?? false;
  const analyticsActive = pathname?.startsWith("/analytics") ?? false;
  const managerActive = pathname?.startsWith("/manager") ?? false;
  const investorsActive = pathname?.startsWith("/investors") ?? false;
  const vermittlerActive = pathname?.startsWith("/vermittler") ?? false;
  const brainActive = (pathname?.startsWith("/brain") ?? false) || (pathname?.startsWith("/brain-graph") ?? false);
  const globeActive = pathname?.startsWith("/globe") ?? false;
  const componentsActive = pathname?.startsWith("/komponenten") ?? false;
  const seasonalityActive = pathname?.startsWith("/komponenten/seasonality") ?? false;
  const settingsActive = pathname?.startsWith("/settings") ?? false;
  const referenzenActive = pathname?.startsWith("/referenzen") ?? false;
  const previewWorkspaceActive = pathname?.startsWith("/preview-workspace") ?? false;
  const investorsCRMActive = (pathname?.startsWith("/onboarding") ?? false) || (pathname?.startsWith("/investors-crm") ?? false);
  const investorDbActive = pathname?.startsWith("/investor-db") ?? false;
  const shellRouteActive = pathname === "/" || !pathname;

  const sidebarPageState: DashboardPage = shellRouteActive && !monitoringActive && !signalActive && !brainActive && !componentsActive ? page : ("__none__" as DashboardPage);
  const navClass = "flex w-full flex-none flex-col gap-1 px-2 items-start";

  const updateHoverBox = (element: HTMLElement | null) => {
    const sidebar = sidebarRef.current;
    if (!sidebar || !element) return;
    const sidebarRect = sidebar.getBoundingClientRect();
    const itemRect = element.getBoundingClientRect();
    setHoverBox({
      top: itemRect.top - sidebarRect.top + sidebar.scrollTop,
      height: itemRect.height,
      opacity: 1,
    });
  };

  return (
    <aside
      ref={sidebarRef}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => {
        setExpanded(false);
        setHoverBox((current) => ({ ...current, opacity: 0 }));
      }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: expanded ? EXPANDED_W : COLLAPSED_W,
        flexShrink: 0,
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        transition: "width 180ms ease",
        boxShadow: expanded ? "10px 0 20px rgba(0,0,0,0.56)" : "none",
      }}
      className="capitalife-sidebar relative z-[9999] isolate flex min-h-0 flex-col border-r pt-0"
      data-expanded={expanded ? "true" : "false"}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          top: 0,
          height: hoverBox.height,
          opacity: hoverBox.opacity,
          transform: `translateY(${hoverBox.top}px)`,
          borderRadius: 10,
          background: "rgba(255,255,255,0.06)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          transition: "transform 95ms ease-out, opacity 90ms ease-out",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {mounted && expanded && createPortal(
          <div
            aria-hidden
            style={{
              position: "fixed",
              inset: 0,
              left: COLLAPSED_W,
              background: "rgba(0,0,0,0.24)",
              pointerEvents: "none",
              zIndex: 9990,
            }}
          />,
        document.body,
      )}

      <div
        className="sticky top-0 z-[3] flex w-full shrink-0 items-start justify-start pt-3"
        style={{
          background: expanded ? "rgba(10, 10, 12, 0.22)" : "rgba(10, 10, 12, 0.34)",
          backdropFilter: expanded ? "blur(36px) saturate(180%) brightness(1.05)" : "blur(20px) saturate(150%) brightness(1.03)",
          overflow: "visible",
        }}
      >
        <button
          type="button"
          className="relative flex items-center justify-start border-0 bg-transparent p-0 shadow-none outline-none ring-0 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/12"
          style={{ width: expanded ? 196 : 38, height: 60, marginLeft: 19, overflow: "visible" }}
          aria-label="Capitalife home"
          onClick={(e) => {
            e.preventDefault();
            const currentPath = window.location.pathname || "/";
            const currentSearch = new URLSearchParams(window.location.search);
            currentSearch.set("__hard_refresh", Date.now().toString());
            window.location.assign(`${currentPath}?${currentSearch.toString()}`);
          }}
        >
          {/* Loading state: animated logo (loops while any navigation or in-page load is active) */}
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{
              left: 0,
              opacity: isLoading ? 1 : 0,
              pointerEvents: "none",
              transition: "opacity 180ms ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: expanded ? 184 : 34,
            }}
          >
            <CapalifeLogoAnim size={28} speed={1.6} />
          </div>

          {/* Static icon (collapsed) */}
          <Image
            src="/CAPITALIFE_ICON.png"
            alt="Capitalife"
            width={34}
            height={34}
            className="absolute top-1/2 h-[34px] w-[34px] -translate-y-1/2 object-contain"
            style={{ left: -1, opacity: expanded || isLoading ? 0 : 1, transition: "opacity 120ms ease", overflow: "visible" }}
            priority
          />
          {/* Static full logo (expanded) */}
          <Image
            src="/CAPITALIFE_Logo.png"
            alt="Capitalife"
            width={184}
            height={50}
            className="absolute top-1/2 h-[50px] w-[184px] -translate-y-1/2 object-contain"
            style={{ left: 0, opacity: expanded && !isLoading ? 1 : 0, transition: "opacity 140ms ease", overflow: "visible" }}
          />
        </button>
      </div>

      <div className="mt-2 flex w-full flex-col items-center gap-1 px-2">
        <SectionMarker
          expanded={expanded}
          label="Navigation"
          action={
            <button
              type="button"
              onClick={() => router.push("/preview-workspace")}
              onMouseEnter={(event) => updateHoverBox(event.currentTarget)}
              title="Preview Workspace"
              aria-label="Preview Workspace"
              style={{
                display: "flex",
                height: 18,
                width: 18,
                alignItems: "center",
                justifyContent: "center",
                border: 0,
                borderRadius: 6,
                background: previewWorkspaceActive ? "rgba(255,255,255,0.08)" : "transparent",
                color: previewWorkspaceActive ? "#C9A84C" : "rgba(196,196,204,0.82)",
                cursor: "pointer",
                flexShrink: 0,
                marginRight: 2,
              }}
            >
              <Rows2 className="h-3.5 w-3.5" strokeWidth={1.9} />
            </button>
          }
        />
      </div>

      <nav className={cn("mt-1", navClass)} aria-label="Navigation">
        {shellRouteActive ? (
          <SidebarIconButton page="home" activePage={sidebarPageState} label="Home" icon={Home} onSelect={setPage} onHover={updateHoverBox} expanded={expanded} />
        ) : (
          <SidebarLink href="/" active={shellRouteActive && sidebarPageState === "home"} label="Home" icon={Home} onHover={updateHoverBox} expanded={expanded} />
        )}
        {canViewGlobe && <SidebarLink href="/globe" active={globeActive} label="Globe" icon={Globe} onHover={updateHoverBox} expanded={expanded} />}
        {canViewBrain && <SidebarLink href="/brain" active={brainActive} label="Brain" icon={BrainCircuit} onHover={updateHoverBox} expanded={expanded} />}
        <SidebarLink href="/sentinel" active={sentinelActive} label="Sentinel" icon={SentinelIcon} onHover={updateHoverBox} expanded={expanded} />
      </nav>

      <div className="mt-2 flex w-full flex-col items-center gap-1 px-2">
        <SectionMarker expanded={expanded} label="Execution" />
      </div>

      <nav className={cn("mt-1", navClass)} aria-label="Execution">
        {canViewExecution && <SidebarLink href="/engine" active={engineActive} label="Trading Engine" icon={ChartCandlestick} onHover={updateHoverBox} expanded={expanded} />}
        {canViewExecution && <SidebarLink href="/signal" active={signalActive} label="Signale" icon={BellRing} onHover={updateHoverBox} expanded={expanded} />}
        {canViewMonitoring && <SidebarLink href="/monitoring" active={monitoringActive} label="Monitoring" icon={Activity} onHover={updateHoverBox} expanded={expanded} />}
      </nav>

      <div className="mt-2 flex w-full flex-col items-center gap-1 px-2">
        <SectionMarker expanded={expanded} label="Intelligence" />
      </div>

      <nav className={cn("mt-1", navClass)} aria-label="Intelligence">
        {canViewAnalytics && <SidebarLink href="/analytics" active={analyticsActive} label="Analytics" icon={ChartColumn} onHover={updateHoverBox} expanded={expanded} />}
        {canViewKomponenten && <SidebarLink href="/komponenten" active={componentsActive && !seasonalityActive} label="Komponenten" icon={Blocks} onHover={updateHoverBox} expanded={expanded} />}
        {canViewKomponenten && <SidebarLink href="/komponenten/seasonality" active={seasonalityActive} label="Seasonality" icon={CalendarRange} onHover={updateHoverBox} expanded={expanded} />}
        <SidebarLink href="/about" active={aboutActive} label="Bibel" icon={BookText} onHover={updateHoverBox} expanded={expanded} />
      </nav>

      <div className="mt-2 flex w-full flex-col items-center gap-1 px-2">
        <SectionMarker expanded={expanded} label="Clients" />
      </div>

      <nav className={cn("mt-1", navClass)} aria-label="Clients">
        <SidebarLink href="/manager" active={managerActive} label="Portfolio Lab" icon={Calculator} onHover={updateHoverBox} expanded={expanded} />
        <SidebarLink href="/investors" active={investorsActive} label="Investors" icon={HandCoins} onHover={updateHoverBox} expanded={expanded} />
        <SidebarLink href="/onboarding" active={investorsCRMActive} label="Onboarding" icon={UserRoundPlus} onHover={updateHoverBox} expanded={expanded} />
        <SidebarLink href="/investor-db" active={investorDbActive} label="Investor DB" icon={Users} onHover={updateHoverBox} expanded={expanded} />
        <SidebarLink href="/vermittler" active={vermittlerActive} label="Vermittler" icon={Handshake} onHover={updateHoverBox} expanded={expanded} />
        {canViewPartner && <SidebarLink href="/partner" active={pathname?.startsWith("/partner") ?? false} label="Partnerprogramm" icon={Network} onHover={updateHoverBox} expanded={expanded} />}
      </nav>

      <div className="mt-auto flex w-full flex-col items-center px-2 pb-[52px] pt-3">
        <SectionMarker expanded={expanded} label="System" />

        <div className="mt-1 w-full">
          <SidebarLink href="/settings" active={settingsActive} label="Settings" icon={Settings} onHover={updateHoverBox} expanded={expanded} />
          <SidebarLink href="/referenzen" active={referenzenActive} label="Referenzen" icon={Palette} onHover={updateHoverBox} expanded={expanded} />
        </div>

        <div className="mt-0.5 w-full">
          <button type="button" onClick={toggleHeader} onMouseEnter={(event) => updateHoverBox(event.currentTarget)} aria-label={headerHidden ? "Header einblenden" : "Header ausblenden"} title={headerHidden ? "Header einblenden" : "Header ausblenden"} className={cn(`flex h-[42px] w-full shrink-0 items-center gap-3 rounded-md border-0 transition-colors ${ICON_PL}`, headerHidden ? "bg-transparent text-zinc-600 hover:text-zinc-500" : "bg-transparent text-zinc-300 hover:text-white")}>
            {headerHidden ? <PanelTopOpen className="h-[16px] w-[16px] shrink-0" strokeWidth={1.65} /> : <PanelTopClose className="h-[16px] w-[16px] shrink-0" strokeWidth={1.65} />}
            <NavLabel label={headerHidden ? "Show header" : "Hide header"} expanded={expanded} />
          </button>
        </div>

        <div className="mt-0.5 w-full">
          <button type="button" onClick={cyclePreview} onMouseEnter={(event) => updateHoverBox(event.currentTarget)} title={previewMode === "desktop" ? "Mobile Preview" : previewMode === "mobile" ? "Split View" : "Desktop"} style={{ display: "flex", height: 42, width: "100%", alignItems: "center", gap: 12, borderRadius: 6, border: 0, background: "transparent", cursor: "pointer", paddingLeft: 18, color: previewMode === "desktop" ? "rgba(113,113,122,1)" : "#C9A84C", flexShrink: 0 }}>
            <Smartphone style={{ width: 20, height: 20, flexShrink: 0 }} strokeWidth={1.65} />
            <NavLabel label="Preview" expanded={expanded} />
          </button>
        </div>

        {mounted && previewMode === "mobile" && createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IPhone15Frame url={mobileUrl} scale={phoneScale} />
            <FloatToggleBtn onClick={cyclePreview} label="Split View ->" />
          </div>,
          document.body,
        )}

        {mounted && previewMode === "split" && createPortal(<SplitView mobileUrl={mobileUrl} desktopUrl={desktopUrl} onCycle={cyclePreview} />, document.body)}
      </div>

      <div
        aria-hidden
        style={{
          position: "sticky",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          height: 52,
          marginTop: -52,
          pointerEvents: "none",
          background: expanded ? "rgba(10, 10, 12, 0.22)" : "rgba(10, 10, 12, 0.34)",
          backdropFilter: expanded ? "blur(36px) saturate(180%) brightness(1.05)" : "blur(20px) saturate(150%) brightness(1.03)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(10,10,12,0.02) 0%, rgba(10,10,12,0.72) 30%, rgba(10,10,12,0.98) 58%, rgba(10,10,12,1) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 58,
            background: "rgba(10,10,12,1)",
          }}
        />
      </div>
      <style jsx>{`
        .capitalife-sidebar {
          background: rgba(10, 10, 12, 0.34);
          backdrop-filter: blur(26px) saturate(168%) brightness(1.04);
          border-right-color: rgba(255, 255, 255, 0.08);
          transition:
            width 180ms ease,
            box-shadow 180ms ease,
            background-color 180ms ease,
            border-color 180ms ease,
            backdrop-filter 180ms ease,
            box-shadow 180ms ease;
        }

        .capitalife-sidebar[data-expanded="true"] {
          background: rgba(10, 10, 12, 0.22);
          backdrop-filter: blur(38px) saturate(186%) brightness(1.06);
          border-right-color: rgba(255, 255, 255, 0.1);
          box-shadow:
            inset -1px 0 0 rgba(255,255,255,0.08),
            inset 0 1px 0 rgba(255,255,255,0.05),
            12px 0 28px rgba(0,0,0,0.46);
        }
      `}</style>
    </aside>
  );
}
