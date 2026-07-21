import { cn } from "@/lib/utils";
import { deserializeTrades, compoundGains } from "@/lib/trades-analytics";
import type { DashboardKpis, SerializedTrade } from "@/lib/trades-analytics";

type SecondaryKpiRowProps = {
  kpis: DashboardKpis;
  trades?: SerializedTrade[];
};

function computeMonthlyStats(trades: SerializedTrade[]) {
  if (!trades.length) return null;
  const rows = deserializeTrades(trades);
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r.gainPct);
  }
  const monthly = [...map.values()].map((gains) => compoundGains(gains));
  if (!monthly.length) return null;
  const best = Math.max(...monthly);
  const worst = Math.min(...monthly);
  const pos = monthly.filter((m) => m >= 0).length;
  const total = monthly.length;
  const calmar = kpiCalmar(compoundGains(rows.map((r) => r.gainPct)), rows);
  return { best, worst, pos, total, calmar };
}

function kpiCalmar(totalReturnPct: number, rows: ReturnType<typeof deserializeTrades>) {
  if (!rows.length) return null;
  let equity = 100, peak = 100, maxDd = 0;
  for (const r of rows) {
    equity *= 1 + r.gainPct / 100;
    peak = Math.max(peak, equity);
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - equity) / peak) * 100);
  }
  if (maxDd < 0.01) return null;
  const months = rows.length;
  const annualized = (Math.pow(1 + totalReturnPct / 100, 12 / months) - 1) * 100;
  return annualized / maxDd;
}

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

export function SecondaryKpiRow({ kpis: _kpis, trades }: SecondaryKpiRowProps) {
  const m = trades ? computeMonthlyStats(trades) : null;
  const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
  return (
    <div className="w-full min-w-0">
      <div className="grid w-full grid-cols-6 gap-3">
        <SecondaryCard
          label="Calmar Ratio"
          value={m?.calmar != null ? m.calmar.toFixed(1) : "—"}
          title="Calmar Ratio = Annualized Return / Max Drawdown. Computed from track record."
        />
        <SecondaryCard
          label="Best Month"
          value={m ? fmtPct(m.best) : "—"}
          delta={m ? fmtPct(m.best) : undefined}
          title="Best monthly compounded return from track record."
        />
        <SecondaryCard
          label="Worst Month"
          value={m ? fmtPct(m.worst) : "—"}
          delta={m ? fmtPct(m.worst) : undefined}
          title="Worst monthly compounded return from track record."
        />
        <SecondaryCard
          label="Pos. Months"
          value={m ? `${m.pos} / ${m.total}` : "—"}
          title="Positive months of total months in track record."
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
