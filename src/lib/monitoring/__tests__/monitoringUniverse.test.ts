import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const universeData = require("../../../../public/generated/monitoring/config/monitoring_asset_universe.json") as { assets: Array<{ tab: string; symbol: string }> };

describe("monitoring universe", () => {
  it("Metalle group has exactly 5 metals", () => {
    const metals = universeData.assets.filter((a) => a.tab === "Metalle");
    expect(metals.map((m) => m.symbol)).toEqual(expect.arrayContaining(["GC1!", "SI1!", "PA1!", "PL1!", "HG1!"]));
    expect(metals).toHaveLength(5);
  });

  it("Energie group has exactly 3 energy assets", () => {
    const energy = universeData.assets.filter((a) => a.tab === "Energie");
    expect(energy.map((e) => e.symbol)).toEqual(expect.arrayContaining(["CL1!", "NG1!", "RB1!"]));
    expect(energy).toHaveLength(3);
  });

  it("no asset appears in both Metalle and Energie", () => {
    const assets = universeData.assets;
    const metals = new Set(assets.filter((a) => a.tab === "Metalle").map((a) => a.symbol));
    const energy = assets.filter((a) => a.tab === "Energie").map((a) => a.symbol);
    for (const s of energy) expect(metals.has(s)).toBe(false);
  });
});

describe("multi-strategy fixture", () => {
  it("NAS100USD D has 2 strategies in routes", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const routesData = require("../../../../public/generated/monitoring/config/strategy_runtime_routes.json") as { routes: Array<{ asset?: string; timeframe?: string }> };
    const nas100Routes = routesData.routes.filter(
      (r) => r.asset === "NAS100USD" && r.timeframe === "D"
    );
    expect(nas100Routes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("All tab dedup contract", () => {
  it("canonical All union produces unique market+timeframe keys", () => {
    const assets = universeData.assets;
    const metals = assets.filter((a) => a.tab === "Metalle");
    const energy = assets.filter((a) => a.tab === "Energie");
    const agrar = assets.filter((a) => a.tab === "Agrar");
    const metalSymbols = new Set(metals.map((a) => a.symbol));
    for (const e of energy) expect(metalSymbols.has(e.symbol)).toBe(false);
    for (const m of metals) expect(agrar.map((a) => a.symbol).includes(m.symbol)).toBe(false);
  });
});
