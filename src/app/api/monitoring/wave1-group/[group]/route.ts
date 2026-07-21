import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const VALID_GROUPS = new Set(["agrar", "intraday", "indices"]);

function readJsonSafe(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch { return null; }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ group: string }> }
) {
  const { group } = await params;
  if (!VALID_GROUPS.has(group)) {
    return NextResponse.json({ error: "Unknown group" }, { status: 400 });
  }

  // 1. Try local files (monitoring engine output, gitignored)
  const base = path.join(process.cwd(), "public/generated/monitoring/wave1", group);
  if (fs.existsSync(base)) {
    const manifest = readJsonSafe(path.join(base, "group_manifest.json"));
    const signals  = readJsonSafe(path.join(base, "signals.json"));
    const statuses = readJsonSafe(path.join(base, "status.json"));
    const cards    = readJsonSafe(path.join(base, "cards.json"));
    const charts   = readJsonSafe(path.join(base, "charts.json"));

    if (manifest || signals) {
      return NextResponse.json({ group, manifest, signals, statuses, cards, charts, source: "local" });
    }
  }

  // 2. Fall back to Supabase wave1_groups table
  try {
    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from("wave1_groups")
      .select("group_id, manifest, signals, statuses, cards, charts, generated_at")
      .eq("group_id", group)
      .single();

    if (error || !data) {
      return NextResponse.json({ group, manifest: null, signals: null, statuses: null, cards: null, charts: null, source: "none" });
    }

    return NextResponse.json({
      group,
      manifest:  data.manifest,
      signals:   data.signals,
      statuses:  data.statuses,
      cards:     data.cards,
      charts:    data.charts ?? null,
      source: "supabase",
      generatedAt: data.generated_at,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
