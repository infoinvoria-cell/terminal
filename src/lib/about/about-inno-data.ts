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
  id: "tactical" | "strategic";
  title: string;
  badge: string;
  badgeTone: InnoStatusTone;
  rows: { key: string; value: string; source: string }[];
};

export type InnoTableRow = Record<string, string>;

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
    value: "Taeglich / 1D",
    sub: "Tactical Haltedauer 1-30 Tage",
    tone: "zinc",
    source: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md",
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

export const INNO_STRATEGY_CARDS: InnoStrategyCard[] = [
  {
    id: "tactical",
    title: "White Swan Tactical",
    badge: "Historischer Tactical-Track-Record belegt",
    badgeTone: "gold",
    rows: [
      { key: "Ziel", value: "Kurzfristiger systematischer Futures-/FX-Handel", source: "17_Haftungsdach_QA/Haftungsdach Meeting Brief.md" },
      { key: "Status", value: "Statement-basiert; institutsfest noch offen", source: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md" },
      { key: "Datenart", value: "Live-Report + interne Production-Registry", source: "04_Track_Record/Performance Source Register.md" },
      { key: "Tradingfrequenz", value: "Taeglich (1D)", source: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md" },
      { key: "Haltedauer", value: "1-30 Tage je Sleeve", source: "src/lib/about/about-data.ts" },
      { key: "Anzahl Assets", value: "35 aktive Entries / 29 Instrumente", source: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md" },
      { key: "Parallele Positionen", value: "Mehrere parallel; exakte Obergrenze nicht gefunden", source: "Nicht gefunden" },
      { key: "Track-Record-Status", value: "11.04.2024 bis 01.07.2026 statement-basiert", source: "04_Track_Record/Performance Report.pdf" },
      { key: "Geplante Gewichtung", value: "Neue Strategien mit geringer Startgewichtung; Sleeve-Gewichte offen", source: "Auftragsvorgabe + Formales Strategiedokument Institut.md" },
      { key: "Offene Pruefungen", value: "Rohdaten, Kosten, Audit, IBKR-Parity", source: "17_Haftungsdach_QA/Haftungsdach Missing Evidence List.md" },
    ],
  },
  {
    id: "strategic",
    title: "White Swan Strategic",
    badge: "Kein vollstaendiger Live-Track-Record",
    badgeTone: "blue",
    rows: [
      { key: "Ziel", value: "Langfristiges Portfolio mit ETF-/Asset-Allokationen", source: "Auftragsvorgabe" },
      { key: "Status", value: "Research / Forward / Backtest; separat zu pruefen", source: "17_Haftungsdach_QA/Formales Strategiedokument Institut.md" },
      { key: "Datenart", value: "Backtest / Forward / intern geplant", source: "16_Backtesting_Validation/Backtesting Source Inventory.md" },
      { key: "Tradingfrequenz", value: "Niedriger; Rebalancing-orientiert", source: "Auftragsvorgabe" },
      { key: "Haltedauer", value: "Wochen bis Monate", source: "src/lib/about/about-data.ts" },
      { key: "Anzahl Assets", value: "ca. 6-8 Assets plus ETF-Allokationen", source: "Auftragsvorgabe" },
      { key: "Parallele Positionen", value: "ca. 4 aktive Positionen; mehrere parallel", source: "Auftragsvorgabe" },
      { key: "Track-Record-Status", value: "Tactical-Track-Record darf nicht uebertragen werden", source: "Auftragsvorgabe" },
      { key: "Geplante Gewichtung", value: "Zielgewichte, Liquiditaetsquote und Rebalancing noch zu finalisieren", source: "Auftragsvorgabe" },
      { key: "Offene Pruefungen", value: "Asset-Set, Live-Setup, regulatorische Einordnung", source: "17_Haftungsdach_QA/Haftungsdach Questions To Ask.md" },
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

export const INNO_IBKR_ROWS: InnoTableRow[] = [
  {
    instrument: "QQQ",
    product: "ETF",
    venue: "NASDAQ / IBKR-Pruefung offen",
    contract: "Aktie/ETF-Stueckelung",
    margin: "Nicht gefunden",
    status: "Geplant - technische und regulatorische Pruefung mit INNO/CTO erforderlich",
    source: "Auftragsvorgabe",
  },
  {
    instrument: "DAX-Kontrakt",
    product: "Futures",
    venue: "EUREX naheliegend; final offen",
    contract: "Nicht gefunden",
    margin: "Nicht gefunden",
    status: "Geplant - technische und regulatorische Pruefung mit INNO/CTO erforderlich",
    source: "Auftragsvorgabe; 07_Technology/IBKR Umsetzung.md",
  },
  {
    instrument: "6E",
    product: "FX Future",
    venue: "CME / IBKR-Pruefung offen",
    contract: "Nicht gefunden",
    margin: "Nicht gefunden",
    status: "Geplant - technische und regulatorische Pruefung mit INNO/CTO erforderlich",
    source: "Auftragsvorgabe; 07_Technology/IBKR Umsetzung.md",
  },
  {
    instrument: "6B",
    product: "FX Future",
    venue: "CME / IBKR-Pruefung offen",
    contract: "Nicht gefunden",
    margin: "Nicht gefunden",
    status: "Geplant - technische und regulatorische Pruefung mit INNO/CTO erforderlich",
    source: "Auftragsvorgabe; 07_Technology/IBKR Umsetzung.md",
  },
];

export const INNO_MEETING_BRIEF: string[] = [
  "Capitalife moechte zwei getrennte Portfolios pruefen und spaeter umsetzen.",
  "White Swan Tactical besitzt einen belegten, aber statement-basierten historischen Track Record.",
  "White Swan Strategic ist eine separate langfristige Strategie ohne vollstaendigen Live-Track-Record.",
  "Historische Tactical-Ergebnisse basieren teilweise auf CFD-Ausfuehrung und duerfen nicht ungeprueft in das regulierte Zielmodell uebertragen werden.",
  "Zielplattform ist IBKR, aber Account-Struktur, API und regulatorische Zulaessigkeit sind offen.",
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
];

export const INNO_SOURCE_REGISTER: InnoSourceRef[] = [
  {
    label: "Performance Report.pdf",
    path: "04_Track_Record/Performance Report.pdf",
    period: "11.04.2024 bis 01.07.2026",
    updated: "2026-07-01",
    quality: "Sekundaerquelle; einzige zulaessige externe Quelle",
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
    label: "Source Quality Matrix.md",
    path: "00_Index/Source Quality Matrix.md",
    period: "Stand 2026-07-05",
    updated: "2026-07-05",
    quality: "Quelltrennungsregel / Dossier-Eignung",
  },
];
