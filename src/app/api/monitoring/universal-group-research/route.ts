import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const INFRA_DIR = path.join(
  process.cwd(),
  "..",
  "workspace",
  "monitoring_strategy_infrastructure",
);

const GROUP_FILES: Record<string, string> = {
  metals_energy: path.join(INFRA_DIR, "metals_energy", "metals_energy_universal_summary.csv"),
  stocks:        path.join(INFRA_DIR, "stocks",        "stocks_universal_summary.csv"),
  forex:         path.join(INFRA_DIR, "forex",         "forex_universal_summary.csv"),
};

export async function GET() {
  const groups: GroupResult[] = [];

  for (const [groupName, csvPath] of Object.entries(GROUP_FILES)) {
    if (!fs.existsSync(csvPath)) {
      groups.push({ group: groupName, status: "missing", pending: true, assets: [] });
      continue;
    }
    try {
      const rows = parseCsv(fs.readFileSync(csvPath, "utf-8"));
      const statusCounts: Record<string, number> = {};
      for (const r of rows) {
        const s = r.status ?? "UNKNOWN";
        statusCounts[s] = (statusCounts[s] ?? 0) + 1;
      }
      const draftCandidates = rows.filter((r) => r.monitoring_draft_candidate === "True");
      groups.push({
        group: groupName,
        status: "loaded",
        pending: false,
        totalAssets: rows.length,
        statusCounts,
        draftCandidateCount: draftCandidates.length,
        assets: rows.map((r) => ({
          asset:       r.asset ?? "",
          family:      r.family ?? "",
          status:      r.status ?? "",
          totalReturn:         parseFloat(r.total_return                  ?? "0"),
          finalOosReturn:      parseFloat(r.final_oos_return              ?? "0"),
          medianWfReturn:      parseFloat(r.median_walkforward_test_return ?? "0"),
          profitFactor:        parseFloat(r.profit_factor                  ?? "0"),
          maxDrawdown:         parseFloat(r.max_drawdown                   ?? "0"),
          tradeCount:          parseInt(r.trade_count                      ?? "0", 10),
          statusReasons:       r.status_reasons     ?? "",
          forexWarnings:       r.forex_warnings     ?? "",
          testedFamilies:      (r.tested_families ?? "").split("|").filter(Boolean),
          isDraftCandidate:    r.monitoring_draft_candidate === "True",
        })),
      });
    } catch (err) {
      groups.push({ group: groupName, status: "error", error: String(err), pending: false, assets: [] });
    }
  }

  const anyLoaded = groups.some((g) => g.status === "loaded");

  return NextResponse.json({
    hasGroupData: anyLoaded,
    researchOnly: true,
    liveReady: false,
    portfolioReady: false,
    groups,
    disclaimer: "RESEARCH ONLY — group summary data is exploratory, no live or portfolio use",
  });
}

interface GroupResult {
  group: string;
  status: string;
  pending?: boolean;
  error?: string;
  totalAssets?: number;
  statusCounts?: Record<string, number>;
  draftCandidateCount?: number;
  assets: unknown[];
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^﻿/, ""));
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (values[i] ?? "").trim().replace(/^"|"$/g, ""); });
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
