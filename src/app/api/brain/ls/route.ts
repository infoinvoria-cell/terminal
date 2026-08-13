export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getFailureRequestId, shouldInjectFailure } from "@/lib/server/capitalife-failure-injection";
import { logServerFailure } from "@/lib/runtime/capitalife-errors";

const ALLOWED_PATHS = [
  { relPath: "09_AI/AI_PROJECT_BRAIN_CURRENT.md", label: "AI Project Brain (aktuell)" },
  { relPath: "09_AI/dashboard_snapshot.json", label: "Dashboard Snapshot (aktuell)" },
  { relPath: "00_Index/Open Issues.md", label: "Offene Issues" },
  { relPath: "00_Index/Next Actions.md", label: "Nächste Aktionen" },
  { relPath: "00_Index/Changelog.md", label: "Changelog" },
  { relPath: "09_AI/Live_Track_Record.md", label: "Live Track Record" },
];

export async function GET(request: NextRequest) {
  try {
    if (shouldInjectFailure(request, "brain-api")) {
      throw new Error("BRAIN_API_FAILURE");
    }
    const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim() || null;
    const files = ALLOWED_PATHS.map(({ relPath, label }) => ({
      path: relPath,
      label,
      exists: brainPath ? fs.existsSync(path.join(brainPath, relPath)) : false,
    }));
    return NextResponse.json({ files, brainConfigured: Boolean(brainPath) });
  } catch (error) {
    logServerFailure({
      route: "/api/brain/ls",
      module: "brain-ls",
      error,
      errorCode: "BRAIN_API_FAILURE",
      requestId: getFailureRequestId(request),
    });
    return NextResponse.json(
      { files: [], brainConfigured: false, status: "UNAVAILABLE", error: "BRAIN_API_FAILURE" },
      { status: 503 },
    );
  }
}
