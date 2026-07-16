"use client";

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

function RevenueSplitBox({
  title,
  topLabel,
  topValue,
  bottomLabel,
  bottomValue,
}: {
  title: string;
  topLabel: string;
  topValue: number;
  bottomLabel: string;
  bottomValue: number;
}) {
  const total = Math.max(1, topValue + bottomValue);
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <h3 className="text-base font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
        {title}
      </h3>
      <div className="mt-4 space-y-4">
        <SplitRow
          label={topLabel}
          value={topValue}
          share={topValue / total}
          highlighted
        />
        <SplitRow label={bottomLabel} value={bottomValue} share={bottomValue / total} />
      </div>
    </section>
  );
}

function SplitRow({
  label,
  value,
  share,
  highlighted = false,
}: {
  label: string;
  value: number;
  share: number;
  highlighted?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-zinc-400 [font-family:var(--font-montserrat),sans-serif]">
          {label}
        </p>
        <p
          className={
            highlighted
              ? "text-[13px] font-semibold text-[#e2ca7a] [font-family:var(--font-nunito),sans-serif]"
              : "text-[13px] font-semibold text-zinc-300 [font-family:var(--font-nunito),sans-serif]"
          }
        >
          {formatUsdCompact(value)}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#111216]">
        <div
          className={highlighted ? "h-full bg-[#e2ca7a]" : "h-full bg-zinc-500"}
          style={{ width: `${Math.max(2, Math.min(100, share * 100))}%` }}
        />
      </div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
      {text}
    </p>
  );
}

export function ManagerOverviewDashboard() {
  const { metrics } = useHomeDashboard();
  const {
    overview,
    monthlyRevenueSeries,
    equityCurveSeries,
    commissionGrowthSeries,
    commissionByAssetType,
  } = metrics;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 pb-1">
      <div className="space-y-2">
        <SectionLabel text="KPIs" />
        <h2 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
          KPI Cards
        </h2>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total AUM" value={formatUsdCompact(overview.totalAum)} />
        <KpiCard
          label="Risk Adjusted AUM"
          value={formatUsdCompact(overview.riskAdjustedAum)}
        />
        <KpiCard
          label="Total Profit (Gross)"
          value={formatUsdCompact(overview.totalProfitGross)}
        />
        <KpiCard
          label="Manager Profit (25%)"
          value={formatUsdCompact(overview.managerProfitSplit)}
        />
        <KpiCard
          label="IB Revenue (Generated)"
          value={formatUsdCompact(overview.ibRevenue)}
        />
        <KpiCard
          label="Manager IB Share"
          value={formatUsdCompact(overview.managerCommissionShare)}
        />
        <KpiCard
          label="Sub-IB Share"
          value={formatUsdCompact(overview.subIbCommissionShare)}
        />
        <KpiCard
          label="Total Combined Revenue"
          value={formatUsdCompact(overview.combinedRevenue)}
        />
      </div>

      <div className="space-y-2 pt-2">
        <SectionLabel text="Revenue" />
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        <RevenueSplitBox
          title="Profit Split"
          topLabel="Manager Share"
          topValue={overview.managerProfitSplit}
          bottomLabel="Investor Share"
          bottomValue={overview.investorProfitSplit}
        />
        <RevenueSplitBox
          title="IB Commission"
          topLabel="Manager Share"
          topValue={overview.managerCommissionShare}
          bottomLabel="Sub-IB Share"
          bottomValue={overview.subIbCommissionShare}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-2 xl:grid-rows-2">
        <section className={`${CARD_CLASS} flex min-h-0 flex-col p-5`}>
          <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Monthly Revenue Breakdown
          </h3>
          <div className="mt-3 min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenueSeries} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
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
                  dataKey="ibCommissionGenerated"
                  stackId="revenue"
                  fill="rgba(161,161,170,0.65)"
                  radius={[4, 4, 0, 0]}
                  name="IB Commission"
                />
                <Bar
                  dataKey="profitSplitRevenue"
                  stackId="revenue"
                  fill="#e2ca7a"
                  radius={[4, 4, 0, 0]}
                  name="Profit Split"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className={`${CARD_CLASS} flex min-h-0 flex-col p-5`}>
          <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Equity Curve
          </h3>
          <div className="mt-3 min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equityCurveSeries} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#8a8a8a", fontSize: 10 }} interval={2} />
                <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={52} />
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
                  dataKey="aggregatedEquity"
                  stroke="#e2ca7a"
                  strokeWidth={1.8}
                  dot={false}
                  name="Equity"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className={`${CARD_CLASS} flex min-h-0 flex-col p-5`}>
          <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Commission Growth Over Time
          </h3>
          <div className="mt-3 min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={commissionGrowthSeries} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#8a8a8a", fontSize: 10 }} interval={2} />
                <YAxis tick={{ fill: "#8a8a8a", fontSize: 10 }} width={52} />
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
                  dataKey="generated"
                  stroke="#e2ca7a"
                  strokeWidth={1.8}
                  dot={false}
                  name="Generated"
                />
                <Line
                  type="monotone"
                  dataKey="cumulativeGenerated"
                  stroke="#f5f5f5"
                  strokeWidth={1.2}
                  dot={false}
                  name="Cumulative"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className={`${CARD_CLASS} flex min-h-0 flex-col p-5`}>
          <h3 className="text-sm font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
            Commission by Asset Type
          </h3>
          <div className="mt-3 min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={commissionByAssetType}
                  dataKey="generated"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={100}
                  stroke="none"
                  paddingAngle={2}
                >
                  {commissionByAssetType.map((row) => (
                    <Cell
                      key={row.name}
                      fill={row.name === "Forex" ? "#e2ca7a" : "rgba(161,161,170,0.7)"}
                    />
                  ))}
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
    </div>
  );
}
