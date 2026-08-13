// Server-only: Node.js/Edge — captures usage from OpenAI-compatible SSE streams.
// Replaces the local parseSSE+genToStream pattern in each provider so usage is
// recorded at the point where the SSE JSON (incl. x_groq.usage / usage) is still
// available — before it's stripped to plain text.
import { recordRequest, recordHttpError } from "@/lib/sentinel/store/usage-store";
import { setLastContextUsage } from "@/lib/sentinel/store/context-store";
import { getAllModels } from "@/lib/sentinel/catalog/model-catalog";

export type OpenAIStreamOpts = {
  providerId: string;
  modelId: string;
};

type RawUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
type SSEChunk = {
  model?: string;
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
  usage?: RawUsage;
  x_groq?: { usage?: RawUsage };
};

function resolveContextWindow(providerId: string, modelId: string): number | null {
  try {
    const models = getAllModels();
    const match = models.find(m => m.provider === providerId && m.modelId === modelId)
      ?? models.find(m => m.provider === providerId);
    return match?.limits?.contextWindow ?? null;
  } catch { return null; }
}

export function makeOpenAISSEStream(
  response: Response,
  opts: OpenAIStreamOpts,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let usageRecorded = false;
  const contextWindow = resolveContextWindow(opts.providerId, opts.modelId);

  return new ReadableStream({
    async start(controller) {
      try {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") { controller.close(); return; }
            try {
              const json = JSON.parse(raw) as SSEChunk;
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));

              // Groq reports usage in x_groq.usage; other OpenAI-compat providers in usage.
              const rawUsage = json.x_groq?.usage ?? json.usage;
              if (!usageRecorded && rawUsage?.prompt_tokens != null) {
                usageRecorded = true;
                const inputTokens = rawUsage.prompt_tokens;
                const outputTokens = rawUsage.completion_tokens ?? 0;
                const resolvedModelId = json.model ?? opts.modelId;
                try {
                  recordRequest({ provider: opts.providerId, inputTokens, outputTokens, success: true });
                  setLastContextUsage({
                    providerId: opts.providerId,
                    modelId: resolvedModelId,
                    inputTokensUsed: inputTokens,
                    contextWindowTokens: contextWindow,
                    reservedOutputTokens: null,
                    measuredAtUtc: new Date().toISOString(),
                    status: "measured",
                  });
                } catch { /* best-effort */ }
              }
            } catch { /* skip malformed SSE line */ }
          }
        }

        // Stream ended without a usage chunk — record provider/model for context display.
        if (!usageRecorded) {
          try {
            setLastContextUsage({
              providerId: opts.providerId,
              modelId: opts.modelId,
              inputTokensUsed: null,
              contextWindowTokens: contextWindow,
              reservedOutputTokens: null,
              measuredAtUtc: new Date().toISOString(),
              status: "unknown",
            });
          } catch { /* best-effort */ }
        }

        controller.close();
      } catch (error) {
        // Record failure for circuit breaker
        try {
          recordRequest({ provider: opts.providerId, inputTokens: 0, outputTokens: 0, success: false });
        } catch { /* best-effort */ }
        controller.error(error);
      }
    },
  });
}

// Throws a provider-specific error and records HTTP status for the circuit breaker.
export function throwProviderHttpError(provider: string, status: number, body: string): never {
  try { recordHttpError(provider, status); } catch { /* best-effort */ }
  const label = provider.charAt(0).toUpperCase() + provider.slice(1);
  if (status === 402) throw new Error(`[BILLING] ${label} requires payment — blocked by free-only policy.`);
  if (status === 401 || status === 403) throw new Error(`${label} ${status}: unauthorized — check API key.`);
  if (status === 429) throw new Error(`${label} rate limited (429) — retrying with next provider.`);
  throw new Error(`${label} ${status}: ${body.slice(0, 200)}`);
}
