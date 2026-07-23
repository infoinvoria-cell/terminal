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
