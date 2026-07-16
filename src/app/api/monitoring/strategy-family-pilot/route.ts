import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PILOT_DIR = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "outputs",
  "pilot",
);

const REPORT_PATH = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "reports",
  "PILOT_STRATEGY_FAMILY_REPORT.md",
);

const SUMMARY_CSV = path.join(PILOT_DIR, "pilot_all_assets_summary.csv");

// BRLUSD: structural BRL collapse 1990-1995 inflates backtested returns — flag for UI
const DATA_CAVEATS: Record<string, string> = {
  BRLUSD: "Structural BRL currency collapse 1990-1995 inflates backtested returns — not a reproducible edge",
  ANOMALY_1: "Same underlying data as GC1 (GLD ETF tracks Gold)",
  ANOMALY_2: "Same underlying data as GC1 (Gold futures)",
  ANOMALY_3: "Same underlying data as DAX_1H (intraday)",
};

export async function GET() {
  if (!fs.existsSync(PILOT_DIR) || !fs.existsSync(SUMMARY_CSV)) {
    return NextResponse.json({
      hasPilotResults: false,
      pending: true,
      message: "Pilot run not yet complete — outputs pending",
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
    });
  }

  try {
    const globalRows = parseCsv(fs.readFileSync(SUMMARY_CSV, "utf-8"));

    // Status counts (excluding NOT_APPLICABLE)
    const statusCounts: Record<string, number> = {};
    for (const row of globalRows) {
      const s = row.status ?? "UNKNOWN";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    // Per-asset summaries from individual directories
    const assetDirs = fs
      .readdirSync(PILOT_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    const assetSummaries: AssetSummary[] = [];

    for (const assetId of assetDirs) {
      const assetDir = path.join(PILOT_DIR, assetId);
      const summaryFile = path.join(assetDir, "family_test_summary.csv");
      const bestFile = path.join(assetDir, "best_family_candidates.csv");

      if (!fs.existsSync(summaryFile)) continue;

      const rows = parseCsv(fs.readFileSync(summaryFile, "utf-8"));
      const activeRows = rows.filter((r) => r.status !== "NOT_APPLICABLE");

      const promising = activeRows.filter((r) => r.status === "PROMISING");
      const weak = activeRows.filter((r) => r.status === "WEAK");
      const rejected = activeRows.filter((r) => r.status === "REJECTED");
      const dataIssue = activeRows.filter((r) => r.status === "DATA_ISSUE");

      // Best candidates: top 3 by CAGR among PROMISING
      const bestRows = fs.existsSync(bestFile)
        ? parseCsv(fs.readFileSync(bestFile, "utf-8"))
            .sort((a, b) => parseFloat(b.cagr) - parseFloat(a.cagr))
            .slice(0, 3)
        : [];

      // Group + timeframe from rows
      const firstActive = activeRows[0] ?? rows[0];

      assetSummaries.push({
        assetId,
        group: firstActive?.group ?? "",
        timeframe: firstActive?.timeframe ?? "1D",
        familiesTested: activeRows.length,
        promising: promising.length,
        weak: weak.length,
        rejected: rejected.length,
        dataIssue: dataIssue.length,
        caveat: DATA_CAVEATS[assetId] ?? null,
        topFamilies: bestRows.map(mapFamilyRow),
        allFamilies: activeRows.map(mapFamilyRow),
        rejectedFamilies: rejected.map((r) => ({
          family: r.family,
          warnings: r.warnings ?? "",
        })),
      });
    }

    const hasReport = fs.existsSync(REPORT_PATH);

    // Aggregate stats
    const assetsWithPromising = assetSummaries.filter((a) => a.promising > 0).length;
    const totalPromising = assetSummaries.reduce((s, a) => s + a.promising, 0);

    return NextResponse.json({
      hasPilotResults: true,
      pending: false,
      reportAvailable: hasReport,
      totalAssetsTested: assetSummaries.length,
      totalFamilyRuns: globalRows.filter((r) => r.status !== "NOT_APPLICABLE").length,
      assetsWithPromising,
      totalPromising,
      globalStatusCounts: statusCounts,
      assets: assetSummaries.sort((a, b) => b.promising - a.promising || b.weak - a.weak),
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
      researchNote: "Pilot results are exploratory. No strategy is approved. No live trading authorized.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to read pilot outputs",
        detail: String(err),
        hasPilotResults: false,
        pending: false,
      },
      { status: 500 },
    );
  }
}

function mapFamilyRow(r: Record<string, string>) {
  return {
    family: r.family ?? "",
    status: r.status ?? "",
    cagr: parseFloat(r.cagr ?? "0"),
    totalReturn: parseFloat(r.return ?? "0"),
    maxDrawdown: parseFloat(r.max_drawdown ?? "0"),
    profitFactor: parseFloat(r.profit_factor ?? "0"),
    winRate: parseFloat(r.win_rate ?? "0"),
    tradeCount: parseInt(r.trade_count ?? "0", 10),
    exposure: parseFloat(r.exposure ?? "0"),
    stability: parseFloat(r.stability ?? "0"),
    dataQuality: r.data_quality ?? "ok",
    oosProxyReturn: parseFloat(r.oos_proxy_return ?? "0"),
    warnings: r.warnings ?? "",
    params: r.params ?? "{}",
  };
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^﻿/, ""));
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (values[i] ?? "").trim().replace(/^"|"$/g, "");
    });
    return obj;
  });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

interface AssetSummary {
  assetId: string;
  group: string;
  timeframe: string;
  familiesTested: number;
  promising: number;
  weak: number;
  rejected: number;
  dataIssue: number;
  caveat: string | null;
  topFamilies: FamilyEntry[];
  allFamilies: FamilyEntry[];
  rejectedFamilies: { family: string; warnings: string }[];
}

interface FamilyEntry {
  family: string;
  status: string;
  cagr: number;
  totalReturn: number;
  maxDrawdown: number;
  profitFactor: number;
  winRate: number;
  tradeCount: number;
  exposure: number;
  stability: number;
  dataQuality: string;
  oosProxyReturn: number;
  warnings: string;
  params: string;
}
