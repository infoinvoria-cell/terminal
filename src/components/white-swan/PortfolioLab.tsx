'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  type ScatterShapeProps,
} from 'recharts';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavPoint {
  date: string;
  nav: number;
}

interface StrategySlot {
  contracts: number;
  filter: string;
  status: string;
}

type LiveValidStatus = 'LIVE_VALID' | 'INVALID_RESEARCH_REFERENCE' | 'EX_ANTE_APPROX';

interface PortfolioVariant {
  variantId: string;
  family: string;
  familyName?: string;
  name?: string;
  description?: string;
  capitalLevel?: number;
  capital?: number;
  phase?: string;
  constraint?: string;
  liveValidStatus?: LiveValidStatus;
  lookaheadNote?: string;
  dimA?: string;
  dimB?: string;
  dimC?: string;
  dimD?: string;
  dimALabel?: string;
  dimBLabel?: string;
  dimCLabel?: string;
  dimDLabel?: string;
  filterDescription?: string;
  kpis: {
    cagr: number;
    oosCAGR: number;
    sharpe: number;
    calmar?: number;
    sortino?: number;
    maxDDFromStart: number;
    maxDDFromPeak?: number;
    tradesPerWeek: number;
    totalTrades: number;
    annualCostPct: number;
    costRatio: number;
    totalNet: number;
    totalGross: number;
    totalCosts: number;
    annualCosts?: number;
    isCAGR?: number;
    oosISDegradation?: number;
    oosNetPositive?: boolean;
    oosMaxDDPct?: number;
    expectancy?: number;
    profitFactor?: number;
    concentration?: { top1Pct: number; top3Pct: number; hhi: number };
  };
  // v1 shape
  wf?: {
    isCAGR: number;
    oosCAGR: number;
    oosISDegradation: number;
    rolling3yr_positive_folds: number;
    oosNetPositive: boolean;
  };
  // v2 shape
  walkForward?: {
    // v2
    rolling3yr_positive?: number;
    rolling3yr_folds?: number;
    foldResults3yr?: Array<{ fold: string; oosNet: number; isPositive: boolean }>;
    // v3
    totalFolds?: number;
    positiveFolds?: number;
    passRate?: number;
    foldResults?: Array<{ label: string; oosNet: number; isPositive: boolean }>;
  };
  monteCarlo?: {
    medianCAGR: number;
    p5CAGR: number;
    p95CAGR: number;
    medianMaxDD: number;
    p95MaxDD: number;
    probLoss: number;
  };
  robustnessScore: number;
  suitabilityScore: number;
  hardFilterFailed?: boolean;
  hardFilterReasons?: string[];
  finalist?: {
    isFinalist: boolean;
    categories: string[];
  };
  strategyDetail?: Record<string, StrategySlot>;
  navSeries?: NavPoint[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | undefined | null, dec = 2) =>
  n != null && isFinite(n) ? n.toFixed(dec) : '—';

const fmtPct = (n: number | undefined | null, dec = 2) =>
  n != null && isFinite(n) ? `${n.toFixed(dec)}%` : '—';

const fmtEUR = (n: number | undefined | null) =>
  n != null && isFinite(n)
    ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
    : '—';

function suitabilityColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function suitabilityBg(score: number): string {
  if (score >= 80) return '#064e3b';
  if (score >= 60) return '#713f12';
  if (score >= 40) return '#431407';
  return '#450a0a';
}

function maxDDColor(pct: number): string {
  if (pct > 20) return 'text-red-400';
  if (pct > 10) return 'text-orange-400';
  return 'text-yellow-400';
}

function oosHeatColor(cagr: number): string {
  // 0 → blue, 25 → green
  const t = Math.min(Math.max(cagr / 25, 0), 1);
  const r = Math.round(0 + t * 34);
  const g = Math.round(100 + t * 97);
  const b = Math.round(200 - t * 120);
  return `rgb(${r},${g},${b})`;
}

const YEARS = 16.97;

// Normalise v1/v2/v3 shape differences so the rest of the component is uniform
function normaliseVariant(v: PortfolioVariant): PortfolioVariant {
  const capital = v.capital ?? v.capitalLevel ?? 0;
  // v3 uses walkForward.positiveFolds / totalFolds
  const wfPositive =
    v.walkForward?.positiveFolds ?? v.walkForward?.rolling3yr_positive ?? v.wf?.rolling3yr_positive_folds ?? 0;
  const wfFolds = v.walkForward?.totalFolds ?? v.walkForward?.rolling3yr_folds ?? 5;
  const oosNet = v.kpis.oosCAGR !== undefined ? v.kpis.oosCAGR : (v.wf?.oosCAGR ?? 0);
  const isNet = v.kpis.isCAGR ?? v.wf?.isCAGR ?? 0;
  const degradation = v.kpis.oosISDegradation ?? v.wf?.oosISDegradation ?? (isNet !== 0 ? oosNet / isNet : 0);
  const oosPositive = v.kpis.oosNetPositive ?? v.wf?.oosNetPositive ?? false;
  return {
    ...v,
    capitalLevel: capital,
    capital,
    wf: {
      isCAGR: isNet,
      oosCAGR: oosNet,
      oosISDegradation: degradation,
      rolling3yr_positive_folds: wfPositive,
      oosNetPositive: oosPositive,
    },
    // expose total folds count for display
    walkForward: v.walkForward ? { ...v.walkForward, totalFolds: wfFolds, positiveFolds: wfPositive } : v.walkForward,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LabStatCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex-1 min-w-0 rounded-lg border border-[#2a2b30] bg-gradient-to-b from-[#1c1d20] to-[#141517] p-3 text-center">
      <div className="text-[10px] text-[#737373] mb-1 uppercase tracking-wide truncate">{label}</div>
      <div className={cn('text-base font-bold font-mono text-[#e2ca7a] leading-tight', valueClass)}>{value}</div>
      {sub && <div className="text-[10px] text-[#737373] mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

// ─── Scatter dot ──────────────────────────────────────────────────────────────

interface ScatterPayload {
  variantId: string;
  x: number;
  y: number;
  z: number;
  suit: number;
  selected: boolean;
}

function ScatterDot(props: ScatterShapeProps & { payload?: ScatterPayload }) {
  const { cx = 0, cy = 0, payload } = props;
  if (!payload) return null;
  const r = Math.max(4, Math.min(14, payload.z * 6));
  const fill = payload.selected ? '#e2ca7a' : `hsl(${payload.suit * 1.2}, 60%, 45%)`;
  const stroke = payload.selected ? '#e2ca7a' : 'transparent';
  return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={2} opacity={0.85} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PortfolioLab() {
  const [phase, setPhase] = useState<'v1' | 'v2' | 'v3'>('v3');
  const [capitalLevel, setCapitalLevel] = useState<number>(12500);
  const [variants, setVariants] = useState<PortfolioVariant[]>([]);
  const [finalists, setFinalists] = useState<PortfolioVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>('suitabilityScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [familyFilter, setFamilyFilter] = useState<string>('ALL');
  const [allVariants, setAllVariants] = useState<PortfolioVariant[]>([]);
  const [showStrategyDetail, setShowStrategyDetail] = useState(false);
  const [comparison, setComparison] = useState<Record<string, PortfolioVariant[]>>({});
  const [showComparison, setShowComparison] = useState(false);
  const [lookaheadRef, setLookaheadRef] = useState<PortfolioVariant[]>([]);
  const [showLookaheadRef, setShowLookaheadRef] = useState(false);

  // Load finalists on phase change
  useEffect(() => {
    fetch(`/api/white-swan-lab?type=finalists&phase=${phase}`)
      .then((r) => r.json())
      .then((d) => setFinalists((d.finalists ?? []).map(normaliseVariant)))
      .catch(() => {});
  }, [phase]);

  // Load all variants for heatmap on phase change
  useEffect(() => {
    fetch(`/api/white-swan-lab?phase=${phase}`)
      .then((r) => r.json())
      .then((d) => setAllVariants((d.variants ?? []).map(normaliseVariant)))
      .catch(() => {});
  }, [phase]);

  // Load lookahead reference (v3 only)
  useEffect(() => {
    if (phase !== 'v3') { setLookaheadRef([]); return; }
    fetch('/api/white-swan-lab?type=lookahead-reference&phase=v3')
      .then((r) => r.json())
      .then((d) => setLookaheadRef((d.variants ?? []).map(normaliseVariant)))
      .catch(() => {});
  }, [phase]);

  // Load cross-capital comparison (top-5 per capital)
  useEffect(() => {
    fetch(`/api/white-swan-lab?type=comparison&phase=${phase}`)
      .then((r) => r.json())
      .then((d) => {
        const normalised: Record<string, PortfolioVariant[]> = {};
        for (const [cap, vs] of Object.entries(d.comparison ?? {})) {
          normalised[cap] = (vs as PortfolioVariant[]).map(normaliseVariant);
        }
        setComparison(normalised);
      })
      .catch(() => {});
  }, [phase]);

  // Load per-capital variants
  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedId(null);
    fetch(`/api/white-swan-lab?capital=${capitalLevel}&phase=${phase}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setVariants((d.variants ?? []).map(normaliseVariant));
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [capitalLevel, phase]);

  // All families in current capital
  const families = useMemo(() => {
    const fs = Array.from(new Set(variants.map((v) => v.familyName ?? v.family)));
    return fs.sort();
  }, [variants]);

  // Filtered + sorted variants
  const tableVariants = useMemo(() => {
    let vs = familyFilter === 'ALL' ? variants : variants.filter((v) => (v.familyName ?? v.family) === familyFilter);
    vs = [...vs].sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === 'suitabilityScore') { av = a.suitabilityScore; bv = b.suitabilityScore; }
      else if (sortKey === 'robustnessScore') { av = a.robustnessScore; bv = b.robustnessScore; }
      else if (sortKey === 'cagr') { av = a.kpis.cagr; bv = b.kpis.cagr; }
      else if (sortKey === 'oosCAGR') { av = a.kpis.oosCAGR; bv = b.kpis.oosCAGR; }
      else if (sortKey === 'sharpe') { av = a.kpis.sharpe; bv = b.kpis.sharpe; }
      else if (sortKey === 'maxDD') { av = a.kpis.maxDDFromStart; bv = b.kpis.maxDDFromStart; }
      else if (sortKey === 'costPct') { av = a.kpis.annualCostPct; bv = b.kpis.annualCostPct; }
      else if (sortKey === 'tradesPerWeek') { av = a.kpis.tradesPerWeek; bv = b.kpis.tradesPerWeek; }
      else { av = a.suitabilityScore; bv = b.suitabilityScore; }
      return sortAsc ? av - bv : bv - av;
    });
    return vs;
  }, [variants, familyFilter, sortKey, sortAsc]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  }

  const SortHeader = ({ k, label }: { k: string; label: string }) => (
    <th
      className="px-2 py-2 text-left text-[10px] uppercase tracking-wide text-[#737373] cursor-pointer hover:text-[#e2ca7a] whitespace-nowrap select-none"
      onClick={() => toggleSort(k)}
    >
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  // Selected variant (prefer finalist with navSeries)
  const selected = useMemo(() => {
    if (!selectedId) return tableVariants[0] ?? null;
    return tableVariants.find((v) => v.variantId === selectedId) ?? tableVariants[0] ?? null;
  }, [selectedId, tableVariants]);

  const selectedFinalist = useMemo(() => {
    if (!selected) return null;
    if ((phase === 'v2' || phase === 'v3') && selected.navSeries) return selected;
    return finalists.find((f) => f.variantId === selected.variantId) ?? null;
  }, [selected, finalists, phase]);

  const navSeries = selectedFinalist?.navSeries ?? null;

  // Compute drawdown from navSeries
  const drawdownData = useMemo(() => {
    if (!navSeries || navSeries.length === 0) return [];
    let peak = navSeries[0].nav;
    return navSeries
      .filter((_, i) => i % Math.ceil(navSeries.length / 300) === 0)
      .map((p) => {
        if (p.nav > peak) peak = p.nav;
        const dd = peak > 0 ? ((peak - p.nav) / peak) * 100 : 0;
        return { date: p.date.slice(0, 10), dd: -dd };
      });
  }, [navSeries]);

  const navChartData = useMemo(() => {
    if (!navSeries || navSeries.length === 0) return [];
    return navSeries
      .filter((_, i) => i % Math.ceil(navSeries.length / 300) === 0)
      .map((p) => ({ date: p.date.slice(0, 10), nav: p.nav }));
  }, [navSeries]);

  // IS vs OOS bar data for non-finalist
  const isOosBar = selected
    ? [
        { name: 'IS CAGR', value: Number(fmt(selected.wf?.isCAGR)) },
        { name: 'OOS CAGR', value: Number(fmt(selected.wf?.oosCAGR)) },
      ]
    : [];

  // Scatter data: top 20 at this capital
  const scatterData: ScatterPayload[] = useMemo(
    () =>
      variants.slice(0, 20).map((v) => ({
        variantId: v.variantId,
        x: v.kpis.maxDDFromStart,
        y: v.kpis.oosCAGR,
        z: v.kpis.sharpe,
        suit: v.suitabilityScore,
        selected: v.variantId === (selected?.variantId ?? ''),
      })),
    [variants, selected]
  );

  // Heatmap: capital × family
  const CAPITAL_LEVELS = [10000, 12500, 15000, 20000];
  const heatFamilies = useMemo(() => {
    const fs = Array.from(new Set(allVariants.map((v) => v.familyName ?? v.family)));
    return fs.sort();
  }, [allVariants]);

  function getHeatCell(cap: number, fam: string): PortfolioVariant | undefined {
    return allVariants.find((v) => v.capitalLevel === cap && (v.familyName === fam || v.family === fam));
  }

  // Serkan cost panel
  const costPanel = useMemo(() => {
    if (!selected) return null;
    const cap = selected.capital ?? selected.capitalLevel ?? capitalLevel;
    const annualTrades = selected.kpis.totalTrades / YEARS;
    const annualExec = annualTrades * 2;
    const costPerExec = 0.85;
    const annualCosts = annualExec * costPerExec;
    const costNavPct = cap > 0 ? (annualCosts / cap) * 100 : 0;
    const grossAnnual = selected.kpis.totalGross / YEARS;
    const netAnnual = selected.kpis.totalNet / YEARS;
    return { annualTrades, annualExec, costPerExec, annualCosts, costNavPct, grossAnnual, netAnnual };
  }, [selected, capitalLevel]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#e2ca7a] animate-pulse">
        Loading Portfolio Lab…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="text-white space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold font-montserrat text-[#e2ca7a]">Portfolio Lab</h2>
          <p className="text-[#737373] text-xs mt-0.5">
            {phase === 'v3'
              ? '128 Live-Valid Variants — No Lookahead · Ex-Ante Rules Only · 17 Components'
              : phase === 'v2'
              ? '17/17 Quality Variants — EURUSD Overnight · DAX Hold ≥1d — RESEARCH_CANDIDATE'
              : '80 variants × 4 capital levels — RESEARCH_CANDIDATE'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Phase toggle */}
          <div className="flex rounded overflow-hidden border border-[#2a2b30] text-xs">
            {([
              { id: 'v3', label: 'Live Valid' },
              { id: 'v2', label: '17/17 Research' },
              { id: 'v1', label: 'Phase 1' },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setPhase(id)}
                className={cn(
                  'px-3 py-1 transition-colors',
                  phase === id
                    ? 'bg-[#bf9d4a] text-black font-semibold'
                    : 'bg-[#141517] text-[#737373] hover:text-[#e2ca7a]'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-[#737373]">Capital:</span>
          <select
            value={capitalLevel}
            onChange={(e) => setCapitalLevel(Number(e.target.value))}
            className="bg-[#1c1d20] border border-[#2a2b30] text-[#e2ca7a] text-sm rounded px-2 py-1 focus:outline-none focus:border-[#e2ca7a]"
          >
            <option value={10000}>€10,000</option>
            <option value={12500}>€12,500</option>
            <option value={15000}>€15,000</option>
            <option value={20000}>€20,000</option>
          </select>
        </div>
      </div>

      {/* HERO KPI — top variant at selected capital */}
      {(phase === 'v2' || phase === 'v3') && tableVariants[0] && !loading && (() => {
        const hero = tableVariants[0];
        const cap = hero.capital ?? hero.capitalLevel ?? capitalLevel;
        const expectancy = hero.kpis.expectancy ?? (hero.kpis.totalTrades > 0 ? hero.kpis.totalNet / hero.kpis.totalTrades : 0);
        const annCostEur = hero.kpis.annualCosts ?? (hero.kpis.totalCosts / 16.97);
        const wfTotal = hero.walkForward?.totalFolds ?? 5;
        const wfPositive = hero.walkForward?.positiveFolds ?? hero.wf?.rolling3yr_positive_folds ?? 0;
        const isLiveValid = hero.liveValidStatus === 'LIVE_VALID';
        const isLookahead = hero.liveValidStatus === 'INVALID_RESEARCH_REFERENCE';
        return (
          <div className={cn(
            'rounded-lg border p-4 bg-gradient-to-b',
            isLiveValid ? 'border-emerald-500/30 from-[#0c1810] to-[#080e0a]' :
            isLookahead ? 'border-orange-500/30 from-[#1a1008] to-[#0e0905]' :
            'border-[#e2ca7a]/30 from-[#1a1810] to-[#0e0d0a]'
          )}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <span className={cn('text-xs font-semibold uppercase tracking-widest', isLiveValid ? 'text-emerald-400' : 'text-[#e2ca7a]')}>
                  {isLiveValid ? 'Best Live-Valid Candidate' : 'Best Candidate'} — {hero.variantId}
                </span>
                <span className="ml-2 text-[10px] text-[#737373]">
                  {hero.filterDescription ?? `${hero.family} · €${(cap/1000).toFixed(1)}k`} · {wfPositive}/{wfTotal} WF folds
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isLiveValid && (
                  <span className="text-[10px] px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                    ✓ LIVE VALID
                  </span>
                )}
                {isLookahead && (
                  <span className="text-[10px] px-2 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-400">
                    ⚠ INVALID — LOOKAHEAD
                  </span>
                )}
                {!isLiveValid && !isLookahead && (
                  <span className="text-[10px] px-2 py-0.5 rounded border border-[#e2ca7a]/20 text-[#e2ca7a]/60">RESEARCH_CANDIDATE</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
              {[
                { l: 'CAGR', v: `${fmt(hero.kpis.cagr)}%`, s: `IS ${fmt(hero.kpis.isCAGR ?? hero.wf?.isCAGR)}%`, c: isLiveValid ? 'text-emerald-300' : 'text-[#e2ca7a]' },
                { l: 'OOS CAGR', v: `${fmt(hero.kpis.oosCAGR)}%`, s: '2019–2026', c: 'text-emerald-400' },
                { l: 'Sharpe', v: fmt(hero.kpis.sharpe), s: `Sort: ${fmt(hero.kpis.sortino)}`, c: hero.kpis.sharpe >= 1.0 ? 'text-emerald-400' : 'text-yellow-400' },
                { l: 'Calmar', v: fmt(hero.kpis.calmar ?? 0), s: undefined, c: (hero.kpis.calmar ?? 0) >= 1.0 ? 'text-emerald-400' : 'text-yellow-400' },
                { l: 'MaxDD', v: `${fmt(hero.kpis.maxDDFromPeak ?? hero.kpis.maxDDFromStart)}%`, s: `From start: ${fmt(hero.kpis.maxDDFromStart)}%`, c: maxDDColor(hero.kpis.maxDDFromStart) },
                { l: 'Expectancy', v: `€${fmt(expectancy, 0)}`, s: 'net/trade', c: expectancy > 0 ? 'text-emerald-400' : 'text-red-400' },
                { l: 'Cost/yr', v: `€${fmt(annCostEur, 0)}`, s: `${fmt(hero.kpis.annualCostPct)}% NAV`, c: 'text-[#737373]' },
                { l: 'Trades/wk', v: fmt(hero.kpis.tradesPerWeek, 1), s: `${hero.kpis.totalTrades} total`, c: 'text-[#737373]' },
                { l: 'WF', v: `${wfPositive}/${wfTotal}`, s: `Suit: ${hero.suitabilityScore.toFixed(0)}`, c: wfPositive === wfTotal ? 'text-emerald-400' : 'text-yellow-400' },
              ].map(({ l, v, s, c }) => (
                <div key={l} className="rounded border border-[#2a2b30]/60 bg-[#0c0d10] p-2 text-center min-w-0">
                  <div className="text-[9px] text-[#737373] uppercase tracking-wide mb-1 truncate">{l}</div>
                  <div className={cn('text-sm font-bold font-mono leading-tight truncate', c)}>{v}</div>
                  {s && <div className="text-[9px] text-[#737373] mt-0.5 truncate">{s}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* LOOKAHEAD REFERENCE PANEL (v3 only) */}
      {phase === 'v3' && lookaheadRef.length > 0 && (() => {
        const liveRef = tableVariants[0];
        const laRef = lookaheadRef.find((r) => r.capital === capitalLevel);
        if (!liveRef || !laRef) return null;
        const gap = (laRef.kpis.oosCAGR - liveRef.kpis.oosCAGR);
        const retained = laRef.kpis.oosCAGR > 0 ? ((liveRef.kpis.oosCAGR / laRef.kpis.oosCAGR) * 100) : 0;
        return (
          <div className="rounded-lg border border-orange-500/20 bg-[#120e08] p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-orange-400">
                Lookahead Reference vs Best Live-Valid — €{(capitalLevel/1000).toFixed(1)}k
              </span>
              <button
                onClick={() => setShowLookaheadRef((p) => !p)}
                className="text-[10px] text-[#737373] hover:text-orange-400"
              >
                {showLookaheadRef ? '▲ Collapse' : '▼ Expand'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {[
                { l: 'OOS CAGR (Lookahead)', v: `${fmt(laRef.kpis.oosCAGR)}%`, note: 'QA_ALL_HOLD1 — INVALID', c: 'text-orange-400' },
                { l: 'OOS CAGR (Live-Valid)', v: `${fmt(liveRef.kpis.oosCAGR)}%`, note: liveRef.variantId, c: 'text-emerald-400' },
                { l: 'Gap', v: `-${fmt(gap)}pp`, note: 'OOS CAGR cost of removing lookahead', c: 'text-red-400' },
                { l: 'Edge Retained', v: `${retained.toFixed(1)}%`, note: 'of lookahead OOS captured live', c: retained >= 70 ? 'text-emerald-400' : 'text-yellow-400' },
              ].map(({ l, v, note, c }) => (
                <div key={l} className="rounded border border-orange-500/20 bg-[#0c0905] p-2">
                  <div className="text-[9px] text-[#737373] uppercase tracking-wide mb-1">{l}</div>
                  <div className={cn('text-sm font-bold font-mono', c)}>{v}</div>
                  <div className="text-[9px] text-[#737373] mt-0.5 truncate">{note}</div>
                </div>
              ))}
            </div>
            {showLookaheadRef && (
              <div className="overflow-x-auto mt-2">
                <table className="text-[10px] w-full min-w-[700px]">
                  <thead>
                    <tr className="text-[#737373] border-b border-[#2a2b30]/30">
                      <th className="px-2 py-1 text-left">Variant</th>
                      <th className="px-2 py-1 text-left">Status</th>
                      <th className="px-2 py-1 text-right">CAGR</th>
                      <th className="px-2 py-1 text-right">OOS CAGR</th>
                      <th className="px-2 py-1 text-right">Sharpe</th>
                      <th className="px-2 py-1 text-right">Calmar</th>
                      <th className="px-2 py-1 text-right">MaxDD</th>
                      <th className="px-2 py-1 text-right">Exp/trade</th>
                      <th className="px-2 py-1 text-right">Trades/wk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[laRef, liveRef].map((v, i) => {
                      const exp = v.kpis.expectancy ?? (v.kpis.totalTrades > 0 ? v.kpis.totalNet / v.kpis.totalTrades : 0);
                      const isLookahead = v.liveValidStatus === 'INVALID_RESEARCH_REFERENCE';
                      return (
                        <tr key={v.variantId} className="border-b border-[#2a2b30]/20">
                          <td className="px-2 py-1 font-mono text-[#e2ca7a]">{i === 0 ? '⚠ ' : '✓ '}{v.variantId}</td>
                          <td className="px-2 py-1">
                            <span className={cn(
                              'text-[9px] px-1.5 py-0.5 rounded',
                              isLookahead ? 'bg-orange-900/40 text-orange-400' : 'bg-emerald-900/40 text-emerald-400'
                            )}>
                              {isLookahead ? 'INVALID' : 'LIVE VALID'}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-right font-mono">{fmt(v.kpis.cagr)}%</td>
                          <td className={cn('px-2 py-1 text-right font-mono', isLookahead ? 'text-orange-400' : 'text-emerald-400')}>
                            {fmt(v.kpis.oosCAGR)}%
                          </td>
                          <td className="px-2 py-1 text-right font-mono">{fmt(v.kpis.sharpe)}</td>
                          <td className="px-2 py-1 text-right font-mono">{fmt(v.kpis.calmar ?? 0)}</td>
                          <td className={cn('px-2 py-1 text-right font-mono', maxDDColor(v.kpis.maxDDFromStart))}>
                            {fmt(v.kpis.maxDDFromPeak ?? v.kpis.maxDDFromStart)}%
                          </td>
                          <td className={cn('px-2 py-1 text-right font-mono', exp > 0 ? 'text-emerald-400' : 'text-red-400')}>
                            €{fmt(exp, 0)}
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-[#737373]">{fmt(v.kpis.tradesPerWeek, 1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[9px] text-orange-400/60 mt-2 px-1">
                  ⚠ QA_ALL_HOLD1 uses holdingDays≥1 post-exit filter — stop-based exits only — INVALID FOR LIVE TRADING.
                  Shown as upper-bound reference only.
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* CAPITAL COMPARISON TABLE */}
      {(phase === 'v2' || phase === 'v3') && Object.keys(comparison).length > 0 && (
        <div className="rounded-lg border border-[#2a2b30] bg-[#141517] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2b30]">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#e2ca7a]">Capital Comparison — Top-5 per Level</span>
            <button
              onClick={() => setShowComparison((p) => !p)}
              className="text-[10px] text-[#737373] hover:text-[#e2ca7a]"
            >
              {showComparison ? '▲ Collapse' : '▼ Expand'}
            </button>
          </div>
          {showComparison && (
            <div className="overflow-x-auto">
              {[10000, 12500, 15000, 20000].map((cap) => {
                const top5 = comparison[String(cap)] ?? [];
                return (
                  <div key={cap} className="border-b border-[#2a2b30]/40 last:border-0">
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-[#e2ca7a] bg-[#1c1d20]">
                      €{cap >= 1000 ? `${cap / 1000}k` : cap}
                    </div>
                    <table className="w-full text-[10px] min-w-[900px]">
                      <thead>
                        <tr className="text-[#737373] border-b border-[#2a2b30]/30">
                          <th className="px-2 py-1 text-left">Variant</th>
                          <th className="px-2 py-1 text-right">CAGR</th>
                          <th className="px-2 py-1 text-right">OOS CAGR</th>
                          <th className="px-2 py-1 text-right">Sharpe</th>
                          <th className="px-2 py-1 text-right">Calmar</th>
                          <th className="px-2 py-1 text-right">MaxDD</th>
                          <th className="px-2 py-1 text-right">Exp/trade</th>
                          <th className="px-2 py-1 text-right">Tr/wk</th>
                          <th className="px-2 py-1 text-right">Cost%</th>
                          <th className="px-2 py-1 text-right">Top-1%</th>
                          <th className="px-2 py-1 text-right">Robust</th>
                          <th className="px-2 py-1 text-right">Suit.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top5.map((v, i) => {
                          const exp = v.kpis.totalTrades > 0 ? v.kpis.totalNet / v.kpis.totalTrades : 0;
                          const isSelected = v.variantId === (selected?.variantId ?? '');
                          const isTopPick = i === 0;
                          return (
                            <tr
                              key={v.variantId}
                              onClick={() => { setCapitalLevel(cap); setSelectedId(v.variantId); }}
                              className={cn(
                                'border-b border-[#2a2b30]/20 cursor-pointer transition-colors hover:bg-[#1c1d20]',
                                isSelected && 'bg-[#e2ca7a]/10',
                                isTopPick && !isSelected && 'border-l-2 border-l-[#e2ca7a]/40'
                              )}
                            >
                              <td className="px-2 py-1 font-mono text-[#e2ca7a]">
                                {i === 0 ? '★ ' : ''}{v.variantId.replace(`_${cap}`, '')}
                              </td>
                              <td className="px-2 py-1 text-right font-mono">{fmt(v.kpis.cagr)}%</td>
                              <td className="px-2 py-1 text-right font-mono text-emerald-400">{fmt(v.kpis.oosCAGR)}%</td>
                              <td className="px-2 py-1 text-right font-mono">{fmt(v.kpis.sharpe)}</td>
                              <td className="px-2 py-1 text-right font-mono">{fmt(v.kpis.calmar ?? 0)}</td>
                              <td className={cn('px-2 py-1 text-right font-mono', maxDDColor(v.kpis.maxDDFromStart))}>
                                {fmt(v.kpis.maxDDFromStart)}%
                              </td>
                              <td className={cn('px-2 py-1 text-right font-mono', exp > 0 ? 'text-emerald-400' : 'text-red-400')}>
                                €{fmt(exp, 0)}
                              </td>
                              <td className="px-2 py-1 text-right font-mono text-[#737373]">{fmt(v.kpis.tradesPerWeek, 1)}</td>
                              <td className="px-2 py-1 text-right font-mono text-[#737373]">{fmt(v.kpis.annualCostPct)}%</td>
                              <td className="px-2 py-1 text-right font-mono text-[#737373]">
                                {fmt(v.kpis.concentration?.top1Pct ?? 0)}%
                              </td>
                              <td className={cn('px-2 py-1 text-right font-mono', suitabilityColor(v.robustnessScore))}>
                                {v.robustnessScore}
                              </td>
                              <td className={cn('px-2 py-1 text-right font-mono font-semibold', suitabilityColor(v.suitabilityScore))}>
                                {v.suitabilityScore.toFixed(0)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VARIANT SELECTOR TABLE */}
      <div className="rounded-lg border border-[#2a2b30] bg-[#141517] overflow-hidden">
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[#2a2b30] flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#e2ca7a]">Variants</span>
          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            className="bg-[#1c1d20] border border-[#2a2b30] text-[#737373] text-xs rounded px-2 py-1 focus:outline-none"
          >
            <option value="ALL">All Families</option>
            {families.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <span className="text-xs text-[#737373]">{tableVariants.length} variants</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-[#2a2b30]">
                <SortHeader k="name" label="Variant" />
                <SortHeader k="cagr" label="CAGR%" />
                <SortHeader k="oosCAGR" label="OOS%" />
                <SortHeader k="sharpe" label="Sharpe" />
                <SortHeader k="maxDD" label="MaxDD%" />
                <SortHeader k="costPct" label="Cost%" />
                <SortHeader k="tradesPerWeek" label="Tr/wk" />
                <SortHeader k="robustnessScore" label="Robust" />
                <SortHeader k="suitabilityScore" label="Suit." />
                <th className="px-2 py-2 text-[10px] uppercase tracking-wide text-[#737373]">Tags</th>
              </tr>
            </thead>
            <tbody>
              {tableVariants.map((v) => {
                const isSelected = v.variantId === (selected?.variantId ?? '');
                const isFinalist = v.finalist?.isFinalist;
                const isFailed = v.hardFilterFailed;
                return (
                  <tr
                    key={v.variantId}
                    onClick={() => setSelectedId(v.variantId)}
                    className={cn(
                      'border-b border-[#2a2b30]/40 cursor-pointer transition-colors',
                      isSelected ? 'bg-[#e2ca7a]/10' : 'hover:bg-[#1c1d20]',
                      isFailed && 'opacity-40',
                      isFinalist && !isSelected && 'border-l-2 border-l-[#e2ca7a]/40'
                    )}
                  >
                    <td className="px-2 py-1.5">
                      <span className={cn('font-semibold', isFailed && 'line-through text-[#737373]')}>
                        {v.name}
                      </span>
                      <div className="text-[10px] text-[#737373]">{v.variantId}</div>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[#e2ca7a]">{fmt(v.kpis.cagr)}%</td>
                    <td className="px-2 py-1.5 font-mono text-emerald-400">{fmt(v.kpis.oosCAGR)}%</td>
                    <td className="px-2 py-1.5 font-mono">{fmt(v.kpis.sharpe)}</td>
                    <td className={cn('px-2 py-1.5 font-mono', maxDDColor(v.kpis.maxDDFromStart))}>
                      {fmt(v.kpis.maxDDFromStart)}%
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[#737373]">{fmt(v.kpis.annualCostPct)}%</td>
                    <td className="px-2 py-1.5 font-mono text-[#737373]">{fmt(v.kpis.tradesPerWeek, 1)}</td>
                    <td className="px-2 py-1.5 font-mono">
                      <span className={cn('font-semibold', suitabilityColor(v.robustnessScore))}>
                        {v.robustnessScore}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      <span className={cn('font-semibold', suitabilityColor(v.suitabilityScore))}>
                        {v.suitabilityScore}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {v.liveValidStatus === 'LIVE_VALID' && (
                          <span className="text-[9px] bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 rounded px-1 py-0.5">✓ LIVE</span>
                        )}
                        {v.liveValidStatus === 'INVALID_RESEARCH_REFERENCE' && (
                          <span className="text-[9px] bg-orange-900/30 text-orange-400 border border-orange-500/30 rounded px-1 py-0.5">⚠ INVALID</span>
                        )}
                        {isFinalist && (
                          <span className="text-[9px] bg-[#e2ca7a]/10 text-[#e2ca7a] border border-[#e2ca7a]/30 rounded px-1 py-0.5">
                            FINALIST
                          </span>
                        )}
                        {(v.finalist?.categories ?? []).map((c) => (
                          <span key={c} className="text-[9px] bg-[#1c1d20] text-[#737373] border border-[#2a2b30] rounded px-1 py-0.5 whitespace-nowrap">
                            {c.replace('BEST_', '')}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SELECTED VARIANT DETAIL */}
      {selected && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-[#e2ca7a] uppercase tracking-widest">
              {selected.name}
            </h3>
            {selected.finalist?.isFinalist && (
              <span className="text-xs bg-[#e2ca7a]/10 text-[#e2ca7a] border border-[#e2ca7a]/30 rounded px-2 py-0.5">
                Finalist
              </span>
            )}
            {selected.hardFilterFailed && (
              <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded px-2 py-0.5">
                Hard Filter Failed
              </span>
            )}
            <span className="text-[#737373] text-xs">{selected.filterDescription ?? selected.description}</span>
          </div>

          {/* KPI cards row 1 */}
          <div className="flex gap-3 flex-wrap">
            <LabStatCard label="CAGR (Full)" value={fmtPct(selected.kpis.cagr)} sub={`IS: ${fmt(selected.wf?.isCAGR)}%`} />
            <LabStatCard label="OOS CAGR" value={fmtPct(selected.kpis.oosCAGR)} valueClass="text-emerald-400" sub="2019-2026" />
            <LabStatCard label="Sharpe" value={fmt(selected.kpis.sharpe)} />
            <LabStatCard
              label="Max DD%"
              value={fmtPct(selected.kpis.maxDDFromStart)}
              valueClass={maxDDColor(selected.kpis.maxDDFromStart)}
            />
          </div>
          {/* KPI cards row 2 */}
          <div className="flex gap-3 flex-wrap">
            <LabStatCard label="Trades/wk" value={fmt(selected.kpis.tradesPerWeek, 1)} />
            <LabStatCard label="Cost%/yr" value={fmtPct(selected.kpis.annualCostPct)} />
            <LabStatCard label="Robust" value={`${selected.robustnessScore}/100`} valueClass={suitabilityColor(selected.robustnessScore)} />
            <LabStatCard label="Suitability" value={`${selected.suitabilityScore}/100`} valueClass={suitabilityColor(selected.suitabilityScore)} />
          </div>

          {/* WF Stats */}
          <div className="flex gap-3 flex-wrap text-xs text-[#737373]">
            <span>OOS/IS ratio: <span className="text-[#e2ca7a]">{fmt(selected.wf!.oosISDegradation, 3)}</span></span>
            <span>Rolling folds: <span className="text-[#e2ca7a]">{selected.wf!.rolling3yr_positive_folds}/{selected.walkForward?.totalFolds ?? 5}</span> positive</span>
            <span>OOS net: <span className={selected.wf!.oosNetPositive ? 'text-emerald-400' : 'text-red-400'}>{selected.wf!.oosNetPositive ? 'YES' : 'NO'}</span></span>
            {selected.kpis.concentration && (
              <>
                <span>Top-1: <span className={selected.kpis.concentration.top1Pct > 50 ? 'text-orange-400' : 'text-[#e2ca7a]'}>{fmt(selected.kpis.concentration.top1Pct)}%</span></span>
                <span>Top-3: <span className={selected.kpis.concentration.top3Pct > 80 ? 'text-orange-400' : 'text-[#e2ca7a]'}>{fmt(selected.kpis.concentration.top3Pct)}%</span></span>
                <span>HHI: <span className="text-[#e2ca7a]">{fmt(selected.kpis.concentration.hhi, 3)}</span></span>
              </>
            )}
          </div>

          {/* Lookahead warning */}
          {(selected.family === 'QA_ALL_HOLD1' || selected.liveValidStatus === 'INVALID_RESEARCH_REFERENCE') && (
            <div className="rounded border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-orange-300">
              <span className="font-semibold">⚠ CONDITIONAL — Potential Lookahead:</span>{' '}
              The holdingDays ≥ 1 filter on EURUSD 30M, DAX 1H, DAX 2H selects trades by realized duration (known post-exit only).
              Strategies use stop-based exits — hold time is not fixed at entry.
              <br />
              <span className="text-orange-400/70">To use live: convert filter to an ex-ante entry-time rule (e.g., entry only during specific session window). Re-run backtest after conversion.</span>
            </div>
          )}

          {/* Strategy Detail Toggle (v2 only) */}
          {selected.strategyDetail && (
            <div>
              <button
                onClick={() => setShowStrategyDetail((p) => !p)}
                className="text-xs text-[#e2ca7a] border border-[#e2ca7a]/30 rounded px-3 py-1 hover:bg-[#e2ca7a]/10 transition-colors"
              >
                {showStrategyDetail ? '▲ Hide' : '▼ Show'} Strategy Detail (17/17)
              </button>
              {showStrategyDetail && (
                <div className="mt-2 overflow-x-auto rounded-lg border border-[#2a2b30]">
                  <table className="text-[10px] w-full min-w-[400px]">
                    <thead>
                      <tr className="border-b border-[#2a2b30]">
                        <th className="px-2 py-1.5 text-left text-[#737373] uppercase tracking-wide">Strategy</th>
                        <th className="px-2 py-1.5 text-left text-[#737373] uppercase tracking-wide">Status</th>
                        <th className="px-2 py-1.5 text-left text-[#737373] uppercase tracking-wide">Filter</th>
                        <th className="px-2 py-1.5 text-right text-[#737373] uppercase tracking-wide">Contracts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selected.strategyDetail).map(([sid, slot]) => (
                        <tr key={sid} className="border-b border-[#2a2b30]/40">
                          <td className="px-2 py-1 font-mono text-[#e2ca7a]">{sid}</td>
                          <td className="px-2 py-1">
                            <span className={cn(
                              'px-1.5 py-0.5 rounded text-[9px]',
                              slot.status === 'READY' ? 'bg-emerald-900/40 text-emerald-400' :
                              slot.status === 'DATA_BLOCKED' ? 'bg-red-900/40 text-red-400' :
                              'bg-[#2a2b30] text-[#737373]'
                            )}>
                              {slot.status}
                            </span>
                          </td>
                          <td className="px-2 py-1 font-mono text-[#737373]">{slot.filter}</td>
                          <td className="px-2 py-1 text-right font-mono text-white">{slot.contracts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Equity curve or IS/OOS bar */}
            <div className="rounded-lg border border-[#2a2b30] bg-[#0A0A0A] p-3">
              <div className="text-xs text-[#737373] uppercase tracking-wide mb-2">
                {navChartData.length > 0 ? 'Equity Curve (NAV)' : 'IS vs OOS CAGR'}
              </div>
              {navChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={navChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2b30" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#737373' }} tickFormatter={(v: string) => v.slice(0, 7)} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: '#737373' }} tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} width={50} />
                    <Tooltip
                      contentStyle={{ background: '#1c1d20', border: '1px solid #2a2b30', fontSize: 11 }}
                      formatter={(v: unknown) => [`€${Number(v).toFixed(0)}`, 'NAV']}
                      labelStyle={{ color: '#737373' }}
                    />
                    <Line type="monotone" dataKey="nav" stroke="#e2ca7a" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={isOosBar}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2b30" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#737373' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#737373' }} unit="%" />
                    <Tooltip
                      contentStyle={{ background: '#1c1d20', border: '1px solid #2a2b30', fontSize: 11 }}
                      formatter={(v: unknown) => [`${v}%`]}
                    />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                      <Cell fill="#4f7cac" />
                      <Cell fill="#e2ca7a" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Drawdown or rolling folds */}
            <div className="rounded-lg border border-[#2a2b30] bg-[#0A0A0A] p-3">
              <div className="text-xs text-[#737373] uppercase tracking-wide mb-2">
                {drawdownData.length > 0 ? 'Drawdown %' : 'Rolling Walk-Forward Folds'}
              </div>
              {drawdownData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={drawdownData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2b30" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#737373' }} tickFormatter={(v: string) => v.slice(0, 7)} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: '#737373' }} unit="%" />
                    <Tooltip
                      contentStyle={{ background: '#1c1d20', border: '1px solid #2a2b30', fontSize: 11 }}
                      formatter={(v: unknown) => [`${Math.abs(Number(v)).toFixed(1)}%`, 'DrawDown']}
                      labelStyle={{ color: '#737373' }}
                    />
                    <Area type="monotone" dataKey="dd" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} dot={false} strokeWidth={1} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="space-y-1 mt-2">
                  {/* v3: use foldResults array; v2: use rolling3yr_folds count; v1: count */}
                  {(selected.walkForward?.foldResults ?? selected.walkForward?.foldResults3yr ?? []).length > 0
                    ? (selected.walkForward?.foldResults ?? selected.walkForward?.foldResults3yr ?? []).map((f, i) => {
                        const label = 'label' in f ? f.label : `Fold ${i + 1}`;
                        return (
                          <div key={i} className="flex items-center gap-2 text-[10px]">
                            <span className={cn('w-2 h-2 rounded-full flex-shrink-0', f.isPositive ? 'bg-emerald-400' : 'bg-red-400')} />
                            <span className="text-[#737373] truncate">{label}:</span>
                            <span className={cn('font-mono', f.isPositive ? 'text-emerald-400' : 'text-red-400')}>
                              €{f.oosNet.toFixed(0)}
                            </span>
                          </div>
                        );
                      })
                    : Array.from({ length: selected.wf?.rolling3yr_positive_folds !== undefined ? 5 : 0 }, (_, i) => {
                        const pass = i < (selected.wf?.rolling3yr_positive_folds ?? 0);
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className={cn('w-2 h-2 rounded-full', pass ? 'bg-emerald-400' : 'bg-red-400')} />
                            <span className="text-[#737373]">Fold {i + 1}:</span>
                            <span className={pass ? 'text-emerald-400' : 'text-red-400'}>{pass ? 'OOS Positive' : 'OOS Negative'}</span>
                          </div>
                        );
                      })
                  }
                  <div className="text-[10px] text-[#737373] mt-1">
                    Rolling 3-year IS→OOS walk-forward folds
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SCATTER: CAGR vs MaxDD */}
          <div className="rounded-lg border border-[#2a2b30] bg-[#0A0A0A] p-3">
            <div className="text-xs text-[#737373] uppercase tracking-wide mb-2">
              Top 20 Variants — OOS CAGR vs MaxDD% (dot size = Sharpe)
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2b30" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="MaxDD%"
                  tick={{ fontSize: 10, fill: '#737373' }}
                  label={{ value: 'MaxDD%', position: 'insideBottomRight', offset: -5, fill: '#737373', fontSize: 10 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="OOS CAGR%"
                  tick={{ fontSize: 10, fill: '#737373' }}
                  label={{ value: 'OOS CAGR%', angle: -90, position: 'insideLeft', fill: '#737373', fontSize: 10 }}
                  width={55}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ background: '#1c1d20', border: '1px solid #2a2b30', fontSize: 11 }}
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0]?.payload as ScatterPayload;
                    return (
                      <div className="bg-[#1c1d20] border border-[#2a2b30] rounded p-2 text-xs text-white space-y-0.5">
                        <div className="text-[#e2ca7a] font-semibold">{d.variantId}</div>
                        <div>OOS CAGR: {d.y.toFixed(2)}%</div>
                        <div>MaxDD: {d.x.toFixed(2)}%</div>
                        <div>Sharpe: {d.z.toFixed(2)}</div>
                        <div>Suitability: {d.suit}</div>
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={scatterData}
                  shape={(props: ScatterShapeProps) => <ScatterDot {...props} payload={props.payload as ScatterPayload} />}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* HEATMAP */}
      {allVariants.length > 0 && (
        <div className="rounded-lg border border-[#2a2b30] bg-[#141517] p-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-[#e2ca7a] mb-3">
            Heatmap — OOS CAGR% by Capital × Family
          </div>
          <div className="overflow-x-auto">
            <table className="text-[10px] border-collapse min-w-max">
              <thead>
                <tr>
                  <th className="text-[#737373] px-1 py-0.5 text-right pr-2">Capital ↓ / Family →</th>
                  {heatFamilies.map((f) => (
                    <th key={f} className="text-[#737373] px-1 py-0.5 text-center whitespace-nowrap font-normal">
                      {f.replace('_', ' ').slice(0, 10)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CAPITAL_LEVELS.map((cap) => (
                  <tr key={cap}>
                    <td className="text-[#737373] px-1 py-0.5 pr-2 text-right whitespace-nowrap">
                      €{cap >= 1000 ? `${cap / 1000}k` : cap}
                    </td>
                    {heatFamilies.map((fam) => {
                      const cell = getHeatCell(cap, fam);
                      const oos = cell?.kpis.oosCAGR ?? null;
                      return (
                        <td
                          key={fam}
                          className="px-1 py-0.5 text-center font-mono cursor-default"
                          style={{
                            backgroundColor: oos != null ? oosHeatColor(oos) : '#1c1d20',
                            color: oos != null ? '#000' : '#444',
                            minWidth: 38,
                          }}
                          title={cell ? `${cell.variantId}: OOS ${oos?.toFixed(1)}%` : 'N/A'}
                        >
                          {oos != null ? `${oos.toFixed(1)}%` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SERKAN COST PANEL */}
      {selected && costPanel && (
        <div className="rounded-lg border border-[#2a2b30] bg-[#141517] p-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-[#e2ca7a] mb-3">
            Cost Panel — {selected.name}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <LabStatCard label="Cost/exec" value="€0.85" />
            <LabStatCard label="Annual Trades" value={fmt(costPanel.annualTrades, 0)} />
            <LabStatCard label="Annual Exec" value={fmt(costPanel.annualExec, 0)} />
            <LabStatCard label="Annual Costs" value={fmtEUR(costPanel.annualCosts)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <LabStatCard label="Cost/NAV%" value={fmtPct(costPanel.costNavPct)} />
            <LabStatCard label="Gross Annual" value={fmtEUR(costPanel.grossAnnual)} />
            <LabStatCard label="Net Annual" value={fmtEUR(costPanel.netAnnual)} />
          </div>
          <div className="mt-3 text-[10px] text-[#737373]">
            Cost model: €0.85/exec × 2 executions/trade × {fmt(costPanel.annualTrades, 0)} trades/yr
            · {selected.kpis.totalTrades} total trades over {YEARS.toFixed(1)} years
          </div>
        </div>
      )}
    </div>
  );
}
