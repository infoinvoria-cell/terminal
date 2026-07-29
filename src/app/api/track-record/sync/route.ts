import { NextResponse } from "next/server";
import { ensureCronSecret, getTrackRecordEnv } from "@/lib/track-record/env";
import { runTrackRecordSync } from "@/lib/track-record/service";
import type { SyncMode } from "@/lib/track-record/types";

export const dynamic = "force-dynamic";

const activeSyncs = new Set<string>();

export async function POST(request: Request) {
  if (!ensureCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const provider = normalizeProvider(url.searchParams.get("provider"));
  const persist = url.searchParams.get("persist") !== "0";
  const env = getTrackRecordEnv();
  const mode = normalizeMode(url.searchParams.get("mode")) ?? env.syncMode;
  const lockKey = `${provider}:${mode}`;

  if (activeSyncs.has(lockKey)) {
    return NextResponse.json(
      { error: "sync already running", provider, mode },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  activeSyncs.add(lockKey);
  try {
    const result = await runTrackRecordSync({ provider, mode, persist });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        provider,
        mode,
        failedAtUtc: new Date().toISOString(),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    activeSyncs.delete(lockKey);
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: "use POST",
      supportedProviders: ["myfxbook", "darwinex", "all"],
      supportedModes: ["mock", "live"],
    },
    { status: 405, headers: { "Cache-Control": "no-store" } },
  );
}

function normalizeProvider(value: string | null) {
  if (value === "myfxbook" || value === "darwinex" || value === "all") return value;
  return "all" as const;
}

function normalizeMode(value: string | null): SyncMode | null {
  if (value === "mock" || value === "live") return value;
  return null;
}
