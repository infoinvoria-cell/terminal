"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, Database, ShieldAlert } from "lucide-react";
import type { FSPortfolioSnapshot } from "@/lib/fsportfolio/types";
import { cn } from "@/lib/utils";

function formatPct(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateLabel(date: string) {
  if (date.length === 7) return date;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function Card({
  title,
  subtitle,
  children,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#17181b] shadow-[0_18px_45px_rgba(0,0,0,0.22)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div>
          <p className="text-[12px] font-medium tracking-[0.04em] text-[#d8dadf] [font-family:var(--font-montserrat),sans-serif]">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-1 text-[10px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">{subtitle}</p>
          ) : null}
        </div>
        {right}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Kpi({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] border border-white/[0.06] bg-[#15161a] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
        {label}
      </p>
      <p className="mt-2 text-[20px] font-bold leading-none tracking-tight text-white [font-family:var(--font-nunito),sans-serif]">
        {value}
      </p>
    </div>
  );
}

export function FSPortfolioLiveCorePanel({ snapshot }: { snapshot: FSPortfolioSnapshot }) {
  const ready = snapshot.backtest.ready;
  const metrics = snapshot.backtest.metrics;
  const manifestRows = [
    ...Object.entries(snapshot.manifest.core_required).map(([symbol, entry]) => ({
      label: symbol,
      status: entry.status,
      rows: entry.rows ?? null,
      range: entry.first_date && entry.last_date ? `${entry.first_date} -> ${entry.last_date}` : "n/a",
    })),
    {
      label: "White Swan trade export",
      status: snapshot.manifest.white_swan.trade_export.status,
      rows: snapshot.manifest.white_swan.trade_export.rows ?? null,
      range:
        snapshot.manifest.white_swan.trade_export.first_date && snapshot.manifest.white_swan.trade_export.last_date
          ? `${snapshot.manifest.white_swan.trade_export.first_date} -> ${snapshot.manifest.white_swan.trade_export.last_date}`
          : "n/a",
    },
    {
      label: "QQQ Pine reference",
      status: snapshot.manifest.white_swan.pine_reference.status,
      rows: snapshot.manifest.white_swan.pine_reference.rows ?? null,
      range: "reference",
    },
    {
      label: "DBC research optional",
      status: snapshot.manifest.research_optional.DBC.status,
      rows: snapshot.manifest.research_optional.DBC.rows ?? null,
      range:
        snapshot.manifest.research_optional.DBC.first_date && snapshot.manifest.research_optional.DBC.last_date
          ? `${snapshot.manifest.research_optional.DBC.first_date} -> ${snapshot.manifest.research_optional.DBC.last_date}`
          : "n/a",
    },
  ];
  const overviewCards = [
    { label: "Status", value: ready ? "Research / Forward-ready" : "Missing Data" },
    { label: "Portfolio Value", value: ready ? formatUsd(snapshot.backtest.equityCurve.at(-1)?.value) : "n/a" },
    { label: "Total Return", value: ready ? formatPct(metrics?.totalReturnPct) : "n/a" },
    { label: "CAGR", value: ready ? formatPct(metrics?.cagrPct) : "n/a" },
    { label: "Max Drawdown", value: ready ? formatPct(metrics?.maxDrawdownPct) : "n/a" },
    { label: "YTD", value: ready ? formatPct(metrics?.ytdReturnPct) : "n/a" },
    { label: "Next Rebalance", value: ready ? snapshot.backtest.nextRebalanceDate ?? "n/a" : "n/a" },
    { label: "White Swan", value: ready ? snapshot.backtest.whiteSwan.currentSignal.toUpperCase() : "n/a" },
  ];

  const allocationRows = ready
    ? snapshot.backtest.currentWeights.map((row) => ({
        symbol: row.symbol,
        target: Number((row.targetWeight * 100).toFixed(2)),
        current: Number((row.currentWeight * 100).toFixed(2)),
      }))
    : Object.entries(snapshot.config.weights).map(([symbol, weight]) => ({
        symbol,
        target: Number((weight * 100).toFixed(2)),
        current: 0,
      }));

  const equityData = snapshot.backtest.equityCurve.map((point, index) => ({
    date: point.date,
    portfolio: point.value,
    benchmark: snapshot.backtest.benchmarkCurve[index]?.value ?? null,
  }));

  const annualReturns = snapshot.backtest.annualReturns.map((item) => ({
    label: item.date,
    value: item.value,
  }));

  const rollingReturns = snapshot.backtest.rolling12mReturns.map((item, index) => ({
    date: item.date,
    rollingReturn: item.value,
    rollingVol: snapshot.backtest.rollingVolatility[index]?.value ?? null,
    rollingCorr: snapshot.backtest.rollingCorrelation[index]?.value ?? null,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/[0.07] bg-[#141518] px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            {snapshot.portfolioName}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
            Long-only Multi-Asset Invest Portfolio. Eigene Research-/Forward-Tracking-Linie, nicht White-Swan-Track-Record.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-zinc-400 [font-family:var(--font-montserrat),sans-serif]">
          <span className="rounded-full border border-white/[0.08] px-3 py-1">Benchmark: {snapshot.config.benchmark}</span>
          <span className="rounded-full border border-white/[0.08] px-3 py-1">Quarterly Rebalance</span>
          <span className="rounded-full border border-white/[0.08] px-3 py-1">Cost: {snapshot.config.transaction_cost_bps} bps</span>
          <span className="rounded-full border border-white/[0.08] px-3 py-1">White Swan Cap: 10%</span>
          <span className="rounded-full border border-white/[0.08] px-3 py-1">QQQ core sleeve implementation</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <Kpi key={card.label} label={card.label} value={card.value} />
        ))}
      </div>

      <div className="rounded-[14px] border border-white/[0.06] bg-[#15161a] px-4 py-3 text-[11px] text-zinc-400 [font-family:var(--font-montserrat),sans-serif]">
        DBC removed from final core; retained for research comparison only.
      </div>

      <Card
        title="Data Readiness"
        subtitle="Reale Datenquellen oder klarer Missing-Status. Keine Fake-Charts."
        right={
          ready ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] text-emerald-300">
              <CheckCircle2 size={12} />
              Backtest ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] text-amber-300">
              <AlertTriangle size={12} />
              Upload/import required
            </span>
          )
        }
      >
        <div className="grid gap-3 px-4 py-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-hidden rounded-[14px] border border-white/[0.06]">
            <table className="w-full border-collapse text-left text-[11px] [font-family:var(--font-montserrat),sans-serif]">
              <thead className="bg-white/[0.03] text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Rows</th>
                  <th className="px-3 py-2">Range</th>
                </tr>
              </thead>
              <tbody>
                {manifestRows.map((item) => (
                  <tr key={item.label} className="border-t border-white/[0.05]">
                    <td className="px-3 py-2 text-zinc-200">{item.label}</td>
                    <td className="px-3 py-2">
                      <span className={item.status === "present" ? "text-emerald-300" : item.status === "pending" ? "text-zinc-300" : "text-amber-300"}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{item.rows || "n/a"}</td>
                    <td className="px-3 py-2 text-zinc-400">{item.range}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-[14px] border border-white/[0.06] bg-[#15161a] p-3">
              <p className="flex items-center gap-2 text-[11px] font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
                <Database size={14} />
                Data sources found
              </p>
              <div className="mt-2 space-y-1 text-[10px] text-zinc-400 [font-family:var(--font-montserrat),sans-serif]">
                {snapshot.dataQuality
                  .filter((item) => item.found)
                  .map((item) => (
                    <p key={item.symbol}>{item.symbol}: {item.sourcePath}</p>
                  ))}
                {snapshot.manifest.white_swan.trade_export.path ? (
                  <p>WHITE_SWAN_EXPORT: {snapshot.manifest.white_swan.trade_export.path}</p>
                ) : null}
                {snapshot.manifest.white_swan.pine_reference.path ? (
                  <p>QQQ_PINE: {snapshot.manifest.white_swan.pine_reference.path}</p>
                ) : null}
                {snapshot.manifest.research_optional.DBC.path ? (
                  <p>DBC_RESEARCH: {snapshot.manifest.research_optional.DBC.path}</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-[14px] border border-white/[0.06] bg-[#15161a] p-3">
              <p className="flex items-center gap-2 text-[11px] font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
                <ShieldAlert size={14} />
                Caveats
              </p>
              <div className="mt-2 space-y-1 text-[10px] text-zinc-400 [font-family:var(--font-montserrat),sans-serif]">
                {snapshot.caveats.slice(0, 4).map((caveat) => (
                  <p key={caveat}>- {caveat}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {ready ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <Card title="Performance" subtitle="Portfolio vs SPY">
              <div className="h-[320px] px-2 py-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="fsportfolio-equity-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(244,245,247,0.16)" />
                        <stop offset="100%" stopColor="rgba(244,245,247,0.02)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} minTickGap={30} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatUsd(value)} width={74} />
                    <Tooltip
                      labelFormatter={(label) => String(label)}
                      formatter={(value, name) => [formatUsd(Number(value ?? 0)), name === "portfolio" ? "Portfolio" : "SPY"]}
                      contentStyle={{ background: "#101115", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
                    />
                    <Area type="monotone" dataKey="portfolio" stroke="#f3f4f6" strokeWidth={1.8} fill="url(#fsportfolio-equity-fill)" dot={false} />
                    <Line type="monotone" dataKey="benchmark" stroke="#d8c36f" strokeWidth={1.4} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Allocation" subtitle="Target / current weights">
              <div className="h-[320px] px-2 py-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={allocationRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="symbol" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value}%`} />
                    <Tooltip contentStyle={{ background: "#101115", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                    <Bar dataKey="target" name="Target %" fill="rgba(216,195,111,0.85)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="current" name="Current %" fill="rgba(244,245,247,0.82)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card title="Risk" subtitle="Calculated from real loaded data">
              <div className="grid grid-cols-2 gap-2 p-4">
                <Kpi label="Volatility" value={formatPct(metrics?.annualizedVolatilityPct)} />
                <Kpi label="Sharpe" value={metrics ? metrics.sharpe.toFixed(2) : "n/a"} />
                <Kpi label="Sortino" value={metrics?.sortino === null || metrics?.sortino === undefined ? "n/a" : metrics.sortino.toFixed(2)} />
                <Kpi label="Calmar" value={metrics?.calmar === null || metrics?.calmar === undefined ? "n/a" : metrics.calmar.toFixed(2)} />
                <Kpi label="Beta vs SPY" value={metrics?.betaToSpy === null || metrics?.betaToSpy === undefined ? "n/a" : metrics.betaToSpy.toFixed(2)} />
                <Kpi label="Corr. vs SPY" value={metrics?.correlationToSpy === null || metrics?.correlationToSpy === undefined ? "n/a" : metrics.correlationToSpy.toFixed(2)} />
              </div>
            </Card>

            <Card title="White Swan Sleeve" subtitle="Research reference NAS100USD, core implementation QQQ long/cash">
              <div className="space-y-2 p-4 text-[11px] [font-family:var(--font-montserrat),sans-serif]">
                <div className="grid grid-cols-2 gap-2">
                  <Kpi label="Signal" value={snapshot.backtest.whiteSwan.currentSignal.toUpperCase()} />
                  <Kpi label="Source" value={snapshot.backtest.whiteSwan.source} />
                  <Kpi label="Trades" value={String(snapshot.backtest.whiteSwan.tradeCount)} />
                  <Kpi label="Win Rate" value={formatPct(snapshot.backtest.whiteSwan.winRatePct)} />
                </div>
                {snapshot.backtest.whiteSwan.warning ? (
                  <div className="rounded-[12px] border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[10px] text-amber-300">
                    {snapshot.backtest.whiteSwan.warning}
                  </div>
                ) : null}
              </div>
            </Card>

            <Card title="Audit Trail" subtitle="Quarterly rebalance log, proposal only">
              <div className="overflow-auto p-2">
                <table className="w-full border-collapse text-left text-[10px] [font-family:var(--font-montserrat),sans-serif]">
                  <thead className="bg-white/[0.03] text-zinc-500">
                    <tr>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Value</th>
                      <th className="px-2 py-2">Turnover</th>
                      <th className="px-2 py-2">Cost</th>
                      <th className="px-2 py-2">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.backtest.rebalanceEvents.slice(-6).reverse().map((event) => (
                      <tr key={event.date} className="border-t border-white/[0.05]">
                        <td className="px-2 py-2 text-zinc-200">{event.date}</td>
                        <td className="px-2 py-2 text-zinc-400">{formatUsd(event.portfolioValue)}</td>
                        <td className="px-2 py-2 text-zinc-400">{formatPct(event.turnover * 100)}</td>
                        <td className="px-2 py-2 text-zinc-400">{formatPct(event.transactionCostPct)}</td>
                        <td className="px-2 py-2 text-zinc-400">{event.whiteSwanSignal.toUpperCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Card title="Annual Returns" subtitle="Real computed annual returns">
              <div className="h-[260px] px-2 py-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={annualReturns} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value}%`} />
                    <Tooltip contentStyle={{ background: "#101115", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {annualReturns.map((entry) => (
                        <Cell key={entry.label} fill={entry.value >= 0 ? "rgba(216,195,111,0.85)" : "rgba(138,78,78,0.82)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Rolling 12M / Vol / Correlation" subtitle="Trailing windows from computed monthly returns">
              <div className="h-[260px] px-2 py-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rollingReturns} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#101115", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                    <Line type="monotone" dataKey="rollingReturn" name="Rolling 12M %" stroke="#f3f4f6" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="rollingVol" name="Rolling Vol %" stroke="#d8c36f" strokeWidth={1.35} dot={false} />
                    <Line type="monotone" dataKey="rollingCorr" name="Rolling Corr" stroke="#9ca3af" strokeWidth={1.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card title="Backtest Not Available" subtitle={snapshot.backtest.reason ?? "Missing data"}>
            <div className="space-y-3 p-4 text-[11px] text-zinc-400 [font-family:var(--font-montserrat),sans-serif]">
              <p>Missing required OHLC: {snapshot.missingSymbols.join(", ") || "n/a"}</p>
              <p>Final v2 backtest not available - missing SPMO.csv.</p>
              <p>Upload/import required. Das Modul zeigt absichtlich keine hardcodierten Portfolio-KPIs oder Fake-Performance an.</p>
            </div>
          </Card>

          <Card title="Target Allocation v2" subtitle="Regelwerk sichtbar, ohne fake current portfolio values">
            <div className="h-[260px] px-2 py-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={allocationRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="symbol" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value}%`} />
                  <Tooltip contentStyle={{ background: "#101115", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                  <Bar dataKey="target" name="Target %" fill="rgba(216,195,111,0.85)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      <Card title="Investor Caveats" subtitle="Pflicht-Hinweise fuer diesen Bereich">
        <div className="grid gap-1 px-4 py-4 text-[11px] text-zinc-400 [font-family:var(--font-montserrat),sans-serif]">
          <p>- Historische Tests sind kein Renditeversprechen.</p>
          <p>- Core Invest ist aktuell nicht live und nicht freigegeben (Research/Pre-Fund).</p>
          <p>- QQQ Pine 1 und QQQ Pine 2 EMA sind zusammen maximal 15% Strategy-Sleeve.</p>
          <p>- QQQ Pine muss auf QQQ validiert werden — NAS100-Dateien sind nur Proxy/Research.</p>
          <p>- Keine Shorts, keine Optionen, kein Portfolio-Hebel.</p>
          <p>- Proxy-Tests sind keine echte ETF-Historie.</p>
          <p>- DBC ist nur Research Optional und kein Bestandteil des finalen Core.</p>
          <p>- Capitalife GbR erbringt keine eigene Finanzportfolioverwaltung.</p>
        </div>
      </Card>
    </div>
  );
}
