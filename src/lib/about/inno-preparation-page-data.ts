export type InnoPrepStatus =
  | "READY"
  | "TEILWEISE"
  | "PROTOTYP"
  | "OFFEN"
  | "ZU KLAREN";

export type InnoPrepStatusStripItem = {
  title: string;
  status: InnoPrepStatus;
  note: string;
};

export type InnoPrepSimpleCard = {
  title: string;
  items: string[];
};

export type InnoPrepAnswerItem = {
  question: string;
  bullets: string[];
  keyInfo: string;
};

export type InnoPrepQuestionItem = {
  question: string;
  keyInfo: string;
};

export type InnoPrepPromptItem = InnoPrepAnswerItem | InnoPrepQuestionItem;

export type InnoPrepFactItem = {
  label: string;
  value: string;
};

export type InnoPrepTaskItem = {
  title: string;
  action: string;
};

export const INNO_PREP_STATUS_STRIP: InnoPrepStatusStripItem[] = [
  {
    title: "Strategie",
    status: "READY",
    note: "Dokumentiert und intern nachvollziehbar",
  },
  {
    title: "Track Record",
    status: "TEILWEISE",
    note: "Account 1 primär belegt, Gesamt-Scope offen",
  },
  {
    title: "Technik",
    status: "PROTOTYP",
    note: "Runtime vorhanden, produktive Integration offen",
  },
  {
    title: "CTO",
    status: "READY",
    note: "Gespräch fachlich vorbereitet",
  },
];

export const INNO_PREP_HAVE_CARD: InnoPrepSimpleCard = {
  title: "Was wir haben",
  items: [
    "Strategie + Ground Truth",
    "Performance Report",
    "Account 1: 444 Primär-Trades",
    "technische Runtime / Monitoring",
    "interne CTO-Vorbereitung",
  ],
};

export const INNO_PREP_MISSING_CARD: InnoPrepSimpleCard = {
  title: "Was noch fehlt",
  items: [
    "Gesamt-Track-Record konsolidieren",
    "vollständige Statements / Evidenz",
    "Gesamt-Kostenmethodik",
    "finale Institutslimits",
    "produktiver Broker/API-Pfad",
  ],
};

export const INNO_PREP_FLOW = ["Daten", "Signale", "Risiko", "Broker", "Monitoring"] as const;

export const INNO_PREP_ANSWER_PROMPTS: InnoPrepAnswerItem[] = [
  {
    question: "Was genau ist die Strategie?",
    bullets: [
      "systematische und regelbasierte Handelslogik",
      "Ground Truth und Strategielogik intern dokumentiert",
      "Tactical und Strategic fachlich getrennt",
    ],
    keyInfo: "Signale und Regeln sind systematisch definiert, nicht diskretionär.",
  },
  {
    question: "Welchen Track Record können wir belegen?",
    bullets: [
      "Performance Report: 11.04.2024–01.07.2026",
      "28 historische Monatswerte und Report-KPIs vorhanden",
      "Account 1: 444 geschlossene Primär-Trades",
    ],
    keyInfo: "Account 1 ist primär belegt; der Gesamt-Scope des Reports wird getrennt dargestellt.",
  },
  {
    question: "Welche Kosten sind berücksichtigt?",
    bullets: [
      "Account 1: Commission und Swap primär vorhanden",
      "Account 1 Commission: -33,79 EUR",
      "Gesamtmethodik für Spread, Slippage und externe Fees offen",
    ],
    keyInfo: "Account-1-Kosten sind teilweise primär belegt; daraus folgt nicht automatisch die Report-Kostenmethodik.",
  },
  {
    question: "Welche Risikologik existiert?",
    bullets: [
      "interne Risk-Logik und Monitoring-Bausteine vorhanden",
      "Position-, Exposure- und Drawdown-Ansätze intern vorbereitet",
      "produktive Institutslimits werden mit INNO festgelegt",
    ],
    keyInfo: "Interne Risk-Logik existiert; finale Institutslimits werden mit INNO abgestimmt.",
  },
  {
    question: "Was ist heute technisch vorhanden?",
    bullets: [
      "Capitalife Terminal als Arbeits- und Monitoring-Oberfläche",
      "Market-Data Runtime, Instrument Registry und Mapping",
      "Track-Record-, Monitoring- und Reporting-Bausteine",
    ],
    keyInfo: "Die technische Vorarbeit ist real vorhanden, aber noch kein final freigegebenes Produktions-Trading-System.",
  },
  {
    question: "Wie soll die produktive Umsetzung aussehen?",
    bullets: [
      "Daten → Signal → Risiko → Broker/Execution",
      "danach Reconciliation, Logging und Monitoring",
      "Broker/API, Hosting und Freigabemodell final mit INNO",
    ],
    keyInfo: "IBKR ist vorbereitetes Zielbild, aber nicht als bereits genehmigte INNO-Architektur dargestellt.",
  },
];

export const INNO_PREP_ANSWER_FACTS: InnoPrepFactItem[] = [
  { label: "Track-Record Report", value: "11.04.2024–01.07.2026" },
  { label: "Account 1", value: "444 geschlossene Trades" },
  { label: "Account 1 Win Rate", value: "35,59 %" },
  { label: "Account 1 Profit Factor", value: "1,1917" },
  { label: "Account 1 Ø Haltedauer", value: "4,16 h" },
  { label: "Account 1 Median", value: "1,30 h" },
  { label: "Report Annualisierung", value: "35,2 % p.a." },
  { label: "Interne Nachrechnung", value: "35,77 % p.a." },
];

export const INNO_PREP_INNO_PROMPTS: InnoPrepQuestionItem[] = [
  {
    question: "Welche Broker-/API-Struktur ist vorgesehen?",
    keyInfo: "Klärt Broker, Zuständigkeit und Integrationspfad.",
  },
  {
    question: "Welcher Automatisierungsgrad ist zulässig?",
    keyInfo: "Vollautomatisch, Batch oder Order-by-Order.",
  },
  {
    question: "Welche Orderfreigabe wird verlangt?",
    keyInfo: "Wer bestätigt Orders und wo liegt die Verantwortung?",
  },
  {
    question: "Welche Risikolimits erwartet INNO?",
    keyInfo: "Exposure, Drawdown, Sleeves, Stops, Kill Gates.",
  },
  {
    question: "Welche Evidenz/Kostenmethodik wird verlangt?",
    keyInfo: "Statements, Trades, Cashflows, Kosten, Audit-Tiefe.",
  },
  {
    question: "Was umfasst das IT-Projekt danach?",
    keyInfo: "Scope, Rollen, Hosting, Entwicklung, Prüfung, Go-Live.",
  },
];

export const INNO_PREP_TERM_TASKS: InnoPrepTaskItem[] = [
  {
    title: "Track-Record-Scope",
    action: "Report vs. Account 1 in 2 Sätzen erklären",
  },
  {
    title: "Kosten",
    action: "Commission/Swap belegt vs. Gesamtmethodik trennen",
  },
  {
    title: "Risiko",
    action: "interne Limits vs. INNO-Limits klar trennen",
  },
  {
    title: "Technik",
    action: "heutige Runtime vs. Zielbild erklären",
  },
];
