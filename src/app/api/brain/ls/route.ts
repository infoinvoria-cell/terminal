import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getCapitalifeBrainPath } from "@/lib/brain/brain-path";

const HIDDEN = new Set([".git", ".obsidian", ".claude", "node_modules", ".graphifyignore", ".gitignore", "_link_backup"]);

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brain = getCapitalifeBrainPath();
  if (!brain) return NextResponse.json({ error: "Brain path not configured" }, { status: 503 });

  const rel = (req.nextUrl.searchParams.get("path") ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const abs = rel ? path.join(brain, ...rel.split("/")) : brain;

  // path traversal guard
  if (!abs.startsWith(brain)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!fs.existsSync(abs)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) return NextResponse.json({ error: "not a directory" }, { status: 400 });

  const entries = fs.readdirSync(abs, { withFileTypes: true })
    .filter(e => !HIDDEN.has(e.name) && !e.name.startsWith("."))
    .map(e => ({
      name: e.name,
      isDir: e.isDirectory(),
      ext: e.isDirectory() ? null : path.extname(e.name).toLowerCase(),
    }))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return NextResponse.json({ entries, path: rel || "" });
}
