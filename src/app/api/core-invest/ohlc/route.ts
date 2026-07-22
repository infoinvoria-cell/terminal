import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

const INVEST_FOLDER = process.env.INVEST_PORTFOLIO_PATH ?? "C:\\Users\\joris\\Desktop\\Invest Portfolio";

const SYMBOL_FILE_MAP: Record<string, string[]> = {
  QQQ:   ["QQQ.csv", "QQQ(1).csv", "QQQ(2).csv", "BATS_QQQ, 1D_9233b.csv"],
  SPY:   ["SPY.csv", "SPY(1).csv", "BATS_SPY, 1D_bb5e9.csv"],
  SPMO:  ["SPMO.csv", "SPMO(1).csv", "BATS_SPMO, 1D_fe070.csv"],
  GLD:   ["GLD.csv", "GLD(1).csv", "BATS_GLD, 1D_4975f.csv"],
  "GC1!": ["COMEX_DL_GC1!, 1D.csv", "GC1!.csv", "GC1.csv"],
  "HG1!": ["COMEX_DL_HG1!, 1D_9fc12.csv", "COMEX_DL_HG1!, 1D_9fc12(1).csv", "COMEX_DL_HG1!, 1D_9fc12(2).csv"],
  "6S1!": ["CME_DL_6S1!, 1D_b8f81.csv", "CME_DL_6S1!, 1D_b8f81(1).csv", "CME_DL_6S1!, 1D_b8f81(2).csv"],
};

function resolveFile(symbol: string): string | null {
  const candidates = SYMBOL_FILE_MAP[symbol] ?? [];
  for (const fname of candidates) {
    const full = path.join(INVEST_FOLDER, fname);
    if (fs.existsSync(full)) return full;
  }
  // fallback: scan folder for symbol substring
  try {
    const files = fs.readdirSync(INVEST_FOLDER);
    const sym = symbol.replace("!", "").toLowerCase();
    const match = files.find((f) => f.toLowerCase().includes(sym) && f.endsWith(".csv"));
    if (match) return path.join(INVEST_FOLDER, match);
  } catch {
    // ignore
  }
  return null;
}

type OhlcBar = { date: string; open: number; high: number; low: number; close: number; volume?: number | null };

function parseCsvRows(raw: string): Record<string, string>[] {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const result: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = cols[j] ?? "";
    }
    result.push(row);
  }
  return result;
}

function parseCsvToOhlc(filePath: string): { bars: OhlcBar[]; error?: string } {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const records = parseCsvRows(raw);

    const bars: OhlcBar[] = [];
    for (const row of records) {
      const dateRaw = row["time"] ?? row["date"] ?? row["Date"] ?? row["Time"] ?? "";
      const openRaw = row["open"] ?? row["Open"] ?? "";
      const highRaw = row["high"] ?? row["High"] ?? "";
      const lowRaw = row["low"] ?? row["Low"] ?? "";
      const closeRaw = row["close"] ?? row["Close"] ?? "";
      const volRaw = row["volume"] ?? row["Volume"] ?? null;

      const dateStr = dateRaw.slice(0, 10);
      const open = Number.parseFloat(openRaw);
      const high = Number.parseFloat(highRaw);
      const low = Number.parseFloat(lowRaw);
      const close = Number.parseFloat(closeRaw);
      const volume = volRaw ? Number.parseFloat(volRaw) : null;

      if (!dateStr || !Number.isFinite(close)) continue;
      bars.push({ date: dateStr, open, high, low, close, volume });
    }
    bars.sort((a, b) => a.date.localeCompare(b.date));
    return { bars };
  } catch (err) {
    return { bars: [], error: String(err) };
  }
}

async function fromSupabaseInvestOhlc(symbol: string): Promise<NextResponse> {
  try {
    const db = createSupabaseServiceClient();
    // PostgREST caps at 1000 rows — paginate to fetch full history
    const PAGE = 1000;
    const allRows: Array<{ date: string; open: unknown; high: unknown; low: unknown; close: unknown; volume: unknown }> = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from("invest_ohlc")
        .select("date,open,high,low,close,volume")
        .eq("symbol", symbol)
        .order("date", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return NextResponse.json({ symbol, status: "error", bars: [], error: error.message });
      if (!data?.length) break;
      allRows.push(...(data as typeof allRows));
      if (data.length < PAGE) break;
    }
    if (!allRows.length) {
      return NextResponse.json({ symbol, status: "missing", bars: [], error: `No data in Supabase for ${symbol}` });
    }
    const bars: OhlcBar[] = allRows.map((r) => ({
      date: r.date as string,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: r.volume != null ? Number(r.volume) : null,
    }));
    return NextResponse.json({
      symbol, status: "ok", filePath: null,
      rowCount: bars.length,
      firstDate: bars[0]?.date ?? null,
      lastDate: bars.at(-1)?.date ?? null,
      bars,
    });
  } catch (e) {
    return NextResponse.json({ symbol, status: "error", bars: [], error: String(e) });
  }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase() ?? "";
  if (!symbol) return NextResponse.json({ error: "symbol param required" }, { status: 400 });

  if (!process.env.INVEST_PORTFOLIO_PATH) {
    return fromSupabaseInvestOhlc(symbol);
  }

  const filePath = resolveFile(symbol);
  if (!filePath) {
    return fromSupabaseInvestOhlc(symbol);
  }

  const { bars, error } = parseCsvToOhlc(filePath);
  return NextResponse.json({
    symbol,
    status: error ? "error" : bars.length ? "ok" : "empty",
    filePath: filePath.replace(/\\/g, "/"),
    rowCount: bars.length,
    firstDate: bars[0]?.date ?? null,
    lastDate: bars.at(-1)?.date ?? null,
    bars,
    ...(error ? { error } : {}),
  });
}
