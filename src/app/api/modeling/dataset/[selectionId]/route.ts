import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { DATASOURCE_MAP } from "@/lib/modeling/datasource-map";

type SeriesPoint = { date: string; value: number | null };

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCsv(csvPath: string): { date: string; close: number }[] {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.trim().split("\n");
  const result: { date: string; close: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    const date = parts[0].trim();
    const close = parseFloat(parts[4].trim());
    if (date && !isNaN(close) && close > 0) {
      result.push({ date, close });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function toNormalizedSeries(rows: { date: string; close: number }[]): SeriesPoint[] {
  if (rows.length === 0) return [];
  const base = rows[0].close;
  return rows.map((r) => ({ date: r.date, value: (r.close / base) * 100 }));
}

/**
 * Align benchmark series to the same date range as the subject series.
 * Returns benchmark values for dates present in subjectDates.
 */
function alignBenchmark(
  subjectSeries: SeriesPoint[],
  benchmarkRows: { date: string; close: number }[],
): SeriesPoint[] {
  if (!subjectSeries.length || !benchmarkRows.length) return [];

  const subjectStart = subjectSeries[0].date;
  const subjectEnd = subjectSeries[subjectSeries.length - 1].date;

  // Filter benchmark to subject's date range
  const filtered = benchmarkRows.filter(
    (r) => r.date >= subjectStart && r.date <= subjectEnd,
  );
  if (filtered.length === 0) return [];

  const base = filtered[0].close;
  return filtered.map((r) => ({ date: r.date, value: (r.close / base) * 100 }));
}

// ─── Series JSON helpers ───────────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;

function resolveSeriesJson(
  jsonPath: string,
  equityArrayField: string,
  dateField: string,
  valueField: string,
  valueBase: number,
): SeriesPoint[] {
  const fullPath = path.join(process.cwd(), jsonPath);
  const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as AnyRecord;
  const arr = raw[equityArrayField] as AnyRecord[];
  if (!Array.isArray(arr) || arr.length === 0) return [];

  return arr
    .map((elem) => ({
      date: String(elem[dateField] ?? ""),
      value: Number(elem[valueField] ?? 0) - valueBase + 100,
    }))
    .filter((p) => p.date.length >= 8 && !isNaN(p.value));
}

// ─── Canonical CSV directory ───────────────────────────────────────────────────

const CANONICAL_DIR = path.join(process.cwd(), "data", "core-invest", "canonical");

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ selectionId: string }> },
) {
  const { selectionId: rawId } = await params;
  const selectionId = decodeURIComponent(rawId);
  const source = DATASOURCE_MAP[selectionId];

  if (!source) {
    return NextResponse.json(
      { error: "UNAVAILABLE", reason: "NO_DATASOURCE_ENTRY", selectionId },
      { status: 404 },
    );
  }

  try {
    let performanceSeries: SeriesPoint[] = [];
    let benchmarkSeries: SeriesPoint[] = [];

    if (source.type === "ohlc") {
      const csvPath = path.join(CANONICAL_DIR, source.csvFile);
      if (!fs.existsSync(csvPath)) {
        return NextResponse.json(
          { error: "UNAVAILABLE", reason: "CSV_NOT_FOUND", path: csvPath },
          { status: 404 },
        );
      }
      const rows = parseCsv(csvPath);
      performanceSeries = toNormalizedSeries(rows);

      if (source.benchmarkCsvFile) {
        const benchPath = path.join(CANONICAL_DIR, source.benchmarkCsvFile);
        if (fs.existsSync(benchPath)) {
          const benchRows = parseCsv(benchPath);
          benchmarkSeries = alignBenchmark(performanceSeries, benchRows);
        }
      }
    } else {
      // series-json
      performanceSeries = resolveSeriesJson(
        source.jsonPath,
        source.equityArrayField,
        source.dateField,
        source.valueField,
        source.valueBase,
      );
    }

    const from = performanceSeries[0]?.date?.slice(0, 7) ?? "—";
    const to = performanceSeries[performanceSeries.length - 1]?.date?.slice(0, 7) ?? "—";

    return NextResponse.json(
      {
        selectionId,
        selectionType: source.selectionType,
        label: source.label,
        historyFrom: from,
        historyTo: to,
        performanceSeries,
        benchmarkSeries,
        sourceProvenance: source.type === "ohlc"
          ? `data/core-invest/canonical/${source.csvFile}`
          : source.jsonPath,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "RESOLVER_ERROR", message: String(err), selectionId },
      { status: 500 },
    );
  }
}
