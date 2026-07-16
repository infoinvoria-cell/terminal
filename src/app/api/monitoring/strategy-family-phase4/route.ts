import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PHASE4_DIR = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "outputs",
  "phase4",
);

const PHASE4_SUMMARY = path.join(PHASE4_DIR, "phase4_all_candidates_summary.csv");

const REPORT_PATH = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "reports",
  "PHASE4_DENSITY_CALIBRATION_REPORT.md",
);

export async function GET() {
  if (!fs.existsSync(PHASE4_DIR) || !fs.existsSync(PHASE4_SUMMARY)) {
    return NextResponse.json({
      hasPhase4Results: false,
      pending: true,
      researchOnly: true,
      message: "Phase 4 Trade-Density Calibration not yet complete — pending Codex run",
      blockedReason: "robustness blocked by trade density",
      phase3Summary: {
        phase3Pass: 0,
        phase3Weak: 5,
        phase3Rejected: 1,
        note: "Phase 3 WFO: trade density and walk-forward robustness insufficient",
      },
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
    });
  }

  try {
    const rows = parseCsv(fs.readFileSync(PHASE4_SUMMARY, "utf-8"));

    const statusCounts: Record<string, number> = {};
    for (const row of rows) {
      const s = row.phase4_status ?? row.status ?? "UNKNOWN";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    const byAsset: Record<string, Record<string, string>[]> = {};
    for (const row of rows) {
      const id = row.asset ?? "UNKNOWN";
      if (!byAsset[id]) byAsset[id] = [];
      byAsset[id].push(row);
    }

    const assetSummaries = Object.entries(byAsset).map(([assetId, assetRows]) => {
      const status = (r: Record<string, string>) => r.phase4_status ?? r.status ?? "";
      const candidates = assetRows.filter((r) => status(r) === "PHASE4_CANDIDATE");
      const weak      = assetRows.filter((r) => status(r) === "PHASE4_WEAK");
      const rejected  = assetRows.filter((r) => status(r) === "PHASE4_REJECTED");

      return {
        assetId,
        group: assetRows[0]?.group ?? "",
        candidatesTested: assetRows.length,
        phase4Candidate: candidates.length,
        phase4Weak: weak.length,
        phase4Rejected: rejected.length,
        bestCandidate: candidates.length > 0
          ? mapPhase4Row(
              candidates.sort((a, b) =>
                parseFloat(b.median_oos_return ?? "0") - parseFloat(a.median_oos_return ?? "0"),
              )[0],
            )
          : null,
        allCandidates: assetRows.map(mapPhase4Row),
      };
    });

    const hasReport = fs.existsSync(REPORT_PATH);
    const totalCandidates = assetSummaries.reduce((s, a) => s + a.phase4Candidate, 0);

    return NextResponse.json({
      hasPhase4Results: true,
      pending: false,
      researchOnly: true,
      reportAvailable: hasReport,
      totalCandidatesTested: rows.length,
      totalAssets: assetSummaries.length,
      totalPhase4Candidate: totalCandidates,
      globalStatusCounts: statusCounts,
      assets: assetSummaries.sort((a, b) => b.phase4Candidate - a.phase4Candidate),
      blockedReason: totalCandidates === 0 ? "robustness blocked by trade density" : null,
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
      researchNote: "Phase 4 Trade-Density Calibration results are exploratory. No strategy approved for live trading.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read phase4 outputs", detail: String(err), hasPhase4Results: false, pending: false, researchOnly: true },
      { status: 500 },
    );
  }
}

function mapPhase4Row(r: Record<string, string>) {
  return {
    asset: r.asset ?? "",
    family: r.family ?? "",
    phase4Status: r.phase4_status ?? r.status ?? "",
    // Trade-Density metrics
    tradesPerYear:       parseFloat(r.trades_per_year ?? "0"),
    tradesPerFold:       parseFloat(r.trades_per_fold ?? "0"),
    foldsTotal:          parseInt(r.folds_total ?? "0", 10),
    foldsValid:          parseInt(r.folds_valid ?? "0", 10),
    foldsTooFewTrades:   parseInt(r.folds_too_few_trades ?? "0", 10),
    medianOosReturn:     parseFloat(r.median_oos_return ?? "0"),
    worstFoldReturn:     parseFloat(r.worst_fold_return ?? "0"),
    parameterStability:  parseFloat(r.parameter_stability ?? "0"),
    maxDrawdown:         parseFloat(r.max_drawdown ?? "0"),
    profitFactor:        parseFloat(r.profit_factor ?? "0"),
    stabilityScore:      parseFloat(r.stability_score ?? "0"),
    reasons:             r.reasons ?? "",
    params:              r.params ?? "{}",
  };
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
