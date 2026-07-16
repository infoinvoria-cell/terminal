import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PHASE5_DIR = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "outputs",
  "phase5",
);

const PHASE5_SUMMARY = path.join(PHASE5_DIR, "phase5_all_candidates_summary.csv");

const REPORT_PATH = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "reports",
  "PHASE5_ALTERNATIVE_WFO_REPORT.md",
);

export async function GET() {
  if (!fs.existsSync(PHASE5_DIR) || !fs.existsSync(PHASE5_SUMMARY)) {
    return NextResponse.json({
      hasPhase5Results: false,
      pending: true,
      researchOnly: true,
      message: "Phase 5 Alternative WFO not yet complete — pending Codex run",
      phase4Summary: {
        phase4Candidates: ["NQ1/volatility_regime", "AAPL/seasonality", "AAPL/breakout", "SPX/seasonality"],
        phase4Weak: ["SPX/trend_momentum"],
        note: "Phase 4: 4 CANDIDATE, 1 WEAK — alternative WFO layouts in progress",
      },
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
    });
  }

  try {
    const rows = parseCsv(fs.readFileSync(PHASE5_SUMMARY, "utf-8"));

    const statusCounts: Record<string, number> = {};
    for (const row of rows) {
      const s = row.phase5_status ?? row.status ?? "UNKNOWN";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    const byAsset: Record<string, Record<string, string>[]> = {};
    for (const row of rows) {
      const id = row.asset ?? "UNKNOWN";
      if (!byAsset[id]) byAsset[id] = [];
      byAsset[id].push(row);
    }

    const assetSummaries = Object.entries(byAsset).map(([assetId, assetRows]) => {
      const status = (r: Record<string, string>) => r.phase5_status ?? r.status ?? "";
      const robust   = assetRows.filter((r) => status(r) === "PHASE5_ROBUST_CANDIDATE");
      const weak     = assetRows.filter((r) => status(r) === "PHASE5_WEAK");
      const rejected = assetRows.filter((r) => status(r) === "PHASE5_REJECTED");

      return {
        assetId,
        group: assetRows[0]?.group ?? "",
        candidatesTested: assetRows.length,
        phase5RobustCandidate: robust.length,
        phase5Weak: weak.length,
        phase5Rejected: rejected.length,
        bestCandidate: robust.length > 0
          ? mapPhase5Row(
              robust.sort((a, b) =>
                parseFloat(b.median_layout_oos_return ?? b.robustness_score ?? "0") -
                parseFloat(a.median_layout_oos_return ?? a.robustness_score ?? "0"),
              )[0],
            )
          : null,
        allCandidates: assetRows.map(mapPhase5Row),
      };
    });

    const hasReport = fs.existsSync(REPORT_PATH);
    const totalRobust = assetSummaries.reduce((s, a) => s + a.phase5RobustCandidate, 0);

    return NextResponse.json({
      hasPhase5Results: true,
      pending: false,
      researchOnly: true,
      reportAvailable: hasReport,
      totalCandidatesTested: rows.length,
      totalAssets: assetSummaries.length,
      totalPhase5RobustCandidate: totalRobust,
      globalStatusCounts: statusCounts,
      assets: assetSummaries.sort((a, b) => b.phase5RobustCandidate - a.phase5RobustCandidate),
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
      researchNote: "Phase 5 Alternative WFO results are exploratory. No strategy approved for live trading.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read phase5 outputs", detail: String(err), hasPhase5Results: false, pending: false, researchOnly: true },
      { status: 500 },
    );
  }
}

function mapPhase5Row(r: Record<string, string>) {
  return {
    asset:  r.asset  ?? "",
    family: r.family ?? "",
    phase5Status: r.phase5_status ?? r.status ?? "",
    // Alternative WFO layout metrics
    layoutCount:                    parseInt(r.layout_count ?? "0", 10),
    layoutsValid:                   parseInt(r.layouts_valid ?? "0", 10),
    layoutsFailed:                  parseInt(r.layouts_failed ?? "0", 10),
    medianLayoutOosReturn:          parseFloat(r.median_layout_oos_return ?? "0"),
    worstLayoutOosReturn:           parseFloat(r.worst_layout_oos_return ?? "0"),
    medianLayoutDrawdown:           parseFloat(r.median_layout_drawdown ?? "0"),
    worstLayoutDrawdown:            parseFloat(r.worst_layout_drawdown ?? "0"),
    parameterStabilityAcrossLayouts: parseFloat(r.parameter_stability_across_layouts ?? r.parameter_stability ?? "0"),
    tradeDensityAcrossLayouts:      parseFloat(r.trade_density_across_layouts ?? "0"),
    consistencyScore:               parseFloat(r.consistency_score ?? "0"),
    robustnessScore:                parseFloat(r.robustness_score ?? "0"),
    reasons: r.reasons ?? "",
    params:  r.params  ?? "{}",
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
