import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { MOBILE_BRAIN_DOC_WHITELIST } from "@/lib/mobile/redact";
import type { MobileDocManifestEntry, MobileBrainProjectionManifest } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<
  NextResponse<{
    documents: MobileDocManifestEntry[];
    projectionSnapshotAt: string | null;
    projectionDocCount: number;
  }>
> {
  // Load projection manifest metadata if available
  let projectionSnapshotAt: string | null = null;
  let projectionDocCount = 0;
  const projManifestPath = path.join(process.cwd(), "public", "data", "mobile-brain", "manifest.json");
  if (fs.existsSync(projManifestPath)) {
    try {
      const proj = JSON.parse(
        fs.readFileSync(projManifestPath, "utf-8"),
      ) as MobileBrainProjectionManifest;
      projectionSnapshotAt = proj.snapshotAt ?? null;
      projectionDocCount = proj.docCount ?? 0;
    } catch { /* ignore */ }
  }

  const documents = Object.entries(MOBILE_BRAIN_DOC_WHITELIST).map(([id, meta]) => ({
    id,
    title: meta.title,
    category: meta.category,
  }));

  return NextResponse.json({ documents, projectionSnapshotAt, projectionDocCount });
}
