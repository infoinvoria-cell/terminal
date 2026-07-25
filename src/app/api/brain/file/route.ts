import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getCapitalifeBrainPath } from "@/lib/brain/brain-path";

const MAX_BYTES = 2_000_000; // 2 MB hard cap
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brain = getCapitalifeBrainPath();
  if (!brain) return NextResponse.json({ error: "Brain path not configured" }, { status: 503 });

  const rel = (req.nextUrl.searchParams.get("path") ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel) return NextResponse.json({ error: "path required" }, { status: 400 });

  const abs = path.join(brain, ...rel.split("/"));
  if (!abs.startsWith(brain)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!fs.existsSync(abs)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const stat = fs.statSync(abs);
  if (stat.isDirectory()) return NextResponse.json({ error: "is directory" }, { status: 400 });
  if (stat.size > MAX_BYTES) return NextResponse.json({ error: "file too large", size: stat.size }, { status: 413 });

  const ext = path.extname(abs).toLowerCase();
  const text = fs.readFileSync(abs, "utf8");
  return NextResponse.json({ content: text, ext, size: stat.size, mtime: stat.mtime.toISOString() });
}
