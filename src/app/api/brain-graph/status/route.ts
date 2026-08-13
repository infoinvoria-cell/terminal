export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getFailureRequestId, shouldInjectFailure } from "@/lib/server/capitalife-failure-injection";
import { logServerFailure } from "@/lib/runtime/capitalife-errors";

export async function GET(request: NextRequest) {
  try {
    if (shouldInjectFailure(request, "brain-api")) {
      throw new Error("BRAIN_API_FAILURE");
    }
    const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim() || null;
    if (!brainPath) {
      return NextResponse.json({ available: false, pathConfigured: false, brainFile: false, snapshotFile: false });
    }
    const brainFile = path.join(brainPath, "09_AI", "AI_PROJECT_BRAIN_CURRENT.md");
    const snapshotFile = path.join(brainPath, "09_AI", "dashboard_snapshot.json");
    const brainExists = fs.existsSync(brainFile);
    const snapshotExists = fs.existsSync(snapshotFile);
    return NextResponse.json({
      available: brainExists && snapshotExists,
      pathConfigured: true,
      brainFile: brainExists,
      snapshotFile: snapshotExists,
    });
  } catch (error) {
    logServerFailure({
      route: "/api/brain-graph/status",
      module: "brain-graph-status",
      error,
      errorCode: "BRAIN_API_FAILURE",
      requestId: getFailureRequestId(request),
    });
    return NextResponse.json(
      { available: false, pathConfigured: false, brainFile: false, snapshotFile: false, status: "UNAVAILABLE", error: "BRAIN_API_FAILURE" },
      { status: 503 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: "use GET" }, { status: 405 });
}
