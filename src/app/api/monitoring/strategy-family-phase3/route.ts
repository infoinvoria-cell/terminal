import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PHASE3_DIR = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "outputs",
  "phase3",
);

const PHASE3_SUMMARY = path.join(PHASE3_DIR, "phase3_all_candidates_summary.csv");

const REPORT_PATH = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "reports",
  "PHASE3_ROBUST_WFO_REPORT.md",
);

export async function GET() {
  if (!fs.existsSync(PHASE3_DIR) || !fs.existsSync(PHASE3_SUMMARY)) {
    return NextResponse.json({
      hasPhase3Results: false,
      pending: true,
      researchOnly: true,
      message: "Phase 3 Robust-WFO not yet complete — pending Codex run",
      phase3Candidates: [
        { asset: "NQ1",  family: "relative_strength" },
        { asset: "NQ1",  family: "volatility_regime" },
        { asset: "AAPL", family: "seasonality" },
        { asset: "AAPL", family: "breakout" },
        { asset: "SPX",  family: "seasonality" },
        { asset: "SPX",  family: "trend_momentum" },
      ],
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
    });
  }

  try {
    const rows = parseCsv(fs.readFileSync(PHASE3_SUMMARY, "utf-8"));

    const statusCounts: Record<string, number> = {};
    for (const row of rows) {
      const s = row.phase3_status ?? row.status ?? "UNKNOWN";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    // Group by asset
    const byAsset: Record<string, Record<string, string>[]> = {};
    for (const row of rows) {
      const id = row.asset ?? "UNKNOWN";
      if (!byAsset[id]) byAsset[id] = [];
      byAsset[id].push(row);
    }

    const assetSummaries = Object.entries(byAsset).map(([assetId, assetRows]) => {
      const status = (r: Record<string, string>) => r.phase3_status ?? r.status ?? "";
      const passing  = assetRows.filter((r) => status(r) === "PHASE3_PASS");
      const weak     = assetRows.filter((r) => status(r) === "PHASE3_WEAK");
      const rejected = assetRows.filter((r) => status(r) === "PHASE3_REJECTED");

      return {
        assetId,
        group: assetRows[0]?.group ?? "",
        candidatesTested: assetRows.length,
        phase3Pass: passing.length,
        phase3Weak: weak.length,
        phase3Rejected: rejected.length,
        bestCandidate: passing.length > 0
          ? mapPhase3Row(
              passing.sort((a, b) =>
                parseFloat(b.median_oos_return ?? b.oos_cagr ?? "0") -
                parseFloat(a.median_oos_return ?? a.oos_cagr ?? "0"),
              )[0],
            )
          : null,
        allCandidates: assetRows.map(mapPhase3Row),
      };
    });

    const hasReport = fs.existsSync(REPORT_PATH);
    const totalPass = assetSummaries.reduce((s, a) => s + a.phase3Pass, 0);

    return NextResponse.json({
      hasPhase3Results: true,
      pending: false,
      researchOnly: true,
      reportAvailable: hasReport,
      totalCandidatesTested: rows.length,
      totalAssets: assetSummaries.length,
      totalPhase3Pass: totalPass,
      globalStatusCounts: statusCounts,
      assets: assetSummaries.sort((a, b) => b.phase3Pass - a.phase3Pass),
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
      researchNote: "Phase 3 Robust-WFO results are exploratory. No strategy approved for live trading.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read phase3 outputs", detail: String(err), hasPhase3Results: false, pending: false, researchOnly: true },
      { status: 500 },
    );
  }
}

function mapPhase3Row(r: Record<string, string>) {
  return {
    asset: r.asset ?? "",
    family: r.family ?? "",
    phase3Status: r.phase3_status ?? r.status ?? "",
    // Robust-WF fold metrics
    foldsTotal:       parseInt(r.folds_total ?? "0", 10),
    foldsValid:       parseInt(r.folds_valid ?? "0", 10),
    foldsTooFewTrades: parseInt(r.folds_too_few_trades ?? "0", 10),
    medianOosReturn:  parseFloat(r.median_oos_return ?? r.oos_cagr ?? "0"),
    meanOosReturn:    parseFloat(r.mean_oos_return ?? "0"),
    worstFoldReturn:  parseFloat(r.worst_fold_return ?? "0"),
    parameterStability: parseFloat(r.parameter_stability ?? "0"),
    tradeCountTotal:  parseInt(r.trade_count_total ?? "0", 10),
    oosTradeCount:    parseInt(r.oos_trade_count ?? "0", 10),
    maxDrawdown:      parseFloat(r.max_drawdown ?? r.oos_dd ?? "0"),
    profitFactor:     parseFloat(r.profit_factor ?? r.oos_pf ?? "0"),
    stabilityScore:   parseFloat(r.stability_score ?? "0"),
    reasons:          r.reasons ?? "",
    params:           r.params ?? "{}",
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
