import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const SYMBOL_FILES: Record<string, string> = {
  "GC1! 1D":  "gc1_friday_long.json",
  "GLD 1D":   "gld_thursday_long.json",
  "YM1! 1D":  "ym1_tat.json",
  "FDAX1! 1D": "fdax1_tat.json",
};

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "";

  const filename = SYMBOL_FILES[symbol];
  if (!filename) {
    return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", "data", "anomaly", filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: `Data file not found: ${filename}. Run generate_anomaly_json.py first.` },
      { status: 404 },
    );
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse strategy data" }, { status: 500 });
  }
}
