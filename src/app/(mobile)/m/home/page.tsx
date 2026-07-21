import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data";
import { MobileHomeView } from "@/components/mobile/home/MobileHomeView";

export const dynamic = "force-dynamic";

export default async function MobileHomePage() {
  const data = await getDashboardPageData();
  const k    = data.portfolioKpisBaseline;
  const sign = (n: number) => (n >= 0 ? "+" : "");
  const fmt1 = (n: number) => `${sign(n)}${n.toFixed(1)}%`;

  const topKpis = [
    { label: "Risk Adj. AuM",    value: data.universal.riskAdjustedAum ?? "EUR 0",                      isAum: true  },
    { label: "Total Return",      value: data.universal.totalReturn24m   ?? fmt1(k.totalReturn24mPct),   neg: false   },
    { label: "Max Drawdown",      value: data.universal.maxDrawdown      ?? `-${k.maxDrawdownPct.toFixed(2)}%`, neg: true },
    { label: "Annualized",        value: data.universal.annualizedReturn  ?? fmt1(k.ytdReturnDisplayPct), neg: false  },
  ];

  return (
    <MobileHomeView
      topKpis={topKpis}
      kpis={data.portfolioKpisBaseline}
      trades={data.serialized}
      capalifeData={data.capalifeData}
    />
  );
}
