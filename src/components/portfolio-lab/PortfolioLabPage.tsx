"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Layers3, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { PortfolioLabBootstrap, ScenarioConfig, TimeRangeKey } from "@/lib/portfolio-simulator/types";
import { runScenario } from "@/lib/portfolio-simulator/scenario-engine";
import { runMonteCarlo } from "@/lib/portfolio-simulator/monte-carlo";

type Props = {
  bootstrap: PortfolioLabBootstrap;
};

const card = "rounded-[12px] border border-white/[0.06] bg-[#111216] shadow-[0_16px_40px_-24px_rgba(0,0,0,0.85)]";

function fmtCurrency(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function fmtPct(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function tooltipCurrency(value: unknown) {
  return fmtCurrency(typeof value === "number" ? value : Number(value));
}

function tooltipPct(value: unknown) {
  return fmtPct(typeof value === "number" ? value : Number(value));
}

function kpi(label: string, value: string) {
  return (
    <div className={`${card} p-3`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="mt-2 text-[24px] font-semibold text-white">{value}</div>
    </div>
  );
}

export function PortfolioLabPage({ bootstrap }: Props) {
  const [config, setConfig] = useState<ScenarioConfig>(bootstrap.defaultScenario);
  const [runs, setRuns] = useState(300);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") as ScenarioConfig["mode"] | null;
    const accountSize = Number(params.get("equity"));
    const ws = Number(params.get("ws"));
    const core = Number(params.get("core"));
    const range = params.get("range") as TimeRangeKey | null;
    setConfig((current) => ({
      ...current,
      mode: mode === "white-swan" || mode === "core-invest" || mode === "combined" ? mode : current.mode,
      accountSize: Number.isFinite(accountSize) && accountSize > 0 ? accountSize : current.accountSize,
      whiteSwanPct: Number.isFinite(ws) ? ws : current.whiteSwanPct,
      coreInvestPct: Number.isFinite(core) ? core : current.coreInvestPct,
      range: range && bootstrap.availableRanges.includes(range) ? range : current.range,
    }));
  }, [bootstrap.availableRanges]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("mode", config.mode);
    params.set("equity", String(Math.round(config.accountSize)));
    params.set("ws", String(config.mode === "white-swan" ? 100 : config.mode === "core-invest" ? 0 : config.whiteSwanPct));
    params.set("core", String(config.mode === "core-invest" ? 100 : config.mode === "white-swan" ? 0 : config.coreInvestPct));
    params.set("range", config.range);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [config]);

  const scenario = useMemo(
    () => runScenario(config, bootstrap.whiteSwan, bootstrap.coreInvest),
    [bootstrap.coreInvest, bootstrap.whiteSwan, config],
  );

  const monteCarlo = useMemo(
    () => runMonteCarlo(scenario.returnSeriesPct, config.accountSize, runs, 1729, 3),
    [config.accountSize, runs, scenario.returnSeriesPct],
  );

  const activeCapitalRows = scenario.capitalRows;
  const activeTrades = scenario.tradeRows.slice(-120);
  const strategiesModelled = activeCapitalRows.length;
  const strategiesExecutable = activeCapitalRows.filter((row) => row.executionFeasibility === "EXECUTION_EXACT" || row.executionFeasibility === "EXECUTION_APPROXIMATE").length;
  const strategiesNotGranular = activeCapitalRows.filter((row) => row.executionFeasibility === "NOT_GRANULAR").length;
  const strategiesPending = activeCapitalRows.filter((row) => row.executionFeasibility === "EXECUTION_DATA_PENDING").length;
  const strategiesMarginBlocked = activeCapitalRows.filter((row) => row.executionTranslation?.finalExecutionStatus === "MARGIN_BLOCKED").length;

  function applyMode(mode: ScenarioConfig["mode"]) {
    setConfig((current) => ({
      ...current,
      mode,
      whiteSwanPct: mode === "white-swan" ? 100 : mode === "core-invest" ? 0 : current.whiteSwanPct,
      coreInvestPct: mode === "core-invest" ? 100 : mode === "white-swan" ? 0 : current.coreInvestPct,
    }));
  }

  function setCombinedAllocation(wsPct: number) {
    const clamped = Math.max(0, Math.min(100, wsPct));
    setConfig((current) => ({ ...current, whiteSwanPct: clamped, coreInvestPct: 100 - clamped }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3">
      <section className={`${card} p-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full border border-white/[0.08] bg-[#0d0e12] p-1">
            {[
              ["white-swan", "White Swan"],
              ["core-invest", "Core Invest"],
              ["combined", "Combined"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => applyMode(mode as ScenarioConfig["mode"])}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${config.mode === mode ? "bg-[#C9A84C] text-black" : "text-zinc-400 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-[12px] text-zinc-400">
            <span>Account Size</span>
            <input
              value={config.accountSize}
              onChange={(event) => setConfig((current) => ({ ...current, accountSize: Math.max(1, Number(event.target.value) || 0) }))}
              className="h-9 w-[120px] rounded-full border border-white/[0.08] bg-[#0d0e12] px-3 text-white outline-none"
              type="number"
              min={1}
              step={1000}
            />
          </label>

          <div className="flex items-center gap-2 text-[12px] text-zinc-400">
            <span>Currency</span>
            <div className="rounded-full border border-white/[0.08] bg-[#0d0e12] px-3 py-2 text-white">USD</div>
          </div>

          {config.mode === "combined" ? (
            <div className="flex items-center gap-3 text-[12px] text-zinc-400">
              <span>White Swan {config.whiteSwanPct}%</span>
              <input type="range" min={0} max={100} step={1} value={config.whiteSwanPct} onChange={(event) => setCombinedAllocation(Number(event.target.value))} />
              <span>Core Invest {config.coreInvestPct}%</span>
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex rounded-full border border-white/[0.08] bg-[#0d0e12] p-1">
              {bootstrap.availableRanges.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setConfig((current) => ({ ...current, range }))}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${config.range === range ? "bg-white/[0.1] text-white" : "text-zinc-500 hover:text-zinc-200"}`}
                >
                  {range}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setConfig(bootstrap.defaultScenario)} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-[#0d0e12] px-3 text-[12px] font-semibold text-zinc-300">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-zinc-400">
          <span>White Swan Sleeve: <span className="text-white">{fmtCurrency(scenario.whiteSwanSleeveCapital)}</span></span>
          <span>Core Invest Sleeve: <span className="text-white">{fmtCurrency(scenario.coreInvestSleeveCapital)}</span></span>
          <span>Source: <span className="text-white">{config.mode === "combined" ? "Synchronized monthly portfolio returns" : config.mode === "white-swan" ? bootstrap.whiteSwan.sourceLabel : bootstrap.coreInvest.sourceLabel}</span></span>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="flex min-h-0 flex-col gap-4">
          <section className={`${card} h-[360px] p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Historical Scenario Equity</div>
                <div className="text-[18px] font-semibold text-white">Equity Curve</div>
              </div>
              <div className="text-[12px] text-zinc-400">{scenario.points[0]?.date ?? "—"} → {scenario.points.at(-1)?.date ?? "—"}</div>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={scenario.points}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#7f8088", fontSize: 10 }} />
                <YAxis tick={{ fill: "#7f8088", fontSize: 10 }} width={72} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={tooltipCurrency} />
                <Area type="monotone" dataKey="equity" stroke="#C9A84C" fill="rgba(201,168,76,0.14)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </section>

          <section className={`${card} h-[220px] p-4`}>
            <div className="mb-3 text-[18px] font-semibold text-white">Drawdown Curve</div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scenario.points}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#7f8088", fontSize: 10 }} />
                <YAxis tick={{ fill: "#7f8088", fontSize: 10 }} width={56} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={tooltipPct} />
                <Line type="monotone" dataKey="drawdownPct" stroke="#8a8f9c" strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </section>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          {kpi("Ending Equity", fmtCurrency(scenario.metrics.endingEquity))}
          {kpi("Net Profit", fmtCurrency(scenario.metrics.netProfit))}
          {kpi("CAGR", fmtPct(scenario.metrics.cagr != null ? scenario.metrics.cagr * 100 : null))}
          {kpi("Sharpe", scenario.metrics.sharpe != null ? scenario.metrics.sharpe.toFixed(2) : "—")}
          {kpi("Max Drawdown", fmtPct(scenario.metrics.maxDrawdownPct))}
          {kpi("Calmar", scenario.metrics.calmar != null ? scenario.metrics.calmar.toFixed(2) : "—")}
          {kpi("Trades", String(scenario.metrics.trades))}
          {kpi("Worst Trade", fmtCurrency(scenario.metrics.worstTradeUsd))}
          {kpi("Best Trade", fmtCurrency(scenario.metrics.bestTradeUsd))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className={`${card} p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Monte Carlo</div>
              <div className="text-[18px] font-semibold text-white">Monthly Block Bootstrap</div>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-zinc-400">
              Runs
              <input value={runs} onChange={(event) => setRuns(Math.max(50, Number(event.target.value) || 0))} className="h-8 w-[90px] rounded-full border border-white/[0.08] bg-[#0d0e12] px-3 text-white outline-none" type="number" step={50} min={50} />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {kpi("Median Terminal", fmtCurrency(monteCarlo.medianTerminalEquity))}
            {kpi("P05 Terminal", fmtCurrency(monteCarlo.p05TerminalEquity))}
            {kpi("P95 Terminal", fmtCurrency(monteCarlo.p95TerminalEquity))}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {kpi("Prob. Below Start", fmtPct(monteCarlo.probabilityBelowStartPct))}
            {kpi("Median Max DD", fmtPct(-monteCarlo.medianMaxDrawdownPct))}
            {kpi("P95 Max DD", fmtPct(-monteCarlo.p95MaxDrawdownPct))}
          </div>
          <p className="mt-3 text-[12px] text-zinc-500">Seed 1729 · block length 3 · deterministic monthly resampling preserving short-run dependence.</p>
        </section>

        <section className={`${card} p-4`}>
          <div className="mb-3 flex items-center gap-2 text-white">
            <SlidersHorizontal className="h-4 w-4 text-[#C9A84C]" />
            <span className="text-[18px] font-semibold">Capital Feasibility</span>
          </div>
          <div className="grid gap-3">
            {kpi("Strategies Modelled", String(strategiesModelled))}
            {kpi("Executable", String(strategiesExecutable))}
            {kpi("Not Granular", String(strategiesNotGranular))}
            {kpi("Execution Pending", String(strategiesPending))}
            {kpi("Margin Blocked", String(strategiesMarginBlocked))}
          </div>
        </section>
      </div>

      <section className={`${card} p-4`}>
        <div className="mb-3 flex items-center gap-2 text-white">
          <Layers3 className="h-4 w-4 text-[#C9A84C]" />
          <span className="text-[18px] font-semibold">Strategy Contribution</span>
        </div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scenario.contributionRows}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="strategy" tick={{ fill: "#7f8088", fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={70} />
              <YAxis tick={{ fill: "#7f8088", fontSize: 10 }} width={72} />
              <Tooltip formatter={tooltipCurrency} />
              <Bar dataKey="historicalLossContributionUsd" fill="#8a8f9c" name="Loss Contribution" />
              <Bar dataKey="historicalPnlContributionUsd" fill="#C9A84C" name="Positive Contribution" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={`${card} p-4`}>
        <div className="mb-3 text-[18px] font-semibold text-white">White Swan Capital Detail / Active Sleeve Detail</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[12px]">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-2 pr-4">Strategy</th>
                <th className="pb-2 pr-4">Canonical Weight</th>
                <th className="pb-2 pr-4">Evidence</th>
                <th className="pb-2 pr-4">Reference Unit</th>
                <th className="pb-2 pr-4">Largest Loss</th>
                <th className="pb-2 pr-4">Historical Loss Capital @ 1%</th>
                <th className="pb-2 pr-4">Historical Loss Capital @ 2%</th>
                <th className="pb-2 pr-4">Historical Loss Capital @ 5%</th>
                <th className="pb-2 pr-4">Sleeve Capital</th>
                <th className="pb-2 pr-4">Scaling Basis</th>
                <th className="pb-2 pr-4">Model Exposure</th>
                <th className="pb-2 pr-4">Broker Product</th>
                <th className="pb-2 pr-4">Broker Qty</th>
                <th className="pb-2 pr-4">Error %</th>
                <th className="pb-2 pr-4">Position Notional</th>
                <th className="pb-2 pr-4">Cash Required</th>
                <th className="pb-2 pr-4">Initial Margin</th>
                <th className="pb-2 pr-4">Margin Confidence</th>
                <th className="pb-2 pr-4">Broker Validation</th>
                <th className="pb-2 pr-4">Final Status</th>
              </tr>
            </thead>
            <tbody>
              {activeCapitalRows.map((row) => (
                <tr key={row.strategyId} className="border-t border-white/[0.05] text-zinc-300">
                  <td className="py-2 pr-4">{row.displayName}</td>
                  <td className="py-2 pr-4">{row.portfolioWeightPct.toFixed(2)}%</td>
                  <td className="py-2 pr-4">{row.evidenceType}</td>
                  <td className="py-2 pr-4">{row.historicalReferenceUnit}</td>
                  <td className="py-2 pr-4">{fmtCurrency(row.largestReliableLossUsd)}</td>
                  <td className="py-2 pr-4">{fmtCurrency(row.capitalForWorstLossAt1Pct)}</td>
                  <td className="py-2 pr-4">{fmtCurrency(row.capitalForWorstLossAt2Pct)}</td>
                  <td className="py-2 pr-4">{fmtCurrency(row.capitalForWorstLossAt5Pct)}</td>
                  <td className="py-2 pr-4">{fmtCurrency(row.sleeveCapitalUsd)}</td>
                  <td className="py-2 pr-4">
                    {row.executionTranslation ? row.executionTranslation.referenceSizingBasis : "—"}
                    {row.family === "Seasonal" ? (
                      <div className="mt-1 text-[10px] text-[#C9A84C]" title="This is an execution-scaling convention, not a guaranteed maximum loss.">
                        10% WORST-TRADE REFERENCE NORMALIZATION
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4">
                    {row.executionTranslation ? row.executionTranslation.modelExposureInReferenceUnits.toFixed(4) : row.modelReferenceUnitsEffective.toFixed(4)}
                  </td>
                  <td className="py-2 pr-4">
                    {row.executionTranslation ? `${row.executionTranslation.selectedIbkrSymbol} · ${row.executionTranslation.selectedInstrument}` : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.executionTranslation ? row.executionTranslation.brokerQuantity : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.executionTranslation ? fmtPct(-row.executionTranslation.relativeExposureErrorPct, 2) : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.executionTranslation ? fmtCurrency(row.executionTranslation.positionNotionalAccountCurrency) : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.executionTranslation ? fmtCurrency(row.executionTranslation.cashRequired) : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.executionTranslation ? fmtCurrency(row.executionTranslation.initialMargin) : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.executionTranslation?.marginConfidence ?? "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.executionTranslation?.brokerOrderStatus ?? "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.executionTranslation?.finalExecutionStatus ?? row.executionFeasibility}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} p-4`}>
        <div className="mb-3 text-[18px] font-semibold text-white">Trade History</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[12px]">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-2 pr-4">Exit</th>
                <th className="pb-2 pr-4">Portfolio</th>
                <th className="pb-2 pr-4">Strategy</th>
                <th className="pb-2 pr-4">Evidence</th>
                <th className="pb-2 pr-4">Direction</th>
                <th className="pb-2 pr-4">Signal</th>
                <th className="pb-2 pr-4">Exec</th>
                <th className="pb-2 pr-4">Model Qty</th>
                <th className="pb-2 pr-4">Executable Qty</th>
                <th className="pb-2 pr-4">PnL $</th>
                <th className="pb-2 pr-4">Running Equity</th>
              </tr>
            </thead>
            <tbody>
              {activeTrades.map((row) => (
                <tr key={row.id} className="border-t border-white/[0.05] text-zinc-300">
                  <td className="py-2 pr-4">{row.exitDate}</td>
                  <td className="py-2 pr-4">{row.portfolio}</td>
                  <td className="py-2 pr-4">{row.strategy}</td>
                  <td className="py-2 pr-4">{row.evidenceType}</td>
                  <td className="py-2 pr-4">{row.direction}</td>
                  <td className="py-2 pr-4">{row.signalInstrument}</td>
                  <td className="py-2 pr-4">{row.executionInstrument}</td>
                  <td className="py-2 pr-4">{row.modelQuantity != null ? row.modelQuantity.toFixed(4) : "—"}</td>
                  <td className="py-2 pr-4">{row.executableQuantity != null ? row.executableQuantity : "—"}</td>
                  <td className="py-2 pr-4">{fmtCurrency(row.pnlUsd)}</td>
                  <td className="py-2 pr-4">{fmtCurrency(row.runningEquity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {scenario.tradeRows.length === 0 ? <p className="mt-3 text-[12px] text-zinc-500">TRADE_HISTORY_NOT_AVAILABLE_FOR_SOURCE</p> : null}
      </section>
    </div>
  );
}
