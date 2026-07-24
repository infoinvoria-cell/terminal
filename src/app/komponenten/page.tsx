import fs from "node:fs";
import path from "node:path";
import { ComponentsShell } from "@/components/pages/ComponentsPage";

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

function loadStrategyInventory(): StrategyInventoryRow[] {
  const dir = path.join(process.cwd(), "public", "generated", "monitoring", "signals");
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as {
            symbol?: string;
            source?: string;
            strategyName?: string;
            openTrade?: boolean;
            signalEvents?: Array<{ time?: string; direction?: string; entry?: number; sl?: number; tp?: number }>;
          };
          const evs = (raw.signalEvents ?? [])
            .filter((e) => e.time)
            .sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));
          const latest = evs[0] ?? null;
          return {
            strategyId: raw.source ?? raw.strategyName ?? "",
            symbol: raw.symbol ?? "",
            strategyName: raw.strategyName ?? "",
            openTrade: raw.openTrade === true,
            direction: latest?.direction?.toUpperCase() ?? "",
            latestSignalDate: latest?.time ?? null,
            entry: latest?.entry ?? null,
            sl: latest?.sl ?? null,
            tp: latest?.tp ?? null,
          } satisfies StrategyInventoryRow;
        } catch {
          return null;
        }
      })
      .filter((r): r is StrategyInventoryRow => r !== null && Boolean(r.symbol));
  } catch {
    return [];
  }
}

export default function KomponentenRoute() {
  const inventory = loadStrategyInventory();
  return <ComponentsShell strategyInventory={inventory} />;
}
