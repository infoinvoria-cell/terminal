// Build an asset's "exposure web": the regions, scenarios and correlated peers
// it is connected to, derived from the impact map + stress scenarios.

import { EVENT_IMPACT_MAP, REGION_LABELS, IMPACT_SYMBOL_TO_ID, ID_TO_IMPACT_SYMBOL, type ImpactDirection } from "@/lib/globe/eventImpactMap";
import { SCENARIOS } from "@/lib/globe/scenarios";

export type ExposureRegion = { region: string; label: string; direction: ImpactDirection };
export type ExposureScenario = { id: string; label: string; pct: number };
export type ExposurePeer = { ticker: string; assetId: string | null; shared: number };

export type Exposure = {
  ticker: string;
  regions: ExposureRegion[];
  scenarios: ExposureScenario[];
  peers: ExposurePeer[];
};

export function buildExposure(assetId: string): Exposure | null {
  const ticker = ID_TO_IMPACT_SYMBOL[assetId];
  if (!ticker) return null;

  const regions: ExposureRegion[] = Object.entries(EVENT_IMPACT_MAP)
    .filter(([, imp]) => imp.assets.includes(ticker))
    .map(([region, imp]) => ({ region, label: REGION_LABELS[region] ?? region, direction: imp.direction }));

  const scenarios: ExposureScenario[] = SCENARIOS.flatMap((s) => {
    const eff = s.effects.find((e) => e.ticker === ticker);
    return eff ? [{ id: s.id, label: s.label, pct: eff.pct }] : [];
  });

  // Peers: other tickers that co-occur in the same regions/scenarios, ranked by
  // how many contexts they share with this asset.
  const shareCount = new Map<string, number>();
  for (const [, imp] of Object.entries(EVENT_IMPACT_MAP)) {
    if (!imp.assets.includes(ticker)) continue;
    for (const t of imp.assets) if (t !== ticker) shareCount.set(t, (shareCount.get(t) ?? 0) + 1);
  }
  for (const s of SCENARIOS) {
    if (!s.effects.some((e) => e.ticker === ticker)) continue;
    for (const e of s.effects) if (e.ticker !== ticker) shareCount.set(e.ticker, (shareCount.get(e.ticker) ?? 0) + 1);
  }
  const peers: ExposurePeer[] = [...shareCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t, shared]) => ({ ticker: t, assetId: IMPACT_SYMBOL_TO_ID[t] ?? null, shared }));

  return { ticker, regions, scenarios, peers };
}
