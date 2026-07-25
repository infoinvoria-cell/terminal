import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { buildDailySeasonalCurve } from "@/lib/seasonality/dailySeasonalChart";
import { buildPineTv252SlotSeasonalCurve } from "@/lib/seasonality/pineTv252SlotCurve";
import { buildTenDayProbability, buildBestHoldingProbability } from "@/lib/seasonality/tenDayProbability";
import { runFixedPatternBacktest } from "@/lib/seasonality/fixedPatternBacktest";
import { PFWF_CONFIG_VERSION, runPatternFamilyWalkForward } from "@/lib/seasonality/patternFamilyWalkForward";
import type { PatternDirection, PatternHolding } from "@/lib/seasonality/patternSelection";
import { buildPatternData, slotToApproxMonthDay } from "@/lib/seasonality/patternSelection";
import { computeTradingViewMetrics } from "@/lib/seasonality/tradingViewMetrics";
import { SEASONAL_CSV_ASSETS, getAssetDef } from "@/lib/seasonality/walkForward/assetManifest";
import { runAnchoredExpandingWalkForward } from "@/lib/seasonality/walkForward/anchoredExpandingEngine";
import { csvFingerprint, parseDailyBarsCsv } from "@/lib/seasonality/walkForward/csvDataLoader";
import type {
  SavedPatternOosTrade,
  SavedSeasonalPattern,
  WalkForwardConfig,
  WalkForwardResult,
} from "@/lib/seasonality/walkForward/types";
import { runWalkForward } from "@/lib/seasonality/walkForward/walkForwardEngine";
import type { AnchoredExpandingConfig } from "@/lib/seasonality/walkForward/anchoredExpandingEngine";
import type { PortfolioDataset, PortfolioStrategy, PortfolioTrade } from "@/lib/portfolio/types";
import {
  HOLD_CANDS as AGRI_HOLD_CANDS,
  IT as AGRI_INITIAL_TRAINING_YEARS,
  MAX_PAT as AGRI_MAX_PATTERNS,
  MAX_SLOT as AGRI_MAX_SLOT,
  OOS_BLOCK as AGRI_OOS_BLOCK_YEARS,
  STEP as AGRI_ENTRY_STEP,
  STUDY_END as AGRI_STUDY_END,
  STUDY_START as AGRI_STUDY_START,
  buildCloseMap as buildAgricultureCloseMap,
  preFilter as preFilterAgriculture,
  selectNonOverlapping as selectNonOverlappingAgriculture,
  slotLabel as agricultureSlotLabel,
  type Cand as AgricultureCand,
} from "@/lib/seasonality/strategyEngine/isDiscovery";
import { resolveYahooSymbol } from "@/lib/server/yahooFallback";
import {
  SEASONALITY_CALCULATION_VERSION,
  SEASONALITY_CALMAR_FORMULA_VERSION,
  SEASONALITY_DRAWDOWN_METHOD_VERSION,
  SEASONALITY_HOLDING_GRID_VERSION,
  SEASONALITY_METRIC_FORMULA_VERSION,
  SEASONALITY_PATTERN_SELECTION_VERSION,
  SEASONALITY_QUALITY_RISK_INPUT_VERSION,
  SEASONALITY_SHARPE_FORMULA_VERSION,
  SEASONALITY_WALK_FORWARD_CACHE_VERSION,
} from "@/lib/seasonality/versions";

export const dynamic = "force-dynamic";

const DEFAULT_CONFIG: WalkForwardConfig = {
  assetId: "wheat",
  trainingYears: 10,
  testYears: 1,
  stepYears: 1,
  holdingDaysMin: 10,
  holdingDaysMax: 20,
  directions: ["LONG", "SHORT"],
  transactionCostBps: 0,
  rankingMetric: "stabilityScore",
  entryExecutionRule: "open_on_or_after",
  exitExecutionRule: "close_after_holding_days",
};

function workspaceRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === "frontend" ? path.dirname(cwd) : cwd;
}

function csvDir(): string {
  return path.join(workspaceRoot(), "workspace", "output", "tradingview_data_test");
}

function csvPathForAsset(def: { csvFile: string; csvDir?: string }): string {
  if (def.csvDir) {
    return path.join(workspaceRoot(), def.csvDir, def.csvFile);
  }
  return path.join(csvDir(), def.csvFile);
}

function cachedResultPath(assetId: string): string {
  return path.join(workspaceRoot(), "workspace", "output", "seasonality", "walk_forward", "cached_results", `${assetId}_v1_result.json`);
}

function strictWfCacheDir(): string {
  return path.join(workspaceRoot(), "workspace", "output", "seasonality", "walk_forward", "pattern_family_cache");
}

function strictWfCachePath(cacheKey: string): string {
  return path.join(strictWfCacheDir(), `${cacheKey}.json`);
}

function savedPatternsDir(assetId: string): string {
  return path.join(workspaceRoot(), "workspace", "output", "seasonality", "walk_forward", "saved_patterns", assetId);
}

function agricultureAuditDir(): string {
  return path.join(
    workspaceRoot(),
    "workspace",
    "output",
    "seasonality",
    "audit",
    "agriculture_saved_patterns_validation",
  );
}

function seasonalResearchPortfolioPath(): string {
  return path.join(
    workspaceRoot(),
    "workspace",
    "output",
    "seasonality",
    "research_portfolio",
    "seasonal_patterns_strategies.json",
  );
}

function obsidianBrainRoot(): string {
  return path.join(path.dirname(workspaceRoot()), "Invoria Brain");
}

const AGRICULTURE_ASSET_IDS = [
  "wheat",
  "corn",
  "soybeans",
  "cocoa",
  "coffee",
  "sugar",
  "cotton",
  "orangejuice",
] as const;

const SEASONAL_PATTERNS_GROUP_ID = "seasonal_patterns" as const;

const ATR_SAFETY_STOP = {
  useAtrSafetyStop: true,
  atrLength: 14,
  atrMultiplier: 2.0,
  stopMode: "safety_only",
} as const;

type AgricultureValidationSelection = {
  slot: number;
  holding: number;
  dir: "LONG" | "SHORT";
  score: number;
  winRate: number;
  avgReturn: number;
  pf: number;
};

type AssetValidationSummary = {
  assetId: string;
  symbol: string;
  displayName: string;
  sourceFingerprint: string;
  testedPatterns: number;
  strongOrExcellentCount: number;
  savedPatternCount: number;
  savedPatterns: SavedSeasonalPattern[];
  excludedPatterns: Array<{
    direction: "LONG" | "SHORT";
    entryMonthDay: string;
    holdingTradingDays: number;
    qualityScore: number | null;
    qualityStatus: string | null;
    reason: string;
  }>;
};

type AgricultureValidationReport = {
  version: "agriculture_saved_patterns_validation_v1";
  generatedAt: string;
  config: {
    assets: string[];
    studyStart: number;
    studyEnd: number;
    holdingCandidates: number[];
    entryStepTradingDays: number;
    initialTrainingYears: number;
    oosBlockYears: number;
    maxPatternsPerAsset: number;
    overlapPolicy: "no_same_asset_overlap";
    acceptedRatings: Array<"Strong" | "Excellent">;
    atrSafetyStop: typeof ATR_SAFETY_STOP;
  };
  assets: AssetValidationSummary[];
  dashboardIntegration: {
    savedPatternsVisible: boolean;
    portfolioExportWritten: boolean;
    portfolioGroupId: typeof SEASONAL_PATTERNS_GROUP_ID;
    researchOnly: true;
  };
  obsidianExport: {
    rootPath: string;
    portfolioNotePath: string;
    patternNoteCount: number;
    status: "written" | "missing_root";
  };
  remainingRisks: string[];
};

type LoadedAssetBars = {
  bars: ReturnType<typeof parseDailyBarsCsv>;
  csvFile: string;
  fp: string;
  assetId: string;
  monitoringSymbol: string;
  displayName: string;
  symbol: string;
  sourceType: "manual_tv_csv" | "existing_yahoo_provider" | "other_verified_source";
  sourcePathOrProviderSymbol: string;
};

function buildSourceFingerprint(sourceDescriptor: string, bars: ReturnType<typeof parseDailyBarsCsv>): string {
  return `${sourceDescriptor}|${csvFingerprint(bars)}`;
}

function buildStrictWfCacheKey(input: {
  assetId: string;
  direction: PatternDirection;
  startSlot: number;
  baselineHoldingDays: PatternHolding | null;
  initialTrainingYears: number;
  oosBlockYears: number;
  sourceFingerprint: string;
}): string {
  const cacheIdentity = JSON.stringify({
    assetId: input.assetId,
    direction: input.direction,
    startSlot: input.startSlot,
    baselineHoldingDays: input.baselineHoldingDays ?? null,
    initialTrainingYears: input.initialTrainingYears,
    oosBlockYears: input.oosBlockYears,
    sourceFingerprint: input.sourceFingerprint,
    pfwfConfigVersion: PFWF_CONFIG_VERSION,
    calculationVersion: SEASONALITY_CALCULATION_VERSION,
    drawdownMethodVersion: SEASONALITY_DRAWDOWN_METHOD_VERSION,
    calmarFormulaVersion: SEASONALITY_CALMAR_FORMULA_VERSION,
    qualityRiskInputVersion: SEASONALITY_QUALITY_RISK_INPUT_VERSION,
    walkForwardCacheVersion: SEASONALITY_WALK_FORWARD_CACHE_VERSION,
  });
  const hash = createHash("sha256").update(cacheIdentity).digest("hex").slice(0, 24);
  return [
    input.assetId,
    input.direction,
    `S${input.startSlot}`,
    `H${input.baselineHoldingDays ?? "na"}`,
    `IT${input.initialTrainingYears}`,
    `OOS${input.oosBlockYears}`,
    `K${hash}`,
  ].join("__");
}

function isCurrentMetricCache(cache: unknown, assetId: string, lookbackYears: number, sourceFingerprint: string): cache is Record<string, unknown> {
  if (!cache || typeof cache !== "object") return false;
  const metadata = (cache as { metadata?: Record<string, unknown> }).metadata;
  if (!metadata) return false;
  return metadata.asset === assetId
    && metadata.lookbackYears === lookbackYears
    && metadata.sourceFingerprint === sourceFingerprint
    && metadata.calculationVersion === SEASONALITY_CALCULATION_VERSION
    && metadata.metricFormulaVersion === SEASONALITY_METRIC_FORMULA_VERSION
    && metadata.drawdownMethodVersion === SEASONALITY_DRAWDOWN_METHOD_VERSION
    && metadata.calmarFormulaVersion === SEASONALITY_CALMAR_FORMULA_VERSION
    && metadata.qualityRiskInputVersion === SEASONALITY_QUALITY_RISK_INPUT_VERSION
    && metadata.sharpeFormulaVersion === SEASONALITY_SHARPE_FORMULA_VERSION
    && metadata.holdingGridVersion === SEASONALITY_HOLDING_GRID_VERSION
    && metadata.patternSelectionVersion === SEASONALITY_PATTERN_SELECTION_VERSION;
}

async function loadBarsForAsset(assetId: string): Promise<LoadedAssetBars | { error: string; status: number }> {
  const def = getAssetDef(assetId);
  if (!def) return { error: `Unknown assetId: ${assetId}`, status: 400 };

  const yahooOnly = def.csvFile.startsWith("__yahoo__:");
  if (yahooOnly) {
    const yahooSymbol = def.csvFile.slice("__yahoo__:".length) || resolveYahooSymbol(def.symbol || assetId);
    if (!yahooSymbol) return { error: `No Yahoo mapping for assetId: ${assetId}`, status: 404 };
    try {
      const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`);
      url.searchParams.set("interval", "1d");
      url.searchParams.set("period1", "0");
      url.searchParams.set("period2", String(Math.floor(Date.now() / 1000)));
      url.searchParams.set("includePrePost", "false");
      url.searchParams.set("events", "div,splits");
      const response = await fetch(url.toString(), {
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
        cache: "no-store",
      });
      if (!response.ok) return { error: `Yahoo fetch failed for ${yahooSymbol}`, status: 404 };
      const payload = await response.json();
      const result = payload?.chart?.result?.[0];
      const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
      const quote = result?.indicators?.quote?.[0] ?? {};
      const opens: number[] = Array.isArray(quote?.open) ? quote.open : [];
      const highs: number[] = Array.isArray(quote?.high) ? quote.high : [];
      const lows: number[] = Array.isArray(quote?.low) ? quote.low : [];
      const closes: number[] = Array.isArray(quote?.close) ? quote.close : [];
      const vols: Array<number | null> = Array.isArray(quote?.volume) ? quote.volume : [];
      const bars: ReturnType<typeof parseDailyBarsCsv> = [];
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const open = Number(opens[i]);
        const high = Number(highs[i]);
        const low = Number(lows[i]);
        const close = Number(closes[i]);
        const volume = vols[i] == null ? 0 : Number(vols[i]);
        if (!Number.isFinite(ts) || !Number.isFinite(open) || !Number.isFinite(close)) continue;
        const date = new Date(ts * 1000).toISOString().slice(0, 10);
        bars.push({ date, open, high: Number.isFinite(high) ? high : open, low: Number.isFinite(low) ? low : open, close, volume: Number.isFinite(volume) ? volume : 0 });
      }
      if (bars.length < 100) return { error: `Yahoo parsed only ${bars.length} bars`, status: 422 };
      return {
        bars,
        csvFile: `yahoo:${yahooSymbol}`,
        fp: buildSourceFingerprint(`yahoo:${yahooSymbol}`, bars),
        assetId,
        monitoringSymbol: def.symbol || assetId,
        displayName: def.displayName,
        symbol: def.symbol,
        sourceType: "existing_yahoo_provider",
        sourcePathOrProviderSymbol: yahooSymbol,
      };
    } catch {
      return { error: `Yahoo fetch failed for ${yahooSymbol}`, status: 404 };
    }
  }

  const fp = csvPathForAsset(def);
  let csvContent: string;
  try {
    csvContent = await fs.readFile(fp, "utf-8");
  } catch {
    // Fallback: existing Yahoo integration (only for assets without local CSV).
    // Note: we do NOT invent symbol mappings here; resolveYahooSymbol uses the existing alias table.
    try {
      const yahooSymbol = resolveYahooSymbol(def.symbol || assetId);
      if (!yahooSymbol) return { error: `CSV file not found: ${fp}`, status: 404 };
      const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`);
      url.searchParams.set("interval", "1d");
      url.searchParams.set("period1", "0");
      url.searchParams.set("period2", String(Math.floor(Date.now() / 1000)));
      url.searchParams.set("includePrePost", "false");
      url.searchParams.set("events", "div,splits");
      const response = await fetch(url.toString(), {
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
        cache: "no-store",
      });
      if (!response.ok) return { error: `CSV file not found: ${fp}`, status: 404 };
      const payload = await response.json();
      const result = payload?.chart?.result?.[0];
      const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
      const quote = result?.indicators?.quote?.[0] ?? {};
      const opens: number[] = Array.isArray(quote?.open) ? quote.open : [];
      const highs: number[] = Array.isArray(quote?.high) ? quote.high : [];
      const lows: number[] = Array.isArray(quote?.low) ? quote.low : [];
      const closes: number[] = Array.isArray(quote?.close) ? quote.close : [];
      const vols: Array<number | null> = Array.isArray(quote?.volume) ? quote.volume : [];
      const bars: ReturnType<typeof parseDailyBarsCsv> = [];
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const open = Number(opens[i]);
        const high = Number(highs[i]);
        const low = Number(lows[i]);
        const close = Number(closes[i]);
        const volume = vols[i] == null ? 0 : Number(vols[i]);
        if (!Number.isFinite(ts) || !Number.isFinite(open) || !Number.isFinite(close)) continue;
        const date = new Date(ts * 1000).toISOString().slice(0, 10);
        bars.push({ date, open, high: Number.isFinite(high) ? high : open, low: Number.isFinite(low) ? low : open, close, volume: Number.isFinite(volume) ? volume : 0 });
      }
      if (bars.length < 100) return { error: `Yahoo parsed only ${bars.length} bars`, status: 422 };
      return {
        bars,
        csvFile: `yahoo:${yahooSymbol}`,
        fp: buildSourceFingerprint(`yahoo:${yahooSymbol}`, bars),
        assetId,
        monitoringSymbol: def.symbol || assetId,
        displayName: def.displayName,
        symbol: def.symbol,
        sourceType: "existing_yahoo_provider",
        sourcePathOrProviderSymbol: yahooSymbol,
      };
    } catch {
      return { error: `CSV file not found: ${fp}`, status: 404 };
    }
  }
  const bars = parseDailyBarsCsv(csvContent);
  if (bars.length < 100) return { error: `CSV parsed only ${bars.length} bars`, status: 422 };
  return {
    bars,
    csvFile: def.csvFile,
    fp: buildSourceFingerprint(fp, bars),
    assetId,
    monitoringSymbol: def.symbol || assetId,
    displayName: def.displayName,
    symbol: def.symbol,
    sourceType: "manual_tv_csv",
    sourcePathOrProviderSymbol: fp,
  };
}

async function writeCachedResult(assetId: string, result: WalkForwardResult): Promise<void> {
  const fp = cachedResultPath(assetId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(result, null, 2), "utf-8");
}

async function loadStrictWfCache(cacheKey: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(strictWfCachePath(cacheKey), "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function writeStrictWfCache(cacheKey: string, result: Record<string, unknown>): Promise<void> {
  await fs.mkdir(strictWfCacheDir(), { recursive: true });
  await fs.writeFile(strictWfCachePath(cacheKey), JSON.stringify(result, null, 2), "utf-8");
}

function candidateScore(winRate: number, avgReturn: number, profitFactor: number, holdingDays: number): number {
  return (winRate * 100) + (avgReturn * 1000) + (profitFactor * 10) - (holdingDays * 0.1);
}

function buildPatternId(assetId: string, direction: "LONG" | "SHORT", entryMonthDay: string, holdingTradingDays: number): string {
  return [
    "seasonal",
    "agri",
    assetId,
    direction.toLowerCase(),
    entryMonthDay.replace(/[^0-9]/g, ""),
    `h${holdingTradingDays}`,
  ].join("_");
}

function buildPortfolioStrategyId(pattern: SavedSeasonalPattern): string {
  return `seasonal_pattern_${pattern.patternId}`;
}

function shortDirection(direction: "LONG" | "SHORT"): "L" | "S" {
  return direction === "LONG" ? "L" : "S";
}

function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function formatPatternWindow(entryMonthDay: string, holdingTradingDays: number): string {
  return `${entryMonthDay} · ${holdingTradingDays}D`;
}

function sortSavedPatternTrades(trades: SavedPatternOosTrade[]): SavedPatternOosTrade[] {
  return [...trades].sort((left, right) => {
    const leftKey = `${left.exitDate}|${left.entryDate}|${left.year}`;
    const rightKey = `${right.exitDate}|${right.entryDate}|${right.year}`;
    return leftKey.localeCompare(rightKey);
  });
}

function buildOosTradeDetails(result: ReturnType<typeof runPatternFamilyWalkForward>): SavedPatternOosTrade[] {
  const trades = result.folds
    .filter((fold) => fold.oosValid && fold.oosReturn != null && fold.oosEntryDate && fold.oosExitDate)
    .map<SavedPatternOosTrade>((fold) => ({
      year: fold.oosYear,
      direction: result.directionFixed,
      entryDate: fold.oosEntryDate!,
      exitDate: fold.oosExitDate!,
      entryPrice: fold.oosEntryPrice,
      exitPrice: fold.oosExitPrice,
      returnPct: fold.oosReturn,
      entrySlot: fold.selectedEntrySlot,
      holdingTradingDays: fold.selectedHoldingDays,
    }));
  return sortSavedPatternTrades(trades);
}

function buildSavedPatternFromFamilyResult(
  assetId: string,
  source: LoadedAssetBars,
  result: ReturnType<typeof runPatternFamilyWalkForward>,
): SavedSeasonalPattern | null {
  const deployment = result.deploymentPattern;
  if (!deployment) return null;
  const rating = result.quality.status;
  if (rating !== "Strong" && rating !== "Excellent") return null;

  const tradeDetails = buildOosTradeDetails(result);
  const oosReturns = tradeDetails
    .map((trade) => trade.returnPct)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const oosMetrics = computeTradingViewMetrics(oosReturns);
  const entryMonthDay = slotToApproxMonthDay(deployment.entrySlot);
  const holdingTradingDays = deployment.holdingDays;
  const patternId = buildPatternId(assetId, deployment.direction, entryMonthDay, holdingTradingDays);
  const name = `${source.monitoringSymbol} Seasonal ${deployment.direction} ${formatPatternWindow(entryMonthDay, holdingTradingDays)}`;

  return {
    patternId,
    assetId,
    symbol: source.monitoringSymbol,
    displayName: source.displayName,
    name,
    ruleVersion: `PFWF_${result.configVersion}`,
    direction: deployment.direction,
    entryMonthDay,
    holdingTradingDays,
    validationMode: "Anchored Expanding OOS",
    gateStatus: "PASSED_RESEARCH_GATE",
    oosReturn: result.quality.oosCompoundReturn,
    oosCompoundedReturn: result.quality.oosCompoundReturn,
    oosMaxDrawdown: result.quality.oosMaxDrawdown,
    oosWinRate: result.quality.oosWinRate / 100,
    oosProfitFactor: result.quality.oosProfitFactor,
    oosTradeCount: result.quality.oosTradeCount,
    sampleSize: result.resultIdentity?.includedYears.length ?? null,
    robustnessStatus: null,
    status: "Validated",
    currentYearStatus: null,
    plannedEntryDate: null,
    plannedExitDate: null,
    experimentId: result.resultId,
    savedAt: new Date().toISOString(),
    researchRating: rating,
    qualityScore: result.quality.qualityScore,
    oosAverageReturn: result.quality.oosAvgReturn,
    oosSharpe: oosMetrics.sharpe,
    oosCalmar: result.stitchedOosBarLevelCalmar ?? result.auditMetrics?.tradeCloseStitchedOosCalmar ?? null,
    parameterStability: result.parameterStability,
    sourceFingerprint: source.fp,
    researchOnly: true,
    portfolioGroupId: SEASONAL_PATTERNS_GROUP_ID,
    atrSafetyStop: ATR_SAFETY_STOP,
    oosTradesDetailed: tradeDetails,
    usedAsLiveSignal: false,
    canBePromotedToLiveSignal: false,
  };
}

async function writeSavedPattern(pattern: SavedSeasonalPattern): Promise<void> {
  const dir = savedPatternsDir(pattern.assetId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${pattern.patternId}.json`), JSON.stringify(pattern, null, 2), "utf-8");
}

async function clearSavedPatternsForAsset(assetId: string): Promise<void> {
  const dir = savedPatternsDir(assetId);
  try {
    const files = await fs.readdir(dir);
    await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => fs.unlink(path.join(dir, file)).catch(() => undefined)),
    );
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

function buildPortfolioTradesFromSavedPattern(pattern: SavedSeasonalPattern): PortfolioTrade[] {
  const trades = sortSavedPatternTrades(pattern.oosTradesDetailed ?? []);
  let equity = 1;

  return trades.map((trade, index) => {
    const ret = trade.returnPct ?? 0;
    const pnlNet = ret * 10_000;
    equity *= (1 + ret);
    return {
      id: `${pattern.patternId}-${trade.year}-${index + 1}`,
      tradeNo: index + 1,
      timestamp: `${trade.exitDate}T00:00:00.000Z`,
      type: `${trade.direction} Exit`,
      signal: trade.direction,
      price: trade.exitPrice ?? 0,
      sizeQty: 1,
      sizeValue: trade.entryPrice ?? 0,
      pnlNet,
      pnlPct: ret * 100,
      cumulativePnl: (equity - 1) * 10_000,
      cumulativePct: (equity - 1) * 100,
      sourceFile: `${pattern.patternId}.json`,
    };
  });
}

function buildPortfolioStrategyFromPattern(pattern: SavedSeasonalPattern): PortfolioStrategy {
  return {
    id: buildPortfolioStrategyId(pattern),
    fileName: `${pattern.patternId}.json`,
    displayName: pattern.name,
    shortName: `${pattern.symbol} ${shortDirection(pattern.direction)} ${pattern.entryMonthDay} ${pattern.holdingTradingDays}D`,
    groupId: SEASONAL_PATTERNS_GROUP_ID,
    symbol: pattern.symbol,
    market: "SEASONALITY_RESEARCH",
    trades: buildPortfolioTradesFromSavedPattern(pattern),
    researchOnly: true,
    researchSource: "seasonality_saved_pattern",
    sourcePatternId: pattern.patternId,
  };
}

async function writeSeasonalResearchPortfolioExport(patterns: SavedSeasonalPattern[]): Promise<void> {
  const dataset: PortfolioDataset = {
    generatedAt: new Date().toISOString(),
    groups: [
      {
        id: SEASONAL_PATTERNS_GROUP_ID,
        label: "Seasonal Patterns",
        defaultWeightPct: 0,
      },
    ],
    strategies: patterns.map(buildPortfolioStrategyFromPattern),
  };
  const target = seasonalResearchPortfolioPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(
    target,
    JSON.stringify(
      {
        version: "seasonal_patterns_portfolio_v1",
        researchOnly: true,
        dataset,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

async function writeObsidianBrainNotes(patterns: SavedSeasonalPattern[]): Promise<{
  status: "written" | "missing_root";
  portfolioNotePath: string;
  patternNoteCount: number;
}> {
  const root = obsidianBrainRoot();
  try {
    const rootStat = await fs.stat(root);
    if (!rootStat.isDirectory()) {
      return { status: "missing_root", portfolioNotePath: "", patternNoteCount: 0 };
    }
  } catch {
    return { status: "missing_root", portfolioNotePath: "", patternNoteCount: 0 };
  }

  const seasonalityDir = path.join(root, "09_Seasonality", "Agriculture Seasonal Patterns");
  const portfolioDir = path.join(root, "05_Portfolios");
  const inefficienciesDir = path.join(root, "06_Market_Inefficiencies");
  const anomaliesDir = path.join(root, "07_Anomalies");

  await Promise.all([
    fs.mkdir(seasonalityDir, { recursive: true }),
    fs.mkdir(portfolioDir, { recursive: true }),
    fs.mkdir(inefficienciesDir, { recursive: true }),
    fs.mkdir(anomaliesDir, { recursive: true }),
  ]);

  const portfolioNotePath = path.join(portfolioDir, "Seasonal Patterns Portfolio.md");
  const portfolioNoteBody = [
    "# Seasonal Patterns Portfolio",
    "",
    "Status: Research-only",
    "Group: Seasonal Patterns",
    "ATR Safety Stop: active (14 / 2.0 / safety_only)",
    "",
    "## Saved Agriculture Patterns",
    ...patterns.map((pattern) => `- [[09_Seasonality/Agriculture Seasonal Patterns/${pattern.patternId}|${pattern.name}]]`),
    "",
  ].join("\n");
  await fs.writeFile(portfolioNotePath, portfolioNoteBody, "utf-8");

  const inefficiencyNotePath = path.join(inefficienciesDir, "Agriculture Seasonal Edges.md");
  await fs.writeFile(
    inefficiencyNotePath,
    [
      "# Agriculture Seasonal Edges",
      "",
      "Research-only aggregation of walk-forward/OOS-validated agriculture patterns.",
      "",
      "- Portfolio group: [[05_Portfolios/Seasonal Patterns Portfolio]]",
      ...patterns.map((pattern) => `- [[09_Seasonality/Agriculture Seasonal Patterns/${pattern.patternId}|${pattern.name}]]`),
      "",
    ].join("\n"),
    "utf-8",
  );

  const anomaliesNotePath = path.join(anomaliesDir, "Agriculture Seasonal Anomalies.md");
  await fs.writeFile(
    anomaliesNotePath,
    [
      "# Agriculture Seasonal Anomalies",
      "",
      "Filtered set of recurring seasonal agriculture patterns that passed strict OOS validation.",
      "",
      "- Portfolio group: [[05_Portfolios/Seasonal Patterns Portfolio]]",
      ...patterns.map((pattern) => `- [[09_Seasonality/Agriculture Seasonal Patterns/${pattern.patternId}|${pattern.name}]]`),
      "",
    ].join("\n"),
    "utf-8",
  );

  await Promise.all(
    patterns.map(async (pattern) => {
      const notePath = path.join(seasonalityDir, `${pattern.patternId}.md`);
      const note = [
        `# ${pattern.name}`,
        "",
        `- Asset: ${pattern.displayName} (${pattern.symbol})`,
        `- Pattern-Zeitraum: ${pattern.entryMonthDay} · ${pattern.holdingTradingDays} Trading Days`,
        `- Richtung: ${pattern.direction}`,
        `- Historische Trefferquote: ${pattern.oosWinRate != null ? `${(pattern.oosWinRate * 100).toFixed(1)}%` : "--"}`,
        `- OOS/WF-Ergebnis: ${fmtPct(pattern.oosCompoundedReturn)} über ${pattern.oosTradeCount ?? 0} OOS-Trades`,
        `- Sharpe: ${pattern.oosSharpe != null ? pattern.oosSharpe.toFixed(2) : "--"}`,
        `- Calmar: ${pattern.oosCalmar != null ? pattern.oosCalmar.toFixed(2) : "--"}`,
        `- Max DD: ${fmtPct(pattern.oosMaxDrawdown)}`,
        `- Rating: ${pattern.researchRating ?? "--"} (QS ${pattern.qualityScore ?? "--"})`,
        `- ATR Safety Stop: ${pattern.atrSafetyStop ? "useAtrSafetyStop=true · atrLength=14 · atrMultiplier=2.0 · stopMode=safety_only" : "--"}`,
        "- Status: Research-only",
        `- Portfolio-Gruppe: [[05_Portfolios/Seasonal Patterns Portfolio]]`,
        "",
        "## Validation",
        `- Walk-Forward: ${pattern.validationMode}`,
        `- Gate Status: ${pattern.gateStatus}`,
        `- Parameter Stability: ${pattern.parameterStability != null ? `${(pattern.parameterStability * 100).toFixed(0)}%` : "--"}`,
        "",
        "## OOS Trades",
        ...(pattern.oosTradesDetailed?.map((trade) => (
          `- ${trade.year}: ${trade.entryDate} -> ${trade.exitDate} · ${fmtPct(trade.returnPct)}`
        )) ?? ["- --"]),
        "",
      ].join("\n");
      await fs.writeFile(notePath, note, "utf-8");
    }),
  );

  return {
    status: "written",
    portfolioNotePath,
    patternNoteCount: patterns.length,
  };
}

function buildMarkdownReport(report: AgricultureValidationReport): string {
  const lines: string[] = [
    "# Agriculture Saved Patterns Validation",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Config",
    `- Assets: ${report.config.assets.join(", ")}`,
    `- Study Range: ${report.config.studyStart}-${report.config.studyEnd}`,
    `- Holdings: ${report.config.holdingCandidates.join(", ")}`,
    `- Entry Step: ${report.config.entryStepTradingDays}`,
    `- WF: initialTrain=${report.config.initialTrainingYears}, oosBlock=${report.config.oosBlockYears}`,
    `- Accepted Ratings: ${report.config.acceptedRatings.join(", ")}`,
    `- ATR Safety Stop: useAtrSafetyStop=true, atrLength=14, atrMultiplier=2.0, stopMode=safety_only`,
    "",
    "## Per Asset",
  ];

  report.assets.forEach((asset) => {
    lines.push(`### ${asset.symbol} · ${asset.displayName}`);
    lines.push(`- Tested patterns: ${asset.testedPatterns}`);
    lines.push(`- Strong/Excellent: ${asset.strongOrExcellentCount}`);
    lines.push(`- Saved patterns: ${asset.savedPatternCount}`);
    if (asset.savedPatterns.length) {
      lines.push("- Saved:");
      asset.savedPatterns.forEach((pattern) => {
        lines.push(
          `  - ${pattern.name} · ${pattern.researchRating ?? "--"} · WR ${pattern.oosWinRate != null ? `${(pattern.oosWinRate * 100).toFixed(1)}%` : "--"} · OOS ${fmtPct(pattern.oosCompoundedReturn)}`,
        );
      });
    }
    if (asset.excludedPatterns.length) {
      lines.push("- Excluded:");
      asset.excludedPatterns.slice(0, 12).forEach((entry) => {
        lines.push(`  - ${entry.direction} ${entry.entryMonthDay} ${entry.holdingTradingDays}D · ${entry.reason}`);
      });
    }
    lines.push("");
  });

  lines.push("## Integration");
  lines.push(`- Saved Patterns visible: ${report.dashboardIntegration.savedPatternsVisible ? "yes" : "no"}`);
  lines.push(`- Portfolio export written: ${report.dashboardIntegration.portfolioExportWritten ? "yes" : "no"}`);
  lines.push(`- Portfolio group: ${report.dashboardIntegration.portfolioGroupId}`);
  lines.push(`- Obsidian export: ${report.obsidianExport.status}`);
  lines.push("");
  lines.push("## Remaining Risks");
  report.remainingRisks.forEach((risk) => lines.push(`- ${risk}`));
  lines.push("");
  return lines.join("\n");
}

async function runAgricultureSavedPatternsValidation(): Promise<AgricultureValidationReport> {
  const assetReports: AssetValidationSummary[] = [];
  const allSavedPatterns: SavedSeasonalPattern[] = [];

  for (const assetId of AGRICULTURE_ASSET_IDS) {
    const loaded = await loadBarsForAsset(assetId);
    if ("error" in loaded) {
      assetReports.push({
        assetId,
        symbol: assetId,
        displayName: assetId,
        sourceFingerprint: loaded.error,
        testedPatterns: 0,
        strongOrExcellentCount: 0,
        savedPatternCount: 0,
        savedPatterns: [],
        excludedPatterns: [{
          direction: "LONG",
          entryMonthDay: "--",
          holdingTradingDays: 0,
          qualityScore: null,
          qualityStatus: null,
          reason: loaded.error,
        }],
      });
      continue;
    }

    const filteredBars = loaded.bars.filter((bar) => {
      const year = Number.parseInt(bar.date.slice(0, 4), 10);
      return year >= AGRI_STUDY_START && year <= AGRI_STUDY_END;
    });
    const { map, years } = buildAgricultureCloseMap(filteredBars, AGRI_STUDY_START, AGRI_STUDY_END);

    if (years.length < AGRI_INITIAL_TRAINING_YEARS + AGRI_OOS_BLOCK_YEARS) {
      assetReports.push({
        assetId,
        symbol: loaded.monitoringSymbol,
        displayName: loaded.displayName,
        sourceFingerprint: loaded.fp,
        testedPatterns: 0,
        strongOrExcellentCount: 0,
        savedPatternCount: 0,
        savedPatterns: [],
        excludedPatterns: [{
          direction: "LONG",
          entryMonthDay: "--",
          holdingTradingDays: 0,
          qualityScore: null,
          qualityStatus: null,
          reason: "insufficient_complete_years",
        }],
      });
      continue;
    }

    const longFamilies = new Map<number, AgricultureValidationSelection>();
    const shortFamilies = new Map<number, AgricultureValidationSelection>();
    const excludedPatterns: AssetValidationSummary["excludedPatterns"] = [];
    let testedPatterns = 0;

    for (let slot = 1; slot <= AGRI_MAX_SLOT; slot += AGRI_ENTRY_STEP) {
      for (const direction of ["LONG", "SHORT"] as const) {
        for (const holdingDays of AGRI_HOLD_CANDS) {
          const metrics = preFilterAgriculture(map, years, slot, holdingDays, direction);
          if (!metrics || metrics.winRate < 60 || metrics.avgReturn <= 0 || metrics.pf < 0.8) continue;

          const selection: AgricultureValidationSelection = {
            slot,
            holding: holdingDays,
            dir: direction,
            score: candidateScore(metrics.winRate, metrics.avgReturn, metrics.pf, holdingDays),
            winRate: metrics.winRate,
            avgReturn: metrics.avgReturn,
            pf: metrics.pf,
          };
          const bin = Math.floor(slot / 8);
          const familyMap = direction === "LONG" ? longFamilies : shortFamilies;
          const previous = familyMap.get(bin);
          if (!previous || selection.score > previous.score) {
            familyMap.set(bin, selection);
          }
        }
      }
    }

    const representatives = [...longFamilies.values(), ...shortFamilies.values()];
    const validatedCandidates: Array<{ selection: AgricultureValidationSelection; pattern: SavedSeasonalPattern }> = [];

    for (const representative of representatives) {
      testedPatterns += 1;
      const familyResult = runPatternFamilyWalkForward(
        filteredBars,
        assetId,
        representative.dir,
        representative.slot,
        AGRI_INITIAL_TRAINING_YEARS,
        AGRI_OOS_BLOCK_YEARS,
        representative.holding as PatternHolding,
        {
          monitoringSymbol: loaded.monitoringSymbol,
          sourceType: loaded.sourceType,
          sourcePathOrProviderSymbol: loaded.sourcePathOrProviderSymbol,
          sourceFingerprint: loaded.fp,
        },
      );
      const savedPattern = buildSavedPatternFromFamilyResult(assetId, loaded, familyResult);
      if (savedPattern) {
        validatedCandidates.push({ selection: representative, pattern: savedPattern });
        continue;
      }
      excludedPatterns.push({
        direction: representative.dir,
        entryMonthDay: slotToApproxMonthDay(representative.slot),
        holdingTradingDays: representative.holding,
        qualityScore: familyResult.quality.qualityScore ?? null,
        qualityStatus: familyResult.quality.status,
        reason:
          familyResult.quality.status === "Strong" || familyResult.quality.status === "Excellent"
            ? "missing_deployment_pattern"
            : `quality_${familyResult.quality.status.toLowerCase().replace(/\s+/g, "_")}`,
      });
    }

    const { sel, rej } = selectNonOverlappingAgriculture(
      validatedCandidates.map((candidate): AgricultureCand => ({
        slot: candidate.selection.slot,
        holding: candidate.selection.holding,
        dir: candidate.selection.dir,
        score: candidate.pattern.qualityScore ?? candidate.selection.score,
        winRate: candidate.selection.winRate,
        avgReturn: candidate.selection.avgReturn,
        pf: candidate.selection.pf,
      })),
      AGRI_MAX_PATTERNS,
    );

    const selectedPatterns = sel
      .map((entry) => validatedCandidates.find((candidate) =>
        candidate.selection.slot === entry.slot
        && candidate.selection.holding === entry.holding
        && candidate.selection.dir === entry.dir,
      )?.pattern ?? null)
      .filter((pattern): pattern is SavedSeasonalPattern => pattern != null)
      .sort((left, right) => left.entryMonthDay.localeCompare(right.entryMonthDay) || left.direction.localeCompare(right.direction));

    rej.forEach((entry) => {
      excludedPatterns.push({
        direction: entry.dir,
        entryMonthDay: slotToApproxMonthDay(entry.slot),
        holdingTradingDays: entry.holding,
        qualityScore: validatedCandidates.find((candidate) =>
          candidate.selection.slot === entry.slot
          && candidate.selection.holding === entry.holding
          && candidate.selection.dir === entry.dir,
        )?.pattern.qualityScore ?? null,
        qualityStatus: "Strong/Excellent",
        reason: "overlapping_window_same_direction",
      });
    });

    await clearSavedPatternsForAsset(assetId);
    await Promise.all(selectedPatterns.map(writeSavedPattern));
    allSavedPatterns.push(...selectedPatterns);

    assetReports.push({
      assetId,
      symbol: loaded.monitoringSymbol,
      displayName: loaded.displayName,
      sourceFingerprint: loaded.fp,
      testedPatterns,
      strongOrExcellentCount: validatedCandidates.length,
      savedPatternCount: selectedPatterns.length,
      savedPatterns: selectedPatterns,
      excludedPatterns,
    });
  }

  await writeSeasonalResearchPortfolioExport(allSavedPatterns);
  const obsidianExport = await writeObsidianBrainNotes(allSavedPatterns);

  const report: AgricultureValidationReport = {
    version: "agriculture_saved_patterns_validation_v1",
    generatedAt: new Date().toISOString(),
    config: {
      assets: [...AGRICULTURE_ASSET_IDS],
      studyStart: AGRI_STUDY_START,
      studyEnd: AGRI_STUDY_END,
      holdingCandidates: [...AGRI_HOLD_CANDS],
      entryStepTradingDays: AGRI_ENTRY_STEP,
      initialTrainingYears: AGRI_INITIAL_TRAINING_YEARS,
      oosBlockYears: AGRI_OOS_BLOCK_YEARS,
      maxPatternsPerAsset: AGRI_MAX_PATTERNS,
      overlapPolicy: "no_same_asset_overlap",
      acceptedRatings: ["Strong", "Excellent"],
      atrSafetyStop: ATR_SAFETY_STOP,
    },
    assets: assetReports,
    dashboardIntegration: {
      savedPatternsVisible: true,
      portfolioExportWritten: true,
      portfolioGroupId: SEASONAL_PATTERNS_GROUP_ID,
      researchOnly: true,
    },
    obsidianExport: {
      rootPath: obsidianBrainRoot(),
      portfolioNotePath: obsidianExport.portfolioNotePath,
      patternNoteCount: obsidianExport.patternNoteCount,
      status: obsidianExport.status,
    },
    remainingRisks: [
      "Portfolio integration uses saved OOS trades as research proxies, not executable broker trade logs.",
      "Patterns remain research-only and are not approved/live regardless of portfolio visibility.",
      "Seasonality validation is manual-only via explicit route action; no page-load batch execution was added.",
    ],
  };

  await fs.mkdir(agricultureAuditDir(), { recursive: true });
  await fs.writeFile(
    path.join(agricultureAuditDir(), "agriculture_saved_patterns_validation_report.json"),
    JSON.stringify(report, null, 2),
    "utf-8",
  );
  await fs.writeFile(
    path.join(agricultureAuditDir(), "AGRICULTURE_SAVED_PATTERNS_VALIDATION_REPORT.md"),
    buildMarkdownReport(report),
    "utf-8",
  );

  return report;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = (body.action as string | undefined) ?? "runV1WalkForward";

    // ── Action: loadSeasonalChart — uses Pine TV 252-slot formula ─────────────
    if (action === "loadSeasonalChart") {
      const assetId = (body.assetId as string | undefined) ?? "wheat";
      const lookbackYears = Math.max(0, Math.min(Number(body.lookbackYears ?? 20), 30));

      const result = await loadBarsForAsset(assetId);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

      const def = getAssetDef(assetId)!;
      const chart = buildPineTv252SlotSeasonalCurve(
        result.bars,
        assetId,
        def.symbol,
        lookbackYears,
        def.backadjustmentStatus,
      );
      return NextResponse.json(chart, { status: 200 });
    }

    // ── Action: loadSeasonalityCache — read pre-computed Python cache ─────────
    // This is the FAST path: just reads a JSON file, no computation in Node.js
    if (action === "loadSeasonalityCache") {
      const assetId     = (body.assetId as string | undefined) ?? "wheat";
      const requested = Number(body.lookbackYears ?? 20);
      const lookbackYrs = Math.max(0, Math.min(requested, 30));

      // MAX (lookback<=0) means "use all available completed years".
      // There is no precomputed python cache file for this, so we force the client to fall back
      // to the compute endpoints which already support lookback<=0 via selectCompleteSampleYears.
      if (lookbackYrs <= 0) {
        return NextResponse.json({ error: "CACHE_DISABLED_FOR_MAX" }, { status: 404 });
      }
      const cacheFile   = path.join(
        workspaceRoot(),
        "workspace", "output", "seasonality", "cache",
        `${assetId}_${lookbackYrs}y_cache.json`,
      );
      try {
        const raw = await fs.readFile(cacheFile, "utf-8");
        const parsed = JSON.parse(raw);
        const liveSource = await loadBarsForAsset(assetId);
        if ("error" in liveSource) return NextResponse.json({ error: liveSource.error }, { status: liveSource.status });
        if (!isCurrentMetricCache(parsed, assetId, lookbackYrs, liveSource.fp)) {
          return NextResponse.json(
            {
              error: "CACHE_STALE",
              cacheFile,
              assetId,
              lookbackYears: lookbackYrs,
              expectedCalculationVersion: SEASONALITY_CALCULATION_VERSION,
              expectedSourceFingerprint: liveSource.fp,
            },
            { status: 409 },
          );
        }
        return new NextResponse(JSON.stringify(parsed), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // Workspace cache not found — fall back to pre-generated static file (works on Vercel)
        try {
          const staticFile = path.join(
            process.cwd(),
            "public", "generated", "seasonality",
            `${assetId}_${lookbackYrs}y_cache.json`,
          );
          const staticRaw = await fs.readFile(staticFile, "utf-8");
          const staticParsed = JSON.parse(staticRaw);
          if (staticParsed._source === "static_generated") {
            return new NextResponse(JSON.stringify(staticParsed), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        } catch {
          // Static file also not found
        }
        return NextResponse.json(
          { error: "CACHE_NOT_FOUND", cacheFile, hint: "Run: node scripts/generate-seasonality-cache.mjs" },
          { status: 404 },
        );
      }
    }

    // ── Action: loadTenDayProbability — dashboard metric ──────────────────────
    if (action === "loadTenDayProbability") {
      const assetId = (body.assetId as string | undefined) ?? "wheat";
      const lookbackYears = Math.max(0, Math.min(Number(body.lookbackYears ?? 20), 30));
      const result = await loadBarsForAsset(assetId);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      const prob = buildTenDayProbability(result.bars, assetId, lookbackYears);
      return NextResponse.json(prob, { status: 200 });
    }

    // ── Action: loadWinrateProb — best-holding winrate probability ─────────────
    if (action === "loadWinrateProb") {
      const assetId = (body.assetId as string | undefined) ?? "wheat";
      const lookbackYears = Math.max(0, Math.min(Number(body.lookbackYears ?? 20), 30));
      const result = await loadBarsForAsset(assetId);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      const prob = buildBestHoldingProbability(result.bars, assetId, lookbackYears);
      return NextResponse.json(prob, { status: 200 });
    }

    // ── Action: loadPatternData — best setups for all slots ───────────────────
    if (action === "loadPatternData") {
      const assetId = (body.assetId as string | undefined) ?? "wheat";
      const lookbackYears = Math.max(0, Math.min(Number(body.lookbackYears ?? 20), 30));
      const result = await loadBarsForAsset(assetId);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      const data = buildPatternData(
        result.bars,
        assetId,
        lookbackYears,
        result.fp,
        result.monitoringSymbol,
        result.sourcePathOrProviderSymbol,
      );
      return NextResponse.json(data, { status: 200 });
    }

    // ── Action: fixedPatternBacktest — apply locked pattern to 2006-2025 ────────
    if (action === "fixedPatternBacktest") {
      const assetId   = (body.assetId as string | undefined) ?? "wheat";
      const direction = (body.direction as PatternDirection | undefined) ?? "LONG";
      const startSlot = Math.max(1, Math.min(252, Number(body.startSlot ?? 1)));
      const holdingDays = Math.max(5, Math.min(60, Number(body.holdingDays ?? 10))) as PatternHolding;
      const lookbackYears = Math.max(0, Math.min(30, Number(body.lookbackYears ?? 20)));

      const loadResult = await loadBarsForAsset(assetId);
      if ("error" in loadResult) return NextResponse.json({ error: loadResult.error }, { status: loadResult.status });

      const def = getAssetDef(assetId)!;
      const result = runFixedPatternBacktest(
        loadResult.bars, assetId, direction, startSlot, holdingDays as PatternHolding,
        lookbackYears, def.backadjustmentStatus, loadResult.sourcePathOrProviderSymbol, loadResult.fp, loadResult.monitoringSymbol,
      );
      return NextResponse.json(result, { status: 200 });
    }

    if (action === "loadPatternFamilyCache") {
      const assetId   = (body.assetId as string | undefined) ?? "wheat";
      const direction = (body.direction as PatternDirection | undefined) ?? "LONG";
      const startSlot = Math.max(1, Math.min(252, Number(body.startSlot ?? 1)));
      const baselineHoldingDays = body.baselineHoldingDays == null
        ? null
        : Math.max(5, Math.min(60, Number(body.baselineHoldingDays ?? 10))) as PatternHolding;
      const initialTrainingYears = Math.max(5, Math.min(20, Number(body.initialTrainingYears ?? 10)));
      const oosBlockYears        = Math.max(1, Math.min(3, Number(body.oosBlockYears ?? 2)));

      const loadResult = await loadBarsForAsset(assetId);
      if ("error" in loadResult) return NextResponse.json({ error: loadResult.error }, { status: loadResult.status });

      const cacheKey = buildStrictWfCacheKey({
        assetId,
        direction,
        startSlot,
        baselineHoldingDays,
        initialTrainingYears,
        oosBlockYears,
        sourceFingerprint: loadResult.fp,
      });
      const cached = await loadStrictWfCache(cacheKey);
      return NextResponse.json({ cacheKey, cached }, { status: 200 });
    }

    // ── Action: patternFamilyWalkForward — strict OOS for pattern family ─────────
    if (action === "patternFamilyWalkForward") {
      const assetId   = (body.assetId as string | undefined) ?? "wheat";
      const direction = (body.direction as PatternDirection | undefined) ?? "LONG";
      const startSlot = Math.max(1, Math.min(252, Number(body.startSlot ?? 1)));
      const initialTrainingYears = Math.max(5, Math.min(20, Number(body.initialTrainingYears ?? 10)));
      const oosBlockYears        = Math.max(1, Math.min(3,  Number(body.oosBlockYears ?? 2)));
      const baselineHoldingDays = body.baselineHoldingDays == null
        ? null
        : Math.max(5, Math.min(60, Number(body.baselineHoldingDays ?? 10))) as PatternHolding;

      const loadResult = await loadBarsForAsset(assetId);
      if ("error" in loadResult) return NextResponse.json({ error: loadResult.error }, { status: loadResult.status });

      const cacheKey = buildStrictWfCacheKey({
        assetId,
        direction,
        startSlot,
        baselineHoldingDays,
        initialTrainingYears,
        oosBlockYears,
        sourceFingerprint: loadResult.fp,
      });
      const cached = await loadStrictWfCache(cacheKey);
      if (cached) return NextResponse.json(cached, { status: 200 });

      const result = runPatternFamilyWalkForward(
        loadResult.bars,
        assetId,
        direction,
        startSlot,
        initialTrainingYears,
        oosBlockYears,
        baselineHoldingDays,
        {
          monitoringSymbol: loadResult.monitoringSymbol,
          sourceType: loadResult.sourceType,
          sourcePathOrProviderSymbol: loadResult.sourcePathOrProviderSymbol,
          sourceFingerprint: loadResult.fp,
        },
      );
      await writeStrictWfCache(cacheKey, result as unknown as Record<string, unknown>);
      return NextResponse.json(result, { status: 200 });
    }

    // ── Action: loadSeasonalChartLegacy — old daily-returns formula ────────────
    if (action === "loadSeasonalChartLegacy") {
      const assetId = (body.assetId as string | undefined) ?? "wheat";
      const lookbackYears = Math.max(0, Math.min(Number(body.lookbackYears ?? 20), 30));
      const result = await loadBarsForAsset(assetId);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      const def = getAssetDef(assetId)!;
      const chart = buildDailySeasonalCurve(result.bars, assetId, def.symbol, lookbackYears, def.backadjustmentStatus);
      return NextResponse.json(chart, { status: 200 });
    }

    // ── Action: loadCachedResult ───────────────────────────────────────────────
    if (action === "loadCachedResult") {
      const assetId = (body.assetId as string | undefined) ?? "wheat";
      const fp = cachedResultPath(assetId);
      try {
        const raw = await fs.readFile(fp, "utf-8");
        const parsed = JSON.parse(raw) as WalkForwardResult;
        return NextResponse.json({ cached: parsed }, { status: 200 });
      } catch {
        return NextResponse.json({ cached: null }, { status: 200 });
      }
    }

    // ── Action: saveCachedResult ───────────────────────────────────────────────
    if (action === "saveCachedResult") {
      const assetId = (body.assetId as string | undefined) ?? "wheat";
      const result = body.result as WalkForwardResult | undefined;
      if (!result) return NextResponse.json({ error: "Missing result" }, { status: 400 });
      await writeCachedResult(assetId, result);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // ── Action: listSavedPatterns ──────────────────────────────────────────────
    if (action === "listSavedPatterns") {
      const assetId = (body.assetId as string | undefined) ?? "wheat";
      const dir = savedPatternsDir(assetId);
      try {
        const files = await fs.readdir(dir);
        const patterns: SavedSeasonalPattern[] = [];
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          try {
            const raw = await fs.readFile(path.join(dir, file), "utf-8");
            patterns.push(JSON.parse(raw) as SavedSeasonalPattern);
          } catch {
            // skip corrupted pattern files
          }
        }
        patterns.sort((a, b) => (b.savedAt > a.savedAt ? 1 : -1));
        return NextResponse.json({ patterns }, { status: 200 });
      } catch {
        return NextResponse.json({ patterns: [] }, { status: 200 });
      }
    }

    // ── Action: savePattern ────────────────────────────────────────────────────
    if (action === "savePattern") {
      const pattern = body.pattern as SavedSeasonalPattern | undefined;
      if (!pattern?.patternId || !pattern?.assetId) {
        return NextResponse.json({ error: "Missing pattern.patternId or pattern.assetId" }, { status: 400 });
      }
      const dir = savedPatternsDir(pattern.assetId);
      await fs.mkdir(dir, { recursive: true });
      const fp = path.join(dir, `${pattern.patternId}.json`);
      await fs.writeFile(fp, JSON.stringify(pattern, null, 2), "utf-8");
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // ── Action: deleteSavedPattern ─────────────────────────────────────────────
    if (action === "deleteSavedPattern") {
      const assetId = (body.assetId as string | undefined) ?? "wheat";
      const patternId = (body.patternId as string | undefined) ?? "";
      if (!patternId.trim()) {
        return NextResponse.json({ error: "Missing patternId" }, { status: 400 });
      }
      const fp = path.join(savedPatternsDir(assetId), `${patternId}.json`);
      try {
        await fs.unlink(fp);
      } catch {
        // no-op if already absent
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // ── Action: runAnchoredExperiment ──────────────────────────────────────────
    if (action === "runAgricultureSavedPatternsValidation") {
      const report = await runAgricultureSavedPatternsValidation();
      return NextResponse.json(report, { status: 200 });
    }

    if (action === "runAnchoredExperiment") {
      const assetId = (body.assetId as string | undefined) ?? "wheat";
      const result = await loadBarsForAsset(assetId);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

      const def = getAssetDef(assetId)!;
      const experimentId = `${assetId}_anchored_${Date.now()}`;
      const config: AnchoredExpandingConfig = {
        assetId,
        anchorYear: Math.max(2007, Math.min(Number(body.anchorYear ?? 2007), 2020)),
        oosBlockYears: Math.max(1, Math.min(Number(body.oosBlockYears ?? 2), 5)),
        minInitialTrainYears: Math.max(3, Math.min(Number(body.minInitialTrainYears ?? 5), 15)),
        holdingDaysMin: Math.max(1, Math.min(Number(body.holdingDaysMin ?? 5), 252)),
        holdingDaysMax: Math.max(1, Math.min(Number(body.holdingDaysMax ?? 20), 252)),
        directions: Array.isArray(body.directions) ? body.directions : ["LONG", "SHORT"],
        transactionCostBps: Math.max(0, Math.min(Number(body.transactionCostBps ?? 0), 500)),
      };

      const experiment = runAnchoredExpandingWalkForward(result.bars, result.fp, config, experimentId);
      (experiment.asset as { assetId: string; displayName: string; symbol: string }) = {
        assetId,
        displayName: def.displayName,
        symbol: def.symbol,
      };
      return NextResponse.json(experiment, { status: 200 });
    }

    // ── Action: listAssets ─────────────────────────────────────────────────────
    if (action === "listAssets") {
      return NextResponse.json({ assets: SEASONAL_CSV_ASSETS }, { status: 200 });
    }

    // ── Action: runV1WalkForward (legacy default) — auto-saves result to cache ─
    if (action === "runV1WalkForward" || !action) {
      const config: WalkForwardConfig = {
        ...DEFAULT_CONFIG,
        assetId: (body.assetId as string | undefined) ?? DEFAULT_CONFIG.assetId,
        holdingDaysMin: Math.max(1, Math.min(Number(body.holdingDaysMin ?? DEFAULT_CONFIG.holdingDaysMin), 252)),
        holdingDaysMax: Math.max(1, Math.min(Number(body.holdingDaysMax ?? DEFAULT_CONFIG.holdingDaysMax), 252)),
        trainingYears: Math.max(3, Math.min(Number(body.trainingYears ?? DEFAULT_CONFIG.trainingYears), 20)),
        testYears: 1,
        transactionCostBps: Math.max(0, Math.min(Number(body.transactionCostBps ?? DEFAULT_CONFIG.transactionCostBps), 500)),
      };
      const loadResult = await loadBarsForAsset(config.assetId);
      if ("error" in loadResult) return NextResponse.json({ error: loadResult.error }, { status: loadResult.status });

      const today = new Date().toISOString().slice(0, 10);
      const wfResult = runWalkForward(loadResult.bars, loadResult.sourcePathOrProviderSymbol, config, today, {
        assetId: loadResult.assetId,
        displayName: loadResult.displayName,
        symbol: loadResult.symbol,
        monitoringSymbol: loadResult.monitoringSymbol,
        sourceType: loadResult.sourceType,
        sourcePathOrProviderSymbol: loadResult.sourcePathOrProviderSymbol,
        sourceFingerprint: loadResult.fp,
      });

      // Auto-save to cache so future page loads can show result without re-running
      writeCachedResult(config.assetId, wfResult).catch(() => { /* non-fatal */ });

      return NextResponse.json(wfResult, { status: 200 });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      info: "Walk-Forward Seasonal Grid Test — Historical CSV Research Only",
      note: "POST with action: loadSeasonalChart | loadCachedResult | saveCachedResult | listSavedPatterns | savePattern | loadPatternFamilyCache | patternFamilyWalkForward | runAgricultureSavedPatternsValidation | runAnchoredExperiment | listAssets | runV1WalkForward",
      actions: {
        loadSeasonalChart: "{ action, assetId, lookbackYears }",
        loadCachedResult: "{ action, assetId }",
        saveCachedResult: "{ action, assetId, result: WalkForwardResult }",
        listSavedPatterns: "{ action, assetId }",
        savePattern: "{ action, pattern: SavedSeasonalPattern }",
        deleteSavedPattern: "{ action, assetId, patternId }",
        loadPatternFamilyCache: "{ action, assetId, direction, startSlot, baselineHoldingDays, initialTrainingYears, oosBlockYears }",
        patternFamilyWalkForward: "{ action, assetId, direction, startSlot, baselineHoldingDays, initialTrainingYears, oosBlockYears }",
        runAgricultureSavedPatternsValidation: "{ action }",
        runAnchoredExperiment: "{ action, assetId, anchorYear, oosBlockYears, minInitialTrainYears, holdingDaysMin, holdingDaysMax, directions, transactionCostBps }",
        listAssets: "{ action }",
        runV1WalkForward: "{ action?, ...WalkForwardConfig }",
      },
      availableAssets: SEASONAL_CSV_ASSETS.map((a) => ({ assetId: a.assetId, symbol: a.symbol, displayName: a.displayName })),
    },
    { status: 200 },
  );
}
