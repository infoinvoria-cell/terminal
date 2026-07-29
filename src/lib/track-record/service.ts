import { collectDarwinexSnapshotBundle } from "@/lib/track-record/darwinex";
import { getTrackRecordEnv } from "@/lib/track-record/env";
import { getHistoricalTrackRecordSummary } from "@/lib/track-record/historical";
import { collectMyfxbookSnapshotBundle } from "@/lib/track-record/myfxbook";
import { loadTrackRecordOverviewRows, persistTrackRecordBundle } from "@/lib/track-record/repository";
import type { SyncMode, TrackRecordOverview, TrackRecordSnapshotBundle, VerificationBadge } from "@/lib/track-record/types";

export async function buildTrackRecordOverview(): Promise<TrackRecordOverview> {
  const env = getTrackRecordEnv();
  const historical = getHistoricalTrackRecordSummary();
  const live = await loadTrackRecordOverviewRows();
  return {
    generatedAtUtc: new Date().toISOString(),
    historical: {
      monthlySource: historical.monthlySource,
      statementSource: historical.statementSource,
      myfxbookVisibleSource: historical.myfxbookVisibleSource,
      officialKpisSource: historical.officialKpisSource,
      baselinePeriod: historical.baselinePeriod,
    },
    capabilities: {
      supabaseConfigured: env.hasSupabase,
      myfxbookCredentialsPresent: env.hasMyfxbookCredentials,
      darwinexCredentialsPresent: env.hasDarwinexCredentials,
      myfxbookAccountIdPresent: env.hasMyfxbookAccountId,
      darwinexProductIdPresent: env.hasDarwinexProductId,
      vercelDetected: env.vercelDetected,
      vercelStaticIpConfigured: env.vercelStaticIpConfigured,
    },
    live: {
      syncRows: live.syncRows,
      accountRows: live.accountRows,
      metrics: live.metrics,
      badges: deriveBadges(live.syncRows, live.metrics),
    },
    notes: [
      "Historical JSON and statement files remain the baseline and are not overwritten by sync jobs.",
      "Myfxbook timestamps arrive in broker-local time; UTC normalization is exact only when MYFXBOOK_BROKER_TIMEZONE is configured.",
      env.vercelDetected && !env.vercelStaticIpConfigured
        ? "Vercel Static IP is not marked as enabled in environment flags; Myfxbook sync should run on a worker with fixed egress IP if allowlisting is required."
        : "Static-IP requirement appears satisfied or the app is not running on Vercel.",
      "Darwinex data is kept distinct from broker/Myfxbook/internal-calculated rows to prevent silent source mixing.",
    ],
  };
}

export async function runTrackRecordSync(options: {
  provider: "myfxbook" | "darwinex" | "all";
  mode: SyncMode;
  persist: boolean;
}) {
  const bundles: TrackRecordSnapshotBundle[] = [];
  if (options.provider === "myfxbook" || options.provider === "all") {
    bundles.push(await collectMyfxbookSnapshotBundle({ mode: options.mode }));
  }
  if (options.provider === "darwinex" || options.provider === "all") {
    bundles.push(await collectDarwinexSnapshotBundle({ mode: options.mode }));
  }

  const persistence = [];
  if (options.persist) {
    for (const bundle of bundles) {
      persistence.push(await persistTrackRecordBundle(bundle));
    }
  }

  return {
    ranAtUtc: new Date().toISOString(),
    provider: options.provider,
    mode: options.mode,
    persist: options.persist,
    bundles,
    persistence,
  };
}

function deriveBadges(
  syncRows: TrackRecordOverview["live"]["syncRows"],
  metrics: TrackRecordOverview["live"]["metrics"],
): VerificationBadge[] {
  const badges = new Set<VerificationBadge>(["intern berechnet"]);
  if (syncRows.some((row) => row.source === "myfxbook")) badges.add("Myfxbook verifiziert");
  if (syncRows.some((row) => row.source === "darwinex_darwin")) badges.add("Darwinex verifiziert");
  if (metrics.some((row) => row.source === "broker_raw")) badges.add("Broker");
  if (syncRows.some((row) => row.health === "stale")) badges.add("Daten veraltet");
  if (syncRows.some((row) => row.health === "error")) badges.add("Quellenabweichung");
  return [...badges];
}
