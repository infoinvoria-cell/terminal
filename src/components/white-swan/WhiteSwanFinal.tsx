'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell, Legend,
} from 'recharts';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ComponentData {
  id: string; status: string; netEUR: number; isNet: number; oosNet: number;
  PF: number; posYr: number; totYr: number; targetWeight: number;
  realizedWeight?: number; contracts: number; tradesPerYear: number;
  marginPerContract?: number; costPerRT?: number; annualCostEUR?: number;
  label?: string;
}
interface CapLevel {
  capital: number; assessment: string; marginPct: number; marginTotal?: number;
  CAGR: number | null; isCAGR?: number | null; oosCAGR?: number | null;
  Sharpe: number | null; Sortino?: number | null; Calmar?: number | null;
  MaxDDPct: number | null;
  contracts?: Record<string, number>;
}
interface PortfolioKPIs {
  CAGR: number; oosCAGR: number; isCAGR: number; Sharpe: number; oosSharpe?: number;
  isSharpe?: number; Sortino: number; Calmar: number; MaxDDPct: number; MaxDDEUR: number;
  totalNetEUR: number; annualCostEUR: number; costPerNAV: number;
}
interface Summary {
  recommendedCapital: number; minimumCapital: number; institutionalCapital?: number;
  components: ComponentData[];
  capitalComparison: CapLevel[];
  portfolioKPIs: PortfolioKPIs;
  serkan?: { rows?: number; dateRange?: string[] };
  generatedAt?: string; status?: string;
}
interface EquityPoint { date: string; nav: number; dd: number }
interface EquityData { series: Record<string, EquityPoint[]>; yearlyReturns: Array<{ year: number; netEUR: number; returnPct: number }> }

// ─── Constants ─────────────────────────────────────────────────────────────────
const CAPS_AVAILABLE = [15000, 20000, 25000, 30000, 50000, 75000, 100000];
const CAP_COLORS: Record<number, string> = {
  15000: '#6b7280', 20000: '#9ca3af', 25000: '#d1d5db',
  30000: '#f3f4f6', 50000: '#d4a843', 75000: '#c0c0c0', 100000: '#e0e0e0',
};
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#22c55e', ROBUST: '#22c55e', ACCEPTABLE: '#3b82f6',
  LOW_WEIGHT: '#6b7280', PASS_THROUGH: '#4b5563',
  DATA_BLOCKED: '#ef4444', REJECTED: '#dc2626',
  RESEARCH_CANDIDATE: '#d4a843',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmtEUR = (n: number | null | undefined, d = 0) => n == null ? '—' : `€${Math.round(n).toLocaleString('de-DE')}`;
const fmtPct = (n: number | null | undefined, d = 2) => n == null ? '—' : `${n.toFixed(d)}%`;
const fmtNum = (n: number | null | undefined, d = 2) => n == null ? '—' : n.toFixed(d);

// ─── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? '#6b7280';
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border"
      style={{ color, borderColor: color + '40', background: color + '10' }}>
      {status}
    </span>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="h-px flex-1 bg-[#1e1e1e]" />
      <span className="text-[10px] text-[#3a3a3a] uppercase tracking-[0.2em] font-light">{label}</span>
      <div className="h-px flex-1 bg-[#1e1e1e]" />
    </div>
  );
}

function KpiCell({ label, value, sub, gold }: { label: string; value: string; sub?: string; gold?: boolean }) {
  return (
    <div className="border-r border-[#1a1a1a] last:border-r-0 px-4 py-3 min-w-0">
      <div className="text-[9px] text-[#404040] uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-sm font-mono font-semibold ${gold ? 'text-[#d4a843]' : 'text-[#c8c8c8]'}`}>{value}</div>
      {sub && <div className="text-[9px] text-[#404040] mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Capital selector ─────────────────────────────────────────────────────────
function CapSelector({
  selected, multi, onSingle, onToggle, minCap,
}: {
  selected: number; multi: number[]; onSingle: (c: number) => void; onToggle: (c: number) => void; minCap: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {CAPS_AVAILABLE.map(c => {
        const fail = c < minCap;
        const active = multi.includes(c);
        return (
          <button
            key={c}
            onClick={() => { onSingle(c); onToggle(c); }}
            disabled={fail}
            className={`text-[10px] font-mono px-2.5 py-1 rounded border transition-all
              ${fail ? 'border-[#1a1a1a] text-[#2a2a2a] cursor-not-allowed' :
                active ? 'border-[#d4a843] text-[#d4a843] bg-[#1a1500]' :
                'border-[#2a2a2a] text-[#555] hover:border-[#444] hover:text-[#888]'}`}
          >
            €{c >= 1000 ? (c / 1000).toFixed(c % 1000 === 500 ? 1 : 0) + 'k' : c}
            {fail && <span className="ml-1 text-[8px] text-[#2a2a2a]">✗</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Equity chart ─────────────────────────────────────────────────────────────
function EquityChart({ equityData, multiCap, minCap }: { equityData: EquityData; multiCap: number[]; minCap: number }) {
  const activeCaps = multiCap.filter(c => c >= minCap && equityData.series[c]);
  if (!activeCaps.length) return <div className="h-48 flex items-center justify-center text-[#333] text-xs">Select a valid capital level</div>;

  // Normalize to index (start=100)
  const data = useMemo(() => {
    const merged: Record<string, Record<string, number>> = {};
    activeCaps.forEach(c => {
      const startNav = equityData.series[c][0]?.nav ?? c;
      equityData.series[c].forEach(p => {
        if (!merged[p.date]) merged[p.date] = { date: 0 };
        merged[p.date][`nav_${c}`] = p.nav / startNav * 100;
      });
    });
    return Object.entries(merged).sort(([a], [b]) => a < b ? -1 : 1)
      .map(([date, vals]) => ({ date, ...vals }));
  }, [activeCaps, equityData]);

  const fmt = (v: number) => `${v.toFixed(1)}`;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#111" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#444' }} tickCount={8}
          tickFormatter={d => d.slice(0, 7)} />
        <YAxis tick={{ fontSize: 9, fill: '#444' }} tickFormatter={v => `${v.toFixed(0)}`} domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{ background: '#0a0a0a', border: '1px solid #222', fontSize: 10 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any, name: any) => [`${Number(v).toFixed(1)} (idx)`, String(name).replace('nav_', '€')]}
        />
        <ReferenceLine y={100} stroke="#222" strokeDasharray="2 2" />
        {activeCaps.map(c => (
          <Line key={c} type="monotone" dataKey={`nav_${c}`} stroke={CAP_COLORS[c] ?? '#888'}
            dot={false} strokeWidth={1.5} name={`€${c >= 1000 ? c / 1000 : c}k`} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Drawdown chart ───────────────────────────────────────────────────────────
function DrawdownChart({ equityData, multiCap, minCap }: { equityData: EquityData; multiCap: number[]; minCap: number }) {
  const activeCaps = multiCap.filter(c => c >= minCap && equityData.series[c]);
  if (!activeCaps.length) return null;

  // Compute running drawdown
  const data = useMemo(() => {
    const merged: Record<string, Record<string, number>> = {};
    activeCaps.forEach(c => {
      let maxNav = equityData.series[c][0]?.nav ?? c;
      equityData.series[c].forEach(p => {
        if (p.nav > maxNav) maxNav = p.nav;
        const dd = (maxNav - p.nav) / maxNav * 100;
        if (!merged[p.date]) merged[p.date] = {};
        merged[p.date][`dd_${c}`] = -dd;
      });
    });
    return Object.entries(merged).sort(([a], [b]) => a < b ? -1 : 1)
      .map(([date, vals]) => ({ date, ...vals }));
  }, [activeCaps, equityData]);

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#111" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#444' }} tickCount={8} tickFormatter={d => d.slice(0, 7)} />
        <YAxis tick={{ fontSize: 9, fill: '#444' }} tickFormatter={v => `${v.toFixed(0)}%`} domain={['auto', 0]} />
        <Tooltip
          contentStyle={{ background: '#0a0a0a', border: '1px solid #222', fontSize: 10 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [`${(-Number(v)).toFixed(2)}%`, 'Drawdown']}
        />
        {activeCaps.map(c => (
          <Area key={c} type="monotone" dataKey={`dd_${c}`}
            stroke={CAP_COLORS[c] ?? '#888'} fill="none" strokeWidth={1} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Yearly returns bar chart ─────────────────────────────────────────────────
function YearlyBar({ data }: { data: Array<{ year: number; returnPct: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={100}>
      <BarChart data={data} margin={{ top: 2, right: 8, bottom: 2, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#111" />
        <XAxis dataKey="year" tick={{ fontSize: 8, fill: '#444' }} />
        <YAxis tick={{ fontSize: 8, fill: '#444' }} tickFormatter={v => `${v}%`} />
        <Tooltip
          contentStyle={{ background: '#0a0a0a', border: '1px solid #222', fontSize: 10 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Annual Return']}
        />
        <ReferenceLine y={0} stroke="#333" />
        <Bar dataKey="returnPct" radius={[1, 1, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.returnPct >= 0 ? '#3d5a3d' : '#5a3d3d'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Weights bar visual ───────────────────────────────────────────────────────
function WeightBar({ target, realized, label }: { target: number; realized: number; label: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[9px] text-[#555]">
        <span>{label}</span>
        <span className="font-mono">{target.toFixed(1)}% → {realized.toFixed(1)}%</span>
      </div>
      <div className="relative h-1.5 bg-[#111] rounded">
        <div className="absolute inset-y-0 left-0 bg-[#2a2a2a] rounded" style={{ width: `${Math.min(target, 100)}%` }} />
        <div className="absolute inset-y-0 left-0 bg-[#d4a843] rounded opacity-60" style={{ width: `${Math.min(realized, 100)}%` }} />
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function WhiteSwanFinal() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [equityData, setEquityData] = useState<EquityData | null>(null);
  const [selectedCap, setSelectedCap] = useState<number>(50000);
  const [multiCap, setMultiCap] = useState<number[]>([50000]);
  const [activeTab, setActiveTab] = useState<'overview' | 'equity' | 'weights' | 'costs' | 'components' | 'capital'>('overview');
  const [chartMode, setChartMode] = useState<'net' | 'gross'>('net');
  const [chartPeriod, setChartPeriod] = useState<'full' | 'is' | 'oos'>('full');
  const [compFilter, setCompFilter] = useState<string>('ALL');

  useEffect(() => {
    fetch('/data/white-swan/final/portfolio-summary.json').then(r => r.json()).then(setSummary).catch(() => null);
    fetch('/data/white-swan/final/equity-series.json').then(r => r.json()).then(setEquityData).catch(() => null);
  }, []);

  const toggleCap = useCallback((c: number) => {
    setMultiCap(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }, []);

  const handleSingleCap = useCallback((c: number) => {
    setSelectedCap(c);
  }, []);

  if (!summary) {
    return (
      <div className="min-h-screen bg-[#020202] flex items-center justify-center">
        <div className="text-[#333] text-xs font-mono">Loading White Swan Final…</div>
      </div>
    );
  }

  const minCap = summary.minimumCapital ?? 50000;
  const recCap = summary.recommendedCapital ?? 50000;
  const kpis = summary.portfolioKPIs;
  const capRow = summary.capitalComparison.find(r => r.capital === selectedCap);
  const components = summary.components ?? [];
  const activeComps = components.filter(c => c.status !== 'DATA_BLOCKED' && c.status !== 'REJECTED');
  const filteredComps = compFilter === 'ALL' ? components
    : compFilter === 'ACTIVE' ? components.filter(c => c.status === 'ACTIVE')
    : compFilter === 'BLOCKED' ? components.filter(c => c.status === 'DATA_BLOCKED')
    : components.filter(c => c.status === compFilter);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'equity', label: 'Equity / DD' },
    { id: 'weights', label: 'Weights' },
    { id: 'costs', label: 'Costs' },
    { id: 'components', label: '17 Components' },
    { id: 'capital', label: 'Capital' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#020202] text-[#c8c8c8] font-mono">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="border-b border-[#111] pb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] text-[#333] uppercase tracking-[0.3em] mb-2">Capitalife Terminal · Portfolio Research</div>
              <h1 className="text-xl font-light text-[#e0e0e0] tracking-wide">White Swan</h1>
              <div className="text-[10px] text-[#d4a843] tracking-[0.15em] uppercase mt-0.5">Final Portfolio</div>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center gap-2 border border-[#222] rounded px-3 py-1.5 bg-[#0a0a0a]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#3d5a3d]" />
                <span className="text-[9px] text-[#555] uppercase tracking-widest">Research Complete</span>
              </div>
              <div className="text-[8px] text-[#2a2a2a] mt-1">{summary.generatedAt ?? '2026-08-15'}</div>
            </div>
          </div>

          {/* Hero KPIs */}
          <div className="mt-5 border border-[#111] rounded bg-[#040404] overflow-x-auto">
            <div className="flex min-w-max">
              <KpiCell label="Rec. Capital" value={`€${(recCap/1000).toFixed(0)}k`} gold />
              <KpiCell label="Net CAGR" value={fmtPct(kpis?.CAGR)} sub="full period" />
              <KpiCell label="OOS CAGR" value={fmtPct(kpis?.oosCAGR)} sub="2017–2026" />
              <KpiCell label="Sharpe" value={fmtNum(kpis?.Sharpe)} />
              <KpiCell label="Sortino" value={fmtNum(kpis?.Sortino)} />
              <KpiCell label="Calmar" value={fmtNum(kpis?.Calmar)} />
              <KpiCell label="MaxDD" value={fmtPct(kpis?.MaxDDPct)} sub={`${fmtEUR(kpis?.MaxDDEUR)}`} />
              <KpiCell label="Cost/NAV" value={fmtPct(kpis?.costPerNAV, 2)} sub={`${fmtEUR(kpis?.annualCostEUR)}/yr`} />
              <KpiCell label="Margin" value={fmtPct(summary.capitalComparison.find(r => r.capital === recCap)?.marginPct)} />
              <KpiCell label="Total Net" value={fmtEUR(kpis?.totalNetEUR)} sub="2008–2026" />
            </div>
          </div>
        </div>

        {/* ── Capital selector ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[9px] text-[#333] uppercase tracking-widest">Capital:</span>
          <CapSelector selected={selectedCap} multi={multiCap} onSingle={handleSingleCap} onToggle={toggleCap} minCap={minCap} />
          <div className="text-[9px] text-[#2a2a2a]">✗ = below min margin (€{(minCap/1000).toFixed(0)}k)</div>
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div className="flex gap-0 border-b border-[#111]">
          {tabs.map(t => (
            <button key={t.id}
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`px-4 py-2 text-[10px] uppercase tracking-widest border-b-2 transition-colors
                ${activeTab === t.id
                  ? 'border-[#d4a843] text-[#d4a843]'
                  : 'border-transparent text-[#333] hover:text-[#666]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ────────────────────────────────────────────────── */}
        {activeTab === 'overview' && capRow && (
          <div className="space-y-4">
            {/* Selected capital KPIs */}
            <div className="border border-[#111] rounded bg-[#040404]">
              <div className="px-4 py-2 border-b border-[#111] flex items-center justify-between">
                <span className="text-[9px] text-[#444] uppercase tracking-widest">
                  {fmtEUR(capRow.capital)} — {capRow.assessment === 'PASS' ? '✓ MARGIN PASS' : '✗ MARGIN FAIL'}
                </span>
                <span className={`text-[9px] font-mono ${capRow.assessment === 'PASS' ? 'text-[#3d5a3d]' : 'text-[#5a3d3d]'}`}>
                  Margin: {fmtPct(capRow.marginPct)}
                </span>
              </div>
              <div className="flex flex-wrap">
                <KpiCell label="CAGR" value={capRow.CAGR != null ? fmtPct(capRow.CAGR) : '—'} gold={capRow.CAGR != null && capRow.CAGR > 5} />
                <KpiCell label="IS CAGR" value={capRow.isCAGR != null ? fmtPct(capRow.isCAGR) : '—'} sub="2008–2016" />
                <KpiCell label="OOS CAGR" value={capRow.oosCAGR != null ? fmtPct(capRow.oosCAGR) : '—'} sub="2017–2026" />
                <KpiCell label="Sharpe" value={capRow.Sharpe != null ? fmtNum(capRow.Sharpe) : '—'} />
                <KpiCell label="MaxDD" value={capRow.MaxDDPct != null ? fmtPct(capRow.MaxDDPct) : '—'} />
                <KpiCell label="Margin" value={fmtPct(capRow.marginPct)} />
              </div>
            </div>

            {/* IS/OOS comparison */}
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-[#111] rounded bg-[#040404] p-3">
                <div className="text-[9px] text-[#444] uppercase tracking-widest mb-2">In-Sample 2008–2016</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-[#444]">CAGR</span><span className="text-[#c8c8c8]">{fmtPct(kpis?.isCAGR)}</span></div>
                  <div className="flex justify-between"><span className="text-[#444]">Sharpe</span><span className="text-[#c8c8c8]">{fmtNum(kpis?.isSharpe)}</span></div>
                </div>
              </div>
              <div className="border border-[#d4a843]/20 rounded bg-[#0a0800] p-3">
                <div className="text-[9px] text-[#d4a843] uppercase tracking-widest mb-2">Out-of-Sample 2017–2026</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-[#555]">CAGR</span><span className="text-[#c8c8c8]">{fmtPct(kpis?.oosCAGR)}</span></div>
                  <div className="flex justify-between"><span className="text-[#555]">Sharpe</span><span className="text-[#c8c8c8]">{fmtNum(kpis?.oosSharpe)}</span></div>
                </div>
              </div>
            </div>

            {/* Yearly returns mini-bar */}
            {equityData && (
              <div className="border border-[#111] rounded bg-[#040404] p-3">
                <div className="text-[9px] text-[#444] uppercase tracking-widest mb-3">Annual Returns (€50k reference)</div>
                <YearlyBar data={equityData.yearlyReturns} />
              </div>
            )}

            {/* Capital recommendations */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Minimum Full Capital', cap: summary.minimumCapital, note: 'All 15 active strategies, 1 contract each, margin ≤30%' },
                { label: 'Recommended Capital', cap: summary.recommendedCapital, note: 'Optimal margin efficiency, integer weight error minimized', gold: true },
                { label: 'Institutional Capital', cap: summary.institutionalCapital ?? 100000, note: 'Low contract granularity distortion, multiple contracts per sleeve' },
              ].map(r => (
                <div key={r.label} className={`border rounded p-3 ${r.gold ? 'border-[#d4a843]/30 bg-[#0a0800]' : 'border-[#111] bg-[#040404]'}`}>
                  <div className={`text-[9px] uppercase tracking-widest mb-1 ${r.gold ? 'text-[#d4a843]' : 'text-[#444]'}`}>{r.label}</div>
                  <div className={`text-base font-semibold ${r.gold ? 'text-[#d4a843]' : 'text-[#c8c8c8]'}`}>{fmtEUR(r.cap)}</div>
                  <div className="text-[9px] text-[#333] mt-1">{r.note}</div>
                </div>
              ))}
            </div>

            {/* Provenance */}
            <div className="border border-[#0d0d0d] rounded p-3 text-[9px] text-[#2a2a2a] space-y-1">
              <div className="text-[#333] font-semibold mb-1">Data Provenance</div>
              <div>Historical backtest · Real trade-derived NAV · No GBM · No synthetic returns</div>
              <div>GC/MGC: Yahoo Finance continuous futures 2008–2026 · ZW: TradingView CBOT ZW1 full history</div>
              <div>All other strategies: IBKR execution data (all-trades.json, 2008–2026)</div>
              <div>IBKR real costs · 30% portfolio margin cap · Integer contracts · No post-exit filters · No lookahead</div>
            </div>
          </div>
        )}

        {/* ── Equity / DD tab ─────────────────────────────────────────────── */}
        {activeTab === 'equity' && (
          <div className="space-y-4">
            <div className="flex gap-3 items-center">
              <span className="text-[9px] text-[#333] uppercase tracking-widest">Chart:</span>
              {(['full', 'is', 'oos'] as const).map(p => (
                <button key={p} onClick={() => setChartPeriod(p)}
                  className={`text-[9px] px-2 py-0.5 rounded border ${chartPeriod === p ? 'border-[#d4a843] text-[#d4a843]' : 'border-[#222] text-[#444] hover:border-[#333]'}`}>
                  {p === 'full' ? 'Full (2008–2026)' : p === 'is' ? 'IS (2008–2016)' : 'OOS (2017–2026)'}
                </button>
              ))}
            </div>

            <div className="border border-[#111] rounded bg-[#040404] p-4">
              <div className="text-[9px] text-[#444] uppercase tracking-widest mb-3">
                Equity Index (100 = start of period) — Multi-capital overlay
              </div>
              {equityData ? (
                <EquityChart equityData={equityData} multiCap={multiCap} minCap={minCap} />
              ) : <div className="h-48 flex items-center justify-center text-[#333] text-xs">Loading…</div>}
              <div className="flex flex-wrap gap-3 mt-2">
                {multiCap.filter(c => c >= minCap).map(c => (
                  <div key={c} className="flex items-center gap-1.5">
                    <div className="w-4 h-px" style={{ background: CAP_COLORS[c] }} />
                    <span className="text-[9px] text-[#444]">€{c >= 1000 ? (c/1000).toFixed(0) + 'k' : c}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[#111] rounded bg-[#040404] p-4">
              <div className="text-[9px] text-[#444] uppercase tracking-widest mb-3">Drawdown (%)</div>
              {equityData && <DrawdownChart equityData={equityData} multiCap={multiCap} minCap={minCap} />}
            </div>

            <div className="border border-[#111] rounded bg-[#040404] p-4">
              <div className="text-[9px] text-[#444] uppercase tracking-widest mb-3">Annual Returns (€50k reference)</div>
              {equityData && <YearlyBar data={equityData.yearlyReturns} />}
            </div>
          </div>
        )}

        {/* ── Weights tab ─────────────────────────────────────────────────── */}
        {activeTab === 'weights' && (
          <div className="space-y-4">
            <div className="text-[9px] text-[#333] mb-2">
              Target weights = inverse-vol risk budget. Realized weights = contract × margin / totalMargin.
              Gold bars = realized, grey = target.
            </div>
            <div className="border border-[#111] rounded bg-[#040404] p-4">
              <div className="text-[9px] text-[#444] uppercase tracking-widest mb-4">Risk Weight Allocation</div>
              <div className="space-y-3">
                {activeComps.sort((a, b) => (b.targetWeight ?? 0) - (a.targetWeight ?? 0)).map(c => (
                  <WeightBar key={c.id}
                    target={c.targetWeight ?? 0}
                    realized={c.realizedWeight ?? 0}
                    label={c.label ?? c.id}
                  />
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-[#111] rounded bg-[#040404]">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-[#111] text-[#333]">
                    {['Strategy', 'Instrument', 'Target%', 'Realized%', 'Contracts', 'Margin', 'Error'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeComps.sort((a, b) => (b.targetWeight ?? 0) - (a.targetWeight ?? 0)).map(c => (
                    <tr key={c.id} className="border-b border-[#0a0a0a] hover:bg-[#060606]">
                      <td className="px-3 py-1.5 text-[#999]">{c.label ?? c.id}</td>
                      <td className="px-3 py-1.5 text-[#d4a843] text-[9px]">{c.id.toUpperCase().slice(0,4)}</td>
                      <td className="px-3 py-1.5 text-right text-[#888]">{fmtPct(c.targetWeight, 1)}</td>
                      <td className="px-3 py-1.5 text-right text-[#d4a843]">{fmtPct(c.realizedWeight, 1)}</td>
                      <td className="px-3 py-1.5 text-right text-[#888]">{c.contracts}</td>
                      <td className="px-3 py-1.5 text-right text-[#666]">{fmtEUR(c.marginPerContract)}</td>
                      <td className="px-3 py-1.5 text-right text-[#555]">
                        {c.targetWeight != null && c.realizedWeight != null
                          ? fmtPct(Math.abs(c.targetWeight - c.realizedWeight), 1) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Costs tab ──────────────────────────────────────────────────── */}
        {activeTab === 'costs' && (
          <div className="space-y-4">
            <div className="border border-[#111] rounded bg-[#040404]">
              <div className="px-4 py-2 border-b border-[#111] text-[9px] text-[#444] uppercase tracking-widest">Portfolio Cost Summary</div>
              <div className="flex flex-wrap">
                <KpiCell label="Annual IBKR" value={fmtEUR(kpis?.annualCostEUR)} />
                <KpiCell label="Cost/NAV" value={fmtPct(kpis?.costPerNAV, 2)} />
                <KpiCell label="Gross CAGR" value={fmtPct((kpis?.CAGR ?? 0) + (kpis?.costPerNAV ?? 0))} />
                <KpiCell label="Net CAGR" value={fmtPct(kpis?.CAGR)} />
                <KpiCell label="Cost Drag" value={fmtPct(kpis?.costPerNAV, 2)} />
              </div>
            </div>
            <div className="overflow-x-auto border border-[#111] rounded bg-[#040404]">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-[#111] text-[#333]">
                    {['Strategy', 'Trades/yr', '$/RT', 'Cost/yr €', 'Net€', 'Cost/Net%'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeComps.map(c => {
                    const annualCost = c.annualCostEUR ?? ((c.costPerRT ?? 0) * (c.tradesPerYear ?? 0) * 0.81677);
                    const costNetRatio = c.netEUR > 0 ? annualCost / (c.netEUR / 18.5) * 100 : 999;
                    return (
                      <tr key={c.id} className="border-b border-[#0a0a0a] hover:bg-[#060606]">
                        <td className="px-3 py-1.5 text-[#999]">{c.label ?? c.id}</td>
                        <td className="px-3 py-1.5 text-right text-[#888]">{c.tradesPerYear?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right text-[#888]">{c.costPerRT != null ? `$${c.costPerRT.toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-[#d4a843]">{fmtEUR(annualCost)}</td>
                        <td className="px-3 py-1.5 text-right text-[#888]">{fmtEUR(c.netEUR)}</td>
                        <td className={`px-3 py-1.5 text-right text-[9px] ${costNetRatio > 50 ? 'text-red-800' : 'text-[#555]'}`}>
                          {costNetRatio.toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 17 Components tab ─────────────────────────────────────────── */}
        {activeTab === 'components' && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {['ALL', 'ACTIVE', 'BLOCKED'].map(f => (
                <button key={f} onClick={() => setCompFilter(f)}
                  className={`text-[9px] px-2.5 py-1 rounded border ${compFilter === f ? 'border-[#d4a843] text-[#d4a843]' : 'border-[#222] text-[#444] hover:border-[#333]'}`}>
                  {f}
                </button>
              ))}
              <span className="text-[9px] text-[#222] ml-auto">{filteredComps.length} / 17 shown</span>
            </div>
            <div className="overflow-x-auto border border-[#111] rounded bg-[#040404]">
              <table className="w-full text-[10px] min-w-[800px]">
                <thead>
                  <tr className="border-b border-[#111] text-[#333]">
                    {['Component', 'Net €', 'IS €', 'OOS €', 'PF', 'PosYr', 'Tr/yr', 'Margin', 'Weight%', 'Status'].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredComps.map(c => (
                    <tr key={c.id} className="border-b border-[#0a0a0a] hover:bg-[#060606]">
                      <td className="px-2 py-1.5 text-[#999] max-w-[140px] truncate">{c.label ?? c.id}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${(c.netEUR ?? 0) >= 0 ? 'text-[#888]' : 'text-[#5a3d3d]'}`}>{fmtEUR(c.netEUR)}</td>
                      <td className="px-2 py-1.5 text-right text-[#666]">{fmtEUR(c.isNet)}</td>
                      <td className="px-2 py-1.5 text-right text-[#888]">{fmtEUR(c.oosNet)}</td>
                      <td className="px-2 py-1.5 text-right text-[#777]">{c.PF?.toFixed(2) ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right text-[#555]">{c.posYr ?? '—'}/{c.totYr ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right text-[#555]">{c.tradesPerYear?.toFixed(1) ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right text-[#555]">{fmtEUR(c.marginPerContract)}</td>
                      <td className="px-2 py-1.5 text-right text-[#d4a843]">{fmtPct(c.targetWeight, 1)}</td>
                      <td className="px-2 py-1.5">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="border border-[#0d0d0d] rounded p-3 text-[9px] text-[#2a2a2a] grid grid-cols-2 md:grid-cols-4 gap-1">
              {Object.entries(STATUS_COLOR).slice(0,8).map(([s, c]) => (
                <div key={s} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                  <span style={{ color: c }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Capital Comparison tab ────────────────────────────────────── */}
        {activeTab === 'capital' && (
          <div className="space-y-3">
            <div className="overflow-x-auto border border-[#111] rounded bg-[#040404]">
              <table className="w-full text-[10px] min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#111] text-[#333]">
                    {['Capital', 'Assessment', 'Margin%', 'CAGR', 'IS CAGR', 'OOS CAGR', 'Sharpe', 'Sortino', 'Calmar', 'MaxDD'].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.capitalComparison.map(r => {
                    const isRec = r.capital === recCap;
                    const isFail = r.assessment === 'MARGIN_FAIL';
                    return (
                      <tr key={r.capital}
                        className={`border-b border-[#0a0a0a] ${isRec ? 'bg-[#0a0800]' : isFail ? 'opacity-40' : 'hover:bg-[#060606]'}`}>
                        <td className={`px-2 py-1.5 font-mono font-semibold ${isRec ? 'text-[#d4a843]' : 'text-[#777]'}`}>
                          {fmtEUR(r.capital)}{isRec ? ' ★' : ''}
                        </td>
                        <td className={`px-2 py-1.5 text-[9px] ${isFail ? 'text-[#5a3d3d]' : 'text-[#3d5a3d]'}`}>{r.assessment}</td>
                        <td className="px-2 py-1.5 text-right text-[#666]">{fmtPct(r.marginPct)}</td>
                        <td className="px-2 py-1.5 text-right text-[#c8c8c8]">{r.CAGR != null ? fmtPct(r.CAGR) : '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#777]">{r.isCAGR != null ? fmtPct(r.isCAGR) : '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#888]">{r.oosCAGR != null ? fmtPct(r.oosCAGR) : '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#777]">{r.Sharpe != null ? fmtNum(r.Sharpe) : '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#666]">{r.Sortino != null ? fmtNum(r.Sortino) : '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#666]">{r.Calmar != null ? fmtNum(r.Calmar) : '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#666]">{r.MaxDDPct != null ? fmtPct(r.MaxDDPct) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[9px] text-[#222]">
              ★ Recommended Investor Capital · ✗ Below minimum margin threshold (€{(minCap/1000).toFixed(0)}k)
            </div>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="border-t border-[#0d0d0d] pt-4 text-[8px] text-[#1e1e1e] space-y-0.5">
          <div>WHITE SWAN FINAL · Historical Backtest · Real Futures Data · No Simulation · IBKR Real Costs</div>
          <div>EEM: DATA_BLOCKED (CME EMF delisted 2019) · IWM/M2K: DATA_BLOCKED (no signal in project) · Not financial advice</div>
          <div>Serkan package: workspace/output/white-swan/serkan/ · {summary.serkan?.rows ?? 3316} rows · {summary.generatedAt}</div>
        </div>
      </div>
    </div>
  );
}
