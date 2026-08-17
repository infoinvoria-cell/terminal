// ── Mobile Response Redaction ─────────────────────────────────────────────────
// Centralized sanitation for all /api/mobile/* responses.
// Prevents leaking: Windows/Unix paths, localhost, LAN IPs, API keys,
// service-role tokens, IBKR account IDs, env dumps.

const REDACT_PATTERNS: [RegExp, string][] = [
  // Windows absolute paths
  [/[A-Za-z]:\\(?:[^\s"',<>|?*\x00-\x1f]+\\?)+/g, "[PATH_REDACTED]"],
  // Unix home/absolute paths (be specific to avoid false positives on URLs)
  [/\/(?:home|Users|root|var|etc|tmp)\/[^\s"',<>|?*\x00-\x1f]+/g, "[PATH_REDACTED]"],
  // localhost URLs
  [/https?:\/\/localhost(?::\d+)?(?:\/[^\s"']*)*/gi, "[LOCAL_URL_REDACTED]"],
  [/https?:\/\/127\.0\.0\.1(?::\d+)?(?:\/[^\s"']*)*/gi, "[LOCAL_URL_REDACTED]"],
  // LAN RFC1918 IPs
  [/\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g, "[LAN_IP_REDACTED]"],
  // Full JWT tokens — must run BEFORE generic secret pattern (eyJaaa.eyJbbb.ccc)
  [/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[TOKEN_REDACTED]"],
  // Standalone base64-encoded JWT header segments (eyJ... 40+ chars followed by dot)
  [/eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[TOKEN_REDACTED]"],
  // Generic API key patterns (long alphanumeric after key=/token=/secret=)
  [/(?:api[_-]?key|token|secret|password|service[_-]?role)\s*[=:]\s*["']?[A-Za-z0-9_\-+/]{20,}["']?/gi, "[SECRET_REDACTED]"],
  // IBKR account IDs (DU/U prefix + 6+ digits)
  [/\b(?:DU|U)\d{6,}\b/g, "[IBKR_ACCOUNT_REDACTED]"],
];

export function redactString(text: string): string {
  let result = text;
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function redactObject<T>(obj: T): T {
  const raw = JSON.stringify(obj);
  return JSON.parse(redactString(raw)) as T;
}

export function isSafePath(relPath: string): boolean {
  if (!relPath) return false;
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized.includes("../") || normalized.includes("..\\")) return false;
  if (normalized.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(normalized)) return false;
  if (/%2e%2e/i.test(normalized)) return false;
  if (/%5c/i.test(normalized)) return false;
  if (/%2f/i.test(normalized)) return false;
  if (!/^[A-Za-z0-9/_\-. ]+$/.test(normalized)) return false;
  return true;
}

// Safe document IDs — only allow whitelisted brain doc IDs (no raw paths)
export const MOBILE_BRAIN_DOC_WHITELIST: Record<string, { relPath: string; title: string; category: string }> = {
  "ai-read-first":          { relPath: "09_AI/AI_PROJECT_BRAIN_CURRENT.md",           title: "AI Project Brain",        category: "system" },
  "system-status":          { relPath: "20_Audits/Capitalife_System_Status_2026-08-16.md", title: "System Status",       category: "system" },
  "white-swan-status":      { relPath: "07_Technology/White Swan Portfolio.md",        title: "White Swan Status",       category: "strategy" },
  "sentinel-status":        { relPath: "07_Technology/Sentinel Multi Provider Router.md", title: "Sentinel Status",      category: "system" },
  "nautilus-ibkr":          { relPath: "07_Technology/NautilusTrader Execution Sidecar.md", title: "Nautilus/IBKR Architecture", category: "execution" },
  "strategy-tester-status": { relPath: "09_AI/AI_PROJECT_BRAIN_CURRENT.md",           title: "Strategy Tester Status",  category: "research" },
  "mobile-platform":        { relPath: "20_Audits/Capitalife_System_Status_2026-08-16.md", title: "Mobile Platform Status", category: "mobile" },
};
