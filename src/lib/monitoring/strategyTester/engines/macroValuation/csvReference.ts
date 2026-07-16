import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import type { MonitoringMvaTrade } from "@/lib/monitoring/strategyTester/types";
import { getAgricultureMvaBinding } from "./bindings";

const PROJECT_ROOT = process.cwd();

function projectPath(rel: string): string {
  return path.join(PROJECT_ROOT, rel);
}

function safeFloat(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(",", ".").trim();
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function excelSerialToDateStr(serial: number): string {
  if (!Number.isFinite(serial) || serial <= 0) return "";
  const adjusted = serial > 60 ? serial - 1 : serial;
  const unixMs = (adjusted - 25569) * 86400000;
  return new Date(unixMs).toISOString().slice(0, 10);
}

function dateObjectToDateStr(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cellToDateStr(value: unknown): string {
  if (value instanceof Date) return dateObjectToDateStr(value);
  if (typeof value === "number") return excelSerialToDateStr(value);
  return String(value ?? "").split(" ")[0] ?? "";
}

function parseTradeRows(rows: unknown[][]): MonitoringMvaTrade[] {
  if (rows.length < 2) return [];
  const headers = (rows[0] as unknown[]).map(normalizeKey);
  const idxNo = headers.findIndex(
    (header) => header === "trade #" || header === "#" || header.includes("trade-nummer") || header.includes("trade nummer"),
  );
  const idxType = headers.findIndex((header) => header === "typ" || header === "type");
  const idxDate = headers.findIndex((header) => header.includes("datum") || header.includes("date"));
  const idxPrice = headers.findIndex((header) => header.startsWith("preis") || header.startsWith("price"));
  const idxNetPct = headers.findIndex((header) =>
    (header.includes("g&v") || header.includes("p&l") || header.includes("profit")) &&
    header.includes("%") &&
    !header.includes("kumulat"),
  );
  const idxCumPct = headers.findIndex((header) => header.includes("kumulat") && header.includes("%"));
  const idxNet = headers.findIndex((header) =>
    (header.includes("g&v") || header.includes("p&l") || header.includes("profit")) &&
    !header.includes("%") &&
    !header.includes("kumulat"),
  );
  const idxCum = headers.findIndex((header) => header.includes("kumulat") && !header.includes("%"));
  if (idxType < 0 || idxDate < 0) return [];

  const grouped = new Map<number, Array<Record<string, unknown>>>();
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] as unknown[];
    const type = String(row[idxType] ?? "").trim();
    if (!type) continue;
    const tradeNo = idxNo >= 0 ? Math.round(safeFloat(row[idxNo])) : index;
    const payload = {
      type,
      date: cellToDateStr(row[idxDate]),
      price: idxPrice >= 0 ? safeFloat(row[idxPrice]) : 0,
      returnPct: idxNetPct >= 0 ? safeFloat(row[idxNetPct]) : 0,
      pnlNet: idxNet >= 0 ? safeFloat(row[idxNet]) : 0,
      cumulativePnl: idxCum >= 0 ? safeFloat(row[idxCum]) : 0,
      cumulativeReturnPct: idxCumPct >= 0 ? safeFloat(row[idxCumPct]) : 0,
    };
    const bucket = grouped.get(tradeNo) ?? [];
    bucket.push(payload);
    grouped.set(tradeNo, bucket);
  }

  const trades: MonitoringMvaTrade[] = [];
  for (const [tradeNo, bucket] of grouped) {
    const entry = bucket.find((row) => String(row.type).toLowerCase().includes("einstieg") || String(row.type).toLowerCase().includes("entry"));
    const exit = bucket.find((row) => String(row.type).toLowerCase().includes("ausstieg") || String(row.type).toLowerCase().includes("exit"));
    if (!entry || !exit) continue;
    const direction: "LONG" | "SHORT" = String(entry.type).toLowerCase().includes("short") ? "SHORT" : "LONG";
    trades.push({
      tradeNo,
      direction,
      entryDate: String(entry.date),
      exitDate: String(exit.date),
      entryPrice: Number(entry.price),
      exitPrice: Number(exit.price),
      returnPct: Number(exit.returnPct),
      pnlNet: Number(exit.pnlNet),
      cumulativePnl: Number(exit.cumulativePnl),
      cumulativeReturnPct: Number(exit.cumulativeReturnPct),
    });
  }
  return trades.sort((left, right) => left.tradeNo - right.tradeNo);
}

function parseListeTrades(sheet: XLSX.WorkSheet): MonitoringMvaTrade[] {
  return parseTradeRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true }));
}

function parseReferenceEvents(filePath: string): MonitoringMvaTrade[] | null {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    events?: Array<Record<string, unknown>>;
  };
  if (!Array.isArray(raw.events) || raw.events.length === 0) return null;

  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const event of raw.events) {
    const tradeId = String(event.tradeId ?? "").trim();
    if (!tradeId) continue;
    const bucket = grouped.get(tradeId) ?? [];
    bucket.push(event);
    grouped.set(tradeId, bucket);
  }

  const trades: MonitoringMvaTrade[] = [];
  let tradeNo = 1;
  for (const events of grouped.values()) {
    const ordered = [...events].sort((left, right) => String(left.time ?? "").localeCompare(String(right.time ?? "")));
    const entry = ordered.find((event) => String(event.type ?? "").includes("entry"));
    const exit = [...ordered].reverse().find((event) => String(event.type ?? "").includes("exit"));
    if (!entry || !exit) continue;

    const entryType = String(entry.type ?? "").toLowerCase();
    const direction: "LONG" | "SHORT" = entryType.includes("short") ? "SHORT" : "LONG";
    const entryPrice = safeFloat(entry.entry ?? entry.price);
    const exitPrice = safeFloat(exit.price ?? exit.exit);
    const returnPct = entryPrice > 0
      ? (direction === "LONG" ? ((exitPrice - entryPrice) / entryPrice) : ((entryPrice - exitPrice) / entryPrice)) * 100
      : 0;
    const previousCumulative = trades.at(-1)?.cumulativeReturnPct ?? 0;

    trades.push({
      tradeNo,
      direction,
      entryDate: cellToDateStr(entry.time),
      exitDate: cellToDateStr(exit.time),
      entryPrice,
      exitPrice,
      returnPct,
      pnlNet: returnPct,
      cumulativePnl: previousCumulative + returnPct,
      cumulativeReturnPct: previousCumulative + returnPct,
    });
    tradeNo += 1;
  }

  return trades.length ? trades : null;
}

function parseTradeReferenceCsv(filePath: string): MonitoringMvaTrade[] | null {
  const text = fs.readFileSync(filePath, "utf8");
  const rows = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(","));
  const trades = parseTradeRows(rows);
  return trades.length ? trades : null;
}

export function loadCsvReferenceTrades(symbol: string): MonitoringMvaTrade[] | null {
  const binding = getAgricultureMvaBinding(symbol);
  if (!binding) return null;

  if (binding.strategyReferenceCsvPath) {
    const strategyReferenceCsvPath = projectPath(binding.strategyReferenceCsvPath);
    if (fs.existsSync(strategyReferenceCsvPath)) {
      const fromReferenceCsv = parseTradeReferenceCsv(strategyReferenceCsvPath);
      if (fromReferenceCsv?.length) return fromReferenceCsv;
    }
  }

  if (binding.referenceEventsPath) {
    const referenceEventsPath = projectPath(binding.referenceEventsPath);
    if (fs.existsSync(referenceEventsPath)) {
      const fromEvents = parseReferenceEvents(referenceEventsPath);
      if (fromEvents?.length) return fromEvents;
    }
  }

  if (binding.tradeExportCsvPath) {
    const tradeExportCsvPath = projectPath(binding.tradeExportCsvPath);
    if (fs.existsSync(tradeExportCsvPath)) {
      const fromTradeExportCsv = parseTradeReferenceCsv(tradeExportCsvPath);
      if (fromTradeExportCsv?.length) return fromTradeExportCsv;
    }
  }

  if (!binding.tradeExportXlsxPath) return null;
  const filePath = projectPath(binding.tradeExportXlsxPath);
  if (!fs.existsSync(filePath)) return null;
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const sheetName = workbook.SheetNames.find((name) =>
    name.toLowerCase().includes("liste") ||
    name.toLowerCase().includes("trade list") ||
    name.toLowerCase().includes("handelsgesch"),
  );
  if (!sheetName) return null;
  return parseListeTrades(workbook.Sheets[sheetName]!);
}
