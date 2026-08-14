'use client';

import { useEffect, useState } from 'react';
import { PortfolioLab } from './PortfolioLab';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavPoint {
  date: string;
  nav: number;
  dailyReturn: number;
  drawdown: number;
  drawdownPct: number;
}

interface SerkanData {
  endNAV: number;
  netProfit: number;
  cagr: number;
  sharpe: number;
  maxDD: number;
  maxDDPct: number;
  maxDDFromStart: number;
}

interface CapitalScenario {
  capitalLevel: number;
  startNAV: number;
  endNAV: number;
  netProfit: number;
  totalReturn: number;
  years: number;
  cagr: number;
  annVolatility: number;
  sharpe: number;
  sortino: number;
  maxDD: number;
  maxDDPct: number;
  maxDDFromStart: number;
  maxDDDuration: number;
  calmar: number;
  recoveryFactor: number;
  profitFactor: number;
  ulcerIndex: number;
  winningDaysPct: number;
  losingDaysPct: number;
  bestDay: number;
  worstDay: number;
  annualCostPct: number;
  expectancyPct: number;
  rating: 'TOO_SMALL' | 'BORDERLINE' | 'WORKABLE' | 'COMFORTABLE';
  navSeries: NavPoint[];
  serkan?: SerkanData;
}

interface TradeFrequency {
  tradesPerWeek: number;
  tradesPerMonth: number;
  tradesPerYear: number;
  executionsPerWeek: number;
  costsPerWeek_EUR: number;
  costsPerMonth_EUR: number;
  costsPerYear_EUR: number;
}

interface TradeStats {
  totalTrades: number;
  winRate_trades: number;
  avgWin_EUR: number;
  avgLoss_EUR: number;
  expectancy_EUR: number;
  payoffRatio: number;
  bestTrade_EUR: number;
  worstTrade_EUR: number;
}

interface RiskMetrics {
  totalTradingDays: number;
  totalYears: number;
  totalGrossEUR: number;
  totalCostsEUR: number;
  totalNetEUR: number;
  totalNetEUR_serkan: number;
  maxDD_absolute_EUR: number;
  tradeStats: TradeStats;
  tradeFrequency: TradeFrequency;
  capitalScenarios: CapitalScenario[];
}

interface YearlyRow {
  year: number;
  trades: number;
  executions: number;
  grossPnlEUR: number;
  costsEUR: number;
  netPnlEUR: number;
  costRatioGross: number;
}

interface StrategyRow {
  strategyId: string;
  label: string;
  symbol: string;
  currency: string;
  trades: number;
  executions: number;
  grossPnlEUR: number;
  costsEUR: number;
  netPnlEUR: number;
  costRatioGross: number;
  netPositive: string;
  costBurdenRank: number;
}

interface CostSensitivityRow {
  costPerExecution: number;
  totalCostsEUR: number;
  netPnlEUR: number;
  cagr_50k: number;
  sharpe_50k: number;
  maxDD_50k: number;
  maxDDPct_50k_fromStart: number;
  costRatio: number;
}

interface AnalyticsData {
  capitalScenarios: CapitalScenario[];
  riskMetrics: RiskMetrics;
  yearlyAnalysis: YearlyRow[];
  strategyBreakdown: StrategyRow[];
  costSensitivity: CostSensitivityRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | undefined | null, dec = 1) =>
  n != null && isFinite(n) ? n.toFixed(dec) : '—';

const fmtEUR = (n: number | undefined | null) =>
  n != null && isFinite(n)
    ? new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(n)
    : '—';

const fmtPct = (n: number | undefined | null, dec = 1) =>
  n != null && isFinite(n) ? `${n.toFixed(dec)}%` : '—';

const fmtNum = (n: number | undefined | null) =>
  n != null ? new Intl.NumberFormat('de-DE').format(n) : '—';

function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr;
  const step = Math.ceil(arr.length / maxPoints);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}

const CAPITAL_LEVELS = [10000, 12500, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];

const RATING_STYLE: Record<string, string> = {
  TOO_SMALL: 'bg-red-500/20 text-red-400 border border-red-500/30',
  BORDERLINE: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  WORKABLE: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  COMFORTABLE: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
};

function RatingBadge({ rating }: { rating: string }) {
  return (
    <span className={cn('inline-block rounded px-2 py-0.5 text-xs font-semibold', RATING_STYLE[rating] ?? '')}>
      {rating.replace('_', ' ')}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-lg border border-[#2a2b30] bg-gradient-to-b from-[#1c1d20] to-[#141517] p-4 text-center">
      <div className="text-xs text-[#737373] mb-1 uppercase tracking-wide truncate">{label}</div>
      <div className="text-lg font-bold font-mono text-[#e2ca7a] leading-tight">{value}</div>
      {sub && <div className="text-xs text-[#737373] mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-widest text-[#e2ca7a] mb-3 mt-8 border-b border-[#2a2b30] pb-2">
      {children}
    </h2>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WhiteSwanAnalytics() {
  const [activeTab, setActiveTab] = useState<'analytics' | 'lab'>('lab');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNAV, setSelectedNAV] = useState(25000);

  useEffect(() => {
    fetch('/api/white-swan-analysis')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: AnalyticsData) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  // Analytics data unavailable (e.g. Vercel preview) — still render tabs so Portfolio Lab is accessible
  const analyticsUnavailable = !loading && (error !== null || !data ||
    (!data.capitalScenarios?.length && !data.riskMetrics?.capitalScenarios?.length));

  // Use capitalScenarios from riskMetrics (canonical, with navSeries from top-level)
  const scenarios: CapitalScenario[] = data
    ? (data.capitalScenarios?.length ? data.capitalScenarios : (data.riskMetrics?.capitalScenarios ?? []))
    : [];

  // rm is only accessed inside !analyticsUnavailable guard (data != null there)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const rm = (data?.riskMetrics ?? {}) as RiskMetrics;
  const selectedScenario = scenarios.find((s) => s.startNAV === selectedNAV || s.capitalLevel === selectedNAV) ?? scenarios[4];

  const navSampled = downsample(selectedScenario?.navSeries ?? [], 300);
  const drawdownData = navSampled.map((p) => ({ date: p.date.slice(0, 10), value: -(p.drawdownPct ?? 0) }));

  const cagrChartData = scenarios.map((s) => ({
    capital: `${(s.startNAV ?? s.capitalLevel) / 1000}k`,
    CAGR: Number(s.cagr?.toFixed(2)),
    Sharpe: Number(s.sharpe?.toFixed(2)),
  }));

  const riskChartData = scenarios.map((s) => ({
    capital: `${(s.startNAV ?? s.capitalLevel) / 1000}k`,
    'MaxDD%': Number((s.maxDDFromStart ?? s.maxDDPct)?.toFixed(2)),
    'AnnCost%': Number(s.annualCostPct?.toFixed(2)),
  }));

  const focusScenarios = scenarios.filter((s) => {
    const cap = s.startNAV ?? s.capitalLevel;
    return cap <= 25000;
  });

  const yearlyData = data ? (data.yearlyAnalysis as unknown as YearlyRow[]).map((r) => ({
    ...r,
    year: Number(r.year),
    netPnlEUR: Number(r.netPnlEUR),
    costsEUR: Number(r.costsEUR),
    grossPnlEUR: Number(r.grossPnlEUR),
    costRatioGross: Number(r.costRatioGross),
  })) : [];

  const strategyData = data ? (data.strategyBreakdown as unknown as StrategyRow[]).sort(
    (a, b) => Number(a.costBurdenRank) - Number(b.costBurdenRank)
  ) : [];

  const costSensData = (data?.costSensitivity ?? []) as unknown as CostSensitivityRow[];

  return (
    <div className="h-full w-full overflow-y-auto bg-[#0c0d10]">
    <div className="text-white px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-montserrat text-[#e2ca7a]">White Swan Capital Analytics</h1>
        <p className="text-[#737373] text-sm mt-1">
          18.5-year simulation — 15 active strategies / 17 components — 1-contract model
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('analytics')}
          className={cn(
            'px-4 py-2 rounded text-sm font-semibold transition-all',
            activeTab === 'analytics'
              ? 'bg-[#bf9d4a] border border-[#e2ca7a] text-black'
              : 'border border-[#2a2b30] text-[#737373] hover:border-[#e2ca7a] hover:text-[#e2ca7a]'
          )}
        >
          Capital Analytics
        </button>
        <button
          onClick={() => setActiveTab('lab')}
          className={cn(
            'px-4 py-2 rounded text-sm font-semibold transition-all',
            activeTab === 'lab'
              ? 'bg-[#bf9d4a] border border-[#e2ca7a] text-black'
              : 'border border-[#2a2b30] text-[#737373] hover:border-[#e2ca7a] hover:text-[#e2ca7a]'
          )}
        >
          Portfolio Lab
        </button>
      </div>

      {activeTab === 'lab' && <PortfolioLab />}
      {activeTab === 'analytics' && analyticsUnavailable && (
        <div className="flex flex-col items-center justify-center py-16 text-[#737373] gap-3">
          <div className="text-[#e2ca7a] text-sm font-semibold">Capital Analytics — not available in cloud preview</div>
          <div className="text-xs max-w-sm text-center">
            Analytics data requires local Brain path. Run locally or switch to Portfolio Lab above.
          </div>
        </div>
      )}
      {activeTab === 'analytics' && !analyticsUnavailable && <>

      {/* KEY SNAPSHOT */}
      <SectionTitle>Key Snapshot</SectionTitle>
      <div className="flex flex-wrap gap-3 mb-6">
        <StatCard label="Components" value="15 / 17" sub="EEM + IWM blocked" />
        <StatCard label="Total Trades" value={fmtNum(rm.tradeStats?.totalTrades ?? 9728)} />
        <StatCard label="Executions" value={fmtNum((rm.tradeStats?.totalTrades ?? 9728) * 2)} />
        <StatCard label="Model" value="1-Contract" />
        <StatCard label="Cost/Execution" value="€0.85 Serkan" sub="$0.95 USD gross" />
        <StatCard label="Best Workable" value="€25k" sub="First WORKABLE" />
        <StatCard label="Comfortable" value="€75k" sub="First COMFORTABLE" />
        <StatCard label="MaxDD Absolute" value={fmtEUR(rm.maxDD_absolute_EUR)} />
      </div>

      {/* CAPITAL SELECTOR + EFFICIENCY TABLE */}
      <SectionTitle>Capital Scenario Selector</SectionTitle>
      <div className="flex flex-col lg:flex-row gap-6 mb-4">
        {/* Left: selector */}
        <div className="lg:w-64 shrink-0">
          <div className="flex flex-wrap gap-2 mb-4">
            {CAPITAL_LEVELS.map((cap) => {
              const s = scenarios.find((x) => (x.startNAV ?? x.capitalLevel) === cap);
              return (
                <button
                  key={cap}
                  onClick={() => setSelectedNAV(cap)}
                  className={cn(
                    'px-3 py-1.5 rounded text-sm font-mono font-semibold border transition-all',
                    selectedNAV === cap
                      ? 'bg-[#bf9d4a] border-[#e2ca7a] text-black'
                      : 'border-[#2a2b30] text-[#737373] hover:border-[#e2ca7a] hover:text-[#e2ca7a]'
                  )}
                >
                  {cap >= 1000 ? `${cap / 1000}k` : cap}
                </button>
              );
            })}
          </div>
          {selectedScenario && (
            <div className="rounded-lg border border-[#2a2b30] bg-gradient-to-b from-[#1c1d20] to-[#141517] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#737373]">Rating</span>
                <RatingBadge rating={selectedScenario.rating} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#737373]">CAGR</span>
                <span className="text-sm font-mono text-[#e2ca7a]">{fmtPct(selectedScenario.cagr)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#737373]">Sharpe</span>
                <span className="text-sm font-mono text-[#e2ca7a]">{fmt(selectedScenario.sharpe, 3)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#737373]">Calmar</span>
                <span className="text-sm font-mono text-[#e2ca7a]">{fmt(selectedScenario.calmar, 3)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#737373]">Sortino</span>
                <span className="text-sm font-mono text-[#e2ca7a]">{fmt(selectedScenario.sortino, 3)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#737373]">MaxDD%</span>
                <span className="text-sm font-mono text-red-400">{fmtPct(selectedScenario.maxDDFromStart)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#737373]">AnnCost%</span>
                <span className="text-sm font-mono text-orange-400">{fmtPct(selectedScenario.annualCostPct)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#737373]">Best Day</span>
                <span className="text-sm font-mono text-[#e2ca7a]">{fmtEUR(selectedScenario.bestDay)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#737373]">Worst Day</span>
                <span className="text-sm font-mono text-red-400">{fmtEUR(selectedScenario.worstDay)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Capital Efficiency Matrix */}
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#2a2b30]">
                {['Capital', 'Return%', 'CAGR', 'MaxDD%', 'Sharpe', 'Calmar', 'AnnCost%', 'Rating'].map((h) => (
                  <th key={h} className="text-left px-2 py-2 text-[#737373] font-semibold uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => {
                const cap = s.startNAV ?? s.capitalLevel;
                const isSelected = cap === selectedNAV;
                return (
                  <tr
                    key={cap}
                    onClick={() => setSelectedNAV(cap)}
                    className={cn(
                      'border-b border-[#2a2b30]/50 cursor-pointer hover:bg-[#1c1d20] transition-colors',
                      isSelected && 'bg-[#1c1d20]'
                    )}
                  >
                    <td className="px-2 py-1.5 font-mono font-bold text-[#e2ca7a]">{cap >= 1000 ? `€${cap / 1000}k` : `€${cap}`}</td>
                    <td className="px-2 py-1.5 font-mono">{fmtPct(s.totalReturn)}</td>
                    <td className="px-2 py-1.5 font-mono">{fmtPct(s.cagr)}</td>
                    <td className="px-2 py-1.5 font-mono text-red-400">{fmtPct(s.maxDDFromStart)}</td>
                    <td className="px-2 py-1.5 font-mono">{fmt(s.sharpe, 3)}</td>
                    <td className="px-2 py-1.5 font-mono">{fmt(s.calmar, 3)}</td>
                    <td className="px-2 py-1.5 font-mono text-orange-400">{fmtPct(s.annualCostPct)}</td>
                    <td className="px-2 py-1.5"><RatingBadge rating={s.rating} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* EQUITY CURVE + DRAWDOWN side by side */}
      <SectionTitle>Equity Curve — €{selectedNAV >= 1000 ? `${selectedNAV / 1000}k` : selectedNAV} Starting Capital</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-lg border border-[#2a2b30] bg-[#0A0A0A] p-4">
          <div className="text-xs text-[#737373] mb-2 uppercase tracking-wide">NAV Equity Curve</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={navSampled} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2b30" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#737373' }} tickFormatter={(v: string) => v.slice(0, 7)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#737373' }} tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#1c1d20', border: '1px solid #2a2b30', borderRadius: 6, fontSize: 12 }}
                formatter={(v: unknown) => [fmtEUR(v as number), 'NAV']}
                labelFormatter={(l: unknown) => String(l)}
              />
              <ReferenceLine y={selectedNAV} stroke="#2a2b30" strokeDasharray="6 3" label={{ value: 'Start', fill: '#737373', fontSize: 10 }} />
              <Line type="monotone" dataKey="nav" stroke="#e2ca7a" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-[#2a2b30] bg-[#0A0A0A] p-4">
          <div className="text-xs text-[#737373] mb-2 uppercase tracking-wide">Drawdown %</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={drawdownData} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2b30" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#737373' }} tickFormatter={(v: string) => v.slice(0, 7)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#737373' }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ background: '#1c1d20', border: '1px solid #2a2b30', borderRadius: 6, fontSize: 12 }}
                formatter={(v: unknown) => [`${(v as number).toFixed(2)}%`, 'Drawdown']}
              />
              <Area type="monotone" dataKey="value" stroke="rgb(239,68,68)" fill="rgba(239,68,68,0.15)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CAGR/SHARPE + RISK CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-lg border border-[#2a2b30] bg-[#0A0A0A] p-4">
          <div className="text-xs text-[#737373] mb-2 uppercase tracking-wide">CAGR % + Sharpe vs Capital</div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={cagrChartData} margin={{ top: 4, right: 40, bottom: 4, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2b30" />
              <XAxis dataKey="capital" tick={{ fontSize: 10, fill: '#737373' }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#737373' }} tickFormatter={(v: number) => `${v}%`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#737373' }} />
              <Tooltip contentStyle={{ background: '#1c1d20', border: '1px solid #2a2b30', borderRadius: 6, fontSize: 12 }} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="CAGR" fill="#737373" radius={[2, 2, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="Sharpe" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: '#60a5fa' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-[#2a2b30] bg-[#0A0A0A] p-4">
          <div className="text-xs text-[#737373] mb-2 uppercase tracking-wide">MaxDD% + AnnCost% vs Capital</div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={riskChartData} margin={{ top: 4, right: 40, bottom: 4, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2b30" />
              <XAxis dataKey="capital" tick={{ fontSize: 10, fill: '#737373' }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#737373' }} tickFormatter={(v: number) => `${v}%`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#737373' }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={{ background: '#1c1d20', border: '1px solid #2a2b30', borderRadius: 6, fontSize: 12 }} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine yAxisId="left" y={25} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '25%', fill: '#ef4444', fontSize: 9 }} />
              <ReferenceLine yAxisId="left" y={15} stroke="#f97316" strokeDasharray="4 2" label={{ value: '15%', fill: '#f97316', fontSize: 9 }} />
              <Bar yAxisId="left" dataKey="MaxDD%" fill="rgba(239,68,68,0.5)" radius={[2, 2, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="AnnCost%" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* FOCUS BOX 10k–25k */}
      <SectionTitle>Focus Box — €10k to €25k Comparison</SectionTitle>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#2a2b30]">
              {['Capital', 'End NAV', 'Total Return', 'CAGR', 'Sharpe', 'Calmar', 'MaxDD%', 'Worst Day', 'AnnCost%', 'Rating'].map((h) => (
                <th key={h} className="text-left px-2 py-2 text-[#737373] font-semibold uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {focusScenarios.map((s) => {
              const cap = s.startNAV ?? s.capitalLevel;
              return (
                <tr key={cap} className="border-b border-[#2a2b30]/50 hover:bg-[#1c1d20]">
                  <td className="px-2 py-2 font-mono font-bold text-[#e2ca7a]">€{cap >= 1000 ? `${cap / 1000}k` : cap}</td>
                  <td className="px-2 py-2 font-mono">{fmtEUR(s.endNAV)}</td>
                  <td className="px-2 py-2 font-mono">{fmtPct(s.totalReturn)}</td>
                  <td className="px-2 py-2 font-mono">{fmtPct(s.cagr)}</td>
                  <td className="px-2 py-2 font-mono">{fmt(s.sharpe, 3)}</td>
                  <td className="px-2 py-2 font-mono">{fmt(s.calmar, 3)}</td>
                  <td className="px-2 py-2 font-mono text-red-400">{fmtPct(s.maxDDFromStart)}</td>
                  <td className="px-2 py-2 font-mono text-red-400">{fmtEUR(s.worstDay)}</td>
                  <td className="px-2 py-2 font-mono text-orange-400">{fmtPct(s.annualCostPct)}</td>
                  <td className="px-2 py-2"><RatingBadge rating={s.rating} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* COST ANALYSIS */}
      <SectionTitle>Cost Analysis — Annual Breakdown</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#2a2b30]">
                {['Year', 'Trades', 'Exec.', 'Gross €', 'Costs €', 'Net €', 'Cost%'].map((h) => (
                  <th key={h} className="text-left px-2 py-1.5 text-[#737373] font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yearlyData.map((r) => (
                <tr key={r.year} className="border-b border-[#2a2b30]/40 hover:bg-[#1c1d20]">
                  <td className="px-2 py-1 font-mono font-bold text-[#e2ca7a]">{r.year}</td>
                  <td className="px-2 py-1 font-mono">{r.trades}</td>
                  <td className="px-2 py-1 font-mono">{r.executions}</td>
                  <td className="px-2 py-1 font-mono text-[#737373]">{fmtEUR(r.grossPnlEUR)}</td>
                  <td className="px-2 py-1 font-mono text-orange-400">{fmtEUR(r.costsEUR)}</td>
                  <td className={cn('px-2 py-1 font-mono', r.netPnlEUR >= 0 ? 'text-[#e2ca7a]' : 'text-red-400')}>
                    {fmtEUR(r.netPnlEUR)}
                  </td>
                  <td className="px-2 py-1 font-mono text-[#737373]">{isNaN(r.costRatioGross) ? '—' : `${(r.costRatioGross * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border border-[#2a2b30] bg-[#0A0A0A] p-4">
          <div className="text-xs text-[#737373] mb-2 uppercase tracking-wide">Net PnL by Year</div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={yearlyData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2b30" />
              <XAxis dataKey="year" tick={{ fontSize: 9, fill: '#737373' }} />
              <YAxis tick={{ fontSize: 9, fill: '#737373' }} tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#1c1d20', border: '1px solid #2a2b30', borderRadius: 6, fontSize: 12 }}
                formatter={(v: unknown) => [fmtEUR(v as number), 'Net PnL']}
              />
              <ReferenceLine y={0} stroke="#2a2b30" />
              <Bar dataKey="netPnlEUR" radius={[2, 2, 0, 0]}>
                {yearlyData.map((entry, index) => (
                  <rect key={index} fill={entry.netPnlEUR >= 0 ? '#e2ca7a' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* COST SENSITIVITY + STRATEGY COST DRIVERS side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <div>
          <SectionTitle>Cost Sensitivity — 5 Scenarios (€50k)</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#2a2b30]">
                  {['Cost/Exec', 'Net PnL', 'CAGR', 'Sharpe', 'MaxDD%', 'Cost Ratio'].map((h) => (
                    <th key={h} className="text-left px-2 py-2 text-[#737373] font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {costSensData.map((r) => {
                  const isSerkan = Math.abs(r.costPerExecution - 0.85) < 0.001;
                  return (
                    <tr key={r.costPerExecution} className={cn('border-b border-[#2a2b30]/50', isSerkan && 'bg-[#e2ca7a]/5')}>
                      <td className={cn('px-2 py-2 font-mono font-bold', isSerkan ? 'text-[#e2ca7a]' : 'text-white')}>
                        €{r.costPerExecution.toFixed(2)} {isSerkan && <span className="text-[10px] ml-1 text-[#e2ca7a]">★</span>}
                      </td>
                      <td className="px-2 py-2 font-mono text-[#e2ca7a]">{fmtEUR(r.netPnlEUR)}</td>
                      <td className="px-2 py-2 font-mono">{fmtPct(r.cagr_50k)}</td>
                      <td className="px-2 py-2 font-mono">{fmt(r.sharpe_50k, 3)}</td>
                      <td className="px-2 py-2 font-mono text-red-400">{fmtPct(r.maxDDPct_50k_fromStart)}</td>
                      <td className="px-2 py-2 font-mono text-[#737373]">{fmtPct(r.costRatio * 100)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SectionTitle>Strategy Cost Drivers — Ranked</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#2a2b30]">
                  {['#', 'Strategy', 'Trades', 'Gross €', 'Costs €', 'Net €', 'Cost%'].map((h) => (
                    <th key={h} className="text-left px-2 py-2 text-[#737373] font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {strategyData.map((r) => {
                  const isNegative = r.netPositive === 'NEIN';
                  return (
                    <tr key={r.strategyId} className={cn('border-b border-[#2a2b30]/50 hover:bg-[#1c1d20]', isNegative && 'bg-red-500/5')}>
                      <td className="px-2 py-1.5 font-mono text-[#737373]">{r.costBurdenRank}</td>
                      <td className="px-2 py-1.5 font-semibold max-w-[120px] truncate" title={r.label}>
                        {isNegative ? <span className="text-red-400">{r.label}</span> : r.label}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{r.trades}</td>
                      <td className="px-2 py-1.5 font-mono text-[#737373]">{fmtEUR(r.grossPnlEUR)}</td>
                      <td className="px-2 py-1.5 font-mono text-orange-400">{fmtEUR(r.costsEUR)}</td>
                      <td className={cn('px-2 py-1.5 font-mono', isNegative ? 'text-red-400' : 'text-[#e2ca7a]')}>
                        {fmtEUR(r.netPnlEUR)}
                        {isNegative && <span className="ml-1 text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded px-1">NEG</span>}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[#737373]">
                        {isNaN(r.costRatioGross) ? '—' : `${(r.costRatioGross * 100).toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TRADE FREQUENCY */}
      <SectionTitle>Trade Frequency & Cost Cadence</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {[
          { label: 'Trades/week', value: fmt(rm.tradeFrequency?.tradesPerWeek, 2) },
          { label: 'Executions/week', value: fmt(rm.tradeFrequency?.executionsPerWeek, 2) },
          { label: 'Costs/week', value: fmtEUR(rm.tradeFrequency?.costsPerWeek_EUR) },
          { label: 'Trades/month', value: fmt(rm.tradeFrequency?.tradesPerMonth, 1) },
          { label: 'Costs/month', value: fmtEUR(rm.tradeFrequency?.costsPerMonth_EUR) },
          { label: 'Costs/year', value: fmtEUR(rm.tradeFrequency?.costsPerYear_EUR) },
        ].map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
      <div className="rounded-lg border border-[#2a2b30] bg-[#1c1d20] p-3 text-xs text-[#737373] mb-8">
        Note: ~10 trades/week actual vs. ~5 trades/week cited in INNO conversation — the live strategy runs 2× more frequently than initially discussed.
      </div>
    </>}
    </div>
    </div>
  );
}
