"use client";

import { usePathname } from "next/navigation";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { HeaderDivider } from "@/components/dashboard/header-divider";

const SECTION_LABELS: Record<string, string> = {
  "/": "HOME",
  "/signal": "SIGNAL",
  "/monitoring": "MONITORING",
  "/analytics": "ANALYTICS",
  "/komponenten": "KOMPONENTEN",
  "/settings": "SETTINGS",
  "/brain": "BRAIN",
  "/brain-graph": "BRAIN GRAPH",
  "/sentinel": "SENTINEL",
  "/investors-crm": "INVESTORS CRM",
};

function getSectionLabel(pathname: string): string {
  for (const [prefix, label] of Object.entries(SECTION_LABELS)) {
    if (prefix === "/" ? pathname === "/" : pathname.startsWith(prefix)) {
      return label;
    }
  }
  return "";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sectionLabel = getSectionLabel(pathname);

  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#0a0a0c]">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {sectionLabel && (
            <>
              <Topbar sectionLabel={sectionLabel} />
              <HeaderDivider />
            </>
          )}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
