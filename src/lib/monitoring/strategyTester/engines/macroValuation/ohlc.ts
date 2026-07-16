import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { AgricultureMvaDataBinding } from "./types";

type OhlcBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

const PROJECT_ROOT = process.cwd();

function projectPath(relPath: string): string {
  return path.join(PROJECT_ROOT, relPath);
}

function normalizeDate(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toNumber(raw: unknown): number | null {
  const num = Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

async function parseCsv(filePath: string): Promise<OhlcBar[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((part) => part.trim().toLowerCase());
  const indexOf = (aliases: string[]): number => header.findIndex((key) => aliases.includes(key));
  const timeIdx = indexOf(["time", "date", "timestamp"]);
  const openIdx = indexOf(["open", "o"]);
  const highIdx = indexOf(["high", "h"]);
  const lowIdx = indexOf(["low", "l"]);
  const closeIdx = indexOf(["close", "c"]);
  const volumeIdx = indexOf(["volume", "v"]);
  if ([timeIdx, openIdx, highIdx, lowIdx, closeIdx].some((index) => index < 0)) return [];

  const rows: OhlcBar[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    const time = normalizeDate(parts[timeIdx]);
    const open = toNumber(parts[openIdx]);
    const high = toNumber(parts[highIdx]);
    const low = toNumber(parts[lowIdx]);
    const close = toNumber(parts[closeIdx]);
    if (!time || open == null || high == null || low == null || close == null) continue;
    const volume = volumeIdx >= 0 ? toNumber(parts[volumeIdx]) : null;
    rows.push({ time, open, high, low, close, volume });
  }
  return rows;
}

async function parseJson(filePath: string): Promise<OhlcBar[]> {
  const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  const payload = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { bars?: unknown[] })?.bars)
      ? (raw as { bars: unknown[] }).bars
      : Array.isArray((raw as { data?: unknown[] })?.data)
        ? (raw as { data: unknown[] }).data
        : [];

  const rows: OhlcBar[] = [];
  for (const item of payload) {
    if (Array.isArray(item)) {
      const time = normalizeDate(item[0]);
      const open = toNumber(item[1]);
      const high = toNumber(item[2]);
      const low = toNumber(item[3]);
      const close = toNumber(item[4]);
      const volume = toNumber(item[5]);
      if (!time || open == null || high == null || low == null || close == null) continue;
      rows.push({ time, open, high, low, close, volume });
      continue;
    }
    const row = item as Record<string, unknown>;
    const time = normalizeDate(row.time ?? row.date ?? row.timestamp ?? row.t);
    const open = toNumber(row.open ?? row.o);
    const high = toNumber(row.high ?? row.h);
    const low = toNumber(row.low ?? row.l);
    const close = toNumber(row.close ?? row.c);
    const volume = toNumber(row.volume ?? row.v);
    if (!time || open == null || high == null || low == null || close == null) continue;
    rows.push({ time, open, high, low, close, volume });
  }
  return rows;
}

export async function buildMergedOhlcFile(binding: AgricultureMvaDataBinding): Promise<{
  mergedFilePath: string;
  rowCount: number;
  firstDate: string;
  lastDate: string;
  liveCacheLastBar: string | null;
  ohlcFingerprint: string;
}> {
  const validatedPath = binding.validatedOhlcCsvPath ? projectPath(binding.validatedOhlcCsvPath) : null;
  const livePath = projectPath(binding.liveOhlcJsonPath);

  let rawValidatedBars: OhlcBar[] = [];
  if (validatedPath) {
    try {
      rawValidatedBars = await parseCsv(validatedPath);
    } catch {
      // validated CSV missing or unreadable — live cache only
    }
  }

  let liveBars: OhlcBar[] = [];
  try {
    liveBars = await parseJson(livePath);
  } catch {
    // live JSON missing — validated only
  }
  const validatedBars = rawValidatedBars;
  const liveCacheLastBar = liveBars.at(-1)?.time ?? null;

  const byDate = new Map<string, OhlcBar>();
  for (const row of validatedBars) byDate.set(row.time, row);
  for (const row of liveBars) byDate.set(row.time, row);
  const mergedBars = Array.from(byDate.values()).sort((left, right) => left.time.localeCompare(right.time));
  if (!mergedBars.length) {
    throw new Error(`No OHLC rows available for ${binding.symbol}`);
  }

  const outputDir = projectPath(".next/cache/mva_ohlc");
  await fs.mkdir(outputDir, { recursive: true });
  const mergedFilePath = path.join(outputDir, `${binding.symbol.replace("!", "")}_merged.json`);
  await fs.writeFile(mergedFilePath, JSON.stringify(mergedBars, null, 2), "utf8");

  const hash = crypto.createHash("sha1");
  hash.update(binding.symbol);
  hash.update(String(mergedBars.length));
  hash.update(mergedBars[0]?.time ?? "");
  hash.update(mergedBars.at(-1)?.time ?? "");
  hash.update(`${mergedBars.at(-1)?.close ?? ""}`);

  return {
    mergedFilePath,
    rowCount: mergedBars.length,
    firstDate: mergedBars[0]!.time,
    lastDate: mergedBars.at(-1)!.time,
    liveCacheLastBar,
    ohlcFingerprint: hash.digest("hex").slice(0, 12),
  };
}
