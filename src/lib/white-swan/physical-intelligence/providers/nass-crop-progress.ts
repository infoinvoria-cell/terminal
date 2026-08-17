import { cropConditionScore, freshnessHours, resolvePhysicalStatus } from "../scoring";
import type { PhysicalObservation } from "../types";

const REPORT_URL = "https://www.nass.usda.gov/Publications/Todays_Reports/reports/prog3226.txt";
const REPORT_OBSERVATION = "2026-08-09T00:00:00.000Z";
const REPORT_PUBLICATION = "2026-08-10T20:00:00.000Z";
const PROCESSING_VERSION = "NASS-CROP-PROGRESS-prog3226-2026-08-10";

function aggregateCondition(text: string, heading: string): { current: number; previousYear: number; acreageCoverage: number } | null {
  const start = text.indexOf(heading);
  if (start < 0) return null;
  const end = text.indexOf("\n----------------------------------------------------------------------------", start + heading.length);
  const section = text.slice(start, end > start ? end + 3000 : start + 10000);
  const aggregate = section.match(/(?:18 States|U\.S\.)[^\n]*:\s+([\d-]+)\s+([\d-]+)\s+([\d-]+)\s+([\d-]+)\s+([\d-]+)/);
  const prior = section.match(/Previous year[^\n]*:\s+([\d-]+)\s+([\d-]+)\s+([\d-]+)\s+([\d-]+)\s+([\d-]+)/);
  if (!aggregate || !prior) return null;
  const current = Number(aggregate[4]) + Number(aggregate[5]);
  const previousYear = Number(prior[4]) + Number(prior[5]);
  if (![current, previousYear].every(Number.isFinite)) return null;
  const coverage = section.match(/planted\s+(\d+)%/i);
  return { current, previousYear, acreageCoverage: coverage ? Number(coverage[1]) : 0 };
}

function buildObservation(
  componentId: "zc_seasonal" | "zs_seasonal",
  commodity: "CORN" | "SOY",
  text: string,
  retrievalTimestamp: string,
): PhysicalObservation {
  const heading = commodity === "CORN" ? "Corn Condition - Selected States" : "Soybean Condition - Selected States";
  const condition = aggregateCondition(text, heading);
  if (!condition) {
    return unavailable(componentId, commodity, retrievalTimestamp, "aggregate condition row not found");
  }
  const score = cropConditionScore(condition.current, condition.previousYear);
  const age = freshnessHours(REPORT_OBSERVATION, new Date(retrievalTimestamp));
  const base: PhysicalObservation = {
    componentId, commodity, provider: "USDA NASS", dataset: "Crop Progress and Condition", variable: "good_plus_excellent_condition_deviation",
    regionIds: [commodity === "CORN" ? "us_corn_belt" : "us_soy_production"], observationTimestamp: REPORT_OBSERVATION,
    publicationTimestamp: REPORT_PUBLICATION, earliestKnownTimestamp: REPORT_PUBLICATION, retrievalTimestamp,
    processingVersion: PROCESSING_VERSION, revisionStatus: "INITIAL",
    rawInputs: { currentGoodExcellentPct: condition.current, priorYearGoodExcellentPct: condition.previousYear, acreageCoveragePct: condition.acreageCoverage },
    normalizedInputs: { conditionDeviationPct: condition.current - condition.previousYear }, score, confidence: condition.acreageCoverage / 100,
    status: "AVAILABLE", freshnessHours: age, staleAfterHours: 24 * 14, accessClass: "FREE", sourceUrl: REPORT_URL,
  };
  return { ...base, status: resolvePhysicalStatus(base) };
}

function unavailable(componentId: "zc_seasonal" | "zs_seasonal", commodity: "CORN" | "SOY", retrievalTimestamp: string, error: string): PhysicalObservation {
  return {
    componentId, commodity, provider: "USDA NASS", dataset: "Crop Progress and Condition", variable: "good_plus_excellent_condition_deviation",
    regionIds: [commodity === "CORN" ? "us_corn_belt" : "us_soy_production"], observationTimestamp: null, publicationTimestamp: null,
    earliestKnownTimestamp: null, retrievalTimestamp, processingVersion: PROCESSING_VERSION, revisionStatus: "UNKNOWN", rawInputs: {},
    normalizedInputs: {}, score: null, confidence: 0, status: "UNAVAILABLE", freshnessHours: null, staleAfterHours: 336,
    accessClass: "FREE", sourceUrl: REPORT_URL, error,
  };
}

export async function fetchNassCropObservations(retrievalTimestamp = new Date().toISOString()): Promise<PhysicalObservation[]> {
  try {
    const response = await fetch(REPORT_URL, { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`NASS ${response.status}`);
    const text = await response.text();
    return [buildObservation("zc_seasonal", "CORN", text, retrievalTimestamp), buildObservation("zs_seasonal", "SOY", text, retrievalTimestamp)];
  } catch (error) {
    const message = error instanceof Error ? error.message : "NASS request failed";
    return [unavailable("zc_seasonal", "CORN", retrievalTimestamp, message), unavailable("zs_seasonal", "SOY", retrievalTimestamp, message)];
  }
}
