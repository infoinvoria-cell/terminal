"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type GlobalPage =
  | "home"
  | "analytics"
  | "sentinel"
  | "portfolio"
  | "risk"
  | "trades"
  | "quant"
  | "manager-overview"
  | "sub-ib-system"
  | "investor-analytics"
  | "grid"
  | "users"
  | "unknown";

export type GlobalPageContextValue = {
  currentPage: GlobalPage;
  currentTab?: string;
  currentMode?: string;
  visibleTitle: string;
  setCurrentPage: (page: GlobalPage, tab?: string, mode?: string) => void;
};

const GlobalPageContext = createContext<GlobalPageContextValue>({
  currentPage: "home",
  visibleTitle: "Home",
  setCurrentPage: () => {},
});

const PAGE_LABELS: Record<GlobalPage, string> = {
  home: "Home",
  analytics: "Analytics",
  sentinel: "Sentinel",
  portfolio: "Portfolio",
  risk: "Risk",
  trades: "Trades",
  quant: "Quant",
  "manager-overview": "Manager Overview",
  "sub-ib-system": "Sub-IB System",
  "investor-analytics": "Investor Analytics",
  grid: "Grid",
  users: "Users",
  unknown: "Dashboard",
};

export function GlobalPageProvider({ children }: { children: React.ReactNode }) {
  const [currentPage, setPage] = useState<GlobalPage>("home");
  const [currentTab, setTab] = useState<string | undefined>(undefined);
  const [currentMode, setMode] = useState<string | undefined>(undefined);

  const setCurrentPage = useCallback(
    (page: GlobalPage, tab?: string, mode?: string) => {
      setPage(page);
      setTab(tab);
      setMode(mode);
    },
    []
  );

  const value = useMemo<GlobalPageContextValue>(
    () => ({
      currentPage,
      currentTab,
      currentMode,
      visibleTitle: PAGE_LABELS[currentPage] ?? "Dashboard",
      setCurrentPage,
    }),
    [currentPage, currentTab, currentMode, setCurrentPage]
  );

  return (
    <GlobalPageContext.Provider value={value}>
      {children}
    </GlobalPageContext.Provider>
  );
}

export function useGlobalPage() {
  return useContext(GlobalPageContext);
}
