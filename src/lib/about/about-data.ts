// Shared data for About/Info Panel — used by both desktop and mobile.
// Edit here → both pages update automatically.
//
// Sources:
//   white-swan-official-kpis.json       → live CFD track record
//   public/data/whiteswan/portfolio_f10_equity.json summary → WS OOS stats
//   white-swan-global-strategy.json     → sleeve count & asset count
//   core-invest-paper.config.json       → CI OOS validated_metrics

export const ABOUT_STRATEGIES = [
  {
    id: "ws",
    number: "01",
    type: "Futures · Walk-Forward OOS",
    name: "White Swan Portfolio",
    badge: "Unkorreliert",
    badgeColor: "gold" as const,
    stats: [
      { label: "CAGR OOS",  value: "+4.6%",  color: "green" as const },
      { label: "Max DD",    value: "−4.4%",  color: "red"   as const },
      { label: "Sharpe",    value: "1.27",   color: "white" as const },
      { label: "Calmar",    value: "1.04",   color: "white" as const },
    ],
    details: [
      { icon: "Layers",       key: "Komponenten",  value: "35 aktive Strategien" },
      { icon: "Globe",        key: "Märkte",       value: "Agrar · Metalle · Indizes · Energie · Forex" },
      { icon: "Clock",        key: "Zeithorizont", value: "1–30 Tage je Sleeve" },
      { icon: "Calendar",     key: "Backtest",     value: "OOS 2019–2026 · IS ab 2003" },
      { icon: "CheckCircle",  key: "Execution",    value: "Forward Tracking · kein Live-Konto" },
      { icon: "Target",       key: "Korrelation",  value: "Sehr niedrig zu Aktien" },
    ],
  },
  {
    id: "ci",
    number: "02",
    type: "ETF / Aktien / Rohstoffe · OOS BT",
    name: "Core Invest",
    badge: "Leicht korreliert",
    badgeColor: "blue" as const,
    stats: [
      { label: "CAGR OOS",  value: "+17.1%", color: "green" as const },
      { label: "Max DD",    value: "−21.7%", color: "red"   as const },
      { label: "Sharpe",    value: "1.15",   color: "white" as const },
      { label: "Calmar",    value: "0.79",   color: "white" as const },
    ],
    details: [
      { icon: "Layers",       key: "Assets",       value: "8 Komponenten" },
      { icon: "Globe",        key: "Kern",         value: "QQQ 45% · GLD 25% · Sleeves 30%" },
      { icon: "Clock",        key: "Zeithorizont", value: "Wochen – 12 Monate" },
      { icon: "RefreshCw",    key: "Rebalancing",  value: "Quartalsweise" },
      { icon: "Calendar",     key: "Backtest",     value: "OOS 2019–2026 · IS ab 2000" },
      { icon: "CheckCircle",  key: "Status",       value: "Approved · Frozen · kein Live-Konto" },
    ],
  },
] as const;

export const ABOUT_COMPARISON = [
  { name: "White Swan",     tag: "BT", cagr: "+4.6%",  dd: "−4.4%",  sharpe: "1.27", calmar: "1.04", horizon: "Tage–Wochen",   corr: "—",           accent: true  },
  { name: "Core Invest",    tag: "BT", cagr: "+17.1%", dd: "−21.7%", sharpe: "1.15", calmar: "0.79", horizon: "Wochen–Monate", corr: "mittel",       accent: true  },
  { name: "S&P 500",        tag: "",   cagr: "~10%",   dd: "−55%",   sharpe: "~0.5", calmar: "~0.2", horizon: "Langfrist",     corr: "niedrig",      accent: false },
  { name: "DAX",            tag: "",   cagr: "~8%",    dd: "−60%",   sharpe: "~0.4", calmar: "~0.1", horizon: "Langfrist",     corr: "niedrig",      accent: false },
  { name: "Gold",           tag: "",   cagr: "~7%",    dd: "−45%",   sharpe: "~0.4", calmar: "~0.2", horizon: "Langfrist",     corr: "mittel",       accent: false },
  { name: "60/40",          tag: "",   cagr: "~7%",    dd: "−35%",   sharpe: "~0.5", calmar: "~0.2", horizon: "Langfrist",     corr: "niedrig",      accent: false },
  { name: "Anleihen (AGG)", tag: "",   cagr: "~3%",    dd: "−20%",   sharpe: "~0.4", calmar: "~0.2", horizon: "Langfrist",     corr: "sehr niedrig", accent: false },
] as const;

export const ABOUT_INVESTOR = [
  { key: "Liquidität",   value: "Täglich" },
  { key: "Gebühren",     value: "Keine" },
  { key: "Währung",      value: "EUR / USD" },
  { key: "Ausschüttung", value: "Thesaurierend" },
  { key: "Struktur",     value: "Eigenhandel" },
  { key: "Regulierung",  value: "Kein reg. Fonds" },
] as const;

export const ABOUT_RISK = [
  { key: "White Swan",  value: "Niedrig (MaxDD ~4%)" },
  { key: "Core Invest", value: "Mittel (MaxDD ~22%)" },
  { key: "Korrelation", value: "WS zu Aktien: sehr niedrig" },
  { key: "Leverage",    value: "Variabel je Sleeve" },
] as const;

export const ABOUT_TRACK_RECORD = [
  { key: "Periode",       value: "Apr 2024 – Jul 2026" },
  { key: "Gesamt",        value: "+97.2%" },
  { key: "Kompoundiert",  value: "+114.6%" },
  { key: "p.a.",          value: "+35.2%" },
  { key: "Calmar",        value: "3.0" },
  { key: "Sharpe",        value: "1.60" },
  { key: "Max DD",        value: "−11.8%" },
  { key: "Profit Factor", value: "1.28" },
  { key: "Quelle",        value: "Broker-Statement" },
] as const;

export const ABOUT_ZEITHORIZONT = [
  { key: "CFD Intraday", value: "Minuten – Stunden" },
  { key: "CFD Swing",    value: "1–5 Tage" },
  { key: "White Swan",   value: "1–30 Tage" },
  { key: "Core Invest",  value: "Wochen – 12 Monate" },
  { key: "WS Backtest",  value: "OOS ab 2019 · IS ab 2003" },
  { key: "CI Backtest",  value: "OOS ab 2019 · IS ab 2000" },
] as const;

export const ABOUT_ECKDATEN = [
  { key: "Live seit",  value: "Apr 2024" },
  { key: "WS Sleeves", value: "Agrar · Metalle · Indizes · Energie · Forex" },
  { key: "WS Assets",  value: "29 Futures · 35 aktive Strategien" },
  { key: "CI Kern",    value: "QQQ 45% · GLD 25% · Sleeves 30%" },
  { key: "Märkte",     value: "Futures · CFD · ETF · FX" },
  { key: "Signale",    value: "Vollautomatisch · regelbasiert" },
] as const;
