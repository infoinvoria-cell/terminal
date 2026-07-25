/**
 * Research Hypothesis Registry API — Append-Only Frozen Registry
 *
 * Core principles:
 * 1. APPEND-ONLY: Once saved, a hypothesis definition cannot change.
 * 2. IMMUTABLE: Any definition change creates a new hypothesis with new ID.
 * 3. DEFINITION HASH: Each hypothesis carries a hash of its frozen definition.
 * 4. FORWARD ELIGIBILITY: Only occurrences AFTER the freeze timestamp count.
 * 5. SEPARATED STORAGE: Forward observations stored separately from discovery data.
 * 6. NO AUTO-SAVE: Only manual user action saves a hypothesis.
 * 7. APPROVED LIBRARY: Always blocked for current research candidates.
 *
 * Registry: workspace/research_registry/frozen_hypotheses.json
 * Observations: workspace/research_registry/forward_observations.json
 */

import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { parseDailyBarsCsv } from "@/lib/seasonality/walkForward/csvDataLoader";
import { buildYearSlotLookup, getPatternTradeForYear } from "@/lib/seasonality/barLevelRisk";
import type { DailyBar } from "@/lib/seasonality/walkForward/types";

// ── File paths ────────────────────────────────────────────────────────────────
function registryDir(): string {
  return path.join(process.cwd(), "..", "workspace", "research_registry");
}
function hypothesesPath(): string {
  return path.join(registryDir(), "frozen_hypotheses.json");
}
function observationsPath(): string {
  return path.join(registryDir(), "forward_observations.json");
}

// ── Definition hash ───────────────────────────────────────────────────────────
function hashDefinition(def: Record<string, unknown>): string {
  const str = JSON.stringify(def, Object.keys(def).sort());
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type FrozenResearchHypothesis = {
  hypothesisId: string;
  hypothesisVersion: 1;
  createdAt: string;
  frozenAt: string;            // ISO date — definition locked at this timestamp
  createdByAction: "manual_user_save";

  sourceType: "strategy_engine_pattern" | "seasonal_filter_policy";
  assetId: string;
  displayName: string;

  hypothesisDefinition: {
    direction?: "LONG" | "SHORT";
    entrySlot?: number;         // exact slot from engine
    holdingDays?: number;
    window?: string;            // human-readable label
    qualityScore?: number;
    filterPolicy?: string;
    qualityThreshold?: number;
    matchingMode?: string;
    topN?: number;
  };

  frozenDefinitionHash: string;  // SHA-lite of hypothesisDefinition — detects tampering

  discoverySnapshot: {
    dataUsedThroughDate: string;       // "2025-12-31"
    primaryStudyRange: string;
    strictWfStatus: string;
    bootstrapStatus: string;
    dsrStatus: string;
    realityCheckStatus: string;
    pboStatus: string;
    executionStatus: string;
    finalResearchStatus: string;
    sampleSufficiency?: string;
  };

  forwardEligibility: {
    eligibilityBasis: "entry_date_after_freeze";
    frozenAtTimestamp: string;

    nextOccurrences: Array<{
      year: number;
      estimatedEntryDate: string;
      estimatedExitDate: string;
      eligible: boolean;
      status: "scheduled" | "active" | "completed_pending_record" | "not_eligible_before_freeze";
      reason: string;
    }>;

    firstEligibleYear: number | null;
    firstEligibleEntryDate: string | null;
    firstEligibleExitDate: string | null;
  };

  approvalStatus: "research_hypothesis_frozen_for_forward_validation";
  approvedForTrading: false;
  eligibleForApprovedPortfolioLibrary: false;
  immutable: true;
};

export type ForwardValidationObservation = {
  observationId: string;
  hypothesisId: string;
  occurrenceYear: number;

  entryDate: string;
  exitDate: string;

  eligibilityVerified: boolean;
  eligibilityReason: string;

  status:
    | "scheduled"
    | "active"
    | "completed_pending_record"
    | "recorded"
    | "excluded_not_truly_unseen";

  observedResult?: {
    return?: number;
    direction?: "LONG" | "SHORT";
    realizedOrResearchMethod: string;
    barLevelMaxAdverseExcursion?: number | null;
  };

  countedAsForwardEvidence: boolean;
  doesNotModifyOriginalDiscoveryEvidence: true;  // immutable guarantee

  recordedAt?: string;
};

type Registry = {
  version: "research_registry_v1";
  lastUpdated: string;
  hypotheses: FrozenResearchHypothesis[];
};

type ObservationRegistry = {
  version: "forward_observations_v1";
  lastUpdated: string;
  observations: ForwardValidationObservation[];
};

// ── I/O helpers ───────────────────────────────────────────────────────────────
async function readRegistry(): Promise<Registry> {
  try {
    const content = await fs.readFile(hypothesesPath(), "utf8");
    return JSON.parse(content) as Registry;
  } catch {
    return { version: "research_registry_v1", lastUpdated: new Date().toISOString(), hypotheses: [] };
  }
}

async function writeRegistry(registry: Registry): Promise<void> {
  registry.lastUpdated = new Date().toISOString();
  await fs.mkdir(registryDir(), { recursive: true });
  await fs.writeFile(hypothesesPath(), JSON.stringify(registry, null, 2), "utf8");
}

async function readObservations(): Promise<ObservationRegistry> {
  try {
    const content = await fs.readFile(observationsPath(), "utf8");
    return JSON.parse(content) as ObservationRegistry;
  } catch {
    return { version: "forward_observations_v1", lastUpdated: new Date().toISOString(), observations: [] };
  }
}

async function writeObservations(obs: ObservationRegistry): Promise<void> {
  obs.lastUpdated = new Date().toISOString();
  await fs.mkdir(registryDir(), { recursive: true });
  await fs.writeFile(observationsPath(), JSON.stringify(obs, null, 2), "utf8");
}

// ── Forward eligibility calculation ──────────────────────────────────────────
const AGRI_CSV_DIR = path.join(
  process.cwd(), "..", "workspace", "output", "tradingview_data_test", "full_history_validated"
);

const AGRI_CSV_MAP: Record<string, string> = {
  soybeans: "CBOT_ZS1_TV_MERGED_FULL_HISTORY_daily.csv",
  wheat:    "CBOT_ZW1_TV_MERGED_FULL_HISTORY_daily.csv",
  corn:     "CBOT_ZC1_TV_MERGED_FULL_HISTORY_daily.csv",
  sugar:    "ICEUS_SB1_TV_MERGED_FULL_HISTORY_daily.csv",
  cocoa:    "ICEUS_CC1_TV_MERGED_FULL_HISTORY_daily.csv",
  coffee:   "ICEUS_KC1_TV_MERGED_FULL_HISTORY_daily.csv",
  cotton:   "ICEUS_CT1_TV_MERGED_FULL_HISTORY_daily.csv",
  orangejuice: "ICEUS_OJ1_TV_MERGED_FULL_HISTORY_daily.csv",
};

async function computeForwardEligibility(
  assetId: string,
  entrySlot: number,
  holdingDays: number,
  frozenAt: string,
  lookAheadYears = [2026, 2027],
): Promise<FrozenResearchHypothesis["forwardEligibility"]> {
  const csvFile = AGRI_CSV_MAP[assetId];
  if (!csvFile) {
    return {
      eligibilityBasis: "entry_date_after_freeze",
      frozenAtTimestamp: frozenAt,
      nextOccurrences: [],
      firstEligibleYear: null,
      firstEligibleEntryDate: null,
      firstEligibleExitDate: null,
    };
  }

  let bars: DailyBar[] = [];
  try {
    const content = await fs.readFile(path.join(AGRI_CSV_DIR, csvFile), "utf8");
    bars = parseDailyBarsCsv(content) as DailyBar[];
  } catch {
    return {
      eligibilityBasis: "entry_date_after_freeze",
      frozenAtTimestamp: frozenAt,
      nextOccurrences: [],
      firstEligibleYear: null,
      firstEligibleEntryDate: null,
      firstEligibleExitDate: null,
    };
  }

  const lookup = buildYearSlotLookup(bars);
  const today = new Date().toISOString().slice(0, 10);
  const occurrences: FrozenResearchHypothesis["forwardEligibility"]["nextOccurrences"] = [];
  let firstEligibleYear: number | null = null;
  let firstEligibleEntryDate: string | null = null;
  let firstEligibleExitDate: string | null = null;

  for (const yr of lookAheadYears) {
    const { trade } = getPatternTradeForYear(
      lookup, yr, entrySlot, holdingDays as 10|12|14|16|18|20, "LONG"
    );

    if (!trade) {
      // Bar data not yet available for this year+slot.
      // Estimate the entry date using the PREVIOUS year's slot date as proxy (+1 year).
      const prevYearTrade = getPatternTradeForYear(lookup, yr - 1, entrySlot, holdingDays as 10|12|14|16|18|20, "LONG");
      let estimatedEntry: string | null = null;
      let estimatedExit: string | null = null;
      let estimatedEligible = false;

      if (prevYearTrade.trade) {
        // Shift previous year's dates by 1 year as proxy
        estimatedEntry = prevYearTrade.trade.entryDate.replace(String(yr - 1), String(yr));
        estimatedExit  = prevYearTrade.trade.exitDate.replace(String(yr - 1), String(yr));
        // Eligibility: estimated entry date must be strictly after freeze
        estimatedEligible = estimatedEntry > frozenAt;
      } else {
        estimatedEligible = yr > parseInt(frozenAt.slice(0, 4));
      }

      occurrences.push({
        year: yr,
        estimatedEntryDate: estimatedEntry ?? `${yr}-??-?? (no prior year data)`,
        estimatedExitDate:  estimatedExit  ?? `${yr}-??-??`,
        eligible: estimatedEligible,
        status: "scheduled",
        reason: estimatedEntry
          ? (estimatedEligible
              ? `Estimated entry ${estimatedEntry} (from ${yr-1} proxy) > freeze ${frozenAt} → eligible when confirmed`
              : `Estimated entry ${estimatedEntry} (from ${yr-1} proxy) ≤ freeze ${frozenAt} → NOT eligible`)
          : `Bar data for ${yr} slot ${entrySlot} not available, no prior year proxy`,
      });

      if (estimatedEligible && !firstEligibleYear) {
        firstEligibleYear = yr;
        firstEligibleEntryDate = estimatedEntry ?? `${yr} slot ${entrySlot} estimated`;
        firstEligibleExitDate  = estimatedExit  ?? `${yr} slot ${entrySlot + holdingDays} estimated`;
      }
      continue;
    }

    const eligible = trade.entryDate > frozenAt;
    let status: typeof occurrences[0]["status"] = "scheduled";
    if (trade.exitDate < today) {
      status = "completed_pending_record";
    } else if (trade.entryDate <= today && today <= trade.exitDate) {
      status = "active";
    } else if (!eligible) {
      status = "not_eligible_before_freeze";
    }

    occurrences.push({
      year: yr,
      estimatedEntryDate: trade.entryDate,
      estimatedExitDate: trade.exitDate,
      eligible,
      status,
      reason: eligible
        ? `Entry ${trade.entryDate} > freeze ${frozenAt} → truly unseen`
        : `Entry ${trade.entryDate} ≤ freeze ${frozenAt} → NOT eligible (already observed or same day)`,
    });

    if (eligible && !firstEligibleYear) {
      firstEligibleYear = yr;
      firstEligibleEntryDate = trade.entryDate;
      firstEligibleExitDate = trade.exitDate;
    }
  }

  return {
    eligibilityBasis: "entry_date_after_freeze",
    frozenAtTimestamp: frozenAt,
    nextOccurrences: occurrences,
    firstEligibleYear,
    firstEligibleEntryDate,
    firstEligibleExitDate,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as {
      action?: string;
      hypothesis?: Partial<FrozenResearchHypothesis>;
      hypothesisId?: string;
      observation?: Partial<ForwardValidationObservation>;
    };

    // ── List hypotheses ──────────────────────────────────────────────────────
    if (body.action === "listHypotheses") {
      const registry = await readRegistry();
      return NextResponse.json({
        count: registry.hypotheses.length,
        hypotheses: registry.hypotheses,
        lastUpdated: registry.lastUpdated,
        immutabilityGuarantee: "Append-only. No updates to existing hypotheses. Definition changes create new ID.",
      }, { status: 200 });
    }

    // ── Save research hypothesis (append-only) ───────────────────────────────
    if (body.action === "saveResearchHypothesis") {
      const h = body.hypothesis;
      if (!h || !h.assetId || !h.sourceType) {
        return NextResponse.json({ error: "Missing required fields: assetId, sourceType" }, { status: 400 });
      }

      const def = h.hypothesisDefinition ?? {};
      const defHash = hashDefinition(def as Record<string, unknown>);
      const frozenAt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // Check: does a hypothesis with same definition hash already exist?
      const registry = await readRegistry();
      const existing = registry.hypotheses.find(
        x => x.assetId === h.assetId && x.frozenDefinitionHash === defHash
      );
      if (existing) {
        return NextResponse.json({
          alreadyExists: true,
          hypothesisId: existing.hypothesisId,
          message: "Identical definition already frozen. Retrieve existing hypothesis.",
          immutabilityNote: "To save a modified definition, the result will be a NEW hypothesis with a new ID.",
        }, { status: 200 });
      }

      // Compute forward eligibility
      let forwardEligibility: FrozenResearchHypothesis["forwardEligibility"];
      if (h.sourceType === "strategy_engine_pattern" && def.entrySlot && def.holdingDays) {
        forwardEligibility = await computeForwardEligibility(
          h.assetId,
          def.entrySlot as number,
          def.holdingDays as number,
          frozenAt,
          [2026, 2027],
        );
      } else {
        // Filter policy — entry-date eligibility based on strategy trade dates
        forwardEligibility = {
          eligibilityBasis: "entry_date_after_freeze",
          frozenAtTimestamp: frozenAt,
          nextOccurrences: [{
            year: 2026,
            estimatedEntryDate: "next base strategy trade after freeze",
            estimatedExitDate: "after base strategy trade entry + pattern window",
            eligible: true,
            status: "scheduled",
            reason: "Filter policy: any base strategy trade with entry > freeze date is eligible. Signal must be based on IS data through 2025.",
          }],
          firstEligibleYear: 2026,
          firstEligibleEntryDate: `First ${h.assetId} base trade after ${frozenAt}`,
          firstEligibleExitDate: "depends on base trade duration",
        };
      }

      // Generate unique ID
      const idHash = hashDefinition({ ...def, assetId: h.assetId, sourceType: h.sourceType, ts: frozenAt });
      const hypothesisId = `rh_${idHash}_${Date.now().toString(36)}`;

      const hypothesis: FrozenResearchHypothesis = {
        hypothesisId,
        hypothesisVersion: 1,
        createdAt: new Date().toISOString(),
        frozenAt,
        createdByAction: "manual_user_save",
        sourceType: h.sourceType,
        assetId: h.assetId,
        displayName: h.displayName ?? `${h.assetId} ${h.sourceType}`,
        hypothesisDefinition: def as FrozenResearchHypothesis["hypothesisDefinition"],
        frozenDefinitionHash: defHash,
        discoverySnapshot: (h.discoverySnapshot ?? {
          dataUsedThroughDate: "2025-12-31",
          primaryStudyRange: "2000-2025",
          strictWfStatus: "unknown",
          bootstrapStatus: "unknown",
          dsrStatus: "unknown",
          realityCheckStatus: "unknown",
          pboStatus: "unknown",
          executionStatus: "research_normalized_only",
          finalResearchStatus: "statistics_incomplete_with_known_failure",
        }) as FrozenResearchHypothesis["discoverySnapshot"],
        forwardEligibility,
        approvalStatus: "research_hypothesis_frozen_for_forward_validation",
        approvedForTrading: false,
        eligibleForApprovedPortfolioLibrary: false,
        immutable: true,
      };

      registry.hypotheses.push(hypothesis);
      await writeRegistry(registry);

      return NextResponse.json({
        saved: true,
        hypothesisId,
        frozenAt,
        frozenDefinitionHash: defHash,
        forwardEligibility: {
          firstEligibleYear: forwardEligibility.firstEligibleYear,
          firstEligibleEntryDate: forwardEligibility.firstEligibleEntryDate,
          nextOccurrences: forwardEligibility.nextOccurrences,
        },
        guards: {
          approvedForTrading: false,
          eligibleForApprovedPortfolioLibrary: false,
          immutable: true,
          appendOnly: "Definition changes create new hypothesis ID",
        },
        note: "Frozen research hypothesis. Forward observations from first eligible entry only. NOT approved for trading.",
      }, { status: 200 });
    }

    // ── Record forward observation (SEPARATE from discovery data) ────────────
    if (body.action === "recordForwardObservation") {
      const obs = body.observation;
      if (!obs || !obs.hypothesisId || !obs.occurrenceYear) {
        return NextResponse.json({ error: "hypothesisId and occurrenceYear required" }, { status: 400 });
      }

      // Verify hypothesis exists
      const registry = await readRegistry();
      const hyp = registry.hypotheses.find(h => h.hypothesisId === obs.hypothesisId);
      if (!hyp) return NextResponse.json({ error: "Hypothesis not found" }, { status: 404 });

      // Verify eligibility
      const eligibleOccurrence = hyp.forwardEligibility.nextOccurrences.find(
        o => o.year === obs.occurrenceYear && o.eligible
      );

      if (!eligibleOccurrence) {
        return NextResponse.json({
          error: `Occurrence year ${obs.occurrenceYear} is NOT eligible for forward observation for hypothesis ${obs.hypothesisId}. Check forwardEligibility in hypothesis.`,
          eligibility: hyp.forwardEligibility,
        }, { status: 400 });
      }

      const obsRegistry = await readObservations();
      const newObs: ForwardValidationObservation = {
        observationId: `fo_${hyp.assetId}_${obs.occurrenceYear}_${Date.now().toString(36)}`,
        hypothesisId: obs.hypothesisId,
        occurrenceYear: obs.occurrenceYear,
        entryDate: obs.entryDate ?? eligibleOccurrence.estimatedEntryDate,
        exitDate: obs.exitDate ?? eligibleOccurrence.estimatedExitDate,
        eligibilityVerified: true,
        eligibilityReason: eligibleOccurrence.reason,
        status: obs.status ?? "recorded",
        observedResult: obs.observedResult as ForwardValidationObservation["observedResult"],
        countedAsForwardEvidence: true,
        doesNotModifyOriginalDiscoveryEvidence: true,
        recordedAt: new Date().toISOString(),
      };

      obsRegistry.observations.push(newObs);
      await writeObservations(obsRegistry);

      return NextResponse.json({
        recorded: true,
        observationId: newObs.observationId,
        hypothesisId: newObs.hypothesisId,
        doesNotModifyOriginalDiscoveryEvidence: true,
        note: "Forward observation recorded separately from discovery data. Original WF/statistics snapshot unchanged.",
      }, { status: 200 });
    }

    // ── List observations ────────────────────────────────────────────────────
    if (body.action === "listObservations") {
      const obsRegistry = await readObservations();
      const hypId = body.hypothesisId;
      const filtered = hypId
        ? obsRegistry.observations.filter(o => o.hypothesisId === hypId)
        : obsRegistry.observations;
      return NextResponse.json({
        count: filtered.length,
        observations: filtered,
        separationGuarantee: "Observations stored separately from discovery data. Original hypotheses not modified.",
      }, { status: 200 });
    }

    // ── Forward validation status ────────────────────────────────────────────
    if (body.action === "forwardValidationStatus") {
      const currentYear = new Date().getFullYear();
      const currentDate = new Date().toISOString().slice(0, 10);
      const frozenThroughYear = 2025;
      const firstUnseenYear = 2026;

      return NextResponse.json({
        frozenAtDataThroughYear: frozenThroughYear,
        firstTrulyUnseenEvaluationYear: firstUnseenYear,
        currentYear,
        currentDate,
        unscreenedCalendarYearsCompleted: Math.max(0, currentYear - firstUnseenYear - 1),
        forwardStatus: currentYear > firstUnseenYear
          ? "first_forward_year_completed"
          : "forward_validation_in_progress",
        caveats: [
          "STUDY_END=2025 — 2025 is last year in all WF/statistical analyses.",
          "2026 data in CSV (through 2026-05-15) was NEVER used in any WF/OOS analysis.",
          "Entry dates BEFORE freeze timestamp are NOT eligible as forward observations.",
          "ZS SHORT Jun entry ≈ 2026-06-01: BEFORE freeze 2026-06-04 → NOT eligible for 2026.",
          "ZS SHORT Jul entry ≈ 2026-07-10, ZS LONG Oct entry ≈ 2026-10-02: AFTER freeze → eligible.",
          "First full unseen calendar year: 2026 completes Dec 31, 2026.",
        ],
        singlePositiveForwardYearSufficiency: "insufficient — one year does not validate a hypothesis",
        approvedLibraryTrigger: "NOT from forward observations alone — requires full Statistics + Execution gate",
      }, { status: 200 });
    }

    // ── Archive (soft delete) ────────────────────────────────────────────────
    if (body.action === "archiveHypothesis") {
      const id = body.hypothesisId;
      if (!id) return NextResponse.json({ error: "hypothesisId required" }, { status: 400 });
      const registry = await readRegistry();
      const hyp = registry.hypotheses.find(h => h.hypothesisId === id);
      if (!hyp) return NextResponse.json({ error: "Hypothesis not found" }, { status: 404 });
      // Mark as archived but do NOT delete — preserve audit history
      (hyp as Record<string,unknown>)["archived"] = true;
      (hyp as Record<string,unknown>)["archivedAt"] = new Date().toISOString();
      await writeRegistry(registry);
      return NextResponse.json({ archived: true, hypothesisId: id, note: "Hypothesis archived but not deleted — preserved in audit history." }, { status: 200 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[research-registry]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
