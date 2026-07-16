#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();

const DOC_ALLOWLIST = [
  ".env.example",
  ".gitignore",
  "README.md",
  "SECURITY.md",
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING_GITHUB_PREP.md",
  "RTK_WORKFLOW.md",
];

function isDocLike(file) {
  return (
    DOC_ALLOWLIST.includes(file) ||
    file.startsWith("docs/") ||
    file === "scripts/audit-github-safe.mjs"
  );
}

function isAuditScope(file) {
  if (isDocLike(file)) return true;
  return (
    file.startsWith("src/") ||
    file.startsWith("scripts/") ||
    file.startsWith(".github/") ||
    file.startsWith("docs/") ||
    [
      ".env.example",
      ".gitignore",
      "README.md",
      "SECURITY.md",
      "AGENTS.md",
      "CLAUDE.md",
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "next.config.ts",
    ].includes(file)
  );
}

const PATH_RULES = [
  { name: "brain-path", test: (file) => file.includes("Capitalife Brain") || file.includes("_ChatGPT_Handoff") || file.includes("99_Attachments") },
  { name: "env-file", test: (file) => /(^|[\\/])\.env($|\.|[\\/])/.test(file) && !file.endsWith(".env.example") },
  { name: "raw-data-ext", test: (file) => /\.(csv|xlsx|xls|zip|7z|db|sqlite|duckdb)$/i.test(file) },
  { name: "graphify-output", test: (file) => file.includes("graphify-out") || file.endsWith("GRAPH_REPORT.md") },
];

const CONTENT_RULES = [
  { name: "openai-key-value", test: /OPENAI_API_KEY\s*=\s*(?!\s*$)[^\s]+/im },
  { name: "anthropic-key-value", test: /ANTHROPIC_API_KEY\s*=\s*(?!\s*$)[^\s]+/im },
  { name: "custom-key-value", test: /CUSTOM_CHAT_API_KEY\s*=\s*(?!\s*$)[^\s]+/im },
  { name: "openai-key-prefix", test: /\bsk-[A-Za-z0-9\-_]+\b/ },
  { name: "github-token", test: /\b(ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)\b/ },
  { name: "private-key-block", test: /BEGIN (PRIVATE KEY|RSA PRIVATE KEY|OPENSSH PRIVATE KEY)/i },
  { name: "joris-absolute-path", test: /C:\\Users\\joris/i },
];

function listCandidateFiles() {
  const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
  }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return [...new Set(tracked)];
}

function isBinary(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer.includes(0);
  } catch {
    return true;
  }
}

function scan() {
  const findings = [];
  const files = listCandidateFiles();

  for (const relativePath of files) {
    if (!isAuditScope(relativePath)) continue;
    const normalized = relativePath.replace(/\//g, path.sep);
    const docLike = isDocLike(relativePath);
    for (const rule of PATH_RULES) {
      if (rule.test(relativePath)) {
        findings.push({ file: relativePath, rule: rule.name, type: "path" });
      }
    }

    const absolutePath = path.join(ROOT, normalized);
    if (!fs.existsSync(absolutePath) || isBinary(absolutePath)) continue;
    if (docLike) continue;

    const text = fs.readFileSync(absolutePath, "utf8");
    for (const rule of CONTENT_RULES) {
      if (rule.test.test(text)) {
        findings.push({ file: relativePath, rule: rule.name, type: "content" });
      }
    }
  }

  return findings;
}

const findings = scan();

if (findings.length > 0) {
  const grouped = new Map();
  for (const finding of findings) {
    const key = `${finding.file} :: ${finding.rule}`;
    grouped.set(key, finding);
  }
  for (const finding of grouped.values()) {
    process.stdout.write(`[FAIL] ${finding.rule} -> ${finding.file}\n`);
  }
  process.exit(1);
}

process.stdout.write("[PASS] github-safe audit clean\n");
