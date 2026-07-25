"use client";

import { useState } from "react";

import type {
  WFCurrentYearStatus,
  WFOosSummary,
  WFResearchGateResult,
  WalkForwardConfig,
  WalkForwardFold,
  WalkForwardResult,
  SeasonalPatternCandidate,
} from "@/lib/seasonality/walkForward/types";

// ─── Style constants (matches SeasonalityPage palette) ───────────────────────

const BOX = "rounded-[14px] border border-[rgba(220,196,118,0.18)] bg-[#0b0b0b] p-[16px] shadow-[inset_0_1px_0_rgba(220,196,118,0.08)]";
const INPUT = "h-8 rounded-[6px] border border-[#1f1f1f] bg-[#080808] px-2 text-xs text-white outline-none";
const GOLD = "#dcc476";
const BULL = "#0dff00";
const BEAR = "#ff0000";
const MUTED = "#8a8a8a";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, digits = 2, sign = true): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${sign && v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}

function fmtScore(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(3)}`;
}

function returnColor(v: number | null | undefined): string {
  if (v == null) return MUTED;
  return v > 0 ? BULL : v < 0 ? BEAR : MUTED;
}

function statusBadge(status: WFCurrentYearStatus): string {
  switch (status) {
    case "UPCOMING": return "text-[#dcc476]";
    case "ACTIVE": return "text-[#0dff00]";
    case "COMPLETED_PROVISIONAL": return "text-[#8a8a8a]";
    default: return "text-[#8a8a8a]";
  }
}

function tradeBadgeColor(status: string): string {
  if (status === "EXECUTED") return BULL;
  if (status.startsWith("NO_")) return BEAR;
  return MUTED;
}

type RunStatus = "idle" | "running" | "done" | "error";

interface WFConfigForm {
  trainingYears: number;
  holdingDaysMin: number;
  holdingDaysMax: number;
  transactionCostBps: number;
}

const DEFAULT_FORM: WFConfigForm = {
  trainingYears: 5,
  holdingDaysMin: 10,
  holdingDaysMax: 20,
  transactionCostBps: 0,
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function OosSummaryCards({ oos }: { oos: WFOosSummary }) {
  const cards = [
    { label: "OOS Folds", value: String(oos.foldCount) },
    { label: "OOS Trades", value: String(oos.oosTradeCount) },
    { label: "OOS Compounded Return", value: fmt(oos.oosCompoundedReturn), color: returnColor(oos.oosCompoundedReturn) },
    { label: "OOS Avg Return / Year", value: fmt(oos.oosAverageReturn), color: returnColor(oos.oosAverageReturn) },
    { label: "OOS Median Return", value: fmt(oos.oosMedianReturn), color: returnColor(oos.oosMedianReturn) },
    { label: "OOS Win Rate", value: `${oos.oosWinRate.toFixed(1)}%`, color: oos.oosWinRate > 50 ? BULL : BEAR },
    { label: "OOS Max Drawdown", value: fmt(oos.oosMaxDrawdown, 2, false), color: BEAR },
    { label: "OOS Profit Factor", value: oos.oosProfitFactor.toFixed(2) },
    { label: "Positive Test Years", value: String(oos.positiveTestYears), color: BULL },
    { label: "Negative Test Years", value: String(oos.negativeTestYears), color: BEAR },
    { label: "Best Test Year", value: String(oos.bestTestYear ?? "—") },
    { label: "Worst Test Year", value: String(oos.worstTestYear ?? "—") },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[10px] border border-[#1f1f1f] bg-[#090909] p-3">
          <div className="mb-1 text-[10px] text-[#8a8a8a]">{card.label}</div>
          <div className="text-[14px] font-semibold" style={{ color: card.color ?? "#ffffff" }}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function FoldTable({ folds }: { folds: WalkForwardFold[] }) {
  return (
    <div className="overflow-auto rounded-[8px] border border-[rgba(220,196,118,0.18)]">
      <table className="w-full min-w-[900px] text-left text-[11px]">
        <thead className="bg-[#070707] text-[#8a8a8a]">
          <tr>
            {["Train Window", "Test Year", "Direction", "Entry MM-DD", "Holding Days",
              "Train Score", "Test Entry", "Test Exit", "OOS Return", "Status"].map((h) => (
              <th key={h} className="px-2 py-1">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {folds.map((fold) => {
            const c = fold.selectedCandidate;
            const ret = fold.oosNetReturn;
            return (
              <tr key={fold.foldId} className="border-t border-[#151515]">
                <td className="px-2 py-1 text-[#8a8a8a]">
                  {fold.trainingStartYear}–{fold.trainingEndYear}
                </td>
                <td className="px-2 py-1">{fold.testYear}</td>
                <td className="px-2 py-1" style={{ color: c?.direction === "LONG" ? BULL : BEAR }}>
                  {c?.direction ?? "—"}
                </td>
                <td className="px-2 py-1">{c?.entryMonthDay ?? "—"}</td>
                <td className="px-2 py-1">{c?.holdingTradingDays ?? "—"}</td>
                <td className="px-2 py-1">{c ? fmtScore(c.stabilityScore) : "—"}</td>
                <td className="px-2 py-1 text-[#8a8a8a]">{fold.oosTrade?.actualEntryDate ?? "—"}</td>
                <td className="px-2 py-1 text-[#8a8a8a]">{fold.oosTrade?.actualExitDate ?? "—"}</td>
                <td className="px-2 py-1" style={{ color: returnColor(ret) }}>
                  {fmt(ret)}
                </td>
                <td className="px-2 py-1" style={{ color: tradeBadgeColor(fold.oosTradeStatus) }}>
                  {fold.oosTradeStatus}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResearchGatePanel({ gate }: { gate: WFResearchGateResult }) {
  const isPassed = gate.status === "PASSED_RESEARCH_GATE";
  const isInsufficient = gate.status === "INSUFFICIENT_DATA";

  const badgeClass = isPassed
    ? "border-[rgba(13,255,0,0.3)] bg-[rgba(13,255,0,0.06)] text-[#0dff00]"
    : isInsufficient
      ? "border-[rgba(138,138,138,0.3)] bg-[rgba(138,138,138,0.06)] text-[#8a8a8a]"
      : "border-[rgba(255,0,0,0.4)] bg-[rgba(255,0,0,0.08)] text-[#ff4444]";

  const label = isPassed
    ? "PASSED OOS QUALITY GATE"
    : isInsufficient
      ? "INSUFFICIENT DATA"
      : "FAILED OOS QUALITY GATE";

  return (
    <div className="rounded-[8px] border border-[#1f1f1f] bg-[#0a0a0a] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
          {label}
        </span>
        {!isPassed && !isInsufficient && (
          <span className="text-[10px] text-[#8a8a8a]">Pattern erfüllt OOS-Qualitätskriterien nicht</span>
        )}
      </div>
      {gate.failures.length > 0 && (
        <ul className="text-[10px] text-[#ff7777]">
          {gate.failures.map((f, i) => (
            <li key={i} className="before:mr-1 before:content-['✗']">{f}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 grid grid-cols-2 gap-x-4 text-[10px] text-[#8a8a8a] sm:grid-cols-5">
        <div>Min OOS Trades: <span className="text-white">{gate.criteria.minOosTradeCount}</span></div>
        <div>Min Compounded: <span className="text-white">&gt;0%</span></div>
        <div>Min Avg Return: <span className="text-white">&gt;0%</span></div>
        <div>Min Win Rate: <span className="text-white">{(gate.criteria.minOosWinRate * 100).toFixed(0)}%</span></div>
        <div>Max Drawdown: <span className="text-white">≤{(gate.criteria.maxOosMaxDrawdown * 100).toFixed(0)}%</span></div>
      </div>
      <div className="mt-2 text-[10px] text-[#8a8a8a]">
        canBePromotedToLiveSignal={String(gate.canBePromotedToLiveSignal)}
      </div>
    </div>
  );
}

function TopCandidatesTable({ candidates }: { candidates: SeasonalPatternCandidate[] }) {
  if (!candidates.length) return <div className="text-[12px] text-[#8a8a8a]">No candidates.</div>;
  return (
    <div className="overflow-auto rounded-[8px] border border-[rgba(220,196,118,0.18)]">
      <table className="w-full min-w-[700px] text-left text-[11px]">
        <thead className="bg-[#070707] text-[#8a8a8a]">
          <tr>
            {["#", "Direction", "Entry MM-DD", "Hold Days", "Stability Score",
              "Train Return", "Win Rate", "Max Drawdown"].map((h) => (
              <th key={h} className="px-2 py-1">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => (
            <tr key={`${c.direction}-${c.entryMonthDay}-${c.holdingTradingDays}`}
              className="border-t border-[#151515]">
              <td className="px-2 py-1 text-[#8a8a8a]">{i + 1}</td>
              <td className="px-2 py-1" style={{ color: c.direction === "LONG" ? BULL : BEAR }}>
                {c.direction}
              </td>
              <td className="px-2 py-1">{c.entryMonthDay}</td>
              <td className="px-2 py-1">{c.holdingTradingDays}</td>
              <td className="px-2 py-1" style={{ color: c.stabilityScore >= 0 ? BULL : BEAR }}>
                {fmtScore(c.stabilityScore)}
              </td>
              <td className="px-2 py-1" style={{ color: returnColor(c.trainingMetrics.compoundedReturn) }}>
                {fmt(c.trainingMetrics.compoundedReturn)}
              </td>
              <td className="px-2 py-1" style={{ color: c.trainingMetrics.winRate > 50 ? BULL : BEAR }}>
                {c.trainingMetrics.winRate.toFixed(1)}%
              </td>
              <td className="px-2 py-1 text-[#ff6666]">
                {fmt(c.trainingMetrics.maxDrawdown, 2, false)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WalkForwardSection() {
  const [form, setForm] = useState<WFConfigForm>(DEFAULT_FORM);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [result, setResult] = useState<WalkForwardResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"folds" | "top10">("folds");

  async function handleRun() {
    setStatus("running");
    setResult(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/seasonality/walk-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          assetId: "wheat",
          testYears: 1,
          stepYears: 1,
          directions: ["LONG", "SHORT"],
          rankingMetric: "stabilityScore",
          entryExecutionRule: "open_on_or_after",
          exitExecutionRule: "close_after_holding_days",
        } satisfies WalkForwardConfig),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as WalkForwardResult;
      setResult(data);
      setStatus("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  const plan = result?.currentYearPlan;

  return (
    <section className="mt-6">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-white">
            Walk-Forward Seasonal Grid Test
          </span>
          <span className="rounded-[4px] border border-[rgba(220,196,118,0.3)] bg-[rgba(220,196,118,0.06)] px-2 py-0.5 text-[10px] text-[#dcc476]">
            HISTORICAL CSV RESEARCH
          </span>
        </div>
        <div className="mt-1 text-[11px] text-[#8a8a8a]">
          Historischer Out-of-Sample-Test saisonaler Handelsmuster aus CSV-Daten.
          Kein Live-Signal. Keine Orderausführung.
        </div>
      </div>

      {/* Config panel */}
      <div className={`${BOX} mb-4`}>
        <div className="mb-3 text-[12px] font-medium text-white">Konfiguration</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="mb-1 text-[10px] text-[#8a8a8a]">Asset</div>
            <div className="flex h-8 items-center rounded-[6px] border border-[#1f1f1f] bg-[#080808] px-2 text-xs text-white">
              Standard Weizen (CBOT ZW1!)
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] text-[#8a8a8a]">Training Window (Jahre)</div>
            <input
              className={INPUT}
              type="number"
              min={3}
              max={15}
              value={form.trainingYears}
              onChange={(e) => setForm((f) => ({ ...f, trainingYears: parseInt(e.target.value) || 5 }))}
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] text-[#8a8a8a]">Holding Min (Handelstage)</div>
            <input
              className={INPUT}
              type="number"
              min={1}
              max={50}
              value={form.holdingDaysMin}
              onChange={(e) => setForm((f) => ({ ...f, holdingDaysMin: parseInt(e.target.value) || 10 }))}
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] text-[#8a8a8a]">Holding Max (Handelstage)</div>
            <input
              className={INPUT}
              type="number"
              min={1}
              max={50}
              value={form.holdingDaysMax}
              onChange={(e) => setForm((f) => ({ ...f, holdingDaysMax: parseInt(e.target.value) || 20 }))}
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] text-[#8a8a8a]">Transaktionskosten (bps)</div>
            <input
              className={INPUT}
              type="number"
              min={0}
              max={500}
              value={form.transactionCostBps}
              onChange={(e) => setForm((f) => ({ ...f, transactionCostBps: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] text-[#8a8a8a]">Ranking-Metrik</div>
            <div className="flex h-8 items-center rounded-[6px] border border-[#1f1f1f] bg-[#080808] px-2 text-xs text-[#8a8a8a]">
              Stability Score (AvgReturn − 0.5×StdDev)
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] text-[#8a8a8a]">Kostenhinweis</div>
            <div className="flex h-8 items-center rounded-[6px] border border-[#1f1f1f] bg-[#080808] px-2 text-xs text-[#8a8a8a]">
              {form.transactionCostBps === 0 ? "No transaction cost configured" : `${form.transactionCostBps} bps pro Trade`}
            </div>
          </div>
        </div>

        {/* Run button */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleRun}
            disabled={status === "running"}
            className="rounded-[8px] border border-[rgba(220,196,118,0.4)] bg-[rgba(220,196,118,0.08)] px-4 py-2 text-xs font-medium text-[#dcc476] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "running" ? "Berechne…" : "Walk-Forward starten"}
          </button>
          <span className="text-[10px] text-[#8a8a8a]">
            {status === "idle" && "Bereit."}
            {status === "running" && "Berechnung läuft… (einmalig, kein Auto-Run)"}
            {status === "done" && result && `Fertig in ${result.calculationDurationMs}ms — ${result.foldResults.length} Folds`}
            {status === "error" && <span className="text-[#ff6666]">Fehler: {errorMsg}</span>}
          </span>
        </div>
      </div>

      {/* Data status (after run) */}
      {result && (
        <div className={`${BOX} mb-4 text-[11px]`}>
          <div className="mb-2 text-[12px] font-medium text-white">Datenquelle</div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            <div><span className="text-[#8a8a8a]">Quelle: </span>Historical CSV</div>
            <div><span className="text-[#8a8a8a]">Asset: </span>CBOT ZW1! (Daily)</div>
            <div><span className="text-[#8a8a8a]">Von: </span>{result.dataSource.firstDate}</div>
            <div><span className="text-[#8a8a8a]">Bis: </span>{result.dataSource.lastDate}</div>
            <div><span className="text-[#8a8a8a]">Bars: </span>{result.dataSource.bars}</div>
            <div><span className="text-[#8a8a8a]">Vollst. Jahre: </span>{result.dataSource.completeYears}</div>
            <div><span className="text-[#8a8a8a]">Folds: </span>{result.foldResults.length}</div>
            <div><span className="text-[#8a8a8a]">Fingerprint: </span>{result.dataSource.csvFingerprint.slice(0, 30)}</div>
          </div>
          {result.warnings.length > 0 && (
            <div className="mt-2 text-[10px] text-[#dcc476]">
              {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
        </div>
      )}

      {/* OOS Summary */}
      {result && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[12px] font-medium text-white">Out-of-Sample Summary</span>
            <span className="rounded-[4px] border border-[rgba(13,255,0,0.3)] bg-[rgba(13,255,0,0.06)] px-2 py-0.5 text-[10px] text-[#0dff00]">
              OUT-OF-SAMPLE
            </span>
          </div>
          <OosSummaryCards oos={result.oosSummary} />
          <div className="mt-3">
            <ResearchGatePanel gate={result.researchGate} />
          </div>
        </div>
      )}

      {/* Current Year Plan */}
      {result && plan && (
        <div className={`${BOX} mb-4`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-white">
              Current Year Plan {plan.year}
            </span>
            <span className={`rounded-[4px] border border-[rgba(220,196,118,0.3)] bg-[rgba(220,196,118,0.06)] px-2 py-0.5 text-[10px] ${statusBadge(plan.status)}`}>
              {plan.status.replace(/_/g, " ")}
            </span>
            <span className="text-[10px] text-[#8a8a8a]">/ PROVISIONAL</span>
            {plan.researchGate.status === "FAILED_RESEARCH_GATE" && (
              <span className="rounded-[4px] border border-[rgba(255,0,0,0.4)] bg-[rgba(255,0,0,0.08)] px-2 py-0.5 text-[10px] font-semibold text-[#ff4444]">
                FAILED OOS QUALITY GATE
              </span>
            )}
            {plan.researchGate.status === "PASSED_RESEARCH_GATE" && (
              <span className="rounded-[4px] border border-[rgba(13,255,0,0.3)] bg-[rgba(13,255,0,0.06)] px-2 py-0.5 text-[10px] font-semibold text-[#0dff00]">
                PASSED OOS QUALITY GATE
              </span>
            )}
          </div>
          <div className="mb-2 text-[10px] text-[#dcc476]">
            Research plan only — not promoted to live trading signal.
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            <div><span className="text-[#8a8a8a]">Train: </span>{plan.trainingStartYear}–{plan.trainingEndYear}</div>
            <div>
              <span className="text-[#8a8a8a]">Richtung: </span>
              <span style={{ color: plan.selectedDirection === "LONG" ? BULL : plan.selectedDirection === "SHORT" ? BEAR : MUTED }}>
                {plan.selectedDirection ?? "—"}
              </span>
            </div>
            <div><span className="text-[#8a8a8a]">Entry MM-DD: </span>{plan.selectedEntryMonthDay ?? "—"}</div>
            <div><span className="text-[#8a8a8a]">Haltedauer: </span>{plan.selectedHoldingTradingDays ? `${plan.selectedHoldingTradingDays} Handelstage` : "—"}</div>
            <div><span className="text-[#8a8a8a]">Geplanter Entry: </span>{plan.plannedEntryDate ?? "—"}</div>
            <div><span className="text-[#8a8a8a]">Geplanter Exit: </span>{plan.plannedExitDate ?? "—"}</div>
            {plan.actualEntryPrice != null && (
              <div><span className="text-[#8a8a8a]">Entry-Preis: </span>{plan.actualEntryPrice}</div>
            )}
            {plan.actualExitPrice != null && (
              <div><span className="text-[#8a8a8a]">Exit-Preis: </span>{plan.actualExitPrice}</div>
            )}
            {plan.returnToDate != null && (
              <div>
                <span className="text-[#8a8a8a]">Return to Date: </span>
                <span style={{ color: returnColor(plan.returnToDate) }}>{fmt(plan.returnToDate)}</span>
              </div>
            )}
            {plan.finalReturn != null && (
              <div>
                <span className="text-[#8a8a8a]">Final Return: </span>
                <span style={{ color: returnColor(plan.finalReturn) }}>{fmt(plan.finalReturn)}</span>
              </div>
            )}
            {plan.stabilityScore != null && (
              <div><span className="text-[#8a8a8a]">Train Score: </span>{fmtScore(plan.stabilityScore)}</div>
            )}
          </div>
        </div>
      )}

      {/* Tabs: Folds + Top Candidates */}
      {result && (
        <div>
          <div className="mb-2 flex gap-2">
            <button
              onClick={() => setActiveTab("folds")}
              className={`rounded-[6px] px-3 py-1 text-xs transition-colors ${activeTab === "folds" ? "bg-[rgba(220,196,118,0.15)] text-[#dcc476]" : "text-[#8a8a8a] hover:text-white"}`}
            >
              Walk-Forward Folds ({result.foldResults.length})
            </button>
            <button
              onClick={() => setActiveTab("top10")}
              className={`rounded-[6px] px-3 py-1 text-xs transition-colors ${activeTab === "top10" ? "bg-[rgba(220,196,118,0.15)] text-[#dcc476]" : "text-[#8a8a8a] hover:text-white"}`}
            >
              Top-10 Kandidaten (letztes Train-Fenster)
            </button>
          </div>

          {activeTab === "folds" && (
            <div>
              <div className="mb-1 text-[10px] text-[#8a8a8a]">
                OOS = Out-of-Sample Testjahr. Train = In-Sample, nur für Parameterauswahl.
                Einstieg: Open am ersten verfügbaren Handelstag ≥ Entry MM-DD.
                Exit: Close nach exakt holdingTradingDays Handelssitzungen.
              </div>
              <FoldTable folds={result.foldResults} />
            </div>
          )}

          {activeTab === "top10" && result.topCandidatesLastTrainingWindow.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] text-[#8a8a8a]">
                In-Sample — Aus dem letzten Trainingsfenster (
                {result.foldResults.at(-1)?.trainingStartYear}–
                {result.foldResults.at(-1)?.trainingEndYear}).
                Ranking: Stability Score = AvgReturn − 0.5×StdDev.
                Diese Werte sind IN-SAMPLE und dürfen NICHT als OOS-Performance interpretiert werden.
              </div>
              <TopCandidatesTable candidates={result.topCandidatesLastTrainingWindow} />
            </div>
          )}
        </div>
      )}

      {/* Safety footer */}
      <div className="mt-4 rounded-[8px] border border-[#1f1f1f] bg-[#060606] p-3 text-[10px] text-[#8a8a8a]">
        <strong className="text-[#dcc476]">Wichtiger Hinweis:</strong>{" "}
        Diese Funktion ist ausschließlich historisches Walk-Forward Research auf Basis einer CSV-Datei.
        Die Ergebnisse sind kein Live-Signal, kein gehebeltes Trading-System und keine Anlageempfehlung.
        Der Current Year Plan ist vorläufig (Provisional) und nicht in der OOS-Gesamtperformance enthalten.
        usedAsLiveSignal=false · globalLiveSignalsChanged=false · monitoringChanged=false
      </div>
    </section>
  );
}
