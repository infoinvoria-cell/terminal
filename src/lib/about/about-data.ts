// Shared data for Bibel — Desktop + Mobile read from here. Edit once, both update.
//
// VERIFIZIERTE QUELLEN (Stand Jul 2026):
//   white-swan-official-kpis.json   → WS LIVE-Konto (Futures/FX, KEIN CFD)
//   portfolio_f10_equity.json       → WS Backtest f10 (.summary)
//   white-swan-global-strategy.json → Sleeves, 35 Strategien / 29 Instrumente
//   core-invest-paper.config.json   → CI OOS-Backtest (validated_metrics)
//
//   WS Live  : 2024-04-11 – 2026-07-01 · +97.2% komb. · 35.2% p.a. · DD −11.76%
//              Sharpe 1.6 · Calmar 3.0 · PF 1.28 · 121 Trades (89+32 sichtbar)
//   WS BT f10: CAGR 4.608% · Vol 3.613% · Sharpe 1.267 · DD −4.419% · Calmar 1.043
//   CI OOS   : CAGR 17.11% · Sharpe 1.152 · DD −21.73% · Calmar 0.787 (2019–2026)
//
//   Korr. zu SPY: geschätzt, keine Live-Regression (WS ~0.05 · CI ~0.75)

export const ABOUT_STRATEGIES = [
  {
    id: "ws",
    number: "01",
    type: "Futures & FX · Live-Handel",
    name: "White Swan Portfolio",
    badge: "Live seit Apr 2024",
    badgeColor: "gold" as const,
    stats: [
      { label: "CAGR p.a.", value: "+35.2%", color: "gold"  as const },
      { label: "Max DD",    value: "−11.8%", color: "red"   as const },
      { label: "Sharpe",    value: "1.60",   color: "white" as const },
      { label: "Calmar",    value: "3.00",   color: "white" as const },
    ],
    details: [
      { icon: "Layers",      key: "Aufbau",        value: "29 Instrumente · 35 Strategien" },
      { icon: "Globe",       key: "Sleeves",       value: "Agrar · Metalle · Indizes · Energie · FX" },
      { icon: "Clock",       key: "Trade-Horizont", value: "1–30 Tage je Sleeve" },
      { icon: "BarChart2",   key: "Backtest f10",  value: "+4.6% p.a. · DD −4.4% · Sharpe 1.27" },
      { icon: "CheckCircle", key: "Live-Basis",    value: "121 Trades · +97.2% kombiniert" },
      { icon: "Target",      key: "Korr. zu SPY",  value: "~0.05 · unkorreliert (geschätzt)" },
    ],
  },
  {
    id: "ci",
    number: "02",
    type: "ETF · Aktien · Rohstoffe · Backtest",
    name: "Core Invest",
    badge: "Backtest · Paper",
    badgeColor: "blue" as const,
    stats: [
      { label: "CAGR OOS", value: "+17.1%", color: "gold"  as const },
      { label: "Max DD",   value: "−21.7%", color: "red"   as const },
      { label: "Sharpe",   value: "1.15",   color: "white" as const },
      { label: "Calmar",   value: "0.79",   color: "white" as const },
    ],
    details: [
      { icon: "Layers",      key: "Komponenten",   value: "8 · QQQ 45% · GLD 25% · 6 Sleeves" },
      { icon: "Globe",       key: "Kern",          value: "QQQ 45% · GLD 25%" },
      { icon: "RefreshCw",   key: "Rebalancing",   value: "Quartalsweise (Mär/Jun/Sep/Dez)" },
      { icon: "Calendar",    key: "OOS-Backtest",  value: "2019–2026 · IS ab 2000" },
      { icon: "CheckCircle", key: "Status",        value: "Approved v2.0 · kein Live-Konto" },
      { icon: "Target",      key: "Korr. zu SPY",  value: "~0.75 · marktnah (geschätzt)" },
    ],
  },
] as const;

// Risiko-adjustierter Vergleich — alle Sharpe/Calmar verifiziert, Benchmarks geschätzt (~)
export const ABOUT_COMPARISON = [
  { name: "White Swan",     tag: "LIVE", cagr: "+35.2%", dd: "−11.8%", sharpe: "1.60", calmar: "3.00", corrSpy: "~0.05",  accent: true  },
  { name: "Core Invest",    tag: "BT",   cagr: "+17.1%", dd: "−21.7%", sharpe: "1.15", calmar: "0.79", corrSpy: "~0.75",  accent: true  },
  { name: "S&P 500",        tag: "",     cagr: "~10%",   dd: "−55%",   sharpe: "~0.5", calmar: "~0.2", corrSpy: "1.00",   accent: false },
  { name: "Nasdaq 100",     tag: "",     cagr: "~13%",   dd: "−53%",   sharpe: "~0.6", calmar: "~0.2", corrSpy: "~0.90",  accent: false },
  { name: "DAX",            tag: "",     cagr: "~8%",    dd: "−60%",   sharpe: "~0.4", calmar: "~0.1", corrSpy: "~0.80",  accent: false },
  { name: "Gold",           tag: "",     cagr: "~7%",    dd: "−45%",   sharpe: "~0.4", calmar: "~0.2", corrSpy: "~0.05",  accent: false },
  { name: "60/40",          tag: "",     cagr: "~7%",    dd: "−35%",   sharpe: "~0.5", calmar: "~0.2", corrSpy: "~0.65",  accent: false },
  { name: "Anleihen (AGG)", tag: "",     cagr: "~3%",    dd: "−20%",   sharpe: "~0.4", calmar: "~0.2", corrSpy: "~−0.05", accent: false },
] as const;

// Anlage & Konditionen — für Investoren
export const ABOUT_INVESTOR = [
  { key: "Anlagehorizont", value: "min. 5 Jahre" },
  { key: "Sinnvoll ab",    value: "3 Jahre" },
  { key: "Liquidität",     value: "Täglich" },
  { key: "Währung",        value: "EUR / USD" },
  { key: "Ertrag",         value: "Thesaurierend" },
  { key: "Struktur",       value: "Eigenhandel · Pre-Fund" },
] as const;

// Risikoprofil
export const ABOUT_RISK = [
  { key: "White Swan",    value: "Niedrig–Mittel · DD ~12%" },
  { key: "Core Invest",   value: "Mittel · DD ~22%" },
  { key: "WS Korr. SPY",  value: "~0.05 · unkorreliert" },
  { key: "CI Korr. SPY",  value: "~0.75 · marktnah" },
  { key: "Diversifikation", value: "29 Märkte · 5 Sleeves" },
] as const;

// White Swan · Live-Track-Record (KEIN CFD — echtes Futures/FX-Konto)
export const ABOUT_TRACK_RECORD = [
  { key: "Zeitraum",      value: "Apr 2024 – Jul 2026" },
  { key: "Kombiniert",    value: "+97.2%" },
  { key: "Kompoundiert",  value: "+114.6%" },
  { key: "p.a.",          value: "+35.2%" },
  { key: "Sharpe",        value: "1.60" },
  { key: "Calmar",        value: "3.00" },
  { key: "Max DD",        value: "−11.8%" },
  { key: "Profit-Faktor", value: "1.28" },
  { key: "Basis",         value: "121 Trades · Performance-Report" },
] as const;

// Anlagehorizont & Handel (Investor-Sicht vs. interner Trade-Horizont)
export const ABOUT_ZEITHORIZONT = [
  { key: "Empfohlen",       value: "min. 5 Jahre" },
  { key: "Sinnvoll ab",     value: "3 Jahre" },
  { key: "WS Trades",       value: "1–30 Tage je Sleeve" },
  { key: "CI Haltedauer",   value: "Wochen – 12 Monate" },
  { key: "CI Rebalancing",  value: "Quartalsweise" },
  { key: "Liquidität",      value: "Täglich handelbar" },
] as const;

// White Swan Sleeve-Verteilung (aus 35 aktiven Strategien) — für Allocation-Balken
export const ABOUT_WS_SLEEVES = [
  { label: "Agrar",   n: 14, pct: 40.0 },
  { label: "FX",      n: 8,  pct: 22.9 },
  { label: "Metalle", n: 5,  pct: 14.3 },
  { label: "Indizes", n: 5,  pct: 14.3 },
  { label: "Energie", n: 3,  pct: 8.6  },
] as const;

// Core Invest Gewichtung v2.0 (frozen 2026-07-20) — für Allocation-Balken
export const ABOUT_CI_ALLOC = [
  { label: "QQQ Passiv",     pct: 45 },
  { label: "Gold (GLD)",     pct: 25 },
  { label: "Beta + Divers.", pct: 20 },
  { label: "QQQ Tactical",   pct: 10 },
] as const;

// Korrelation zu SPY (numerisch, geschätzt) — für Korrelations-Balken
export const ABOUT_CORRELATION = [
  { name: "White Swan",     corr: 0.05,  accent: true  },
  { name: "Core Invest",    corr: 0.75,  accent: true  },
  { name: "S&P 500",        corr: 1.00,  accent: false },
  { name: "Nasdaq 100",     corr: 0.90,  accent: false },
  { name: "DAX",            corr: 0.80,  accent: false },
  { name: "60/40",          corr: 0.65,  accent: false },
  { name: "Gold",           corr: 0.05,  accent: false },
  { name: "Anleihen (AGG)", corr: -0.05, accent: false },
] as const;

// Eckdaten & Aufbau
export const ABOUT_ECKDATEN = [
  { key: "Live seit",   value: "Apr 2024 (White Swan)" },
  { key: "WS Aufbau",   value: "29 Instrumente · 35 Strategien" },
  { key: "WS Sleeves",  value: "Agrar · Metalle · Indizes · Energie · FX" },
  { key: "CI Kern",     value: "QQQ 45% · GLD 25% · 6 Sleeves" },
  { key: "Backtests",   value: "WS f10 · CI OOS 2019–2026" },
  { key: "Signale",     value: "Vollautomatisch · regelbasiert" },
] as const;
