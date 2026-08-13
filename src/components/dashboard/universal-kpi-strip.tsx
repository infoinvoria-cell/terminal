"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import { KpiCard, type BenchmarkInfo } from "@/components/dashboard/kpi-card";
import { AumKpiCard } from "@/components/dashboard/aum-kpi-card";
import type { SpyBenchmarkKpis } from "@/lib/benchmark/spy-kpis";

export type UniversalKpiStrings = {
  riskAdjustedAum: string;
  marketVolume: string;
  totalReturn24m: string | null;
  maxDrawdown: string | null;
  compoundedReturn?: string;
  annualizedReturn?: string | null;
  volatility?: string | null;
  sharpe?: string | null;
  calmar?: string | null;
  positiveMonths?: string | null;
  profitFactor?: string | null;
  portfolioTotalTrades?: number;
  portfolioStartDate?: string | null;
  portfolioEndDate?: string | null;
  coverageStatus?: string | null;
  coverageNote?: string | null;
  performanceSeries?: Array<{ dateUtc: string; cumulativeReturn?: number; portfolioIndex?: number; portfolioDailyReturn?: number | null }>;
  /** Trade-event series: one point per closed trade, from trade-event-series.json */
  tradeEventSeries?: Array<{ closeTimeUtc: string; closeTimeEpoch: number; cumulativeReturn: number; tradeId: string; symbol: string; side: string; netProfitLocal: number }>;
  /** Raw AUM number in EUR — never coerced to 0; null when unavailable */
  assetsUnderManagementEur?: number | null;
  /** First cashflow date UTC (capital inception) e.g. "2024-04-11" */
  inceptionDateUtc?: string | null;
  /** First trade close date UTC (first chart point) e.g. "2024-04-15" */
  firstTradeDateUtc?: string | null;
};

type UniversalKpiStripProps = {
  universal: UniversalKpiStrings;
  showBenchmark?: boolean;
  spyKpis?: SpyBenchmarkKpis | null;
};

const LS_KEY = "kpi_maxdd_color";

function fmt1(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtAbs1(n: number) {
  return `${n.toFixed(1)}%`;
}

function parseNumericPct(s: string): number | null {
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
}

function returnInfo(portfolioVal: number, spyVal: number): BenchmarkInfo {
  const diff = portfolioVal - spyVal;
  const diffColor: BenchmarkInfo["diffColor"] =
    Math.abs(diff) < 0.05 ? "muted" : diff > 0 ? "gold" : "red";
  return { diff: fmt1(diff), diffColor, spyValue: fmtAbs1(spyVal) };
}

function ddInfo(portfolioDD: number, spyDD: number): BenchmarkInfo {
  const diff = spyDD - portfolioDD;
  const diffColor: BenchmarkInfo["diffColor"] =
    Math.abs(diff) < 0.05 ? "muted" : diff > 0 ? "gold" : "red";
  return { diff: fmt1(diff), diffColor, spyValue: `-${fmtAbs1(spyDD)}` };
}

export function UniversalKpiStrip({ universal, showBenchmark, spyKpis }: UniversalKpiStripProps) {
  const active = showBenchmark && spyKpis != null;

  const totalReturnPortfolio = universal.totalReturn24m != null ? (parseNumericPct(universal.totalReturn24m) ?? 0) : 0;
  const annualizedPortfolio  = universal.annualizedReturn != null ? (parseNumericPct(universal.annualizedReturn) ?? 0) : 0;
  const maxDDPortfolio       = universal.maxDrawdown != null ? Math.abs(parseNumericPct(universal.maxDrawdown) ?? 0) : 0;

  // true = gold (negative), false = white (default) — persisted in localStorage
  const [ddGold, setDdGold] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored !== null) setDdGold(stored !== "white");
    } catch { /* localStorage unavailable */ }
  }, []);

  function toggleDdColor() {
    setDdGold(prev => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, next ? "gold" : "white"); } catch { /* ignore */ }
      return next;
    });
  }

  const coverageLabel = universal.coverageStatus === "partial" ? " (partial data)" : "";
  const totalReturnTitle = universal.portfolioStartDate
    ? `Realized balance performance (EUR-weighted, FX-neutral)${coverageLabel}. Period ${universal.portfolioStartDate}–${universal.portfolioEndDate ?? ""}. Total trades: ${universal.portfolioTotalTrades ?? "—"}. Not independently audited.`
    : "Portfolio engine data not yet available.";

  const annualizedTitle = universal.portfolioStartDate
    ? `Annualized return p.a. over available period ${universal.portfolioStartDate}–${universal.portfolioEndDate ?? ""}.${universal.sharpe ? ` Sharpe ${universal.sharpe}` : ""}${universal.calmar ? ` · Calmar ${universal.calmar}` : ""}. Not independently audited.`
    : "Annualized return — no data available.";

  return (
    <section>
      {/* Hidden spans for test assertions */}
      <span
        data-testid="home-track-record-point-count"
        style={{ display: "none" }}
      >
        {universal.performanceSeries?.length ?? 0}
      </span>
      <span
        data-testid="home-track-record-coverage-status"
        style={{ display: "none" }}
      >
        {universal.coverageStatus ?? "unknown"}
      </span>
      <span
        data-testid="home-track-record-trade-count"
        style={{ display: "none" }}
      >
        {universal.portfolioTotalTrades ?? 0}
      </span>
      {/* AUM and date testid spans — display:none, layout-neutral */}
      <span data-testid="home-track-record-aum-raw" style={{ display: "none" }}>
        {universal.assetsUnderManagementEur ?? "null"}
      </span>
      <span data-testid="home-track-record-inception-date" style={{ display: "none" }}>
        {universal.inceptionDateUtc ?? "null"}
      </span>
      <span data-testid="home-track-record-first-trade-date" style={{ display: "none" }}>
        {universal.firstTradeDateUtc ?? "null"}
      </span>
      <div className="grid min-h-0 min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AumKpiCard value={universal.riskAdjustedAum} />
        <div data-testid="home-track-record-total-return-card">
          {/* Hidden spans for test assertions on value and start date */}
          <span data-testid="home-track-record-total-return" style={{ display: "none" }}>
            {universal.totalReturn24m ?? ""}
          </span>
          <span data-testid="home-track-record-start-date" style={{ display: "none" }}>
            {universal.portfolioStartDate ?? ""}
          </span>
          <KpiCard
            label="Total Return"
            value={universal.totalReturn24m ?? "—"}
            title={totalReturnTitle}
            icon={<TrendingUp size={22} style={{ color: "rgba(180,192,210,0.6)" }} strokeWidth={1.6} />}
            benchmarkInfo={active && totalReturnPortfolio !== 0 ? returnInfo(totalReturnPortfolio, spyKpis!.totalReturnPct) : undefined}
          />
        </div>
        {/* Max Drawdown — click the card to toggle value color gold ↔ white */}
        <div
          onClick={toggleDdColor}
          style={{ cursor: "pointer" }}
          title="Klick: Farbe wechseln (Gold ↔ Weiß)"
        >
          <KpiCard
            label="Max Drawdown"
            value={universal.maxDrawdown ?? "—"}
            valueVariant={ddGold ? "negative" : "default"}
            icon={<TrendingDown size={22} style={{ color: "rgba(180,192,210,0.6)" }} strokeWidth={1.6} />}
            benchmarkInfo={active && maxDDPortfolio !== 0 ? ddInfo(maxDDPortfolio, spyKpis!.maxDrawdownPct) : undefined}
          />
        </div>
        <KpiCard
          label="Annualized Return"
          value={universal.annualizedReturn ?? "—"}
          title={annualizedTitle}
          icon={<BarChart2 size={22} style={{ color: "rgba(180,192,210,0.6)" }} strokeWidth={1.6} />}
          benchmarkInfo={active && annualizedPortfolio !== 0 ? returnInfo(annualizedPortfolio, spyKpis!.annualizedReturnPct) : undefined}
        />
      </div>
    </section>
  );
}
