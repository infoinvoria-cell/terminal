import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PHASE2_DIR = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "outputs",
  "phase2",
);

const PHASE2_SUMMARY = path.join(PHASE2_DIR, "phase2_all_candidates_summary.csv");

const REPORT_PATH = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "reports",
  "PHASE2_WFO_OOS_REPORT.md",
);

export async function GET() {
  // Phase 2 not yet run
  if (!fs.existsSync(PHASE2_DIR) || !fs.existsSync(PHASE2_SUMMARY)) {
    return NextResponse.json({
      hasPhase2Results: false,
      pending: true,
      message: "Phase 2 WF/OOS not yet complete — pending Codex run",
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
    });
  }

  try {
    const rows = parseCsv(fs.readFileSync(PHASE2_SUMMARY, "utf-8"));

    // Status counts
    const statusCounts: Record<string, number> = {};
    for (const row of rows) {
      const s = row.phase2_status ?? row.status ?? "UNKNOWN";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    // Per-asset grouping
    const byAsset: Record<string, Record<string, string>[]> = {};
    for (const row of rows) {
      const id = row.asset ?? row.asset_id ?? "UNKNOWN";
      if (!byAsset[id]) byAsset[id] = [];
      byAsset[id].push(row);
    }

    const assetSummaries = Object.entries(byAsset).map(([assetId, assetRows]) => {
      const passing = assetRows.filter(
        (r) => (r.phase2_status ?? r.status) === "PHASE2_PASS",
      );
      const weak = assetRows.filter(
        (r) => (r.phase2_status ?? r.status) === "PHASE2_WEAK",
      );
      const rejected = assetRows.filter(
        (r) => (r.phase2_status ?? r.status) === "PHASE2_REJECTED",
      );

      return {
        assetId,
        group: assetRows[0]?.group ?? "",
        candidatesTested: assetRows.length,
        phase2Pass: passing.length,
        phase2Weak: weak.length,
        phase2Rejected: rejected.length,
        bestCandidate:
          passing.length > 0
            ? mapPhase2Row(
                passing.sort(
                  (a, b) => parseFloat(b.oos_return ?? "0") - parseFloat(a.oos_return ?? "0"),
                )[0],
              )
            : null,
        allCandidates: assetRows.map(mapPhase2Row),
      };
    });

    const hasReport = fs.existsSync(REPORT_PATH);
    const totalPass = assetSummaries.reduce((s, a) => s + a.phase2Pass, 0);

    return NextResponse.json({
      hasPhase2Results: true,
      pending: false,
      reportAvailable: hasReport,
      totalCandidatesTested: rows.length,
      totalAssets: assetSummaries.length,
      totalPhase2Pass: totalPass,
      globalStatusCounts: statusCounts,
      assets: assetSummaries.sort((a, b) => b.phase2Pass - a.phase2Pass),
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
      researchNote:
        "Phase 2 WF/OOS results are exploratory. No strategy is approved for live trading.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to read phase2 outputs",
        detail: String(err),
        hasPhase2Results: false,
        pending: false,
      },
      { status: 500 },
    );
  }
}

function mapPhase2Row(r: Record<string, string>) {
  return {
    asset: r.asset ?? r.asset_id ?? "",
    family: r.family ?? "",
    phase2Status: r.phase2_status ?? r.status ?? "",
    // WF metrics
    wfReturn: parseFloat(r.wf_return ?? r.walk_forward_return ?? "0"),
    wfSharpe: parseFloat(r.wf_sharpe ?? "0"),
    wfMaxDrawdown: parseFloat(r.wf_max_drawdown ?? "0"),
    // OOS metrics
    oosReturn: parseFloat(r.oos_return ?? "0"),
    oosSharpe: parseFloat(r.oos_sharpe ?? "0"),
    oosMaxDrawdown: parseFloat(r.oos_max_drawdown ?? "0"),
    // Pilot reference
    pilotCagr: parseFloat(r.pilot_cagr ?? r.cagr ?? "0"),
    pilotPf: parseFloat(r.pilot_pf ?? r.profit_factor ?? "0"),
    params: r.params ?? "{}",
    warnings: r.warnings ?? "",
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
