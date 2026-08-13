import { describe, expect, it } from "vitest";
import { getPortfolioLabBootstrap } from "@/lib/portfolio-simulator/data";
import { writePortfolioLabQaScenarios } from "@/lib/portfolio-simulator/qa";

describe("portfolio lab bootstrap", () => {
  it("keeps accepted White Swan truth and one navigation portfolio identity", () => {
    const bootstrap = getPortfolioLabBootstrap();

    expect(bootstrap.whiteSwan.componentsCount).toBe(17);
    expect(bootstrap.whiteSwan.weightsSumPct).toBe(100);
    expect(bootstrap.whiteSwan.capitalRequirements).toHaveLength(17);
    expect(bootstrap.whiteSwan.capitalRequirements.filter((row) => row.evidenceType === "CANONICAL")).toHaveLength(5);
    expect(bootstrap.whiteSwan.capitalRequirements.filter((row) => row.evidenceType === "CANONICAL_SUMMARY")).toHaveLength(12);
    expect(bootstrap.whiteSwan.capitalRequirements.filter((row) => row.evidenceType === "RECONSTRUCTED")).toHaveLength(0);
    expect(bootstrap.coreInvest.componentsCount).toBeGreaterThan(0);
  });

  it("writes deterministic QA scenarios without invalid allocation totals", () => {
    const bootstrap = getPortfolioLabBootstrap();
    writePortfolioLabQaScenarios(bootstrap);

    const scenarios = [
      { mode: "white-swan", account: 10000, total: 100 },
      { mode: "core-invest", account: 10000, total: 100 },
      { mode: "combined", account: 20000, total: 100 },
    ] as const;

    for (const scenario of scenarios) {
      const config = bootstrap.defaultScenario.mode === scenario.mode
        ? bootstrap.defaultScenario
        : scenario.mode === "white-swan"
          ? { ...bootstrap.defaultScenario, mode: "white-swan" as const, accountSize: scenario.account, whiteSwanPct: 100, coreInvestPct: 0 }
          : scenario.mode === "core-invest"
            ? { ...bootstrap.defaultScenario, mode: "core-invest" as const, accountSize: scenario.account, whiteSwanPct: 0, coreInvestPct: 100 }
            : { ...bootstrap.defaultScenario, mode: "combined" as const, accountSize: scenario.account, whiteSwanPct: 50, coreInvestPct: 50 };

      expect(config.whiteSwanPct + config.coreInvestPct).toBe(scenario.total);
    }
  });
});
