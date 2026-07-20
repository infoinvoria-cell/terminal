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
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  useHomeDashboard,
  type DashboardPage,
} from "@/context/home-dashboard-context";
import { useHeaderState } from "@/context/header-state-context";

const LAST_PAGE_KEY = "fmd_last_page";
const RESTORE_FLAG  = "fmd_restore";

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

// ── Sidebar ────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { page, setPage } = useHomeDashboard();
  const pathname = usePathname();
  const router = useRouter();

  const { headerHidden, toggleHeader } = useHeaderState();
  const expanded = false; // hover-expand disabled; sidebar stays collapsed

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

        {/* Header toggle — same fixed-icon pattern */}
        <div className="mt-2 w-full">
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
