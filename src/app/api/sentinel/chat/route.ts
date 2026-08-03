import { NextRequest, NextResponse } from "next/server";
import { routeChat, routeStream } from "@/lib/sentinel/sentinel-router";
import type { ChatMessage } from "@/lib/sentinel/providers/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { messages: ChatMessage[]; stream?: boolean; provider?: string };
    const messages: ChatMessage[] = body.messages ?? [];
    const wantsStream = body.stream !== false;
    const requestedProvider = body.provider as string | undefined;

    if (wantsStream) {
      const { stream, provider, tokensUsed } = await routeStream({ messages, requestedProvider });
      const headers: Record<string, string> = {
        "Content-Type": "text/plain; charset=utf-8",
        "x-sentinel-provider": provider,
      };
      if (tokensUsed != null) headers["x-sentinel-tokens-used"] = String(tokensUsed);
      return new Response(stream, { headers });
    }

    const result = await routeChat({ messages, requestedProvider });
    return NextResponse.json(
      { answer: result.answer, provider: result.provider, model: result.model },
      {
        headers: {
          "x-sentinel-provider": result.provider,
          ...(result.tokensUsed != null ? { "x-sentinel-tokens-used": String(result.tokensUsed) } : {}),
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sentinel error";
    return NextResponse.json({ error: message, detail: message }, { status: 502 });
  }
}
