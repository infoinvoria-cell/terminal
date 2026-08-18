// Deterministic, server-only intent → read-only tool dispatch.
// Mirrors the existing Graphify injection pattern in connect-router.ts:
// the SERVER decides which tool (if any) runs, based on keyword matching on
// the user's own text — the model is never given a function-calling surface,
// so there is nothing for a hostile prompt to hijack ("call tool X", "grant
// write permission") because no such mechanism exists for the model to reach.
import { getWhiteSwanRiskModesForTier, getWhiteSwanSpComparison } from "./white-swan-tool";
import { getCoreInvestMetricsForTier, getCoreInvestLiveReadiness } from "./core-invest-tool";
import { getPhysicalIntelligenceForCommodity, getPhysicalIntelligenceKnownCommodities } from "./physical-intelligence-tool";

export type ToolInvocation = {
  toolId: string;
  resultText: string;
  source: string;
  status: "AVAILABLE" | "BLOCKED" | "CONFLICT";
  deterministicAnswer: string | null;
};

const WHITE_SWAN_NAME = /white\s*swan/i;
const GENERIC_METRIC_KEYWORDS = /max\s*dd|drawdown|sharpe|calmar|risk\s*mode/i;
const CORE_INVEST_KEYWORDS = /core\s*invest|jpy.*overlay|futures\s*overlay|etf\s*universe|live\s*ready|would.*trade.*today|broker.*requir/i;
const PHYSICAL_KEYWORDS = /physical\s*intelligence|\bcorn\b|\bsoy\b|\bwheat\b|\bcrude\b|vhi|usda|physical\s*state/i;
const SP_KEYWORDS = /s&p|sp500|s&p500|benchmark|vergleich/i;

function extractTierCapital(text: string): number {
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

function extractCommodity(text: string): string {
  if (/\bcorn\b/i.test(text)) return "CORN";
  if (/\bsoy\b/i.test(text)) return "SOY";
  if (/\bwheat\b/i.test(text)) return "WHEAT";
  if (/\bcrude\b/i.test(text)) return "CRUDE";
  return "CORN"; // no default fact to fabricate — but a generic "physical intelligence" question needs a starting point
}

// Strip any absolute filesystem path fragment from a string before it can
// reach a provider (external or local echo) — never expose real machine paths.
function sanitizeSourceLabel(rawSource: string): string {
  const basename = rawSource.split(/[\\/]/).pop() ?? rawSource;
  return basename.replace(/\.json$/i, "");
}

function dispatchWhiteSwan(userText: string): ToolInvocation {
  const tier = extractTierCapital(userText);
  const wantsSpComparison = SP_KEYWORDS.test(userText);

  if (wantsSpComparison) {
    const result = getWhiteSwanSpComparison(tier);
    const source = sanitizeSourceLabel(result.source);
    if (result.status !== "AVAILABLE" || !result.spComparison) {
      return {
        toolId: "get_white_swan_sp_comparison", status: "BLOCKED", source, deterministicAnswer: null,
        resultText: `[White Swan S&P comparison for €${tier}: UNAVAILABLE — ${result.failureReason ?? "current data not reachable"}. Do not state a specific figure; say it is currently unavailable.]`,
      };
    }
    const c = result.spComparison;
    return {
      toolId: "get_white_swan_sp_comparison", status: "AVAILABLE", source,
      deterministicAnswer:
        `White Swan v7 (€${tier} Tier, 1.0x) — MaxDD: **${c.whiteSwanMaxDD}%**\n` +
        `S&P 500 (same window, running-peak) — MaxDD: **${c.spMaxDD}%**\nOutperforms: ${c.outperforms ? "Ja" : "Nein"}\n` +
        `Methodik: ${result.maxDDMethodology}\nQuelle: ${source}`,
      resultText:
        `[White Swan v7 vs S&P 500 comparison, tier €${tier}, source: ${source} — ` +
        `White Swan MaxDD ${c.whiteSwanMaxDD}%, S&P 500 MaxDD ${c.spMaxDD}%, outperforms=${c.outperforms}. Methodology: ${result.maxDDMethodology}]`,
    };
  }

  const result = getWhiteSwanRiskModesForTier(tier);
  const source = sanitizeSourceLabel(result.source);
  if (result.status !== "AVAILABLE" || !result.tierData) {
    return {
      toolId: "get_white_swan_risk_modes", status: "BLOCKED", source, deterministicAnswer: null,
      resultText:
        `[White Swan risk-mode data for €${tier}: UNAVAILABLE — ${result.failureReason ?? "current data not reachable"}. ` +
        `Do not state a specific MaxDD/CAGR/Sharpe figure from memory; say current figures are currently unavailable. ` +
        (result.tiers?.length ? `Known tiers: ${result.tiers.join(", ")}.` : ""),
    };
  }
  const modesText = result.tierData.modes
    .map((m) => `${m.id}: CAGR ${m.cagr}%, OOS CAGR ${m.oosCagr}%, Sharpe ${m.sharpe}, MaxDD ${m.maxDDPct}%, Calmar ${m.calmar}, PF ${m.pf}, Margin ${m.marginPct}%, status ${m.status}`)
    .join(" | ");
  const deterministicLines = result.tierData.modes
    .map((m) => `${m.id}: MaxDD **${m.maxDDPct}%** · CAGR ${m.cagr}% · OOS CAGR ${m.oosCagr}% · Sharpe ${m.sharpe} · Calmar ${m.calmar} · PF ${m.pf} · Margin ${m.marginPct}% · ${m.status}`)
    .join("\n");
  return {
    toolId: "get_white_swan_risk_modes", status: "AVAILABLE", source,
    deterministicAnswer: `White Swan v7 — €${tier} Tier\n${deterministicLines}\n\nMethodik: ${result.maxDDMethodology}\nQuelle: ${source}`,
    resultText: `[White Swan v7 real current data, tier €${tier}, source: ${source} — ${modesText}. Methodology: ${result.maxDDMethodology}]`,
  };
}

function dispatchCoreInvest(userText: string): ToolInvocation {
  const wantsReadiness = /live\s*ready|would.*trade|broker|execut/i.test(userText);
  if (wantsReadiness) {
    const result = getCoreInvestLiveReadiness();
    const source = sanitizeSourceLabel(result.source);
    if (result.status !== "AVAILABLE" || !result.liveReadiness) {
      return {
        toolId: "get_core_invest_live_readiness", status: "BLOCKED", source, deterministicAnswer: null,
        resultText: `[Core Invest live-readiness: UNAVAILABLE — ${result.failureReason ?? "current data not reachable"}. Do not claim live-ready status without this source.]`,
      };
    }
    const r = result.liveReadiness;
    return {
      toolId: "get_core_invest_live_readiness", status: "AVAILABLE", source,
      deterministicAnswer:
        `Core Invest (${r.classification}) — Würde heute traden: **${r.wouldTradeToday}**\nGrund: ${r.reason}\nQuelle: ${source}`,
      resultText:
        `[Core Invest live-readiness, source: ${source} — wouldTradeToday=${r.wouldTradeToday}, classification=${r.classification}. ` +
        `Reason: ${r.reason} Do not present this as broker-confirmed or live-ready beyond this stated classification.]`,
    };
  }

  const tier = extractTierCapital(userText);
  const result = getCoreInvestMetricsForTier(tier, "investorNet");
  const source = sanitizeSourceLabel(result.source);
  if (result.status !== "AVAILABLE" || !result.metrics) {
    return {
      toolId: "get_core_invest_metrics", status: "BLOCKED", source, deterministicAnswer: null,
      resultText: `[Core Invest metrics for €${tier}: UNAVAILABLE — ${result.failureReason ?? "current data not reachable"}. Do not state a specific figure from memory.]`,
    };
  }
  const m = result.metrics;
  return {
    toolId: "get_core_invest_metrics", status: "AVAILABLE", source,
    deterministicAnswer:
      `Core Invest — €${tier} Tier (${m.basis}, after fee)\n` +
      `CAGR **${m.CAGR}%** · Vol ${m.volPct}% · Sharpe ${m.Sharpe} · Sortino ${m.Sortino} · MaxDD **${m.maxDDPct}%** · Calmar ${m.Calmar}\n\n` +
      `Methodik: ${result.methodology}\nQuelle: ${source}`,
    resultText:
      `[Core Invest ${m.basis} metrics, tier €${tier}, source: ${source} — CAGR ${m.CAGR}%, Vol ${m.volPct}%, Sharpe ${m.Sharpe}, ` +
      `Sortino ${m.Sortino}, MaxDD ${m.maxDDPct}%, Calmar ${m.Calmar}. Methodology: ${result.methodology}]`,
  };
}

function dispatchPhysicalIntelligence(userText: string): ToolInvocation {
  const commodity = extractCommodity(userText);
  const result = getPhysicalIntelligenceForCommodity(commodity);
  const source = sanitizeSourceLabel(result.source);
  if (result.status !== "AVAILABLE" || !result.observations) {
    const known = getPhysicalIntelligenceKnownCommodities();
    return {
      toolId: "get_physical_intelligence", status: "BLOCKED", source, deterministicAnswer: null,
      resultText:
        `[Physical Intelligence for ${commodity}: UNAVAILABLE — ${result.failureReason ?? "current data not reachable"}. ` +
        `Do not state a specific score/status from memory. ` + (known.length ? `Known commodities: ${known.join(", ")}.` : ""),
    };
  }
  const obsLines = result.observations
    .map((o) => `${o.provider} (${o.variable}): score ${o.score ?? "n/a"}, confidence ${o.confidence ?? "n/a"}, status ${o.status}${o.stale ? " [STALE]" : ""}`)
    .join(" | ");
  const deterministicLines = result.observations
    .map((o) => `${o.provider}: score **${o.score ?? "n/a"}** · confidence ${o.confidence ?? "n/a"} · ${o.status}${o.stale ? " (veraltet)" : ""}`)
    .join("\n");
  return {
    toolId: "get_physical_intelligence", status: "AVAILABLE", source,
    deterministicAnswer:
      `Physical Intelligence — ${result.commodity}\n${deterministicLines}\n\n` +
      `Modus: ${result.mode} → Trading Impact: **${result.tradingImpact}** (Edge-Status: ${result.edgeStatus})\nQuelle: ${source}`,
    resultText:
      `[Physical Intelligence for ${result.commodity}, source: ${source} — ${obsLines}. ` +
      `Mode: ${result.mode}. Trading impact: ${result.tradingImpact}. Edge status: ${result.edgeStatus}. ` +
      `This is observation/shadow data — do not present it as an approved live trading signal or as changing real positions unless the mode field says otherwise.]`,
  };
}

/**
 * Bounded, deterministic, read-only tool dispatch. The model is never given
 * a function-calling surface — the server decides which domain(s) are
 * relevant purely from keyword matching on the user's own text. Supports
 * at most TWO domains per request (explicit bounded cross-domain support,
 * e.g. "compare White Swan and Core Invest") — never all three at once,
 * so an unrelated question never pulls in unnecessary context/tokens.
 * Returns null when no known domain is relevant.
 */
export function dispatchReadOnlyTool(userText: string): ToolInvocation | null {
  const wantsCoreInvest = CORE_INVEST_KEYWORDS.test(userText);
  // A generic metric term (MaxDD/Sharpe/...) only implies White Swan when the
  // text doesn't explicitly name Core Invest — otherwise "Core Invest MaxDD"
  // would incorrectly also match White Swan.
  const wantsWhiteSwan = WHITE_SWAN_NAME.test(userText) || (GENERIC_METRIC_KEYWORDS.test(userText) && !wantsCoreInvest);
  const wantsPhysical = PHYSICAL_KEYWORDS.test(userText);

  const matched: ToolInvocation[] = [];
  if (wantsWhiteSwan) matched.push(dispatchWhiteSwan(userText));
  if (wantsCoreInvest) matched.push(dispatchCoreInvest(userText));
  if (wantsPhysical) matched.push(dispatchPhysicalIntelligence(userText));

  if (matched.length === 0) return null;
  if (matched.length === 1) return matched[0]!;

  // Bounded cross-domain: combine at most the first two matched domains.
  const [first, second] = matched;
  return {
    toolId: `${first!.toolId}+${second!.toolId}`,
    status: first!.status === "AVAILABLE" && second!.status === "AVAILABLE" ? "AVAILABLE" : "BLOCKED",
    source: `${first!.source}+${second!.source}`,
    deterministicAnswer: first!.deterministicAnswer && second!.deterministicAnswer
      ? `${first!.deterministicAnswer}\n\n---\n\n${second!.deterministicAnswer}`
      : null,
    resultText: `${first!.resultText}\n${second!.resultText}`,
  };
}
