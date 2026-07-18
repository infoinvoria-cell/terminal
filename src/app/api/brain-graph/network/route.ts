import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCapitalifeBrainPath } from "@/lib/brain/brain-path";

export type NetworkNode = {
  id: string;
  label: string;
  fileType: string | null;
  sourceFile: string | null;
  sourceLocation: string | null;
  degree: number;
  community: number | null;
  source: "brain" | "dashboard";
  x: number;
  y: number;
};

type NetworkLink = { source: string; target: string };

const EXCLUDED_DIRS = [".obsidian", "90_Inbox"];

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^\w-]/g, "");
}

function buildObsidianGraph(vaultRoot: string): { nodes: NetworkNode[]; links: NetworkLink[] } {
  // Collect all .md files
  const mdFiles: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        mdFiles.push(full);
      }
    }
  }
  walk(vaultRoot);

  // Build name→id map (filename without .md extension)
  const nameToId = new Map<string, string>();
  for (const filePath of mdFiles) {
    const name = path.basename(filePath, ".md");
    const rel  = path.relative(vaultRoot, filePath).replace(/\\/g, "/");
    const id   = `brain:${slugify(rel)}`;
    nameToId.set(name.toLowerCase(), id);
    nameToId.set(slugify(name), id);
  }

  // Parse wiki-links per file
  const wikiLinkRe = /\[\[([^\]|#\n]+)/g;
  const fileLinks = new Map<string, string[]>(); // id → target ids

  for (const filePath of mdFiles) {
    const name = path.basename(filePath, ".md");
    const rel  = path.relative(vaultRoot, filePath).replace(/\\/g, "/");
    const id   = `brain:${slugify(rel)}`;

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
    // Ensure node exists even if no links
    if (!nameToId.has(name.toLowerCase())) nameToId.set(name.toLowerCase(), id);
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
  const nodes: NetworkNode[] = mdFiles.map((filePath) => {
    const name = path.basename(filePath, ".md");
    const rel  = path.relative(vaultRoot, filePath).replace(/\\/g, "/");
    const id   = `brain:${slugify(rel)}`;
    const folder = rel.split("/")[0] ?? "";
    return {
      id,
      label: name,
      fileType: "note",
      sourceFile: rel,
      sourceLocation: null,
      degree: degreeMap.get(id) ?? 0,
      community: folderCommunity(folder),
      source: "brain",
      x: 800,
      y: 540,
    };
  });

  // Build deduplicated links
  const seen = new Set<string>();
  const links: NetworkLink[] = [];
  for (const [srcId, targets] of fileLinks) {
    for (const tgtId of targets) {
      const key = [srcId, tgtId].sort().join("→");
      if (!seen.has(key)) {
        seen.add(key);
        links.push({ source: srcId, target: tgtId });
      }
    }
  }

  return { nodes, links };
}

// Stable community id per top-level folder
const FOLDER_COMMUNITY: Record<string, number> = {
  "00_Index": 0,
  "04_Strategies": 1,
  "07_Technology": 2,
  "09_AI": 3,
  "13_Manuals": 4,
  "16_Backtesting_Validation": 5,
  "17_Haftungsdach_QA": 6,
};
function folderCommunity(folder: string): number {
  return FOLDER_COMMUNITY[folder] ?? 7;
}

export const dynamic = "force-dynamic";

export function GET() {
  const brainRoot = getCapitalifeBrainPath();
  if (!brainRoot) {
    return NextResponse.json({ nodes: [], links: [], message: "CAPITALIFE_BRAIN_PATH missing" });
  }

  const { nodes, links } = buildObsidianGraph(brainRoot);
  return NextResponse.json({ nodes, links });
}
