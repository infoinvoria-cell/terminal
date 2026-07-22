"use client";

import { useEffect, useMemo } from "react";
import { useGlobalPage, type GlobalPage } from "@/context/global-page-context";
import { HeaderDivider } from "@/components/dashboard/header-divider";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TabsRow } from "@/components/dashboard/tabs-row";
import { Topbar } from "@/components/dashboard/topbar";
import {
  UniversalKpiStrip,
  type UniversalKpiStrings,
} from "@/components/dashboard/universal-kpi-strip";
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder";
import {
  HomeDashboardProvider,
  useHomeDashboard,
  type DashboardPage,
} from "@/context/home-dashboard-context";
import dynamic from "next/dynamic";
import { SentinelFloatingWindow } from "@/components/sentinel/SentinelFloatingWindow";
import type { CapalifeData } from "@/lib/capitalife-data";
import type { FSPortfolioSnapshot } from "@/lib/fsportfolio/types";
import {
  applyRrReportingMode,
  deserializeTrades,
  serializeTrades,
  type DashboardKpis,
  type SerializedTrade,
} from "@/lib/trades-analytics";
import type { ParsedBalanceRow, ParsedReportTrade } from "@/lib/mt-report-parser";

const PortfolioSection = dynamic(
  () => import("@/components/portfolio/portfolio-section").then((m) => m.PortfolioSection),
  { ssr: false }
);
const QuantDashboard = dynamic(
  () => import("@/components/quant/quant-dashboard").then((m) => m.QuantDashboard),
  { ssr: false }
);
const RiskDashboard = dynamic(
  () => import("@/components/risk/risk-dashboard").then((m) => m.RiskDashboard),
  { ssr: false }
);
const TradesDashboard = dynamic(
  () => import("@/components/trades/trades-dashboard").then((m) => m.TradesDashboard),
  { ssr: false }
);
const ManagerOverviewDashboard = dynamic(
  () => import("@/components/manager/manager-overview-dashboard").then((m) => m.ManagerOverviewDashboard),
  { ssr: false }
);
const SubIbSystemDashboard = dynamic(
  () => import("@/components/manager/sub-ib-system-dashboard").then((m) => m.SubIbSystemDashboard),
  { ssr: false }
);
const InvestorAnalyticsDashboard = dynamic(
  () => import("@/components/manager/investor-analytics-dashboard").then((m) => m.InvestorAnalyticsDashboard),
  { ssr: false }
);
const CoreInvestMonitoringGrid = dynamic(
  () => import("@/components/core-invest/CoreInvestMonitoringGrid"),
  { ssr: false }
);
const SentinelDashboard = dynamic(
  () => import("@/components/sentinel/sentinel-dashboard").then((m) => m.SentinelDashboard),
  { ssr: false }
);
const AnalyticsDashboard = dynamic(
  () => import("@/components/analytics/analytics-dashboard").then((m) => m.AnalyticsDashboard),
  { ssr: false }
);
type FundManagerHomeProps = {
  serialized: SerializedTrade[];
  reportTrades: ParsedReportTrade[];
  balanceRows: ParsedBalanceRow[];
  portfolioKpisBaseline: DashboardKpis;
  universal: UniversalKpiStrings;
  fsportfolio: FSPortfolioSnapshot;
  capalifeData: CapalifeData;
  initialPage?: DashboardPage;
};

type HomeShellProps = {
  serialized: SerializedTrade[];
  portfolioKpisBaseline: DashboardKpis;
  universal: UniversalKpiStrings;
  fsportfolio: FSPortfolioSnapshot;
  capalifeData: CapalifeData;
};

export function FundManagerHome({
  serialized,
  reportTrades,
  balanceRows,
  portfolioKpisBaseline,
  universal,
  fsportfolio,
  capalifeData,
  initialPage,
}: FundManagerHomeProps) {
  return (
    <HomeDashboardProvider
      initialReportTrades={reportTrades}
      initialBalanceRows={balanceRows}
      initialPage={initialPage}
    >
      <HomeShell
        serialized={serialized}
        portfolioKpisBaseline={portfolioKpisBaseline}
        universal={universal}
        fsportfolio={fsportfolio}
        capalifeData={capalifeData}
      />
    </HomeDashboardProvider>
  );
}

const VALID_PAGES: DashboardPage[] = [
  "home", "chat", "analytics", "invest", "grid", "users",
  "manager-overview", "sub-ib-system", "investor-analytics",
];

function HomeShell({
  serialized,
  portfolioKpisBaseline,
  universal,
  fsportfolio,
  capalifeData,
}: HomeShellProps) {
  const { page, homeTab, rrReportingMode, setPage } = useHomeDashboard();
  const { setCurrentPage } = useGlobalPage();

  // Restore page from ?page= query param when navigating from /monitoring or other routes.
  // Read via window.location.search (client-only) to avoid useSearchParams() causing SSR suspension.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("page") as DashboardPage | null;
    if (param && VALID_PAGES.includes(param)) {
      setPage(param);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync current dashboard page to global context so butler knows where user is
  useEffect(() => {
    const globalPage = (page as GlobalPage) ?? "home";
    const tab = page === "home" ? homeTab : undefined;
    setCurrentPage(globalPage, tab);
  }, [page, homeTab, setCurrentPage]);

  // Listen for butler requesting full Sentinel page
  useEffect(() => {
    const handler = () => setPage("chat");
    window.addEventListener("sentinel-butler-open-full", handler);
    return () => window.removeEventListener("sentinel-butler-open-full", handler);
  }, [setPage]);

  const baseRows = useMemo(() => deserializeTrades(serialized), [serialized]);
  const effectiveRows = useMemo(
    () => applyRrReportingMode(baseRows, rrReportingMode),
    [baseRows, rrReportingMode]
  );
  const effectiveSerialized = useMemo(
    () => serializeTrades(effectiveRows),
    [effectiveRows]
  );

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#0c0d10]">
      <SentinelFloatingWindow />
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar sectionLabel={pageLabel(page)} />
        <HeaderDivider />
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-8 pb-3 pt-6">
          {page === "home" ? (
            <>
              <div className="shrink-0">
                <UniversalKpiStrip universal={universal} />
              </div>
              <div className="shrink-0">
                <TabsRow />
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {homeTab === "portfolio" ? (
                  <PortfolioSection
                    trades={effectiveSerialized}
                    kpis={portfolioKpisBaseline}
                    capalifeData={capalifeData}
                  />
                ) : null}
                {homeTab === "risk" ? (
                  <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden pr-1">
                    <RiskDashboard trades={effectiveSerialized} />
                  </div>
                ) : null}
                {homeTab === "trades" ? (
                  <div className="flex h-full min-h-0 flex-col overflow-hidden">
                    <TradesDashboard trades={effectiveSerialized} />
                  </div>
                ) : null}
                {homeTab === "quant" ? (
                  <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden pr-1">
                    <QuantDashboard trades={effectiveSerialized} />
                  </div>
                ) : null}
              </div>
            </>
          ) : page === "manager-overview" ||
            page === "sub-ib-system" ||
            page === "investor-analytics" ? (
            <div className="h-full min-h-0 overflow-hidden">
              {page === "manager-overview" ? <ManagerOverviewDashboard /> : null}
              {page === "sub-ib-system" ? <SubIbSystemDashboard /> : null}
              {page === "investor-analytics" ? <InvestorAnalyticsDashboard /> : null}
            </div>
          ) : page === "chat" ? (
            <div className="h-full min-h-0 overflow-hidden">
              <SentinelDashboard />
            </div>
          ) : page === "invest" ? (
            <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden pr-1">
              <CoreInvestMonitoringGrid />
            </div>
          ) : page === "analytics" ? (
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
              <AnalyticsDashboard fsportfolio={fsportfolio} capalifeData={capalifeData} />
            </div>
          ) : (
            <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden pr-1">
              {page === "grid" ? (
                <SectionPlaceholder
                  title="Grid Workspace"
                  description="Grid page placeholder for custom operator widgets and layout presets."
                />
              ) : null}
              {page === "users" ? (
                <SectionPlaceholder
                  title="Users Workspace"
                  description="Users page placeholder for team roles, permissions, and account controls."
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function pageLabel(page: DashboardPage) {
  if (page === "home") return "HOME";
  if (page === "chat") return "SENTINEL";
  if (page === "analytics") return "ANALYTICS";
  if (page === "grid") return "GRID";
  if (page === "users") return "USERS";
  if (page === "manager-overview") return "MANAGER OVERVIEW";
  if (page === "sub-ib-system") return "SUB-IB SYSTEM";
  return "INVESTOR ANALYTICS";
}
