import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  // Normalize "1D" → "D" to match how data is stored in monitoring_ohlc
  const rawTf = searchParams.get("timeframe") ?? "D";
  const timeframe = rawTf === "1D" ? "D" : rawTf === "1W" ? "W" : rawTf === "1M" ? "M" : rawTf;
  const limitStr = searchParams.get("limit") ?? "500";
  const limit = Math.min(5000, Math.max(1, parseInt(limitStr, 10) || 500));

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from("monitoring_ohlc")
      .select("date,open,high,low,close")
      .eq("asset", symbol)
      .eq("timeframe", timeframe)
      .gt("close", 0)
      .order("date", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message, bars: [] }, { status: 200 });
    }

    // Fallback: for Core Invest ETFs not yet in monitoring_ohlc, try invest_ohlc
    const INVEST_OHLC_SYMBOLS = new Set(["QQQ", "SPY", "SPMO", "GLD"]);
    if (!data?.length && timeframe === "D" && INVEST_OHLC_SYMBOLS.has(symbol)) {
      const { data: iData } = await db
        .from("invest_ohlc")
        .select("date,open,high,low,close")
        .eq("symbol", symbol)
        .gt("close", 0)
        .order("date", { ascending: false })
        .limit(limit);
      if (iData?.length) {
        const bars = iData
          .reverse()
          .map((r) => ({ time: String(r.date).slice(0, 10), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close) }))
          .filter((b) => b.time && b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0 && b.low <= b.high);
        return NextResponse.json({ bars, symbol, timeframe, count: bars.length, lastDate: bars.at(-1)?.time ?? null, source: "invest_ohlc" });
      }
    }

    if (!data?.length) {
      return NextResponse.json({ bars: [], symbol, timeframe, count: 0 });
    }

    const bars = data
      .reverse()
      .map((row) => ({
        time: String(row.date).slice(0, 10),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
      }))
      .filter(
        (bar) =>
          bar.time &&
          bar.open > 0 &&
          bar.high > 0 &&
          bar.low > 0 &&
          bar.close > 0 &&
          bar.low <= bar.high,
      );

    const lastBar = bars.at(-1);
    return NextResponse.json({
      bars,
      symbol,
      timeframe,
      count: bars.length,
      lastDate: lastBar?.time ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), bars: [] },
      { status: 500 },
    );
  }
}
