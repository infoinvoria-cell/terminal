import fs from "node:fs";
import path from "node:path";
import type { PortfolioLabBootstrap, ScenarioConfig } from "@/lib/portfolio-simulator/types";
import { runScenario } from "@/lib/portfolio-simulator/scenario-engine";
import { runMonteCarlo } from "@/lib/portfolio-simulator/monte-carlo";

function writeJson(filePath: string, payload: unknown) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch { /* .runtime/ may be absent or read-only in cloud environments */ }
}

export function writePortfolioLabQaScenarios(bootstrap: PortfolioLabBootstrap) {
  const scenarios: ScenarioConfig[] = [
    { mode: "white-swan", accountSize: 10000, currency: "USD", whiteSwanPct: 100, coreInvestPct: 0, range: "MAX" },
    { mode: "core-invest", accountSize: 10000, currency: "USD", whiteSwanPct: 0, coreInvestPct: 100, range: "MAX" },
    { mode: "combined", accountSize: 20000, currency: "USD", whiteSwanPct: 50, coreInvestPct: 50, range: "MAX" },
  ];
  const rows = scenarios.map((config) => {
    const result = runScenario(config, bootstrap.whiteSwan, bootstrap.coreInvest);
    return {
      config,
      range: {
        start: result.points[0]?.date ?? null,
        end: result.points.at(-1)?.date ?? null,
      },
      metrics: result.metrics,
      allocations: result.allocations,
      strategyEffectiveWeights: result.contributionRows.map((row) => ({
        key: row.key,
        effectiveAccountWeightPct: row.effectiveAccountWeightPct,
      })),
      capitalFeasibilityCounts: {
        exact: result.capitalRows.filter((row) => row.executionFeasibility === "EXECUTION_EXACT").length,
        approximate: result.capitalRows.filter((row) => row.executionFeasibility === "EXECUTION_APPROXIMATE").length,
        notGranular: result.capitalRows.filter((row) => row.executionFeasibility === "NOT_GRANULAR").length,
        pending: result.capitalRows.filter((row) => row.executionFeasibility === "EXECUTION_DATA_PENDING").length,
      },
      monteCarlo: runMonteCarlo(result.returnSeriesPct, config.accountSize, 300, 1729, 3),
    };
  });

  writeJson(
    path.join(process.cwd(), ".runtime", "portfolio-lab", "PORTFOLIO_LAB_QA_SCENARIOS_V1.json"),
    {
      generatedAt: new Date().toISOString(),
      scenarios: rows,
    },
  );
}
