import { NextResponse } from "next/server";

import {
  getMonitoringLiveRefreshLoopState,
} from "@/lib/server/monitoring/liveRefreshLoop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const state = getMonitoringLiveRefreshLoopState();
  return NextResponse.json({
    ok: true,
    enabled: false,
    ensuredStarted: false,
    ensureReason: "background_loop_disabled",
    refreshIntervalMs: state.refreshIntervalMs,
    loopAlive: state.alive,
    pid: state.pid,
    startedAt: state.startedAt,
    commandLine: state.commandLine,
  });
}

export async function POST() {
  const state = getMonitoringLiveRefreshLoopState();
  return NextResponse.json({
    ok: true,
    enabled: false,
    ensuredStarted: false,
    ensureReason: "background_loop_disabled",
    refreshIntervalMs: state.refreshIntervalMs,
    loopAlive: false,
    pid: null,
    startedAt: null,
    commandLine: null,
  });
}
