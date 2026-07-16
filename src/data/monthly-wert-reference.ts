/**
 * Authoritative monthly Wert% series from product spec (used for regression / docs).
 * Live chart uses CSV-derived buckets; values here match the stated INITIAL DATASET.
 */
export const MONTHLY_WERT_REFERENCE = [
  { label: "Apr 2024", wertPct: 2.13 },
  { label: "Mai", wertPct: 11.62 },
  { label: "Juni", wertPct: 2.49 },
  { label: "Juli", wertPct: 1.77 },
  { label: "Aug", wertPct: -0.05 },
  { label: "Sept", wertPct: -3.5 },
  { label: "Okt", wertPct: 5.96 },
  { label: "Nov", wertPct: -4.96 },
  { label: "Dez", wertPct: 2.74 },
  { label: "Jan 2025", wertPct: 10.56 },
  { label: "Feb", wertPct: 11.77 },
  { label: "Mär", wertPct: 1.06 },
  { label: "Apr", wertPct: -5.78 },
  { label: "Mai", wertPct: 0.36 },
  { label: "Juni", wertPct: 2.28 },
  { label: "Juli", wertPct: 2.8 },
  { label: "Aug", wertPct: -4.48 },
  { label: "Sept", wertPct: -0.92 },
  { label: "Okt", wertPct: -1.76 },
  { label: "Nov", wertPct: -2.56 },
  { label: "Dez", wertPct: 2.68 },
  { label: "Jan 2026", wertPct: 0.68 },
  { label: "Feb", wertPct: 12.0 },
  { label: "Mär", wertPct: 0.68 },
  { label: "Apr", wertPct: -2.76 },
] as const;
