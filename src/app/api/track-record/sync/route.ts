import { NextResponse } from "next/server";
import { ensureCronSecret } from "@/lib/track-record/env";
import { runTrackRecordSync } from "@/lib/track-record/service";
import type { SyncMode } from "@/lib/track-record/types";

export const dynamic = "force-dynamic";

const activeSyncs = new Set<string>();
const PROVIDERS = new Set(["historical", "myfxbook", "darwinex", "all"]);

export async function POST(request: Request) {
  if (!ensureCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const provider = params.get("provider") ?? "all";
  const mode = params.get("mode") ?? "live";
  const persist = params.get("persist") !== "0";

  if (!PROVIDERS.has(provider) || !isSyncMode(mode)) {
    return NextResponse.json({ error: "Invalid provider or mode" }, { status: 400 });
  }
  if (provider === "historical" && mode === "mock") {
    return NextResponse.json({ error: "Historical imports do not support mock mode" }, { status: 400 });
  }

  const lockKey = `${provider}:${mode}`;
  if (activeSyncs.has(lockKey)) {
    return NextResponse.json({ error: "Sync already running" }, { status: 409 });
  }

  activeSyncs.add(lockKey);
  try {
    const result = await runTrackRecordSync({
      provider: provider as "historical" | "myfxbook" | "darwinex" | "all",
      mode,
      persist,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Track-record sync failed" },
      { status: 500 },
    );
  } finally {
    activeSyncs.delete(lockKey);
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Use authenticated POST. Supported providers: historical, myfxbook, darwinex, all." },
    { status: 405 },
  );
}

function isSyncMode(value: string): value is SyncMode {
  return value === "mock" || value === "live";
}
