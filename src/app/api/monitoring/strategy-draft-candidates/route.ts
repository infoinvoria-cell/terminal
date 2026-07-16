import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DRAFTS_DIR = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "monitoring_drafts",
);

const DRAFT_SUMMARY = path.join(DRAFTS_DIR, "monitoring_draft_candidates_summary.csv");

export async function GET() {
  if (!fs.existsSync(DRAFT_SUMMARY)) {
    return NextResponse.json({
      hasDraftCandidates: false,
      pending: true,
      researchOnly: true,
      liveReady: false,
      portfolioReady: false,
      message: "No monitoring_draft_candidates_summary.csv found — pending Codex run",
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
    });
  }

  try {
    const rows = parseCsv(fs.readFileSync(DRAFT_SUMMARY, "utf-8"));

    const statusCounts: Record<string, number> = {};
    for (const row of rows) {
      const s = row.draft_status ?? row.status ?? "UNKNOWN";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    const totalDraftCandidates = statusCounts["DRAFT_CANDIDATE"] ?? 0;

    const candidates = rows.map((r) => {
      const assetId = r.asset ?? "";
      const family  = r.family ?? "";

      // Per-candidate artifact dir: monitoring_drafts/<ASSET>/<FAMILY>/
      const artifactDir = path.join(DRAFTS_DIR, assetId, family);
      const draftFiles = resolveArtifacts(artifactDir);

      return {
        asset:  assetId,
        family,
        group:       r.group ?? "",
        draftStatus: r.draft_status ?? r.status ?? "",
        sourceLabel: r.source_label ?? "",
        sourceStatus: r.source_status ?? "",
        isDuplicate: r.duplicate_candidate === "True",
        // Always false — research only
        liveReady:      false,
        portfolioReady: false,
        // Metrics from CSV
        tradeCount:    parseInt(r.trade_count   ?? "0", 10),
        profitFactor:  parseFloat(r.profit_factor ?? "0"),
        maxDrawdown:   parseFloat(r.max_drawdown  ?? "0"),
        wfMetric:      parseFloat(r.wf_metric     ?? "0"),
        oosReturn:     parseFloat(r.oos_return     ?? r.final_oos_return ?? "0"),
        lastBarTime:   r.last_bar_time ?? "",
        notes:         r.notes ?? "",
        // Artifact paths (null if missing — never crash)
        draftFiles,
      };
    });

    return NextResponse.json({
      hasDraftCandidates: true,
      pending: false,
      researchOnly: true,
      totalCandidates: rows.length,
      totalDraftCandidates,
      globalStatusCounts: statusCounts,
      liveReady: false,
      portfolioReady: false,
      candidates: candidates.sort((a, b) => {
        const order = ["DRAFT_CANDIDATE", "DRAFT_WEAK", "DRAFT_REJECTED", "DATA_ISSUE"];
        return order.indexOf(a.draftStatus) - order.indexOf(b.draftStatus);
      }),
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
      researchNote: "Draft candidates are under monitoring observation only. No strategy approved for live trading or portfolio allocation.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read draft outputs", detail: String(err), hasDraftCandidates: false, pending: false, researchOnly: true, liveReady: false, portfolioReady: false },
      { status: 500 },
    );
  }
}

function resolveArtifacts(dir: string) {
  const files: Record<string, string | null> = {
    dashboardExport: null,
    equityCurve:     null,
    drawdown:        null,
    trades:          null,
  };
  if (!fs.existsSync(dir)) return files;
  const check = (name: string) => {
    const full = path.join(dir, name);
    return fs.existsSync(full) ? path.relative(path.join(process.cwd(), ".."), full).replace(/\\/g, "/") : null;
  };
  files.dashboardExport = check("draft_dashboard_export.json");
  files.equityCurve     = check("equity_curve.csv");
  files.drawdown        = check("drawdown.csv");
  files.trades          = check("trades.csv");
  return files;
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
