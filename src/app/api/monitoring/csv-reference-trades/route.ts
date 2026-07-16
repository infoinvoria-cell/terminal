import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

type CsvReferenceTrade = {
  direction: "long" | "short";
  entryTime: string;
  exitTime: string;
  entry: number;
  exit: number;
  sl: null;
  tp: null;
  exitReason: string;
};

type StrategyRuntimeRouteRow = {
  tvSymbol?: string;
  sourceMode?: string | null;
  preferredEventsFile?: string | null;
  referenceEventsFile?: string | null;
  hybridEventsFile?: string | null;
};

type StrategyRuntimeRoutesPayload = {
  routes?: StrategyRuntimeRouteRow[];
};

function normalizeSource(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeDirection(value: unknown): "long" | "short" | null {
  const key = String(value || "").trim().toLowerCase();
  if (key === "long") return "long";
  if (key === "short") return "short";
  return null;
}

function normalizePrice(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function normalizeTime(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const dayOnly = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayOnly) && raw.length <= 10) {
    return `${dayOnly}T00:00:00.000Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && raw.endsWith("Z")) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return `${raw}Z`;
  return null;
}

async function loadJson(filePath: string): Promise<any> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadRuntimeRoutes(cwd: string): Promise<StrategyRuntimeRouteRow[]> {
  const candidates = [
    path.join(cwd, "public", "generated", "monitoring", "config", "strategy_runtime_routes.json"),
    path.join(cwd, "..", "public", "generated", "monitoring", "config", "strategy_runtime_routes.json"),
  ];
  for (const filePath of candidates) {
    const parsed = await loadJson(filePath);
    const rows = Array.isArray(parsed?.routes) ? parsed.routes : [];
    if (rows.length) return rows as StrategyRuntimeRouteRow[];
  }
  return [];
}

async function loadTradesFromEventsFile(cwd: string, relPath: string): Promise<CsvReferenceTrade[]> {
  const cleanRel = String(relPath || "").replace(/^\/+/, "");
  if (!cleanRel) return [];
  const candidates = [
    path.join(cwd, "public", "generated", "monitoring", cleanRel),
    path.join(cwd, "..", "public", "generated", "monitoring", cleanRel),
  ];
  for (const filePath of candidates) {
    const parsed = await loadJson(filePath);
    const rows = Array.isArray(parsed?.trades) ? parsed.trades : [];
    if (!rows.length) continue;
    const out: CsvReferenceTrade[] = [];
    for (const row of rows) {
      const direction = normalizeDirection(row?.direction);
      const entryTime = normalizeTime(row?.entryTime);
      const exitTime = normalizeTime(row?.exitTime ?? row?.entryTime);
      const entry = normalizePrice(row?.entry);
      const exit = normalizePrice(row?.exit ?? row?.entry);
      if (!direction || !entryTime || !exitTime || entry == null || exit == null) continue;
      out.push({
        direction,
        entryTime,
        exitTime,
        entry,
        exit,
        sl: null,
        tp: null,
        exitReason: String(row?.exitReason || "csv_reference"),
      });
    }
    out.sort((a, b) => String(a.entryTime).localeCompare(String(b.entryTime)));
    return out;
  }
  return [];
}

export async function GET(request: NextRequest) {
  const querySources = String(request.nextUrl.searchParams.get("sources") || "");
  const sourceFilter = new Set(
    querySources
      .split(",")
      .map((part) => normalizeSource(part))
      .filter(Boolean),
  );
  const cwd = process.cwd();
  const routes = await loadRuntimeRoutes(cwd);
  const tradesBySource: Record<string, CsvReferenceTrade[]> = {};

  for (const route of routes) {
    const source = normalizeSource(route.tvSymbol);
    if (!source) continue;
    if (sourceFilter.size > 0 && !sourceFilter.has(source)) continue;
    const mode = String(route.sourceMode || "").trim().toLowerCase();
    const candidatePaths = [
      mode === "csv_reference" ? route.preferredEventsFile : null,
      route.referenceEventsFile,
      mode === "hybrid_csv_engine" ? route.hybridEventsFile : null,
      route.preferredEventsFile,
    ].map((v) => String(v || "").trim()).filter(Boolean);
    let loaded: CsvReferenceTrade[] = [];
    for (const rel of candidatePaths) {
      loaded = await loadTradesFromEventsFile(cwd, rel);
      if (loaded.length) break;
    }
    if (!loaded.length) continue;
    if (!tradesBySource[source]) tradesBySource[source] = [];
    tradesBySource[source].push(...loaded);
  }

  for (const source of Object.keys(tradesBySource)) {
    const dedup = new Map<string, CsvReferenceTrade>();
    for (const trade of tradesBySource[source]) {
      const key = `${trade.direction}|${trade.entryTime}|${trade.exitTime}|${trade.entry}|${trade.exit}`;
      if (!dedup.has(key)) dedup.set(key, trade);
    }
    tradesBySource[source] = Array.from(dedup.values()).sort((a, b) => String(a.entryTime).localeCompare(String(b.entryTime)));
  }

  const totalTrades = Object.values(tradesBySource).reduce((acc, list) => acc + list.length, 0);
  return NextResponse.json(
    {
      ok: true,
      source: "strategy_runtime_routes.json",
      tradesBySource,
      totalTrades,
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    },
  );
}
