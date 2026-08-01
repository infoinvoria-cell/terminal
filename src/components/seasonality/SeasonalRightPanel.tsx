"use client";

import { useEffect, useMemo, useState, memo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import SafeResponsiveContainer from "@/components/shared/SafeResponsiveContainer";
import type { WFResearchGateStatus, WalkForwardResult } from "@/lib/seasonality/walkForward/types";
import type { PatternCandidate } from "@/lib/seasonality/patternSelection";
import { formatPatternWindow, monthDayToApproxSlot } from "@/lib/seasonality/patternSelection";
import type { PatternComparison } from "@/lib/seasonality/patternComparison";
import { qualityDisplayFromEntry, type PatternQualityEntry } from "@/lib/seasonality/patternQuality";
import type { PatternFamilyWFResult } from "@/lib/seasonality/patternFamilyWalkForward";
import styles from "./seasonal.module.css";
import { PanelTitle } from "./PanelTitle";
import { DirectionSparkline } from "./DirectionSparkline";
import {
  getAllPatterns,
  gradeColor,
  gradeBg,
  type DeepValidationPattern,
} from "@/lib/seasonality/deepValidation";

const C_WHITE = "#F0F3F7";
const C_GOLD = "#DCC476";
const C_TEXT_2 = "#A8B4C4";
const C_TEXT_3 = "#6A7785";
const C_SOFT = "rgba(255,255,255,0.035)";
const C_BG = "rgba(255,255,255,0.035)";
const FONT = "Montserrat, Segoe UI, sans-serif";

export type ActivePatternSource = "hover" | "selected" | "next" | "none";
export type DisplayPatternMode =
  | "selected_unvalidated"
  | "wf_validated_deployment"
  | "wf_failed_selected";

export interface SavedPatternRow {
  patternId: string;
  name: string;
  direction: "LONG" | "SHORT";
  entryMonthDay: string;
  holdingTradingDays: number;
  oosWinRate: number | null;
  oosReturn: number | null;
  gateStatus: WFResearchGateStatus;
}

function directionColor(direction: PatternCandidate["direction"] | null | undefined): string {
  if (direction === "LONG") return "#F4F5F7";
  if (direction === "SHORT") return "#D6B867";
  return C_WHITE;
}

function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "-";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(decimals)}%`;
}

function fmtRatio(v: number | null | undefined): string {
  if (v == null) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

function signedColor(v: number | null | undefined): string {
  if (v == null) return C_TEXT_2;
  return v >= 0 ? C_WHITE : C_GOLD;
}

function windowFromSaved(entryMonthDay: string, holdingTradingDays: number): string {
  const slot = monthDayToApproxSlot(entryMonthDay);
  if (slot == null) return `${entryMonthDay} · ${holdingTradingDays}D`;
  return formatPatternWindow(slot, slot + holdingTradingDays);
}

function Donut({
  pct,
  label,
  empty,
  note,
  activeColor = C_WHITE,
  size = 96,
}: {
  pct: number;
  label: string;
  empty?: boolean;
  note?: string;
  activeColor?: string;
  size?: number;
}) {
  const r = size * 0.37;
  const circ = 2 * Math.PI * r;
  const sw = size * 0.09;
  const arc = empty ? 0 : Math.max(0, Math.min(1, pct / 100)) * circ;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={empty ? "rgba(255,255,255,0.05)" : activeColor}
            strokeOpacity={empty ? 1 : 0.35}
            strokeWidth={sw}
            strokeDasharray={empty ? "3 4" : undefined}
          />
          {!empty && arc > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={activeColor}
              strokeOpacity={0.95}
              strokeWidth={sw}
              strokeDasharray={`${arc} ${circ - arc}`}
            />
          )}
        </g>
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={empty ? C_TEXT_3 : activeColor}
          fontFamily={FONT}
          fontSize={size * 0.24}
          fontWeight="700"
        >
          {empty ? "-" : `${pct.toFixed(0)}%`}
        </text>
      </svg>
      <span style={{ fontSize: 10, fontWeight: 500, color: C_TEXT_2, letterSpacing: "0.02em" }}>
        {label}
      </span>
      {note && <span style={{ fontSize: 8.5, color: C_TEXT_3 }}>{note}</span>}
    </div>
  );
}

const MiniSparkline = memo(function MiniSparkline({ returns, size = 96, direction }: { returns: number[]; size?: number; direction?: PatternCandidate["direction"] | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <DirectionSparkline returns={returns} size={size} direction={direction} invertForShort />
      <span style={{ fontSize: 10, fontWeight: 500, color: C_TEXT_2, letterSpacing: "0.02em" }}>
        Direction
      </span>
    </div>
  );
});

// PERF: memo — PatternReturnsBars never needs to update on hover
const PatternReturnsBars = memo(function PatternReturnsBars({
  returns,
  coveredYears,
  lookbackYears = 20,
}: {
  returns: number[];
  coveredYears?: number[];
  lookbackYears?: number;
}) {
  const data = useMemo(() => {
    const currentYear = new Date().getFullYear();          // 2026
    const endYear     = currentYear - 1;                   // 2025
    const startYear   = endYear - lookbackYears + 1;       // 2006

    // Canonical axis: [2006, 2007, ..., 2025] — never 2026
    const axisYears = Array.from({ length: lookbackYears }, (_, i) => startYear + i);

    // Build return-by-year lookup from coveredYears (which excludes missing years)
    const retByYear = new Map<number, number>();
    if (coveredYears && coveredYears.length === returns.length) {
      coveredYears.forEach((yr, i) => { retByYear.set(yr, returns[i]); });
    } else {
      // Fallback: assume returns cover the LAST N covered years up to endYear
      returns.forEach((r, i) => { retByYear.set(endYear - returns.length + 1 + i, r); });
    }

    // JOIN: every axis year gets its return, missing years get null (Gap / no bar)
    return axisYears.map(year => ({
      year,
      v:       retByYear.has(year) ? Number((retByYear.get(year)! * 100).toFixed(2)) : null,
      missing: !retByYear.has(year),
    }));
  }, [returns, coveredYears, lookbackYears]);

  const maxAbsValue = useMemo(() => {
    let max = 0;
    for (const d of data) {
      if (d.v == null) continue;
      max = Math.max(max, Math.abs(d.v));
    }
    return Math.max(1e-9, max);
  }, [data]);

  const hasAnyData = data.some(d => d.v !== null);
  if (!hasAnyData) {
    return <div style={{ height: 110, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: C_TEXT_3 }}>No data</div>;
  }

  return (
    <div style={{ height: 134 }}>
      <SafeResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 6, right: 2, bottom: 16, left: 2 }}>
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.14)" />
          <XAxis
            dataKey="year"
            axisLine={false}
            tickLine={false}
            interval={0}
            tick={{ fill: C_TEXT_2, fontSize: 7.5 }}
            tickFormatter={(v: number) => String(v).slice(2)}  /* "06".."25" */
          />
          <YAxis hide domain={["auto", "auto"]} />
          <Bar dataKey="v" isAnimationActive={false} radius={[1, 1, 0, 0]}>
            {data.map((d, idx) => (
              <Cell
                key={`pr-${idx}`}
                fill={
                  d.missing || d.v === null
                    ? "transparent"                              /* 2006 gap — invisible */
                    : (() => {
                      const strength = Math.min(1, Math.abs(d.v) / maxAbsValue);
                      const opacity = Math.min(0.98, 0.18 + strength * 0.82);
                      return d.v >= 0
                        ? `rgba(240,243,247,${opacity.toFixed(3)})`  /* bullish — white */
                        : `rgba(220,196,118,${opacity.toFixed(3)})`; /* bearish — gold */
                    })()
                }
              />
            ))}
          </Bar>
        </BarChart>
      </SafeResponsiveContainer>
    </div>
  );
});

function KpiCard({ label, value, color, delta, subLabel }: {
  label: string; value: string; color?: string;
  delta?: string | null;
  subLabel?: string | null;
}) {
  return (
    <div style={{
      padding: "10px 12px 12px",
      background: "linear-gradient(to bottom, #1a1c20, #131416)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14,
      boxShadow: "0 4px 16px rgba(0,0,0,0.40)",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
    }}>
      <div style={{
        fontSize: 9, fontWeight: 600, color: C_TEXT_3, lineHeight: 1.2,
        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexWrap: "nowrap" }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px", lineHeight: 1, color: color ?? C_WHITE, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </div>
        {delta && (
          <div style={{ fontSize: 9.5, fontWeight: 500, color: C_TEXT_3, lineHeight: 1, whiteSpace: "nowrap" }}>
            {delta}
          </div>
        )}
      </div>
      {subLabel && (
        <div style={{ fontSize: 8, color: C_TEXT_3, marginTop: 3, lineHeight: 1.2 }}>
          {subLabel}
        </div>
      )}
    </div>
  );
}

// Format deltas for display
function fmtDeltaPct(d: number | null): string | null {
  if (d == null) return null;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}`;
}
function fmtDeltaRatio(d: number | null): string | null {
  if (d == null) return null;
  return `${d >= 0 ? "+" : ""}${d.toFixed(2)}`;
}

function SavedPatternsSection({
  assetId,
  onSelect,
  activeId,
  refreshKey,
}: {
  assetId: string;
  onSelect: (pattern: SavedPatternRow) => void;
  activeId: string | null;
  refreshKey: number;
}) {
  const [patterns, setPatterns] = useState<SavedPatternRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch("/api/seasonality/walk-forward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "listSavedPatterns", assetId }),
    })
      .then((r) => r.json())
      .then((d: { patterns?: SavedPatternRow[] }) => {
        setPatterns(d.patterns ?? []);
        setLoaded(true);
      })
      .catch(() => {
        setPatterns([]);
        setLoaded(true);
      });
  }, [assetId, refreshKey]);

  async function handleDelete(patternId: string): Promise<void> {
    try {
      await fetch("/api/seasonality/walk-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteSavedPattern", assetId, patternId }),
      });
      setPatterns((prev) => prev.filter((p) => p.patternId !== patternId));
    } catch {
      // non-fatal
    }
  }

  if (!loaded) return <div style={{ fontSize: 9.5, color: C_TEXT_3 }}>Loading...</div>;
  if (!patterns.length) return <div style={{ fontSize: 9.5, color: C_TEXT_3 }}>No saved patterns</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {patterns.map((p) => {
        const isActive = p.patternId === activeId;
        const wr = p.oosWinRate != null ? `${(p.oosWinRate * 100).toFixed(0)}%` : "-";
        const avgPerf = p.oosReturn != null ? fmtPct(p.oosReturn) : "-";

        return (
          <div
            key={p.patternId}
            onClick={() => onSelect(p)}
            style={{
              display: "grid",
              gridTemplateColumns: "56px 1fr 44px 56px 16px",
              alignItems: "center",
              gap: 6,
              padding: "5px 8px",
              background: isActive ? "rgba(255,255,255,0.05)" : "transparent",
              border: `1px solid ${isActive ? C_SOFT : "transparent"}`,
              borderRadius: 6,
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 9, color: p.direction === "LONG" ? C_WHITE : C_GOLD, fontWeight: 700 }}>
              {p.direction}
            </span>
            <span style={{ fontSize: 9, color: C_TEXT_2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {windowFromSaved(p.entryMonthDay, p.holdingTradingDays)}
            </span>
            <span style={{ fontSize: 9, color: p.oosWinRate != null && p.oosWinRate >= 0.5 ? C_WHITE : C_GOLD, fontWeight: 600 }}>
              {wr}
            </span>
            <span style={{ fontSize: 9, color: signedColor(p.oosReturn) }}>{avgPerf}</span>
            <button
              type="button"
              aria-label={`Delete ${p.name}`}
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(p.patternId);
              }}
              style={{
                width: 14,
                height: 14,
                border: "none",
                background: "transparent",
                color: C_TEXT_3,
                cursor: "pointer",
                padding: 0,
                outline: "none",
              }}
              title="Delete saved pattern"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                <path d="M3.5 4.5h9M6.2 4.5v-1.2h3.6v1.2M5.2 6.2v5.6M8 6.2v5.6M10.8 6.2v5.6M4.5 4.5l.6 8h5.8l.6-8" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Next Pattern column (LONG or SHORT) ──────────────────────────────────────
function NextPatternColumn({
  pattern,
  quality,
  direction,
  searching,
  onActivate,
}: {
  pattern: PatternCandidate | null;
  quality: PatternQualityEntry | null;
  direction: "LONG" | "SHORT";
  /** True while the quality-gate state machine is still checking candidates. */
  searching: boolean;
  onActivate: (p: PatternCandidate | null) => void;
}) {
  const color  = direction === "LONG" ? C_WHITE : C_GOLD;
  const qd     = qualityDisplayFromEntry(quality);
  // Direction sparkline: use raw price returns (invert SHORT to show actual price direction)
  const priceReturns = pattern
    ? (direction === "SHORT" ? pattern.strategyReturns.map(r => -r) : pattern.strategyReturns)
    : [];

  return (
    <button
      type="button"
      onClick={() => onActivate(pattern ?? null)}
      style={{
        flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5,
        padding: "0 4px", border: "none", outline: "none", background: "transparent",
        textAlign: "left", cursor: pattern ? "pointer" : "default",
      }}
    >
      {/* Direction label */}
      <div style={{ fontSize: 10.5, fontWeight: 700, color, letterSpacing: "0.03em" }}>
        {direction}
      </div>

      {pattern ? (
        <>
          {/* Window + holding + sharpe */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4, width: "100%" }}>
            <div>
              <div style={{ fontSize: 8, color: C_TEXT_3, marginBottom: 2 }}>WINDOW</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color, lineHeight: 1.1 }}>
                  {formatPatternWindow(pattern.startSlot, pattern.endSlot)}
                </span>
                <span style={{ fontSize: 9, color: "rgba(168,180,196,0.55)", fontWeight: 600 }}>
                  | {pattern.holdingDays}D
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 8, color: C_TEXT_3, marginBottom: 2 }}>SHARPE RATIO</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.1 }}>
                {pattern.sharpe != null ? pattern.sharpe.toFixed(2) : "—"}
              </div>
            </div>
          </div>

          {/* Three rings: Winrate, Direction, Quality */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-evenly", gap: 4 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <Donut pct={pattern.winRate} label="Winrate" size={58} activeColor={color} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              {/* Use real price returns (not profit-normalized) for direction visualization */}
              <DirectionSparkline returns={priceReturns} direction={direction} size={58} invertForShort={false} />
              <span style={{ fontSize: 8.5, fontWeight: 500, color: C_TEXT_2, letterSpacing: "0.02em" }}>Direction</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              {/* note suppressed: status shown via ring fill/color only, label stays "Quality" */}
              <Donut pct={qd.pct} label="Quality" size={58} activeColor={qd.color} empty={qd.empty} />
            </div>
          </div>
        </>
      ) : searching ? (
        <div style={{ fontSize: 9, color: C_TEXT_3, padding: "8px 0" }}>Calculating…</div>
      ) : (
        <div style={{ fontSize: 9, color: C_TEXT_3, padding: "8px 0" }}>No qualified setup</div>
      )}
    </button>
  );
}

/* ─── Deep Validation Block — Backtrader 7-Test summary ────────────── */
function DeepValidationBlock({ pattern }: { pattern: DeepValidationPattern }) {
  if (pattern.deep_score == null || pattern.deep_grade == null) return null;
  const gc = gradeColor(pattern.deep_grade);
  const gb = gradeBg(pattern.deep_grade);
  const C_PASS = "#22C55E";
  const C_FAIL = "#EF4444";
  const C_SCORE = "#C9A84C";
  const C_LBL = "#6B7280";
  const rows: { label: string; value: string; color: string }[] = [
    { label: "WF Strict", value: `${pattern.wf_strict_pct?.toFixed(0) ?? "—"}%`, color: (pattern.wf_strict_pct ?? 0) >= 60 ? C_PASS : C_FAIL },
    { label: "Bonferroni", value: pattern.bonferroni_significant ? "PASS" : "FAIL", color: pattern.bonferroni_significant ? C_PASS : C_FAIL },
    { label: "Stabilität", value: `${pattern.param_stability_pct?.toFixed(0) ?? "—"}%`, color: (pattern.param_stability_pct ?? 0) >= 70 ? C_PASS : C_FAIL },
    { label: "Dekaden", value: `${pattern.decades_profitable ?? 0}/5`, color: (pattern.decades_profitable ?? 0) >= 4 ? C_PASS : C_FAIL },
    { label: "Forward", value: pattern.forward_pass ? "PASS" : "FAIL", color: pattern.forward_pass ? C_PASS : C_FAIL },
  ];

  return (
    <div style={{ padding: "6px 10px 8px", flexShrink: 0 }}>
      <div style={{
        background: "rgba(12,14,18,0.92)", border: `1px solid ${gc}30`,
        borderRadius: 10, padding: "10px 12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: C_LBL, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
            Backtrader Validation
          </span>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 900, color: gc,
              background: gb, padding: "2px 8px", borderRadius: 6,
              fontFamily: FONT,
            }}>
              {pattern.deep_grade}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C_SCORE, fontFamily: FONT }}>
              {pattern.deep_score}
            </span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px" }}>
          {rows.map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: C_LBL, fontFamily: FONT }}>{r.label}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: r.color, fontFamily: FONT }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface Props {
  wfResult: WalkForwardResult | null;
  activePattern: PatternCandidate | null;
  activePatternSource: ActivePatternSource;
  displayMode?: DisplayPatternMode;
  wfFamilyResult?: PatternFamilyWFResult | null;
  selectedPatternGateStatus: WFResearchGateStatus | null;
  nextPattern: PatternCandidate | null;
  assetId: string;
  activePatternId: string | null;
  onSelectSaved: (pattern: SavedPatternRow) => void;
  onActivatePattern: (pattern: PatternCandidate | null) => void;
  savedPatternsRefreshKey: number;
  comparison?: PatternComparison | null;
  /** Quality from strict PFWF OOS for the currently locked/selected pattern. */
  kpiPatternQuality?: PatternQualityEntry | null;
  /** Quality from strict PFWF OOS for the Next Pattern (legacy single). */
  nextPatternQuality?: PatternQualityEntry | null;
  /** Qualified LONG next pattern (WR≥70%, avgPerf>0, PF>1, within next 20 slots). */
  nextPatternLong?: PatternCandidate | null;
  /** Qualified SHORT next pattern. */
  nextPatternShort?: PatternCandidate | null;
  /** Quality for LONG next pattern. */
  nextLongQuality?: PatternQualityEntry | null;
  /** Quality for SHORT next pattern. */
  nextShortQuality?: PatternQualityEntry | null;
  /** True while the quality-gate state machine is still evaluating LONG candidates. */
  nextLongSearching?: boolean;
  /** True while the quality-gate state machine is still evaluating SHORT candidates. */
  nextShortSearching?: boolean;
  /** In Strategy Engine mode: hide Pattern Returns, Next Pattern, Saved Patterns. */
  engineMode?: boolean;
}

// PERF: memo — prevents re-render when unrelated parent state changes
export const SeasonalRightPanel = memo(function SeasonalRightPanel({
  wfResult,
  activePattern,
  activePatternSource,
  displayMode = "selected_unvalidated",
  wfFamilyResult = null,
  selectedPatternGateStatus: _selectedPatternGateStatus,
  nextPattern,
  assetId,
  activePatternId,
  onSelectSaved,
  onActivatePattern,
  savedPatternsRefreshKey,
  comparison,
  kpiPatternQuality,
  nextPatternQuality: _nextPatternQuality,
  nextPatternLong,
  nextPatternShort,
  nextLongQuality,
  nextShortQuality,
  nextLongSearching,
  nextShortSearching,
  engineMode,
}: Props) {
  const kpiSource = activePattern ?? null;
  const hasCompletedWf = Boolean(wfFamilyResult);
  const isWfValidatedDisplay = displayMode === "wf_validated_deployment" && Boolean(wfFamilyResult?.deploymentPattern);
  const isWfFailedDisplay = displayMode === "wf_failed_selected" && Boolean(wfFamilyResult);
  const wfQualityEntry: PatternQualityEntry | null = wfFamilyResult
    ? { status: "done", result: wfFamilyResult }
    : null;

  // PERF: wrap all expensive per-render computations in useMemo with stable deps
  // Quality comes ONLY from real WF gate result — never from full-sample returns
  // Quality for KPI ring — exclusively from strict PFWF OOS (kpiPatternQuality prop).
  // selectedPatternGateStatus kept for backward compat but not used for display.
  const kpiQualityDisplay = qualityDisplayFromEntry(
    isWfValidatedDisplay || isWfFailedDisplay ? wfQualityEntry : kpiPatternQuality,
  );
  const modeLabel = isWfValidatedDisplay
    ? "WF OOS · Validated"
    : isWfFailedDisplay
      ? "WF OOS · Not Validated"
      : "Historical Pattern KPIs";
  const statusLabel = isWfValidatedDisplay
    ? "Validated deployment pattern"
    : isWfFailedDisplay
      ? "No deployable local variant"
      : "Not tested";
  const statusColor = isWfValidatedDisplay ? C_WHITE : isWfFailedDisplay ? C_GOLD : C_TEXT_2;

  const validatedOosReturns = useMemo(
    () => wfFamilyResult?.folds.filter((fold) => fold.oosValid && fold.oosReturn != null).map((fold) => fold.oosReturn ?? 0) ?? [],
    [wfFamilyResult],
  );
  const validatedOosYears = useMemo(
    () => wfFamilyResult?.folds.filter((fold) => fold.oosValid && fold.oosReturn != null).map((fold) => fold.oosYear) ?? [],
    [wfFamilyResult],
  );

  // PERF: sparkline uses STABLE data (locked/next pattern) — NOT hover-reactive
  // This prevents MiniSparkline from re-rendering on every hover
  const stablePattern = activePatternSource !== "hover" ? activePattern : null;
  const sparkReturns = hasCompletedWf
    ? validatedOosReturns
    : stablePattern?.strategyReturns
    ?? wfResult?.foldResults.filter((f) => f.oosNetReturn != null).map((f) => f.oosNetReturn as number)
    ?? [];
  const returnsForBars = hasCompletedWf ? validatedOosReturns : sparkReturns;
  const coveredYearsForBars = hasCompletedWf ? validatedOosYears : stablePattern?.coveredYears;
  const activeDirection = kpiSource?.direction ?? null;
  const activeDirectionColor = directionColor(activeDirection);

  // When comparison is active: show tested metrics as main values; baseline stays in delta
  const cmp = hasCompletedWf ? null : (comparison ?? null);
  const deploymentPattern = wfFamilyResult?.deploymentPattern ?? null;

  const kpiWindow = (() => {
    if (isWfValidatedDisplay && deploymentPattern) return deploymentPattern.windowLabel;
    if (isWfFailedDisplay && wfFamilyResult?.selectedPatternBaseline) return wfFamilyResult.selectedPatternBaseline.windowLabel;
    if (cmp?.windowChanged && cmp.testedWindow) return cmp.testedWindow;
    return kpiSource ? formatPatternWindow(kpiSource.startSlot, kpiSource.endSlot) : "-";
  })();
  const kpiWindowSub = (cmp?.windowChanged && kpiSource && !hasCompletedWf)
    ? `zuvor ${formatPatternWindow(kpiSource.startSlot, kpiSource.endSlot)}`
    : null;

  const kpiHolding = (() => {
    if (isWfValidatedDisplay && deploymentPattern) return `${deploymentPattern.holdingDays} Days`;
    if (isWfFailedDisplay && wfFamilyResult?.selectedPatternBaseline?.holdingDays != null) return `${wfFamilyResult.selectedPatternBaseline.holdingDays} Days`;
    if (cmp?.holdingChanged && cmp.testedHoldingDays != null) return `${cmp.testedHoldingDays} Days`;
    return kpiSource ? `${kpiSource.holdingDays} Days` : "-";
  })();
  const kpiHoldingSub = (cmp?.holdingChanged && kpiSource && !hasCompletedWf)
    ? `zuvor ${kpiSource.holdingDays} Days`
    : null;

  const srcAvgPerf = hasCompletedWf
    ? (wfFamilyResult?.quality.oosAvgReturn ?? null)
    : cmp ? cmp.avgPerformance : kpiSource?.avgPerformance;
  const srcMaxDD = hasCompletedWf
    ? (wfFamilyResult?.quality.oosMaxDrawdown ?? null)
    : cmp ? cmp.maxDrawdown : kpiSource?.maxDrawdown;
  const srcSharpe = hasCompletedWf
    ? null
    : cmp ? cmp.sharpe : kpiSource?.sharpe;
  const srcCalmar = hasCompletedWf
    ? null
    : cmp ? cmp.calmar : kpiSource?.calmar;
  const srcPF = hasCompletedWf
    ? (wfFamilyResult?.quality.oosProfitFactor ?? null)
    : cmp ? cmp.profitFactor : (kpiSource?.profitFactor ?? null);
  const srcWinRate = hasCompletedWf
    ? (wfFamilyResult?.quality.oosWinRate ?? null)
    : cmp ? cmp.winRate : kpiSource?.winRate;
  const srcAvgDD = hasCompletedWf ? null : (kpiSource?.avgDrawdown ?? null);

  const kpiAvgPerf       = srcAvgPerf    != null ? (hasCompletedWf ? `${srcAvgPerf >= 0 ? "+" : ""}${(srcAvgPerf * 100).toFixed(2)}%` : fmtPct(srcAvgPerf, 1)) : "-";
  const kpiMaxDD         = srcMaxDD      != null ? `-${(srcMaxDD * 100).toFixed(1)}%`         : "-";
  const kpiSharpe        = fmtRatio(srcSharpe ?? null);
  const kpiAvgDD         = srcAvgDD != null ? `-${(srcAvgDD * 100).toFixed(1)}%` : "-";
  const kpiCalmar        = fmtRatio(srcCalmar ?? null);
  const kpiProfitFactor  = srcPF         != null ? srcPF.toFixed(2)                           : "-";
  const winratePctDisplay = srcWinRate   ?? (kpiSource?.winRate ?? 50);

  const sectionGap = <div className={styles.rightPanelSectionGap} aria-hidden />;
  void nextPattern; // kept in Props for legacy compat but two-column layout uses nextPatternLong/Short

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#06080c", overflow: "hidden", fontFamily: FONT }}>
      <PanelTitle>Pattern KPIs</PanelTitle>
      <div style={{ padding: "12px 10px 10px", display: "flex", alignItems: "flex-start", justifyContent: "space-around", flexShrink: 0, gap: 6 }}>
        <Donut pct={winratePctDisplay} label={hasCompletedWf ? "OOS Winrate" : "Winrate"} empty={!kpiSource} size={96} activeColor={activeDirectionColor} />
        <MiniSparkline returns={sparkReturns} size={96} direction={activeDirection} />
        <Donut
          pct={kpiQualityDisplay.pct}
          label="Quality"
          empty={kpiQualityDisplay.empty}
          note={kpiQualityDisplay.note}
          size={96}
          activeColor={kpiQualityDisplay.color}
        />
      </div>
      <div style={{ padding: "0 10px 2px", fontSize: 9.5, fontWeight: 600, color: statusColor, letterSpacing: "0.03em", flexShrink: 0 }}>
        {modeLabel}
      </div>
      <div style={{ padding: "0 10px 8px", fontSize: 8.5, fontWeight: 600, color: statusColor, letterSpacing: "0.03em", flexShrink: 0 }}>
        {statusLabel}
      </div>

      {/* ── Backtrader Deep Validation ── */}
      {(() => {
        if (!kpiSource) return null;
        const allP = getAllPatterns();
        const match = allP.find(p =>
          p.deep_score != null &&
          p.asset.toLowerCase() === (kpiSource as any)?.assetId?.toLowerCase?.() &&
          p.direction === kpiSource.direction
        ) ?? allP.find(p =>
          p.deep_score != null &&
          kpiSource.startSlot != null &&
          Math.abs((p.wf_efficiency ?? 0) - (kpiSource as any)?.winRate * 100) < 5
        );
        return match ? <DeepValidationBlock pattern={match} /> : null;
      })()}

      <div style={{ padding: "6px 10px 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, flexShrink: 0 }}>
        <KpiCard label="Window" value={kpiWindow} color={activeDirectionColor} subLabel={kpiWindowSub} />
        <KpiCard label="Trading Days" value={kpiHolding} color={activeDirectionColor} subLabel={kpiHoldingSub} />
        <KpiCard label={hasCompletedWf ? "OOS Avg Performance" : "Avg. Performance"} value={kpiAvgPerf} color={activeDirectionColor}
          delta={fmtDeltaPct(cmp?.dAvgPerf ?? null)} />
        <KpiCard label={hasCompletedWf ? "OOS Max Drawdown" : "Max. Drawdown"} value={kpiMaxDD} color={C_GOLD}
          delta={fmtDeltaPct(cmp?.dMaxDD ?? null)} />
        <KpiCard label="Sharpe Ratio" value={kpiSharpe} color={signedColor(srcSharpe ?? null)}
          delta={fmtDeltaRatio(cmp?.dSharpe ?? null)} />
        <KpiCard label="Avg. Drawdown" value={kpiAvgDD} color={C_GOLD} />
        <KpiCard label="Calmar Ratio" value={kpiCalmar} color={signedColor(srcCalmar ?? null)}
          delta={fmtDeltaRatio(cmp?.dCalmar ?? null)} />
        <KpiCard label={hasCompletedWf ? "OOS Profit Factor" : "Profit Factor"} value={kpiProfitFactor}
          color={(srcPF ?? 0) >= 1 ? C_WHITE : C_GOLD}
          delta={fmtDeltaRatio(cmp?.dPF ?? null)} />
      </div>
      {/* Pattern Returns, Next Pattern, Saved Patterns hidden in Strategy Engine mode */}
      {!engineMode && (<>
        {sectionGap}
        <PanelTitle>{hasCompletedWf ? "WF OOS Returns" : "Pattern Returns · Historical"}</PanelTitle>
        <div style={{ flexShrink: 0, padding: "6px 12px 4px" }}>
          <PatternReturnsBars returns={returnsForBars} coveredYears={coveredYearsForBars} />
        </div>
      </>)}
    </div>
  );
});
