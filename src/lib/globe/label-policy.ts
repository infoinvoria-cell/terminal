export type GlobeLabelCandidate = {
  assetId?: string;
  kind?: string;
  category?: string;
  eventSeverity?: string;
  isCluster?: boolean;
  isCrossEndpoint?: boolean;
  lat: number;
  lng: number;
};

export type GlobeLabelPolicyOptions = {
  selectedAssetId: string;
  detailLevel: 1 | 2 | 3;
  satelliteMode: boolean;
  physicalIntelEnabled: boolean;
};

function priority(candidate: GlobeLabelCandidate, selectedAssetId: string): number {
  if (candidate.assetId === selectedAssetId) return 100;
  if (candidate.kind === "event" && ["high", "critical"].includes(String(candidate.eventSeverity || "").toLowerCase())) return 90;
  if (candidate.kind === "region" && candidate.category === "Physical Intelligence") return 85;
  if (candidate.kind === "event") return 75;
  if (candidate.kind === "region") return 65;
  if (candidate.isCluster) return 60;
  if (candidate.isCrossEndpoint) return 55;
  if (candidate.kind === "ship") return 45;
  return 30;
}

function allowedAtDetail(candidate: GlobeLabelCandidate, options: GlobeLabelPolicyOptions): boolean {
  if (options.satelliteMode) {
    return candidate.assetId === options.selectedAssetId
      || (options.physicalIntelEnabled && candidate.category === "Physical Intelligence")
      || (candidate.kind === "event" && ["high", "critical"].includes(String(candidate.eventSeverity || "").toLowerCase()));
  }
  if (options.detailLevel === 1) return candidate.assetId === options.selectedAssetId || Boolean(candidate.isCluster);
  if (options.detailLevel === 2) {
    return candidate.assetId === options.selectedAssetId
      || Boolean(candidate.isCluster || candidate.isCrossEndpoint)
      || ["event", "ship", "commodity", "region", "signal"].includes(String(candidate.kind));
  }
  return true;
}

export function filterGlobeLabels<T extends GlobeLabelCandidate>(
  candidates: T[],
  options: GlobeLabelPolicyOptions,
): T[] {
  const base = candidates.filter((candidate) => allowedAtDetail(candidate, options));
  const ordered = [...base].sort((a, b) => priority(b, options.selectedAssetId) - priority(a, options.selectedAssetId));
  const accepted: T[] = [];
  const minDistance = options.detailLevel === 1 ? 13 : options.detailLevel === 2 ? 9 : 6;

  for (const candidate of ordered) {
    if (candidate.assetId === options.selectedAssetId) {
      accepted.push(candidate);
      continue;
    }
    const crowded = accepted.some((other) => {
      const dx = (Number(candidate.lng) - Number(other.lng)) * Math.cos(((Number(candidate.lat) + Number(other.lat)) / 2) * Math.PI / 180);
      const dy = Number(candidate.lat) - Number(other.lat);
      return Math.sqrt(dx * dx + dy * dy) < minDistance;
    });
    if (!crowded) accepted.push(candidate);
  }
  return accepted;
}
