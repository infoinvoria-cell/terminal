import { type NextRequest, NextResponse } from "next/server";
import { getImmediateRefreshLockState, triggerImmediateRefresh } from "@/lib/server/monitoring/immediateRefresh";
import { getMonitoringLiveRefreshLoopState } from "@/lib/server/monitoring/liveRefreshLoop";

export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  const refresh = await triggerImmediateRefresh();
  return NextResponse.json({
    ok: refresh.ok,
    runMode: "live_signal",
    updateMode: "incremental",
    intervalMs: 300000,
    refresh,
    loop: getMonitoringLiveRefreshLoopState(),
    lock: getImmediateRefreshLockState(),
  });
}
