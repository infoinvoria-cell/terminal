/**
 * Parser for TradingView strategy export CSVs (German format).
 *
 * Format: each trade = 2 rows (exit row first, then entry row), same Trade #.
 * Columns: Trade #, Typ, Datum und Uhrzeit, Signal, Preis USX, ..., G&V netto %,...
 * File may have a UTF-8 BOM.
 *
 * Supported Typ values:
 *   Long-Einstieg   / Short-Einstieg   → entry
 *   Long-Ausstieg   / Short-Ausstieg   → exit
 */

export interface TvStrategyTrade {
  tradeNum: number;
  direction: "LONG" | "SHORT";
  entryDate: string;   // YYYY-MM-DD
  exitDate:  string;   // YYYY-MM-DD
  entryPrice: number;
  exitPrice:  number;
  netPnlPct:  number;  // G&V netto % (already a percentage, e.g. -1.28 = -1.28%)
  cumulativePnlPct: number;
}

export interface ParsedTvStrategy {
  strategyName: string;    // derived from filename hint
  detectedAsset: string | null;  // "wheat", "cocoa", etc.
  totalTrades: number;
  firstTradeDate: string;
  lastTradeDate: string;
  trades: TvStrategyTrade[];
}

// Map filename fragments to agri asset IDs
const ASSET_HINTS: Array<[RegExp, string]> = [
  [/ZW1/i,  "wheat"],
  [/ZC1/i,  "corn"],
  [/ZS1/i,  "soybeans"],
  [/CC1/i,  "cocoa"],
  [/KC1/i,  "coffee"],
  [/SB1/i,  "sugar"],
  [/CT1/i,  "cotton"],
  [/OJ1/i,  "orangejuice"],
];

export function detectAssetFromFilename(filename: string): string | null {
  for (const [pattern, assetId] of ASSET_HINTS) {
    if (pattern.test(filename)) return assetId;
  }
  return null;
}

export function parseTvStrategyCsv(
  csvText: string,
  filename = "",
): ParsedTvStrategy {
  // Remove BOM if present
  const text = csvText.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length < 2) {
    return {
      strategyName: filename,
      detectedAsset: detectAssetFromFilename(filename),
      totalTrades: 0,
      firstTradeDate: "",
      lastTradeDate: "",
      trades: [],
    };
  }

  // Parse header — find column indices
  const header = parseRow(lines[0]);
  const idx = {
    tradeNum:       header.findIndex(h => h.includes("Trade")),
    typ:            header.findIndex(h => h.includes("Typ")),
    date:           header.findIndex(h => h.includes("Datum")),
    price:          header.findIndex(h => h.includes("Preis")),
    netPnlPct:      header.findIndex(h => h.includes("G&V netto %")),
    cumPnlPct:      header.findIndex(h => h.includes("Kumulativer G&V %")),
  };

  // Collect rows by trade number
  const byTradeNum = new Map<number, { entry?: Record<string,string>; exit?: Record<string,string> }>();

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    if (row.length < 5) continue;

    const tradeNum = parseInt(row[idx.tradeNum]);
    if (isNaN(tradeNum)) continue;

    const typ = row[idx.typ] ?? "";
    const isEntry = typ.includes("Einstieg");
    const isExit  = typ.includes("Ausstieg");
    if (!isEntry && !isExit) continue;

    const rowObj: Record<string,string> = {};
    header.forEach((h, j) => { rowObj[h] = row[j] ?? ""; });

    if (!byTradeNum.has(tradeNum)) byTradeNum.set(tradeNum, {});
    const slot = byTradeNum.get(tradeNum)!;
    if (isEntry) slot.entry = rowObj;
    if (isExit)  slot.exit  = rowObj;
  }

  const trades: TvStrategyTrade[] = [];

  for (const [tradeNum, { entry, exit }] of Array.from(byTradeNum.entries()).sort(([a],[b]) => a-b)) {
    if (!entry || !exit) continue;

    const typ = entry["Typ"] ?? "";
    const direction: "LONG" | "SHORT" = typ.includes("Long") ? "LONG" : "SHORT";

    const entryDate = parseDate(entry["Datum und Uhrzeit"] ?? "");
    const exitDate  = parseDate(exit["Datum und Uhrzeit"] ?? "");
    if (!entryDate || !exitDate) continue;

    const entryPrice = parseFloat((entry["Preis USX"] ?? "0").replace(",", ".")) || 0;
    const exitPrice  = parseFloat((exit["Preis USX"] ?? "0").replace(",", ".")) || 0;
    const netPnlPct  = parseFloat((exit["G&V netto %"] ?? "0").replace(",", ".")) || 0;
    const cumPnlPct  = parseFloat((exit["Kumulativer G&V %"] ?? "0").replace(",", ".")) || 0;

    trades.push({ tradeNum, direction, entryDate, exitDate, entryPrice, exitPrice, netPnlPct, cumulativePnlPct: cumPnlPct });
  }

  const firstTradeDate = trades[0]?.entryDate ?? "";
  const lastTradeDate  = trades[trades.length-1]?.exitDate ?? "";

  return {
    strategyName: filename.replace(/\.csv$/i, "").replace(/_/g, " "),
    detectedAsset: detectAssetFromFilename(filename),
    totalTrades: trades.length,
    firstTradeDate,
    lastTradeDate,
    trades,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function parseRow(line: string): string[] {
  // Simple CSV parse — handles commas within quotes
  const cells: string[] = [];
  let current = "", inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { cells.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseDate(raw: string): string | null {
  // Accepts "YYYY-MM-DD HH:MM" or "YYYY-MM-DD" or various formats
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
