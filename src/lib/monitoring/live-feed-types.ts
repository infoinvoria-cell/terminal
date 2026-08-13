export type LiveFeedItem = {
  symbol: string;
  tab: string;
  source: string;
  lastClose: number | null;
  changePct: number | null;
  lastDate: string | null;
  refreshedAt: string | null;
  firstDate: string | null;
  barCount: number | null;
  dataStatus: "live" | "daily" | "missing";
  liveRefreshSeconds: number | null;
};

export type MonitoringLiveFeedStatus =
  | "realtime"
  | "delayed"
  | "stale"
  | "offline"
  | "unavailable";

export type MonitoringLiveFeedCoverageStatus =
  | "complete"
  | "partial"
  | "missing";

export type MonitoringLiveFeedSourceQuality =
  | "realtime"
  | "delayed"
  | "stale"
  | "historical_only"
  | "unavailable";

export type MonitoringLiveFeedRow = {
  instrumentId: string;
  ticker: string;
  name: string;
  venue: string | null;
  tab: string;
  usedBy: string[];
  source: string;
  price: number | null;
  pricePrecision: number | null;
  provider: string | null;
  feedStatus: MonitoringLiveFeedStatus;
  delaySeconds: number | null;
  expectedDelaySeconds: number | null;
  freshnessSeconds: number | null;
  sourceQuality: MonitoringLiveFeedSourceQuality;
  lastUpdateUtc: string | null;
  dataStartUtc: string | null;
  dataEndUtc: string | null;
  dataRowCount: number | null;
  coverageStatus: MonitoringLiveFeedCoverageStatus;
};

export type MonitoringLiveFeedUniverseCounts = {
  monitoring: number;
  whiteSwan: number;
  coreInvest: number;
  deduped: number;
};

export type DataHealthSourceStatus =
  | "live"       // freshly fetched from upstream
  | "degraded"   // upstream failed but LKG is recent (< 5 min)
  | "stale"      // LKG exists but is older than 5 min
  | "unavailable"; // no LKG at all

export type MonitoringDataHealth = {
  sourceHealth: DataHealthSourceStatus;
  lastSuccessfulFetchUtc: string | null;
  dataTimestampUtc: string | null;
  ageSeconds: number | null;
  errorCode?: string;
};

export type MonitoringLiveFeedResponse = {
  items: MonitoringLiveFeedRow[];
  pollingSeconds: number;
  countdownMode: "polling" | "live";
  asOf: string;
  universeCounts: MonitoringLiveFeedUniverseCounts;
  dataHealth: MonitoringDataHealth;
};
