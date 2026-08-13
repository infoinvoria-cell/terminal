import "server-only";

import { unstable_cache } from "next/cache";
import { getDashboardPageData } from "@/lib/dashboard/dashboard-page-data";
import { getAgriFinalStatus } from "@/lib/server/monitoring/agriFinalStatus";
import { loadSpyDailyReturns } from "@/lib/benchmark/spy-data";

type TtlCacheEntry<T> = {
  value: Promise<T>;
  expiresAt: number;
};

let dashboardPageDataCache: TtlCacheEntry<Awaited<ReturnType<typeof getDashboardPageData>>> | null = null;

// The dashboard payload is several megabytes large. Using unstable_cache here
// causes Next data-cache writes to fail during build/runtime. Keep it in the
// current server process with a short TTL instead of forcing it into the
// persistent route cache.
export async function getCachedDashboardPageData() {
  const now = Date.now();
  if (dashboardPageDataCache && dashboardPageDataCache.expiresAt > now) {
    return dashboardPageDataCache.value;
  }

  const value = getDashboardPageData();
  dashboardPageDataCache = {
    value,
    expiresAt: now + 300_000,
  };
  return value;
}

export const getCachedSpyDailyReturns = unstable_cache(
  async () => loadSpyDailyReturns(),
  ["page-cache:spy-daily-returns"],
  { revalidate: 3600, tags: ["page:spy-data"] },
);

export const getCachedAgriFinalStatus = unstable_cache(
  async () => getAgriFinalStatus(),
  ["page-cache:monitoring-agri-status"],
  { revalidate: 120, tags: ["page:monitoring-agri-status"] },
);
