import { describe, expect, it } from "vitest";
import { buildTerminalUniverse } from "../terminal-universe";

describe("buildTerminalUniverse", () => {
  it("includes core invest and trading engine assets in the deduped universe", () => {
    const result = buildTerminalUniverse();
    const ids = new Set(result.entries.map((entry) => entry.instrumentId));

    expect(result.counts.monitoringCount).toBeGreaterThan(0);
    expect(result.counts.coreInvestCount).toBeGreaterThan(0);
    expect(result.counts.tradingEngineCount).toBeGreaterThan(0);
    expect(ids.has("qqq")).toBe(true);
    expect(ids.has("spy")).toBe(true);
    expect(ids.has("fdax")).toBe(true);
    expect(ids.has("6e")).toBe(true);
    expect(ids.has("de30eur")).toBe(true);
    expect(ids.has("eurusd")).toBe(true);
  });

  it("deduplicates by canonical instrumentId instead of ticker string", () => {
    const result = buildTerminalUniverse();
    const gc = result.entries.find((entry) => entry.instrumentId === "gc");
    expect(gc).toBeTruthy();
    expect(gc?.sources.includes("monitoring")).toBe(true);
    expect(gc?.sources.includes("trading_engine")).toBe(true);
  });

  it("removes strategy ids but keeps distinct market instruments separated", () => {
    const result = buildTerminalUniverse();
    const ids = new Set(result.entries.map((entry) => entry.instrumentId));
    const tickers = new Set(result.entries.map((entry) => entry.ticker));

    expect(ids.has("de30eur1h")).toBe(false);
    expect(ids.has("de30eur2h")).toBe(false);
    expect(ids.has("eurusd30m")).toBe(false);
    expect(ids.has("gbpusd30m")).toBe(false);
    expect(ids.has("nas100usdestepinvest")).toBe(false);
    expect(ids.has("nas100usdonlylongvaluationtrendema")).toBe(false);
    expect(ids.has("usdchfchfinvest")).toBe(false);
    expect(ids.has("usdchf_fx")).toBe(false);

    expect(tickers.has("DE30EUR")).toBe(true);
    expect(tickers.has("EURUSD")).toBe(true);
    expect(tickers.has("GBPUSD")).toBe(true);
    expect(tickers.has("NAS100USD")).toBe(true);
    expect(tickers.has("USDCHF")).toBe(true);
    expect(ids.has("fdax")).toBe(true);
    expect(ids.has("6e")).toBe(true);
    expect(ids.has("6b")).toBe(true);
    expect(ids.has("nq")).toBe(true);
    expect(tickers.has("QQQ")).toBe(true);
    expect(tickers.has("6S1!")).toBe(true);
  });

  it("keeps timeframes on the distinct productive instruments", () => {
    const result = buildTerminalUniverse();
    const de30eur = result.entries.find((entry) => entry.instrumentId === "de30eur");
    const eurusd = result.entries.find((entry) => entry.instrumentId === "eurusd");
    const gbpusd = result.entries.find((entry) => entry.instrumentId === "gbpusd");
    const fdax = result.entries.find((entry) => entry.instrumentId === "fdax");
    const sixE = result.entries.find((entry) => entry.instrumentId === "6e");
    const sixB = result.entries.find((entry) => entry.instrumentId === "6b");

    expect(de30eur?.configuredTimeframes).toEqual(expect.arrayContaining(["1H", "2H"]));
    expect(eurusd?.configuredTimeframes).toEqual(expect.arrayContaining(["30M"]));
    expect(gbpusd?.configuredTimeframes).toEqual(expect.arrayContaining(["30M"]));
    expect(fdax?.configuredTimeframes).toEqual(expect.arrayContaining(["D", "1H", "2H"]));
    expect(sixE?.configuredTimeframes).toEqual(expect.arrayContaining(["30M"]));
    expect(sixB?.configuredTimeframes).toEqual(expect.arrayContaining(["30M"]));
  });

  it("exports explicit strategy mappings with proof sources", () => {
    const result = buildTerminalUniverse();
    const daxMapping = result.strategyMappings.find((entry) => entry.strategyId === "trend_momentum_dax_2h_de30eur_2h");
    const nasMapping = result.strategyMappings.find((entry) => entry.strategyId === "only_long_valuation_trend_ema_nas100usd_d");

    expect(daxMapping).toMatchObject({
      instrumentId: "de30eur",
      underlyingId: "dax",
      marketType: "cfd",
      timeframe: "2H",
      sourceConfigPath: "public/generated/monitoring/config/strategy_runtime_routes.json",
    });
    expect(nasMapping).toMatchObject({
      instrumentId: "nas100usd",
      underlyingId: "nasdaq100",
      marketType: "cfd",
      timeframe: "D",
    });
  });
});
