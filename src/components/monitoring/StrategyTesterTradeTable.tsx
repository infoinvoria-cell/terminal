"use client";

import type { StrategyTradeListRow } from "@/lib/monitoring/types";

type Props = {
  rows: StrategyTradeListRow[];
};

function num(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "-";
}

export default function StrategyTesterTradeTable({ rows }: Props) {
  return (
    <section className="st-section">
      <div className="st-section-title">Trade List</div>
      <div className="st-trade-table-wrap">
        <table className="st-trade-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Dir</th>
              <th>Entry Date</th>
              <th>Exit Date</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>P/L</th>
              <th>P/L %</th>
              <th>Bars</th>
              <th>Exit Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={`${row.index}-${row.entryDate}-${row.exitDate}`}>
                <td>{row.index}</td>
                <td className={row.direction === "long" ? "tone-pos" : "tone-neg"}>{row.direction}</td>
                <td>{row.entryDate}</td>
                <td>{row.exitDate}</td>
                <td>{num(row.entry)}</td>
                <td>{num(row.exit)}</td>
                <td className={row.pl >= 0 ? "tone-pos" : "tone-neg"}>{num(row.pl)}</td>
                <td className={row.plPercent >= 0 ? "tone-pos" : "tone-neg"}>{num(row.plPercent)}</td>
                <td>{row.bars}</td>
                <td>{row.exitReason}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={10} className="st-empty-row">No backtest data</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
