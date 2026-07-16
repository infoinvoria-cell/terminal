import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCapitalifeBrainPath } from "@/lib/brain/brain-path";

type ChangeEntry = {
  title: string;
  source: string;
  status: "ok" | "partial" | "missing";
  updatedAt: string | null;
};

function safeIso(filePath: string) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function readAgentUpdateFiles(limit: number): ChangeEntry[] {
  const brainRoot = getCapitalifeBrainPath();
  if (!brainRoot) return [];
  const agentUpdatesRoot = path.join(brainRoot, "09_AI", "agent_updates");
  if (!fs.existsSync(agentUpdatesRoot)) return [];
  const files = fs.readdirSync(agentUpdatesRoot)
    .filter((name) => name.toLowerCase().endsWith(".md") || name.toLowerCase().endsWith(".json"))
    .map((name) => ({
      name,
      fullPath: path.join(agentUpdatesRoot, name),
      updatedAt: safeIso(path.join(agentUpdatesRoot, name)),
    }))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, limit);

  return files.map((file) => ({
    title: file.name.replace(/\.(md|json)$/i, "").replace(/[_-]+/g, " "),
    source: `09_AI/agent_updates/${file.name}`,
    status: "ok",
    updatedAt: file.updatedAt,
  }));
}

function readChangelog(limit: number): ChangeEntry[] {
  const brainRoot = getCapitalifeBrainPath();
  if (!brainRoot) return [];
  const changelogPath = path.join(brainRoot, "09_AI", "BRAIN_CHANGELOG.md");
  if (!fs.existsSync(changelogPath)) return [];
  const raw = fs.readFileSync(changelogPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const entries: ChangeEntry[] = [];
  let currentAt: string | null = null;
  let currentSource = "09_AI/BRAIN_CHANGELOG.md";
  let currentChange = "";
  let currentStatus: "ok" | "partial" | "missing" = "ok";
  let currentPath = "09_AI/BRAIN_CHANGELOG.md";

  const flush = () => {
    if (!currentChange) return;
    entries.push({
      title: currentChange.slice(0, 140),
      source: currentSource === "09_AI/BRAIN_CHANGELOG.md" ? currentPath : currentSource,
      status: currentStatus,
      updatedAt: currentAt,
    });
    currentSource = "09_AI/BRAIN_CHANGELOG.md";
    currentChange = "";
    currentStatus = "ok";
    currentPath = "09_AI/BRAIN_CHANGELOG.md";
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = /^##\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flush();
      const parsed = Date.parse(headingMatch[1]);
      currentAt = Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
      continue;
    }
    if (!trimmed) {
      flush();
      if (entries.length >= limit) break;
      continue;
    }
    const fieldMatch = /^-\s+([^:]+):\s*(.+)$/.exec(trimmed);
    if (!fieldMatch) continue;
    const key = fieldMatch[1].toLowerCase();
    const value = fieldMatch[2].trim();
    if (key === "quelle") currentSource = value;
    if (key === "aenderung") currentChange = value;
    if (key === "status" && (value === "ok" || value === "partial" || value === "missing")) currentStatus = value;
    if (key === "pfad") currentPath = value;
    if (entries.length >= limit) break;
  }

  flush();

  return entries;
}

export const dynamic = "force-dynamic";

export function GET() {
  const brainRoot = getCapitalifeBrainPath();
  const changelogPath = brainRoot ? path.join(brainRoot, "09_AI", "BRAIN_CHANGELOG.md") : null;
  const agentUpdatesRoot = brainRoot ? path.join(brainRoot, "09_AI", "agent_updates") : null;
  const entries = [...readAgentUpdateFiles(6), ...readChangelog(6)]
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, 8);

  return NextResponse.json({
    changelogExists: changelogPath ? fs.existsSync(changelogPath) : false,
    agentUpdatesExists: agentUpdatesRoot ? fs.existsSync(agentUpdatesRoot) : false,
    entries,
  });
}
