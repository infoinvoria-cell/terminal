import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

type SleeveAsset = {
  asset?: string;
  label?: string;
  status?: string;
  active?: boolean;
  direction?: string;
  strategyType?: string;
  sourceSymbol?: string;
  timeframe?: string;
};

type Sleeve = {
  name?: string;
  status?: string;
  assets?: SleeveAsset[];
};

type SleevesFile = { sleeves?: Sleeve[] };

type UniverseAsset = { symbol?: string; name?: string; tab?: string; timeframe?: string };

type ProductionStrategyEntry = {
  asset: string;
  label: string;
  sourceSymbol: string;
  timeframe: string;
  active: boolean;
  status: string;
  strategyType: "macro" | "seasonal" | "valuation" | "portfolio";
  sleeveName: string;
};

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function loadFromSleeves(): ProductionStrategyEntry[] | null {
  const workspacePath = process.env.INVORIA_WORKSPACE_PATH
    ?? path.join(process.cwd(), "..", "Invoria Dashboard");
  const sleevesPath = path.join(workspacePath, "workspace", "input", "strategy_registry", "final_production_sleeves.json");
  const json = readJson<SleevesFile>(sleevesPath);
  if (!json?.sleeves) return null;

  const results: ProductionStrategyEntry[] = [];
  for (const sleeve of json.sleeves) {
    if (!["Final", "Final Candidate"].includes(sleeve.status ?? "")) continue;
    for (const asset of sleeve.assets ?? []) {
      if (!["Final", "Final Candidate"].includes(asset.status ?? "")) continue;
      if (!asset.asset) continue;
      const rawType = asset.strategyType ?? "macro";
      const strategyType: ProductionStrategyEntry["strategyType"] =
        ["macro","seasonal","valuation","portfolio"].includes(rawType)
          ? (rawType as ProductionStrategyEntry["strategyType"])
          : "macro";
      results.push({
        asset: asset.asset,
        label: asset.label ?? asset.asset,
        sourceSymbol: asset.sourceSymbol ?? asset.asset,
        timeframe: asset.timeframe ?? "1D",
        active: asset.active !== false,
        status: asset.status ?? "Final",
        strategyType,
        sleeveName: sleeve.name ?? "",
      });
    }
  }
  return results.length > 0 ? results : null;
}

function loadFromUniverse(): ProductionStrategyEntry[] {
  const universePath = path.join(
    process.cwd(),
    "public", "generated", "monitoring", "config", "monitoring_asset_universe.json"
  );
  const json = readJson<{ assets?: UniverseAsset[] }>(universePath);
  if (!json?.assets) return [];

  return json.assets
    .filter((a): a is UniverseAsset & { symbol: string } => Boolean(a.symbol))
    .map((a) => ({
      asset: a.symbol,
      label: a.name ?? a.symbol,
      sourceSymbol: a.symbol,
      timeframe: (a.timeframe ?? "1D").replace(/^D$/, "1D"),
      active: true,
      status: "Final",
      strategyType: "macro" as const,
      sleeveName: a.tab ?? "Agrar",
    }));
}

export async function GET() {
  const fromSleeves = loadFromSleeves();
  const productionStrategies = fromSleeves ?? loadFromUniverse();

  return NextResponse.json({
    productionStrategies,
    count: productionStrategies.length,
    source: fromSleeves ? "final_production_sleeves" : "monitoring_universe",
  });
}

export async function POST() {
  return NextResponse.json({ error: "read only" }, { status: 405 });
}
