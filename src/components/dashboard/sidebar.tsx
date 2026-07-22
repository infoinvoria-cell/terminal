"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  BellRing,
  BriefcaseBusiness,
  ChartColumn,
  GitFork,
  Globe,
  Home,
  Layers,
  MessageSquare,
  Network,
  PanelTopClose,
  PanelTopOpen,
  PieChart,
  Settings,
  Smartphone,
  Users,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DashboardPage } from "@/context/home-dashboard-context";
import { useHeaderState } from "@/context/header-state-context";

const COLLAPSED_W = 72;
const EXPANDED_W  = 200;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

// Icon is always at pl-[18px] inside a nav with px-2 → left edge at 26px from aside,
// matching what justify-center gave it in the 44px collapsed button. Icons never move.
const ICON_PL = "pl-[18px]";

// ── Label text that slides in when expanded ────────────────────────────────

function NavLabel({ label, expanded }: { label: string; expanded: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        maxWidth: expanded ? 140 : 0,
        opacity: expanded ? 1 : 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
        transition: `max-width 250ms ${EASE}, opacity 180ms ${EASE}`,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "var(--font-montserrat,sans-serif)",
        letterSpacing: "0.01em",
        lineHeight: 1,
        display: "inline-block",
      }}
    >
      {label}
    </span>
  );
}

// Shared button/link class — icon stays fixed, only label slides in
const itemBase = (active: boolean) =>
  cn(
    "flex h-11 w-full shrink-0 items-center gap-3 rounded-lg border-0 transition-colors",
    ICON_PL,
    active
      ? "bg-white/[0.08] text-white"
      : "bg-transparent text-zinc-500 hover:text-zinc-300"
  );

// ── Icon button for in-page dashboard sections ─────────────────────────────

function SidebarIconButton({
  page,
  activePage,
  label,
  icon: Icon,
  onSelect,
  expanded,
}: {
  page: DashboardPage;
  activePage: DashboardPage;
  label: string;
  icon: typeof Home;
  onSelect: (page: DashboardPage) => void;
  expanded: boolean;
}) {
  const active = activePage === page;
  return (
    <button
      type="button"
      onClick={() => onSelect(page)}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={itemBase(active)}
    >
      <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={1.65} />
      <NavLabel label={label} expanded={expanded} />
    </button>
  );
}

// ── Link button for route-based navigation ─────────────────────────────────

function SidebarLink({
  href,
  active,
  label,
  icon: Icon,
  expanded,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: typeof Home;
  expanded: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={true}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={itemBase(active)}
    >
      <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={1.65} />
      <NavLabel label={label} expanded={expanded} />
    </Link>
  );
}

// ── Separator ──────────────────────────────────────────────────────────────

function SidebarSep({ expanded }: { expanded: boolean }) {
  return (
    <div
      style={{
        height: 1,
        width: expanded ? "calc(100% - 16px)" : 52,
        transition: `width 250ms ${EASE}`,
        background: "linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)",
        flexShrink: 0,
      }}
      aria-hidden
    />
  );
}

// ── Mobile Preview ─────────────────────────────────────────────────────────

type PreviewMode = "desktop" | "mobile" | "split";
const PREVIEW_LS_KEY = "fmd_preview_mode";

// ── iPhone 15 Pro Black Titanium dimensions ────────────────────────────────
const P_W = 393, P_H = 852, P_FP = 14, P_R = 48;
const P_OUTER_W = P_W + P_FP * 2;   // 421
const P_OUTER_H = P_H + P_FP * 2;   // 880


function toMobileUrl(path: string | null): string {
  if (!path) return "/m/home";
  if (path.startsWith("/signal") || path.startsWith("/signals") || path.startsWith("/monitoring")) return "/m/signale";
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

// ── Float toggle button (appears bottom-left in overlay modes) ────────────
function FloatToggleBtn({ onClick, label }: { onClick: (e: React.MouseEvent) => void; label: string }) {
  return (
    <button onClick={onClick} style={{ position: "fixed", bottom: 20, left: 20, zIndex: 1100, display: "flex", alignItems: "center", gap: 7, background: "rgba(14,14,18,0.92)", border: "1px solid rgba(226,202,122,0.25)", borderRadius: 20, padding: "7px 14px 7px 10px", color: "#e2ca7a", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-montserrat,sans-serif)", backdropFilter: "blur(8px)", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
      <Smartphone style={{ width: 13, height: 13 }} strokeWidth={1.65} />
      {label}
    </button>
  );
}

// ── iPhone 15 Pro Black Titanium mockup ───────────────────────────────────
// Buttons are siblings of the shell (not children) so overflow:hidden
// on the screen area never clips them.
function IPhone15Frame({ url, scale }: { url: string; scale: number }) {
  const btnL = { position: "absolute" as const, left: -4, width: 4, borderRadius: "3px 0 0 3px",
    background: "linear-gradient(to right,#1a1a1c,#2c2c2e)",
    boxShadow: "-1px 0 3px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" };
  const btnR = { position: "absolute" as const, right: -4, width: 4, borderRadius: "0 3px 3px 0",
    background: "linear-gradient(to left,#1a1a1c,#2c2c2e)",
    boxShadow: "1px 0 3px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" };
  return (
    <div style={{ width: P_OUTER_W * scale, height: P_OUTER_H * scale, flexShrink: 0, position: "relative" }}>
      {/* Scaled container — overflow visible so buttons poke out */}
      <div style={{ width: P_OUTER_W, height: P_OUTER_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", overflow: "visible" }}>
        {/* Phone shell — background only, no overflow:hidden */}
        <div style={{ position: "absolute", inset: 0, borderRadius: P_R,
          background: "linear-gradient(175deg,#2c2c2e 0%,#1a1a1c 55%,#242426 100%)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.5), 0 60px 120px rgba(0,0,0,0.85), 0 0 0 0.5px #111" }}>
          {/* Screen — clipped inside shell padding */}
          <div style={{ position: "absolute", top: P_FP, left: P_FP, right: P_FP, bottom: P_FP,
            borderRadius: P_R - P_FP, overflow: "hidden", background: "#000" }}>
            <iframe src={url} style={{ width: P_W, height: P_H, border: "none", display: "block" }} title="Mobile Preview" />
            {/* Dynamic Island pill — overlaid on top of iframe */}
            <div style={{ position: "absolute", top: 13, left: "50%", transform: "translateX(-50%)",
              width: 124, height: 35, background: "#000", borderRadius: 18, zIndex: 10,
              boxShadow: "0 0 0 1px rgba(255,255,255,0.05), inset 0 0 0 1px rgba(0,0,0,0.9)" }} />
          </div>
        </div>
        {/* Buttons — outside shell, not clipped */}
        {/* Mute switch */}
        <div style={{ ...btnL, top: 96,  height: 30 }} />
        {/* Vol + */}
        <div style={{ ...btnL, top: 142, height: 54 }} />
        {/* Vol − */}
        <div style={{ ...btnL, top: 212, height: 54 }} />
        {/* Power */}
        <div style={{ ...btnR, top: 178, height: 76 }} />
      </div>
    </div>
  );
}

// ── Split View — beide Geräte in voller Viewport-Höhe ─────────────────────
// Sizing wird per JS berechnet: Höhe = min(höchste mögliche Höhe, Viewport-Höhe - 40px)
// Breite folgt aus Aspect-Ratio der jeweiligen Geräte.
function SplitView({ mobileUrl, desktopUrl, onCycle }: {
  mobileUrl: string; desktopUrl: string; onCycle: (e: React.MouseEvent) => void;
}) {
  const [h, setH] = useState(0);

  useEffect(() => {
    const update = () => {
      // iPhone 15 Pro: 393×852 → ratio W/H = 393/852
      // Monitor 16:10 → ratio W/H = 16/10
      // Combined W at height H = H*(393/852 + 16/10)
      // Constrain: combined W ≤ viewport_w - gap(32) - padding(48)
      const maxByWidth = (window.innerWidth - 80) / (393 / 852 + 16 / 10);
      setH(Math.max(Math.min(maxByWidth, window.innerHeight - 40), 200));
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  if (h < 201) return null;

  // iPhone dimensions
  const iw   = h * (393 / 852);
  const iPad = Math.round(iw * 0.03);      // shell padding ~9px at 300px ref
  const iR   = Math.round(iw * 0.18);      // corner radius ~54px at 300px ref
  const iSW  = iw - iPad * 2;              // screen slot width
  const iSH  = h - iPad * 2;              // screen slot height
  const iSc  = iSW / 393;                 // scale iframe to slot
  const bs   = h / 651;                   // button scale (ref phone is 651px tall)

  // Monitor dimensions
  const mw      = h * (16 / 10);
  const mPad    = Math.round(mw * 0.017); // bezel ~12px at 720px ref
  const mChin   = Math.round(h * 0.04);  // bottom chin ~32px at 800px ref
  const mR      = Math.round(mw * 0.033);// corner radius ~24px at 720px ref
  const mSW     = mw - mPad * 2;
  const mSH     = h - mPad - mChin;
  const mSc     = mSW / 1280;            // scale to 1280px desktop viewport

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "#000",
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 32, padding: "20px 24px", boxSizing: "border-box" }}>

      {/* ── iPhone 15 Pro ─────────────────────────────────────────── */}
      <div style={{ width: iw, height: h, flexShrink: 0, position: "relative",
        borderRadius: iR,
        background: "linear-gradient(145deg,#454545,#0b0b0b 42%,#2b2b2b)",
        boxShadow: `0 ${Math.round(h*0.04)}px ${Math.round(h*0.1)}px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.16)` }}>
        {/* Screen */}
        <div style={{ position: "absolute", top: iPad, left: iPad,
          width: iSW, height: iSH,
          borderRadius: iR - iPad, overflow: "hidden", background: "#000" }}>
          <iframe src={mobileUrl}
            style={{ width: 393, height: 852, border: "none", display: "block",
              transform: `scale(${iSc})`, transformOrigin: "top left" }}
            title="Mobile Preview" />
          {/* Dynamic Island */}
          <div style={{ position: "absolute", top: Math.round(13 * iSc), left: "50%",
            transform: "translateX(-50%)",
            width: Math.round(124 * iSc), height: Math.round(35 * iSc),
            background: "#000", borderRadius: 999, zIndex: 10 }} />
        </div>
        {/* Side buttons (proportionally scaled) */}
        <div style={{ position: "absolute", left: -3, top: Math.round(104*bs), height: Math.round(26*bs), width: 3, background: "#242424", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", left: -3, top: Math.round(148*bs), height: Math.round(50*bs), width: 3, background: "#242424", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", left: -3, top: Math.round(210*bs), height: Math.round(50*bs), width: 3, background: "#242424", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", right: -3, top: Math.round(166*bs), height: Math.round(74*bs), width: 3, background: "#242424", borderRadius: "0 3px 3px 0" }} />
      </div>

      {/* ── Laptop/Monitor ────────────────────────────────────────── */}
      <div style={{ width: mw, height: h, flexShrink: 0, position: "relative",
        borderRadius: mR,
        background: "linear-gradient(145deg,#4b4b4b,#121212 48%,#343434)",
        boxShadow: `0 ${Math.round(h*0.04)}px ${Math.round(h*0.1)}px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(255,255,255,0.14)` }}>
        {/* Camera */}
        <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
          width: 5, height: 5, borderRadius: "50%", background: "#080808", zIndex: 2,
          boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }} />
        {/* Screen */}
        <div style={{ position: "absolute", top: mPad, left: mPad, right: mPad, bottom: mChin,
          borderRadius: Math.round(mR * 0.6), overflow: "hidden", background: "#000" }}>
          <iframe src={desktopUrl}
            style={{ width: 1280, height: 800, border: "none", display: "block",
              transform: `scale(${mSc})`, transformOrigin: "top left" }}
            title="Desktop Preview" />
        </div>
        {/* Bottom chin */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: mChin,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: `0 0 ${mR}px ${mR}px` }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.16)" }} />
        </div>
      </div>

      <FloatToggleBtn onClick={onCycle} label="Desktop →" />
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────

export function Sidebar() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const { headerHidden, toggleHeader } = useHeaderState();

  const [expanded, setExpanded] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = () => {
    hoverTimerRef.current = setTimeout(() => setExpanded(true), 2000);
  };
  const onMouseLeave = () => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    setExpanded(false);
  };

  // ── Mobile Preview state ──────────────────────────────────────────────
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [mounted, setMounted] = useState(false);
  const [phoneScale, setPhoneScale] = useState(0.7);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    // Skip in iframes — prevents infinite nesting
    if (window.top !== window) return;
    try {
      const stored = localStorage.getItem(PREVIEW_LS_KEY);
      if (stored === "2") setPreviewMode("mobile");
      else if (stored === "3") setPreviewMode("split");
    } catch { /* ignore */ }
  }, []);

  // Recompute phone scale for mobile-only mode on mount and resize
  useEffect(() => {
    const update = () => setPhoneScale(computePhoneScale(true));
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  // Split is now a full overlay — no body padding needed
  useEffect(() => {
    document.documentElement.style.setProperty("--mobile-preview-left", "0px");
  }, []);

  const cyclePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewMode(prev => {
      const next: PreviewMode = prev === "desktop" ? "mobile" : prev === "mobile" ? "split" : "desktop";
      const val = next === "desktop" ? "1" : next === "mobile" ? "2" : "3";
      try { localStorage.setItem(PREVIEW_LS_KEY, val); } catch { /* ignore */ }
      return next;
    });
  };

  const mobileUrl = toMobileUrl(pathname);
  const desktopUrl = pathname ?? "/";

  const monitoringActive    = pathname?.startsWith("/monitoring") ?? false;
  const signalActive        = pathname?.startsWith("/signal") ?? false;
  const brainActive         = (pathname?.startsWith("/brain") ?? false) || (pathname?.startsWith("/brain-graph") ?? false);
  const globeActive         = pathname?.startsWith("/globe") ?? false;
  const componentsActive    = pathname?.startsWith("/komponenten") ?? false;
  const settingsActive      = pathname?.startsWith("/settings") ?? false;
  const investorsCRMActive  = (pathname?.startsWith("/onboarding") ?? false) || (pathname?.startsWith("/investors-crm") ?? false);
  const shellRouteActive    = pathname === "/" || !pathname;

  const urlPage = searchParams.get("page") as DashboardPage | null;
  const sidebarPageState: DashboardPage =
    shellRouteActive && !monitoringActive && !signalActive && !brainActive && !componentsActive
      ? (urlPage ?? "home")
      : ("__none__" as DashboardPage);

  const onSelectPage = (p: DashboardPage) => {
    router.push(`/?page=${p}`);
  };

  // All nav containers: always left-aligned (items use fixed pl, so icons never shift)
  const navClass = "flex w-full flex-none flex-col gap-3 px-2 items-start";

  return (
    <aside
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width: expanded ? EXPANDED_W : COLLAPSED_W,
        transition: `width 250ms ${EASE}`,
        flexShrink: 0,
        overflow: "hidden",
      }}
      className="capitalife-sidebar relative z-[9999] isolate flex h-full min-h-0 flex-col border-r border-[#2a2b30]/60 bg-[#0a0a0c] pt-4"
    >
      {/* Logo */}
      <div className="flex w-full shrink-0 items-center justify-center" style={{ transition: `padding 250ms ${EASE}` }}>
        <button
          type="button"
          className="relative flex items-center justify-center border-0 bg-transparent p-0 shadow-none outline-none ring-0 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/12"
          style={{ width: expanded ? 160 : 34, height: 40, transition: `width 250ms ${EASE}` }}
          aria-label="Capitalife home"
          onClick={(e) => {
            e.preventDefault();
            window.location.reload();
          }}
        >
          {/* Small icon — visible when collapsed */}
          <Image
            src="/CAPITALIFE_ICON.png"
            alt="Capitalife"
            width={34}
            height={34}
            className="absolute left-1/2 top-1/2 h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2 object-contain"
            style={{ opacity: expanded ? 0 : 1, transition: `opacity 150ms ${EASE}` }}
            priority
          />
          {/* Full logo — visible when expanded */}
          <Image
            src="/CAPITALIFE_Logo.png"
            alt="Capitalife"
            width={160}
            height={40}
            className="absolute left-1/2 top-1/2 h-[40px] w-[160px] -translate-x-1/2 -translate-y-1/2 object-contain"
            style={{ opacity: expanded ? 1 : 0, transition: `opacity 180ms ${EASE}` }}
          />
        </button>
      </div>

      {/* Group 1: Home · Sentinel · Graph */}
      <nav className={cn("mt-9", navClass)} aria-label="Primary">
        <SidebarIconButton page="home"  activePage={sidebarPageState} label="Home"     icon={Home}         onSelect={onSelectPage} expanded={expanded} />
        <SidebarIconButton page="chat"  activePage={sidebarPageState} label="Sentinel" icon={MessageSquare} onSelect={onSelectPage} expanded={expanded} />
        <SidebarLink href="/brain" active={brainActive} label="Brain Graph" icon={GitFork} expanded={expanded} />
        <SidebarLink href="/globe" active={globeActive} label="Globe" icon={Globe} expanded={expanded} />
      </nav>

      <div className="mt-5 flex w-full flex-col items-center gap-3 px-2">
        <SidebarSep expanded={expanded} />
      </div>

      {/* Group 2: Signale · Monitoring · Analytics · Komponenten */}
      <nav className={cn("mt-2", navClass)} aria-label="Tools">
        <SidebarLink href="/signal"      active={signalActive}     label="Signale"     icon={BellRing}    expanded={expanded} />
        <SidebarLink href="/monitoring"  active={monitoringActive} label="Monitoring"  icon={Activity}    expanded={expanded} />
        <SidebarIconButton page="analytics" activePage={sidebarPageState} label="Analytics"  icon={ChartColumn}  onSelect={onSelectPage} expanded={expanded} />
        <SidebarLink href="/komponenten" active={componentsActive} label="Komponenten" icon={Layers}      expanded={expanded} />
      </nav>

      <div className="mt-5 flex w-full flex-col items-center gap-3 px-2">
        <SidebarSep expanded={expanded} />
      </div>

      {/* Group 3: Manager Overview · Investors · CRM · Vermittler */}
      <nav className={cn("mt-2", navClass)} aria-label="Manager">
        <SidebarIconButton page="manager-overview"  activePage={sidebarPageState} label="Manager"   icon={BriefcaseBusiness} onSelect={onSelectPage} expanded={expanded} />
        <SidebarIconButton page="investor-analytics" activePage={sidebarPageState} label="Investors" icon={PieChart}          onSelect={onSelectPage} expanded={expanded} />
        <SidebarLink href="/onboarding" active={investorsCRMActive} label="Onboarding" icon={Users} expanded={expanded} />
        <SidebarIconButton page="sub-ib-system"     activePage={sidebarPageState} label="Vermittler" icon={Network}          onSelect={onSelectPage} expanded={expanded} />
      </nav>

      {/* Bottom: sep · header toggle · Settings · N */}
      <div className="mt-auto flex w-full flex-col items-center px-2 pb-5 pt-2">
        <SidebarSep expanded={expanded} />

        {/* Mobile Preview toggle — only shown in Modus 1 (Desktop) */}
        <div className="mt-2 w-full">
          <button
            type="button"
            onClick={cyclePreview}
            title={previewMode === "desktop" ? "Mobile Preview" : previewMode === "mobile" ? "Split View" : "Desktop"}
            style={{ display: "flex", height: 44, width: "100%", alignItems: "center", gap: 12, borderRadius: 8, border: 0, background: "transparent", cursor: "pointer", paddingLeft: 18, color: previewMode === "desktop" ? "rgba(113,113,122,1)" : "#e2ca7a", flexShrink: 0, transition: "color 150ms ease" }}
          >
            <Smartphone style={{ width: 19, height: 19, flexShrink: 0 }} strokeWidth={1.65} />
          </button>
        </div>

        {/* ── Modus 2: Mobile Only — fullscreen iPhone auf schwarz ── */}
        {mounted && previewMode === "mobile" && createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IPhone15Frame url={mobileUrl} scale={phoneScale} />
            <FloatToggleBtn onClick={cyclePreview} label="Split View →" />
          </div>,
          document.body
        )}

        {/* ── Modus 3: Split View — iPhone + Monitor, volle Höhe ── */}
        {mounted && previewMode === "split" && createPortal(
          <SplitView mobileUrl={mobileUrl} desktopUrl={desktopUrl} onCycle={cyclePreview} />,
          document.body
        )}

        {/* Header toggle — same fixed-icon pattern */}
        <div className="mt-1 w-full">
          <button
            type="button"
            onClick={toggleHeader}
            aria-label={headerHidden ? "Header einblenden" : "Header ausblenden"}
            title={headerHidden ? "Header einblenden" : "Header ausblenden"}
            className={cn(
              `flex h-11 w-full shrink-0 items-center gap-3 rounded-lg border-0 transition-colors ${ICON_PL}`,
              headerHidden
                ? "bg-transparent text-zinc-600 hover:text-zinc-500"
                : "bg-transparent text-zinc-300 hover:text-white"
            )}
          >
            {headerHidden
              ? <PanelTopOpen  className="h-[19px] w-[19px] shrink-0" strokeWidth={1.65} />
              : <PanelTopClose className="h-[19px] w-[19px] shrink-0" strokeWidth={1.65} />}
            <NavLabel label={headerHidden ? "Show header" : "Hide header"} expanded={expanded} />
          </button>
        </div>

        {/* Settings */}
        <div className="mt-1 w-full">
          <Link
            href="/settings"
            prefetch={true}
            aria-label="Settings"
            aria-current={settingsActive ? "page" : undefined}
            className={cn(
              `flex h-11 w-full shrink-0 items-center gap-3 rounded-lg border-0 transition-colors ${ICON_PL}`,
              settingsActive
                ? "bg-white/[0.08] text-white"
                : "bg-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
            )}
          >
            <Settings className="h-[19px] w-[19px] shrink-0 stroke-[1.65]" />
            <NavLabel label="Settings" expanded={expanded} />
          </Link>
        </div>

        {/* N badge — center-aligned with icons (icon center ≈ 35.5px, badge w-8=32px → pl 12) */}
        <div className="mt-2 w-full" style={{ paddingLeft: 12 }}>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.12] bg-[#0f1013] text-[12px] font-bold text-zinc-300 [font-family:var(--font-nunito),sans-serif]"
            aria-label="Next.js"
            title="Next.js"
          >
            N
          </div>
        </div>
      </div>
    </aside>
  );
}
