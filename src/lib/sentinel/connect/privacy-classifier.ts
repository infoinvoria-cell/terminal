// Privacy classifier: categorizes each request before any external provider receives text.
// LOCAL_ONLY   — must never leave this machine
// REMOTE_REDACTED — can go external only with sensitive content stripped
// REMOTE_SAFE — safe to send to external providers as-is

export type PrivacyLevel = "LOCAL_ONLY" | "REMOTE_REDACTED" | "REMOTE_SAFE";

export type PrivacyClassification = {
  level: PrivacyLevel;
  reason: string;
  triggers: string[];
  sanitizedText?: string;
};

// Patterns that always force LOCAL_ONLY
const LOCAL_ONLY_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /api[_\s-]?key|secret[_\s-]?key|bearer\s+token|authorization:\s/i, reason: "credential detected" },
  { pattern: /CAPITALIFE_BRAIN_PATH|brain.{0,20}path|vault.{0,20}path/i, reason: "local path reference" },
  { pattern: /\.env\b|env\.local|env\.example/i, reason: "env file reference" },
  { pattern: /account\s*(id|nummer|number).{0,30}\d{5}/i, reason: "account identifier" },
  { pattern: /broker.{0,20}(password|login|credential)/i, reason: "broker credential" },
  { pattern: /ssh\s+key|private\s+key|-----BEGIN/i, reason: "cryptographic key" },
  { pattern: /ibkr.{0,20}(account|password|token)/i, reason: "IBKR credential" },
  { pattern: /myfxbook.{0,20}(token|session|login)/i, reason: "Myfxbook credential" },
  { pattern: /roboforex.{0,20}(account|password|login)/i, reason: "broker credential" },
  { pattern: /wallet.{0,20}address|private.{0,10}wallet/i, reason: "crypto wallet" },
];

// Patterns for Capitalife-sensitive content that must be redacted before going external
const SENSITIVE_PATTERNS: { pattern: RegExp; placeholder: string }[] = [
  { pattern: /\b\d{6,10}\b/g, placeholder: "[ACCOUNT_NUM]" },
  { pattern: /\/Users\/\w+\/[\w/\\]+/g, placeholder: "[LOCAL_PATH]" },
  { pattern: /C:[/\\][\w/\\]+/g, placeholder: "[LOCAL_PATH]" },
  { pattern: /brain[/\\][\w/\\]+/gi, placeholder: "[BRAIN_PATH]" },
  { pattern: /capitalife\s+brain[^.\n]*/gi, placeholder: "[CAPITALIFE_BRAIN]" },
  { pattern: /(?:email|mail):\s*[\w.+@]+\.\w+/gi, placeholder: "[EMAIL]" },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, placeholder: "[EMAIL]" },
];

// Terms that indicate the request is about private Capitalife data
const CAPITALIFE_PRIVATE_TERMS = [
  /\bWhite Swan\b/i,
  /\bFSPortfolio\b/i,
  /\bCapitalife\s+(Brain|Engine|Terminal)\b/i,
  /\b(live\s+track\s+record|track\s+record)\b/i,
  /\b(MaxDD|max\s+drawdown).{0,20}\d/i,
  /\b(CAGR|Sharpe|Calmar).{0,30}\d/i,
  /\bSleeve\b.*\b(Agrar|Metals|Indices|Energy|Forex)\b/i,
  /\bsentinel\s+(brain|vault|handoff)\b/i,
  /\b(portfolio|position|trade).{0,30}number\b/i,
];

// Patterns indicating the request is generic / safe for external providers
const SAFE_INDICATORS = [
  /^what\s+is\s+(cagr|sharpe|var|drawdown|futures|beta)\??$/i,
  /^(explain|define|what\s+is)\s+\w+\?*$/i,
  /^(how\s+does?\s+).{5,60}\?*$/i,
  /^summarize\s+this\b/i,
  /^(translate|übersetz)/i,
];

function hasSensitiveLocalContent(text: string): { found: boolean; triggers: string[] } {
  const triggers: string[] = [];
  for (const { pattern, reason } of LOCAL_ONLY_PATTERNS) {
    if (pattern.test(text)) triggers.push(reason);
  }
  return { found: triggers.length > 0, triggers };
}

function hasCapalifePrivateContent(text: string): string[] {
  const triggers: string[] = [];
  for (const pat of CAPITALIFE_PRIVATE_TERMS) {
    if (pat.test(text)) triggers.push(pat.source.slice(0, 30));
  }
  return triggers;
}

function sanitize(text: string): string {
  let result = text;
  for (const { pattern, placeholder } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, placeholder);
  }
  return result;
}

function isGenericSafeQuery(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 200) return false;
  return SAFE_INDICATORS.some((p) => p.test(trimmed));
}

export function classifyPrivacy(userMessage: string, options?: { forceLocal?: boolean }): PrivacyClassification {
  if (options?.forceLocal) {
    return { level: "LOCAL_ONLY", reason: "forced local mode", triggers: ["user_requested"] };
  }

  const { found, triggers } = hasSensitiveLocalContent(userMessage);
  if (found) {
    return { level: "LOCAL_ONLY", reason: "sensitive content detected", triggers };
  }

  if (isGenericSafeQuery(userMessage)) {
    return { level: "REMOTE_SAFE", reason: "generic query, no private content", triggers: [] };
  }

  const capitalifeTriggers = hasCapalifePrivateContent(userMessage);
  if (capitalifeTriggers.length > 0) {
    const sanitized = sanitize(userMessage);
    return {
      level: "REMOTE_REDACTED",
      reason: "Capitalife-private content — sanitized before external routing",
      triggers: capitalifeTriggers,
      sanitizedText: sanitized,
    };
  }

  // Default: treat ambiguous as REMOTE_REDACTED to be safe
  const sanitized = sanitize(userMessage);
  return {
    level: "REMOTE_REDACTED",
    reason: "ambiguous — sanitized by default",
    triggers: [],
    sanitizedText: sanitized,
  };
}

export function getTextForProvider(classification: PrivacyClassification, original: string): string {
  if (classification.level === "LOCAL_ONLY") return original;
  if (classification.level === "REMOTE_REDACTED") return classification.sanitizedText ?? sanitize(original);
  return original;
}

export function canSendToRemote(classification: PrivacyClassification): boolean {
  return classification.level !== "LOCAL_ONLY";
}
