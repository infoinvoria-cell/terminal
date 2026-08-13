import type { ChatMessage } from "@/lib/sentinel/providers/types";

export type CompactionResult = {
  messages: ChatMessage[];
  wasCompacted: boolean;
  originalTurns: number;
  compactedTurns: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  summaryIncluded: boolean;
};

export function estimateConversationTokens(messages: ChatMessage[]): number {
  return Math.ceil(messages.reduce((acc, m) => acc + m.content.length, 0) / 4);
}

export function buildConversationSummary(oldTurns: ChatMessage[]): ChatMessage {
  const topics: string[] = [];
  for (const msg of oldTurns) {
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    const trimmed = msg.content.slice(0, 120).replace(/\s+/g, " ").trim();
    if (trimmed) topics.push(`- [${msg.role}] ${trimmed}${msg.content.length > 120 ? "…" : ""}`);
  }
  const summary = topics.slice(0, 12).join("\n");
  return {
    role: "assistant",
    content: `[Zusammenfassung früherer Konversation]\n${summary}`,
  };
}

export function compactConversation(
  messages: ChatMessage[],
  opts?: {
    maxTurns?: number;
    keepRecentTurns?: number;
    maxTokensEstimate?: number;
  },
): CompactionResult {
  const maxTurns = opts?.maxTurns ?? 20;
  const keepRecentTurns = opts?.keepRecentTurns ?? 6;
  const maxTokens = opts?.maxTokensEstimate ?? 6000;

  const estimatedBefore = estimateConversationTokens(messages);
  const nonSystem = messages.filter(m => m.role !== "system");
  const system = messages.filter(m => m.role === "system");

  const originalTurns = nonSystem.length;
  const needsCompact = originalTurns > maxTurns || estimatedBefore > maxTokens;

  if (!needsCompact || originalTurns <= keepRecentTurns) {
    return {
      messages,
      wasCompacted: false,
      originalTurns,
      compactedTurns: originalTurns,
      estimatedTokensBefore: estimatedBefore,
      estimatedTokensAfter: estimatedBefore,
      summaryIncluded: false,
    };
  }

  const cutoff = nonSystem.length - keepRecentTurns;
  const oldTurns = nonSystem.slice(0, cutoff);
  const recentTurns = nonSystem.slice(cutoff);

  const summary = buildConversationSummary(oldTurns);
  const compacted: ChatMessage[] = [...system, summary, ...recentTurns];

  return {
    messages: compacted,
    wasCompacted: true,
    originalTurns,
    compactedTurns: compacted.length,
    estimatedTokensBefore: estimatedBefore,
    estimatedTokensAfter: estimateConversationTokens(compacted),
    summaryIncluded: true,
  };
}
