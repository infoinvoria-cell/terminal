// Native tool calling loop — uses Groq (OpenAI-compatible) as primary tool executor
// Falls back to regular routing if no tool-capable provider is available.
import { SENTINEL_TOOLS, executeTool } from "./sentinel-tools";
import type { ChatMessage } from "./providers/types";

const MAX_TOOL_ROUNDS = 5;
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TOOL_MODEL = "llama-3.3-70b-versatile";

type OpenAIMessage = {
  role: string;
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
};

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAIResponse = {
  choices?: {
    finish_reason: string;
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
  }[];
  usage?: { total_tokens?: number };
};

const TOOL_DEFINITIONS = SENTINEL_TOOLS.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  },
}));

export type ToolRunResult = {
  answer: string;
  toolCallsMade: { toolName: string; durationMs: number }[];
  totalTokens: number;
  rounds: number;
  provider: "groq" | "fallback";
};

export async function runWithTools(
  messages: ChatMessage[],
  options?: { signal?: AbortSignal },
): Promise<ToolRunResult | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;

  const history: OpenAIMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const toolCallsMade: { toolName: string; durationMs: number }[] = [];
  let totalTokens = 0;
  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds += 1;
    let response: Response;
    try {
      response = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: TOOL_MODEL,
          messages: history,
          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",
          max_tokens: 4096,
        }),
        signal: options?.signal,
      });
    } catch {
      return null;
    }

    if (!response.ok) return null;

    const data = (await response.json()) as OpenAIResponse;
    totalTokens += data.usage?.total_tokens ?? 0;
    const choice = data.choices?.[0];
    if (!choice) return null;

    const assistantMsg = choice.message;
    history.push({ role: assistantMsg.role, content: assistantMsg.content, tool_calls: assistantMsg.tool_calls });

    if (choice.finish_reason !== "tool_calls" || !assistantMsg.tool_calls?.length) {
      return {
        answer: assistantMsg.content?.trim() ?? "",
        toolCallsMade,
        totalTokens,
        rounds,
        provider: "groq",
      };
    }

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      assistantMsg.tool_calls.map(async (tc) => {
        let parsedInput: unknown = {};
        try { parsedInput = JSON.parse(tc.function.arguments); } catch { /* use empty */ }
        const result = await executeTool(tc.function.name, parsedInput);
        toolCallsMade.push({ toolName: tc.function.name, durationMs: result.durationMs });
        const content = result.error
          ? JSON.stringify({ error: result.error })
          : JSON.stringify(result.result);
        return { role: "tool" as const, content, tool_call_id: tc.id };
      }),
    );

    history.push(...toolResults);
  }

  // Exceeded rounds — return whatever we have
  const lastContent = history.findLast((m) => m.role === "assistant")?.content ?? "";
  return { answer: lastContent.trim(), toolCallsMade, totalTokens, rounds, provider: "groq" };
}
