/**
 * GET /api/sentinel/tts/health — proxies to local TTS sidecar health endpoint
 */
import { NextResponse } from "next/server";

const TTS_BASE = process.env.SENTINEL_TTS_URL || "http://localhost:5050";

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${TTS_BASE}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) throw new Error("unhealthy");
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ status: "ok", tts: data });
  } catch {
    return NextResponse.json({ status: "offline", tts: null }, { status: 503 });
  }
}
