import { ComponentsShell } from "@/components/pages/ComponentsPage";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Komponenten | Capitalife Terminal" };

export type StrategyInventoryRow = {
  strategyId: string;
  symbol: string;
  strategyName: string;
  openTrade: boolean;
  direction: string;
  latestSignalDate: string | null;
  entry: number | null;
  sl: number | null;
  tp: number | null;
};

async function loadStrategyInventory(): Promise<StrategyInventoryRow[]> {
  try {
    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from("forward_signals")
      .select("symbol, direction, in_position, signal_ts, strategy_id")
      .order("signal_ts", { ascending: false });

    if (error || !data) return [];

    // Deduplicate: keep latest row per symbol
    const seen = new Set<string>();
    const rows: StrategyInventoryRow[] = [];
    for (const row of data) {
      if (!row.symbol || seen.has(row.symbol)) continue;
      seen.add(row.symbol);
      rows.push({
        strategyId: row.strategy_id ?? row.symbol,
        symbol: row.symbol,
        strategyName: row.strategy_id ?? row.symbol,
        openTrade: row.in_position === true,
        direction: (row.direction ?? "").toUpperCase(),
        latestSignalDate: row.signal_ts ? row.signal_ts.slice(0, 10) : null,
        entry: null,
        sl: null,
        tp: null,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

export default async function KomponentenRoute() {
  const inventory = await loadStrategyInventory();
  return <ComponentsShell strategyInventory={inventory} />;
}
