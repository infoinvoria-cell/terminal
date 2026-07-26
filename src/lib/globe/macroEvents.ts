// Curated schedule of high-impact macro events (UTC). FOMC/ECB use published
// 2026 dates; NFP is the first Friday of each month. Shared by the Economic
// Calendar and the Session Brief. Update the rows periodically.

export type MacroEvent = { iso: string; type: string; label: string; region: string; impact: string[] };

export const MACRO_EVENTS: MacroEvent[] = [
  { iso: "2026-07-29T18:00:00Z", type: "fomc", label: "FOMC Rate Decision", region: "US", impact: ["ES1!", "NQ1!", "GC1!", "6E1!"] },
  { iso: "2026-08-07T12:30:00Z", type: "nfp", label: "US Non-Farm Payrolls", region: "US", impact: ["ES1!", "GC1!", "6E1!"] },
  { iso: "2026-08-12T12:30:00Z", type: "cpi", label: "US CPI (approx.)", region: "US", impact: ["GC1!", "6E1!", "ES1!"] },
  { iso: "2026-09-04T12:30:00Z", type: "nfp", label: "US Non-Farm Payrolls", region: "US", impact: ["ES1!", "GC1!", "6E1!"] },
  { iso: "2026-09-10T12:15:00Z", type: "ecb", label: "ECB Rate Decision", region: "EU", impact: ["6E1!", "FDAX1!"] },
  { iso: "2026-09-16T18:00:00Z", type: "fomc", label: "FOMC Rate Decision", region: "US", impact: ["ES1!", "NQ1!", "GC1!", "6E1!"] },
  { iso: "2026-10-02T12:30:00Z", type: "nfp", label: "US Non-Farm Payrolls", region: "US", impact: ["ES1!", "GC1!", "6E1!"] },
  { iso: "2026-10-29T13:15:00Z", type: "ecb", label: "ECB Rate Decision", region: "EU", impact: ["6E1!", "FDAX1!"] },
  { iso: "2026-10-28T18:00:00Z", type: "fomc", label: "FOMC Rate Decision", region: "US", impact: ["ES1!", "NQ1!", "GC1!", "6E1!"] },
  { iso: "2026-12-09T19:00:00Z", type: "fomc", label: "FOMC Rate Decision", region: "US", impact: ["ES1!", "NQ1!", "GC1!", "6E1!"] },
];

export const MACRO_TYPE_ICON: Record<string, string> = { fomc: "🏛", ecb: "🏛", nfp: "👷", cpi: "📊", gdp: "📈", boj: "🏯" };

/** Next upcoming macro event (or null), with ms until it starts. */
export function nextMacroEvent(now: number): (MacroEvent & { ms: number }) | null {
  const upcoming = MACRO_EVENTS.map((e) => ({ ...e, ms: new Date(e.iso).getTime() - now }))
    .filter((e) => e.ms > -3 * 3600 * 1000)
    .sort((a, b) => a.ms - b.ms);
  return upcoming[0] ?? null;
}
