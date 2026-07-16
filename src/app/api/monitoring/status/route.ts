import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MANIFEST_PATHS = [
  // .capitalife-cache first
  process.env.INVORIA_MONITORING_CACHE_DIR
    ? path.join(process.env.INVORIA_MONITORING_CACHE_DIR, "manifest.json")
    : null,
  path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? "",
    ".capitalife-cache/invoria-monitoring/manifest.json"
  ),
  // fallback: cache_manifest in public
  path.join(
    process.cwd(),
    "public/generated/monitoring/tradingview_data_cache/cache_manifest_full.json"
  ),
].filter(Boolean) as string[];

function readFirstExisting(paths: string[]) {
  for (const p of paths) {
    try {
      return { path: p, data: JSON.parse(fs.readFileSync(p, "utf-8")) };
    } catch {
      // try next
    }
  }
  return null;
}

export async function GET() {
  const result = readFirstExisting(MANIFEST_PATHS);

  if (!result) {
    return NextResponse.json(
      {
        status: "missing",
        message: "No monitoring manifest found. Run: npm run monitoring:refresh",
        searched: MANIFEST_PATHS,
      },
      { status: 404 }
    );
  }

  const { data } = result;

  // Normalize between our manifest schema and the raw cache_manifest schema
  const summary = data.schema === "white_swan_monitoring_manifest_v1"
    ? {
        status: "ok",
        updated_at: data.updated_at,
        target_date: data.target_date,
        total_assets: data.total_assets,
        ok_count: data.ok_count,
        stale_count: data.stale_count,
        missing_count: data.missing_count,
        last_bar_date_min: data.last_bar_date_min,
        last_bar_date_max: data.last_bar_date_max,
        coverage_note: data.coverage_note,
        source: "white_swan_manifest",
      }
    : {
        status: "ok",
        updated_at: data.generatedAt,
        target_date: "2026-07-09",
        total_assets: data.assets?.length ?? 0,
        ok_count: data.assets?.filter((a: { status?: string; lastDate?: string }) =>
          a.status === "loaded" && (a.lastDate ?? "") >= "2026-07-06"
        ).length ?? 0,
        stale_count: 0,
        missing_count: 0,
        source: "cache_manifest_full",
      };

  return NextResponse.json(summary);
}
