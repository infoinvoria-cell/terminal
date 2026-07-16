"use client";

import { Fragment, useMemo, useState, type FormEvent } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronUp, Pencil, Plus, X } from "lucide-react";
import { useHomeDashboard } from "@/context/home-dashboard-context";
import type { NewInvestorInput } from "@/lib/manager-simulation";
import { formatUsdCompact } from "@/lib/trades-analytics";

const CARD_CLASS =
  "rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]";

const DEFAULT_SPLIT = 50;

type TimeRange = "ALL" | "3M" | "6M" | "12M";

type ModalMode =
  | { kind: "create" }
  | { kind: "edit"; subIbId: string };

type InvestorDraft = {
  id: string;
  name: string;
  accountId: string;
  capital: string;
  multiplier: "1" | "1.5" | "2";
};

function createInvestorDraft(): InvestorDraft {
  return {
    id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    accountId: "",
    capital: "",
    multiplier: "1",
  };
}

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

export function SubIbSystemDashboard() {
  const {
    investors,
    metrics,
    trades,
    commissions,
    createSubIb,
    updateSubIb,
    subIBs,
  } = useHomeDashboard();
  const [expandedSubIbId, setExpandedSubIbId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [name, setName] = useState("");
  const [splitPct, setSplitPct] = useState(DEFAULT_SPLIT);
  const [investorDrafts, setInvestorDrafts] = useState<InvestorDraft[]>([
    createInvestorDraft(),
  ]);
  const [selectedSubIbFilter, setSelectedSubIbFilter] = useState<string>("ALL");
  const [timeRange, setTimeRange] = useState<TimeRange>("ALL");
  const subIbMetrics = metrics.subIbMetrics;

  const cutoffDateMs = useMemo(() => {
    if (timeRange === "ALL") return null;
    const now = new Date();
    const months = timeRange === "3M" ? 3 : timeRange === "6M" ? 6 : 12;
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    return cutoff.getTime();
  }, [timeRange]);

  const filteredCommissions = useMemo(() => {
    return commissions.filter((commission) =>
      cutoffDateMs === null ? true : commission.dateMs >= cutoffDateMs
    );
  }, [commissions, cutoffDateMs]);

  const filteredTrades = useMemo(() => {
    return trades.filter((trade) =>
      cutoffDateMs === null ? true : trade.dateMs >= cutoffDateMs
    );
  }, [trades, cutoffDateMs]);

  const rowData = useMemo(() => {
    const commissionAgg = new Map<
      string,
      { generated: number; managerShare: number; subIbShare: number }
    >();
    for (const commission of filteredCommissions) {
      const current = commissionAgg.get(commission.subIbId) ?? {
        generated: 0,
        managerShare: 0,
        subIbShare: 0,
      };
      current.generated += commission.commissionTotal;
      current.managerShare += commission.managerShare;
      current.subIbShare += commission.subIbShare;
      commissionAgg.set(commission.subIbId, current);
    }

    const profitSplitContribution = new Map<string, number>();
    for (const trade of filteredTrades) {
      for (const result of trade.investorResults) {
        const investor = investors.find((item) => item.id === result.investorId);
        if (!investor) continue;
        const current = profitSplitContribution.get(investor.subIbId) ?? 0;
        profitSplitContribution.set(investor.subIbId, current + result.managerFee);
      }
    }

    return subIbMetrics
      .map((subIb) => {
        const commission = commissionAgg.get(subIb.subIbId) ?? {
          generated: 0,
          managerShare: 0,
          subIbShare: 0,
        };
        return {
          ...subIb,
          generatedCommission: round2(commission.generated),
          managerShare: round2(commission.managerShare),
          theirShare: round2(commission.subIbShare),
          profitSplitContribution: round2(
            profitSplitContribution.get(subIb.subIbId) ?? 0
          ),
        };
      })
      .filter((row) =>
        selectedSubIbFilter === "ALL" ? true : row.subIbId === selectedSubIbFilter
      );
  }, [
    filteredCommissions,
    filteredTrades,
    investors,
    subIbMetrics,
    selectedSubIbFilter,
  ]);

  const subIbDetails = useMemo(() => {
    const out = new Map<
      string,
      {
        investors: Array<{
          investorId: string;
          name: string;
          accountId: string;
          capital: number;
          multiplier: number;
          generatedCommission: number;
          managerShare: number;
          subIbShare: number;
          profitSplitContribution: number;
        }>;
        monthly: {
          key: string;
          label: string;
          dateMs: number;
          commissionGenerated: number;
          managerShare: number;
          subIbShare: number;
          profitSplitContribution: number;
        }[];
      }
    >();

    for (const subIb of rowData) {
      const investorsForSubIb = investors.filter(
        (investor) => investor.subIbId === subIb.subIbId
      );
      const investorIdSet = new Set(investorsForSubIb.map((investor) => investor.id));
      const investorStats = new Map<
        string,
        {
          investorId: string;
          name: string;
          accountId: string;
          capital: number;
          multiplier: number;
          generatedCommission: number;
          managerShare: number;
          subIbShare: number;
          profitSplitContribution: number;
        }
      >(
        investorsForSubIb.map((investor) => [
          investor.id,
          {
            investorId: investor.id,
            name: investor.name,
            accountId: investor.accountId,
            capital: investor.capital,
            multiplier: investor.multiplier,
            generatedCommission: 0,
            managerShare: 0,
            subIbShare: 0,
            profitSplitContribution: 0,
          },
        ])
      );

      const monthMap = new Map<
        string,
        {
          key: string;
          label: string;
          dateMs: number;
          commissionGenerated: number;
          managerShare: number;
          subIbShare: number;
          profitSplitContribution: number;
        }
      >();

      for (const commission of filteredCommissions) {
        if (commission.subIbId !== subIb.subIbId) continue;
        const current = monthMap.get(commission.monthKey) ?? {
          key: commission.monthKey,
          label: new Date(commission.dateMs).toLocaleDateString("en-GB", {
            month: "short",
            year: "2-digit",
          }),
          dateMs: commission.dateMs,
          commissionGenerated: 0,
          managerShare: 0,
          subIbShare: 0,
          profitSplitContribution: 0,
        };
        current.commissionGenerated += commission.commissionTotal;
        current.managerShare += commission.managerShare;
        current.subIbShare += commission.subIbShare;
        monthMap.set(commission.monthKey, current);

        const investor = investorStats.get(commission.investorId);
        if (investor) {
          investor.generatedCommission += commission.commissionTotal;
          investor.managerShare += commission.managerShare;
          investor.subIbShare += commission.subIbShare;
          investorStats.set(commission.investorId, investor);
        }
      }

      for (const trade of filteredTrades) {
        const current = monthMap.get(trade.key) ?? {
          key: trade.key,
          label: new Date(trade.dateMs).toLocaleDateString("en-GB", {
            month: "short",
            year: "2-digit",
          }),
          dateMs: trade.dateMs,
          commissionGenerated: 0,
          managerShare: 0,
          subIbShare: 0,
          profitSplitContribution: 0,
        };
        for (const result of trade.investorResults) {
          if (!investorIdSet.has(result.investorId)) continue;
          current.profitSplitContribution += result.managerFee;

          const investor = investorStats.get(result.investorId);
          if (investor) {
            investor.profitSplitContribution += result.managerFee;
            investorStats.set(result.investorId, investor);
          }
        }
        monthMap.set(trade.key, current);
      }

      out.set(subIb.subIbId, {
        investors: [...investorStats.values()].map((investor) => ({
          ...investor,
          generatedCommission: round2(investor.generatedCommission),
          managerShare: round2(investor.managerShare),
          subIbShare: round2(investor.subIbShare),
          profitSplitContribution: round2(investor.profitSplitContribution),
        })),
        monthly: [...monthMap.values()]
          .sort((a, b) => a.dateMs - b.dateMs)
          .map((row) => ({
            ...row,
            commissionGenerated: round2(row.commissionGenerated),
            managerShare: round2(row.managerShare),
            subIbShare: round2(row.subIbShare),
            profitSplitContribution: round2(row.profitSplitContribution),
          })),
      });
    }

    return out;
  }, [investors, filteredCommissions, filteredTrades, rowData]);

  const canSubmit = name.trim().length > 0;
  const totalInvestors = rowData.reduce((sum, row) => sum + row.investorsCount, 0);
  const totalAum = rowData.reduce((sum, row) => sum + row.totalAum, 0);
  const totalCommissionGenerated = rowData.reduce(
    (sum, row) => sum + row.generatedCommission,
    0
  );
  const totalManagerShare = rowData.reduce((sum, row) => sum + row.managerShare, 0);
  const totalSubIbShare = rowData.reduce((sum, row) => sum + row.theirShare, 0);

  function openCreateModal() {
    setModalMode({ kind: "create" });
    setName("");
    setSplitPct(DEFAULT_SPLIT);
    setInvestorDrafts([createInvestorDraft()]);
  }

  function openEditModal(subIbId: string) {
    const currentSubIb = subIBs.find((subIb) => subIb.id === subIbId);
    if (!currentSubIb) return;
    setModalMode({ kind: "edit", subIbId });
    setName(currentSubIb.name);
    setSplitPct(currentSubIb.splitPct);
    setInvestorDrafts([createInvestorDraft()]);
  }

  function closeModal() {
    setModalMode(null);
    setName("");
    setSplitPct(DEFAULT_SPLIT);
    setInvestorDrafts([createInvestorDraft()]);
  }

  function onSubmitSubIb(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const newInvestors = draftToInputs(investorDrafts);

    if (modalMode?.kind === "edit") {
      updateSubIb({
        id: modalMode.subIbId,
        name: name.trim(),
        splitPct,
        newInvestors,
      });
    } else {
      createSubIb({
        name: name.trim(),
        splitPct,
        newInvestors,
      });
    }

    closeModal();
  }

  function addInvestorDraft() {
    setInvestorDrafts((current) => [...current, createInvestorDraft()]);
  }

  function removeInvestorDraft(id: string) {
    setInvestorDrafts((current) =>
      current.length <= 1 ? current : current.filter((draft) => draft.id !== id)
    );
  }

  function updateInvestorDraft(
    id: string,
    field: keyof Omit<InvestorDraft, "id">,
    value: string
  ) {
    setInvestorDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, [field]: value } : draft
      )
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 pb-1">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total Sub-IBs" value={String(rowData.length)} />
        <KpiCard label="Total Investors" value={String(totalInvestors)} />
        <KpiCard label="Total AUM" value={formatUsdCompact(totalAum)} />
        <KpiCard
          label="Total Commission Generated"
          value={formatUsdCompact(totalCommissionGenerated)}
        />
        <KpiCard
          label="Your Share vs Their Share"
          value={`${formatUsdCompact(totalManagerShare)} / ${formatUsdCompact(totalSubIbShare)}`}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Sub-IB
            </span>
            <select
              value={selectedSubIbFilter}
              onChange={(event) => setSelectedSubIbFilter(event.target.value)}
              className="h-9 rounded-lg border border-white/[0.08] bg-[#141517] px-3 text-xs text-zinc-300"
            >
              <option value="ALL">All</option>
              {subIBs.map((subIb) => (
                <option key={subIb.id} value={subIb.id}>
                  {subIb.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Time Range
            </span>
            <select
              value={timeRange}
              onChange={(event) => setTimeRange(event.target.value as TimeRange)}
              className="h-9 rounded-lg border border-white/[0.08] bg-[#141517] px-3 text-xs text-zinc-300"
            >
              <option value="ALL">All</option>
              <option value="3M">Last 3M</option>
              <option value="6M">Last 6M</option>
              <option value="12M">Last 12M</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e2ca7a]/40 bg-gradient-to-b from-[#1c1d20] to-[#141517] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[inset_0_-1px_0_0_rgba(226,202,122,0.45)] transition-colors hover:border-[#e2ca7a]/55"
        >
          <Plus className="h-4 w-4 text-[#e2ca7a]" strokeWidth={2} />
          New Sub-IB
        </button>
      </div>

      <section className={`${CARD_CLASS} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#16181c]">
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3">Sub-IB Name</th>
                <th className="px-4 py-3">Investors count</th>
                <th className="px-4 py-3">AUM</th>
                <th className="px-4 py-3">Generated Commission</th>
                <th className="px-4 py-3">Their Share</th>
                <th className="px-4 py-3">Split %</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rowData.map((row) => {
                const expanded = expandedSubIbId === row.subIbId;
                const details = subIbDetails.get(row.subIbId);
                return (
                  <Fragment key={row.subIbId}>
                    <tr className="border-b border-white/[0.04] text-[13px] [font-family:var(--font-nunito),sans-serif]">
                      <td className="px-4 py-2.5 text-white">{row.name}</td>
                      <td className="px-4 py-2.5 text-zinc-300">{row.investorsCount}</td>
                      <td className="px-4 py-2.5 text-zinc-200">{formatUsdCompact(row.totalAum)}</td>
                      <td className="px-4 py-2.5 text-zinc-300">
                        {formatUsdCompact(row.generatedCommission)}
                      </td>
                      <td className="px-4 py-2.5 text-[#e2ca7a]">
                        {formatUsdCompact(row.theirShare)}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400">
                        Manager {Math.round(100 - row.splitPct)}% / Sub-IB {Math.round(row.splitPct)}%
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSubIbId((current) =>
                                current === row.subIbId ? null : row.subIbId
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition-colors hover:text-white"
                          >
                            {expanded ? "Collapse" : "Expand"}
                            {expanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(row.subIbId)}
                            className="inline-flex items-center gap-1 rounded-full border border-[#e2ca7a]/35 px-2.5 py-1 text-[11px] font-semibold text-[#e2ca7a] transition-colors hover:border-[#e2ca7a]/55"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded && details ? (
                      <tr className="border-b border-white/[0.04] bg-[#131418]">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="space-y-3">
                            <div className="grid gap-2 md:grid-cols-3">
                              <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                                  Investor List
                                </p>
                                <div className="mt-2 overflow-auto">
                                  <table className="w-full min-w-[660px] border-collapse text-left text-[11px]">
                                    <thead>
                                      <tr className="border-b border-white/[0.06] text-zinc-500">
                                        <th className="px-1.5 py-1">Investor</th>
                                        <th className="px-1.5 py-1">Capital</th>
                                        <th className="px-1.5 py-1">Mult.</th>
                                        <th className="px-1.5 py-1">Commission</th>
                                        <th className="px-1.5 py-1">Manager</th>
                                        <th className="px-1.5 py-1">Sub-IB</th>
                                        <th className="px-1.5 py-1">Profit Split</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {details.investors.map((investor) => (
                                        <tr
                                          key={investor.investorId}
                                          className="border-b border-white/[0.04] text-zinc-300"
                                        >
                                          <td className="px-1.5 py-1.5">
                                            {investor.name} ({investor.accountId})
                                          </td>
                                          <td className="px-1.5 py-1.5">
                                            {formatUsdCompact(investor.capital)}
                                          </td>
                                          <td className="px-1.5 py-1.5">
                                            {investor.multiplier.toFixed(1)}x
                                          </td>
                                          <td className="px-1.5 py-1.5">
                                            {formatUsdCompact(investor.generatedCommission)}
                                          </td>
                                          <td className="px-1.5 py-1.5">
                                            {formatUsdCompact(investor.managerShare)}
                                          </td>
                                          <td className="px-1.5 py-1.5 text-[#e2ca7a]">
                                            {formatUsdCompact(investor.subIbShare)}
                                          </td>
                                          <td className="px-1.5 py-1.5">
                                            {formatUsdCompact(investor.profitSplitContribution)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                              <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                                  Generated Commission
                                </p>
                                <p className="mt-1 text-base font-semibold text-white">
                                  {formatUsdCompact(row.generatedCommission)}
                                </p>
                              </div>
                              <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                                  Profit Split Contribution
                                </p>
                                <p className="mt-1 text-base font-semibold text-[#e2ca7a]">
                                  {formatUsdCompact(row.profitSplitContribution)}
                                </p>
                              </div>
                            </div>

                            <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                              <div className="h-[220px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <ComposedChart data={details.monthly} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fill: "#8a8a8a", fontSize: 10 }} interval={2} />
                                    <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={46} />
                                    <Tooltip
                                      formatter={(value) =>
                                        formatUsdCompact(
                                          typeof value === "number" ? value : Number(value) || 0
                                        )
                                      }
                                      contentStyle={{
                                        background: "#1c1d20",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        borderRadius: 12,
                                      }}
                                    />
                                    <Bar
                                      dataKey="managerShare"
                                      stackId="commission"
                                      fill="#e2ca7a"
                                      radius={[4, 4, 0, 0]}
                                    />
                                    <Bar
                                      dataKey="subIbShare"
                                      stackId="commission"
                                      fill="rgba(161,161,170,0.65)"
                                      radius={[4, 4, 0, 0]}
                                    />
                                    <Line
                                      type="monotone"
                                      dataKey="profitSplitContribution"
                                      stroke="#f5f5f5"
                                      strokeWidth={1.3}
                                      dot={false}
                                    />
                                  </ComposedChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {modalMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={onSubmitSubIb}
            className={`${CARD_CLASS} w-full max-w-3xl border-white/[0.08] p-5`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
                  {modalMode.kind === "create" ? "New Sub-IB" : "Edit Sub-IB"}
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Add Sub-IB settings and create linked investor accounts.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-white/[0.08] p-1.5 text-zinc-400 transition-colors hover:text-zinc-200"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Name
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#141517] px-3 text-sm text-white outline-none transition-colors focus:border-[#e2ca7a]/45"
                  placeholder="Sub-IB name"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Revenue Split
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={splitPct}
                  onChange={(event) => setSplitPct(Number(event.target.value))}
                  className="w-full accent-[#e2ca7a]"
                />
                <p className="mt-1 text-xs text-zinc-400">
                  Manager {Math.round(100 - splitPct)}% / Sub-IB {Math.round(splitPct)}%
                </p>
              </label>
            </div>

            {modalMode.kind === "edit" ? (
              <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.01] p-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Existing Investors
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {investors
                    .filter((investor) => investor.subIbId === modalMode.subIbId)
                    .map((investor) => (
                      <span
                        key={investor.id}
                        className="inline-flex items-center rounded-full border border-white/[0.08] px-2 py-1 text-[10px] text-zinc-300"
                      >
                        {investor.name} ({investor.accountId})
                      </span>
                    ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                New Investors
              </p>
              {investorDrafts.map((draft, index) => (
                <div
                  key={draft.id}
                  className="grid gap-2 rounded-lg border border-white/[0.08] bg-[#141517] p-3 md:grid-cols-12"
                >
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      updateInvestorDraft(draft.id, "name", event.target.value)
                    }
                    placeholder="Investor Name"
                    className="h-9 rounded-md border border-white/[0.08] bg-[#101114] px-2.5 text-xs text-zinc-200 md:col-span-3"
                  />
                  <input
                    value={draft.accountId}
                    onChange={(event) =>
                      updateInvestorDraft(draft.id, "accountId", event.target.value)
                    }
                    placeholder="Account ID"
                    className="h-9 rounded-md border border-white/[0.08] bg-[#101114] px-2.5 text-xs text-zinc-200 md:col-span-3"
                  />
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={draft.capital}
                    onChange={(event) =>
                      updateInvestorDraft(draft.id, "capital", event.target.value)
                    }
                    placeholder="Capital"
                    className="h-9 rounded-md border border-white/[0.08] bg-[#101114] px-2.5 text-xs text-zinc-200 md:col-span-2"
                  />
                  <select
                    value={draft.multiplier}
                    onChange={(event) =>
                      updateInvestorDraft(
                        draft.id,
                        "multiplier",
                        event.target.value as InvestorDraft["multiplier"]
                      )
                    }
                    className="h-9 rounded-md border border-white/[0.08] bg-[#101114] px-2.5 text-xs text-zinc-200 md:col-span-2"
                  >
                    <option value="1">1x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2x</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeInvestorDraft(draft.id)}
                    className="h-9 rounded-md border border-white/[0.08] px-2 text-xs font-semibold text-zinc-300 md:col-span-2"
                  >
                    {index === 0 && investorDrafts.length === 1 ? "Keep" : "Remove"}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={addInvestorDraft}
                className="rounded-full border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.05]"
              >
                Add Investor
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full border border-white/[0.08] px-4 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="rounded-full border border-[#e2ca7a]/40 bg-gradient-to-b from-[#1c1d20] to-[#141517] px-4 py-2 text-xs font-semibold text-white shadow-[inset_0_-1px_0_0_rgba(226,202,122,0.45)] transition-colors hover:border-[#e2ca7a]/55 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {modalMode.kind === "create" ? "Create Sub-IB" : "Save Changes"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function draftToInputs(drafts: InvestorDraft[]): NewInvestorInput[] {
  return drafts
    .map((draft) => {
      const capital = Number(draft.capital);
      if (!draft.name.trim() || !draft.accountId.trim() || !Number.isFinite(capital) || capital <= 0) {
        return null;
      }
      return {
        name: draft.name.trim(),
        accountId: draft.accountId.trim(),
        capital,
        multiplier: Number(draft.multiplier),
      };
    })
    .filter((draft): draft is NewInvestorInput => draft !== null);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
