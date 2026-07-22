"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createInvestorFromInput,
  createInitialSimulationState,
  deriveSimulationMetrics,
  recomputeSimulation,
  type NewInvestorInput,
  type SimCommission,
  type SimInvestor,
  type SimSubIb,
  type SimTradeMonth,
  type SimulationMetrics,
} from "@/lib/manager-simulation";
import type { ParsedBalanceRow, ParsedReportTrade } from "@/lib/mt-report-parser";

export type DashboardPage =
  | "home"
  | "chat"
  | "analytics"
  | "invest"
  | "grid"
  | "users"
  | "manager-overview"
  | "sub-ib-system"
  | "investor-analytics";

export type HomeSubTab = "portfolio" | "risk" | "trades" | "quant";

export type CreateSubIbInput = {
  name: string;
  splitPct: number;
  newInvestors: NewInvestorInput[];
};

export type UpdateSubIbInput = {
  id: string;
  name: string;
  splitPct: number;
  newInvestors: NewInvestorInput[];
};

export type ActiveProfile = {
  id: "jeroen" | "joris" | "janluca";
  name: string;
  avatarSrc: string;
  verified: boolean;
};

type HomeDashboardContextValue = {
  profiles: ActiveProfile[];
  activeProfile: ActiveProfile;
  setActiveProfile: (profileId: ActiveProfile["id"]) => void;
  page: DashboardPage;
  setPage: (page: DashboardPage) => void;
  homeTab: HomeSubTab;
  setHomeTab: (tab: HomeSubTab) => void;
  rrReportingMode: boolean;
  setRrReportingMode: (value: boolean) => void;
  investors: SimInvestor[];
  subIBs: SimSubIb[];
  trades: SimTradeMonth[];
  commissions: SimCommission[];
  balanceRows: ParsedBalanceRow[];
  metrics: SimulationMetrics;
  createSubIb: (input: CreateSubIbInput) => void;
  updateSubIb: (input: UpdateSubIbInput) => void;
};

const HomeDashboardContext = createContext<HomeDashboardContextValue | null>(
  null
);

const AVAILABLE_PROFILES: ActiveProfile[] = [
  {
    id: "joris",
    name: "Joris G.",
    avatarSrc: "/profile.png",
    verified: true,
  },
  {
    id: "jeroen",
    name: "Jeroen G.",
    avatarSrc: "/profile_jeroen.png",
    verified: true,
  },
  {
    id: "janluca",
    name: "Jan Luca M.",
    avatarSrc: "/profile_jeroen.png",
    verified: false,
  },
];

export function HomeDashboardProvider({
  children,
  initialReportTrades,
  initialBalanceRows,
  initialPage = "home",
}: {
  children: React.ReactNode;
  initialReportTrades: ParsedReportTrade[];
  initialBalanceRows: ParsedBalanceRow[];
  initialPage?: DashboardPage;
}) {
  const initialState = useMemo(
    () => createInitialSimulationState(initialReportTrades),
    [initialReportTrades]
  );

  const DASHBOARD_PAGES: DashboardPage[] = ["home","chat","analytics","invest","grid","users","manager-overview","sub-ib-system","investor-analytics"];
  const [page, setPageRaw] = useState<DashboardPage>(initialPage);
  const setPage = useCallback((p: DashboardPage) => {
    try { window.localStorage.setItem("dashboard_page", p); } catch { /* ignore */ }
    setPageRaw(p);
  }, []);
  useEffect(() => {
    try {
      if (initialPage !== "home") {
        setPageRaw(initialPage);
        return;
      }
      const stored = window.localStorage.getItem("dashboard_page") as DashboardPage | null;
      if (stored && DASHBOARD_PAGES.includes(stored)) setPageRaw(stored);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPage]);
  const [activeProfileId, setActiveProfileId] = useState<ActiveProfile["id"]>(() => {
    try {
      const stored = window?.localStorage?.getItem("fmd_active_profile");
      if (stored === "jeroen" || stored === "joris" || stored === "janluca") return stored;
    } catch { /* ignore */ }
    return "jeroen";
  });
  const [homeTab, setHomeTab] = useState<HomeSubTab>("portfolio");
  const [rrReportingMode, setRrReportingMode] = useState(false);
  const [baseTrades] = useState(initialState.baseTrades);
  const [investors, setInvestors] = useState(initialState.investors);
  const [subIBs, setSubIBs] = useState(initialState.subIBs);
  const [trades, setTrades] = useState(initialState.trades);
  const [commissions, setCommissions] = useState(initialState.commissions);
  const [balanceRows] = useState(initialBalanceRows);

  const syncSimulation = useCallback(
    (nextInvestors: SimInvestor[], nextSubIBs: SimSubIb[]) => {
      const nextComputed = recomputeSimulation(
        baseTrades,
        nextInvestors,
        nextSubIBs
      );
      setInvestors(nextInvestors);
      setSubIBs(nextSubIBs);
      setTrades(nextComputed.trades);
      setCommissions(nextComputed.commissions);
    },
    [baseTrades]
  );

  const createSubIb = useCallback(
    (input: CreateSubIbInput) => {
      const cleanName = input.name.trim();
      if (!cleanName) return;

      const splitPct = Math.max(0, Math.min(100, Number(input.splitPct) || 0));
      const subIbId = `sub-${toSlug(cleanName)}-${Date.now().toString(36)}`;
      const nextSubIBs = [...subIBs, { id: subIbId, name: cleanName, splitPct }];
      const createdInvestors = input.newInvestors
        .map((newInvestor) => createInvestorFromInput(newInvestor, subIbId))
        .filter((investor): investor is SimInvestor => investor !== null);
      const nextInvestors = [...investors, ...createdInvestors];

      syncSimulation(nextInvestors, nextSubIBs);
    },
    [investors, subIBs, syncSimulation]
  );

  const updateSubIb = useCallback(
    (input: UpdateSubIbInput) => {
      const cleanName = input.name.trim();
      if (!cleanName) return;

      const splitPct = Math.max(0, Math.min(100, Number(input.splitPct) || 0));
      const nextSubIBs = subIBs.map((subIb) =>
        subIb.id === input.id
          ? { ...subIb, name: cleanName, splitPct }
          : subIb
      );

      const createdInvestors = input.newInvestors
        .map((newInvestor) => createInvestorFromInput(newInvestor, input.id))
        .filter((investor): investor is SimInvestor => investor !== null);
      const nextInvestors = [...investors, ...createdInvestors];

      syncSimulation(nextInvestors, nextSubIBs);
    },
    [investors, subIBs, syncSimulation]
  );

  const metrics = useMemo(
    () => deriveSimulationMetrics(investors, subIBs, trades, commissions),
    [investors, subIBs, trades, commissions]
  );
  const activeProfile = useMemo(
    () =>
      AVAILABLE_PROFILES.find((profile) => profile.id === activeProfileId) ??
      AVAILABLE_PROFILES[0]!,
    [activeProfileId]
  );

  const setActiveProfile = useCallback((profileId: ActiveProfile["id"]) => {
    try { window.localStorage.setItem("fmd_active_profile", profileId); } catch { /* ignore */ }
    setActiveProfileId(profileId);
  }, []);

  const value = useMemo(
    () => ({
      profiles: AVAILABLE_PROFILES,
      activeProfile,
      setActiveProfile,
      page,
      setPage,
      homeTab,
      setHomeTab,
      rrReportingMode,
      setRrReportingMode,
      investors,
      subIBs,
      trades,
      commissions,
      balanceRows,
      metrics,
      createSubIb,
      updateSubIb,
    }),
    [
      activeProfile,
      setActiveProfile,
      page,
      setPage,
      homeTab,
      setHomeTab,
      rrReportingMode,
      setRrReportingMode,
      investors,
      subIBs,
      trades,
      commissions,
      balanceRows,
      metrics,
      createSubIb,
      updateSubIb,
    ]
  );

  return (
    <HomeDashboardContext.Provider value={value}>
      {children}
    </HomeDashboardContext.Provider>
  );
}

export function useHomeDashboard() {
  const context = useContext(HomeDashboardContext);
  if (!context) {
    throw new Error("useHomeDashboard must be used within HomeDashboardProvider");
  }
  return context;
}

function toSlug(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "subib"
  );
}
