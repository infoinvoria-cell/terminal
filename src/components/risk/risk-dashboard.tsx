"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
} from "@/lib/trades-analytics";

type RiskDashboardProps = {
  trades: SerializedTrade[];
};

const WIN_FILL = "#e2e8f0";
const LOSS_FILL = "#3f3f46";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] p-4 shadow-[0_16px_32px_-14px_rgba(0,0,0,0.55)]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
        {label}
      </p>
      <p className="mt-2 text-lg font-bold text-white [font-family:var(--font-nunito),sans-serif]">
        {value}
      </p>
    </div>
  );
}

export function RiskDashboard({ trades }: RiskDashboardProps) {
  const rows = useMemo(() => deserializeTrades(trades), [trades]);

  const stats = useMemo(() => {
    const gains = rows.map((r) => r.gainPct);
    const n = gains.length || 1;
    const wins = gains.filter((g) => g >= 0);
    const losses = gains.filter((g) => g < 0);
    const winRate = (wins.length / n) * 100;
    const sumW = wins.reduce((a, b) => a + b, 0);
    const sumL = losses.reduce((a, b) => a + b, 0);
    const profitFactor =
      sumL !== 0 ? sumW / Math.abs(sumL) : wins.length ? 99 : 0;
    const eq = equityCurve(rows);
    const maxDd = maxDrawdownPctFromEquity(eq);
    const totalRet = compoundGains(gains);
    const recoveryFactor = maxDd > 0 ? totalRet / maxDd : 0;
    const best = gains.length ? Math.max(...gains) : 0;
    const worst = gains.length ? Math.min(...gains) : 0;
    let cl = 0;
    let cw = 0;
    let maxCl = 0;
    let maxCw = 0;
    for (const g of gains) {
      if (g < 0) {
        cl += 1;
        cw = 0;
        maxCl = Math.max(maxCl, cl);
      } else {
        cw += 1;
        cl = 0;
        maxCw = Math.max(maxCw, cw);
      }
    }
    const avgWin = wins.length ? sumW / wins.length : 0;
    const avgLoss = losses.length ? sumL / losses.length : 0;
    const ddSeries = (() => {
      let peak = eq[0] ?? 100;
      const out: number[] = [];
      for (const v of eq) {
        peak = Math.max(peak, v);
        out.push(peak > 0 ? ((peak - v) / peak) * 100 : 0);
      }
      return out.filter((d) => d > 0);
    })();
    const avgDd =
      ddSeries.length > 0
        ? ddSeries.reduce((a, b) => a + b, 0) / ddSeries.length
        : 0;
    const avgRisk =
      gains.reduce((a, g) => a + Math.abs(g), 0) / n;
    return {
      winRate,
      wins: wins.length,
      losses: losses.length,
      avgWin,
      avgLoss,
      best,
      worst,
      maxCl,
      maxCw,
      maxDd,
      avgDd,
      profitFactor,
      recoveryFactor,
      avgRisk,
    };
  }, [rows]);

  const equitySeries = useMemo(() => {
    const eq = equityCurve(rows);
    return eq.map((v, i) => ({ i, equity: v }));
  }, [rows]);

  const riskPerTrade = useMemo(() => {
    const slice = rows.slice(-48);
    return slice.map((r, idx) => ({
      name: `${idx + 1}`,
      risk: Math.abs(r.gainPct),
      raw: r.gainPct,
    }));
  }, [rows]);

  const winLoss = useMemo(() => {
    return [
      { name: "Wins", value: stats.wins, fill: WIN_FILL },
      { name: "Losses", value: stats.losses, fill: LOSS_FILL },
    ];
  }, [stats.wins, stats.losses]);

  const volSeries = useMemo(() => {
    const window = 15;
    const out: { name: string; vol: number }[] = [];
    for (let i = window; i < rows.length; i++) {
      const slice = rows.slice(i - window, i).map((r) => r.gainPct);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const v = Math.sqrt(
        slice.reduce((a, g) => a + (g - mean) ** 2, 0) / slice.length
      );
      out.push({ name: `${i}`, vol: v });
    }
    return out.slice(-100);
  }, [rows]);

  const hist = useMemo(() => {
    const bins = [
      { lo: -10, hi: -5, label: "<-5" },
      { lo: -5, hi: -2, label: "-5–-2" },
      { lo: -2, hi: -0.5, label: "-2–-0.5" },
      { lo: -0.5, hi: 0, label: "-0.5–0" },
      { lo: 0, hi: 0.5, label: "0–0.5" },
      { lo: 0.5, hi: 2, label: "0.5–2" },
      { lo: 2, hi: 5, label: "2–5" },
      { lo: 5, hi: Number.POSITIVE_INFINITY, label: ">5" },
    ];
    return bins.map((b) => ({
      name: b.label,
      count: rows.filter(
        (r) => r.gainPct >= b.lo && r.gainPct < b.hi
      ).length,
    }));
  }, [rows]);

  const heatmap = useMemo(() => {
    const grid: { x: string; y: string; v: number; t: number }[] = [];
    const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    for (let m = 0; m < 12; m++) {
      for (let d = 0; d < 7; d++) {
        const cell = rows.filter(
          (r) => r.date.getMonth() === m && r.date.getDay() === d
        );
        const avg =
          cell.length > 0
            ? cell.reduce((a, r) => a + r.gainPct, 0) / cell.length
            : 0;
        grid.push({
          x: `${m + 1}`,
          y: days[d] ?? `${d}`,
          v: avg,
          t: cell.length,
        });
      }
    }
    return grid;
  }, [rows]);

  const heatColors = (v: number) => {
    if (v > 0.4) return "rgba(226,232,240,0.35)";
    if (v < -0.4) return "rgba(63,63,70,0.85)";
    return "rgba(82,82,91,0.4)";
  };

  const card = "rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] p-5 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]";

  return (
    <div className="space-y-3 pb-4">
      <div className="grid gap-2 lg:grid-cols-4">
        <StatCard label="Max drawdown" value={`${stats.maxDd.toFixed(2)}%`} />
        <StatCard label="Avg drawdown" value={`${stats.avgDd.toFixed(2)}%`} />
        <StatCard
          label="Recovery factor"
          value={stats.recoveryFactor.toFixed(2)}
        />
        <StatCard
          label="Profit factor"
          value={stats.profitFactor.toFixed(2)}
        />
        <StatCard
          label="Avg risk / trade"
          value={`${stats.avgRisk.toFixed(2)}%`}
        />
        <StatCard label="Best trade" value={`+${stats.best.toFixed(2)}%`} />
        <StatCard label="Worst trade" value={`${stats.worst.toFixed(2)}%`} />
        <StatCard
          label="Consecutive wins (max)"
          value={String(stats.maxCw)}
        />
        <StatCard
          label="Consecutive losses (max)"
          value={String(stats.maxCl)}
        />
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <div className={`${card} flex flex-col`}>
          <h3 className="shrink-0 text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Equity &amp; drawdown
          </h3>
          <div className="mt-2 min-h-0 flex-1" style={{ height: 268 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equitySeries} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="eqFillRisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e2e8f0" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#e2e8f0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="i" hide />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#8a8a8a", fontSize: 10 }}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1c1d20",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#e2e8f0"
                  fill="url(#eqFillRisk)"
                  strokeWidth={1.25}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`${card} flex flex-col`}>
          <h3 className="shrink-0 text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Risk per trade (|Gain %|)
          </h3>
          <div className="mt-2 min-h-0 flex-1" style={{ height: 268 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskPerTrade} margin={{ left: 0, right: 8, top: 4, bottom: 0 }} barCategoryGap="12%">
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8a8a8a", fontSize: 9 }} interval={4} />
                <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={36} domain={[0, "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "#1c1d20",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="risk" maxBarSize={10} radius={[2, 2, 0, 0]}>
                  {riskPerTrade.map((e, i) => (
                    <Cell
                      key={i}
                      fill={e.raw >= 0 ? "rgba(226,232,240,0.55)" : "rgba(100,116,139,0.55)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <div className={`${card}`}>
          <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Win / Loss
          </h3>
          <div className="relative mt-2" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={winLoss}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={72}
                  outerRadius={96}
                  stroke="none"
                  paddingAngle={1.5}
                >
                  {winLoss.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
                Win rate
              </p>
              <p className="text-3xl font-bold text-white [font-family:var(--font-nunito),sans-serif]">
                {stats.winRate.toFixed(0)}%
              </p>
              <p className="mt-2 text-center text-[10px] leading-relaxed text-zinc-500">
                Wins {stats.wins} · Losses {stats.losses}
                <br />
                Avg win {stats.avgWin.toFixed(2)}% · Avg loss{" "}
                {stats.avgLoss.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        <div className={`${card} flex flex-col`}>
          <h3 className="shrink-0 text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Gain distribution
          </h3>
          <div className="mt-3 min-h-0 flex-1" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hist} margin={{ left: 0, right: 8, top: 4, bottom: 24 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#8a8a8a", fontSize: 9 }}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={48}
                />
                <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} allowDecimals={false} width={32} />
                <Tooltip
                  contentStyle={{
                    background: "#1c1d20",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="count" fill="#94a3b8" maxBarSize={28} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
          Rolling volatility (15-trade)
        </h3>
        <div className="mt-3" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={volSeries} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="name" hide />
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
                dataKey="vol"
                stroke="#94a3b8"
                fill="rgba(148,163,184,0.12)"
                strokeWidth={1.25}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
          Activity heatmap
        </h3>
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-[520px] flex-col gap-1">
            <div className="flex gap-1">
              <div className="w-14 shrink-0" />
              {Array.from({ length: 12 }, (_, m) => (
                <div
                  key={m}
                  className="w-9 shrink-0 text-center text-[10px] font-semibold text-zinc-500"
                >
                  {m + 1}
                </div>
              ))}
            </div>
            {["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"].map((d) => (
              <div key={d} className="flex gap-1">
                <div className="w-14 shrink-0 pr-1 text-right text-[10px] font-semibold text-zinc-500">
                  {d}
                </div>
                {Array.from({ length: 12 }, (_, m) => {
                  const cell = heatmap.find(
                    (c) => c.y === d && c.x === `${m + 1}`
                  );
                  const v = cell?.v ?? 0;
                  return (
                    <div
                      key={`${d}-${m}`}
                      title={`n=${cell?.t ?? 0} avg=${v.toFixed(2)}%`}
                      className="h-8 w-9 shrink-0 rounded-md border border-white/[0.05]"
                      style={{ backgroundColor: heatColors(v) }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
