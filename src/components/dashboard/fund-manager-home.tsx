"use client";

import { useEffect, useMemo, useState } from "react";
import { useGlobalPage, type GlobalPage } from "@/context/global-page-context";
import { TabsRow } from "@/components/dashboard/tabs-row";
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
import type { TrackRecordOverview } from "@/lib/track-record/types";
import type { PortfolioDailySeriesPoint } from "@/components/dashboard/performance-report-chart";
import {
  applyRrReportingMode,
  deserializeTrades,
  serializeTrades,
  type DashboardKpis,
  type SerializedTrade,
} from "@/lib/trades-analytics";
import type { ParsedBalanceRow, ParsedReportTrade } from "@/lib/mt-report-parser";
import type { SpyDailyReturn } from "@/lib/benchmark/spy-data";
import { computeSpyKpis, type SpyBenchmarkKpis } from "@/lib/benchmark/spy-kpis";
import type { AccountViewData, AccountViewId } from "@/lib/dashboard/dashboard-page-data";

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
  fsportfolio: FSPortfolioSnapshot | undefined;
  capalifeData: CapalifeData;
  trackRecordOverview: TrackRecordOverview | null;
  spyDailyReturns?: SpyDailyReturn[];
  initialPage?: DashboardPage;
  accountViews?: AccountViewData[];
};

type TradeEventPoint = {
  closeTimeUtc: string;
  closeTimeEpoch: number;
  cumulativeReturn: number;
  tradeId: string;
  symbol: string;
  side: string;
  netProfitLocal: number;
};

type HomeShellProps = {
  serialized: SerializedTrade[];
  portfolioKpisBaseline: DashboardKpis;
  universal: UniversalKpiStrings;
  fsportfolio: FSPortfolioSnapshot | undefined;
  capalifeData: CapalifeData;
  trackRecordOverview: TrackRecordOverview | null;
  spyDailyReturns?: SpyDailyReturn[];
  performanceSeries?: PortfolioDailySeriesPoint[];
  tradeEventSeries?: TradeEventPoint[];
  accountViews?: AccountViewData[];
};

export function FundManagerHome({
  serialized,
  reportTrades,
  balanceRows,
  portfolioKpisBaseline,
  universal,
  fsportfolio,
  capalifeData,
  trackRecordOverview,
  spyDailyReturns,
  initialPage,
  accountViews,
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
        trackRecordOverview={trackRecordOverview}
        spyDailyReturns={spyDailyReturns}
        performanceSeries={universal.performanceSeries}
        tradeEventSeries={universal.tradeEventSeries}
        accountViews={accountViews}
      />
    </HomeDashboardProvider>
  );
}

const VALID_PAGES: DashboardPage[] = [
  "home", "chat", "analytics", "grid", "users",
  "manager-overview", "sub-ib-system", "investor-analytics",
];

const VALID_ACCOUNT_VIEWS: AccountViewId[] = ["account_a", "account_b", "combined"];

function HomeShell({
  serialized,
  portfolioKpisBaseline,
  universal,
  fsportfolio,
  capalifeData,
  trackRecordOverview,
  spyDailyReturns = [],
  performanceSeries,
  tradeEventSeries,
  accountViews,
}: HomeShellProps) {
  const { page, homeTab, rrReportingMode, setPage } = useHomeDashboard();
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [activeView, setActiveView] = useState<AccountViewId>("combined");

  // Portfolio period anchors (from official KPIs)
  const SPY_START = "2024-04-11";
  const SPY_END = "2026-07-01";

  const spyBenchmarkKpis = useMemo<SpyBenchmarkKpis | null>(
    () =>
      spyDailyReturns.length > 0
        ? computeSpyKpis(spyDailyReturns, SPY_START, SPY_END)
        : null,
    [spyDailyReturns]
  );
  const { setCurrentPage } = useGlobalPage();

  // Restore page from ?page= query param when navigating from /monitoring or other routes.
  // Read via window.location.search (client-only) to avoid useSearchParams() causing SSR suspension.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pageParam = params.get("page") as DashboardPage | null;
    if (pageParam && VALID_PAGES.includes(pageParam)) {
      setPage(pageParam);
    }
    // Also restore track record view from URL
    const viewParam = params.get("trackRecordView") as AccountViewId | null;
    if (viewParam && VALID_ACCOUNT_VIEWS.includes(viewParam)) {
      setActiveView(viewParam);
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

  // ── Track record view switching ──────────────────────────────────────────────
  function handleViewChange(view: AccountViewId) {
    setActiveView(view);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("trackRecordView", view);
      window.history.pushState({}, "", url.toString());
    } catch { /* ignore */ }
  }

  const activeAccountView = useMemo(
    () => accountViews?.find((v) => v.id === activeView),
    [accountViews, activeView],
  );

  // When not combined, override the universal KPI strings with per-view values
  const effectiveUniversal = useMemo<UniversalKpiStrings>(() => {
    if (activeView === "combined" || !activeAccountView) return universal;
    return {
      ...universal,
      totalReturn24m: activeAccountView.totalReturn24m,
      maxDrawdown: activeAccountView.maxDrawdown,
      annualizedReturn: activeAccountView.annualizedReturn,
      calmar: activeAccountView.calmar,
      sharpe: activeAccountView.sharpe,
      volatility: activeAccountView.volatility,
      profitFactor: activeAccountView.profitFactor,
      positiveMonths: activeAccountView.positiveMonths,
      portfolioTotalTrades: activeAccountView.portfolioTotalTrades,
      portfolioStartDate: activeAccountView.portfolioStartDate,
      portfolioEndDate: activeAccountView.portfolioEndDate,
      assetsUnderManagementEur: activeAccountView.assetsUnderManagementEur,
      riskAdjustedAum:
        activeAccountView.assetsUnderManagementEur != null
          ? `EUR ${Math.round(activeAccountView.assetsUnderManagementEur).toLocaleString("de-DE")}`
          : "EUR —",
    };
  }, [activeView, activeAccountView, universal]);

  const effectiveTradeEventSeries = useMemo(
    () => activeAccountView?.tradeEventSeries ?? tradeEventSeries,
    [activeAccountView, tradeEventSeries],
  );

  return (
    <>
      <SentinelFloatingWindow />
      <div className={`flex min-h-0 flex-1 flex-col gap-4 overflow-hidden ${page === "chat" ? "p-0" : page === "home" ? "pb-[14px] pl-4 pr-4 pt-3" : "pb-2 pl-4 pr-4 pt-3"}`}>
          {page === "home" ? (
            <>
              <div className="shrink-0">
                <UniversalKpiStrip
                  universal={effectiveUniversal}
                  showBenchmark={showBenchmark}
                  spyKpis={spyBenchmarkKpis}
                />
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
                    trackRecordOverview={trackRecordOverview}
                    spyDailyReturns={spyDailyReturns}
                    showBenchmark={showBenchmark}
                    onBenchmarkChange={setShowBenchmark}
                    spyKpis={spyBenchmarkKpis}
                    performanceSeries={performanceSeries}
                    tradeEventSeries={effectiveTradeEventSeries}
                    universal={effectiveUniversal}
                    activeView={activeView}
                    onViewChange={handleViewChange}
                    accountViews={accountViews}
                  />
                ) : null}
                {homeTab === "risk" ? (
                  <div className="h-full min-h-0" />
                ) : null}
                {homeTab === "trades" ? (
                  <div className="h-full min-h-0" />
                ) : null}
                {homeTab === "quant" ? (
                  <div className="h-full min-h-0" />
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SentinelDashboard />
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
    </>
  );
}
