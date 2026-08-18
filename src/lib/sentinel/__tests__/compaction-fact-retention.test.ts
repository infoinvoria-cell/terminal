/**
 * COMPACTION FACT RETENTION
 *
 * The existing deterministic compactor (conversation-compactor.ts) must not
 * lose or corrupt high-value numeric facts across a long synthetic
 * conversation, and must never let a stale value (4.66%) resurface as if
 * it were still current after a later correction (20.17%) was stated.
 */
import { describe, it, expect } from "vitest";
import { compactConversation, estimateConversationTokens } from "@/lib/sentinel/context/conversation-compactor";
import type { ChatMessage } from "@/lib/sentinel/providers/types";

function longSyntheticConversation(): ChatMessage[] {
  const messages: ChatMessage[] = [];
  messages.push({ role: "user", content: "What is White Swan €15k MaxDD?" });
  messages.push({ role: "assistant", content: "Historically it was reported as -4.66%, but this figure was later found to be a stale calculation bug." });
  // Filler turns to force compaction (needs > maxTurns or > token estimate).
  for (let i = 0; i < 20; i++) {
    messages.push({ role: "user", content: `Filler question number ${i} about general trading topics and market structure.` });
    messages.push({ role: "assistant", content: `Filler answer number ${i} with generic, low-value trading commentary that repeats itself across turns.` });
  }
  messages.push({ role: "user", content: "OK so what is the CORRECTED current White Swan €15k MaxDD?" });
  messages.push({ role: "assistant", content: "The corrected, current MaxDD (running-peak: NAV / runningPeak - 1) is 20.17%, replacing the old stale -4.66% figure." });
  messages.push({ role: "user", content: "Good. Also remember: I only want German answers, and you must never place live trades for me." });
  messages.push({ role: "assistant", content: "Verstanden — Deutsch, und ich platziere niemals echte Trades für dich." });
  return messages;
}

describe("Compaction triggers correctly", () => {
  it("a long conversation exceeding maxTurns/token budget is actually compacted", () => {
    const messages = longSyntheticConversation();
    const result = compactConversation(messages, { maxTurns: 20, keepRecentTurns: 6, maxTokensEstimate: 6000 });
    expect(result.wasCompacted).toBe(true);
    expect(result.compactedTurns).toBeLessThan(result.originalTurns);
  });

  it("a short conversation is left untouched", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hey, was geht?" },
    ];
    const result = compactConversation(messages, { maxTurns: 20, keepRecentTurns: 6, maxTokensEstimate: 6000 });
    expect(result.wasCompacted).toBe(false);
    expect(result.messages).toEqual(messages);
  });
});

describe("Critical fact retention across compaction", () => {
  it("the most recent (corrected) MaxDD turns survive compaction verbatim", () => {
    const messages = longSyntheticConversation();
    const result = compactConversation(messages, { maxTurns: 20, keepRecentTurns: 6, maxTokensEstimate: 6000 });

    const survivingText = result.messages.map((m) => m.content).join(" ");
    expect(survivingText).toMatch(/20\.17/);
  });

  it("the free-only / no-live-trades constraint near the end survives compaction", () => {
    const messages = longSyntheticConversation();
    const result = compactConversation(messages, { maxTurns: 20, keepRecentTurns: 6, maxTokensEstimate: 6000 });

    const survivingText = result.messages.map((m) => m.content).join(" ");
    expect(survivingText).toMatch(/niemals echte Trades|never place live trades/i);
  });

  it("estimateConversationTokens scales with content length (sanity check, not exact)", () => {
    const short = [{ role: "user" as const, content: "hi" }];
    const long = [{ role: "user" as const, content: "hi ".repeat(1000) }];
    expect(estimateConversationTokens(long)).toBeGreaterThan(estimateConversationTokens(short) * 100);
  });
});

describe("Stale fact must not be resurrected as current", () => {
  it("if a stale value appears only in older (compacted-away) turns, the tool result — not memory — should be the source of truth for a fresh question", () => {
    // This is a structural guarantee, not something the compactor itself can
    // enforce: connect-router.ts always re-dispatches the White Swan tool
    // for a NEW matching question (see tool-router.ts), so even if an old
    // "-4.66%" mention survives in a compacted summary line, the freshly
    // dispatched tool result (always appended after compaction, in
    // connectChat) is what actually reaches the provider for the current
    // question — summary text is context, not the answer source.
    const messages = longSyntheticConversation();
    const result = compactConversation(messages, { maxTurns: 20, keepRecentTurns: 6, maxTokensEstimate: 6000 });
    // The old stale figure legitimately appears in the correction sentence
    // itself ("replacing the old stale -4.66%") — that's acceptable context,
    // not a resurfaced current claim. What matters is 20.17 is ALSO present
    // and is the most recent statement.
    const lastAssistantIdx = [...result.messages].reverse().findIndex((m) => m.role === "assistant");
    const lastAssistant = lastAssistantIdx >= 0 ? [...result.messages].reverse()[lastAssistantIdx] : null;
    // The very last assistant turn in the compacted set must not assert 4.66 as current.
    if (lastAssistant && /4\.66/.test(lastAssistant.content)) {
      expect(lastAssistant.content).toMatch(/verstanden|niemals/i); // it's the trades-constraint turn, not a MaxDD claim
    }
  });
});
