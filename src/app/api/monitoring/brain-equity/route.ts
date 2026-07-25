import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/monitoring/brain-equity?key=stocks/NVDA
 *
 * Reads equity_curve.csv from Brain monitoring_strategy_infrastructure.
 * CSV format: date,equity where equity is normalized to 1.0 start.
 * Returns { pts: [{time: string, value: number}] } as % change (2 decimal places).
 *
 * Brain path: CAPITALIFE_BRAIN_PATH/90_Inbox/ * /Files/workspace/monitoring_strategy_infrastructure/{key}/dashboard_outputs/equity_curve.csv
 */

const BRAIN_BASE =
  process.env.CAPITALIFE_BRAIN_PATH ??
  path.join(process.env.USERPROFILE ?? "C:\\Users\\joris", "Documents", "Capitalife Brain");

// Allowed path segments to prevent directory traversal
const ALLOWED_KEYS = new Set([
  "stocks/NVDA", "stocks/MSFT", "stocks/GOOGL",
  "forex/ZARUSD", "forex/BRLUSD", "forex/SEKUSD",
  "metals_energy/GC1", "indices/ES1", "indices/NQ1", "indices/YM1",
  "agrar/CT1", "agrar/ZC1", "agrar/SB1", "agrar/OJ1",
]);

function findInfraDir(): string | null {
  const inbox = path.join(BRAIN_BASE, "90_Inbox");
  if (!fs.existsSync(inbox)) return null;
  let entries: string[];
  try { entries = fs.readdirSync(inbox); } catch { return null; }
  // most-recent import first (folder names contain date)
  for (const e of entries.sort().reverse()) {
    const candidate = path.join(inbox, e, "Files", "workspace", "monitoring_strategy_infrastructure");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "key not allowed" }, { status: 400 });
  }

  const infraDir = findInfraDir();
  if (!infraDir) {
    return NextResponse.json({ error: "monitoring_strategy_infrastructure not found" }, { status: 404 });
  }

  const csvPath = path.join(infraDir, ...key.split("/"), "dashboard_outputs", "equity_curve.csv");
  if (!fs.existsSync(csvPath)) {
    return NextResponse.json({ error: "equity_curve.csv not found", csvPath }, { status: 404 });
  }

  let raw: string;
  try { raw = fs.readFileSync(csvPath, "utf8"); } catch {
    return NextResponse.json({ error: "read error" }, { status: 500 });
  }

  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return NextResponse.json({ error: "empty file" }, { status: 404 });
  }

  // Detect header row — must have "date" or "time" as first column
  const header = lines[0].toLowerCase();
  const hasDate = header.startsWith("date") || header.startsWith("time");
  const dataLines = hasDate ? lines.slice(1) : lines;

  const pts: Array<{ time: string; value: number }> = [];
  for (const line of dataLines) {
    const [rawDate, rawEquity] = line.split(",");
    if (!rawDate || !rawEquity) continue;
    const equity = parseFloat(rawEquity);
    if (!isFinite(equity)) continue;
    // ISO date → YYYY-MM-DD
    const date = rawDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    // normalized equity (1.0 = start) → % change with 2 decimal places
    const pct = Math.round((equity - 1) * 10000) / 100;
    pts.push({ time: date, value: pct });
  }

  return NextResponse.json({ pts, count: pts.length }, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" },
  });
}
