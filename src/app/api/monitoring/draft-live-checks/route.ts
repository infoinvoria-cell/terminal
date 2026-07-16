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

const LIVE_CHECK_SUMMARY = path.join(DRAFTS_DIR, "live_freshness_check_summary.csv");

const REPORT_PATH = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "reports",
  "PHASE8_LIVE_FRESHNESS_CHECK_REPORT.md",
);

export async function GET() {
  if (!fs.existsSync(LIVE_CHECK_SUMMARY)) {
    return NextResponse.json({
      hasLiveChecks: false,
      pending: true,
      researchOnly: true,
      liveReady: false,      // always false — research only
      portfolioReady: false,
      message: "Phase 8 Live/Freshness/Signal checks not yet complete — pending Codex run",
      phase7Summary: {
        draftsValidated: ["NQ1/volatility_regime", "AAPL/breakout", "SPX/seasonality"],
        validationStatus: "DRAFT_VALID",
        note: "Phase 7: all 3 drafts DRAFT_VALID — live checks in progress",
      },
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
    });
  }

  try {
    const rows = parseCsv(fs.readFileSync(LIVE_CHECK_SUMMARY, "utf-8"));

    const statusCounts: Record<string, number> = {};
    for (const row of rows) {
      const s = row.live_check_status ?? row.status ?? "UNKNOWN";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    const hasReport = fs.existsSync(REPORT_PATH);

    const checks = rows.map((r) => ({
      asset:  r.asset  ?? "",
      family: r.family ?? "",
      liveCheckStatus: r.live_check_status ?? r.status ?? "",
      // Always false — research only regardless of check outcome
      liveReady:      false,
      portfolioReady: false,
      // Freshness
      lastBarTime:     r.last_bar_time ?? "",
      dataAge:         r.data_age ?? "",
      dataFreshEnough: parseBoolean(r.data_fresh_enough),
      duplicateBars:   parseBoolean(r.duplicate_bars),
      endGapDetected:  parseBoolean(r.end_gap_detected),
      // Signal checks
      latestSignal:         r.latest_signal  ?? "",
      draftSignal:          r.draft_signal   ?? "",
      signalMatch:          parseBoolean(r.signal_match),
      latestPositionState:  r.latest_position_state  ?? "",
      draftPositionState:   r.draft_position_state   ?? "",
      positionMatch:        parseBoolean(r.position_match),
      // Notes
      notes: r.notes ?? "",
    }));

    return NextResponse.json({
      hasLiveChecks: true,
      pending: false,
      researchOnly: true,
      reportAvailable: hasReport,
      totalChecked: rows.length,
      globalStatusCounts: statusCounts,
      liveReady: false,
      portfolioReady: false,
      checks,
      disclaimer: "RESEARCH ONLY — LIVE_CHECK_OK does not mean live-ready or portfolio-ready",
      researchNote: "Live checks verify data freshness and signal reproduction only. No strategy is approved for live trading.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read live check outputs", detail: String(err), hasLiveChecks: false, pending: false, researchOnly: true },
      { status: 500 },
    );
  }
}

function parseBoolean(v: string | undefined): boolean | null {
  if (v === undefined || v === "") return null;
  return v.toLowerCase() === "true" || v === "1";
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
