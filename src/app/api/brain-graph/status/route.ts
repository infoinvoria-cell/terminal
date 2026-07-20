import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCapitalifeBrainPath } from "@/lib/brain/brain-path";

const DASHBOARD_ROOT = process.cwd();

type GraphStatus = {
  exists: boolean;
  nodeCount: number;
  linkCount: number;
  builtAt: string | null;
  reportExists: boolean;
  manifestExists: boolean;
  error?: string;
};

function safeIso(filePath: string) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function graphStatus(root: string): GraphStatus {
  const graphPath = path.join(root, "graphify-out", "graph.json");
  const manifestPath = path.join(root, "graphify-out", "manifest.json");
  const reportPath = path.join(root, "graphify-out", "GRAPH_REPORT.md");

  if (!fs.existsSync(graphPath)) {
    return {
      exists: false,
      nodeCount: 0,
      linkCount: 0,
      builtAt: null,
      reportExists: fs.existsSync(reportPath),
      manifestExists: fs.existsSync(manifestPath),
    };
  }

  try {
    const raw = fs.readFileSync(graphPath, "utf8");
    const parsed = JSON.parse(raw) as { nodes?: unknown[]; links?: unknown[] };
    return {
      exists: true,
      nodeCount: parsed.nodes?.length ?? 0,
      linkCount: parsed.links?.length ?? 0,
      builtAt: safeIso(graphPath),
      reportExists: fs.existsSync(reportPath),
      manifestExists: fs.existsSync(manifestPath),
    };
  } catch {
    return {
      exists: true,
      nodeCount: 0,
      linkCount: 0,
      builtAt: safeIso(graphPath),
      reportExists: fs.existsSync(reportPath),
      manifestExists: fs.existsSync(manifestPath),
      error: "parse error",
    };
  }
}

function pushChange(
  changes: Array<{ title: string; source: string; status: "ok" | "partial" | "missing"; updatedAt: string | null }>,
  title: string,
  source: string,
  updatedAt: string | null,
  status: "ok" | "partial" | "missing",
) {
  changes.push({ title, source, updatedAt, status });
}

export const revalidate = 3600;

function getVaultSizeGb(brainRoot: string): number | null {
  try {
    let totalBytes = 0;
    let fileCount = 0;
    const SKIP_DIRS = new Set([".git", "node_modules", ".obsidian"]);
    function walk(dir: string, depth: number) {
      if (depth > 8 || fileCount > 150_000) return;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
      catch { return; }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), depth + 1);
        } else {
          try { totalBytes += fs.statSync(path.join(dir, entry.name)).size; fileCount++; }
          catch { /* skip */ }
        }
      }
    }
    walk(brainRoot, 0);
    return Math.round((totalBytes / 1_073_741_824) * 10) / 10;
  } catch {
    return null;
  }
}

export function GET() {
  const brainRoot = getCapitalifeBrainPath();
  const changeLogPath = brainRoot ? path.join(brainRoot, "09_AI", "BRAIN_CHANGELOG.md") : null;
  const agentUpdatesRoot = brainRoot ? path.join(brainRoot, "09_AI", "agent_updates") : null;
  const brain = brainRoot ? graphStatus(brainRoot) : {
    exists: false,
    nodeCount: 0,
    linkCount: 0,
    builtAt: null,
    reportExists: false,
    manifestExists: false,
  };
  const dashboard = graphStatus(DASHBOARD_ROOT);
  const aiBrainFile = brainRoot ? path.join(brainRoot, "09_AI", "AI_PROJECT_BRAIN_CURRENT.md") : null;
  const contextPackFile = brainRoot ? path.join(brainRoot, "_ChatGPT_Handoff", "AI_Context_Pack.md") : null;
  const latestAgentUpdate = agentUpdatesRoot && fs.existsSync(agentUpdatesRoot)
    ? fs.readdirSync(agentUpdatesRoot)
      .map((name) => path.join(agentUpdatesRoot, name))
      .map((filePath) => ({ filePath, updatedAt: safeIso(filePath) }))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .at(0)
    : null;

  const changes: Array<{ title: string; source: string; status: "ok" | "partial" | "missing"; updatedAt: string | null }> = [];
  pushChange(changes, "Dashboard graph indexed", "graphify-out/graph.json", dashboard.builtAt, dashboard.exists ? "ok" : "missing");
  pushChange(changes, "Brain docs indexed", "Capitalife Brain graphify-out/graph.json", brain.builtAt, brain.exists ? "ok" : "missing");
  pushChange(
    changes,
    "Context pack available",
    "_ChatGPT_Handoff/AI_Context_Pack.md",
    safeIso(contextPackFile ?? ""),
    contextPackFile && fs.existsSync(contextPackFile) ? "ok" : "partial",
  );
  pushChange(
    changes,
    "Brain source updated",
    "09_AI/AI_PROJECT_BRAIN_CURRENT.md",
    safeIso(aiBrainFile ?? ""),
    aiBrainFile && fs.existsSync(aiBrainFile) ? "ok" : "missing",
  );
  pushChange(
    changes,
    "Brain changelog ready",
    "09_AI/BRAIN_CHANGELOG.md",
    safeIso(changeLogPath ?? ""),
    changeLogPath && fs.existsSync(changeLogPath) ? "ok" : "partial",
  );
  pushChange(
    changes,
    "Agent updates inbox ready",
    "09_AI/agent_updates",
    latestAgentUpdate?.updatedAt ?? safeIso(agentUpdatesRoot ?? ""),
    agentUpdatesRoot && fs.existsSync(agentUpdatesRoot) ? "ok" : "partial",
  );

  const allTimes = [brain.builtAt, dashboard.builtAt, safeIso(aiBrainFile ?? ""), safeIso(contextPackFile ?? ""), safeIso(changeLogPath ?? ""), latestAgentUpdate?.updatedAt].filter(Boolean).sort().reverse();
  const graphifyStatus = brain.exists && dashboard.exists ? "available" : brain.exists || dashboard.exists ? "partial" : "missing";

  return NextResponse.json({
    brain,
    dashboard,
    graphifyStatus,
    brainStatus: aiBrainFile && fs.existsSync(aiBrainFile) ? "loaded" : "missing",
    lastUpdated: allTimes[0] ?? null,
    changes,
    vaultSizeGb: brainRoot ? getVaultSizeGb(brainRoot) : null,
  });
}
