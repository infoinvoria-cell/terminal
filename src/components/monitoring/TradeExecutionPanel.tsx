"use client";

import { useEffect, useMemo, useState } from "react";
import symbolSpecsConfig from "@/config/symbolSpecs.json";
import type { ActiveSetupFromEvents } from "@/lib/monitoring/tradeSetupFromEvents";
import type { NormalizedTradeVisualLevel } from "@/lib/monitoring/tradeVisualNormalizer";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import {
  EXECUTION_ACCOUNT_RISK_PROFILES,
  resolveExecutionAssetGroup,
} from "@/lib/monitoring/execution/accountRiskProfiles";
import { calculateAccountRiskForSignal } from "@/lib/monitoring/execution/calculateAccountRiskForSignal";
import type {
  ExecutionBrokerSpec,
  ManualTradeLevels,
  SymbolSpec,
  TradeExecutionTicket,
  TradeMode,
} from "@/lib/trading/types";

const STORAGE_BROKER_SPECS_KEY = "monitoring.tradeExecution.brokerSpecs.v1";

type BrokerSpecMap = Record<string, ExecutionBrokerSpec>;
type SignalViewMode = "current" | "historical";
type RiskTableRow = ReturnType<typeof calculateAccountRiskForSignal> & {
  profile: (typeof EXECUTION_ACCOUNT_RISK_PROFILES)[number];
};

type Props = {
  activeSymbol: string | null;
  activeName: string | null;
  activeStrategyId?: string | null;
  activeTimeframe?: string | null;
  parityStatus?: string;
  eventsSourceHint?: string | null;
  latestPrice: number | null;
  activeSignal: ActiveSetupFromEvents;
  mode: TradeMode;
  onModeChange: (mode: TradeMode) => void;
  manualLevels: ManualTradeLevels | null;
  onManualLevelsChange: (levels: ManualTradeLevels) => void;
  tradeCandidates?: NormalizedTradeVisualLevel[];
  selectedTradeId?: string | null;
  onSelectedTradeIdChange?: (tradeId: string | null) => void;
};

const symbolSpecs = symbolSpecsConfig as SymbolSpec[];

function toFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIso(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.includes("T")) return raw.endsWith("Z") ? raw : `${raw}Z`;
  return `${raw}T00:00:00Z`;
}

function formatNum(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("de-DE", { maximumFractionDigits: 4 });
}

function formatMoney(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "needs_config";
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultBrokerSpec(symbol: string | null, spec: SymbolSpec | null): ExecutionBrokerSpec {
  return {
    broker: "unset",
    routeSymbol: symbol || "",
    tickSize: null,
    tickValue: null,
    pointValue: spec?.pointValue ?? null,
    contractMultiplier: spec?.contractMultiplier ?? 1,
    minOrderSize: spec?.minLot ?? 1,
    orderStep: spec?.lotStep ?? 1,
    maxOrderSize: spec?.maxLot ?? null,
    currency: "USD",
    marginEstimate: null,
    commissionEstimate: null,
    slippageEstimate: null,
  };
}

function normalizeSymbolKey(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}


function iconEmojiFallback(symbol: string | null): string {
  const code = normalizeSymbolKey(symbol);
  if (["ZW1", "ZW1!", "ZC1", "ZC1!", "CC1", "CC1!", "OJ1", "OJ1!"].includes(code)) return "🌾";
  if (["GC1", "GC1!", "SI1", "SI1!", "PA1", "PA1!", "PL1", "PL1!", "CL1", "CL1!"].includes(code)) return "🛢️";
  if (["ES1", "ES1!", "FDAX1", "FDAX1!", "YM1", "YM1!"].includes(code)) return "📈";
  if (["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"].includes(code)) return "🏢";
  if (["EURUSD", "GBPUSD", "DE30EUR"].includes(code)) return "⚡";
  return "📊";
}

export default function TradeExecutionPanel({
  activeSymbol,
  activeName,
  activeStrategyId = null,
  activeTimeframe = null,
  parityStatus: _parityStatus = "unknown",
  eventsSourceHint: _eventsSourceHint,
  latestPrice,
  activeSignal,
  mode,
  onModeChange,
  manualLevels: _manualLevels,
  onManualLevelsChange: _onManualLevelsChange,
  tradeCandidates = [],
  selectedTradeId,
  onSelectedTradeIdChange,
}: Props) {
  const [brokerSpecsBySymbol, setBrokerSpecsBySymbol] = useState<BrokerSpecMap>({});
  const [viewMode, setViewMode] = useState<SignalViewMode>("current");
  const [focusedTradeId, setFocusedTradeId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const spec = useMemo(() => {
    if (!activeSymbol) return null;
    return symbolSpecs.find((row) => row.symbol === activeSymbol) ?? null;
  }, [activeSymbol]);

  useEffect(() => {
    if (mode !== "signal") {
      onModeChange("signal");
    }
  }, [mode, onModeChange]);

  useEffect(() => {
    try {
      const storedSpecs = window.localStorage.getItem(STORAGE_BROKER_SPECS_KEY);
      if (storedSpecs) {
        setBrokerSpecsBySymbol(JSON.parse(storedSpecs) as BrokerSpecMap);
      }
    } catch {
      // Ignore malformed storage.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_BROKER_SPECS_KEY, JSON.stringify(brokerSpecsBySymbol));
  }, [brokerSpecsBySymbol]);

  useEffect(() => {
    if (!activeSymbol) return;
    setBrokerSpecsBySymbol((prev) => {
      if (prev[activeSymbol]) return prev;
      return { ...prev, [activeSymbol]: defaultBrokerSpec(activeSymbol, spec) };
    });
  }, [activeSymbol, spec]);

  const brokerSpec = useMemo<ExecutionBrokerSpec>(() => {
    if (!activeSymbol) return defaultBrokerSpec(null, null);
    return brokerSpecsBySymbol[activeSymbol] ?? defaultBrokerSpec(activeSymbol, spec);
  }, [activeSymbol, brokerSpecsBySymbol, spec]);

  const sortedCandidates = useMemo(() => {
    const rows = Array.isArray(tradeCandidates) ? [...tradeCandidates] : [];
    rows.sort((left, right) => {
      const leftMs = new Date(toIso(left.entryTime) || 0).getTime();
      const rightMs = new Date(toIso(right.entryTime) || 0).getTime();
      return rightMs - leftMs;
    });
    return rows;
  }, [tradeCandidates]);

  const openCandidate = useMemo(
    () => sortedCandidates.find((row) => row.isOpen) ?? null,
    [sortedCandidates],
  );
  const historicalCandidate = useMemo(
    () => sortedCandidates.find((row) => !row.isOpen) ?? null,
    [sortedCandidates],
  );
  const latestCandidate = sortedCandidates[0] ?? null;

  const candidateToTicket = (candidate: NormalizedTradeVisualLevel): TradeExecutionTicket => ({
    tradeId: candidate.tradeId,
    strategyId: activeStrategyId,
    asset: activeName || activeSymbol || "",
    symbol: activeSymbol || "",
    timeframe: activeTimeframe,
    direction: candidate.direction,
    entryTime: toIso(candidate.entryTime),
    entryPrice: candidate.entryPrice,
    exitTime: toIso(candidate.exitTime),
    exitPrice: candidate.exitPrice,
    stopLossPrice: candidate.stopLossPrice,
    takeProfitPrice: candidate.takeProfitPrice,
    source: candidate.levelSource.stopLoss !== "level_missing_in_all_sources"
      ? candidate.levelSource.stopLoss
      : candidate.levelSource.takeProfit !== "level_missing_in_all_sources"
        ? candidate.levelSource.takeProfit
        : candidate.levelSource.entry,
    isOpen: candidate.isOpen,
  });

  const liveSignalTicket = useMemo<TradeExecutionTicket | null>(() => {
    if (!activeSymbol || !activeSignal.direction) return null;
    return {
      tradeId: `${activeSymbol}:active_signal`,
      strategyId: activeStrategyId,
      asset: activeName || activeSymbol,
      symbol: activeSymbol,
      timeframe: activeTimeframe,
      direction: activeSignal.direction,
      entryTime: new Date().toISOString(),
      entryPrice: activeSignal.entry ?? latestPrice,
      exitTime: null,
      exitPrice: null,
      stopLossPrice: activeSignal.stopLoss,
      takeProfitPrice: activeSignal.takeProfit,
      source: "active_signal",
      isOpen: true,
    };
  }, [
    activeName,
    activeSignal.direction,
    activeSignal.entry,
    activeSignal.stopLoss,
    activeSignal.takeProfit,
    activeStrategyId,
    activeSymbol,
    activeTimeframe,
    latestPrice,
  ]);

  const currentTicket = useMemo<TradeExecutionTicket | null>(() => {
    if (focusedTradeId) {
      const focused = sortedCandidates.find((row) => row.tradeId === focusedTradeId);
      if (focused) return candidateToTicket(focused);
    }
    if (openCandidate) return candidateToTicket(openCandidate);
    if (liveSignalTicket) return liveSignalTicket;
    if (latestCandidate) return candidateToTicket(latestCandidate);
    return null;
  }, [focusedTradeId, latestCandidate, liveSignalTicket, openCandidate, sortedCandidates]);

  const historicalTicket = useMemo<TradeExecutionTicket | null>(
    () => (historicalCandidate ? candidateToTicket(historicalCandidate) : null),
    [historicalCandidate],
  );

  useEffect(() => {
    if (viewMode === "historical" && !historicalTicket) {
      setViewMode("current");
    }
  }, [historicalTicket, viewMode]);

  useEffect(() => {
    setFocusedTradeId(null);
  }, [activeSymbol]);

  useEffect(() => {
    if (!selectedTradeId) return;
    setFocusedTradeId(selectedTradeId);
    const match = sortedCandidates.find((row) => row.tradeId === selectedTradeId);
    if (match) {
      setViewMode(match.isOpen ? "current" : "historical");
    }
  }, [selectedTradeId, sortedCandidates]);

  const ticket = viewMode === "historical" && historicalTicket ? historicalTicket : currentTicket;
  const tradeStatusLabel = !ticket
    ? "No active Signal"
    : !ticket.isOpen
      ? "Historical Signal"
      : ticket.source === "active_signal"
        ? "Live Signal"
        : "Open Trade";

  const stopDistance = useMemo(() => {
    if (!ticket) return null;
    if (ticket.entryPrice == null || ticket.stopLossPrice == null) return null;
    return Math.abs(ticket.entryPrice - ticket.stopLossPrice);
  }, [ticket]);

  const takeProfitDistance = useMemo(() => {
    if (!ticket) return null;
    if (ticket.entryPrice == null || ticket.takeProfitPrice == null) return null;
    return Math.abs(ticket.takeProfitPrice - ticket.entryPrice);
  }, [ticket]);

  const rr = useMemo(() => {
    if (stopDistance == null || takeProfitDistance == null || stopDistance <= 0) return null;
    return takeProfitDistance / stopDistance;
  }, [stopDistance, takeProfitDistance]);

  const assetGroup = useMemo(
    () => resolveExecutionAssetGroup({
      symbol: activeSymbol,
      name: activeName,
      strategyId: activeStrategyId,
      timeframe: activeTimeframe,
    }),
    [activeName, activeStrategyId, activeSymbol, activeTimeframe],
  );

  const riskRows = useMemo<RiskTableRow[]>(() => {
    if (!ticket || !activeSymbol) {
      return EXECUTION_ACCOUNT_RISK_PROFILES.map((profile) => ({
        profile,
        riskUsd: null,
        effectiveRiskPercent: null,
        priceRisk: null,
        priceReward: null,
        rr: null,
        positionSize: null,
        totalRiskUsd: null,
        potentialProfitUsd: null,
        status: "Daten fehlen",
        missingFields: ["signal"],
        groupWeighting: null,
      }));
    }

    return EXECUTION_ACCOUNT_RISK_PROFILES.map((profile) => {
      const result = calculateAccountRiskForSignal({
        signal: {
          symbol: activeSymbol,
          direction: ticket.direction,
          entryPrice: ticket.entryPrice,
          stopLossPrice: ticket.stopLossPrice,
          takeProfitPrice: ticket.takeProfitPrice,
          group: assetGroup,
        },
        accountProfile: profile,
        brokerSpec,
      });
      return { profile, ...result };
    });
  }, [activeSymbol, assetGroup, brokerSpec, ticket]);

  const primaryRiskRow = useMemo(
    () =>
      riskRows.find((row) => row.status === "OK")
      ?? riskRows.find((row) => row.riskUsd != null)
      ?? riskRows[0]
      ?? null,
    [riskRows],
  );

  const hasEntry = ticket?.entryPrice != null;
  const hasStop = ticket?.stopLossPrice != null;
  const hasTakeProfit = ticket?.takeProfitPrice != null;

  const iconUrl = getMonitoringAssetIconUrl({
    code: activeSymbol,
    displaySymbol: activeSymbol,
    name: activeName,
    source: activeSymbol,
  });

  function updateBrokerSpec<K extends keyof ExecutionBrokerSpec>(key: K, value: ExecutionBrokerSpec[K]) {
    if (!activeSymbol) return;
    setBrokerSpecsBySymbol((prev) => ({
      ...prev,
      [activeSymbol]: {
        ...defaultBrokerSpec(activeSymbol, spec),
        ...(prev[activeSymbol] ?? {}),
        [key]: value,
      },
    }));
  }

  async function writeLog(modeToWrite: "paper" | "manual", status: string): Promise<boolean> {
    if (!ticket) return false;
    setIsSaving(true);
    try {
      const response = await fetch("/api/monitoring/trade-execution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: modeToWrite,
          asset: ticket.symbol,
          strategyId: ticket.strategyId,
          direction: ticket.direction,
          entry: ticket.entryPrice,
          stopLoss: ticket.stopLossPrice,
          takeProfit: ticket.takeProfitPrice,
          riskUsd: primaryRiskRow?.totalRiskUsd ?? primaryRiskRow?.riskUsd ?? null,
          quantity: primaryRiskRow?.positionSize ?? null,
          brokerSpec,
          status,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setActionMessage(payload.error || "Log fehlgeschlagen");
        return false;
      }
      const payload = (await response.json()) as { path?: string };
      setActionMessage(`Geloggt: ${payload.path ?? "trade_execution"}`);
      return true;
    } catch {
      setActionMessage("Log fehlgeschlagen");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePaperCreate() {
    if (!ticket || !hasEntry || !hasStop || !hasTakeProfit) {
      setActionMessage("Signal unvollständig");
      return;
    }
    await writeLog("paper", "paper_created");
  }

  async function handleManualMark() {
    if (!ticket || !hasEntry) {
      setActionMessage("Signal unvollständig");
      return;
    }
    await writeLog("manual", "manual_marked_executed");
  }

  async function handleManualCopy() {
    if (!ticket) {
      setActionMessage("Kein Signal ausgewählt");
      return;
    }

    const text = [
      `${ticket.symbol} · ${activeName ?? ticket.symbol}`,
      `Strategie: ${ticket.strategyId ?? "-"}`,
      `Status: ${tradeStatusLabel}`,
      `Richtung: ${ticket.direction.toUpperCase()}`,
      `Entry: ${formatNum(ticket.entryPrice)}`,
      `Stop Loss: ${formatNum(ticket.stopLossPrice)}`,
      `Take Profit: ${formatNum(ticket.takeProfitPrice)}`,
      `Entry→SL: ${formatNum(stopDistance)}`,
      `Entry→TP: ${formatNum(takeProfitDistance)}`,
      `RR: ${formatNum(rr)}`,
      primaryRiskRow ? `Risk ($): ${formatMoney(primaryRiskRow.riskUsd)}` : "Risk ($): -",
      primaryRiskRow ? `Größe: ${formatNum(primaryRiskRow.positionSize)}` : "Größe: -",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setActionMessage("Manual Ticket kopiert");
    } catch {
      setActionMessage("Kopieren fehlgeschlagen");
    }
    await writeLog("manual", "manual_ticket_copied");
  }

  if (!activeSymbol) {
    return (
      <aside className="execution-panel">
        <div className="exec-empty">Kein Chart aktiv. Wähle zuerst ein Asset oder ein Signal.</div>
      </aside>
    );
  }

  return (
    <aside className="execution-panel">
      <div className="exec-header exec-header-clean">
        <div className="exec-header-main">
          <div className="exec-icon-wrap">
            {iconUrl ? (
              <img className="exec-icon" src={iconUrl} alt={activeName ?? activeSymbol} />
            ) : (
              <span className="exec-icon-fallback">{iconEmojiFallback(activeSymbol)}</span>
            )}
          </div>
          <div className="exec-symbol-stack">
            <div className="exec-symbol">{activeSymbol}</div>
            <div className="exec-name">{activeName ?? "-"}</div>
            <div className="exec-name">{activeStrategyId ?? "-"}</div>
          </div>
          <div className="exec-price-panel">
            <div className="exec-price-label">Aktueller Preis</div>
            <div className="exec-price">{formatNum(latestPrice)}</div>
          </div>
        </div>
      </div>

      {(currentTicket && historicalTicket) ? (
        <div className="exec-block">
          <div className="exec-block-title">Signal-Ansicht</div>
          <div className="exec-toggle exec-toggle-compact">
            <button
              type="button"
              className={`exec-toggle-btn ${viewMode === "current" ? "active" : ""}`}
              onClick={() => setViewMode("current")}
            >
              Aktuelles Signal
            </button>
            <button
              type="button"
              className={`exec-toggle-btn ${viewMode === "historical" ? "active" : ""}`}
              onClick={() => setViewMode("historical")}
            >
              Ausgewähltes historisches Signal
            </button>
          </div>
        </div>
      ) : null}

      {!ticket ? (
        <div className="exec-block">
          <div className="exec-empty">Kein Signal ausgewählt. Klicke im Chart auf ein Signal.</div>
        </div>
      ) : (
        <div className="exec-block">
          <div className="exec-block-title">Signal-Karte</div>
          <div className="exec-risk-grid exec-signal-card-grid">
            <div><span>Status</span><b>{tradeStatusLabel}</b></div>
            <div><span>Richtung</span><b className={ticket.direction === "long" ? "exec-direction-long" : "exec-direction-short"}>{ticket.direction.toUpperCase()}</b></div>
            <div><span>Entry</span><b>{formatNum(ticket.entryPrice)}</b></div>
            <div className={!hasTakeProfit ? "exec-field-missing" : ""}><span>Take Profit</span><b>{formatNum(ticket.takeProfitPrice)}</b></div>
            <div className={!hasStop ? "exec-field-missing" : ""}><span>Stop Loss</span><b>{formatNum(ticket.stopLossPrice)}</b></div>
            <div><span>Entry → TP</span><b>{formatNum(takeProfitDistance)}</b></div>
            <div><span>Entry → SL</span><b>{formatNum(stopDistance)}</b></div>
            <div><span>CRV / RR</span><b>{formatNum(rr)}</b></div>
            <div><span>Signal-Zeitpunkt</span><b>{formatDateTime(ticket.entryTime)}</b></div>
            <div><span>Gruppe</span><b>{assetGroup ?? "needs_config"}</b></div>
          </div>
        </div>
      )}

      <div className="exec-block">
        <div className="exec-block-title">Account Risk</div>
        <div className="exec-risk-table-wrap">
          <table className="exec-risk-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Gewichtung</th>
                <th>Risiko %</th>
                <th>Risiko $</th>
                <th>Größe</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {riskRows.map((row) => {
                const multiplierLabel = row.profile.riskMultiplier != null
                  ? `x${row.profile.riskMultiplier.toLocaleString("de-DE", { maximumFractionDigits: 2 })}`
                  : "needs_config";
                const groupLabel = row.groupWeighting != null
                  ? ` · G:${row.groupWeighting.toLocaleString("de-DE", { maximumFractionDigits: 2 })}`
                  : " · G:needs_config";
                const riskStatusClass = row.status === "OK"
                  ? "ok"
                  : row.status === "Broker Specs fehlen"
                    ? "warn"
                    : "block";

                return (
                  <tr key={row.profile.id}>
                    <td>
                      <div className="exec-risk-account">{row.profile.name}</div>
                      <div className="exec-risk-sub">{row.profile.accountSizeUsd != null ? formatMoney(row.profile.accountSizeUsd) : "needs_config"}</div>
                    </td>
                    <td>{multiplierLabel}{groupLabel}</td>
                    <td>{formatPct(row.effectiveRiskPercent)}</td>
                    <td>{formatMoney(row.riskUsd)}</td>
                    <td>{formatNum(row.positionSize)}</td>
                    <td><span className={`exec-inline-status ${riskStatusClass}`}>{row.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <details className="exec-block exec-broker-details">
        <summary className="exec-block-title exec-summary">Erweiterte Brokerdaten</summary>
        <div className="exec-grid">
          <label>Broker<input value={brokerSpec.broker} onChange={(e) => updateBrokerSpec("broker", e.target.value)} /></label>
          <label>Route Symbol<input value={brokerSpec.routeSymbol} onChange={(e) => updateBrokerSpec("routeSymbol", e.target.value)} /></label>
          <label>tickSize<input inputMode="decimal" value={brokerSpec.tickSize ?? ""} onChange={(e) => updateBrokerSpec("tickSize", toFinite(e.target.value))} /></label>
          <label>tickValue<input inputMode="decimal" value={brokerSpec.tickValue ?? ""} onChange={(e) => updateBrokerSpec("tickValue", toFinite(e.target.value))} /></label>
          <label>pointValue<input inputMode="decimal" value={brokerSpec.pointValue ?? ""} onChange={(e) => updateBrokerSpec("pointValue", toFinite(e.target.value))} /></label>
          <label>contractMultiplier<input inputMode="decimal" value={brokerSpec.contractMultiplier ?? ""} onChange={(e) => updateBrokerSpec("contractMultiplier", toFinite(e.target.value))} /></label>
          <label>minOrderSize<input inputMode="decimal" value={brokerSpec.minOrderSize ?? ""} onChange={(e) => updateBrokerSpec("minOrderSize", toFinite(e.target.value))} /></label>
          <label>orderStep<input inputMode="decimal" value={brokerSpec.orderStep ?? ""} onChange={(e) => updateBrokerSpec("orderStep", toFinite(e.target.value))} /></label>
          <label>maxOrderSize<input inputMode="decimal" value={brokerSpec.maxOrderSize ?? ""} onChange={(e) => updateBrokerSpec("maxOrderSize", toFinite(e.target.value))} /></label>
          <label>Currency<input value={brokerSpec.currency} onChange={(e) => updateBrokerSpec("currency", e.target.value)} /></label>
          <label>Commission est.<input inputMode="decimal" value={brokerSpec.commissionEstimate ?? ""} onChange={(e) => updateBrokerSpec("commissionEstimate", toFinite(e.target.value))} /></label>
          <label>Slippage est.<input inputMode="decimal" value={brokerSpec.slippageEstimate ?? ""} onChange={(e) => updateBrokerSpec("slippageEstimate", toFinite(e.target.value))} /></label>
          <label>Margin est.<input inputMode="decimal" value={brokerSpec.marginEstimate ?? ""} onChange={(e) => updateBrokerSpec("marginEstimate", toFinite(e.target.value))} /></label>
        </div>
      </details>

      <div className="exec-block">
        <div className="exec-actions exec-actions-4">
          <button type="button" onClick={handlePaperCreate} disabled={isSaving || !ticket}>Paper Trade</button>
          <button type="button" onClick={handleManualCopy} disabled={isSaving || !ticket}>Manual Ticket kopieren</button>
          <button type="button" onClick={handleManualMark} disabled={isSaving || !ticket}>Als manuell ausgeführt markieren</button>
        </div>
        {actionMessage ? <div className="exec-muted">{actionMessage}</div> : null}
      </div>
    </aside>
  );
}
