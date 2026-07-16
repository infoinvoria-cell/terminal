import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SHADOW_CSV = path.join(
  process.cwd(),
  "..",
  "workspace",
  "strategy_family_lab",
  "monitoring_drafts",
  "research_shadow_monitor_summary.csv",
);

export async function GET() {
  if (!fs.existsSync(SHADOW_CSV)) {
    return NextResponse.json({
      hasShadowData: false,
      pending: true,
      researchOnly: true,
      liveReady: false,
      portfolioReady: false,
      message: "research_shadow_monitor_summary.csv not yet present — pending Codex run",
      disclaimer: "RESEARCH ONLY — no READY status, no live allocation, no portfolio use",
    });
  }

  try {
    const rows = parseCsv(fs.readFileSync(SHADOW_CSV, "utf-8"));

    const statusCounts: Record<string, number> = {};
    for (const row of rows) {
      const s = row.shadow_status ?? "UNKNOWN";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    const entries = rows.map((r) => ({
      asset:  r.asset  ?? "",
      family: r.family ?? "",
      group:  r.group  ?? "",
      draftStatus:   r.draft_status   ?? "",
      shadowStatus:  r.shadow_status  ?? "",
      // Always false — research only
      liveReady:      false,
      portfolioReady: false,
      // Freshness / signal state
      lastBarTime:    r.last_bar_time ?? "",
      dataAge:        r.data_age      ?? "",
      dataFreshEnough:   parseBoolean(r.data_fresh_enough),
      latestSignal:      r.latest_signal        ?? "",
      latestPositionState: r.latest_position_state ?? "",
      signalChangedVsDraft:   parseBoolean(r.signal_changed_vs_draft),
      positionChangedVsDraft: parseBoolean(r.position_changed_vs_draft),
      duplicateBars:  parseBoolean(r.duplicate_bars),
      endGapDetected: parseBoolean(r.end_gap_detected),
      staleTail:      parseBoolean(r.stale_tail),
      warnings:       r.warnings ?? "",
      notes:          r.notes    ?? "",
    }));

    // Sort: SHADOW_OK first, then WARN, then FAIL; within group by asset
    const order = ["SHADOW_OK", "SHADOW_WARN", "SHADOW_FAIL"];
    entries.sort((a, b) =>
      order.indexOf(a.shadowStatus) - order.indexOf(b.shadowStatus) ||
      a.asset.localeCompare(b.asset),
    );

    return NextResponse.json({
      hasShadowData: true,
      pending: false,
      researchOnly: true,
      totalEntries: entries.length,
      globalStatusCounts: statusCounts,
      liveReady: false,
      portfolioReady: false,
      entries,
      disclaimer: "RESEARCH ONLY — shadow monitoring does not imply live readiness or portfolio use",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read shadow monitor", detail: String(err), hasShadowData: false, pending: false, researchOnly: true, liveReady: false, portfolioReady: false },
      { status: 500 },
    );
  }
}

function parseBoolean(v: string | undefined): boolean | null {
  if (!v || v === "") return null;
  const l = v.toLowerCase();
  if (l === "true" || l === "1") return true;
  if (l === "false" || l === "0") return false;
  return null;
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
