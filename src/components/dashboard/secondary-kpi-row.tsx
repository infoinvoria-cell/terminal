import { cn } from "@/lib/utils";
import type { DashboardKpis } from "@/lib/trades-analytics";

type SecondaryKpiRowProps = {
  kpis: DashboardKpis;
};

type SecondaryCardProps = {
  label: string;
  value: string;
  delta?: string;
  sub?: string;
  title?: string;
};

function SecondaryCard({ label, value, delta, sub, title }: SecondaryCardProps) {
  const neg = delta?.trim().startsWith("-");
  return (
    <div
      title={title}
      className={cn(
        "flex min-h-[118px] w-full min-w-0 flex-col justify-between rounded-[20px] border border-white/[0.06] bg-gradient-to-b from-[#1c1d20] to-[#141517] px-4 pb-5 pt-4 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]",
        title && "cursor-help"
      )}
    >
      <p className="shrink-0 text-[13px] font-medium leading-snug text-[color:var(--dash-muted)] [font-family:var(--font-montserrat),sans-serif]">
        {label}
      </p>
      <div className="flex min-h-0 w-full min-w-0 flex-col gap-0.5">
        <div className="flex w-full min-w-0 flex-row items-end justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[26px] font-bold leading-none tracking-tight text-white [font-family:var(--font-nunito),sans-serif]">
            {value}
          </p>
          {delta ? (
            <div className="flex shrink-0 flex-col items-end justify-end pb-0.5">
              {neg ? (
                <span className="text-right text-[11px] font-semibold tracking-tight text-zinc-500 [font-family:var(--font-nunito),sans-serif]">
                  {delta}
                </span>
              ) : (
                <span className="inline-flex max-w-[5.5rem] items-center gap-0.5 rounded-full border border-[#e2ca7a]/35 bg-transparent px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-[#e2ca7a] [font-family:var(--font-nunito),sans-serif]">
                  <span className="truncate">{delta}</span>
                </span>
              )}
            </div>
          ) : null}
        </div>
        {sub ? (
          <p className="text-[10px] text-zinc-600 [font-family:var(--font-montserrat),sans-serif]">
            {sub}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SecondaryKpiRow({ kpis: _kpis }: SecondaryKpiRowProps) {
  return (
    <div className="w-full min-w-0">
      <div className="grid w-full grid-cols-6 gap-3">
        <SecondaryCard
          label="Calmar Ratio"
          value="3.0"
          title="Calmar Ratio = Annualized Return / Max Drawdown. Statement-based, not independently audited."
        />
        <SecondaryCard
          label="Best Month"
          value="+14.8%"
          delta="+14.8%"
          title="Best monthly return from Performance Report. Statement-based."
        />
        <SecondaryCard
          label="Worst Month"
          value="-5.8%"
          delta="-5.8%"
          title="Worst monthly return from Performance Report. Statement-based."
        />
        <SecondaryCard
          label="Pos. Months"
          value="18 / 26"
          title="18 positive months of 26 total (Apr 2024 – Jun 2026). Statement-based."
        />
        <SecondaryCard
          label="Assets"
          value="35"
          title="35 active Production Entries from final_production_sleeves.json v2 (2026-07-04)"
        />
        <SecondaryCard
          label="Strategies"
          value="56"
          sub="10 approaches"
          title="56 total strategies across 10 approach categories. 5 active Production Sleeves."
        />
      </div>
    </div>
  );
}
