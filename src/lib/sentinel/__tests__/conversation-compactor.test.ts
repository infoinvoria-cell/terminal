import { describe, it, expect } from "vitest";
import {
  estimateConversationTokens,
  buildConversationSummary,
  compactConversation,
} from "../context/conversation-compactor";
import type { ChatMessage } from "@/lib/sentinel/providers/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msg(role: ChatMessage["role"], content: string): ChatMessage {
  return { role, content };
}

function makeConversation(turns: number): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < turns; i++) {
    messages.push(msg(i % 2 === 0 ? "user" : "assistant", `Turn ${i + 1} content`));
  }
  return messages;
}

// ---------------------------------------------------------------------------
// estimateConversationTokens
// ---------------------------------------------------------------------------

describe("estimateConversationTokens", () => {
  it("returns 0 for an empty array", () => {
    expect(estimateConversationTokens([])).toBe(0);
  });

  it("estimates tokens for a single short message", () => {
    // "abcd" = 4 chars → 1 token
    const messages = [msg("user", "abcd")];
    expect(estimateConversationTokens(messages)).toBe(1);
  });

  it("rounds up (ceiling) when content length is not divisible by 4", () => {
    // "abc" = 3 chars → ceil(3/4) = 1
    const messages = [msg("user", "abc")];
    expect(estimateConversationTokens(messages)).toBe(1);
  });

  it("sums all messages before dividing by 4", () => {
    // 4 + 4 + 4 = 12 chars → 3 tokens
    const messages = [
      msg("user", "aaaa"),
      msg("assistant", "bbbb"),
      msg("user", "cccc"),
    ];
    expect(estimateConversationTokens(messages)).toBe(3);
  });

  it("handles messages with varying lengths", () => {
    const content1 = "a".repeat(40);
    const content2 = "b".repeat(60);
    const expected = Math.ceil((40 + 60) / 4);
    expect(estimateConversationTokens([msg("user", content1), msg("assistant", content2)])).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// buildConversationSummary
// ---------------------------------------------------------------------------

describe("buildConversationSummary", () => {
  it("returns a single assistant message", () => {
    const result = buildConversationSummary([msg("user", "hello"), msg("assistant", "world")]);
    expect(result.role).toBe("assistant");
  });

  it("content starts with [Zusammenfassung", () => {
    const result = buildConversationSummary([msg("user", "hello")]);
    expect(result.content).toMatch(/^\[Zusammenfassung/);
  });

  it("includes bullet points for user turns", () => {
    const result = buildConversationSummary([msg("user", "What is the market cap?")]);
    expect(result.content).toContain("- [user]");
    expect(result.content).toContain("What is the market cap?");
  });

  it("includes bullet points for assistant turns", () => {
    const result = buildConversationSummary([msg("assistant", "The market cap is 1 trillion.")]);
    expect(result.content).toContain("- [assistant]");
  });

  it("skips system messages", () => {
    const result = buildConversationSummary([
      msg("system", "You are a helpful assistant."),
      msg("user", "Hello"),
    ]);
    expect(result.content).not.toContain("- [system]");
    expect(result.content).toContain("- [user]");
  });

  it("truncates long content to 120 chars with ellipsis", () => {
    const longContent = "a".repeat(200);
    const result = buildConversationSummary([msg("user", longContent)]);
    expect(result.content).toContain("…");
    // The bullet should not contain more than 120 'a' chars
    const bulletMatch = result.content.match(/- \[user\] (.+)/);
    expect(bulletMatch).not.toBeNull();
    expect(bulletMatch![1].replace("…", "").length).toBeLessThanOrEqual(120);
  });

  it("keeps total content under 2000 chars", () => {
    const turns = Array.from({ length: 20 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", `Message number ${i}: ${"x".repeat(100)}`),
    );
    const result = buildConversationSummary(turns);
    expect(result.content.length).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// compactConversation
// ---------------------------------------------------------------------------

describe("compactConversation", () => {
  it("does not compact a short conversation below both thresholds", () => {
    const messages = makeConversation(4);
    const result = compactConversation(messages, { maxTurns: 20, maxTokensEstimate: 6000 });
    expect(result.wasCompacted).toBe(false);
    expect(result.messages).toEqual(messages);
  });

  it("returns the same message reference when no compaction needed", () => {
    const messages = makeConversation(3);
    const result = compactConversation(messages);
    expect(result.messages).toBe(messages);
  });

  it("does not compact a conversation exactly at the maxTurns threshold", () => {
    const messages = makeConversation(20);
    const result = compactConversation(messages, { maxTurns: 20 });
    expect(result.wasCompacted).toBe(false);
  });

  it("compacts when turn count exceeds maxTurns", () => {
    const messages = makeConversation(21);
    const result = compactConversation(messages, { maxTurns: 20, keepRecentTurns: 6 });
    expect(result.wasCompacted).toBe(true);
  });

  it("compacts when estimated tokens exceed maxTokensEstimate", () => {
    // 6001 * 4 chars = 24004 chars across messages
    const longContent = "a".repeat(1000);
    const messages = Array.from({ length: 25 }, () => msg("user", longContent));
    const result = compactConversation(messages, { maxTurns: 999, maxTokensEstimate: 100 });
    expect(result.wasCompacted).toBe(true);
  });

  it("always preserves system messages at the start", () => {
    const systemMsg = msg("system", "You are a helpful assistant.");
    const conversation: ChatMessage[] = [
      systemMsg,
      ...makeConversation(21),
    ];
    const result = compactConversation(conversation, { maxTurns: 20, keepRecentTurns: 6 });
    expect(result.wasCompacted).toBe(true);
    expect(result.messages[0]).toEqual(systemMsg);
    expect(result.messages[0].role).toBe("system");
  });

  it("preserves the last keepRecentTurns messages verbatim", () => {
    const messages = makeConversation(22);
    const keepRecentTurns = 6;
    const result = compactConversation(messages, { maxTurns: 20, keepRecentTurns });
    expect(result.wasCompacted).toBe(true);
    const recent = messages.slice(messages.length - keepRecentTurns);
    const resultRecent = result.messages.slice(result.messages.length - keepRecentTurns);
    expect(resultRecent).toEqual(recent);
  });

  it("sets summaryIncluded=true when compacted", () => {
    const messages = makeConversation(25);
    const result = compactConversation(messages, { maxTurns: 20 });
    expect(result.summaryIncluded).toBe(true);
  });

  it("sets summaryIncluded=false when not compacted", () => {
    const messages = makeConversation(5);
    const result = compactConversation(messages);
    expect(result.summaryIncluded).toBe(false);
  });

  it("estimatedTokensAfter < estimatedTokensBefore when compacted", () => {
    // Use long messages so the summary (capped at 12 bullets × 120 chars) is shorter than the full history
    const messages = Array.from({ length: 30 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", `Turn ${i + 1}: ${"x".repeat(200)}`),
    );
    const result = compactConversation(messages, { maxTurns: 20, keepRecentTurns: 6 });
    expect(result.wasCompacted).toBe(true);
    expect(result.estimatedTokensAfter).toBeLessThan(result.estimatedTokensBefore);
  });

  it("returns wasCompacted=false for an empty array", () => {
    const result = compactConversation([]);
    expect(result.wasCompacted).toBe(false);
    expect(result.messages).toEqual([]);
  });

  it("returns wasCompacted=false when messages are only system messages", () => {
    const messages = [
      msg("system", "System prompt one."),
      msg("system", "System prompt two."),
    ];
    const result = compactConversation(messages, { maxTurns: 1 });
    // nonSystem.length = 0, which is <= keepRecentTurns (6), so no compaction
    expect(result.wasCompacted).toBe(false);
  });

  it("compacted messages count equals system + 1 summary + keepRecentTurns", () => {
    const systemMessages = [msg("system", "You are helpful.")];
    const keepRecentTurns = 6;
    const conversation: ChatMessage[] = [...systemMessages, ...makeConversation(30)];
    const result = compactConversation(conversation, { maxTurns: 20, keepRecentTurns });
    expect(result.wasCompacted).toBe(true);
    // 1 system + 1 summary + 6 recent
    expect(result.messages.length).toBe(1 + 1 + keepRecentTurns);
  });

  it("30-turn conversation reduces to keepRecentTurns + 1 summary + system count", () => {
    const systemMessages = [msg("system", "System.")];
    const keepRecentTurns = 6;
    const conversation: ChatMessage[] = [...systemMessages, ...makeConversation(30)];
    const result = compactConversation(conversation, { maxTurns: 20, keepRecentTurns });
    expect(result.wasCompacted).toBe(true);
    expect(result.compactedTurns).toBe(systemMessages.length + 1 + keepRecentTurns);
    expect(result.originalTurns).toBe(30);
  });

  it("summary message is placed after system and before recent turns", () => {
    const systemMsg = msg("system", "System.");
    const conversation: ChatMessage[] = [systemMsg, ...makeConversation(22)];
    const keepRecentTurns = 6;
    const result = compactConversation(conversation, { maxTurns: 20, keepRecentTurns });
    // Index 0 = system, index 1 = summary
    expect(result.messages[0].role).toBe("system");
    expect(result.messages[1].role).toBe("assistant");
    expect(result.messages[1].content).toMatch(/^\[Zusammenfassung/);
  });

  it("originalTurns counts only non-system messages", () => {
    const conversation: ChatMessage[] = [
      msg("system", "System."),
      ...makeConversation(10),
    ];
    const result = compactConversation(conversation, { maxTurns: 20 });
    expect(result.originalTurns).toBe(10);
  });
});
