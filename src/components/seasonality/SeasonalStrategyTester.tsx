"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import styles from "./seasonal.module.css";
import type { SavedSeasonalPattern, WalkForwardResult } from "@/lib/seasonality/walkForward/types";
import type { PatternCandidate, PatternDataResult } from "@/lib/seasonality/patternSelection";
import { formatPatternWindow, slotToApproxMonthDay } from "@/lib/seasonality/patternSelection";
import type { FixedBacktestResult } from "@/lib/seasonality/fixedPatternBacktest";
import type { PatternFamilyWFResult } from "@/lib/seasonality/patternFamilyWalkForward";
import { buildOosFoldBlocks, summarizeWalkForwardCounts } from "@/lib/seasonality/walkForwardResultSemantics";
import { PanelTitle } from "./PanelTitle";
import { PatternScannerPanel } from "./PatternScannerPanel";
import type { ScannerTimeScope, ScannerAssetScope } from "./PatternScannerPanel";
import { StrategyEnginePanel } from "./strategyEngine/StrategyEnginePanel";
import { SeasonalFilterLabPanel } from "./filterLab/SeasonalFilterLabPanel";
import { readWorkspaceState, patchWorkspaceState } from "@/lib/seasonality/useSeasonalityWorkspace";
import { AgentPortfolioPanel } from "./AgentPortfolioPanel";
import { SleevePortfolioPanel } from "./SleevePortfolioPanel";

const C_WHITE = "#F0F3F7";
const C_GOLD = "#C9A84C";
const C_MUTED = "#9AAAB8";
const C_DIM = "#7A8898";
const OOS_BLOCK_YEARS = 2;

export interface RunConfig {
  trainingYears: number;
  holdingDaysMin: number;
  holdingDaysMax: number;
  transactionCostBps: number;
}

interface Props {
  assetId: string;
  lookbackYears?: number;
  result: WalkForwardResult | null;
  loading: boolean;
  error: string;
  activePattern: PatternCandidate | null;
  activePatternSource: "hover" | "selected" | "next" | "none";
  onRun: (config: RunConfig) => void;
  onSave?: (pattern: SavedSeasonalPattern) => void;
  compact?: boolean;
  patternData?: PatternDataResult | null;
  todaySlot?: number | null;
  onBacktestResult?: (result: FixedBacktestResult | null) => void;
  onPfwfResult?: (result: PatternFamilyWFResult) => void;
  onAutoRunChange?: (enabled: boolean) => void;
  onWfViewChange?: (view: WfView) => void;
  onScannerPatternSelect?: (assetId: string, pattern: PatternCandidate) => void;
}

export type WfView = "tester" | "scanner" | "strategy_engine" | "filter_lab" | "agent_portfolio" | "sleeve_portfolio";
type Tab = "results" | "folds" | "config" | "audit";

function pct(value: number, decimals = 2): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(decimals)}%`;
}

function pctColor(value: number | null | undefined): string {
  if (value == null) return C_MUTED;
  return value >= 0 ? C_WHITE : C_GOLD;
}

function isValidatedResult(result: PatternFamilyWFResult | null): boolean {
  if (!result?.deploymentPattern) return false;
  return result.quality.status === "Strong" || result.quality.status === "Excellent";
}

function mapGateStatus(result: PatternFamilyWFResult): SavedSeasonalPattern["gateStatus"] {
  if (result.quality.status === "Strong" || result.quality.status === "Excellent") {
    return "PASSED_RESEARCH_GATE";
  }
  if (result.quality.status === "Insufficient OOS sample") {
    return "INSUFFICIENT_DATA";
  }
  return "FAILED_RESEARCH_GATE";
}

function buildSavePayload(assetId: string, result: PatternFamilyWFResult): SavedSeasonalPattern | null {
  const deployment = result.deploymentPattern;
  if (!deployment || !isValidatedResult(result)) return null;

  const symbol = result.monitoringSymbol ?? assetId.toUpperCase();
  const displayName = symbol;
  return {
    patternId: `${assetId}_pfwf_${deployment.direction}_S${deployment.entrySlot}_H${deployment.holdingDays}_${Date.now()}`,
    assetId,
    symbol,
    displayName,
    name: `${symbol} · PFWF · ${deployment.direction} ${deployment.windowLabel}`,
    ruleVersion: `PFWF_${result.configVersion}`,
    direction: deployment.direction,
    entryMonthDay: slotToApproxMonthDay(deployment.entrySlot),
    holdingTradingDays: deployment.holdingDays,
    validationMode: "Anchored Expanding OOS",
    gateStatus: mapGateStatus(result),
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
    usedAsLiveSignal: false,
    canBePromotedToLiveSignal: false,
  };
}

function ResultsStat({ label, value, color = C_WHITE }: { label: string; value: string; color?: string }) {
  return (
    <div className={styles.wfStatCard}>
      <div className={styles.wfStatLabel}>{label}</div>
      <div className={styles.wfStatValue} style={{ color }}>{value}</div>
    </div>
  );
}

function PatternFamilyFoldsTable({ result }: { result: PatternFamilyWFResult }) {
  const blocks = buildOosFoldBlocks(result);
  return (
    <div className="overflow-x-auto max-h-[190px] overflow-y-auto">
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr className="border-b border-[#111]">
            {["Fold Block", "IS / OOS", "Window", "Shift", "Hold", "Block / Year Ret", "Status"].map((header) => (
              <th key={header} className="pb-1 pr-2 text-left text-[8px] uppercase tracking-wide text-[#7A8898]">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <Fragment key={`block-${block.blockIndex}`}>
              <tr className="border-b border-[#111]">
                <td className="py-1 pr-2 text-[#C9A84C]">{String(block.blockIndex).padStart(2, "0")}</td>
                <td className="py-1 pr-2 text-[#9AAAB8]">
                  IS {block.trainingStartYear ?? "—"}-{block.trainingEndYear ?? "—"} · OOS {block.oosYears[0] ?? "—"}-{block.oosYears[block.oosYears.length - 1] ?? "—"}
                </td>
                <td className="py-1 pr-2 text-white">{formatPatternWindow(block.selectedEntrySlot, block.selectedExitSlot)}</td>
                <td className="py-1 pr-2 text-white">{block.selectedEntryShift > 0 ? `+${block.selectedEntryShift}` : block.selectedEntryShift}D</td>
                <td className="py-1 pr-2 text-white">{block.selectedHoldingDays}D</td>
                <td className="py-1 pr-2" style={{ color: pctColor(block.compoundReturn) }}>
                  {block.compoundReturn != null ? pct(block.compoundReturn, 1) : "—"}
                </td>
                <td className="py-1 pr-2 text-[8px]" style={{ color: block.positiveBlock ? C_WHITE : C_GOLD }}>
                  {block.positiveBlock ? "POSITIVE BLOCK" : "NON-POSITIVE BLOCK"}
                </td>
              </tr>
              {block.years.map((fold) => (
                <tr key={`${block.blockIndex}-${fold.oosYear}`} className="border-b border-[#0a0a0a]">
                  <td className="py-1 pr-2 text-[#7A8898]">↳ {fold.oosYear}</td>
                  <td className="py-1 pr-2 text-[#7A8898]">OOS Year</td>
                  <td className="py-1 pr-2 text-white">{formatPatternWindow(fold.selectedEntrySlot, fold.selectedExitSlot)}</td>
                  <td className="py-1 pr-2 text-white">{fold.selectedEntryShift > 0 ? `+${fold.selectedEntryShift}` : fold.selectedEntryShift}D</td>
                  <td className="py-1 pr-2 text-white">{fold.selectedHoldingDays}D</td>
                  <td className="py-1 pr-2" style={{ color: pctColor(fold.oosReturn) }}>
                    {fold.oosReturn != null ? pct(fold.oosReturn, 1) : "—"}
                  </td>
                  <td className="py-1 pr-2 text-[8px]" style={{ color: fold.oosValid ? C_WHITE : C_GOLD }}>
                    {fold.oosValid ? "EXECUTED" : fold.oosInvalidReason ?? "INVALID"}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const SeasonalStrategyTester = memo(function SeasonalStrategyTester({
  assetId,
  activePattern,
  activePatternSource,
  onSave,
  compact,
  patternData,
  todaySlot,
  onPfwfResult,
  onAutoRunChange,
  onScannerPatternSelect,
  onWfViewChange,
}: Props) {
  const [initialWs] = useState(() => readWorkspaceState());

  const [wfView, setWfViewRaw] = useState<WfView>(() =>
    initialWs.wfView === "scanner" ? "scanner" :
    initialWs.wfView === "strategy_engine" ? "strategy_engine" :
    initialWs.wfView === "filter_lab" ? "filter_lab" :
    initialWs.wfView === "agent_portfolio" ? "agent_portfolio" :
    initialWs.wfView === "sleeve_portfolio" ? "sleeve_portfolio" : "tester");
  const [sleeveMode, setSleeveMode] = useState<"grid" | "detail" | "portfolio">("grid");
  const [scanTimeScope, setScanTimeScopeRaw] = useState<ScannerTimeScope>(() =>
    (["month", "quarter", "year"] as ScannerTimeScope[]).includes(initialWs.scannerTimeScope as ScannerTimeScope)
      ? initialWs.scannerTimeScope
      : "month");
  const [scanAssetScope, setScanAssetScopeRaw] = useState<ScannerAssetScope>(() =>
    (["global", "group", "asset"] as ScannerAssetScope[]).includes(initialWs.scannerAssetScope as ScannerAssetScope)
      ? initialWs.scannerAssetScope
      : "asset");

  const setWfView = useCallback((view: WfView) => {
    setWfViewRaw(view);
    patchWorkspaceState({ wfView: view });
    onWfViewChange?.(view);
  }, [onWfViewChange]);
  const setScanTimeScope = useCallback((scope: ScannerTimeScope) => {
    setScanTimeScopeRaw(scope);
    patchWorkspaceState({ scannerTimeScope: scope });
  }, []);
  const setScanAssetScope = useCallback((scope: ScannerAssetScope) => {
    setScanAssetScopeRaw(scope);
    patchWorkspaceState({ scannerAssetScope: scope });
  }, []);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tab, setTabRaw] = useState<Tab>(() => {
    const valid: Tab[] = ["results", "folds", "config", "audit"];
    return valid.includes(initialWs.testerTab as Tab) ? (initialWs.testerTab as Tab) : "results";
  });
  const setTab = useCallback((nextTab: Tab) => {
    setTabRaw(nextTab);
    patchWorkspaceState({ testerTab: nextTab });
  }, []);

  const [trainingYears, setTrainingYears] = useState(10);
  const AUTO_RUN_STORAGE_KEY = "seasonality.walkForward.autoRunEnabled";
  const [autoRun, setAutoRun] = useState(false);
  const autoRunInitRef = useRef(false);
  const autoRunHydratedRef = useRef(false);
  const [pfwfResult, setPfwfResult] = useState<PatternFamilyWFResult | null>(null);
  const [pfwfLoading, setPfwfLoading] = useState(false);
  const [pfwfError, setPfwfError] = useState("");
  const wfDebounceRef = useRef<number>(0);

  const initialRunKey = useMemo(() => {
    const ctx = initialWs.lockedPatternContext;
    if (!ctx) return "";
    return JSON.stringify({
      assetId: initialWs.selectedAssetId,
      direction: ctx.direction,
      startSlot: ctx.startSlot,
      holdingDays: ctx.holdingDays,
      trainingYears: 10,
      oosBlockYears: OOS_BLOCK_YEARS,
    });
  }, [initialWs]);
  const lastRunKeyRef = useRef<string>(initialRunKey);

  const selectedIdentity = `${assetId}:${activePattern?.direction ?? "none"}:${activePattern?.startSlot ?? "na"}:${activePattern?.holdingDays ?? "na"}`;
  useEffect(() => {
    setPfwfResult(null);
    setPfwfError("");
  }, [selectedIdentity]);

  useEffect(() => {
    if (autoRunInitRef.current) return;
    autoRunInitRef.current = true;
    try {
      const stored = window.localStorage.getItem(AUTO_RUN_STORAGE_KEY);
      if (stored === "true") setAutoRun(true);
      if (stored === "false") setAutoRun(false);
    } catch {
      // ignore storage failures
    }
    autoRunHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!autoRunHydratedRef.current) return;
    try {
      window.localStorage.setItem(AUTO_RUN_STORAGE_KEY, autoRun ? "true" : "false");
    } catch {
      // ignore storage failures
    }
    onAutoRunChange?.(autoRun);
  }, [autoRun, onAutoRunChange]);

  const buildRunKey = useCallback(() => {
    if (!activePattern) return "";
    return JSON.stringify({
      assetId,
      direction: activePattern.direction,
      startSlot: activePattern.startSlot,
      holdingDays: activePattern.holdingDays,
      trainingYears,
      oosBlockYears: OOS_BLOCK_YEARS,
    });
  }, [activePattern, assetId, trainingYears]);

  const runPFWF = useCallback(async (reason: "manual" | "auto" = "manual") => {
    if (!activePattern || pfwfLoading) return;
    const runKey = buildRunKey();
    if (!runKey) return;
    lastRunKeyRef.current = runKey;
    setPfwfLoading(true);
    setPfwfError("");
    try {
      const response = await fetch("/api/seasonality/walk-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "patternFamilyWalkForward",
          assetId,
          direction: activePattern.direction,
          startSlot: activePattern.startSlot,
          baselineHoldingDays: activePattern.holdingDays,
          initialTrainingYears: trainingYears,
          oosBlockYears: OOS_BLOCK_YEARS,
          triggerReason: reason,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as PatternFamilyWFResult;
      setPfwfResult(data);
      onPfwfResult?.(data);
      setTab("results");
    } catch (error) {
      setPfwfError(error instanceof Error ? error.message : String(error));
    } finally {
      setPfwfLoading(false);
    }
  }, [activePattern, assetId, buildRunKey, onPfwfResult, pfwfLoading, setTab, trainingYears]);

  useEffect(() => {
    if (!autoRun || !activePattern || pfwfLoading) return;
    if (activePatternSource === "hover") return;
    const runKey = buildRunKey();
    if (!runKey || runKey === lastRunKeyRef.current) return;

    if (wfDebounceRef.current) window.clearTimeout(wfDebounceRef.current);
    wfDebounceRef.current = window.setTimeout(() => {
      void runPFWF("auto");
    }, 180);

    return () => {
      if (wfDebounceRef.current) window.clearTimeout(wfDebounceRef.current);
    };
  }, [activePattern, activePatternSource, autoRun, buildRunKey, pfwfLoading, runPFWF]);

  const canSaveValidatedPattern = Boolean(onSave && isValidatedResult(pfwfResult));
  const handleSave = useCallback(() => {
    if (!onSave || !pfwfResult) return;
    const payload = buildSavePayload(assetId, pfwfResult);
    if (!payload) return;
    onSave(payload);
  }, [assetId, onSave, pfwfResult]);

  const wfCounts = useMemo(() => summarizeWalkForwardCounts(pfwfResult), [pfwfResult]);
  const wfBlocks = useMemo(() => buildOosFoldBlocks(pfwfResult), [pfwfResult]);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "results", label: "Results" },
    { key: "folds", label: `Folds${pfwfResult ? ` (${wfBlocks.length})` : ""}` },
    { key: "config", label: "Config" },
    { key: "audit", label: "Audit" },
  ];

  const selectedSummary = useMemo(() => {
    if (pfwfResult?.selectedPatternBaseline) {
      return pfwfResult.selectedPatternBaseline;
    }
    if (!activePattern) return null;
    return {
      assetId,
      direction: activePattern.direction,
      entrySlot: activePattern.startSlot,
      exitSlot: activePattern.endSlot,
      windowLabel: formatPatternWindow(activePattern.startSlot, activePattern.endSlot),
      holdingDays: activePattern.holdingDays,
    };
  }, [activePattern, assetId, pfwfResult]);

  const deployment = pfwfResult?.deploymentPattern ?? null;
  const validationPassed = isValidatedResult(pfwfResult);
  const resultsStatusText = !pfwfResult
    ? "Selected Pattern · Not tested"
    : validationPassed
      ? "WF Validated"
      : "Selected pattern family not validated";
  const resultsStatusColor = !pfwfResult
    ? C_MUTED
    : validationPassed
      ? C_WHITE
      : C_GOLD;

  const auditIdentity = pfwfResult?.resultIdentity;
  const INPUT = "h-7 rounded-[5px] border border-[#111] bg-[#060606] px-2 text-[10px] text-white outline-none w-full";
  const shellClass = compact
    ? (wfView === "strategy_engine" || wfView === "filter_lab"
       ? styles.wfShellStrategyEngine
       : styles.wfShell)
    : undefined;
  const shellStyle = compact ? undefined : {
    height: "100%",
    overflow: "hidden" as const,
    display: "flex",
    flexDirection: "column" as const,
    background: "#0A0A0A",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "10px 12px",
  };

  const tabsEl = tabs.map((entry) => (
    <button
      key={entry.key}
      type="button"
      onClick={() => setTab(entry.key)}
      className="rounded-[4px] border px-2.5 py-0.5 text-[9px] transition-colors"
      style={tab === entry.key
        ? { borderColor: "rgba(255,255,255,0.15)", color: C_WHITE, backgroundColor: "rgba(255,255,255,0.04)" }
        : { borderColor: "transparent", color: C_DIM }}
    >
      {entry.label}
    </button>
  ));

  const autoToggleEl = (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: 9, color: "rgba(154,170,184,0.95)", letterSpacing: "0.02em" }}>Auto</span>
      <button
        type="button"
        onClick={() => setAutoRun((value) => !value)}
        className="rounded-[999px] border px-1.5 py-1 text-[8px] transition-colors"
        style={autoRun
          ? { borderColor: "rgba(255,255,255,0.20)", backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(244,247,250,0.94)" }
          : { borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(154,170,184,0.92)" }}
        aria-pressed={autoRun}
        title={autoRun ? "Auto ON" : "Auto OFF"}
      >
        <span style={{ display: "inline-block", width: 18, textAlign: "center", fontWeight: 700, letterSpacing: "0.06em", lineHeight: 1 }}>
          {autoRun ? "ON" : "OFF"}
        </span>
      </button>
    </div>
  );

  const runBtn = (
    <button
      type="button"
      onClick={() => void runPFWF("manual")}
      disabled={!activePattern || pfwfLoading}
      className="rounded-[4px] border border-[#1a1a1a] bg-[#060606] px-2.5 py-1 text-[9px] text-[#5a5a5a] hover:text-white disabled:opacity-40"
    >
      {pfwfLoading ? "Running..." : "Run WF"}
    </button>
  );

  const saveBtn = onSave ? (
    <button
      type="button"
      onClick={handleSave}
      disabled={!canSaveValidatedPattern}
      className="rounded-[4px] border border-[#1a1a1a] bg-[#060606] px-2.5 py-1 text-[9px] text-[#9AAAB8] hover:text-white disabled:opacity-40"
      title={canSaveValidatedPattern ? "Save validated deployment pattern" : "Save Pattern disabled - not validated"}
    >
      Save Pattern
    </button>
  ) : null;

  const VIEW_OPTS: Array<{ key: WfView; label: string }> = [
    { key: "tester",           label: "Walk-Forward Tester" },
    { key: "scanner",          label: "Pattern Scanner" },
    { key: "strategy_engine",  label: "Strategy Engine" },
    { key: "filter_lab",       label: "Seasonal Filter Lab" },
    { key: "agent_portfolio",  label: "Agent Portfolio" },
    { key: "sleeve_portfolio", label: "Komponenten" },
  ];

  const viewDropdown = (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setDropdownOpen((value) => !value)}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          color: "inherit",
          font: "inherit",
          lineHeight: 1,
        }}
      >
        <span>{wfView === "tester" ? "Walk-Forward Tester" : wfView === "scanner" ? "Pattern Scanner" : wfView === "filter_lab" ? "Seasonal Filter Lab" : wfView === "agent_portfolio" ? "Agent Portfolio" : wfView === "sleeve_portfolio" ? "Komponenten" : "Strategy Engine"}</span>
        <span style={{ fontSize: 10, color: "rgba(168,180,196,0.7)", padding: "0 2px" }}>▾</span>
      </button>
      {dropdownOpen && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          zIndex: 200,
          background: "#0D0D0D",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
          overflow: "hidden",
          minWidth: 170,
          boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
        }}>
          {VIEW_OPTS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setWfView(option.key);
                setDropdownOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 11px",
                border: "none",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "Montserrat, Segoe UI, sans-serif",
                background: option.key === wfView ? "rgba(255,255,255,0.06)" : "transparent",
                color: option.key === wfView ? C_WHITE : "rgba(168,180,196,0.85)",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const filterButtonStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "rgba(255,255,255,0.06)" : "transparent",
    border: "1px solid transparent",
    cursor: "pointer",
    fontFamily: "Montserrat, Segoe UI, sans-serif",
    fontSize: 9,
    fontWeight: active ? 600 : 500,
    color: active ? "rgba(224,228,234,0.92)" : "rgba(118,132,148,0.78)",
    padding: "2px 7px",
    letterSpacing: "0.01em",
    borderRadius: 5,
    transition: "color 0.12s, background 0.12s",
  });

  const scannerFilters = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <div style={{ display: "flex", gap: 1 }}>
        {(["month", "quarter", "year"] as ScannerTimeScope[]).map((scope) => (
          <button key={scope} type="button" onClick={() => setScanTimeScope(scope)} style={filterButtonStyle(scanTimeScope === scope)}>
            {scope === "month" ? "Month" : scope === "quarter" ? "Quarterly" : "Year"}
          </button>
        ))}
      </div>
      <div style={{ width: 1, height: 9, background: "rgba(255,255,255,0.10)", flexShrink: 0 }} />
      <div style={{ display: "flex", gap: 1 }}>
        {(["global", "group", "asset"] as ScannerAssetScope[]).map((scope) => (
          <button key={scope} type="button" onClick={() => setScanAssetScope(scope)} style={filterButtonStyle(scanAssetScope === scope)}>
            {scope.charAt(0).toUpperCase() + scope.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className={shellClass} style={shellStyle}>
      {compact ? (
        <PanelTitle
          right={wfView === "tester"
            ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <div className={styles.wfCenterTabs}>{tabsEl}</div>
                <div className={styles.wfActions}>{autoToggleEl}{runBtn}{saveBtn}</div>
              </div>
            )
            : wfView === "scanner"
              ? scannerFilters
              : wfView === "sleeve_portfolio"
                ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {sleeveMode !== "grid" && (
                      <button type="button" onClick={() => setSleeveMode("grid")} style={{
                        background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                        color: C_MUTED, fontSize: 12, cursor: "pointer",
                      }}>‹</button>
                    )}
                    <button type="button" onClick={() => setSleeveMode(sleeveMode === "portfolio" ? "grid" : "portfolio")} style={{
                      background: sleeveMode === "portfolio" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
                      border: `1px solid rgba(255,255,255,0.12)`,
                      borderRadius: 6, padding: "4px 14px", color: "#e8edf3", fontSize: 10,
                      cursor: "pointer", fontWeight: 600, fontFamily: "Montserrat, Segoe UI, sans-serif",
                      letterSpacing: "0.03em",
                    }}>Portfolio</button>
                  </div>
                )
                : null}
        >
          {viewDropdown}
        </PanelTitle>
      ) : (
        <div className="mb-2 flex items-center gap-3">
          <div className="text-[10px] font-medium text-white">{viewDropdown}</div>
          {wfView === "tester" && (
            <>
              <div className="flex items-center gap-1">{tabsEl}</div>
              <div className="flex items-center gap-1.5">{autoToggleEl}{runBtn}{saveBtn}</div>
            </>
          )}
          {wfView === "scanner" && scannerFilters}
        </div>
      )}

      {wfView === "scanner" && (
        <PatternScannerPanel
          assetId={assetId}
          currentPatternData={patternData ?? null}
          todaySlot={todaySlot ?? 105}
          timeScope={scanTimeScope}
          assetScope={scanAssetScope}
          onSelectPattern={onScannerPatternSelect}
        />
      )}

      {wfView === "strategy_engine" && <StrategyEnginePanel assetId={assetId} />}

      {wfView === "filter_lab" && <SeasonalFilterLabPanel assetId={assetId} />}

      {wfView === "agent_portfolio" && <AgentPortfolioPanel />}

      {wfView === "sleeve_portfolio" && (
        <SleevePortfolioPanel
          mode={sleeveMode}
          onModeChange={setSleeveMode}
          onSelectPattern={(selectAssetId, startSlot, direction) => {
            if (!onScannerPatternSelect) return;
            const fake: PatternCandidate = {
              startSlot, endSlot: startSlot + 10, approxMonthLabel: "",
              direction: direction === "LONG" ? "LONG" : "SHORT",
              holdingDays: 10, winRate: 0.5, avgPerformance: 0, maxDrawdown: 0,
              sharpe: null, calmar: null, sortino: null, profitFactor: null,
              avgDrawdown: null, observationCount: 0, strategyReturns: [],
            };
            onScannerPatternSelect(selectAssetId, fake);
          }}
        />
      )}

      {wfView === "tester" && (
        <div className={compact ? styles.wfMain : undefined}>
          {tab === "results" && (
            <div className={compact ? styles.wfPerformance : "space-y-3"}>
              {!activePattern && !pfwfLoading && !pfwfError && (
                <div className="py-4 text-center text-[10px] text-[#9AAAB8]">Lock a seasonal pattern first, then run the local walk-forward validation.</div>
              )}
              {pfwfLoading && (
                <div className="py-4 text-center text-[10px] text-[#9AAAB8]">Running strict local family walk-forward…</div>
              )}
              {pfwfError && (
                <div className="rounded-[5px] border border-[rgba(255,255,255,0.08)] px-3 py-2 text-[10px] text-[#C9A84C]">{pfwfError}</div>
              )}
              {(selectedSummary || pfwfResult) && !pfwfLoading && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, padding: "6px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 5, marginBottom: 3 }}>
                    <div>
                      <div style={{ fontSize: 7.5, color: C_DIM, marginBottom: 2 }}>SELECTED</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C_WHITE }}>{selectedSummary?.windowLabel ?? "—"} · {selectedSummary?.holdingDays ?? "—"}D</div>
                      <div style={{ fontSize: 9, color: selectedSummary?.direction === "SHORT" ? C_GOLD : C_WHITE, marginTop: 2 }}>{selectedSummary?.direction ?? "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 7.5, color: C_DIM, marginBottom: 2 }}>{validationPassed ? "DEPLOYMENT / VALIDATED" : "VALIDATION"}</div>
                      {deployment ? (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 700, color: C_WHITE }}>{deployment.windowLabel} · {deployment.holdingDays}D</div>
                          <div style={{ fontSize: 9, color: deployment.direction === "SHORT" ? C_GOLD : C_WHITE, marginTop: 2 }}>{deployment.direction}</div>
                          <div style={{ fontSize: 8.5, color: C_DIM, marginTop: 2 }}>
                            Entry {deployment.relationToSelected.entryShiftTradingDays >= 0 ? "+" : ""}{deployment.relationToSelected.entryShiftTradingDays}D · Hold {deployment.relationToSelected.holdingChangeTradingDays >= 0 ? "+" : ""}{deployment.relationToSelected.holdingChangeTradingDays}D · Exit {deployment.relationToSelected.exitShiftTradingDays >= 0 ? "+" : ""}{deployment.relationToSelected.exitShiftTradingDays}D
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 700, color: C_GOLD }}>{pfwfResult?.quality.status ?? "Not tested"}</div>
                          <div style={{ fontSize: 8.5, color: C_DIM, marginTop: 2 }}>No deployable local variant</div>
                        </>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 7.5, color: C_DIM, marginBottom: 2 }}>STATUS</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: resultsStatusColor }}>{resultsStatusText}</div>
                    </div>
                  </div>

                  {pfwfResult ? (
                    <>
                      <div className={compact ? styles.wfStatsRow : "grid grid-cols-8 gap-2 rounded-[6px] bg-[#060606] p-2.5"}>
                        <ResultsStat label="Quality" value={`${pfwfResult.quality.qualityScore} · ${pfwfResult.quality.status}`} color={resultsStatusColor} />
                        <ResultsStat label="OOS Trades" value={String(wfCounts.oosTradeCount)} />
                        <ResultsStat label="OOS Years" value={String(wfCounts.oosYearCount)} />
                        <ResultsStat label="OOS Blocks" value={String(wfCounts.oosFoldBlockCount)} />
                        <ResultsStat label="OOS Avg" value={pct(pfwfResult.quality.oosAvgReturn)} color={pctColor(pfwfResult.quality.oosAvgReturn)} />
                        <ResultsStat label="OOS PF" value={pfwfResult.quality.oosProfitFactor.toFixed(2)} color={pfwfResult.quality.oosProfitFactor >= 1 ? C_WHITE : C_GOLD} />
                        <ResultsStat label="OOS Bar DD" value={`-${(pfwfResult.quality.oosMaxDrawdown * 100).toFixed(1)}%`} color={C_GOLD} />
                        <ResultsStat label="Positive Years" value={`${wfCounts.positiveOosYearCount} / ${(wfCounts.positiveYearRate * 100).toFixed(0)}%`} color={wfCounts.positiveYearRate >= 0.5 ? C_WHITE : C_GOLD} />
                        <ResultsStat label="Stability" value={`${(pfwfResult.parameterStability * 100).toFixed(0)}%`} color={pfwfResult.parameterStability >= 0.6 ? C_WHITE : C_GOLD} />
                      </div>
                      <div className="px-2 text-[8.5px] text-[#7A8898]">
                        Local family only · direction fixed · entry ±3D · holding ±4D · exit ±5D · anchored expanding IT={pfwfResult.initialTrainingYears}Y / OOS={pfwfResult.oosBlockYears}Y
                      </div>
                      <div className="px-2 text-[8.5px] text-[#7A8898]">
                        Positive block rate {(wfCounts.positiveFoldRate * 100).toFixed(0)}% ({wfCounts.positiveOosFoldBlockCount}/{wfCounts.oosFoldBlockCount}) | Stability {(pfwfResult.parameterStability * 100).toFixed(0)}%
                      </div>
                    </>
                  ) : activePattern ? (
                    <div className="px-2 text-[9px] text-[#7A8898]">
                      Selected pattern ready. Local family is restricted to the same direction and same seasonal neighbourhood only.
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}

          {tab === "folds" && (
            pfwfResult ? <PatternFamilyFoldsTable result={pfwfResult} /> : (
              <div className="py-4 text-center text-[10px] text-[#9AAAB8]">Run the local walk-forward once to inspect fold-by-fold OOS results.</div>
            )
          )}

          {tab === "config" && (
            <div className={compact ? styles.wfConfig : "space-y-2"}>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[8px] uppercase tracking-widest text-[#7A8898]">Training Years</label>
                  <input
                    type="number"
                    className={INPUT}
                    value={trainingYears}
                    min={5}
                    max={20}
                    onChange={(event) => setTrainingYears(Number(event.target.value))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[8px] uppercase tracking-widest text-[#7A8898]">OOS Block</label>
                  <input type="text" className={INPUT} value={`${OOS_BLOCK_YEARS} Years`} readOnly />
                </div>
              </div>
              <div className="rounded-[5px] border border-[rgba(255,255,255,0.08)] bg-[#060606] px-3 py-2 text-[9px] text-[#9AAAB8]">
                Direction fixed · Entry shift ±3 trading days · Holding change ±4 trading days · Exit shift ±5 trading days · Same seasonal window required.
              </div>
              <div className="rounded-[5px] border border-[rgba(255,255,255,0.08)] bg-[#060606] px-3 py-2 text-[9px] text-[#7A8898]">
                Current incomplete year excluded · Strict OOS quality only · No global reselection across the calendar.
              </div>
            </div>
          )}

          {tab === "audit" && (
            <div className={`${compact ? styles.wfAudit : ""} space-y-1.5 text-[10px]`}>
              {pfwfResult ? (
                <>
                  <div className="flex justify-between"><span className="text-[#9AAAB8]">Result ID</span><span className="text-right text-[#8A9AA8]">{pfwfResult.resultId}</span></div>
                  <div className="flex justify-between"><span className="text-[#9AAAB8]">Asset</span><span className="text-white">{pfwfResult.monitoringSymbol ?? pfwfResult.assetId}</span></div>
                  <div className="flex justify-between"><span className="text-[#9AAAB8]">Selected Identity</span><span className="text-right text-[#8A9AA8]">{pfwfResult.selectedPatternBaseline.direction} · S{pfwfResult.selectedPatternBaseline.entrySlot} · H{pfwfResult.selectedPatternBaseline.holdingDays ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[#9AAAB8]">Family Version</span><span className="text-[#8A9AA8]">{pfwfResult.familyConfig.version}</span></div>
                  <div className="flex justify-between"><span className="text-[#9AAAB8]">Config Version</span><span className="text-[#8A9AA8]">{pfwfResult.configVersion}</span></div>
                  <div className="flex justify-between"><span className="text-[#9AAAB8]">Source Type</span><span className="text-[#8A9AA8]">{pfwfResult.sourceType ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[#9AAAB8]">Fingerprint</span><span className="truncate max-w-[62%] text-right font-mono text-[8px] text-[#7A8898]">{pfwfResult.sourceFingerprint?.slice(0, 30) ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[#9AAAB8]">Included Years</span><span className="text-[#8A9AA8]">{auditIdentity?.includedYears?.[0] ?? "—"} → {auditIdentity?.includedYears?.[auditIdentity.includedYears.length - 1] ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[#9AAAB8]">Leakage Check</span><span className="text-white">{pfwfResult.quality.leakageCheckPassed ? "Confirmed" : "Failed"}</span></div>
                  <div className="rounded-[5px] border border-[rgba(255,255,255,0.08)] px-3 py-2 text-[8.5px] text-[#7A8898]">
                    {pfwfResult.quality.neighborStabilityNote}
                  </div>
                </>
              ) : (
                <div className="py-4 text-center text-[#9AAAB8]">Run walk-forward to see local validation audit information.</div>
              )}
              <div className="pt-1 text-[8px] text-[#6E7E8E]">Strict local family walk-forward · Historical research only · No live signal</div>
            </div>
          )}
        </div>
      )}

      {!compact && wfView === "tester" && (
        <div className="mt-2 border-t border-[#0a0a0a] pt-1.5 text-[8px] text-[#6E7E8E]">
          Strict local family walk-forward · {assetId} · usedAsLiveSignal=false
        </div>
      )}
    </div>
  );
});
