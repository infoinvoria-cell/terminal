// Detects user messages that can be answered by internal dashboard tools
// instead of routing through an LLM — saves tokens and gives faster, accurate answers.

export type ToolFirstCategory =
  | "trades_count"
  | "portfolio_summary"
  | "signal_status"
  | "feed_status"
  | "aum_query"
  | "pnl_query"
  | "position_query"
  | "engine_diagnostics"
  | "none";

export type ToolFirstResult = {
  category: ToolFirstCategory;
  shouldUseTool: boolean;
  confidence: "high" | "medium" | "low";
  recommendedTool: string | null;
  estimatedTokenSavings: number;
};

type Rule = {
  category: ToolFirstCategory;
  pattern: RegExp;
  confidence: "high" | "medium" | "low";
  tool: string;
  tokenSavings: number;
};

const RULES: Rule[] = [
  {
    category: "trades_count",
    pattern: /\b(wie\s*viele|how\s*many|anzahl|count).{0,40}(trade|position|order|signal)/i,
    confidence: "high",
    tool: "/api/engine/diagnostics",
    tokenSavings: 3000,
  },
  {
    category: "engine_diagnostics",
    pattern: /\b(engine|motor|strategy|strategie).{0,30}(running|läuft|aktiv|active|status)/i,
    confidence: "high",
    tool: "/api/engine/diagnostics",
    tokenSavings: 2500,
  },
  {
    category: "aum_query",
    pattern: /\b(aum|assets\s*under\s*management|gesamtvermögen)\b/i,
    confidence: "high",
    tool: "/api/track-record/portfolio",
    tokenSavings: 4000,
  },
  {
    category: "portfolio_summary",
    pattern: /\b(portfolio|vermögen|allokation|allocation).{0,40}\?/i,
    confidence: "medium",
    tool: "/api/track-record/portfolio",
    tokenSavings: 2000,
  },
  {
    category: "pnl_query",
    pattern: /\b(pnl|p&l|profit\s*und\s*verlust|profit\s*and\s*loss|rendite|return|gewinn|verlust).{0,30}\?/i,
    confidence: "medium",
    tool: "/api/track-record/portfolio",
    tokenSavings: 1800,
  },
  {
    category: "position_query",
    pattern: /\b(offene?\s*position|open\s*position|positionen|aktive\s*trade)/i,
    confidence: "medium",
    tool: "/api/engine/diagnostics",
    tokenSavings: 2000,
  },
  {
    category: "signal_status",
    pattern: /\b(signal|signals).{0,30}(aktiv|active|offen|open|live|aktuell|current)/i,
    confidence: "medium",
    tool: "/api/sentinel/tools",
    tokenSavings: 1500,
  },
  {
    category: "feed_status",
    pattern: /\b(feed|live\s*feed|verbindung|connection|ticker|realtime|echtzeit).{0,30}(status|\?|ok|aktiv|läuft)/i,
    confidence: "medium",
    tool: "/api/sentinel/health",
    tokenSavings: 1200,
  },
];

export function detectToolFirstOpportunity(userMessage: string): ToolFirstResult {
  const msg = userMessage.trim();

  for (const rule of RULES) {
    if (rule.pattern.test(msg)) {
      return {
        category: rule.category,
        shouldUseTool: true,
        confidence: rule.confidence,
        recommendedTool: rule.tool,
        estimatedTokenSavings: rule.tokenSavings,
      };
    }
  }

  return {
    category: "none",
    shouldUseTool: false,
    confidence: "low",
    recommendedTool: null,
    estimatedTokenSavings: 0,
  };
}
