import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCapitalifeBrainPath } from "@/lib/brain/brain-path";

export type NetworkNode = {
  id: string;
  label: string;
  folder: string;
  fileType: string | null;
  sourceFile: string | null;
  preview: string;
  degree: number;
  community: number | null;
  source: "brain" | "dashboard";
  x: number;
  y: number;
};

type NetworkLink = { source: string; target: string };

const NODE_CAP  = 5000;
const LINK_CAP  = 10000;

// ── In-memory cache (survives across requests in the same Node.js process) ────
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 h
let _cache: { data: ReturnType<typeof buildObsidianGraph>; ts: number; root: string } | null = null;

function getCached(vaultRoot: string) {
  const now = Date.now();
  if (_cache && _cache.root === vaultRoot && now - _cache.ts < CACHE_TTL_MS) return _cache.data;
  const data = buildObsidianGraph(vaultRoot);
  _cache = { data, ts: now, root: vaultRoot };
  return data;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^\w-]/g, "");
}

function getPreview(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("---") && !l.startsWith("tags:") && !l.startsWith("#!"))
      .slice(0, 3);
    return lines.join(" · ").slice(0, 200);
  } catch { return ""; }
}

const EXCLUDED_DIRS = new Set([".obsidian", ".trash", "node_modules", "_link_backup", "_ChatGPT_Handoff"]);

function buildObsidianGraph(vaultRoot: string): { nodes: NetworkNode[]; links: NetworkLink[] } {
  // Walk entire vault; top-level folder name is used for colouring
  const mdFiles: { filePath: string; folder: string }[] = [];

  function walk(dir: string, folder: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || EXCLUDED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, folder);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        mdFiles.push({ filePath: full, folder });
      }
    }
  }

  // Each top-level directory becomes its own "folder" label
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(vaultRoot, { withFileTypes: true }); } catch { entries = []; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || EXCLUDED_DIRS.has(entry.name)) continue;
    if (entry.isDirectory()) {
      walk(path.join(vaultRoot, entry.name), entry.name);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      mdFiles.push({ filePath: path.join(vaultRoot, entry.name), folder: "root" });
    }
  }

  // Build name→id map
  const nameToId = new Map<string, string>();
  for (const { filePath } of mdFiles) {
    const name = path.basename(filePath, ".md");
    const rel  = path.relative(vaultRoot, filePath).replace(/\\/g, "/");
    const id   = `brain:${slugify(rel)}`;
    nameToId.set(name.toLowerCase(), id);
    nameToId.set(slugify(name), id);
  }

  // Parse wiki-links per file
  const wikiLinkRe = /\[\[([^\]|#\n]+)/g;
  const fileLinks = new Map<string, string[]>();

  for (const { filePath } of mdFiles) {
    const rel = path.relative(vaultRoot, filePath).replace(/\\/g, "/");
    const id  = `brain:${slugify(rel)}`;
    let content = "";
    try { content = fs.readFileSync(filePath, "utf8"); } catch { /* skip */ }
    const targets: string[] = [];
    let m: RegExpExecArray | null;
    wikiLinkRe.lastIndex = 0;
    while ((m = wikiLinkRe.exec(content)) !== null) {
      const ref = m[1].trim();
      const targetId = nameToId.get(ref.toLowerCase()) ?? nameToId.get(slugify(ref));
      if (targetId && targetId !== id) targets.push(targetId);
    }
    fileLinks.set(id, targets);
  }

  // Degree map
  const degreeMap = new Map<string, number>();
  for (const [srcId, targets] of fileLinks) {
    for (const tgtId of targets) {
      degreeMap.set(srcId, (degreeMap.get(srcId) ?? 0) + 1);
      degreeMap.set(tgtId, (degreeMap.get(tgtId) ?? 0) + 1);
    }
  }

  // Build nodes
  const nodes: NetworkNode[] = mdFiles.map(({ filePath, folder }) => {
    const name = path.basename(filePath, ".md");
    const rel  = path.relative(vaultRoot, filePath).replace(/\\/g, "/");
    const id   = `brain:${slugify(rel)}`;
    return {
      id,
      label: name,
      folder,
      fileType: "note",
      sourceFile: rel,
      preview: getPreview(filePath),
      degree: degreeMap.get(id) ?? 0,
      community: folderCommunity(folder),
      source: "brain",
      x: 800,
      y: 540,
    };
  });

  // Deduplicated links (only between nodes in the 6 folders)
  const keepIds = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const links: NetworkLink[] = [];
  for (const [srcId, targets] of fileLinks) {
    for (const tgtId of targets) {
      if (!keepIds.has(tgtId)) continue;
      const key = [srcId, tgtId].sort().join("→");
      if (!seen.has(key)) {
        seen.add(key);
        links.push({ source: srcId, target: tgtId });
      }
    }
  }

  return { nodes, links };
}

const FOLDER_COMMUNITY: Record<string, number> = {
  "00_Index": 0,
  "04_Strategies": 1,
  "09_AI": 2,
  "13_Manuals": 3,
  "16_Backtesting_Validation": 4,
  "17_Haftungsdach_QA": 5,
};
function folderCommunity(folder: string): number {
  return FOLDER_COMMUNITY[folder] ?? 6;
}

export const revalidate = 3600;

export function GET() {
  const brainRoot = getCapitalifeBrainPath();
  if (!brainRoot) {
    return NextResponse.json({ nodes: [], links: [], message: "CAPITALIFE_BRAIN_PATH missing" });
  }

  const { nodes, links } = getCached(brainRoot);

  const cappedNodes = nodes.sort((a, b) => b.degree - a.degree).slice(0, NODE_CAP);
  const keepIds = new Set(cappedNodes.map((n) => n.id));
  const cappedLinks = links.filter((l) => keepIds.has(l.source) && keepIds.has(l.target)).slice(0, LINK_CAP);

  return NextResponse.json({ nodes: cappedNodes, links: cappedLinks });
}
