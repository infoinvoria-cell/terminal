import { CORE_INVEST_SOURCES, loadSignalSources, SIGNAL_SOURCE_FILTERS, WHITE_SWAN_SOURCES } from "@/lib/signals/signal-source-adapter";
import { loadIntradaySignalCards, loadIntradaySignalPreviews } from "@/lib/signals/intraday-signal-cards";
import type { SignalPageModel, SignalPageSectionGroup } from "@/lib/signals/signal-types";

const WHITE_SWAN_GROUPS: SignalPageSectionGroup[] = [
  { id: "valuation", title: "Valuation", cards: [] },
  { id: "macro", title: "Macro", cards: [] },
  { id: "seasonal", title: "Seasonal", cards: [] },
];

const CORE_INVEST_GROUPS: SignalPageSectionGroup[] = [
  { id: "core_strategy", title: "Core Invest Strategies", cards: [] },
  { id: "research_validation", title: "Research / Validation", cards: [] },
];

const INTRADAY_GROUPS: SignalPageSectionGroup[] = [
  { id: "intraday_mt", title: "Intraday MT (v1.2)", cards: [] },
];

function groupCards(
  groups: SignalPageSectionGroup[],
  cards: SignalPageModel["cards"],
) {
  return groups.map((group) => ({
    ...group,
    cards: cards.filter((card) => card.category === group.id),
  }));
}

function latestUpdate(dates: Array<string | undefined>): string | null {
  const values = dates.filter((value): value is string => Boolean(value)).sort();
  return values.at(-1) ?? null;
}

export async function getSignalPageModel(): Promise<SignalPageModel> {
  const rows = await loadSignalSources();
  const intradayCards = loadIntradaySignalCards();
  const cards = [...rows.map((row) => row.card), ...intradayCards];
  const previews = { ...Object.fromEntries(rows.map((row) => [row.card.id, row.preview])), ...loadIntradaySignalPreviews() };
  const whiteSwanCards = cards.filter((card) => card.group === "white_swan");
  const coreInvestCards = cards.filter((card) => card.group === "core_invest");
  const intradayGroupCards = cards.filter((card) => card.group === "intraday");

  return {
    pageMeta: {
      title: "Live Signals",
      label: "Signal",
      subtitle: "Research / monitoring only · no live execution · no broker connection",
      lastUpdate: latestUpdate(cards.map((card) => card.signalDate)),
      dataStatus: cards.some((card) => card.dataStatus === "ok") ? "Live sources connected" : "Partial source coverage",
      mode: "Research only",
    },
    sections: [
      {
        id: "white_swan",
        title: "White Swan",
        subtitle: "Valuation · Macro · Seasonal",
        filters: [...SIGNAL_SOURCE_FILTERS],
        groups: groupCards(WHITE_SWAN_GROUPS, whiteSwanCards),
      },
      {
        id: "core_invest",
        title: "Core Invest",
        subtitle: "QQQ Pine · Copper/HG · CHF/6S · Research",
        filters: [...SIGNAL_SOURCE_FILTERS],
        groups: groupCards(CORE_INVEST_GROUPS, coreInvestCards),
      },
      {
        id: "intraday",
        title: "Intraday MT",
        subtitle: "DAX 2H · DAX 1H · Euro 30M · Futures · v1.2",
        filters: [...SIGNAL_SOURCE_FILTERS],
        groups: groupCards(INTRADAY_GROUPS, intradayGroupCards),
      },
    ],
    cards,
    previews,
    renderAudit: [
      {
        area: "Signal Route",
        file: "src/app/signal/page.tsx",
        current: "/signal server route active",
        target: "keep render path unchanged",
      },
      {
        area: "Signal Page Component",
        file: "src/components/pages/SignalPage.tsx",
        current: "old split White Swan left / Core Invest right",
        target: "single left signal column + right preview column",
      },
      {
        area: "Signal Data Source",
        file: "src/lib/signals/signal-source-adapter.ts",
        current: `${WHITE_SWAN_SOURCES.length + CORE_INVEST_SOURCES.length} mapped live sources`,
        target: "central adapter with shared card + preview model",
      },
      {
        area: "Right Preview",
        file: "src/components/pages/SignalPage.tsx",
        current: "missing",
        target: "chart + tester + KPI stack using monitoring components",
      },
    ],
  };
}
