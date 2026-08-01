import { NextResponse } from "next/server";
import validationData from "@/data/capitalife/seasonality_validation.json";

function calendarDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date.getTime() - start.getTime()) / 86400000) + 1;
}

function parseEntryDate(id: string): { month: number; day: number; hold: number } | null {
  const m = id.match(/_(\d{2})(\d{2})_(\d+)$/);
  if (!m) return null;
  return { month: parseInt(m[1], 10), day: parseInt(m[2], 10), hold: parseInt(m[3], 10) };
}

export async function GET() {
  const now = new Date();
  const todayCal = calendarDayOfYear(now);
  const patterns = (validationData.patterns as any[]).filter(
    (p) => p.deep_score != null && (p.deep_grade === "A+" || p.deep_grade === "A"),
  );

  const upcoming = patterns
    .map((p) => {
      const entry = parseEntryDate(p.id);
      if (!entry) return null;
      const entryDate = new Date(now.getFullYear(), entry.month - 1, entry.day);
      let entryCal = calendarDayOfYear(entryDate);
      if (entryCal < todayCal - 14) entryCal += 365;
      const daysAway = entryCal - todayCal;
      const exitDate = new Date(entryDate.getTime() + entry.hold * 1.45 * 86400000);
      return {
        id: p.id,
        name: p.name,
        asset: p.asset,
        direction: p.direction,
        deep_grade: p.deep_grade,
        deep_score: p.deep_score,
        entry_date: `${entry.month.toString().padStart(2, "0")}-${entry.day.toString().padStart(2, "0")}`,
        holding_days: entry.hold,
        exit_date_approx: `${(exitDate.getMonth() + 1).toString().padStart(2, "0")}-${exitDate.getDate().toString().padStart(2, "0")}`,
        days_away: daysAway < 0 ? daysAway + 365 : daysAway,
        status: daysAway >= 0 && daysAway <= entry.hold * 1.45 ? "ACTIVE" : daysAway > 0 ? "UPCOMING" : "PAST",
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.days_away - b.days_away);

  return NextResponse.json({
    date: now.toISOString().slice(0, 10),
    signals: upcoming,
  });
}
