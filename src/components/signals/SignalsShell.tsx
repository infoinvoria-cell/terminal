"use client";

import { useState } from "react";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { HeaderDivider } from "@/components/dashboard/header-divider";
import { useHeaderState } from "@/context/header-state-context";
import { SignalsDashboard } from "./SignalsDashboard";
import { CapitalifeModuleErrorBoundary } from "@/components/ui/CapitalifeModuleErrorBoundary";

export function SignalsShell() {
  const { headerHidden } = useHeaderState();
  const [headerHover, setHeaderHover] = useState(false);
  const headerFixedVisible = !headerHidden;
  const headerOverlayVisible = headerHidden && headerHover;

  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="relative flex h-[100dvh] min-h-0 min-w-0 overflow-hidden bg-[#0B0C0F]">
        <Sidebar />
        <div className="absolute inset-0 z-0 flex min-h-0 min-w-0 flex-col overflow-hidden pl-[72px]">
          {headerHidden && (
            <div
              className="absolute right-0 top-0 z-20 h-[10px] w-[120px]"
              onMouseEnter={() => setHeaderHover(true)}
              onMouseLeave={() => setHeaderHover(false)}
            />
          )}
          {headerFixedVisible && (
            <div
              className="overflow-hidden"
              style={{
                width: "100%",
                background: "#0B0C0F",
                boxShadow: "none",
              }}
            >
              <Topbar sectionLabel="SIGNALE" visible={true} />
              <HeaderDivider visible={true} />
            </div>
          )}
          {headerHidden && (
            <div
              className="pointer-events-none absolute right-0 top-0 z-30"
              style={{ left: 72 }}
            >
              <div
                className="pointer-events-auto overflow-hidden"
                onMouseEnter={() => setHeaderHover(true)}
                onMouseLeave={() => setHeaderHover(false)}
                style={{
                  width: "100%",
                  background: headerOverlayVisible ? "linear-gradient(180deg, rgba(10,10,12,0.28) 0%, rgba(10,10,12,0.14) 100%)" : "transparent",
                  backdropFilter: headerOverlayVisible ? "blur(38px) saturate(182%) brightness(1.05)" : "none",
                  boxShadow: headerOverlayVisible ? "0 24px 48px rgba(0,0,0,0.44)" : "none",
                  transition: "background 220ms ease, backdrop-filter 220ms ease, box-shadow 220ms ease",
                }}
              >
                <Topbar sectionLabel="SIGNALE" visible={headerOverlayVisible} />
                <HeaderDivider visible={headerOverlayVisible} />
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pl-[10px]">
            <CapitalifeModuleErrorBoundary route="/signals" module="SIGNALS">
              <SignalsDashboard />
            </CapitalifeModuleErrorBoundary>
          </div>
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
