// Deterministic, server-only intent → read-only tool dispatch.
// Mirrors the existing Graphify injection pattern in connect-router.ts:
// the SERVER decides which tool (if any) runs, based on keyword matching on
// the user's own text — the model is never given a function-calling surface,
// so there is nothing for a hostile prompt to hijack ("call tool X", "grant
// write permission") because no such mechanism exists for the model to reach.
import { getWhiteSwanRiskModesForTier, getWhiteSwanSpComparison } from "./white-swan-tool";

export type ToolInvocation = {
  toolId: string;
  resultText: string;
  source: string;
  status: "AVAILABLE" | "BLOCKED" | "CONFLICT";
};

const WHITE_SWAN_KEYWORDS = /white\s*swan|maxdd|max\s*dd|drawdown|sharpe|calmar|risk\s*mode/i;
const TIER_PATTERN = /(?:€|eur)?\s*(\d[\d.,]*)\s*(?:k|€|eur)?/i;

function extractTierCapital(text: string): number {
  // Look for "15k", "€15k", "15000", "15.000" patterns near a currency/k marker.
  const kMatch = text.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
  if (kMatch) {
    const n = parseFloat(kMatch[1]!.replace(",", "."));
    if (!Number.isNaN(n)) return Math.round(n * 1000);
  }
  const euroMatch = text.match(/€\s*(\d[\d.,]*)/);
  if (euroMatch) {
    const cleaned = euroMatch[1]!.replace(/[.,](?=\d{3}\b)/g, "");
    const n = parseInt(cleaned.replace(",", "."), 10);
    if (!Number.isNaN(n)) return n;
  }
  return 15000; // default reference tier when no explicit amount is mentioned
}

const SP_KEYWORDS = /s&p|sp500|s&p500|benchmark|vergleich/i;

// Strip any absolute filesystem path fragment from a string before it can
// reach a provider (external or local echo) — never expose real machine paths.
function sanitizeSourceLabel(rawSource: string): string {
  const basename = rawSource.split(/[\\/]/).pop() ?? rawSource;
  return basename.replace(/\.json$/i, "");
}

/**
 * Bounded, single-shot, read-only tool dispatch. Runs at most ONE tool per
 * request — there is no loop, no recursion, no model-driven tool selection.
 * Returns null when no tool is relevant to the question.
 */
export function dispatchReadOnlyTool(userText: string): ToolInvocation | null {
  if (!WHITE_SWAN_KEYWORDS.test(userText)) return null;

  const tier = extractTierCapital(userText);
  const wantsSpComparison = SP_KEYWORDS.test(userText);

  if (wantsSpComparison) {
    const result = getWhiteSwanSpComparison(tier);
    const source = sanitizeSourceLabel(result.source);
    if (result.status !== "AVAILABLE" || !result.spComparison) {
      return {
        toolId: "get_white_swan_sp_comparison",
        status: "BLOCKED",
        source,
        resultText: `[White Swan S&P comparison for €${tier}: UNAVAILABLE — ${result.failureReason ?? "current data not reachable"}. Do not state a specific figure; say it is currently unavailable.]`,
      };
    }
    const c = result.spComparison;
    return {
      toolId: "get_white_swan_sp_comparison",
      status: "AVAILABLE",
      source,
      resultText:
        `[White Swan v7 vs S&P 500 comparison, tier €${tier}, source: ${source} — ` +
        `White Swan MaxDD ${c.whiteSwanMaxDD}%, S&P 500 MaxDD ${c.spMaxDD}%, outperforms=${c.outperforms}. ` +
        `Methodology: ${result.maxDDMethodology}]`,
    };
  }

  const result = getWhiteSwanRiskModesForTier(tier);
  const source = sanitizeSourceLabel(result.source);
  if (result.status !== "AVAILABLE" || !result.tierData) {
    return {
      toolId: "get_white_swan_risk_modes",
      status: "BLOCKED",
      source,
      resultText:
        `[White Swan risk-mode data for €${tier}: UNAVAILABLE — ${result.failureReason ?? "current data not reachable"}. ` +
        `Do not state a specific MaxDD/CAGR/Sharpe figure from memory; say current figures are currently unavailable. ` +
        (result.tiers?.length ? `Known tiers: ${result.tiers.join(", ")}.` : ""),
    };
  }
  const modesText = result.tierData.modes
    .map((m) => `${m.id}: CAGR ${m.cagr}%, OOS CAGR ${m.oosCagr}%, Sharpe ${m.sharpe}, MaxDD ${m.maxDDPct}%, Calmar ${m.calmar}, PF ${m.pf}, Margin ${m.marginPct}%, status ${m.status}`)
    .join(" | ");
  return {
    toolId: "get_white_swan_risk_modes",
    status: "AVAILABLE",
    source,
    resultText:
      `[White Swan v7 real current data, tier €${tier}, source: ${source} — ${modesText}. ` +
      `Methodology: ${result.maxDDMethodology}]`,
  };
}
