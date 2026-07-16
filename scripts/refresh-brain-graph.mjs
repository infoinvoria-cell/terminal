import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BRAIN_ROOT = process.env.CAPITALIFE_BRAIN_PATH?.trim() || null;
const DASHBOARD_ROOT = process.cwd();
const CHANGELOG_PATH = BRAIN_ROOT ? path.join(BRAIN_ROOT, "09_AI", "BRAIN_CHANGELOG.md") : null;
const AGENT_UPDATES_ROOT = BRAIN_ROOT ? path.join(BRAIN_ROOT, "09_AI", "agent_updates") : null;

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function ensureFile(filePath, contents) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, contents, "utf8");
}

function ensureAgentUpdateInbox() {
  if (!AGENT_UPDATES_ROOT) return;
  fs.mkdirSync(AGENT_UPDATES_ROOT, { recursive: true });
  ensureFile(
    path.join(AGENT_UPDATES_ROOT, "README.md"),
    [
      "# Agent Updates Inbox",
      "",
      "- Agents und Bots legen hier kleine Markdown- oder JSON-Notizen ab.",
      "- Diese Inbox ist nur fuer lokale Brain-/Graph-Refresh-Workflows gedacht.",
      "- Keine Secrets.",
      "- Keine Live-Execution.",
      "- Brain bleibt Source of Truth, Graphify bleibt nur Index.",
      "",
    ].join("\n"),
  );
}

function ensureChangelog() {
  if (!CHANGELOG_PATH) return;
  ensureFile(
    CHANGELOG_PATH,
    [
      "# Brain Change Log",
      "",
      "## 2026-07-15T00:00:00Z",
      "- Quelle: bootstrap",
      "- Aenderung: Brain changelog initialisiert",
      "- Status: ok",
      "- Pfad: 09_AI/BRAIN_CHANGELOG.md",
      "",
    ].join("\n"),
  );
}

function readGraphSummary(root) {
  const graphPath = path.join(root, "graphify-out", "graph.json");
  if (!fs.existsSync(graphPath)) {
    return { exists: false, graphPath, nodes: 0, links: 0, updatedAt: null };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(graphPath, "utf8"));
    return {
      exists: true,
      graphPath,
      nodes: parsed.nodes?.length ?? 0,
      links: parsed.links?.length ?? 0,
      updatedAt: safeStat(graphPath)?.mtime.toISOString() ?? null,
    };
  } catch {
    return { exists: true, graphPath, nodes: 0, links: 0, updatedAt: safeStat(graphPath)?.mtime.toISOString() ?? null, parseError: true };
  }
}

function commandExists(command) {
  try {
    execFileSync("where.exe", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runGraphify(root) {
  execFileSync("graphify", ["extract", ".", "--code-only"], {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
  });
}

function appendChangelog(entries) {
  if (!CHANGELOG_PATH) return;
  const timestamp = new Date().toISOString();
  const lines = [`## ${timestamp}`];
  for (const entry of entries) {
    lines.push(`- Quelle: ${entry.source}`);
    lines.push(`- Aenderung: ${entry.change}`);
    lines.push(`- Status: ${entry.status}`);
    lines.push(`- Pfad: ${entry.path}`);
    lines.push("");
  }
  fs.appendFileSync(CHANGELOG_PATH, `\n${lines.join("\n")}`, "utf8");
}

function main() {
  if (!BRAIN_ROOT) {
    process.stdout.write(`${JSON.stringify({
      graphifyAvailable: commandExists("graphify"),
      graphifyExecuted: false,
      brainConfigured: false,
      message: "CAPITALIFE_BRAIN_PATH missing; only dashboard-side checks can run",
      dashboard: readGraphSummary(DASHBOARD_ROOT),
    }, null, 2)}\n`);
    process.exit(0);
  }
  ensureAgentUpdateInbox();
  ensureChangelog();

  const args = new Set(process.argv.slice(2));
  const canRunGraphify = commandExists("graphify");
  const shouldRunGraphify = args.has("--run-graphify") && canRunGraphify;

  const logEntries = [];
  if (args.has("--run-graphify") && !canRunGraphify) {
    logEntries.push({
      source: "refresh-script",
      change: "Graphify CLI nicht verfuegbar, nur Status-Refresh ausgefuehrt",
      status: "partial",
      path: "graphify",
    });
  }

  if (shouldRunGraphify) {
    try {
      runGraphify(BRAIN_ROOT);
      runGraphify(DASHBOARD_ROOT);
      logEntries.push({
        source: "refresh-script",
        change: "Graphify Refresh fuer Brain und Dashboard ausgefuehrt",
        status: "ok",
        path: "graphify-out/graph.json",
      });
    } catch {
      logEntries.push({
        source: "refresh-script",
        change: "Graphify Refresh fehlgeschlagen, bestehender Index bleibt unveraendert",
        status: "partial",
        path: "graphify-out/graph.json",
      });
    }
  }

  const brain = readGraphSummary(BRAIN_ROOT);
  const dashboard = readGraphSummary(DASHBOARD_ROOT);

  logEntries.push({
    source: "brain-graph",
    change: `Brain Graph Status: ${brain.nodes} nodes / ${brain.links} links`,
    status: brain.exists ? "ok" : "missing",
    path: "Capitalife Brain/graphify-out/graph.json",
  });
  logEntries.push({
    source: "brain-graph",
    change: `Dashboard Graph Status: ${dashboard.nodes} nodes / ${dashboard.links} links`,
    status: dashboard.exists ? "ok" : "missing",
    path: "Fund Manager Dashboard/graphify-out/graph.json",
  });

  appendChangelog(logEntries);

  const result = {
    graphifyAvailable: canRunGraphify,
    graphifyExecuted: shouldRunGraphify,
    brain,
    dashboard,
    inbox: AGENT_UPDATES_ROOT,
    changelog: CHANGELOG_PATH,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
