// Deterministic task classifier — no LLM calls, keyword heuristics only.
// Maps a user message to a SentinelTask for routing decisions.

export type SentinelTask =
  | "simple_dashboard_lookup"
  | "simple_chat"
  | "summarization"
  | "coding"
  | "code_review"
  | "reasoning"
  | "financial_analysis"
  | "long_context"
  | "vision"
  | "structured_output"
  | "tool_calling"
  | "brain_rag"
  | "graph_rag"
  | "reranking"
  | "privacy";

// Token estimate for "long context" threshold — 12k chars ≈ ~3k tokens
const LONG_CONTEXT_CHAR_THRESHOLD = 12_000;

// Keyword sets — ordered by specificity (most specific first)
const PRIVACY_KEYWORDS = /\b(password|credentials?|api.?key|secret|ssn|bsn|passport|bank.?account|iban|credit.?card|pin\b|private.?key)\b/i;
const VISION_KEYWORDS = /\b(image|foto|bild|screenshot|photo|chart.?image|visual|png|jpg|jpeg|svg|describe.+image|what.+see)\b/i;
const CODE_REVIEW_KEYWORDS = /\b(review|audit|check|prüf|analysier).{0,30}(code|funktion|function|component|class|modul)\b/i;
const CODING_KEYWORDS = /\b(code|programm|script|function|implement|schreib|erstell|build|debug|fix|refactor|typescript|javascript|python|rust|react|next\.?js|api|endpoint)\b/i;
const REASONING_KEYWORDS = /\b(warum|why|erklär|explain|analys|vergleich|compare|bewert|eval|pros.+cons|vor.+nachteile|strateg|logik|ursache|cause|unterschied|difference|entscheid|decide)\b/i;
const SUMMARIZATION_KEYWORDS = /\b(zusammenfass|summarize|summary|kurz|tldr|overview|überblick|fass.+zusammen|komprimier)\b/i;
const BRAIN_RAG_KEYWORDS = /\b(brain|vault|obsidian|notiz|note|dokument|document|file|datei|meine.+daten|my.+data|capitalife)\b/i;
const GRAPH_RAG_KEYWORDS = /\b(graph|netzwerk|network|verbindung|connection|zusammenhang|relationship|link|knoten|node)\b/i;
const STRUCTURED_OUTPUT_KEYWORDS = /\b(json|yaml|csv|tabelle|table|liste|list|strukturiert|format|schema|output.+format|als.+json|as.+json)\b/i;
const TOOL_CALLING_KEYWORDS = /\b(tools?|suche|search|fetch|abruf|aktuell|current|live|echtzeit|realtime|preis.+jetzt|price.+now)\b/i;
const FINANCIAL_KEYWORDS = /\b(trade|trading|signal|strategi|portfolio|position|pnl|drawdown|backtest|futures?|option|aktie|stock|markt|market|preis|price|kurs|chart|indikator|indicator|forex|crypto|btc|eth|dax|nasdaq|sp500)\b/i;
const DASHBOARD_KEYWORDS = /\b(wie.+viel|how.+much|was.+kostet|what.+price|aktuell.+preis|current.+price|balance|kontostand|aum|yield|rendite|pnl|performance.+heute|performance.+today)\b/i;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function classifyTask(
  userMessage: string,
  opts?: { hasImages?: boolean; inputTokenEstimate?: number },
): SentinelTask {
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();

  // Vision — explicit image presence
  if (opts?.hasImages || VISION_KEYWORDS.test(lower)) return "vision";

  // Privacy — never route to external providers
  if (PRIVACY_KEYWORDS.test(lower)) return "privacy";

  // Long context — large input
  const charLen = msg.length;
  const tokenEst = opts?.inputTokenEstimate ?? estimateTokens(msg);
  if (charLen > LONG_CONTEXT_CHAR_THRESHOLD || tokenEst > 3_000) return "long_context";

  // Brain / Graph RAG
  if (GRAPH_RAG_KEYWORDS.test(lower) && BRAIN_RAG_KEYWORDS.test(lower)) return "graph_rag";
  if (BRAIN_RAG_KEYWORDS.test(lower)) return "brain_rag";

  // Code review (before coding)
  if (CODE_REVIEW_KEYWORDS.test(lower)) return "code_review";

  // Coding
  if (CODING_KEYWORDS.test(lower)) return "coding";

  // Structured output
  if (STRUCTURED_OUTPUT_KEYWORDS.test(lower)) return "structured_output";

  // Tool calling (search/live data)
  if (TOOL_CALLING_KEYWORDS.test(lower)) return "tool_calling";

  // Summarization
  if (SUMMARIZATION_KEYWORDS.test(lower)) return "summarization";

  // Financial analysis (complex)
  if (FINANCIAL_KEYWORDS.test(lower)) {
    // Simple lookup vs complex analysis
    if (DASHBOARD_KEYWORDS.test(lower) && msg.length < 120) return "simple_dashboard_lookup";
    return "financial_analysis";
  }

  // Simple dashboard lookup
  if (DASHBOARD_KEYWORDS.test(lower) && msg.length < 120) return "simple_dashboard_lookup";

  // Reasoning
  if (REASONING_KEYWORDS.test(lower)) return "reasoning";

  // Default to simple chat
  return "simple_chat";
}

// Maps SentinelTask → required model capabilities
export type TaskCapabilityRequirement = {
  minContextWindow: number;
  needsVision: boolean;
  needsTools: boolean;
  needsStructuredOutput: boolean;
  needsReasoning: boolean;
  preferFast: boolean;
  preferLargeContext: boolean;
};

export const TASK_REQUIREMENTS: Record<SentinelTask, TaskCapabilityRequirement> = {
  simple_dashboard_lookup: { minContextWindow: 4096, needsVision: false, needsTools: false, needsStructuredOutput: false, needsReasoning: false, preferFast: true, preferLargeContext: false },
  simple_chat: { minContextWindow: 8192, needsVision: false, needsTools: false, needsStructuredOutput: false, needsReasoning: false, preferFast: true, preferLargeContext: false },
  summarization: { minContextWindow: 32768, needsVision: false, needsTools: false, needsStructuredOutput: false, needsReasoning: false, preferFast: false, preferLargeContext: true },
  coding: { minContextWindow: 32768, needsVision: false, needsTools: false, needsStructuredOutput: true, needsReasoning: false, preferFast: false, preferLargeContext: false },
  code_review: { minContextWindow: 32768, needsVision: false, needsTools: false, needsStructuredOutput: false, needsReasoning: true, preferFast: false, preferLargeContext: false },
  reasoning: { minContextWindow: 32768, needsVision: false, needsTools: false, needsStructuredOutput: false, needsReasoning: true, preferFast: false, preferLargeContext: false },
  financial_analysis: { minContextWindow: 32768, needsVision: false, needsTools: false, needsStructuredOutput: false, needsReasoning: true, preferFast: false, preferLargeContext: false },
  long_context: { minContextWindow: 131072, needsVision: false, needsTools: false, needsStructuredOutput: false, needsReasoning: false, preferFast: false, preferLargeContext: true },
  vision: { minContextWindow: 8192, needsVision: true, needsTools: false, needsStructuredOutput: false, needsReasoning: false, preferFast: false, preferLargeContext: false },
  structured_output: { minContextWindow: 16384, needsVision: false, needsTools: false, needsStructuredOutput: true, needsReasoning: false, preferFast: false, preferLargeContext: false },
  tool_calling: { minContextWindow: 16384, needsVision: false, needsTools: true, needsStructuredOutput: false, needsReasoning: false, preferFast: true, preferLargeContext: false },
  brain_rag: { minContextWindow: 65536, needsVision: false, needsTools: false, needsStructuredOutput: false, needsReasoning: false, preferFast: false, preferLargeContext: true },
  graph_rag: { minContextWindow: 65536, needsVision: false, needsTools: false, needsStructuredOutput: true, needsReasoning: true, preferFast: false, preferLargeContext: true },
  reranking: { minContextWindow: 8192, needsVision: false, needsTools: false, needsStructuredOutput: true, needsReasoning: false, preferFast: true, preferLargeContext: false },
  privacy: { minContextWindow: 8192, needsVision: false, needsTools: false, needsStructuredOutput: false, needsReasoning: false, preferFast: true, preferLargeContext: false },
};
