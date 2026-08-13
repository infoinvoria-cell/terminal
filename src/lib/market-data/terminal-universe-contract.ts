import { buildTerminalUniverse } from "@/lib/market-data/terminal-universe";

export type TerminalUniverseContractEntry = {
  instrumentId: string;
  underlyingId: string | null;
  marketType: string | null;
  ticker: string;
  displayName: string;
  assetClass: string | null;
  venue: string | null;
  providerMappings: {
    liveProvider: string | null;
    liveSymbol: string | null;
    historicalProvider: string | null;
    historicalSymbol: string | null;
  };
  timeframes: string[];
  tickSize: number | null;
  pricePrecision: number | null;
  timezone: string | null;
  session: string | null;
  sources: string[];
};

export type TerminalUniverseContract = {
  schemaVersion: 1;
  generatedAtUtc: string;
  counts: ReturnType<typeof buildTerminalUniverse>["counts"];
  identityCounts: ReturnType<typeof buildTerminalUniverse>["identityCounts"];
  entries: TerminalUniverseContractEntry[];
  strategyMappings: ReturnType<typeof buildTerminalUniverse>["strategyMappings"];
};

export function buildTerminalUniverseContract(): TerminalUniverseContract {
  const universe = buildTerminalUniverse();
  return {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    counts: universe.counts,
    identityCounts: universe.identityCounts,
    entries: universe.entries.map((entry) => ({
      instrumentId: entry.instrumentId,
      underlyingId: entry.underlyingId,
      marketType: entry.marketType,
      ticker: entry.ticker,
      displayName: entry.displayName,
      assetClass: entry.assetClass,
      venue: entry.venue,
      providerMappings: {
        liveProvider: entry.liveSource,
        liveSymbol: entry.providerSymbol,
        historicalProvider: entry.historicalSource,
        historicalSymbol: entry.historicalSymbol,
      },
      timeframes: [...entry.configuredTimeframes].sort(),
      tickSize: entry.tickSize,
      pricePrecision: entry.pricePrecision,
      timezone: entry.timezone,
      session: entry.session,
      sources: [...entry.sources],
    })),
    strategyMappings: universe.strategyMappings.map((mapping) => ({ ...mapping })),
  };
}
