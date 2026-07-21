"use client";

import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { HeaderDivider } from "@/components/dashboard/header-divider";
import { Topbar } from "@/components/dashboard/topbar";
import { GlobeErrorBoundary } from "@/components/globe/GlobeErrorBoundary";
import dynamic from "next/dynamic";

const GlobeApp = dynamic(() => import("@/components/globe/GlobeApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0c0d10]">
      <div className="text-sm text-zinc-500">Globe wird geladen…</div>
    </div>
  ),
});

export function GlobeShell() {
  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#0c0d10]">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar sectionLabel="GLOBE" />
          <HeaderDivider />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <GlobeErrorBoundary>
              <GlobeApp />
            </GlobeErrorBoundary>
          </div>
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
