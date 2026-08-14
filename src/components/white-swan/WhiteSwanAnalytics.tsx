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

// ─── Normalized variant schema ────────────────────────────────────────────────

interface NormAlpha {
  grossCAGR_1c: number;
  netCAGR_1c: number;
  costDrag_pct: number;
  ibkrCostsAnnual_1c: number;
  ibkrCostsTotal_1c: number;
  serkanCostsAnnual_1c: number;
  isCAGR: number | null;
  oosCAGR: number;
  sharpe: number;
  calmar_1c: number;
  maxDDFromPeak: number;
}

interface NormPortfolio {
  scaledNetCAGR: number;
  leverageReturn: number;
  scaledCostsAnnual: number;
  costPerNAV_pct: number;
  calmar_scaled: number;
  tradesPerWeek: number;
  executionsPerYear: number;
  avgContracts: number;
}

interface NormWF {
  positiveFolds: number;
  totalFolds: number;
  passRate: number;
  oosCAGR: number;
  oosIsRatio: number;
}

interface NormContracts {
  n_6E: number;
  n_FDXS: number;
  n_MGC: number;
  dax_instrument: string;
  gold_instrument: string;
}

interface NormTradeCounts {
  eurusd: number;
  dax1h: number;
  dax2h: number;
  gold: number;
  total: number;
}

interface NormVariant {
  variantId: string;
  sourceVariantId: string;
  comboKey: string;
  eurFilter: string;
  d2hFilter: string;
  gldFilter: string;
  sizingTier: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  marginStatus: 'PASS' | 'MARGIN_FAIL';
  finalStatus: 'FINAL_CANDIDATE' | 'AGGRESSIVE' | 'WF_FAIL' | 'COST_KILL';
  contracts: NormContracts;
  totalMargin_EUR: number;
  marginPct: number;
  alpha: NormAlpha;
  portfolio: NormPortfolio;
  tradeCounts: NormTradeCounts;
  wf: NormWF;
  gates: Record<string, boolean>;
  serkanComparison: { serkanAnnual_1c: number; ibkrRealAnnual_1c: number; multiplier: number };
  robustificationNotes: Record<string, string>;
}

interface NormFinalist {
  variantId: string;
  summary: string;
  rationale: string;
}

interface NormCapitalData {
  capital: number;
  capitalAssessment: 'PASS' | 'MARGIN_FAIL';
  capitalAssessmentNote: string;
  marginReference: string;
  ibkrCostsVerifiedDate: string;
  ibkrCosts: { '6E_roundturn_EUR': number; FDXS_roundturn_EUR: number; MGC_roundturn_EUR: number };
  margins_EUR: { '6E': number; FDXS: number; MGC: number; conservative_total: number; conservative_marginPct: number };
  sizingTiersUsed: Record<string, { n_6E: number; n_FDXS: number; n_MGC: number; totalMargin: number; marginPct: number }>;
  variants: NormVariant[];
  finalists: Record<string, NormFinalist>;
  capitalSummary: { totalVariants: number; finalCandidates: number; aggressiveVariants: number };
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

function RatingBadge({ rating }: { rating?: string }) {
  const r = rating ?? '—';
  return (
    <span className={cn('inline-block rounded px-2 py-0.5 text-xs font-semibold', RATING_STYLE[r] ?? '')}>
      {r.replace('_', ' ')}
    </span>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'flex-1 min-w-0 rounded-lg border bg-gradient-to-b from-[#1c1d20] to-[#141517] p-4 text-center',
      highlight ? 'border-[#e2ca7a]/40' : 'border-[#2a2b30]'
    )}>
      <div className="text-xs text-[#737373] mb-1 uppercase tracking-wide truncate">{label}</div>
      <div className={cn('text-lg font-bold font-mono leading-tight', highlight ? 'text-[#e2ca7a]' : 'text-[#e2ca7a]')}>{value}</div>
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

// ─── Component Quality Data (static, 17 components) ─────────────────────────

const COMPONENT_QUALITY_DATA = [
  {
    id: 'eurusd_30m',         label: 'EURUSD 30M',        instrument: '6E / M6E',    exchange: 'CME',
    ibkrCost: 4.10,           margin: 2287,                tradesPerYr: 22.4,         status: 'NEEDS_COST_FILTER',
    statusColor: 'text-yellow-400',
    note: 'E6_MonLong filter: 22.4 trades/yr, €91.87/yr cost — viable. ATR filter pending Brain backtest.',
    wfFolds: '9/9',           oosPositive: true,           dataQuality: 'MONITORING_ONLY (2026)',
  },
  {
    id: 'dax_1h',             label: 'DAX 1H',             instrument: 'FDXS',        exchange: 'EUREX',
    ibkrCost: 0.76,           margin: 880,                 tradesPerYr: 70.6,         status: 'ACCEPTABLE',
    statusColor: 'text-blue-400',
    note: 'D1_Baseline. €53.64/yr cost at FDXS €0.76/rt. Regime filter design pending Brain backtest.',
    wfFolds: '9/9',           oosPositive: true,           dataQuality: 'MONITORING_ONLY (2025)',
  },
  {
    id: 'gld_thursday',       label: 'GLD Thursday',       instrument: 'MGC / GC',    exchange: 'COMEX',
    ibkrCost: 2.63,           margin: 735,                 tradesPerYr: 17.2,         status: 'ACCEPTABLE',
    statusColor: 'text-blue-400',
    note: 'GLD_BestMonths filter: 17.2 trades/yr, €45.16/yr. GC (€4.10/rt) only viable ≥€25k.',
    wfFolds: '9/9',           oosPositive: true,           dataQuality: 'RESEARCH_ETF (1096 trades)',
  },
  {
    id: 'ym1_tat',            label: 'YM1 TAT (Dow)',      instrument: 'MYM',         exchange: 'CBOT',
    ibkrCost: 2.50,           margin: 490,                 tradesPerYr: 30.9,         status: 'LOW_SAMPLE',
    statusColor: 'text-orange-400',
    note: '573 total trades over 18.5yr. Futures replication possible. Parameter neighborhood pending.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'PARTIAL (436 daily rows)',
  },
  {
    id: 'dax_2h',             label: 'DAX 2H',             instrument: 'FDXS',        exchange: 'EUREX',
    ibkrCost: 0.76,           margin: 880,                 tradesPerYr: 88.0,         status: 'ROBUST',
    statusColor: 'text-emerald-400',
    note: 'D2_HighVolYears: 88/yr, €66.87/yr. Dominant component. FDXS cheapest at €0.76/rt.',
    wfFolds: '9/9',           oosPositive: true,           dataQuality: 'FULL 2008–2026',
  },
  {
    id: 'spy_sea',            label: 'SPY Seasonal',       instrument: 'MES',         exchange: 'CME',
    ibkrCost: 1.90,           margin: 490,                 tradesPerYr: 3.0,          status: 'NO_DATA',
    statusColor: 'text-[#737373]',
    note: '~3 trades/yr seasonal. €5.75/yr cost (minimal). Signal definition + Brain backtest required.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'NO_TRADE_DATA',
  },
  {
    id: 'zm1_sea',            label: 'Soybean Meal',       instrument: 'MZM',         exchange: 'CBOT',
    ibkrCost: 2.00,           margin: 570,                 tradesPerYr: 2.0,          status: 'NO_DATA',
    statusColor: 'text-[#737373]',
    note: '~2 trades/yr. €4.00/yr cost. LOW_SAMPLE by definition. Brain data required.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'NO_TRADE_DATA',
  },
  {
    id: 'sb1_sea',            label: 'Sugar',              instrument: 'SB',          exchange: 'ICEUS',
    ibkrCost: 5.00,           margin: 980,                 tradesPerYr: 2.0,          status: 'NO_DATA',
    statusColor: 'text-[#737373]',
    note: '~2 trades/yr. SB is full-size (non-micro). High cost €5.00/rt. Viability at small capital questionable.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'NO_TRADE_DATA',
  },
  {
    id: 'eem_sea',            label: 'EEM / MSCI EM',      instrument: 'MME (ICE) / SGX',exchange: 'ICEUS / SGX',
    ibkrCost: 4.00,           margin: 0,                   tradesPerYr: 2.0,          status: 'DATA_BLOCKED',
    statusColor: 'text-red-400',
    note: 'CME EMF delisted 2019. ICE MME illiquid. SGX accessible but non-standard IBKR setup. 0 contracts until resolved.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'DATA_BLOCKED',
  },
  {
    id: 'hg1_sea',            label: 'Copper',             instrument: 'MHG',         exchange: 'COMEX',
    ibkrCost: 2.63,           margin: 1633,                tradesPerYr: 2.0,          status: 'NO_DATA',
    statusColor: 'text-[#737373]',
    note: '~2 trades/yr. €5.26/yr cost. MHG margin ~€1,633 (higher than MGC). Brain backtest required.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'NO_TRADE_DATA',
  },
  {
    id: 'gc1_sea',            label: 'Gold Seasonal',      instrument: 'MGC',         exchange: 'COMEX',
    ibkrCost: 2.63,           margin: 735,                 tradesPerYr: 2.0,          status: 'NO_DATA',
    statusColor: 'text-[#737373]',
    note: '~2 trades/yr. Separate from GLD Thursday. €5.26/yr cost. Brain backtest required.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'NO_TRADE_DATA',
  },
  {
    id: 'cl1_sea',            label: 'Crude Oil',          instrument: 'MCL',         exchange: 'NYMEX',
    ibkrCost: 2.23,           margin: 653,                 tradesPerYr: 2.0,          status: 'NO_DATA',
    statusColor: 'text-[#737373]',
    note: '~2 trades/yr. €4.45/yr cost. MCL micro crude. Brain backtest required.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'NO_TRADE_DATA',
  },
  {
    id: 'zc1_sea',            label: 'Corn',               instrument: 'MZC',         exchange: 'CBOT',
    ibkrCost: 2.00,           margin: 572,                 tradesPerYr: 3.0,          status: 'NO_DATA',
    statusColor: 'text-[#737373]',
    note: '~3 trades/yr. €5.94/yr cost. Brain backtest required.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'NO_TRADE_DATA',
  },
  {
    id: 'zw1_sea',            label: 'Wheat',              instrument: 'MZW',         exchange: 'CBOT',
    ibkrCost: 2.00,           margin: 572,                 tradesPerYr: 2.0,          status: 'LOW_SAMPLE',
    statusColor: 'text-orange-400',
    note: '~37 total trades over 18.5yr. Date-based entry (ex-ante). Leave-one-year-out testing pending Brain.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'NO_TRADE_DATA',
  },
  {
    id: 'zs1_sea',            label: 'Soybeans',           instrument: 'MZS',         exchange: 'CBOT',
    ibkrCost: 2.00,           margin: 572,                 tradesPerYr: 3.0,          status: 'NO_DATA',
    statusColor: 'text-[#737373]',
    note: '~3 trades/yr. €5.94/yr cost. Brain backtest required.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'NO_TRADE_DATA',
  },
  {
    id: 'cc1_sea',            label: 'Cocoa',              instrument: 'CC',          exchange: 'ICEUS',
    ibkrCost: 5.00,           margin: 1470,                tradesPerYr: 2.0,          status: 'NO_DATA',
    statusColor: 'text-[#737373]',
    note: 'CC is full-size only. €5.00/rt estimated. High margin €1,470. Small-cap accessibility limited.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'NO_TRADE_DATA',
  },
  {
    id: 'iwm_sea',            label: 'IWM / Russell 2000', instrument: 'M2K',         exchange: 'CME',
    ibkrCost: 1.90,           margin: 572,                 tradesPerYr: 2.0,          status: 'SOLVABLE',
    statusColor: 'text-purple-400',
    note: 'M2K = Micro E-mini Russell 2000. Direct liquid equivalent. €1.90/rt. Seasonal signal + backtest pending.',
    wfFolds: '—',             oosPositive: null,           dataQuality: 'SOLVABLE — needs seasonal signal',
  },
] as const;

const COMPONENT_STATUS_ORDER = ['ROBUST', 'ACCEPTABLE', 'NEEDS_COST_FILTER', 'LOW_SAMPLE', 'SOLVABLE', 'NO_DATA', 'DATA_BLOCKED'];

function ComponentQualitySection() {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...COMPONENT_QUALITY_DATA].sort(
    (a, b) => COMPONENT_STATUS_ORDER.indexOf(a.status) - COMPONENT_STATUS_ORDER.indexOf(b.status)
  );
  const statusCounts = Object.fromEntries(
    COMPONENT_STATUS_ORDER.map(s => [s, COMPONENT_QUALITY_DATA.filter(c => c.status === s).length])
  );
  return (
    <div className="space-y-3">
      <SectionTitle>Component Quality — All 17 Components</SectionTitle>
      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2 text-xs">
        {COMPONENT_STATUS_ORDER.filter(s => statusCounts[s] > 0).map(s => {
          const colorMap: Record<string, string> = {
            ROBUST: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/30',
            ACCEPTABLE: 'bg-blue-900/20 text-blue-400 border-blue-700/30',
            NEEDS_COST_FILTER: 'bg-yellow-900/20 text-yellow-400 border-yellow-700/30',
            LOW_SAMPLE: 'bg-orange-900/20 text-orange-400 border-orange-700/30',
            SOLVABLE: 'bg-purple-900/20 text-purple-400 border-purple-700/30',
            NO_DATA: 'bg-[#1c1d20] text-[#737373] border-[#2a2b30]',
            DATA_BLOCKED: 'bg-red-900/20 text-red-400 border-red-700/30',
          };
          return (
            <span key={s} className={cn('px-2 py-0.5 rounded border font-semibold', colorMap[s] ?? '')}>
              {s.replace(/_/g, ' ')} ×{statusCounts[s]}
            </span>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#2a2b30]">
              {['Component', 'Instrument', 'Exch', 'Cost/rt', 'Margin', 'Trades/yr', 'Cost/yr', 'WF', 'Status', 'Note'].map(h => (
                <th key={h} className="text-right first:text-left px-2 py-1.5 text-[#737373] font-normal whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(expanded ? sorted : sorted.slice(0, 8)).map(c => (
              <tr key={c.id} className="border-b border-[#1a1b1e] hover:bg-[#1a1b1e]/50">
                <td className="px-2 py-1.5 font-semibold text-[#e2ca7a] whitespace-nowrap">{c.label}</td>
                <td className="px-2 py-1.5 font-mono">{c.instrument}</td>
                <td className="px-2 py-1.5 text-[#737373]">{c.exchange}</td>
                <td className="px-2 py-1.5 text-right font-mono">€{c.ibkrCost.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-[#737373]">
                  {c.margin > 0 ? `€${c.margin.toLocaleString('de-DE')}` : '—'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{c.tradesPerYr.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-orange-400">
                  €{(c.tradesPerYr * c.ibkrCost).toFixed(0)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-[#737373]">{c.wfFolds}</td>
                <td className={cn('px-2 py-1.5 text-right font-semibold whitespace-nowrap', c.statusColor)}>
                  {c.status.replace(/_/g, ' ')}
                </td>
                <td className="px-2 py-1.5 text-[#737373] max-w-[280px] truncate" title={c.note}>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > 8 && (
        <button onClick={() => setExpanded(!expanded)}
          className="text-xs text-[#737373] hover:text-[#e2ca7a] transition-colors">
          {expanded ? '▲ Show less' : `▼ Show all ${sorted.length} components`}
        </button>
      )}

      {/* Capital requirement for full portfolio */}
      <div className="rounded border border-[#2a2b30] bg-[#0c0d10] p-3 text-xs space-y-1.5">
        <div className="text-[#e2ca7a] font-semibold text-xs uppercase tracking-wide">Full 17-Component Portfolio — Capital Requirements</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          <div className="text-center">
            <div className="text-[#737373] mb-0.5">Absolute Min</div>
            <div className="font-mono font-bold text-red-400">€14,091</div>
            <div className="text-[#737373]">exchange margin</div>
          </div>
          <div className="text-center border-l border-[#2a2b30]">
            <div className="text-[#737373] mb-0.5">Min (30% rule)</div>
            <div className="font-mono font-bold text-orange-400">€47,000</div>
            <div className="text-[#737373]">16 components ex-EEM</div>
          </div>
          <div className="text-center border-l border-[#2a2b30]">
            <div className="text-[#737373] mb-0.5">Recommended</div>
            <div className="font-mono font-bold text-[#e2ca7a]">€100,000</div>
            <div className="text-[#737373]">with DD reserve</div>
          </div>
          <div className="text-center border-l border-[#2a2b30]">
            <div className="text-[#737373] mb-0.5">Comfortable</div>
            <div className="font-mono font-bold text-emerald-400">€150,000+</div>
            <div className="text-[#737373]">room to scale</div>
          </div>
        </div>
        <div className="text-[#737373] border-t border-[#2a2b30] pt-1.5 mt-1">
          4-component portfolio (6E + DAX1H + DAX2H + GLD): min €20k (separate FDXS) / €15k (shared FDXS). EEM excluded until SGX access confirmed.
        </div>
      </div>
    </div>
  );
}

// ─── Serkan Pre-Check Section ──────────────────────────────────────────────────

const SERKAN_INSTRUMENT_DATA = [
  { instrument: '6E',   label: 'EURUSD 6E',    tradesPerYr: 22.4,  ibkrCost: 4.10, serkanCost: 1.70, slippage: 2.50 },
  { instrument: 'FDXS', label: 'DAX 1H FDXS',  tradesPerYr: 70.6,  ibkrCost: 0.76, serkanCost: 1.70, slippage: 0.50 },
  { instrument: 'FDXS', label: 'DAX 2H FDXS',  tradesPerYr: 88.0,  ibkrCost: 0.76, serkanCost: 1.70, slippage: 0.50 },
  { instrument: 'MGC',  label: 'GLD MGC',       tradesPerYr: 17.2,  ibkrCost: 2.63, serkanCost: 1.70, slippage: 0.08 },
] as const;

function SerkanPreCheckSection() {
  const totalIbkr = SERKAN_INSTRUMENT_DATA.reduce((s, r) => s + r.tradesPerYr * r.ibkrCost, 0);
  const totalSerkan = SERKAN_INSTRUMENT_DATA.reduce((s, r) => s + r.tradesPerYr * r.serkanCost, 0);
  const totalSlippage = SERKAN_INSTRUMENT_DATA.reduce((s, r) => s + r.tradesPerYr * r.slippage, 0);
  return (
    <div className="space-y-3">
      <SectionTitle>Serkan Pre-Check — Cost Comparison</SectionTitle>
      <div className="rounded border border-[#2a2b30] bg-[#0c0d10] p-3 text-xs text-[#737373] space-y-1">
        <div className="text-[#e2ca7a] font-semibold">Serkan reference: €0.85/side = €1.70/roundturn (uniform, all instruments)</div>
        <div>We use instrument-specific IBKR all-in costs. The delta matters per instrument but surprisingly, for THIS portfolio, IBKR is cheaper overall due to FDXS dominance at €0.76/rt.</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#2a2b30]">
              {['Component', 'Trades/yr', 'IBKR Real/rt', 'IBKR Real/yr', 'Serkan Ref/yr', 'Delta/yr', 'Ratio', 'Slippage/yr', 'All-in/yr'].map(h => (
                <th key={h} className="text-right first:text-left px-2 py-1.5 text-[#737373] font-normal whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SERKAN_INSTRUMENT_DATA.map(r => {
              const ibkrYr = r.tradesPerYr * r.ibkrCost;
              const serkanYr = r.tradesPerYr * r.serkanCost;
              const delta = ibkrYr - serkanYr;
              const ratio = ibkrYr / serkanYr;
              const slipYr = r.tradesPerYr * r.slippage;
              return (
                <tr key={r.label} className="border-b border-[#1a1b1e] hover:bg-[#1a1b1e]/50">
                  <td className="px-2 py-1.5 font-semibold text-[#e2ca7a]">{r.label}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.tradesPerYr.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">€{r.ibkrCost.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-orange-400">€{ibkrYr.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-[#737373]">€{serkanYr.toFixed(2)}</td>
                  <td className={cn('px-2 py-1.5 text-right font-mono', delta > 0 ? 'text-red-400' : 'text-emerald-400')}>
                    {delta >= 0 ? '+' : ''}€{delta.toFixed(2)}
                  </td>
                  <td className={cn('px-2 py-1.5 text-right font-mono', ratio > 1 ? 'text-red-400/70' : 'text-emerald-400')}>
                    {ratio.toFixed(2)}×
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[#737373]">€{slipYr.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold">€{(ibkrYr + slipYr).toFixed(2)}</td>
                </tr>
              );
            })}
            {/* Totals */}
            <tr className="border-t border-[#2a2b30] bg-[#141517]">
              <td className="px-2 py-2 font-bold text-[#e2ca7a]">TOTAL (4-component)</td>
              <td className="px-2 py-2 text-right font-mono">{SERKAN_INSTRUMENT_DATA.reduce((s,r)=>s+r.tradesPerYr,0).toFixed(1)}</td>
              <td className="px-2 py-2 text-right text-[#737373]">—</td>
              <td className="px-2 py-2 text-right font-mono font-bold text-orange-400">€{totalIbkr.toFixed(2)}</td>
              <td className="px-2 py-2 text-right font-mono text-[#737373]">€{totalSerkan.toFixed(2)}</td>
              <td className={cn('px-2 py-2 text-right font-mono font-bold', (totalIbkr-totalSerkan)>0?'text-red-400':'text-emerald-400')}>
                {(totalIbkr-totalSerkan)>=0?'+':''}€{(totalIbkr-totalSerkan).toFixed(2)}
              </td>
              <td className={cn('px-2 py-2 text-right font-mono font-bold', (totalIbkr/totalSerkan)>1?'text-red-400':'text-emerald-400')}>
                {(totalIbkr/totalSerkan).toFixed(2)}×
              </td>
              <td className="px-2 py-2 text-right font-mono text-[#737373]">€{totalSlippage.toFixed(2)}</td>
              <td className="px-2 py-2 text-right font-mono font-bold">€{(totalIbkr+totalSlippage).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Key finding callout */}
      <div className="rounded border border-emerald-700/30 bg-emerald-900/10 p-3 text-xs space-y-1.5">
        <div className="font-bold text-emerald-400">KEY FINDING: IBKR real costs CHEAPER than Serkan reference for this portfolio</div>
        <div className="text-[#737373]">
          IBKR total: <span className="font-mono text-orange-400">€{totalIbkr.toFixed(0)}/yr</span> vs
          Serkan reference: <span className="font-mono text-[#737373]">€{totalSerkan.toFixed(0)}/yr</span> —
          ratio: <span className="font-mono text-emerald-400">{(totalIbkr/totalSerkan).toFixed(2)}×</span>.
          FDXS at €0.76/rt dominates the portfolio (DAX strategies = ~{Math.round((70.6+88.0)/(22.4+70.6+88.0+17.2)*100)}% of trades)
          and is far cheaper than Serkan&apos;s uniform €1.70/rt. If Serkan models at €1.70 uniform, his cost estimate will be
          <span className="text-red-400 font-mono"> HIGHER than reality</span> — our backtest is conservative.
        </div>
      </div>

      {/* What Serkan might compute differently */}
      <div className="rounded border border-[#2a2b30] bg-[#0c0d10] p-3 text-xs space-y-1.5">
        <div className="text-[#e2ca7a] font-semibold mb-1">What Serkan might compute differently</div>
        {[
          ['Commission structure', 'Fixed per-contract vs IBKR tiered (IBKR: lower above 10k/mo volume)'],
          ['Exchange fees', 'May use different EUREX/CME fee assumptions than our verified 2026-08-14 rates'],
          ['Slippage', 'We model €0 slippage in backtest. Add €136.65/yr for realistic slippage estimate.'],
          ['Roll cost', 'We do not model quarterly roll slippage (1-3 ticks per roll = ~€0.50-3.00/roll)'],
          ['Currency', 'May compute in USD throughout; EUREX instruments are EUR — FX conversion at rate date differs'],
          ['Margin interest', 'We model no cost-of-carry on margin. At 5% rate: €3,902 × 5% = €195/yr opportunity cost'],
          ['Data cost', 'CME/EUREX real-time data: ~€50-100/mo. Not modeled.'],
          ['6E cost', 'IBKR real: €4.10/rt. Serkan ref: €1.70/rt. 6E is the ONE component where we are more expensive.'],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-[#737373]/60 whitespace-nowrap">{k}:</span>
            <span className="text-[#737373]">{v}</span>
          </div>
        ))}
      </div>

      {/* Annual cost at each capital level */}
      <div className="rounded border border-[#2a2b30] bg-[#0c0d10] p-3 text-xs space-y-1">
        <div className="text-[#e2ca7a] font-semibold mb-1">Cost Drag at Each Capital Level (4-component, 1c each)</div>
        {[
          { cap: 10000, note: 'MARGIN_FAIL' },
          { cap: 12500, note: 'MARGIN_FAIL' },
          { cap: 15000, note: 'PASS (shared FDXS)' },
          { cap: 20000, note: 'PASS' },
          { cap: 30000, note: '' },
          { cap: 50000, note: '' },
        ].map(({ cap, note }) => {
          const ibkrDrag = (totalIbkr / cap * 100).toFixed(2);
          const allInDrag = ((totalIbkr + totalSlippage) / cap * 100).toFixed(2);
          return (
            <div key={cap} className="flex items-center gap-3">
              <span className="font-mono w-16">€{cap >= 1000 ? `${cap/1000}k` : cap}</span>
              <span className="text-[#737373]">IBKR: <span className="font-mono text-orange-400">{ibkrDrag}%</span></span>
              <span className="text-[#737373]">+ slippage: <span className="font-mono">{allInDrag}%</span></span>
              {note && <span className="text-[#737373] ml-1">({note})</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Final White Swan Panel ───────────────────────────────────────────────────

const FINAL_CAPS = [10000, 12500, 15000, 20000];

const ARCHETYPE_LABELS: Record<string, { label: string; color: string }> = {
  BEST_ROBUST:         { label: 'BEST ROBUST',     color: 'text-emerald-400' },
  BEST_RETURN:         { label: 'BEST RETURN',      color: 'text-blue-400' },
  BEST_SHARPE:         { label: 'BEST SHARPE',      color: 'text-purple-400' },
  LOWEST_DD:           { label: 'LOWEST DD',         color: 'text-yellow-400' },
  FINAL_RECOMMENDATION:{ label: 'FINAL REC ★',      color: 'text-[#e2ca7a]' },
};

function FinalWhiteSwanPanel() {
  const [selectedCap, setSelectedCap] = useState<number>(15000);
  const [capData, setCapData] = useState<NormCapitalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showAllVariants, setShowAllVariants] = useState(false);

  useEffect(() => {
    setLoading(true);
    setCapData(null);
    fetch(`/api/white-swan-final?capital=${selectedCap}`)
      .then(r => r.json())
      .then(d => { setCapData(d as NormCapitalData); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedCap]);

  const isFail = capData?.capitalAssessment === 'MARGIN_FAIL';
  const finRec = capData?.finalists?.['FINAL_RECOMMENDATION'];
  const finRecVariant = finRec
    ? capData?.variants?.find(v => v.variantId === finRec.variantId)
    : null;

  // Primary display: FINAL_CANDIDATE variants only (CONSERVATIVE tier), sorted by OOS CAGR desc
  const fcVariants = (capData?.variants ?? [])
    .filter(v => v.finalStatus === 'FINAL_CANDIDATE' && v.sizingTier === 'CONSERVATIVE')
    .sort((a, b) => b.alpha.oosCAGR - a.alpha.oosCAGR);

  // AGGRESSIVE variants (MARGIN_FAIL)
  const aggVariants = (capData?.variants ?? [])
    .filter(v => v.finalStatus === 'AGGRESSIVE' && v.sizingTier === 'CONSERVATIVE')
    .sort((a, b) => b.alpha.netCAGR_1c - a.alpha.netCAGR_1c);

  // For charts — use finRecVariant or best FC variant
  const heroVariant = finRecVariant ?? fcVariants[0] ?? aggVariants[0] ?? null;

  // IS vs OOS chart data (top 5 FINAL_CANDIDATE or AGGRESSIVE)
  const isOosData = (fcVariants.length > 0 ? fcVariants : aggVariants)
    .slice(0, 5)
    .map(v => ({
      label: v.eurFilter.replace('_', '') + '+' + v.d2hFilter.replace('D2_', '') + '+' + v.gldFilter.replace('GLD_', ''),
      IS: Number((v.alpha.isCAGR ?? 0).toFixed(2)),
      OOS: Number(v.alpha.oosCAGR.toFixed(2)),
    }));

  // Cost breakdown chart (for hero variant)
  const costData = heroVariant ? [
    { name: 'EURUSD 6E', value: Number(((heroVariant.tradeCounts.eurusd * 4.10) / 18.52 * heroVariant.contracts.n_6E).toFixed(2)) },
    { name: 'DAX FDXS', value: Number((((heroVariant.tradeCounts.dax1h + heroVariant.tradeCounts.dax2h) * 0.76) / 18.52 * heroVariant.contracts.n_FDXS).toFixed(2)) },
    { name: 'Gold MGC', value: Number(((heroVariant.tradeCounts.gold * 2.63) / 18.52 * heroVariant.contracts.n_MGC).toFixed(2)) },
  ] : [];

  // Margin breakdown chart
  const marginData = heroVariant ? [
    { name: '6E', value: heroVariant.contracts.n_6E * 2287, pct: Number(((heroVariant.contracts.n_6E * 2287) / heroVariant.totalMargin_EUR * 100).toFixed(1)) },
    { name: 'FDXS', value: heroVariant.contracts.n_FDXS * 880, pct: Number(((heroVariant.contracts.n_FDXS * 880) / heroVariant.totalMargin_EUR * 100).toFixed(1)) },
    { name: 'MGC', value: heroVariant.contracts.n_MGC * 735, pct: Number(((heroVariant.contracts.n_MGC * 735) / heroVariant.totalMargin_EUR * 100).toFixed(1)) },
  ] : [];

  // Capital comparison data (from each level's best)
  const capCompareData = FINAL_CAPS.map(c => ({
    capital: `€${c / 1000}k`,
    label: c === selectedCap ? `€${c / 1000}k ●` : `€${c / 1000}k`,
  }));

  const wfColor = (pass: boolean) => pass ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold font-montserrat text-[#e2ca7a]">Final White Swan</h2>
          <p className="text-xs text-[#737373] mt-0.5">
            IBKR real costs confirmed · 30% margin gate · RESEARCH_CANDIDATE · 2026-08-14
          </p>
        </div>
        <div className="text-xs border border-[#2a2b30] rounded px-3 py-1.5 font-mono text-[#737373] space-x-3">
          <span>6E: <span className="text-[#e2ca7a]">€4.10/rt</span></span>
          <span>FDXS: <span className="text-[#e2ca7a]">€0.76/rt</span></span>
          <span>MGC: <span className="text-[#e2ca7a]">€2.63/rt</span></span>
        </div>
      </div>

      {/* Capital tabs */}
      <div className="flex gap-2 flex-wrap">
        {FINAL_CAPS.map(cap => (
          <button key={cap} onClick={() => setSelectedCap(cap)}
            className={cn('px-4 py-2 rounded text-sm font-mono font-semibold border transition-all',
              selectedCap === cap
                ? 'bg-[#bf9d4a] border-[#e2ca7a] text-black'
                : 'border-[#2a2b30] text-[#737373] hover:border-[#e2ca7a] hover:text-[#e2ca7a]'
            )}>
            €{cap / 1000}k
          </button>
        ))}
        <span className="text-xs text-[#737373] self-center ml-2">
          Min capital for 30% rule: <span className="font-mono text-[#e2ca7a]">€13,007</span>
        </span>
      </div>

      {loading && <div className="text-xs text-[#737373] py-4 animate-pulse">Loading…</div>}

      {!loading && capData && (
        <>
          {/* Margin gate assessment banner */}
          {isFail ? (
            <div className="rounded border border-red-600/40 bg-red-900/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-red-400 font-bold text-sm">⚠ MARGIN_FAIL</span>
                <span className="text-xs text-red-400/70 font-mono">{capData.capitalAssessmentNote}</span>
              </div>
              <div className="text-xs text-red-300/60 mt-1">
                Minimum 1×6E + 1×FDXS + 1×MGC = €3,902 total margin. At €{(selectedCap / 1000).toFixed(1)}k this is{' '}
                <span className="font-mono text-red-400">{((3902 / selectedCap) * 100).toFixed(1)}%</span> of capital — exceeds 30% strict cap.
                All variants shown below are <strong>AGGRESSIVE</strong> (not FINAL_CANDIDATE).
                Minimum compliant starting capital: <span className="font-mono text-[#e2ca7a]">€13,007</span>.
              </div>
            </div>
          ) : (
            <div className="rounded border border-emerald-600/30 bg-emerald-900/10 p-3 flex items-center gap-3">
              <span className="text-emerald-400 font-bold">✓ MARGIN COMPLIANT</span>
              <span className="text-xs text-emerald-400/70">{capData.capitalAssessmentNote}</span>
              <span className="text-xs text-[#737373] ml-auto">
                {capData.capitalSummary?.finalCandidates ?? 0} FINAL_CANDIDATE variants
              </span>
            </div>
          )}

          {/* Hero KPI row */}
          {heroVariant && (
            <>
              <div className="text-xs text-[#737373] uppercase tracking-wide">
                {isFail ? 'Best Aggressive Variant (MARGIN_FAIL)' : 'Final Recommendation'} —{' '}
                <span className="font-mono text-[#e2ca7a]">{heroVariant.eurFilter} · {heroVariant.d2hFilter.replace('D2_','')} · {heroVariant.gldFilter.replace('GLD_','')}</span>
                <span className="ml-2 text-[#737373]">({heroVariant.sizingTier} sizing: {heroVariant.contracts.n_6E}×6E / {heroVariant.contracts.n_FDXS}×FDXS / {heroVariant.contracts.n_MGC}×MGC)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatCard label="Net CAGR (1c)" value={fmtPct(heroVariant.alpha.netCAGR_1c)} sub="pure alpha" />
                <StatCard label="OOS CAGR" value={fmtPct(heroVariant.alpha.oosCAGR)} sub="2019–2026" highlight />
                <StatCard label="Sharpe" value={fmt(heroVariant.alpha.sharpe, 3)} />
                <StatCard label="Calmar" value={fmt(heroVariant.alpha.calmar_1c, 3)} />
                <StatCard label="MaxDD" value={fmtPct(heroVariant.alpha.maxDDFromPeak)} sub="peak-to-trough" />
                <StatCard label="WF Folds" value={`${heroVariant.wf.positiveFolds}/${heroVariant.wf.totalFolds}`} sub={`${(heroVariant.wf.passRate * 100).toFixed(0)}% pass`} highlight />
                <StatCard label="Trades/wk" value={fmt(heroVariant.portfolio.tradesPerWeek, 2)} />
                <StatCard label="IBKR Costs/yr" value={fmtEUR(heroVariant.portfolio.scaledCostsAnnual)} />
                <StatCard label="Cost/NAV" value={fmtPct(heroVariant.portfolio.costPerNAV_pct)} />
                <StatCard label="Margin" value={fmtPct(heroVariant.marginPct)} sub={isFail ? '> 30% — FAIL' : '≤ 30% — PASS'} highlight={!isFail} />
              </div>

              {/* Alpha vs leverage attribution */}
              <div className="rounded border border-[#2a2b30] bg-[#0c0d10] p-4">
                <div className="text-xs font-semibold text-[#737373] uppercase tracking-wide mb-3">Alpha vs Leverage Attribution</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center">
                    <div className="text-xs text-[#737373] mb-1">Gross CAGR (1c)</div>
                    <div className="text-base font-mono font-bold text-[#737373]">{fmtPct(heroVariant.alpha.grossCAGR_1c)}</div>
                    <div className="text-xs text-[#737373]">before costs</div>
                  </div>
                  <div className="text-center border-l border-[#2a2b30]">
                    <div className="text-xs text-[#737373] mb-1">Cost Drag</div>
                    <div className="text-base font-mono font-bold text-red-400">−{fmtPct(heroVariant.alpha.costDrag_pct)}</div>
                    <div className="text-xs text-[#737373]">IBKR real costs</div>
                  </div>
                  <div className="text-center border-l border-[#2a2b30]">
                    <div className="text-xs text-[#737373] mb-1">Net CAGR (1c) = Alpha</div>
                    <div className="text-base font-mono font-bold text-[#e2ca7a]">{fmtPct(heroVariant.alpha.netCAGR_1c)}</div>
                    <div className="text-xs text-[#737373]">pure strategy alpha</div>
                  </div>
                  <div className="text-center border-l border-[#2a2b30]">
                    <div className="text-xs text-[#737373] mb-1">Leverage Return</div>
                    <div className="text-base font-mono font-bold text-blue-400">
                      {Math.abs(heroVariant.portfolio.leverageReturn) < 0.01
                        ? '0.00%'
                        : fmtPct(heroVariant.portfolio.leverageReturn)}
                    </div>
                    <div className="text-xs text-[#737373]">from contract scaling</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-[#737373] border-t border-[#2a2b30] pt-2">
                  Conservative sizing (1×6E / 1×FDXS / 1×MGC) → zero leverage premium. Portfolio CAGR = pure 1c alpha.
                  {heroVariant.serkanComparison && (
                    <span className="ml-2">
                      Serkan reference: {fmtEUR(heroVariant.serkanComparison.serkanAnnual_1c)}/yr vs IBKR real: {fmtEUR(heroVariant.serkanComparison.ibkrRealAnnual_1c)}/yr
                      ({heroVariant.serkanComparison.multiplier.toFixed(2)}× multiplier for this variant)
                    </span>
                  )}
                </div>
              </div>

              {/* IS vs OOS + Cost breakdown charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* IS vs OOS */}
                <div className="rounded-lg border border-[#2a2b30] bg-[#0a0a0a] p-4">
                  <div className="text-xs text-[#737373] mb-3 uppercase tracking-wide">IS vs OOS CAGR — Top Variants</div>
                  {isOosData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={isOosData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2b30" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 9, fill: '#737373' }} tickFormatter={(v: number) => `${v}%`} />
                        <YAxis type="category" dataKey="label" tick={{ fontSize: 8, fill: '#737373' }} width={90} />
                        <Tooltip contentStyle={{ background: '#1c1d20', border: '1px solid #2a2b30', fontSize: 11 }}
                          formatter={(v: unknown) => [`${(v as number).toFixed(2)}%`]} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="IS" fill="#4b5563" name="IS" radius={[0, 2, 2, 0]} />
                        <Bar dataKey="OOS" fill="#e2ca7a" name="OOS" radius={[0, 2, 2, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="text-xs text-[#737373] py-8 text-center">No data</div>}
                </div>

                {/* Cost breakdown + margin breakdown */}
                <div className="space-y-3">
                  <div className="rounded-lg border border-[#2a2b30] bg-[#0a0a0a] p-3">
                    <div className="text-xs text-[#737373] mb-2 uppercase tracking-wide">Annual Cost Breakdown</div>
                    <div className="space-y-1.5">
                      {costData.map(d => (
                        <div key={d.name} className="flex items-center gap-2">
                          <div className="w-20 text-xs text-[#737373] truncate">{d.name}</div>
                          <div className="flex-1 bg-[#1c1d20] rounded h-3 overflow-hidden">
                            <div className="h-full bg-orange-500/60 rounded" style={{ width: `${Math.min(100, (d.value / Math.max(...costData.map(x => x.value)) * 100))}%` }} />
                          </div>
                          <div className="w-16 text-right font-mono text-xs text-orange-400">{fmtEUR(d.value)}</div>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-mono border-t border-[#2a2b30] pt-1 mt-1">
                        <span className="text-[#737373]">Total/yr</span>
                        <span className="text-[#e2ca7a]">{fmtEUR(costData.reduce((s, d) => s + d.value, 0))}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#2a2b30] bg-[#0a0a0a] p-3">
                    <div className="text-xs text-[#737373] mb-2 uppercase tracking-wide">Margin Breakdown</div>
                    <div className="space-y-1.5">
                      {marginData.map(d => (
                        <div key={d.name} className="flex items-center gap-2">
                          <div className="w-12 text-xs text-[#737373]">{d.name}</div>
                          <div className="flex-1 bg-[#1c1d20] rounded h-3 overflow-hidden">
                            <div className="h-full bg-blue-500/50 rounded" style={{ width: `${d.pct}%` }} />
                          </div>
                          <div className="w-20 text-right font-mono text-xs text-blue-400">{fmtEUR(d.value)} ({d.pct}%)</div>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-mono border-t border-[#2a2b30] pt-1 mt-1">
                        <span className="text-[#737373]">Total / Capital</span>
                        <span className={isFail ? 'text-red-400' : 'text-emerald-400'}>
                          {fmtEUR(heroVariant.totalMargin_EUR)} ({fmtPct(heroVariant.marginPct)} {isFail ? '⚠' : '✓'})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Robustification notes */}
              {heroVariant.robustificationNotes && (
                <div className="rounded border border-[#2a2b30] bg-[#0c0d10] p-3 text-xs text-[#737373] space-y-1">
                  <div className="text-[#e2ca7a] font-semibold mb-1">Robustification Check</div>
                  {Object.entries(heroVariant.robustificationNotes).map(([k, v]) => (
                    <div key={k}><span className="text-[#737373]/60 mr-1">{k}:</span>{v}</div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Archetype finalists */}
          {capData.finalists && (
            <>
              <SectionTitle>Archetype Finalists</SectionTitle>
              <div className="space-y-2">
                {Object.entries(capData.finalists).map(([key, fin]) => {
                  const v = capData.variants.find(x => x.variantId === fin.variantId);
                  const archetypeInfo = ARCHETYPE_LABELS[key] ?? { label: key, color: 'text-[#737373]' };
                  const isFinalRec = key === 'FINAL_RECOMMENDATION';
                  return (
                    <div key={key} className={cn(
                      'rounded border p-3',
                      isFinalRec ? 'border-[#e2ca7a]/30 bg-[#e2ca7a]/5' : 'border-[#2a2b30] bg-[#0c0d10]'
                    )}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={cn('font-semibold text-xs', archetypeInfo.color)}>{archetypeInfo.label}</span>
                        <span className="font-mono text-xs text-[#737373]">{fin.variantId.replace('PB_','').replace('_CONSERVATIVE','')}</span>
                        {v && (
                          <span className="ml-auto text-xs font-mono space-x-3">
                            <span className="text-[#e2ca7a]">α{fmtPct(v.alpha.netCAGR_1c)}</span>
                            <span className="text-blue-400">OOS {fmtPct(v.alpha.oosCAGR)}</span>
                            <span>Sh {fmt(v.alpha.sharpe, 3)}</span>
                            <span className="text-red-400">DD {fmtPct(v.alpha.maxDDFromPeak)}</span>
                            <span className={wfColor(v.wf.positiveFolds === v.wf.totalFolds)}>{v.wf.positiveFolds}/{v.wf.totalFolds}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#737373] mt-1">{fin.rationale}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Variants table */}
          {(fcVariants.length > 0 || aggVariants.length > 0) && (
            <>
              <SectionTitle>
                {isFail ? 'All Variants (AGGRESSIVE)' : 'FINAL_CANDIDATE Variants'}
                {' '}
                <span className="text-[#737373] normal-case font-normal text-xs">Conservative 1×6E / 1×FDXS / 1×MGC</span>
              </SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#2a2b30]">
                      {['EUR Filter', 'DAX 2H', 'GLD', 'Status', 'Alpha 1c', 'OOS CAGR', 'IS CAGR', 'Sharpe', 'MaxDD', 'WF', 'Cost/yr', 'OOS/IS'].map(h => (
                        <th key={h} className="text-right first:text-left px-2 py-1.5 text-[#737373] font-normal whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllVariants ? [...fcVariants, ...aggVariants] : fcVariants.slice(0, 12)).map((v) => {
                      const isRec = v.variantId === finRec?.variantId;
                      return (
                        <tr key={v.variantId} className={cn(
                          'border-b border-[#1a1b1e] hover:bg-[#1a1b1e]/50',
                          isRec && 'bg-[#e2ca7a]/5',
                          v.finalStatus === 'AGGRESSIVE' && 'opacity-60'
                        )}>
                          <td className="px-2 py-1.5 font-mono text-[#e2ca7a]">
                            {isRec && <span className="mr-1 text-[#e2ca7a]">★</span>}
                            {v.eurFilter}
                          </td>
                          <td className="px-2 py-1.5 font-mono">{v.d2hFilter.replace('D2_','')}</td>
                          <td className="px-2 py-1.5 text-[#737373]">{v.gldFilter.replace('GLD_','')}</td>
                          <td className="px-2 py-1.5">
                            <span className={cn('text-xs font-semibold', v.finalStatus === 'FINAL_CANDIDATE' ? 'text-emerald-400' : 'text-orange-400')}>
                              {v.finalStatus === 'FINAL_CANDIDATE' ? 'FC' : 'AGG'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-semibold text-[#e2ca7a]">{fmtPct(v.alpha.netCAGR_1c)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-blue-400">{fmtPct(v.alpha.oosCAGR)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-[#737373]">{fmtPct(v.alpha.isCAGR)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmt(v.alpha.sharpe, 3)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-red-400">{fmtPct(v.alpha.maxDDFromPeak)}</td>
                          <td className={cn('px-2 py-1.5 text-right font-mono font-semibold',
                            v.wf.passRate >= 0.7 ? 'text-emerald-400' : v.wf.passRate >= 0.5 ? 'text-yellow-400' : 'text-red-400')}>
                            {v.wf.positiveFolds}/{v.wf.totalFolds}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-orange-400">{fmtEUR(v.portfolio.scaledCostsAnnual)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-[#737373]">{fmt(v.wf.oosIsRatio, 2)}×</td>
                        </tr>
                      );
                    })}
                    {aggVariants.length > 0 && fcVariants.length > 0 && !showAllVariants && (
                      <tr>
                        <td colSpan={12} className="px-2 py-2 text-xs text-[#737373] text-center">
                          +{aggVariants.length} AGGRESSIVE variants (MARGIN_FAIL) hidden —{' '}
                          <button onClick={() => setShowAllVariants(true)} className="text-[#e2ca7a] hover:underline">show all</button>
                        </td>
                      </tr>
                    )}
                    {showAllVariants && aggVariants.length > 0 && (
                      <tr>
                        <td colSpan={12} className="px-2 py-1 text-xs text-red-400/60 italic">
                          ↓ AGGRESSIVE variants below (MARGIN_FAIL — margin &gt; 30%, not FINAL_CANDIDATE)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Capital comparison bar across all 4 levels */}
          <SectionTitle>Capital Comparison — All Levels</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#2a2b30]">
                  {['Capital', 'Gate', 'FINAL_CANDIDATEs', 'Best Alpha 1c', 'Best OOS CAGR', 'Best Sharpe', 'MaxDD', 'Margin%', 'Note'].map(h => (
                    <th key={h} className="text-right first:text-left px-2 py-1.5 text-[#737373] font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  { cap: 10000, assess: 'MARGIN_FAIL', fc: 0, alpha: 13.62, oos: 24.39, sh: 1.326, dd: 11.01, mg: 39.0, note: 'Min capital €13,007' },
                  { cap: 12500, assess: 'MARGIN_FAIL', fc: 0, alpha: 12.29, oos: 21.51, sh: 1.389, dd: 9.80,  mg: 31.2, note: 'Only 1.2% over limit' },
                  { cap: 15000, assess: 'PASS',        fc: 24, alpha: 11.25, oos: 19.32, sh: 1.437, dd: 8.82,  mg: 26.0, note: '← FIRST SWEET SPOT' },
                  { cap: 20000, assess: 'PASS',        fc: 24, alpha: 9.72,  oos: 16.14, sh: 1.504, dd: 7.36,  mg: 19.5, note: 'More room to scale' },
                ] as const).map(row => (
                  <tr key={row.cap} className={cn(
                    'border-b border-[#1a1b1e] hover:bg-[#1a1b1e]/50',
                    row.cap === selectedCap && 'bg-[#1c1d20]'
                  )}>
                    <td className="px-2 py-2 font-mono font-bold text-[#e2ca7a]">
                      <button onClick={() => setSelectedCap(row.cap)} className="hover:underline">€{row.cap / 1000}k</button>
                    </td>
                    <td className="px-2 py-2">
                      <span className={row.assess === 'PASS' ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                        {row.assess}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{row.fc}</td>
                    <td className="px-2 py-2 text-right font-mono text-[#e2ca7a]">{row.alpha.toFixed(2)}%</td>
                    <td className="px-2 py-2 text-right font-mono text-blue-400">{row.oos.toFixed(2)}%</td>
                    <td className="px-2 py-2 text-right font-mono">{row.sh.toFixed(3)}</td>
                    <td className="px-2 py-2 text-right font-mono text-red-400">{row.dd.toFixed(2)}%</td>
                    <td className={cn('px-2 py-2 text-right font-mono', row.assess === 'PASS' ? 'text-emerald-400' : 'text-red-400')}>
                      {row.mg.toFixed(1)}%
                    </td>
                    <td className="px-2 py-2 text-[#737373]">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Disclaimer */}
          <div className="rounded border border-yellow-700/30 bg-yellow-900/10 p-3 text-xs text-yellow-400/80 space-y-1">
            <div className="font-semibold text-yellow-400">RESEARCH_CANDIDATE — not production truth</div>
            <div>All results require explicit Jeroen approval before live use. IBKR costs confirmed 2026-08-14. No navSeries available in normalized data — equity curves require separate computation. Margin reference is current IBKR initial margin, not historical backtest margin.</div>
          </div>

          {/* Component Quality — all 17 */}
          <ComponentQualitySection />

          {/* Serkan Pre-Check */}
          <SerkanPreCheckSection />

          {/* Definition of Done gate */}
          <div className="rounded border border-[#2a2b30] bg-[#0c0d10] p-3 text-xs space-y-1">
            <div className="text-[#e2ca7a] font-semibold mb-2">Definition of Done — Gate Status (as of 2026-08-14)</div>
            {[
              { done: true,  text: 'EEM/IWM clarified: EEM = DATA_BLOCKED, IWM = SOLVABLE (M2K)' },
              { done: true,  text: '6E ex-ante filter framework designed — E6_MonLong baseline confirmed' },
              { done: true,  text: 'All 17 components audited with instrument, cost, and status' },
              { done: true,  text: 'Contract sizing and ATR risk weights computed (4-component)' },
              { done: true,  text: 'Investor capital tiers determined (4-component + full 17-component)' },
              { done: true,  text: 'Serkan pre-check complete — IBKR cheaper than Serkan for this portfolio' },
              { done: true,  text: 'All capital levels (10k/12.5k/15k/20k) with strict 30% gate' },
              { done: false, text: '6E ATR filter backtest — NEEDS_BRAIN_DATA' },
              { done: false, text: 'GLD monthly regime filter backtest — NEEDS_BRAIN_DATA' },
              { done: false, text: 'IWM seasonal signal defined + M2K backtest — NEEDS_BRAIN_DATA' },
              { done: false, text: 'EEM resolution — DATA_BLOCKED (SGX account + data required)' },
              { done: false, text: '13 seasonal component backtests — NEEDS_BRAIN_DATA (all NO_TRADE_DATA)' },
              { done: false, text: 'DAX1H/2H simultaneity analysis — 2×FDXS or confirmed non-overlap' },
            ].map(({ done, text }) => (
              <div key={text} className="flex items-start gap-2">
                <span className={done ? 'text-emerald-400 mt-0.5' : 'text-red-400 mt-0.5'}>
                  {done ? '✓' : '○'}
                </span>
                <span className={done ? 'text-[#737373]' : 'text-red-400/70'}>{text}</span>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-[#2a2b30] font-semibold text-red-400">
              VERDICT: NOT_FINAL — Brain data access required to complete remaining backtests.
              Current status: 4-component portfolio confirmed ROBUST. 13 seasonals + IWM: NO_DATA.
            </div>
          </div>
        </>
      )}

      {/* Research Archive (old phase=final data) */}
      <div className="border-t border-[#2a2b30] pt-4 mt-6">
        <button onClick={() => setShowArchive(!showArchive)}
          className="text-xs text-[#737373] hover:text-[#e2ca7a] transition-colors flex items-center gap-2">
          <span>{showArchive ? '▼' : '▶'}</span>
          <span>Research Archive — Prior Phase B / Phase Final variants (old cost model)</span>
        </button>
        {showArchive && (
          <div className="mt-3">
            <ResearchArchivePbPanel />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Research Archive Panel (old FinalCandidatesPanel, preserved) ─────────────

type OldArchetype = 'BALANCED' | 'RETURN' | 'RISK' | 'COST' | 'ROBUST';

interface OldFinalVariant {
  comboKey: string;
  eurFilter: string;
  d1hFilter: string;
  d2hFilter: string;
  gldFilter: string;
  contracts: { n_6E: number; n_DAX: number; dax_instrument: string; n_GC: number; gc_instrument: string };
  scaledNetCAGR: number;
  maxDDFromPeak: number;
  sharpe: number;
  calmar: number;
  totalMargin: number;
  marginPct: number;
  annualCosts: number;
  costImpactPct: number;
  wfPassRate: number;
  wfPositiveFolds: number;
  wfTotalFolds: number;
  ibkrRealAnnualCosts_1c: number;
  scaledNetCAGR_1c: number;
}

interface OldFinalCapitalData {
  capital: number;
  contractInstruments: { eurusd: string; dax: string; gold: string };
  portfolios: Record<OldArchetype, OldFinalVariant[]>;
  eligibleCount: number;
}

function ResearchArchivePbPanel() {
  const CAPS = [10000, 12500, 15000, 20000, 25000, 50000];
  const ARCHETYPES: OldArchetype[] = ['BALANCED', 'RETURN', 'RISK', 'COST', 'ROBUST'];
  const ARCHETYPE_DESC: Record<OldArchetype, string> = {
    BALANCED: 'Best CAGR/MaxDD ratio — diversified risk',
    RETURN: 'Highest scaled net CAGR',
    RISK: 'Lowest MaxDD with CAGR > 8%',
    COST: 'Lowest annual costs with CAGR > 8%',
    ROBUST: 'Highest WF pass rate',
  };

  const [selectedCap, setSelectedCap] = useState<number>(12500);
  const [selectedArchetype, setSelectedArchetype] = useState<OldArchetype>('BALANCED');
  const [capData, setCapData] = useState<OldFinalCapitalData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/white-swan-lab?phase=final&capital=${selectedCap}`)
      .then(r => r.json())
      .then(d => {
        const raw = Array.isArray(d.variants) ? null : d;
        setCapData(raw as OldFinalCapitalData | null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedCap]);

  const variants: OldFinalVariant[] = capData?.portfolios?.[selectedArchetype] ?? [];
  const instr = capData?.contractInstruments;

  const wfColor = (rate: number) =>
    rate >= 0.7 ? 'text-emerald-400' : rate >= 0.5 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-4 bg-[#0a0a0a] rounded border border-[#2a2b30] p-4">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-[#737373] uppercase tracking-wide">Research Archive</span>
        <span className="text-xs text-[#737373]">Phase B/Final variants — Serkan-priced, relaxed margin threshold (85%)</span>
        {instr && (
          <div className="ml-auto text-xs text-[#737373] font-mono space-x-2">
            <span>EURUSD: <span className="text-[#e2ca7a]">{instr.eurusd}</span></span>
            <span>DAX: <span className="text-[#e2ca7a]">{instr.dax}</span></span>
            <span>Gold: <span className="text-[#e2ca7a]">{instr.gold}</span></span>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {CAPS.map(cap => (
          <button key={cap} onClick={() => setSelectedCap(cap)}
            className={cn('px-3 py-1 rounded text-xs font-mono font-semibold border transition-all',
              selectedCap === cap ? 'bg-[#bf9d4a]/30 border-[#e2ca7a]/50 text-[#e2ca7a]' : 'border-[#2a2b30] text-[#737373] hover:border-[#737373]'
            )}>
            €{cap >= 1000 ? `${cap / 1000}k` : cap}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {ARCHETYPES.map(a => (
          <button key={a} onClick={() => setSelectedArchetype(a)}
            className={cn('px-2 py-1 rounded text-xs font-semibold border transition-all',
              selectedArchetype === a ? 'bg-[#1c1d20] border-[#e2ca7a]/30 text-[#e2ca7a]/70' : 'border-[#2a2b30] text-[#737373]'
            )}>
            {a}
          </button>
        ))}
        <span className="text-xs text-[#737373] self-center ml-1">{ARCHETYPE_DESC[selectedArchetype]}</span>
      </div>

      {loading && <div className="text-xs text-[#737373]">Loading…</div>}
      {!loading && variants.length === 0 && (
        <div className="text-xs text-yellow-400/60 py-3">No archive data for this capital/archetype.</div>
      )}
      {!loading && variants.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#2a2b30]">
                {['#', 'Combo', 'EUR Filter', 'DAX 2H', 'GLD', 'Contracts', 'Net CAGR', 'MaxDD', 'Sharpe', 'WF', 'Margin', 'Costs/yr'].map(h => (
                  <th key={h} className="text-right first:text-left px-2 py-1.5 text-[#737373] font-normal whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => (
                <tr key={v.comboKey} className={cn('border-b border-[#1a1b1e] hover:bg-[#1a1b1e]/30', i === 0 && 'bg-[#e2ca7a]/3')}>
                  <td className="px-2 py-1.5 text-[#737373] font-mono">{i + 1}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px] max-w-[100px] truncate" title={v.comboKey}>{v.comboKey}</td>
                  <td className="px-2 py-1.5 font-mono text-[#e2ca7a]/80">{v.eurFilter}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{(v.d2hFilter ?? '').replace('D2_', '')}</td>
                  <td className="px-2 py-1.5 text-[#737373]">{(v.gldFilter ?? '').replace('GLD_', '')}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-[10px]">
                    {v.contracts ? `${v.contracts.n_6E}×6E/${v.contracts.n_DAX}×${v.contracts.dax_instrument}/${v.contracts.n_GC}×${v.contracts.gc_instrument}` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[#e2ca7a]/80">{v.scaledNetCAGR?.toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono text-red-400/70">{v.maxDDFromPeak?.toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono">{v.sharpe?.toFixed(2)}</td>
                  <td className={cn('px-2 py-1.5 text-right font-mono', wfColor(v.wfPassRate))}>
                    {v.wfPositiveFolds}/{v.wfTotalFolds}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[#737373]">{v.marginPct?.toFixed(0)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono text-orange-400/70">€{v.annualCosts?.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-xs text-[#737373] italic">
        ⚠ Archive data uses Serkan €1.70/rt cost model and 85% margin threshold. These are NOT FINAL_CANDIDATE by strict rules. Use Final White Swan tab for compliant results.
      </div>
    </div>
  );
}

// ─── Strategy Quality Panel ───────────────────────────────────────────────────

function StrategyQualityPanel({ data }: { data: Record<string, unknown> | null }) {
  const strategies = [
    { key: 'eurusd', label: 'EURUSD 30M', bestRule: 'E9 Mon+Q3', status: 'ROBUST' },
    { key: 'dax2h', label: 'DAX 2H', bestRule: 'D2 High-Vol Years', status: 'ROBUST' },
    { key: 'dax1h', label: 'DAX 1H', bestRule: 'D1 Baseline (all LONG)', status: 'BASELINE' },
    { key: 'gld', label: 'GLD Thursday', bestRule: 'GLD BestMonths (top 4 months)', status: 'IMPROVED' },
    { key: 'seasonals', label: 'Seasonals', bestRule: 'SB/SPY strongest OOS', status: 'MIXED' },
  ];

  const statusColor = (s: string) =>
    s === 'ROBUST' ? 'text-emerald-400' : s === 'IMPROVED' ? 'text-blue-400' :
    s === 'MIXED' ? 'text-yellow-400' : s === 'NEEDS_REDESIGN' ? 'text-red-400' : 'text-[#737373]';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold font-montserrat text-[#e2ca7a]">Strategy Quality</h2>
        <span className="text-xs text-[#737373]">Phase B robustness analysis — ex-ante filters only</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#2a2b30]">
              {['Strategy', 'Best Ex-Ante Rule', 'Status', 'Note'].map(h => (
                <th key={h} className="text-left px-3 py-2 text-[#737373] font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategies.map(s => (
              <tr key={s.key} className="border-b border-[#1a1b1e] hover:bg-[#1a1b1e]/50">
                <td className="px-3 py-2 font-semibold text-[#e2ca7a]">{s.label}</td>
                <td className="px-3 py-2 font-mono text-xs">{s.bestRule}</td>
                <td className={cn('px-3 py-2 font-semibold', statusColor(s.status))}>{s.status}</td>
                <td className="px-3 py-2 text-[#737373]">
                  {data?.[s.key] != null ? 'Data loaded' : 'Phase B data — run locally for full analysis'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.eurusd != null && (() => {
        const d = data!.eurusd as Record<string, unknown>;
        const filters = (d.filters as Array<Record<string, unknown>>) ?? [];
        return (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#e2ca7a]">EURUSD — Filter Robustness</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#2a2b30]">
                    {['Filter', 'Trades', 'OOS Net', 'IS Net', 'Expectancy', 'Verdict'].map(h => (
                      <th key={h} className="text-right first:text-left px-2 py-1 text-[#737373] font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filters.map((f, i) => (
                    <tr key={i} className="border-b border-[#1a1b1e]">
                      <td className="px-2 py-1 font-mono text-[#e2ca7a]">{String(f.filterId ?? f.label ?? '')}</td>
                      <td className="px-2 py-1 text-right">{String(f.trades ?? '—')}</td>
                      <td className={cn('px-2 py-1 text-right font-mono', Number(f.oosNet) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        €{Number(f.oosNet ?? 0).toFixed(0)}
                      </td>
                      <td className={cn('px-2 py-1 text-right font-mono', Number(f.isNet) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        €{Number(f.isNet ?? 0).toFixed(0)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">€{Number(f.expectancy ?? 0).toFixed(2)}</td>
                      <td className={cn('px-2 py-1 text-right font-semibold', statusColor(String(f.verdict ?? 'UNKNOWN')))}>
                        {String(f.verdict ?? '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      <div className="rounded border border-yellow-700/30 bg-yellow-900/10 p-3 text-xs text-yellow-400 space-y-1">
        <div className="font-semibold">ZW Seasonal — LOW_CONFIDENCE_SEASONAL</div>
        <div className="text-[#737373]">Only 2 of 6 OOS years positive. 1 contract retained. True entry-window robustness requires OHLCV data for shifted entry backtest.</div>
      </div>
    </div>
  );
}

// ─── IBKR Costs Panel ────────────────────────────────────────────────────────

function IbkrCostsPanel({ data }: { data: Record<string, unknown> | null }) {
  const serkanRef = { costPerSideEUR: 0.85, costRoundturnEUR: 1.70 };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold font-montserrat text-[#e2ca7a]">IBKR Cost Matrix</h2>
        <span className="text-xs text-[#737373]">Real all-in execution costs vs Serkan reference</span>
      </div>

      <div className="rounded border border-[#2a2b30] bg-[#141517] p-4 space-y-2">
        <div className="text-xs font-semibold text-[#737373] uppercase tracking-wide">Serkan Reference (all prior phases)</div>
        <div className="flex gap-6 text-sm">
          <div><span className="text-[#737373]">Per side: </span><span className="text-[#e2ca7a] font-mono">€0.85</span></div>
          <div><span className="text-[#737373]">Roundturn: </span><span className="text-[#e2ca7a] font-mono">€{serkanRef.costRoundturnEUR.toFixed(2)}</span></div>
          <div><span className="text-[#737373]">Status: </span><span className="text-blue-400">REFERENCE_ONLY</span></div>
        </div>
      </div>

      {data ? (() => {
        const d = data as Record<string, unknown>;
        const instruments = (d.instruments as Array<Record<string, unknown>>) ?? [];
        return (
          <div className="space-y-4">
            {d.researchNotes != null && (
              <div className="rounded border border-[#2a2b30] bg-[#0c0d10] p-3 text-xs text-[#737373] leading-relaxed">
                <span className="text-[#e2ca7a] font-semibold mr-1">Research notes:</span>
                {String(d.researchNotes)}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#2a2b30]">
                    {['Instrument', 'Ticker', 'Size', 'IBKR/Side', 'Exch/Side', 'Reg/Side', 'All-in/Side', 'Roundturn €', 'vs Serkan', 'Status'].map(h => (
                      <th key={h} className="text-right first:text-left px-2 py-1.5 text-[#737373] font-normal whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {instruments.flatMap((inst) => {
                    const variants = (inst.variants as Array<Record<string, unknown>>) ?? [];
                    return variants.map((v, vi) => {
                      const roundturnEUR = Number(v.allInRoundturnEUR ?? v.allInRoundturn ?? 0);
                      const diff = roundturnEUR > 0 ? roundturnEUR - serkanRef.costRoundturnEUR : null;
                      const statusStr = String(v.status ?? (v.verified ? 'CONFIRMED' : 'NEEDS_VERIFICATION'));
                      return (
                        <tr key={`${inst.strategyId}-${vi}`} className="border-b border-[#1a1b1e] hover:bg-[#1a1b1e]/40">
                          <td className="px-2 py-1 text-[#e2ca7a] whitespace-nowrap">{vi === 0 ? String(inst.name ?? inst.strategyId ?? '') : ''}</td>
                          <td className="px-2 py-1 font-mono font-semibold">{String(v.ticker ?? '')}</td>
                          <td className="px-2 py-1 text-[#737373]">{String(v.size ?? v.contractType ?? '')}</td>
                          <td className="px-2 py-1 text-right font-mono">{v.ibkrCommissionPerSide != null ? `€${Number(v.ibkrCommissionPerSide).toFixed(2)}` : '—'}</td>
                          <td className="px-2 py-1 text-right font-mono">{v.exchangeFeePerSide != null ? `€${Number(v.exchangeFeePerSide).toFixed(2)}` : <span className="text-yellow-500">?</span>}</td>
                          <td className="px-2 py-1 text-right font-mono text-[#737373]">{v.regulatoryFeePerSide != null ? `€${Number(v.regulatoryFeePerSide).toFixed(2)}` : '—'}</td>
                          <td className="px-2 py-1 text-right font-mono text-[#e2ca7a]">{v.allInPerSide != null ? `€${Number(v.allInPerSide).toFixed(2)}` : <span className="text-yellow-500">?</span>}</td>
                          <td className="px-2 py-1 text-right font-mono font-semibold">{roundturnEUR > 0 ? `€${roundturnEUR.toFixed(2)}` : <span className="text-yellow-500">?</span>}</td>
                          <td className={cn('px-2 py-1 text-right font-mono', diff == null ? 'text-[#737373]' : diff > 0 ? 'text-red-400' : 'text-emerald-400')}>
                            {diff != null ? `${diff >= 0 ? '+' : ''}€${diff.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {statusStr === 'CONFIRMED' ? (
                              <span className="text-emerald-400 font-semibold">✓ OK</span>
                            ) : (
                              <span className="text-yellow-400">⚠ VERIFY</span>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
            {Array.isArray(d.verificationPriority) && (d.verificationPriority as string[]).length > 0 && (
              <div className="rounded border border-yellow-700/30 bg-yellow-900/10 p-3 space-y-1">
                <div className="text-xs font-semibold text-yellow-400 mb-1">Verification required before production use:</div>
                {(d.verificationPriority as string[]).map((item, i) => (
                  <div key={i} className="text-xs text-yellow-300/70 pl-3">• {item}</div>
                ))}
              </div>
            )}
          </div>
        );
      })() : (
        <div className="flex flex-col items-center justify-center py-12 text-[#737373] gap-2">
          <div className="text-[#e2ca7a] text-sm font-semibold">IBKR Cost Research — Pending</div>
          <div className="text-xs text-center max-w-xs">
            Real IBKR cost data is being researched from official sources.
          </div>
          <div className="mt-3 text-xs font-mono border border-[#2a2b30] rounded px-3 py-1">
            Serkan reference active: €0.85/side · €1.70/roundturn
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WhiteSwanAnalytics() {
  const [activeTab, setActiveTab] = useState<'final' | 'quality' | 'costs' | 'analytics'>('final');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNAV, setSelectedNAV] = useState(25000);
  const [qualityData, setQualityData] = useState<Record<string, unknown> | null>(null);
  const [costsData, setCostsData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch('/api/white-swan-robustness?type=eurusd')
      .then(r => r.json()).then(d => { if (!d.unavailable) setQualityData(prev => ({ ...prev, eurusd: d.data })); }).catch(() => {});
    fetch('/api/white-swan-robustness?type=dax2h')
      .then(r => r.json()).then(d => { if (!d.unavailable) setQualityData(prev => ({ ...prev, dax2h: d.data })); }).catch(() => {});
    fetch('/api/white-swan-robustness?type=gld')
      .then(r => r.json()).then(d => { if (!d.unavailable) setQualityData(prev => ({ ...prev, gld: d.data })); }).catch(() => {});
    fetch('/api/white-swan-robustness?type=seasonals')
      .then(r => r.json()).then(d => { if (!d.unavailable) setQualityData(prev => ({ ...prev, seasonals: d.data })); }).catch(() => {});
    fetch('/api/white-swan-costs')
      .then(r => r.json()).then(d => { if (!d.unavailable) setCostsData(d.data); }).catch(() => {});
  }, []);

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

  const analyticsUnavailable = !loading && (error !== null || !data ||
    (!data.capitalScenarios?.length && !data.riskMetrics?.capitalScenarios?.length));

  const scenarios: CapitalScenario[] = data
    ? (data.capitalScenarios?.length ? data.capitalScenarios : (data.riskMetrics?.capitalScenarios ?? []))
    : [];

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
          18.5-year simulation — 15 active strategies / 17 components — RESEARCH_CANDIDATE
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { id: 'final', label: 'Final White Swan' },
          { id: 'quality', label: 'Strategy Quality' },
          { id: 'costs', label: 'IBKR Costs' },
          { id: 'analytics', label: 'Capital Analytics' },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'px-4 py-2 rounded text-sm font-semibold transition-all',
              activeTab === id
                ? 'bg-[#bf9d4a] border border-[#e2ca7a] text-black'
                : 'border border-[#2a2b30] text-[#737373] hover:border-[#e2ca7a] hover:text-[#e2ca7a]'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'final' && <FinalWhiteSwanPanel />}

      {activeTab === 'quality' && (
        <div className="space-y-6">
          <StrategyQualityPanel data={qualityData} />
          <div className="border-t border-[#2a2b30] pt-4">
            <div className="text-xs text-[#737373] mb-3">Detailed Phase B portfolio variant analysis</div>
            <PortfolioLab />
          </div>
        </div>
      )}
      {activeTab === 'costs' && <IbkrCostsPanel data={costsData} />}

      {activeTab === 'analytics' && analyticsUnavailable && (
        <div className="flex flex-col items-center justify-center py-16 text-[#737373] gap-3">
          <div className="text-[#e2ca7a] text-sm font-semibold">Capital Analytics — not available in cloud preview</div>
          <div className="text-xs max-w-sm text-center">
            Analytics data requires local Brain path. Run locally or use Final White Swan tab above.
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

      {/* EQUITY CURVE + DRAWDOWN */}
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

      {/* COST SENSITIVITY + STRATEGY COST DRIVERS */}
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
