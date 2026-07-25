import { getCapalifeData } from "@/lib/capitalife-data";
import type { UniversalKpiStrings } from "@/components/dashboard/universal-kpi-strip";
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

const UNIVERSAL: UniversalKpiStrings = {
  riskAdjustedAum: "EUR 0",
  marketVolume: "EUR 0",
  totalReturn24m: "+97.2%",
  maxDrawdown: "-11.76%",
  compoundedReturn: "+114.6%",
  annualizedReturn: "35.2%",
};

export async function getDashboardPageData() {
  const capalifeData = getCapalifeData();
  return {
    serialized: [],
    reportTrades: [],
    balanceRows: [],
    portfolioKpisBaseline: EMPTY_KPI,
    universal: UNIVERSAL,
    fsportfolio: undefined,
    capalifeData,
  };
}
