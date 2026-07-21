"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BellRing,
  BriefcaseBusiness,
  ChartColumn,
  GitFork,
  Home,
  Layers,
  MessageSquare,
  Network,
  PanelTopClose,
  PanelTopOpen,
  PieChart,
  Settings,
  Smartphone,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  useHomeDashboard,
  type DashboardPage,
} from "@/context/home-dashboard-context";
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

// ── iPhone 15 Pro dimensions ───────────────────────────────────────────────
const P_W = 393, P_H = 852, P_FP = 14, P_R = 48;
const P_OUTER_W = P_W + P_FP * 2;      // 421
const P_OUTER_H = P_H + P_FP * 2;      // 880

// ── MacBook 14" dimensions ─────────────────────────────────────────────────
// iframe renders at native 1280×800 then is scaled to fit in the lid screen
const MAC_IFRAME_W = 1280, MAC_IFRAME_H = 800;
const MAC_SCREEN_W = 960, MAC_SCREEN_H = 600;          // display clip size
const MAC_INNER_SCALE = MAC_SCREEN_W / MAC_IFRAME_W;   // 0.75
const MAC_LID_W = MAC_SCREEN_W + P_FP * 2;            // 988
const MAC_LID_H = 12 + MAC_SCREEN_H + 36;             // 648
const MAC_BASE_W = MAC_LID_W + 32;                     // 1020
const MAC_BASE_H = 200;
const MAC_OUTER_W = MAC_BASE_W;                        // 1020
const MAC_OUTER_H = MAC_LID_H + 6 + MAC_BASE_H;       // 854

function toMobileUrl(path: string | null): string {
  if (!path) return "/m/home";
  if (path.startsWith("/signal") || path.startsWith("/monitoring")) return "/m/signale";
  if (path.startsWith("/brain")) return "/m/brain";
  if (path.startsWith("/settings")) return "/m/settings";
  return "/m/home";
}

function computeScales(mounted: boolean, mode: PreviewMode): { phoneScale: number; macScale: number } {
  if (!mounted || typeof window === "undefined") return { phoneScale: 0.7, macScale: 0.7 };
  const hAvail = Math.min(window.innerHeight - 60, 920);
  const wAvail = window.innerWidth - 80;
  if (mode === "mobile") {
    const s = Math.min(hAvail / P_OUTER_H, wAvail / P_OUTER_W, 1);
    return { phoneScale: Math.max(s, 0.3), macScale: 0 };
  }
  // Split: both fit in available viewport
  const sP = hAvail / P_OUTER_H;
  const sM = hAvail / MAC_OUTER_H;
  const totalW = P_OUTER_W * sP + 56 + MAC_OUTER_W * sM;
  const ratio = totalW > wAvail ? wAvail / totalW : 1;
  return { phoneScale: Math.max(sP * ratio, 0.3), macScale: Math.max(sM * ratio, 0.3) };
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

// ── iPhone 15 Pro mockup (Dynamic Island) ─────────────────────────────────
function IPhone15Frame({ url, scale }: { url: string; scale: number }) {
  return (
    <div style={{ width: P_OUTER_W * scale, height: P_OUTER_H * scale, flexShrink: 0, position: "relative" }}>
      <div style={{ width: P_OUTER_W, height: P_OUTER_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute" }}>
        {/* Outer shell */}
        <div style={{ width: P_OUTER_W, height: P_OUTER_H, borderRadius: P_R, background: "linear-gradient(160deg,#3a3a3c 0%,#1c1c1e 60%,#2a2a2c 100%)", boxShadow: "0 0 0 1px rgba(255,255,255,0.13), inset 0 0 0 1px rgba(0,0,0,0.4), 0 40px 100px rgba(0,0,0,0.85)", position: "relative", overflow: "hidden" }}>
          {/* Side buttons — left: mute, vol+, vol- */}
          <div style={{ position: "absolute", left: -2.5, top: 92,  width: 2.5, height: 28, background: "#3a3a3c", borderRadius: "2px 0 0 2px" }} />
          <div style={{ position: "absolute", left: -2.5, top: 138, width: 2.5, height: 56, background: "#3a3a3c", borderRadius: "2px 0 0 2px" }} />
          <div style={{ position: "absolute", left: -2.5, top: 210, width: 2.5, height: 56, background: "#3a3a3c", borderRadius: "2px 0 0 2px" }} />
          {/* Side button — right: power */}
          <div style={{ position: "absolute", right: -2.5, top: 172, width: 2.5, height: 84, background: "#3a3a3c", borderRadius: "0 2px 2px 0" }} />
          {/* Screen area */}
          <div style={{ position: "absolute", top: P_FP, left: P_FP, width: P_W, height: P_H, borderRadius: P_R - P_FP, overflow: "hidden", background: "#000" }}>
            <iframe src={url} style={{ width: P_W, height: P_H, border: "none", display: "block" }} title="Mobile Preview" />
            {/* Dynamic Island — sits ON TOP of iframe */}
            <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", width: 126, height: 37, background: "#000", borderRadius: 20, zIndex: 10, boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MacBook 14" mockup ─────────────────────────────────────────────────────
function MacbookFrame({ url, scale }: { url: string; scale: number }) {
  return (
    <div style={{ width: MAC_OUTER_W * scale, height: MAC_OUTER_H * scale, flexShrink: 0, position: "relative" }}>
      <div style={{ width: MAC_OUTER_W, height: MAC_OUTER_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute" }}>
        {/* Keyboard base — slightly wider than lid */}
        <div style={{ position: "absolute", bottom: 0, left: 0, width: MAC_BASE_W, height: MAC_BASE_H, borderRadius: "0 0 12px 12px", background: "linear-gradient(180deg,#3d3d3f 0%,#2c2c2e 100%)", boxShadow: "0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}>
          {/* Keyboard area */}
          <div style={{ margin: "18px 24px 0", height: 108, borderRadius: 6, background: "rgba(0,0,0,0.18)" }} />
          {/* Trackpad */}
          <div style={{ margin: "10px auto 0", width: 180, height: 44, borderRadius: 6, background: "rgba(0,0,0,0.15)" }} />
          {/* Front edge highlight */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, borderRadius: "0 0 12px 12px", background: "rgba(0,0,0,0.35)" }} />
        </div>
        {/* Hinge shadow strip */}
        <div style={{ position: "absolute", bottom: MAC_BASE_H - 2, left: 16, right: 16, height: 8, background: "rgba(0,0,0,0.5)", borderRadius: "0 0 4px 4px" }} />
        {/* Lid — centered above base */}
        <div style={{ position: "absolute", top: 0, left: (MAC_BASE_W - MAC_LID_W) / 2, width: MAC_LID_W, height: MAC_LID_H, borderRadius: "12px 12px 4px 4px", background: "linear-gradient(160deg,#4a4a4c 0%,#2c2c2e 100%)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.12)" }}>
          {/* Top bezel */}
          <div style={{ height: 12, background: "transparent" }} />
          {/* Screen clip area */}
          <div style={{ margin: "0 14px", height: MAC_SCREEN_H, borderRadius: 4, overflow: "hidden", background: "#000", position: "relative" }}>
            {/* iframe at native desktop width, scaled to fit screen */}
            <div style={{ width: MAC_IFRAME_W, height: MAC_IFRAME_H, transform: `scale(${MAC_INNER_SCALE})`, transformOrigin: "top left" }}>
              <iframe src={url} style={{ width: MAC_IFRAME_W, height: MAC_IFRAME_H, border: "none", display: "block" }} title="Desktop Preview" />
            </div>
          </div>
          {/* Chin with logo dot */}
          <div style={{ height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(255,255,255,0.12)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { page, setPage } = useHomeDashboard();
  const pathname = usePathname();
  const router = useRouter();

  const { headerHidden, toggleHeader } = useHeaderState();
  const expanded = false; // hover-expand disabled; sidebar stays collapsed

  // ── Mobile Preview state ──────────────────────────────────────────────
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [mounted, setMounted] = useState(false);
  const [scales, setScales] = useState({ phoneScale: 0.7, macScale: 0.7 });

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

  // Recompute scales on mount and resize
  useEffect(() => {
    const update = () => setScales(computeScales(true, previewMode));
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, [previewMode]);

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
  const { phoneScale, macScale } = scales;

  const monitoringActive  = pathname?.startsWith("/monitoring") ?? false;
  const signalActive      = pathname?.startsWith("/signal") ?? false;
  const brainActive       = (pathname?.startsWith("/brain") ?? false) || (pathname?.startsWith("/brain-graph") ?? false);
  const componentsActive  = pathname?.startsWith("/komponenten") ?? false;
  const settingsActive    = pathname?.startsWith("/settings") ?? false;
  const shellRouteActive  = pathname === "/" || !pathname;

  const sidebarPageState: DashboardPage =
    shellRouteActive && !monitoringActive && !signalActive && !brainActive && !componentsActive
      ? page
      : ("__none__" as DashboardPage);

  const onSelectPage = (p: DashboardPage) => {
    if (pathname === "/" || !pathname) {
      setPage(p);
    } else {
      router.push(`/?page=${p}`);
    }
  };

  // All nav containers: always left-aligned (items use fixed pl, so icons never shift)
  const navClass = "flex w-full flex-none flex-col gap-3 px-2 items-start";

  return (
    <aside
      style={{
        width: expanded ? EXPANDED_W : COLLAPSED_W,
        transition: `width 250ms ${EASE}`,
        flexShrink: 0,
        overflow: "hidden",
      }}
      className="flex h-full min-h-0 flex-col border-r border-[#2a2b30]/60 bg-[#0a0a0c] pt-4"
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
      </nav>

      <div className="mt-5 flex w-full flex-col items-center gap-3 px-2">
        <SidebarSep expanded={expanded} />
      </div>

      {/* Group 2: Signale · Monitoring · Analytics · Komponenten */}
      <nav className={cn("mt-2", navClass)} aria-label="Tools">
        <SidebarLink href="/signal"      active={signalActive}     label="Signale"     icon={BellRing}    expanded={expanded} />
        <SidebarLink href="/monitoring"  active={monitoringActive} label="Monitoring"  icon={Activity}    expanded={expanded} />
        <SidebarIconButton page="analytics" activePage={sidebarPageState} label="Analytics"  icon={ChartColumn} onSelect={onSelectPage} expanded={expanded} />
        <SidebarLink href="/komponenten" active={componentsActive} label="Komponenten" icon={Layers}      expanded={expanded} />
      </nav>

      <div className="mt-5 flex w-full flex-col items-center gap-3 px-2">
        <SidebarSep expanded={expanded} />
      </div>

      {/* Group 3: Manager Overview · Investors · Vermittler */}
      <nav className={cn("mt-2", navClass)} aria-label="Manager">
        <SidebarIconButton page="manager-overview"  activePage={sidebarPageState} label="Manager"   icon={BriefcaseBusiness} onSelect={onSelectPage} expanded={expanded} />
        <SidebarIconButton page="investor-analytics" activePage={sidebarPageState} label="Investors" icon={PieChart}          onSelect={onSelectPage} expanded={expanded} />
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

        {/* ── Modus 3: Split View — iPhone + MacBook nebeneinander ── */}
        {mounted && previewMode === "split" && createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", gap: 56 }}>
            <IPhone15Frame url={mobileUrl} scale={phoneScale} />
            <MacbookFrame url={desktopUrl} scale={macScale} />
            <FloatToggleBtn onClick={cyclePreview} label="Desktop →" />
          </div>,
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

        {/* N badge — fixed at same left as icons */}
        <div className="mt-2 w-full" style={{ paddingLeft: 18 }}>
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
