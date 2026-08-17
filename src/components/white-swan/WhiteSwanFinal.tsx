'use client';

import React, { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const BG      = '#0B0C0F';
const SURFACE = 'linear-gradient(to bottom, #17171b, #0b0b0e)';
const KPI_BG  = 'linear-gradient(to bottom, #26262d, #111114)';
const BORDER  = '1px solid rgba(255,255,255,0.055)';
const DIV_C   = 'rgba(255,255,255,0.06)';
const P       = '#F0F2F6';
const M       = 'rgba(180,192,210,0.55)';
const GOLD    = '#C9A84C';
const MO      = "var(--font-montserrat, 'Montserrat', sans-serif)";
const NU      = "var(--font-numbers, 'Nunito', sans-serif)";

// ─── Frozen v7.0 Performance metrics (summary) ─────────────────────────────────
const PERF = [
  { cap: 10000,  l: '€10k',  cagr: 14.85, oos: 6.94,  sh: 1.030, dd: 4.36, cal: 3.406, pf: 1.59, mar: 7543  },
  { cap: 12000,  l: '€12k',  cagr: 14.53, oos: 7.58,  sh: 1.099, dd: 4.71, cal: 3.085, pf: 1.50, mar: 8423  },
  { cap: 15000,  l: '€15k',  cagr: 14.16, oos: 7.89,  sh: 1.170, dd: 4.66, cal: 3.039, pf: 1.46, mar: 10311 },
  { cap: 20000,  l: '€20k',  cagr: 13.82, oos: 9.16,  sh: 1.076, dd: 5.57, cal: 2.481, pf: 1.34, mar: 11691 },
  { cap: 25000,  l: '€25k',  cagr: 13.58, oos: 9.55,  sh: 1.049, dd: 6.52, cal: 2.083, pf: 1.32, mar: 14443 },
  { cap: 30000,  l: '€30k',  cagr: 13.11, oos: 8.35,  sh: 1.103, dd: 5.14, cal: 2.551, pf: 1.35, mar: 19531 },
  { cap: 40000,  l: '€40k',  cagr: 12.80, oos: 7.18,  sh: 1.150, dd: 4.05, cal: 3.160, pf: 1.43, mar: 29531 },
  { cap: 50000,  l: '€50k',  cagr: 12.65, oos: 7.74,  sh: 1.228, dd: 3.59, cal: 3.524, pf: 1.51, mar: 37311 },
  { cap: 75000,  l: '€75k',  cagr: 12.78, oos: 10.85, sh: 1.343, dd: 6.41, cal: 1.994, pf: 1.39, mar: 63895 },
  { cap: 100000, l: '€100k', cagr: 11.51, oos: 10.72, sh: 1.379, dd: 5.94, cal: 1.938, pf: 1.39, mar: 80015 },
];
const DEF_IDX = 2; // €15k — best Sharpe in €10k–€25k range

// ─── S&P 500 benchmark (from analytics-generated.json benchmarkSeries) ─────────
const SP = { cagr: 9.35, oos: 13.08, dd: 46.2 };

// ─── 5-tier equity curve config ────────────────────────────────────────────────
const TIERS     = ['10000', '12000', '15000', '20000', '25000'] as const;
type Tier = typeof TIERS[number];
const TIER_LABELS: Record<Tier, string> = { '10000': '€10k', '12000': '€12k', '15000': '€15k', '20000': '€20k', '25000': '€25k' };

// Performance: white → dark grey (5 steps)
const NAV_COLORS: Record<Tier, string> = {
  '10000': '#F0F2F6',
  '12000': '#C8CDD8',
  '15000': '#A0A7B8',
  '20000': '#72798A',
  '25000': '#4C5260',
};
// Drawdown: bright gold → dark bronze (5 muted-gold shades, no red)
const DD_COLORS: Record<Tier, string> = {
  '10000': '#D6B24A',
  '12000': '#B99840',
  '15000': '#9A7E36',
  '20000': '#7C642C',
  '25000': '#5E4C20',
};

// ─── Portfolio groups ───────────────────────────────────────────────────────────
const PORT_CORE = [
  { key: 'eur',  ticker: 'M6E',  label: 'EUR',   icon: '/asset-icons/eur.png'       },
  { key: 'dax1', ticker: 'FDXS', label: 'DAX 1', icon: '/asset-icons/dax.png'       },
  { key: 'dax2', ticker: 'FDXS', label: 'DAX 2', icon: '/asset-icons/dax.png'       },
];
const PORT_TACTICAL = [
  { key: 'gld',  ticker: 'MGC', label: 'Gold Sleeve', icon: '/asset-icons/gold.png'       },
  { key: 'zw',   ticker: 'MZW', label: 'Wheat',       icon: null                          },
  { key: 'ym1',  ticker: 'MYM', label: 'Dow TAT',     icon: '/asset-icons/dow_jones.png'  },
];
const PORT_SEASONAL = [
  { key: 'sb',  ticker: 'SB',  label: 'Sugar',    icon: '/asset-icons/sugar.png'     },
  { key: 'gc1', ticker: 'MGC', label: 'Gold Sea.', icon: '/asset-icons/gold.png'     },
  { key: 'cl1', ticker: 'MCL', label: 'Crude',    icon: '/asset-icons/crude_oil.png'  },
  { key: 'cc',  ticker: 'CC',  label: 'Cocoa',    icon: '/asset-icons/cocoa.png'     },
  { key: 'mes', ticker: 'MES', label: 'S&P',      icon: '/asset-icons/es_s&p.png'   },
  { key: 'zc',  ticker: 'MZC', label: 'Corn',     icon: '/asset-icons/corn.png'      },
  { key: 'zs',  ticker: 'MZS', label: 'Soy',      icon: '/asset-icons/soybeans.png'  },
  { key: 'hg1', ticker: 'MHG', label: 'Copper',   icon: null                         },
];

// ─── Gradient system (verbatim from ReferenceBarChart) ──────────────────────────
const GRAD_DEFS = [
  { id:'pb-hi', x1:'0',y1:'1',x2:'0',y2:'0', stops:[{o:'0%',c:'#606470'},{o:'50%',c:'#e6e8ec'},{o:'100%',c:'#f8f9fb'}] },
  { id:'pb-md', x1:'0',y1:'1',x2:'0',y2:'0', stops:[{o:'0%',c:'#565a62'},{o:'65%',c:'#d0d3d9'},{o:'100%',c:'#e8e9ec'}] },
  { id:'pb-lo', x1:'0',y1:'1',x2:'0',y2:'0', stops:[{o:'0%',c:'#44484f'},{o:'100%',c:'#a2a6ae'}] },
  { id:'pb-xs', x1:'0',y1:'1',x2:'0',y2:'0', stops:[{o:'0%',c:'#38393e'},{o:'100%',c:'#66696f'}] },
  { id:'nb-hi', x1:'0',y1:'0',x2:'0',y2:'1', stops:[{o:'0%',c:'#4a4630'},{o:'100%',c:'#D6B24A'}] },
  { id:'nb-md', x1:'0',y1:'0',x2:'0',y2:'1', stops:[{o:'0%',c:'#3e3b28'},{o:'100%',c:'#b08838'}] },
  { id:'nb-lo', x1:'0',y1:'0',x2:'0',y2:'1', stops:[{o:'0%',c:'#333028'},{o:'100%',c:'#7a6230'}] },
  { id:'nb-xs', x1:'0',y1:'0',x2:'0',y2:'1', stops:[{o:'0%',c:'#2a2820'},{o:'100%',c:'#4e4828'}] },
];

function GradDefs({ prefix }: { prefix: string }) {
  return (
    <defs>
      {GRAD_DEFS.map(g => (
        <linearGradient key={g.id} id={`${prefix}-${g.id}`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
          {g.stops.map(s => <stop key={s.o} offset={s.o} stopColor={s.c} />)}
        </linearGradient>
      ))}
    </defs>
  );
}

function gradFill(val: number, maxPos: number, maxNeg: number, prefix: string): string {
  if (val >= 0) {
    const s = maxPos > 0 ? val / maxPos : 0;
    if (s >= 0.85) return `url(#${prefix}-pb-hi)`;
    if (s >= 0.45) return `url(#${prefix}-pb-md)`;
    if (s >= 0.15) return `url(#${prefix}-pb-lo)`;
    return `url(#${prefix}-pb-xs)`;
  }
  const s = maxNeg < 0 ? Math.abs(val) / Math.abs(maxNeg) : 0;
  if (s >= 0.85) return `url(#${prefix}-nb-hi)`;
  if (s >= 0.45) return `url(#${prefix}-nb-md)`;
  if (s >= 0.15) return `url(#${prefix}-nb-lo)`;
  return `url(#${prefix}-nb-xs)`;
}

// ─── CAGR by Capital data ───────────────────────────────────────────────────────
const cagrData = PERF.map(t => ({ n: t.l, v: t.cagr }));
const maxCagr  = Math.max(...PERF.map(t => t.cagr));

// ─── Ratios data ────────────────────────────────────────────────────────────────
const _shMin  = Math.min(...PERF.map(t => t.sh));
const _shMax  = Math.max(...PERF.map(t => t.sh));
const _calMin = Math.min(...PERF.map(t => t.cal));
const _calMax = Math.max(...PERF.map(t => t.cal));
const _pfMin  = Math.min(...PERF.map(t => t.pf));
const _pfMax  = Math.max(...PERF.map(t => t.pf));
const ratioData = PERF.map(t => ({
  n: t.l,
  sharpe: Math.round(((t.sh  - _shMin)  / (_shMax  - _shMin))  * 100),
  calmar: Math.round(((t.cal - _calMin) / (_calMax - _calMin)) * 100),
  pf:     Math.round(((t.pf  - _pfMin)  / (_pfMax  - _pfMin))  * 100),
  shAct: t.sh, calAct: t.cal, pfAct: t.pf,
}));

// ─── Axis tick style ────────────────────────────────────────────────────────────
const AXIS_TICK = { fill: '#7f8a9d' as string, fontSize: 9, fontFamily: NU };

// ─── Chart tooltips ─────────────────────────────────────────────────────────────
type ChartRow = Record<string, unknown>;

const PerfTooltip = ({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0B0E12', border: '1px solid rgba(240,242,246,0.18)', borderRadius: 6, padding: '6px 10px', minWidth: 120 }}>
      <div style={{ fontFamily: MO, fontSize: 8, color: M, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      {TIERS.map((tier, i) => {
        const pt = payload.find(p => p.dataKey === `nav${tier}`);
        if (!pt) return null;
        return (
          <div key={tier} style={{ fontFamily: NU, fontSize: 10, color: NAV_COLORS[tier], fontVariantNumeric: 'tabular-nums', lineHeight: 1.5 }}>
            {TIER_LABELS[tier]}: €{Math.round(pt.value).toLocaleString('de-DE')}
          </div>
        );
      })}
    </div>
  );
};

const DDTooltip = ({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0B0E12', border: '1px solid rgba(214,178,74,0.22)', borderRadius: 6, padding: '6px 10px', minWidth: 120 }}>
      <div style={{ fontFamily: MO, fontSize: 8, color: M, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      {TIERS.map((tier, i) => {
        const pt = payload.find(p => p.dataKey === `dd${tier}`);
        if (!pt) return null;
        return (
          <div key={tier} style={{ fontFamily: NU, fontSize: 10, color: DD_COLORS[tier], fontVariantNumeric: 'tabular-nums', lineHeight: 1.5 }}>
            {TIER_LABELS[tier]}: {pt.value.toFixed(2)}%
          </div>
        );
      })}
    </div>
  );
};

const RatioTooltip = ({ active, payload, label }: { active?: boolean; payload?: { payload: typeof ratioData[0] }[]; label?: string }) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: '#0B0E12', border: '1px solid rgba(255,255,255,0.055)', borderRadius: 6, padding: '5px 9px' }}>
      <div style={{ fontFamily: MO, fontSize: 8, color: M, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      <div style={{ fontFamily: NU, fontSize: 10, color: 'rgba(240,242,246,0.8)' }}>Sharpe {d.shAct.toFixed(3)}</div>
      <div style={{ fontFamily: NU, fontSize: 10, color: GOLD }}>Calmar {d.calAct.toFixed(3)}</div>
      <div style={{ fontFamily: NU, fontSize: 10, color: M }}>PF {d.pfAct.toFixed(2)}</div>
    </div>
  );
};

// ─── Asset chip ─────────────────────────────────────────────────────────────────
function AssetChip({ ticker, label, icon }: { ticker: string; label: string; icon: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt={ticker} width={14} height={14} style={{ objectFit: 'contain', opacity: 0.85, flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
          background: 'rgba(180,192,210,0.14)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: MO, fontSize: 5, fontWeight: 700, color: M,
        }}>{ticker.slice(0, 2)}</div>
      )}
      <span style={{ fontFamily: MO, fontSize: 9, fontWeight: 600, color: P, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

// ─── Group header label ─────────────────────────────────────────────────────────
function GroupLabel({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{
      fontFamily: MO, fontSize: 6.5, fontWeight: 700,
      color: accent ? GOLD : M,
      textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────────
export function WhiteSwanFinal() {
  const [showSP, setShowSP] = useState(false);

  // ── Equity series ─────────────────────────────────────────────────────────
  // DATA BLOCKED: equity-series.json is pre-vNext (old EUR strategy).
  // CAGR matches v7 frozen but MaxDD is -28.83% vs frozen -4.36% — material
  // mismatch. Genuine dated v7 component P&L (EurMasterRegime30M) not
  // available as pre-computed 5-tier NAV. Per spec rule 14: DATA BLOCKED.
  const chartData: ChartRow[]  = [];
  const yearTicks: string[]    = [];
  const seriesLoaded           = false;
  const seriesError            = true;

  const t = PERF[DEF_IDX]; // €15k

  // ── Table styles ──────────────────────────────────────────────────────────
  const th: React.CSSProperties = {
    fontFamily: MO, fontSize: 7, fontWeight: 700, color: M,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    padding: '4px 10px 5px', textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: `1px solid rgba(255,255,255,0.08)`,
  };
  const thL: React.CSSProperties = { ...th, textAlign: 'left' };
  const td: React.CSSProperties = {
    fontFamily: NU, fontSize: 12, fontWeight: 600, color: P,
    textAlign: 'right', padding: '3px 10px',
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
    borderBottom: `1px solid ${DIV_C}`,
  };
  const tdL: React.CSSProperties   = { ...td, textAlign: 'left' };
  const tdG: React.CSSProperties   = { ...td, color: GOLD };
  const tdDim: React.CSSProperties = { ...td, color: M };

  // ── Blocked placeholder ───────────────────────────────────────────────────
  const BlockedChart = ({ title }: { title: string }) => (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 6,
    }}>
      <div style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</div>
      <div style={{ fontFamily: MO, fontSize: 9, fontWeight: 700, color: 'rgba(201,168,76,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>DATA BLOCKED</div>
      <div style={{ fontFamily: MO, fontSize: 7, color: 'rgba(180,192,210,0.3)', letterSpacing: '0.06em', textAlign: 'center', maxWidth: 200, lineHeight: 1.6 }}>
        Genuine dated v7 component P&amp;L unavailable
      </div>
    </div>
  );

  // ── Year-label tick formatter ─────────────────────────────────────────────
  const dateTick = (val: string) => {
    if (!val || !val.endsWith('-01')) return '';
    return val.slice(0, 4);
  };

  return (
    <div style={{
      flex: 1, height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      padding: '14px 24px 16px', background: BG, minWidth: 0, boxSizing: 'border-box',
    }}>

      {/* ── 1. Header ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, flexShrink: 0,
      }}>
        {/* Left: title + back icon immediately right of v7.0 */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ fontFamily: MO, fontSize: 20, fontWeight: 800, color: P, margin: 0, lineHeight: 1 }}>
            White Swan
          </h1>
          <span style={{ fontFamily: MO, fontSize: 11, color: M, letterSpacing: '0.04em' }}>v7.0</span>
          <button
            onClick={() => { window.location.assign('/komponenten?product=ws'); }}
            aria-label="Zurück zu Komponenten"
            title="Zurück zu Komponenten"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22,
              fontFamily: MO, fontSize: 12, fontWeight: 500, color: M,
              lineHeight: 1, cursor: 'pointer',
              borderRadius: 5,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              transition: 'color 120ms, border-color 120ms, background 120ms',
              verticalAlign: 'middle',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = P;
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = M;
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            }}
          >
            ←
          </button>
        </div>

        {/* Right: Risk Multiplier */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: MO, fontSize: 7, color: M, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 2 }}>Risk ×</span>
          {[
            { label: '1.0×', active: true,  disabled: false },
            { label: '1.5×', active: false, disabled: true  },
            { label: '2.0×', active: false, disabled: true  },
          ].map(btn => (
            <div
              key={btn.label}
              title={btn.disabled ? 'Available in future update' : undefined}
              style={{
                fontFamily: MO, fontSize: 8, fontWeight: btn.active ? 700 : 500,
                color: btn.active ? P : 'rgba(255,255,255,0.22)',
                padding: '3px 7px', borderRadius: 4,
                border: btn.active ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.06)',
                background: btn.active ? 'rgba(255,255,255,0.06)' : 'transparent',
                cursor: btn.disabled ? 'not-allowed' : 'pointer',
                letterSpacing: '0.04em',
              }}
            >
              {btn.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. KPI Row ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 7, marginBottom: showSP ? 6 : 10, flexShrink: 0 }}>
        {[
          { label: 'BEST SHARPE TIER', value: `€${(t.cap / 1000).toFixed(0)}k`,   gold: false, accent: true },
          { label: 'CAGR',             value: `${t.cagr.toFixed(2)}%`,             gold: false },
          { label: 'OOS CAGR',         value: `${t.oos.toFixed(2)}%`,              gold: false },
          { label: 'SHARPE',           value: t.sh.toFixed(3),                     gold: false },
          { label: 'MAX DD',           value: `−${t.dd.toFixed(2)}%`,              gold: true  },
          { label: 'CALMAR',           value: t.cal.toFixed(3),                    gold: false },
          { label: 'PF',               value: t.pf.toFixed(2),                     gold: false },
          { label: 'MARGIN',           value: `€${t.mar.toLocaleString('de-DE')}`, gold: false },
          { label: 'EUR PF',           value: '1.375',                             gold: false },
          { label: 'EUR EXP.',         value: '$5.11',                             gold: false },
        ].map(k => (
          <div key={k.label} style={{
            flex: 1, background: KPI_BG, border: BORDER, borderRadius: 10,
            padding: '8px 10px', display: 'flex', flexDirection: 'column',
            justifyContent: 'space-between', height: 58, boxSizing: 'border-box',
          }}>
            <div style={{
              fontFamily: MO, fontSize: k.accent ? 6 : 7, fontWeight: 700,
              color: k.accent ? GOLD : M,
              textTransform: 'uppercase', letterSpacing: k.accent ? '0.05em' : '0.08em',
              lineHeight: 1, whiteSpace: 'nowrap',
            }}>
              {k.label}
            </div>
            <div style={{
              fontFamily: NU, fontSize: 14, fontWeight: 700,
              color: k.gold ? GOLD : P,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1, whiteSpace: 'nowrap',
            }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── 2b. S&P strip (when ON) ───────────────────────────────────────────── */}
      {showSP && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 20, marginBottom: 10,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 8, padding: '6px 14px', flexShrink: 0,
        }}>
          <span style={{ fontFamily: MO, fontSize: 7, fontWeight: 700, color: 'rgba(240,242,246,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 60 }}>S&amp;P 500 vs</span>
          {[
            { l: 'CAGR',     ws: `${t.cagr.toFixed(2)}%`, sp: `${SP.cagr.toFixed(2)}%`, red: false },
            { l: 'OOS CAGR', ws: `${t.oos.toFixed(2)}%`,  sp: `${SP.oos.toFixed(2)}%`, red: false },
            { l: 'MAX DD',   ws: `−${t.dd.toFixed(2)}%`,  sp: `−${SP.dd.toFixed(1)}%`, red: true  },
          ].map(row => (
            <div key={row.l} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: MO, fontSize: 7, color: M, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{row.l}</span>
              <span style={{ fontFamily: NU, fontSize: 11, fontWeight: 700, color: P, fontVariantNumeric: 'tabular-nums' }}>{row.ws}</span>
              <span style={{ fontFamily: MO, fontSize: 7, color: M }}>vs</span>
              <span style={{ fontFamily: NU, fontSize: 11, fontWeight: 600, color: row.red ? 'rgba(220,80,80,0.7)' : M, fontVariantNumeric: 'tabular-nums' }}>{row.sp}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 3. Portfolio — full width ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 10, flexShrink: 0 }}>
        <div style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5 }}>
          Portfolio · 14 active
        </div>
        <div style={{
          background: SURFACE, border: BORDER, borderRadius: 10,
          padding: '10px 14px', display: 'flex', alignItems: 'stretch', width: '100%', boxSizing: 'border-box',
        }}>

          {/* CORE — compact, 3 items */}
          <div style={{ flexShrink: 0, paddingRight: 14 }}>
            <GroupLabel accent>Core</GroupLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PORT_CORE.map(a => <AssetChip key={a.key} ticker={a.ticker} label={a.label} icon={a.icon} />)}
            </div>
          </div>

          <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch', flexShrink: 0 }} />

          {/* ANOMALIES / TACTICAL — medium, 3 items */}
          <div style={{ flexShrink: 0, paddingLeft: 14, paddingRight: 14 }}>
            <GroupLabel>Anomalies · Tactical</GroupLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PORT_TACTICAL.map(a => <AssetChip key={a.key} ticker={a.ticker} label={a.label} icon={a.icon} />)}
            </div>
          </div>

          <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch', flexShrink: 0 }} />

          {/* SEASONAL — largest, 8 items in 2 rows of 4 */}
          <div style={{ flex: 1, paddingLeft: 14 }}>
            <GroupLabel>Seasonal</GroupLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px 12px' }}>
              {PORT_SEASONAL.map(a => <AssetChip key={a.key} ticker={a.ticker} label={a.label} icon={a.icon} />)}
            </div>
          </div>

        </div>
      </div>

      {/* ── 4. Performance heading + S&P toggle ─────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
        <div style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Performance · 2008–2025
        </div>
        <button
          onClick={() => setShowSP(v => !v)}
          style={{
            fontFamily: MO, fontSize: 7, fontWeight: 600,
            color: showSP ? P : M,
            textTransform: 'uppercase', letterSpacing: '0.07em',
            padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
            border: showSP ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.07)',
            background: showSP ? 'rgba(255,255,255,0.06)' : 'transparent',
            transition: 'all 120ms',
          }}
        >
          S&amp;P 500 {showSP ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* ── 5. Charts — 2-col 60/40 ──────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10,
        flex: 1, minHeight: 0, marginBottom: 6,
      }}>

        {/* ── Left column (60%): Performance + Drawdown ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>

          {/* Performance NAV — genuine 5-tier line chart */}
          <div style={{ flex: 1, minHeight: 0, background: SURFACE, border: BORDER, borderRadius: 10, padding: '8px 10px 4px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3, flexShrink: 0 }}>
              <span style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Performance</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {TIERS.map(tier => (
                  <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 16, height: 1.5, background: NAV_COLORS[tier], borderRadius: 1 }} />
                    <span style={{ fontFamily: MO, fontSize: 7.5, color: NAV_COLORS[tier], letterSpacing: '0.04em' }}>{TIER_LABELS[tier]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {seriesError ? (
                <BlockedChart title="Performance Series" />
              ) : !seriesLoaded ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: MO, fontSize: 8, color: M, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Loading…</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 2, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.03)" />
                    <XAxis
                      dataKey="date"
                      ticks={yearTicks}
                      tickFormatter={dateTick}
                      tick={AXIS_TICK}
                      axisLine={{ stroke: 'rgba(255,255,255,0.16)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                    />
                    <Tooltip content={<PerfTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
                    {TIERS.map(tier => (
                      <Line
                        key={tier}
                        dataKey={`nav${tier}`}
                        stroke={NAV_COLORS[tier]}
                        strokeWidth={tier === '15000' ? 2 : 1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Max Drawdown — underwater 5-tier line chart */}
          <div style={{ flex: 1, minHeight: 0, background: SURFACE, border: BORDER, borderRadius: 10, padding: '8px 10px 4px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3, flexShrink: 0 }}>
              <span style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Max Drawdown</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {TIERS.map(tier => (
                  <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 16, height: 1.5, background: DD_COLORS[tier], borderRadius: 1 }} />
                    <span style={{ fontFamily: MO, fontSize: 7.5, color: DD_COLORS[tier], letterSpacing: '0.04em' }}>{TIER_LABELS[tier]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {seriesError ? (
                <BlockedChart title="Drawdown Series" />
              ) : !seriesLoaded ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: MO, fontSize: 8, color: M, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Loading…</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 2, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.03)" />
                    <XAxis
                      dataKey="date"
                      ticks={yearTicks}
                      tickFormatter={dateTick}
                      tick={AXIS_TICK}
                      axisLine={{ stroke: 'rgba(255,255,255,0.16)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
                    <Tooltip content={<DDTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
                    {TIERS.map(tier => (
                      <Line
                        key={tier}
                        dataKey={`dd${tier}`}
                        stroke={DD_COLORS[tier]}
                        strokeWidth={tier === '15000' ? 2 : 1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        </div>

        {/* ── Right column (40%): Ratios + CAGR by Capital ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>

          {/* Sharpe / Calmar / PF — normalized */}
          <div style={{ flex: 1, minHeight: 0, background: SURFACE, border: BORDER, borderRadius: 10, padding: '8px 10px 4px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3, flexShrink: 0 }}>
              <span style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ratios</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 1.5, background: 'rgba(240,242,246,0.72)', borderRadius: 1 }} /><span style={{ fontFamily: MO, fontSize: 7.5, color: 'rgba(240,242,246,0.65)' }}>Sharpe</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 1.5, background: GOLD, borderRadius: 1 }} /><span style={{ fontFamily: MO, fontSize: 7.5, color: GOLD }}>Calmar</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 1, borderTop: `1px dashed rgba(180,192,210,0.4)` }} /><span style={{ fontFamily: MO, fontSize: 7.5, color: M }}>PF</span></div>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ratioData} margin={{ top: 2, right: 6, left: -28, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="n" tick={AXIS_TICK} axisLine={{ stroke: 'rgba(255,255,255,0.16)' }} tickLine={false} />
                  <YAxis domain={[-5, 105]} hide />
                  <Tooltip content={<RatioTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
                  <Line dataKey="sharpe" stroke="rgba(240,242,246,0.72)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line dataKey="calmar" stroke={GOLD}                   strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line dataKey="pf"     stroke="rgba(180,192,210,0.4)"  strokeWidth={1.5} dot={false} strokeDasharray="4 3" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CAGR by Capital */}
          <div style={{ flex: 1, minHeight: 0, background: SURFACE, border: BORDER, borderRadius: 10, padding: '8px 10px 4px', display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3, flexShrink: 0 }}>CAGR by Capital</span>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cagrData} barCategoryGap="40%" margin={{ top: 2, right: 2, left: -18, bottom: 0 }}>
                  <GradDefs prefix="cagr" />
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="n" tick={AXIS_TICK} axisLine={{ stroke: 'rgba(255,255,255,0.16)' }} tickLine={false} />
                  <YAxis domain={[10, 16]} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} width={34} />
                  <Tooltip
                    contentStyle={{ background: '#0B0E12', border: BORDER, borderRadius: 6, fontSize: 10, fontFamily: NU, color: P, padding: '5px 9px' }}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, 'CAGR']}
                  />
                  <Bar dataKey="v" maxBarSize={22} radius={[2,2,0,0]} isAnimationActive={false}>
                    {cagrData.map((d, i) => <Cell key={i} fill={gradFill(d.v, maxCagr, 0, 'cagr')} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

      </div>

      {/* ── 6. Performance table ──────────────────────────────────────────────── */}
      <div style={{ background: SURFACE, border: BORDER, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...thL, width: '9%'  }}>Capital</th>
              <th style={{ ...th,  width: '9%'  }}>CAGR</th>
              <th style={{ ...th,  width: '9%'  }}>OOS CAGR</th>
              <th style={{ ...th,  width: '8%'  }}>Sharpe</th>
              <th style={{ ...th,  width: '9%'  }}>Max DD</th>
              <th style={{ ...th,  width: '9%'  }}>Calmar</th>
              <th style={{ ...th,  width: '7%'  }}>PF</th>
              <th style={{ ...th,  width: '12%' }}>Margin €</th>
              <th style={{ ...th,  width: '9%'  }}>Margin %</th>
            </tr>
          </thead>
          <tbody>
            {PERF.map((row, idx) => (
              <tr
                key={row.cap}
                style={{ transition: 'background 120ms', background: idx === DEF_IDX ? 'rgba(201,168,76,0.04)' : 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                onMouseLeave={e => (e.currentTarget.style.background = idx === DEF_IDX ? 'rgba(201,168,76,0.04)' : 'transparent')}
              >
                <td style={{ ...tdL, color: idx === DEF_IDX ? GOLD : P }}>{row.l}</td>
                <td style={td}>{row.cagr.toFixed(2)}%</td>
                <td style={td}>{row.oos.toFixed(2)}%</td>
                <td style={td}>{row.sh.toFixed(3)}</td>
                <td style={tdG}>−{row.dd.toFixed(2)}%</td>
                <td style={td}>{row.cal.toFixed(3)}</td>
                <td style={td}>{row.pf.toFixed(2)}</td>
                <td style={tdDim}>€{row.mar.toLocaleString('de-DE')}</td>
                <td style={tdDim}>{((row.mar / row.cap) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
