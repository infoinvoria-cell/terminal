// POST /api/sentinel/connect — Sentinel Connect orchestration endpoint.
// Wraps the existing chat API with privacy classification, Brain-first retrieval,
// parallel ensemble, and ConnectRun provenance tracking.
import { NextRequest, NextResponse } from "next/server";
import { connectChat, connectStream } from "@/lib/sentinel/connect/connect-router";
import type { ChatMessage } from "@/lib/sentinel/providers/types";
import type { ConnectMode } from "@/lib/sentinel/connect/connect-router";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { messages, mode, stream: wantStream } = body as {
    messages?: ChatMessage[];
    mode?: ConnectMode;
    stream?: boolean;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const signal = req.signal;

  if (wantStream) {
    try {
      const result = await connectStream({ messages, mode, signal });
      return new Response(result.stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Connect-Run-Id": result.runId,
          "X-Connect-Privacy": result.privacy,
          "X-Connect-Route": result.route,
          "X-Connect-Brain": String(result.brainUsed),
          "X-Connect-Provider": result.provider,
        },
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
    }
  }

  try {
    const result = await connectChat({ messages, mode, signal });
    return NextResponse.json({
      answer: result.answer,
      provider: result.provider,
      model: result.model,
      runId: result.runId,
      privacy: result.privacy,
      route: result.route,
      brainUsed: result.brainUsed,
      graphifyUsed: result.graphifyUsed,
      workers: result.workers.map((w) => ({
        provider: w.provider,
        role: w.role,
        model: w.model,
        latencyMs: w.latencyMs,
        success: w.success,
        // Never expose token counts externally — internal only
      })),
      agreements: result.agreements,
      disagreements: result.disagreements,
      latencyMs: result.latencyMs,
      fallbackUsed: result.fallbackUsed,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
