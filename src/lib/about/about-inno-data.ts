import { CORE_INVEST_MODEL } from "@/lib/core-invest/core-invest-model";

export type InnoStatusTone = "gold" | "blue" | "red" | "zinc";

export type InnoSourceRef = {
  label: string;
  path: string;
  period?: string;
  quality?: string;
  updated?: string;
};

export type InnoMetric = {
  label: string;
  value: string;
  sub?: string;
  tone?: InnoStatusTone;
  source: string;
  calculation?: string;
  limitation?: string;
};

export type InnoStrategyCard = {
  id: "tactical" | "strategic" | "core-invest";
  title: string;
  badge: string;
  badgeTone: InnoStatusTone;
  rows: { key: string; value: string; source: string }[];
};

export type InnoTableRow = Record<string, string>;

export type InnoHeroMetric = {
  label: string;
  value: string;
  sub: string;
  source: string;
};

export type InnoSeasonalPatternEvidence = {
  id: string;
  pattern: string;
  found: boolean;
  status: string;
  source: string;
  calculationAvailable: boolean;
  walkForwardAvailable: boolean;
  productionReady: boolean;
};

export type InnoIbkrReadinessRow = {
  strategy: string;
  instrument: string;
  productType: string;
  symbol: string;
  conId: string;
  exchange: string;
  currency: string;
  lotSize: string;
  fractional: string;
  marketData: string;
  orderType: string;
  status: string;
  openReview: string;
};

export const INNO_MODES = [
  { id: "overview", label: "Bibel" },
  { id: "inno", label: "INNO Vorbereitung" },
] as const;

export type AboutMode = (typeof INNO_MODES)[number]["id"];

export const INNO_OVERVIEW_METRICS: InnoMetric[] = [
  {
    label: "Tactical Track Record",
    value: "Statement-basiert",
    sub: "11.04.2024 bis 01.07.2026",
    tone: "gold",
    source: "04_Track_Record/Performance Report.pdf",
    limitation: "Nicht unabhaengig auditiert; Rohdaten fehlen.",
  },
  {
    label: "Strategic Track Record",
    value: "Kein voller Live-Record",
    sub: "separat zu pruefen",
    tone: "red",
    source: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md",
    limitation: "Backtests und Forward-Tracking sind kein externer Track Record.",
  },
  {
    label: "Tradingfrequenz",
    value: "Intraday bis mehrere Wochen",
    sub: "1D-only-Altstand ersetzt; Frequenz im Zielmodell nicht einheitlich",
    tone: "zinc",
    source: "Capitalife_Strategy_Bible/INNO_Preparation/02_White_Swan_Tactical.md; 02_Strategy/White Swan/White_Swan_v1.1_Portfolio.md; src/lib/components/ws-strategy-data.ts",
  },
  {
    label: "Mindestanlagesumme",
    value: "Nicht gefunden",
    sub: "interne Entscheidung noetig",
    tone: "red",
    source: "Nicht gefunden",
    limitation: "Im geprueften Material nicht belegt.",
  },
  {
    label: "IBKR-Status",
    value: "Offen",
    sub: "keine aktive Integration",
    tone: "red",
    source: "07_Technology/IBKR Umsetzung.md",
    limitation: "Account, API und Paper-Setup noch offen.",
  },
  {
    label: "Offene Datenpunkte",
    value: "20",
    sub: "Missing Evidence List",
    tone: "red",
    source: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md",
    calculation: "Listeintraege 1-20.",
  },
  {
    label: "Offene Entscheidungen",
    value: "9",
    sub: "vor Institutsgespraech",
    tone: "red",
    source: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md",
    calculation: "Tabelle 'Offene Punkte vor Institut-Gespraechen'.",
  },
  {
    label: "CTO-Gespraech",
    value: "Nicht bereit",
    sub: "Daten und Brokerfragen offen",
    tone: "red",
    source: "17_Haftungsdach_QA/Haftungsdach Meeting Brief.md",
  },
];

export const INNO_HERO_METRICS: InnoHeroMetric[] = [
  {
    label: "Tactical Track Record",
    value: "11.04.2024 bis 01.07.2026",
    sub: "Statement-basiert",
    source: "04_Track_Record/Performance Report.pdf",
  },
  {
    label: "Tactical Struktur",
    value: "Intraday bis mehrere Wochen",
    sub: "Aktives Zielmodell != alter 1D-/35-Entry-Stand",
    source: "Capitalife_Strategy_Bible/INNO_Preparation/02_White_Swan_Tactical.md; 02_Strategy/White Swan/White_Swan_v1.1_Portfolio.md; src/lib/components/ws-strategy-data.ts",
  },
  {
    label: "Mindestanlagesumme",
    value: "Nicht gefunden",
    sub: "interne Entscheidung noetig",
    source: "Nicht gefunden",
  },
  {
    label: "Status White Swan Strategic",
    value: "Kein vollstaendiger Live-Track-Record",
    sub: "nur Planungs-, Backtest- und Forward-Stand",
    source: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md",
  },
];

export const INNO_STRATEGY_CARDS: InnoStrategyCard[] = [
  {
    id: "tactical",
    title: "White Swan Tactical",
    badge: "Historischer Tactical-Track-Record belegt",
    badgeTone: "gold",
    rows: [
      { key: "Ziel", value: "Taktisches White-Swan-Portfolio mit separatem historischem Tactical-Track-Record und aktuellem Zielmodell ohne CFDs", source: "Capitalife_Strategy_Bible/INNO_Preparation/02_White_Swan_Tactical.md; Capitalife_Strategy_Bible/INNO_Preparation/07_INNO_CTO_Meeting_Brief.md" },
      { key: "Status", value: "Historischer Echtgeld-Record belegt; aktuelles Zielmodell nur intern als Paper-/Forward-/Research-Stand dokumentiert", source: "Capitalife_Strategy_Bible/INNO_Preparation/02_White_Swan_Tactical.md; 02_Strategy/White Swan/White_Swan_v1.1_Portfolio.md; 02_Strategy/White Swan/White_Swan_Forward_Log.md" },
      { key: "Datenart", value: "Statement-basierter Tactical-Live-Record plus getrennte interne Portfolio- und Forward-Quellen", source: "04_Track_Record/Performance Report.pdf; 00_Index/Source Quality Matrix.md; 02_Strategy/White Swan/White_Swan_Forward_Log.md" },
      { key: "Tradingfrequenz", value: "Widerspruch: aktuelles Zielmodell enthaelt Intraday- und mehrtaegige/mehrwoechige Komponenten; 1D-only ist Altstand", source: "Capitalife_Strategy_Bible/INNO_Preparation/02_White_Swan_Tactical.md; 02_Strategy/White Swan/White_Swan_v1.1_Portfolio.md; src/lib/components/ws-strategy-data.ts" },
      { key: "Haltedauer", value: "Intraday bis mehrere Wochen; fruehere 1-30-Tage-Angabe ist nicht mehr allein massgeblich", source: "Capitalife_Strategy_Bible/INNO_Preparation/02_White_Swan_Tactical.md; 02_Strategy/White Swan/White_Swan_v1.1_Portfolio.md; src/lib/components/ws-strategy-data.ts" },
      { key: "Anzahl Assets", value: "Widerspruch offen: 22 Strategien in WS v1.1, 6 aktive Sleeves in WS v1.3; 35 aktive Entries / 29 Instrumente ist nur historisches Global-Universum", source: "02_Strategy/White Swan/White_Swan_v1.1_Portfolio.md; src/lib/components/ws-strategy-data.ts; 17_Haftungsdach_QA/Formales Strategiedokument Institut.md" },
      { key: "Parallele Positionen", value: "Mehrere parallel; Forward Log zeigt 3 offene Positionen am 17.07.2026, harte Obergrenze nicht belegt", source: "02_Strategy/White Swan/White_Swan_Forward_Log.md" },
      { key: "Track-Record-Status", value: "11.04.2024 bis 01.07.2026 statement-basiert", source: "04_Track_Record/Performance Report.pdf" },
      { key: "Geplante Gewichtung", value: "Aktuell widerspruechlich: WS v1.1 Paper 40/30/15/15 nach Pillars; WS v1.3 aktiv 55% Intraday / 45% Anomaly", source: "02_Strategy/White Swan/White_Swan_v1.1_Portfolio.md; src/lib/components/ws-strategy-data.ts" },
      { key: "Instrumententypen", value: "Historischer Tactical-Record teils CFD-/Altbroker-basiert; Zielmodell ohne CFDs, mit IBKR-handelbaren Futures/ETFs", source: "Capitalife_Strategy_Bible/INNO_Preparation/02_White_Swan_Tactical.md; Capitalife_Strategy_Bible/INNO_Preparation/06_IBKR_Technical_Setup.md" },
      { key: "Offene Pruefungen", value: "Rohdaten, Kosten, Audit, IBKR-Parity", source: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md" },
    ],
  },
  {
    id: "strategic",
    title: "White Swan Strategic",
    badge: "Kein vollstaendiger Live-Track-Record",
    badgeTone: "blue",
    rows: [
      { key: "Ziel", value: "Separates langfristiges Portfolio mit Rebalancing und zusaetzlichen ETF-Allokationen", source: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md" },
      { key: "Status", value: "Research / Forward / Backtest; separate INNO-Pruefung erforderlich", source: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md; Capitalife_Strategy_Bible/INNO_Preparation/07_INNO_CTO_Meeting_Brief.md" },
      { key: "Datenart", value: "Planungs-, Backtest- und Forward-Stand; kein eigener externer Live-Nachweis gefunden", source: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md" },
      { key: "Tradingfrequenz", value: "Niedriger; rebalancing-orientiert", source: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md" },
      { key: "Haltedauer", value: "Wochen bis laenger; genauer Haltehorizont nicht final dokumentiert", source: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md" },
      { key: "Anzahl Assets", value: "Asset-Set offen; fruehere 6-8-Asset-Annahme bleibt nur Arbeitsannahme", source: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md" },
      { key: "Parallele Positionen", value: "Mehrere parallele Positionen vorgesehen; exakte Anzahl nicht belegt", source: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md" },
      { key: "Track-Record-Status", value: "Tactical-Track-Record darf nicht uebertragen werden", source: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md" },
      { key: "Geplante Gewichtung", value: "Zielgewichte, ETF-Beimischung und Rebalancing noch offen", source: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md" },
      { key: "Instrumententypen", value: "Langfristige Allokationen plus ETFs geplant; finales Instrumentenset offen", source: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md" },
      { key: "Offene Pruefungen", value: "Asset-Set, Live-Setup, regulatorische Einordnung", source: "17_Haftungsdach_QA/Haftungsdach Questions To Ask.md" },
    ],
  },
  {
    id: "core-invest",
    title: "Core Invest",
    badge: `${CORE_INVEST_MODEL.version} eingefroren - ${CORE_INVEST_MODEL.statusLabel}`,
    badgeTone: "red",
    rows: [
      { key: "Ziel", value: `Langfristiges ${CORE_INVEST_MODEL.components.length}-Komponenten-Portfolio aus 80% ETF-Core und 20% regelbasierten Long/Cash-Sleeves`, source: "src/data/capitalife/core-invest.config.json" },
      { key: "Status", value: "Zielgewichte eingefroren; Aggregat-Backtest, Rolling Walk-Forward und Live-Betrieb nicht freigegeben", source: "src/lib/core-invest/core-invest-model.ts; public/generated/core-invest/parity-report.json" },
      { key: "Datenart", value: `${CORE_INVEST_MODEL.validation.historicalSeriesReady} historische Asset-Reihen plus ${CORE_INVEST_MODEL.validation.parityPending} TradingView-Strategiereferenzen; ${CORE_INVEST_MODEL.validation.liveReadyComponents}/8 live-bereit`, source: "public/generated/core-invest/parity-report.json" },
      { key: "Tradingfrequenz", value: "Quartalsweises Portfolio-Rebalancing; Strategy-Sleeves handeln regelbasiert long/cash", source: "src/data/capitalife/core-invest.config.json" },
      { key: "Haltedauer", value: "ETF-Core langfristig; Sleeve-Haltedauer erst nach Trade-Parity belastbar", source: "src/lib/core-invest/core-invest-model.ts" },
      { key: "Anzahl Assets", value: "8 Komponenten: QQQ, GLD, SPMO, SPY sowie QQQ Pine 1, QQQ Pine 2 EMA, Copper/HG und CHF/6S", source: "src/lib/core-invest/core-invest-model.ts" },
      { key: "Parallele Positionen", value: "Zielmodell bis zu 8 Komponenten; aktuelle echte Positionen nicht angebunden", source: "src/lib/core-invest/core-invest-model.ts" },
      { key: "Track-Record-Status", value: "Kein Live-Track-Record; abgelehnte Aggregatreferenz darf nicht als OOS-validiert dargestellt werden", source: "src/data/capitalife/core-invest-paper.config.json" },
      { key: "Geplante Gewichtung", value: "QQQ 45%, GLD 25%, SPMO 5%, SPY 5%, vier Strategy-Sleeves je 5%", source: "src/data/capitalife/core-invest.config.json" },
      { key: "Instrumententypen", value: "ETFs und Futures-Referenzen; konkrete IBKR Contracts, conIds und Größenlogik offen", source: "src/lib/core-invest/core-invest-model.ts" },
      { key: "Offene Pruefungen", value: "Trade-by-Trade-Parität, Kosten/Rebalancing, Walk-Forward, Futures-Rolls, IBKR-Mapping und echte Live-Daten", source: "docs/audits/core-invest-finalization-2026-07-30.md" },
    ],
  },
];

export const INNO_TRACK_RECORD_ROWS: InnoTableRow[] = [
  {
    portfolio: "White Swan Tactical",
    zeitraum: "11.04.2024 bis 01.07.2026",
    broker: "Nicht eindeutig belegt; Darwinex/Myfxbook nur als Verweis",
    kontotyp: "Nicht gefunden",
    echtgeldstatus: "Statement-basiert belegt",
    performance: "97.2% Combined Return / 114.6% compounded",
    annualisierung: "35.2% laut Report / 35.77% nachgerechnet",
    drawdown: "-11.76%",
    volatilitaet: "Nicht gefunden",
    sharpe: "1.60",
    sortino: "Nicht gefunden",
    calmar: "3.0",
    trefferquote: "Nicht gefunden",
    profitFactor: "1.28",
    besterMonat: "14.8%",
    schlechtesterMonat: "-5.8%",
    drawdownPhase: "Nicht gefunden",
    kostenstatus: "Nicht vollstaendig belegbar",
    datenqualitaet: "Sekundaerquelle; Rohdaten fehlen",
    source: "04_Track_Record/Performance Report.pdf; 04_Track_Record/Performance Metrics Summary.md",
  },
  {
    portfolio: "White Swan Strategic",
    zeitraum: "Nicht gefunden",
    broker: "Nicht gefunden",
    kontotyp: "Nicht gefunden",
    echtgeldstatus: "Kein vollstaendiger Live-Track-Record",
    performance: "Nicht gefunden",
    annualisierung: "Nicht gefunden",
    drawdown: "Nicht gefunden",
    volatilitaet: "Nicht gefunden",
    sharpe: "Nicht gefunden",
    sortino: "Nicht gefunden",
    calmar: "Nicht gefunden",
    trefferquote: "Nicht gefunden",
    profitFactor: "Nicht gefunden",
    besterMonat: "Nicht gefunden",
    schlechtesterMonat: "Nicht gefunden",
    drawdownPhase: "Nicht gefunden",
    kostenstatus: "Nicht gefunden",
    datenqualitaet: "Nur Research-/Planungsstand",
    source: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md",
  },
];

export const INNO_RISK_ROWS: InnoTableRow[] = [
  {
    topic: "Maximale Einzelposition",
    value: "Nicht gefunden",
    status: "Nicht gefunden",
    source: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md",
    note: "Formale Risikopolitik fehlt.",
  },
  {
    topic: "Maximale Gesamtallokation",
    value: "Nicht gefunden",
    status: "Nicht gefunden",
    source: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md",
    note: "Mit Institut zu definieren.",
  },
  {
    topic: "Maximale parallele Positionen",
    value: "Nicht gefunden",
    status: "Nicht gefunden",
    source: "Nicht gefunden",
    note: "Im geprueften Material keine explizite Obergrenze.",
  },
  {
    topic: "Tages-/Wochen-/Monatsverlustlimit",
    value: "Nicht gefunden",
    status: "Nicht gefunden",
    source: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md",
    note: "Formale Limits fehlen.",
  },
  {
    topic: "Maximaler Drawdown",
    value: "-11.76% historischer Tactical Report",
    status: "Live belegt",
    source: "04_Track_Record/Performance Report.pdf",
    note: "Nicht als formale Risikogrenze dokumentiert.",
  },
  {
    topic: "Hebel / Stop-Loss / Kill-Switch / Ausfallregeln",
    value: "Nicht gefunden",
    status: "Pruefung durch INNO erforderlich",
    source: "17_Haftungsdach_QA/Haftungsdach Questions To Ask.md",
    note: "Technische und regulatorische Definition offen.",
  },
];

export const INNO_COST_ROWS: InnoTableRow[] = [
  {
    item: "Spreads / Kommissionen / Swaps / Brokerkosten historisch",
    status: "Nicht vollstaendig belegt",
    detail: "Performance Report zeigt Netto-/Bruttologik nicht vollstaendig nachrechenbar.",
    source: "04_Track_Record/Performance Source Register.md",
  },
  {
    item: "Management Fee / Performance Fee",
    status: "Nicht gefunden",
    detail: "Keine belastbare Gebuehrenstruktur im geprueften Material.",
    source: "Nicht gefunden",
  },
  {
    item: "Historisch tatsaechlich enthaltene Gebuehren",
    status: "Teilweise belegbar",
    detail: "Performance Report als Sekundaerquelle vorhanden, aber ohne Rohdaten nicht aufschluesselbar.",
    source: "04_Track_Record/Performance Source Register.md",
  },
  {
    item: "Zukuenftige Gebuehren im IBKR-/Institutsmodell",
    status: "Offen",
    detail: "IBKR-Kommissionen und Boersengebuehren noch zu pruefen.",
    source: "07_Technology/IBKR Umsetzung.md; 04_Strategies/Agrar/Agrar Go Live Gates v2.0.md",
  },
];

export const INNO_IBKR_ROWS: InnoIbkrReadinessRow[] = [
  ibkrRow("White Swan Tactical", "QQQ", "ETF", "QQQ", "Noch festzulegen", "USD", "ETF-Stückelung offen"),
  ibkrRow("White Swan Tactical", "DAX-Kontrakt", "Future", "Kontraktmonat offen", "EUREX / Mapping offen", "EUR", "Multiplikator und Verfall offen"),
  ibkrRow("White Swan Tactical", "Euro FX", "FX Future", "6E", "CME / Mapping offen", "USD", "Multiplikator und Verfall offen"),
  ibkrRow("White Swan Tactical", "British Pound", "FX Future", "6B", "CME / Mapping offen", "USD", "Multiplikator und Verfall offen"),
  ibkrRow("Core Invest / QQQ Passive", "QQQ", "ETF", "QQQ", "Noch festzulegen", "USD", "ETF-Stückelung offen"),
  ibkrRow("Core Invest / GLD", "GLD", "ETF", "GLD", "Noch festzulegen", "USD", "ETF-Stückelung offen"),
  ibkrRow("Core Invest / SPMO", "SPMO", "ETF", "SPMO", "Noch festzulegen", "USD", "ETF-Stückelung offen"),
  ibkrRow("Core Invest / SPY", "SPY", "ETF", "SPY", "Noch festzulegen", "USD", "ETF-Stückelung offen"),
  ibkrRow("Core Invest / QQQ Pine 1", "QQQ", "ETF", "QQQ", "Noch festzulegen", "USD", "ETF-Stückelung offen"),
  ibkrRow("Core Invest / QQQ Pine 2 EMA", "QQQ", "ETF", "QQQ", "Noch festzulegen", "USD", "ETF-Stückelung offen"),
  ibkrRow("Core Invest / Copper", "Copper", "Future", "HG (kein Continuous Contract)", "COMEX / Mapping offen", "Offen", "Multiplikator, Verfall und Roll offen"),
  ibkrRow("Core Invest / CHF", "Swiss Franc", "FX Future", "6S (kein Continuous Contract)", "CME / Mapping offen", "Offen", "Multiplikator, Verfall und Roll offen"),
];

export const INNO_SEASONAL_PATTERNS: InnoSeasonalPatternEvidence[] = [
  seasonalEvidence("fdax1_sea", "FDAX1! M11D15 Long", "src/lib/components/ws-strategy-data.ts", true),
  seasonalEvidence("ct1_sea", "CT1! M01D03 Long", "src/lib/components/ws-strategy-data.ts", true),
  seasonalEvidence("oj1_sea", "OJ1! M06D28 Long", "src/lib/components/ws-strategy-data.ts", false),
  seasonalEvidence("sb1_sea_s", "SB1! M02D25 Short", "src/lib/components/ws-strategy-data.ts", true),
  seasonalEvidence("es1_sea", "ES1! M11D15 Long", "src/lib/components/ws-strategy-data.ts", true),
  seasonalEvidence("sb1_sea_l", "SB1! M09D24 Long", "src/lib/components/ws-strategy-data.ts", false),
  seasonalEvidence("zc1_sea", "ZC1! M03D29 Long", "src/lib/components/ws-strategy-data.ts", true),
  missingSeasonalEvidence("expected_missing_8", "Erwartetes Muster 8 (nicht spezifiziert)"),
  missingSeasonalEvidence("expected_missing_9", "Erwartetes Muster 9 (nicht spezifiziert)"),
  missingSeasonalEvidence("expected_missing_10", "Erwartetes Muster 10 (nicht spezifiziert)"),
];

function ibkrRow(
  strategy: string,
  instrument: string,
  productType: string,
  symbol: string,
  exchange: string,
  currency: string,
  lotSize: string,
): InnoIbkrReadinessRow {
  return {
    strategy,
    instrument,
    productType,
    symbol,
    conId: "Nicht belegt",
    exchange,
    currency,
    lotSize,
    fractional: "Nicht belegt",
    marketData: "Berechtigung offen",
    orderType: "Noch festzulegen",
    status: "Nicht produktionsbereit",
    openReview: "Contract-Mapping, Marktdaten, Orderregeln, regulatorische und CTO-Prüfung offen",
  };
}

function seasonalEvidence(
  id: string,
  pattern: string,
  source: string,
  walkForwardAvailable: boolean,
): InnoSeasonalPatternEvidence {
  return {
    id,
    pattern,
    found: true,
    status: "Research / weiterer Forward-Test",
    source,
    calculationAvailable: true,
    walkForwardAvailable,
    productionReady: false,
  };
}

function missingSeasonalEvidence(id: string, pattern: string): InnoSeasonalPatternEvidence {
  return {
    id,
    pattern,
    found: false,
    status: "Datenlücke",
    source: "Keine prüfbare Repository-, Branch- oder Graphify-Evidenz gefunden",
    calculationAvailable: false,
    walkForwardAvailable: false,
    productionReady: false,
  };
}

export const INNO_MEETING_BRIEF: string[] = [
  "Capitalife moechte zwei getrennte Portfolios pruefen und spaeter umsetzen.",
  "White Swan Tactical besitzt einen belegten, aber statement-basierten historischen Track Record.",
  "White Swan Strategic ist eine separate langfristige Strategie ohne vollstaendigen Live-Track-Record.",
  "Historische Tactical-Ergebnisse basieren teilweise auf CFD-Ausfuehrung und duerfen nicht ungeprueft in das regulierte Zielmodell uebertragen werden.",
  "Der alte 1D-/35-Entry-Stand ist nicht mehr deckungsgleich mit den neueren White-Swan-Portfolioquellen.",
  "Aktuelle interne White-Swan-Portfoliostaende widersprechen sich teilweise: WS v1.1 zeigt 22 Paper-Strategien, WS v1.3 zeigt 6 aktive Sleeves.",
  "Core Invest v2.0 umfasst acht Zielkomponenten; vier Strategy-Sleeves besitzen nur TradingView-Referenzen und keine exakte Engine-Paritaet.",
  "Von zehn erwarteten White-Swan-Saisonmustern sind sieben als Research-Evidenz auffindbar; drei bleiben unspezifizierte Datenluecken.",
  "Zielplattform ist IBKR, aber Account-Struktur, API und regulatorische Zulaessigkeit sind offen.",
  "Die produktive Supabase-Migration und Persistenz der historischen Basis sind nicht verifiziert.",
  "Maschinenlesbare Rohdaten, Auditierung, Kosten- und Risikodokumentation fehlen noch.",
];

export const INNO_DATA_GAPS_ROWS: InnoTableRow[] = [
  {
    aussage: "Maschinenlesbare Broker-Statements",
    wert: "Nicht gefunden",
    status: "Nicht gefunden",
    datenart: "Track Record Rohdaten",
    quelle: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md",
    dateipfad: "04_Track_Record/Broker Statements/",
    verwendbar: "Nein",
    pruefung: "Joris",
  },
  {
    aussage: "Vollstaendige Trade-Liste",
    wert: "Nicht gefunden",
    status: "Nicht gefunden",
    datenart: "Track Record Rohdaten",
    quelle: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md",
    dateipfad: "04_Track_Record/Raw Data/Trade Lists/",
    verwendbar: "Nein",
    pruefung: "Joris",
  },
  {
    aussage: "Tactical Annualisierung",
    wert: "35.2% laut Report / 35.77% nachgerechnet",
    status: "Widerspruechlich",
    datenart: "Kennzahl / Berechnung",
    quelle: "04_Track_Record/Performance Metrics Summary.md",
    dateipfad: "04_Track_Record/Performance Metrics Summary.md",
    verwendbar: "Nur mit Hinweis",
    pruefung: "Methodik abstimmen",
  },
  {
    aussage: "Strategic Live Track Record",
    wert: "Kein vollstaendiger Live-Track-Record",
    status: "Intern geplant",
    datenart: "Portfolio-Status",
    quelle: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md",
    dateipfad: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md",
    verwendbar: "Ja, als Negativabgrenzung",
    pruefung: "Klare Trennung im Gespraech",
  },
  {
    aussage: "Tactical Portfolio-Struktur",
    wert: "22 Strategien in WS v1.1 vs. 6 aktive Sleeves in WS v1.3",
    status: "Widerspruechlich",
    datenart: "Portfolio-Konfiguration",
    quelle: "02_Strategy/White Swan/White_Swan_v1.1_Portfolio.md; src/lib/components/ws-strategy-data.ts",
    dateipfad: "02_Strategy/White Swan/White_Swan_v1.1_Portfolio.md; src/lib/components/ws-strategy-data.ts",
    verwendbar: "Nur mit Hinweis",
    pruefung: "White Swan Zielmodell finalisieren",
  },
  {
    aussage: "IBKR-Account / API",
    wert: "Nicht eingerichtet",
    status: "Pruefung durch INNO erforderlich",
    datenart: "Technik / Broker",
    quelle: "07_Technology/IBKR Umsetzung.md",
    dateipfad: "07_Technology/IBKR Umsetzung.md",
    verwendbar: "Ja, als offener Punkt",
    pruefung: "CTO + Institut",
  },
  {
    aussage: "Formale Risikopolitik",
    wert: "Nicht gefunden",
    status: "Nicht gefunden",
    datenart: "Risk Governance",
    quelle: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md",
    dateipfad: "06_Risk_Management/",
    verwendbar: "Nein",
    pruefung: "Joris / Institut",
  },
  {
    aussage: "Core Invest Aggregat-Backtest",
    wert: "Engine-Paritaet fuer 4 von 8 Komponenten fehlt",
    status: "Blockiert",
    datenart: "Backtest / Walk Forward",
    quelle: "public/generated/core-invest/parity-report.json",
    dateipfad: "public/generated/core-invest/parity-report.json",
    verwendbar: "Nur als Negativabgrenzung",
    pruefung: "Trade-Exports und kanonische Engine bereitstellen",
  },
];

export const INNO_SOURCE_REGISTER: InnoSourceRef[] = [
  {
    label: "Core Invest v2.0 Model",
    path: "src/lib/core-invest/core-invest-model.ts",
    period: "eingefroren 2026-07-20",
    updated: "2026-07-30",
    quality: "Kanonische Zielallokation und Validierungsstatus; keine Performancequelle",
  },
  {
    label: "Core Invest Configuration",
    path: "src/data/capitalife/core-invest.config.json",
    period: "IS ab 2000 / OOS ab 2019 als Forschungsdesign",
    updated: "2026-07-20",
    quality: "8-Komponenten-Konfiguration; Status validation_failed_not_live",
  },
  {
    label: "Core Invest Parity Report",
    path: "public/generated/core-invest/parity-report.json",
    period: "datenquellenabhängig",
    updated: "2026-07-30",
    quality: "4 passive Komponenten ready; 4 Strategy-Sleeves nur TV-Referenz; Aggregat nicht live-ready",
  },
  {
    label: "Performance Report.pdf",
    path: "04_Track_Record/Performance Report.pdf",
    period: "11.04.2024 bis 01.07.2026",
    updated: "2026-07-01",
    quality: "Sekundaerquelle; einzige zulaessige externe Quelle",
  },
  {
    label: "02_White_Swan_Tactical.md",
    path: "Capitalife_Strategy_Bible/INNO_Preparation/02_White_Swan_Tactical.md",
    period: "11.04.2024 bis 01.07.2026 fuer den Track Record; aktueller Dossierstand 2026-07",
    updated: "2026-07",
    quality: "INNO-Dossier; Tactical-Abgrenzung und CFD-zu-Zielmodell-Trennung sind hier massgeblich",
  },
  {
    label: "03_White_Swan_Strategic.md",
    path: "Capitalife_Strategy_Bible/INNO_Preparation/03_White_Swan_Strategic.md",
    period: "Strategic Planungsstand",
    updated: "2026-07",
    quality: "INNO-Dossier; einzige klare Strategic-Abgrenzung ohne Live-Track-Record",
  },
  {
    label: "White_Swan_v1.1_Portfolio.md",
    path: "02_Strategy/White Swan/White_Swan_v1.1_Portfolio.md",
    period: "OOS 2019-2026; Stand 2026-07-17",
    updated: "2026-07-17",
    quality: "Frozen final paper portfolio; 22 Strategien, 40/30/15/15-Pillar-Gewichte",
  },
  {
    label: "White_Swan_Forward_Log.md",
    path: "02_Strategy/White Swan/White_Swan_Forward_Log.md",
    period: "Forward Tracking ab 2026-07-17",
    updated: "2026-07-17",
    quality: "Paper-only Forward Log; belegt mehrere parallele Positionen, aber keinen Live-Track-Record",
  },
  {
    label: "ws-strategy-data.ts",
    path: "src/lib/components/ws-strategy-data.ts",
    period: "Stand 2026-07-29",
    updated: "2026-07-29",
    quality: "Aktueller Terminal-Stand fuer WS v1.3 Active Portfolio; 6 aktive Sleeves, Aggregate nicht validiert",
  },
  {
    label: "Performance Metrics Summary.md",
    path: "04_Track_Record/Performance Metrics Summary.md",
    period: "11.04.2024 bis 01.07.2026",
    updated: "2026-07-05",
    quality: "Interne Pruefdatei; zeigt Abweichungen",
  },
  {
    label: "Performance Source Register.md",
    path: "04_Track_Record/Performance Source Register.md",
    period: "diverse",
    updated: "2026-07-05",
    quality: "Quellenregister / Sekundaerzusammenfassung",
  },
  {
    label: "Track Record Audit Status.md",
    path: "04_Track_Record/Track Record Audit Status.md",
    period: "Audit-Stand",
    updated: "2026-07-05",
    quality: "Interne Audit-Zusammenfassung",
  },
  {
    label: "Formales Strategiedokument Institut.md",
    path: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md",
    period: "Stand 2026-07-05",
    updated: "2026-07-05",
    quality: "Interner Entwurf; Due-Diligence-Struktur",
  },
  {
    label: "Haftungsdach Meeting Brief.md",
    path: "17_Haftungsdach_QA/Haftungsdach Meeting Brief.md",
    period: "Stand 2026-07-05",
    updated: "2026-07-05",
    quality: "Interner Gespraechsleitfaden",
  },
  {
    label: "Haftungsdach Missing Evidence List.md",
    path: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md",
    period: "Stand 2026-07-05",
    updated: "2026-07-05",
    quality: "Gap-Liste; hoch relevant fuer CTO/Institut",
  },
  {
    label: "IBKR Umsetzung.md",
    path: "07_Technology/IBKR Umsetzung.md",
    period: "Planungsstand",
    updated: "nicht explizit angegeben",
    quality: "Technik-Planung; keine aktive Integration",
  },
  {
    label: "06_IBKR_Technical_Setup.md",
    path: "Capitalife_Strategy_Bible/INNO_Preparation/06_IBKR_Technical_Setup.md",
    period: "Planungsstand",
    updated: "2026-07",
    quality: "INNO-Dossier; listet QQQ, DAX, 6E und 6B nur als vorlaeufige Zielinstrumente",
  },
  {
    label: "07_INNO_CTO_Meeting_Brief.md",
    path: "Capitalife_Strategy_Bible/INNO_Preparation/07_INNO_CTO_Meeting_Brief.md",
    period: "CTO-Vorbereitung",
    updated: "2026-07",
    quality: "INNO-Dossier; verbindliche Kommunikationsgrenzen fuer Tactical, Strategic und IBKR",
  },
  {
    label: "Source Quality Matrix.md",
    path: "00_Index/Source Quality Matrix.md",
    period: "Stand 2026-07-05",
    updated: "2026-07-05",
    quality: "Quelltrennungsregel / Dossier-Eignung",
  },
];
