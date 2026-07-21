import { NextRequest, NextResponse } from "next/server";
import { getProviderStatuses, routeChat, routeStream } from "@/lib/sentinel/sentinel-router";
import { getCapalifeContextConditional } from "@/lib/sentinel/capitalife-context";
import { getSentinelEnvConfig } from "@/lib/sentinel/providers/provider-status";
import { trackSentinelBrainAccess } from "@/lib/sentinel/sentinel-link-tracker";

export const runtime = "nodejs";

type PageContext = {
  page?: string;
  tab?: string;
  mode?: string;
  visibleTitle?: string;
};

const BRAIN_KEYWORDS = /\b(strategi|portfolio|backtest|signal|brain|sleeve|entry|entries|invest|track.?record|performance|drawdown|sharpe|symbol|asset|agrar|metal|forex|energy|indic|seasonal|produc|white.?swan|capitalife|aum|execution|universe|register)\b/i;

function buildSystemPrompt(pageCtx: PageContext | undefined, lastQuestion: string): string {
  const needsBrain = BRAIN_KEYWORDS.test(lastQuestion);
  const ctx = getCapalifeContextConditional(lastQuestion);
  if (needsBrain) {
    // Fire-and-forget — non-blocking, errors are swallowed inside
    void Promise.resolve().then(() => trackSentinelBrainAccess(lastQuestion));
  }
  const pageHint = pageCtx?.page
    ? `Seite: ${pageCtx.visibleTitle ?? pageCtx.page}${pageCtx.tab ? ` › ${pageCtx.tab}` : ""}. `
    : "";
  const formatRules = `Antwortstil:
- Kurz und präzise — maximal 3-5 Sätze pro Absatz, dann Absatz-Umbruch
- Benutze Markdown: **fett** für wichtige Begriffe, *kursiv* für Hinweise, ## Überschriften bei mehrteiligen Antworten
- Aufzählungen wenn es mehrere Punkte gibt (- oder 1.)
- 1-2 passende Emojis pro Antwort (nicht erzwingen)
- Keine langen Blöcke ohne Absatz
- Lieber kürzer und klar als lang und vollständig`;
  return `${pageHint}Capitalife Brain = einzige Source of Truth. Kein Finanzwissen ergänzen wenn Brain-Daten fehlen. Deutsch antworten.\n\n${formatRules}\n\n${ctx}`;
}

export async function POST(req: NextRequest) {
  let rawMessages: { role: string; content: string }[] = [];
  let requestedProvider: string | undefined;
  let streamRequested = false;
  let pageContext: PageContext | undefined;

  try {
    const body = await req.json() as {
      messages?: { role: string; content: string }[];
      question?: string;
      provider?: string;
      stream?: boolean;
      source?: string;
      pageContext?: PageContext;
    };
    rawMessages = body.messages ?? [];
    if (body.question) rawMessages = [{ role: "user", content: body.question }];
    requestedProvider = body.provider;
    streamRequested = body.stream === true;
    pageContext = body.pageContext;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Limit history to last 6 messages to cap token usage
  const trimmedMessages = rawMessages.slice(-6);
  const lastQuestion = trimmedMessages.findLast((m) => m.role === "user")?.content ?? "";
  const SYSTEM_PROMPT = buildSystemPrompt(pageContext, lastQuestion);

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...trimmedMessages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    })),
  ];

  // ── Streaming path (Ollama direct) ────────────────────────────────────────
  if (streamRequested) {
    try {
      const streamed = await routeStream({ messages, requestedProvider });

      const streamHeaders: Record<string, string> = {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "X-Sentinel-Provider": streamed.provider,
        "X-Sentinel-Mode": streamed.mode,
      };
      if (streamed.tokensUsed != null) {
        streamHeaders["X-Sentinel-Tokens-Used"] = String(streamed.tokensUsed);
      }
      return new Response(streamed.stream, { headers: streamHeaders });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Sentinel] streaming error:", msg);
      return NextResponse.json({ offline: true, detail: msg }, { status: 503 });
    }
  }

  // ── Non-streaming path (router with OpenAI fallback) ──────────────────────
  try {
    const result = await routeChat({ messages, requestedProvider });

    return NextResponse.json({
      reply: result.answer,
      model: result.model,
      providerUsed: result.provider,
      fallbackUsed: result.fallbackUsed ?? false,
      sources: [],
      diagnostics: result.diagnostics,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.toLowerCase().includes("timeout") || msg.includes("aborted");
    console.error("[Sentinel] chat error:", msg);

    return NextResponse.json(
      {
        offline: true,
        detail: isTimeout
          ? "Modell lädt noch — bitte in 30 Sekunden erneut versuchen."
          : msg,
      },
      { status: 503 }
    );
  }
}

// GET: list available providers/models
export async function GET() {
  const config = getSentinelEnvConfig();
  const statuses = await getProviderStatuses(null);
  return NextResponse.json({
    mode: config.mode,
    defaultProvider: config.defaultProvider,
    providers: statuses.providers,
    brain: statuses.brain,
    partnerMode: statuses.partnerMode,
  });
}
