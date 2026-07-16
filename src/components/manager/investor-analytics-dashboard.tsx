"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Search } from "lucide-react";
import { useHomeDashboard } from "@/context/home-dashboard-context";
import { formatUsdCompact } from "@/lib/trades-analytics";

const CARD_CLASS =
  "rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]";

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${CARD_CLASS} flex min-h-[102px] flex-col justify-between p-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
        {label}
      </p>
      <p className="text-2xl font-bold leading-none text-white [font-family:var(--font-nunito),sans-serif]">
        {value}
      </p>
    </div>
  );
}

export function InvestorAnalyticsDashboard() {
  const { metrics, trades, setPage } = useHomeDashboard();
  const [selectedInvestorId, setSelectedInvestorId] = useState<string | null>(null);
  const [analyticsMode, setAnalyticsMode] = useState(false);
  const [query, setQuery] = useState("");
  const [subIbFilter, setSubIbFilter] = useState<string>("ALL");
  const [multiplierFilter, setMultiplierFilter] = useState<string>("ALL");

  const filteredInvestors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return metrics.investorMetrics.filter((investor) => {
      const matchQuery =
        q.length === 0 ||
        investor.name.toLowerCase().includes(q) ||
        investor.accountId.toLowerCase().includes(q);
      const matchSubIb =
        subIbFilter === "ALL" ? true : investor.subIbId === subIbFilter;
      const matchMultiplier =
        multiplierFilter === "ALL"
          ? true
          : investor.multiplier === Number(multiplierFilter);
      return matchQuery && matchSubIb && matchMultiplier;
    });
  }, [metrics.investorMetrics, query, subIbFilter, multiplierFilter]);

  const selectedInvestor = useMemo(() => {
    const targetId = selectedInvestorId ?? filteredInvestors[0]?.investorId;
    return (
      filteredInvestors.find((investor) => investor.investorId === targetId) ??
      filteredInvestors[0]
    );
  }, [filteredInvestors, selectedInvestorId]);

  const totalProfit = filteredInvestors.reduce(
    (sum, investor) => sum + investor.grossProfit,
    0
  );
  const totalManagerFees = filteredInvestors.reduce(
    (sum, investor) => sum + investor.profitSplitPaid,
    0
  );
  const avgMultiplier =
    filteredInvestors.reduce((sum, investor) => sum + investor.multiplier, 0) /
    Math.max(1, filteredInvestors.length);
  const filteredAum = filteredInvestors.reduce(
    (sum, investor) => sum + investor.capital,
    0
  );

  const investorMonthlySeries = useMemo(() => {
    if (!selectedInvestor) return [];
    return trades
      .map((month) => {
        const result = month.investorResults.find(
          (entry) => entry.investorId === selectedInvestor.investorId
        );
        if (!result) return null;
        return {
          key: month.key,
          label: new Date(month.dateMs).toLocaleDateString("en-GB", {
            month: "short",
            year: "2-digit",
          }),
          grossProfit: result.grossProfit,
          netProfit: result.investorProfit,
          feesPaid: result.managerFee,
          equity: result.endingBalance,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [selectedInvestor, trades]);

  const bestSubIbInsight = useMemo(() => {
    const map = new Map<string, { name: string; netProfit: number; aum: number }>();
    for (const investor of filteredInvestors) {
      const current = map.get(investor.subIbId) ?? {
        name: investor.subIbName,
        netProfit: 0,
        aum: 0,
      };
      current.netProfit += investor.netProfit;
      current.aum += investor.capital;
      map.set(investor.subIbId, current);
    }
    const ranked = [...map.values()].sort((a, b) => b.netProfit - a.netProfit);
    return ranked[0];
  }, [filteredInvestors]);

  const multiplierDistribution = useMemo(() => {
    const map = new Map<number, number>();
    for (const investor of filteredInvestors) {
      map.set(investor.multiplier, (map.get(investor.multiplier) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([multiplier, count]) => ({ multiplier: `${multiplier.toFixed(1)}x`, count }))
      .sort((a, b) => a.multiplier.localeCompare(b.multiplier));
  }, [filteredInvestors]);

  const capitalDistribution = useMemo(
    () =>
      filteredInvestors.map((investor) => ({
        name: investor.name,
        capital: investor.capital,
      })),
    [filteredInvestors]
  );

  const investorDistributionBySubIb = useMemo(() => {
    const map = new Map<string, { subIb: string; count: number }>();
    for (const investor of filteredInvestors) {
      const current = map.get(investor.subIbId) ?? { subIb: investor.subIbName, count: 0 };
      current.count += 1;
      map.set(investor.subIbId, current);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [filteredInvestors]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 pb-1">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total Investors" value={String(filteredInvestors.length)} />
        <KpiCard label="Total AUM" value={formatUsdCompact(filteredAum)} />
        <KpiCard label="Avg Multiplier" value={`${avgMultiplier.toFixed(2)}x`} />
        <KpiCard label="Total Profit" value={formatUsdCompact(totalProfit)} />
        <KpiCard label="Manager Fees Collected" value={formatUsdCompact(totalManagerFees)} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="relative">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Search
            </span>
            <Search className="pointer-events-none absolute left-2 top-[30px] h-3.5 w-3.5 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or account"
              className="h-9 rounded-lg border border-white/[0.08] bg-[#141517] pl-7 pr-3 text-xs text-zinc-300"
            />
          </label>

          <label>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Sub-IB
            </span>
            <select
              value={subIbFilter}
              onChange={(event) => setSubIbFilter(event.target.value)}
              className="h-9 rounded-lg border border-white/[0.08] bg-[#141517] px-3 text-xs text-zinc-300"
            >
              <option value="ALL">All</option>
              {metrics.subIbMetrics.map((subIb) => (
                <option key={subIb.subIbId} value={subIb.subIbId}>
                  {subIb.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Multiplier
            </span>
            <select
              value={multiplierFilter}
              onChange={(event) => setMultiplierFilter(event.target.value)}
              className="h-9 rounded-lg border border-white/[0.08] bg-[#141517] px-3 text-xs text-zinc-300"
            >
              <option value="ALL">All</option>
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => setAnalyticsMode((current) => !current)}
          className={
            analyticsMode
              ? "rounded-full border border-[#e2ca7a]/45 bg-gradient-to-b from-[#1c1d20] to-[#141517] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[inset_0_-1px_0_0_rgba(226,202,122,0.45)]"
              : "rounded-full border border-white/[0.08] px-3.5 py-1.5 text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.04]"
          }
        >
          {analyticsMode ? "Exit Analytics Mode" : "Analytics Mode"}
        </button>
      </div>

      <section
        className={`${CARD_CLASS} h-[452px] shrink-0 overflow-hidden`}
      >
        <div className="h-full overflow-auto">
          <table className="w-full min-w-[1360px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#16181c]">
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3">Investor</th>
                <th className="px-4 py-3">Sub-IB</th>
                <th className="px-4 py-3">Capital</th>
                <th className="px-4 py-3">Multiplier</th>
                <th className="px-4 py-3">Equity</th>
                <th className="px-4 py-3">Gross Profit</th>
                <th className="px-4 py-3">Profit Split Paid</th>
                <th className="px-4 py-3">Net Profit</th>
                <th className="px-4 py-3">Total Commission Generated</th>
                <th className="px-4 py-3">Commission -&gt; Manager</th>
                <th className="px-4 py-3">Commission -&gt; Sub-IB</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvestors.map((row) => {
                const selected = row.investorId === selectedInvestor?.investorId;
                return (
                  <tr
                    key={row.investorId}
                    onClick={() => {
                      setSelectedInvestorId(row.investorId);
                      setAnalyticsMode(false);
                    }}
                    className={
                      selected
                        ? "cursor-pointer border-b border-white/[0.04] bg-white/[0.03] text-[13px] [font-family:var(--font-nunito),sans-serif]"
                        : "cursor-pointer border-b border-white/[0.04] text-[13px] [font-family:var(--font-nunito),sans-serif]"
                    }
                  >
                    <td className="px-4 py-2.5 text-white">{row.name}</td>
                    <td className="px-4 py-2.5 text-zinc-300">{row.subIbName}</td>
                    <td className="px-4 py-2.5 text-zinc-300">{formatUsdCompact(row.capital)}</td>
                    <td className="px-4 py-2.5 text-zinc-300">{row.multiplier.toFixed(1)}x</td>
                    <td className="px-4 py-2.5 text-zinc-200">
                      {formatUsdCompact(row.currentEquity)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {formatUsdCompact(row.grossProfit)}
                    </td>
                    <td className="px-4 py-2.5 text-[#e2ca7a]">
                      {formatUsdCompact(row.profitSplitPaid)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-200">
                      {formatUsdCompact(row.netProfit)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {formatUsdCompact(row.totalCommissionGenerated)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {formatUsdCompact(row.commissionToManager)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {formatUsdCompact(row.commissionToSubIb)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {!analyticsMode && selectedInvestor ? (
        <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-2">
          <section className={`${CARD_CLASS} flex min-h-0 flex-col p-5`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
                  {selectedInvestor.name} Detail View
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {selectedInvestor.accountId} - Sub-IB: {selectedInvestor.subIbName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPage("sub-ib-system")}
                className="rounded-full border border-[#e2ca7a]/35 px-2.5 py-1 text-[11px] font-semibold text-[#e2ca7a] transition-colors hover:border-[#e2ca7a]/55"
              >
                Open Sub-IB
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Gross Profit</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {formatUsdCompact(selectedInvestor.grossProfit)}
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Fees Paid</p>
                <p className="mt-1 text-sm font-semibold text-[#e2ca7a]">
                  {formatUsdCompact(selectedInvestor.profitSplitPaid)}
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Net Profit</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {formatUsdCompact(selectedInvestor.netProfit)}
                </p>
              </div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Commission Generated
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {formatUsdCompact(selectedInvestor.totalCommissionGenerated)}
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Commission -&gt; Manager
                </p>
                <p className="mt-1 text-sm font-semibold text-[#e2ca7a]">
                  {formatUsdCompact(selectedInvestor.commissionToManager)}
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Commission -&gt; Sub-IB
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-200">
                  {formatUsdCompact(selectedInvestor.commissionToSubIb)}
                </p>
              </div>
            </div>
            <div className="mt-3 min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={investorMonthlySeries} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#8a8a8a", fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={44} />
                  <Tooltip
                    formatter={(value) =>
                      formatUsdCompact(typeof value === "number" ? value : Number(value) || 0)
                    }
                    contentStyle={{
                      background: "#1c1d20",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="#e2ca7a"
                    strokeWidth={1.8}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className={`${CARD_CLASS} flex min-h-0 flex-col p-5`}>
            <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
              Monthly Profit, Fees & Commission
            </h3>
            <div className="mt-3 min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={investorMonthlySeries} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#8a8a8a", fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={44} />
                  <Tooltip
                    formatter={(value) =>
                      formatUsdCompact(typeof value === "number" ? value : Number(value) || 0)
                    }
                    contentStyle={{
                      background: "#1c1d20",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                    }}
                  />
                  <Bar
                    dataKey="grossProfit"
                    fill="rgba(161,161,170,0.7)"
                    maxBarSize={22}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="feesPaid"
                    fill="#e2ca7a"
                    maxBarSize={22}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="netProfit"
                    fill="#f5f5f5"
                    maxBarSize={22}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 h-[140px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      {
                        name: "Manager",
                        value: selectedInvestor.commissionToManager,
                      },
                      {
                        name: "Sub-IB",
                        value: selectedInvestor.commissionToSubIb,
                      },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={44}
                    outerRadius={68}
                    stroke="none"
                  >
                    <Cell fill="#e2ca7a" />
                    <Cell fill="rgba(161,161,170,0.72)" />
                  </Pie>
                  <Tooltip
                    formatter={(value) =>
                      formatUsdCompact(typeof value === "number" ? value : Number(value) || 0)
                    }
                    contentStyle={{
                      background: "#1c1d20",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      ) : null}

      {analyticsMode ? (
        <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-3">
          <section className={`${CARD_CLASS} flex min-h-0 flex-col p-5`}>
            <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
              Aggregated Insights
            </h3>
            <p className="mt-2 text-sm text-zinc-300">
              Best performing Sub-IB:{" "}
              <span className="font-semibold text-[#e2ca7a]">
                {bestSubIbInsight?.name ?? "n/a"}
              </span>{" "}
              ({formatUsdCompact(bestSubIbInsight?.netProfit ?? 0)} net)
            </p>
            <div className="mt-4 min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={multiplierDistribution} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="multiplier" tick={{ fill: "#8a8a8a", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={38} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#1c1d20",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#e2ca7a"
                    maxBarSize={38}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className={`${CARD_CLASS} flex min-h-0 flex-col p-5`}>
            <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
              Capital Distribution
            </h3>
            <div className="mt-3 min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={capitalDistribution} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#8a8a8a", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={44} />
                  <Tooltip
                    formatter={(value) =>
                      formatUsdCompact(typeof value === "number" ? value : Number(value) || 0)
                    }
                    contentStyle={{
                      background: "#1c1d20",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                    }}
                  />
                  <Bar
                    dataKey="capital"
                    fill="rgba(161,161,170,0.7)"
                    maxBarSize={44}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className={`${CARD_CLASS} flex min-h-0 flex-col p-5`}>
            <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
              Investor Distribution per Sub-IB
            </h3>
            <div className="mt-3 min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={investorDistributionBySubIb} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="subIb" tick={{ fill: "#8a8a8a", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={38} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#1c1d20",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#e2ca7a"
                    maxBarSize={42}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

