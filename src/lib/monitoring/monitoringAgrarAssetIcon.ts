import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";

/** @deprecated Use getMonitoringAssetIconUrl — kept for existing imports. */
export function getMonitoringAgrarAssetIconUrl(input: {
  code?: string | null;
  assetId?: string | null;
  name?: string | null;
  source?: string | null;
  tv?: string | null;
}): string | null {
  return getMonitoringAssetIconUrl(input);
}
