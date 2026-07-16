import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const UNIVERSE_PATH = path.join(
  process.cwd(),
  "..",
  "workspace",
  "monitoring_strategy_infrastructure",
  "ohlc_universe_validated.json",
);

export async function GET() {
  if (!fs.existsSync(UNIVERSE_PATH)) {
    return NextResponse.json(
      { error: "ohlc_universe_validated.json not found", hasData: false },
      { status: 404 },
    );
  }

  try {
    const raw = fs.readFileSync(UNIVERSE_PATH, "utf-8");
    const universe = JSON.parse(raw);

    const assets: UniverseEntry[] = universe.assets ?? [];
    const benchmarks: UniverseEntry[] = universe.benchmarks ?? [];

    // Build group map
    const groupMap: Record<string, GroupSummary> = {};
    for (const a of assets) {
      const g = a.group ?? "unknown";
      if (!groupMap[g]) groupMap[g] = { group: g, total: 0, usable: 0, missing: 0 };
      groupMap[g].total++;
      if (a.usable) groupMap[g].usable++;
      else groupMap[g].missing++;
    }

    // Quality breakdown
    const qualityCounts: Record<string, number> = {};
    for (const a of assets) {
      const q = deriveQuality(a);
      qualityCounts[q] = (qualityCounts[q] ?? 0) + 1;
    }

    const usableAssets = assets.filter((a) => a.usable);
    const missingAssets = assets.filter((a) => !a.exists);
    const warnAssets = assets.filter((a) => a.exists && !a.usable);

    return NextResponse.json({
      hasData: true,
      generatedAt: universe.generatedAt ?? null,
      summary: {
        totalAssets: assets.length,
        usableAssets: usableAssets.length,
        missingAssets: missingAssets.length,
        warnAssets: warnAssets.length,
        totalBenchmarks: benchmarks.length,
        usableBenchmarks: benchmarks.filter((b) => b.usable).length,
        qualityCounts,
      },
      groups: Object.values(groupMap).sort((a, b) => a.group.localeCompare(b.group)),
      assets: assets.map(mapAsset),
      benchmarks: benchmarks.map(mapBenchmark),
      missingList: missingAssets.map((a) => ({
        id: a.id,
        group: a.group,
        warnings: a.warnings,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to parse universe JSON", detail: String(err), hasData: false },
      { status: 500 },
    );
  }
}

function deriveQuality(a: UniverseEntry): string {
  if (!a.exists) return "missing";
  if (a.warnings?.some((w: string) => w.startsWith("stub"))) return "stub";
  return a.quality ?? "real";
}

function mapAsset(a: UniverseEntry) {
  return {
    id: a.id,
    group: a.group,
    csvPath: a.csvPath ?? "",
    timeframe: a.timeframe ?? "1D",
    bars: a.bars ?? 0,
    start: a.start ?? "",
    end: a.end ?? "",
    quality: deriveQuality(a),
    usable: a.usable ?? false,
    exists: a.exists ?? false,
    warnings: a.warnings ?? [],
    notes: a.notes ?? "",
    sourceType: a.sourceType ?? "",
  };
}

function mapBenchmark(b: UniverseEntry) {
  return {
    id: b.id,
    group: "benchmark_symbols",
    csvPath: b.csvPath ?? "",
    timeframe: b.timeframe ?? "1D",
    bars: b.bars ?? 0,
    start: b.start ?? "",
    end: b.end ?? "",
    quality: b.usable ? "real" : "missing",
    usable: b.usable ?? false,
    exists: b.exists ?? false,
    warnings: b.warnings ?? [],
    notes: b.notes ?? "",
  };
}

interface UniverseEntry {
  id: string;
  group?: string;
  csvPath?: string;
  timeframe?: string;
  bars?: number;
  start?: string;
  end?: string;
  quality?: string;
  usable?: boolean;
  exists?: boolean;
  warnings?: string[];
  notes?: string;
  sourceType?: string;
}

interface GroupSummary {
  group: string;
  total: number;
  usable: number;
  missing: number;
}
