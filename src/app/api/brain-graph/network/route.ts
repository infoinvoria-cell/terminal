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

const NODE_CAP = 5000;
const LINK_CAP = 10000;
// Ports tried in order; first to respond wins
const OBSIDIAN_PORTS = [27124, 27123];

// ── In-memory cache ───────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 h
let _cache: { data: { nodes: NetworkNode[]; links: NetworkLink[] }; ts: number; key: string } | null = null;

function getCached(key: string, builder: () => Promise<{ nodes: NetworkNode[]; links: NetworkLink[] }>) {
  const now = Date.now();
  if (_cache && _cache.key === key && now - _cache.ts < CACHE_TTL_MS) return Promise.resolve(_cache.data);
  return builder().then((data) => {
    _cache = { data, ts: now, key };
    return data;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^\w-]/g, "");
}

const FOLDER_COMMUNITY: Record<string, number> = {
  "00_Index": 0, "04_Strategies": 1, "09_AI": 2,
  "13_Manuals": 3, "16_Backtesting_Validation": 4, "17_Haftungsdach_QA": 5,
};
function folderCommunity(folder: string): number { return FOLDER_COMMUNITY[folder] ?? 6; }

// ── Obsidian Local REST API ───────────────────────────────────────────────────

function getObsidianBase(): string {
  // Explicit env URL wins; otherwise try ports in order at runtime
  const env = process.env.OBSIDIAN_API_URL;
  if (env) return env.replace(/\/$/, "");
  return `http://localhost:${OBSIDIAN_PORTS[0]}`; // runtime probe overrides below
}

async function obsidianFetch(endpoint: string, base: string, apiKey: string | undefined, asText = false): Promise<Response> {
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  if (!asText) headers["Accept"] = "application/json";
  const res = await fetch(`${base}${endpoint}`, { headers, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`${base}${endpoint} → ${res.status}`);
  return res;
}

async function probeBase(apiKey: string | undefined): Promise<string> {
  // If env URL is set, use it directly
  const envUrl = process.env.OBSIDIAN_API_URL?.replace(/\/$/, "");
  if (envUrl) {
    await obsidianFetch("/vault/", envUrl, apiKey); // throws if unreachable
    return envUrl;
  }
  // Otherwise probe ports in order
  for (const port of OBSIDIAN_PORTS) {
    const base = `http://localhost:${port}`;
    try {
      await obsidianFetch("/vault/", base, apiKey);
      return base;
    } catch { /* try next */ }
  }
  throw new Error("Obsidian not reachable on any known port");
}

const EXCLUDED_API_DIRS = new Set([".obsidian", ".trash", "node_modules", "_link_backup", "_ChatGPT_Handoff", "graphify-out", "99_Attachments", "_Incoming", "_External_Sources"]);

function vaultPath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

async function listVaultRecursive(base: string, apiKey: string | undefined, dir = ""): Promise<string[]> {
  const endpoint = dir ? `/vault/${vaultPath(dir)}/` : "/vault/";
  const res = await obsidianFetch(endpoint, base, apiKey);
  const { files } = await res.json() as { files: string[] };
  const results: string[] = [];
  await Promise.allSettled(files.map(async (entry: string) => {
    const name = entry.replace(/\/$/, "");
    const topFolder = (dir ? dir.split("/")[0] : name);
    if (EXCLUDED_API_DIRS.has(topFolder)) return;
    if (entry.endsWith("/")) {
      // It's a directory — recurse
      const sub = dir ? `${dir}/${name}` : name;
      const children = await listVaultRecursive(base, apiKey, sub);
      results.push(...children);
    } else if (entry.endsWith(".md")) {
      results.push(dir ? `${dir}/${entry}` : entry);
    }
  }));
  return results;
}

async function buildObsidianApiGraph(): Promise<{ nodes: NetworkNode[]; links: NetworkLink[] }> {
  const apiKey = process.env.OBSIDIAN_API_KEY;
  const base = await probeBase(apiKey);

  // Recursively list all .md files in the vault
  const mdFiles = await listVaultRecursive(base, apiKey);

  // Build name→id map
  const nameToId = new Map<string, string>();
  const fileInfos: { relPath: string; folder: string; label: string; id: string }[] = [];

  for (const relPath of mdFiles) {
    const parts = relPath.split("/");
    const folder = parts.length > 1 ? parts[0] : "root";
    const label = path.basename(relPath, ".md");
    const id = `brain:${slugify(relPath)}`;
    fileInfos.push({ relPath, folder, label, id });
    nameToId.set(label.toLowerCase(), id);
    nameToId.set(slugify(label), id);
  }

  // Fetch content + extract wiki-links for each file
  const wikiLinkRe = /\[\[([^\]|#\n]+)/g;
  const fileLinks = new Map<string, string[]>();
  const previews = new Map<string, string>();

  await Promise.allSettled(
    fileInfos.map(async ({ relPath, id }) => {
      try {
        // Fetch as plain text (Obsidian REST API returns raw markdown with Accept: text/plain)
        const res = await obsidianFetch(`/vault/${vaultPath(relPath)}`, base, apiKey, true);
        const content = await res.text();
        const lines = content.split("\n").map((l) => l.trim())
          .filter((l) => l && !l.startsWith("---") && !l.startsWith("tags:") && !l.startsWith("#!"))
          .slice(0, 3);
        previews.set(id, lines.join(" · ").slice(0, 200));

        const targets: string[] = [];
        let m: RegExpExecArray | null;
        wikiLinkRe.lastIndex = 0;
        while ((m = wikiLinkRe.exec(content)) !== null) {
          const ref = m[1].trim();
          const tgtId = nameToId.get(ref.toLowerCase()) ?? nameToId.get(slugify(ref));
          if (tgtId && tgtId !== id) targets.push(tgtId);
        }
        fileLinks.set(id, targets);
      } catch { /* file unreadable — skip */ }
    })
  );

  return buildGraph(fileInfos, fileLinks, previews);
}

// ── Filesystem fallback ───────────────────────────────────────────────────────

const EXCLUDED_DIRS = new Set([".obsidian", ".trash", "node_modules", "_link_backup", "_ChatGPT_Handoff"]);

function getPreviewFs(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n").map((l) => l.trim())
      .filter((l) => l && !l.startsWith("---") && !l.startsWith("tags:") && !l.startsWith("#!"))
      .slice(0, 3);
    return lines.join(" · ").slice(0, 200);
  } catch { return ""; }
}

async function buildFsGraph(vaultRoot: string): Promise<{ nodes: NetworkNode[]; links: NetworkLink[] }> {
  const mdFiles: { filePath: string; folder: string }[] = [];

  function walk(dir: string, folder: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || EXCLUDED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, folder);
      else if (entry.isFile() && entry.name.endsWith(".md")) mdFiles.push({ filePath: full, folder });
    }
  }

  let topEntries: fs.Dirent[];
  try { topEntries = fs.readdirSync(vaultRoot, { withFileTypes: true }); } catch { topEntries = []; }
  for (const entry of topEntries) {
    if (entry.name.startsWith(".") || EXCLUDED_DIRS.has(entry.name)) continue;
    if (entry.isDirectory()) walk(path.join(vaultRoot, entry.name), entry.name);
    else if (entry.isFile() && entry.name.endsWith(".md")) mdFiles.push({ filePath: path.join(vaultRoot, entry.name), folder: "root" });
  }

  const nameToId = new Map<string, string>();
  const fileInfos: { relPath: string; folder: string; label: string; id: string }[] = [];

  for (const { filePath, folder } of mdFiles) {
    const label = path.basename(filePath, ".md");
    const relPath = path.relative(vaultRoot, filePath).replace(/\\/g, "/");
    const id = `brain:${slugify(relPath)}`;
    fileInfos.push({ relPath, folder, label, id });
    nameToId.set(label.toLowerCase(), id);
    nameToId.set(slugify(label), id);
  }

  const wikiLinkRe = /\[\[([^\]|#\n]+)/g;
  const fileLinks = new Map<string, string[]>();
  const previews = new Map<string, string>();

  for (const { relPath, id } of fileInfos) {
    const filePath = path.join(vaultRoot, relPath);
    previews.set(id, getPreviewFs(filePath));
    let content = "";
    try { content = fs.readFileSync(filePath, "utf8"); } catch { /* skip */ }
    const targets: string[] = [];
    let m: RegExpExecArray | null;
    wikiLinkRe.lastIndex = 0;
    while ((m = wikiLinkRe.exec(content)) !== null) {
      const ref = m[1].trim();
      const tgtId = nameToId.get(ref.toLowerCase()) ?? nameToId.get(slugify(ref));
      if (tgtId && tgtId !== id) targets.push(tgtId);
    }
    fileLinks.set(id, targets);
  }

  return buildGraph(fileInfos, fileLinks, previews);
}

// ── Shared graph builder ──────────────────────────────────────────────────────

function buildGraph(
  fileInfos: { relPath: string; folder: string; label: string; id: string }[],
  fileLinks: Map<string, string[]>,
  previews: Map<string, string>,
): { nodes: NetworkNode[]; links: NetworkLink[] } {
  const degreeMap = new Map<string, number>();
  for (const [srcId, targets] of fileLinks) {
    for (const tgtId of targets) {
      degreeMap.set(srcId, (degreeMap.get(srcId) ?? 0) + 1);
      degreeMap.set(tgtId, (degreeMap.get(tgtId) ?? 0) + 1);
    }
  }

  const nodes: NetworkNode[] = fileInfos.map(({ relPath, folder, label, id }) => ({
    id, label, folder,
    fileType: "note",
    sourceFile: relPath,
    preview: previews.get(id) ?? "",
    degree: degreeMap.get(id) ?? 0,
    community: folderCommunity(folder),
    source: "brain",
    x: 800, y: 540,
  }));

  const keepIds = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const links: NetworkLink[] = [];
  for (const [srcId, targets] of fileLinks) {
    for (const tgtId of targets) {
      if (!keepIds.has(tgtId)) continue;
      const key = [srcId, tgtId].sort().join("→");
      if (!seen.has(key)) { seen.add(key); links.push({ source: srcId, target: tgtId }); }
    }
  }

  return { nodes, links };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic"; // reads env at request time, skip static cache

export async function GET() {
  function cap(nodes: NetworkNode[], links: NetworkLink[]) {
    const capped = nodes.sort((a, b) => b.degree - a.degree).slice(0, NODE_CAP);
    const ids = new Set(capped.map((n) => n.id));
    return { nodes: capped, links: links.filter((l) => ids.has(l.source) && ids.has(l.target)).slice(0, LINK_CAP) };
  }

  // Try Obsidian Local REST API first
  try {
    const { nodes, links } = await getCached("obsidian", buildObsidianApiGraph);
    return NextResponse.json({ ...cap(nodes, links), source: "obsidian-api" });
  } catch {
    // Fallback: filesystem scan
    const brainRoot = getCapitalifeBrainPath();
    if (!brainRoot) {
      return NextResponse.json({ nodes: [], links: [], source: "unavailable", message: "Obsidian API unreachable and CAPITALIFE_BRAIN_PATH missing" });
    }
    // No cache for filesystem fallback — Obsidian is retried on every request
    const { nodes, links } = await buildFsGraph(brainRoot);
    return NextResponse.json({ ...cap(nodes, links), source: "filesystem" });
  }
}
