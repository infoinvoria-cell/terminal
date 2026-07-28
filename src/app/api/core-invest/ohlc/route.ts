import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
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
  "HG1!": "public/generated/monitoring/tradingview_data_cache/D/COMEX_HG1_D.json",
  "6S1!": "public/generated/monitoring/tradingview_data_cache/D/CME_6S1_D.json",
};

function normalizeSymbol(raw: string | null): string | null {
  if (!raw) return null;
  const symbol = raw.trim().toUpperCase();
  return INVEST_SYMBOLS.has(symbol) ? symbol : null;
}

function validBar(bar: OhlcBar): boolean {
  return Boolean(
    bar.date &&
    Number.isFinite(bar.open) &&
    Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) &&
    Number.isFinite(bar.close) &&
    bar.open > 0 &&
    bar.high > 0 &&
    bar.low > 0 &&
    bar.close > 0 &&
    bar.low <= bar.high,
  );
}

async function loadFromSupabase(symbol: string, limit: number): Promise<OhlcBar[]> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from("invest_ohlc")
    .select("date,open,high,low,close,volume")
    .eq("symbol", symbol)
    .gt("close", 0)
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
    }))
    .filter(validBar);
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
    .filter(validBar)
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
    .filter(validBar)
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
  const bars = supabaseBars.length ? supabaseBars : csvBars.length ? csvBars : jsonBars;
  const status = bars.length ? "ok" : "missing";

  return NextResponse.json({
    symbol,
    status,
    source: supabaseBars.length ? "supabase:invest_ohlc" : csvBars.length ? "repo:fsportfolio_ohlc" : jsonBars.length ? "repo:tradingview_json" : "missing",
    bars,
    count: bars.length,
    firstDate: bars.at(0)?.date ?? null,
    lastDate: bars.at(-1)?.date ?? null,
  });
}

export async function POST() {
  return NextResponse.json({ error: "method not supported" }, { status: 405 });
}
