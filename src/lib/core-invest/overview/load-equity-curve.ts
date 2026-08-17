// Server-only loader for Core Invest's genuine dated daily equity curve.
// Reads the real on-disk file — no interpolation, no synthetic points.
// Downsamples by point-skipping (not smoothing) for chart display only.
import fs from "node:fs";
import path from "node:path";

export interface EquityPoint {
  date: string;
  navIndex: number;
  drawdownPct: number;
}

export function loadCoreInvestEquityCurve(maxPoints = 300): EquityPoint[] | null {
  try {
    const filePath = path.join(process.cwd(), "data/core-invest/reference/daily_equity_curves.csv");
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8").trim().split("\n");
    const header = raw[0].split(",");
    const dateIdx = header.indexOf("date");
    const navIdx = header.indexOf("Core Investor Net Index");
    const ddIdx = header.indexOf("Core Investor Net Drawdown");
    if (dateIdx < 0 || navIdx < 0 || ddIdx < 0) return null;

    const rows = raw.slice(1);
    const step = Math.max(1, Math.floor(rows.length / maxPoints));
    const points: EquityPoint[] = [];
    for (let i = 0; i < rows.length; i += step) {
      const cols = rows[i].split(",");
      points.push({ date: cols[dateIdx], navIndex: +cols[navIdx], drawdownPct: +cols[ddIdx] * 100 });
    }
    // always include the true last row so the curve doesn't visually truncate
    const last = rows[rows.length - 1].split(",");
    const lastPoint = { date: last[dateIdx], navIndex: +last[navIdx], drawdownPct: +last[ddIdx] * 100 };
    if (points[points.length - 1]?.date !== lastPoint.date) points.push(lastPoint);
    return points;
  } catch {
    return null;
  }
}
