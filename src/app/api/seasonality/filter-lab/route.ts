/**
 * Seasonal Filter Lab API Route
 *
 * Analyzes existing TradingView strategy exports by applying leakage-free
 * seasonal filters derived from fold-level IS-only pattern discovery.
 *
 * The critical leakage-free guarantee:
 *   For each OOS fold, patterns are selected using ONLY in-sample data
 *   (years before the OOS start). These frozen patterns are then used to
 *   classify and filter existing strategy trades in the OOS period.
 *   No future seasonal information is used to filter any historical trade.
 *
 * MVP: Wheat (ZW1!) — "Macro Valuation Alpha" TradingView export
 */

import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

import { parseDailyBarsCsv } from "@/lib/seasonality/walkForward/csvDataLoader";
import { buildYearSlotLookup, getPatternTradeForYear } from "@/lib/seasonality/barLevelRisk";
import type { DailyBar } from "@/lib/seasonality/walkForward/types";

import {
  STUDY_START, STUDY_END, IT,
  buildCloseMap, computeFoldSignals, classifyTrade, bootstrapCI,
  bootstrapFullMetrics, bootstrapPairedDelta, computeDSR, assessPBOFeasibility,
  assessFilterSampleSufficiency, FILTER_MIN_RETAINED_TRADES,
  computePreEntryDirectionalMove, computeISPreEntryThresholds,
  PRE_ENTRY_FILTER_VERSION, PRE_ENTRY_LOOKBACK_DAYS,
  slotLabel,
} from "@/lib/seasonality/strategyEngine/isDiscovery";
// buildYearSlotLookup and getPatternTradeForYear imported from barLevelRisk above
import {
  parseTvStrategyCsv, detectAssetFromFilename,
} from "@/lib/seasonality/strategyEngine/parseTvStrategyCsv";

// ── Agriculture asset registry (shared with strategy-engine route) ─────────────
const AGRI_REGISTRY: Record<string, { csv: string; symbol: string; name: string }> = {
  soybeans:    { csv: "CBOT_ZS1_TV_MERGED_FULL_HISTORY_daily.csv",  symbol: "ZS1!", name: "Soybeans"     },
  wheat:       { csv: "CBOT_ZW1_TV_MERGED_FULL_HISTORY_daily.csv",  symbol: "ZW1!", name: "Wheat"        },
  corn:        { csv: "CBOT_ZC1_TV_MERGED_FULL_HISTORY_daily.csv",  symbol: "ZC1!", name: "Corn"         },
  cocoa:       { csv: "ICEUS_CC1_TV_MERGED_FULL_HISTORY_daily.csv", symbol: "CC1!", name: "Cocoa"        },
  coffee:      { csv: "ICEUS_KC1_TV_MERGED_FULL_HISTORY_daily.csv", symbol: "KC1!", name: "Coffee"       },
  sugar:       { csv: "ICEUS_SB1_TV_MERGED_FULL_HISTORY_daily.csv", symbol: "SB1!", name: "Sugar"        },
  cotton:      { csv: "ICEUS_CT1_TV_MERGED_FULL_HISTORY_daily.csv", symbol: "CT1!", name: "Cotton"       },
  orangejuice: { csv: "ICEUS_OJ1_TV_MERGED_FULL_HISTORY_daily.csv", symbol: "OJ1!", name: "Orange Juice" },
};

const FILTER_POLICIES = ["BASELINE", "COUNTERTREND_VETO", "SAME_DIR_CONFIRM", "CONFIRM_AND_VETO", "TOP1_CONFIRM", "TOP3_CONFIRM", "SEASONAL_CONFIRM_AND_PRE_MOVE_VETO_P90"] as const;
type FilterPolicy = typeof FILTER_POLICIES[number];

function csvDataDir(): string {
  return path.join(process.cwd(), "..", "workspace", "output", "tradingview_data_test", "full_history_validated");
}
function capitalifeCsvDir(): string {
  return path.join(process.cwd(), "..", "capitalife_portfolio");
}

// ── Load asset bars ───────────────────────────────────────────────────────────
async function loadBars(assetId: string): Promise<DailyBar[] | null> {
  const entry = AGRI_REGISTRY[assetId];
  if (!entry) return null;
  try {
    const content = await fs.readFile(path.join(csvDataDir(), entry.csv), "utf8");
    return parseDailyBarsCsv(content) as DailyBar[];
  } catch { return null; }
}

// ── Discover available strategies ─────────────────────────────────────────────
async function discoverStrategies(): Promise<unknown[]> {
  const dir = capitalifeCsvDir();
  let files: string[];
  try { files = await fs.readdir(dir); }
  catch { return []; }

  const csvFiles = files.filter(f => f.toLowerCase().endsWith(".csv"));
  return csvFiles.map(f => ({
    file: f,
    label: f.replace(/\.csv$/i, "").replace(/_/g, " ").replace(/\s+/g, " "),
    detectedAsset: detectAssetFromFilename(f),
    path: path.join(dir, f),
  }));
}

// ── Filter policy application ─────────────────────────────────────────────────
type TradeDecision = {
  tradeNum: number;
  direction: "LONG" | "SHORT";
  entryDate: string;
  exitDate: string;
  netPnlPct: number;
  foldIdx: number | null;
  classification: string;
  matchedPatternLabel: string | null;
  keep: Record<FilterPolicy, boolean>;
};

function applyPolicy(
  classification: string,
  tradeDir: "LONG" | "SHORT",
  policy: FilterPolicy,
  topNFrozenPatterns: number,
): boolean {
  switch (policy) {
    case "BASELINE":
      return true;
    case "COUNTERTREND_VETO":
      return classification !== "CONFLICT";
    case "SAME_DIR_CONFIRM":
      return classification === "SUPPORT";
    case "CONFIRM_AND_VETO":
      return classification === "SUPPORT";
    case "TOP1_CONFIRM":
      // Only allow if a top-1 support pattern exists (approximated by classification)
      return classification === "SUPPORT" && topNFrozenPatterns >= 1;
    case "TOP3_CONFIRM":
      return classification === "SUPPORT";
    case "SEASONAL_CONFIRM_AND_PRE_MOVE_VETO_P90":
      // SUPPORT required AND pre-move NOT exhausted (checked separately via preExhausted flag)
      // The actual exhaustion check is done in the decisions loop, not here
      // This policy keeps SUPPORT trades; exhaustion veto applied post-classification
      return classification === "SUPPORT";
    default:
      return true;
  }
}

// ── Pre-move P90 exhaustion check for filter-lab ──────────────────────────────
// Returns true if the trade should be VETOED (pre-move is exhausted)
function computePreMoveExhaustionVeto(
  tradeEntryDate: string,
  closeMap: Map<number, Map<number,number>>,
  folds: Array<{ foldIdx: number; isYears: number[]; oosYears: number[]; frozenPatterns: Array<{ slot: number; holding: number; dir: "LONG"|"SHORT"; score: number; winRate: number; avgReturn: number; pf: number }> }>,
): boolean {
  const tradeYear = parseInt(tradeEntryDate.slice(0, 4));
  const fold = folds.find(f => f.oosYears.includes(tradeYear));
  if (!fold) return false;

  // For each frozen pattern, check if this trade's entry falls in pattern window AND is exhausted
  for (const pat of fold.frozenPatterns) {
    // Get approximate pattern entry slot date
    const patIsMap = new Map<number, Map<number,number>>();
    for (const yr of fold.isYears) { const m = closeMap.get(yr); if (m) patIsMap.set(yr, m); }

    // Compute IS P90 threshold for this pattern
    const thresh = computeISPreEntryThresholds(patIsMap, fold.isYears, pat.slot, pat.dir);
    if (thresh.p90 === null) continue;

    // Compute pre-move for this OOS year at pattern entry slot
    const preMove = computePreEntryDirectionalMove(closeMap, [...fold.isYears, tradeYear], tradeYear, pat.slot, pat.dir);
    if (!preMove) continue;

    if (preMove.directionalPreMove > thresh.p90) return true; // exhausted → veto
  }
  return false; // not exhausted
}

// ── Compute policy metrics ─────────────────────────────────────────────────────
// GATE 8: MaxDD and Calmar for Filter Lab are computed from the IMPORTED TRADE
// RETURN SEQUENCE (closed-trade equity), NOT from intrabar bar-level Base-Strategy
// equity. TV CSV only provides entry/exit P&L, not intraday bar path.
// Correct label: "Closed-Trade Equity MaxDD" / "Closed-Trade Equity Calmar"
const RISK_METHOD_NOTE =
  "Closed-trade equity risk: MaxDD and Calmar computed from sequential imported trade " +
  "returns (TV G&V netto % sequence), NOT from intrabar bar-level Base-Strategy equity. " +
  "Intrabar position paths of the original strategy are not available in the TV export.";

type PolicyResult = {
  policy: FilterPolicy;
  keptCount: number;
  filteredCount: number;
  winRate: number;
  avgReturnPct: number;
  profitFactor: number;
  compoundReturnPct: number;
  cagrPct: number;
  closedTradeEquityMaxDrawdownPct: number;  // Gate 8: renamed from maxDrawdownPct
  closedTradeEquityCalmar: number | null;   // Gate 8: renamed from calmar
  riskMethodNote: string;                   // Gate 8: explicit risk labeling
  tradingYears: number;
  bootstrap: {
    median: number; p5: number; p95: number; probPositive: number;
    deltaVsBaselineP5?: number; deltaVsBaselineP95?: number;
    probBeatsBaseline?: number;
  };
  losersAvoided: number;
  winnersRemoved: number;
};

function computePolicyMetrics(
  decisions: TradeDecision[],
  policy: FilterPolicy,
  oosStartYear: number,
  oosEndYear: number,
): PolicyResult {
  const keptTrades = decisions.filter(d => d.keep[policy] && d.foldIdx !== null);
  const filteredTrades = decisions.filter(d => !d.keep[policy] && d.foldIdx !== null);

  const returns = keptTrades.map(d => d.netPnlPct);
  const n = returns.length;

  if (n === 0) {
    return {
      policy, keptCount: 0, filteredCount: filteredTrades.length,
      winRate: 0, avgReturnPct: 0, profitFactor: 0, compoundReturnPct: 0,
      cagrPct: 0, closedTradeEquityMaxDrawdownPct: 0, closedTradeEquityCalmar: null,
      riskMethodNote: RISK_METHOD_NOTE, tradingYears: 0,
      bootstrap: { median: 0, p5: 0, p95: 0, probPositive: 0 },
      losersAvoided: 0, winnersRemoved: 0,
    };
  }

  const wins = returns.filter(r=>r>0).length;
  const winRate = (wins/n)*100;
  const avgReturn = returns.reduce((s,r)=>s+r,0)/n;

  const gw = returns.filter(r=>r>0).reduce((s,r)=>s+r,0);
  const gl = Math.abs(returns.filter(r=>r<0).reduce((s,r)=>s+r,0));
  const pf = gl > 1e-9 ? gw/gl : (gw>0?99:0);

  // Compound return (sequential, 1 trade at a time)
  let eq = 1, peak = 1, maxDD = 0;
  for (const r of returns) {
    eq *= (1 + r/100);
    if (eq > peak) peak = eq;
    const dd = peak > 1e-9 ? (peak-eq)/peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  const compReturn = (eq-1)*100;
  const years = oosEndYear - oosStartYear + 1;
  const cagr = years > 0 ? (Math.pow(Math.max(eq,1e-9), 1/years)-1)*100 : 0;
  // Gate 8: label explicitly as closed-trade equity calmar, not bar-level
  const closedTradeCalmar = maxDD > 0.001 ? (cagr/100) / maxDD : null;

  // Loser/winner accounting vs baseline
  const baselineFilteredTrades = filteredTrades;
  const losersAvoided = baselineFilteredTrades.filter(d => d.netPnlPct < 0).length;
  const winnersRemoved = baselineFilteredTrades.filter(d => d.netPnlPct > 0).length;

  const bs = bootstrapCI(returns);

  return {
    policy,
    keptCount: n,
    filteredCount: filteredTrades.length,
    winRate: parseFloat(winRate.toFixed(1)),
    avgReturnPct: parseFloat(avgReturn.toFixed(3)),
    profitFactor: parseFloat(pf.toFixed(3)),
    compoundReturnPct: parseFloat(compReturn.toFixed(2)),
    cagrPct: parseFloat(cagr.toFixed(2)),
    closedTradeEquityMaxDrawdownPct: parseFloat((maxDD*100).toFixed(2)),
    closedTradeEquityCalmar: closedTradeCalmar != null ? parseFloat(closedTradeCalmar.toFixed(3)) : null,
    riskMethodNote: RISK_METHOD_NOTE,
    tradingYears: years,
    bootstrap: bs,
    losersAvoided,
    winnersRemoved,
  };
}

// ── Main analysis ─────────────────────────────────────────────────────────────
async function runFilterAnalysis(
  strategyFile: string,
  assetId: string,
): Promise<Record<string, unknown>> {
  const startMs = Date.now();

  // Security: basename only
  if (strategyFile.includes("/") || strategyFile.includes("\\") || strategyFile.includes("..")) {
    return { error: "Invalid strategy file path" };
  }

  const assetDef = AGRI_REGISTRY[assetId];
  if (!assetDef) return { error: `Unsupported asset: ${assetId}` };

  // 1. Load asset bars
  const bars = await loadBars(assetId);
  if (!bars) return { error: `Could not load bars for ${assetId}` };

  const filteredBars = bars.filter(b => {
    const y = parseInt(b.date.slice(0,4));
    return y >= STUDY_START && y <= STUDY_END;
  });

  const { map: closeMap, years: allYears } = buildCloseMap(filteredBars, STUDY_START, STUDY_END);

  // 2. Compute fold-level as-of seasonal signals (leakage-free)
  const folds = computeFoldSignals(closeMap, allYears);

  // 3. Build bar lookup for exact entry/exit date computation
  const oosStartYear = STUDY_START + IT;
  const oosBars = filteredBars.filter(b => parseInt(b.date.slice(0,4)) >= oosStartYear);
  const barLookup = buildYearSlotLookup(oosBars);

  // 4. Load and parse strategy CSV
  const csvPath = path.join(capitalifeCsvDir(), strategyFile);
  let csvText: string;
  try { csvText = await fs.readFile(csvPath, "utf8"); }
  catch { return { error: `Could not read strategy file: ${strategyFile}` }; }

  const parsed = parseTvStrategyCsv(csvText, strategyFile);

  // 5. Classify each trade
  const decisions: TradeDecision[] = [];
  const oosYearsInFolds = new Set(folds.flatMap(f => f.oosYears));

  for (const trade of parsed.trades) {
    const tradeYear = parseInt(trade.entryDate.slice(0,4));
    const inStudyWindow = oosYearsInFolds.has(tradeYear);

    const { classification, matchedPattern, foldIdx } = inStudyWindow
      ? classifyTrade(trade.entryDate, trade.direction, folds, barLookup)
      : { classification: "OUT_OF_WINDOW" as const, matchedPattern: null, foldIdx: null };

    // Top-N context: number of frozen patterns for this fold
    const fold = folds.find(f => f.foldIdx === foldIdx);
    const topNFrozen = fold?.frozenPatterns.length ?? 0;

    // Pre-move exhaustion check (for SEASONAL_CONFIRM_AND_PRE_MOVE_VETO_P90)
    // Only compute if classification === "SUPPORT" and in study window (expensive)
    const isPreMoveExhausted = (inStudyWindow && classification === "SUPPORT")
      ? computePreMoveExhaustionVeto(trade.entryDate, closeMap, folds)
      : false;

    const keep: Record<FilterPolicy, boolean> = {} as Record<FilterPolicy, boolean>;
    for (const p of FILTER_POLICIES) {
      const baseKeep = inStudyWindow
        ? applyPolicy(classification, trade.direction, p, topNFrozen)
        : false;
      // For the pre-move policy, additionally veto if exhausted
      keep[p] = (p === "SEASONAL_CONFIRM_AND_PRE_MOVE_VETO_P90" && isPreMoveExhausted)
        ? false
        : baseKeep;
    }

    const matchedPatternLabel = matchedPattern
      ? `${matchedPattern.pattern.dir} ${slotLabel(matchedPattern.pattern.slot)}–${slotLabel(matchedPattern.pattern.slot + matchedPattern.pattern.holding)} ${matchedPattern.pattern.holding}D`
      : null;

    decisions.push({
      tradeNum: trade.tradeNum,
      direction: trade.direction,
      entryDate: trade.entryDate,
      exitDate: trade.exitDate,
      netPnlPct: trade.netPnlPct,
      foldIdx,
      classification,
      matchedPatternLabel,
      keep,
    });
  }

  // 6. Compute metrics per policy
  const oosEndYear = STUDY_END;
  const perPolicy = FILTER_POLICIES.map(p =>
    computePolicyMetrics(decisions, p, oosStartYear, oosEndYear)
  );

  // 6b. Full-metrics bootstrap (10k resamples) + delta vs baseline for non-baseline policies
  const inWindowDecisions = decisions.filter(d => d.foldIdx !== null);
  const allBaselineReturns = inWindowDecisions.map(d => d.netPnlPct);
  const tradingYears = oosEndYear - oosStartYear + 1;

  const bootstrapResults: Record<string, unknown> = {};
  for (const p of FILTER_POLICIES) {
    const keepMask = inWindowDecisions.map(d => d.keep[p]);
    const keptReturns = inWindowDecisions.filter(d => d.keep[p]).map(d => d.netPnlPct);

    bootstrapResults[p] = {
      fullMetrics: bootstrapFullMetrics(keptReturns, tradingYears, 10000, 42),
      delta: p !== "BASELINE"
        ? bootstrapPairedDelta(allBaselineReturns, keepMask, tradingYears, p, 10000, 42)
        : null,
    };
  }

  // 6c. Deflated Sharpe Ratio for key policies
  const dsrResults: Record<string, unknown> = {};
  for (const p of ["BASELINE", "SAME_DIR_CONFIRM", "COUNTERTREND_VETO"] as const) {
    const keptReturns = inWindowDecisions.filter(d => d.keep[p]).map(d => d.netPnlPct / 100);
    // trialCount = policies tested (6) * candidate universe (per fold ~30-50)
    const trialCount = 6 * 40; // approximate
    dsrResults[p] = computeDSR(keptReturns, trialCount, `${assetId}_${p}`);
  }

  // 6d. PBO feasibility
  const pboAssessment = assessPBOFeasibility(folds.length);

  // 6e. Per-policy filter research status (Gate 10: sample sufficiency + approval status)
  const filterResearchStatus: Record<string, unknown> = {};
  for (const p of FILTER_POLICIES) {
    const keptCount = inWindowDecisions.filter(d => d.keep[p]).length;
    // Count folds with at least 1 retained trade
    const foldsWithTrades = folds.filter(f =>
      inWindowDecisions.some(d => d.keep[p] && d.foldIdx === f.foldIdx)
    ).length;
    const sampleSuff = assessFilterSampleSufficiency(keptCount, foldsWithTrades);
    const dsrEntry = dsrResults[p as keyof typeof dsrResults] as { isStrategyStat?: boolean } | undefined;
    const dsrFailed = dsrEntry && dsrEntry.isStrategyStat === false;

    let approvalStatus: string;
    if (p === "BASELINE") {
      approvalStatus = "baseline_reference";
    } else if (!sampleSuff.passed) {
      approvalStatus = keptCount < 10
        ? "hypothesis_candidate_insufficient_sample"
        : "hypothesis_candidate_small_sample";
    } else if (dsrFailed) {
      approvalStatus = "statistics_incomplete_with_known_failure";
    } else {
      approvalStatus = "statistics_pending";
    }

    filterResearchStatus[p] = {
      retainedTrades: keptCount,
      outerFoldBlocksWithTrades: foldsWithTrades,
      sampleSufficiency: sampleSuff,
      multiplePolicyTestingNote: `${FILTER_POLICIES.length} policies tested on same ${inWindowDecisions.length} OOS trades — multiple testing not corrected.`,
      approvalStatus,
    };
  }

  // 7. Fold audit
  const foldAudit = folds.map(f => ({
    foldIdx: f.foldIdx,
    isYears: [f.isYears[0], f.isYears[f.isYears.length-1]],
    oosYears: f.oosYears,
    frozenPatternCount: f.frozenPatterns.length,
    frozenPatterns: f.frozenPatterns.map(p => ({
      dir: p.dir,
      slot: p.slot,
      holding: p.holding,
      label: `${slotLabel(p.slot)}–${slotLabel(p.slot + p.holding)} ${p.holding}D`,
      isWR: parseFloat(p.winRate.toFixed(1)),
    })),
  }));

  // 8. Trade summary
  const inWindowTrades = decisions.filter(d => d.foldIdx !== null);
  const outWindowTrades = decisions.filter(d => d.foldIdx === null);

  const dur = Date.now() - startMs;

  return {
    filterLabVersion: "filter_lab_phase_1_v1",
    assetId,
    assetName: assetDef.name,
    assetSymbol: assetDef.symbol,
    strategyFile,
    strategyName: parsed.strategyName,
    studyRange: { start: STUDY_START, end: STUDY_END },
    oosRange: { start: oosStartYear, end: oosEndYear },
    totalTrades: parsed.totalTrades,
    tradesInOosWindow: inWindowTrades.length,
    tradesOutOfWindow: outWindowTrades.length,
    foldCount: folds.length,
    leakageFreeGuarantee: {
      method: "fold_level_IS_only_pattern_discovery",
      outerWalkForward: `IT=${IT} OOS=2 anchored-expanding`,
      frozenBeforeOos: true,
      noFutureSeasonalInfo: true,
    },
    foldAudit,
    perPolicy,
    bootstrapFullResults: bootstrapResults,
    dsrResults,
    pboAssessment,
    filterResearchStatus,
    minimumRetainedTradesForStatisticsReview: FILTER_MIN_RETAINED_TRADES,
    perTrade: decisions.map(d => ({
      tradeNum: d.tradeNum,
      direction: d.direction,
      entryDate: d.entryDate,
      exitDate: d.exitDate,
      netPnlPct: d.netPnlPct,
      foldIdx: d.foldIdx,
      classification: d.classification,
      matchedPatternLabel: d.matchedPatternLabel,
      keepBaseline: d.keep.BASELINE,
      keepVeto: d.keep.COUNTERTREND_VETO,
      keepConfirm: d.keep.SAME_DIR_CONFIRM,
      keepTop3: d.keep.TOP3_CONFIRM,
    })),
    statisticalRobustness: {
      bootstrapResample: 10000,
      bootstrapSeed: 42,
      note: "Bootstrap 10k resamples with paired delta vs baseline. DSR analytical approximation. PBO/CSCV feasibility assessed. NOT a significance test. Multiple policies tested — statistical review pending (Phase D).",
      status: "statistics_pending",
    },
    runDurationMs: dur,
    auditMetadata: {
      runTimestampUtc: new Date().toISOString(),
      strategyFile,
      strategyFirstDate: parsed.firstTradeDate,
      strategyLastDate: parsed.lastTradeDate,
      runDurationMs: dur,
    },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { action?: string; strategyFile?: string; assetId?: string };

    if (body.action === "discoverStrategies") {
      const strategies = await discoverStrategies();
      return NextResponse.json({ strategies }, { status: 200 });
    }

    if (body.action === "runAnalysis") {
      const strategyFile = body.strategyFile ?? "";
      const assetId = (body.assetId ?? "wheat").toLowerCase();
      if (!strategyFile) return NextResponse.json({ error: "strategyFile required" }, { status: 400 });
      const result = await runFilterAnalysis(strategyFile, assetId);
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[filter-lab]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
