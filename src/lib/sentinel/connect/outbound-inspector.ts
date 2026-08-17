// Outbound inspector: produces a debug representation of exactly what would leave
// this machine before any provider call. Never includes raw keys or credential values.
// Internal use only — never exposed via any API response or logged externally.

import type { ChatMessage } from "../providers/types";
import type { PrivacyClassification } from "./privacy-classifier";

export type OutboundContext = {
  timestamp: string;
  privacyLevel: string;
  privacyReason: string;
  privacyTriggers: string[];
  sanitizedRequest: string;
  messagesWouldSend: number;
  brainContextInjected: boolean;
  brainContextCharCount: number;
  graphifyContextInjected: boolean;
  targetProvider?: string;
  wouldRedact: boolean;
  wouldBlock: boolean;
  redactedFields: string[];
};

export function buildOutboundContext(
  messages: ChatMessage[],
  privacy: PrivacyClassification,
  opts: {
    brainInjected: boolean;
    brainChars?: number;
    graphifyInjected: boolean;
    targetProvider?: string;
  },
): OutboundContext {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const sanitized = privacy.sanitizedText ?? (lastUser?.content ?? "");
  const original = lastUser?.content ?? "";

  const redactedFields: string[] = [];
  if (sanitized !== original) {
    if (sanitized.includes("[ACCOUNT_NUM]")) redactedFields.push("account_number");
    if (sanitized.includes("[LOCAL_PATH]")) redactedFields.push("local_path");
    if (sanitized.includes("[BRAIN_PATH]")) redactedFields.push("brain_path");
    if (sanitized.includes("[CAPITALIFE_BRAIN]")) redactedFields.push("brain_reference");
    if (sanitized.includes("[EMAIL]")) redactedFields.push("email");
  }

  return {
    timestamp: new Date().toISOString(),
    privacyLevel: privacy.level,
    privacyReason: privacy.reason,
    privacyTriggers: privacy.triggers,
    sanitizedRequest: privacy.level === "LOCAL_ONLY" ? "[BLOCKED — LOCAL_ONLY]" : sanitized,
    messagesWouldSend: messages.length,
    brainContextInjected: opts.brainInjected,
    brainContextCharCount: opts.brainChars ?? 0,
    graphifyContextInjected: opts.graphifyInjected,
    targetProvider: opts.targetProvider,
    wouldRedact: redactedFields.length > 0,
    wouldBlock: privacy.level === "LOCAL_ONLY",
    redactedFields,
  };
}

export function formatOutboundContext(ctx: OutboundContext): string {
  return [
    `=== OUTBOUND CONTEXT INSPECTOR ===`,
    `Timestamp:   ${ctx.timestamp}`,
    `Privacy:     ${ctx.privacyLevel} — ${ctx.privacyReason}`,
    `Triggers:    ${ctx.privacyTriggers.join(", ") || "none"}`,
    `Blocked:     ${ctx.wouldBlock ? "YES — request stays local" : "NO — may go external"}`,
    `Redacted:    ${ctx.wouldRedact ? ctx.redactedFields.join(", ") : "none"}`,
    `Messages:    ${ctx.messagesWouldSend}`,
    `Brain:       ${ctx.brainContextInjected ? `injected (${ctx.brainContextCharCount} chars)` : "not injected"}`,
    `Graphify:    ${ctx.graphifyContextInjected ? "injected" : "not injected"}`,
    `Provider:    ${ctx.targetProvider ?? "not yet selected"}`,
    ``,
    `Sanitized request:`,
    `> ${ctx.sanitizedRequest.slice(0, 300)}${ctx.sanitizedRequest.length > 300 ? "..." : ""}`,
    `===================================`,
  ].join("\n");
}
