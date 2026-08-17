import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { MOBILE_BRAIN_DOC_WHITELIST, isSafePath, redactString } from "@/lib/mobile/redact";
import type { MobileBrainDocResponse, MobileBrainProjectionDoc } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTENT_BYTES = 32_000;

function loadFromProjection(id: string): MobileBrainProjectionDoc | null {
  const docPath = path.join(process.cwd(), "public", "data", "mobile-brain", `${id}.json`);
  if (!fs.existsSync(docPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(docPath, "utf-8")) as MobileBrainProjectionDoc;
  } catch { return null; }
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<MobileBrainDocResponse | { error: string }>> {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const now = new Date().toISOString();

  if (!id || !Object.prototype.hasOwnProperty.call(MOBILE_BRAIN_DOC_WHITELIST, id)) {
    return NextResponse.json(
      { error: `Unknown document ID: "${id}". Available: ${Object.keys(MOBILE_BRAIN_DOC_WHITELIST).join(", ")}` },
      { status: 404 },
    );
  }

  const docMeta = MOBILE_BRAIN_DOC_WHITELIST[id]!;

  if (!isSafePath(docMeta.relPath)) {
    return NextResponse.json({ error: "Internal: unsafe document path" }, { status: 500 });
  }

  const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim();

  // ── Local vault path ──────────────────────────────────────────────────────
  if (brainPath && fs.existsSync(brainPath)) {
    const fullPath = path.join(brainPath, docMeta.relPath);
    const resolvedPath = path.resolve(fullPath);
    const resolvedBrain = path.resolve(brainPath);
    if (!resolvedPath.startsWith(resolvedBrain)) {
      return NextResponse.json({ error: "Path traversal detected" }, { status: 403 });
    }

    try {
      if (!fs.existsSync(fullPath)) {
        // Vault configured but file missing: try projection fallback
        const proj = loadFromProjection(id);
        if (proj) {
          return NextResponse.json({
            available: true,
            id,
            title: proj.title,
            category: proj.category,
            content: proj.content,
            source: "projection",
            updatedAt: proj.updatedAt,
            snapshotAt: proj.snapshotAt,
            stale: proj.stale,
            truncated: proj.truncated,
            maxBytes: MAX_CONTENT_BYTES,
            timestamp: now,
          });
        }
        return NextResponse.json({
          available: false,
          id,
          reason: "not-found",
          source: "none",
          timestamp: now,
        });
      }

      const stat = fs.statSync(fullPath);
      const raw = fs.readFileSync(fullPath, "utf-8");
      const truncated = Buffer.byteLength(raw, "utf-8") > MAX_CONTENT_BYTES;
      const sliced = truncated ? raw.slice(0, MAX_CONTENT_BYTES) + "\n\n*[truncated]*" : raw;
      const safeContent = redactString(sliced);

      return NextResponse.json({
        available: true,
        id,
        title: docMeta.title,
        category: docMeta.category,
        content: safeContent,
        source: "vault",
        updatedAt: stat.mtime.toISOString(),
        snapshotAt: null,
        stale: false,
        truncated,
        maxBytes: MAX_CONTENT_BYTES,
        timestamp: now,
      });
    } catch {
      return NextResponse.json({
        available: false,
        id,
        reason: "brain-not-configured",
        source: "none",
        timestamp: now,
      });
    }
  }

  // ── Vercel / no local vault: serve from static projection ─────────────────
  const proj = loadFromProjection(id);
  if (proj) {
    return NextResponse.json({
      available: true,
      id,
      title: proj.title,
      category: proj.category,
      content: proj.content,
      source: "projection",
      updatedAt: proj.updatedAt,
      snapshotAt: proj.snapshotAt,
      stale: proj.stale,
      truncated: proj.truncated,
      maxBytes: MAX_CONTENT_BYTES,
      timestamp: now,
    });
  }

  return NextResponse.json({
    available: false,
    id,
    reason: "projection-only",
    source: "none",
    timestamp: now,
  });
}
