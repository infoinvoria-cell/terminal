/**
 * Adapter for Trading Strategy Master Manual v2.1 data.
 * Reads from dashboard_snapshot.json — no KPIs hardcoded.
 *
 * PAPER_ONLY: No execution, no broker, no live trading.
 */

import { loadDashboardSnapshot } from "./dashboard-snapshot-loader";
import type {
  DashboardSnapshot,
  StrategyEntry,
  StrategyTier,
  StrategyApproach,
  PortfolioConfig,
} from "./dashboard-snapshot-types";

export function getSnapshot(): DashboardSnapshot | null {
  return loadDashboardSnapshot();
}

export function getCoreStrategies(): StrategyEntry[] {
  return loadDashboardSnapshot()?.strategies.filter((s) => s.tier === "FINAL_CORE") ?? [];
}

export function getLimitedStrategies(): StrategyEntry[] {
  return loadDashboardSnapshot()?.strategies.filter((s) => s.tier === "FINAL_LIMITED") ?? [];
}

export function getStrategiesByApproach(approach: StrategyApproach): StrategyEntry[] {
  return loadDashboardSnapshot()?.strategies.filter((s) => s.approach === approach) ?? [];
}

export function getStrategiesByTier(tier: StrategyTier): StrategyEntry[] {
  return loadDashboardSnapshot()?.strategies.filter((s) => s.tier === tier) ?? [];
}

export function getDefaultActiveStrategies(): StrategyEntry[] {
  return loadDashboardSnapshot()?.strategies.filter((s) => s.enabled_default) ?? [];
}

export function getCoreDefaultPortfolio(): PortfolioConfig | null {
  return loadDashboardSnapshot()?.portfolios.core_default ?? null;
}

export function getExpandedPaperPortfolio(): PortfolioConfig | null {
  return loadDashboardSnapshot()?.portfolios.expanded_paper ?? null;
}

export function getProjectMode(): string {
  return loadDashboardSnapshot()?.project.mode ?? "PAPER_ONLY";
}

export function getOpenGoLiveGates(): number {
  const gates = loadDashboardSnapshot()?.go_live_gates ?? [];
  return gates.filter((g) => g.status === "OPEN").length;
}

export function isLiveApproved(): false {
  return false;
}
