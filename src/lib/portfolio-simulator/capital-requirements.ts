import type { CapitalRequirementRecord, EvidenceType, ExecutionFeasibility } from "@/lib/portfolio-simulator/types";

type AuditMasterRow = {
  strategy: string;
  label: string;
  family: string;
  whiteSwanWeightPct: number;
  historicalSizingMode: string;
  historicalReferenceInstrument: string | null;
  historicalReferenceQty: number | "NOT_FIXED" | null;
  historicalReferenceUnit: string;
  historicalReferenceCapitalUsd?: number | null;
  largestWinUsd: number | null;
  largestLossUsd: number | null;
  reconstructedLargestLossUsd?: number | null;
  largestLossUsedForCapitalCalculation?: number | null;
  maxDrawdownUsd: number | null;
  maxDrawdownPct: number | "NOT_DEFINED_WITHOUT_CAPITAL_BASE" | null;
  hardStop: boolean;
  plannedRiskPerReferenceUnitUsd: number | "NOT_DEFINED" | "NOT_APPLICABLE_NO_HARD_STOP" | null;
  fractionalReferenceUnitsRequired: number | null;
  minimumBrokerExecutableUnit: number | null;
  pnlEvidenceType: string;
  authoritativeEvidenceType?: string;
  largestLossEvidenceType?: string;
  summarySource: string;
  seasonalCanonicalStatus: string | null;
  canonicalSummaryAvailable?: boolean;
  canonicalLargestLossAvailable?: boolean;
  confidence?: string | null;
  granularityClassification: string | null;
};

type AuditArtifact = {
  artifact: string;
  masterTable: AuditMasterRow[];
};

function toEvidenceType(value: string): EvidenceType {
  if (value === "CANONICAL_TRADE_LIST") return "CANONICAL";
  if (value === "CANONICAL_SUMMARY_ONLY") return "CANONICAL_SUMMARY";
  if (value === "RECONSTRUCTED_FROM_PRICE_SERIES") return "RECONSTRUCTED";
  return "NOT_AVAILABLE";
}

function capitalFromLoss(loss: number | null, toleratedLossPct: number): number | null {
  if (loss == null || !Number.isFinite(loss) || loss === 0) return null;
  return Number((Math.abs(loss) / toleratedLossPct).toFixed(2));
}

export function buildWhiteSwanCapitalRequirements(audit: AuditArtifact): CapitalRequirementRecord[] {
  return audit.masterTable.map((row) => ({
    strategyId: row.strategy,
    displayName: row.label,
    family: row.family,
    portfolioWeightPct: row.whiteSwanWeightPct,
    historicalSizingMode: row.historicalSizingMode,
    historicalReferenceInstrument: row.historicalReferenceInstrument,
    historicalReferenceQuantity: row.historicalReferenceQty,
    historicalReferenceUnit: row.historicalReferenceUnit,
    historicalReferenceCapitalUsd: row.historicalReferenceCapitalUsd ?? null,
    evidenceType: toEvidenceType(row.pnlEvidenceType),
    authoritativeEvidenceType: row.authoritativeEvidenceType ?? row.pnlEvidenceType,
    largestLossEvidenceType: row.largestLossEvidenceType ?? row.pnlEvidenceType,
    largestReliableWinUsd: row.largestWinUsd,
    largestReliableLossUsd: row.largestLossUsd,
    reconstructedLargestLossUsd: row.reconstructedLargestLossUsd ?? null,
    largestLossUsedForCapitalCalculation:
      row.largestLossUsedForCapitalCalculation ?? row.largestLossUsd,
    maxDrawdownUsd: row.maxDrawdownUsd,
    maxDrawdownPct: row.maxDrawdownPct,
    hasHardStop: row.hardStop,
    plannedRiskPerReferenceUnit: row.plannedRiskPerReferenceUnitUsd,
    capitalForWorstLossAt1Pct: capitalFromLoss(row.largestLossUsd, 0.01),
    capitalForWorstLossAt2Pct: capitalFromLoss(row.largestLossUsd, 0.02),
    capitalForWorstLossAt3Pct: capitalFromLoss(row.largestLossUsd, 0.03),
    capitalForWorstLossAt5Pct: capitalFromLoss(row.largestLossUsd, 0.05),
    capitalForWorstLossAt10Pct: capitalFromLoss(row.largestLossUsd, 0.1),
    modelReferenceUnits: Number((row.whiteSwanWeightPct / 100).toFixed(4)),
    fractionalReferenceUnitsRequired: row.fractionalReferenceUnitsRequired,
    minimumBrokerExecutableUnit: row.minimumBrokerExecutableUnit,
    sourceArtifact: audit.artifact,
    canonicalStatus: row.seasonalCanonicalStatus,
    canonicalSummaryAvailable: row.canonicalSummaryAvailable ?? row.pnlEvidenceType === "CANONICAL_SUMMARY_ONLY",
    canonicalLargestLossAvailable: row.canonicalLargestLossAvailable ?? row.pnlEvidenceType === "CANONICAL_TRADE_LIST",
    confidence: row.confidence ?? null,
    granularityClassification: row.granularityClassification,
  }));
}

export function classifyExecutionFeasibility(
  modelUnits: number,
  minimumExecutableUnit: number | null,
): ExecutionFeasibility {
  if (!Number.isFinite(modelUnits) || modelUnits <= 0) return "NOT_GRANULAR";
  if (minimumExecutableUnit == null) return "EXECUTION_DATA_PENDING";
  if (modelUnits === minimumExecutableUnit) return "EXECUTION_EXACT";
  if (modelUnits > minimumExecutableUnit) return "EXECUTION_APPROXIMATE";
  return "NOT_GRANULAR";
}
