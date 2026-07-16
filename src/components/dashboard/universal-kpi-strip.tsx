import { KpiCard } from "@/components/dashboard/kpi-card";
import { AumKpiCard } from "@/components/dashboard/aum-kpi-card";

export type UniversalKpiStrings = {
  riskAdjustedAum: string;
  marketVolume: string;
  totalReturn24m: string;
  maxDrawdown: string;
  compoundedReturn?: string;
  annualizedReturn?: string;
};

type UniversalKpiStripProps = {
  universal: UniversalKpiStrings;
};

export function UniversalKpiStrip({ universal }: UniversalKpiStripProps) {
  return (
    <section>
      <div className="grid min-h-0 min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AumKpiCard value={universal.riskAdjustedAum} />
        <KpiCard
          label="Total Return"
          value={universal.totalReturn24m}
          title="Combined statement-based return. Account 1 +73.19% · Account 2 +23.96%. Period 11.04.2024–01.07.2026. Not independently audited."
        />
        <KpiCard
          label="Max Drawdown"
          value={universal.maxDrawdown}
          valueVariant="negative"
        />
        <KpiCard
          label="Annualized Return"
          value={universal.annualizedReturn ?? "35.2%"}
          title="Annualized return p.a. over 11.04.2024–01.07.2026. Sharpe 1.60 · Calmar 3.0. Statement-based, not independently audited."
        />
      </div>
    </section>
  );
}
