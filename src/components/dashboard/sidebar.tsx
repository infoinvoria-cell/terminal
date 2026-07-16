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
  LayoutGrid,
  MessageSquare,
  Network,
  PieChart,
  Settings,
  Users,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useHomeDashboard,
  type DashboardPage,
} from "@/context/home-dashboard-context";

const TOP_GROUP: { page: DashboardPage; label: string; icon: typeof Home }[] = [
  { page: "home", label: "Home", icon: Home },
  { page: "chat", label: "Chat", icon: MessageSquare },
  { page: "analytics", label: "Analytics", icon: ChartColumn },
  { page: "grid", label: "Grid", icon: LayoutGrid },
  { page: "users", label: "Users", icon: Users },
];

const MANAGER_GROUP: {
  page: DashboardPage;
  label: string;
  icon: typeof BriefcaseBusiness;
}[] = [
  {
    page: "manager-overview",
    label: "Manager Overview",
    icon: BriefcaseBusiness,
  },
  { page: "sub-ib-system", label: "Sub-IB System", icon: Network },
  { page: "investor-analytics", label: "Investor Analytics", icon: PieChart },
];

function SidebarIconButton({
  page,
  activePage,
  label,
  icon: Icon,
  onSelect,
}: {
  page: DashboardPage;
  activePage: DashboardPage;
  label: string;
  icon: typeof Home;
  onSelect: (page: DashboardPage) => void;
}) {
  const active = activePage === page;
  return (
    <button
      type="button"
      onClick={() => onSelect(page)}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-0 transition-colors",
        active
          ? "bg-white/[0.08] text-white"
          : "bg-transparent text-zinc-500 hover:text-zinc-300"
      )}
    >
      <Icon
        className={cn(
          "h-[19px] w-[19px]",
          active && (page === "manager-overview" || page === "sub-ib-system" || page === "investor-analytics")
            ? "text-[#e2ca7a]"
            : ""
        )}
        strokeWidth={1.65}
      />
    </button>
  );
}

export function Sidebar() {
  const { page, setPage } = useHomeDashboard();
  const pathname = usePathname();
  const router = useRouter();
  const monitoringActive = pathname?.startsWith("/monitoring") ?? false;
  const signalActive = pathname?.startsWith("/signal") ?? false;
  const brainActive = (pathname?.startsWith("/brain") ?? false) || (pathname?.startsWith("/brain-graph") ?? false);
  const componentsActive = pathname?.startsWith("/komponenten") ?? false;
  const shellRouteActive = pathname === "/" || !pathname;
  const sidebarPageState = shellRouteActive && !monitoringActive && !signalActive && !brainActive && !componentsActive
    ? page
    : ("__none__" as DashboardPage);
  // When not on the home shell route (/), page-state buttons must navigate there.
  // Passing page= so HomeShell can restore the correct sub-page on arrival.
  const onSelectPage = (p: DashboardPage) => {
    if (pathname === "/" || !pathname) {
      setPage(p);
    } else {
      router.push(`/?page=${p}`);
    }
  };

  return (
    <aside className="flex h-full min-h-0 w-[72px] shrink-0 flex-col items-center border-r border-[#2a2b30]/60 bg-[#0a0a0c] pt-4">
      <div className="flex w-full shrink-0 justify-center px-2">
        <button
          type="button"
          onClick={() => onSelectPage("home")}
          className="flex border-0 bg-transparent p-0 shadow-none outline-none ring-0 transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/12"
          aria-label="Capitalife home"
        >
          <Image
            src="/CAPITALIFE_ICON.png"
            alt=""
            width={34}
            height={34}
            className="h-[34px] w-[34px] object-contain object-center"
            priority
          />
        </button>
      </div>

      <nav
        className="mt-9 flex w-full flex-none flex-col items-center gap-3 px-2"
        aria-label="Primary pages"
      >
        {TOP_GROUP.map((item) => (
          <SidebarIconButton
            key={item.label}
            page={item.page}
            activePage={sidebarPageState}
            label={item.label}
            icon={item.icon}
            onSelect={onSelectPage}
          />
        ))}
      </nav>

      <div
        className="mt-5 h-px w-[52px] shrink-0"
        style={{
          background:
            "linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)",
        }}
        aria-hidden
      />

      <nav
        className="mt-5 flex w-full flex-none flex-col items-center gap-3 px-2"
        aria-label="Manager pages"
      >
        {MANAGER_GROUP.map((item) => (
          <SidebarIconButton
            key={item.label}
            page={item.page}
            activePage={sidebarPageState}
            label={item.label}
            icon={item.icon}
            onSelect={onSelectPage}
          />
        ))}
      </nav>

      <div
        className="mt-5 h-px w-[52px] shrink-0"
        style={{
          background:
            "linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)",
        }}
        aria-hidden
      />

      <nav
        className="mt-5 flex w-full flex-none flex-col items-center gap-3 px-2"
        aria-label="Monitoring"
      >
        <Link
          href="/monitoring"
          aria-label="Monitoring"
          aria-current={monitoringActive ? "page" : undefined}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-0 transition-colors",
            monitoringActive
              ? "bg-white/[0.08] text-white"
              : "bg-transparent text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Activity className="h-[19px] w-[19px]" strokeWidth={1.65} />
        </Link>
        <Link
          href="/signal"
          aria-label="Signal"
          aria-current={signalActive ? "page" : undefined}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-0 transition-colors",
            signalActive
              ? "bg-white/[0.08] text-white"
              : "bg-transparent text-zinc-500 hover:text-zinc-300"
          )}
        >
          <BellRing className="h-[19px] w-[19px]" strokeWidth={1.65} />
        </Link>
        <Link
          href="/brain"
          aria-label="Brain"
          aria-current={brainActive ? "page" : undefined}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-0 transition-colors",
            brainActive
              ? "bg-white/[0.08] text-[#e2ca7a]"
              : "bg-transparent text-zinc-600 hover:text-zinc-400"
          )}
        >
          <GitFork className="h-[19px] w-[19px]" strokeWidth={1.65} />
        </Link>
        <Link
          href="/komponenten"
          aria-label="Komponenten"
          aria-current={componentsActive ? "page" : undefined}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-0 transition-colors",
            componentsActive
              ? "bg-white/[0.08] text-[#e2ca7a]"
              : "bg-transparent text-zinc-600 hover:text-zinc-400"
          )}
        >
          <Layers className="h-[19px] w-[19px]" strokeWidth={1.65} />
        </Link>
      </nav>

      <div className="mt-auto flex w-full flex-col items-center gap-2 pb-5 pt-2">
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
          aria-label="Settings"
        >
          <Settings className="h-[19px] w-[19px] stroke-[1.65]" />
        </button>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.12] bg-[#0f1013] text-[12px] font-bold text-zinc-300 [font-family:var(--font-nunito),sans-serif]"
          aria-label="Next.js badge"
          title="Next.js"
        >
          N
        </div>
      </div>
    </aside>
  );
}
