"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";

import type { DailySeasonalResult } from "@/lib/seasonality/dailySeasonalChart";
import {
  getAssetDef,
  DEFAULT_SEASONAL_ASSET_ID,
} from "@/lib/seasonality/walkForward/assetManifest";
import type {
  SavedSeasonalPattern,
  WFResearchGateStatus,
  WalkForwardResult,
} from "@/lib/seasonality/walkForward/types";
import type {
  PatternDataResult,
  PatternCandidate,
} from "@/lib/seasonality/patternSelection";
import { monthDayToApproxSlot, type OscillatorMode } from "@/lib/seasonality/patternSelection";
import { computePatternComparison, type PatternComparison } from "@/lib/seasonality/patternComparison";
import type { FixedBacktestResult } from "@/lib/seasonality/fixedPatternBacktest";
import {
  readWorkspaceState,
  patchWorkspaceState,
  type WorkspaceLockedPatternContext,
} from "@/lib/seasonality/useSeasonalityWorkspace";
import {
  patternQualityKey,
  type PatternQualityEntry,
  QUALITY_DEFAULT_INITIAL_TRAINING_YEARS,
  QUALITY_DEFAULT_OOS_BLOCK_YEARS,
} from "@/lib/seasonality/patternQuality";
import type { PatternFamilyWFResult } from "@/lib/seasonality/patternFamilyWalkForward";

import { SeasonalAssetSelectorOverlay } from "./SeasonalAssetSelectorOverlay";
import { SeasonalCombinedChartPanel } from "./SeasonalCombinedChartPanel";
import { SeasonalSettingsPopover } from "./SeasonalSettingsPopover";
import { useSeasonalitySettings } from "@/lib/seasonality/useSeasonalitySettings";
import { SeasonalStrategyTester, type RunConfig } from "./SeasonalStrategyTester";
import {
  SeasonalRightPanel,
  type ActivePatternSource,
  type DisplayPatternMode,
  type SavedPatternRow,
} from "./SeasonalRightPanel";
import { SeasonalityMonitoringAssetIcon } from "./SeasonalityMonitoringAssetIcon";
import { StrategyEnginePanel } from "./strategyEngine/StrategyEnginePanel";
import styles from "./seasonal.module.css";

interface Props {
  onSwitchToLegacy?: () => void;
}

type CachedSeasonalityWorkspaceView = {
  chartResult: DailySeasonalResult | null;
  patternData: PatternDataResult | null;
  todaySlot: number | null;
};

const seasonalWorkspaceViewCache = new Map<string, CachedSeasonalityWorkspaceView>();
const seasonalWorkspaceWfCache = new Map<string, WalkForwardResult | null>();
const sharedPatternQualityCache = new Map<string, PatternQualityEntry>();

function workspaceViewCacheKey(assetId: string, lookbackYears: number): string {
  return `${String(assetId || "").trim()}|${Number(lookbackYears)}`;
}

function clampSlot(slot: number): number {
  return Math.max(1, Math.min(251, Math.round(slot)));
}

function resolvePatternCandidate(
  patternData: PatternDataResult | null,
  direction: PatternCandidate["direction"],
  startSlot: number,
  holdingDays: number,
  fallback: PatternCandidate | null = null,
): PatternCandidate | null {
  if (!patternData) return fallback;
  const candidates = (patternData as { candidatesBySlot?: Record<number, PatternCandidate[]> }).candidatesBySlot?.[startSlot] ?? [];
  const exact = candidates.find((candidate) =>
    candidate.direction === direction
    && candidate.startSlot === startSlot
    && candidate.holdingDays === holdingDays,
  );
  if (exact) return exact;
  if (
    fallback
    && fallback.direction === direction
    && fallback.startSlot === startSlot
    && fallback.holdingDays === holdingDays
  ) {
    return fallback;
  }
  if (!fallback) return null;
  return {
    ...fallback,
    direction,
    startSlot,
    endSlot: startSlot + holdingDays,
    holdingDays: holdingDays as PatternCandidate["holdingDays"],
    approxMonthLabel: fallback.approxMonthLabel,
    entryDateLabel: fallback.entryDateLabel,
    exitDateLabel: fallback.exitDateLabel,
  };
}

export function SeasonalResearchDashboard({ onSwitchToLegacy: _unused }: Props) {
  // ── Workspace persistence: read once on mount, no flash to defaults ──────────
  const [initialWs] = useState(() => readWorkspaceState());

  const [assetId, setAssetIdRaw] = useState<string>(initialWs.selectedAssetId);
  const [lookbackYears, setLookbackYearsRaw] = useState<number>(initialWs.lookbackYears);

  // Persisting setters
  const setAssetId = useCallback((id: string) => {
    setAssetIdRaw(id);
    patchWorkspaceState({ selectedAssetId: id });
  }, []);
  const setLookbackYears = useCallback((y: number) => {
    setLookbackYearsRaw(y);
    patchWorkspaceState({ lookbackYears: y });
  }, []);

  const [oscillatorMode, setOscillatorModeRaw] = useState<OscillatorMode>(
    () => (["WR", "SR", "QS"] as OscillatorMode[]).includes(initialWs.oscillatorMode as OscillatorMode)
      ? initialWs.oscillatorMode as OscillatorMode : "WR"
  );
  const setOscillatorMode = useCallback((m: OscillatorMode) => {
    setOscillatorModeRaw(m);
    patchWorkspaceState({ oscillatorMode: m });
  }, []);

  // Pending pattern context to restore after patternData first loads
  const pendingRestoreCtx = useRef<WorkspaceLockedPatternContext | null>(
    initialWs.lockedPatternContext ?? null,
  );
  const [showAssetSelector, setShowAssetSelector] = useState(false);

  const [todaySlot, setTodaySlot] = useState<number | null>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [lockedPattern, setLockedPattern] = useState<PatternCandidate | null>(null);
  const [lockedPatternGateStatus, setLockedPatternGateStatus] = useState<WFResearchGateStatus | null>(null);
  const [activePatternId, setActivePatternId] = useState<string | null>(null);
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);

  const [chartResult, setChartResult] = useState<DailySeasonalResult | null>(null);
  const [chartLoading, setChartLoading] = useState(false);

  const [patternData, setPatternData] = useState<PatternDataResult | null>(null);
  const [patternLoading, setPatternLoading] = useState(false);

  const [wfResult, setWfResult] = useState<WalkForwardResult | null>(null);
  const [wfLoading, setWfLoading] = useState(false);
  const [wfError, setWfError] = useState("");
  const [selectedPfwfResult, setSelectedPfwfResult] = useState<PatternFamilyWFResult | null>(null);

  const [backtestResult, setBacktestResult] = useState<FixedBacktestResult | null>(null);
  const [patternComparison, setPatternComparison] = useState<PatternComparison | null>(null);

  // Qualified Next Pattern state — determined by the quality-gate state machine.
  // Only patterns with qualityScore >= 75 (Strong/Excellent) are shown; others are skipped.
  const QUALITY_MIN_SCORE = 75;
  const [qualNextLong, setQualNextLong]             = useState<PatternCandidate | null>(null);
  const [qualNextLongSearching, setQualNextLongSearching] = useState(false);
  const [qualNextShort, setQualNextShort]           = useState<PatternCandidate | null>(null);
  const [qualNextShortSearching, setQualNextShortSearching] = useState(false);

  // ── Quality orchestration ────────────────────────────────────────────────────
  // In-memory cache: key → PatternQualityEntry. Ref = no re-render on write.
  const qualityCache = useRef<Map<string, PatternQualityEntry>>(sharedPatternQualityCache);
  const qualityQueueRef = useRef<Promise<void>>(Promise.resolve());
  // ── QS Progressive Bar Builder ───────────────────────────────────────────────
  // Used when patternData.qsBars is not precomputed. Fills bars left→right, max concurrency 1.
  const [qsLiveBars, setQsLiveBars] = useState<Map<number, { slot: number; value: number; candidate: PatternCandidate | null }>>(new Map());
  const qsQueueRef     = useRef<number[]>([]);
  const qsActiveSlot   = useRef<number | null>(null);
  const qsBuildAsset   = useRef<string | null>(null);
  // Incrementing counter to force re-renders when cache content changes.
  const [qualityTick, setQualityTick] = useState(0);
  // Tracks in-flight runs to prevent duplicate concurrent requests.
  const qualityRunning = useRef<Set<string>>(new Set());
  // Auto-run state mirrored from SeasonalStrategyTester via onAutoRunChange callback.
  const [autoRunEnabled, setAutoRunEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("seasonality.walkForward.autoRunEnabled") === "true";
  });

  const { settings, updateSetting } = useSeasonalitySettings();

  const runRef = useRef(false);
  // PERF: RAF throttle for hover — prevents flooding state on every mouse pixel
  const hoverRafRef   = useRef<number>(0);
  const lastHoverRef  = useRef<number | null>(null);
  const setHoverSlotThrottled = useCallback((slot: number | null) => {
    if (slot === lastHoverRef.current) return;
    if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
    hoverRafRef.current = requestAnimationFrame(() => {
      lastHoverRef.current = slot;
      setHoverSlot(slot);
    });
  }, []);
  const assetDef = getAssetDef(assetId);

  const hoverPattern = useMemo(() => {
    if (hoverSlot == null || !patternData) return null;
    return patternData.bestPatternBySlot[clampSlot(hoverSlot)] ?? null;
  }, [hoverSlot, patternData]);

  // Default Today Pattern: best historical pattern starting at today's exact slot.
  // Shown in KPIs/Returns when no user lock exists. Never triggers a WF run.
  const defaultTodayPattern = useMemo(() => {
    if (!patternData || todaySlot == null) return null;
    const slot = clampSlot(todaySlot);
    // Try exact slot, then adjacent
    return patternData.bestPatternBySlot[slot]
      ?? patternData.bestPatternBySlot[slot + 1]
      ?? null;
  }, [patternData, todaySlot]);

  // Hover Preview: if ON, hoverPattern feeds the KPI display — cache lookup only, no computation
  const effectiveHoverPattern = settings.hoverPreview ? hoverPattern : null;
  const validatedNextPattern = qualNextLong ?? qualNextShort ?? null;

  // Priority: locked > hover > defaultToday > validatedNext
  const activePattern: PatternCandidate | null =
    lockedPattern ?? effectiveHoverPattern ?? defaultTodayPattern ?? validatedNextPattern;

  const activePatternSource: ActivePatternSource = lockedPattern
    ? "selected"
    : effectiveHoverPattern
      ? "hover"
      : (defaultTodayPattern || validatedNextPattern)
        ? "next"
        : "none";

  // PERF/FIX: safe JSON fetch — guards res.ok before .json() to prevent parse errors
  async function safeJson<T>(res: Response, fallback: T): Promise<T> {
    if (!res.ok) return fallback;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return fallback;
    try { return (await res.json()) as T; } catch { return fallback; }
  }

  // PERF: Single cache load — replaces two separate API calls with one pre-computed file read
  const loadChart = useCallback(async (aid: string, lookback: number) => {
    const cacheKey = workspaceViewCacheKey(aid, lookback);
    const cachedView = seasonalWorkspaceViewCache.get(cacheKey);
    if (cachedView) {
      setChartResult(cachedView.chartResult);
      setPatternData(cachedView.patternData);
      setTodaySlot(cachedView.todaySlot);
      setChartLoading(false);
      setPatternLoading(false);
      return;
    }

    setChartLoading(true);
    setPatternLoading(true);
    try {
      // Try pre-computed cache first (fast — just reads a JSON file)
      const cacheRes = await fetch("/api/seasonality/walk-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "loadSeasonalityCache", assetId: aid, lookbackYears: lookback }),
      });

      if (cacheRes.ok) {
        // Cache hit — parse once and set all state
        const cache = await safeJson<{
          seasonalCurve?: DailySeasonalResult;
          patternIndex?: PatternDataResult & { error?: string };
          error?: string;
        }>(cacheRes, {});

        if (cache.seasonalCurve?.points) {
          setChartResult(cache.seasonalCurve);
        }
        if (cache.patternIndex && !cache.patternIndex.error && cache.patternIndex.winrateBars) {
          setPatternData(cache.patternIndex);
          setTodaySlot(cache.patternIndex.todaySlot);
          seasonalWorkspaceViewCache.set(cacheKey, {
            chartResult: cache.seasonalCurve?.points ? cache.seasonalCurve : null,
            patternData: cache.patternIndex,
            todaySlot: cache.patternIndex.todaySlot ?? null,
          });
          return; // Full cache hit — chart + patterns done
        }

        // Chart from cache but no pattern data — fetch patterns live (static cache has patternIndex: null)
        if (cache.seasonalCurve?.points) {
          const patternRes = await fetch("/api/seasonality/walk-forward", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "loadPatternData", assetId: aid, lookbackYears: lookback }),
          });
          const patternData2 = await safeJson<Partial<PatternDataResult & { error?: string }>>(patternRes, {});
          const nextPatternData = patternData2 && !patternData2.error && patternData2.winrateBars
            ? patternData2 as PatternDataResult
            : null;
          if (nextPatternData) {
            setPatternData(nextPatternData);
            setTodaySlot(nextPatternData.todaySlot);
          }
          seasonalWorkspaceViewCache.set(cacheKey, {
            chartResult: cache.seasonalCurve,
            patternData: nextPatternData,
            todaySlot: nextPatternData?.todaySlot ?? null,
          });
          return;
        }
      }

      // Cache miss — fall back to individual API calls (cache needs to be built)
      const chartRes = await fetch("/api/seasonality/walk-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "loadSeasonalChart", assetId: aid, lookbackYears: lookback }),
      });
      const chartData = await safeJson<Partial<DailySeasonalResult & { error?: string }>>(chartRes, {});
      const nextChartResult = chartData && !chartData.error && chartData.points ? chartData as DailySeasonalResult : null;
      if (nextChartResult) setChartResult(nextChartResult);

      const patternRes = await fetch("/api/seasonality/walk-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "loadPatternData", assetId: aid, lookbackYears: lookback }),
      });
      const patternData2 = await safeJson<Partial<PatternDataResult & { error?: string }>>(patternRes, {});
      const nextPatternData = patternData2 && !patternData2.error && patternData2.winrateBars
        ? patternData2 as PatternDataResult
        : null;
      if (nextPatternData) {
        setPatternData(nextPatternData);
        setTodaySlot(nextPatternData.todaySlot);
      }
      seasonalWorkspaceViewCache.set(cacheKey, {
        chartResult: nextChartResult,
        patternData: nextPatternData,
        todaySlot: nextPatternData?.todaySlot ?? null,
      });
    } finally {
      setChartLoading(false);
      setPatternLoading(false);
    }
  }, []);

  // Kept for backward compat — merged into loadChart above
  const loadPatterns = useCallback(async (_aid: string, _lookback: number) => {
    // No-op: loadChart now loads both chart and patterns in one call
  }, []);

  const loadCache = useCallback(async (aid: string) => {
    if (seasonalWorkspaceWfCache.has(aid)) {
      setWfResult(seasonalWorkspaceWfCache.get(aid) ?? null);
      return;
    }
    try {
      const res = await fetch("/api/seasonality/walk-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "loadCachedResult", assetId: aid }),
      });
      const data = await safeJson<{ cached: WalkForwardResult | null }>(res, { cached: null });
      const cachedResult = data.cached ?? null;
      seasonalWorkspaceWfCache.set(aid, cachedResult);
      setWfResult(cachedResult);
    } catch {
      seasonalWorkspaceWfCache.set(aid, null);
      setWfResult(null);
    }
  }, []);

  useEffect(() => {
    loadChart(assetId, lookbackYears);
    loadPatterns(assetId, lookbackYears);
  }, [assetId, lookbackYears, loadChart, loadPatterns]);

  useEffect(() => {
    setWfResult(null);
    setHoverSlot(null);
    setLockedPattern(null);
    setLockedPatternGateStatus(null);
    setActivePatternId(null);
    setBacktestResult(null);
    setPatternComparison(null);
    setSelectedPfwfResult(null);
    loadCache(assetId);
  }, [assetId, loadCache]);

  useEffect(() => {
    setSelectedPfwfResult(null);
  }, [assetId, lockedPattern?.direction, lockedPattern?.holdingDays, lockedPattern?.startSlot]);

  // Restore locked pattern after patternData loads for the matching asset.
  // Fires once per restore cycle; pendingRestoreCtx is consumed on first valid match.
  useEffect(() => {
    if (!patternData) return;
    const ctx = pendingRestoreCtx.current;
    if (!ctx) return;
    if (ctx.assetId !== assetId) return;
    pendingRestoreCtx.current = null; // consume — do not re-run

    const slot = Math.max(1, Math.min(251, ctx.startSlot));
    // Try candidatesBySlot (present when computed live, absent from cache-only load)
    const candidates = (patternData as { candidatesBySlot?: Record<number, PatternCandidate[]> }).candidatesBySlot?.[slot] ?? [];
    const exact = candidates.find(
      c => c.direction === ctx.direction && c.holdingDays === ctx.holdingDays,
    );
    if (exact) { setLockedPattern(exact); return; }

    // Fallback: best pattern at slot must match direction + holdingDays exactly
    const best = patternData.bestPatternBySlot[slot];
    if (best && best.direction === ctx.direction && best.holdingDays === ctx.holdingDays) {
      setLockedPattern(best);
    } else {
      // Pattern no longer valid after cache rebuild — clear stored context
      patchWorkspaceState({ lockedPatternContext: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternData, assetId]);

  // ── Quality runner ────────────────────────────────────────────────────────────
  // Runs patternFamilyWalkForward for one pattern; skips if cache hit or in-flight.
  // No hover, no duplicate runs, no auto-start at Restore.
  const runQualityFor = useCallback(async (pattern: PatternCandidate | null) => {
    if (!pattern) return;
    const key = patternQualityKey(assetId, pattern,
      QUALITY_DEFAULT_INITIAL_TRAINING_YEARS, QUALITY_DEFAULT_OOS_BLOCK_YEARS);
    if (qualityCache.current.has(key) || qualityRunning.current.has(key)) return;

    qualityRunning.current.add(key);
    qualityCache.current.set(key, { status: "loading" });
    setQualityTick(t => t + 1);

    const task = async () => {
      try {
        const cacheRes = await fetch("/api/seasonality/walk-forward", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "loadPatternFamilyCache",
            assetId,
            direction: pattern.direction,
            startSlot: pattern.startSlot,
            baselineHoldingDays: pattern.holdingDays,
            initialTrainingYears: QUALITY_DEFAULT_INITIAL_TRAINING_YEARS,
            oosBlockYears: QUALITY_DEFAULT_OOS_BLOCK_YEARS,
          }),
        });
        if (!cacheRes.ok) throw new Error(`HTTP ${cacheRes.status}`);
        const cachePayload = await cacheRes.json() as { cached?: PatternFamilyWFResult | null };
        if (cachePayload.cached) {
          qualityCache.current.set(key, { status: "done", result: cachePayload.cached });
          return;
        }

        const res = await fetch("/api/seasonality/walk-forward", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "patternFamilyWalkForward",
            assetId,
            direction: pattern.direction,
            startSlot: pattern.startSlot,
            baselineHoldingDays: pattern.holdingDays,
            initialTrainingYears: QUALITY_DEFAULT_INITIAL_TRAINING_YEARS,
            oosBlockYears: QUALITY_DEFAULT_OOS_BLOCK_YEARS,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json() as PatternFamilyWFResult;
        qualityCache.current.set(key, { status: "done", result });
      } catch {
        qualityCache.current.set(key, { status: "error" });
      } finally {
        qualityRunning.current.delete(key);
        setQualityTick(t => t + 1);
      }
    };

    qualityQueueRef.current = qualityQueueRef.current.then(task, task);
    await qualityQueueRef.current;
  }, [assetId]);

  // Clear quality cache when asset changes
  useEffect(() => {
    qualityCache.current.clear();
    qualityRunning.current.clear();
    qualityQueueRef.current = Promise.resolve();
    setQualityTick(t => t + 1);
  }, [assetId]);

  // ── Next Pattern Quality-Gate State Machine ──────────────────────────────────
  // Iterates through the pre-qualified shortlist for each direction.
  // Runs PFWF for each candidate (once, no duplicates); shows the first that
  // passes qualityScore >= 75. Re-evaluates whenever the quality cache updates.
  //
  // No run on hover. No duplicate runs (guarded by qualityRunning ref).
  const advanceQualSearch = useCallback((
    rawCandidates: PatternCandidate[] | undefined,
    fallback: PatternCandidate | null | undefined,
    setResult: (p: PatternCandidate | null) => void,
    setSearching: (v: boolean) => void,
  ) => {
    // Shortlist: use new list or fall back to single legacy candidate
    const candidates: PatternCandidate[] =
      rawCandidates?.length
        ? rawCandidates
        : (fallback ? [fallback] : []);

    if (candidates.length === 0) { setResult(null); setSearching(false); return; }

    for (const cand of candidates) {
      const key = patternQualityKey(assetId, cand,
        QUALITY_DEFAULT_INITIAL_TRAINING_YEARS, QUALITY_DEFAULT_OOS_BLOCK_YEARS);
      const entry = qualityCache.current.get(key);

      if (!entry) {
        // Not cached: trigger PFWF (guarded against duplicates) and wait
        void runQualityFor(cand);
        setResult(null); setSearching(true); return;
      }
      if (entry.status === "loading") {
        // Currently running: wait for qualityTick update
        setResult(null); setSearching(true); return;
      }
      if (entry.status === "done" && entry.result.quality.qualityScore >= QUALITY_MIN_SCORE) {
        // Passes gate: select this candidate
        setResult(cand); setSearching(false); return;
      }
      // Done but failed gate: continue to next candidate in list
    }

    // All candidates tried and none passed quality gate
    setResult(null); setSearching(false);
  }, [assetId, runQualityFor, QUALITY_MIN_SCORE]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    advanceQualSearch(
      patternData?.nextPatternLongCandidates,
      patternData?.nextPatternLong,
      setQualNextLong,
      setQualNextLongSearching,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternData?.nextPatternLongCandidates, patternData?.nextPatternLong, qualityTick, assetId, advanceQualSearch]);

  useEffect(() => {
    advanceQualSearch(
      patternData?.nextPatternShortCandidates,
      patternData?.nextPatternShort,
      setQualNextShort,
      setQualNextShortSearching,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternData?.nextPatternShortCandidates, patternData?.nextPatternShort, qualityTick, assetId, advanceQualSearch]);

  // Reset qualified next patterns when asset changes
  useEffect(() => {
    setQualNextLong(null); setQualNextLongSearching(false);
    setQualNextShort(null); setQualNextShortSearching(false);
  }, [assetId]);

  // ── QS progressive bar builder ───────────────────────────────────────────────
  // Processes one slot at a time (concurrency 1). Skips slots already in qsLiveBars.
  // No-op if precomputed patternData.qsBars is available.
  // No runs at hover — only triggered by oscillatorMode/qualityTick/patternData effects.
  const processQsNextSlot = useCallback(() => {
    // If precomputed bars available, skip progressive build
    if (patternData?.qsBars?.length) return;
    // Already running a slot — wait for qualityTick update
    if (qsActiveSlot.current !== null) {
      const slot = qsActiveSlot.current;
      // Check if this slot's PFWF just completed
      const bar = patternData?.winrateBars?.find(b => b.startSlot === slot);
      const cand = bar?.bestCandidate;
      if (cand) {
        const key = patternQualityKey(assetId, cand, QUALITY_DEFAULT_INITIAL_TRAINING_YEARS, QUALITY_DEFAULT_OOS_BLOCK_YEARS);
        const entry = qualityCache.current.get(key);
        if (entry?.status === "done") {
          const qs = entry.result.quality.qualityScore;
          const mag = Math.max(0, qs - 50) * 2;
          const value = cand.direction === "LONG" ? mag : -mag;
          setQsLiveBars(prev => new Map(prev).set(slot, { slot, value, candidate: cand }));
          qsActiveSlot.current = null;
          // Don't recurse here — next qualityTick will advance
        }
      }
      return;
    }
    // Get next slot from queue
    let slot = qsQueueRef.current.shift();
    while (slot !== undefined) {
      if (qsLiveBars.has(slot)) { slot = qsQueueRef.current.shift(); continue; } // already done
      const bar = patternData?.winrateBars?.find(b => b.startSlot === slot);
      const cand = bar?.bestCandidate;
      const passes = cand && cand.winRate >= 70 && cand.avgPerformance > 0 && (cand.profitFactor ?? 0) > 1;
      if (!passes) {
        setQsLiveBars(prev => new Map(prev).set(slot!, { slot: slot!, value: 0, candidate: cand ?? null }));
        slot = qsQueueRef.current.shift(); continue; // skip, try next
      }
      const key = patternQualityKey(assetId, cand!, QUALITY_DEFAULT_INITIAL_TRAINING_YEARS, QUALITY_DEFAULT_OOS_BLOCK_YEARS);
      const entry = qualityCache.current.get(key);
      if (entry?.status === "done") {
        const qs = entry.result.quality.qualityScore;
        const mag = Math.max(0, qs - 50) * 2;
        const value = cand!.direction === "LONG" ? mag : -mag;
        setQsLiveBars(prev => new Map(prev).set(slot!, { slot: slot!, value, candidate: cand! }));
        slot = qsQueueRef.current.shift(); continue; // already cached, next
      }
      // Run PFWF for this slot (concurrency 1)
      qsActiveSlot.current = slot!;
      void runQualityFor(cand!);
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, patternData, qsLiveBars, runQualityFor]);

  // Start/advance QS build when mode=QS and qsBars not precomputed
  useEffect(() => {
    if (oscillatorMode !== "QS") return;
    if (patternData?.qsBars?.length) return;
    // Start fresh build for this asset
    if (qsBuildAsset.current !== assetId) {
      qsBuildAsset.current = assetId;
      qsQueueRef.current = Array.from({ length: 116 }, (_, i) => 1 + i * 2);
      qsActiveSlot.current = null;
      setQsLiveBars(new Map());
    }
    processQsNextSlot();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oscillatorMode, patternData, assetId]);

  // Advance QS queue when a PFWF completes (qualityTick updates)
  useEffect(() => {
    if (oscillatorMode !== "QS" || patternData?.qsBars?.length) return;
    processQsNextSlot();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualityTick, oscillatorMode]);

  // Reset QS live bars when asset changes
  useEffect(() => {
    qsBuildAsset.current = null;
    qsQueueRef.current = [];
    qsActiveSlot.current = null;
    setQsLiveBars(new Map());
  }, [assetId]);

  // Locked pattern: run quality only if Auto = ON
  const lpSlot    = lockedPattern?.startSlot;
  const lpHolding = lockedPattern?.holdingDays;
  const lpDir     = lockedPattern?.direction;
  useEffect(() => {
    if (!lockedPattern || !autoRunEnabled) return;
    void runQualityFor(lockedPattern);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lpSlot, lpHolding, lpDir, autoRunEnabled, runQualityFor]);

  // When PFWF is run manually from the Tester, store the result in the quality cache.
  // Key uses the SAME config as runQualityFor so the result is served from cache next time.
  const handlePfwfResult = useCallback((result: PatternFamilyWFResult) => {
    if (!lockedPattern) return;
    if (result.assetId !== assetId) return;
    if (result.directionFixed !== lockedPattern.direction) return;
    if (result.anchorStartSlot !== lockedPattern.startSlot) return;
    if ((result.baselineHoldingDays ?? null) !== lockedPattern.holdingDays) return;
    setSelectedPfwfResult(result);
    // Use config from the RESULT so the key matches regardless of tester config
    const key = patternQualityKey(assetId, lockedPattern,
      result.initialTrainingYears, result.oosBlockYears);
    qualityCache.current.set(key, { status: "done", result });
    // Also store under the default key so the quality ring picks it up
    const defaultKey = patternQualityKey(assetId, lockedPattern,
      QUALITY_DEFAULT_INITIAL_TRAINING_YEARS, QUALITY_DEFAULT_OOS_BLOCK_YEARS);
    if (key !== defaultKey) qualityCache.current.set(defaultKey, { status: "done", result });
    setQualityTick(t => t + 1);
  }, [assetId, lockedPattern]);

  const localWfResultMatchesSelection = Boolean(
    lockedPattern
    && selectedPfwfResult
    && selectedPfwfResult.assetId === assetId
    && selectedPfwfResult.directionFixed === lockedPattern.direction
    && selectedPfwfResult.anchorStartSlot === lockedPattern.startSlot
    && (selectedPfwfResult.baselineHoldingDays ?? null) === lockedPattern.holdingDays,
  );
  const localWfPassed = Boolean(
    localWfResultMatchesSelection
    && selectedPfwfResult?.deploymentPattern
    && (selectedPfwfResult.quality.status === "Strong" || selectedPfwfResult.quality.status === "Excellent"),
  );
  const validatedDeploymentPattern = useMemo(() => {
    if (!localWfPassed || !selectedPfwfResult?.deploymentPattern) return null;
    const deployment = selectedPfwfResult.deploymentPattern;
    return resolvePatternCandidate(
      patternData,
      deployment.direction,
      deployment.entrySlot,
      deployment.holdingDays,
      lockedPattern,
    );
  }, [localWfPassed, lockedPattern, patternData, selectedPfwfResult]);
  const displayMode: DisplayPatternMode = lockedPattern
    ? localWfPassed
      ? "wf_validated_deployment"
      : localWfResultMatchesSelection
        ? "wf_failed_selected"
        : "selected_unvalidated"
    : "selected_unvalidated";
  const chartDisplayPattern = lockedPattern
    ? (localWfPassed ? (validatedDeploymentPattern ?? lockedPattern) : lockedPattern)
    : activePattern;

  // Helper: read quality entry for a pattern (qualityTick ensures reactivity)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getQualityEntry = useCallback((pattern: PatternCandidate | null): PatternQualityEntry | null => {
    if (!pattern) return null;
    return qualityCache.current.get(
      patternQualityKey(assetId, pattern, QUALITY_DEFAULT_INITIAL_TRAINING_YEARS, QUALITY_DEFAULT_OOS_BLOCK_YEARS)
    ) ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, qualityTick]);

  const runWf = useCallback(async (config: RunConfig) => {
    if (runRef.current) return;
    runRef.current = true;
    setWfLoading(true);
    setWfError("");

    try {
      const res = await fetch("/api/seasonality/walk-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "runV1WalkForward", assetId, ...config }),
      });
      const data = await safeJson<WalkForwardResult & { error?: string }>(res, { error: `HTTP ${res.status}` } as WalkForwardResult & { error: string });
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      seasonalWorkspaceWfCache.set(assetId, data);
      setWfResult(data);
      // Compute WF OOS comparison against locked pattern baseline
      const oos = data.oosSummary;
      if (oos) {
        setLockedPattern(prev => {
          if (!prev) return prev;
          setPatternComparison(
            computePatternComparison(
              prev,
              "strict_walk_forward_oos",
              oos.oosWinRate,          // 0–100
              oos.oosAverageReturn,    // fraction
              oos.oosMaxDrawdown,      // fraction
              null,                    // WF OOS doesn't yield a single Sharpe
              null,                    // WF OOS doesn't yield a single Calmar
              oos.oosProfitFactor,
            ),
          );
          return prev;
        });
      }
    } catch (err) {
      console.error("walk-forward run failed", err);
      setWfError("WF_UNAVAILABLE");
    } finally {
      setWfLoading(false);
      runRef.current = false;
    }
  }, [assetId]);

  const savePattern = useCallback(async (pattern: SavedSeasonalPattern) => {
    setSavedRefreshKey((v) => v + 1);
    try {
      await fetch("/api/seasonality/walk-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "savePattern", pattern }),
      });
    } catch {
      // non-fatal
    }
  }, []);

  const handleLockPatternFromChart = useCallback((pattern: PatternCandidate | null) => {
    setLockedPattern(pattern);
    setSelectedPfwfResult(null);
    setLockedPatternGateStatus(null);
    setActivePatternId(null);
    setBacktestResult(null);
    setPatternComparison(null);
    patchWorkspaceState({
      lockedPatternContext: pattern
        ? { assetId, startSlot: pattern.startSlot, holdingDays: pattern.holdingDays, direction: pattern.direction }
        : null,
    });
  }, [assetId]);

  /**
   * Scanner card click handler.
   * Same asset → lock immediately (like a chart click).
   * Different asset → switch asset; pendingRestoreCtx queues the pattern lock,
   * which fires once patternData loads for the new asset.
   * No WF run is triggered by this action alone.
   */
  const handleScannerPatternSelect = useCallback((scannerAssetId: string, pattern: PatternCandidate) => {
    if (scannerAssetId === assetId) {
      handleLockPatternFromChart(pattern);
    } else {
      pendingRestoreCtx.current = {
        assetId: scannerAssetId,
        startSlot: pattern.startSlot,
        holdingDays: pattern.holdingDays,
        direction: pattern.direction,
      };
      setLockedPattern(null);
      setSelectedPfwfResult(null);
      setLockedPatternGateStatus(null);
      setActivePatternId(null);
      setBacktestResult(null);
      setPatternComparison(null);
      setAssetId(scannerAssetId);
      patchWorkspaceState({
        selectedAssetId: scannerAssetId,
        lockedPatternContext: {
          assetId: scannerAssetId,
          startSlot: pattern.startSlot,
          holdingDays: pattern.holdingDays,
          direction: pattern.direction,
        },
      });
    }
  }, [assetId, handleLockPatternFromChart, setAssetId]);

  const handleBacktestResult = useCallback((result: FixedBacktestResult | null) => {
    setBacktestResult(result);
    if (!result) { setPatternComparison(null); return; }
    setLockedPattern(prev => {
      if (!prev) return prev;
      setPatternComparison(
        computePatternComparison(
          prev,
          "fixed_backtest",
          result.winRate,
          result.avgPerformance,
          result.maxDrawdown,
          result.sharpe,
          result.calmar,
          result.profitFactor,
          result.startSlot,
          result.holdingDays,
        ),
      );
      return prev;
    });
  }, []);

  const handleActivatePattern = useCallback((pattern: PatternCandidate | null) => {
    setLockedPattern(pattern);
    setSelectedPfwfResult(null);
    setLockedPatternGateStatus(null);
    setActivePatternId(null);
    setHoverSlot(null);
    setBacktestResult(null);
    setPatternComparison(null);
    patchWorkspaceState({
      lockedPatternContext: pattern
        ? { assetId, startSlot: pattern.startSlot, holdingDays: pattern.holdingDays, direction: pattern.direction }
        : null,
    });
  }, [assetId]);

  const handleSelectSavedPattern = useCallback((saved: SavedPatternRow) => {
    setActivePatternId(saved.patternId);
    setSelectedPfwfResult(null);
    setLockedPatternGateStatus(saved.gateStatus);
    setHoverSlot(null);
    setBacktestResult(null);
    setPatternComparison(null);

    if (!patternData) {
      setLockedPattern(null);
      return;
    }

    const slot = monthDayToApproxSlot(saved.entryMonthDay);
    if (slot == null) {
      setLockedPattern(null);
      return;
    }

    const normalized = clampSlot(slot);
    const candidates = patternData.candidatesBySlot[normalized] ?? [];
    const matched = candidates.find(
      (candidate) =>
        candidate.direction === saved.direction
        && candidate.holdingDays === saved.holdingTradingDays,
    );

    setLockedPattern(matched ?? patternData.bestPatternBySlot[normalized] ?? null);
  }, [patternData]);

  const assetControls = (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <button
        type="button"
        onClick={() => setShowAssetSelector(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 5,
          padding: "2px 8px",
          cursor: "pointer",
        }}
      >
        {assetDef && (
          <SeasonalityMonitoringAssetIcon
            assetId={assetDef.assetId}
            iconKey={assetDef.iconKey}
            category={assetDef.category}
            assetName={assetDef.displayName}
            assetSymbol={assetDef.symbol}
            className="h-[9px] w-[9px]"
          />
        )}
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--c-text)" }}>
          {assetDef?.displayNameShort ?? assetId}
        </span>
      </button>
      <select
        value={lookbackYears}
        onChange={(e) => setLookbackYears(Number(e.target.value))}
        className={styles.lookbackSelect}
      >
        <option value={20}>20Y</option>
        <option value={15}>15Y</option>
        <option value={10}>10Y</option>
        <option value={5}>5Y</option>
        <option value={0}>Max</option>
      </select>
      {/* Settings gear icon — compact, right after 20Y */}
      <SeasonalSettingsPopover settings={settings} onUpdate={updateSetting} />
    </div>
  );

  // Track wfView from Tester for full-width strategy engine layout
  const [activeWfView, setActiveWfView] = useState<string>(() => {
    const ws = readWorkspaceState();
    return ws.wfView ?? "sleeve_portfolio";
  });
  // Both strategy_engine and filter_lab use the same full-width engineZone layout
  const isStrategyEngine = activeWfView === "strategy_engine" || activeWfView === "filter_lab";
  const isSleeve = activeWfView === "sleeve_portfolio";

  return (
    <div className={`${styles.app} seasonal-dashboard-root${isStrategyEngine ? " " + styles.appStrategyEngine + " se-engine-active" : ""}${isSleeve ? " " + styles.appSleeve : ""}`}>
      <div className={styles.content}>
        <SeasonalCombinedChartPanel
          chartResult={chartResult}
          chartLoading={chartLoading}
          patternData={patternData}
          patternDataLoading={patternLoading}
          hoverDoy={hoverSlot}
          onHoverDoy={setHoverSlotThrottled}
          selectedPattern={lockedPattern}
          onSelectPattern={handleLockPatternFromChart}
          activePattern={chartDisplayPattern}
          todaySlot={todaySlot}
          assetControls={assetControls}
          showToday={settings.showToday}
          showPatternHighlight={settings.showPatternHighlight}
          chartGradient={settings.chartGradient}
          formulaMode={settings.formulaMode}
          chartLogoEnabled={settings.chartLogoEnabled}
          chartLogoOpacity={settings.chartLogoOpacity}
          chartLogoSize={settings.chartLogoSize}
          chartLogoPosX={settings.chartLogoPosX}
          chartLogoPosY={settings.chartLogoPosY}
          oscillatorMode={oscillatorMode}
          onOscillatorModeChange={setOscillatorMode}
          qsLiveBars={qsLiveBars}
        />

        {/* PERF: WF tester only receives lockedPattern (not hover-reactive activePattern)
            → prevents expensive Recharts equity chart from re-rendering on every hover.
            In strategy_engine mode the tester is rendered below the grid (engineZone). */}
        {!isStrategyEngine && (
          <div className={styles.wfPanel}>
            <SeasonalStrategyTester
              assetId={assetId}
              lookbackYears={lookbackYears}
              result={wfResult}
              loading={wfLoading}
              error={wfError}
              activePattern={lockedPattern}
              activePatternSource={lockedPattern ? "selected" : "none"}
              onRun={runWf}
              onSave={savePattern}
              compact={true}
              patternData={patternData}
              todaySlot={todaySlot}
              onBacktestResult={handleBacktestResult}
              onPfwfResult={handlePfwfResult}
              onAutoRunChange={setAutoRunEnabled}
              onScannerPatternSelect={handleScannerPatternSelect}
              onWfViewChange={setActiveWfView}
            />
          </div>
        )}

        <div className={styles.rightPanel}>
          <SeasonalRightPanel
            wfResult={wfResult}
            activePattern={lockedPattern ? (localWfPassed ? (validatedDeploymentPattern ?? lockedPattern) : lockedPattern) : activePattern}
            activePatternSource={lockedPattern ? "selected" : activePatternSource}
            displayMode={displayMode}
            wfFamilyResult={localWfResultMatchesSelection ? selectedPfwfResult : null}
            selectedPatternGateStatus={lockedPatternGateStatus}
            nextPattern={patternData?.nextPattern ?? null}
            assetId={assetId}
            activePatternId={activePatternId}
            onSelectSaved={handleSelectSavedPattern}
            onActivatePattern={handleActivatePattern}
            savedPatternsRefreshKey={savedRefreshKey}
            comparison={null}
            kpiPatternQuality={
              lockedPattern
                ? displayMode === "selected_unvalidated"
                  ? getQualityEntry(lockedPattern)
                  : null
                : activePatternSource === "selected"
                  ? getQualityEntry(lockedPattern)
                  : activePatternSource === "next"
                    ? getQualityEntry(validatedNextPattern)
                    : null
            }
            nextPatternQuality={getQualityEntry(validatedNextPattern)}
            nextPatternLong={qualNextLong}
            nextPatternShort={qualNextShort}
            nextLongQuality={getQualityEntry(qualNextLong)}
            nextShortQuality={getQualityEntry(qualNextShort)}
            nextLongSearching={qualNextLongSearching}
            nextShortSearching={qualNextShortSearching}
            engineMode={isStrategyEngine}
          />
        </div>
      </div>

      {/* Strategy Engine zone: outside the grid, sits in normal document flow.
          This lets the engine grow to full content height and allows page scroll. */}
      {isStrategyEngine && (
        <div className={styles.engineZone}>
          <SeasonalStrategyTester
            assetId={assetId}
            lookbackYears={lookbackYears}
            result={wfResult}
            loading={wfLoading}
            error={wfError}
            activePattern={lockedPattern}
            activePatternSource={lockedPattern ? "selected" : "none"}
            onRun={runWf}
            onSave={savePattern}
            compact={true}
            patternData={patternData}
            todaySlot={todaySlot}
            onBacktestResult={handleBacktestResult}
            onPfwfResult={handlePfwfResult}
            onAutoRunChange={setAutoRunEnabled}
            onScannerPatternSelect={handleScannerPatternSelect}
            onWfViewChange={setActiveWfView}
          />
        </div>
      )}

      {showAssetSelector && (
        <SeasonalAssetSelectorOverlay
          selectedAssetId={assetId}
          onSelect={(id) => {
            setAssetId(id);
            patchWorkspaceState({ lockedPatternContext: null });
            setSelectedPfwfResult(null);
            setShowAssetSelector(false);
          }}
          onClose={() => setShowAssetSelector(false)}
        />
      )}
    </div>
  );
}
