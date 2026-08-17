'use client';

import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import {
  CANONICAL, BACKTEST, ETF_WEIGHTS, GROSS_LONG_EXPOSURE, SHADOW_TIERS, DEFAULT_TIER_CAPITAL,
  FUTURES_OVERLAY, FINANCING, DATA_WARNINGS,
} from './coreInvestOverviewData';
import type { EquityPoint } from '@/lib/core-invest/overview/load-equity-curve';

// ─── Design tokens — duplicated verbatim from WhiteSwanFinal.tsx (structure/geometry only,
// NOT its data). Kept local to Core Invest, not imported, so White Swan is never touched. ───
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
const AX = { fontFamily: MO, fontSize: 8, fill: M };

function AssetChip({ ticker, label }: { ticker: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: 'rgba(180,192,210,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MO, fontSize: 5, fontWeight: 700, color: M }}>
        {ticker.slice(0, 2)}
      </div>
      <span style={{ fontFamily: MO, fontSize: 9, fontWeight: 600, color: P, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

function dateTick(d: string) { return d.slice(0, 4); }
const yearTicks = (curve: EquityPoint[]) => {
  const seen = new Set<string>();
  return curve.filter((p) => { const y = p.date.slice(0, 4); if (seen.has(y) || +y % 2 !== 0) return false; seen.add(y); return true; }).map((p) => p.date);
};

export function CoreInvestOverview({ equityCurve }: { equityCurve: EquityPoint[] | null }) {
  const selectedTier = SHADOW_TIERS.find((t) => t.capital === DEFAULT_TIER_CAPITAL)!;
  const loaded = !!equityCurve;

  const ratioData = [
    { n: 'Sharpe', v: BACKTEST.sharpe },
    { n: 'Sortino', v: BACKTEST.sortino },
    { n: 'Calmar', v: BACKTEST.calmar },
  ];
  const capitalBarData = SHADOW_TIERS.map((t) => ({ n: `€${t.capital / 1000}k`, etf: t.etfExecutedExposure, margin: t.modelMargin }));

  const tdBase: React.CSSProperties = { fontFamily: NU, fontSize: 10.5, color: P, textAlign: 'right', padding: '3px 10px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', borderBottom: `1px solid ${DIV_C}` };
  const tdL: React.CSSProperties = { ...tdBase, textAlign: 'left' };
  const tdG: React.CSSProperties = { ...tdBase, color: GOLD };
  const tdDim: React.CSSProperties = { ...tdBase, color: M };

  return (
    <div style={{ flex: 1, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '14px 24px 16px', background: BG, minWidth: 0, boxSizing: 'border-box' }}>

      {/* ── 1. Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontFamily: MO, fontSize: 20, fontWeight: 800, color: P, margin: 0, lineHeight: 1 }}>Core Invest</h1>
          <span style={{ fontFamily: MO, fontSize: 11, color: M, letterSpacing: '0.04em', lineHeight: 1 }}>{CANONICAL.strategyVersion}</span>
          <button
            onClick={() => { window.location.assign('/komponenten'); }}
            aria-label="Zurück zu Komponenten"
            title="Zurück zu Komponenten"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 5, cursor: 'pointer',
              fontFamily: MO, fontSize: 13, color: M, lineHeight: 1,
              border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
            }}
          >←</button>
          <div style={{ fontFamily: NU, fontSize: 11, fontWeight: 700, color: GOLD, background: 'rgba(201,168,76,0.09)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 5, padding: '2px 7px', lineHeight: 1.4, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
            €25k ref
          </div>
        </div>
        <div style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.08em', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 5, padding: '4px 8px' }}>
          Proposed Execution Spec
        </div>
      </div>

      {/* ── 2. KPI Row (real Core Invest metrics, backtest-labeled) ── */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 8, flexShrink: 0 }}>
        {[
          { label: 'REFERENCE TIER', value: '$25k', gold: false, accent: true },
          { label: 'CAGR (BT)', value: `${BACKTEST.cagr.toFixed(2)}%`, gold: false },
          { label: 'VOLATILITY', value: `${BACKTEST.volatility.toFixed(2)}%`, gold: false },
          { label: 'SHARPE', value: BACKTEST.sharpe.toFixed(3), gold: false },
          { label: 'SORTINO', value: BACKTEST.sortino.toFixed(3), gold: false },
          { label: 'MAX DD', value: `${BACKTEST.maxDD.toFixed(2)}%`, gold: true },
          { label: 'CALMAR', value: BACKTEST.calmar.toFixed(3), gold: false },
          { label: 'ETF GROSS', value: `${(GROSS_LONG_EXPOSURE * 100).toFixed(0)}%`, gold: false },
          { label: 'MODEL MARGIN', value: `$${selectedTier.modelMargin}`, gold: false },
          { label: 'MODEL RESERVE', value: `$${selectedTier.proposedReserve.toLocaleString('en-US')}`, gold: false },
        ].map((k) => (
          <div key={k.label} style={{ flex: 1, background: KPI_BG, border: BORDER, borderRadius: 10, padding: '9px 10px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 64, boxSizing: 'border-box' }}>
            <div style={{ fontFamily: MO, fontSize: k.accent ? 6.5 : 8, fontWeight: 700, color: k.accent ? GOLD : M, textTransform: 'uppercase', letterSpacing: k.accent ? '0.05em' : '0.07em', lineHeight: 1, whiteSpace: 'nowrap' }}>{k.label}</div>
            <div style={{ fontFamily: NU, fontSize: 16, fontWeight: 700, color: k.gold ? GOLD : P, fontVariantNumeric: 'tabular-nums', lineHeight: 1, whiteSpace: 'nowrap' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── 2b. Evidence-state strip ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '6px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {DATA_WARNINGS.map((w) => (
          <div key={w.label} title={w.detail} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: MO, fontSize: 7, color: M, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{w.label}</span>
            <span style={{ fontFamily: NU, fontSize: 10.5, fontWeight: 700, color: GOLD }}>{w.value}</span>
          </div>
        ))}
      </div>

      {/* ── 3. Component box (grouped, no extra heading) ── */}
      <div style={{ background: SURFACE, border: BORDER, borderRadius: 10, padding: '9px 14px', display: 'flex', alignItems: 'stretch', marginBottom: 8, flexShrink: 0, flexWrap: 'wrap', gap: 14 }}>
        <div style={{ flexShrink: 0, paddingRight: 14 }}>
          <div style={{ fontFamily: MO, fontSize: 6.5, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>Core / Beta</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <AssetChip ticker="SPY" label="SPY 56%" />
            <AssetChip ticker="QQQ" label="QQQ 28%" />
          </div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch', flexShrink: 0 }} />
        <div style={{ flexShrink: 0, paddingRight: 14 }}>
          <div style={{ fontFamily: MO, fontSize: 6.5, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>Factor / Equity Sleeves</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: '4px 16px' }}>
            {ETF_WEIGHTS.slice(2).map((e) => <AssetChip key={e.symbol} ticker={e.symbol} label={`${e.symbol} ${(e.weight * 100).toFixed(1)}%`} />)}
          </div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch', flexShrink: 0 }} />
        <div style={{ flexShrink: 0, paddingRight: 14 }}>
          <div style={{ fontFamily: MO, fontSize: 6.5, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>Futures Overlay</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <AssetChip ticker="MJY" label={`MJY × ${Math.abs(selectedTier.futureQty)}`} />
            <span style={{ fontFamily: MO, fontSize: 7, color: M }}>1 of 12 active</span>
          </div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch', flexShrink: 0 }} />
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: MO, fontSize: 6.5, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>Financing</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontFamily: NU, fontSize: 9, color: P }}>Model −40% · not a live order</span>
            <span style={{ fontFamily: MO, fontSize: 7, color: GOLD }}>Real broker mechanism: EXTERNAL_REQUIRED</span>
          </div>
        </div>
      </div>

      {/* ── 4. Chart grid (3fr / 2fr, matching White Swan geometry) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10, flex: 1, minHeight: 0, marginBottom: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, background: SURFACE, border: BORDER, borderRadius: 10, padding: '8px 10px 4px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3, flexShrink: 0 }}>
              <span style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Performance</span>
              <span style={{ fontFamily: MO, fontSize: 7, color: M }}>Genuine backtest NAV index</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {!loaded || !equityCurve ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: MO, fontSize: 8, color: M, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Equity curve unavailable</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityCurve} margin={{ top: 2, right: 4, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="date" ticks={yearTicks(equityCurve)} tickFormatter={dateTick} tick={AX} axisLine={{ stroke: 'rgba(255,255,255,0.16)' }} tickLine={false} />
                    <YAxis tick={AX} axisLine={false} tickLine={false} width={40} />
                    <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #222', fontSize: 10, fontFamily: MO }} />
                    <Line dataKey="navIndex" stroke={P} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, background: SURFACE, border: BORDER, borderRadius: 10, padding: '8px 10px 4px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3, flexShrink: 0 }}>
              <span style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Drawdown</span>
              <span style={{ fontFamily: MO, fontSize: 7, color: M }}>Genuine underwater curve</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {!loaded || !equityCurve ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: MO, fontSize: 8, color: M, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Drawdown series unavailable</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityCurve} margin={{ top: 2, right: 4, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="date" ticks={yearTicks(equityCurve)} tickFormatter={dateTick} tick={AX} axisLine={{ stroke: 'rgba(255,255,255,0.16)' }} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={AX} axisLine={false} tickLine={false} width={38} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
                    <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #222', fontSize: 10, fontFamily: MO }} />
                    <Line dataKey="drawdownPct" stroke={GOLD} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, background: SURFACE, border: BORDER, borderRadius: 10, padding: '8px 10px 4px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3, flexShrink: 0 }}>
              <span style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ratios</span>
              <span style={{ fontFamily: MO, fontSize: 7, color: M }}>Sharpe / Sortino / Calmar — DGS3MO methodology</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ratioData} margin={{ top: 2, right: 6, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="n" tick={AX} axisLine={{ stroke: 'rgba(255,255,255,0.16)' }} tickLine={false} />
                  <YAxis tick={AX} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #222', fontSize: 10, fontFamily: MO }} />
                  <Bar dataKey="v" fill={GOLD} radius={[2, 2, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, background: SURFACE, border: BORDER, borderRadius: 10, padding: '8px 10px 4px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3, flexShrink: 0 }}>
              <span style={{ fontFamily: MO, fontSize: 8, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Exposure by Capital</span>
              <span style={{ fontFamily: MO, fontSize: 7, color: M }}>Shadow Engine, model</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={capitalBarData} margin={{ top: 2, right: 6, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="n" tick={AX} axisLine={{ stroke: 'rgba(255,255,255,0.16)' }} tickLine={false} />
                  <YAxis tick={AX} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #222', fontSize: 10, fontFamily: MO }} />
                  <Bar dataKey="etf" fill="rgba(240,242,246,0.55)" radius={[2, 2, 0, 0]} maxBarSize={16} />
                  <Bar dataKey="margin" fill={GOLD} radius={[2, 2, 0, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Table ── */}
      <div style={{ background: SURFACE, border: BORDER, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Capital', 'ETF Exposure', 'Gross %', 'Financing', 'Future', 'Qty', 'Notional', 'Distortion', 'Model Margin', 'Reserve', 'Free Liquidity', 'Status'].map((h, i) => (
                  <th key={h} style={{ fontFamily: MO, fontSize: 7, fontWeight: 700, color: M, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i === 0 || i === 4 ? 'left' : 'right', padding: '6px 10px', borderBottom: `1px solid ${DIV_C}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHADOW_TIERS.map((t) => {
                const isRef = t.capital === DEFAULT_TIER_CAPITAL;
                return (
                  <tr key={t.capital} style={isRef ? { background: 'rgba(201,168,76,0.05)' } : undefined}>
                    <td style={isRef ? tdG : tdL}>${t.capital.toLocaleString('en-US')}{isRef && ' · ref'}</td>
                    <td style={tdBase}>${t.etfExecutedExposure.toLocaleString('en-US')}</td>
                    <td style={tdDim}>{((t.etfExecutedExposure / t.capital) * 100).toFixed(1)}%</td>
                    <td style={tdDim}>${t.modelFinancing.toLocaleString('en-US')}</td>
                    <td style={tdL}>{t.future}</td>
                    <td style={tdBase}>{t.futureQty}</td>
                    <td style={tdDim}>${t.futureNotional.toLocaleString('en-US')}</td>
                    <td style={t.futureDistortionPct > 10 ? tdG : tdDim}>{t.futureDistortionPct.toFixed(2)}%</td>
                    <td style={tdDim}>${t.modelMargin.toLocaleString('en-US')}</td>
                    <td style={tdDim}>${t.proposedReserve.toLocaleString('en-US')}</td>
                    <td style={tdG}>${t.freeLiquidity.toLocaleString('en-US')}</td>
                    <td style={t.status === 'CLEAN' ? tdDim : tdG}>{t.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '6px 12px', fontFamily: MO, fontSize: 7, color: M }}>
          {FUTURES_OVERLAY.mjyVs6j}
        </div>
      </div>
    </div>
  );
}
