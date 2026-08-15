'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface KPIs {
  // Core KPIs (real historical series)
  netCAGR: number; grossCAGR: number; sharpe: number; sortino: number; calmar: number;
  maxDD_Pct: number; maxDD_EUR: number; profitFactor: number;
  winRate: number; tradesPerWeek: number; annualCosts: number; annualCostPct: number;
  bestDay: number; worstDay: number; years: number;
  totalRawTrades: number; totalWeightedTrades: number;
  startNAV: number; endNAV: number; netProfit: number; totalReturnPct: number;
  // Legacy optional fields (from older compute versions)
  oosCAGR?: number; isCAGR?: number; maxDD?: number;
  ibkrCostsAnnual?: number; costPerNAV?: number; marginPct?: number; marginEUR?: number;
  wfFolds?: string; expectancyEUR?: number; dataSource?: string;
}
interface Contracts {
  eurusd_30m: number; dax_1h: number; dax_2h: number; gld_thursday_long: number;
  // Legacy fields
  n_6E?: number; n_FDXS1?: number; n_FDXS2?: number; n_MGC?: number;
  totalMargin?: number; marginPct?: number; annualCost?: number; weightError?: number;
}
interface NavPoint { date: string; nav: number; navPct?: number; dd: number; netEUR?: number; grossEUR?: number }
interface YearlyReturn { year: number; returnPct: number; netEUR: number; costsEUR: number; navStart: number; navEnd: number }
interface CapitalData {
  capital: number; assessment: string;
  kpis: KPIs; contracts: Contracts; targetWeights: Record<string, number>;
  costs: Record<string, unknown>;
  margin: Record<string, unknown>;
  navSeries: NavPoint[]; yearlyReturns: YearlyReturn[];
}
interface CapitalRow {
  capital: number; assessment: string; contracts: string;
  netCAGR: number; grossCAGR: number; sharpe: number; sortino: number; calmar: number;
  maxDD_Pct: number; maxDD_EUR: number; costAnnual: number; costPerNAV: number;
  marginPct: number; weightError: number | null;
  // Legacy optional fields
  oosCAGR?: number; maxDD?: number; dataSource?: string;
}
interface Component17 {
  id: string; label: string; sleeve: string; instrument: string;
  exchange: string; ibkrCost: number; margin: number; tradesYr: number;
  status: string; statusColor: string; wf: string; dataQuality: string; targetWeight: number;
}
interface RepairBaselineRow { label: string; n: number; netEUR: number; costRatioPct?: number; status: string; reason?: string; }
interface RepairCandidateRow extends RepairBaselineRow { isNet?: number; oosNet?: number; profitFactor?: number; tradesPerYear?: number; }
interface SummaryData {
  capitalComparison: CapitalRow[];
  serkanPrecheck: Record<string, unknown>;
  components17: Component17[];
  capitalSummary: Record<string, { kpis: KPIs; contracts: Contracts }>;
  recommendations: {
    core: Record<string, { capital: number; note: string; rating: string }>;
    full?: Record<string, { capital: number; note: string; rating: string }>;
  };
  repairGateStatus?: {
    assessed: string; mandate: string;
    eurusdGate: string; eurusdCandidate: string;
    gldGate: string; gldVerdict: string; zwVerdict: string;
    overallStatus: string; blockingReason: string;
  };
  repairGateComparison?: {
    eurusd_30m: { baseline: RepairBaselineRow; candidate: RepairCandidateRow };
    gld_thursday_long: { baseline: RepairBaselineRow; bestAttempt: RepairBaselineRow & { isNet?: number; oosNet?: number } };
    zw_seasonal: { baseline: RepairBaselineRow; verdict: string };
  };
}

// ─── Colors ────────────────────────────────────────────────────────────────────
const CAP_COLORS: Record<number, string> = {
  10000:  '#ef4444',
  12500:  '#f97316',
  15000:  '#d4a843',
  20000:  '#22c55e',
  25000:  '#3b82f6',
  50000:  '#8b5cf6',
  100000: '#ec4899',
};
const ALL_CAPS = [10000, 12500, 15000, 20000, 25000, 50000, 100000];

const STATUS_COLOR: Record<string, string> = {
  ROBUST: '#22c55e', ACCEPTABLE: '#3b82f6', NEEDS_COST_FILTER: '#d4a843',
  LOW_SAMPLE: '#f97316', SOLVABLE: '#8b5cf6', NO_DATA: '#6b7280', DATA_BLOCKED: '#ef4444',
  FILTERED: '#22c55e', BASELINE: '#3b82f6', PASS_THROUGH: '#64748b', BLOCKED: '#ef4444',
  REJECTED: '#dc2626', RESEARCH_CANDIDATE: '#f59e0b',
};

// ─── Formatting helpers ────────────────────────────────────────────────────────
const fmtEUR = (n: number, d = 0) => `€${n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const fmtPct = (n: number, d = 2) => `${n.toFixed(d)}%`;
const fmtNum = (n: number, d = 2) => n.toFixed(d);

// ─── Shared sub-components ─────────────────────────────────────────────────────
function KpiCard({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="bg-[#111] border border-[#2a2a2a] rounded p-3 flex flex-col gap-1">
      <span className="text-[10px] text-[#666] uppercase tracking-widest">{label}</span>
      <span className={`text-base font-bold ${good === true ? 'text-green-400' : good === false ? 'text-red-400' : 'text-[#d4a843]'}`}>{value}</span>
      {sub && <span className="text-[10px] text-[#555]">{sub}</span>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-px flex-1 bg-[#2a2a2a]" />
      <span className="text-xs text-[#666] uppercase tracking-widest px-2">{children}</span>
      <div className="h-px flex-1 bg-[#2a2a2a]" />
    </div>
  );
}

function AssessmentBadge({ val }: { val: string }) {
  const color = val === 'PASS' ? 'bg-green-900/40 text-green-400 border-green-800'
    : val === 'MARGIN_FAIL' ? 'bg-red-900/40 text-red-400 border-red-800'
    : 'bg-yellow-900/40 text-yellow-400 border-yellow-800';
  return <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${color}`}>{val}</span>;
}

// ─── Section: KPI Strip ────────────────────────────────────────────────────────
function KpiStrip({ kpis, capital, capData }: { kpis: KPIs; capital: number; capData?: CapitalData }) {
  const marginPct = capData?.margin?.pct as number ?? kpis.marginPct ?? 0;
  const marginEUR = capData?.margin?.total as number ?? kpis.marginEUR ?? 0;
  return (
    <div className="grid grid-cols-4 md:grid-cols-6 xl:grid-cols-11 gap-2">
      <KpiCard label="Net CAGR"    value={fmtPct(kpis.netCAGR)}    good={kpis.netCAGR > 10} />
      <KpiCard label="Gross CAGR"  value={fmtPct(kpis.grossCAGR)}  />
      <KpiCard label="Sharpe"      value={fmtNum(kpis.sharpe)}      good={kpis.sharpe > 1.2} />
      <KpiCard label="Sortino"     value={fmtNum(kpis.sortino)}     good={kpis.sortino > 1.5} />
      <KpiCard label="Calmar"      value={fmtNum(kpis.calmar)}      good={kpis.calmar > 1.0} />
      <KpiCard label="MaxDD"       value={fmtPct(kpis.maxDD_Pct ?? kpis.maxDD)} good={(kpis.maxDD_Pct ?? kpis.maxDD ?? 0) < 12} />
      <KpiCard label="MaxDD EUR"   value={fmtEUR(kpis.maxDD_EUR)}   />
      <KpiCard label="Trades/Wk"   value={fmtNum(kpis.tradesPerWeek, 2)} />
      <KpiCard label="Profit Factor" value={fmtNum(kpis.profitFactor)} good={kpis.profitFactor > 1.3} />
      <KpiCard label="Win Rate"    value={fmtPct(kpis.winRate, 1)}  good={kpis.winRate > 50} />
      <KpiCard label="IBKR Cost/yr" value={fmtEUR(kpis.annualCosts ?? kpis.ibkrCostsAnnual ?? 0, 0)} />
      <KpiCard label="Cost/NAV"    value={fmtPct(kpis.annualCostPct ?? kpis.costPerNAV ?? 0, 2)} good={(kpis.annualCostPct ?? kpis.costPerNAV ?? 0) < 2} />
      <KpiCard label="Margin Used" value={fmtPct(marginPct)}    good={marginPct <= 30} />
      <KpiCard label="Capital"     value={fmtEUR(capital)}           />
      <KpiCard label="Net Profit"  value={fmtEUR(kpis.netProfit ?? 0, 0)} />
      <KpiCard label="Total Ret"   value={fmtPct(kpis.totalReturnPct ?? 0)} />
      <KpiCard label="Margin EUR"  value={fmtEUR(marginEUR)}    />
      <KpiCard label="Best Day"    value={fmtEUR(kpis.bestDay ?? 0, 0)} />
      <KpiCard label="Worst Day"   value={fmtEUR(kpis.worstDay ?? 0, 0)} />
      <KpiCard label="Data Src"    value="Historical Backtest" good />
    </div>
  );
}

// ─── Section: Equity + Drawdown Charts ────────────────────────────────────────
function EquityDrawdownCharts({
  selectedCaps, capDataMap, showGross,
}: {
  selectedCaps: number[];
  capDataMap: Record<number, CapitalData>;
  showGross: boolean;
}) {
  const chartData = useMemo(() => {
    const first = capDataMap[selectedCaps[0]];
    if (!first) return [];
    return first.navSeries.map((pt, i) => {
      const row: Record<string, unknown> = { date: pt.date };
      for (const cap of selectedCaps) {
        const capSeries = capDataMap[cap]?.navSeries;
        if (!capSeries?.[i]) continue;
        const p = capSeries[i];
        const costAnnual = (capDataMap[cap]?.costs as { annual: number })?.annual ?? 257.61;
        const startNav = capDataMap[cap]?.navSeries[0]?.nav ?? cap;
        const daysElapsed = i * (18.52 * 252 / 300);
        const costDeduction = costAnnual * (daysElapsed / 252);
        const grossNav = p.nav + costDeduction;
        row[`nav_${cap}`]     = showGross ? parseFloat(((grossNav / startNav - 1) * 100).toFixed(2)) : parseFloat(((p.nav / startNav - 1) * 100).toFixed(2));
        row[`dd_${cap}`]      = p.dd;
      }
      return row;
    });
  }, [selectedCaps, capDataMap, showGross]);

  const formatDate = (d: string) => d?.slice(0, 4) ?? '';
  const fmtPctAxis = (v: number) => `${v.toFixed(0)}%`;

  return (
    <div className="space-y-6">
      {/* Equity curve */}
      <div>
        <p className="text-[10px] text-[#555] mb-2 text-right">
          {showGross ? 'Gross Return (pre-cost)' : 'Net Return (after IBKR commission)'}
          {' '} — Historical Backtest (PB Variant, IBKR Real Costs)
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#555', fontSize: 9 }} minTickGap={60} />
            <YAxis tickFormatter={fmtPctAxis} tick={{ fill: '#555', fontSize: 9 }} width={42} />
            <Tooltip
              contentStyle={{ background: '#0a0a0a', border: '1px solid #2a2a2a', fontSize: 11 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, String(name ?? '').replace('nav_', '€')]}
              labelFormatter={(l) => l as string}
            />
            <Legend formatter={(v) => `€${Number(v.replace('nav_', '')).toLocaleString()}`} wrapperStyle={{ fontSize: 10, color: '#888' }} />
            <ReferenceLine y={0} stroke="#333" />
            {selectedCaps.map(cap => (
              <Line key={cap} type="monotone" dataKey={`nav_${cap}`}
                stroke={CAP_COLORS[cap]} strokeWidth={1.5} dot={false} name={`nav_${cap}`} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Drawdown */}
      <div>
        <p className="text-[10px] text-[#555] mb-2">Drawdown from Peak (%)</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#555', fontSize: 9 }} minTickGap={60} />
            <YAxis tickFormatter={(v) => `-${Math.abs(v).toFixed(0)}%`} tick={{ fill: '#555', fontSize: 9 }} width={42} domain={['auto', 0]} />
            <Tooltip
              contentStyle={{ background: '#0a0a0a', border: '1px solid #2a2a2a', fontSize: 11 }}
              formatter={(v: unknown) => [`-${Math.abs(Number(v)).toFixed(2)}%`, 'DD']}
            />
            {selectedCaps.map(cap => (
              <Line key={cap} type="monotone" dataKey={`dd_${cap}`}
                stroke={CAP_COLORS[cap]} strokeWidth={1} dot={false} name={`dd_${cap}`} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Section: Yearly Returns Bar ──────────────────────────────────────────────
function YearlyReturnsChart({ data, capital }: { data: YearlyReturn[]; capital: number }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
        <XAxis dataKey="year" tick={{ fill: '#555', fontSize: 9 }} />
        <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fill: '#555', fontSize: 9 }} width={36} />
        <Tooltip
          contentStyle={{ background: '#0a0a0a', border: '1px solid #2a2a2a', fontSize: 11 }}
          formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`]}
        />
        <ReferenceLine y={0} stroke="#444" />
        <Bar dataKey="returnPct" name="Net Return">
          {data.map((entry, i) => (
            <Cell key={i} fill={(entry.returnPct as number) >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.7} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Section: Contract & Weight Matrix ────────────────────────────────────────
function ContractWeightMatrix({ capDataMap }: { capDataMap: Record<number, CapitalData> }) {
  const instruments = ['6E', 'DAX1H', 'DAX2H', 'GLD'];
  const targetW: Record<string, number> = { '6E': 30, DAX1H: 20, DAX2H: 30, GLD: 20 };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[#2a2a2a]">
            <th className="text-left text-[#555] px-2 py-1.5 font-normal">Capital</th>
            <th className="text-left text-[#555] px-2 py-1.5 font-normal">Status</th>
            {instruments.map(ins => (
              <th key={ins} colSpan={3} className="text-center text-[#555] px-2 py-1.5 font-normal border-l border-[#1a1a1a]">{ins}</th>
            ))}
            <th className="text-right text-[#555] px-2 py-1.5 font-normal border-l border-[#1a1a1a]">Err∑</th>
            <th className="text-right text-[#555] px-2 py-1.5 font-normal">Margin%</th>
          </tr>
          <tr className="border-b border-[#2a2a2a] text-[9px] text-[#444]">
            <th /><th />
            {instruments.map(ins => (
              <React.Fragment key={ins}>
                <th className="text-center px-1 border-l border-[#1a1a1a]">Tgt%</th>
                <th className="text-center px-1">Real%</th>
                <th className="text-center px-1">Δ</th>
              </React.Fragment>
            ))}
            <th /><th />
          </tr>
        </thead>
        <tbody>
          {ALL_CAPS.map(cap => {
            const d = capDataMap[cap];
            if (!d) return null;
            const c = d.contracts as unknown as Record<string, unknown>;
            const r = (c.realized as Record<string, number>) ?? {};
            // New data: derive realized weights from contract counts × known margin rates
            const MRATES: Record<string, number> = { '6E': 2200, DAX1H: 880, DAX2H: 0, GLD: 822 }; // FDXS shared
            const n6E  = (c.n_6E   ?? c.eurusd_30m        ?? 0) as number;
            const nD1  = (c.n_FDXS1 ?? c.dax_1h           ?? 0) as number;
            const nGLD = (c.n_MGC   ?? c.gld_thursday_long ?? 0) as number;
            const totalM = (d.margin as {total?: number})?.total ?? (n6E*2200 + nD1*880 + nGLD*822);
            const rMap: Record<string, number> = {
              '6E':   r['6E']   ?? (totalM > 0 ? n6E * MRATES['6E']   / totalM * 100 : 0),
              DAX1H:  r.DAX1H   ?? (totalM > 0 ? nD1 * MRATES['DAX1H'] / totalM * 100 : 0),
              DAX2H:  r.DAX2H   ?? (totalM > 0 ? nD1 * MRATES['DAX1H'] / totalM * 100 : 0), // shared FDXS
              GLD:    r.GLD     ?? (totalM > 0 ? nGLD * MRATES['GLD']  / totalM * 100 : 0),
            };
            const marginPct = (d.margin as {pct?: number})?.pct ?? (c.marginPct as number) ?? 0;
            const weightError = (d.kpis as {weightError?: number})?.weightError ?? (c.weightError as number) ?? 0;
            const pass = d.assessment === 'PASS';
            return (
              <tr key={cap} className={`border-b border-[#1a1a1a] ${!pass ? 'opacity-60' : ''}`}>
                <td className="px-2 py-1.5 text-[#ccc] font-mono">{fmtEUR(cap, 0)}</td>
                <td className="px-2 py-1.5"><AssessmentBadge val={d.assessment} /></td>
                {instruments.map(ins => {
                  const tgt = targetW[ins];
                  const real = rMap[ins] ?? 0;
                  const delta = real - tgt;
                  return (
                    <React.Fragment key={ins}>
                      <td className="px-1 py-1.5 text-center text-[#555] border-l border-[#1a1a1a]">{tgt}%</td>
                      <td className="px-1 py-1.5 text-center text-[#ccc]">{real.toFixed(1)}%</td>
                      <td className={`px-1 py-1.5 text-center font-mono text-[9px] ${Math.abs(delta) > 10 ? 'text-orange-400' : 'text-[#666]'}`}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                      </td>
                    </React.Fragment>
                  );
                })}
                <td className="px-2 py-1.5 text-right font-mono text-[#d4a843] border-l border-[#1a1a1a]">
                  {weightError.toFixed(3)}
                </td>
                <td className={`px-2 py-1.5 text-right font-mono ${marginPct > 30 ? 'text-red-400' : 'text-green-400'}`}>
                  {marginPct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[9px] text-[#444] mt-2">
        Target: 6E=30% / DAX1H=20% / DAX2H=30% / GLD=20% risk weight (ATR-vol-based). Integer contract constraint causes weight error.
        Err∑ = Σ|target−realized|. Lower is better. Grey rows = MARGIN_FAIL (≥30% margin).
      </p>
    </div>
  );
}

// ─── Section: Cost Analysis ────────────────────────────────────────────────────
function CostAnalysis({ cap, kpis, serkan }: { cap: number; kpis: KPIs; serkan: SummaryData['serkanPrecheck'] }) {
  const costAnnual = kpis.annualCosts ?? kpis.ibkrCostsAnnual ?? 0;
  const s = serkan as Record<string, number>;
  const byComp = [
    { label: 'EURUSD (6E)', ibkr: 91.84, serkan: 38.08, tradesYr: 22.4, ibkrRt: 4.10, serkanRt: 1.70 },
    { label: 'DAX 1H (FDXS)', ibkr: 53.66, serkan: 120.02, tradesYr: 70.6, ibkrRt: 0.76, serkanRt: 1.70 },
    { label: 'DAX 2H (FDXS)', ibkr: 66.88, serkan: 149.60, tradesYr: 88.0, ibkrRt: 0.76, serkanRt: 1.70 },
    { label: 'Gold (MGC)', ibkr: 45.24, serkan: 29.24, tradesYr: 17.2, ibkrRt: 2.63, serkanRt: 1.70 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard label="Annual (IBKR)"   value={fmtEUR(costAnnual, 0)}            />
        <KpiCard label="Monthly"         value={fmtEUR(costAnnual / 12, 0)}        />
        <KpiCard label="Weekly"          value={fmtEUR(costAnnual / 52, 2)}        />
        <KpiCard label="Per Trade"       value={fmtEUR(costAnnual / 198.2, 2)}     />
        <KpiCard label="Cost / NAV"      value={fmtPct(kpis.annualCostPct ?? kpis.costPerNAV ?? 0)}  good={(kpis.annualCostPct ?? kpis.costPerNAV ?? 0) < 2} />
        <KpiCard label="Cost / Gross P&L" value={`${((costAnnual / (kpis.grossCAGR / 100 * cap)) * 100).toFixed(1)}%`} />
        <KpiCard label="Serkan Ref/yr"   value={fmtEUR(s.serkanRefCostYr ?? s.totalSerkanYr ?? 0, 0)} />
        <KpiCard label="IBKR vs Serkan"  value={`${s.ratio ?? '–'}×`}               good={(s.ratio ?? 2) < 1} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#2a2a2a] text-[#555] text-left">
              <th className="px-2 py-1.5 font-normal">Component</th>
              <th className="px-2 py-1.5 font-normal text-right">Trades/yr</th>
              <th className="px-2 py-1.5 font-normal text-right">IBKR/rt</th>
              <th className="px-2 py-1.5 font-normal text-right">IBKR/yr</th>
              <th className="px-2 py-1.5 font-normal text-right">Serkan/rt</th>
              <th className="px-2 py-1.5 font-normal text-right">Serkan/yr</th>
              <th className="px-2 py-1.5 font-normal text-right">Δ EUR/yr</th>
              <th className="px-2 py-1.5 font-normal text-right">Ratio</th>
            </tr>
          </thead>
          <tbody>
            {byComp.map(row => (
              <tr key={row.label} className="border-b border-[#181818] hover:bg-[#111]">
                <td className="px-2 py-1.5 text-[#ccc]">{row.label}</td>
                <td className="px-2 py-1.5 text-right text-[#888]">{row.tradesYr.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right text-[#888]">€{row.ibkrRt.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-right text-[#d4a843]">€{row.ibkr.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-right text-[#555]">€{row.serkanRt.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-right text-[#555]">€{row.serkan.toFixed(2)}</td>
                <td className={`px-2 py-1.5 text-right ${row.ibkr < row.serkan ? 'text-green-400' : 'text-red-400'}`}>
                  {row.ibkr < row.serkan ? '−' : '+'}€{Math.abs(row.ibkr - row.serkan).toFixed(2)}
                </td>
                <td className={`px-2 py-1.5 text-right font-mono text-xs ${row.ibkrRt < row.serkanRt ? 'text-green-400' : 'text-orange-400'}`}>
                  {(row.ibkrRt / row.serkanRt).toFixed(2)}×
                </td>
              </tr>
            ))}
            <tr className="border-t border-[#2a2a2a] font-semibold">
              <td className="px-2 py-1.5 text-[#d4a843]">TOTAL</td>
              <td className="px-2 py-1.5 text-right text-[#888]">198.2</td>
              <td className="px-2 py-1.5" />
              <td className="px-2 py-1.5 text-right text-[#d4a843]">€{(s.ibkrRealCostYr ?? s.totalIbkrYr ?? costAnnual).toFixed(2)}</td>
              <td className="px-2 py-1.5" />
              <td className="px-2 py-1.5 text-right text-[#555]">€{(s.serkanRefCostYr ?? s.totalSerkanYr ?? 0).toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right text-green-400">−€{(s.ibkrCheaperByEUR ?? 0).toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right font-mono text-green-400">{s.ratio ?? '–'}×</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-[#0a1a0a] border border-green-900/40 rounded p-3 text-xs">
        <p className="text-green-400 font-semibold mb-1">KEY FINDING: IBKR real costs are 0.765× Serkan reference</p>
        <p className="text-[#666]">{String(serkan.keyFinding ?? '')}. FDXS dominates (80% of trades at €0.76/rt vs €1.70 Serkan reference).
          6E is more expensive per round-turn than Serkan assumes but is a small fraction of total trade count.</p>
      </div>

      <div>
        <p className="text-[10px] text-[#555] mb-2">Serkan pre-check: likely differences</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#2a2a2a] text-[#555] text-left">
                <th className="px-2 py-1.5 font-normal w-32">Item</th>
                <th className="px-2 py-1.5 font-normal">IBKR Real</th>
                <th className="px-2 py-1.5 font-normal">Serkan Reference</th>
              </tr>
            </thead>
            <tbody>
              {(serkan.diffVsSerkan as Array<{item: string; ibkr: unknown; serkan: unknown}> ?? []).map(row => (
                <tr key={row.item} className="border-b border-[#181818]">
                  <td className="px-2 py-1.5 text-[#888] font-medium">{row.item}</td>
                  <td className="px-2 py-1.5 text-[#d4a843]">{String(row.ibkr ?? '')}</td>
                  <td className="px-2 py-1.5 text-[#555]">{String(row.serkan ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Capital Comparison Table ────────────────────────────────────────
function CapitalComparisonTable({ rows }: { rows: CapitalRow[] }) {
  const cols = [
    { key: 'capital',     label: 'Capital',    fmt: (v: number) => fmtEUR(v, 0) },
    { key: 'assessment',  label: 'Gate',        fmt: (v: string) => v },
    { key: 'contracts',   label: 'Contracts',   fmt: (v: string) => v },
    { key: 'netCAGR',     label: 'Net CAGR',    fmt: (v: number) => fmtPct(v) },
    { key: 'grossCAGR',   label: 'Gross CAGR',  fmt: (v: number) => fmtPct(v) },
    { key: 'sharpe',      label: 'Sharpe',      fmt: (v: number) => fmtNum(v) },
    { key: 'calmar',      label: 'Calmar',      fmt: (v: number) => fmtNum(v) },
    { key: 'maxDD_Pct',   label: 'MaxDD%',      fmt: (v: number) => fmtPct(v) },
    { key: 'maxDD_EUR',   label: 'MaxDD EUR',   fmt: (v: number) => fmtEUR(v, 0) },
    { key: 'costAnnual',  label: 'Cost/yr',     fmt: (v: number) => fmtEUR(v, 0) },
    { key: 'costPerNAV',  label: 'Cost/NAV',    fmt: (v: number) => fmtPct(v) },
    { key: 'marginPct',   label: 'Margin%',     fmt: (v: number) => fmtPct(v) },
    { key: 'weightError', label: 'Wt Error',    fmt: (v: number) => fmtNum(v, 3) },
    { key: 'dataSource',  label: 'Source',      fmt: (v: string) => v.includes('CONFIRMED') ? '✓ PB' : '~ EXT' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border-collapse whitespace-nowrap">
        <thead>
          <tr className="border-b border-[#2a2a2a]">
            {cols.map(c => (
              <th key={c.key} className="text-left text-[#555] px-2 py-1.5 font-normal">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const pass = row.assessment === 'PASS';
            return (
              <tr key={row.capital} className={`border-b border-[#181818] hover:bg-[#111] ${!pass ? 'opacity-60' : ''}`}>
                <td className="px-2 py-1.5 text-[#d4a843] font-mono font-semibold">{fmtEUR(row.capital, 0)}</td>
                <td className="px-2 py-1.5"><AssessmentBadge val={row.assessment} /></td>
                <td className="px-2 py-1.5 text-[#888] text-[10px]">{row.contracts}</td>
                <td className={`px-2 py-1.5 font-mono ${row.netCAGR > 10 ? 'text-green-400' : 'text-[#ccc]'}`}>{fmtPct(row.netCAGR)}</td>
                <td className="px-2 py-1.5 text-[#888]">{fmtPct(row.grossCAGR)}</td>
                <td className={`px-2 py-1.5 ${row.sharpe > 1.3 ? 'text-green-400' : 'text-[#ccc]'}`}>{fmtNum(row.sharpe)}</td>
                <td className="px-2 py-1.5 text-[#ccc]">{fmtNum(row.calmar)}</td>
                <td className={`px-2 py-1.5 ${(row.maxDD_Pct ?? row.maxDD ?? 0) < 10 ? 'text-green-400' : 'text-orange-400'}`}>{fmtPct(row.maxDD_Pct ?? row.maxDD)}</td>
                <td className="px-2 py-1.5 text-[#888]">{fmtEUR(row.maxDD_EUR, 0)}</td>
                <td className="px-2 py-1.5 text-[#d4a843]">{fmtEUR(row.costAnnual, 0)}</td>
                <td className={`px-2 py-1.5 ${(row.costPerNAV ?? 0) < 2 ? 'text-green-400' : 'text-orange-400'}`}>{fmtPct(row.costPerNAV)}</td>
                <td className={`px-2 py-1.5 ${row.marginPct <= 30 ? 'text-green-400' : 'text-red-400'}`}>{fmtPct(row.marginPct)}</td>
                <td className="px-2 py-1.5 text-[#888] font-mono">{fmtNum(row.weightError ?? 0, 3)}</td>
                <td className={`px-2 py-1.5 text-[10px] ${(row.dataSource ?? '').includes('CONFIRMED') ? 'text-green-400' : 'text-[#555]'}`}>
                  {(row.dataSource ?? '').includes('CONFIRMED') ? '✓ PB' : '~ EXT'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section: Component Quality ────────────────────────────────────────────────
function ComponentQualityGrid({ components }: { components: Component17[] }) {
  const sorted = [...components].sort((a, b) => {
    const order = ['ROBUST', 'ACCEPTABLE', 'NEEDS_COST_FILTER', 'SOLVABLE', 'LOW_SAMPLE', 'NO_DATA', 'DATA_BLOCKED'];
    return order.indexOf(a.status) - order.indexOf(b.status);
  });

  const counts = components.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([status, n]) => (
          <div key={status} className="flex items-center gap-1.5 bg-[#111] border border-[#2a2a2a] rounded px-2 py-1">
            <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[status] ?? '#888' }} />
            <span className="text-[10px] text-[#888]">{status}</span>
            <span className="text-[10px] text-[#d4a843] font-bold">{n}</span>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#2a2a2a] text-[#555] text-left">
              <th className="px-2 py-1.5 font-normal">Component</th>
              <th className="px-2 py-1.5 font-normal">Sleeve</th>
              <th className="px-2 py-1.5 font-normal">Instrument</th>
              <th className="px-2 py-1.5 font-normal">Exchange</th>
              <th className="px-2 py-1.5 font-normal text-right">IBKR/rt</th>
              <th className="px-2 py-1.5 font-normal text-right">Margin</th>
              <th className="px-2 py-1.5 font-normal text-right">Trades/yr</th>
              <th className="px-2 py-1.5 font-normal">WF</th>
              <th className="px-2 py-1.5 font-normal">Data Quality</th>
              <th className="px-2 py-1.5 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => (
              <tr key={c.id} className="border-b border-[#181818] hover:bg-[#111]">
                <td className="px-2 py-1.5 text-[#ccc]">{c.label}</td>
                <td className="px-2 py-1.5 text-[#888]">{c.sleeve}</td>
                <td className="px-2 py-1.5 text-[#d4a843] font-mono text-[10px]">{c.instrument ?? (c as unknown as Record<string,string>).symbol ?? '—'}</td>
                <td className="px-2 py-1.5 text-[#666] text-[10px]">{c.exchange ?? '—'}</td>
                <td className="px-2 py-1.5 text-right text-[#888]">€{(c.ibkrCost ?? 0).toFixed(2)}</td>
                <td className="px-2 py-1.5 text-right text-[#888]">{(c.margin ?? 0) > 0 ? fmtEUR(c.margin ?? 0, 0) : '—'}</td>
                <td className="px-2 py-1.5 text-right text-[#888]">{(c.tradesYr ?? (c as unknown as Record<string,number>).tradesTotal ?? 0).toFixed(1)}</td>
                <td className="px-2 py-1.5 text-[#666] text-[10px]">{c.wf ?? '—'}</td>
                <td className="px-2 py-1.5 text-[#555] text-[9px]">{c.dataQuality ?? '—'}</td>
                <td className="px-2 py-1.5">
                  <span className="text-[9px] font-semibold" style={{ color: STATUS_COLOR[c.status] }}>
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section: Repair Gate Status ──────────────────────────────────────────────
function RepairGatePanel({ gate, comparison }: { gate: SummaryData['repairGateStatus']; comparison: SummaryData['repairGateComparison'] }) {
  if (!gate) return null;
  const isBlocked = gate.overallStatus === 'PARTIAL_BLOCKED';
  const eurusdPassed = gate.eurusdGate === 'PASSED';
  const gldPassed = gate.gldGate === 'PASSED';

  return (
    <div className={`border rounded-lg p-4 ${isBlocked ? 'border-orange-900/60 bg-orange-950/20' : 'border-green-900/60 bg-green-950/20'}`}>
      <div className="flex items-center gap-3 mb-4">
        <span className={`text-sm font-bold font-mono ${isBlocked ? 'text-orange-400' : 'text-green-400'}`}>
          CRITICAL REPAIR GATE — {gate.overallStatus}
        </span>
        <span className="text-[10px] text-[#555]">{gate.assessed}</span>
      </div>
      <p className="text-[10px] text-[#666] mb-4 font-mono">{gate.mandate}</p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'EURUSD 30M', passed: eurusdPassed, detail: gate.eurusdGate },
          { label: 'GLD Thursday Long', passed: gldPassed, detail: gate.gldGate },
          { label: 'ZW Seasonal', passed: false, detail: gate.zwVerdict },
        ].map(g => (
          <div key={g.label} className={`border rounded p-2.5 ${g.passed ? 'border-green-900/50 bg-green-950/20' : 'border-red-900/50 bg-red-950/20'}`}>
            <div className="text-[10px] font-semibold text-[#888] mb-1">{g.label}</div>
            <div className={`text-[10px] font-mono ${g.passed ? 'text-green-400' : 'text-red-400'}`}>{g.passed ? '✓ PASSED' : '✗ FAILED'}</div>
            <div className="text-[9px] text-[#555] mt-1 leading-relaxed">{g.detail}</div>
          </div>
        ))}
      </div>

      {isBlocked && (
        <div className="bg-red-950/30 border border-red-900/50 rounded p-2 mb-4">
          <span className="text-[10px] text-red-400 font-mono">BLOCKING: {gate.blockingReason}</span>
        </div>
      )}

      {comparison && (
        <div className="space-y-3">
          <div className="text-[10px] text-[#555] uppercase tracking-widest font-semibold">Baseline vs Candidate Comparison</div>

          {/* EURUSD */}
          <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded p-3">
            <div className="text-[10px] text-[#d4a843] font-semibold mb-2">EURUSD 30M</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[9px] text-[#555] mb-1">BASELINE</div>
                <div className="text-[9px] text-[#666] space-y-0.5">
                  <div>n={comparison.eurusd_30m.baseline.n} trades · Net <span className="text-red-400 font-mono">€{comparison.eurusd_30m.baseline.netEUR}</span></div>
                  <div>CostRatio <span className="text-red-400">{comparison.eurusd_30m.baseline.costRatioPct?.toFixed(1)}%</span></div>
                  <div className="text-red-500 text-[9px]">{comparison.eurusd_30m.baseline.status}</div>
                </div>
              </div>
              <div>
                <div className="text-[9px] text-[#555] mb-1">CANDIDATE — {comparison.eurusd_30m.candidate.label}</div>
                <div className="text-[9px] text-[#666] space-y-0.5">
                  <div>n={comparison.eurusd_30m.candidate.n} · {comparison.eurusd_30m.candidate.tradesPerYear}/yr</div>
                  <div>Net <span className="text-green-400 font-mono">€{comparison.eurusd_30m.candidate.netEUR}</span> · PF={comparison.eurusd_30m.candidate.profitFactor}</div>
                  <div>IS <span className="text-green-400">€{comparison.eurusd_30m.candidate.isNet}</span> · OOS <span className="text-green-400">€{comparison.eurusd_30m.candidate.oosNet}</span></div>
                  <div>CostRatio <span className="text-yellow-400">{comparison.eurusd_30m.candidate.costRatioPct?.toFixed(1)}%</span></div>
                  <div className="text-yellow-400 text-[9px]">{comparison.eurusd_30m.candidate.status}</div>
                </div>
              </div>
            </div>
          </div>

          {/* GLD */}
          <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded p-3">
            <div className="text-[10px] text-[#d4a843] font-semibold mb-2">GLD Thursday Long</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[9px] text-[#555] mb-1">BASELINE</div>
                <div className="text-[9px] text-[#666] space-y-0.5">
                  <div>n={comparison.gld_thursday_long.baseline.n} · Net <span className="text-red-400 font-mono">€{comparison.gld_thursday_long.baseline.netEUR}</span></div>
                  <div className="text-red-500">{comparison.gld_thursday_long.baseline.status}</div>
                </div>
              </div>
              <div>
                <div className="text-[9px] text-[#555] mb-1">BEST ATTEMPT (IS Mon filter)</div>
                <div className="text-[9px] text-[#666] space-y-0.5">
                  <div>{comparison.gld_thursday_long.bestAttempt.label}</div>
                  <div>IS <span className="text-green-400">€{comparison.gld_thursday_long.bestAttempt.isNet}</span> → OOS <span className="text-red-400">€{comparison.gld_thursday_long.bestAttempt.oosNet}</span></div>
                  <div className="text-red-400">{comparison.gld_thursday_long.bestAttempt.status}</div>
                  <div className="text-[9px] text-[#444]">{comparison.gld_thursday_long.bestAttempt.reason}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ZW */}
          <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded p-3">
            <div className="text-[10px] text-[#d4a843] font-semibold mb-2">ZW Seasonal</div>
            <div className="text-[9px] text-[#666] space-y-0.5">
              <div>n={comparison.zw_seasonal.baseline.n} · Net <span className="text-red-400 font-mono">€{comparison.zw_seasonal.baseline.netEUR}</span> · 1 trade/year</div>
              <div className="text-red-400">{comparison.zw_seasonal.verdict}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Capital Recommendations ─────────────────────────────────────────
function CapitalRecommendations({ recs }: { recs: SummaryData['recommendations'] }) {
  const ratingColor = (r: string) => r === 'COMFORTABLE' ? 'text-green-400' : r === 'WORKABLE' ? 'text-yellow-400' : 'text-orange-400';
  const renderTier = (tier: string, data: { capital: number; note: string; rating: string }) => (
    <div key={tier} className="bg-[#111] border border-[#2a2a2a] rounded p-3">
      <div className="flex justify-between items-start mb-1">
        <span className="text-[10px] text-[#555] uppercase">{tier.replace(/([A-Z])/g, ' $1').trim()}</span>
        <span className={`text-[9px] font-mono ${ratingColor(data.rating)}`}>{data.rating}</span>
      </div>
      <div className="text-lg font-bold text-[#d4a843] font-mono">{fmtEUR(data.capital, 0)}</div>
      <p className="text-[10px] text-[#555] mt-1">{data.note}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-[#888] mb-2">Core Portfolio (4 components: 6E + DAX1H + DAX2H + GLD)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(recs.core).map(([tier, data]) => renderTier(tier, data))}
        </div>
      </div>
      <div>
        <p className="text-xs text-[#888] mb-2">Full Portfolio (17 components, ex-EEM DATA_BLOCKED)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(recs.full ?? {}).map(([tier, data]) => renderTier(tier, data))}
        </div>
      </div>
      <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded p-3 text-xs space-y-1">
        <p className="text-[#d4a843] font-semibold">Core vs Full — NOT interchangeable</p>
        <p className="text-[#666]">Core (4-component) minimum: €15k technical, €20k investor. Full portfolio minimum: €47k (30% margin gate), €60k practical, €100k recommended.</p>
        <p className="text-[#666]">KPIs shown are for Core at 1c each. Full-portfolio performance requires Brain backtest data not yet available (RESEARCH_CANDIDATE status).</p>
      </div>
    </div>
  );
}

// ─── Section: Margin Usage ────────────────────────────────────────────────────
function MarginUsage({ cap, capData }: { cap: number; capData: CapitalData }) {
  const m = capData.margin as { total: number; pct: number; freeCash: number; byInstrument?: Record<string, { contracts: number; perContract: number; total: number }> };
  const c = capData.contracts as unknown as Record<string, number>;

  // IBKR margin rates (EUR) from confirmed data — shared FDXS for D1H+D2H
  const MARGIN_RATES: Record<string, number> = { '6E': 2200, 'FDXS': 880, 'MGC': 822 };
  const n6E   = c.n_6E   ?? c.eurusd_30m        ?? 0;
  const nFDXS = c.n_FDXS1 ?? c.dax_1h           ?? 0; // shared
  const nMGC  = c.n_MGC   ?? c.gld_thursday_long ?? 0;

  const instruments = [
    { key: '6E',   label: 'M6E (EURUSD)',  n: n6E,   perContract: MARGIN_RATES['6E'],   color: '#d4a843' },
    { key: 'FDXS', label: 'FDXS (shared)', n: nFDXS, perContract: MARGIN_RATES['FDXS'], color: '#3b82f6' },
    { key: 'MGC',  label: 'MGC (Gold)',    n: nMGC,  perContract: MARGIN_RATES['MGC'],  color: '#8b5cf6' },
  ];

  const barData = instruments.map(ins => ({
    name: ins.label,
    margin: m.byInstrument?.[ins.key]?.total ?? ins.n * ins.perContract,
    contracts: ins.n,
    color: ins.color,
  }));

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-[#666]">Total Margin</span>
          <span className="text-[#d4a843] font-mono">{fmtEUR(m.total, 0)} ({m.pct.toFixed(1)}%)</span>
        </div>
        <div className="w-full h-2 bg-[#1a1a1a] rounded overflow-hidden">
          <div className="h-full rounded" style={{ width: `${Math.min(100, m.pct)}%`, background: m.pct > 30 ? '#ef4444' : '#22c55e' }} />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[#666]">Free Cash</span>
          <span className="text-green-400 font-mono">{fmtEUR(m.freeCash, 0)} ({(100 - m.pct).toFixed(1)}%)</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[#666]">30% Gate</span>
          <span className={m.pct <= 30 ? 'text-green-400' : 'text-red-400'}>{m.pct <= 30 ? 'PASS' : 'FAIL'}</span>
        </div>
        <div className="mt-3 space-y-1">
          {instruments.map(ins => {
            const total = m.byInstrument?.[ins.key]?.total ?? ins.n * ins.perContract;
            return (
              <div key={ins.key} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ins.color }} />
                <span className="text-[#888] w-28">{ins.label}</span>
                <span className="text-[#555] text-[10px]">{ins.n}× €{ins.perContract.toLocaleString()}</span>
                <span className="text-[#ccc] ml-auto font-mono">{fmtEUR(total, 0)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 80 }}>
            <XAxis type="number" tickFormatter={(v) => fmtEUR(v, 0)} tick={{ fill: '#555', fontSize: 9 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#888', fontSize: 9 }} />
            <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #2a2a2a', fontSize: 11 }}
              formatter={(v: unknown) => [fmtEUR(Number(v), 0), 'Margin']} />
            <Bar dataKey="margin" radius={[0, 3, 3, 0]}>
              {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Main Dashboard Component ──────────────────────────────────────────────────
export default function WhiteSwanDashboard() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [capDataMap, setCapDataMap] = useState<Record<number, CapitalData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCaps, setSelectedCaps] = useState<number[]>([15000, 20000, 50000]);
  const [primaryCap, setPrimaryCap] = useState<number>(15000);
  const [showGross, setShowGross] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'equity' | 'contracts' | 'costs' | 'components' | 'capital'>('overview');

  useEffect(() => {
    setLoading(true);
    fetch('/api/white-swan-dashboard?type=summary')
      .then(r => r.json())
      .then(data => {
        setSummary(data);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  useEffect(() => {
    const missing = selectedCaps.filter(c => !capDataMap[c]);
    if (missing.length === 0) return;

    Promise.all(
      missing.map(cap =>
        fetch(`/api/white-swan-dashboard?type=capital&capital=${cap}`)
          .then(r => r.json())
          .then(data => ({ cap, data }))
      )
    ).then(results => {
      setCapDataMap(prev => {
        const next = { ...prev };
        for (const { cap, data } of results) next[cap] = data;
        return next;
      });
    });
  }, [selectedCaps]);

  const primaryData = capDataMap[primaryCap];
  const primaryKpis = summary?.capitalSummary?.[primaryCap]?.kpis ?? primaryData?.kpis;
  const primaryContracts = summary?.capitalSummary?.[primaryCap]?.contracts ?? primaryData?.contracts;

  const tabs = [
    { key: 'overview',    label: 'Overview' },
    { key: 'equity',      label: 'Equity / DD' },
    { key: 'contracts',   label: 'Weights' },
    { key: 'costs',       label: 'Costs' },
    { key: 'components',  label: '17 Components' },
    { key: 'capital',     label: 'Capital Comparison' },
  ] as const;

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#555] text-sm">
      Loading portfolio dashboard…
    </div>
  );
  if (error) return (
    <div className="text-red-400 text-sm p-4">Error: {error}</div>
  );
  if (!summary) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#d4a843]">White Swan — Core Portfolio Dashboard</h2>
            <p className="text-xs text-[#555] mt-0.5">
              4-Component: E6_MonLong + D1_Baseline + D2_HighVolYears + GLD_BestMonths &nbsp;·&nbsp;
              Conservative 1×6E / 1×FDXS / 1×MGC &nbsp;·&nbsp;
              <span className="text-orange-400">RESEARCH_CANDIDATE</span>
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[#555]">Primary capital:</span>
            {[15000, 20000, 25000, 50000].map(c => (
              <button key={c}
                onClick={() => { setPrimaryCap(c); if (!selectedCaps.includes(c)) setSelectedCaps(prev => [...prev, c]); }}
                className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${primaryCap === c ? 'border-[#d4a843] text-[#d4a843] bg-[#1a1600]' : 'border-[#2a2a2a] text-[#555] hover:border-[#444]'}`}>
                €{c.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* KPI strip */}
        {primaryKpis && (
          <div className="mt-4">
            <KpiStrip kpis={primaryKpis} capital={primaryCap} capData={primaryData} />
          </div>
        )}

        {/* Contracts display */}
        {primaryContracts && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <span className="text-[#555]">Contracts:</span>
            {[
              { label: '6E/M6E', n: primaryContracts.n_6E ?? primaryContracts.eurusd_30m, color: '#d4a843' },
              { label: 'FDXS (D1H)', n: primaryContracts.n_FDXS1 ?? primaryContracts.dax_1h, color: '#3b82f6' },
              { label: 'FDXS (D2H)', n: primaryContracts.n_FDXS2 ?? primaryContracts.dax_2h, color: '#22c55e' },
              { label: 'MGC', n: primaryContracts.n_MGC ?? primaryContracts.gld_thursday_long, color: '#8b5cf6' },
            ].map(ins => (
              <span key={ins.label} className="flex items-center gap-1">
                <span className="font-bold text-sm" style={{ color: ins.color }}>{ins.n ?? 0}×</span>
                <span className="text-[#666]">{ins.label}</span>
              </span>
            ))}
            <span className="text-[#555]">·</span>
            {(() => { const mp = (primaryData?.margin as {pct?: number})?.pct ?? primaryContracts.marginPct ?? 0; return (
            <span className="text-[#666]">Margin: <span className={`font-mono ${mp > 30 ? 'text-red-400' : 'text-green-400'}`}>{mp.toFixed(1)}%</span></span>
            ); })()}
            <span className="text-[#555]">·</span>
            <span className="text-[#666]">Weight error: <span className="font-mono text-[#d4a843]">{(primaryContracts.weightError ?? 0).toFixed(3)}</span></span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${activeTab === t.key ? 'bg-[#d4a843]/10 border border-[#d4a843]/30 text-[#d4a843]' : 'text-[#555] hover:text-[#888] border border-transparent'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && summary && (
        <div className="space-y-6">
          <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
            <SectionTitle>Capital Recommendations</SectionTitle>
            <CapitalRecommendations recs={summary.recommendations} />
          </div>

          {/* Quick capital selector for equity */}
          <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
            <SectionTitle>Quick Equity Preview</SectionTitle>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="text-[10px] text-[#555] self-center">Compare:</span>
              {ALL_CAPS.map(c => (
                <button key={c}
                  onClick={() => setSelectedCaps(prev =>
                    prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                  )}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${selectedCaps.includes(c)
                    ? 'text-white border-[#444]'
                    : 'text-[#444] border-[#222] hover:border-[#333]'}`}
                  style={selectedCaps.includes(c) ? { borderColor: CAP_COLORS[c], color: CAP_COLORS[c] } : {}}>
                  €{c.toLocaleString()}
                </button>
              ))}
              <button onClick={() => setShowGross(p => !p)}
                className={`ml-auto px-2 py-0.5 rounded text-[10px] border transition-colors ${showGross ? 'border-[#d4a843]/40 text-[#d4a843]' : 'border-[#2a2a2a] text-[#555]'}`}>
                {showGross ? 'Gross' : 'Net'}
              </button>
            </div>
            {selectedCaps.some(c => capDataMap[c]) ? (
              <EquityDrawdownCharts selectedCaps={selectedCaps.filter(c => capDataMap[c])} capDataMap={capDataMap} showGross={showGross} />
            ) : (
              <div className="h-40 flex items-center justify-center text-[#555] text-xs">Loading equity data…</div>
            )}
          </div>

          {primaryData && (
            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
              <SectionTitle>Yearly Returns — €{primaryCap.toLocaleString()}</SectionTitle>
              <YearlyReturnsChart data={primaryData.yearlyReturns} capital={primaryCap} />
            </div>
          )}
        </div>
      )}

      {/* ── EQUITY / DD ── */}
      {activeTab === 'equity' && (
        <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4 space-y-4">
          <SectionTitle>Equity Curves & Drawdowns</SectionTitle>
          <div className="flex flex-wrap gap-2 mb-2">
            {ALL_CAPS.map(c => (
              <button key={c}
                onClick={() => setSelectedCaps(prev =>
                  prev.includes(c) ? (prev.length > 1 ? prev.filter(x => x !== c) : prev) : [...prev, c]
                )}
                className="px-2 py-0.5 rounded text-[10px] border transition-colors"
                style={{
                  borderColor: selectedCaps.includes(c) ? CAP_COLORS[c] : '#2a2a2a',
                  color: selectedCaps.includes(c) ? CAP_COLORS[c] : '#555',
                }}>
                €{c.toLocaleString()}
              </button>
            ))}
            <button onClick={() => setShowGross(p => !p)}
              className={`ml-auto px-2 py-0.5 rounded text-[10px] border transition-colors ${showGross ? 'border-[#d4a843]/40 text-[#d4a843]' : 'border-[#2a2a2a] text-[#555]'}`}>
              {showGross ? '● Gross' : '○ Net'}
            </button>
          </div>
          {selectedCaps.some(c => capDataMap[c]) ? (
            <EquityDrawdownCharts selectedCaps={selectedCaps.filter(c => capDataMap[c])} capDataMap={capDataMap} showGross={showGross} />
          ) : (
            <div className="h-64 flex items-center justify-center text-[#555] text-xs">Loading…</div>
          )}
          {primaryData && (
            <div className="mt-4">
              <SectionTitle>Yearly Returns — €{primaryCap.toLocaleString()}</SectionTitle>
              <YearlyReturnsChart data={primaryData.yearlyReturns} capital={primaryCap} />
            </div>
          )}
          <div className="bg-[#111] border border-[#2a2a2a] rounded p-3 text-[10px] text-[#555]">
            <p className="text-[#888] font-semibold mb-1">Data provenance</p>
            <p>NAV series reconstructed from real historical trades (all-trades.json, 2008–2026).
              Phase B variant filters applied: E6_MonLong (Mon+LONG from 30m EURUSD) · D1_Baseline (all DAX1H) · D2_HighVolYears (above-median-vol years) · GLD_BestMonths (top 4 months).
              ym1_tat and seasonal strategies included as pass-through (unchanged). IBKR real costs per instrument applied.
              KPI values are computed fresh from the actual NAV series — no GBM, no extrapolation.</p>
          </div>
        </div>
      )}

      {/* ── WEIGHTS / CONTRACTS ── */}
      {activeTab === 'contracts' && (
        <div className="space-y-4">
          <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
            <SectionTitle>Target vs Realized Risk Weights × Capital</SectionTitle>
            <ContractWeightMatrix capDataMap={capDataMap} />
          </div>

          {primaryData && (
            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
              <SectionTitle>Margin Usage — €{primaryCap.toLocaleString()}</SectionTitle>
              <MarginUsage cap={primaryCap} capData={primaryData} />
            </div>
          )}

          <div className="bg-[#0f0f1a] border border-[#2a2a3a] rounded-lg p-4 text-xs text-[#666] space-y-2">
            <p className="text-[#888] font-semibold">Multi-contract explanation</p>
            <p>Integer contract optimization minimizes Σ|target_weight − realized_weight| subject to total initial margin ≤ 30% of capital.
              At small capital (€15k–€20k), only 1× per instrument fits. At €50k+, 2-3× contracts per sleeve become viable, improving weight approximation.
              Weight error (Err∑) decreases as capital grows: more contract granularity → closer match to strategic allocation.</p>
            <p>Target risk weights (ATR-vol-based, White Swan strategic allocation): 6E 30% / DAX1H 20% / DAX2H 30% / GLD 20%.
              Note: strategic targets and ATR risk weights are White Swan internal design — not derived from correlation optimization.</p>
          </div>
        </div>
      )}

      {/* ── COSTS ── */}
      {activeTab === 'costs' && primaryKpis && (
        <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
          <SectionTitle>Cost Analysis (IBKR Real vs Serkan Reference)</SectionTitle>
          <CostAnalysis cap={primaryCap} kpis={primaryKpis} serkan={summary.serkanPrecheck} />
        </div>
      )}

      {/* ── 17 COMPONENTS ── */}
      {activeTab === 'components' && (
        <div className="space-y-4">
        {summary.repairGateStatus && (
          <RepairGatePanel gate={summary.repairGateStatus} comparison={summary.repairGateComparison} />
        )}
        <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
          <SectionTitle>All 17 White Swan Components</SectionTitle>
          <ComponentQualityGrid components={summary.components17} />
          <div className="mt-4 bg-[#0f0f0f] border border-[#2a2a2a] rounded p-3 text-[10px] text-[#555] space-y-1">
            <p><span style={{ color: STATUS_COLOR.ROBUST }}>ROBUST</span> — Full backtest 2008–2026, 9/9 WF folds positive</p>
            <p><span style={{ color: STATUS_COLOR.FILTERED }}>FILTERED</span> — PB Phase B filter applied (E6_MonLong, GLD_BestMonths)</p>
            <p><span style={{ color: STATUS_COLOR.BASELINE }}>BASELINE</span> — Unfiltered baseline (D1_Baseline, all signals)</p>
            <p><span style={{ color: STATUS_COLOR.PASS_THROUGH }}>PASS_THROUGH</span> — Included in PB computation unchanged (1c, no optimization)</p>
            <p><span style={{ color: STATUS_COLOR.BLOCKED }}>BLOCKED</span> — Excluded from PB computation (EEM, IWM)</p>
            <p><span style={{ color: STATUS_COLOR.ACCEPTABLE }}>ACCEPTABLE</span> — Historical results but no active signal</p>
            <p><span style={{ color: STATUS_COLOR.NO_DATA }}>NO_DATA</span> — Thesis exists, no backtest data in repo yet</p>
          </div>
        </div>
        </div>
      )}

      {/* ── CAPITAL COMPARISON ── */}
      {activeTab === 'capital' && (
        <div className="space-y-4">
          <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
            <SectionTitle>Capital Comparison — All 7 Levels</SectionTitle>
            <CapitalComparisonTable rows={summary.capitalComparison} />
            <p className="text-[9px] text-[#444] mt-3">
              All capitals use identical real historical P&L series × integer contracts. KPIs computed fresh from actual NAV series at each capital level.
              Grey rows have MARGIN_FAIL (≥30% margin utilization at 1c). Do not trade at these capital levels with this portfolio.
            </p>
          </div>

          <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
            <SectionTitle>Capital Recommendations</SectionTitle>
            <CapitalRecommendations recs={summary.recommendations} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-[#1a1a1a] pt-4 text-[9px] text-[#333] space-y-1">
        <p>Status: RESEARCH_CANDIDATE — Not FINAL. Keine Production-Ground-Truth überschrieben.</p>
        <p>Historical Backtest — Real trade reconstruction from all-trades.json (2008–2026). IBKR costs confirmed 2026-08-14. All capitals use real NAV series.</p>
        <p>EEM component DATA_BLOCKED (CME EMF delisted 2019). IWM via M2K SOLVABLE but signal not yet computed.</p>
      </div>
    </div>
  );
}
