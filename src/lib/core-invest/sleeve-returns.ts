import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { OhlcBar } from "@/lib/fsportfolio/types";

const STRATEGIES_DIR = path.join(process.cwd(), "public", "generated", "monitoring", "strategies");
const DESKTOP_INVEST = "C:/Users/joris/Desktop/Invest Portfolio";

// ── CSV parser (TradingView format: time,open,high,low,close) ─────────────────

function parseCsvBars(filePath: string): OhlcBar[] {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
    const dateIdx = headers.indexOf("time") >= 0 ? headers.indexOf("time") : headers.indexOf("date");
    const closeIdx = headers.indexOf("close");
    const openIdx = headers.indexOf("open");
    const highIdx = headers.indexOf("high");
    const lowIdx = headers.indexOf("low");
    if (dateIdx < 0 || closeIdx < 0) return [];

    const deduped = new Map<string, OhlcBar>();
    for (const line of lines.slice(1)) {
      const cells = line.split(",").map((c) => c.trim());
      const date = (cells[dateIdx] ?? "").slice(0, 10);
      const close = Number(cells[closeIdx]);
      if (!date || !Number.isFinite(close)) continue;
      deduped.set(date, {
        date,
        open: Number(cells[openIdx ?? closeIdx] ?? close),
        high: Number(cells[highIdx ?? closeIdx] ?? close),
        low: Number(cells[lowIdx ?? closeIdx] ?? close),
        close,
        volume: null,
      });
    }
    return [...deduped.values()].sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// ── Trade interval extraction from events.json ────────────────────────────────

type EventTrade = {
  direction?: string;
  entryTime?: string;
  exitTime?: string | null;
};

type EventPayload = { trades?: EventTrade[] };

type TradeInterval = { entryDate: string; exitDate: string };

function loadEventsIntervals(filename: string): TradeInterval[] {
  const filePath = path.join(STRATEGIES_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8")) as EventPayload;
    return (payload.trades ?? [])
      .filter((t): t is EventTrade & { entryTime: string; exitTime: string } =>
        Boolean(t.entryTime && t.exitTime && t.direction !== "short"),
      )
      .map((t) => ({
        entryDate: t.entryTime.slice(0, 10),
        exitDate: t.exitTime.slice(0, 10),
      }));
  } catch {
    return [];
  }
}

// ── Trade interval extraction from TradingView German CSV (CHF/6S) ────────────

function loadTvCsvIntervals(filename: string): TradeInterval[] {
  const filePath = path.join(STRATEGIES_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const tradeNoIdx = header.indexOf("Trade #");
    const typIdx = header.indexOf("Typ");
    const datumIdx = header.indexOf("Datum und Uhrzeit");
    const signalIdx = header.indexOf("Signal");
    if (tradeNoIdx < 0 || typIdx < 0 || datumIdx < 0) return [];

    const tradeMap = new Map<string, { entry?: string; exit?: string }>();
    for (const line of lines.slice(1)) {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const tradeNo = cols[tradeNoIdx];
      const typ = cols[typIdx];
      const datum = (cols[datumIdx] ?? "").slice(0, 10);
      const signal = cols[signalIdx] ?? "";
      if (!tradeNo || !datum) continue;
      const rec = tradeMap.get(tradeNo) ?? {};
      if (typ === "Long-Einstieg") rec.entry = datum;
      else if (typ === "Long-Ausstieg" && signal !== "Offen") rec.exit = datum;
      tradeMap.set(tradeNo, rec);
    }

    const intervals: TradeInterval[] = [];
    for (const rec of tradeMap.values()) {
      if (rec.entry && rec.exit) intervals.push({ entryDate: rec.entry, exitDate: rec.exit });
    }
    return intervals.sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  } catch {
    return [];
  }
}

// ── Core: map trade intervals onto OHLC bars → daily returns ─────────────────

function buildSleeveReturns(intervals: TradeInterval[], bars: OhlcBar[]): Record<string, number> {
  if (!intervals.length || bars.length < 2) return {};

  // Build a set of all calendar dates that are "in trade"
  const heldDates = new Set<string>();
  for (const { entryDate, exitDate } of intervals) {
    const cursor = new Date(`${entryDate}T00:00:00Z`);
    const end = new Date(`${exitDate}T00:00:00Z`);
    while (cursor <= end) {
      heldDates.add(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const returns: Record<string, number> = {};
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!;
    const curr = bars[i]!;
    if (prev.close === 0) continue;
    const r = heldDates.has(curr.date) ? curr.close / prev.close - 1 : 0;
    returns[curr.date] = Number(r.toFixed(10));
  }
  return returns;
}

// ── Desktop OHLC loaders ──────────────────────────────────────────────────────

function loadDesktopCsv(candidates: string[]): OhlcBar[] {
  for (const name of candidates) {
    const p = path.join(DESKTOP_INVEST, name);
    if (fs.existsSync(p)) return parseCsvBars(p);
  }
  return [];
}

// ── Public API ────────────────────────────────────────────────────────────────

export type SleeveReturns = {
  QQQ_PINE_2_EMA: Record<string, number>;
  COPPER_HG: Record<string, number>;
  CHF_6S: Record<string, number>;
};

export function loadSleeveReturns(qqqBars: OhlcBar[]): SleeveReturns {
  // QQQ Pine 2 EMA — same underlying as QQQ Pine 1, use QQQ OHLC
  const pine2Intervals = loadEventsIntervals("BATS_QQQ_pine2_events.json");
  const QQQ_PINE_2_EMA = buildSleeveReturns(pine2Intervals, qqqBars);

  // Copper/HG — COMEX HG1! OHLC from Desktop
  const hgBars = loadDesktopCsv(["COMEX_DL_HG1!, 1D_9fc12.csv", "COMEX_DL_HG1!, 1D_9fc12(1).csv"]);
  const hgIntervals = loadEventsIntervals("COMEX_HG1_events.json");
  const COPPER_HG = buildSleeveReturns(hgIntervals, hgBars);

  // CHF/6S — CME 6S1! OHLC from Desktop + TV CSV trade dates (491 trades)
  const chfBars = loadDesktopCsv(["CME_DL_6S1!, 1D_b8f81.csv", "CME_DL_6S1!, 1D_b8f81(1).csv"]);
  const chfIntervals = loadTvCsvIntervals("CME_6S1_tv_backtest_2026-04-26.csv");
  const CHF_6S = buildSleeveReturns(chfIntervals, chfBars);

  return { QQQ_PINE_2_EMA, COPPER_HG, CHF_6S };
}
