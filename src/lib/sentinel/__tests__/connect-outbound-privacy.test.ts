// Brain outbound privacy regression tests.
// Verifies that sensitive Brain content (local paths, secret markers, vault data)
// is NEVER present in the external payload sent to providers.
//
// Architecture under test:
//   - Local messages (passed to local providers): contain Brain context
//   - externalMessages (passed to remote providers): Brain stripped via stripBrainFromSystemMessage()
//
// These are deterministic unit tests — no network calls, no real Brain read.
import { describe, it, expect } from "vitest";
import { stripBrainFromSystemMessage } from "../connect/connect-router";
import { SENTINEL_SYSTEM_PROMPT } from "../providers/provider-router";
import { classifyPrivacy } from "../connect/privacy-classifier";

// Synthetic Brain content with deliberate LOCAL_ONLY trigger examples.
// These strings MUST appear in local messages (BrainUsed=true) but NEVER in externalMessages.
const PRIVATE_BRAIN_SENTINEL_MARKER_123 = "PRIVATE_BRAIN_SENTINEL_MARKER_123";
const WINDOWS_LOCAL_PATH = "C:\\Users\\example\\private\\vault\\accounts.csv";
const UNIX_LOCAL_PATH = "/home/example/private/secrets.json";
const VAULT_SECRET_CONTENT = "VAULT_SECRET_CONTENT_DO_NOT_SHARE";
const ORDINARY_DOMAIN_FACT = "The Sharpe ratio measures risk-adjusted return relative to a benchmark.";

const SYNTHETIC_BRAIN_SECTION = `\n\n## CAPITALIFE BRAIN — LIVE DATEN

${PRIVATE_BRAIN_SENTINEL_MARKER_123}
${WINDOWS_LOCAL_PATH}
${UNIX_LOCAL_PATH}
${VAULT_SECRET_CONTENT}

### Portfolio Status
${ORDINARY_DOMAIN_FACT}
White Swan CAGR: 35.2%`;

// A system message as it exists locally (after Brain injection):
// base SENTINEL_SYSTEM_PROMPT + the Brain section with sensitive content
const LOCAL_SYSTEM_MESSAGE = SENTINEL_SYSTEM_PROMPT + SYNTHETIC_BRAIN_SECTION;

describe("Brain outbound privacy — stripBrainFromSystemMessage()", () => {
  const stripped = stripBrainFromSystemMessage(LOCAL_SYSTEM_MESSAGE);

  it("local system message CONTAINS the Brain sentinel marker (Brain WAS injected)", () => {
    expect(LOCAL_SYSTEM_MESSAGE).toContain(PRIVATE_BRAIN_SENTINEL_MARKER_123);
  });

  it("local system message CONTAINS the Windows local path (Brain WAS injected)", () => {
    expect(LOCAL_SYSTEM_MESSAGE).toContain(WINDOWS_LOCAL_PATH);
  });

  it("local system message CONTAINS the Unix local path (Brain WAS injected)", () => {
    expect(LOCAL_SYSTEM_MESSAGE).toContain(UNIX_LOCAL_PATH);
  });

  // --- External payload must NOT contain any of these ---

  it("stripped external content does NOT contain PRIVATE_BRAIN_SENTINEL_MARKER_123", () => {
    expect(stripped).not.toContain(PRIVATE_BRAIN_SENTINEL_MARKER_123);
  });

  it("stripped external content does NOT contain Windows local path", () => {
    expect(stripped).not.toContain(WINDOWS_LOCAL_PATH);
  });

  it("stripped external content does NOT contain Unix local path", () => {
    expect(stripped).not.toContain(UNIX_LOCAL_PATH);
  });

  it("stripped external content does NOT contain vault secret content", () => {
    expect(stripped).not.toContain(VAULT_SECRET_CONTENT);
  });

  // --- Required content: base system prompt must be present ---

  it("stripped external content CONTAINS the SENTINEL_SYSTEM_PROMPT base", () => {
    // SENTINEL_SYSTEM_PROMPT starts with 'Du bist Sentinel'
    expect(stripped).toContain("Du bist Sentinel");
  });

  it("stripped result does not end with trailing newlines from the Brain section", () => {
    // trimEnd() is applied — clean boundary
    expect(stripped).not.toMatch(/\n\n$/);
  });

  it("stripped result length is shorter than the local message (Brain section removed)", () => {
    // stripped = base SENTINEL_SYSTEM_PROMPT only; local = base + Brain section
    expect(stripped.length).toBeLessThan(LOCAL_SYSTEM_MESSAGE.length);
    // And the Brain section itself (SYNTHETIC_BRAIN_SECTION) accounts for the difference
    expect(LOCAL_SYSTEM_MESSAGE.length - stripped.length).toBeGreaterThanOrEqual(
      SYNTHETIC_BRAIN_SECTION.length - 10, // allow small trimEnd variance
    );
  });
});

describe("Brain outbound privacy — externalMessages construction", () => {
  // Simulate exactly what connect-router.ts does when building externalMessages
  function buildExternalMessages(
    messages: Array<{ role: string; content: string }>,
    brainUsed: boolean,
  ): Array<{ role: string; content: string }> {
    return messages.map((m) => {
      if (m.role === "system" && brainUsed) {
        return { ...m, content: stripBrainFromSystemMessage(m.content) };
      }
      return m;
    });
  }

  const localMessages = [
    { role: "system", content: LOCAL_SYSTEM_MESSAGE },
    { role: "user", content: "What is the difference between futures and options?" },
  ];

  const externalMessages = buildExternalMessages(localMessages, /* brainUsed= */ true);
  const externalSystemContent = externalMessages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join(" ");
  const externalUserContent = externalMessages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");

  it("BrainUsed: true — Brain WAS used locally (local system message has Brain content)", () => {
    const localSystemContent = localMessages.find((m) => m.role === "system")!.content;
    expect(localSystemContent).toContain(PRIVATE_BRAIN_SENTINEL_MARKER_123);
  });

  it("rawBrainMarkerPresent: false — marker ABSENT from external system message", () => {
    expect(externalSystemContent).not.toContain(PRIVATE_BRAIN_SENTINEL_MARKER_123);
  });

  it("localPathPresent: false — Windows path ABSENT from external system message", () => {
    expect(externalSystemContent).not.toContain(WINDOWS_LOCAL_PATH);
  });

  it("localPathPresent: false — Unix path ABSENT from external system message", () => {
    expect(externalSystemContent).not.toContain(UNIX_LOCAL_PATH);
  });

  it("secretPresent: false — vault secret ABSENT from external system message", () => {
    expect(externalSystemContent).not.toContain(VAULT_SECRET_CONTENT);
  });

  it("system safety prompt PRESENT in external payload", () => {
    expect(externalSystemContent).toContain("Du bist Sentinel");
  });

  it("user question PRESENT in external payload", () => {
    expect(externalUserContent).toContain("futures and options");
  });

  it("external system message passes REMOTE_REDACTED or REMOTE_SAFE privacy (not LOCAL_ONLY)", () => {
    // After stripping Brain, the base SENTINEL_SYSTEM_PROMPT contains no local paths or credentials.
    // classifyPrivacy on the stripped content must not force LOCAL_ONLY.
    const reClassified = classifyPrivacy(externalSystemContent);
    expect(reClassified.level).not.toBe("LOCAL_ONLY");
  });
});
