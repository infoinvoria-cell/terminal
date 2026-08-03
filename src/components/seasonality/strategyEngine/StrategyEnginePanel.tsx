"use client";

import { useCallback, useRef, useState, memo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line,
  ReferenceLine, XAxis, YAxis,
} from "recharts";
import { getAssetDef } from "@/lib/seasonality/walkForward/assetManifest";
import SafeResponsiveContainer from "@/components/shared/SafeResponsiveContainer";

const C_WHITE  = "#F0F3F7";
const C_GOLD   = "#C9A84C";
const C_TEXT_2 = "#A8B4C4";
const C_TEXT_3 = "#6A7785";
const C_BG     = "rgba(255,255,255,0.025)";
const C_SOFT   = "rgba(255,255,255,0.07)";
const FONT     = "Montserrat, Segoe UI, sans-serif";

type EngineTab = "patterns" | "portfolio" | "group" | "statistics" | "method";

function pct(v: number | null | undefined, d = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
}
function num(v: number | null | undefined, d = 2): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;
}

// Compact KPI cell
function K({ l, v, c, small }: { l: string; v: string; c?: string; small?: boolean }) {
  return (
    <div style={{ padding: small ? "5px 8px" : "7px 9px", background: C_BG,
      border: `1px solid ${C_SOFT}`, borderRadius: 7, minWidth: 0 }}>
      <div style={{ fontSize: 8, color: C_TEXT_3, marginBottom: 2 }}>{l}</div>
      <div style={{ fontSize: small ? 11 : 13, fontWeight: 700, color: c ?? C_WHITE, lineHeight: 1 }}>{v}</div>
    </div>
  );
}

// ── Type defs ─────────────────────────────────────────────────────────────────
type ValidatedCandidate = {
  direction: "LONG" | "SHORT";
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
  foldOosReturns: Array<{ year: number; oosReturn: number; entrySlot: number; holdingDays: number }>;
};

// ── Compact Pattern Card ──────────────────────────────────────────────────────
function PatternCard({ p, selected, onClick }: {
  p: ValidatedCandidate; selected: boolean; onClick: () => void;
}) {
  const isShort = p.direction === "SHORT";
  const color   = isShort ? C_GOLD : C_WHITE;
  const qColor  = p.qualityScore >= 90 ? C_WHITE : C_WHITE;

  return (
    <button type="button" onClick={onClick} style={{
      background: selected ? "rgba(255,255,255,0.05)" : C_BG,
      border: `1px solid ${selected ? "rgba(255,255,255,0.16)" : C_SOFT}`,
      borderRadius: 10, padding: "11px 13px", textAlign: "left",
      cursor: "pointer", fontFamily: FONT, flex: "1 1 0", minWidth: 160,
      transition: "border-color 0.12s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{p.direction}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: qColor, padding: "1px 6px",
          background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
          Q{p.qualityScore}
        </span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 4, lineHeight: 1.2 }}>
        {p.windowLabel}
      </div>
      <div style={{ fontSize: 9.5, color: C_TEXT_3, marginBottom: 9 }}>{p.holdingDays}D</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3 }}>
        <div><div style={{ fontSize: 7.5, color: C_TEXT_3 }}>WR</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: p.oosWinRate>=60?C_WHITE:C_GOLD }}>{p.oosWinRate.toFixed(0)}%</div></div>
        <div><div style={{ fontSize: 7.5, color: C_TEXT_3 }}>PF</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: p.oosProfitFactor>=1?C_WHITE:C_GOLD }}>{p.oosProfitFactor.toFixed(2)}</div></div>
        <div><div style={{ fontSize: 7.5, color: C_TEXT_3 }}>DD</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C_GOLD }}>-{(p.oosMaxDrawdown*100).toFixed(1)}%</div></div>
      </div>
      {/* Research status chip */}
      <div style={{ marginTop: 7, display: "flex", justifyContent: "flex-end" }}>
        <span style={{ fontSize: 7.5, padding: "1px 5px", background: "rgba(168,180,196,0.08)",
          border: "1px solid rgba(168,180,196,0.2)", borderRadius: 3, color: C_TEXT_3 }}>
          Research
        </span>
      </div>
    </button>
  );
}

// ── Pattern Detail (appears only when card is clicked) ────────────────────────
function PatternDetail({ p }: { p: ValidatedCandidate }) {
  const [showFolds, setShowFolds] = useState(false);
  const foldRatePct = p.oosFolds > 0 ? (p.positiveFoldCount / p.oosFolds * 100) : 0;

  return (
    <div style={{ background: C_BG, border: `1px solid ${C_SOFT}`, borderRadius: 9,
      padding: "10px 12px", marginTop: 8, fontFamily: FONT }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, color: C_TEXT_2, marginBottom: 8 }}>
        {p.direction} · {p.windowLabel} · {p.holdingDays}D — OOS Detail
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 5, marginBottom: 6 }}>
        <K l="OOS Trades" v={String(p.oosTrades)} small />
        <K l="OOS WR"     v={`${p.oosWinRate.toFixed(0)}%`} c={p.oosWinRate>=60?C_WHITE:C_GOLD} small />
        <K l="OOS Avg/Y"  v={pct(p.oosAvgReturn)} c={p.oosAvgReturn>0?C_WHITE:C_GOLD} small />
        <K l="OOS PF"     v={num(p.oosProfitFactor)} c={p.oosProfitFactor>=1?C_WHITE:C_GOLD} small />
        <K l="Pos. Folds" v={`${foldRatePct.toFixed(0)}%`} small />
        <K l="Stability"  v={`${(p.parameterStability*100).toFixed(0)}%`} small />
      </div>
      <button type="button" onClick={() => setShowFolds(v => !v)}
        style={{ fontSize: 8.5, color: C_TEXT_3, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
        {showFolds ? "▾" : "▸"} OOS fold returns ({p.foldOosReturns.length} years)
      </button>
      {showFolds && (
        <div style={{ marginTop: 5, display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 3 }}>
          {p.foldOosReturns.map((f, i) => (
            <div key={i} style={{ textAlign: "center", padding: "2px", background: "rgba(255,255,255,0.02)", borderRadius: 3 }}>
              <div style={{ fontSize: 7, color: C_TEXT_3 }}>{f.year}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: f.oosReturn >= 0 ? C_WHITE : C_GOLD }}>
                {pct(f.oosReturn, 1)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Patterns Tab ──────────────────────────────────────────────────────────────
function PatternsTab({ result, assetId }: { result: Record<string, unknown>; assetId: string }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const s = result.statisticalEvidence as Record<string, number | boolean | string>;
  const valid = (result.validatedPatterns as ValidatedCandidate[]) ?? [];
  const rejected = (result.rejectedCandidates as (ValidatedCandidate & { rejectionReason?: string })[]) ?? [];
  const approvalStatus = String((result.statisticsEnhanced as Record<string,unknown>|null)?.researchApprovalStatus ?? "wf_validated_statistics_pending");
  const pe = result.preEntryExhaustionResearch as Record<string,unknown>|null;

  // Experimental Pre-Move P90 variant data (ZS LONG Oct + P90)
  const preMoveOctPattern = pe && (pe.patternResults as unknown[])
    ? (pe.patternResults as Array<Record<string,unknown>>).find(r =>
        String(r.patternKey).includes("LONG") && String(r.patternKey).includes("s191"))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Research status header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 9, color: C_TEXT_3 }}>
          Base Research Patterns · Not approved for trading
        </div>
        <span style={{ fontSize: 8, padding: "2px 6px", background: "rgba(168,180,196,0.06)",
          border: "1px solid rgba(168,180,196,0.15)", borderRadius: 3, color: C_TEXT_3 }}>
          {approvalStatus.includes("failure") ? "Statistics Incomplete" : "Research Only"}
        </span>
      </div>

      {/* 4-card summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
        <K l="Candidates" v={String(s.candidateUniverseSize ?? "—")} />
        <K l="WF Tested"  v={String(s.wfTestedCandidates ?? "—")} />
        <K l="OOS Validated" v={String(valid.length)} c={valid.length>0?C_WHITE:C_TEXT_3} />
        <K l="Overlaps Removed" v={String(s.overlapConflictsRemoved ?? "—")} />
      </div>

      {valid.length === 0 ? (
        <div style={{ padding: "20px", textAlign: "center", color: C_TEXT_3, fontSize: 11 }}>
          No patterns passed OOS gate (Q≥75, Strong/Excellent).
        </div>
      ) : (
        <>
          {/* Compact card grid */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {valid.map((p, i) => (
              <PatternCard key={i} p={p} selected={selectedIdx === i}
                onClick={() => setSelectedIdx(selectedIdx === i ? null : i)} />
            ))}
          </div>

          {/* Detail only when selected */}
          {selectedIdx !== null && valid[selectedIdx] && (
            <PatternDetail p={valid[selectedIdx]} />
          )}
        </>
      )}

      {/* Experimental Pre-Move P90 variant — separated from base patterns */}
      {preMoveOctPattern && (
        <div style={{ padding: "7px 10px", background: "rgba(255,255,255,0.015)",
          border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6 }}>
          <div style={{ fontSize: 8, color: C_TEXT_3, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Experimental Research Variant
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: 9.5, color: C_WHITE }}>LONG Oct + Pre-Move Veto P90</span>
              <span style={{ fontSize: 8, color: C_TEXT_3, marginLeft: 6 }}>Forward comparison only · Not in base portfolio</span>
            </div>
            <div style={{ fontSize: 9, color: C_TEXT_3, textAlign: "right" }}>
              <div>{"Base: Cal="}{String((preMoveOctPattern.baselineMetrics as Record<string,unknown>)?.calmar ?? "—")}</div>
              <div style={{ color: C_WHITE }}>{"P90: Cal="}{String((preMoveOctPattern.p90Metrics as Record<string,unknown>)?.calmar ?? "—")}</div>
            </div>
          </div>
        </div>
      )}

      {/* Rejected list (collapsed) */}
      {rejected.length > 0 && (
        <details style={{ fontSize: 9, color: C_TEXT_3 }}>
          <summary style={{ cursor: "pointer", padding: "2px 0" }}>
            Rejected / Overlapping ({rejected.length})
          </summary>
          <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 2 }}>
            {rejected.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "2px 7px",
                background: C_BG, borderRadius: 4, fontSize: 8.5 }}>
                <span style={{ color: c.direction==="SHORT"?C_GOLD:C_WHITE, fontWeight: 700, minWidth: 38 }}>{c.direction}</span>
                <span style={{ color: C_TEXT_2 }}>{c.windowLabel} · {c.holdingDays}D</span>
                <span style={{ color: C_GOLD }}>{c.rejectionReason?.replace(/_/g," ")}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Asset Portfolio Tab ───────────────────────────────────────────────────────
function PortfolioTab({ result }: { result: Record<string, unknown> }) {
  type PortData = {
    oosYears: number; oosTradeCount: number; oosWinRate: number;
    oosCompoundReturn: number; oosCagr: number; oosProfitFactor: number;
    oosMaxDrawdown: number; oosCalmar: number | null;
    positiveYears: number; worstYear: number | null; worstYearReturn: number | null;
    maxConcurrentPositions: number; exposureTimePct: number;
    equitySeries: Array<{ year: number; equity: number }>;
    yearlyReturns: Array<{ year: number; portfolioReturn: number; tradeCount: number }>;
    patternContribution: Array<{ direction: string; windowLabel: string; holdingDays: number; oosTrades: number; oosAvgReturn: number; oosMaxDD: number; qualityScore: number }>;
    riskVersion?: string;
  };
  const port = result.assetPortfolio as PortData | null;
  const valid = (result.validatedPatterns as ValidatedCandidate[]) ?? [];

  if (!port) {
    return <div style={{ padding: "20px", color: C_TEXT_3, fontSize: 11 }}>
      No portfolio data. Run the engine to compute bar-level OOS portfolio.
    </div>;
  }

  const yearlyData = port.yearlyReturns.map(yr => ({
    year: yr.year,
    ret: parseFloat((yr.portfolioReturn * 100).toFixed(2)),
  }));

  const isBarLevel = !!port.riskVersion;
  const calmarOk = port.oosCalmar != null && port.oosMaxDrawdown > 0;

  const approvalStatus2 = String((result.statisticsEnhanced as Record<string,unknown>|null)?.researchApprovalStatus ?? "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Research Portfolio header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", paddingBottom: 8, borderBottom: `1px solid ${C_SOFT}` }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C_WHITE }}>
            {(result.assetName as string) ?? "Asset"} Research Portfolio
          </div>
          <div style={{ fontSize: 8.5, color: C_TEXT_3, marginTop: 2 }}>
            Built from {valid.length} frozen seasonal research pattern{valid.length !== 1 ? "s" : ""} · Strict-WF OOS · Bar-Level Risk
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ fontSize: 8, padding: "2px 6px", background: "rgba(168,180,196,0.06)", border: "1px solid rgba(168,180,196,0.15)", borderRadius: 3, color: C_TEXT_3 }}>
            {approvalStatus2.includes("failure") ? "Statistics Incomplete" : "Research Only"}
          </span>
          <span style={{ fontSize: 8, padding: "2px 6px", background: "rgba(220,196,118,0.06)", border: "1px solid rgba(220,196,118,0.15)", borderRadius: 3, color: C_GOLD }}>
            Not approved for trading
          </span>
        </div>
      </div>
      {/* KPI Row — bar-level values */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 7 }}>
        <K l="Patterns"    v={String(valid.length)} />
        <K l="OOS Trades"  v={String(port.oosTradeCount)} />
        <K l="OOS WR"      v={`${port.oosWinRate.toFixed(0)}%`}    c={port.oosWinRate>=50?C_WHITE:C_GOLD} />
        <K l="OOS Return"  v={`${port.oosCompoundReturn>=0?"+":""}${port.oosCompoundReturn.toFixed(1)}%`}
                           c={port.oosCompoundReturn>=0?C_WHITE:C_GOLD} />
        <K l="OOS PF"      v={num(port.oosProfitFactor)}            c={port.oosProfitFactor>=1?C_WHITE:C_GOLD} />
        <K l="OOS Calmar"  v={isBarLevel && calmarOk ? num(port.oosCalmar) : "—"}
                           c={calmarOk && (port.oosCalmar??0)>=1?C_WHITE:C_TEXT_3} />
      </div>
      {/* Second KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7, marginTop: -6 }}>
        <K l="OOS Years"  v={String(port.oosYears)} small />
        <K l="Pos. Years" v={`${port.positiveYears}/${port.oosYears}`} small />
        <K l="OOS MaxDD"  v={isBarLevel ? `-${port.oosMaxDrawdown.toFixed(1)}%` : "pending"}
                          c={isBarLevel ? C_GOLD : C_TEXT_3} small />
        <K l="OOS CAGR"   v={`${port.oosCagr>=0?"+":""}${port.oosCagr.toFixed(1)}%`}
                          c={port.oosCagr>=0?C_WHITE:C_GOLD} small />
        <K l="Exposure"   v={`${port.exposureTimePct.toFixed(0)}%`} small />
      </div>
      {isBarLevel && (
        <div style={{ fontSize: 8.5, color: C_TEXT_3, marginTop: -8, paddingLeft: 2 }}>
          Bar-level mark-to-market OOS portfolio equity · {port.riskVersion}
        </div>
      )}

      {/* Charts 2-column */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* OOS Equity Curve */}
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 600, color: C_TEXT_2, marginBottom: 6 }}>OOS Portfolio Equity</div>
          <div style={{ height: 150 }}>
            <SafeResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <ComposedChart data={port.equitySeries} margin={{ top: 4, right: 4, bottom: 14, left: 4 }}>
                <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="year" tick={{ fill: C_TEXT_3, fontSize: 8 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C_TEXT_3, fontSize: 8 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `${v>=0?"+":""}${v.toFixed(0)}%`} width={34} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 3" />
                <Line type="monotone" dataKey="equity" stroke={C_WHITE} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </SafeResponsiveContainer>
          </div>
        </div>

        {/* Seasonal Calendar */}
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 600, color: C_TEXT_2, marginBottom: 6 }}>Seasonal Calendar</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {valid.map((p, i) => {
              const color = p.direction === "SHORT" ? C_GOLD : C_WHITE;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px",
                  background: C_BG, borderRadius: 6, fontSize: 9.5 }}>
                  <span style={{ color, fontWeight: 700, minWidth: 38 }}>{p.direction}</span>
                  <span style={{ color: C_TEXT_2, flex: 1 }}>{p.windowLabel} · {p.holdingDays}D</span>
                  <span style={{ color, fontWeight: 700, fontSize: 9 }}>Q{p.qualityScore}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* OOS Return by Year */}
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 600, color: C_TEXT_2, marginBottom: 6 }}>OOS Return by Year / Fold</div>
          <div style={{ height: 110 }}>
            <SafeResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={yearlyData} margin={{ top: 4, right: 4, bottom: 14, left: 4 }}>
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.14)" />
                <XAxis dataKey="year" tick={{ fill: C_TEXT_3, fontSize: 8 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C_TEXT_3, fontSize: 8 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `${v>=0?"+":""}${v.toFixed(0)}%`} width={30} />
                <Bar dataKey="ret" isAnimationActive={false} radius={[2,2,0,0]}>
                  {yearlyData.map((d, i) => (
                    <Cell key={i} fill={d.ret>=0?"rgba(240,243,247,0.78)":"rgba(220,196,118,0.82)"} />
                  ))}
                </Bar>
              </BarChart>
            </SafeResponsiveContainer>
          </div>
        </div>

        {/* Pattern Contribution */}
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 600, color: C_TEXT_2, marginBottom: 6 }}>Pattern Contribution</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(port.patternContribution ?? []).map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "32px 1fr 36px 48px",
                gap: 6, alignItems: "center", padding: "5px 8px", background: C_BG, borderRadius: 5, fontSize: 9 }}>
                <span style={{ color: c.direction==="SHORT"?C_GOLD:C_WHITE, fontWeight: 700 }}>{c.direction.slice(0,1)}</span>
                <span style={{ color: C_TEXT_2, fontSize: 8.5 }}>{c.windowLabel} {c.holdingDays}D</span>
                <span style={{ color: C_TEXT_3, fontSize: 8 }}>T:{c.oosTrades}</span>
                <span style={{ color: (c.oosAvgReturn??0)>=0?C_WHITE:C_GOLD }}>{pct(c.oosAvgReturn)}</span>
              </div>
            ))}
          </div>
          {/* Portfolio risk summary */}
          {isBarLevel && (
            <div style={{ marginTop: 10, padding: "8px 10px", background: C_BG,
              border: `1px solid ${C_SOFT}`, borderRadius: 7 }}>
              <div style={{ fontSize: 9, color: C_TEXT_3, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                <span>MaxDD (bar-level)</span>
                <span style={{ color: C_GOLD, fontWeight: 600 }}>{port.oosMaxDrawdown > 0 ? `-${port.oosMaxDrawdown.toFixed(1)}%` : "—"}</span>
                <span>Worst Year</span>
                <span style={{ color: C_GOLD }}>{port.worstYear ?? "—"}{port.worstYearReturn != null ? ` (${port.worstYearReturn>=0?"+":""}${port.worstYearReturn.toFixed(1)}%)` : ""}</span>
                <span>Max Concurrent</span>
                <span>{port.maxConcurrentPositions}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fold selection note */}
      <div style={{ fontSize: 8.5, color: C_TEXT_3, padding: "6px 10px",
        background: C_BG, borderRadius: 6, lineHeight: 1.5 }}>
        Portfolio computed via fold-level IS-only pattern selection (no lookahead).
        Each fold selects patterns from IS data only → OOS simulation → bar-level equity.
        Not equivalent to rückwärtiger full-sample backtest.
      </div>
    </div>
  );
}

// ── Statistics Tab ────────────────────────────────────────────────────────────
function StatisticsTab({ result, assetId }: { result: Record<string, unknown>; assetId: string }) {
  const se = result.statisticalEvidence as Record<string,number|string|boolean> | null;
  const statsEnh = result.statisticsEnhanced as Record<string, unknown> | null;
  const port = result.assetPortfolio as Record<string, unknown> | null;
  const bs = port?.bootstrapFullMetrics as Record<string, unknown> | null;
  const dsr = statsEnh?.patternDSR as Record<string, unknown> | null;
  const pbo = statsEnh?.pboFeasibility as Record<string, unknown> | null;
  const spa = statsEnh?.spaRealityCheck as Record<string, unknown> | null;
  const rcFormal = statsEnh?.realityCheckFormalizationStatus as Record<string, unknown> | null;
  const [saveStatus, setSaveStatus] = useState<"idle"|"saving"|"saved"|"error">("idle");

  const row = (l: string, v: string, c?: string) => (
    <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 9.5 }}>
      <span style={{ color: C_TEXT_3 }}>{l}</span>
      <span style={{ color: c ?? C_TEXT_2, fontFamily: "monospace", fontSize: 9 }}>{v}</span>
    </div>
  );

  const bsCI = (obj: Record<string,number>|undefined) => obj ? `[${obj.p05}%, ${obj.p95}%]` : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Candidate Mining */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>Candidate Mining</div>
        {[
          ["Candidate Universe", String(se?.candidateUniverseSize ?? "—")],
          ["Pre-Filtered", String(se?.preFilteredCandidates ?? "—")],
          ["WF Tested", String(se?.wfTestedCandidates ?? "—")],
          ["OOS Validated", String(se?.selectedPatternCount ?? "—")],
          ["Portfolio OOS Trades", String(se?.portfolioOosTrades ?? "—")],
        ].map(([l,v]) => row(l,v))}
      </div>

      {/* Bootstrap */}
      {bs && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>
            Bootstrap ({bs.resamples as number} resamples · seed={bs.seed as number})
          </div>
          <div style={{ fontSize: 8.5, color: (bs.sampleSufficiency === "adequate" ? C_WHITE : C_GOLD), marginBottom: 4 }}>
            Sample: {String(bs.observations)} observations — {String(bs.sampleSufficiency)}
          </div>
          {[
            ["Compound Return", `obs=${(bs.compoundReturn as Record<string,number>)?.observed}% | CI ${bsCI(bs.compoundReturn as Record<string,number>)} | P(>0)=${(bs.compoundReturn as Record<string,number>)?.probabilityPositive}`],
            ["CAGR",            `obs=${(bs.cagr as Record<string,number>)?.observed}% | CI ${bsCI(bs.cagr as Record<string,number>)} | P(>0)=${(bs.cagr as Record<string,number>)?.probabilityPositive}`],
            ["MaxDD",           `obs=${(bs.maxDrawdown as Record<string,number>)?.observed}% | CI ${bsCI(bs.maxDrawdown as Record<string,number>)}`],
            ["Calmar",          `obs=${(bs.calmar as Record<string,number|null>)?.observed} | P05=${(bs.calmar as Record<string,number>)?.p05} P95=${(bs.calmar as Record<string,number>)?.p95}`],
            ["PF",              `obs=${(bs.profitFactor as Record<string,number>)?.observed} | P05=${(bs.profitFactor as Record<string,number>)?.p05} P95=${(bs.profitFactor as Record<string,number>)?.p95}`],
          ].map(([l,v]) => row(l,v))}
        </div>
      )}

      {/* DSR */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>Deflated Sharpe Ratio (Bailey et al. 2014)</div>
        {dsr ? (
          <>
            {[
              ["Status", String(dsr.status)],
              ["Observed SR (per-trade)", String(dsr.observedSharpe)],
              ["E[maxSR] under H0", String(dsr.expectedMaxSharpeUnderTrials ?? "—")],
              ["DSR Z-Score (was: deflatedSharpe)", String(dsr.dsrZScore ?? dsr.deflatedSharpe ?? "—")],
              ["DSR Probability [0,1]", String(dsr.dsrProbability ?? "—")],
              ["isStrategyStat (Z > 0)", String(dsr.isStrategyStat)],
              ["Trials (K)", String(dsr.trialCount)],
              ["OOS Observations (N)", String(dsr.observationCount)],
            ].map(([l,v]) => row(l,v, (l==="isStrategyStat (Z > 0)" && v==="true") ? C_WHITE : (l==="isStrategyStat (Z > 0)") ? C_GOLD : undefined))}
            <div style={{ fontSize: 8, color: C_TEXT_3, marginTop: 4, lineHeight: 1.4 }}>
              {String(dsr.methodologyNote ?? "").slice(0, 250)}
            </div>
          </>
        ) : row("DSR", "Not yet computed")}
      </div>

      {/* SPA / Reality Check */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>SPA / Reality Check</div>
        {spa ? (
          <div style={{ fontSize: 8.5, color: C_GOLD, padding: "5px 8px", background: C_BG, borderRadius: 5, lineHeight: 1.4 }}>
            {String(spa.note ?? spa.blocker ?? spa.status ?? "pending")}
          </div>
        ) : row("Status", "pending (generate candidate matrix first)")}
      </div>

      {/* PBO */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>PBO / CSCV</div>
        {pbo ? (
          <>
            {[
              ["Folds available", String(pbo.foldCount)],
              ["Min recommended", String(pbo.minimumRecommendedFolds)],
              ["Status", String(pbo.status)],
            ].map(([l,v]) => row(l,v, v==="sufficient"?C_WHITE:v==="borderline"?C_GOLD:C_GOLD))}
            <div style={{ fontSize: 8, color: C_TEXT_3, marginTop: 4 }}>{String(pbo.recommendation ?? "").slice(0, 150)}</div>
          </>
        ) : row("Status", "pending")}
      </div>

      {/* Final status — Gate 1 fix: show actual status with known DSR failure */}
      {(() => {
        const approvalStatus = String((result.statisticsEnhanced as Record<string,unknown>|null)?.researchApprovalStatus ?? "wf_validated_statistics_pending");
        const isFailed = approvalStatus.includes("failed") || approvalStatus.includes("incomplete");
        return (
          <div style={{ padding: "7px 10px",
            background: isFailed ? "rgba(220,196,118,0.1)" : "rgba(220,196,118,0.04)",
            border: `1px solid ${isFailed ? "rgba(220,196,118,0.3)" : "rgba(220,196,118,0.12)"}`,
            borderRadius: 7, fontSize: 8.5, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, color: C_GOLD, marginBottom: 3, fontSize: 9 }}>
              {approvalStatus.replace(/_/g, " ").toUpperCase()}
            </div>
            <div style={{ color: C_TEXT_3 }}>
              {"Bootstrap positive (good signal). DSR Z-Score negative (multiple testing with many candidates). SPA pending candidate matrix. PBO insufficient folds. All results: Research Only."}
            </div>
          </div>
        );
      })()}

      {/* RC Formalization Status */}
      {rcFormal && (
        <div style={{ fontSize: 8, color: C_TEXT_3, padding: "5px 8px", background: C_BG, borderRadius: 5, lineHeight: 1.4 }}>
          <span style={{ color: C_TEXT_2, fontWeight: 600 }}>RC Formalization: </span>
          {String(rcFormal.classification ?? "")} — {String(rcFormal.maximumInterpretation ?? "")}.
          Upgrade requires: {((rcFormal.upgradeConditions as string[])?.[0] ?? "block length selection")}.
        </div>
      )}

      {/* Save Research Hypothesis — NOT Approved Library */}
      <div style={{ borderTop: `1px solid ${C_SOFT}`, paddingTop: 8, marginTop: 4 }}>
        <div style={{ fontSize: 9, color: C_TEXT_3, marginBottom: 5 }}>
          Frozen Research Hypothesis Registry — Append Only · Immutable After Save
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              disabled={saveStatus === "saving" || saveStatus === "saved"}
              onClick={async () => {
                setSaveStatus("saving");
                const patterns = (result.validatedPatterns as Array<Record<string,unknown>>) ?? [];
                const approvalStatus = String((result.statisticsEnhanced as Record<string,unknown>|null)?.researchApprovalStatus ?? "statistics_incomplete_with_known_failure");
                try {
                  for (const pat of patterns) {
                    await fetch("/api/seasonality/research-registry", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "saveResearchHypothesis",
                        hypothesis: {
                          sourceType: "strategy_engine_pattern",
                          assetId,
                          displayName: `${assetId} ${pat.direction} ${pat.windowLabel} ${pat.holdingDays}D Q${pat.qualityScore}`,
                          hypothesisDefinition: {
                            direction: pat.direction as "LONG"|"SHORT",
                            entrySlot: pat.anchorSlot as number,  // exact slot for eligibility computation
                            holdingDays: pat.holdingDays as number,
                            window: pat.windowLabel as string,
                            qualityScore: pat.qualityScore as number,
                          },
                          discoverySnapshot: {
                            dataUsedThroughDate: "2025-12-31",
                            primaryStudyRange: "2000-2025",
                            strictWfStatus: "passed",
                            bootstrapStatus: "positive",
                            dsrStatus: "failed",
                            realityCheckStatus: "exploratory_positive_or_negative",
                            pboStatus: "negative_overfitting_confirmed",
                            executionStatus: "research_normalized_only",
                            finalResearchStatus: approvalStatus,
                          },
                        },
                      }),
                    });
                  }
                  setSaveStatus("saved");
                } catch { setSaveStatus("error"); }
              }}
              style={{
                background: saveStatus === "saved" ? "rgba(255,255,255,0.04)" : "rgba(240,243,247,0.04)",
                border: `1px solid ${C_SOFT}`,
                borderRadius: 5, padding: "3px 10px", cursor: saveStatus === "saved" ? "default" : "pointer",
                fontSize: 9, color: saveStatus === "saved" ? C_TEXT_3 : C_WHITE, fontFamily: FONT,
              }}
            >
              {saveStatus === "idle" ? "Save Research Hypothesis" :
               saveStatus === "saving" ? "Saving…" :
               saveStatus === "saved" ? "✓ Frozen as Research Hypothesis" : "Error — retry"}
            </button>
            <span style={{ fontSize: 8, color: C_TEXT_3 }}>NOT Approved · NOT Live · Immutable after save</span>
          </div>
          {saveStatus === "saved" && (
            <div style={{ fontSize: 8, color: C_TEXT_3, padding: "4px 8px", background: C_BG, borderRadius: 4, lineHeight: 1.5 }}>
              Frozen for Forward Validation · First unseen entry dates: 2026+
              <br />Single positive year insufficient for approval. Definition changes create new hypothesis ID.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Group Tab (Agriculture) ───────────────────────────────────────────────────
function GroupTab({ assetId }: { assetId: string }) {
  const [groupState, setGroupState] = useState<{
    status: "idle" | "running" | "complete" | "error";
    progress: string;
    result: Record<string, unknown> | null;
  }>({ status: "idle", progress: "", result: null });

  const runGroup = useCallback(async () => {
    if (groupState.status === "running") return;
    setGroupState({ status: "running", progress: "Running all agriculture assets (sequential)…", result: null });
    try {
      const res = await fetch("/api/seasonality/strategy-engine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "runAgricultureGroup" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json() as Record<string, unknown>;
      setGroupState({ status: "complete", progress: "Complete", result });
    } catch (err) {
      setGroupState(prev => ({ ...prev, status: "error", progress: String(err) }));
    }
  }, [groupState.status]);

  type AssetRow = {
    assetId: string; name: string; symbol: string; status: string;
    validatedPatternCount: number; oosReturn: number | null; oosMaxDD: number | null;
    oosCalmar: number | null; oosWinRate: number | null; oosTradeCount: number | null;
    portfolioStatus: string;
  };

  const matrix = (groupState.result?.perAssetMatrix as AssetRow[]) ?? [];
  const gp = groupState.result?.groupPortfolio as Record<string, unknown> | null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Run button */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {groupState.status !== "running" ? (
          <button type="button" onClick={runGroup} style={{
            background: "rgba(240,243,247,0.06)", border: "1px solid rgba(240,243,247,0.14)",
            borderRadius: 5, padding: "5px 14px", cursor: "pointer", color: C_WHITE,
            fontSize: 10, fontWeight: 600, fontFamily: FONT }}>
            Run Agriculture Validation
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 10, color: C_TEXT_2 }}>{groupState.progress}</div>
          </div>
        )}
        {groupState.status === "error" && (
          <span style={{ fontSize: 9.5, color: C_GOLD }}>{groupState.progress}</span>
        )}
      </div>

      {/* Official rejected status — always visible */}
      <div style={{ padding: "8px 12px", background: "rgba(220,196,118,0.06)",
        border: "1px solid rgba(220,196,118,0.18)", borderRadius: 7 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_GOLD, marginBottom: 3 }}>
          Agriculture Research Portfolio · Rejected for Portfolio Promotion
        </div>
        <div style={{ fontSize: 8.5, color: C_TEXT_3, lineHeight: 1.5 }}>
          Official Baseline: 574 trades · +164.62% · CAGR +6.27% · MaxDD -37.63% · Calmar 0.167
        </div>
        <div style={{ fontSize: 8.5, color: C_TEXT_3, marginTop: 2 }}>
          Reason: Weak risk-adjusted performance · No effective IS asset discrimination · Statistics not passed
        </div>
        <div style={{ fontSize: 8.5, color: C_TEXT_3, marginTop: 2 }}>
          Pre-Move P90 True Veto: +94.30% · Calmar 0.102 — <span style={{ color: C_GOLD }}>Worse than baseline</span>
        </div>
      </div>

      {groupState.status === "idle" && (
        <div style={{ padding: "16px", color: C_TEXT_3, fontSize: 10, textAlign: "center",
          border: `1px dashed ${C_SOFT}`, borderRadius: 8 }}>
          Click <strong style={{ color: C_WHITE }}>Run Agriculture Validation</strong> to validate all 8 agriculture assets and compute the group portfolio.
          <div style={{ fontSize: 8.5, color: C_TEXT_3, marginTop: 4 }}>ZS · ZW · ZC · CC · KC · SB · CT · OJ — sequential run, ~2 min</div>
        </div>
      )}

      {groupState.status === "running" && (
        <div style={{ padding: "16px", color: C_TEXT_3, fontSize: 10, textAlign: "center",
          border: `1px dashed ${C_SOFT}`, borderRadius: 8 }}>
          Running all 8 agriculture assets… This takes 1–3 minutes.
        </div>
      )}

      {/* Per-asset matrix */}
      {matrix.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 6 }}>Asset Validation Matrix</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C_SOFT}` }}>
                  {["Asset","Symbol","Patterns","OOS Return","MaxDD","Calmar","WR","Trades","Portfolio"].map(h => (
                    <th key={h} style={{ padding: "4px 8px", color: C_TEXT_3, textAlign: "left", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, i) => {
                  const hasPort = row.portfolioStatus === "ready";
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                      <td style={{ padding: "4px 8px", color: row.validatedPatternCount > 0 ? C_WHITE : C_TEXT_3 }}>{row.name}</td>
                      <td style={{ padding: "4px 8px", color: C_TEXT_3, fontSize: 8 }}>{row.symbol}</td>
                      <td style={{ padding: "4px 8px", color: row.validatedPatternCount > 0 ? C_WHITE : C_TEXT_3, fontWeight: 600 }}>{row.validatedPatternCount}</td>
                      <td style={{ padding: "4px 8px", color: (row.oosReturn??0)>=0?C_WHITE:C_GOLD }}>{row.oosReturn != null ? `${row.oosReturn>=0?"+":""}${row.oosReturn.toFixed(1)}%` : "—"}</td>
                      <td style={{ padding: "4px 8px", color: C_GOLD }}>{row.oosMaxDD != null ? `-${row.oosMaxDD.toFixed(1)}%` : "—"}</td>
                      <td style={{ padding: "4px 8px", color: C_TEXT_2 }}>{row.oosCalmar != null ? row.oosCalmar.toFixed(2) : "—"}</td>
                      <td style={{ padding: "4px 8px", color: (row.oosWinRate??0)>=50?C_WHITE:C_GOLD }}>{row.oosWinRate != null ? `${row.oosWinRate.toFixed(0)}%` : "—"}</td>
                      <td style={{ padding: "4px 8px", color: C_TEXT_2 }}>{row.oosTradeCount ?? "—"}</td>
                      <td style={{ padding: "4px 8px", color: hasPort?C_WHITE:C_TEXT_3, fontSize: 8 }}>{hasPort?"Ready":"No Portfolio"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Group portfolio KPIs */}
      {gp && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2 }}>
            Agriculture Group Portfolio · OOS 2010–2024
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 7 }}>
            <K l="OOS Trades"  v={String(gp.oosTradeCount??0)} />
            <K l="OOS WR"      v={`${(gp.oosWinRate as number)?.toFixed(0)??"—"}%`}    c={(gp.oosWinRate as number)>=50?C_WHITE:C_GOLD} />
            <K l="OOS Return"  v={`${(gp.oosCompoundReturn as number)>=0?"+":""}${(gp.oosCompoundReturn as number)?.toFixed(1)??"—"}%`}
                               c={(gp.oosCompoundReturn as number)>=0?C_WHITE:C_GOLD} />
            <K l="OOS PF"      v={num(gp.oosProfitFactor as number)}               c={(gp.oosProfitFactor as number)>=1?C_WHITE:C_GOLD} />
            <K l="MaxDD"       v={gp.oosMaxDrawdown != null ? `-${(gp.oosMaxDrawdown as number).toFixed(1)}%` : "—"} c={C_GOLD} />
            <K l="Calmar"      v={gp.oosCalmar != null ? num(gp.oosCalmar as number) : "—"}
                               c={(gp.oosCalmar as number|null) != null && (gp.oosCalmar as number)>=1 ? C_WHITE : C_TEXT_3} />
          </div>
          {/* Group equity chart */}
          {Array.isArray(gp.equitySeries) && (gp.equitySeries as unknown[]).length > 0 && (
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: C_TEXT_2, marginBottom: 6 }}>Agriculture Group OOS Equity</div>
              <div style={{ height: 140 }}>
                <SafeResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <ComposedChart data={gp.equitySeries as Array<{year:number;equity:number}>} margin={{ top: 4, right: 4, bottom: 14, left: 4 }}>
                    <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="year" tick={{ fill: C_TEXT_3, fontSize: 8 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: C_TEXT_3, fontSize: 8 }} axisLine={false} tickLine={false}
                      tickFormatter={(v: number) => `${v>=0?"+":""}${v.toFixed(0)}%`} width={34} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 3" />
                    <Line type="monotone" dataKey="equity" stroke={C_WHITE} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </SafeResponsiveContainer>
              </div>
            </div>
          )}
          {/* Asset contribution */}
          {Array.isArray(gp.assetContribution) && (gp.assetContribution as unknown[]).length > 0 && (
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: C_TEXT_2, marginBottom: 6 }}>Asset Contribution</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {(gp.assetContribution as Array<{assetId:string;name:string;tradeCount:number;winRate:number;avgReturn:number}>).map((a, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 30px 40px 60px",
                    gap: 8, padding: "4px 8px", background: C_BG, borderRadius: 4, fontSize: 9 }}>
                    <span style={{ color: C_TEXT_2 }}>{a.name}</span>
                    <span style={{ color: C_TEXT_3 }}>T:{a.tradeCount}</span>
                    <span style={{ color: a.winRate>=50?C_WHITE:C_GOLD }}>{a.winRate.toFixed(0)}%</span>
                    <span style={{ color: a.avgReturn>=0?C_WHITE:C_GOLD }}>{a.avgReturn>=0?"+":""}{a.avgReturn.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ fontSize: 8.5, color: C_TEXT_3, padding: "6px 10px", background: C_BG, borderRadius: 6, lineHeight: 1.5 }}>
            Normalized research portfolio · equal weight · same-asset concurrent: no · max 4 open.
            Multiple-testing correction pending. TV/contract execution not verified. Research only.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Method/Audit Tab ──────────────────────────────────────────────────────────
function AuditTab({ result }: { result: Record<string, unknown> }) {
  const a = result.auditMetadata as Record<string, string | number | boolean | null | undefined> | null;
  const s = result.statisticalEvidence as Record<string, string | number | boolean> | null;
  const c = result.config as Record<string, string | number | boolean | number[]> | null;

  const row = (l: string, v: string | number | boolean) => (
    <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 9.5 }}>
      <span style={{ color: C_TEXT_3 }}>{l}</span>
      <span style={{ color: C_TEXT_2, fontFamily: "monospace", fontSize: 9 }}>{String(v)}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>Asset &amp; Data</div>
        {[["Asset", String(a?.assetId ?? "—") + " / " + String((c as Record<string,unknown>|null)?.symbol ?? "—")],
          ["Source CSV",a?.csvSource??"—"],["Fingerprint",a?.sourceFingerprint??"—"],
          ["Study Range","2000–2024"],["Bars",String(a?.totalBarsLoaded??"—")],["Years",String(a?.totalYearsAvailable??"—")]
        ].map(([l,v])=>row(l as string,v as string))}
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>Walk-Forward Config</div>
        {[["Method","Anchored Expanding WF — central lib"],
          ["WF Library","runPatternFamilyWalkForward (same as main app)"],
          ["IS / OOS",`${c?.initialTrainingYears??10}Y / ${c?.oosBlockYears??2}Y`],
          ["Holdings",Array.isArray(c?.holdingCandidates)?c!.holdingCandidates.join("/")+"D":"10/12/14/16/18/20D"],
          ["Max Patterns",String(c?.maxPatternsPerAsset??6)],
          ["Quality Gate","Q≥75 · Strong | Excellent"],
          ["Portfolio Method","fold-level IS-only selection + bar-level OOS equity"],
          ["Engine Version",String(result.engineVersion??"—")],
          ["Portfolio Risk Version",String(a?.portfolioRiskVersion??"—")],
        ].map(([l,v])=>row(l as string,v as string))}
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>Risk</div>
        {[["Pattern OOS MaxDD","Compounded OOS trade returns (patternFamilyWalkForward stitchedOosMaxDD)"],
          ["Portfolio MaxDD","Bar-level mark-to-market OOS portfolio equity — implemented"],
          ["Portfolio Calmar","Bar-level Calmar from OOS equity — implemented"],
          ["TV Execution Parity","Pending execution parameter verification"],
          ["Same-Asset Overlap","Not allowed — implemented"],
        ].map(([l,v])=>row(l as string,v as string))}
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C_TEXT_2, marginBottom: 5 }}>Statistics</div>
        {[["Candidate Universe",String(s?.candidateUniverseSize??"—")],
          ["Pre-Filtered",String(s?.preFilteredCandidates??"—")],
          ["WF Tested",String(s?.wfTestedCandidates??"—")],
          ["OOS Validated",String(s?.selectedPatternCount??"—")],
          ["Portfolio OOS Folds",String(s?.portfolioOosFolds??"—")],
          ["Portfolio OOS Trades",String(s?.portfolioOosTrades??"—")],
          ["Overlap Conflicts",String(s?.overlapConflictsRemoved??"—")],
          ["Multiple-Testing Adj.","Not implemented — Phase D pending"],
          ["Significance Claim","No — pending multiple-testing correction"],
          ["Run Duration",String(a?.runDurationMs??"—")+"ms"],
        ].map(([l,v])=>row(l as string,v as string))}
      </div>
      <div style={{ padding: "7px 10px", background: "rgba(220,196,118,0.05)",
        border: "1px solid rgba(220,196,118,0.12)", borderRadius: 7, fontSize: 8.5, color: C_GOLD, lineHeight: 1.5 }}>
        Strict Walk-Forward OOS validated research candidates.
        Multiple-testing / data-snooping adjustment is not yet completed.
        Not approved as a live trading portfolio until statistical robustness phase is passed.
      </div>
    </div>
  );
}

// ── Placeholder tabs ──────────────────────────────────────────────────────────
function Placeholder({ title, sub, items }: { title: string; sub: string; items: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C_TEXT_2 }}>{title}</div>
      <div style={{ fontSize: 9.5, color: C_TEXT_3 }}>{sub}</div>
      {items.map((item, i) => (
        <div key={i} style={{ fontSize: 9, color: C_TEXT_3, padding: "3px 8px",
          background: C_BG, borderRadius: 5, borderLeft: `2px solid rgba(255,255,255,0.06)` }}>{item}</div>
      ))}
    </div>
  );
}

// ── Not-yet-validated ─────────────────────────────────────────────────────────
function NotYetValidated({ assetId, supported }: { assetId: string; supported: string[] }) {
  const def = getAssetDef(assetId);
  return (
    <div style={{ padding: "16px", fontFamily: FONT }}>
      <div style={{ padding: "10px 12px", background: "rgba(220,196,118,0.07)",
        border: "1px solid rgba(220,196,118,0.18)", borderRadius: 7, fontSize: 10, color: C_GOLD, marginBottom: 8 }}>
        Strategy Engine not yet validated for <strong>{def?.displayName ?? assetId}</strong>.
      </div>
      <div style={{ fontSize: 9.5, color: C_TEXT_3 }}>
        Validated: <strong style={{ color: C_TEXT_2 }}>{supported.join(", ")}</strong> · Select from asset selector.
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props { assetId: string; }

export function StrategyEnginePanel({ assetId }: Props) {
  const [tab, setTab]       = useState<EngineTab>("patterns");
  const [jobState, setJobState] = useState<{
    status: "idle" | "running" | "complete" | "error";
    progress: string;
    result: Record<string, unknown> | null;
    durationMs: number | null;
    notYetValidated: boolean;
    supported: string[];
  }>({ status: "idle", progress: "", result: null, durationMs: null, notYetValidated: false, supported: [] });
  const abortRef = useRef<AbortController | null>(null);
  const assetDef = getAssetDef(assetId);

  const runEngine = useCallback(async () => {
    if (jobState.status === "running") return;
    abortRef.current = new AbortController();
    setJobState(prev => ({ ...prev, status: "running", progress: "Starting…", result: null, durationMs: null, notYetValidated: false }));

    const steps = ["Loading full history…","Discovering candidates…","Strict WF OOS…","Deduplicating…","Portfolio simulation…"];
    let si = 0;
    const iv = setInterval(() => {
      if (si < steps.length) setJobState(prev => ({ ...prev, progress: steps[si++] }));
    }, 1000);

    try {
      const t0 = Date.now();
      const res = await fetch("/api/seasonality/strategy-engine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "runStrategyEngine", assetId }),
        signal: abortRef.current.signal,
      });
      clearInterval(iv);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (await res.json()) as Record<string, unknown>;
      if ((result.status as string) === "asset_not_supported") {
        setJobState({ status: "idle", progress: "", result: null, durationMs: null,
          notYetValidated: true, supported: (result.supportedAssets as string[]) ?? [] });
        return;
      }
      setJobState({ status: "complete", progress: "Complete", result,
        durationMs: Date.now() - t0, notYetValidated: false, supported: [] });
    } catch (err) {
      clearInterval(iv);
      if ((err as Error).name === "AbortError") {
        setJobState(prev => ({ ...prev, status: "idle", progress: "" }));
      } else {
        setJobState(prev => ({ ...prev, status: "error", progress: String(err) }));
      }
    }
  }, [assetId, jobState.status]);

  const TABS: { key: EngineTab; label: string }[] = [
    { key: "patterns",  label: `Patterns${jobState.result ? " ("+((jobState.result.validatedPatterns as unknown[])?.length??0)+")" : ""}` },
    { key: "portfolio", label: "Asset Portfolio" },
    { key: "group",      label: "Group · Agri" },
    { key: "statistics", label: "Statistics" },
    { key: "method",     label: "Audit" },
  ];
  const TB = (a: boolean): React.CSSProperties => ({
    background: a ? "rgba(255,255,255,0.06)" : "transparent",
    border: `1px solid ${a ? "rgba(255,255,255,0.12)" : "transparent"}`,
    borderRadius: 6, padding: "4px 11px", cursor: "pointer", fontFamily: FONT,
    fontSize: 10, fontWeight: a ? 600 : 400, color: a ? C_WHITE : C_TEXT_3,
  });

  // Short display name only (e.g. "Soybeans", not "Soybeans / Sojabohnen")
  const assetName   = assetDef?.displayNameShort ?? assetDef?.displayName ?? assetId;
  const validCount  = (jobState.result?.validatedPatterns as unknown[])?.length ?? 0;

  if (jobState.notYetValidated) {
    return <div style={{ fontFamily: FONT, padding: "10px" }}>
      <NotYetValidated assetId={assetId} supported={jobState.supported} />
    </div>;
  }

  return (
    <div style={{ fontFamily: FONT, padding: "10px 14px 36px", color: C_WHITE }}>

      {/* ── Asset / Study line ───────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8, flexWrap: "wrap", gap: 8, paddingBottom: 7,
        borderBottom: `1px solid ${C_SOFT}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C_TEXT_2, fontWeight: 600 }}>
            {assetName} · 2000–2024
          </span>
          {jobState.result && (
            <span style={{ fontSize: 9, padding: "1px 6px", background: "rgba(255,255,255,0.05)",
              border: `1px solid ${C_SOFT}`, borderRadius: 4, color: C_TEXT_2 }}>
              {validCount} Validated
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {jobState.status === "running" && (
            <span style={{ fontSize: 9, color: C_TEXT_2 }}>{jobState.progress}</span>
          )}
          {jobState.status !== "running" && (
            <button type="button" onClick={runEngine} style={{
              background: "rgba(240,243,247,0.06)", border: "1px solid rgba(240,243,247,0.14)",
              borderRadius: 5, padding: "4px 12px", cursor: "pointer", color: C_WHITE,
              fontSize: 10, fontWeight: 600, fontFamily: FONT }}>
              {jobState.status === "idle" ? "Run Engine" : "Re-Run Engine"}
            </button>
          )}
        </div>
      </div>

      {/* ── Idle state ─────────────────────────────────────────────────── */}
      {jobState.status === "idle" && !jobState.result && (
        <div style={{ padding: "20px", textAlign: "center", border: `1px dashed ${C_SOFT}`, borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: C_TEXT_3, marginBottom: 4 }}>
            Click <strong style={{ color: C_WHITE }}>Run Engine</strong> to discover OOS-validated seasonal patterns for {assetName}.
          </div>
          <div style={{ fontSize: 8.5, color: C_TEXT_3 }}>
            IT=10Y / OOS=2Y · Central patternFamilyWalkForward · Bar-level risk
          </div>
        </div>
      )}

      {/* ── Running ─────────────────────────────────────────────────────── */}
      {jobState.status === "running" && (
        <div style={{ padding: "14px", textAlign: "center", border: `1px solid ${C_SOFT}`, borderRadius: 8 }}>
          <div style={{ fontSize: 10.5, color: C_TEXT_2, marginBottom: 5 }}>{jobState.progress}</div>
          <div style={{ height: 3, background: C_SOFT, borderRadius: 2, maxWidth: 180, margin: "0 auto" }}>
            <div style={{ height: "100%", background: C_TEXT_2, width: "55%" }} />
          </div>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {jobState.status === "error" && (
        <div style={{ padding: "9px", background: "rgba(220,196,118,0.07)",
          border: "1px solid rgba(220,196,118,0.2)", borderRadius: 7, color: C_GOLD, fontSize: 9.5 }}>
          {jobState.progress || "Engine failed. Re-run to retry."}
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {jobState.result && (
        <>
          {/* Tabs only — no verbose status text in main view */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
            {TABS.map(t => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} style={TB(tab === t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "patterns"   && <PatternsTab result={jobState.result} assetId={assetId} />}
          {tab === "portfolio"  && <PortfolioTab result={jobState.result} />}
          {tab === "group"      && <GroupTab assetId={assetId} />}
          {tab === "statistics" && <StatisticsTab result={jobState.result} assetId={assetId} />}
          {tab === "method"     && <AuditTab result={jobState.result} />}
        </>
      )}
    </div>
  );
}
