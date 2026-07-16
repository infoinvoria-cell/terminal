import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/monitoring/codex-equity-curve?group=agrar&symbol=ZW1
 *
 * Serves Codex equity_curve.csv as JSON.
 * Falls back to drawdown.csv when ?type=drawdown.
 *
 * Allowed groups: agrar, intraday
 * Allowed types:  equity (default), drawdown
 *
 * Response format:
 * { group, symbol, type, source, rowCount, columns, rows: [{date, value},...] }
 */

const ALLOWED_GROUPS = new Set(["agrar","intraday"]);
const ALLOWED_SYMBOLS: Record<string, string[]> = {
  agrar:    ["ZW1","ZC1","ZS1","CC1","KC1","SB1","CT1","OJ1"],
  intraday: ["DAX_1H","DAX_2H","GBPUSD_30M","EURUSD_30M"],
};

function parseCsv(raw: string): Array<Record<string, string>> {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
    return row;
  });
}

function inferValueColumn(headers: string[]): string | null {
  const candidates = ["equity","equity_curve","cumulative_pnl","net_equity","value","pnl","drawdown","drawdown_pct"];
  for (const c of candidates) {
    if (headers.includes(c)) return c;
  }
  // Last non-date column
  const dateish = new Set(["date","time","timestamp","bar_time","datetime"]);
  const nonDate = headers.filter((h) => !dateish.has(h.toLowerCase()));
  return nonDate[nonDate.length - 1] ?? null;
}

function inferDateColumn(headers: string[]): string | null {
  const candidates = ["date","time","timestamp","bar_time","datetime"];
  for (const c of candidates) {
    if (headers.includes(c)) return c;
  }
  return headers[0] ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const group  = (searchParams.get("group")  ?? "").toLowerCase();
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase();
  const type   = (searchParams.get("type")   ?? "equity").toLowerCase();

  if (!ALLOWED_GROUPS.has(group)) {
    return NextResponse.json({ error: `Unknown group: ${group}. Allowed: agrar, intraday` }, { status: 400 });
  }
  const allowed = ALLOWED_SYMBOLS[group] ?? [];
  if (!allowed.includes(symbol)) {
    return NextResponse.json({ error: `Unknown symbol: ${symbol} for group ${group}` }, { status: 400 });
  }
  if (type !== "equity" && type !== "drawdown") {
    return NextResponse.json({ error: "type must be 'equity' or 'drawdown'" }, { status: 400 });
  }

  const infraBase = path.join(process.cwd(), "..", "workspace", "monitoring_strategy_infrastructure", group, symbol);
  const csvFile = type === "drawdown" ? "drawdown.csv" : "equity_curve.csv";
  const csvPath = path.join(infraBase, "dashboard_outputs", csvFile);

  if (!fs.existsSync(csvPath)) {
    return NextResponse.json({
      group, symbol, type, source: "missing",
      rowCount: 0, columns: [], rows: [],
      note: `${csvFile} not found for ${group}/${symbol}`,
    }, { status: 200 });
  }

  try {
    const raw = fs.readFileSync(csvPath, "utf-8");
    const parsed = parseCsv(raw);
    if (!parsed.length) {
      return NextResponse.json({ group, symbol, type, source: "empty", rowCount: 0, columns: [], rows: [] });
    }

    const headers = Object.keys(parsed[0]);
    const dateCol  = inferDateColumn(headers);
    const valueCol = inferValueColumn(headers);

    const rows = parsed
      .map((r) => ({
        date:  dateCol  ? r[dateCol]  : null,
        value: valueCol ? parseFloat(r[valueCol]) : null,
      }))
      .filter((r) => r.date && r.value !== null && !isNaN(r.value as number));

    return NextResponse.json({
      group, symbol, type,
      source: "codex_run3",
      csvFile,
      rowCount: rows.length,
      columns: { date: dateCol, value: valueCol },
      rows,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
