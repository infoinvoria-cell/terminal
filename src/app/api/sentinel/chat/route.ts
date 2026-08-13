import { NextRequest, NextResponse } from "next/server";
import { routeChat, routeStream } from "@/lib/sentinel/sentinel-router";
import type { ChatMessage } from "@/lib/sentinel/providers/types";
import { recordRequest } from "@/lib/sentinel/store/usage-store";
import { setLastContextUsage } from "@/lib/sentinel/store/context-store";
import { getAllModels } from "@/lib/sentinel/catalog/model-catalog";

export const runtime = "nodejs";

function resolveContextWindow(providerId: string): { contextWindow: number | null; modelId: string | null } {
  const models = getAllModels().filter(m => m.provider === providerId && m.pricing.verifiedFree);
  const primary = models[0] ?? null;
  return { contextWindow: primary?.limits.contextWindow ?? null, modelId: primary?.modelId ?? null };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { messages: ChatMessage[]; stream?: boolean; provider?: string; profile?: string };
    const messages: ChatMessage[] = body.messages ?? [];
    const wantsStream = body.stream !== false;
    const requestedProvider = body.provider as string | undefined;
    const profile = body.profile as string | undefined;

    if (wantsStream) {
      // Usage is recorded inside the provider via makeOpenAISSEStream (see streaming.ts).
      const { stream, provider, tokensUsed } = await routeStream({ messages, requestedProvider, profile: profile as import("@/lib/sentinel/sentinel-router").RoutingProfile | undefined, signal: req.signal });

      const headers: Record<string, string> = {
        "Content-Type": "text/plain; charset=utf-8",
        "x-sentinel-provider": provider,
      };
      if (tokensUsed != null) headers["x-sentinel-tokens-used"] = String(tokensUsed);
      return new Response(stream, { headers });
    }

    const result = await routeChat({ messages, requestedProvider, profile: profile as import("@/lib/sentinel/sentinel-router").RoutingProfile | undefined, signal: req.signal });

    // Record usage for non-streaming path (tokensUsed is total tokens)
    if (result.tokensUsed != null && result.tokensUsed > 0) {
      recordRequest({ provider: result.provider, inputTokens: result.tokensUsed, outputTokens: 0, success: true });
    }
    const { contextWindow, modelId } = resolveContextWindow(result.provider);
    setLastContextUsage({
      providerId: result.provider,
      modelId: result.model ?? modelId,
      inputTokensUsed: result.tokensUsed ?? null,
      contextWindowTokens: contextWindow,
      reservedOutputTokens: null,
      measuredAtUtc: new Date().toISOString(),
      status: result.tokensUsed != null ? "measured" : "unknown",
    });

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
