import { collectDarwinexSnapshotBundle } from "@/lib/track-record/darwinex";
import { getTrackRecordEnv } from "@/lib/track-record/env";
import { buildHistoricalTrackRecordBundle, getHistoricalTrackRecordSummary } from "@/lib/track-record/historical";
import { collectMyfxbookSnapshotBundle } from "@/lib/track-record/myfxbook";
import { loadTrackRecordOverviewRows, persistTrackRecordBundle } from "@/lib/track-record/repository";
import type { SyncMode, TrackRecordOverview, TrackRecordSnapshotBundle, VerificationBadge } from "@/lib/track-record/types";

export async function buildTrackRecordOverview(): Promise<TrackRecordOverview> {
  const env = getTrackRecordEnv();
  const historical = getHistoricalTrackRecordSummary();
  const historicalBundle = buildHistoricalTrackRecordBundle();
  const live = await loadTrackRecordOverviewRows().catch(() => ({
    syncRows: [],
    accountRows: [],
    metrics: [],
    productiveDatabaseSchemaAvailable: false,
    historicalPersistenceVerified: false,
  }));
  const publicSyncRows = live.syncRows.map(sanitizeSyncRow);
  const publicAccounts = live.accountRows.map(sanitizeAccountRow);
  const publicMetrics = [...historicalBundle.metrics, ...live.metrics].map(sanitizeMetricRow);
  const blockers = deriveReadinessBlockers(env, historical, live.historicalPersistenceVerified);
  const readinessTotal = 9;
  const readinessCompleted = readinessTotal - blockers.length;
  return {
    generatedAtUtc: new Date().toISOString(),
    historical: {
      monthlySource: historical.monthlySource,
      statementSource: historical.statementSource,
      myfxbookVisibleSource: historical.myfxbookVisibleSource,
      officialKpisSource: historical.officialKpisSource,
      baselinePeriod: historical.baselinePeriod,
      firstReliableDate: historical.firstReliableDate,
      lastReliableDate: historical.lastReliableDate,
      monthlyReturnCount: historical.monthlyReturnCount,
      monthlyReturns: historical.monthlyReturns,
      normalizedClosedTradeCount: historical.normalizedClosedTradeCount,
      visibleAccount2TradeCount: historical.visibleAccount2TradeCount,
      historicalDataQuality: historical.historicalDataQuality,
      importAudit: historical.importAudit,
    },
    capabilities: {
      supabaseConfigured: env.hasSupabase,
      productiveDatabaseSchemaAvailable: live.productiveDatabaseSchemaAvailable,
      historicalPersistenceVerified: live.historicalPersistenceVerified,
      myfxbookCredentialsPresent: env.hasMyfxbookCredentials,
      darwinexCredentialsPresent: env.hasDarwinexCredentials,
      myfxbookAccountIdPresent: env.hasMyfxbookAccountId,
      darwinexProductIdPresent: env.hasDarwinexProductId,
      vercelDetected: env.vercelDetected,
      vercelStaticIpConfigured: env.vercelStaticIpConfigured,
    },
    live: {
      syncRows: publicSyncRows,
      accountRows: publicAccounts,
      metrics: publicMetrics,
      badges: deriveBadges(publicSyncRows, publicMetrics),
    },
    readiness: {
      completed: readinessCompleted,
      total: readinessTotal,
      percent: Math.round((readinessCompleted / readinessTotal) * 100),
      blockers,
    },
    notes: [
      "Historical JSON and statement files remain the baseline and are not overwritten by sync jobs.",
      "Myfxbook timestamps arrive in broker-local time; UTC normalization is exact only when MYFXBOOK_BROKER_TIMEZONE is configured.",
      !env.vercelStaticIpConfigured
        ? "A fixed egress IP is not evidenced by configuration; production Myfxbook sync remains blocked until Vercel Static IPs or a fixed-egress worker is verified."
        : "Fixed egress IP is marked as configured; deployment-level verification remains required.",
      "Darwinex data is kept distinct from broker/Myfxbook/internal-calculated rows to prevent silent source mixing.",
      live.historicalPersistenceVerified
        ? "Historical import is evidenced in the configured database."
        : "Productive DB migration/import is not evidenced; the UI must keep the migration-pending status.",
    ],
  };
}

export async function runTrackRecordSync(options: {
  provider: "historical" | "myfxbook" | "darwinex" | "all";
  mode: SyncMode;
  persist: boolean;
}) {
  const bundles: TrackRecordSnapshotBundle[] = [];
  if (options.provider === "historical" || options.provider === "all") {
    bundles.push(buildHistoricalTrackRecordBundle());
  }
  if (options.provider === "myfxbook" || options.provider === "all") {
    bundles.push(await collectMyfxbookSnapshotBundle({ mode: options.mode }));
  }
  if (options.provider === "darwinex" || options.provider === "all") {
    bundles.push(await collectDarwinexSnapshotBundle({ mode: options.mode }));
  }

  const persistence = [];
  if (options.persist) {
    for (const bundle of bundles) {
      persistence.push(await persistTrackRecordBundle(bundle, {
        appendOnly: bundle.syncStatus.some((row) => row.provider === "historical"),
      }));
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
  const now = Date.now();
  const verifiedRows = syncRows.filter((row) =>
    row.mode === "live"
    && row.health === "ok"
    && row.lastSuccessAtUtc !== null
    && (row.staleAfterUtc === null || Date.parse(row.staleAfterUtc) > now),
  );
  if (verifiedRows.some((row) => row.source === "myfxbook")) badges.add("Myfxbook verifiziert");
  if (verifiedRows.some((row) => row.source === "darwinex_darwin")) badges.add("Darwinex verifiziert");
  if (metrics.some((row) => row.source === "broker_raw")) badges.add("Broker");
  if (syncRows.some((row) => row.health === "stale")) badges.add("Daten veraltet");
  if (syncRows.some((row) => row.health === "error")) badges.add("Quellenabweichung");
  return [...badges];
}

function sanitizeSyncRow(row: TrackRecordOverview["live"]["syncRows"][number]) {
  return { ...row, providerAccountId: publicProviderId(row.provider, row.providerAccountId) };
}

function sanitizeAccountRow(row: TrackRecordOverview["live"]["accountRows"][number]) {
  return {
    ...row,
    providerAccountId: publicProviderId(row.provider, row.providerAccountId),
    accountNumberMasked: null,
  };
}

function sanitizeMetricRow(row: TrackRecordOverview["live"]["metrics"][number]) {
  return { ...row, providerAccountId: publicProviderId(row.provider, row.providerAccountId) };
}

function publicProviderId(provider: string, value: string) {
  if (provider === "historical") return value;
  if (!value || value === "global") return value;
  return `${provider}-configured`;
}

function deriveReadinessBlockers(
  env: ReturnType<typeof getTrackRecordEnv>,
  historical: ReturnType<typeof getHistoricalTrackRecordSummary>,
  historicalPersistenceVerified: boolean,
) {
  const blockers: string[] = [];
  if (historical.historicalDataQuality !== ("complete" as string)) blockers.push("Vollständige Broker-Rohhistorie fehlt");
  if (!historicalPersistenceVerified) blockers.push("Produktive DB-Migration und historischer Import sind nicht verifiziert");
  if (!env.hasMyfxbookCredentials || !env.hasMyfxbookAccountId) blockers.push("Myfxbook-Credentials oder Account-ID fehlen");
  if (!env.vercelStaticIpConfigured) blockers.push("Feste Egress-IP für Myfxbook ist nicht nachgewiesen");
  if (!env.hasDarwinexCredentials || !env.hasDarwinexProductId) blockers.push("Darwinex-Credentials oder Product-ID fehlen");
  blockers.push("Cashflows sind nicht vollständig dokumentiert");
  blockers.push("Historische Kostenparität zum IBKR-Zielmodell ist offen");
  blockers.push("IBKR-Account, Contract-Mapping und regulatorische Freigabe sind offen");
  return blockers.slice(0, 8);
}
