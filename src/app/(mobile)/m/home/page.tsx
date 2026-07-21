import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data";
import { MobileHomeView } from "@/components/mobile/home/MobileHomeView";

export const dynamic = "force-dynamic";

export default async function MobileHomePage() {
  const data = await getDashboardPageData();

  const kpis = [
    { label: "Compounded",   value: data.universal.compoundedReturn  ?? "–", positive: true  },
    { label: "Annualized",   value: data.universal.annualizedReturn   ?? "–", positive: true  },
    { label: "24M Return",   value: data.universal.totalReturn24m     ?? "–", positive: true  },
    { label: "Max Drawdown", value: data.universal.maxDrawdown        ?? "–", positive: false },
  ];

  // Cumulative % series from monthly returns
  let cum = 100;
  const series = data.capalifeData.performanceMonthly.monthly_returns.map((r) => {
    cum *= 1 + r.return_pct / 100;
    return { date: `${r.month}-01`, value: Number((cum - 100).toFixed(2)) };
  });

  const stats = {
    assets:     data.portfolioKpisBaseline.assetsCount,
    strategies: data.portfolioKpisBaseline.strategiesCount,
    ytd:        data.portfolioKpisBaseline.ytdReturnDisplayPct,
  };

  // Secondary KPIs — computed from monthly return series
  const monthlyPcts = data.capalifeData.performanceMonthly.monthly_returns.map(r => r.return_pct);
  const bestRaw  = monthlyPcts.length ? Math.max(...monthlyPcts) : null;
  const worstRaw = monthlyPcts.length ? Math.min(...monthlyPcts) : null;
  const posCount = monthlyPcts.filter(p => p >= 0).length;

  // Calmar = annualised return / |max drawdown|
  const annNum = parseFloat((data.universal.annualizedReturn ?? "0").replace(/[^0-9.-]/g, ""));
  const ddNum  = Math.abs(parseFloat((data.universal.maxDrawdown    ?? "0").replace(/[^0-9.-]/g, "")));
  const calmar = ddNum > 0 ? (annNum / ddNum).toFixed(1) : "–";

  const secondary = {
    calmar,
    bestMonth:  bestRaw  != null ? `+${bestRaw.toFixed(1)}%`  : "–",
    worstMonth: worstRaw != null ? `${worstRaw.toFixed(1)}%`  : "–",
    posMonths:  monthlyPcts.length ? `${posCount} / ${monthlyPcts.length}` : "–",
    assets:     data.portfolioKpisBaseline.assetsCount     ?? 35,
    strategies: data.portfolioKpisBaseline.strategiesCount ?? 56,
  };

  return <MobileHomeView kpis={kpis} series={series} stats={stats} secondary={secondary} />;
}
