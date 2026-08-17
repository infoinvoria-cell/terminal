'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  CANONICAL, BACKTEST, ETF_WEIGHTS, GROSS_LONG_EXPOSURE, SHADOW_TIERS, DEFAULT_TIER_CAPITAL,
  FUTURES_OVERLAY, FINANCING, DATA_WARNINGS,
} from './coreInvestOverviewData';
import type { EquityPoint } from '@/lib/core-invest/overview/load-equity-curve';

const GOLD = '#d4a843';
const GRID = '#141414';
const AXIS = '#3a3a3a';

const eur = (n: number) => `$${n.toLocaleString('en-US')}`;
const pct = (n: number, d = 2) => `${n.toFixed(d)}%`;

function Kpi({ label, value, gold = false }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="border border-[#141414] px-4 py-3">
      <div className="text-[9px] font-mono uppercase tracking-widest text-[#555]">{label}</div>
      <div className={`mt-1 text-[19px] font-mono font-semibold ${gold ? 'text-[#d4a843]' : 'text-[#e5e5e5]'}`}>{value}</div>
    </div>
  );
}

function StatusTag({ text, tone = 'gray' }: { text: string; tone?: 'gray' | 'gold' }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[9.5px] font-mono uppercase tracking-wide ${tone === 'gold' ? 'border-[#d4a843]/40 text-[#d4a843]' : 'border-[#333] text-[#777]'}`}>
      {text}
    </span>
  );
}

export function CoreInvestOverview({ equityCurve }: { equityCurve: EquityPoint[] | null }) {
  const [selectedCapital, setSelectedCapital] = useState(DEFAULT_TIER_CAPITAL);
  const selectedTier = SHADOW_TIERS.find((t) => t.capital === selectedCapital)!;

  const capitalChartData = useMemo(
    () => SHADOW_TIERS.map((t) => ({ label: `${t.capital / 1000}k`, etf: t.etfExecutedExposure, financing: t.modelFinancing, margin: t.modelMargin })),
    []
  );

  return (
    <div className="min-h-screen bg-[#020202] text-[#c0c0c0] font-mono">
      <div className="mx-auto max-w-[1500px] px-8 py-8">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-[#141414] pb-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/komponenten" className="flex items-center gap-1.5 text-[11px] text-[#555] hover:text-[#c0c0c0] transition">
              <ArrowLeft size={13} /> Komponenten
            </Link>
            <div className="h-4 w-px bg-[#222]" />
            <div className="flex items-baseline gap-3">
              <h1 className="text-[22px] font-semibold tracking-tight text-neutral-50">Core Invest</h1>
              <span className="text-[13px] text-[#777]">{CANONICAL.strategyVersion}</span>
            </div>
          </div>
          <StatusTag text="Proposed Execution Spec" tone="gold" />
        </div>

        {/* TOP KPI ROW — backtest */}
        <section className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
          <Kpi label="CAGR (Backtest)" value={pct(BACKTEST.cagr)} />
          <Kpi label="Volatility" value={pct(BACKTEST.volatility)} />
          <Kpi label="Sharpe" value={BACKTEST.sharpe.toFixed(3)} />
          <Kpi label="Sortino" value={BACKTEST.sortino.toFixed(3)} />
          <Kpi label="Max Drawdown" value={pct(BACKTEST.maxDD)} gold />
          <Kpi label="Calmar" value={BACKTEST.calmar.toFixed(3)} />
        </section>
        <p className="text-[10px] text-[#444] mb-8">
          Backtest period {BACKTEST.period}. Sharpe/Sortino use a DGS3MO time-varying risk-free rate (proven via independent reconstruction), not rf=0.
        </p>

        {/* CORE — compact */}
        <div className="border border-[#141414] mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#141414]">
            <div className="px-4 py-2.5 flex items-center justify-between"><span className="text-[9px] uppercase tracking-widest text-[#555]">ETF Sleeve</span><span className="text-[12px] text-[#e5e5e5]">8 factor ETFs, {(GROSS_LONG_EXPOSURE * 100).toFixed(0)}% gross</span></div>
            <div className="px-4 py-2.5 flex items-center justify-between"><span className="text-[9px] uppercase tracking-widest text-[#555]">Financing</span><span className="text-[12px] text-[#e5e5e5]">Model proxy, −40%</span></div>
            <div className="px-4 py-2.5 flex items-center justify-between"><span className="text-[9px] uppercase tracking-widest text-[#555]">Futures Overlay</span><span className="text-[12px] text-[#e5e5e5]">JPY (MJY), 1 of 12 active</span></div>
            <div className="px-4 py-2.5 flex items-center justify-between"><span className="text-[9px] uppercase tracking-widest text-[#555]">Base Currency</span><span className="text-[12px] text-[#e5e5e5]">{CANONICAL.baseCurrency}</span></div>
          </div>
        </div>

        {/* CHART GRID — 60/40-ish */}
        <div className="grid lg:grid-cols-5 gap-2 mb-8">
          <div className="lg:col-span-3 space-y-2">
            <div className="border border-[#141414] p-4">
              <div className="text-[9px] uppercase tracking-widest text-[#555] mb-2">Portfolio NAV — Genuine Historical Index (Backtest)</div>
              {equityCurve ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={equityCurve} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#555' }} axisLine={{ stroke: AXIS }} tickLine={false} minTickGap={80} />
                    <YAxis tick={{ fontSize: 9, fill: '#555' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip formatter={(v: unknown) => [Number(v ?? 0).toFixed(1), 'NAV Index'] as [string, string]} contentStyle={{ background: '#0a0a0a', border: '1px solid #222', fontSize: 11, fontFamily: 'monospace' }} />
                    <Area type="monotone" dataKey="navIndex" stroke="#c0c0c0" fill="#c0c0c0" fillOpacity={0.06} strokeWidth={1.3} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-[11px] text-[#444]">Equity curve unavailable — no synthetic series shown</div>
              )}
            </div>
            <div className="border border-[#141414] p-4">
              <div className="text-[9px] uppercase tracking-widest text-[#555] mb-2">Underwater Drawdown — Genuine Historical Series</div>
              {equityCurve ? (
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={equityCurve} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#555' }} axisLine={{ stroke: AXIS }} tickLine={false} minTickGap={80} />
                    <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 9, fill: '#555' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip formatter={(v: unknown) => [`${Number(v ?? 0).toFixed(2)}%`, 'Drawdown'] as [string, string]} contentStyle={{ background: '#0a0a0a', border: '1px solid #222', fontSize: 11, fontFamily: 'monospace' }} />
                    <Area type="monotone" dataKey="drawdownPct" stroke={GOLD} fill={GOLD} fillOpacity={0.10} strokeWidth={1.3} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[140px] flex items-center justify-center text-[11px] text-[#444]">Drawdown series unavailable</div>
              )}
            </div>
          </div>
          <div className="lg:col-span-2 space-y-2">
            <div className="border border-[#141414] p-4">
              <div className="text-[9px] uppercase tracking-widest text-[#555] mb-2">ETF Sleeve Composition (target weights)</div>
              <div className="space-y-1.5">
                {ETF_WEIGHTS.map((e) => (
                  <div key={e.symbol} className="flex items-center justify-between text-[11px]">
                    <span className="text-[#999]">{e.symbol} <span className="text-[#444]">{e.name}</span></span>
                    <span className="text-[#e5e5e5]">{pct(e.weight * 100, 1)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-[#141414] p-4">
              <div className="text-[9px] uppercase tracking-widest text-[#555] mb-2">Capital-Tier Exposure (Shadow, Model)</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={capitalChartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#555' }} axisLine={{ stroke: AXIS }} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#555' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #222', fontSize: 11, fontFamily: 'monospace' }} />
                  <Bar dataKey="etf" name="ETF Exposure" fill="#8a8a8a" radius={[2, 2, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="margin" name="Model Margin" fill={GOLD} radius={[2, 2, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-1 text-[9.5px] text-[#444]">Grey = ETF exposure ($). Gold = model futures margin ($). Not on the same axis as %.</div>
            </div>
          </div>
        </div>

        {/* CAPITAL TIER TABLE */}
        <div className="text-[10px] uppercase tracking-widest text-[#555] mb-2">Capital Tiers — Shadow Engine (Proposed, Not Canonical)</div>
        <div className="border border-[#141414] mb-8 overflow-x-auto">
          <table className="w-full text-[11.5px] border-collapse">
            <thead>
              <tr className="text-[#555] text-[9px] uppercase tracking-widest border-b border-[#141414]">
                <th className="text-left font-normal px-3 py-2">Capital</th>
                <th className="text-right font-normal px-3 py-2">ETF Exposure</th>
                <th className="text-right font-normal px-3 py-2">Gross %</th>
                <th className="text-right font-normal px-3 py-2">Financing</th>
                <th className="text-left font-normal px-3 py-2">Future</th>
                <th className="text-right font-normal px-3 py-2">Qty</th>
                <th className="text-right font-normal px-3 py-2">Notional</th>
                <th className="text-right font-normal px-3 py-2">Distortion</th>
                <th className="text-right font-normal px-3 py-2">Model Margin</th>
                <th className="text-right font-normal px-3 py-2">Reserve</th>
                <th className="text-right font-normal px-3 py-2">Free Liquidity</th>
                <th className="text-left font-normal px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {SHADOW_TIERS.map((t) => (
                <tr
                  key={t.capital}
                  onClick={() => setSelectedCapital(t.capital)}
                  className={`border-t border-[#0e0e0e] cursor-pointer transition ${selectedCapital === t.capital ? 'bg-[#d4a843]/[0.04]' : 'hover:bg-[#0a0a0a]'} ${t.capital === DEFAULT_TIER_CAPITAL ? 'border-l-2 border-l-[#d4a843]' : ''}`}
                >
                  <td className="px-3 py-2 text-[#e5e5e5]">{eur(t.capital)}{t.capital === DEFAULT_TIER_CAPITAL && <span className="ml-1.5 text-[9px] text-[#d4a843]">ref</span>}</td>
                  <td className="px-3 py-2 text-right text-[#e5e5e5]">{eur(t.etfExecutedExposure)}</td>
                  <td className="px-3 py-2 text-right text-[#777]">{pct((t.etfExecutedExposure / t.capital) * 100, 1)}</td>
                  <td className="px-3 py-2 text-right text-[#777]">{eur(t.modelFinancing)}</td>
                  <td className="px-3 py-2 text-[#999]">{t.future}</td>
                  <td className="px-3 py-2 text-right text-[#e5e5e5]">{t.futureQty}</td>
                  <td className="px-3 py-2 text-right text-[#777]">{eur(t.futureNotional)}</td>
                  <td className={`px-3 py-2 text-right ${t.futureDistortionPct > 10 ? 'text-[#d4a843]' : 'text-[#777]'}`}>{pct(t.futureDistortionPct, 2)}</td>
                  <td className="px-3 py-2 text-right text-[#777]">{eur(t.modelMargin)}</td>
                  <td className="px-3 py-2 text-right text-[#777]">{eur(t.proposedReserve)}</td>
                  <td className="px-3 py-2 text-right text-[#d4a843]">{eur(t.freeLiquidity)}</td>
                  <td className="px-3 py-2 text-[10.5px]">
                    <span className={t.status === 'CLEAN' ? 'text-[#999]' : 'text-[#d4a843]'}>{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2.5 border-t border-[#141414] text-[10.5px] text-[#555]">
            Selected: {eur(selectedTier.capital)} — {selectedTier.future} × {Math.abs(selectedTier.futureQty)}, model margin {eur(selectedTier.modelMargin)}, reserve {eur(selectedTier.proposedReserve)}. All figures MODEL/SHADOW, not broker-confirmed.
          </div>
        </div>

        {/* FUTURES / FINANCING NOTES */}
        <div className="grid md:grid-cols-2 gap-2 mb-8">
          <div className="border border-[#141414] p-4">
            <div className="text-[9px] uppercase tracking-widest text-[#555] mb-2">Futures Overlay</div>
            <p className="text-[11px] text-[#999] leading-relaxed mb-1">{FUTURES_OVERLAY.purpose}</p>
            <p className="text-[10.5px] text-[#555]">{FUTURES_OVERLAY.mjyVs6j}</p>
          </div>
          <div className="border border-[#141414] p-4">
            <div className="text-[9px] uppercase tracking-widest text-[#555] mb-2">Financing</div>
            <p className="text-[11px] text-[#999] leading-relaxed mb-1">{FINANCING.mechanism}</p>
            <div className="flex gap-4 text-[10.5px] text-[#555] mt-2">
              <span>Base spread {pct(FINANCING.baseSpread, 1)}</span>
              <span>2× stress {pct(FINANCING.stressSpread2x, 1)}</span>
              <span>Real broker mechanism: <span className="text-[#d4a843]">{FINANCING.realBrokerMechanism}</span></span>
            </div>
          </div>
        </div>

        {/* DATA WARNINGS — compact */}
        <div className="border-t border-[#141414] pt-3 pb-8 flex flex-wrap gap-x-8 gap-y-2 text-[10px]">
          {DATA_WARNINGS.map((w) => (
            <span key={w.label} title={w.detail} className="text-[#555]">
              <span className="uppercase tracking-wide">{w.label}</span>: <span className="text-[#d4a843]">{w.value}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
