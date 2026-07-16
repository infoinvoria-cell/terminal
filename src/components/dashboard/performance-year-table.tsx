"use client";

import { useMemo } from "react";
import {
  buildPerformanceYearTable,
  deserializeTrades,
  type SerializedTrade,
} from "@/lib/trades-analytics";

type PerformanceYearTableProps = {
  trades: SerializedTrade[];
};

function CellPct({ v }: { v: number | null }) {
  if (v === null) {
    return <span className="text-zinc-600">—</span>;
  }
  const str =
    v.toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + "%";
  if (v < 0) {
    return <span className="tabular-nums text-rose-300/80">{str}</span>;
  }
  return <span className="tabular-nums text-zinc-200">{str}</span>;
}

function CellTotal({ v }: { v: number | null }) {
  if (v === null) {
    return <span className="text-zinc-600">—</span>;
  }
  const str =
    v.toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + "%";
  return (
    <span className="font-semibold tabular-nums text-amber-200/95">{str}</span>
  );
}

export function PerformanceYearTable({ trades }: PerformanceYearTableProps) {
  const rows = useMemo(() => deserializeTrades(trades), [trades]);
  const table = useMemo(() => buildPerformanceYearTable(rows), [rows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-[11px] [font-family:var(--font-montserrat),sans-serif]">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <th className="sticky left-0 z-10 bg-[#141517] py-2 pr-3">Year</th>
            {table.monthHeaders.map((m) => (
              <th key={m} className="px-1 py-2 text-center font-semibold">
                {m}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-semibold text-amber-200/90">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="[font-family:var(--font-nunito),sans-serif]">
          {table.rows.map((r) => (
            <tr key={r.year} className="border-t border-white/[0.05]">
              <td className="sticky left-0 z-10 bg-gradient-to-b from-[#1c1d20] to-[#141517] py-1.5 pr-3 text-xs font-semibold text-white">
                {r.year}
              </td>
              {r.months.map((v, i) => (
                <td key={i} className="px-1 py-1.5 text-center">
                  <CellPct v={v} />
                </td>
              ))}
              <td className="px-2 py-1.5 text-right">
                <CellTotal v={r.yearTotal} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex shrink-0 justify-end border-t border-white/[0.06] pt-2 text-xs">
        <span className="text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
          Total Return
        </span>
        <span className="ml-3 min-w-[4.5rem] text-right text-sm font-bold text-amber-200/95 [font-family:var(--font-nunito),sans-serif]">
          {table.bookTotalReturnPct.toLocaleString("de-DE", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
          %
        </span>
      </div>
    </div>
  );
}
