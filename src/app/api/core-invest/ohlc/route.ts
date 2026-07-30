import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { validateAndRepairOhlc } from "@/lib/market-data/ohlc-quality";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type OhlcBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

const INVEST_SYMBOLS = new Set(["QQQ", "GLD", "SPMO", "SPY", "HG1!", "6S1!"]);
const LOCAL_CSV: Record<string, string> = {
  QQQ: "src/data/capitalife/fsportfolio/ohlc/QQQ.csv",
  GLD: "src/data/capitalife/fsportfolio/ohlc/GLD.csv",
  SPY: "src/data/capitalife/fsportfolio/ohlc/SPY.csv",
};
const LOCAL_TV_JSON: Record<string, string> = {
  "HG1!": "public/generated/monitoring/mobile/HG1.json",
  "6S1!": "public/generated/monitoring/mobile/6S1.json",
};

function normalizeSymbol(raw: string | null): string | null {
  if (!raw) return null;
  const symbol = raw.trim().toUpperCase();
  return INVEST_SYMBOLS.has(symbol) ? symbol : null;
}

async function loadFromSupabase(symbol: string, limit: number): Promise<OhlcBar[]> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from("invest_ohlc")
    .select("date,open,high,low,close,volume")
    .eq("symbol", symbol)
    .order("date", { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];

  return data
    .reverse()
    .map((row) => ({
      date: String(row.date).slice(0, 10),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: row.volume == null ? null : Number(row.volume),
    }));
}

async function loadFromLocalCsv(symbol: string, limit: number): Promise<OhlcBar[]> {
  const rel = LOCAL_CSV[symbol];
  if (!rel) return [];
  const raw = await readFile(path.join(process.cwd(), rel), "utf8").catch(() => "");
  if (!raw) return [];

  const [headerLine, ...lines] = raw.split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  const dateIdx = idx("date") >= 0 ? idx("date") : idx("time");
  const openIdx = idx("open");
  const highIdx = idx("high");
  const lowIdx = idx("low");
  const closeIdx = idx("close");
  const volumeIdx = idx("volume");

  if ([dateIdx, openIdx, highIdx, lowIdx, closeIdx].some((i) => i < 0)) return [];

  return lines
    .map((line) => line.split(","))
    .map((cols) => ({
      date: String(cols[dateIdx] ?? "").slice(0, 10),
      open: Number(cols[openIdx]),
      high: Number(cols[highIdx]),
      low: Number(cols[lowIdx]),
      close: Number(cols[closeIdx]),
      volume: volumeIdx >= 0 ? Number(cols[volumeIdx]) : null,
    }))
    .slice(-limit);
}

async function loadFromLocalTvJson(symbol: string, limit: number): Promise<OhlcBar[]> {
  const rel = LOCAL_TV_JSON[symbol];
  if (!rel) return [];
  const raw = await readFile(path.join(process.cwd(), rel), "utf8").catch(() => "");
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { bars?: Array<Partial<OhlcBar> & { time?: string | number | null }> };
  return (parsed.bars ?? [])
    .map((bar) => ({
      date: String(bar.date ?? bar.time ?? "").slice(0, 10),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: bar.volume == null ? null : Number(bar.volume),
    }))
    .slice(-limit);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = normalizeSymbol(searchParams.get("symbol"));
  const limit = Math.min(5000, Math.max(1, Number(searchParams.get("limit") ?? 500) || 500));

  if (!symbol) {
    return NextResponse.json({ error: "supported symbol required", bars: [] }, { status: 400 });
  }

  const supabaseBars = await loadFromSupabase(symbol, limit).catch(() => []);
  const csvBars = supabaseBars.length ? [] : await loadFromLocalCsv(symbol, limit);
  const jsonBars = supabaseBars.length || csvBars.length ? [] : await loadFromLocalTvJson(symbol, limit);
  const rawBars = supabaseBars.length ? supabaseBars : csvBars.length ? csvBars : jsonBars;
  const quality = validateAndRepairOhlc(
    rawBars.map((bar) => ({
      time: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })),
    { intraday: false },
  );
  const bars = quality.accepted.map((bar) => ({
    date: bar.time.slice(0, 10),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
  const status = bars.length ? "ok" : "missing";

  return NextResponse.json({
    symbol,
    status,
    source: supabaseBars.length ? "supabase:invest_ohlc" : csvBars.length ? "repo:fsportfolio_ohlc" : jsonBars.length ? "repo:tradingview_json" : "missing",
    bars,
    count: bars.length,
    firstDate: bars.at(0)?.date ?? null,
    lastDate: bars.at(-1)?.date ?? null,
    quality: {
      input: rawBars.length,
      accepted: bars.length,
      quarantined: quality.quarantined.length,
      repaired: quality.events.filter((event) => event.severity === "repair").length,
      warnings: quality.events.filter((event) => event.severity === "warning").length,
      flags: quality.flags,
      events: quality.events.slice(-100),
    },
  });
}

export async function POST() {
  return NextResponse.json({ error: "method not supported" }, { status: 405 });
}
