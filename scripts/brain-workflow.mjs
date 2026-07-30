import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const dashboardRoot = process.cwd();
const args = process.argv.slice(2);
const command = args[0] ?? "audit";
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const brainRoot = resolveBrainRoot(option("--brain"));
const generatedRoot = path.join(brainRoot, "09_AI", "generated");
const auditRoot = path.join(brainRoot, "20_Audits");
const ignoredParts = new Set([
  ".git", "node_modules", ".next", "graphify-out", "_link_backup",
  "92_Graph_Ignored", "99_Attachments",
]);
const orphanExemptParts = new Set([
  "90_Inbox", "91_Archive", "92_Graph_Ignored", "99_Attachments",
  "_Incoming", "_External_Sources", "_link_backup",
]);
const mojibakePatterns = [/Ã[\x80-\xBF]/u, /â(?:€|™|œ|ž|†|‡|ˆ|‰|Š|‹|Œ|Ž|“|”|•|–|—|…)/u, /�/u];
const expectedMocs = [
  "Capitalife Brain - Start",
  "Strategie-MOC",
  "White-Swan-MOC",
  "Core-Invest-MOC",
  "Track-Record-MOC",
  "Risiko-und-Performance-MOC",
  "INNO-Vorbereitung-MOC",
  "IBKR-und-Technik-MOC",
  "Terminal-Architektur-MOC",
  "Daten-und-Quellen-MOC",
  "Agenten-und-Automatisierung-MOC",
  "Entscheidungen-und-Offene-Punkte-MOC",
];

if (command === "audit" || command === "validate" || command === "scan" || command === "links") {
  const result = auditBrain();
  if (!args.includes("--no-write")) writeAudit(result);
  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
  if (command === "validate" && args.includes("--strict") && result.summary.criticalIssueCount > 0) {
    process.exitCode = 1;
  }
} else if (command === "context") {
  const query = option("--query") ?? args.slice(1).join(" ");
  if (!query.trim()) throw new Error("context requires --query <topic>");
  process.stdout.write(`${JSON.stringify(buildContextPack(query), null, 2)}\n`);
} else if (command === "sync") {
  const result = buildTerminalSyncStatus();
  fs.mkdirSync(generatedRoot, { recursive: true });
  fs.writeFileSync(path.join(generatedRoot, "terminal-sync-status.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (command === "graphify") {
  const result = runGraphifyUpdate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  throw new Error(`Unknown brain command: ${command}`);
}

function resolveBrainRoot(explicit) {
  const candidates = [
    explicit,
    process.env.CAPITALIFE_BRAIN_PATH,
    path.resolve(dashboardRoot, "..", "Capitalife Brain"),
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, "09_AI")));
  if (!found) throw new Error("Capitalife Brain not found. Set CAPITALIFE_BRAIN_PATH or pass --brain.");
  return path.resolve(found);
}

function walkFiles(root, predicate) {
  const output = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relative = normalize(path.relative(root, fullPath));
      if (entry.isDirectory()) {
        if (!relative.split("/").some((part) => ignoredParts.has(part))) stack.push(fullPath);
      } else if (entry.isFile() && predicate(fullPath, relative)) {
        output.push({ fullPath, relative });
      }
    }
  }
  return output.sort((a, b) => a.relative.localeCompare(b.relative));
}

function auditBrain() {
  const markdown = walkFiles(brainRoot, (fullPath) => fullPath.toLowerCase().endsWith(".md"));
  const attachments = walkFiles(brainRoot, (fullPath) => !fullPath.toLowerCase().endsWith(".md"));
  const records = markdown.map(({ fullPath, relative }) => readMarkdown(fullPath, relative));
  const byPath = new Map();
  const byBase = new Map();
  for (const record of records) {
    const noExtension = normalize(record.relative.replace(/\.md$/i, ""));
    byPath.set(noExtension.toLowerCase(), record);
    const base = path.posix.basename(noExtension).toLowerCase();
    const rows = byBase.get(base) ?? [];
    rows.push(record);
    byBase.set(base, rows);
  }

  const inbound = new Map(records.map((record) => [record.relative, 0]));
  const adjacency = new Map(records.map((record) => [record.relative, new Set()]));
  const brokenLinks = [];
  let wikiLinkCount = 0;
  for (const source of records) {
    for (const rawTarget of source.wikiLinks) {
      wikiLinkCount += 1;
      const resolved = resolveWikiTarget(source.relative, rawTarget, byPath, byBase);
      if (resolved) {
        inbound.set(resolved.relative, (inbound.get(resolved.relative) ?? 0) + 1);
        adjacency.get(source.relative)?.add(resolved.relative);
        adjacency.get(resolved.relative)?.add(source.relative);
      } else {
        brokenLinks.push({ source: source.relative, target: rawTarget });
      }
    }
  }

  const attachmentPaths = new Set(attachments.map((row) => row.relative.toLowerCase()));
  const missingAttachments = [];
  for (const source of records) {
    for (const target of source.embeds) {
      const normalizedTarget = normalize(target.split("#")[0]).toLowerCase();
      if (!attachmentPaths.has(normalizedTarget) && ![...attachmentPaths].some((item) => item.endsWith(`/${normalizedTarget}`))) {
        missingAttachments.push({ source: source.relative, target });
      }
    }
  }

  const duplicateHashes = groupDuplicates(records, (record) => record.hash);
  const duplicateTitles = groupDuplicates(records.filter((record) => record.title), (record) => record.title.toLowerCase());
  const duplicateIds = groupDuplicates(records.filter((record) => record.id), (record) => record.id.toLowerCase());
  const aliasRows = records.flatMap((record) => record.aliases.map((alias) => ({
    relative: record.relative,
    alias: alias.toLowerCase(),
  })));
  const duplicateAliases = groupDuplicates(aliasRows, (record) => record.alias);
  const orphanRecords = records.filter((record) =>
    inbound.get(record.relative) === 0
    && record.wikiLinks.length === 0
    && !record.relative.split("/").some((part) => orphanExemptParts.has(part))
  );
  const noIncoming = records.filter((record) =>
    inbound.get(record.relative) === 0
    && !record.relative.split("/").some((part) => orphanExemptParts.has(part))
  );
  const linkedRecords = records.filter((record) => (inbound.get(record.relative) ?? 0) > 0);
  const noOutgoing = records.filter((record) =>
    record.wikiLinks.length === 0
    && !record.relative.split("/").some((part) => orphanExemptParts.has(part))
  );
  const currentMocs = new Set(records.map((record) => path.posix.basename(record.relative, ".md")));
  const mocRecords = records.filter((record) => expectedMocs.includes(path.posix.basename(record.relative, ".md")));
  const mocTargets = new Set();
  for (const moc of mocRecords) {
    for (const target of moc.wikiLinks) {
      const resolved = resolveWikiTarget(moc.relative, target, byPath, byBase);
      if (resolved) mocTargets.add(resolved.relative);
    }
  }
  const missingMocAssignment = records.filter((record) =>
    !mocRecords.includes(record)
    && !mocTargets.has(record.relative)
    && !isStructuralExempt(record.relative)
  );
  const overlinkedFiles = records
    .map((record) => ({
      file: record.relative,
      inbound: inbound.get(record.relative) ?? 0,
      outgoing: record.wikiLinks.length,
    }))
    .filter((record) => record.inbound >= 100 || record.outgoing >= 100);
  const clusters = connectedComponents(adjacency)
    .map((files) => ({ size: files.length, files: files.slice(0, 20) }))
    .sort((left, right) => right.size - left.size);
  const sourceOfTruthFiles = new Set(records
    .filter((record) => record.isSourceOfTruth || /Source of Truth/i.test(record.relative))
    .map((record) => record.relative));
  const staleSourceOfTruthReferences = brokenLinks
    .filter((link) => sourceOfTruthFiles.has(link.source));
  const graph = readGraphSummary();
  const summary = {
    generatedAt: new Date().toISOString(),
    brainRoot,
    markdownFiles: records.length,
    wikiLinks: wikiLinkCount,
    linkedFiles: linkedRecords.length,
    filesWithoutFrontmatter: records.filter((record) => !record.hasFrontmatter).length,
    invalidFrontmatterFiles: records.filter((record) => record.hasInvalidFrontmatter).length,
    invalidH1Count: records.filter((record) => record.h1Count !== 1).length,
    invalidMarkdownTableFiles: records.filter((record) => record.hasInvalidMarkdownTable).length,
    mojibakeFiles: records.filter((record) => record.hasMojibake).length,
    malformedCodeFenceFiles: records.filter((record) => record.hasMalformedCodeFences).length,
    mermaidBlocks: records.reduce((total, record) => total + record.mermaidBlocks, 0),
    brokenWikiLinks: brokenLinks.length,
    missingAttachments: missingAttachments.length,
    orphanFiles: orphanRecords.length,
    filesWithoutIncomingLinks: noIncoming.length,
    filesWithoutOutgoingLinks: noOutgoing.length,
    duplicateContentGroups: duplicateHashes.length,
    duplicateTitleGroups: duplicateTitles.length,
    duplicateIdGroups: duplicateIds.length,
    duplicateAliasGroups: duplicateAliases.length,
    overlinkedFiles: overlinkedFiles.length,
    graphClusters: clusters.length,
    isolatedGraphClusters: clusters.filter((cluster) => cluster.size === 1).length,
    filesWithoutMocAssignment: missingMocAssignment.length,
    staleSourceOfTruthReferences: staleSourceOfTruthReferences.length,
    expectedMocs: expectedMocs.length,
    presentMocs: expectedMocs.filter((name) => currentMocs.has(name)).length,
    missingMocs: expectedMocs.filter((name) => !currentMocs.has(name)),
    graphifyAvailable: graph.available,
    graphifyNodes: graph.nodes,
    graphifyLinks: graph.links,
    graphifyUpdatedAt: graph.updatedAt,
    criticalIssueCount: brokenLinks.length
      + missingAttachments.length
      + staleSourceOfTruthReferences.length
      + records.filter((record) =>
        record.hasMojibake
        || record.hasMalformedCodeFences
        || record.hasInvalidFrontmatter
        || record.hasInvalidMarkdownTable
      ).length,
  };
  return {
    summary,
    brokenLinks,
    missingAttachments,
    orphanFiles: orphanRecords.map((record) => record.relative),
    filesWithoutFrontmatter: records.filter((record) => !record.hasFrontmatter).map((record) => record.relative),
    invalidFrontmatterFiles: records.filter((record) => record.hasInvalidFrontmatter).map((record) => record.relative),
    invalidH1: records.filter((record) => record.h1Count !== 1).map((record) => ({ file: record.relative, count: record.h1Count })),
    invalidMarkdownTableFiles: records.filter((record) => record.hasInvalidMarkdownTable).map((record) => record.relative),
    mojibakeFiles: records.filter((record) => record.hasMojibake).map((record) => record.relative),
    malformedCodeFenceFiles: records
      .filter((record) => record.hasMalformedCodeFences)
      .map((record) => record.relative),
    duplicateContentGroups: duplicateHashes,
    duplicateTitleGroups: duplicateTitles,
    duplicateIdGroups: duplicateIds,
    duplicateAliasGroups: duplicateAliases,
    overlinkedFiles,
    graphClusters: clusters,
    filesWithoutMocAssignment: missingMocAssignment.map((record) => record.relative),
    staleSourceOfTruthReferences,
  };
}

function readMarkdown(fullPath, relative) {
  let text = "";
  try {
    text = fs.readFileSync(fullPath, "utf8");
  } catch {
    text = "";
  }
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const frontmatterText = frontmatter?.[1] ?? "";
  const titleMatch = frontmatter?.[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)
    ?? text.match(/^#\s+(.+)$/m);
  const statusMatch = frontmatterText.match(/^status:\s*["']?(.+?)["']?\s*$/mi);
  const updatedMatch = frontmatterText.match(/^updated:\s*["']?(.+?)["']?\s*$/mi);
  const sourceOfTruthMatch = frontmatterText.match(/^source_of_truth:\s*(true|false)\s*$/mi);
  const idMatch = frontmatterText.match(/^id:\s*["']?(.+?)["']?\s*$/mi);
  const aliases = parseAliases(frontmatterText);
  const linkText = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\r\n]+`/g, "");
  const wikiLinks = [...linkText.matchAll(/(?<!!)\[\[([^\]]+)\]\]/g)]
    .map((match) => cleanWikiTarget(match[1]))
    .filter(Boolean);
  const embeds = [...linkText.matchAll(/!\[\[([^\]]+)\]\]/g)]
    .map((match) => cleanWikiTarget(match[1]))
    .filter(Boolean);
  const codeFences = [...text.matchAll(/^```/gm)].length;
  return {
    fullPath,
    relative: normalize(relative),
    text,
    title: titleMatch?.[1]?.trim() ?? "",
    status: statusMatch?.[1]?.trim() ?? null,
    updated: updatedMatch?.[1]?.trim() ?? null,
    isSourceOfTruth: sourceOfTruthMatch?.[1]?.toLowerCase() === "true",
    id: idMatch?.[1]?.trim() ?? "",
    aliases,
    hasFrontmatter: Boolean(frontmatter),
    hasInvalidFrontmatter: /^---\r?$/m.test(text.slice(0, 8)) && !frontmatter,
    h1Count: [...text.matchAll(/^#\s+\S.*$/gm)].length,
    hasInvalidMarkdownTable: hasInvalidMarkdownTable(text),
    hasMojibake: mojibakePatterns.some((pattern) => pattern.test(text)),
    hasMalformedCodeFences: codeFences % 2 !== 0,
    mermaidBlocks: [...text.matchAll(/^```mermaid\s*$/gmi)].length,
    openTasks: [...text.matchAll(/^\s*-\s+\[\s\]\s+.+$/gm)].length,
    wikiLinks,
    embeds,
    hash: crypto.createHash("sha256").update(text).digest("hex"),
  };
}

function cleanWikiTarget(value) {
  return value.replaceAll("\\|", "|").split("|")[0].split("#")[0].trim();
}

function resolveWikiTarget(sourceRelative, rawTarget, byPath, byBase) {
  const target = normalize(rawTarget.replace(/\.md$/i, ""));
  if (!target || /^[a-z]+:\/\//i.test(target)) return null;
  const direct = byPath.get(target.toLowerCase());
  if (direct) return direct;
  const sourceDir = path.posix.dirname(sourceRelative);
  const relative = byPath.get(normalize(path.posix.join(sourceDir, target)).toLowerCase());
  if (relative) return relative;
  let baseMatches = byBase.get(path.posix.basename(target).toLowerCase()) ?? [];
  if (baseMatches.length === 0) {
    const foldedTarget = foldGerman(path.posix.basename(target));
    baseMatches = [...byBase.entries()]
      .filter(([base]) => foldGerman(base) === foldedTarget)
      .flatMap(([, matches]) => matches);
  }
  if (baseMatches.length <= 1) return baseMatches[0] ?? null;
  const sourceParts = path.posix.dirname(sourceRelative).split("/");
  return [...baseMatches].sort((left, right) => {
    const leftParts = path.posix.dirname(left.relative).split("/");
    const rightParts = path.posix.dirname(right.relative).split("/");
    const leftCommon = commonPrefixLength(sourceParts, leftParts);
    const rightCommon = commonPrefixLength(sourceParts, rightParts);
    return rightCommon - leftCommon
      || left.relative.split("/").length - right.relative.split("/").length
      || left.relative.localeCompare(right.relative);
  })[0];
}

function commonPrefixLength(left, right) {
  let count = 0;
  while (count < left.length && count < right.length && left[count] === right[count]) count += 1;
  return count;
}

function foldGerman(value) {
  return value
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
}

function parseAliases(frontmatterText) {
  const inline = frontmatterText.match(/^aliases:\s*\[([^\]]*)\]\s*$/mi);
  if (inline) {
    return inline[1].split(",").map((value) => value.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  const block = frontmatterText.match(/^aliases:\s*\r?\n((?:\s+-\s+.+\r?\n?)*)/mi);
  return block
    ? [...block[1].matchAll(/^\s+-\s+["']?(.+?)["']?\s*$/gm)].map((match) => match[1].trim())
    : [];
}

function hasInvalidMarkdownTable(text) {
  const lines = text.split(/\r?\n/);
  for (let index = 1; index < lines.length; index += 1) {
    if (!/^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(lines[index])) continue;
    const expected = markdownTableCells(lines[index - 1]);
    if (expected < 2) continue;
    let cursor = index + 1;
    while (cursor < lines.length && /^\s*\|.*\|\s*$/.test(lines[cursor])) {
      if (markdownTableCells(lines[cursor]) !== expected) return true;
      cursor += 1;
    }
  }
  return false;
}

function markdownTableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).length;
}

function isStructuralExempt(relative) {
  const parts = relative.split("/");
  return parts.some((part) => orphanExemptParts.has(part))
    || /(^|\/)(AGENTS|CLAUDE)\.md$/i.test(relative)
    || relative.startsWith("00_Index/MOCs/")
    || relative.startsWith("20_Audits/");
}

function connectedComponents(adjacency) {
  const unseen = new Set(adjacency.keys());
  const components = [];
  while (unseen.size > 0) {
    const first = unseen.values().next().value;
    const stack = [first];
    const component = [];
    unseen.delete(first);
    while (stack.length > 0) {
      const current = stack.pop();
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!unseen.has(neighbor)) continue;
        unseen.delete(neighbor);
        stack.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

function groupDuplicates(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const group = groups.get(key) ?? [];
    group.push(row.relative);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([key, files]) => ({ key, files }));
}

function writeAudit(result) {
  fs.mkdirSync(generatedRoot, { recursive: true });
  fs.mkdirSync(auditRoot, { recursive: true });
  fs.writeFileSync(path.join(generatedRoot, "brain-health.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const s = result.summary;
  const lines = [
    "---",
    "title: Capitalife Brain Health",
    "type: audit",
    "status: active",
    "owner: Capitalife",
    `updated: ${s.generatedAt.slice(0, 10)}`,
    "version: 1.0",
    "source_of_truth: false",
    "generated: true",
    "tags: [brain, audit, graphify]",
    "---",
    "",
    "# Capitalife Brain Health",
    "",
    "> [!info]",
    `> Automatisch erzeugter Zustandsbericht vom ${s.generatedAt}. Details: \`09_AI/generated/brain-health.json\`.`,
    "",
    "## Kennzahlen",
    "",
    "| Prüfung | Ergebnis |",
    "|---|---:|",
    `| Markdown-Dateien | ${s.markdownFiles} |`,
    `| Wiki-Links | ${s.wikiLinks} |`,
    `| Verlinkte Dateien | ${s.linkedFiles} |`,
    `| Verwaiste Dateien | ${s.orphanFiles} |`,
    `| Kaputte Wiki-Links | ${s.brokenWikiLinks} |`,
    `| Fehlende Anhänge | ${s.missingAttachments} |`,
    `| Dateien ohne Frontmatter | ${s.filesWithoutFrontmatter} |`,
    `| Ungültiges Frontmatter | ${s.invalidFrontmatterFiles} |`,
    `| Dateien mit ungültiger H1-Anzahl | ${s.invalidH1Count} |`,
    `| Dateien mit ungültigen Tabellen | ${s.invalidMarkdownTableFiles} |`,
    `| Mojibake-Dateien | ${s.mojibakeFiles} |`,
    `| Dateien mit offenen Code-Fences | ${s.malformedCodeFenceFiles} |`,
    `| Mermaid-Blöcke | ${s.mermaidBlocks} |`,
    `| Doppelte Inhaltsgruppen | ${s.duplicateContentGroups} |`,
    `| Doppelte ID-Gruppen | ${s.duplicateIdGroups} |`,
    `| Doppelte Alias-Gruppen | ${s.duplicateAliasGroups} |`,
    `| Überverlinkte Dateien | ${s.overlinkedFiles} |`,
    `| Graph-Cluster | ${s.graphClusters} |`,
    `| Dateien ohne MOC-Zuordnung | ${s.filesWithoutMocAssignment} |`,
    `| Kaputte Source-of-Truth-Verweise | ${s.staleSourceOfTruthReferences} |`,
    `| MOC-Abdeckung | ${s.presentMocs}/${s.expectedMocs} |`,
    `| Graphify | ${s.graphifyNodes} Knoten / ${s.graphifyLinks} Links |`,
    "",
    "## Bewertung",
    "",
    s.criticalIssueCount === 0
      ? "> [!success]\n> Keine kritischen Link-, Attachment- oder Encoding-Probleme gefunden."
      : `> [!warning]\n> ${s.criticalIssueCount} kritische technische Befunde bleiben offen. Keine automatische Verlinkung oder Löschung wurde vorgenommen.`,
    "",
    "## Verwandte Inhalte",
    "",
    "- [[Capitalife Brain - Start]]",
    "- [[Agenten-und-Automatisierung-MOC]]",
    "- [[Entscheidungen-und-Offene-Punkte-MOC]]",
    "",
  ];
  fs.writeFileSync(path.join(auditRoot, "Brain_Health_Current.md"), lines.join("\n"), "utf8");
}

function buildContextPack(query) {
  const terms = query.toLowerCase().split(/[^a-z0-9äöüß]+/u).filter((term) => term.length >= 3);
  const records = walkFiles(brainRoot, (fullPath) => fullPath.toLowerCase().endsWith(".md"))
    .map(({ fullPath, relative }) => readMarkdown(fullPath, relative))
  const files = records
    .map((record) => {
      const haystack = `${record.relative}\n${record.title}\n${record.text.slice(0, 12000)}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
        + (record.isSourceOfTruth ? 4 : 0)
        + (/Source of Truth/i.test(record.relative) && !/source_of_truth:\s*false/i.test(record.text) ? 2 : 0)
        + (/MOC|Master|Index/i.test(record.relative) ? 1 : 0);
      return {
        file: record.relative,
        title: record.title,
        status: record.status,
        updated: record.updated,
        isSourceOfTruth: record.isSourceOfTruth,
        openTasks: record.openTasks,
        score,
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, 20);
  const graphPath = path.join(brainRoot, "graphify-out", "graph.json");
  const graphMatches = [];
  if (fs.existsSync(graphPath)) {
    const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
    for (const node of graph.nodes ?? []) {
      const haystack = `${node.label ?? ""} ${node.source_file ?? ""}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      if (score > 0) graphMatches.push({ label: node.label, sourceFile: node.source_file, score });
    }
  }
  graphMatches.sort((a, b) => b.score - a.score);
  const relevantPaths = new Set(files.map((row) => row.file));
  const relevantRecords = records.filter((record) => relevantPaths.has(record.relative));
  const sourceOfTruth = files
    .filter((row) => row.isSourceOfTruth || /Source of Truth/i.test(row.file))
    .slice(0, 8);
  const decisions = files
    .filter((row) => /decision|entscheidung|open issues|next actions/i.test(row.file))
    .slice(0, 8);
  const contradictions = files
    .filter((row) => /contradiction|widerspruch/i.test(row.file))
    .slice(0, 8);
  const openTasks = relevantRecords
    .filter((record) => record.openTasks > 0)
    .map((record) => ({ file: record.relative, count: record.openTasks }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const recentlyUpdated = files
    .filter((row) => row.updated)
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
    .slice(0, 10);
  return {
    query,
    generatedAt: new Date().toISOString(),
    graphifyHealth: readGraphSummary(),
    sourceOfTruth,
    decisions,
    contradictions,
    openTasks,
    recentlyUpdated,
    relevantFiles: files,
    graphifyMatches: graphMatches.slice(0, 20),
    note: "Graphify is an index. Open the listed Brain files before treating a claim as truth.",
  };
}

function buildTerminalSyncStatus() {
  const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dashboardRoot, encoding: "utf8" }).trim();
  const auditPath = path.join(dashboardRoot, "docs", "audits", "inno-final-readiness-2026-07-30.md");
  const auditText = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, "utf8") : "";
  return {
    generated: true,
    generatedAt: new Date().toISOString(),
    terminalCommit: gitCommit,
    sourceAudit: normalize(path.relative(dashboardRoot, auditPath)),
    sourceAuditPresent: Boolean(auditText),
    verifiedFacts: {
      trackRecordMonths: auditText.includes("28 Monatswerte") ? 28 : null,
      partialTradeRows: auditText.includes("89 Teilhistorie-Trades") ? 89 : null,
      reportedAnnualizedPct: auditText.includes("35,2 %") ? 35.2 : null,
      recalculatedAnnualizedPct: auditText.includes("35,77 %") ? 35.77 : null,
      monthlyGeometricAnnualizedPct: auditText.includes("41,01 %") ? 41.01 : null,
      whiteSwanSeasonalsFound: auditText.includes("7 von 10") ? 7 : null,
      coreInvestComponents: auditText.includes("0 von 8") ? 8 : null,
      coreInvestLiveReady: auditText.includes("0 von 8") ? 0 : null,
    },
    providerStatus: {
      myfxbook: "technically_prepared_credentials_missing",
      darwinex: "technically_prepared_credentials_missing",
      productiveDatabaseMigration: "pending",
      lastVerifiedLiveSync: null,
    },
    deployment: {
      productionUrl: "https://capitalife-terminal.vercel.app",
      status: "deployed_from_main",
    },
  };
}

function runGraphifyUpdate() {
  const graphPath = path.join(brainRoot, "graphify-out", "graph.json");
  const before = readGraphSummary();
  let status = "updated";
  let error = null;
  try {
    execFileSync("graphify", ["update", brainRoot], { cwd: brainRoot, encoding: "utf8", stdio: "pipe" });
  } catch (cause) {
    status = "failed";
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return { status, before, after: readGraphSummary(), graphPath, error };
}

function readGraphSummary() {
  const graphPath = path.join(brainRoot, "graphify-out", "graph.json");
  let available = false;
  try {
    execFileSync("graphify", ["--version"], { stdio: "ignore" });
    available = true;
  } catch {
    available = false;
  }
  if (!fs.existsSync(graphPath)) return { available, nodes: 0, links: 0, updatedAt: null };
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  return {
    available,
    nodes: graph.nodes?.length ?? 0,
    links: graph.links?.length ?? 0,
    updatedAt: fs.statSync(graphPath).mtime.toISOString(),
  };
}

function normalize(value) {
  return value.replaceAll("\\", "/");
}
