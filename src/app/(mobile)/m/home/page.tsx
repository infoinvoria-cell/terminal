import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data";
import { MobileHomeView } from "@/components/mobile/home/MobileHomeView";

export const dynamic = "force-dynamic";

export default async function MobileHomePage() {
  const data = await getDashboardPageData();

  const kpis = [
    { label: "Compounded", value: data.universal.compoundedReturn ?? "–", positive: true },
    { label: "Annualized", value: data.universal.annualizedReturn ?? "–", positive: true },
    { label: "24M Return", value: data.universal.totalReturn24m ?? "–", positive: true },
    { label: "Max Drawdown", value: data.universal.maxDrawdown ?? "–", positive: false },
  ];

  // cumulative % series from monthly returns
  let cum = 100;
  const series = data.capalifeData.performanceMonthly.monthly_returns.map((r) => {
    cum *= 1 + r.return_pct / 100;
    return { date: `${r.month}-01`, value: Number((cum - 100).toFixed(2)) };
  });

  const stats = {
    assets: data.portfolioKpisBaseline.assetsCount,
    strategies: data.portfolioKpisBaseline.strategiesCount,
    ytd: data.portfolioKpisBaseline.ytdReturnDisplayPct,
  };

  return <MobileHomeView kpis={kpis} series={series} stats={stats} />;
}
