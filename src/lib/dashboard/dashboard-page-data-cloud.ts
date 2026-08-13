import { getCapalifeData } from "@/lib/capitalife-data";
import type { UniversalKpiStrings } from "@/components/dashboard/universal-kpi-strip";
import { buildTrackRecordOverview } from "@/lib/track-record/service";
import type { DashboardKpis } from "@/lib/trades-analytics";

const EMPTY_KPI: DashboardKpis = {
  totalReturn24mPct: 0,
  maxDrawdownPct: 0,
  netGainLossUsd: 0,
  netGainDeltaPct: 0,
  ytdReturnUsd: 0,
  ytdReturnDisplayPct: 0,
  ytdVolumeUsd: 0,
  ytdVolumeDeltaPct: 0,
  assetsCount: 0,
  strategiesCount: 0,
};

// Cloud/Vercel preview: portfolio.json is not available, so all computed KPIs are null.
// No hardcoded return values — display "—" for missing data.
const UNIVERSAL: UniversalKpiStrings = {
  riskAdjustedAum: "EUR 0",
  marketVolume: "EUR 0",
  totalReturn24m: null,
  maxDrawdown: null,
  annualizedReturn: null,
};

export async function getDashboardPageData() {
  const capalifeData = getCapalifeData();
  const trackRecordOverview = await buildTrackRecordOverview().catch(() => null);
  return {
    serialized: [],
    reportTrades: [],
    balanceRows: [],
    portfolioKpisBaseline: EMPTY_KPI,
    universal: UNIVERSAL,
    fsportfolio: undefined,
    capalifeData,
    trackRecordOverview,
    accountViews: [], // no runtime data in cloud preview
  };
}
