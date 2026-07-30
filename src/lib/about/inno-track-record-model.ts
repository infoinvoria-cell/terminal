import type { InnoHeroMetric } from "@/lib/about/about-inno-data";
import type { TrackRecordOverview } from "@/lib/track-record/types";

export type InnoReadinessItem = {
  label: string;
  done: boolean;
  status: string;
};

export type InnoTrackRecordRuntimeModel = {
  heroMetrics: InnoHeroMetric[];
  readiness: InnoReadinessItem[];
  lastSuccessfulSync: string | null;
  myfxbookStatus: string;
  darwinexStatus: string;
  databaseStatus: string;
  dataAgeStatus: string;
  dataQualityStatus: string;
  annualization: {
    reported: string;
    recalculated: string;
    alternative: string;
    difference: string;
    explanation: string;
  };
};

export function buildInnoTrackRecordRuntimeModel(
  overview: TrackRecordOverview,
): InnoTrackRecordRuntimeModel {
  const liveRows = overview.live.syncRows.filter((row) =>
    row.mode === "live" && (row.provider === "myfxbook" || row.provider === "darwinex"),
  );
  const successfulRows = liveRows.filter((row) => row.health === "ok" && row.lastSuccessAtUtc);
  const lastSuccessfulSync = successfulRows
    .map((row) => row.lastSuccessAtUtc)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const reported = metricNumber(overview, "annualized_return_reported_pct");
  const recalculated = metricNumber(overview, "annualized_return_recalculated_pct");
  const difference = metricNumber(overview, "annualization_difference_percentage_points");
  const monthlyGeometricAnnualized = metricNumber(overview, "monthly_geometric_annualized_return_pct");

  const myfxbookStatus = providerStatus(overview, "myfxbook");
  const darwinexStatus = providerStatus(overview, "darwinex");
  const egressOpen = !overview.capabilities.vercelStaticIpConfigured;
  const databaseStatus = overview.capabilities.historicalPersistenceVerified
    ? "Produktive Historie verifiziert"
    : "Produktive DB-Migration ausstehend";
  const dataQualityStatus = overview.historical.historicalDataQuality === "complete"
    ? "Vollständig"
    : overview.historical.historicalDataQuality === "partial"
      ? "Teilweise belegt"
      : "Rohdaten unvollständig";

  return {
    heroMetrics: [
      {
        label: "Historischer Track Record",
        value: overview.historical.baselinePeriod,
        sub: `${overview.historical.monthlyReturnCount} Monatswerte · letzter belastbarer Punkt ${overview.historical.lastReliableDate ?? "nicht verfügbar"}`,
        source: overview.historical.monthlySource,
      },
      {
        label: "Myfxbook",
        value: myfxbookStatus,
        sub: egressOpen
          ? "Live-Verbindung technisch vorbereitet · feste Egress-IP offen"
          : "Feste Egress-IP als konfiguriert markiert",
        source: "source_sync_status / Myfxbook API",
      },
      {
        label: "Darwinex",
        value: darwinexStatus,
        sub: "DARWIN-bezogene externe Verifizierungsdaten; getrennt vom Brokerkonto",
        source: "source_sync_status / Darwinex APIs",
      },
      {
        label: "Datenqualität / CTO",
        value: `${dataQualityStatus} · ${overview.readiness.completed}/${overview.readiness.total}`,
        sub: `${overview.historical.normalizedClosedTradeCount} normalisierte Teilhistorie-Trades · ${databaseStatus} · ${overview.readiness.blockers.length} Blocker`,
        source: "Track-Record-Service v2",
      },
    ],
    readiness: [
      { label: "Strategie beschrieben", done: true, status: "Belegt" },
      { label: "Historischer Track Record vorhanden", done: overview.historical.monthlyReturnCount > 0, status: dataQualityStatus },
      { label: "Vollständige Broker-Rohhistorie", done: overview.historical.historicalDataQuality === "complete", status: dataQualityStatus },
      { label: "Produktive DB-Migration und Historienimport", done: overview.capabilities.historicalPersistenceVerified, status: databaseStatus },
      { label: "Myfxbook produktiv verbunden", done: myfxbookStatus === "Live", status: myfxbookStatus },
      { label: "Darwinex produktiv verbunden", done: darwinexStatus === "Live", status: darwinexStatus },
      { label: "Feste Egress-IP nachgewiesen", done: !egressOpen, status: egressOpen ? "Offen" : "Belegt" },
      { label: "Cashflows und Kosten vollständig", done: false, status: "Nicht dokumentiert" },
      { label: "IBKR-Konfiguration und Freigabe", done: false, status: "Offen" },
    ],
    lastSuccessfulSync,
    myfxbookStatus,
    darwinexStatus,
    databaseStatus,
    dataAgeStatus: lastSuccessfulSync ? freshnessLabel(lastSuccessfulSync) : "Kein echter Live-Sync",
    dataQualityStatus,
    annualization: {
      reported: formatPercent(reported),
      recalculated: formatPercent(recalculated),
      alternative: formatPercent(monthlyGeometricAnnualized),
      difference: difference === null ? "nicht berechenbar" : `${difference.toFixed(2)} Prozentpunkte`,
      explanation: `Berichtswert: 35,2 %, Formel und Randmonatsbehandlung im Bericht nicht dokumentiert. Aus Berichtsreturn neu berechnet: 35,77 % = (1 + 97,2 %)^(1 / 2,22044258) - 1 über 11.04.2024 bis 01.07.2026. Nicht direkt vergleichbarer Alternativwert: ${formatPercent(monthlyGeometricAnnualized)} aus der geometrischen Verknüpfung aller 28 Monatswerte zu 114,48 %; April 2024 und Juli 2026 werden trotz unvollständiger Randperioden einbezogen. Cashflow-Bereinigung und vollständige Kostenparität sind nicht verifizierbar.`,
    },
  };
}

function providerStatus(overview: TrackRecordOverview, provider: "myfxbook" | "darwinex") {
  const configured = provider === "myfxbook"
    ? overview.capabilities.myfxbookCredentialsPresent && overview.capabilities.myfxbookAccountIdPresent
    : overview.capabilities.darwinexCredentialsPresent && overview.capabilities.darwinexProductIdPresent;
  if (!configured) return "Live-Verbindung nicht konfiguriert";
  const row = overview.live.syncRows.find((entry) => entry.provider === provider && entry.mode === "live");
  if (!row) return "Konfiguriert · noch nicht synchronisiert";
  if (row.health === "error") return "Provider nicht erreichbar";
  if (row.health === "stale" || (row.staleAfterUtc && Date.parse(row.staleAfterUtc) <= Date.now())) return "Live-Sync veraltet";
  return row.health === "ok" && row.lastSuccessAtUtc ? "Live" : "Konfiguriert · noch nicht synchronisiert";
}

function metricNumber(overview: TrackRecordOverview, name: string) {
  const value = overview.live.metrics.find((metric) => metric.metricName === name)?.metricValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatPercent(value: number | null) {
  return value === null ? "nicht berechenbar" : `${value.toFixed(2)} %`;
}

function freshnessLabel(iso: string) {
  const ageMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ageMs) || ageMs < 0) return "Zeitstempel ungültig";
  if (ageMs <= 60 * 60 * 1000) return "Aktuell";
  if (ageMs <= 24 * 60 * 60 * 1000) return "Heute aktualisiert";
  return "Live-Sync veraltet";
}
