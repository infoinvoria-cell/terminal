"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  compoundGains,
  deserializeTrades,
  equityCurve,
  maxDrawdownPctFromEquity,
  type SerializedTrade,
  type TradeRow,
} from "@/lib/trades-analytics";

type QuantDashboardProps = {
  trades: SerializedTrade[];
};

const MODEL_NAMES = [
  "AlphaTrend",
  "MeanRev-X",
  "CarryPlus",
  "VolTarget",
] as const;

type ModelStatus = "Live" | "Testing" | "Inactive";

function sharpeScaled(gains: number[]): number {
  const n = gains.length;
  if (n < 3) return 0;
  const mean = gains.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(
    gains.reduce((a, g) => a + (g - mean) ** 2, 0) / (n - 1)
  );
  if (std < 1e-6) return 0;
  return (mean / std) * Math.sqrt(Math.min(n, 52));
}

function sortinoScaled(gains: number[], target = 0): number {
  const n = gains.length;
  if (n < 3) return 0;
  const mean = gains.reduce((a, b) => a + b, 0) / n;
  const downside = gains
    .map((g) => Math.min(0, g - target) ** 2)
    .reduce((a, b) => a + b, 0);
  const dstd = Math.sqrt(downside / Math.max(1, n - 1));
  if (dstd < 1e-6) return mean > target ? 6 : 0;
  return ((mean - target) / dstd) * Math.sqrt(Math.min(n, 52));
}

function equityFromGains(gains: number[]): number[] {
  let v = 100;
  const out: number[] = [];
  for (const g of gains) {
    v *= 1 + g / 100;
    out.push(v);
  }
  return out;
}

function modelSlice(rows: TradeRow[], k: number) {
  return rows.filter((_, i) => i % MODEL_NAMES.length === k).map((r) => r.gainPct);
}

function statusFor(k: number, sharpe: number): ModelStatus {
  if (k === 0) return "Live";
  if (k === 1) return "Testing";
  if (sharpe > 0.35) return "Testing";
  return "Inactive";
}

const card =
  "rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]";

export function QuantDashboard({ trades }: QuantDashboardProps) {
  const rows = useMemo(() => deserializeTrades(trades), [trades]);
  const gains = useMemo(() => rows.map((r) => r.gainPct), [rows]);

  const portfolioEq = useMemo(() => equityCurve(rows), [rows]);

  const models = useMemo(() => {
    return MODEL_NAMES.map((name, k) => {
      const g = modelSlice(rows, k);
      const n = g.length || 1;
      const winRate = (g.filter((x) => x >= 0).length / n) * 100;
      const eq = equityFromGains(g);
      const maxDd = maxDrawdownPctFromEquity(eq.length > 0 ? [100, ...eq] : [100]);
      const totalRet = compoundGains(g);
      const sharpe = sharpeScaled(g);
      const sortino = sortinoScaled(g);
      const expectancy = g.reduce((a, b) => a + b, 0) / n;
      const vol = Math.sqrt(
        g.reduce((a, x) => {
          const m = expectancy;
          return a + (x - m) ** 2;
        }, 0) / Math.max(1, n - 1)
      );
      const avgRr = g.reduce((a, x) => a + Math.abs(x), 0) / n;
      const hit = winRate;
      const stability = 1 / (1 + vol);
      const signalQuality = Math.max(0, Math.min(1, sharpe / 3)) * stability;
      const exposure = Math.min(1, n / Math.max(8, rows.length / 4));
      const annualizedReturn =
        n >= 3
          ? (Math.pow(1 + totalRet / 100, 252 / n) - 1) * 100
          : totalRet;
      return {
        name,
        status: statusFor(k, sharpe),
        sharpe,
        sortino,
        winRate,
        maxDd,
        totalRet,
        expectancy,
        annualizedReturn,
        signalCount: g.length,
        vol,
        avgRr,
        hit,
        stability,
        signalQuality,
        exposure,
        eq,
      };
    });
  }, [rows]);

  const equityCompare = useMemo(() => {
    const curves = models.map((m) => m.eq);
    const maxL = Math.max(...curves.map((c) => c.length), 1);
    const out: Record<string, number>[] = [];
    for (let i = 0; i < maxL; i++) {
      const row: Record<string, number> = { i };
      for (let k = 0; k < curves.length; k++) {
        const c = curves[k]!;
        const v = c.length ? c[Math.min(i, c.length - 1)]! : 100;
        row[`m${k}`] = (v / 100 - 1) * 100;
      }
      const bi = Math.min(i + 1, portfolioEq.length - 1);
      row.baseline = (portfolioEq[bi]! / 100 - 1) * 100;
      out.push(row);
    }
    return out;
  }, [models, portfolioEq]);

  const rollingSharpe = useMemo(() => {
    const w = 24;
    const out: { i: number; s: number }[] = [];
    for (let i = w; i < gains.length; i++) {
      const slice = gains.slice(i - w, i);
      out.push({ i: i - w, s: sharpeScaled(slice) });
    }
    return out.slice(-160);
  }, [gains]);

  const contribution = useMemo(() => {
    const totalAbs = models.reduce(
      (a, m) => a + Math.abs(m.totalRet),
      0
    ) || 1;
    return models.map((m) => ({
      name: m.name,
      pct: (m.totalRet / totalAbs) * 100,
    }));
  }, [models]);

  const regime = useMemo(() => {
    const abs = gains.map((g) => Math.abs(g));
    const med = [...abs].sort((a, b) => a - b)[Math.floor(abs.length / 2)] ?? 0;
    const hi = gains.filter((g, i) => abs[i]! >= med);
    const lo = gains.filter((g, i) => abs[i]! < med);
    const avgHi = hi.length ? hi.reduce((a, b) => a + b, 0) / hi.length : 0;
    const avgLo = lo.length ? lo.reduce((a, b) => a + b, 0) / lo.length : 0;
    return [
      { name: "High |g|", ret: avgHi },
      { name: "Low |g|", ret: avgLo },
    ];
  }, [gains]);

  const mean = gains.reduce((a, b) => a + b, 0) / (gains.length || 1);
  const volAll = Math.sqrt(
    gains.reduce((a, g) => a + (g - mean) ** 2, 0) / Math.max(1, gains.length - 1)
  );
  const expectancy =
    gains.reduce((a, g) => a + g, 0) / (gains.length || 1);
  const avgRr =
    gains.reduce((a, g) => a + Math.abs(g), 0) / (gains.length || 1);

  return (
    <div className="space-y-3 pb-4">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {models.map((m) => (
          <div key={m.name} className={`p-5 ${card}`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
                {m.name}
              </h3>
              <span
                className={
                  m.status === "Live"
                    ? "rounded-full border border-[#e2ca7a]/30 bg-[#e2ca7a]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#e2ca7a]"
                    : m.status === "Testing"
                      ? "rounded-full border border-zinc-600/40 bg-zinc-800/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300"
                      : "rounded-full border border-zinc-600/40 bg-zinc-800/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                }
              >
                {m.status}
              </span>
            </div>
            <dl className="mt-4 space-y-2 text-xs text-zinc-500">
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Sharpe</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {m.sharpe.toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Sortino</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {m.sortino.toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Win rate</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {m.winRate.toFixed(0)}%
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Max DD</dt>
                <dd className="text-sm font-semibold text-zinc-300 [font-family:var(--font-nunito),sans-serif]">
                  {m.maxDd.toFixed(1)}%
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Expectancy %</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {m.expectancy.toFixed(3)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Cumulative return</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {m.totalRet >= 0 ? "+" : ""}
                  {m.totalRet.toFixed(1)}%
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Ann. return (est.)</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {m.annualizedReturn >= 0 ? "+" : ""}
                  {m.annualizedReturn.toFixed(1)}%
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Signals</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {m.signalCount}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Exposure</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {(m.exposure * 100).toFixed(0)}%
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Volatility σ</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {m.vol.toFixed(3)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Avg |RR|</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {m.avgRr.toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Hit ratio</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {m.hit.toFixed(0)}%
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
                <dt>Stability</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {m.stability.toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Signal quality</dt>
                <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                  {(m.signalQuality * 100).toFixed(0)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div className={`p-5 ${card}`}>
        <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
          Model comparison
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="py-2 pr-4">Model</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Sharpe</th>
                <th className="py-2 pr-4">Sortino</th>
                <th className="py-2 pr-4">Win %</th>
                <th className="py-2 pr-4">Max DD</th>
                <th className="py-2 pr-4">Cumul. %</th>
                <th className="py-2 pr-4">Signals</th>
              </tr>
            </thead>
            <tbody className="[font-family:var(--font-nunito),sans-serif]">
              {models.map((m) => (
                <tr key={m.name} className="border-b border-white/[0.04] text-zinc-300">
                  <td className="py-2.5 pr-4 text-white">{m.name}</td>
                  <td className="py-2.5 pr-4 text-zinc-400">{m.status}</td>
                  <td className="py-2.5 pr-4">{m.sharpe.toFixed(2)}</td>
                  <td className="py-2.5 pr-4">{m.sortino.toFixed(2)}</td>
                  <td className="py-2.5 pr-4">{m.winRate.toFixed(0)}</td>
                  <td className="py-2.5 pr-4">{m.maxDd.toFixed(1)}</td>
                  <td className="py-2.5 pr-4">
                    {m.totalRet >= 0 ? "+" : ""}
                    {m.totalRet.toFixed(1)}
                  </td>
                  <td className="py-2.5 pr-4">{m.signalCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <div className={`p-5 lg:col-span-1 ${card}`}>
          <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Book metrics
          </h3>
          <dl className="mt-4 space-y-3 text-xs text-zinc-500">
            <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
              <dt>Expectancy / trade (%)</dt>
              <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                {expectancy.toFixed(3)}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-white/[0.05] pb-2">
              <dt>Volatility (σ)</dt>
              <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                {volAll.toFixed(3)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Avg |gain| (RR proxy)</dt>
              <dd className="text-sm font-semibold text-white [font-family:var(--font-nunito),sans-serif]">
                {avgRr.toFixed(2)}
              </dd>
            </div>
          </dl>
        </div>

        <div className={`p-5 lg:col-span-2 ${card}`}>
          <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Model contribution (normalized)
          </h3>
          <div className="mt-3 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contribution} margin={{ left: 0, right: 8, top: 4, bottom: 32 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8a8a8a", fontSize: 10 }} />
                <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={36} />
                <Tooltip
                  contentStyle={{
                    background: "#1c1d20",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="pct" fill="#64748b" maxBarSize={40} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={`p-5 ${card}`}>
        <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
          Model equity curves (cumulative %)
        </h3>
        <div className="mt-3 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={equityCompare} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={44} />
              <Tooltip
                contentStyle={{
                  background: "#1c1d20",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="baseline"
                name="Book"
                stroke="#94a3b8"
                dot={false}
                strokeWidth={1.4}
              />
              <Line
                type="monotone"
                dataKey="m0"
                name={MODEL_NAMES[0]}
                stroke="#e2e8f0"
                dot={false}
                strokeWidth={1.2}
              />
              <Line
                type="monotone"
                dataKey="m1"
                name={MODEL_NAMES[1]}
                stroke="#a1a1aa"
                dot={false}
                strokeWidth={1.2}
              />
              <Line
                type="monotone"
                dataKey="m2"
                name={MODEL_NAMES[2]}
                stroke="#71717a"
                dot={false}
                strokeWidth={1.2}
              />
              <Line
                type="monotone"
                dataKey="m3"
                name={MODEL_NAMES[3]}
                stroke="#52525b"
                dot={false}
                strokeWidth={1.2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <div className={`p-5 ${card}`}>
          <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Rolling Sharpe (24-trade window)
          </h3>
          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rollingSharpe} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="i" hide />
                <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={40} />
                <Tooltip
                  contentStyle={{
                    background: "#1c1d20",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="s"
                  stroke="#94a3b8"
                  fill="rgba(148,163,184,0.12)"
                  strokeWidth={1.25}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={`p-5 ${card}`}>
          <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Regime sensitivity
          </h3>
          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regime} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8a8a8a", fontSize: 10 }} />
                <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={40} />
                <Tooltip
                  contentStyle={{
                    background: "#1c1d20",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="ret" fill="#94a3b8" maxBarSize={48} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
