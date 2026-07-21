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
import { useUser } from "@/context/user-context";

const COLLAPSED_W = 72;
const EXPANDED_W  = 200;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

// Icon is always at pl-[18px] inside a nav with px-2 → left edge at 26px from aside,
// matching what justify-center gave it in the 44px collapsed button. Icons never move.
const ICON_PL = "pl-[18px]";

// ── User chip ──────────────────────────────────────────────────────────────

function UserChip({ expanded }: { expanded: boolean }) {
  const { user, clearUser } = useUser();
  if (!user) return null;
  const initials = user.name.split(" ").map(w => w[0]).join("").slice(0, 2);
  return (
    <button
      type="button"
      onClick={clearUser}
      title={`${user.name} — Wechseln`}
      aria-label={`Aktiver User: ${user.name}. Klicken zum Wechseln.`}
      className={`mt-2 flex h-11 w-full shrink-0 items-center gap-3 rounded-lg border-0 bg-transparent transition-colors hover:bg-white/[0.06] ${ICON_PL}`}
    >
      {user.avatar ? (
        <Image
          src={user.avatar}
          alt={user.name}
          width={26}
          height={26}
          className="shrink-0 rounded-full object-contain"
          style={{ background: "#1c1d20" }}
        />
      ) : (
        <div
          className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ width: 26, height: 26, background: "linear-gradient(135deg,#e2ca7a,#b8962e)", color: "#17181d" }}
        >
          {initials}
        </div>
      )}
      <NavLabel label={user.name} expanded={expanded} />
    </button>
  );
}

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
const PANEL_W = 450;
const PW = 390, PH = 844, FP = 14, FR = 50;
const OUTER_W = PW + FP * 2;
const OUTER_H = PH + FP * 2 + 24;

function toMobileUrl(desktopPath: string | null): string {
  if (!desktopPath) return "/m/home";
  if (desktopPath.startsWith("/signal") || desktopPath.startsWith("/monitoring")) return "/m/signale";
  if (desktopPath.startsWith("/brain")) return "/m/brain";
  if (desktopPath.startsWith("/settings")) return "/m/settings";
  return "/m/home";
}

function IPhoneFrame({ url, scale }: { url: string; scale: number }) {
  return (
    <div style={{ width: OUTER_W * scale, height: OUTER_H * scale, flexShrink: 0, position: "relative" }}>
      <div style={{ width: OUTER_W, height: OUTER_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute" }}>
        <div style={{ width: OUTER_W, height: OUTER_H, borderRadius: FR, background: "linear-gradient(145deg,#2a2a2a,#1a1a1a)", boxShadow: "0 0 0 1px rgba(255,255,255,0.12),0 32px 80px rgba(0,0,0,0.8)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: -3, top: 100, width: 3, height: 32, background: "#2f2f2f", borderRadius: "3px 0 0 3px" }} />
          <div style={{ position: "absolute", left: -3, top: 148, width: 3, height: 52, background: "#2f2f2f", borderRadius: "3px 0 0 3px" }} />
          <div style={{ position: "absolute", left: -3, top: 214, width: 3, height: 52, background: "#2f2f2f", borderRadius: "3px 0 0 3px" }} />
          <div style={{ position: "absolute", right: -3, top: 160, width: 3, height: 72, background: "#2f2f2f", borderRadius: "0 3px 3px 0" }} />
          <div style={{ position: "absolute", top: FP, left: FP, width: PW, height: PH + 24, borderRadius: FR - FP, overflow: "hidden", background: "#000" }}>
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 120, height: 34, background: "#1a1a1a", borderRadius: "0 0 22px 22px", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#2a2a2a" }} />
              <div style={{ width: 42, height: 8, borderRadius: 4, background: "#222" }} />
            </div>
            <iframe src={url} style={{ width: PW, height: PH, border: "none", marginTop: 34, display: "block" }} title="Mobile Preview" />
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

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREVIEW_LS_KEY);
      if (stored === "2") setPreviewMode("mobile");
      else if (stored === "3") setPreviewMode("split");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--mobile-preview-left",
      previewMode === "split" ? `${PANEL_W}px` : "0px"
    );
  }, [previewMode]);

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
  const splitScale = Math.min((PANEL_W - 40) / OUTER_W, (typeof window !== "undefined" ? window.innerHeight - 48 : 800) / OUTER_H);
  const mobileScale = typeof window !== "undefined"
    ? Math.min((window.innerHeight - 64) / OUTER_H, (window.innerWidth - 64) / OUTER_W, 1)
    : 0.72;

  const LABEL: Record<PreviewMode, string> = { desktop: "Desktop", mobile: "Mobile", split: "Split" };
  const NEXT_LABEL: Record<PreviewMode, string> = { desktop: "Mobile", mobile: "Split", split: "Desktop" };

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
            title={`Preview: ${LABEL[previewMode]} → ${NEXT_LABEL[previewMode]}`}
            style={{ display: "flex", height: 44, width: "100%", alignItems: "center", gap: 12, borderRadius: 8, border: 0, background: "transparent", cursor: "pointer", paddingLeft: 18, color: previewMode === "desktop" ? "rgba(113,113,122,1)" : "#e2ca7a", flexShrink: 0, transition: "color 150ms ease" }}
          >
            <Smartphone style={{ width: 19, height: 19, flexShrink: 0 }} strokeWidth={1.65} />
          </button>
        </div>

        {/* ── Modus 2: Mobile Only — fullscreen iPhone auf schwarz ── */}
        {mounted && previewMode === "mobile" && createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IPhoneFrame url={mobileUrl} scale={mobileScale} />
            {/* Float-Button unten links */}
            <button onClick={cyclePreview} style={{ position: "fixed", bottom: 20, left: 20, zIndex: 1100, display: "flex", alignItems: "center", gap: 7, background: "rgba(14,14,18,0.92)", border: "1px solid rgba(226,202,122,0.25)", borderRadius: 20, padding: "7px 14px 7px 10px", color: "#e2ca7a", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-montserrat,sans-serif)", backdropFilter: "blur(8px)", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
              <Smartphone style={{ width: 13, height: 13 }} strokeWidth={1.65} />
              Split →
            </button>
          </div>,
          document.body
        )}

        {/* ── Modus 3: Split View — iPhone links, Desktop rechts ── */}
        {mounted && previewMode === "split" && createPortal(
          <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: PANEL_W, zIndex: 900, background: "#070809", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IPhoneFrame url={mobileUrl} scale={splitScale} />
            {/* Float-Button unten links */}
            <button onClick={cyclePreview} style={{ position: "absolute", bottom: 20, left: 20, zIndex: 10, display: "flex", alignItems: "center", gap: 7, background: "rgba(14,14,18,0.92)", border: "1px solid rgba(226,202,122,0.25)", borderRadius: 20, padding: "7px 14px 7px 10px", color: "#e2ca7a", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-montserrat,sans-serif)", backdropFilter: "blur(8px)", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
              <Smartphone style={{ width: 13, height: 13 }} strokeWidth={1.65} />
              Desktop →
            </button>
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

        {/* User avatar + name */}
        <UserChip expanded={expanded} />

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
