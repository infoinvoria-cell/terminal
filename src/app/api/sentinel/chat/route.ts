import { NextRequest, NextResponse } from "next/server";
import { getProviderStatuses, routeChat, routeStream } from "@/lib/sentinel/sentinel-router";
import { getCapalifeContext } from "@/lib/sentinel/capitalife-context";
import { getSentinelEnvConfig } from "@/lib/sentinel/providers/provider-status";

export const runtime = "nodejs";

type PageContext = {
  page?: string;
  tab?: string;
  mode?: string;
  visibleTitle?: string;
};

function buildSystemPrompt(pageCtx?: PageContext): string {
  const ctx = getCapalifeContext();

  const pageSection = pageCtx?.page
    ? `\n## Aktueller Seitenkontext
Der Nutzer befindet sich gerade auf: **${pageCtx.visibleTitle ?? pageCtx.page}**${pageCtx.tab ? ` → Tab: ${pageCtx.tab}` : ""}${pageCtx.mode ? ` · Modus: ${pageCtx.mode}` : ""}.

Prioritätslogik:
1. Aktuelle Seite / sichtbarer Kontext: "${pageCtx.visibleTitle ?? pageCtx.page}"
2. Capitalife Terminal Daten / UI
3. Capitalife Brain Source of Truth
4. Allgemeinwissen nur, wenn interne Quellen nicht reichen

Wenn die Frage sich auf die aktuelle Seite bezieht (z.B. "was sehe ich hier?", "was ist das?", "erkläre das"):
- Beziehe dich auf ${pageCtx.page === "analytics" ? "Analytics / Charts / Backtest / Live-Track-Record" : pageCtx.page === "home" ? "Home / Performance Overview / KPIs / AuM / Track Record" : pageCtx.visibleTitle ?? pageCtx.page}.
- Nicht allgemein antworten.\n`
    : "";

  return `Du bist Sentinel, ein lokaler/interner read-only Assistent für das Capitalife Brain und das Capitalife Terminal.
${pageSection}
## Sprache
Deutsch. Immer Deutsch antworten, außer der User schreibt explizit auf Englisch.

## Verhalten — sehr wichtig
- Wenn die Frage Strategien, Portfolios, Assets, Werte, Symbole, Track Record, Performance, Backtest, Dashboard, White Swan, Invest, Sleeves, Entries, Kapital, AuM, Execution, Risikomanagement, Seasonal Patterns oder den allgemeinen Capitalife-Status betrifft: Antworte AUSSCHLIESSLICH auf Basis des unten stehenden Capitalife-Kontexts.
- Antworte NIEMALS generisch über allgemeine Kapitalanlagen (ETFs, Kryptowährungen, Standardaktien, allgemeine Anlagestrategien), wenn die Frage sich auf Capitalife / Brain / Dashboard beziehen kann.
- Falls der Kontext für eine Frage keine belastbare Antwort enthält: Sage klar "Dazu finde ich im Capitalife Brain aktuell keine belegte Information." Nicht aus allgemeinem Finanzwissen ergänzen.
- Capitalife Brain ist die einzige Source of Truth. Das Capitalife Terminal ist nur UI.
- Capitalife GbR erbringt KEINE eigene Finanzportfolioverwaltung. Keine Live-Execution. Keine Orders.
- Keine Wörter wie sicher, garantiert, risikolos.
- Keine Höflichkeitsfloskeln am Ende jeder Antwort.

## Antwortformat
Nutze Markdown wenn es die Lesbarkeit verbessert:
- ## Überschriften, ### Unterüberschriften
- **fett** für Schlüsselbegriffe und Kennzahlen
- - Listen für Aufzählungen
- \`inline-code\` für Symbole, Dateinamen, technische Werte
- --- Trennlinien bei längeren Antworten mit mehreren Blöcken
- Bei kurzen, direkten Fragen kein Markdown nötig.

---

${ctx}`;
}

// Base prompt cache (no pageCtx, refreshes every 5 min)
let _systemPrompt: string | null = null;
let _systemPromptAt = 0;
const PROMPT_TTL = 5 * 60 * 1000;

function getSystemPrompt(pageCtx?: PageContext): string {
  // If page context provided, build a per-request prompt (no caching — fast)
  if (pageCtx?.page) return buildSystemPrompt(pageCtx);
  const now = Date.now();
  if (_systemPrompt !== null && now - _systemPromptAt < PROMPT_TTL) return _systemPrompt;
  _systemPrompt = buildSystemPrompt();
  _systemPromptAt = now;
  return _systemPrompt;
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

  const SYSTEM_PROMPT = getSystemPrompt(pageContext);

  // Prepend system prompt
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...rawMessages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    })),
  ];

  // ── Streaming path (Ollama direct) ────────────────────────────────────────
  if (streamRequested) {
    try {
      const streamed = await routeStream({ messages, requestedProvider });

      return new Response(streamed.stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
          "X-Sentinel-Provider": streamed.provider,
          "X-Sentinel-Mode": streamed.mode,
        },
      });
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
