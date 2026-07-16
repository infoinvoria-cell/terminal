"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import type {
  MonitoringStrategyRunResponse,
  MonitoringStrategyRunMode,
  StrategyInputDefinitionItem,
  StrategyInputSet,
} from "@/lib/monitoring/strategyTester/types";

type Props = {
  symbol: string | null;
  assetName?: string | null;
  onClose: () => void;
};

type Mode = "engine_simulation" | "csv_reference_replay" | "engine_vs_csv_validation" | "walk_forward" | "live_signal";

type InputsState =
  | { phase: "idle" | "loading" }
  | { phase: "loaded"; inputSet: StrategyInputSet; inputAvailability: string }
  | { phase: "error"; message: string };

type RunState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; response: MonitoringStrategyRunResponse }
  | { phase: "error"; message: string };

const MODE_LABELS: Record<Mode, string> = {
  engine_simulation: "FULL",
  csv_reference_replay: "CSV Ref",
  engine_vs_csv_validation: "IS",
  walk_forward: "WF/OOS",
  live_signal: "LIVE",
};

function valueEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatPct(value: number | null | undefined): string {
  const safe = Number(value ?? 0);
  return `${safe >= 0 ? "+" : ""}${safe.toFixed(2)}%`;
}

function formatNumber(value: number | null | undefined): string {
  const safe = Number(value ?? 0);
  return Number.isFinite(safe) ? safe.toFixed(2) : "0.00";
}

function StatusChip({ tone, children }: { tone: "base" | "pass" | "warn" | "fail"; children: ReactNode }) {
  return <span className={`mva-chip mva-chip--${tone}`}>{children}</span>;
}

function statusTone(status: string | null | undefined): "base" | "pass" | "warn" | "fail" {
  const value = String(status ?? "").toLowerCase();
  if (!value) return "base";
  if (value.startsWith("pass") || value.includes("exact_trade_parity")) return "pass";
  if (value.startsWith("fail") || value.includes("blocked_missing_execution_assumption")) return "fail";
  if (value.includes("mismatch") || value.includes("close_metric_parity") || value.includes("custom_inputs")) return "warn";
  return "base";
}

function InputControl({
  input,
  value,
  dirty,
  onChange,
  onReset,
}: {
  input: StrategyInputDefinitionItem;
  value: unknown;
  dirty: boolean;
  onChange: (key: string, value: unknown) => void;
  onReset: (key: string) => void;
}) {
  return (
    <div className={`mva-input-row ${dirty ? "is-dirty" : ""}`}>
      <label className="mva-input-label">{input.label}</label>
      <div className="mva-input-control">
        {input.type === "boolean" ? (
          <button type="button" className={`mva-bool ${Boolean(value) ? "on" : "off"}`} onClick={() => onChange(input.key, !Boolean(value))}>
            {Boolean(value) ? "An" : "Aus"}
          </button>
        ) : input.type === "select" ? (
          <select className="mva-field" value={String(value ?? "")} onChange={(event) => onChange(input.key, event.target.value)}>
            {(input.options ?? []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : input.type === "number" ? (
          <input
            className="mva-field"
            type="number"
            value={Number(value ?? 0)}
            min={input.min}
            max={input.max}
            step={input.step ?? 0.1}
            onChange={(event) => onChange(input.key, Number(event.target.value))}
          />
        ) : (
          <input className="mva-field" type="text" value={String(value ?? "")} onChange={(event) => onChange(input.key, event.target.value)} />
        )}
        {dirty && (
          <button type="button" className="mva-reset-field" onClick={() => onReset(input.key)}>
            ↺
          </button>
        )}
      </div>
    </div>
  );
}

export default function MonitoringStrategySelector({ symbol, assetName, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("engine_simulation");
  const [inputsState, setInputsState] = useState<InputsState>({ phase: "idle" });
  const [runState, setRunState] = useState<RunState>({ phase: "idle" });
  const [refreshState, setRefreshState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [editedValues, setEditedValues] = useState<Record<string, unknown>>({});
  const abortRef = useRef<AbortController | null>(null);

  const inputSet = inputsState.phase === "loaded" ? inputsState.inputSet : null;
  const valueMap = useMemo(
    () => Object.fromEntries((inputSet?.inputs ?? []).map((input) => [input.key, editedValues[input.key] ?? input.defaultValue])),
    [editedValues, inputSet],
  );
  const dirtyKeys = useMemo(() => {
    const next = new Set<string>();
    for (const input of inputSet?.inputs ?? []) {
      if (!valueEquals(input.defaultValue, valueMap[input.key])) next.add(input.key);
    }
    return next;
  }, [inputSet, valueMap]);

  const loadInputs = useCallback(async (currentSymbol: string) => {
    setInputsState({ phase: "loading" });
    try {
      const response = await fetch("/api/monitoring/strategy-tester/load-inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: currentSymbol, strategyKind: "macro_valuation" }),
      });
      const data = await response.json() as { inputSet?: StrategyInputSet | null; inputAvailability?: string; error?: string };
      if (!data.inputSet) {
        setInputsState({ phase: "error", message: data.error ?? "Inputs konnten nicht geladen werden." });
        return;
      }
      setInputsState({ phase: "loaded", inputSet: data.inputSet, inputAvailability: data.inputAvailability ?? "missing_input_xlsx" });
    } catch (error) {
      setInputsState({ phase: "error", message: error instanceof Error ? error.message : "Inputs konnten nicht geladen werden." });
    }
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    setRunState({ phase: "idle" });
    setEditedValues({});
    if (!symbol) {
      setInputsState({ phase: "idle" });
      return;
    }
    loadInputs(symbol);
  }, [loadInputs, symbol]);

  const handleRun = useCallback(async () => {
    if (!symbol) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setRunState({ phase: "running" });
    try {
      const response = await fetch("/api/monitoring/strategy-tester/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          strategyKind: "macro_valuation",
          runMode: mode,
          customInputs: dirtyKeys.size ? valueMap : undefined,
        }),
        signal: abortRef.current.signal,
      });
      const data = await response.json() as MonitoringStrategyRunResponse;
      setRunState({ phase: "done", response: data });
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return;
      setRunState({ phase: "error", message: error instanceof Error ? error.message : "Run fehlgeschlagen." });
    }
  }, [dirtyKeys.size, mode, symbol, valueMap]);

  const handleRefresh = useCallback(async () => {
    setRefreshState("running");
    try {
      const response = await fetch("/api/monitoring/mva/ohlc/update", { method: "POST" });
      const data = await response.json() as { ok?: boolean };
      setRefreshState(data.ok ? "done" : "error");
    } catch {
      setRefreshState("error");
    }
  }, []);

  const result = runState.phase === "done" && runState.response.status === "passed" ? runState.response.result : null;
  const metrics = result?.metrics;
  const validation = result?.validation;
  const walkForward = result?.walkForward;
  const liveSignal = result?.liveSignal;

  const groupedInputs = useMemo(() => {
    const groups = new Map<string, StrategyInputDefinitionItem[]>();
    for (const input of inputSet?.inputs ?? []) {
      const bucket = groups.get(input.group) ?? [];
      bucket.push(input);
      groups.set(input.group, bucket);
    }
    return Array.from(groups.entries());
  }, [inputSet]);

  return (
    <div className="mva-panel">
      <div className="mva-header">
        <div>
          <div className="mva-title">Macro Valuation Engine</div>
          <div className="mva-subtitle">
            <span className="mva-symbol">{symbol ?? "-"}</span>
            <span>{assetName ?? "Agriculture"}</span>
          </div>
        </div>
        <button type="button" className="mva-close" onClick={onClose} aria-label="Schließen">
          <X size={14} />
        </button>
      </div>

      <div className="mva-toolbar">
        <div className="mva-mode-row">
          {(Object.keys(MODE_LABELS) as Mode[]).map((item) => (
            <button key={item} type="button" className={`mva-mode ${mode === item ? "active" : ""}`} onClick={() => setMode(item)}>
              {MODE_LABELS[item]}
            </button>
          ))}
        </div>
        <button type="button" className={`mva-refresh ${refreshState}`} onClick={handleRefresh}>
          <RefreshCw size={12} className={refreshState === "running" ? "spin" : ""} />
          Live 5m
        </button>
      </div>

      <div className="mva-layout">
        <section className="mva-results">
          {runState.phase === "idle" && <div className="mva-placeholder">Kein Run aktiv. Modus wählen und Engine starten.</div>}
          {runState.phase === "running" && (
            <div className="mva-placeholder">
              <Loader2 size={14} className="spin" /> Engine läuft…
            </div>
          )}
          {runState.phase === "error" && <div className="mva-error">{runState.message}</div>}
          {runState.phase === "done" && runState.response.status !== "passed" && <div className="mva-error">{runState.response.blocker ?? "Run blockiert."}</div>}
          {result && (
            <div className="mva-result-stack">
              <div className="mva-chip-row">
                <StatusChip tone="base">{MODE_LABELS[mode]}</StatusChip>
                <StatusChip tone={statusTone(result.parityStatus)}>
                  {result.parityStatus}
                </StatusChip>
                <StatusChip tone="base">{result.inputSource ?? "engine"}</StatusChip>
                {dirtyKeys.size > 0 && <StatusChip tone="warn">{dirtyKeys.size} geändert</StatusChip>}
              </div>

              {liveSignal && (
                <div className="mva-card">
                  <div className="mva-card-title">Live Signal</div>
                  <div className="mva-live-grid">
                    <div><span>Signal</span><strong>{liveSignal.signal}{liveSignal.stale ? " · stale" : ""}</strong></div>
                    <div><span>Entry</span><strong>{liveSignal.entryPrice != null ? formatNumber(liveSignal.entryPrice) : "-"}</strong></div>
                    <div><span>Stop</span><strong>{liveSignal.stopLoss != null ? formatNumber(liveSignal.stopLoss) : "-"}</strong></div>
                    <div><span>TP</span><strong>{liveSignal.takeProfit != null ? formatNumber(liveSignal.takeProfit) : "-"}</strong></div>
                    <div><span>Latest Bar</span><strong>{liveSignal.basedOnLatestBarTime?.slice(0, 10) ?? "-"}</strong></div>
                    <div><span>Reason</span><strong>{liveSignal.reason.join(", ") || "-"}</strong></div>
                  </div>
                </div>
              )}

              {metrics && (
                <div className="mva-card">
                  <div className="mva-card-title">KPIs</div>
                  <div className="mva-kpis">
                    <div><span>Trades</span><strong>{metrics.totalTrades}</strong></div>
                    <div><span>Winrate</span><strong>{formatPct(metrics.winratePct)}</strong></div>
                    <div><span>Net Return</span><strong>{formatPct(metrics.netReturnPct)}</strong></div>
                    <div><span>PF</span><strong>{formatNumber(metrics.profitFactor)}</strong></div>
                    <div><span>Max DD</span><strong>{formatPct(-Math.abs(metrics.maxDrawdownPct))}</strong></div>
                    <div><span>Avg Trade</span><strong>{formatPct(metrics.avgReturnPct)}</strong></div>
                  </div>
                </div>
              )}

              {mode === "engine_vs_csv_validation" && (
                <div className="mva-card">
                  <div className="mva-card-title">Engine vs CSV</div>
                  {!validation && <div className="mva-muted">Keine Referenz verfügbar.</div>}
                  {validation && (
                    <>
                      <div className="mva-validation-head">
                        <span>Engine {validation.engineTradeCount}</span>
                        <span>CSV {validation.csvTradeCount}</span>
                        <span>{validation.parityStatus}</span>
                      </div>
                      {validation.firstMismatch && (
                        <div className="mva-mismatch">
                          First mismatch #{validation.firstMismatch.tradeIndex} · {validation.firstMismatch.field} · {validation.firstMismatch.likelyCause}
                        </div>
                      )}
                      <div className="mva-metric-list">
                        {validation.metrics.map((metric) => (
                          <div key={metric.name} className={`mva-metric-item ${metric.passed ? "pass" : "fail"}`}>
                            <span>{metric.name}</span>
                            <strong>{metric.engineValue ?? "-"} / {metric.csvValue ?? "-"}</strong>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {mode === "walk_forward" && (
                <div className="mva-card">
                  <div className="mva-card-title">Walk Forward</div>
                  {!walkForward && <div className="mva-muted">Noch kein WF-Resultat.</div>}
                  {walkForward && (
                    <>
                      <div className="mva-live-grid">
                        <div><span>Robustness</span><strong>{walkForward.robustnessStatus}</strong></div>
                        <div><span>OOS Trades</span><strong>{walkForward.oosAggregate.trades}</strong></div>
                        <div><span>OOS Return</span><strong>{formatPct(walkForward.oosAggregate.netReturn)}</strong></div>
                        <div><span>OOS PF</span><strong>{formatNumber(walkForward.oosAggregate.profitFactor)}</strong></div>
                        <div><span>OOS MaxDD</span><strong>{formatPct(-Math.abs(walkForward.oosAggregate.maxDrawdown))}</strong></div>
                        <div><span>OOS Calmar</span><strong>{formatNumber(walkForward.oosAggregate.calmar)}</strong></div>
                      </div>
                      <div className="mva-folds">
                        {walkForward.folds.map((fold, index) => (
                          <div key={`${fold.trainStart}_${fold.oosStart}`} className="mva-fold">
                            <strong>Fold {index + 1}</strong>
                            <span>{fold.trainStart.slice(0, 10)} → {fold.trainEnd.slice(0, 10)}</span>
                            <span>{fold.oosStart.slice(0, 10)} → {fold.oosEnd.slice(0, 10)}</span>
                            <span>OOS {formatPct(Number(fold.oosMetrics.netReturnPct ?? 0))}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {result.trades?.length > 0 && mode !== "walk_forward" && (
                <div className="mva-card">
                  <div className="mva-card-title">Trades</div>
                  <div className="mva-trades">
                    {result.trades.slice(-18).map((trade) => (
                      <div key={`${trade.tradeNo}_${trade.entryDate}`} className={`mva-trade ${trade.returnPct >= 0 ? "win" : "loss"}`}>
                        <span>#{trade.tradeNo}</span>
                        <span>{trade.direction}</span>
                        <span>{trade.entryDate.slice(0, 10)}</span>
                        <span>{trade.exitDate.slice(0, 10)}</span>
                        <strong>{formatPct(trade.returnPct)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.warnings && result.warnings.length > 0 && (
                <div className="mva-card">
                  <div className="mva-card-title">Warnings</div>
                  <div className="mva-warning-list">
                    {result.warnings.slice(0, 6).map((warning) => <div key={warning}>{warning}</div>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="mva-inputs">
          <div className="mva-inputs-head">
            <div>
              <div className="mva-card-title">Strategy Inputs</div>
              <div className="mva-muted">{inputSet?.metadata.tradingViewSymbol ?? symbol ?? "-"} · {inputSet?.metadata.timeframe ?? "D"}</div>
            </div>
            <button type="button" className="mva-run" onClick={handleRun} disabled={!symbol || runState.phase === "running"}>
              {runState.phase === "running" ? <><Loader2 size={12} className="spin" /> Läuft…</> : MODE_LABELS[mode]}
            </button>
          </div>

          {inputsState.phase === "loading" && <div className="mva-placeholder"><Loader2 size={14} className="spin" /> Inputs laden…</div>}
          {inputsState.phase === "error" && <div className="mva-error">{inputsState.message}</div>}
          {inputsState.phase === "loaded" && (
            <>
              <div className="mva-chip-row">
                <StatusChip tone="base">{inputsState.inputAvailability}</StatusChip>
                {dirtyKeys.size > 0 && <StatusChip tone="warn">Custom Engine Run</StatusChip>}
              </div>
              <div className="mva-input-groups">
                {groupedInputs.map(([group, inputs]) => (
                  <div key={group} className="mva-input-group">
                    <div className="mva-group-title">{group}</div>
                    {inputs.map((input) => (
                      <InputControl
                        key={input.key}
                        input={input}
                        value={valueMap[input.key]}
                        dirty={dirtyKeys.has(input.key)}
                        onChange={(key, value) => setEditedValues((prev) => ({ ...prev, [key]: value }))}
                        onReset={(key) => setEditedValues((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        })}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>

      <style jsx>{`
        .mva-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #0c0e12;
          color: #d7dce3;
        }
        .mva-header,
        .mva-toolbar,
        .mva-inputs-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .mva-header {
          padding: 12px 14px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .mva-title {
          font-size: 13px;
          font-weight: 700;
          color: #f0f3f7;
        }
        .mva-subtitle {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
          font-size: 11px;
          color: #8d96a2;
        }
        .mva-symbol {
          padding: 2px 6px;
          border-radius: 999px;
          background: rgba(214, 176, 74, 0.12);
          color: #d6b04a;
          font-weight: 700;
        }
        .mva-close,
        .mva-refresh,
        .mva-mode,
        .mva-run,
        .mva-reset-field,
        .mva-bool {
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: inherit;
          cursor: pointer;
        }
        .mva-close {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: grid;
          place-items: center;
        }
        .mva-toolbar {
          padding: 10px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .mva-mode-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .mva-mode,
        .mva-refresh,
        .mva-run {
          padding: 7px 10px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
        }
        .mva-mode.active,
        .mva-run,
        .mva-refresh.done {
          border-color: rgba(214, 176, 74, 0.35);
          background: rgba(214, 176, 74, 0.14);
          color: #f1d27a;
        }
        .mva-refresh.error {
          border-color: rgba(255,107,107,0.35);
          color: #ff9a9a;
        }
        .mva-layout {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.95fr);
        }
        .mva-results,
        .mva-inputs {
          min-height: 0;
          overflow: auto;
          padding: 14px;
        }
        .mva-results {
          border-right: 1px solid rgba(255,255,255,0.06);
        }
        .mva-result-stack,
        .mva-input-group,
        .mva-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .mva-result-stack {
          gap: 12px;
        }
        .mva-card {
          padding: 12px;
          border-radius: 12px;
          background: #11151c;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .mva-card-title,
        .mva-group-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #aeb6c2;
        }
        .mva-group-title {
          margin-bottom: 2px;
        }
        .mva-chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .mva-chip {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
        }
        .mva-chip--base { background: rgba(255,255,255,0.06); color: #c7ced8; }
        .mva-chip--pass { background: rgba(34,197,94,0.14); color: #86efac; }
        .mva-chip--warn { background: rgba(214,176,74,0.14); color: #f1d27a; }
        .mva-chip--fail { background: rgba(255,107,107,0.14); color: #ff9a9a; }
        .mva-kpis,
        .mva-live-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .mva-kpis div,
        .mva-live-grid div {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 9px 10px;
          border-radius: 10px;
          background: rgba(255,255,255,0.04);
        }
        .mva-kpis span,
        .mva-live-grid span {
          font-size: 10px;
          color: #8d96a2;
        }
        .mva-kpis strong,
        .mva-live-grid strong {
          font-size: 12px;
          color: #f3f5f8;
        }
        .mva-validation-head,
        .mva-trade,
        .mva-metric-item,
        .mva-fold {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          font-size: 11px;
          align-items: center;
        }
        .mva-trade {
          grid-template-columns: 48px 54px 1fr 1fr 76px;
          padding: 8px 10px;
          border-radius: 8px;
          background: rgba(255,255,255,0.03);
        }
        .mva-trade.win { border-left: 2px solid rgba(34,197,94,0.55); }
        .mva-trade.loss { border-left: 2px solid rgba(255,107,107,0.55); }
        .mva-trades,
        .mva-folds,
        .mva-metric-list,
        .mva-warning-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .mva-metric-item.pass { color: #86efac; }
        .mva-metric-item.fail { color: #ff9a9a; }
        .mva-mismatch,
        .mva-muted {
          font-size: 11px;
          color: #8d96a2;
        }
        .mva-error,
        .mva-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 140px;
          font-size: 12px;
          color: #96a0ad;
        }
        .mva-error {
          color: #ff9a9a;
          justify-content: flex-start;
          min-height: 0;
          padding: 12px;
          border-radius: 10px;
          background: rgba(255,107,107,0.08);
        }
        .mva-inputs {
          background: #0f1319;
        }
        .mva-inputs-head {
          position: sticky;
          top: 0;
          z-index: 1;
          padding-bottom: 12px;
          margin-bottom: 12px;
          background: linear-gradient(180deg, #0f1319 0%, #0f1319 72%, rgba(15,19,25,0) 100%);
        }
        .mva-input-groups {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .mva-input-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(120px, 150px);
          gap: 8px;
          align-items: center;
        }
        .mva-input-row.is-dirty .mva-input-label {
          color: #f1d27a;
        }
        .mva-input-label {
          font-size: 11px;
          color: #c5ccd6;
        }
        .mva-input-control {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .mva-field,
        .mva-bool {
          width: 100%;
          border-radius: 8px;
          padding: 7px 9px;
          font-size: 11px;
          background: rgba(255,255,255,0.05);
          color: #f0f3f7;
        }
        .mva-bool {
          text-align: center;
        }
        .mva-bool.on {
          border-color: rgba(34,197,94,0.35);
          color: #86efac;
        }
        .mva-reset-field {
          width: 28px;
          height: 28px;
          border-radius: 8px;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 1180px) {
          .mva-layout {
            grid-template-columns: 1fr;
          }
          .mva-results {
            border-right: 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }
        }
      `}</style>
    </div>
  );
}
