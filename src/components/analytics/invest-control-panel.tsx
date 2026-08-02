"use client";
/**
 * Core Invest Control Panel
 * Layout: left = tab content (allocation 2-col grid / risk / scenario)
 *         right = always-visible exposure summary + action buttons
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AnalyticsDataset } from "@/lib/analytics/portfolio-data";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScenarioStatus = "idle" | "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED" | "CANCELLED";
export type RebalanceMode  = "auto_cash" | "proportional" | "manual";

export interface ScenarioRun {
  runId:    string;
  status:   ScenarioStatus;
  phase:    string;
  metrics?: Record<string, number>;
}

export interface DraftRisk {
  exposure_cap:     number;
  financing_spread: number;
  fee_rate:         number;
}

export interface ScenarioEquityCurves {
  performance: Array<{ date: string; value: number }>;
  drawdown:    Array<{ date: string; value: number }>;
  benchmark:   Array<{ date: string; value: number }>;
}

interface Props {
  dataset:           AnalyticsDataset;
  onScenarioResult?: (ec: ScenarioEquityCurves, annual: unknown, metrics: Record<string, number>, run: ScenarioRun) => void;
  onResetScenario?:  () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ETF_TICKERS = [
  "SPY","QQQ","RSP","IWM","EFA","EEM","QUAL","MTUM","VLUE","USMV","GLD","IEF","BIL",
] as const;
type Ticker = typeof ETF_TICKERS[number];

const BASELINE_RISK: DraftRisk = {
  exposure_cap:     1.60,
  financing_spread: 0.015,
  fee_rate:         0.25,
};

const PHASE_STEPS = [
  "Preparing Data","Running Backtrader","Calculating Fees",
  "Calculating Metrics","Validating","Complete",
];

// ─── Asset row ────────────────────────────────────────────────────────────────

function AssetRow({
  ticker, baseline, draft, onDec, onInc, onChange,
}: {
  ticker: string; baseline: number; draft: number;
  onDec: () => void; onInc: () => void;
  onChange: (pct: number) => void;
}) {
  const delta     = draft - baseline;
  const pctDraft  = +(draft * 100).toFixed(2);
  const pctBase   = Math.round(baseline * 100);
  const isBil     = ticker === "BIL";

  return (
    <div className={cn("flex items-center gap-1 h-[27px]", isBil && "opacity-55")}>
      {/* Ticker */}
      <span className="w-[26px] shrink-0 text-[10px] font-bold text-zinc-200 [font-family:var(--font-montserrat),sans-serif]">
        {ticker}
      </span>
      {/* Baseline */}
      <span className="w-[22px] shrink-0 text-right text-[8.5px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
        {pctBase}%
      </span>
      {/* − */}
      <button
        type="button"
        onClick={onDec}
        className="flex h-[27px] w-[22px] shrink-0 items-center justify-center rounded border border-white/[0.10] text-zinc-400 hover:border-white/25 hover:text-white text-[13px] leading-none [font-family:var(--font-montserrat),sans-serif]"
      >−</button>
      {/* Input */}
      <input
        type="number"
        value={pctDraft}
        step={1}
        min={-50}
        max={250}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.round(v * 100) / 10000);
        }}
        className={cn(
          "min-w-[60px] flex-1 h-[27px] rounded border bg-white/[0.05] px-1 text-center text-[12px] font-semibold text-white [font-family:var(--font-montserrat),sans-serif] focus:outline-none focus:border-[#e2ca7a]/40",
          Math.abs(delta) > 0.0005 ? "border-[#e2ca7a]/20 bg-[#e2ca7a]/[0.04]" : "border-white/[0.10]",
        )}
      />
      {/* + */}
      <button
        type="button"
        onClick={onInc}
        className="flex h-[27px] w-[22px] shrink-0 items-center justify-center rounded border border-white/[0.10] text-zinc-400 hover:border-white/25 hover:text-white text-[13px] leading-none [font-family:var(--font-montserrat),sans-serif]"
      >+</button>
      {/* Delta */}
      <span
        className="w-[26px] shrink-0 text-right text-[9px] font-bold [font-family:var(--font-montserrat),sans-serif]"
        style={{ color: Math.abs(delta) < 0.0005 ? "#3f3f46" : delta > 0 ? "#22C55E" : "#EF4444" }}
      >
        {Math.abs(delta) < 0.0005 ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta * 100)}%`}
      </span>
    </div>
  );
}

// ─── Exposure panel (right column) ───────────────────────────────────────────

function ExposurePanel({
  draftLong, draftGross, draftNet, draftCash,
  hasChanges, isRunning, isComplete, scenarioActive,
  onReset, onRun, onCancel, onCompare, onClose,
  runStatus,
}: {
  draftLong:  number; draftGross: number; draftNet: number; draftCash: number;
  hasChanges: boolean; isRunning: boolean; isComplete: boolean; scenarioActive: boolean;
  onReset:   () => void; onRun:    () => void; onCancel:  () => void;
  onCompare: () => void; onClose:  () => void;
  runStatus?: string;
}) {
  const capHard   = 1.60;
  const isOverCap = draftGross > capHard + 0.001;
  const capRoom   = capHard - draftGross;

  const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="flex items-center justify-between gap-1">
      <span className="text-[8.5px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">{label}</span>
      <span className="text-[10px] font-bold [font-family:var(--font-montserrat),sans-serif]" style={{ color: color ?? "#a1a1aa" }}>
        {value}
      </span>
    </div>
  );

  const Btn = ({ onClick, children, variant = "ghost", disabled }: {
    onClick: () => void; children: React.ReactNode;
    variant?: "gold" | "ghost" | "danger"; disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full rounded-[5px] py-[5px] text-[9px] font-bold uppercase tracking-[0.10em] transition-all [font-family:var(--font-montserrat),sans-serif]",
        variant === "gold"  && !disabled && "border border-[#e2ca7a]/30 bg-[#e2ca7a]/10 text-[#e2ca7a] hover:bg-[#e2ca7a]/20",
        variant === "gold"  && disabled  && "border border-white/[0.06] text-zinc-700 cursor-not-allowed",
        variant === "ghost"             && "border border-white/[0.10] text-zinc-400 hover:text-zinc-200 hover:border-white/20",
        variant === "danger"            && "border border-[#EF4444]/30 text-[#EF4444]/80 hover:text-[#EF4444]",
      )}
    >{children}</button>
  );

  return (
    <div className="flex w-[148px] shrink-0 flex-col gap-2 border-l border-white/[0.05] pl-3">
      {/* Exposure rows */}
      <div className="space-y-1">
        <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-zinc-700 [font-family:var(--font-montserrat),sans-serif]">Exposure</p>
        <Row label="Long"  value={`${Math.round(draftLong  * 100)}%`} color="#e2ca7a" />
        <Row label="Gross" value={`${Math.round(draftGross * 100)}%`} color={isOverCap ? "#EF4444" : "#e2ca7a"} />
        <Row label="Net"   value={`${Math.round(draftNet   * 100)}%`} />
        <Row label="Cash"  value={`${Math.round(draftCash  * 100)}%`} color="#3B82F6" />
        <div className="border-t border-white/[0.05] pt-1">
          <Row
            label={isOverCap ? "OVER CAP" : "Cap room"}
            value={isOverCap ? `+${Math.round((draftGross - capHard) * 100)}%` : `${Math.round(capRoom * 100)}%`}
            color={isOverCap ? "#EF4444" : "#52525b"}
          />
        </div>
      </div>

      {/* Run status */}
      {runStatus && (
        <p className="text-[8px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif] border-t border-white/[0.05] pt-1">
          {runStatus}
        </p>
      )}

      {/* Action buttons — always visible */}
      <div className="mt-auto space-y-1.5 border-t border-white/[0.05] pt-2">
        <Btn onClick={onReset} variant="ghost">Reset</Btn>

        {isRunning ? (
          <Btn onClick={onCancel} variant="danger">Cancel</Btn>
        ) : (
          <Btn onClick={onRun} variant="gold" disabled={!hasChanges}>
            Run Scenario
          </Btn>
        )}

        {isComplete && (
          <>
            <Btn onClick={onCompare} variant="ghost">
              {scenarioActive ? "View Base" : "View Scenario"}
            </Btn>
            <Btn onClick={onClose} variant="ghost">Close</Btn>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Allocation tab left content ──────────────────────────────────────────────

function AllocationContent({
  baselineWeights, draftWeights, rebalanceMode,
  onWeightChange, onRebalanceModeChange,
}: {
  baselineWeights: Record<string, number>;
  draftWeights:    Record<string, number>;
  rebalanceMode:   RebalanceMode;
  onWeightChange:  (t: string, v: number) => void;
  onRebalanceModeChange: (m: RebalanceMode) => void;
}) {
  const active = ETF_TICKERS.filter(t =>
    Math.abs(baselineWeights[t] ?? 0) > 0.001 || Math.abs(draftWeights[t] ?? 0) > 0.001
  );
  const half  = Math.ceil(active.length / 2);
  const col1  = active.slice(0, half);
  const col2  = active.slice(half);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {/* Rebalance mode */}
      <div className="flex shrink-0 gap-1">
        {(["auto_cash","proportional","manual"] as RebalanceMode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => onRebalanceModeChange(m)}
            className={cn(
              "flex-1 rounded-[4px] py-[4px] text-[8.5px] font-bold uppercase tracking-[0.09em] transition-colors [font-family:var(--font-montserrat),sans-serif]",
              rebalanceMode === m
                ? "bg-[#e2ca7a]/10 text-[#e2ca7a] border border-[#e2ca7a]/20"
                : "border border-white/[0.07] text-zinc-600 hover:text-zinc-400",
            )}
          >
            {m === "auto_cash" ? "Auto Cash" : m === "proportional" ? "Prop." : "Manual"}
          </button>
        ))}
      </div>

      {/* 2-column asset grid */}
      <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
        {[col1, col2].map((col, ci) => (
          <div key={ci} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
            {col.map(ticker => {
              const baseline = baselineWeights[ticker] ?? 0;
              const draft    = draftWeights[ticker] ?? baseline;
              return (
                <AssetRow
                  key={ticker}
                  ticker={ticker}
                  baseline={baseline}
                  draft={draft}
                  onDec={() => onWeightChange(ticker, Math.max(-0.5, draft - 0.01))}
                  onInc={() => onWeightChange(ticker, Math.min(2.5,  draft + 0.01))}
                  onChange={v  => onWeightChange(ticker, v)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Risk tab left content ────────────────────────────────────────────────────

function RiskContent({
  draftRisk, onRiskChange,
}: {
  draftRisk:    DraftRisk;
  onRiskChange: (k: keyof DraftRisk, v: number) => void;
}) {
  const rows: Array<{
    label: string; desc: string; unit: "x" | "%"; key: keyof DraftRisk;
    min: number; max: number; step: number; base: number;
  }> = [
    { label: "Exposure Cap",     desc: "Max gross leverage",              unit: "x",  key: "exposure_cap",     min: 0.5,  max: 3.0,  step: 0.05,  base: BASELINE_RISK.exposure_cap },
    { label: "Financing Spread", desc: "Borrowing cost on short exp.",    unit: "%",  key: "financing_spread", min: 0,    max: 0.10, step: 0.001, base: BASELINE_RISK.financing_spread },
    { label: "Perf Fee",         desc: "Quarterly HWM perf fee rate",     unit: "%",  key: "fee_rate",         min: 0,    max: 0.50, step: 0.01,  base: BASELINE_RISK.fee_rate },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-around gap-3 overflow-hidden py-1">
      {rows.map(({ label, desc, unit, key, min, max, step, base }) => {
        const toDisp   = (v: number) => unit === "%" ? +(v * 100).toFixed(1) : +v.toFixed(2);
        const fromDisp = (v: number) => unit === "%" ? v / 100 : v;
        const draft    = draftRisk[key];
        const delta    = draft - base;
        const dv       = toDisp(draft);
        const bv       = toDisp(base);
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[10px] font-bold text-zinc-300 [font-family:var(--font-montserrat),sans-serif]">{label}</span>
                <span className="ml-2 text-[8px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">{desc}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[8.5px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">base {bv}{unit}</span>
                {Math.abs(delta) > 1e-6 && (
                  <span className="text-[10px] font-bold [font-family:var(--font-montserrat),sans-serif]"
                    style={{ color: delta > 0 ? "#22C55E" : "#EF4444" }}>
                    {delta > 0 ? "+" : ""}{toDisp(delta)}{unit}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={toDisp(min)} max={toDisp(max)} step={toDisp(step)} value={dv}
                onChange={e => onRiskChange(key, fromDisp(parseFloat(e.target.value)))}
                className="flex-1 h-1.5 cursor-pointer accent-[#e2ca7a]"
              />
              <input
                type="number"
                min={toDisp(min)} max={toDisp(max)} step={toDisp(step)} value={dv}
                onChange={e => {
                  const v = fromDisp(parseFloat(e.target.value));
                  if (!isNaN(v) && v >= min && v <= max) onRiskChange(key, v);
                }}
                className="w-[58px] h-[27px] rounded border border-white/[0.10] bg-white/[0.05] px-1 text-center text-[12px] font-semibold text-white [font-family:var(--font-montserrat),sans-serif] focus:border-[#e2ca7a]/40 focus:outline-none"
              />
              <span className="w-4 text-[9px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">{unit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Scenario tab left content ────────────────────────────────────────────────

function ScenarioContent({ run }: { run: ScenarioRun | null }) {
  if (!run) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[9px] italic text-zinc-600 [font-family:var(--font-montserrat),sans-serif] text-center px-2">
          Adjust weights or risk params, then click Run Scenario.
        </p>
      </div>
    );
  }

  const isRunning  = run.status === "QUEUED" || run.status === "RUNNING";
  const isComplete = run.status === "COMPLETE";
  const isFailed   = run.status === "FAILED" || run.status === "CANCELLED";
  const phaseIdx   = PHASE_STEPS.indexOf(run.phase);
  const phasePct   = phaseIdx >= 0 ? (phaseIdx / (PHASE_STEPS.length - 1)) * 100 : 5;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden py-1">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <span className={cn(
          "text-[9px] font-bold uppercase tracking-[0.12em] [font-family:var(--font-montserrat),sans-serif]",
          isRunning  ? "text-[#e2ca7a]" : isComplete ? "text-[#22C55E]" : "text-[#EF4444]",
        )}>
          {run.status}
        </span>
        <span className="text-[8px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">{run.runId}</span>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="space-y-1">
          <div className="text-[8.5px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">{run.phase || "Waiting…"}</div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-[#e2ca7a]/60 transition-all duration-500" style={{ width: `${phasePct}%` }} />
          </div>
        </div>
      )}

      {/* Failed message */}
      {isFailed && (
        <p className="text-[8.5px] text-[#EF4444] [font-family:var(--font-montserrat),sans-serif]">{run.phase}</p>
      )}

      {/* Complete: metric grid */}
      {isComplete && run.metrics && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {([
            ["Total Return", `${run.metrics.total_return_pct?.toFixed(1)}%`],
            ["CAGR",         `${run.metrics.cagr_pct?.toFixed(2)}%`],
            ["Max DD",       `${run.metrics.max_drawdown_pct?.toFixed(1)}%`],
            ["Sharpe",       `${run.metrics.sharpe?.toFixed(2)}`],
            ["Sortino",      `${run.metrics.sortino?.toFixed(2)}`],
            ["Vol",          `${run.metrics.volatility_pct?.toFixed(1)}%`],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex justify-between items-baseline">
              <span className="text-[8.5px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">{k}</span>
              <span className="text-[11px] font-bold text-zinc-100 [font-family:var(--font-montserrat),sans-serif]">{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Label */}
      {isComplete && (
        <p className="mt-auto text-[8px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
          SCENARIO · UNSAVED · {run.runId}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InvestControlPanel({ dataset, onScenarioResult, onResetScenario }: Props) {
  const [activeTab,      setActiveTab]      = useState<"allocation" | "risk" | "scenario">("allocation");
  const [draftWeights,   setDraftWeights]   = useState<Record<string, number>>({});
  const [draftRisk,      setDraftRisk]      = useState<DraftRisk>({ ...BASELINE_RISK });
  const [rebalanceMode,  setRebalanceMode]  = useState<RebalanceMode>("auto_cash");
  const [scenarioRun,    setScenarioRun]    = useState<ScenarioRun | null>(null);
  const [scenarioActive, setScenarioActive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const baselineWeights = React.useMemo<Record<string, number>>(() => {
    if (dataset.etfWeights) return dataset.etfWeights;
    const w: Record<string, number> = {};
    for (const g of dataset.groups) {
      if (ETF_TICKERS.includes(g.id as Ticker) && (g.weight ?? 0) > 0)
        w[g.id] = g.weight ?? 0;
    }
    return w;
  }, [dataset]);

  // Effective weights: baseline merged with draft overrides
  const effectiveWeights = React.useMemo(() => {
    const m: Record<string, number> = { ...baselineWeights };
    for (const [t, w] of Object.entries(draftWeights)) m[t] = w;
    return m;
  }, [baselineWeights, draftWeights]);

  // Exposure metrics
  const active   = ETF_TICKERS.filter(t => Math.abs(effectiveWeights[t] ?? 0) > 0.001);
  const longOnly = active.filter(t => t !== "BIL");
  const draftLong  = longOnly.reduce((s, t) => s + Math.max(0, effectiveWeights[t] ?? 0), 0);
  const draftShort = longOnly.reduce((s, t) => s + Math.max(0, -(effectiveWeights[t] ?? 0)), 0);
  const draftCash  = effectiveWeights["BIL"] ?? 0;
  const draftNet   = draftLong - draftShort;
  const draftGross = draftLong + draftShort;

  const hasChanges =
    Object.keys(draftWeights).some(t => Math.abs((draftWeights[t] ?? 0) - (baselineWeights[t] ?? 0)) > 0.0005) ||
    draftRisk.exposure_cap     !== BASELINE_RISK.exposure_cap     ||
    draftRisk.financing_spread !== BASELINE_RISK.financing_spread ||
    draftRisk.fee_rate         !== BASELINE_RISK.fee_rate;

  const isRunning  = scenarioRun?.status === "QUEUED" || scenarioRun?.status === "RUNNING";
  const isComplete = scenarioRun?.status === "COMPLETE";

  const handleWeightChange = useCallback((ticker: string, val: number) => {
    setDraftWeights(prev => ({ ...prev, [ticker]: Math.round(val * 10000) / 10000 }));
  }, []);

  const handleReset = useCallback(() => {
    setDraftWeights({});
    setDraftRisk({ ...BASELINE_RISK });
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const pollStatus = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/core-invest/scenarios/${runId}`);
      if (!res.ok) return;
      const data = await res.json() as {
        status:        { run_id: string; status: ScenarioStatus; phase: string };
        result?:       { metrics: Record<string, number> };
        equityCurves?: ScenarioEquityCurves;
        annualReturns?: unknown;
      };
      const st = data.status;
      setScenarioRun({ runId, status: st.status, phase: st.phase, metrics: data.result?.metrics });

      if (st.status === "COMPLETE") {
        stopPolling();
        if (data.result && data.equityCurves && onScenarioResult) {
          onScenarioResult(data.equityCurves, data.annualReturns, data.result.metrics, {
            runId, status: "COMPLETE", phase: "Complete", metrics: data.result.metrics,
          });
          setScenarioActive(true);
        }
        setActiveTab("scenario");
      } else if (st.status === "FAILED" || st.status === "CANCELLED") {
        stopPolling();
        setActiveTab("scenario");
      }
    } catch { /* keep polling */ }
  }, [stopPolling, onScenarioResult]);

  const handleRun = useCallback(async () => {
    stopPolling();
    setScenarioActive(false);
    setScenarioRun({ runId: "…", status: "QUEUED", phase: "Queued" });
    setActiveTab("scenario");

    try {
      const res = await fetch("/api/core-invest/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_weights:  draftWeights,
          risk_params:    { ...draftRisk },
          rebalance_mode: rebalanceMode,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setScenarioRun({ runId: "error", status: "FAILED", phase: err.error ?? "Request failed" });
        return;
      }
      const { run_id } = await res.json() as { run_id: string };
      setScenarioRun({ runId: run_id, status: "QUEUED", phase: "Queued" });
      void pollStatus(run_id);
      pollRef.current = setInterval(() => void pollStatus(run_id), 1500);
    } catch (e) {
      setScenarioRun({ runId: "error", status: "FAILED", phase: String(e) });
    }
  }, [draftWeights, draftRisk, rebalanceMode, stopPolling, pollStatus]);

  const handleCancel = useCallback(async () => {
    if (!scenarioRun?.runId || scenarioRun.runId === "error" || scenarioRun.runId === "…") return;
    stopPolling();
    try {
      await fetch(`/api/core-invest/scenarios/${scenarioRun.runId}`, { method: "POST" });
      setScenarioRun(prev => prev ? { ...prev, status: "CANCELLED", phase: "Cancelled" } : null);
    } catch { /* ignore */ }
  }, [scenarioRun, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const runStatusLine = scenarioRun
    ? `${scenarioRun.status}${scenarioRun.phase && scenarioRun.phase !== scenarioRun.status ? ` · ${scenarioRun.phase}` : ""}`
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border border-white/[0.06] bg-gradient-to-b from-[#19191d] to-[#111214]">

      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.05] px-3 py-2">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#e2ca7a]/80 [font-family:var(--font-montserrat),sans-serif]">
          Control Panel
        </p>
        <div className="flex gap-1.5">
          {scenarioActive && (
            <span className="rounded-[3px] border border-[#e2ca7a]/30 bg-[#e2ca7a]/10 px-1.5 py-0.5 text-[7.5px] font-bold uppercase tracking-[0.1em] text-[#e2ca7a] [font-family:var(--font-montserrat),sans-serif]">
              SCENARIO
            </span>
          )}
          {hasChanges && !isRunning && (
            <span className="rounded-[3px] border border-zinc-600/40 bg-zinc-700/20 px-1.5 py-0.5 text-[7.5px] font-bold uppercase tracking-[0.1em] text-zinc-400 [font-family:var(--font-montserrat),sans-serif]">
              DRAFT
            </span>
          )}
          {isRunning && (
            <span className="flex items-center gap-1 rounded-[3px] border border-[#e2ca7a]/20 bg-[#e2ca7a]/5 px-1.5 py-0.5 text-[7.5px] font-bold uppercase tracking-[0.1em] text-[#e2ca7a] [font-family:var(--font-montserrat),sans-serif]">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#e2ca7a]" />
              RUNNING
            </span>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex shrink-0 gap-0.5 border-b border-white/[0.05] px-2 py-1">
        {(["allocation","risk","scenario"] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 rounded-[4px] py-[5px] text-[9px] font-bold uppercase tracking-[0.10em] transition-colors [font-family:var(--font-montserrat),sans-serif]",
              activeTab === tab
                ? "bg-[#e2ca7a]/10 text-[#e2ca7a] border border-[#e2ca7a]/20"
                : "border border-transparent text-zinc-600 hover:text-zinc-400",
            )}
          >
            {tab === "allocation" ? "Allocation" : tab === "risk" ? "Risk" : "Scenario"}
          </button>
        ))}
      </div>

      {/* ── Body: left (tab content) + right (exposure + actions) ── */}
      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden px-3 py-2">
        {/* Left: tab content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pr-3">
          {activeTab === "allocation" && (
            <AllocationContent
              baselineWeights={baselineWeights}
              draftWeights={draftWeights}
              rebalanceMode={rebalanceMode}
              onWeightChange={handleWeightChange}
              onRebalanceModeChange={setRebalanceMode}
            />
          )}
          {activeTab === "risk" && (
            <RiskContent
              draftRisk={draftRisk}
              onRiskChange={(k, v) => setDraftRisk(prev => ({ ...prev, [k]: v }))}
            />
          )}
          {activeTab === "scenario" && (
            <ScenarioContent run={scenarioRun} />
          )}
        </div>

        {/* Right: always-visible exposure + actions */}
        <ExposurePanel
          draftLong={draftLong}
          draftGross={draftGross}
          draftNet={draftNet}
          draftCash={draftCash}
          hasChanges={hasChanges}
          isRunning={!!isRunning}
          isComplete={!!isComplete}
          scenarioActive={scenarioActive}
          onReset={handleReset}
          onRun={handleRun}
          onCancel={handleCancel}
          onCompare={() => setScenarioActive(v => !v)}
          onClose={() => { setScenarioActive(false); onResetScenario?.(); }}
          runStatus={runStatusLine}
        />
      </div>
    </div>
  );
}
