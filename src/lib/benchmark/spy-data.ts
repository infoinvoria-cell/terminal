import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

export type SpyDailyReturn = {
  date: string;      // "YYYY-MM-DD"
  returnPct: number; // daily return in %
};

export function loadSpyDailyReturns(): SpyDailyReturn[] {
  try {
    const content = readFileSync(
      join(process.cwd(), "src/data/capitalife/fsportfolio/ohlc/SPY.csv"),
      "utf-8"
    );
    const lines = content.trim().split(/\r?\n/);
    const rows: { date: string; close: number }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(",");
      if (p.length < 5) continue;
      const close = parseFloat(p[4]);
      if (!p[0] || isNaN(close) || close <= 0) continue;
      rows.push({ date: p[0].trim(), close });
    }
    // Only keep data from 2023-01-01 onward (portfolio starts Apr 2024)
  const KEEP_FROM = "2023-01-01";
  const result: SpyDailyReturn[] = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].date < KEEP_FROM) continue;
      const r = (rows[i].close / rows[i - 1].close - 1) * 100;
      result.push({ date: rows[i].date, returnPct: parseFloat(r.toFixed(6)) });
    }
    return result;
  } catch {
    return [];
  }
}

export function loadAllSpyDailyReturns(): SpyDailyReturn[] {
  try {
    const content = readFileSync(
      join(process.cwd(), "src/data/capitalife/fsportfolio/ohlc/SPY.csv"),
      "utf-8"
    );
    const lines = content.trim().split(/\r?\n/);
    const rows: { date: string; close: number }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(",");
      if (p.length < 5) continue;
      const close = parseFloat(p[4]);
      if (!p[0] || isNaN(close) || close <= 0) continue;
      rows.push({ date: p[0].trim(), close });
    }
    const result: SpyDailyReturn[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = (rows[i].close / rows[i - 1].close - 1) * 100;
      result.push({ date: rows[i].date, returnPct: parseFloat(r.toFixed(6)) });
    }
    return result;
  } catch {
    return [];
  }
}
