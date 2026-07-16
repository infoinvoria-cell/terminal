"use client";

type YearPoint = { year: number };

function yearRuns(points: YearPoint[]): { year: number; n: number }[] {
  const runs: { year: number; n: number }[] = [];
  for (const p of points) {
    const last = runs[runs.length - 1];
    if (last && last.year === p.year) last.n += 1;
    else runs.push({ year: p.year, n: 1 });
  }
  return runs;
}

type ChartYearBandsProps = {
  data: YearPoint[];
  /** Hide when each bucket is already a year (1Y view). */
  enabled?: boolean;
};

export function ChartYearBands({ data, enabled = true }: ChartYearBandsProps) {
  if (!enabled || data.length === 0) return null;
  const runs = yearRuns(data);
  if (runs.length === 0) return null;

  return (
    <div className="mt-0.5 flex h-6 w-full min-w-0 px-0.5">
      {runs.map((r, i) => (
        <div
          key={`${r.year}-${i}`}
          className="flex min-w-0 items-center justify-center"
          style={{ flex: r.n }}
        >
          <div className="h-px min-w-[6px] flex-1 bg-gradient-to-r from-transparent via-zinc-500/30 to-transparent" />
          <span className="shrink-0 px-1 text-[10px] font-medium tabular-nums text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
            {r.year}
          </span>
          <div className="h-px min-w-[6px] flex-1 bg-gradient-to-l from-transparent via-zinc-500/30 to-transparent" />
        </div>
      ))}
    </div>
  );
}
