/**
 * /api/sentinel/tts — proxy to local Kokoro TTS sidecar (localhost:5050)
 *
 * POST  /api/sentinel/tts        → synthesize text
 * GET   /api/sentinel/tts        → list voices
 * GET   /api/sentinel/tts/health → health check  (handled by health/route.ts)
 */
import { NextRequest, NextResponse } from "next/server";

const TTS_BASE = process.env.SENTINEL_TTS_URL || "http://localhost:5050";
const TIMEOUT_MS = 20_000;

// ── POST /api/sentinel/tts ─────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { text, voice = "bm_george", speed = 1.0 } = body as {
      text?: string;
      voice?: string;
      speed?: number;
    };

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const res = await fetch(`${TTS_BASE}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim(), voice, speed }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "TTS error");
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const audio = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "audio/wav";

    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

// ── GET /api/sentinel/tts → list voices ─────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${TTS_BASE}/voices`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error("TTS voices unavailable");
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      {
        voices: [
          { id: "bm_george", label: "George",  lang: "en-GB", available: false },
          { id: "bm_fable",  label: "Fable",   lang: "en-GB", available: false },
          { id: "bm_daniel", label: "Daniel",  lang: "en-GB", available: false },
          { id: "bm_lewis",  label: "Lewis",   lang: "en-GB", available: false },
        ],
        status: "offline",
      },
      { status: 200 }
    );
  }
}
