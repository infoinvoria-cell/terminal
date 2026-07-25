import type { PatternFamilyWFResult, PFWFold } from "./patternFamilyWalkForward";

export interface OosFoldBlockSummary {
  blockIndex: number;
  trainingStartYear: number | null;
  trainingEndYear: number | null;
  oosYears: number[];
  selectedEntryShift: number;
  selectedHoldingDays: number;
  selectedEntrySlot: number;
  selectedExitSlot: number;
  validYearCount: number;
  positiveYearCount: number;
  compoundReturn: number | null;
  avgReturn: number | null;
  positiveBlock: boolean;
  years: PFWFold[];
}

export interface WalkForwardSampleCounts {
  oosTradeCount: number;
  oosYearCount: number;
  oosFoldBlockCount: number;
  positiveOosTradeCount: number;
  positiveOosYearCount: number;
  positiveOosFoldBlockCount: number;
  positiveTradeRate: number;
  positiveYearRate: number;
  positiveFoldRate: number;
}

export function buildOosFoldBlocks(result: PatternFamilyWFResult | null): OosFoldBlockSummary[] {
  if (!result?.folds?.length) return [];

  const blocks: OosFoldBlockSummary[] = [];
  let currentKey = "";
  let currentBlock: OosFoldBlockSummary | null = null;

  for (const fold of result.folds) {
    const blockKey = [
      fold.trainingEndYear,
      fold.selectedEntryShift,
      fold.selectedHoldingDays,
      fold.selectedEntrySlot,
      fold.selectedExitSlot,
      fold.trainingYears.join(","),
    ].join("|");

    if (!currentBlock || blockKey !== currentKey) {
      currentKey = blockKey;
      currentBlock = {
        blockIndex: blocks.length + 1,
        trainingStartYear: fold.trainingYears[0] ?? null,
        trainingEndYear: fold.trainingEndYear ?? null,
        oosYears: [],
        selectedEntryShift: fold.selectedEntryShift,
        selectedHoldingDays: fold.selectedHoldingDays,
        selectedEntrySlot: fold.selectedEntrySlot,
        selectedExitSlot: fold.selectedExitSlot,
        validYearCount: 0,
        positiveYearCount: 0,
        compoundReturn: null,
        avgReturn: null,
        positiveBlock: false,
        years: [],
      };
      blocks.push(currentBlock);
    }

    currentBlock.years.push(fold);
    currentBlock.oosYears.push(fold.oosYear);
  }

  for (const block of blocks) {
    const validReturns = block.years
      .filter((year) => year.oosValid && year.oosReturn != null)
      .map((year) => year.oosReturn as number);
    block.validYearCount = validReturns.length;
    block.positiveYearCount = validReturns.filter((value) => value > 0).length;
    if (validReturns.length > 0) {
      block.avgReturn = validReturns.reduce((sum, value) => sum + value, 0) / validReturns.length;
      block.compoundReturn = validReturns.reduce((equity, value) => equity * (1 + value), 1) - 1;
      block.positiveBlock = block.compoundReturn > 0;
    }
  }

  return blocks;
}

export function summarizeWalkForwardCounts(result: PatternFamilyWFResult | null): WalkForwardSampleCounts {
  const blocks = buildOosFoldBlocks(result);
  const validYears = result?.folds?.filter((fold) => fold.oosValid && fold.oosReturn != null) ?? [];
  const positiveYears = validYears.filter((fold) => (fold.oosReturn as number) > 0);
  const positiveBlocks = blocks.filter((block) => block.positiveBlock);

  const oosTradeCount = validYears.length;
  const oosYearCount = validYears.length;
  const oosFoldBlockCount = blocks.length;
  const positiveOosTradeCount = positiveYears.length;
  const positiveOosYearCount = positiveYears.length;
  const positiveOosFoldBlockCount = positiveBlocks.length;

  return {
    oosTradeCount,
    oosYearCount,
    oosFoldBlockCount,
    positiveOosTradeCount,
    positiveOosYearCount,
    positiveOosFoldBlockCount,
    positiveTradeRate: oosTradeCount > 0 ? positiveOosTradeCount / oosTradeCount : 0,
    positiveYearRate: oosYearCount > 0 ? positiveOosYearCount / oosYearCount : 0,
    positiveFoldRate: oosFoldBlockCount > 0 ? positiveOosFoldBlockCount / oosFoldBlockCount : 0,
  };
}
