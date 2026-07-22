"use client";

import { useState, useCallback } from "react";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { HeaderDivider } from "@/components/dashboard/header-divider";
import { SignalsDashboard } from "./SignalsDashboard";

export function SignalsShell() {
  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#0c0d10]">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar sectionLabel="SIGNALE" />
          <HeaderDivider />
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <SignalsDashboard />
          </div>
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
