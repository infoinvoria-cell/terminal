"use client";

import { useMemo, useState } from "react";
import { BarChart3, Calculator, Layers3, TrendingDown } from "lucide-react";
import { runMonteCarlo } from "@/lib/portfolio-simulator/monte-carlo";
import { runScenario } from "@/lib/portfolio-simulator/scenario-engine";
import type { PortfolioLabBootstrap, PortfolioMode, TimeRangeKey } from "@/lib/portfolio-simulator/types";

type Props = {
  bootstrap: PortfolioLabBootstrap;
};

const PAGE_BG = "#0c0d10";
const CARD_BG = "#15161a";
const BORDER = "1px solid rgba(255,255,255,0.06)";
const MUTED = "rgba(255,255,255,0.42)";
const SOFT = "rgba(255,255,255,0.72)";
const GOLD = "#C9A84C";

function fmtCurrency(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtPct(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function MetricCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: BORDER,
        borderRadius: 14,
        padding: "12px 13px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: MUTED,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.1,
          color: accent ? GOLD : "white",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function MobileManagerView({ bootstrap }: Props) {
  const [mode, setMode] = useState<PortfolioMode>(bootstrap.defaultScenario.mode);
  const [accountSize, setAccountSize] = useState<number>(bootstrap.defaultScenario.accountSize);
  const [whiteSwanPct, setWhiteSwanPct] = useState<number>(bootstrap.defaultScenario.whiteSwanPct);
  const [range, setRange] = useState<TimeRangeKey>(bootstrap.defaultScenario.range);

  const config = useMemo(() => {
    const ws = mode === "white-swan" ? 100 : mode === "core-invest" ? 0 : whiteSwanPct;
    return {
      mode,
      accountSize,
      currency: "USD" as const,
      whiteSwanPct: ws,
      coreInvestPct: 100 - ws,
      range,
    };
  }, [accountSize, mode, range, whiteSwanPct]);

  const scenario = useMemo(
    () => runScenario(config, bootstrap.whiteSwan, bootstrap.coreInvest),
    [bootstrap.coreInvest, bootstrap.whiteSwan, config],
  );

  const monteCarlo = useMemo(
    () => runMonteCarlo(scenario.returnSeriesPct, config.accountSize, 200, 1729, 3),
    [config.accountSize, scenario.returnSeriesPct],
  );

  const capitalRows = scenario.capitalRows;
  const executable = capitalRows.filter(
    (row) =>
      row.executionFeasibility === "EXECUTION_EXACT" ||
      row.executionFeasibility === "EXECUTION_APPROXIMATE",
  ).length;
  const pending = capitalRows.filter(
    (row) => row.executionFeasibility === "EXECUTION_DATA_PENDING",
  ).length;
  const notGranular = capitalRows.filter(
    (row) => row.executionFeasibility === "NOT_GRANULAR",
  ).length;

  return (
    <div
      style={{
        minHeight: "100%",
        padding: "18px 14px 28px",
        background: PAGE_BG,
        fontFamily: "var(--font-text)",
        color: "white",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Portfolio Lab
        </h1>
        <p
          style={{
            margin: "5px 0 0",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          Capital Scenario Engine
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          marginBottom: 12,
        }}
      >
        {[
          ["white-swan", "White Swan"],
          ["core-invest", "Core Invest"],
          ["combined", "Combined"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key as PortfolioMode)}
            style={{
              height: 36,
              borderRadius: 999,
              border: mode === key ? "1px solid rgba(201,168,76,0.4)" : BORDER,
              background: mode === key ? "rgba(201,168,76,0.16)" : CARD_BG,
              color: mode === key ? "white" : SOFT,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          background: CARD_BG,
          border: BORDER,
          borderRadius: 16,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calculator size={14} color={GOLD} />
            <span style={{ fontSize: 12, fontWeight: 700, color: SOFT }}>
              Account Size
            </span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtCurrency(accountSize)}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          {[10000, 20000, 50000, 100000].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAccountSize(value)}
              style={{
                height: 34,
                borderRadius: 12,
                border: accountSize === value ? "1px solid rgba(201,168,76,0.4)" : BORDER,
                background: accountSize === value ? "rgba(201,168,76,0.14)" : "#101115",
                color: accountSize === value ? "white" : SOFT,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {Math.round(value / 1000)}k
            </button>
          ))}
        </div>

        {mode === "combined" ? (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                fontSize: 11,
                fontWeight: 700,
                color: SOFT,
                marginBottom: 8,
              }}
            >
              <span>White Swan {whiteSwanPct}%</span>
              <span>Core Invest {100 - whiteSwanPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={whiteSwanPct}
              onChange={(event) => setWhiteSwanPct(Number(event.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
          {bootstrap.availableRanges.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setRange(entry)}
              style={{
                height: 32,
                borderRadius: 999,
                border: range === entry ? "1px solid rgba(255,255,255,0.14)" : BORDER,
                background: range === entry ? "rgba(255,255,255,0.08)" : "#101115",
                color: range === entry ? "white" : MUTED,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {entry}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          marginBottom: 14,
        }}
      >
        <MetricCard label="Ending Equity" value={fmtCurrency(scenario.metrics.endingEquity)} />
        <MetricCard label="Net Profit" value={fmtCurrency(scenario.metrics.netProfit)} accent />
        <MetricCard label="CAGR" value={fmtPct(scenario.metrics.cagr != null ? scenario.metrics.cagr * 100 : null)} />
        <MetricCard label="Max Drawdown" value={fmtPct(scenario.metrics.maxDrawdownPct)} />
        <MetricCard label="Sharpe" value={scenario.metrics.sharpe != null ? scenario.metrics.sharpe.toFixed(2) : "—"} />
        <MetricCard label="Calmar" value={scenario.metrics.calmar != null ? scenario.metrics.calmar.toFixed(2) : "—"} />
      </div>

      <div
        style={{
          background: CARD_BG,
          border: BORDER,
          borderRadius: 16,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Layers3 size={14} color={GOLD} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Sleeve Allocation</span>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: MUTED }}>White Swan Sleeve</span>
            <span>{fmtCurrency(scenario.whiteSwanSleeveCapital)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: MUTED }}>Core Invest Sleeve</span>
            <span>{fmtCurrency(scenario.coreInvestSleeveCapital)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: MUTED }}>Strategies Modelled</span>
            <span>{capitalRows.length}</span>
          </div>
        </div>
      </div>

      <div
        style={{
          background: CARD_BG,
          border: BORDER,
          borderRadius: 16,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <TrendingDown size={14} color={GOLD} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Capital Feasibility</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <MetricCard label="Executable" value={String(executable)} />
          <MetricCard label="Not Granular" value={String(notGranular)} />
          <MetricCard label="Pending" value={String(pending)} />
          <MetricCard label="Trades" value={String(scenario.metrics.trades)} />
        </div>
      </div>

      <div
        style={{
          background: CARD_BG,
          border: BORDER,
          borderRadius: 16,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <BarChart3 size={14} color={GOLD} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Monte Carlo</span>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: MUTED }}>Median Terminal</span>
            <span>{fmtCurrency(monteCarlo.medianTerminalEquity)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: MUTED }}>P05 / P95</span>
            <span>{fmtCurrency(monteCarlo.p05TerminalEquity)} / {fmtCurrency(monteCarlo.p95TerminalEquity)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: MUTED }}>Prob. Below Start</span>
            <span>{fmtPct(monteCarlo.probabilityBelowStartPct)}</span>
          </div>
        </div>
      </div>

      <div
        style={{
          background: CARD_BG,
          border: BORDER,
          borderRadius: 16,
          padding: 14,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Desktop Scope</div>
        <p style={{ margin: 0, fontSize: 12, color: SOFT, lineHeight: 1.55 }}>
          Full trade history, execution scaling and the complete capital table stay on the desktop Portfolio Lab.
          This mobile surface uses the same canonical White Swan / Core Invest scenario engine and shows the live scenario summary only.
        </p>
      </div>
    </div>
  );
}
