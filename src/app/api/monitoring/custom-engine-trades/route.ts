import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

type MonitoringTradeRow = {
  direction: "long" | "short";
  entryTime: string;
  exitTime: string;
  entry: number;
  exit: number;
  sl: number | null;
  tp: number | null;
  exitReason: string | null;
  _source?: string;
};

type RawEngineTradeRow = {
  direction?: string;
  entryTime?: string;
  exitTime?: string | null;
  entryPrice?: number;
  exitPrice?: number | null;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  exitReason?: string | null;
  source?: string | null;
};

type SourceStatus = "real_engine_output" | "missing" | "blocked";
type StrategyParityReport = {
  parityInsideComparableWindow?: {
    parityScore?: number;
  };
  parityScoreInsideOverlap?: number;
  historicalParityStatus?: string | null;
  currentSignal?: "FLAT" | "OPEN";
  currentSignalStatus?: string | null;
};

type CustomEngineProfile = {
  strategyKey: "orange_juice_custom" | "es1_custom" | "pa1_custom" | "pl1_custom";
  aliases: string[];
  source: string;
  sourceLabel: string;
  expectedRowSource: string;
  engineOutputPathCandidates: (cwd: string) => string[];
  referencePathCandidates: (cwd: string) => string[];
  parityReportCandidates: (cwd: string) => string[];
};

const CUSTOM_ENGINE_PROFILES: CustomEngineProfile[] = [
  {
    strategyKey: "orange_juice_custom",
    aliases: ["oj1"],
    source: "local_pine_engine_orange_juice",
    sourceLabel: "Local Python Engine",
    expectedRowSource: "local_pine_engine_orange_juice",
    engineOutputPathCandidates: (cwd) => [
      path.join(cwd, "..", "workspace", "output", "custom_strategy_engines", "orange_juice", "orange_juice_engine_trades.json"),
      path.join(cwd, "workspace", "output", "custom_strategy_engines", "orange_juice", "orange_juice_engine_trades.json"),
    ],
    referencePathCandidates: (cwd) => [
      path.join(cwd, "public", "generated", "monitoring", "reference_events", "oj1_oj1_d_reference_events.json"),
      path.join(cwd, "..", "frontend", "public", "generated", "monitoring", "reference_events", "oj1_oj1_d_reference_events.json"),
    ],
    parityReportCandidates: (cwd) => [
      path.join(cwd, "..", "workspace", "output", "custom_strategy_engines", "orange_juice", "orange_juice_parity_report.json"),
      path.join(cwd, "workspace", "output", "custom_strategy_engines", "orange_juice", "orange_juice_parity_report.json"),
    ],
  },
  {
    strategyKey: "es1_custom",
    aliases: ["es1"],
    source: "local_pine_engine_es1",
    sourceLabel: "Local Python Engine",
    expectedRowSource: "local_pine_engine_es1",
    engineOutputPathCandidates: (cwd) => [
      path.join(cwd, "..", "workspace", "output", "custom_strategy_engines", "es1", "es1_engine_trades.json"),
      path.join(cwd, "workspace", "output", "custom_strategy_engines", "es1", "es1_engine_trades.json"),
    ],
    referencePathCandidates: (cwd) => [
      path.join(cwd, "public", "generated", "monitoring", "reference_events", "es1_es1_d_reference_events.json"),
      path.join(cwd, "..", "frontend", "public", "generated", "monitoring", "reference_events", "es1_es1_d_reference_events.json"),
    ],
    parityReportCandidates: (cwd) => [
      path.join(cwd, "..", "workspace", "output", "custom_strategy_engines", "es1", "es1_parity_report.json"),
      path.join(cwd, "workspace", "output", "custom_strategy_engines", "es1", "es1_parity_report.json"),
    ],
  },
  {
    strategyKey: "pa1_custom",
    aliases: ["pa1"],
    source: "local_pine_engine_pa1",
    sourceLabel: "Local Python Engine",
    expectedRowSource: "local_pine_engine_pa1",
    engineOutputPathCandidates: (cwd) => [
      path.join(cwd, "..", "workspace", "output", "custom_strategy_engines", "pa1", "pa1_engine_trades.json"),
      path.join(cwd, "workspace", "output", "custom_strategy_engines", "pa1", "pa1_engine_trades.json"),
    ],
    referencePathCandidates: (cwd) => [
      path.join(cwd, "public", "generated", "monitoring", "reference_events", "pa1_pa1_d_reference_events.json"),
      path.join(cwd, "..", "frontend", "public", "generated", "monitoring", "reference_events", "pa1_pa1_d_reference_events.json"),
    ],
    parityReportCandidates: (cwd) => [
      path.join(cwd, "..", "workspace", "output", "custom_strategy_engines", "pa1", "pa1_parity_report.json"),
      path.join(cwd, "workspace", "output", "custom_strategy_engines", "pa1", "pa1_parity_report.json"),
    ],
  },
  {
    strategyKey: "pl1_custom",
    aliases: ["pl1"],
    source: "local_pine_engine_pl1",
    sourceLabel: "Local Python Engine",
    expectedRowSource: "local_pine_engine_pl1",
    engineOutputPathCandidates: (cwd) => [
      path.join(cwd, "..", "workspace", "output", "custom_strategy_engines", "pl1", "pl1_engine_trades.json"),
      path.join(cwd, "workspace", "output", "custom_strategy_engines", "pl1", "pl1_engine_trades.json"),
    ],
    referencePathCandidates: (cwd) => [
      path.join(cwd, "public", "generated", "monitoring", "reference_events", "pl1_pl1_d_reference_events.json"),
      path.join(cwd, "..", "frontend", "public", "generated", "monitoring", "reference_events", "pl1_pl1_d_reference_events.json"),
    ],
    parityReportCandidates: (cwd) => [
      path.join(cwd, "..", "workspace", "output", "custom_strategy_engines", "pl1", "pl1_parity_report.json"),
      path.join(cwd, "workspace", "output", "custom_strategy_engines", "pl1", "pl1_parity_report.json"),
    ],
  },
];

function normalizeTime(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function normalizePrice(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function toMonitoringTrade(row: RawEngineTradeRow): MonitoringTradeRow | null {
  const direction = String(row.direction || "").toLowerCase() === "short" ? "short" : "long";
  const entryTime = normalizeTime(row.entryTime);
  const entry = normalizePrice(row.entryPrice);
  if (!entryTime || entry == null) return null;
  const exitTime = normalizeTime(row.exitTime) ?? entryTime;
  const exit = normalizePrice(row.exitPrice) ?? entry;
  return {
    direction,
    entryTime,
    exitTime,
    entry,
    exit,
    sl: normalizePrice(row.stopLossPrice),
    tp: normalizePrice(row.takeProfitPrice),
    exitReason: row.exitReason == null ? null : String(row.exitReason),
    _source: row.source == null ? undefined : String(row.source),
  };
}

async function readJson(filePath: string): Promise<unknown | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadParityReport(candidates: string[]): Promise<StrategyParityReport | null> {
  for (const filePath of candidates) {
    const parsed = await readJson(filePath);
    if (parsed && typeof parsed === "object") return parsed as StrategyParityReport;
  }
  return null;
}

async function loadEngineTrades(candidates: string[]): Promise<{ rows: MonitoringTradeRow[]; filePath: string | null }> {
  for (const filePath of candidates) {
    const parsed = await readJson(filePath);
    if (!Array.isArray(parsed)) continue;
    const rows = parsed.map((row) => toMonitoringTrade(row as RawEngineTradeRow)).filter((row): row is MonitoringTradeRow => Boolean(row));
    return { rows, filePath };
  }
  return { rows: [], filePath: null };
}

async function loadReferenceTrades(candidates: string[]): Promise<{ rows: MonitoringTradeRow[]; filePath: string | null }> {
  for (const filePath of candidates) {
    const parsed = await readJson(filePath);
    const list = Array.isArray((parsed as { trades?: unknown[] } | null)?.trades)
      ? ((parsed as { trades: unknown[] }).trades as RawEngineTradeRow[])
      : [];
    if (!list.length) continue;
    const rows = list.map((row) => {
      const mapped: RawEngineTradeRow = {
        direction: String((row as { direction?: unknown }).direction || ""),
        entryTime: String((row as { entryTime?: unknown }).entryTime || ""),
        exitTime: String((row as { exitTime?: unknown }).exitTime || ""),
        entryPrice: Number((row as { entry?: unknown }).entry),
        exitPrice: Number((row as { exit?: unknown }).exit),
        stopLossPrice: Number((row as { sl?: unknown }).sl),
        takeProfitPrice: Number((row as { tp?: unknown }).tp),
        exitReason: String((row as { exitReason?: unknown }).exitReason || ""),
        source: "csv_reference",
      };
      return toMonitoringTrade(mapped);
    }).filter((row): row is MonitoringTradeRow => Boolean(row));
    return { rows, filePath };
  }
  return { rows: [], filePath: null };
}

function buildTradeFingerprint(rows: MonitoringTradeRow[]): string[] {
  return rows
    .map((row) => `${row.direction}|${row.entryTime}|${row.exitTime}|${row.entry}|${row.exit}`)
    .sort((a, b) => a.localeCompare(b));
}

function firstTradeDate(rows: MonitoringTradeRow[]): string | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => a.entryTime.localeCompare(b.entryTime));
  return sorted[0]?.entryTime ?? null;
}

function lastTradeDate(rows: MonitoringTradeRow[]): string | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => a.entryTime.localeCompare(b.entryTime));
  return sorted[sorted.length - 1]?.entryTime ?? null;
}

function findOpenTrade(rows: MonitoringTradeRow[]): MonitoringTradeRow | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const exitTime = normalizeTime(row.exitTime);
    const exit = normalizePrice(row.exit);
    if (!exitTime || exit == null) return row;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const key = String(request.nextUrl.searchParams.get("strategyKey") || "").trim().toLowerCase();
  const profile = CUSTOM_ENGINE_PROFILES.find((item) => key === item.strategyKey || item.aliases.includes(key)) ?? null;
  if (!profile) {
    return NextResponse.json(
      {
        ok: false,
        sourceStatus: "missing" as SourceStatus,
        fallbackUsed: false,
        warning: "unsupported_strategy_key",
      },
      { status: 400 },
    );
  }

  const cwd = process.cwd();
  const engine = await loadEngineTrades(profile.engineOutputPathCandidates(cwd));
  const reference = await loadReferenceTrades(profile.referencePathCandidates(cwd));
  const comparableReport = await loadParityReport(profile.parityReportCandidates(cwd));

  let sourceStatus: SourceStatus = "real_engine_output";
  let warning: string | null = null;
  let suspiciousFakeParityBlocked = false;
  const fallbackUsed = false;
  let trades = engine.rows;

  if (!engine.filePath || !engine.rows.length) {
    sourceStatus = "missing";
    warning = "local_engine_output_not_available_or_empty";
    trades = [];
  } else {
    const first = firstTradeDate(engine.rows);
    const firstYear = first ? Number(first.slice(0, 4)) : null;
    const hasNonLocalSource = engine.rows.some((row) => String(row._source || "").trim() !== profile.expectedRowSource);
    const sameCountAsReference = reference.rows.length > 0 && engine.rows.length === reference.rows.length;
    const identicalToReference = reference.rows.length > 0
      && JSON.stringify(buildTradeFingerprint(engine.rows)) === JSON.stringify(buildTradeFingerprint(reference.rows));
    const looksLikeReferenceFallback = hasNonLocalSource || identicalToReference || (sameCountAsReference && firstYear === 1970);
    if (looksLikeReferenceFallback) {
      sourceStatus = "blocked";
      suspiciousFakeParityBlocked = true;
      warning = "blocked_suspicious_engine_data_looks_like_csv_reference_fallback";
      trades = [];
    }
  }

  const payload = {
    ok: true,
    source: profile.source,
    sourceStatus,
    fallbackUsed,
    suspiciousFakeParityBlocked,
    warning,
    trades,
    tradeCount: trades.length,
    firstTradeDate: firstTradeDate(trades),
    lastTradeDate: lastTradeDate(trades),
    openTrade: findOpenTrade(trades),
    engineOutputPath: engine.filePath,
    referencePath: reference.filePath,
    referenceTradeCount: reference.rows.length,
    referenceFirstTradeDate: firstTradeDate(reference.rows),
    historicalParityScore: Number(
      comparableReport?.parityInsideComparableWindow?.parityScore
      ?? comparableReport?.parityScoreInsideOverlap
      ?? Number.NaN,
    ),
    historicalParityStatus: comparableReport?.historicalParityStatus ?? "NOT_PARITY_CLEAN",
    currentSignal: comparableReport?.currentSignal ?? (findOpenTrade(trades) ? "OPEN" : "FLAT"),
    currentSignalStatus: comparableReport?.currentSignalStatus ?? "usable_with_warning",
    sourceLabel: profile.sourceLabel,
  };

  return NextResponse.json(payload, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
