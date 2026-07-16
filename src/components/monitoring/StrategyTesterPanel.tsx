"use client";

import { useMemo, useState } from "react";
import StrategyTesterKpiGrid from "@/components/monitoring/StrategyTesterKpiGrid";
import StrategyTesterTradeTable from "@/components/monitoring/StrategyTesterTradeTable";
import type { StrategyPerformanceResult } from "@/lib/monitoring/types";

type Props = {
  symbol: string | null;
  assetName: string | null;
  strategyName: string | null;
  hasStrategy: boolean;
  loading: boolean;
  performance: StrategyPerformanceResult | null;
  useCompounding?: boolean;
  onToggleCompounding?: () => void;
  layoutMode?: "full" | "sidebar";
  parityPercent?: number | null;
  parityBadge?: string | null;
  dataMode?: "engine" | "csv_reference";
  onDataModeChange?: (mode: "engine" | "csv_reference") => void;
  timeRangeFrom?: string | null;
  onSetTimeRange?: (from: string | null) => void;
  eventsSource?: string | null;
  engineSourceStatus?: "real_engine_output" | "missing" | "blocked" | null;
  engineStatusMessage?: string | null;
  engineSourceLabel?: string | null;
  engineTradeCount?: number | null;
  engineFirstTradeDate?: string | null;
  engineOpenTrade?: boolean | null;
  currentSignalLabel?: string | null;
  currentSignalStatus?: string | null;
  historicalParityScore?: number | null;
};

type Tone = "positive" | "negative" | "neutral";
type ViewMode = "backtest" | "live" | "validation" | "parity";

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: "backtest", label: "Backtest Charts" },
  { value: "live",     label: "Live" },
  { value: "validation", label: "Validation" },
  { value: "parity",  label: "CSV Parity" },
];

const TIME_QUICK: Array<{ label: string; from: string | null }> = [
  { label: "Full", from: null },
  { label: "2000", from: "2000-01-01" },
  { label: "2010", from: "2010-01-01" },
  { label: "2015", from: "2015-01-01" },
  { label: "2020", from: "2020-01-01" },
  { label: "YTD",  from: "2026-01-01" },
];

function fmtPct(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function fmtRatio(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(digits);
}

function fmtCount(value: number): string {
  return String(Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

function metricTone(value: number): Tone {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function parityStatusLabel(
  badge: string | null | undefined,
  pct: number | null | undefined,
  dataMode: "engine" | "csv_reference",
): { text: string; cls: string; tooltip?: string } {
  if (badge === "CSV_REFERENCE") {
    return {
      text: "CSV REF",
      cls: "parity-info",
      tooltip: "Trades stammen direkt aus TradingView CSV. Python-Engine noch nicht implementiert.",
    };
  }
  if (badge === "HYBRID_ENGINE_PASS") {
    return {
      text: `HYBRID ${pct != null ? pct.toFixed(1) + "%" : ""}`.trim(),
      cls: "parity-hybrid",
      tooltip: `Hybrid: CSV 2006–2024 + Python Engine 2024+. Engine Parity: ${pct != null ? pct.toFixed(1) + "%" : "n/a"}.`,
    };
  }
  if (badge === "HYBRID_ENGINE_WARN") {
    return {
      text: `HYBRID ${pct != null ? pct.toFixed(1) + "%" : ""}`.trim(),
      cls: "parity-warn",
      tooltip: `Hybrid-Modus mit Warnungen. Engine Parity: ${pct != null ? pct.toFixed(1) + "%" : "n/a"}.`,
    };
  }
  if (badge === "HYBRID_ENGINE") {
    return {
      text: "HYBRID",
      cls: "parity-hybrid",
      tooltip: "Hybrid: CSV-Historie + Python Engine für aktuellen Zeitraum.",
    };
  }
  if (dataMode === "csv_reference") {
    return { text: "CSV 100%", cls: "parity-pass" };
  }
  if (pct !== null && pct !== undefined) {
    const cls = pct >= 95 ? "parity-pass" : pct >= 80 ? "parity-warn" : "parity-fail";
    return { text: `CSV ${pct.toFixed(1)}%`, cls };
  }
  if (badge === "LIVE_PASS")      return { text: "CSV LIVE", cls: "parity-pass" };
  if (badge === "RECENT_PASS")    return { text: "CSV PASS", cls: "parity-pass" };
  if (badge === "OVERLAP_PASS")   return { text: "CSV PASS", cls: "parity-pass" };
  if (badge === "OVERLAP_WARN")   return { text: "CSV WARN", cls: "parity-warn" };
  if (badge === "OVERLAP_FAIL")   return { text: "CSV FAIL", cls: "parity-fail" };
  if (badge === "NOT_COMPARABLE") return { text: "CSV N/A",  cls: "parity-muted" };
  if (badge === "PARITY_WARN")    return { text: "CSV WARN", cls: "parity-warn" };
  if (badge === "PARITY_FAIL")    return { text: "CSV FAIL", cls: "parity-fail" };
  return { text: "CSV —", cls: "parity-muted" };
}

export default function StrategyTesterPanel({
  symbol,
  assetName,
  strategyName,
  hasStrategy,
  loading,
  performance,
  useCompounding = false,
  onToggleCompounding = () => undefined,
  layoutMode = "full",
  parityPercent,
  parityBadge,
  dataMode = "engine",
  onDataModeChange,
  timeRangeFrom,
  onSetTimeRange,
  eventsSource,
  engineSourceStatus = null,
  engineStatusMessage = null,
  engineSourceLabel = null,
  engineTradeCount = null,
  engineFirstTradeDate = null,
  engineOpenTrade = null,
  currentSignalLabel = null,
  currentSignalStatus = null,
  historicalParityScore = null,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("backtest");
  const isCsvImport = eventsSource === "csv_import";
  const isHybrid = eventsSource === "hybrid_csv_engine";
  const s = performance?.summary;

  const kpis = useMemo<Array<{ label: string; value: string; tone: Tone; sub?: string }>>(() => {
    if (!s) return [];
    return [
      { label: "Total Return", value: fmtPct(s.totalReturnPercent), tone: metricTone(s.totalReturnPercent) },
      { label: "CAGR", value: fmtPct(s.cagr), tone: metricTone(s.cagr) },
      { label: "Winrate", value: `${s.winRatePercent.toFixed(1)}%`, tone: s.winRatePercent >= 50 ? "positive" : "negative" },
      { label: "Max DD", value: fmtPct(-s.maxDrawdownPercent), tone: s.maxDrawdownPercent > 0 ? "negative" : "neutral" },
      { label: "Profit Factor", value: fmtRatio(s.profitFactor), tone: s.profitFactor >= 1.5 ? "positive" : s.profitFactor >= 1 ? "neutral" : "negative" },
      { label: "Calmar", value: fmtRatio(s.calmarRatio), tone: s.calmarRatio >= 0.5 ? "positive" : s.calmarRatio >= 0 ? "neutral" : "negative" },
      { label: "Sharpe", value: fmtRatio(s.sharpeRatio), tone: s.sharpeRatio >= 1 ? "positive" : s.sharpeRatio >= 0 ? "neutral" : "negative" },
      { label: "Trades", value: fmtCount(s.totalTrades), tone: "neutral" },
      { label: "Expectancy", value: `${fmtPct(s.expectancyPercent)} /Trade`, tone: metricTone(s.expectancyPercent) },
    ];
  }, [s]);

  const parity = parityStatusLabel(parityBadge, parityPercent ?? null, dataMode);
  const showOjEnginePilotStatus = dataMode === "engine" && Boolean(engineSourceStatus);
  const parityScoreLabel = Number.isFinite(Number(historicalParityScore))
    ? Number(historicalParityScore).toFixed(4)
    : "n/a";

  if (!symbol) return <div className="st-empty">Chart wählen</div>;

  const shortBadge = (symbol || "?").replace(/[!:. ]/g, "").slice(0, 3).toUpperCase();

  return (
    <aside className={`strategyTesterPanel ${layoutMode === "sidebar" ? "sidebar-mode" : ""}`}>
      {/* ── Single-row compact header ── */}
      <div className="st-header st-header-v2">
        <div className="st-hc-left">
          <div className="st-hc-badge">{shortBadge}</div>
          <span className="st-hc-name">{assetName || symbol}</span>
        </div>
        <div className="st-header-controls">
          {/* View mode dropdown */}
          <select
            className="st-mode-select"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
            title="Ansicht wählen"
          >
            {VIEW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {/* Data source (engine vs CSV) */}
          {onDataModeChange ? (
            <select
              className="st-mode-select st-src-select"
              value={dataMode}
              onChange={(e) => onDataModeChange(e.target.value as "engine" | "csv_reference")}
              title="Datenquelle"
            >
              <option value="engine">{isHybrid ? "Hybrid" : isCsvImport ? "Engine*" : "Engine"}</option>
              <option value="csv_reference">CSV</option>
            </select>
          ) : null}
          <span
            className={`st-parity-chip ${parity.cls}`}
            title={parity.tooltip ?? "CSV Match im vergleichbaren Zeitraum"}
          >
            {parity.text}
          </span>
          <button
            type="button"
            className={`st-comp-toggle ${useCompounding ? "active" : ""}`}
            onClick={onToggleCompounding}
            title={useCompounding ? "Compounding aktiv" : "Normal / Fixed Balance"}
          >
            {useCompounding ? "Comp" : "Fix"}
          </button>
        </div>
      </div>

      {/* ── Quick time range strip (backtest view only) ── */}
      {viewMode === "backtest" && onSetTimeRange ? (
        <div className="st-time-quick">
          {TIME_QUICK.map((r) => (
            <button
              key={r.label}
              type="button"
              className={`st-tq-btn ${timeRangeFrom === r.from ? "active" : ""}`}
              onClick={() => onSetTimeRange(r.from)}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* ── Engine pilot status note ── */}
      {showOjEnginePilotStatus ? (
        <div className="st-source-note" style={{ margin: "4px 0 2px 0" }}>
          {engineSourceLabel ?? "Local Engine"} · {engineSourceStatus ?? "missing"}
          {typeof engineTradeCount === "number" ? ` · ${engineTradeCount} trades` : ""}
          {engineFirstTradeDate ? ` · first: ${engineFirstTradeDate.slice(0, 10)}` : ""}
        </div>
      ) : null}

      {/* ── Source note (csv import / hybrid) ── */}
      {(isCsvImport || isHybrid) && viewMode === "backtest" ? (
        <div className={`st-source-note ${isHybrid ? "st-source-hybrid" : ""}`}>
          {isCsvImport ? "CSV Import · Engine pending" : "CSV 2006–2024 · Engine 2024+"}
        </div>
      ) : null}

      {/* ── Content area ── */}
      {viewMode === "live" ? (
        <div className="st-view-stub">
          <div className="st-stub-icon">📡</div>
          <div className="st-stub-label">Live Signals</div>
          <div className="st-stub-sub">
            {currentSignalLabel ? `Signal: ${currentSignalLabel}` : "Keine aktiven Signale"}
            {currentSignalStatus ? ` · ${currentSignalStatus}` : ""}
          </div>
        </div>
      ) : viewMode === "validation" ? (
        <div className="st-view-stub">
          <div className="st-stub-icon">✓</div>
          <div className="st-stub-label">Engine Validation</div>
          <div className="st-stub-sub">
            Status: {engineSourceStatus ?? "—"}<br />
            {engineStatusMessage ?? "Keine Engine-Meldung"}
          </div>
        </div>
      ) : viewMode === "parity" ? (
        <div className="st-view-stub">
          <div className="st-stub-icon">≈</div>
          <div className="st-stub-label">CSV Parity</div>
          <div className="st-stub-sub">
            {parity.text} · Score: {parityScoreLabel}
            {parity.tooltip ? <><br />{parity.tooltip}</> : null}
          </div>
        </div>
      ) : (
        // Default: backtest view
        <>
          {loading ? <div className="st-empty">Loading…</div> : null}
          {!loading && !performance ? (
            <div className="st-empty">
              {dataMode === "engine" && engineSourceStatus && engineSourceStatus !== "real_engine_output"
                ? (engineStatusMessage || "Local engine output not available / blocked")
                : "Keine Backtest-Daten"}
            </div>
          ) : null}
          {!loading && performance && s ? (
            <div className="st-scroll">
              <StrategyTesterKpiGrid
                items={kpis}
                longCount={s.longTrades}
                shortCount={s.shortTrades}
                winCount={performance.tradeStats.winningTrades}
                lossCount={performance.tradeStats.losingTrades}
              />
              <StrategyTesterTradeTable rows={performance.tradeList} />
            </div>
          ) : null}
        </>
      )}
      {/* Co-located tester styling. The shared global rules in MonitoringPage do not
          reliably reach this dynamically-imported child component in the production
          build, so the content styles (KPI cards, distribution, trade table) are
          declared here as well, matching the Agrar tester look. */}
      <style jsx global>{`
        .strategyTesterPanel .st-scroll {
          overflow-y: auto;
          overflow-x: hidden;
          height: 100%;
          padding: 10px;
          box-sizing: border-box;
        }
        .strategyTesterPanel .st-kpi-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .strategyTesterPanel .st-kpi-card,
        .strategyTesterPanel .st-dist-card {
          background: linear-gradient(160deg, #141618 0%, #0d0f11 100%);
          border: 1px solid rgba(255, 255, 255, 0.065);
          border-radius: 10px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.035);
        }
        .strategyTesterPanel .st-kpi-card {
          padding: 10px 11px 9px;
        }
        .strategyTesterPanel .st-kpi-label {
          font-size: 9px;
          font-weight: 600;
          color: #8b95a3;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .strategyTesterPanel .st-kpi-value {
          margin-top: 5px;
          font-size: 16px;
          font-weight: 700;
          color: #f5f7fa;
          line-height: 1;
        }
        .strategyTesterPanel .st-kpi-sub {
          margin-top: 3px;
          font-size: 8px;
          color: #6a7280;
        }
        .strategyTesterPanel .st-kpi-value.positive { color: #22c55e; }
        .strategyTesterPanel .st-kpi-value.negative { color: #ff3b30; }
        .strategyTesterPanel .st-kpi-value.neutral { color: #f5f7fa; }
        .strategyTesterPanel .st-dist-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          margin-top: 8px;
        }
        .strategyTesterPanel .st-dist-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 11px;
        }
        .strategyTesterPanel .st-dist-labels {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .strategyTesterPanel .st-dist-title {
          font-size: 8px;
          font-weight: 700;
          color: #8b95a3;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 2px;
        }
        .strategyTesterPanel .st-dist-stat {
          font-size: 10px;
          font-weight: 700;
          line-height: 1.2;
        }
        .strategyTesterPanel .st-trade-table-wrap {
          overflow: auto;
          margin-top: 10px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
        }
        .strategyTesterPanel .st-trade-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 100%;
          font-size: 10px;
          color: #d0d4db;
        }
        .strategyTesterPanel .st-trade-table thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #0a0c0f;
          color: #9aa3ad;
          text-align: left;
          font-weight: 700;
          padding: 6px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .strategyTesterPanel .st-trade-table tbody td {
          padding: 5px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          white-space: nowrap;
        }
        .strategyTesterPanel .st-empty-row {
          text-align: center;
          color: #7b8088;
          padding: 12px;
        }
        .strategyTesterPanel .st-empty {
          color: #7b8088;
          font-size: 11px;
          padding: 16px 12px;
          text-align: center;
        }
      `}</style>
    </aside>
  );
}
