"use client";

import { useEffect, useState } from "react";
import { COMPONENT_GROUPS, GROUP_LAYOUT } from "@/lib/components/components-data";
import ComponentGroupBox from "./ComponentGroupBox";
import styles from "./ComponentBentoGrid.module.css";
import type { ComponentGroup } from "@/lib/components/components-types";

type OosStats = {
  cagr: string | null;
  maxDrawdown: string | null;
  sharpe: string | null;
  calmar: string | null;
  profitFactor: string | null;
  trades: string | null;
  positiveYears: string | null;
};

type RegistryEntry = {
  asset: string;
  versionName: string;
  sleeveName: string;
  active: boolean;
  oos: OosStats;
};

function mergeRegistryIntoGroups(groups: ComponentGroup[], registry: RegistryEntry[]): ComponentGroup[] {
  // Build lookup: TICKER_UPPER -> best active entry (prefer active)
  const byTicker = new Map<string, RegistryEntry>();
  for (const e of registry) {
    if (!e.active) continue;
    const key = String(e.asset || "").toUpperCase();
    if (!byTicker.has(key)) byTicker.set(key, e);
  }

  return groups.map((group) => ({
    ...group,
    assets: group.assets.map((asset) => {
      const key = String(asset.symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "_");
      const ticker = String(asset.symbol || "").toUpperCase();
      const entry = byTicker.get(ticker) ?? byTicker.get(key);
      if (!entry) return asset;

      const { oos, versionName } = entry;
      const hasRealStats = oos.cagr != null || oos.sharpe != null;
      if (!hasRealStats) return asset;

      return {
        ...asset,
        version: versionName || asset.version,
        modes: asset.modes.length > 0
          ? asset.modes.map((mode, i) => i === 0 ? {
              ...mode,
              stats: {
                ...mode.stats,
                cagr:          oos.cagr         ?? mode.stats.cagr,
                maxDrawdown:   oos.maxDrawdown   ?? mode.stats.maxDrawdown,
                sharpe:        oos.sharpe        ?? mode.stats.sharpe,
                calmar:        oos.calmar        ?? mode.stats.calmar,
                profitFactor:  oos.profitFactor  ?? mode.stats.profitFactor,
                trades:        oos.trades        ?? mode.stats.trades,
                wfOos:         oos.positiveYears ?? mode.stats.wfOos,
                placeholder:   false,
              },
            } : mode)
          : [{
              id: "live",
              label: versionName || "Live",
              stats: {
                count: 1,
                cagr:          oos.cagr         ?? "—",
                maxDrawdown:   oos.maxDrawdown   ?? "—",
                sharpe:        oos.sharpe        ?? "—",
                calmar:        oos.calmar        ?? "—",
                profitFactor:  oos.profitFactor  ?? "—",
                trades:        oos.trades        ?? "—",
                winrate:       "—",
                wfOos:         oos.positiveYears ?? "—",
                status:        "open" as const,
                placeholder:   false,
              },
            }],
      };
    }),
  }));
}

export default function ComponentBentoGrid() {
  const [groups, setGroups] = useState<ComponentGroup[]>(COMPONENT_GROUPS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/monitoring/strategy-registry", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const entries: RegistryEntry[] = Array.isArray(data.productionStrategies) ? data.productionStrategies : [];
        if (entries.length > 0) {
          setGroups(mergeRegistryIntoGroups(COMPONENT_GROUPS, entries));
        }
      })
      .catch(() => { /* keep static fallback */ });
    return () => { cancelled = true; };
  }, []);

  const populated = groups.filter((g) => g.assets.length > 0);

  return (
    <div className={styles.bento}>
      {populated.map((group) => {
        const layout = GROUP_LAYOUT[group.id];
        if (!layout) return null;
        return (
          <div
            key={group.id}
            className={styles.cell}
            style={{
              gridColumn: `${layout.colStart} / span ${layout.colSpan}`,
              gridRow: layout.row,
            }}
          >
            <ComponentGroupBox group={group} />
          </div>
        );
      })}
    </div>
  );
}
