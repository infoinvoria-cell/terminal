'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from 'recharts';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ComponentData {
  id: string; label?: string; instrument?: string; status: string; robustness?: string;
  netEUR: number; isNet: number; oosNet: number; oos2019Net?: number;
  PF: number; posYr: number; totYr: number; targetWeight: number;
  realizedWeight?: number; contracts: number; tradesPerYear: number;
  marginPerContract?: number; costPerRT?: number; annualCostEUR?: number;
}
interface CapLevel {
  capital: number; assessment: string; marginPct: number; marginTotal?: number;
  CAGR: number | null; isCAGR?: number | null; oosCAGR?: number | null; oos2019CAGR?: number | null;
  Sharpe: number | null; Sortino?: number | null; Calmar?: number | null; MaxDDPct: number | null;
  totalNetEUR?: number; annualCostEUR?: number; feasibility?: boolean;
  contracts?: Record<string, number>;
}
interface PortfolioKPIs {
  CAGR: number; oosCAGR: number; oos2019CAGR?: number; isCAGR: number;
  Sharpe: number; oosSharpe?: number; isSharpe?: number;
  Sortino: number; Calmar: number; MaxDDPct: number; MaxDDEUR: number;
  totalNetEUR: number; annualCostEUR: number; costPerNAV: number;
}
interface Variants {
  BEST_RETURN?: { capital: number; CAGR: number; oosCAGR: number };
  BEST_BALANCED?: { capital: number; CAGR: number; Sharpe: number };
  BEST_LOW_CAPITAL?: { capital: number; CAGR: number };
  FINAL_RECOMMENDATION?: { capital: number; CAGR: number; note?: string };
}
interface PerfAttribution {
  baseAlpha?: number; qualityImprovement?: number; contractSizing?: number;
  ibkrCosts?: number; finalNet?: number;
}
interface Summary {
  version?: string; recommendedCapital: number; minimumCapital: number;
  technicalMinimum?: number; institutionalCapital?: number;
  canonicalTotal?: number; tradableComponents?: number; blockedComponents?: number;
  components: ComponentData[];
  capitalComparison: CapLevel[];
  portfolioKPIs: PortfolioKPIs;
  variants?: Variants;
  performanceAttribution?: PerfAttribution;
  serkan?: { rows?: number; dateRange?: string[]; path?: string };
  generatedAt?: string; status?: string;
}
interface EquityPoint { date: string; nav: number; dd?: number }
interface EquityData {
  series: Record<string, EquityPoint[]>;
  yearlyReturns: Array<{ year: number; netEUR: number; returnPct: number }>;
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const ALL_CAPS = [10000, 12500, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];
const CAP_COLORS: Record<number, string> = {
  10000: '#374151', 12500: '#4b5563', 15000: '#6b7280', 20000: '#9ca3af',
  25000: '#d1d5db', 30000: '#e5e7eb', 40000: '#d4a843', 50000: '#f5d78e',
  75000: '#a3956b', 100000: '#7a7050',
};
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#22c55e', ROBUST: '#22c55e', ACCEPTABLE: '#3b82f6',
  LOW_WEIGHT: '#6b7280', PASS_THROUGH: '#4b5563', PROXY_REQUIRED: '#8b5cf6',
  DATA_BLOCKED: '#ef4444', REJECTED: '#dc2626', RESEARCH_CANDIDATE: '#d4a843',
  EXCLUDED: '#374151',
};
const ASSESS_COLOR: Record<string, string> = {
  COMFORTABLE: '#22c55e', FEASIBLE: '#84cc16', TIGHT: '#f59e0b',
  AGGRESSIVE: '#f97316', MARGIN_RISK: '#ef4444',
};

// ─── Formatters ─────────────────────────────────────────────────────────────────
const fmtEUR = (n: number | null | undefined) =>
  n == null ? '—' : `€${Math.round(n).toLocaleString('de-DE')}`;
const fmtPct = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : `${n.toFixed(d)}%`;
const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : n.toFixed(d);
const fmtCap = (c: number) =>
  c >= 1000 ? `€${(c / 1000) % 1 === 0 ? c / 1000 : (c / 1000).toFixed(1)}k` : `€${c}`;

// ─── Sub-components ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? '#6b7280';
  return (
    <span className="inline-flex items-center text-[9px] font-mono px-1.5 py-0.5 rounded border"
      style={{ color, borderColor: color + '40', background: color + '10' }}>
      {status}
    </span>
  );
}

function AssessBadge({ assessment }: { assessment: string }) {
  const color = ASSESS_COLOR[assessment] ?? '#6b7280';
  return (
    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
      style={{ color, background: color + '15' }}>
      {assessment}
    </span>
  );
}

function KpiCell({ label, value, sub, gold, dim }: { label: string; value: string; sub?: string; gold?: boolean; dim?: boolean }) {
  return (
    <div className="border-r border-[#1a1a1a] last:border-r-0 px-3 py-2.5 min-w-0">
      <div className="text-[9px] text-[#353535] uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-[13px] font-mono font-semibold ${gold ? 'text-[#d4a843]' : dim ? 'text-[#555]' : 'text-[#c0c0c0]'}`}>{value}</div>
      {sub && <div className="text-[9px] text-[#333] mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-px flex-1 bg-[#111]" />
      <span className="text-[9px] text-[#2a2a2a] uppercase tracking-[0.25em] font-light">{text}</span>
      <div className="h-px flex-1 bg-[#111]" />
    </div>
  );
}

// ─── Capital selector ─────────────────────────────────────────────────────────
function CapSelector({
  available, selected, multi, onSingle, onToggle, minCap,
}: {
  available: number[]; selected: number; multi: number[];
  onSingle: (c: number) => void; onToggle: (c: number) => void; minCap: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {available.map(c => {
        const fail = c < minCap;
        const active = multi.includes(c);
        return (
          <button key={c} onClick={() => { onSingle(c); onToggle(c); }} disabled={fail}
            className={`text-[10px] font-mono px-2.5 py-1 rounded border transition-colors
              ${fail ? 'border-[#111] text-[#1e1e1e] cursor-not-allowed line-through' :
                active ? 'border-[#d4a843] text-[#d4a843] bg-[#1a1400]' :
                'border-[#222] text-[#444] hover:border-[#333] hover:text-[#777]'}`}>
            {fmtCap(c)}
          </button>
        );
      })}
    </div>
  );
}

// ─── Equity chart ────────────────────────────────────────────────────────────
function EquityChart({ equityData, multiCap, minCap }: { equityData: EquityData; multiCap: number[]; minCap: number }) {
  const activeCaps = multiCap.filter(c => c >= minCap && equityData.series[c]);
  const data = useMemo(() => {
    const merged: Record<string, Record<string, number>> = {};
    activeCaps.forEach(c => {
      const start = equityData.series[c]?.[0]?.nav ?? c;
      equityData.series[c]?.forEach(p => {
        if (!merged[p.date]) merged[p.date] = {};
        merged[p.date][`n${c}`] = p.nav / start * 100;
      });
    });
    return Object.entries(merged).sort(([a], [b]) => a < b ? -1 : 1)
      .map(([date, v]) => ({ date, ...v }));
  }, [activeCaps, equityData]);

  if (!activeCaps.length) return (
    <div className="h-48 flex items-center justify-center text-[#2a2a2a] text-[11px]">Select a capital level above</div>
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#0d0d0d" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#333' }} tickCount={8}
          tickFormatter={d => d?.slice(0, 7) ?? ''} />
        <YAxis tick={{ fontSize: 9, fill: '#333' }} domain={['auto', 'auto']}
          tickFormatter={v => `${v.toFixed(0)}`} />
        <Tooltip contentStyle={{ background: '#080808', border: '1px solid #1a1a1a', fontSize: 10, borderRadius: 4 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}`, String(name).replace('n', '€')]} />
        <ReferenceLine y={100} stroke="#1a1a1a" strokeDasharray="2 2" />
        {activeCaps.map(c => (
          <Line key={c} type="monotone" dataKey={`n${c}`} stroke={CAP_COLORS[c] ?? '#888'}
            dot={false} strokeWidth={1.5} name={fmtCap(c)} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Drawdown chart ──────────────────────────────────────────────────────────
function DrawdownChart({ equityData, multiCap, minCap }: { equityData: EquityData; multiCap: number[]; minCap: number }) {
  const activeCaps = multiCap.filter(c => c >= minCap && equityData.series[c]);
  const data = useMemo(() => {
    const merged: Record<string, Record<string, number>> = {};
    activeCaps.forEach(c => {
      let peak = equityData.series[c]?.[0]?.nav ?? c;
      equityData.series[c]?.forEach(p => {
        if (p.nav > peak) peak = p.nav;
        if (!merged[p.date]) merged[p.date] = {};
        merged[p.date][`d${c}`] = -(peak - p.nav) / peak * 100;
      });
    });
    return Object.entries(merged).sort(([a], [b]) => a < b ? -1 : 1)
      .map(([date, v]) => ({ date, ...v }));
  }, [activeCaps, equityData]);

  if (!activeCaps.length) return null;
  return (
    <ResponsiveContainer width="100%" height={110}>
      <AreaChart data={data} margin={{ top: 2, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#0d0d0d" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#333' }} tickCount={8}
          tickFormatter={d => d?.slice(0, 7) ?? ''} />
        <YAxis tick={{ fontSize: 9, fill: '#333' }} domain={['auto', 0]}
          tickFormatter={v => `${v.toFixed(0)}%`} />
        <Tooltip contentStyle={{ background: '#080808', border: '1px solid #1a1a1a', fontSize: 10, borderRadius: 4 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [`${(-Number(v)).toFixed(2)}%`, 'DD']} />
        {activeCaps.map(c => (
          <Area key={c} type="monotone" dataKey={`d${c}`}
            stroke={CAP_COLORS[c] ?? '#888'} fill="none" strokeWidth={1} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Yearly bar ──────────────────────────────────────────────────────────────
function YearlyBar({ data }: { data: Array<{ year: number; returnPct: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={90}>
      <BarChart data={data} margin={{ top: 2, right: 8, bottom: 2, left: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#0d0d0d" />
        <XAxis dataKey="year" tick={{ fontSize: 8, fill: '#333' }} />
        <YAxis tick={{ fontSize: 8, fill: '#333' }} tickFormatter={v => `${v}%`} />
        <Tooltip contentStyle={{ background: '#080808', border: '1px solid #1a1a1a', fontSize: 10 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Return']} />
        <ReferenceLine y={0} stroke="#222" />
        <Bar dataKey="returnPct" radius={[1, 1, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.returnPct >= 0 ? '#1a3a1a' : '#3a1a1a'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Variant chip ────────────────────────────────────────────────────────────
function VariantChip({ label, data, gold }: { label: string; data?: { capital: number; CAGR?: number; oosCAGR?: number; Sharpe?: number; note?: string }; gold?: boolean }) {
  if (!data) return null;
  return (
    <div className={`border rounded p-2.5 ${gold ? 'border-[#d4a843]/40 bg-[#0a0800]' : 'border-[#111] bg-[#040404]'}`}>
      <div className={`text-[8px] uppercase tracking-widest mb-1 ${gold ? 'text-[#d4a843]' : 'text-[#333]'}`}>{label}</div>
      <div className={`text-sm font-mono font-semibold ${gold ? 'text-[#d4a843]' : 'text-[#888]'}`}>{fmtCap(data.capital)}</div>
      <div className="text-[9px] text-[#444] mt-0.5 space-y-0.5">
        {data.CAGR != null && <div>CAGR {fmtPct(data.CAGR)}</div>}
        {data.oosCAGR != null && <div>OOS {fmtPct(data.oosCAGR)}</div>}
        {data.Sharpe != null && <div>Sharpe {fmtNum(data.Sharpe)}</div>}
        {data.note && <div className="text-[#2a2a2a]">{data.note}</div>}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export function WhiteSwanFinal() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [equityData, setEquityData] = useState<EquityData | null>(null);
  const [selectedCap, setSelectedCap] = useState<number>(50000);
  const [multiCap, setMultiCap] = useState<number[]>([50000]);
  const [activeTab, setActiveTab] = useState<'overview' | 'equity' | 'weights' | 'costs' | 'components' | 'capital' | 'attribution'>('overview');
  const [compFilter, setCompFilter] = useState<string>('ALL');

  useEffect(() => {
    fetch('/data/white-swan/final/portfolio-summary.json').then(r => r.json()).then(d => {
      setSummary(d);
      const rec = d.recommendedCapital ?? 50000;
      setSelectedCap(rec);
      setMultiCap([rec]);
    }).catch(() => null);
    fetch('/data/white-swan/final/equity-series.json').then(r => r.json()).then(setEquityData).catch(() => null);
  }, []);

  const toggleCap = useCallback((c: number) => {
    setMultiCap(prev => prev.includes(c) ? (prev.length > 1 ? prev.filter(x => x !== c) : prev) : [...prev, c]);
  }, []);

  if (!summary) {
    return (
      <div className="min-h-screen bg-[#020202] flex items-center justify-center">
        <div className="text-[#1e1e1e] text-xs font-mono animate-pulse">Loading White Swan Final…</div>
      </div>
    );
  }

  const minCap = summary.minimumCapital ?? 50000;
  const techMin = summary.technicalMinimum ?? minCap;
  const recCap = summary.recommendedCapital ?? 50000;
  const kpis = summary.portfolioKPIs;
  const capRow = summary.capitalComparison.find(r => r.capital === selectedCap);
  const components = summary.components ?? [];
  const activeComps = components.filter(c => !['DATA_BLOCKED', 'REJECTED', 'EXCLUDED'].includes(c.status));
  const availableCaps = summary.capitalComparison.map(r => r.capital);

  const filteredComps = compFilter === 'ALL' ? components.filter(c => c.status !== 'EXCLUDED')
    : compFilter === 'ACTIVE' ? components.filter(c => ['ACTIVE', 'ROBUST', 'ACCEPTABLE', 'LOW_WEIGHT'].includes(c.status))
    : compFilter === 'LOW' ? components.filter(c => c.status === 'LOW_WEIGHT')
    : components.filter(c => ['DATA_BLOCKED', 'PROXY_REQUIRED', 'EXCLUDED'].includes(c.status));

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'equity', label: 'Equity / DD' },
    { id: 'weights', label: 'Weights' },
    { id: 'costs', label: 'Costs' },
    { id: 'attribution', label: 'Attribution' },
    { id: 'components', label: `${summary.canonicalTotal ?? 17} Components` },
    { id: 'capital', label: 'Capital Table' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#020202] text-[#c0c0c0] font-mono">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="border-b border-[#0d0d0d] pb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[8px] text-[#222] uppercase tracking-[0.4em] mb-2">
                Capitalife Terminal · Portfolio Research {summary.version ? `· ${summary.version}` : ''}
              </div>
              <h1 className="text-xl font-light text-[#e0e0e0] tracking-wide">White Swan</h1>
              <div className="text-[10px] text-[#d4a843] tracking-[0.2em] uppercase mt-0.5">Final Optimized Portfolio</div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="inline-flex items-center gap-2 border border-[#1a1a1a] rounded px-2.5 py-1.5 bg-[#050505]">
                <span className="text-[8px] text-[#2a6a2a] uppercase tracking-widest">
                  {summary.tradableComponents ?? 15} tradable
                </span>
                <span className="text-[#1a1a1a]">·</span>
                <span className="text-[8px] text-[#6a2a2a] uppercase tracking-widest">
                  {summary.blockedComponents ?? 2} blocked
                </span>
                <span className="text-[#1a1a1a]">·</span>
                <span className="text-[8px] text-[#333] uppercase tracking-widest">
                  {summary.canonicalTotal ?? 17} canonical
                </span>
              </div>
              <div className="text-[8px] text-[#1e1e1e]">{summary.generatedAt ?? '2026-08-15'}</div>
            </div>
          </div>

          {/* Hero KPIs */}
          <div className="mt-4 border border-[#0d0d0d] rounded bg-[#030303] overflow-x-auto">
            <div className="flex min-w-max">
              <KpiCell label="Rec. Capital" value={fmtCap(recCap)} sub={`tech min ${fmtCap(techMin)}`} gold />
              <KpiCell label="Net CAGR" value={fmtPct(kpis?.CAGR)} sub="full period" />
              <KpiCell label="OOS CAGR" value={fmtPct(kpis?.oosCAGR)} sub="2017–2026" />
              {kpis?.oos2019CAGR != null && <KpiCell label="OOS 2019+" value={fmtPct(kpis.oos2019CAGR)} sub="2019–2026" />}
              <KpiCell label="Sharpe" value={fmtNum(kpis?.Sharpe)} />
              <KpiCell label="Calmar" value={fmtNum(kpis?.Calmar)} />
              <KpiCell label="MaxDD" value={fmtPct(kpis?.MaxDDPct)} sub={fmtEUR(kpis?.MaxDDEUR)} />
              <KpiCell label="Cost/NAV" value={fmtPct(kpis?.costPerNAV, 2)} sub={`${fmtEUR(kpis?.annualCostEUR)}/yr`} />
              <KpiCell label="Margin" value={fmtPct(capRow?.marginPct)} sub={capRow?.assessment ?? ''} />
              <KpiCell label="Net Total" value={fmtEUR(kpis?.totalNetEUR)} sub="2008–2026" dim />
            </div>
          </div>
        </div>

        {/* ── Variants row ───────────────────────────────────────────────── */}
        {summary.variants && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <VariantChip label="Best Return" data={summary.variants.BEST_RETURN} />
            <VariantChip label="Best Balanced" data={summary.variants.BEST_BALANCED} />
            <VariantChip label="Best Low Capital" data={summary.variants.BEST_LOW_CAPITAL} />
            <VariantChip label="Final Recommendation" data={summary.variants.FINAL_RECOMMENDATION} gold />
          </div>
        )}

        {/* ── Capital selector ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[8px] text-[#222] uppercase tracking-widest">Capital:</span>
          <CapSelector
            available={availableCaps.length ? availableCaps : ALL_CAPS}
            selected={selectedCap} multi={multiCap}
            onSingle={setSelectedCap} onToggle={toggleCap} minCap={techMin}
          />
          <span className="text-[8px] text-[#1a1a1a]">strikethrough = below tech min {fmtCap(techMin)}</span>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex gap-0 border-b border-[#0d0d0d] overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`px-3 py-2 text-[9px] uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors
                ${activeTab === t.id ? 'border-[#d4a843] text-[#d4a843]' : 'border-transparent text-[#2a2a2a] hover:text-[#555]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ───────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {capRow && (
              <div className="border border-[#0d0d0d] rounded bg-[#030303]">
                <div className="px-3 py-2 border-b border-[#0d0d0d] flex items-center justify-between">
                  <span className="text-[8px] text-[#2a2a2a] uppercase tracking-widest">{fmtCap(capRow.capital)}</span>
                  <AssessBadge assessment={capRow.assessment} />
                </div>
                <div className="flex flex-wrap overflow-x-auto">
                  <KpiCell label="CAGR" value={capRow.CAGR != null ? fmtPct(capRow.CAGR) : '—'} gold={!!capRow.CAGR && capRow.CAGR > 10} />
                  <KpiCell label="IS CAGR" value={capRow.isCAGR != null ? fmtPct(capRow.isCAGR) : '—'} sub="2008–2016" />
                  <KpiCell label="OOS CAGR" value={capRow.oosCAGR != null ? fmtPct(capRow.oosCAGR) : '—'} sub="2017–2026" />
                  {capRow.oos2019CAGR != null && <KpiCell label="OOS 2019+" value={fmtPct(capRow.oos2019CAGR)} sub="2019–2026" />}
                  <KpiCell label="Sharpe" value={capRow.Sharpe != null ? fmtNum(capRow.Sharpe) : '—'} />
                  <KpiCell label="MaxDD" value={capRow.MaxDDPct != null ? fmtPct(capRow.MaxDDPct) : '—'} />
                  <KpiCell label="Margin" value={fmtPct(capRow.marginPct)} />
                  <KpiCell label="Feasible" value={capRow.feasibility ? 'YES' : 'NO'} gold={!!capRow.feasibility} />
                </div>
              </div>
            )}

            {/* IS/OOS */}
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-[#0d0d0d] rounded bg-[#030303] p-3">
                <div className="text-[8px] text-[#2a2a2a] uppercase tracking-widest mb-2">In-Sample 2008–2016</div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]"><span className="text-[#2a2a2a]">CAGR</span><span className="text-[#888]">{fmtPct(kpis?.isCAGR)}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-[#2a2a2a]">Sharpe</span><span className="text-[#888]">{fmtNum(kpis?.isSharpe)}</span></div>
                </div>
              </div>
              <div className="border border-[#d4a843]/15 rounded bg-[#090700] p-3">
                <div className="text-[8px] text-[#d4a843] uppercase tracking-widest mb-2">Out-of-Sample 2017–2026</div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]"><span className="text-[#555]">CAGR</span><span className="text-[#c0c0c0]">{fmtPct(kpis?.oosCAGR)}</span></div>
                  {kpis?.oos2019CAGR != null && (
                    <div className="flex justify-between text-[11px]"><span className="text-[#555]">2019+</span><span className="text-[#d4a843]">{fmtPct(kpis.oos2019CAGR)}</span></div>
                  )}
                  <div className="flex justify-between text-[11px]"><span className="text-[#555]">Sharpe</span><span className="text-[#c0c0c0]">{fmtNum(kpis?.oosSharpe)}</span></div>
                </div>
              </div>
            </div>

            {/* Yearly returns */}
            {equityData?.yearlyReturns && (
              <div className="border border-[#0d0d0d] rounded bg-[#030303] p-3">
                <div className="text-[8px] text-[#2a2a2a] uppercase tracking-widest mb-2">Annual Returns · {fmtCap(recCap)}</div>
                <YearlyBar data={equityData.yearlyReturns} />
              </div>
            )}

            {/* Capital tiers */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: 'Technical Minimum', c: techMin, note: 'Broker margin feasible' },
                { l: 'Investor Minimum', c: minCap, note: 'Incl. DD + cash buffer', gold: false },
                { l: 'Recommended', c: recCap, note: 'Optimal risk/reward', gold: true },
              ].map(r => (
                <div key={r.l} className={`border rounded p-2.5 ${r.gold ? 'border-[#d4a843]/30 bg-[#0a0800]' : 'border-[#0d0d0d] bg-[#030303]'}`}>
                  <div className={`text-[8px] uppercase tracking-widest mb-1 ${r.gold ? 'text-[#d4a843]' : 'text-[#2a2a2a]'}`}>{r.l}</div>
                  <div className={`text-sm font-semibold ${r.gold ? 'text-[#d4a843]' : 'text-[#888]'}`}>{fmtCap(r.c)}</div>
                  <div className="text-[8px] text-[#222] mt-0.5">{r.note}</div>
                </div>
              ))}
            </div>

            {/* Provenance */}
            <div className="border border-[#080808] rounded p-3 text-[8px] text-[#1a1a1a] space-y-0.5">
              <div className="text-[#222] uppercase tracking-widest mb-1">Data Provenance</div>
              <div>Real historical backtest · IBKR execution data 2008–2026 · No GBM · No synthetic returns</div>
              <div>GC/MGC: Yahoo Finance continuous futures · ZW: TradingView CBOT ZW1 · Others: all-trades.json</div>
              <div>IBKR real costs · Integer contracts · IS/OOS split 2017-01-01 · M6E/MZW micro substitution</div>
              {summary.version === 'v4' && (
                <div className="text-[#1a1a1a] mt-0.5">GLD: ATR 20-80% (was 33-67%) +€5,159 OOS · EURUSD: M6E ×0.1 · ZW: MZW ×0.2</div>
              )}
            </div>
          </div>
        )}

        {/* ── Equity / DD ─────────────────────────────────────────────────── */}
        {activeTab === 'equity' && (
          <div className="space-y-3">
            <div className="border border-[#0d0d0d] rounded bg-[#030303] p-4">
              <div className="text-[8px] text-[#2a2a2a] uppercase tracking-widest mb-3">Equity Index (100 = period start) · Multi-capital</div>
              {equityData ? <EquityChart equityData={equityData} multiCap={multiCap} minCap={techMin} />
                : <div className="h-48 flex items-center justify-center text-[#1a1a1a] text-xs">Loading…</div>}
              <div className="flex flex-wrap gap-3 mt-2">
                {multiCap.filter(c => c >= techMin).map(c => (
                  <div key={c} className="flex items-center gap-1.5">
                    <div className="w-5 h-px" style={{ background: CAP_COLORS[c] ?? '#555' }} />
                    <span className="text-[8px] text-[#333]">{fmtCap(c)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-[#0d0d0d] rounded bg-[#030303] p-4">
              <div className="text-[8px] text-[#2a2a2a] uppercase tracking-widest mb-2">Drawdown (%)</div>
              {equityData && <DrawdownChart equityData={equityData} multiCap={multiCap} minCap={techMin} />}
            </div>
            {equityData?.yearlyReturns && (
              <div className="border border-[#0d0d0d] rounded bg-[#030303] p-4">
                <div className="text-[8px] text-[#2a2a2a] uppercase tracking-widest mb-2">Annual Returns · {fmtCap(recCap)}</div>
                <YearlyBar data={equityData.yearlyReturns} />
              </div>
            )}
          </div>
        )}

        {/* ── Weights ─────────────────────────────────────────────────────── */}
        {activeTab === 'weights' && (
          <div className="space-y-3">
            <div className="text-[8px] text-[#222] mb-2">
              Weights at selected capital {fmtCap(selectedCap)}. Grey bar = target, gold = realized.
            </div>
            {/* Weight bars */}
            <div className="border border-[#0d0d0d] rounded bg-[#030303] p-4 space-y-3">
              {activeComps.sort((a, b) => (b.targetWeight ?? 0) - (a.targetWeight ?? 0)).map(c => {
                const tw = c.targetWeight ?? 0;
                const rw = c.realizedWeight ?? 0;
                const contracts = capRow?.contracts?.[c.id] ?? c.contracts;
                return (
                  <div key={c.id} className="space-y-0.5">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-[#444]">{c.label ?? c.id}</span>
                      <span className="text-[#333] font-mono">{tw.toFixed(1)}% → {rw.toFixed(1)}% · {contracts}ct</span>
                    </div>
                    <div className="relative h-1.5 bg-[#0d0d0d] rounded">
                      <div className="absolute inset-y-0 left-0 bg-[#1e1e1e] rounded" style={{ width: `${Math.min(tw, 100)}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-[#d4a843] rounded opacity-50" style={{ width: `${Math.min(rw, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Contracts table */}
            <div className="overflow-x-auto border border-[#0d0d0d] rounded bg-[#030303]">
              <table className="w-full text-[10px] min-w-[600px]">
                <thead>
                  <tr className="border-b border-[#0d0d0d] text-[#222]">
                    {['Strategy', 'Instrument', 'Target%', 'Realized%', 'Contracts', 'Margin€', 'Error%'].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeComps.sort((a, b) => (b.targetWeight ?? 0) - (a.targetWeight ?? 0)).map(c => {
                    const contracts = capRow?.contracts?.[c.id] ?? c.contracts;
                    return (
                      <tr key={c.id} className="border-b border-[#080808] hover:bg-[#050505]">
                        <td className="px-2 py-1.5 text-[#777]">{c.label ?? c.id}</td>
                        <td className="px-2 py-1.5 text-[#d4a843] text-[8px]">{c.instrument ?? c.id.slice(0,4).toUpperCase()}</td>
                        <td className="px-2 py-1.5 text-right text-[#555]">{fmtPct(c.targetWeight, 1)}</td>
                        <td className="px-2 py-1.5 text-right text-[#d4a843]">{fmtPct(c.realizedWeight, 1)}</td>
                        <td className="px-2 py-1.5 text-right text-[#888]">{contracts}</td>
                        <td className="px-2 py-1.5 text-right text-[#444]">{fmtEUR((c.marginPerContract ?? 0) * (contracts ?? 1))}</td>
                        <td className="px-2 py-1.5 text-right text-[#333]">
                          {c.targetWeight != null && c.realizedWeight != null ? fmtPct(Math.abs(c.targetWeight - c.realizedWeight), 1) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Costs ────────────────────────────────────────────────────────── */}
        {activeTab === 'costs' && (
          <div className="space-y-3">
            <div className="border border-[#0d0d0d] rounded bg-[#030303]">
              <div className="px-3 py-2 border-b border-[#0d0d0d] text-[8px] text-[#222] uppercase tracking-widest">Portfolio Cost Summary · {fmtCap(selectedCap)}</div>
              <div className="flex flex-wrap">
                <KpiCell label="Annual Cost" value={fmtEUR(kpis?.annualCostEUR)} />
                <KpiCell label="Cost/NAV" value={fmtPct(kpis?.costPerNAV, 2)} />
                <KpiCell label="Net CAGR" value={fmtPct(kpis?.CAGR)} />
              </div>
            </div>
            <div className="overflow-x-auto border border-[#0d0d0d] rounded bg-[#030303]">
              <table className="w-full text-[10px] min-w-[600px]">
                <thead>
                  <tr className="border-b border-[#0d0d0d] text-[#222]">
                    {['Strategy', 'Instrument', 'Trades/yr', '$/RT', 'Contracts', 'Cost/yr €', 'Net €', 'Cost%'].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeComps.map(c => {
                    const contracts = capRow?.contracts?.[c.id] ?? c.contracts ?? 1;
                    const annCost = (c.annualCostEUR ?? (c.costPerRT ?? 0) * (c.tradesPerYear ?? 0) * 0.81677) * contracts;
                    const annNet = c.netEUR / 18 * contracts;
                    const costPct = annNet > 0 ? annCost / annNet * 100 : 999;
                    return (
                      <tr key={c.id} className="border-b border-[#080808] hover:bg-[#050505]">
                        <td className="px-2 py-1.5 text-[#666]">{c.label ?? c.id}</td>
                        <td className="px-2 py-1.5 text-[#d4a843] text-[8px]">{c.instrument ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#444]">{c.tradesPerYear?.toFixed(1) ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#444]">{c.costPerRT != null ? `$${c.costPerRT.toFixed(2)}` : '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#888]">{contracts}</td>
                        <td className="px-2 py-1.5 text-right text-[#d4a843]">{fmtEUR(annCost)}</td>
                        <td className="px-2 py-1.5 text-right text-[#666]">{fmtEUR(annNet)}</td>
                        <td className={`px-2 py-1.5 text-right text-[8px] ${costPct > 80 ? 'text-[#5a3d3d]' : 'text-[#333]'}`}>
                          {costPct < 999 ? `${costPct.toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Attribution ─────────────────────────────────────────────────── */}
        {activeTab === 'attribution' && summary.performanceAttribution && (
          <div className="space-y-3">
            <SectionLabel text="Performance Attribution" />
            <div className="border border-[#0d0d0d] rounded bg-[#030303] p-4 space-y-3">
              {([
                { l: 'Base Strategy Alpha', k: 'baseAlpha', note: 'All strategies at 1 contract, no filter improvements' },
                { l: 'Quality Filter Gain', k: 'qualityImprovement', note: 'Regime / filter improvements on EURUSD, GLD, DAX' },
                { l: 'Contract Sizing Contribution', k: 'contractSizing', note: 'Additional contracts × base P&L' },
                { l: 'IBKR Costs (total)', k: 'ibkrCosts', note: 'Real round-trip costs at final contract counts', neg: true },
                { l: 'Final Net', k: 'finalNet', note: '= Base + Quality + Sizing − Costs', gold: true },
              ] as Array<{ l: string; k: keyof PerfAttribution; note: string; neg?: boolean; gold?: boolean }>).map(row => {
                const val = summary.performanceAttribution![row.k];
                return (
                  <div key={row.k} className={`flex items-center justify-between py-1.5 border-b border-[#080808] last:border-0 ${row.gold ? 'border-[#d4a843]/10' : ''}`}>
                    <div>
                      <div className={`text-[10px] ${row.gold ? 'text-[#d4a843]' : 'text-[#555]'}`}>{row.l}</div>
                      <div className="text-[8px] text-[#1e1e1e]">{row.note}</div>
                    </div>
                    <div className={`text-sm font-mono font-semibold ${row.gold ? 'text-[#d4a843]' : row.neg ? 'text-[#5a3d3d]' : 'text-[#888]'}`}>
                      {val != null ? fmtEUR(val) : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 17 Components ───────────────────────────────────────────────── */}
        {activeTab === 'components' && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap items-center">
              {[
                { id: 'ALL', label: `All ${summary.canonicalTotal ?? 17}` },
                { id: 'ACTIVE', label: `Tradable (${summary.tradableComponents ?? 15})` },
                { id: 'LOW', label: 'Low Weight' },
                { id: 'BLOCKED', label: `Blocked (${summary.blockedComponents ?? 2})` },
              ].map(f => (
                <button key={f.id} onClick={() => setCompFilter(f.id)}
                  className={`text-[9px] px-2 py-0.5 rounded border ${compFilter === f.id ? 'border-[#d4a843] text-[#d4a843]' : 'border-[#111] text-[#333] hover:border-[#222]'}`}>
                  {f.label}
                </button>
              ))}
              <span className="text-[8px] text-[#1a1a1a] ml-auto">{filteredComps.length}/{summary.canonicalTotal ?? 17}</span>
            </div>
            <div className="overflow-x-auto border border-[#0d0d0d] rounded bg-[#030303]">
              <table className="w-full text-[10px] min-w-[860px]">
                <thead>
                  <tr className="border-b border-[#0d0d0d] text-[#222]">
                    {['Component', 'Instrument', 'Net€', 'IS€', 'OOS€', 'OOS19€', 'PF', 'PosYr', 'Tr/yr', 'Margin', 'W%', 'Robust', 'Status'].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-normal text-[8px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredComps.map(c => (
                    <tr key={c.id} className="border-b border-[#070707] hover:bg-[#040404]">
                      <td className="px-2 py-1.5 text-[#777] max-w-[120px] truncate">{c.label ?? c.id}</td>
                      <td className="px-2 py-1.5 text-[#d4a843] text-[8px]">{c.instrument ?? '—'}</td>
                      <td className={`px-2 py-1.5 text-right font-mono text-[9px] ${(c.netEUR ?? 0) >= 0 ? 'text-[#666]' : 'text-[#5a3d3d]'}`}>{fmtEUR(c.netEUR)}</td>
                      <td className="px-2 py-1.5 text-right text-[#444] text-[9px]">{fmtEUR(c.isNet)}</td>
                      <td className="px-2 py-1.5 text-right text-[#555] text-[9px]">{fmtEUR(c.oosNet)}</td>
                      <td className="px-2 py-1.5 text-right text-[9px]">{c.oos2019Net != null ? fmtEUR(c.oos2019Net) : <span className="text-[#1a1a1a]">—</span>}</td>
                      <td className="px-2 py-1.5 text-right text-[#555]">{c.PF?.toFixed(2) ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right text-[#333]">{c.posYr}/{c.totYr}</td>
                      <td className="px-2 py-1.5 text-right text-[#333]">{c.tradesPerYear?.toFixed(1) ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right text-[#333]">{fmtEUR(c.marginPerContract)}</td>
                      <td className="px-2 py-1.5 text-right text-[#d4a843] text-[9px]">{fmtPct(c.targetWeight, 1)}</td>
                      <td className="px-2 py-1.5">
                        <span className={`text-[8px] ${c.robustness === 'HIGH' ? 'text-[#22c55e]' : c.robustness === 'MEDIUM' ? 'text-[#f59e0b]' : 'text-[#555]'}`}>
                          {c.robustness ?? '—'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5"><StatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Capital Table ────────────────────────────────────────────────── */}
        {activeTab === 'capital' && (
          <div className="space-y-3">
            <div className="overflow-x-auto border border-[#0d0d0d] rounded bg-[#030303]">
              <table className="w-full text-[10px] min-w-[800px]">
                <thead>
                  <tr className="border-b border-[#0d0d0d] text-[#222]">
                    {['Capital', 'Assessment', 'Margin%', 'CAGR', 'IS', 'OOS', 'OOS19', 'Sharpe', 'Calmar', 'MaxDD', 'Feasible'].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-normal text-[8px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.capitalComparison.map(r => {
                    const isRec = r.capital === recCap;
                    const isFail = !r.feasibility && r.assessment === 'MARGIN_RISK';
                    return (
                      <tr key={r.capital}
                        className={`border-b border-[#080808] ${isRec ? 'bg-[#090700]' : isFail ? 'opacity-30' : 'hover:bg-[#040404]'}`}>
                        <td className={`px-2 py-1.5 font-mono font-semibold ${isRec ? 'text-[#d4a843]' : 'text-[#555]'}`}>
                          {fmtCap(r.capital)}{isRec ? ' ★' : ''}
                        </td>
                        <td className="px-2 py-1.5"><AssessBadge assessment={r.assessment} /></td>
                        <td className="px-2 py-1.5 text-right text-[#444]">{fmtPct(r.marginPct)}</td>
                        <td className="px-2 py-1.5 text-right text-[#c0c0c0]">{r.CAGR != null ? fmtPct(r.CAGR) : '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#555]">{r.isCAGR != null ? fmtPct(r.isCAGR) : '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#777]">{r.oosCAGR != null ? fmtPct(r.oosCAGR) : '—'}</td>
                        <td className={`px-2 py-1.5 text-right ${(r.oos2019CAGR ?? 0) >= 15 ? 'text-[#d4a843]' : 'text-[#555]'}`}>
                          {r.oos2019CAGR != null ? fmtPct(r.oos2019CAGR) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#555]">{r.Sharpe != null ? fmtNum(r.Sharpe) : '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#444]">{r.Calmar != null ? fmtNum(r.Calmar) : '—'}</td>
                        <td className="px-2 py-1.5 text-right text-[#444]">{r.MaxDDPct != null ? fmtPct(r.MaxDDPct) : '—'}</td>
                        <td className={`px-2 py-1.5 text-[9px] ${r.feasibility ? 'text-[#1a3a1a]' : 'text-[#3a1a1a]'}`}>
                          {r.feasibility ? 'YES' : 'NO'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[8px] text-[#111]">★ Recommended · OOS19 highlighted if ≥15% · strikethrough = infeasible</div>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="border-t border-[#080808] pt-4 text-[8px] text-[#111] space-y-0.5">
          <div>WHITE SWAN FINAL {summary.version ?? 'v3'} · Historical Backtest · Real Futures Data · IBKR Real Costs · No Simulation</div>
          <div>Serkan: {summary.serkan?.path ?? 'workspace/output/white-swan/serkan/v3/'} · {summary.serkan?.rows ?? '—'} rows · {summary.generatedAt}</div>
          <div>IS 2008–2016 · OOS 2017–2026 · OOS19 2019–2026 · NOT financial advice</div>
        </div>
      </div>
    </div>
  );
}
