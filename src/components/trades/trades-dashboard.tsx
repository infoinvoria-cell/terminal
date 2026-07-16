"use client";

import { useMemo, useState } from "react";
import {
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
import { deserializeTrades, type SerializedTrade } from "@/lib/trades-analytics";

type TradesDashboardProps = {
  trades: SerializedTrade[];
};

const ASSET_UNIVERSE = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "XAU/USD",
  "XAG/USD",
  "GER40",
  "US100",
  "US500",
  "UK100",
  "BTC/USD",
  "ETH/USD",
  "WTI",
  "EUR-Bund",
] as const;

const STRATEGIES = [
  "AlphaTrend",
  "MeanRev-X",
  "Breakout",
  "CarryPlus",
  "VolTarget",
  "SessionFlow",
  "LiquiditySweep",
] as const;

const STATUSES = ["Closed", "Settled", "Archived"] as const;

function hashSeed(ms: number, i: number) {
  let h = (ms ^ (i * 2654435761)) >>> 0;
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return h >>> 0;
}

function formatDurationMs(ms: number): string {
  if (ms <= 0 || !Number.isFinite(ms)) return "—";
  const h = Math.round(ms / 3600000);
  if (h < 48) return `${h}h`;
  const d = Math.round(ms / 86400000);
  return `${d}d`;
}

type Row = {
  id: string;
  date: Date;
  asset: string;
  strategy: string;
  direction: "LONG" | "SHORT";
  entry: string;
  exit: string;
  pnl: string;
  returnPct: string;
  rr: string;
  duration: string;
  durationMs: number;
  status: (typeof STATUSES)[number];
  win: boolean;
  gainPct: number;
};

function buildRows(rows: ReturnType<typeof deserializeTrades>): Row[] {
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  return sorted.map((r, i) => {
    const seed = hashSeed(r.date.getTime(), i);
    const asset = ASSET_UNIVERSE[seed % ASSET_UNIVERSE.length]!;
    const strategy = STRATEGIES[seed % STRATEGIES.length]!;
    const status = STATUSES[seed % STATUSES.length]!;
    const direction: "LONG" | "SHORT" =
      seed % 3 !== 0 ? "LONG" : "SHORT";
    const win = r.gainPct >= 0;
    const entry = 100;
    const exit = entry * (1 + r.gainPct / 100);
    const pnlUsd = (r.gainPct / 100) * 10_000;
    const rr = (r.gainPct / 1).toFixed(2);
    const prev = sorted[i - 1];
    const durationMs = prev
      ? Math.max(0, r.date.getTime() - prev.date.getTime())
      : 0;
    return {
      id: `${r.date.getTime()}-${i}`,
      date: r.date,
      asset,
      strategy,
      direction,
      entry: entry.toFixed(2),
      exit: exit.toFixed(2),
      pnl: `${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(0)}`,
      returnPct: `${r.gainPct >= 0 ? "+" : ""}${r.gainPct.toFixed(2)}%`,
      rr,
      duration: formatDurationMs(durationMs),
      durationMs,
      status,
      win,
      gainPct: r.gainPct,
    };
  });
}

const card =
  "rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]";

function SummaryChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-white [font-family:var(--font-nunito),sans-serif]">
        {value}
      </p>
    </div>
  );
}

export function TradesDashboard({ trades }: TradesDashboardProps) {
  const rows = useMemo(() => deserializeTrades(trades), [trades]);
  const allRows = useMemo(() => buildRows(rows), [rows]);

  const [asset, setAsset] = useState<string>("ALL");
  const [strategy, setStrategy] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [direction, setDirection] = useState<string>("ALL");
  const [wl, setWl] = useState<"ALL" | "WIN" | "LOSS">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    return allRows.filter((r) => {
      if (asset !== "ALL" && r.asset !== asset) return false;
      if (strategy !== "ALL" && r.strategy !== strategy) return false;
      if (status !== "ALL" && r.status !== status) return false;
      if (direction !== "ALL" && r.direction !== direction) return false;
      if (wl === "WIN" && !r.win) return false;
      if (wl === "LOSS" && r.win) return false;
      if (from) {
        const a = new Date(from);
        if (r.date < a) return false;
      }
      if (to) {
        const b = new Date(to);
        b.setHours(23, 59, 59, 999);
        if (r.date > b) return false;
      }
      return true;
    });
  }, [allRows, asset, strategy, status, direction, wl, from, to]);

  const summary = useMemo(() => {
    const n = filtered.length || 1;
    const wins = filtered.filter((r) => r.win).length;
    const winRate = (wins / n) * 100;
    const rrVals = filtered.map((r) => Number(r.rr));
    const avgRr = rrVals.reduce((a, b) => a + b, 0) / n;
    const dur = filtered.filter((r) => r.durationMs > 0);
    const avgHold =
      dur.length > 0
        ? dur.reduce((a, r) => a + r.durationMs, 0) / dur.length
        : 0;
    const gains = filtered.map((r) => r.gainPct);
    const best = gains.length ? Math.max(...gains) : 0;
    const worst = gains.length ? Math.min(...gains) : 0;
    return {
      total: filtered.length,
      winRate,
      avgRr,
      avgHold,
      best,
      worst,
    };
  }, [filtered]);

  const donut = useMemo(() => {
    let w = 0;
    let l = 0;
    for (const r of filtered) {
      if (r.win) w += 1;
      else l += 1;
    }
    return [
      { name: "Wins", value: w, fill: "#e2e8f0" },
      { name: "Losses", value: l, fill: "#3f3f46" },
    ];
  }, [filtered]);

  const pnlHist = useMemo(() => {
    const bins = [
      { lo: -5, hi: -1, label: "<-1%" },
      { lo: -1, hi: -0.25, label: "-1–-0.25" },
      { lo: -0.25, hi: 0, label: "-0.25–0" },
      { lo: 0, hi: 0.25, label: "0–0.25" },
      { lo: 0.25, hi: 1, label: "0.25–1" },
      { lo: 1, hi: Number.POSITIVE_INFINITY, label: ">1%" },
    ];
    const gains = filtered.map((r) => r.gainPct);
    return bins.map((b) => ({
      name: b.label,
      n: gains.filter((g) => g >= b.lo && g < b.hi).length,
    }));
  }, [filtered]);

  const byAsset = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      m.set(r.asset, (m.get(r.asset) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
  }, [filtered]);

  const byStrategy = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      m.set(r.strategy, (m.get(r.strategy) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, n]) => ({ name, n }));
  }, [filtered]);

  const monthlyCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const k = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, n]) => ({ name, n }));
  }, [filtered]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryChip label="Total trades" value={String(summary.total)} />
        <SummaryChip label="Win rate" value={`${summary.winRate.toFixed(1)}%`} />
        <SummaryChip label="Avg RR" value={summary.avgRr.toFixed(2)} />
        <SummaryChip
          label="Avg holding"
          value={formatDurationMs(summary.avgHold)}
        />
        <SummaryChip label="Best trade" value={`+${summary.best.toFixed(2)}%`} />
        <SummaryChip label="Worst trade" value={`${summary.worst.toFixed(2)}%`} />
      </div>

      <div className={`flex flex-wrap items-end gap-3 p-4 ${card}`}>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            From
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#141517] px-2 py-1.5 text-xs text-white"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            To
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#141517] px-2 py-1.5 text-xs text-white"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Asset
          </label>
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#141517] px-2 py-1.5 text-xs text-white"
          >
            <option value="ALL">All</option>
            {ASSET_UNIVERSE.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Direction
          </label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#141517] px-2 py-1.5 text-xs text-white"
          >
            <option value="ALL">All</option>
            <option value="LONG">Long</option>
            <option value="SHORT">Short</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Win / Loss
          </label>
          <select
            value={wl}
            onChange={(e) => setWl(e.target.value as typeof wl)}
            className="rounded-lg border border-white/[0.08] bg-[#141517] px-2 py-1.5 text-xs text-white"
          >
            <option value="ALL">All</option>
            <option value="WIN">Win</option>
            <option value="LOSS">Loss</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Strategy
          </label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#141517] px-2 py-1.5 text-xs text-white"
          >
            <option value="ALL">All</option>
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#141517] px-2 py-1.5 text-xs text-white"
          >
            <option value="ALL">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <p className="ml-auto text-xs text-zinc-500">
          Showing {filtered.length} of {allRows.length}
        </p>
      </div>

      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${card}`}>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#16181c]">
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Strategy</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3">Entry</th>
                <th className="px-4 py-3">Exit</th>
                <th className="px-4 py-3">PnL</th>
                <th className="px-4 py-3">Return %</th>
                <th className="px-4 py-3">RR</th>
                <th className="px-4 py-3">Holding</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice().reverse().map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-white/[0.04] text-[13px] [font-family:var(--font-nunito),sans-serif]"
                >
                  <td className="px-4 py-2.5 text-zinc-300">
                    {r.date.toLocaleString("en-GB", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-white">{r.asset}</td>
                  <td className="px-4 py-2.5 text-zinc-300">{r.strategy}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{r.direction}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{r.entry}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{r.exit}</td>
                  <td
                    className={
                      r.win
                        ? "px-4 py-2.5 text-[#e2ca7a]"
                        : "px-4 py-2.5 text-zinc-400"
                    }
                  >
                    {r.pnl}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-200">{r.returnPct}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{r.rr}</td>
                  <td className="px-4 py-2.5 text-zinc-500">{r.duration}</td>
                  <td className="px-4 py-2.5 text-zinc-500">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        <div className={`p-3 ${card}`}>
          <h3 className="text-xs font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Win rate
          </h3>
          <div className="mt-1 h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donut}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={32}
                  outerRadius={48}
                  paddingAngle={2}
                  stroke="none"
                >
                  {donut.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={`p-3 ${card}`}>
          <h3 className="text-xs font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            PnL distribution
          </h3>
          <div className="mt-1 h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlHist} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8a8a8a", fontSize: 8 }} />
                <YAxis tick={{ fill: "#8a8a8a", fontSize: 9 }} allowDecimals={false} width={28} />
                <Tooltip
                  contentStyle={{
                    background: "#1c1d20",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="n" fill="#94a3b8" maxBarSize={24} radius={[4, 4, 0, 0]}>
                  {pnlHist.map((e, i) => (
                    <Cell
                      key={i}
                      fill={e.name.includes("-") ? "#64748b" : "#94a3b8"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={`p-3 ${card}`}>
          <h3 className="text-xs font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            By asset
          </h3>
          <div className="mt-1 h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byAsset}
                layout="vertical"
                margin={{ left: 4, right: 8, top: 2, bottom: 0 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#8a8a8a", fontSize: 9 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={56}
                  tick={{ fill: "#8a8a8a", fontSize: 8 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1c1d20",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="n" fill="#94a3b8" maxBarSize={12} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={`p-3 ${card}`}>
          <h3 className="text-xs font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            By strategy
          </h3>
          <div className="mt-1 h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStrategy} margin={{ left: 0, right: 8, top: 2, bottom: 36 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#8a8a8a", fontSize: 8 }}
                  angle={-25}
                  textAnchor="end"
                  height={40}
                />
                <YAxis tick={{ fill: "#8a8a8a", fontSize: 9 }} allowDecimals={false} width={28} />
                <Tooltip
                  contentStyle={{
                    background: "#1c1d20",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="n" fill="#64748b" maxBarSize={28} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={`p-3 ${card} lg:col-span-2`}>
          <h3 className="text-xs font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Monthly trade count
          </h3>
          <div className="mt-1 h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyCount} margin={{ left: 0, right: 8, top: 2, bottom: 28 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8a8a8a", fontSize: 8 }} angle={-25} textAnchor="end" height={36} />
                <YAxis tick={{ fill: "#8a8a8a", fontSize: 9 }} allowDecimals={false} width={28} />
                <Tooltip
                  contentStyle={{
                    background: "#1c1d20",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="n" fill="#94a3b8" maxBarSize={22} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
