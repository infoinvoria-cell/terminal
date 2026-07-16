import type { RebalanceEvent } from "@/lib/fsportfolio/types";

export function rebalanceEventsToJson(events: RebalanceEvent[]) {
  return JSON.stringify(events, null, 2);
}

export function rebalanceEventsToCsv(events: RebalanceEvent[]) {
  const header = [
    "date",
    "portfolioValue",
    "turnover",
    "transactionCostPct",
    "transactionCostAmount",
    "whiteSwanSignal",
    "status",
    "comment",
  ];
  const rows = events.map((event) =>
    [
      event.date,
      event.portfolioValue,
      event.turnover,
      event.transactionCostPct,
      event.transactionCostAmount,
      event.whiteSwanSignal,
      event.status,
      `"${event.comment.replace(/"/g, '""')}"`,
    ].join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
