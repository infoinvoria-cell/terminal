import { describe, expect, it } from "vitest";
import { buildWhiteSwanCapitalRequirements } from "@/lib/portfolio-simulator/capital-requirements";
import { runMonteCarlo } from "@/lib/portfolio-simulator/monte-carlo";
import { runScenario } from "@/lib/portfolio-simulator/scenario-engine";
import type { PortfolioDefinition } from "@/lib/portfolio-simulator/types";
import { resolveWhiteSwanExecutionTranslation } from "@/lib/white-swan/execution-scaling";

const audit = {
  artifact: "WHITE_SWAN_17_CAPITAL_RISK_AUDIT_V1",
  masterTable: [
    {
      strategy: "cc1_sea",
      label: "CC1",
      family: "Seasonal",
      whiteSwanWeightPct: 3,
      historicalSizingMode: "one_standard_contract_calendar_pattern",
      historicalReferenceInstrument: "CC1!",
      historicalReferenceQty: 1,
      historicalReferenceUnit: "1 x CC1!",
      historicalReferenceCapitalUsd: 32000,
      authoritativeEvidenceType: "CANONICAL_SUMMARY_ONLY",
      largestLossEvidenceType: "RECONSTRUCTED_REFERENCE",
      largestWinUsd: 1000,
      largestLossUsd: -3200,
      reconstructedLargestLossUsd: -3200,
      largestLossUsedForCapitalCalculation: -3200,
      maxDrawdownUsd: 4000,
      maxDrawdownPct: "NOT_DEFINED_WITHOUT_CAPITAL_BASE",
      hardStop: false,
      plannedRiskPerReferenceUnitUsd: "NOT_DEFINED",
      fractionalReferenceUnitsRequired: 0.03,
      minimumBrokerExecutableUnit: 1,
      pnlEvidenceType: "CANONICAL_SUMMARY_ONLY",
      summarySource: "artifact",
      seasonalCanonicalStatus: "CANONICAL_SUMMARY_ONLY",
      canonicalSummaryAvailable: true,
      canonicalLargestLossAvailable: false,
      confidence: "MEDIUM",
      granularityClassification: "NOT_GRANULAR",
    },
  ],
};

describe("portfolio simulator capital truth", () => {
  it("preserves summary evidence and capital threshold formula", () => {
    const rows = buildWhiteSwanCapitalRequirements(audit as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.evidenceType).toBe("CANONICAL_SUMMARY");
    expect(rows[0]?.largestLossEvidenceType).toBe("RECONSTRUCTED_REFERENCE");
    expect(rows[0]?.capitalForWorstLossAt1Pct).toBe(320000);
    expect(rows[0]?.modelReferenceUnits).toBe(0.03);
  });
});

describe("scenario engine", () => {
  const capitalRows = buildWhiteSwanCapitalRequirements(audit as never);
  const whiteSwan: PortfolioDefinition = {
    id: "white-swan",
    label: "White Swan",
    sourceLabel: "test",
    componentsCount: 1,
    weightsSumPct: 100,
    performanceSeries: [
      { date: "2025-01-31", cumulativePct: 0 },
      { date: "2025-02-28", cumulativePct: 10 },
      { date: "2025-03-31", cumulativePct: 5 },
    ],
    capitalRequirements: capitalRows,
    tradeRows: [],
  };
  const core: PortfolioDefinition = {
    id: "core-invest",
    label: "Core Invest",
    sourceLabel: "test",
    componentsCount: 1,
    weightsSumPct: 100,
    performanceSeries: [
      { date: "2025-01-31", cumulativePct: 0 },
      { date: "2025-02-28", cumulativePct: 4 },
      { date: "2025-03-31", cumulativePct: 6 },
    ],
    capitalRequirements: [],
    tradeRows: [],
  };

  it("keeps combined allocations at 100 and computes points", () => {
    const result = runScenario(
      { mode: "combined", accountSize: 20000, currency: "USD", whiteSwanPct: 50, coreInvestPct: 50, range: "MAX" },
      whiteSwan,
      core,
    );
    expect(result.allocations.whiteSwanPct + result.allocations.coreInvestPct).toBe(100);
    expect(result.whiteSwanSleeveCapital).toBe(10000);
    expect(result.coreInvestSleeveCapital).toBe(10000);
    expect(result.points.length).toBeGreaterThan(0);
    expect(Number.isFinite(result.metrics.endingEquity)).toBe(true);
  });

  it("derives effective combined weight automatically from canonical sleeve weight", () => {
    const result = runScenario(
      { mode: "combined", accountSize: 20000, currency: "USD", whiteSwanPct: 50, coreInvestPct: 50, range: "MAX" },
      whiteSwan,
      core,
    );
    expect(result.capitalRows[0]?.effectiveAccountWeightPct).toBe(1.5);
    expect(result.capitalRows[0]?.modelReferenceUnitsEffective).toBe(0.015);
  });

  it("uses sleeve capital for execution translation", () => {
    const result = runScenario(
      { mode: "combined", accountSize: 20000, currency: "USD", whiteSwanPct: 50, coreInvestPct: 50, range: "MAX" },
      whiteSwan,
      core,
    );
    expect(result.capitalRows[0]?.executionTranslation?.whiteSwanSleeveCapital).toBe(10000);
  });
});

describe("white swan execution translation", () => {
  it("never rounds cocoa up from 0.03 to 1 contract at 10k sleeve", () => {
    const row = buildWhiteSwanCapitalRequirements(audit as never)[0]!;
    const translation = resolveWhiteSwanExecutionTranslation(
      row,
      { mode: "white-swan", accountSize: 10000, currency: "USD", whiteSwanPct: 100, coreInvestPct: 0, range: "MAX" },
      10000,
      3,
    );
    expect(translation?.brokerQuantity).toBe(0);
    expect(translation?.status).toBe("NOT_GRANULAR_ENOUGH");
  });

  it("keeps EURUSD error in the correct unit domain", () => {
    const rows = buildWhiteSwanCapitalRequirements({
      artifact: "x",
      masterTable: [
        {
          strategy: "eurusd_mt_30m_eurusd_30m",
          label: "EURUSD",
          family: "Momentum",
          whiteSwanWeightPct: 14,
          historicalSizingMode: "fixed_risk_package_unit",
          historicalReferenceInstrument: "EURUSD",
          historicalReferenceQty: 1,
          historicalReferenceUnit: "1 package",
          historicalReferenceCapitalUsd: 100000,
          authoritativeEvidenceType: "CANONICAL",
          largestLossEvidenceType: "CANONICAL",
          largestWinUsd: 1000,
          largestLossUsd: -100,
          reconstructedLargestLossUsd: -100,
          largestLossUsedForCapitalCalculation: -100,
          maxDrawdownUsd: 1000,
          maxDrawdownPct: 1,
          hardStop: true,
          plannedRiskPerReferenceUnitUsd: 100,
          fractionalReferenceUnitsRequired: 0.14,
          minimumBrokerExecutableUnit: 20000,
          pnlEvidenceType: "CANONICAL",
          summarySource: "artifact",
          seasonalCanonicalStatus: "CANONICAL",
          canonicalSummaryAvailable: true,
          canonicalLargestLossAvailable: true,
          confidence: "HIGH",
          granularityClassification: "EXECUTABLE",
        },
      ],
    } as never)[0]!;
    const translation = resolveWhiteSwanExecutionTranslation(
      rows,
      { mode: "white-swan", accountSize: 10000, currency: "USD", whiteSwanPct: 100, coreInvestPct: 0, range: "MAX" },
      10000,
      14,
    );
    expect(translation?.referenceExposureUnit).toBe("EUR_NOTIONAL");
    expect(translation?.modelTargetBrokerQuantity).toBeCloseTo(21538.461538, 3);
    expect(translation?.relativeExposureErrorPct).toBeLessThan(100);
  });

  it("uses corrected FDXS to FDAX ratio", () => {
    const row = buildWhiteSwanCapitalRequirements({
      artifact: "x",
      masterTable: [
        {
          strategy: "mt_dax_1h_de30eur_1h",
          label: "DAX",
          family: "Momentum",
          whiteSwanWeightPct: 14,
          historicalSizingMode: "fixed_risk_package_unit",
          historicalReferenceInstrument: "FDAX1!",
          historicalReferenceQty: 1,
          historicalReferenceUnit: "1 package",
          historicalReferenceCapitalUsd: 100000,
          authoritativeEvidenceType: "CANONICAL",
          largestLossEvidenceType: "CANONICAL",
          largestWinUsd: 1000,
          largestLossUsd: -100,
          reconstructedLargestLossUsd: -100,
          largestLossUsedForCapitalCalculation: -100,
          maxDrawdownUsd: 1000,
          maxDrawdownPct: 1,
          hardStop: true,
          plannedRiskPerReferenceUnitUsd: 100,
          fractionalReferenceUnitsRequired: 0.14,
          minimumBrokerExecutableUnit: 1,
          pnlEvidenceType: "CANONICAL",
          summarySource: "artifact",
          seasonalCanonicalStatus: "CANONICAL",
          canonicalSummaryAvailable: true,
          canonicalLargestLossAvailable: true,
          confidence: "HIGH",
          granularityClassification: "EXECUTABLE",
        },
      ],
    } as never)[0]!;
    const translation = resolveWhiteSwanExecutionTranslation(
      row,
      { mode: "white-swan", accountSize: 10000, currency: "USD", whiteSwanPct: 100, coreInvestPct: 0, range: "MAX" },
      10000,
      14,
    );
    expect(translation?.candidateExposurePerBrokerUnit).toBe(0.04);
    expect(translation?.referenceExposureUnit).toBe("FDAX_EQUIVALENT");
  });

  it("marks futures with quantity but missing margin as data pending", () => {
    const row = buildWhiteSwanCapitalRequirements({
      artifact: "x",
      masterTable: [
        {
          strategy: "FP10_YM1_TAT",
          label: "YM",
          family: "Dynamic",
          whiteSwanWeightPct: 10,
          historicalSizingMode: "dynamic_equity_backtest",
          historicalReferenceInstrument: "YM1!",
          historicalReferenceQty: "NOT_FIXED",
          historicalReferenceUnit: "dynamic",
          historicalReferenceCapitalUsd: 100000,
          authoritativeEvidenceType: "CANONICAL",
          largestLossEvidenceType: "CANONICAL",
          largestWinUsd: 1000,
          largestLossUsd: -100,
          reconstructedLargestLossUsd: -100,
          largestLossUsedForCapitalCalculation: -100,
          maxDrawdownUsd: 1000,
          maxDrawdownPct: 1,
          hardStop: false,
          plannedRiskPerReferenceUnitUsd: "NOT_APPLICABLE_NO_HARD_STOP",
          fractionalReferenceUnitsRequired: 0.1,
          minimumBrokerExecutableUnit: 1,
          pnlEvidenceType: "CANONICAL",
          summarySource: "artifact",
          seasonalCanonicalStatus: "CANONICAL",
          canonicalSummaryAvailable: true,
          canonicalLargestLossAvailable: true,
          confidence: "HIGH",
          granularityClassification: "EXECUTABLE",
        },
      ],
    } as never)[0]!;
    const translation = resolveWhiteSwanExecutionTranslation(
      row,
      { mode: "white-swan", accountSize: 100000, currency: "USD", whiteSwanPct: 100, coreInvestPct: 0, range: "MAX" },
      100000,
      10,
    );
    expect(translation?.brokerQuantity).toBeGreaterThan(0);
    expect(translation?.marginStatus).toBe("DATA_PENDING");
    expect(translation?.finalExecutionStatus).toBe("DATA_PENDING");
  });

  it("does not let missing margin override granularity rejection for 1OZ at 10k", () => {
    const rows = buildWhiteSwanCapitalRequirements({
      artifact: "x",
      masterTable: [
        {
          strategy: "gc1_sea",
          label: "Gold",
          family: "Seasonal",
          whiteSwanWeightPct: 4,
          historicalSizingMode: "one_standard_contract_calendar_pattern",
          historicalReferenceInstrument: "GC1!",
          historicalReferenceQty: 1,
          historicalReferenceUnit: "1 x GC1!",
          historicalReferenceCapitalUsd: 73493.771211,
          authoritativeEvidenceType: "CANONICAL",
          largestLossEvidenceType: "CANONICAL",
          largestWinUsd: 1000,
          largestLossUsd: -7349.3771211,
          reconstructedLargestLossUsd: -7349.3771211,
          largestLossUsedForCapitalCalculation: -7349.3771211,
          maxDrawdownUsd: 1000,
          maxDrawdownPct: 1,
          hardStop: false,
          plannedRiskPerReferenceUnitUsd: "NOT_DEFINED",
          fractionalReferenceUnitsRequired: 0.0544218,
          minimumBrokerExecutableUnit: 1,
          pnlEvidenceType: "CANONICAL",
          summarySource: "artifact",
          seasonalCanonicalStatus: "CANONICAL",
          canonicalSummaryAvailable: true,
          canonicalLargestLossAvailable: true,
          confidence: "HIGH",
          granularityClassification: "NOT_GRANULAR",
        },
      ],
    } as never)[0]!;
    const translation = resolveWhiteSwanExecutionTranslation(
      rows,
      { mode: "white-swan", accountSize: 10000, currency: "USD", whiteSwanPct: 100, coreInvestPct: 0, range: "MAX" },
      10000,
      4,
    );
    expect(translation?.exposureStatus).toBe("NOT_GRANULAR_ENOUGH");
    expect(translation?.marginStatus).toBe("NOT_APPLICABLE");
    expect(translation?.finalExecutionStatus).toBe("NOT_GRANULAR_ENOUGH");
  });

  it("keeps ETF cash requirement separate from margin", () => {
    const rows = buildWhiteSwanCapitalRequirements({
      artifact: "x",
      masterTable: [
        {
          strategy: "spy_sea",
          label: "SPY",
          family: "Seasonal",
          whiteSwanWeightPct: 5,
          historicalSizingMode: "one_share_calendar_pattern",
          historicalReferenceInstrument: "SPY",
          historicalReferenceQty: 1,
          historicalReferenceUnit: "1 share",
          historicalReferenceCapitalUsd: 5000,
          authoritativeEvidenceType: "CANONICAL",
          largestLossEvidenceType: "CANONICAL",
          largestWinUsd: 100,
          largestLossUsd: -500,
          reconstructedLargestLossUsd: -500,
          largestLossUsedForCapitalCalculation: -500,
          maxDrawdownUsd: 1000,
          maxDrawdownPct: 1,
          hardStop: false,
          plannedRiskPerReferenceUnitUsd: "NOT_DEFINED",
          fractionalReferenceUnitsRequired: 0.1,
          minimumBrokerExecutableUnit: 1,
          pnlEvidenceType: "CANONICAL",
          summarySource: "artifact",
          seasonalCanonicalStatus: "CANONICAL",
          canonicalSummaryAvailable: true,
          canonicalLargestLossAvailable: true,
          confidence: "HIGH",
          granularityClassification: "EXECUTABLE",
        },
      ],
    } as never)[0]!;
    const translation = resolveWhiteSwanExecutionTranslation(
      rows,
      { mode: "white-swan", accountSize: 10000, currency: "USD", whiteSwanPct: 100, coreInvestPct: 0, range: "MAX" },
      10000,
      5,
    );
    expect(translation?.initialMargin).toBeNull();
    expect(translation?.cashRequired).not.toBeNull();
    expect(translation?.positionNotionalAccountCurrency).not.toBeNull();
    expect(translation?.marginConfidence).toBe("DATA_PENDING");
  });
});

describe("monte carlo", () => {
  it("is deterministic for fixed seed", () => {
    const a = runMonteCarlo([1, -2, 3, 4, -1], 10000, 100, 1729, 2);
    const b = runMonteCarlo([1, -2, 3, 4, -1], 10000, 100, 1729, 2);
    expect(a).toEqual(b);
    expect(a.p05TerminalEquity).toBeLessThanOrEqual(a.medianTerminalEquity);
    expect(a.medianTerminalEquity).toBeLessThanOrEqual(a.p95TerminalEquity);
  });
});
