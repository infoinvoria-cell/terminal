import type {
  MonitoringLiveFeedStatus,
  MonitoringLiveFeedUniverseCounts,
} from "@/lib/monitoring/live-feed-types";

export type MonitoringUniverseAsset = {
  id?: string;
  tab?: string;
  name?: string;
  symbol?: string;
  short?: string;
  requestSymbol?: string;
  source?: string;
  timeframe?: string;
  startDate?: string | null;
  endDate?: string | null;
};

export type WhiteSwanUniverseAsset = {
  symbol?: string;
  source?: string;
  name?: string;
  group?: string;
  timeframes?: string[];
};

// Canonical non-monitoring instruments (WS/CI) that must appear in the drawer.
// These are real market instruments, not strategy identifiers.
export type CIMonitorSymbol = {
  ticker: string;
  name: string;
  tab?: string;
  source?: string;
};

export type DedupedMonitoringUniverseAsset = MonitoringUniverseAsset & {
  ticker: string;
  usedBy: string[];
};

export function getUniverseAssetCandidates(asset: MonitoringUniverseAsset): string[] {
  const sourceSymbol = String(asset.source || "").includes(":")
    ? String(asset.source).split(":").at(-1) ?? ""
    : String(asset.source || "");
  const strippedRequest = String(asset.requestSymbol || "").replace(/!/g, "");
  const strippedSymbol = String(asset.symbol || "").replace(/!/g, "");
  const strippedSource = String(sourceSymbol || "").replace(/!/g, "");
  const shortSymbol = String(asset.short || "");

  return [...new Set(
    [
      asset.requestSymbol,
      asset.symbol,
      strippedRequest,
      strippedSymbol,
      sourceSymbol,
      strippedSource,
      shortSymbol,
    ]
      .map((value) => String(value || "").trim().toUpperCase())
      .filter(Boolean),
  )];
}

export function toTicker(asset: Pick<MonitoringUniverseAsset, "requestSymbol" | "symbol">): string {
  return String(asset.requestSymbol || asset.symbol || "").trim().toUpperCase();
}

// Determine if a ticker is a strategy/slot identifier rather than a real market symbol.
// Primary check: canonical route map from strategy_runtime_routes.json (universeSymbol != asset).
// Fallback: underscore in ticker (QQQ_PASSIVE and any future slot IDs not yet in the routes file).
// Real market instruments (EURUSD, GBPUSD, USDCHF, GLD, SPY, SPMO, etc.) never contain underscores.
function isStrategyId(ticker: string, knownStrategyIds: ReadonlySet<string>): boolean {
  return knownStrategyIds.has(ticker) || ticker.includes("_");
}

// Map WS group label to monitoring tab label.
function wsGroupToTab(group: string | undefined): string {
  const g = String(group ?? "").toLowerCase();
  if (g === "forex") return "FX";
  if (g === "equity" || g === "aktien") return "Aktien";
  if (g === "etf" || g === "invest") return "Invest";
  return "Unknown";
}

export function buildDedupedLiveFeedUniverse(
  monitoringUniverse: MonitoringUniverseAsset[],
  whiteSwanUniverse: WhiteSwanUniverseAsset[] = [],
  ciMonitorSymbols: CIMonitorSymbol[] = [],
  knownStrategyIds: ReadonlySet<string> = new Set(),
): {
  assets: DedupedMonitoringUniverseAsset[];
  counts: MonitoringLiveFeedUniverseCounts;
} {
  const deduped = new Map<string, DedupedMonitoringUniverseAsset>();

  let monitoringCount = 0;
  let coreInvestCount = 0;

  // Phase 1: monitoring universe (master — all entries, incl. Invest tab).
  for (const asset of monitoringUniverse) {
    const ticker = toTicker(asset);
    if (!ticker) continue;

    const tab = String(asset.tab || "").trim();
    if (tab === "Invest") coreInvestCount += 1;
    else if (tab !== "Anleihen") monitoringCount += 1;

    const existing = deduped.get(ticker);
    if (existing) {
      if (tab && !existing.usedBy.includes(tab)) existing.usedBy.push(tab);
      continue;
    }

    deduped.set(ticker, { ...asset, ticker, usedBy: tab ? [tab] : [] });
  }

  // Phase 2: WS real instruments — add those not already in monitoring.
  // Strategy identifiers (ticker contains '_') are excluded by isStrategyId().
  let whiteSwanCount = 0;
  for (const wsAsset of whiteSwanUniverse) {
    const ticker = String(wsAsset.symbol || "").trim().toUpperCase();
    if (!ticker || isStrategyId(ticker, knownStrategyIds)) continue;

    if (deduped.has(ticker)) {
      // Already present from monitoring — mark as used by WS.
      const existing = deduped.get(ticker)!;
      if (!existing.usedBy.includes("White Swan")) existing.usedBy.push("White Swan");
      whiteSwanCount += 1;
      continue;
    }

    // New real instrument from WS — add to canonical union.
    const tab = wsGroupToTab(wsAsset.group);
    deduped.set(ticker, {
      ticker,
      symbol: ticker,
      requestSymbol: ticker,
      name: wsAsset.name,
      source: wsAsset.source,
      tab,
      usedBy: ["White Swan"],
    });
    whiteSwanCount += 1;
  }

  // Phase 3: CI monitor symbols — add those not already in the union.
  for (const ci of ciMonitorSymbols) {
    const ticker = ci.ticker.trim().toUpperCase();
    if (!ticker) continue;

    if (deduped.has(ticker)) {
      const existing = deduped.get(ticker)!;
      if (!existing.usedBy.includes("Core Invest")) existing.usedBy.push("Core Invest");
      coreInvestCount += 1;
      continue;
    }

    const tab = ci.tab ?? "Invest";
    deduped.set(ticker, {
      ticker,
      symbol: ticker,
      requestSymbol: ticker,
      name: ci.name,
      source: ci.source,
      tab,
      usedBy: ["Core Invest"],
    });
    coreInvestCount += 1;
  }

  return {
    assets: [...deduped.values()],
    counts: {
      monitoring: monitoringCount,
      whiteSwan: whiteSwanCount,
      coreInvest: coreInvestCount,
      deduped: deduped.size,
    },
  };
}

export function resolveFeedStatus(params: {
  hasLivePrice: boolean;
  liveAgeMs: number | null;
  delaySeconds: number | null;
  hasFallbackPrice: boolean;
}): MonitoringLiveFeedStatus {
  const { hasLivePrice, liveAgeMs, delaySeconds, hasFallbackPrice } = params;
  if (hasLivePrice) {
    if (liveAgeMs != null && liveAgeMs > 2 * 60 * 60 * 1000) return "offline";
    if (liveAgeMs != null && liveAgeMs > 30 * 60 * 1000) return "stale";
    if ((delaySeconds ?? 0) <= 0) return "realtime";
    return "delayed";
  }

  if (hasFallbackPrice) return "unavailable";
  return "unavailable";
}
