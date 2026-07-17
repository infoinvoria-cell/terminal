import "server-only";

import { fsportfolioConfigJson as rawConfig } from "@/lib/capitalife-data";
import type { FSPortfolioConfig } from "@/lib/fsportfolio/types";

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function loadFSPortfolioConfig(): FSPortfolioConfig {
  const config = rawConfig as FSPortfolioConfig;
  const weightSum = round6(
    Object.values(config.weights).reduce((sum, weight) => sum + weight, 0),
  );

  if (weightSum !== 1) {
    throw new Error(`FSPortfolio weight sum must equal 1.0, received ${weightSum}.`);
  }

  if ("DBC" in config.weights) {
    throw new Error("DBC must not appear in final FSPortfolio core weights.");
  }

  const optionalSymbols = new Set(config.research_optional_symbols ?? config.optional_symbols ?? []);
  const removed = config.removed_from_core ?? {};
  if (!removed.DBC || removed.DBC.new_status !== "research_optional") {
    throw new Error("DBC must be declared in removed_from_core as research_optional.");
  }

  if (!optionalSymbols.has("DBC")) {
    throw new Error("DBC must remain only as research_optional symbol.");
  }

  if (config.weights.WHITE_SWAN_NAS_EMA > 0.1) {
    throw new Error("WHITE_SWAN_NAS_EMA weight exceeds 10% cap.");
  }

  if (config.white_swan.max_portfolio_weight > 0.1) {
    throw new Error("White Swan max_portfolio_weight exceeds 10% cap.");
  }

  if (!config.risk_rules.no_shorts || !config.risk_rules.no_portfolio_leverage) {
    throw new Error("FSPortfolio config violates long-only / no-leverage rules.");
  }

  return config;
}
