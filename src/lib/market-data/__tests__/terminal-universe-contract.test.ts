import { describe, expect, it } from "vitest";
import { buildTerminalUniverse } from "@/lib/market-data/terminal-universe";
import { buildTerminalUniverseContract } from "@/lib/market-data/terminal-universe-contract";

describe("terminal universe contract", () => {
  it("preserves canonical instrument ids and counts", () => {
    const universe = buildTerminalUniverse();
    const contract = buildTerminalUniverseContract();

    expect(contract.schemaVersion).toBe(1);
    expect(contract.counts.dedupedTotalCount).toBe(universe.counts.dedupedTotalCount);
    expect(contract.identityCounts.realInstrumentCount).toBe(universe.identityCounts.realInstrumentCount);
    expect(contract.entries.map((entry) => entry.instrumentId)).toEqual(
      universe.entries.map((entry) => entry.instrumentId),
    );
  });

  it("exports provider mappings and timeframes for python parity", () => {
    const contract = buildTerminalUniverseContract();
    for (const entry of contract.entries) {
      expect(entry.instrumentId.length).toBeGreaterThan(0);
      expect(entry.underlyingId === null || entry.underlyingId.length > 0).toBe(true);
      expect(Array.isArray(entry.timeframes)).toBe(true);
      expect(entry.providerMappings).toBeTruthy();
    }
    expect(contract.strategyMappings.length).toBeGreaterThan(0);
  });
});
