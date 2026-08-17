'use client';

import React from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

// ─── Design tokens ────────────────────────────────────────────────────────────
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

// ─── Frozen v7.0 Performance data ─────────────────────────────────────────────
// Source: WHITE_SWAN_VNEXT_PERFORMANCE.json
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

// ─── Active v7.0 portfolio — 14 components ────────────────────────────────────
// Authoritative source: WHITE_SWAN_VNEXT_COMPONENT_REGISTRY.json active[]
// Excluded: gld_thursday_anomaly (HELD_BACK), zm1 (DATA_BLOCKED), retired/rejected
//
// Architecture Core (3): EUR, DAX1, DAX2
const CORE = [
  { key: 'eur',  ticker: 'M6E',  label: 'EUR',   strategy: 'EurMasterRegime30M' },
  { key: 'dax1', ticker: 'FDXS', label: 'DAX 1', strategy: 'DAX1H'             },
  { key: 'dax2', ticker: 'FDXS', label: 'DAX 2', strategy: 'DAX2H'             },
];

// Additional active (11): 5 core-role + 9 satellites from registry
const ACTIVE_REST = [
  { id: 'gld_mgc',      ticker: 'MGC', label: 'Gold Sleeve'  },
  { id: 'zw_mzw',       ticker: 'MZW', label: 'Wheat'        },
  { id: 'sb_seasonal',  ticker: 'SB',  label: 'Sugar'        },
  { id: 'gc1_seasonal', ticker: 'MGC', label: 'Gold Sea.'    },
  { id: 'cl1_seasonal', ticker: 'MCL', label: 'Crude'        },
  { id: 'cc_seasonal',  ticker: 'CC',  label: 'Cocoa'        },
  { id: 'spy_mes',      ticker: 'MES', label: 'S&P'          },
  { id: 'zc_seasonal',  ticker: 'MZC', label: 'Corn'         },
  { id: 'zs_seasonal',  ticker: 'MZS', label: 'Soy'          },
  { id: 'hg1_seasonal', ticker: 'MHG', label: 'Copper'       },
  { id: 'ym1_tat',      ticker: 'MYM', label: 'Dow TAT'      },
];
// Total active: 3 + 11 = 14

// ─── Chart data ───────────────────────────────────────────────────────────────
const cagrData   = PERF.map(t => ({ n: t.l, v: t.cagr }));
const sharpeData = PERF.map(t => ({ n: t.l, v: t.sh   }));
const ddData     = PERF.map(t => ({ n: t.l, v: -t.dd  }));

// ─── Tooltip style ────────────────────────────────────────────────────────────
const TT: React.CSSProperties = {
  background: '#14151a', border: BORDER, borderRadius: 6,
  fontSize: 10, fontFamily: NU, color: P, padding: '4px 8px',
};

// ─── Main component ───────────────────────────────────────────────────────────
export function WhiteSwanFinal() {

  // ── Table cell styles ────────────────────────────────────────────────────
  const th: React.CSSProperties = {
    fontFamily: MO, fontSize: 7, fontWeight: 700, color: M,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    padding: '4px 10px 5px', textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: `1px solid rgba(255,255,255,0.08)`,
  };
  const thL: React.CSSProperties = { ...th, textAlign: 'left' };
  const td: React.CSSProperties = {
    fontFamily: NU, fontSize: 11, fontWeight: 600, color: P,
    textAlign: 'right', padding: '4px 10px',
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
    borderBottom: `1px solid ${DIV_C}`,
  };
  const tdL: React.CSSProperties  = { ...td, textAlign: 'left' };
  const tdG: React.CSSProperties  = { ...td, color: GOLD };
  const tdDim: React.CSSProperties = { ...td, color: M };

  return (
    <div style={{
      flex: 1, height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      padding: '14px 24px 10px', background: BG, minWidth: 0, boxSizing: 'border-box',
    }}>

      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 10, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{
            fontFamily: MO, fontSize: 20, fontWeight: 800,
            color: P, margin: 0, lineHeight: 1,
          }}>
            White Swan
          </h1>
          <span style={{ fontFamily: MO, fontSize: 11, color: M, letterSpacing: '0.04em' }}>v7.0</span>
        </div>
        <div style={{
          fontFamily: MO, fontSize: 8, color: M,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          2008–2025 · OOS 2017–2025
        </div>
      </div>

      {/* ── 2. KPI Row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexShrink: 0 }}>
        {[
          { label: 'CAPITAL',   value: '€10,000', gold: false },
          { label: 'CAGR',      value: '14.85%',  gold: false },
          { label: 'OOS CAGR',  value: '6.94%',   gold: false },
          { label: 'SHARPE',    value: '1.030',   gold: false },
          { label: 'MAX DD',    value: '−4.36%',  gold: true  },
          { label: 'CALMAR',    value: '3.406',   gold: false },
          { label: 'PF',        value: '1.59',    gold: false },
          { label: 'MARGIN',    value: '€7,543',  gold: false },
          { label: 'EUR PF',    value: '1.375',   gold: false },
          { label: 'EUR EXP.',  value: '$5.11',   gold: false },
        ].map(k => (
          <div key={k.label} style={{
            flex: 1, background: KPI_BG, border: BORDER, borderRadius: 10,
            padding: '8px 10px', display: 'flex', flexDirection: 'column',
            justifyContent: 'space-between', height: 54, boxSizing: 'border-box',
          }}>
            <div style={{
              fontFamily: MO, fontSize: 8, fontWeight: 700, color: M,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              lineHeight: 1, whiteSpace: 'nowrap',
            }}>
              {k.label}
            </div>
            <div style={{
              fontFamily: NU, fontSize: 17, fontWeight: 700,
              color: k.gold ? GOLD : P,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1, whiteSpace: 'nowrap',
            }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. Portfolio ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 10, flexShrink: 0 }}>
        <div style={{
          fontFamily: MO, fontSize: 8, fontWeight: 700, color: M,
          textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6,
        }}>
          Portfolio · 14 active
        </div>
        <div style={{
          background: SURFACE, border: BORDER, borderRadius: 10,
          padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>

          {/* Core */}
          <div style={{ flexShrink: 0 }}>
            <div style={{
              fontFamily: MO, fontSize: 7, fontWeight: 700, color: GOLD,
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7,
            }}>Core</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {CORE.map(c => (
                <div key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontFamily: MO, fontSize: 7, color: M, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{c.ticker}</span>
                  <span style={{ fontFamily: MO, fontSize: 11, fontWeight: 700, color: P }}>{c.label}</span>
                  <span style={{ fontFamily: MO, fontSize: 8, color: M }}>{c.strategy}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch', flexShrink: 0 }} />

          {/* Active satellites + other */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: MO, fontSize: 7, fontWeight: 700, color: M,
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7,
            }}>Active · 11</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 16px' }}>
              {ACTIVE_REST.map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: MO, fontSize: 7, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 24 }}>{a.ticker}</span>
                  <span style={{ fontFamily: MO, fontSize: 10, color: P, whiteSpace: 'nowrap' }}>{a.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch', flexShrink: 0 }} />

          {/* EUR Core metrics */}
          <div style={{ flexShrink: 0 }}>
            <div style={{
              fontFamily: MO, fontSize: 7, fontWeight: 700, color: M,
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7,
            }}>EUR Core</div>
            <div style={{ display: 'flex', gap: 14 }}>
              {[
                { l: 'PF',    v: '1.375' },
                { l: 'Exp.',  v: '$5.11' },
                { l: '1.5×', v: '1.338' },
                { l: '2×',   v: '1.303' },
              ].map(m => (
                <div key={m.l} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontFamily: MO, fontSize: 7, color: M, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.l}</span>
                  <span style={{ fontFamily: NU, fontSize: 12, fontWeight: 700, color: P, fontVariantNumeric: 'tabular-nums' }}>{m.v}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── 4. Performance heading ──────────────────────────────────────────── */}
      <div style={{
        fontFamily: MO, fontSize: 8, fontWeight: 700, color: M,
        textTransform: 'uppercase', letterSpacing: '0.12em',
        marginBottom: 6, flexShrink: 0,
      }}>
        Performance · 2008–2025
      </div>

      {/* ── 5. Charts (flex: 1, 3-column) ──────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
        flex: 1, minHeight: 0, marginBottom: 8,
      }}>

        {/* CAGR */}
        <div style={{
          background: SURFACE, border: BORDER, borderRadius: 10,
          padding: '10px 10px 8px', display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <div style={{ fontFamily: MO, fontSize: 9, fontWeight: 700, color: P, marginBottom: 4, flexShrink: 0, letterSpacing: '0.04em' }}>CAGR</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cagrData} margin={{ top: 2, right: 2, left: -20, bottom: 0 }} barSize={16}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="n" tick={{ fontFamily: MO, fontSize: 7, fill: M as string }} axisLine={false} tickLine={false} />
                <YAxis domain={[10, 16]} tick={{ fontFamily: NU, fontSize: 7, fill: M as string }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={TT} formatter={(v) => [`${Number(v).toFixed(2)}%`, 'CAGR']} />
                <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                  {cagrData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? 'rgba(201,168,76,0.52)' : 'rgba(180,192,210,0.17)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sharpe */}
        <div style={{
          background: SURFACE, border: BORDER, borderRadius: 10,
          padding: '10px 10px 8px', display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <div style={{ fontFamily: MO, fontSize: 9, fontWeight: 700, color: P, marginBottom: 4, flexShrink: 0, letterSpacing: '0.04em' }}>Sharpe</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sharpeData} margin={{ top: 2, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="n" tick={{ fontFamily: MO, fontSize: 7, fill: M as string }} axisLine={false} tickLine={false} />
                <YAxis domain={[0.9, 1.5]} tick={{ fontFamily: NU, fontSize: 7, fill: M as string }} axisLine={false} tickLine={false} tickFormatter={v => (v as number).toFixed(2)} />
                <Tooltip contentStyle={TT} formatter={(v) => [Number(v).toFixed(3), 'Sharpe']} />
                <Line dataKey="v" stroke="rgba(240,242,246,0.65)" strokeWidth={1.5} dot={{ r: 2, fill: P, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Max DD */}
        <div style={{
          background: SURFACE, border: BORDER, borderRadius: 10,
          padding: '10px 10px 8px', display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <div style={{ fontFamily: MO, fontSize: 9, fontWeight: 700, color: GOLD, marginBottom: 4, flexShrink: 0, letterSpacing: '0.04em' }}>Max DD</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ddData} margin={{ top: 2, right: 2, left: -20, bottom: 0 }} barSize={16}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="n" tick={{ fontFamily: MO, fontSize: 7, fill: M as string }} axisLine={false} tickLine={false} />
                <YAxis domain={[-8, 0]} tick={{ fontFamily: NU, fontSize: 7, fill: M as string }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                <Tooltip contentStyle={TT} formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Max DD']} />
                <Bar dataKey="v" radius={[0, 0, 3, 3]}>
                  {ddData.map((_, i) => <Cell key={i} fill="rgba(201,168,76,0.40)" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* ── 6. Performance table (compact, flexShrink:0) ──────────────────── */}
      <div style={{
        background: SURFACE, border: BORDER, borderRadius: 10,
        overflow: 'hidden', flexShrink: 0,
      }}>
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
            {PERF.map(t => (
              <tr key={t.cap} style={{ transition: 'background 120ms' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={tdL}>{t.l}</td>
                <td style={td}>{t.cagr.toFixed(2)}%</td>
                <td style={td}>{t.oos.toFixed(2)}%</td>
                <td style={td}>{t.sh.toFixed(3)}</td>
                <td style={tdG}>−{t.dd.toFixed(2)}%</td>
                <td style={td}>{t.cal.toFixed(3)}</td>
                <td style={td}>{t.pf.toFixed(2)}</td>
                <td style={tdDim}>€{t.mar.toLocaleString('de-DE')}</td>
                <td style={tdDim}>{((t.mar / t.cap) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
