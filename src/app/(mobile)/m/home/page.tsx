import { MobileScreen } from "@/components/mobile/MobileScreen";
import {
  MobileHomeView,
  type HomeKpi,
  type HomeStat,
  type SeriesPoint,
} from "@/components/mobile/home/MobileHomeView";
import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data";

// Same server-side data loader the desktop Home uses — no new data endpoint.
export const dynamic = "force-dynamic";

function buildCumulativeSeries(
  rows: { label: string; month: string; return_pct: number }[]
): SeriesPoint[] {
  let factor = 1;
  return rows.map((r) => {
    factor *= 1 + (r.return_pct || 0) / 100;
    return { label: r.label || r.month, value: (factor - 1) * 100 };
  });
}

export default async function MobileHomePage() {
  const data = await getDashboardPageData();
  const u = data.universal;
  const k = data.portfolioKpisBaseline;

  const kpis: HomeKpi[] = [
    { label: "Compounded", value: u.compoundedReturn ?? "—", positive: true },
    { label: "Annualisiert", value: u.annualizedReturn ?? "—", positive: true },
    { label: "Rendite 24M", value: u.totalReturn24m, positive: !u.totalReturn24m.startsWith("-") },
    { label: "Max Drawdown", value: u.maxDrawdown, positive: false },
  ];

  const series = buildCumulativeSeries(data.capalifeData.performanceMonthly.monthly_returns);

  const ytd = k.ytdReturnDisplayPct;
  const stats: HomeStat[] = [
    { label: "Assets", value: String(k.assetsCount) },
    { label: "Strategien", value: String(k.strategiesCount) },
    { label: "YTD", value: `${ytd >= 0 ? "+" : ""}${ytd.toFixed(1)}%` },
  ];

  return (
    <MobileScreen title="Portfolio" subtitle="Capitalife Terminal">
      <MobileHomeView kpis={kpis} series={series} stats={stats} />
    </MobileScreen>
  );
}
