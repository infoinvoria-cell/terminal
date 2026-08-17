import type { PhysicalCommodity, PhysicalObservation } from "../types";

const BASE_URL = "https://www.star.nesdis.noaa.gov/smcd/emb/vci/VH/get_TS_admin.php";
const PROCESSING_VERSION = "NOAA-STAR-Blended-VHP-GC_current-weekly-4km";
const STATE_IDS = {
  corn: [14, 15, 16, 24, 28, 36, 42, 50],
  soy: [14, 15, 16, 24, 28, 36, 42, 50],
  wheat: [17, 28, 35, 37, 42],
} as const;
const STATE_NAMES: Record<number, string> = {
  14: "Illinois", 15: "Indiana", 16: "Iowa", 17: "Kansas", 24: "Minnesota", 28: "Nebraska",
  35: "North Dakota", 36: "Ohio", 37: "Oklahoma", 42: "South Dakota", 50: "Wisconsin",
};

type Row = { stateId: number; year: number; week: number; vhi: number };

function cropTag(commodity: Exclude<PhysicalCommodity, "CRUDE">): string {
  return commodity === "SOY" ? "SOYB" : commodity === "WHEAT" ? "WHEA" : "CORN";
}

function parseRows(text: string, stateId: number): Row[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d{4}),\s*(\d{1,2}),\s*[-\d.]+,\s*[-\d.]+,\s*[-\d.]+,\s*[-\d.]+,\s*([-\d.]+)/);
    if (!match) return [];
    const year = Number(match[1]);
    const week = Number(match[2]);
    const vhi = Number(match[3]);
    return Number.isFinite(year) && Number.isFinite(week) && Number.isFinite(vhi) && vhi >= 0
      ? [{ stateId, year, week, vhi }]
      : [];
  });
}

function unavailable(componentId: "zc_seasonal" | "zs_seasonal" | "zw_mzw", commodity: Exclude<PhysicalCommodity, "CRUDE">, retrievalTimestamp: string, error: string): PhysicalObservation {
  return {
    componentId, commodity, provider: "NOAA STAR", dataset: "Blended Vegetation Health Product", variable: "VHI",
    regionIds: [commodity === "CORN" ? "us_corn_belt" : commodity === "SOY" ? "us_soy_production" : "us_wheat_production"],
    observationTimestamp: null, publicationTimestamp: null, earliestKnownTimestamp: null, retrievalTimestamp,
    processingVersion: PROCESSING_VERSION, revisionStatus: "UNKNOWN", rawInputs: {}, normalizedInputs: {}, score: null,
    confidence: 0, state: "UNAVAILABLE", status: "UNAVAILABLE", freshnessHours: null, staleAfterHours: 24 * 14,
    accessClass: "FREE_NO_ACCOUNT", sourceUrl: BASE_URL, error,
  };
}

export async function fetchNoaaVhpObservation(
  componentId: "zc_seasonal" | "zs_seasonal" | "zw_mzw",
  commodity: Exclude<PhysicalCommodity, "CRUDE">,
  retrievalTimestamp = new Date().toISOString(),
): Promise<PhysicalObservation> {
  const ids = STATE_IDS[commodity === "CORN" ? "corn" : commodity === "SOY" ? "soy" : "wheat"];
  try {
    const rows: Row[] = [];
    for (const stateId of ids) {
      const url = `${BASE_URL}?provinceID=${stateId}&country=USA&yearlyTag=Weekly&type=Mean&TagCropland=${cropTag(commodity)}&year1=2025&year2=2026`;
      const response = await fetch(url, { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`NOAA STAR ${response.status} for ${STATE_NAMES[stateId] ?? stateId}`);
      rows.push(...parseRows(await response.text(), stateId));
    }
    const latest = Math.max(...rows.map((row) => row.year * 100 + row.week));
    const year = Math.floor(latest / 100);
    const week = latest % 100;
    const current = rows.filter((row) => row.year === year && row.week === week);
    const prior = rows.filter((row) => row.year === year - 1 && row.week === week);
    if (!current.length || !prior.length) throw new Error(`NOAA STAR no same-week comparison for ${year}-W${week}`);
    const currentVhi = current.reduce((sum, row) => sum + row.vhi, 0) / current.length;
    const priorVhi = prior.reduce((sum, row) => sum + row.vhi, 0) / prior.length;
    const deviation = currentVhi - priorVhi;
    const score = Math.max(-100, Math.min(100, deviation * 2));
    const state = score <= -20 ? "CONTRADICTORY" : score >= 20 ? "SUPPORTIVE" : "NEUTRAL";
    return {
      componentId, commodity, provider: "NOAA STAR", dataset: "Blended Vegetation Health Product", variable: "VHI",
      regionIds: [commodity === "CORN" ? "us_corn_belt" : commodity === "SOY" ? "us_soy_production" : "us_wheat_production"],
      observationTimestamp: `${year}-W${String(week).padStart(2, "0")}`, publicationTimestamp: null,
      earliestKnownTimestamp: `${year}-W${String(week).padStart(2, "0")}`, retrievalTimestamp,
      processingVersion: PROCESSING_VERSION, revisionStatus: "UNKNOWN",
      rawInputs: { states: current.length, currentMeanVhi: Number(currentVhi.toFixed(3)), priorYearMeanVhi: Number(priorVhi.toFixed(3)), year, week },
      normalizedInputs: { vhiDeviation: Number(deviation.toFixed(3)) }, score, confidence: current.length / ids.length,
      state, status: "AVAILABLE", freshnessHours: null, staleAfterHours: 24 * 14,
      accessClass: "FREE_NO_ACCOUNT", sourceUrl: BASE_URL,
    };
  } catch (error) {
    return unavailable(componentId, commodity, retrievalTimestamp, error instanceof Error ? error.message : "NOAA STAR request failed");
  }
}
