/**
 * Strategy Engine API Route — Agriculture Phase 1
 * - All 8 agriculture assets (ZS, ZW, ZC, CC, KC, SB, CT, OJ)
 * - Per-asset: Strict WF pattern validation + fold-level IS-selection OOS portfolio
 * - Bar-level mark-to-market portfolio equity (real MaxDD and Calmar)
 * - Agriculture Group Portfolio (fold-frozen, leakage-free OOS)
 *
 * GATE B: Soybeans bar-level OOS portfolio (fold-level selection, no full-sample backtest)
 * GATE C: All 8 agriculture assets + group portfolio
 */

import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

import { runPatternFamilyWalkForward } from "@/lib/seasonality/patternFamilyWalkForward";
import { parseDailyBarsCsv } from "@/lib/seasonality/walkForward/csvDataLoader";
import { buildYearSlotLookup, getPatternTradeForYear } from "@/lib/seasonality/barLevelRisk";
import type { DailyBar } from "@/lib/seasonality/walkForward/types";
import {
  assessISAssetEligibility, bootstrapFullMetrics, computeDSR, assessPBOFeasibility,
  computeCandidateOosReturnMatrix, computeRealityCheck, computeCSCV, determineResearchApprovalStatus,
  buildDsrResultTypeAudit, REALITY_CHECK_FORMALIZATION_STATUS,
  runPreEntryExhaustionFilter, PRE_ENTRY_FILTER_VERSION,
  computePreEntryDirectionalMove, computeISPreEntryThresholds, PRE_ENTRY_LOOKBACK_DAYS,
  type AgricultureEligibilityPolicy,
} from "@/lib/seasonality/strategyEngine/isDiscovery";

// ── Version constants ─────────────────────────────────────────────────────────
const ENGINE_VERSION          = "agriculture_phase_1_asset_and_group_oos_v1";
const PORTFOLIO_RISK_VERSION  = "bar_level_oos_portfolio_equity_v1";
const OVERLAP_POLICY_VERSION  = "same_asset_no_overlap_group_max4_v1";
const GROUP_RISK_VERSION      = "agriculture_bar_level_oos_equal_risk_v1";

// ── Agriculture asset registry ────────────────────────────────────────────────
const AGRI_REGISTRY: Record<string, { csv: string; symbol: string; name: string; short: string }> = {
  soybeans:    { csv: "CBOT_ZS1_TV_MERGED_FULL_HISTORY_daily.csv",  symbol: "ZS1!", name: "Soybeans",     short: "ZS" },
  wheat:       { csv: "CBOT_ZW1_TV_MERGED_FULL_HISTORY_daily.csv",  symbol: "ZW1!", name: "Wheat",        short: "ZW" },
  corn:        { csv: "CBOT_ZC1_TV_MERGED_FULL_HISTORY_daily.csv",  symbol: "ZC1!", name: "Corn",         short: "ZC" },
  cocoa:       { csv: "ICEUS_CC1_TV_MERGED_FULL_HISTORY_daily.csv", symbol: "CC1!", name: "Cocoa",        short: "CC" },
  coffee:      { csv: "ICEUS_KC1_TV_MERGED_FULL_HISTORY_daily.csv", symbol: "KC1!", name: "Coffee",       short: "KC" },
  sugar:       { csv: "ICEUS_SB1_TV_MERGED_FULL_HISTORY_daily.csv", symbol: "SB1!", name: "Sugar",        short: "SB" },
  cotton:      { csv: "ICEUS_CT1_TV_MERGED_FULL_HISTORY_daily.csv", symbol: "CT1!", name: "Cotton",       short: "CT" },
  orangejuice: { csv: "ICEUS_OJ1_TV_MERGED_FULL_HISTORY_daily.csv", symbol: "OJ1!", name: "Orange Juice", short: "OJ" },
};

// ── WF / engine constants ─────────────────────────────────────────────────────
const HOLD_CANDS  = [10, 12, 14, 16, 18, 20] as const;
const MAX_SLOT    = 232;
const STEP        = 2;
const MAX_PAT     = 6;
const IT          = 10;   // initial training years
const OOS         = 2;    // OOS block years
const STUDY_START = 2000;
const STUDY_END   = 2025; // Gate A confirmed: all 8 CSVs have bars through 2026-05-15 → 2025 is complete

const MONTH_SLOT: Record<number, number> = {
  1:1, 2:21, 3:40, 4:62, 5:83, 6:104, 7:125, 8:147, 9:169, 10:189, 11:211, 12:232
};
const MONTH_DE = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function slotLabel(slot: number): string {
  const entries = Object.entries(MONTH_SLOT).map(([m,s])=>({m:+m,s:+s})).sort((a,b)=>a.s-b.s);
  let mi = 0;
  for (let i = 0; i < entries.length - 1; i++) if (slot >= entries[i].s) mi = i;
  const { m, s } = entries[mi];
  const ns = entries[mi+1]?.s ?? s + 21;
  const cal = [31,28,31,30,31,30,31,31,30,31,30,31][m-1];
  const d = Math.max(1, Math.min(cal, Math.round(((slot-s)/(ns-s))*cal)+1));
  return `${String(d).padStart(2,"0")} ${MONTH_DE[m-1]}`;
}

function windowsOverlap(s1: number, h1: number, s2: number, h2: number): boolean {
  return s1 < s2 + h2 && s2 < s1 + h1;
}

function csvDir(): string {
  return path.join(process.cwd(), "..", "workspace", "output", "tradingview_data_test", "full_history_validated");
}

// ── Asset loading ─────────────────────────────────────────────────────────────
async function loadAssetBars(assetId: string): Promise<{
  bars: DailyBar[]; fingerprint: string; csvPath: string;
} | null> {
  const entry = AGRI_REGISTRY[assetId];
  if (!entry) return null;
  const csvPath = path.join(csvDir(), entry.csv);
  try {
    const content = await fs.readFile(csvPath, "utf8");
    const fp = content.slice(0, 2000).split("").reduce((h,c) => ((h<<5)-h+c.charCodeAt(0))|0, 0).toString(16).slice(-12);
    const bars = parseDailyBarsCsv(content) as DailyBar[];
    return { bars, fingerprint: fp, csvPath };
  } catch {
    return null;
  }
}

// ── Close-map (for pre-filter metrics) ────────────────────────────────────────
function buildCloseMap(
  bars: DailyBar[], start: number, end: number,
): { map: Map<number, Map<number,number>>; years: number[] } {
  const sorted = [...bars].sort((a,b) => a.date.localeCompare(b.date));
  const map = new Map<number, Map<number,number>>();
  let slot = 0, prevYear = -1;
  for (const bar of sorted) {
    const year = parseInt(bar.date.slice(0,4));
    if (year < start || year > end) continue;
    if (year !== prevYear) { slot = 0; prevYear = year; }
    slot++;
    if (slot > 252) continue;
    if (!map.has(year)) map.set(year, new Map());
    map.get(year)!.set(slot, bar.close);
  }
  return { map, years: Array.from(map.keys()).sort((a,b)=>a-b) };
}

function preFilter(
  map: Map<number, Map<number,number>>, years: number[],
  slot: number, holding: number, dir: "LONG"|"SHORT",
): { winRate: number; avgReturn: number; pf: number } | null {
  const rets: number[] = [];
  for (const yr of years) {
    const ym = map.get(yr);
    const ep = ym?.get(slot), xp = ym?.get(slot + holding);
    if (!ep || !xp || ep <= 0) continue;
    const raw = xp / ep - 1;
    rets.push(dir === "LONG" ? raw : -raw);
  }
  if (rets.length < 5) return null;
  const n = rets.length;
  const wins = rets.filter(r=>r>0).length;
  const mean = rets.reduce((s,r)=>s+r,0)/n;
  const gw = rets.filter(r=>r>0).reduce((s,r)=>s+r,0);
  const gl = Math.abs(rets.filter(r=>r<0).reduce((s,r)=>s+r,0));
  const pf = gl > 1e-9 ? gw/gl : (gw>0 ? 99 : 0);
  return { winRate: wins/n*100, avgReturn: mean, pf };
}

// ── Non-overlapping greedy selection ─────────────────────────────────────────
type Cand = { slot: number; holding: number; dir: "LONG"|"SHORT"; score: number; winRate: number; avgReturn: number; pf: number };

function selectNonOverlapping(candidates: Cand[], maxN: number): { sel: Cand[]; rej: (Cand & { reason: string })[] } {
  const sorted = [...candidates].sort((a,b) => b.score - a.score);
  const sel: Cand[] = [], rej: (Cand & { reason: string })[] = [];
  for (const c of sorted) {
    if (sel.length >= maxN) { rej.push({...c, reason:"max_patterns_reached"}); continue; }
    const overlaps = sel.some(s => s.dir===c.dir && windowsOverlap(s.slot,s.holding,c.slot,c.holding));
    if (overlaps) rej.push({...c, reason:"overlapping_window_same_direction"});
    else sel.push(c);
  }
  return { sel, rej };
}

// ── Bar-level portfolio equity ─────────────────────────────────────────────────
type OosTrade = {
  tradeKey: string;
  dir: "LONG"|"SHORT";
  year: number;
  foldIdx: number;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  tradeReturn: number;
};

function buildBarLevelPortfolioEquity(
  oosTrades: OosTrade[],
  allBars: DailyBar[],
  oosStart: number,
  oosEnd: number,
): {
  equitySeries: Array<{year:number; equity:number}>;
  yearlyReturns: Array<{year:number; portfolioReturn:number; tradeCount:number}>;
  oosMaxDrawdown: number;
  oosCagr: number;
  oosCalmar: number|null;
  oosCompoundReturn: number;
  oosWinRate: number;
  oosProfitFactor: number;
  oosTradeCount: number;
  oosYears: number;
  positiveYears: number;
  worstYear: number|null;
  worstYearReturn: number|null;
  maxConcurrentPositions: number;
  exposureTimePct: number;
  riskVersion: string;
} | null {
  if (oosTrades.length === 0) return null;

  const oosBars = allBars
    .filter(b => { const y=parseInt(b.date.slice(0,4)); return y>=oosStart && y<=oosEnd; })
    .sort((a,b) => a.date.localeCompare(b.date));
  if (oosBars.length === 0) return null;

  // Per-trade prev-close state
  const prevCloseMap = new Map<string, number>();
  let equity = 1.0, peak = 1.0;
  let maxDD = 0;
  let barsWithActiveTrades = 0, maxConcurrent = 0;

  // Yearly equity tracking
  const yearEndEquity = new Map<number, number>();
  const yearStartEquity = new Map<number, number>();

  for (const bar of oosBars) {
    const yr = parseInt(bar.date.slice(0,4));
    if (!yearStartEquity.has(yr)) yearStartEquity.set(yr, equity);

    const activeTrades = oosTrades.filter(t => t.entryDate <= bar.date && t.exitDate >= bar.date);
    if (activeTrades.length > maxConcurrent) maxConcurrent = activeTrades.length;
    if (activeTrades.length > 0) barsWithActiveTrades++;

    let dailyRet = 0;
    const w = activeTrades.length > 0 ? 1.0 / activeTrades.length : 0;
    for (const t of activeTrades) {
      const prev = prevCloseMap.has(t.tradeKey) ? prevCloseMap.get(t.tradeKey)! : t.entryPrice;
      if (prev > 0) {
        const barRet = (bar.close - prev) / prev;
        dailyRet += w * barRet * (t.dir === "LONG" ? 1 : -1);
      }
      prevCloseMap.set(t.tradeKey, bar.close);
      // Remove closed trade
      if (bar.date >= t.exitDate) prevCloseMap.delete(t.tradeKey);
    }

    equity *= (1 + dailyRet);
    if (equity > peak) peak = equity;
    const dd = peak > 1e-9 ? (peak - equity) / peak : 0;
    if (dd > maxDD) maxDD = dd;

    yearEndEquity.set(yr, equity);
  }

  // Yearly returns from equity
  const allOosYears = Array.from(new Set(oosTrades.map(t => t.year))).sort((a,b)=>a-b);
  const yearlyReturns: Array<{year:number; portfolioReturn:number; tradeCount:number}> = [];
  for (const yr of allOosYears) {
    const startEq = yearStartEquity.get(yr) ?? 1;
    const endEq   = yearEndEquity.get(yr) ?? startEq;
    const ret = endEq / startEq - 1;
    const tc  = oosTrades.filter(t => t.year === yr).length;
    yearlyReturns.push({ year: yr, portfolioReturn: parseFloat(ret.toFixed(4)), tradeCount: tc });
  }

  // Equity series (yearly end-of-year equity)
  const equitySeries = allOosYears.map(yr => ({
    year: yr,
    equity: parseFloat(((yearEndEquity.get(yr) ?? 1) - 1) * 100 + ""),
  }));
  // Running cumulative for chart
  let runEq = 1;
  const equitySeriesChart = [];
  for (const yr of allOosYears) {
    const endEq = yearEndEquity.get(yr) ?? runEq;
    equitySeriesChart.push({ year: yr, equity: parseFloat(((endEq - 1) * 100).toFixed(2)) });
    runEq = endEq;
  }

  const finalEquity = equity - 1;
  const n = allOosYears.length;
  const cagr = n > 0 ? Math.pow(Math.max(equity, 1e-9), 1/n) - 1 : 0;
  const calmar = maxDD > 0.001 ? cagr / maxDD : null;

  const wins = oosTrades.filter(t=>t.tradeReturn>0).length;
  const winRate = oosTrades.length > 0 ? (wins/oosTrades.length)*100 : 0;
  const gw = oosTrades.filter(t=>t.tradeReturn>0).reduce((s,t)=>s+t.tradeReturn,0);
  const gl = Math.abs(oosTrades.filter(t=>t.tradeReturn<0).reduce((s,t)=>s+t.tradeReturn,0));
  const pf = gl > 1e-9 ? gw/gl : (gw>0 ? 99 : 0);

  const posYears = yearlyReturns.filter(y=>y.portfolioReturn>0).length;
  const worstYr  = yearlyReturns.length > 0 ? yearlyReturns.reduce((a,b)=>a.portfolioReturn<b.portfolioReturn?a:b) : null;

  const exposurePct = oosBars.length > 0 ? (barsWithActiveTrades / oosBars.length) * 100 : 0;

  return {
    equitySeries: equitySeriesChart,
    yearlyReturns,
    oosMaxDrawdown:     parseFloat((maxDD * 100).toFixed(2)),
    oosCagr:            parseFloat((cagr * 100).toFixed(2)),
    oosCalmar:          calmar != null ? parseFloat(calmar.toFixed(3)) : null,
    oosCompoundReturn:  parseFloat((finalEquity * 100).toFixed(2)),
    oosWinRate:         parseFloat(winRate.toFixed(1)),
    oosProfitFactor:    parseFloat(pf.toFixed(3)),
    oosTradeCount:      oosTrades.length,
    oosYears:           n,
    positiveYears:      posYears,
    worstYear:          worstYr?.year ?? null,
    worstYearReturn:    worstYr ? parseFloat((worstYr.portfolioReturn * 100).toFixed(2)) : null,
    maxConcurrentPositions: maxConcurrent,
    exposureTimePct:    parseFloat(exposurePct.toFixed(1)),
    riskVersion: PORTFOLIO_RISK_VERSION,
  };
}

// ── Fold-level IS-only portfolio simulation ────────────────────────────────────
function runFoldLevelPortfolio(
  allBars: DailyBar[],
  closeMap: Map<number, Map<number,number>>,
  allYears: number[],
): {
  portfolio: ReturnType<typeof buildBarLevelPortfolioEquity>;
  allOosTrades: OosTrade[];
  perFoldAudit: unknown[];
  oosFolds: number;
} {
  const lookup = buildYearSlotLookup(allBars);
  const oosTrades: OosTrade[] = [];
  const perFoldAudit: unknown[] = [];
  let foldIdx = 0;

  for (;;) {
    const oosStart = STUDY_START + IT + foldIdx * OOS;
    const isYears = allYears.filter(y => y < oosStart);
    const oosYears = allYears.filter(y => y >= oosStart && y < oosStart + OOS);

    if (isYears.length < IT || oosYears.length === 0) break;

    // IS close map
    const isMap = new Map<number, Map<number,number>>();
    for (const yr of isYears) { const m = closeMap.get(yr); if (m) isMap.set(yr, m); }

    // IS candidate generation
    const cands: Cand[] = [];
    for (let slot = 1; slot <= MAX_SLOT; slot += STEP) {
      for (const dir of ["LONG","SHORT"] as const) {
        for (const hd of HOLD_CANDS) {
          const m = preFilter(isMap, isYears, slot, hd, dir);
          if (!m || m.winRate < 60 || m.avgReturn <= 0 || m.pf < 1.0) continue;
          const sc = m.winRate*100 + m.avgReturn*1000 + m.pf*10 - hd*0.1;
          cands.push({ slot, holding:hd, dir, score:sc, winRate:m.winRate, avgReturn:m.avgReturn, pf:m.pf });
        }
      }
    }

    const { sel: foldSel } = selectNonOverlapping(cands, MAX_PAT);
    const foldTrades: OosTrade[] = [];
    let overlapConflicts = 0;

    for (const pat of foldSel) {
      for (const oosYr of oosYears) {
        const { trade } = getPatternTradeForYear(
          lookup, oosYr, pat.slot,
          pat.holding as 10|12|14|16|18|20,
          pat.dir,
        );
        if (!trade) continue;

        // Check same-asset concurrent overlap
        const overlap = foldTrades.some(t =>
          t.year === oosYr &&
          t.entryDate < trade.exitDate &&
          trade.entryDate < t.exitDate
        );
        if (overlap) { overlapConflicts++; continue; }

        const tradeKey = `${pat.dir}_s${pat.slot}_h${pat.holding}_y${oosYr}_f${foldIdx}`;
        foldTrades.push({
          tradeKey,
          dir: pat.dir,
          year: oosYr,
          foldIdx,
          entryDate:  trade.entryDate,
          exitDate:   trade.exitDate,
          entryPrice: trade.entryPrice,
          exitPrice:  trade.exitPrice,
          tradeReturn: trade.strategyReturn,
        });
      }
    }

    oosTrades.push(...foldTrades);
    perFoldAudit.push({
      foldIdx,
      isYears: [isYears[0], isYears[isYears.length-1]],
      oosYears,
      isCandidateCount: cands.length,
      foldSelectedCount: foldSel.length,
      foldTradeCount: foldTrades.length,
      overlapConflicts,
      foldPatterns: foldSel.map(p => ({
        dir: p.dir, slot: p.slot, holding: p.holding,
        label: `${slotLabel(p.slot)} – ${slotLabel(p.slot + p.holding)}`,
        isWR: parseFloat(p.winRate.toFixed(1)),
      })),
    });

    foldIdx++;
  }

  const oosStart = STUDY_START + IT;
  const portfolio = buildBarLevelPortfolioEquity(oosTrades, allBars, oosStart, STUDY_END);

  return { portfolio, allOosTrades: oosTrades, perFoldAudit, oosFolds: foldIdx };
}

// ── Validated candidate type ──────────────────────────────────────────────────
type ValidatedCandidate = {
  direction: "LONG"|"SHORT";
  anchorSlot: number;
  holdingDays: number;
  windowLabel: string;
  fullSampleWR: number;
  oosWinRate: number;
  oosAvgReturn: number;
  oosProfitFactor: number;
  oosMaxDrawdown: number;
  qualityScore: number;
  qualityStatus: string;
  parameterStability: number;
  oosTrades: number;
  oosFolds: number;
  positiveFoldCount: number;
  positiveFoldRate: number;
  foldOosReturns: Array<{year:number; oosReturn:number; entrySlot:number; holdingDays:number}>;
};

// ── Full-engine per asset ──────────────────────────────────────────────────────
async function runEngineForAsset(assetId: string): Promise<Record<string, unknown>> {
  const assetDef = AGRI_REGISTRY[assetId];
  if (!assetDef) return { status:"unsupported_asset", assetId };

  const loaded = await loadAssetBars(assetId);
  if (!loaded) return { status:"csv_not_found", assetId, csv: assetDef.csv };

  const { bars, fingerprint, csvPath } = loaded;
  const startMs = Date.now();

  const filteredBars = bars.filter(b => {
    const y = parseInt(b.date.slice(0,4));
    return y >= STUDY_START && y <= STUDY_END;
  });

  const { map, years } = buildCloseMap(filteredBars, STUDY_START, STUDY_END);

  // Check adequate data
  if (years.length < IT + OOS) {
    return {
      status: "insufficient_data",
      assetId, availableYears: years.length, requiredYears: IT + OOS,
    };
  }

  // ── Phase 1: Pattern validation (Patterns tab) ──────────────────────────────
  // Discovery: family representatives per bin
  type Rep = { slot:number; holding:number; dir:"LONG"|"SHORT"; score:number };
  const longFams = new Map<number,Rep>(), shortFams = new Map<number,Rep>();
  let candUniverse = 0, preFiltered = 0, wfTested = 0;

  for (let slot = 1; slot <= MAX_SLOT; slot += STEP) {
    for (const dir of ["LONG","SHORT"] as const) {
      for (const hd of HOLD_CANDS) {
        candUniverse++;
        const m = preFilter(map, years, slot, hd, dir);
        if (!m || m.winRate < 60 || m.avgReturn <= 0 || m.pf < 0.8) continue;
        preFiltered++;
        const bin = Math.floor(slot / 8);
        const fam = dir === "LONG" ? longFams : shortFams;
        const sc = m.winRate*100 + m.avgReturn*1000 + m.pf*10 - hd*0.1;
        const prev = fam.get(bin);
        if (!prev || sc > prev.score) fam.set(bin, { slot, holding:hd, dir, score:sc });
      }
    }
  }

  const reps = [...Array.from(longFams.values()), ...Array.from(shortFams.values())];
  const validated: ValidatedCandidate[] = [];
  const allRejected: (ValidatedCandidate & { rejectionReason:string })[] = [];

  for (const rep of reps) {
    wfTested++;
    const fullM = preFilter(map, years, rep.slot, rep.holding, rep.dir);
    if (!fullM) continue;

    const wfResult = runPatternFamilyWalkForward(
      filteredBars, assetId, rep.dir, rep.slot, IT, OOS,
    );
    const q = wfResult.quality;

    const foldOosReturns = wfResult.folds
      .filter(f => f.oosValid && f.oosReturn != null)
      .map(f => ({
        year: f.oosYear,
        oosReturn: f.oosReturn!,
        entrySlot: f.selectedEntrySlot,
        holdingDays: f.selectedHoldingDays,
      }));

    const positiveFoldCount = q.positiveOosFolds;
    const totalFolds = q.totalOosFolds > 0 ? q.totalOosFolds : Math.max(wfResult.oosTrades, 1);
    const positiveFoldRate = totalFolds > 0 ? positiveFoldCount / totalFolds : 0;
    const windowLabel = `${slotLabel(rep.slot)} – ${slotLabel(rep.slot + rep.holding)}`;

    const cand: ValidatedCandidate = {
      direction: rep.dir,
      anchorSlot: rep.slot,
      holdingDays: rep.holding,
      windowLabel,
      fullSampleWR: parseFloat(fullM.winRate.toFixed(1)),
      oosWinRate: wfResult.stitchedOosWinRate,
      oosAvgReturn: wfResult.stitchedOosAvgReturn,
      oosProfitFactor: wfResult.oosProfitFactor,
      oosMaxDrawdown: wfResult.stitchedOosMaxDD,
      qualityScore: q.qualityScore ?? 0,
      qualityStatus: q.status,
      parameterStability: wfResult.parameterStability ?? 0,
      oosTrades: wfResult.oosTrades,
      oosFolds: q.totalOosFolds,
      positiveFoldCount,
      positiveFoldRate,
      foldOosReturns,
    };

    const passes = (
      wfResult.oosTrades >= 5 &&
      (q.qualityScore ?? 0) >= 75 &&
      (q.status === "Strong" || q.status === "Excellent") &&
      wfResult.stitchedOosAvgReturn > 0 &&
      wfResult.oosProfitFactor > 1 &&
      q.leakageCheckPassed
    );

    if (passes) validated.push(cand);
    else {
      const reason = wfResult.oosTrades < 5 ? "insufficient_oos_sample"
        : (q.qualityScore ?? 0) < 75 ? `qs_${q.qualityScore}_below_75`
        : wfResult.stitchedOosAvgReturn <= 0 ? "negative_oos_avg_return"
        : `status_${q.status}`;
      allRejected.push({ ...cand, rejectionReason: reason });
    }
  }

  const { sel: selected, rej: overlapRej } = selectNonOverlapping(
    validated.map(v => ({
      slot:v.anchorSlot, holding:v.holdingDays, dir:v.direction,
      score: v.qualityScore, winRate:v.oosWinRate, avgReturn:v.oosAvgReturn, pf:v.oosProfitFactor,
    })),
    MAX_PAT,
  );

  const selectedPatterns = selected.map(s =>
    validated.find(v => v.direction===s.dir && v.anchorSlot===s.slot && v.holdingDays===s.holding)!
  ).filter(Boolean).sort((a,b) => a.anchorSlot - b.anchorSlot);

  const overlapRejFull = overlapRej.map(r =>
    ({ ...validated.find(v => v.direction===r.dir && v.anchorSlot===r.slot && v.holdingDays===r.holding)!, rejectionReason:"overlapping_window_same_direction" })
  ).filter(Boolean);

  // ── Phase 2: Fold-level OOS portfolio simulation (Asset Portfolio tab) ───────
  const { portfolio: foldPortfolio, allOosTrades, perFoldAudit, oosFolds } =
    runFoldLevelPortfolio(filteredBars, map, years);

  // Bootstrap full metrics on portfolio trade returns — upgraded to 10k (Gate 3)
  // Runtime: ~5-10ms for ~100 trades × 10k resamples = acceptable
  const portfolioTradeReturnsPct = allOosTrades.map(t => t.tradeReturn * 100);
  const portfolioBootstrap = bootstrapFullMetrics(portfolioTradeReturnsPct, STUDY_END - (STUDY_START + IT) + 1, 10000, 42);
  const portfolioBootstrapNote = "Audited 10k resamples (route). mode=audited_10000_resamples, seed=42.";

  // DSR for best validated pattern (per-fold OOS returns)
  const bestPatternOosReturns = selectedPatterns.length > 0
    ? selectedPatterns[0].foldOosReturns.map(f => f.oosReturn)
    : [];
  const patternDSR = computeDSR(bestPatternOosReturns, candUniverse, `${assetId}_best_pattern`);
  const pboFeasibility = assessPBOFeasibility(oosFolds);

  // DSR result-type specific audit (Gate 1 — Phase D)
  const patternDsrAudit = buildDsrResultTypeAudit("single_pattern_candidate", assetId, candUniverse);
  const portfolioDsrAudit = buildDsrResultTypeAudit("asset_portfolio_selected_from_multiple_patterns", assetId, candUniverse);

  // Gate 1: Determine research approval status based on DSR result
  const dsrFailed = patternDSR.status === "computed" && patternDSR.isStrategyStat === false;
  const researchApprovalStatus = determineResearchApprovalStatus(
    selectedPatterns.length > 0,
    patternDSR,
    "pending",   // SPA blocked until candidate matrix available
    "pending" as const, // PBO borderline/insufficient → pending
    false,       // execution not verified
  );

  // ── Pre-Entry Exhaustion Filter Research (Gate B-F) ─────────────────────────
  // Run for each validated pattern — IS-only P90 threshold, no lookahead.
  const preEntryFilterResults = selectedPatterns.map(p => {
    try {
      return {
        patternKey: `${p.direction}_s${p.anchorSlot}_h${p.holdingDays}`,
        ...runPreEntryExhaustionFilter(map, years, p.anchorSlot, p.holdingDays, p.direction, `${p.direction}_s${p.anchorSlot}_h${p.holdingDays}`),
      };
    } catch {
      return { patternKey: `${p.direction}_s${p.anchorSlot}_h${p.holdingDays}`, error: "computation_failed" };
    }
  });

  // Pattern contribution in portfolio (based on validated patterns, for display)
  const patternContribution = selectedPatterns.map(p => ({
    direction: p.direction,
    windowLabel: p.windowLabel,
    holdingDays: p.holdingDays,
    oosTrades: p.oosTrades,
    oosWinRate: p.oosWinRate,
    oosAvgReturn: p.oosAvgReturn,
    oosMaxDD: p.oosMaxDrawdown,
    qualityScore: p.qualityScore,
  }));

  const dur = Date.now() - startMs;

  return {
    engineVersion: ENGINE_VERSION,
    status: selectedPatterns.length > 0 ? "complete" : "no_patterns_validated",
    runDurationMs: dur,
    assetId,
    assetName: assetDef.name,
    config: {
      assetId, symbol: assetDef.symbol, studyStartYear: STUDY_START, studyEndYear: STUDY_END,
      initialTrainingYears: IT, oosBlockYears: OOS,
      holdingCandidates: Array.from(HOLD_CANDS), entryStepTradingDays: STEP, maxPatternsPerAsset: MAX_PAT,
      wfLibrary: "runPatternFamilyWalkForward (central, same as main app)",
      portfolioMethod: "fold_level_is_only_selection_bar_level_oos_equity",
    },
    statisticalEvidence: {
      candidateUniverseSize: candUniverse,
      preFilteredCandidates: preFiltered,
      wfTestedCandidates: wfTested,
      selectedPatternCount: selectedPatterns.length,
      overlapConflictsRemoved: overlapRejFull.length,
      portfolioOosFolds: oosFolds,
      portfolioOosTrades: allOosTrades.length,
      multipleTestingAdjustment: "not_implemented",
      significanceClaimAllowed: false,
      statisticalRobustnessStatus:
        "Strict Walk-Forward OOS validated research candidates. Multiple-testing / data-snooping adjustment is not yet completed. Not approved as live trading portfolio.",
    },
    validatedPatterns: selectedPatterns,
    rejectedCandidates: [...allRejected, ...overlapRejFull],
    assetPortfolio: foldPortfolio ? {
      ...foldPortfolio,
      patternContribution,
      oosFoldAudit: perFoldAudit,
      bootstrapFullMetrics: portfolioBootstrap,
      portfolioPolicy: {
        sameAssetConcurrentPositions: false,
        overlapPolicy: OVERLAP_POLICY_VERSION,
        allocationPerPosition: "equal_weight_among_active",
        capitalModel: "normalized_research_only",
        note: "Bar-level mark-to-market portfolio equity. Not a real contract portfolio.",
      },
    } : null,
    statisticsEnhanced: {
      patternDSR,
      patternDsrAudit,
      portfolioDsrAudit,
      pboFeasibility,
      realityCheckFormalizationStatus: REALITY_CHECK_FORMALIZATION_STATUS,
      researchApprovalStatus,
      dsrFailed,
      bootstrapPortfolioNote: portfolioBootstrapNote,
      spaRealityCheck: {
        status: "pending_candidate_matrix",
        note: "Use action:'generateCandidateMatrix' to generate the OOS return matrix and then run Reality Check.",
        blocker: "Full candidate return matrix must be generated first.",
      },
    },
    preEntryExhaustionResearch: {
      version: PRE_ENTRY_FILTER_VERSION,
      lookbackTradingDays: 14,
      primaryPolicy: "VETO_IF_PRE_MOVE_EXHAUSTED_P90",
      sensitivityPolicy: "VETO_IF_PRE_MOVE_EXHAUSTED_P80_SENSITIVITY",
      thresholdSource: "IS-only per fold (no lookahead)",
      researchStatus: "wf_evaluated_statistics_pending",
      additionalHypothesisNote: "Each pre-move policy variant is a new research hypothesis increasing the candidate search space. Not approved for trading.",
      patternResults: preEntryFilterResults,
    },
    auditMetadata: {
      assetId, csvSource: assetDef.csv,
      sourceFingerprint: fingerprint, studyStartYear: STUDY_START, studyEndYear: STUDY_END,
      totalBarsLoaded: filteredBars.length, totalYearsAvailable: years.length,
      engineVersion: ENGINE_VERSION, portfolioRiskVersion: PORTFOLIO_RISK_VERSION,
      overlapPolicyVersion: OVERLAP_POLICY_VERSION,
      runTimestampUtc: new Date().toISOString(), runDurationMs: dur,
    },
  };
}

// ── Agriculture Group Portfolio ───────────────────────────────────────────────
async function runAgricultureGroupPortfolio(): Promise<Record<string, unknown>> {
  const startMs = Date.now();
  const assetIds = Object.keys(AGRI_REGISTRY);
  const assetResults: Record<string, Awaited<ReturnType<typeof runEngineForAsset>>> = {};
  const perAssetMatrix: unknown[] = [];

  // Run each asset sequentially
  for (const assetId of assetIds) {
    const result = await runEngineForAsset(assetId);
    assetResults[assetId] = result;

    const portfolio = (result.assetPortfolio as Record<string, unknown> | null);
    perAssetMatrix.push({
      assetId,
      name: AGRI_REGISTRY[assetId].name,
      symbol: AGRI_REGISTRY[assetId].symbol,
      status: result.status,
      validatedPatternCount: ((result.validatedPatterns as unknown[]) ?? []).length,
      oosReturn: portfolio?.oosCompoundReturn ?? null,
      oosMaxDD: portfolio?.oosMaxDrawdown ?? null,
      oosCalmar: portfolio?.oosCalmar ?? null,
      oosWinRate: portfolio?.oosWinRate ?? null,
      oosTradeCount: portfolio?.oosTradeCount ?? null,
      portfolioStatus: portfolio ? "ready" : "no_portfolio",
    });
  }

  // Collect all OOS trades from all assets for group portfolio
  const groupTrades: (OosTrade & { assetId: string })[] = [];
  for (const [aid, result] of Object.entries(assetResults)) {
    if (result.status !== "complete") continue;
    const port = result.assetPortfolio as Record<string,unknown>|null;
    if (!port || !port.oosFoldAudit) continue;

    // Re-run fold-level trades (they're already computed but we need them with assetId tag)
    // Use the perFoldAudit structure — but we need the actual trades
    // Load bars again for this asset
    const loaded = await loadAssetBars(aid);
    if (!loaded) continue;
    const filteredBars = loaded.bars.filter(b => {
      const y = parseInt(b.date.slice(0,4)); return y >= STUDY_START && y <= STUDY_END;
    });
    const { map, years } = buildCloseMap(filteredBars, STUDY_START, STUDY_END);
    const { allOosTrades } = runFoldLevelPortfolio(filteredBars, map, years);
    for (const t of allOosTrades) {
      groupTrades.push({ ...t, assetId: aid, tradeKey: `${aid}_${t.tradeKey}` });
    }
  }

  // Apply group policy: max 4 concurrent across all agriculture assets
  // Sort by entry date, apply max-concurrent constraint
  groupTrades.sort((a,b) => a.entryDate.localeCompare(b.entryDate));

  const filteredGroupTrades: (OosTrade & { assetId: string })[] = [];
  const overlapLog: unknown[] = [];

  for (const trade of groupTrades) {
    const activeConcurrent = filteredGroupTrades.filter(t =>
      t.entryDate <= trade.entryDate && t.exitDate >= trade.entryDate
    );
    // Same asset: no concurrent
    const sameAssetActive = activeConcurrent.filter(t => t.assetId === trade.assetId);
    if (sameAssetActive.length > 0) {
      overlapLog.push({ removed: trade.tradeKey, reason: "same_asset_concurrent", blockingTrade: sameAssetActive[0].tradeKey });
      continue;
    }
    // Group max 4
    if (activeConcurrent.length >= 4) {
      overlapLog.push({ removed: trade.tradeKey, reason: "group_max4_concurrent", concurrent: activeConcurrent.length });
      continue;
    }
    filteredGroupTrades.push(trade);
  }

  // Build group bar-level equity (all assets combined)
  // We need all OOS bars from all assets merged by date
  // Simpler approach: day-by-day across all assets treating each as independent 1-unit allocation
  const allGroupBars = new Map<string, Map<string, number>>();  // date → assetId → close
  for (const assetId of assetIds) {
    const loaded = await loadAssetBars(assetId);
    if (!loaded) continue;
    for (const bar of loaded.bars) {
      const y = parseInt(bar.date.slice(0,4));
      if (y < STUDY_START + IT || y > STUDY_END) continue;
      if (!allGroupBars.has(bar.date)) allGroupBars.set(bar.date, new Map());
      allGroupBars.get(bar.date)!.set(assetId, bar.close);
    }
  }

  const allGroupDates = Array.from(allGroupBars.keys()).sort();
  const prevCloseMap = new Map<string, number>();
  let groupEquity = 1.0, groupPeak = 1.0, groupMaxDD = 0;
  let groupBarsActive = 0, groupMaxConcurrent = 0;
  const groupYearEndEquity = new Map<number, number>();
  const groupYearStartEquity = new Map<number, number>();

  for (const date of allGroupDates) {
    const yr = parseInt(date.slice(0,4));
    if (!groupYearStartEquity.has(yr)) groupYearStartEquity.set(yr, groupEquity);

    const activeTrades = filteredGroupTrades.filter(t => t.entryDate <= date && t.exitDate >= date);
    if (activeTrades.length > groupMaxConcurrent) groupMaxConcurrent = activeTrades.length;
    if (activeTrades.length > 0) groupBarsActive++;

    let dailyRet = 0;
    const w = activeTrades.length > 0 ? 1.0 / activeTrades.length : 0;

    for (const t of activeTrades) {
      const assetBars = allGroupBars.get(date);
      const close = assetBars?.get(t.assetId);
      if (close == null) continue;
      const prev = prevCloseMap.has(t.tradeKey) ? prevCloseMap.get(t.tradeKey)! : t.entryPrice;
      if (prev > 0) {
        const barRet = (close - prev) / prev;
        dailyRet += w * barRet * (t.dir === "LONG" ? 1 : -1);
      }
      prevCloseMap.set(t.tradeKey, close);
      if (date >= t.exitDate) prevCloseMap.delete(t.tradeKey);
    }

    groupEquity *= (1 + dailyRet);
    if (groupEquity > groupPeak) groupPeak = groupEquity;
    const dd = groupPeak > 1e-9 ? (groupPeak - groupEquity) / groupPeak : 0;
    if (dd > groupMaxDD) groupMaxDD = dd;

    groupYearEndEquity.set(yr, groupEquity);
  }

  // Group yearly metrics
  const groupOosYears = Array.from(new Set(filteredGroupTrades.map(t=>t.year))).sort((a,b)=>a-b);
  const groupYearlyReturns = groupOosYears.map(yr => {
    const s = groupYearStartEquity.get(yr) ?? 1;
    const e = groupYearEndEquity.get(yr) ?? s;
    return { year: yr, portfolioReturn: parseFloat((e/s-1).toFixed(4)), tradeCount: filteredGroupTrades.filter(t=>t.year===yr).length };
  });
  const groupEquitySeries = groupOosYears.map(yr => ({
    year: yr, equity: parseFloat(((groupYearEndEquity.get(yr) ?? 1)-1)*100+""),
  }));

  const groupFinalEq = groupEquity - 1;
  const gn = groupOosYears.length;
  const groupCagr = gn > 0 ? Math.pow(Math.max(groupEquity, 1e-9), 1/gn) - 1 : 0;
  const groupCalmar = groupMaxDD > 0.001 ? groupCagr / groupMaxDD : null;
  const groupWins = filteredGroupTrades.filter(t=>t.tradeReturn>0).length;
  const groupWinRate = filteredGroupTrades.length > 0 ? (groupWins/filteredGroupTrades.length)*100 : 0;
  const gw = filteredGroupTrades.filter(t=>t.tradeReturn>0).reduce((s,t)=>s+t.tradeReturn,0);
  const gl = Math.abs(filteredGroupTrades.filter(t=>t.tradeReturn<0).reduce((s,t)=>s+t.tradeReturn,0));
  const groupPF = gl > 1e-9 ? gw/gl : (gw>0 ? 99 : 0);
  const groupPosYears = groupYearlyReturns.filter(y=>y.portfolioReturn>0).length;
  const groupWorstYr = groupYearlyReturns.reduce((a,b) => a.portfolioReturn<b.portfolioReturn?a:b, groupYearlyReturns[0] ?? { portfolioReturn:0, year:0 });
  const groupExposure = allGroupDates.length > 0 ? (groupBarsActive/allGroupDates.length)*100 : 0;

  // Asset contribution
  const assetContribution = assetIds.map(aid => {
    const aidTrades = filteredGroupTrades.filter(t=>t.assetId===aid);
    const wins2 = aidTrades.filter(t=>t.tradeReturn>0).length;
    return {
      assetId: aid, name: AGRI_REGISTRY[aid].name, tradeCount: aidTrades.length,
      winRate: aidTrades.length > 0 ? parseFloat((wins2/aidTrades.length*100).toFixed(1)) : 0,
      avgReturn: aidTrades.length > 0 ? parseFloat((aidTrades.reduce((s,t)=>s+t.tradeReturn,0)/aidTrades.length*100).toFixed(2)) : 0,
    };
  }).filter(a => a.tradeCount > 0);

  const dur = Date.now() - startMs;

  return {
    engineVersion: ENGINE_VERSION,
    groupRiskVersion: GROUP_RISK_VERSION,
    overlapPolicyVersion: OVERLAP_POLICY_VERSION,
    status: "complete",
    runDurationMs: dur,
    studyStartYear: STUDY_START, studyEndYear: STUDY_END,
    eligibleAssets: assetIds.length,
    assetsWithPatterns: perAssetMatrix.filter((a:unknown) => (a as {validatedPatternCount:number}).validatedPatternCount > 0).length,
    perAssetMatrix,
    groupPortfolio: {
      oosCompoundReturn:  parseFloat((groupFinalEq * 100).toFixed(2)),
      oosCagr:            parseFloat((groupCagr * 100).toFixed(2)),
      oosWinRate:         parseFloat(groupWinRate.toFixed(1)),
      oosProfitFactor:    parseFloat(groupPF.toFixed(3)),
      oosMaxDrawdown:     parseFloat((groupMaxDD * 100).toFixed(2)),
      oosCalmar:          groupCalmar != null ? parseFloat(groupCalmar.toFixed(3)) : null,
      oosTradeCount:      filteredGroupTrades.length,
      oosYears:           gn,
      positiveYears:      groupPosYears,
      worstYear:          groupWorstYr?.year ?? null,
      worstYearReturn:    groupWorstYr ? parseFloat((groupWorstYr.portfolioReturn*100).toFixed(2)) : null,
      maxConcurrentPositions: groupMaxConcurrent,
      exposureTimePct:    parseFloat(groupExposure.toFixed(1)),
      equitySeries:       groupEquitySeries,
      yearlyReturns:      groupYearlyReturns,
      assetContribution,
      overlapRemovedCount: overlapLog.length,
      policy: {
        sameAssetConcurrent: false,
        maxOpenGroupPositions: 4,
        allocationModel: "equal_weight_among_active",
        capitalModel: "normalized_equal_risk_research",
        note: "Research-only. Not a real contract portfolio. No margin/cost model applied.",
      },
    },
    auditMetadata: {
      runTimestampUtc: new Date().toISOString(),
      runDurationMs: dur,
      engineVersion: ENGINE_VERSION,
      overlapConflicts: overlapLog.length,
      statisticalRobustnessStatus:
        "Strict Walk-Forward OOS validated research candidates. Multiple-testing / data-snooping adjustment is not yet completed. Not approved as live trading portfolio.",
    },
  };
}

// ── Fold-internal Agriculture Asset Eligibility Policies ─────────────────────
async function runAgricultureEligibilityPolicies(): Promise<Record<string, unknown>> {
  const startMs = Date.now();
  const POLICIES: AgricultureEligibilityPolicy[] = [
    "ALL_SOURCE_VALID_ASSETS",
    "IS_WF_VALIDATED_PATTERNS_ONLY",
    "IS_WF_VALIDATED_AND_POSITIVE_ASSET_PORTFOLIO",
    "IS_WF_VALIDATED_POSITIVE_AND_MIN_CALMAR",
  ];

  // Load all asset bars
  const assetBarsMap = new Map<string, DailyBar[]>();
  const assetCloseMapsMap = new Map<string, { map: Map<number,Map<number,number>>; years: number[] }>();
  for (const [aid, def] of Object.entries(AGRI_REGISTRY)) {
    const loaded = await loadAssetBars(aid);
    if (!loaded) continue;
    const fb = loaded.bars.filter(b => { const y=parseInt(b.date.slice(0,4)); return y>=STUDY_START&&y<=STUDY_END; });
    assetBarsMap.set(aid, fb);
    assetCloseMapsMap.set(aid, buildCloseMap(fb, STUDY_START, STUDY_END));
  }

  // Build common fold structure (all years where ALL assets have data 2000-2025)
  // Use the intersection of available years
  let commonYears: number[] | null = null;
  for (const { years } of assetCloseMapsMap.values()) {
    if (!commonYears) commonYears = [...years];
    else commonYears = commonYears.filter(y => years.includes(y));
  }
  commonYears = commonYears ?? [];

  // Use ZS close map for fold generation (all assets share 2000-2025)
  const referenceCloseMap = assetCloseMapsMap.get("soybeans")!.map;

  const policyResults: Record<string, unknown>[] = [];

  for (const policy of POLICIES) {
    const foldAuditRows: unknown[] = [];
    const allOosTrades: (OosTrade & { assetId: string })[] = [];

    // Enumerate folds
    for (let foldIdx = 0; ; foldIdx++) {
      const oosStart = STUDY_START + IT + foldIdx * OOS;
      const isYears = commonYears.filter(y => y < oosStart);
      const oosYears = commonYears.filter(y => y >= oosStart && y < oosStart + OOS);
      if (isYears.length < IT || oosYears.length === 0) break;

      const eligibleAssets: string[] = [];
      const rejectedAssets: Array<{ assetId: string; reason: string; isWR: number }> = [];

      // Assess eligibility for each asset based on IS data
      for (const [aid, { map: assetMap }] of assetCloseMapsMap) {
        const isCloseMap = new Map<number, Map<number,number>>();
        for (const yr of isYears) { const m = assetMap.get(yr); if (m) isCloseMap.set(yr, m); }

        const result = assessISAssetEligibility(isCloseMap, isYears, policy);
        if (result.eligible) eligibleAssets.push(aid);
        else rejectedAssets.push({ assetId: aid, reason: result.reason, isWR: result.bestISWinRate });
      }

      // Collect OOS trades for eligible assets in this fold
      let foldTradeCount = 0;
      for (const aid of eligibleAssets) {
        const bars = assetBarsMap.get(aid);
        const { map: cm, years: ay } = assetCloseMapsMap.get(aid)!;
        if (!bars) continue;

        const assetLookup = buildYearSlotLookup(bars);

        // Build IS close map for this fold
        const isCloseMap2 = new Map<number, Map<number,number>>();
        for (const yr of isYears) { const m = cm.get(yr); if (m) isCloseMap2.set(yr, m); }

        // Generate IS candidates
        const cands: import("@/lib/seasonality/strategyEngine/isDiscovery").Cand[] = [];
        for (let slot = 1; slot <= MAX_SLOT; slot += STEP) {
          for (const dir of ["LONG","SHORT"] as const) {
            for (const hd of HOLD_CANDS) {
              const met = preFilter(isCloseMap2, isYears, slot, hd, dir);
              if (!met || met.winRate < 60 || met.avgReturn <= 0 || met.pf < 1.0) continue;
              const sc = met.winRate*100 + met.avgReturn*1000 + met.pf*10 - hd*0.1;
              cands.push({ slot, holding:hd, dir, score:sc, winRate:met.winRate, avgReturn:met.avgReturn, pf:met.pf });
            }
          }
        }
        const { sel } = selectNonOverlapping(cands, MAX_PAT);

        // Simulate OOS trades from frozen IS patterns
        for (const pat of sel) {
          for (const oosYr of oosYears) {
            const { trade } = getPatternTradeForYear(assetLookup, oosYr, pat.slot, pat.holding as 10|12|14|16|18|20, pat.dir);
            if (!trade) continue;
            const overlap = allOosTrades.some(t => t.assetId===aid && t.year===oosYr && t.entryDate < trade.exitDate && trade.entryDate < t.exitDate);
            if (overlap) continue;
            const tradeKey = `${aid}_${pat.dir}_s${pat.slot}_h${pat.holding}_y${oosYr}_f${foldIdx}`;
            allOosTrades.push({ tradeKey, dir:pat.dir, year:oosYr, foldIdx, entryDate:trade.entryDate, exitDate:trade.exitDate, entryPrice:trade.entryPrice, exitPrice:trade.exitPrice, tradeReturn:trade.strategyReturn, assetId: aid });
            foldTradeCount++;
          }
        }
      }

      foldAuditRows.push({
        foldIdx,
        isYears: [isYears[0], isYears[isYears.length-1]],
        oosYears,
        selectedAssetsBeforeOos: eligibleAssets,
        rejectedAssetsBeforeOos: rejectedAssets,
        oosFoldTradeCount: foldTradeCount,
      });
    }

    // Apply group max-4 concurrent constraint
    const sortedTrades = [...allOosTrades].sort((a,b) => a.entryDate.localeCompare(b.entryDate));
    const filteredTrades: (OosTrade & { assetId: string })[] = [];
    for (const t of sortedTrades) {
      const active = filteredTrades.filter(ft => ft.entryDate <= t.entryDate && ft.exitDate >= t.entryDate);
      const sameAsset = active.filter(ft => ft.assetId === (t as OosTrade & {assetId:string}).assetId);
      if (sameAsset.length > 0) continue;
      if (active.length >= 4) continue;
      filteredTrades.push(t);
    }

    // Build group portfolio equity
    const allGroupBarsForPolicy = new Map<string, Map<string,number>>();
    for (const [aid] of assetCloseMapsMap) {
      const bars = assetBarsMap.get(aid);
      if (!bars) continue;
      for (const bar of bars) {
        const y = parseInt(bar.date.slice(0,4));
        if (y < STUDY_START+IT || y > STUDY_END) continue;
        if (!allGroupBarsForPolicy.has(bar.date)) allGroupBarsForPolicy.set(bar.date, new Map());
        allGroupBarsForPolicy.get(bar.date)!.set(aid, bar.close);
      }
    }

    const allDates = Array.from(allGroupBarsForPolicy.keys()).sort();
    const prevCloseMap2 = new Map<string,number>();
    let eq2=1, peak2=1, maxDD2=0, barsActive=0, maxConc=0;
    const yrStartEq = new Map<number,number>(), yrEndEq = new Map<number,number>();

    for (const date of allDates) {
      const yr=parseInt(date.slice(0,4));
      if (!yrStartEq.has(yr)) yrStartEq.set(yr,eq2);
      const active2 = filteredTrades.filter(t=>t.entryDate<=date&&t.exitDate>=date);
      if (active2.length>maxConc) maxConc=active2.length;
      if (active2.length>0) barsActive++;
      let dr=0; const w2=active2.length>0?1/active2.length:0;
      for (const t of active2){
        const close=allGroupBarsForPolicy.get(date)?.get((t as OosTrade&{assetId:string}).assetId);
        if(close==null) continue;
        const prev=prevCloseMap2.has(t.tradeKey)?prevCloseMap2.get(t.tradeKey)!:t.entryPrice;
        if(prev>0) dr+=w2*(close-prev)/prev*(t.dir==="LONG"?1:-1);
        prevCloseMap2.set(t.tradeKey,close);
        if(date>=t.exitDate) prevCloseMap2.delete(t.tradeKey);
      }
      eq2*=(1+dr); if(eq2>peak2) peak2=eq2;
      const dd2=peak2>0?(peak2-eq2)/peak2:0; if(dd2>maxDD2) maxDD2=dd2;
      yrEndEq.set(yr,eq2);
    }

    const oosYearsArr=Array.from(new Set(filteredTrades.map(t=>t.year))).sort((a,b)=>a-b);
    const yRets=oosYearsArr.map(yr=>({year:yr,portfolioReturn:parseFloat(((yrEndEq.get(yr)??1)/(yrStartEq.get(yr)??1)-1).toFixed(4)),tradeCount:filteredTrades.filter(t=>t.year===yr).length}));
    const n2=oosYearsArr.length;
    const finalEq=eq2-1;
    const cagr2=n2>0?(Math.pow(Math.max(eq2,1e-9),1/n2)-1)*100:0;
    const calmar2=maxDD2>0.001?(cagr2/100)/maxDD2:null;
    const wins2=filteredTrades.filter(t=>t.tradeReturn>0).length;
    const wr2=filteredTrades.length>0?wins2/filteredTrades.length*100:0;
    const gw2=filteredTrades.filter(t=>t.tradeReturn>0).reduce((s,t)=>s+t.tradeReturn,0);
    const gl2=Math.abs(filteredTrades.filter(t=>t.tradeReturn<0).reduce((s,t)=>s+t.tradeReturn,0));
    const pf2=gl2>1e-9?gw2/gl2:(gw2>0?99:0);
    const exp2=allDates.length>0?(barsActive/allDates.length)*100:0;
    const wstYr=yRets.length>0?yRets.reduce((a,b)=>a.portfolioReturn<b.portfolioReturn?a:b):null;

    // Bootstrap
    const tradeRets = filteredTrades.map(t=>t.tradeReturn*100);
    const bs = bootstrapFullMetrics(tradeRets, n2, 2000, 42); // use 2000 resamples for group (perf)

    policyResults.push({
      policy,
      foldAudit: foldAuditRows,
      totalOosTrades: filteredTrades.length,
      oosYears: n2,
      oosWinRate: parseFloat(wr2.toFixed(1)),
      oosCompoundReturn: parseFloat((finalEq*100).toFixed(2)),
      oosCagr: parseFloat(cagr2.toFixed(2)),
      oosProfitFactor: parseFloat(pf2.toFixed(3)),
      oosBarLevelMaxDrawdown: parseFloat((maxDD2*100).toFixed(2)),
      oosBarLevelCalmar: calmar2!=null?parseFloat(calmar2.toFixed(3)):null,
      worstYear: wstYr?.year??null,
      worstYearReturn: wstYr?parseFloat((wstYr.portfolioReturn*100).toFixed(2)):null,
      maxConcurrentPositions: maxConc,
      exposureTimePct: parseFloat(exp2.toFixed(1)),
      yearlyReturns: yRets,
      bootstrap: bs,
      researchStatus: "wf_validated_statistics_pending",
    });
  }

  return {
    status: "complete",
    runDurationMs: Date.now() - startMs,
    engineVersion: ENGINE_VERSION,
    studyRange: { start: STUDY_START, end: STUDY_END },
    policies: policyResults,
    pboAssessment: assessPBOFeasibility(8),
    methodNote: "Fold-internal asset eligibility: for each OOS fold, asset selection based ONLY on IS data (no hindsight). " +
      "Research only — no policy approved without Statistics + Execution review.",
  };
}

// ── True Executed-Baseline Pure Pre-Move P90 Veto ────────────────────────────
// Reproduces the EXACT official 574-trade baseline, then applies pre-move veto
// ONLY to those trades. No refill, no replacement, no re-selection.
// The True Pure Veto trade set is a strict subset of the official baseline.
async function runTrueExecutedBaselinePureVeto(): Promise<Record<string, unknown>> {
  const startMs = Date.now();

  // Step 1: Reproduce the EXACT official 574-trade baseline
  // Use IDENTICAL logic as runAgricultureGroupPortfolio: runFoldLevelPortfolio per asset + max-4
  const assetIds = Object.keys(AGRI_REGISTRY);
  const assetBarsMap = new Map<string, DailyBar[]>();
  const assetCloseMapsMap = new Map<string, { map: Map<number,Map<number,number>>; years: number[] }>();

  for (const aid of assetIds) {
    const loaded = await loadAssetBars(aid);
    if (!loaded) continue;
    const fb = loaded.bars.filter(b=>{const y=parseInt(b.date.slice(0,4));return y>=STUDY_START&&y<=STUDY_END;});
    assetBarsMap.set(aid, fb);
    assetCloseMapsMap.set(aid, buildCloseMap(fb, STUDY_START, STUDY_END));
  }

  // Step 1b: Determine which assets have status="complete" (WF validated patterns ≥ 1)
  // This matches the filter in runAgricultureGroupPortfolio: result.status !== "complete" → skip
  // Run a quick WF validation pass for each asset
  const completeAssets = new Set<string>();
  for (const aid of assetIds) {
    const result = await runEngineForAsset(aid);
    if ((result.status as string) === "complete") completeAssets.add(aid);
  }

  // Accumulate fold-level OOS trades per COMPLETE asset only (SAME as baseline group function)
  type BaselineTrade = OosTrade & {
    assetId: string;
    parsedSlot: number;
    parsedDir: "LONG"|"SHORT";
    parsedHolding: number;
    parsedFoldIdx: number;
  };
  const allGroupTrades: BaselineTrade[] = [];

  for (const aid of assetIds) {
    if (!completeAssets.has(aid)) continue; // EXCLUDE non-complete assets (e.g., OJ)
    const bars = assetBarsMap.get(aid);
    const cmData = assetCloseMapsMap.get(aid);
    if (!bars || !cmData) continue;
    const { allOosTrades } = runFoldLevelPortfolio(bars, cmData.map, cmData.years);
    for (const t of allOosTrades) {
      // Parse tradeKey: "${dir}_s${slot}_h${holding}_y${year}_f${foldIdx}"
      const m = t.tradeKey.match(/^(LONG|SHORT)_s(\d+)_h(\d+)_y(\d+)_f(\d+)$/);
      allGroupTrades.push({
        ...t,
        assetId: aid,
        tradeKey: `${aid}_${t.tradeKey}`,
        parsedDir: m ? (m[1] as "LONG"|"SHORT") : t.dir,
        parsedSlot: m ? parseInt(m[2]) : 0,
        parsedHolding: m ? parseInt(m[3]) : 0,
        parsedFoldIdx: m ? parseInt(m[5]) : 0,
      });
    }
  }

  // Apply IDENTICAL max-4 concurrent constraint as baseline
  allGroupTrades.sort((a,b) => a.entryDate.localeCompare(b.entryDate));
  const officialBaselineTrades: BaselineTrade[] = [];
  for (const trade of allGroupTrades) {
    const activeConcurrent = officialBaselineTrades.filter(t =>
      t.entryDate <= trade.entryDate && t.exitDate >= trade.entryDate
    );
    if (activeConcurrent.filter(t => t.assetId === trade.assetId).length > 0) continue;
    if (activeConcurrent.length >= 4) continue;
    officialBaselineTrades.push(trade);
  }

  // Step 2: Verify baseline reproduction
  const baselineCount = officialBaselineTrades.length;

  // Compute baseline metrics to verify they match official report
  const allGroupBarsB = new Map<string, Map<string,number>>();
  for (const aid of assetIds) {
    const bars = assetBarsMap.get(aid);
    if (!bars) continue;
    for (const bar of bars) {
      const y=parseInt(bar.date.slice(0,4));
      if(y<STUDY_START+IT||y>STUDY_END) continue;
      if(!allGroupBarsB.has(bar.date)) allGroupBarsB.set(bar.date, new Map());
      allGroupBarsB.get(bar.date)!.set(aid, bar.close);
    }
  }

  function computeGroupEquity(trades: BaselineTrade[], barsMap: Map<string, Map<string,number>>) {
    const allDates = Array.from(barsMap.keys()).sort();
    const pcMap = new Map<string,number>();
    let eq=1, peak=1, maxDD=0, barsAct=0;
    for (const date of allDates) {
      const active = trades.filter(t=>t.entryDate<=date&&t.exitDate>=date);
      if(active.length>0) barsAct++;
      let dr=0; const w=active.length>0?1/active.length:0;
      for(const t of active){
        const close=barsMap.get(date)?.get(t.assetId);
        if(close==null) continue;
        const prev=pcMap.has(t.tradeKey)?pcMap.get(t.tradeKey)!:t.entryPrice;
        if(prev>0) dr+=w*(close-prev)/prev*(t.dir==="LONG"?1:-1);
        pcMap.set(t.tradeKey,close);
        if(date>=t.exitDate) pcMap.delete(t.tradeKey);
      }
      eq*=(1+dr); if(eq>peak) peak=eq;
      const dd=peak>0?(peak-eq)/peak:0; if(dd>maxDD) maxDD=dd;
    }
    const oosYrs=Array.from(new Set(trades.map(t=>t.year))).sort((a,b)=>a-b);
    const n=oosYrs.length;
    const cagr=n>0?(Math.pow(Math.max(eq,1e-9),1/n)-1)*100:0;
    const wins=trades.filter(t=>t.tradeReturn>0).length;
    const wr=trades.length>0?(wins/trades.length)*100:0;
    const gw=trades.filter(t=>t.tradeReturn>0).reduce((s,t)=>s+t.tradeReturn,0);
    const gl=Math.abs(trades.filter(t=>t.tradeReturn<0).reduce((s,t)=>s+t.tradeReturn,0));
    const pf=gl>1e-9?gw/gl:(gw>0?99:0);
    const calmar=maxDD>0.001?(cagr/100)/maxDD:null;
    return { trades:trades.length, return:parseFloat(((eq-1)*100).toFixed(2)), cagr:parseFloat(cagr.toFixed(2)), profitFactor:parseFloat(pf.toFixed(3)), maxDD:parseFloat((maxDD*100).toFixed(2)), calmar:calmar!=null?parseFloat(calmar.toFixed(3)):null, winRate:parseFloat(wr.toFixed(1)) };
  }

  const reproduced = computeGroupEquity(officialBaselineTrades, allGroupBarsB);
  const baselineReproducedExactly = (
    baselineCount === 574 &&
    Math.abs(reproduced.return - 164.62) < 1.0  // allow small float diff
  );

  // Step 3: Apply TRUE PURE PRE-MOVE P90 VETO to official baseline trades ONLY
  // No refill, no replacement — just filter the 574 trades
  const vetoedTradeIds: string[] = [];
  const losingAvoided: number[] = [];
  const winningMissed: number[] = [];

  const pureVetoTrades = officialBaselineTrades.filter(trade => {
    const cmData = assetCloseMapsMap.get(trade.assetId);
    if (!cmData || trade.parsedSlot === 0) return true; // keep if can't compute

    const { map: cm, years: ay } = cmData;

    // Compute IS years from foldIdx: IS = years before oosStart
    const oosStart = STUDY_START + IT + trade.parsedFoldIdx * OOS;
    const isYears = ay.filter(y => y < oosStart);
    if (isYears.length < 5) return true; // keep if insufficient IS history

    // Compute IS close map
    const isMap = new Map<number,Map<number,number>>();
    for (const yr of isYears) { const m = cm.get(yr); if (m) isMap.set(yr, m); }

    // IS P90 threshold
    const thresh = computeISPreEntryThresholds(isMap, isYears, trade.parsedSlot, trade.parsedDir);
    if (thresh.p90 === null) return true;

    // Pre-move for this OOS year
    const preMove = computePreEntryDirectionalMove(cm, [...isYears, trade.year], trade.year, trade.parsedSlot, trade.parsedDir);
    if (!preMove) return true;

    if (preMove.directionalPreMove > thresh.p90) {
      vetoedTradeIds.push(trade.tradeKey);
      if (trade.tradeReturn < 0) losingAvoided.push(trade.tradeReturn);
      else if (trade.tradeReturn > 0) winningMissed.push(trade.tradeReturn);
      return false; // VETO
    }
    return true; // KEEP
  });

  // Verify conservation
  const expectedRetained = baselineCount - vetoedTradeIds.length;
  const actualRetained = pureVetoTrades.length;
  const conservationPassed = expectedRetained === actualRetained;

  // Verify subset: all retained trades were in the official baseline
  const baselineTradeIds = new Set(officialBaselineTrades.map(t => t.tradeKey));
  const isSubset = pureVetoTrades.every(t => baselineTradeIds.has(t.tradeKey));

  // Step 4: Compute metrics for pure veto result
  const pureVetoMetrics = computeGroupEquity(pureVetoTrades, allGroupBarsB);

  const dur = Date.now() - startMs;

  return {
    variantName: "TRUE_EXECUTED_BASELINE_PRE_MOVE_P90_VETO",
    description: "Applies pre-move P90 veto ONLY to the exact official 574-trade baseline. No refill, no replacement, no re-selection. Retained trades are a strict subset of the official baseline.",
    runDurationMs: dur,

    baselineReproduction: {
      ...reproduced,
      officialReportedTrades: 574,
      officialReportedReturn: 164.62,
      reproductionPassed: baselineReproducedExactly,
      note: baselineReproducedExactly ? "✅ Baseline reproduced exactly" : `⚠️ Discrepancy: ${baselineCount} trades, ${reproduced.return}% return`,
    },

    pureVeto: {
      officialBaselineTradesInput: baselineCount,
      vetoedOfficialBaselineTrades: vetoedTradeIds.length,
      losingBaselineTradesAvoided: losingAvoided.length,
      winningBaselineTradesMissed: winningMissed.length,
      addedOrReplacementTrades: 0,
      ...pureVetoMetrics,
    },

    conservationChecks: {
      officialBaselineReproducedExactly: baselineReproducedExactly,
      expectedRetained: expectedRetained,
      actualRetained: actualRetained,
      conservationPassed: conservationPassed,
      tradeCountFormula: `${baselineCount} - ${vetoedTradeIds.length} = ${expectedRetained} (actual: ${actualRetained})`,
      truePureVetoIsSubsetOfOfficialBaseline: isSubset,
      truePureVetoHasNoReplacementTrades: true,
    },

    delta: {
      compoundReturn: parseFloat((pureVetoMetrics.return - reproduced.return).toFixed(2)),
      maxDrawdown: parseFloat((pureVetoMetrics.maxDD - reproduced.maxDD).toFixed(2)),
      calmar: (pureVetoMetrics.calmar != null && reproduced.calmar != null)
        ? parseFloat((pureVetoMetrics.calmar - reproduced.calmar).toFixed(3))
        : null,
    },

    conclusion: pureVetoMetrics.return < reproduced.return ? "worse" : "neutral_or_improved",
    portfolioPromotionStatus: "rejected",

    intermediateVariantNote: {
      label: "INTERMEDIATE_UNIVERSE_PRE_MOVE_VETO_NO_REFILL",
      trades: 559,
      basedOn: "Fresh 627-trade reconstruction (not official baseline). Different fold-level IS discovery logic.",
      mainComparisonRelevance: "Excluded from main comparison — not comparable to official 574 baseline.",
    },

    refillVariantNote: {
      label: "PRE_MOVE_P90_VETO_WITH_REFILL",
      trades: 581,
      explanation: "Veto applied before max-4, freeing slots for refill trades. Not a pure veto.",
    },
  };
}

// ── Agriculture Group With Pre-Move P90 Sensitivity ──────────────────────────
async function runAgricultureGroupWithPreMoveP90(): Promise<Record<string, unknown>> {
  const startMs = Date.now();

  // Load all asset bars and close maps
  const assetBarsMap = new Map<string, DailyBar[]>();
  const assetCloseMapsMap = new Map<string, { map: Map<number,Map<number,number>>; years: number[] }>();
  for (const [aid] of Object.entries(AGRI_REGISTRY)) {
    const loaded = await loadAssetBars(aid);
    if (!loaded) continue;
    const fb = loaded.bars.filter(b => {const y=parseInt(b.date.slice(0,4)); return y>=STUDY_START&&y<=STUDY_END;});
    assetBarsMap.set(aid, fb);
    assetCloseMapsMap.set(aid, buildCloseMap(fb, STUDY_START, STUDY_END));
  }

  // Collect fold-level OOS trades WITH pre-move veto applied
  const vetoedTrades: string[] = [];
  let baselineTradeCount = 0;

  const allOosTrades: (OosTrade & { assetId: string })[] = [];

  for (const [aid, { map: cm, years: ay }] of assetCloseMapsMap) {
    const bars = assetBarsMap.get(aid);
    if (!bars) continue;
    const lookup = buildYearSlotLookup(bars);

    // Run fold-level IS discovery and collect OOS trades with pre-move veto
    for (let fi = 0; ; fi++) {
      const oosStart = STUDY_START + IT + fi * OOS;
      const isYears = ay.filter(y => y < oosStart);
      const oosYears = ay.filter(y => y >= oosStart && y < oosStart + OOS);
      if (isYears.length < IT || oosYears.length === 0) break;

      const isMap = new Map<number,Map<number,number>>();
      for (const yr of isYears) { const m = cm.get(yr); if (m) isMap.set(yr, m); }

      // IS candidate selection
      const cands: Cand[] = [];
      for (let slot = 1; slot <= MAX_SLOT; slot += STEP) {
        for (const dir of ["LONG","SHORT"] as const) {
          for (const hd of HOLD_CANDS) {
            const m = preFilter(isMap, isYears, slot, hd, dir);
            if (!m || m.winRate < 60 || m.avgReturn <= 0 || m.pf < 1.0) continue;
            const sc = m.winRate*100 + m.avgReturn*1000 + m.pf*10 - hd*0.1;
            cands.push({ slot, holding:hd, dir, score:sc, winRate:m.winRate, avgReturn:m.avgReturn, pf:m.pf });
          }
        }
      }
      const { sel } = selectNonOverlapping(cands, MAX_PAT);

      for (const pat of sel) {
        // Compute IS P90 pre-move threshold for this pattern
        const preMoveThresh = computeISPreEntryThresholds(isMap, isYears, pat.slot, pat.dir);

        for (const oosYr of oosYears) {
          const { trade } = getPatternTradeForYear(lookup, oosYr, pat.slot, pat.holding as 10|12|14|16|18|20, pat.dir);
          if (!trade) continue;

          baselineTradeCount++;

          // Check same-asset concurrent overlap in allOosTrades
          const overlap = allOosTrades.some(t => t.assetId===aid && t.year===oosYr && t.entryDate < trade.exitDate && trade.entryDate < t.exitDate);
          if (overlap) continue;

          const tradeKey = `${aid}_${pat.dir}_s${pat.slot}_h${pat.holding}_y${oosYr}_f${fi}`;

          // Pre-move veto check: compute directional pre-move for this OOS year
          const preMove = computePreEntryDirectionalMove(cm, [...isYears, oosYr], oosYr, pat.slot, pat.dir);
          if (preMove && preMoveThresh.p90 !== null && preMove.directionalPreMove > preMoveThresh.p90) {
            vetoedTrades.push(tradeKey);
            continue; // VETOED by pre-move P90
          }

          allOosTrades.push({ tradeKey, dir:pat.dir, year:oosYr, foldIdx:fi, entryDate:trade.entryDate, exitDate:trade.exitDate, entryPrice:trade.entryPrice, exitPrice:trade.exitPrice, tradeReturn:trade.strategyReturn, assetId:aid });
        }
      }
    }
  }

  // Apply group max-4 concurrent constraint
  const sortedTrades = [...allOosTrades].sort((a,b) => a.entryDate.localeCompare(b.entryDate));
  const filteredTrades: (OosTrade & { assetId: string })[] = [];
  for (const t of sortedTrades) {
    const active = filteredTrades.filter(ft => ft.entryDate <= t.entryDate && ft.exitDate >= t.entryDate);
    if (active.filter(ft => ft.assetId === (t as OosTrade&{assetId:string}).assetId).length > 0) continue;
    if (active.length >= 4) continue;
    filteredTrades.push(t);
  }

  // Build bar-level group equity
  const allGroupBarsForGroup = new Map<string, Map<string,number>>();
  for (const [aid] of assetCloseMapsMap) {
    const bars = assetBarsMap.get(aid);
    if (!bars) continue;
    for (const bar of bars) {
      const y = parseInt(bar.date.slice(0,4));
      if (y < STUDY_START+IT || y > STUDY_END) continue;
      if (!allGroupBarsForGroup.has(bar.date)) allGroupBarsForGroup.set(bar.date, new Map());
      allGroupBarsForGroup.get(bar.date)!.set(aid, bar.close);
    }
  }

  const allDates = Array.from(allGroupBarsForGroup.keys()).sort();
  const prevCloseMap = new Map<string,number>();
  let eq=1, peak=1, maxDD=0, barsActive=0, maxConc=0;
  const yrStartEq = new Map<number,number>(), yrEndEq = new Map<number,number>();

  for (const date of allDates) {
    const yr=parseInt(date.slice(0,4));
    if (!yrStartEq.has(yr)) yrStartEq.set(yr,eq);
    const active = filteredTrades.filter(t=>t.entryDate<=date&&t.exitDate>=date);
    if (active.length>maxConc) maxConc=active.length;
    if (active.length>0) barsActive++;
    let dr=0; const w=active.length>0?1/active.length:0;
    for (const t of active){
      const close=allGroupBarsForGroup.get(date)?.get((t as OosTrade&{assetId:string}).assetId);
      if(close==null) continue;
      const prev=prevCloseMap.has(t.tradeKey)?prevCloseMap.get(t.tradeKey)!:t.entryPrice;
      if(prev>0) dr+=w*(close-prev)/prev*(t.dir==="LONG"?1:-1);
      prevCloseMap.set(t.tradeKey,close);
      if(date>=t.exitDate) prevCloseMap.delete(t.tradeKey);
    }
    eq*=(1+dr); if(eq>peak) peak=eq;
    const dd=peak>0?(peak-eq)/peak:0; if(dd>maxDD) maxDD=dd;
    yrEndEq.set(yr,eq);
  }

  const oosYearsArr=Array.from(new Set(filteredTrades.map(t=>t.year))).sort((a,b)=>a-b);
  const n=oosYearsArr.length;
  const finalEq=eq-1;
  const cagr=n>0?(Math.pow(Math.max(eq,1e-9),1/n)-1)*100:0;
  const calmar=maxDD>0.001?(cagr/100)/maxDD:null;
  const wins=filteredTrades.filter(t=>t.tradeReturn>0).length;
  const wr=filteredTrades.length>0?wins/filteredTrades.length*100:0;
  const gw=filteredTrades.filter(t=>t.tradeReturn>0).reduce((s,t)=>s+t.tradeReturn,0);
  const gl=Math.abs(filteredTrades.filter(t=>t.tradeReturn<0).reduce((s,t)=>s+t.tradeReturn,0));
  const pf=gl>1e-9?gw/gl:(gw>0?99:0);
  const exposure=allDates.length>0?(barsActive/allDates.length)*100:0;
  const wstYr=oosYearsArr.length>0 ? oosYearsArr.reduce((a,b)=>{
    const retA=(yrEndEq.get(a)??1)/(yrStartEq.get(a)??1)-1;
    const retB=(yrEndEq.get(b)??1)/(yrStartEq.get(b)??1)-1;
    return retA<retB?a:b;
  }) : null;
  const wstRet=wstYr!=null ? parseFloat((((yrEndEq.get(wstYr)??1)/(yrStartEq.get(wstYr)??1)-1)*100).toFixed(2)) : null;

  const dur = Date.now() - startMs;

  // Counts of losers avoided and winners missed from veto
  const lossAvoided = vetoedTrades.length; // all vetoed (not in final set)
  // We don't have return info for vetoed trades easily, so report counts only

  return {
    status: "complete",
    runDurationMs: dur,
    preMovePolicyVersion: "veto_p90_is_only_v1",
    lookbackTradingDays: PRE_ENTRY_LOOKBACK_DAYS,

    baseline: {
      note: "From previous runAgricultureGroupPortfolio run",
      trades: 574, compoundReturn: 164.62, cagr: 6.27, profitFactor: 1.132, barLevelMaxDrawdown: 37.63, barLevelCalmar: 0.167,
      worstYear: 2013, worstYearReturn: -24.21, maxConcurrentPositions: 4, exposureTimePct: 90.1,
    },

    preMoveP90: {
      oosTradesFinal: filteredTrades.length,
      baselinePatternTrades: baselineTradeCount,
      tradesVetoed: vetoedTrades.length,
      winRate: parseFloat(wr.toFixed(1)),
      compoundReturn: parseFloat((finalEq*100).toFixed(2)),
      cagr: parseFloat(cagr.toFixed(2)),
      profitFactor: parseFloat(pf.toFixed(3)),
      barLevelMaxDrawdown: parseFloat((maxDD*100).toFixed(2)),
      barLevelCalmar: calmar!=null?parseFloat(calmar.toFixed(3)):null,
      worstYear: wstYr, worstYearReturn: wstRet,
      maxConcurrentPositions: maxConc,
      exposureTimePct: parseFloat(exposure.toFixed(1)),
    },

    delta: {
      compoundReturn: parseFloat((finalEq*100 - 164.62).toFixed(2)),
      maxDrawdown: parseFloat((maxDD*100 - 37.63).toFixed(2)),
      calmar: calmar!=null ? parseFloat((calmar - 0.167).toFixed(3)) : null,
    },

    conclusion: (finalEq*100 < 164.62 || (calmar!=null && calmar < 0.167)) ? "worse" : "neutral",
    portfolioPromotionStatus: "rejected",
    note: "Pre-Move P90 is a research sensitivity only. Agriculture Group remains rejected for portfolio promotion regardless of result.",
  };
}

// ── Agriculture Group PURE Pre-Move P90 Veto ─────────────────────────────────
// Pure veto: get exact baseline trade set, then veto exhausted trades only.
// No refill — when a trade is vetoed, its slot is simply empty.
async function runAgricultureGroupPurePreMoveVeto(): Promise<Record<string, unknown>> {
  const startMs = Date.now();

  // Step 1: Reconstruct the exact baseline trade set
  // This mirrors runAgricultureGroupPortfolio but returns the individual trade list
  const assetIds = Object.keys(AGRI_REGISTRY);
  const assetBarsMap = new Map<string, DailyBar[]>();
  const assetCloseMapsMap = new Map<string, { map: Map<number,Map<number,number>>; years: number[] }>();
  for (const aid of assetIds) {
    const loaded = await loadAssetBars(aid);
    if (!loaded) continue;
    const fb = loaded.bars.filter(b=>{const y=parseInt(b.date.slice(0,4));return y>=STUDY_START&&y<=STUDY_END;});
    assetBarsMap.set(aid, fb);
    assetCloseMapsMap.set(aid, buildCloseMap(fb, STUDY_START, STUDY_END));
  }

  // Collect all fold-level OOS trades (same as group baseline)
  const allGroupTrades: (OosTrade & { assetId: string; patternKey: string; patternSlot: number; patternDir: "LONG"|"SHORT" })[] = [];
  for (const aid of assetIds) {
    const bars = assetBarsMap.get(aid);
    const cmData = assetCloseMapsMap.get(aid);
    if (!bars || !cmData) continue;
    const { allOosTrades } = runFoldLevelPortfolio(bars, cmData.map, cmData.years);
    for (const t of allOosTrades) {
      // Parse pattern key to get slot and direction
      const m = t.tradeKey.match(/^(LONG|SHORT)_s(\d+)_h(\d+)_y/);
      const patDir = m ? (m[1] as "LONG"|"SHORT") : t.dir;
      const patSlot = m ? parseInt(m[2]) : 0;
      allGroupTrades.push({ ...t, assetId: aid, tradeKey: `${aid}_${t.tradeKey}`, patternKey: t.tradeKey, patternSlot: patSlot, patternDir: patDir });
    }
  }

  // Apply max-4 concurrent constraint to get EXACT BASELINE trade set
  const sortedGroupTrades = [...allGroupTrades].sort((a,b) => a.entryDate.localeCompare(b.entryDate));
  const baselineTrades: typeof sortedGroupTrades = [];
  for (const t of sortedGroupTrades) {
    const active = baselineTrades.filter(ft => ft.entryDate <= t.entryDate && ft.exitDate >= t.entryDate);
    const sameAssetActive = active.filter(ft => ft.assetId === t.assetId);
    if (sameAssetActive.length > 0) continue;
    if (active.length >= 4) continue;
    baselineTrades.push(t);
  }

  // Step 2: For each BASELINE trade, check pre-move exhaustion (using IS thresholds)
  const vetoedBaseline: string[] = [];
  const losingTradesAvoided_pv: number[] = [];
  const winningTradesMissed_pv: number[] = [];

  const pureTrades = baselineTrades.filter(t => {
    // Find the fold for this trade's year
    const cmData = assetCloseMapsMap.get(t.assetId);
    if (!cmData || t.patternSlot === 0) return true; // keep if can't compute

    const { map: cm, years: ay } = cmData;
    const tradeYear = t.year;

    // Find fold IS/OOS boundary
    for (let fi = 0; ; fi++) {
      const oosStart = STUDY_START + IT + fi * OOS;
      const isYears = ay.filter(y => y < oosStart);
      const oosYears = ay.filter(y => y >= oosStart && y < oosStart + OOS);
      if (isYears.length < IT || oosYears.length === 0) break;
      if (!oosYears.includes(tradeYear)) continue;

      // Compute IS P90 threshold for this pattern
      const isMap = new Map<number,Map<number,number>>();
      for (const yr of isYears) { const m = cm.get(yr); if (m) isMap.set(yr, m); }
      const thresh = computeISPreEntryThresholds(isMap, isYears, t.patternSlot, t.patternDir);
      if (thresh.p90 === null) return true; // keep if insufficient IS data

      // Compute pre-move for this OOS year
      const preMove = computePreEntryDirectionalMove(cm, [...isYears, tradeYear], tradeYear, t.patternSlot, t.patternDir);
      if (!preMove) return true; // keep if can't compute

      if (preMove.directionalPreMove > thresh.p90) {
        vetoedBaseline.push(t.tradeKey);
        const ret = t.tradeReturn;
        if (ret < 0) losingTradesAvoided_pv.push(ret);
        else if (ret > 0) winningTradesMissed_pv.push(ret);
        return false; // VETOED
      }
      return true; // keep
    }
    return true; // keep if no fold matches
  });

  // Step 3: Compute bar-level equity from PURE vetoed trades only
  const allGroupBars2 = new Map<string, Map<string,number>>();
  for (const aid of assetIds) {
    const bars = assetBarsMap.get(aid);
    if (!bars) continue;
    for (const bar of bars) {
      const y = parseInt(bar.date.slice(0,4));
      if (y < STUDY_START+IT || y > STUDY_END) continue;
      if (!allGroupBars2.has(bar.date)) allGroupBars2.set(bar.date, new Map());
      allGroupBars2.get(bar.date)!.set(aid, bar.close);
    }
  }

  const allDates2 = Array.from(allGroupBars2.keys()).sort();
  const prevCloseMap2 = new Map<string,number>();
  let eq2=1, peak2=1, maxDD2=0, barsActive2=0, maxConc2=0;
  const yrStartEq2 = new Map<number,number>(), yrEndEq2 = new Map<number,number>();

  for (const date of allDates2) {
    const yr=parseInt(date.slice(0,4));
    if (!yrStartEq2.has(yr)) yrStartEq2.set(yr,eq2);
    const active2 = pureTrades.filter(t=>t.entryDate<=date&&t.exitDate>=date);
    if (active2.length>maxConc2) maxConc2=active2.length;
    if (active2.length>0) barsActive2++;
    let dr=0; const w=active2.length>0?1/active2.length:0;
    for (const t of active2) {
      const close=allGroupBars2.get(date)?.get(t.assetId);
      if(close==null) continue;
      const prev=prevCloseMap2.has(t.tradeKey)?prevCloseMap2.get(t.tradeKey)!:t.entryPrice;
      if(prev>0) dr+=w*(close-prev)/prev*(t.dir==="LONG"?1:-1);
      prevCloseMap2.set(t.tradeKey,close);
      if(date>=t.exitDate) prevCloseMap2.delete(t.tradeKey);
    }
    eq2*=(1+dr); if(eq2>peak2) peak2=eq2;
    const dd2=peak2>0?(peak2-eq2)/peak2:0; if(dd2>maxDD2) maxDD2=dd2;
    yrEndEq2.set(yr,eq2);
  }

  const oosYears2=Array.from(new Set(pureTrades.map(t=>t.year))).sort((a,b)=>a-b);
  const n2=oosYears2.length;
  const finalEq2=eq2-1;
  const cagr2=n2>0?(Math.pow(Math.max(eq2,1e-9),1/n2)-1)*100:0;
  const calmar2=maxDD2>0.001?(cagr2/100)/maxDD2:null;
  const wins2=pureTrades.filter(t=>t.tradeReturn>0).length;
  const wr2=pureTrades.length>0?wins2/pureTrades.length*100:0;
  const gw2=pureTrades.filter(t=>t.tradeReturn>0).reduce((s,t)=>s+t.tradeReturn,0);
  const gl2=Math.abs(pureTrades.filter(t=>t.tradeReturn<0).reduce((s,t)=>s+t.tradeReturn,0));
  const pf2=gl2>1e-9?gw2/gl2:(gw2>0?99:0);
  const exp2=allDates2.length>0?(barsActive2/allDates2.length)*100:0;
  const wstYr2=oosYears2.reduce((a,b)=>{
    const ra=(yrEndEq2.get(a)??1)/(yrStartEq2.get(a)??1)-1;
    const rb=(yrEndEq2.get(b)??1)/(yrStartEq2.get(b)??1)-1;
    return ra<rb?a:b;
  }, oosYears2[0]);
  const wstRet2=wstYr2!=null?parseFloat((((yrEndEq2.get(wstYr2)??1)/(yrStartEq2.get(wstYr2)??1)-1)*100).toFixed(2)):null;

  const dur = Date.now() - startMs;

  return {
    variantName: "PURE_PRE_MOVE_P90_VETO",
    description: "Applies pre-move veto ONLY to the exact baseline trade set. No refill. Vetoed trades simply removed; freed capacity not used.",
    runDurationMs: dur,
    pureVetoDefinition: {
      sameFoldFrozenPatternSetsAsBaseline: true,
      sameBaselineTradeUniverseBeforeVeto: true,
      allowReplacementTradesAfterVeto: false,
      allowFreedCapacityRefill: false,
    },

    baseline: {
      trades: baselineTrades.length,
      compoundReturn: 164.62, cagr: 6.27, profitFactor: 1.132,
      barLevelMaxDrawdown: 37.63, barLevelCalmar: 0.167,
      note: "From runAgricultureGroupPortfolio",
    },

    pureVeto: {
      baselineTrades: baselineTrades.length,
      vetoedBaselineTrades: vetoedBaseline.length,
      losingTradesAvoided: losingTradesAvoided_pv.length,
      winningTradesMissed: winningTradesMissed_pv.length,
      finalTrades: pureTrades.length,
      tradeConservationCheck: `${baselineTrades.length} - ${vetoedBaseline.length} = ${baselineTrades.length - vetoedBaseline.length} (actual: ${pureTrades.length})`,
      winRate: parseFloat(wr2.toFixed(1)),
      compoundReturn: parseFloat((finalEq2*100).toFixed(2)),
      cagr: parseFloat(cagr2.toFixed(2)),
      profitFactor: parseFloat(pf2.toFixed(3)),
      barLevelMaxDrawdown: parseFloat((maxDD2*100).toFixed(2)),
      barLevelCalmar: calmar2!=null?parseFloat(calmar2.toFixed(3)):null,
      worstYear: wstYr2, worstYearReturn: wstRet2,
      maxConcurrentPositions: maxConc2,
      exposureTimePct: parseFloat(exp2.toFixed(1)),
    },

    delta: {
      compoundReturn: parseFloat((finalEq2*100 - 164.62).toFixed(2)),
      maxDrawdown: parseFloat((maxDD2*100 - 37.63).toFixed(2)),
      calmar: calmar2!=null?parseFloat((calmar2 - 0.167).toFixed(3)):null,
    },

    conclusion: (finalEq2*100 < 164.62) ? "worse" : (finalEq2*100 > 164.62 * 1.05 ? "exploratory_improvement_not_promotable" : "neutral"),
    portfolioPromotionStatus: "rejected",

    refillVariantNote: {
      refillVariantTrades: 581,
      refillVariantReturn: "+94.28%",
      refillVariantCalmar: 0.084,
      explanation: "The 581-trade variant (runAgricultureGroupWithPreMoveP90) allowed freed max-4 capacity to be filled by previously-blocked trades. That is a 'Veto + Refill' variant, NOT a pure veto.",
    },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { action?: string; assetId?: string };

    if (body.action === "runStrategyEngine") {
      const requestedAsset = (body.assetId ?? "soybeans").toLowerCase();
      // Accept both legacy IDs and new IDs
      const assetId = requestedAsset === "orange-juice" ? "orangejuice" : requestedAsset;

      if (!AGRI_REGISTRY[assetId]) {
        return NextResponse.json({
          engineVersion: ENGINE_VERSION,
          status: "asset_not_supported",
          requestedAssetId: assetId,
          supportedAssets: Object.keys(AGRI_REGISTRY),
          message: `Strategy Engine supports: ${Object.keys(AGRI_REGISTRY).join(", ")}`,
        }, { status: 200 });
      }
      const result = await runEngineForAsset(assetId);
      return NextResponse.json(result, { status: 200 });
    }

    if (body.action === "runAgricultureGroup") {
      const result = await runAgricultureGroupPortfolio();
      return NextResponse.json(result, { status: 200 });
    }

    if (body.action === "runAgricultureEligibilityPolicies") {
      const result = await runAgricultureEligibilityPolicies();
      return NextResponse.json(result, { status: 200 });
    }

    if (body.action === "runAgricultureGroupWithPreMoveP90") {
      // Legacy: Veto + Refill variant (previously computed)
      const result = await runAgricultureGroupWithPreMoveP90();
      return NextResponse.json({ ...result, variantName: "PRE_MOVE_P90_VETO_WITH_REFILL", refillNote: "When trades are vetoed, freed max-4 capacity allows previously-blocked trades to enter. This is NOT a pure veto." }, { status: 200 });
    }

    if (body.action === "runAgricultureGroupPurePreMoveVeto") {
      // DEPRECATED: This was an intermediate-universe variant, not true pure veto.
      // Use runTrueExecutedBaselinePureVeto instead.
      const result = await runAgricultureGroupPurePreMoveVeto();
      return NextResponse.json({ ...result, DEPRECATED_NOTE: "This variant uses a reconstructed 627-trade universe (INTERMEDIATE_UNIVERSE_PRE_MOVE_VETO_NO_REFILL), not the official 574-trade baseline. Use runTrueExecutedBaselinePureVeto for the correct pure veto test." }, { status: 200 });
    }

    if (body.action === "runTrueExecutedBaselinePureVeto") {
      const result = await runTrueExecutedBaselinePureVeto();
      return NextResponse.json(result, { status: 200 });
    }

    if (body.action === "extendedHistorySensitivity") {
      const requestedAsset = (body.assetId ?? "soybeans").toLowerCase();
      const assetDef = AGRI_REGISTRY[requestedAsset];
      if (!assetDef) return NextResponse.json({ error: `Unsupported: ${requestedAsset}` }, { status: 200 });

      const loaded = await loadAssetBars(requestedAsset);
      if (!loaded) return NextResponse.json({ error: `CSV not found` }, { status: 200 });

      const startMs3 = Date.now();
      // Find earliest complete year (≥200 bars)
      const yearCounts = new Map<number, number>();
      for (const bar of loaded.bars) {
        const y = parseInt(bar.date.slice(0,4));
        yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
      }
      const completeYears = Array.from(yearCounts.entries())
        .filter(([,cnt]) => cnt >= 200)
        .map(([y]) => y)
        .sort((a,b) => a-b);

      const extendedStart = completeYears[0];
      const extendedEnd = STUDY_END;
      const extendedFoldCount = Math.floor((extendedEnd - extendedStart - IT) / OOS);

      // Build extended study close map
      const extBars = loaded.bars.filter(b => {
        const y = parseInt(b.date.slice(0,4));
        return y >= extendedStart && y <= extendedEnd;
      });
      const { map: extMap, years: extYears } = buildCloseMap(extBars, extendedStart, extendedEnd);

      // Run candidate matrix on extended history
      const extMatrix = computeCandidateOosReturnMatrix(extMap, extYears, extendedStart);
      const extRC = computeRealityCheck(extMatrix, 10000, 42);

      // CSCV / PBO on extended history (sensitivity only)
      const extFoldCount = new Set(extMatrix.map(c => c.foldIdx)).size;
      const extFamilyFoldMap = new Map<string, number[]>();
      for (const c of extMatrix.filter(c => c.meanOosReturn !== null)) {
        const key = `${c.direction}_s${c.entrySlot}_h${c.holdingDays}`;
        if (!extFamilyFoldMap.has(key)) extFamilyFoldMap.set(key, new Array(extFoldCount).fill(0));
        extFamilyFoldMap.get(key)![c.foldIdx] = c.meanOosReturn!;
      }
      const extCSCV = computeCSCV(extFamilyFoldMap, requestedAsset, "extended_sensitivity", 500, 42);

      const pboFeasible = extendedFoldCount >= 16;
      const pboNote = pboFeasible
        ? `${extendedFoldCount} OOS folds — CSCV computed as sensitivity study`
        : `Only ${extendedFoldCount} folds — borderline`;

      return NextResponse.json({
        assetId: requestedAsset,
        studyType: "sensitivity_only",
        primaryStudyRange: `${STUDY_START}-${STUDY_END}`,
        extendedStartYear: extendedStart,
        extendedEndYear: extendedEnd,
        extendedFoldCount,
        extendedUniqueYears: extYears.length,
        pboFeasible,
        pboNote,
        extendedRealityCheck: extRC,
        extendedCSCV: extCSCV,            // CSCV/PBO on extended history (sensitivity)
        extendedCandidateRawEntries: extMatrix.length,
        extendedUniqueFamilies: extRC.uniqueCandidateFamilies,
        regimeCaveat: "Data from pre-2000 may reflect different market structure, contract specs, and trading environment. Use as sensitivity only, not as primary evidence.",
        realityCheckFormalizationStatus: REALITY_CHECK_FORMALIZATION_STATUS,
        directionConsistency: {
          primaryRCPassed: null, // will be compared by caller
          extendedRCPassed: extRC.passed,
          extendedCSCV_PBO: extCSCV.pbo,
          note: "Consistent results in both primary and extended strengthen confidence. Inconsistent results require further investigation.",
        },
        runDurationMs: Date.now() - startMs3,
      }, { status: 200 });
    }

    if (body.action === "generateCandidateMatrix") {
      const requestedAsset = (body.assetId ?? "soybeans").toLowerCase();
      const assetDef = AGRI_REGISTRY[requestedAsset];
      if (!assetDef) return NextResponse.json({ error: `Unsupported: ${requestedAsset}` }, { status: 200 });

      const loaded = await loadAssetBars(requestedAsset);
      if (!loaded) return NextResponse.json({ error: `CSV not found for ${requestedAsset}` }, { status: 200 });

      const startMs2 = Date.now();
      const filteredBars2 = loaded.bars.filter(b => {
        const y = parseInt(b.date.slice(0,4)); return y >= STUDY_START && y <= STUDY_END;
      });
      const { map: cm2, years: ay2 } = buildCloseMap(filteredBars2, STUDY_START, STUDY_END);

      // Generate candidate OOS return matrix
      const matrix = computeCandidateOosReturnMatrix(cm2, ay2);

      // Run Reality Check on the matrix (10k resamples for audit)
      const realityCheck = computeRealityCheck(matrix, 10000, 42);

      // The CORRECT trial count for DSR:
      // - Configured candidate universe: MAX_SLOT/STEP × 2 dirs × 6 holdings = 116 × 2 × 6 = 1392
      // - The matrix contains (candidate, fold) PAIRS (different folds = different entries for same candidate)
      // - For DSR, use the CONFIGURED universe (1392) which matches the actual search space
      const configuredUniverse = Math.floor(MAX_SLOT / STEP) * 2 * HOLD_CANDS.length; // = 1392
      const uniqueFamilyCount = realityCheck.uniqueCandidateFamilies;

      // Best unique family by mean OOS return (for matrix-based DSR)
      // Build unique family means across folds
      const familyReturns = new Map<string, number[]>();
      for (const c of matrix.filter(c => c.meanOosReturn !== null)) {
        const key = `${c.direction}_s${c.entrySlot}_h${c.holdingDays}`;
        if (!familyReturns.has(key)) familyReturns.set(key, []);
        familyReturns.get(key)!.push(c.meanOosReturn!);
      }
      const bestFamilyReturns = Array.from(familyReturns.values())
        .sort((a,b) => (b.reduce((s,r)=>s+r,0)/b.length) - (a.reduce((s,r)=>s+r,0)/a.length))[0] ?? [];

      // DSR on best family: use configured universe K=1392 (correct trial count)
      const matrixDSR = computeDSR(bestFamilyReturns, configuredUniverse, `${requestedAsset}_matrix_best`);

      // CSCV / PBO on primary study fold blocks
      const foldCount = new Set(matrix.map(c => c.foldIdx)).size;
      // Build per-fold return vectors for all unique families
      const familyFoldMap = new Map<string, number[]>();
      for (const c of matrix.filter(c => c.meanOosReturn !== null)) {
        const key = `${c.direction}_s${c.entrySlot}_h${c.holdingDays}`;
        const foldIdx = c.foldIdx;
        if (!familyFoldMap.has(key)) familyFoldMap.set(key, new Array(foldCount).fill(0));
        familyFoldMap.get(key)![foldIdx] = c.meanOosReturn!;
      }
      const cscvResult = computeCSCV(familyFoldMap, requestedAsset, "primary_2000_2025", 200, 42);

      return NextResponse.json({
        assetId: requestedAsset,
        studyRange: { start: STUDY_START, end: STUDY_END },
        matrixVersion: "candidate_oos_return_matrix_v1",
        rawEntryCount: matrix.length,
        uniqueCandidateFamilies: uniqueFamilyCount,
        configuredUniverse,
        foldCount,
        observationUnit: "oos_fold_close_to_close_return",
        candidateUniverseNote: "rawEntryCount is (candidate×fold) pairs. configuredUniverse=1392 is unique (dir,slot,hd) combinations = correct K for DSR.",
        runDurationMs: Date.now() - startMs2,
        realityCheck,
        cscvResult,                                // CSCV/PBO on primary study
        matrixDSR,
        // Include condensed matrix (top entries by mean OOS return)
        matrixSummary: {
          topCandidatesByMeanOosReturn: matrix.filter(c => c.meanOosReturn !== null)
            .sort((a,b) => (b.meanOosReturn ?? 0) - (a.meanOosReturn ?? 0))
            .slice(0, 20).map(c => ({
            candidateId: c.candidateId,
            direction: c.direction,
            entrySlot: c.entrySlot,
            holdingDays: c.holdingDays,
            foldIdx: c.foldIdx,
            isWinRate: parseFloat(c.isWinRate.toFixed(1)),
            meanOosReturn: c.meanOosReturn != null ? parseFloat((c.meanOosReturn * 100).toFixed(3)) : null,
          })),
        },
        researchNote: "Candidate matrix for SPA/Reality Check. All IS pre-filtered candidates and their OOS returns. NOT validated patterns only. RC uses uniqueCandidateFamilies (not rawEntryCount). DSR uses configuredUniverse=1392.",
      }, { status: 200 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[strategy-engine]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
