"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { HeaderDivider } from "@/components/dashboard/header-divider";
import { useHeaderState } from "@/context/header-state-context";
import { CapitalifeModuleErrorBoundary } from "@/components/ui/CapitalifeModuleErrorBoundary";

const SECTION_LABELS: Record<string, string> = {
  "/": "HOME",
  "/engine": "TRADING ENGINE",
  "/signal": "SIGNAL",
  "/monitoring": "MONITORING",
  "/analytics": "ANALYTICS",
  "/komponenten": "KOMPONENTEN",
  "/settings": "SETTINGS",
  "/brain": "BRAIN",
  "/brain-graph": "BRAIN GRAPH",
  "/preview-workspace": "PREVIEW",
  "/sentinel": "SENTINEL",
  "/investors-crm": "INVESTORS CRM",
  "/manager": "PORTFOLIO LAB",
  "/investors": "INVESTORS",
  "/onboarding": "ONBOARDING",
  "/vermittler": "VERMITTLER",
  "/partner": "PARTNERPROGRAMM",
  "/referenzen": "REFERENZEN",
  "/about": "BIBEL",
  "/globe": "GLOBE",
  "/investor-db": "INVESTOR DB",
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
  const searchParams = useSearchParams();
  const sectionLabel = getSectionLabel(pathname);
  const { headerHidden } = useHeaderState();
  const [headerHover, setHeaderHover] = useState(false);
  const previewMode = searchParams.get("preview") === "1";
  const headerFixedVisible = Boolean(sectionLabel) && !headerHidden;
  const headerOverlayVisible = Boolean(sectionLabel) && headerHidden && headerHover;

  if (previewMode) {
    return (
      <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
        <div className="flex h-[100dvh] min-h-0 min-w-0 overflow-hidden bg-[#0a0a0c]">
          <div className="dashboard-content-shell flex min-h-0 flex-1 overflow-hidden pl-[10px] pt-0">
            <CapitalifeModuleErrorBoundary route={pathname} module={sectionLabel || "PREVIEW"}>
              {children}
            </CapitalifeModuleErrorBoundary>
          </div>
        </div>
      </HomeDashboardProvider>
    );
  }

  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="relative flex h-[100dvh] min-h-0 min-w-0 overflow-hidden bg-[#0a0a0c]">
        <Sidebar />
        <div className="absolute inset-0 z-0 flex min-h-0 min-w-0 flex-col overflow-hidden pl-[72px]">
          {sectionLabel && (
            <>
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
                    background: "#0c0d10",
                    boxShadow: "none",
                  }}
                >
                  <Topbar sectionLabel={sectionLabel} visible={true} />
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
                    <Topbar sectionLabel={sectionLabel} visible={headerOverlayVisible} />
                    <HeaderDivider visible={headerOverlayVisible} />
                  </div>
                </div>
              )}
            </>
          )}
          <div
            className="dashboard-content-shell flex min-h-0 overflow-hidden pl-[8px]"
            style={{ height: "calc(100dvh - var(--header-height, 0px))" }}
          >
            <CapitalifeModuleErrorBoundary route={pathname} module={sectionLabel || "APP"}>
              {children}
            </CapitalifeModuleErrorBoundary>
          </div>
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
