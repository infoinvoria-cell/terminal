// Stub for globe port
export type SeasonalityData = { month: number; avgReturn: number };
export async function fetchSeasonality(_assetId: string): Promise<SeasonalityData[]> {
  return [];
}

export function seasonTone(direction: string | undefined): string {
  if (direction === "LONG") return "#e2ca7a";
  if (direction === "SHORT") return "#a1a1aa";
  return "#737373";
}
