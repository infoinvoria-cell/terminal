import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data";
import { MobileHomeView } from "@/components/mobile/home/MobileHomeView";

export const dynamic = "force-dynamic";

export default async function MobileHomePage() {
  const data = await getDashboardPageData();
  const k    = data.portfolioKpisBaseline;
  const sign = (n: number) => (n >= 0 ? "+" : "");
  const fmt1 = (n: number) => `${sign(n)}${n.toFixed(1)}%`;

  const topKpis = [
    { label: "Annualized",   value: data.universal.annualizedReturn ?? fmt1(k.ytdReturnDisplayPct) },
    { label: "24M Return",   value: data.universal.totalReturn24m   ?? fmt1(k.totalReturn24mPct)   },
    { label: "Max Drawdown", value: data.universal.maxDrawdown      ?? `-${k.maxDrawdownPct.toFixed(2)}%` },
    { label: "YTD",          value: k.ytdReturnDisplayPct != null   ? fmt1(k.ytdReturnDisplayPct)  : "—" },
  ];

  return (
    <MobileHomeView
      riskAdjustedAum={data.universal.riskAdjustedAum ?? "EUR 0"}
      topKpis={topKpis}
      kpis={data.portfolioKpisBaseline}
      trades={data.serialized}
      capalifeData={data.capalifeData}
    />
  );
}
