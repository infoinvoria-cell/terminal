export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getFailureRequestId, shouldInjectFailure } from "@/lib/server/capitalife-failure-injection";
import { logServerFailure } from "@/lib/runtime/capitalife-errors";

const ALLOWED_PATHS = [
  "09_AI/AI_PROJECT_BRAIN_CURRENT.md",
  "09_AI/dashboard_snapshot.json",
  "00_Index/Open Issues.md",
  "00_Index/Next Actions.md",
  "00_Index/Changelog.md",
  "09_AI/Live_Track_Record.md",
];

export async function GET(request: NextRequest) {
  try {
    if (shouldInjectFailure(request, "brain-api")) {
      throw new Error("BRAIN_API_FAILURE");
    }
    const { searchParams } = new URL(request.url);
    const relPath = searchParams.get("path");
    if (!relPath || !ALLOWED_PATHS.includes(relPath)) {
      return NextResponse.json({ error: "Path not allowed or missing" }, { status: 403 });
    }
    const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim();
    if (!brainPath) {
      return NextResponse.json({ error: "Brain path not configured", status: "UNAVAILABLE" }, { status: 503 });
    }
    const fullPath = path.join(brainPath, relPath);
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: "File not found", status: "UNAVAILABLE" }, { status: 404 });
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    return NextResponse.json({ content, path: relPath });
  } catch (error) {
    logServerFailure({
      route: "/api/brain/file",
      module: "brain-file",
      error,
      errorCode: "BRAIN_API_FAILURE",
      requestId: getFailureRequestId(request),
    });
    return NextResponse.json({ error: "BRAIN_API_FAILURE", status: "UNAVAILABLE" }, { status: 503 });
  }
}
