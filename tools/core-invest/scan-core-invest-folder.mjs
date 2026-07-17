#!/usr/bin/env node
/**
 * scan-core-invest-folder.mjs
 * Scans the Invest Portfolio folder and produces an inventory.
 *
 * Paths: CORE_INVEST_FOLDER and CAPITALIFE_BRAIN_PATH (see tools/_shared/brain-path.mjs).
 */

import fs from "node:fs";
import path from "node:path";
import { getInvestFolder, requireBrainPath } from "../_shared/brain-path.mjs";

const FOLDER = getInvestFolder();
const BRAIN_DATAROOM = path.join(
  requireBrainPath("scan-core-invest-folder"),
  "14_Data_Room"
);
const OUT_MD = path.join(BRAIN_DATAROOM, "Core Invest Folder Inventory.md");
const OUT_JSON = path.join(BRAIN_DATAROOM, "Core Invest Folder Inventory.json");

const SYMBOL_HINTS = {
  spy: "SPY", spmo: "SPMO", qqq: "QQQ", gld: "GLD",
  hg1: "HG1!", "hg1!": "HG1!", comex: "HG1!", "6s1": "6S1!", "6s1!": "6S1!", cme: "6S1!",
  pine1: "QQQ_PINE_1_logic", pine2: "PINE2_logic",
  "white_swan": "QQQ_PINE_1_logic",
};

function detectSymbol(fname) {
  const lower = fname.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, "_");
  for (const [key, sym] of Object.entries(SYMBOL_HINTS)) {
    if (lower.includes(key)) return sym;
  }
  return null;
}

function detectDataType(fname, ext) {
  const lower = fname.toLowerCase();
  if (ext === ".txt" && (lower.includes("pine") || lower.includes("white_swan") || lower.includes("ema"))) return "pine";
  if (lower.includes("trade") || lower.includes("export") || lower.includes("backtest")) return "trade_export";
  if (ext === ".csv" || ext === ".xlsx") return "ohlc";
  return "unknown";
}

function parseCsvMeta(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    if (!lines.length) return { rowCount: 0, firstDate: null, lastDate: null, columns: [], usable: false, issue: "empty" };
    const header = lines[0].split(",").map((c) => c.trim().toLowerCase());
    const dataLines = lines.slice(1).filter((l) => l.trim());
    const rowCount = dataLines.length;

    const dateCol = header.findIndex((c) => c === "time" || c === "date" || c === "datetime");
    const closeCol = header.findIndex((c) => c === "close");

    let firstDate = null;
    let lastDate = null;
    if (dateCol >= 0 && dataLines.length > 0) {
      firstDate = dataLines[0].split(",")[dateCol]?.trim().slice(0, 10) ?? null;
      lastDate = dataLines.at(-1).split(",")[dateCol]?.trim().slice(0, 10) ?? null;
    }

    const usable = closeCol >= 0 && rowCount > 10;
    const issue = !usable ? (closeCol < 0 ? "no close column" : "too few rows") : null;
    return { rowCount, firstDate, lastDate, columns: header, usable, issue };
  } catch (e) {
    return { rowCount: 0, firstDate: null, lastDate: null, columns: [], usable: false, issue: String(e) };
  }
}

function parseTxtMeta(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim() && !l.trim().startsWith("//"));
    return { rowCount: lines.length, firstDate: null, lastDate: null, columns: [], usable: true, issue: null };
  } catch (e) {
    return { rowCount: 0, firstDate: null, lastDate: null, columns: [], usable: false, issue: String(e) };
  }
}

function scanFolder() {
  if (!fs.existsSync(FOLDER)) {
    console.error(`FOLDER NOT FOUND: ${FOLDER}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(FOLDER, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fname = entry.name;
    if (fname === "desktop.ini" || fname.startsWith(".")) continue;
    const ext = path.extname(fname).toLowerCase();
    if (![".csv", ".txt", ".xlsx", ".json"].includes(ext)) continue;

    const fullPath = path.join(FOLDER, fname);
    const stat = fs.statSync(fullPath);
    const detectedSymbol = detectSymbol(fname);
    const detectedDataType = detectDataType(fname, ext);

    let meta = { rowCount: 0, firstDate: null, lastDate: null, columns: [], usable: false, issue: "not parsed" };
    if (ext === ".csv") meta = parseCsvMeta(fullPath);
    else if (ext === ".txt") meta = parseTxtMeta(fullPath);
    else if (ext === ".xlsx") meta = { ...meta, usable: true, issue: "xlsx – not parsed inline" };

    results.push({
      fullPath: fullPath.replace(/\\/g, "/"),
      fileName: fname,
      type: ext.slice(1),
      detectedSymbol,
      detectedDataType,
      sizeBytes: stat.size,
      ...meta,
    });
  }

  return results;
}

function buildMarkdown(inventory) {
  const now = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Core Invest Folder Inventory`,
    ``,
    `**Folder:** \`${FOLDER}\``,
    `**Scanned:** ${now}`,
    `**Files:** ${inventory.length}`,
    ``,
    `## Files`,
    ``,
    `| File | Type | Symbol | Data Type | Rows | First Date | Last Date | Usable |`,
    `|------|------|--------|-----------|------|------------|-----------|--------|`,
  ];
  for (const f of inventory) {
    lines.push(
      `| \`${f.fileName}\` | ${f.type} | ${f.detectedSymbol ?? "-"} | ${f.detectedDataType} | ${f.rowCount} | ${f.firstDate ?? "-"} | ${f.lastDate ?? "-"} | ${f.usable ? "✓" : "✗"} |`,
    );
  }

  const missing = [];
  const required = { SPY: false, SPMO: false, QQQ: false, GLD: false, "HG1!": false, "6S1!": false };
  for (const f of inventory) {
    if (f.detectedSymbol && required[f.detectedSymbol] === false) required[f.detectedSymbol] = true;
  }
  for (const [sym, found] of Object.entries(required)) {
    if (!found) missing.push(sym);
  }

  lines.push(``, `## Missing Required Files`, ``);
  if (missing.length === 0) {
    lines.push(`All required OHLC files found.`);
  } else {
    for (const sym of missing) lines.push(`- ✗ **${sym}** – OHLC not found`);
  }

  lines.push(``, `## Issues`, ``);
  const issues = inventory.filter((f) => f.issue);
  if (!issues.length) lines.push(`No issues.`);
  else for (const f of issues) lines.push(`- \`${f.fileName}\`: ${f.issue}`);

  return lines.join("\n");
}

const inventory = scanFolder();

fs.mkdirSync(BRAIN_DATAROOM, { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(inventory, null, 2), "utf-8");
fs.writeFileSync(OUT_MD, buildMarkdown(inventory), "utf-8");

console.log(`Scanned ${inventory.length} files.`);
console.log(`JSON → ${OUT_JSON}`);
console.log(`MD   → ${OUT_MD}`);
inventory.forEach((f) => {
  const status = f.usable ? "✓" : "✗";
  console.log(`  ${status} ${f.fileName} | ${f.detectedSymbol ?? "-"} | ${f.detectedDataType} | ${f.rowCount} rows | ${f.firstDate ?? "-"} → ${f.lastDate ?? "-"}`);
});
