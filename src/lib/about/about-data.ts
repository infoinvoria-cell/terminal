// Shared data for Bibel — Desktop + Mobile read from here. Edit once, both update.
//
// VERIFIZIERTE QUELLEN (Stand Jul 2026):
//   white-swan-official-kpis.json   → WS LIVE-Konto (Futures/FX, KEIN CFD)
//   portfolio_f10_equity.json       → WS Backtest f10 (.summary)
//   white-swan-global-strategy.json → Sleeves, 35 Strategien / 29 Instrumente
//   core-invest-paper.config.json   → rejected CI aggregate reference (engine parity failed)
//
//   WS Live  : 2024-04-11 – 2026-07-01 · +97.2% komb. · 35.2% p.a. · DD −11.76%
//              Sharpe 1.6 · Calmar 3.0 · PF 1.28 · 121 Trades (89+32 sichtbar)
//   WS BT f10: CAGR 4.608% · Vol 3.613% · Sharpe 1.267 · DD −4.419% · Calmar 1.043
//   CI       : frozen 8-component allocation; aggregate metrics rejected until engine parity
//
//   Korr. zu SPY: geschätzt, keine Live-Regression (WS ~0.05 · CI ~0.75)

// ─── Source type ─────────────────────────────────────────────────────────────
type Source = 'live' | 'backtest' | 'estimated' | 'reference';

// ─── Primitive objects — EINZIGE Stelle, an der Zahlen getippt werden ────────

/** White Swan live account (Futures/FX, KEIN CFD) */
export const WS_LIVE = {
  periodStart:   '2024-04',
  periodEnd:     '2026-07',
  totalReturn:    0.972,    // kombiniert (Summe der Strategie-Returns)
  kompoundiert:   1.146,    // tatsächliches Kontowachstum (compound)
  maxDD:         -0.1176,
  sharpe:         1.60,
  profitFactor:   1.28,
  trades:         121,
  corrSPY:        0.05,
  corrSPYSource: 'estimated' as Source,
  instruments:    29,
  strategies:     35,
  sleeves:        5,
  source:        'live' as Source,
} as const;

/** White Swan Referenz-Backtest (f10-Variante) — getrennt von Live-Daten */
export const WS_BACKTEST_F10 = {
  cagr:   0.046,
  maxDD: -0.044,
  sharpe: 1.27,
  source: 'backtest' as Source,
} as const;

/** Core Invest v2.0 target allocation; aggregate validation remains blocked. */
export const CI = {
  aggregateMetricsValid: false,
  corrSPY:        null,
  corrSPYSource: 'reference' as Source,
  sleeves:        4,
  allocQQQ:       45,   // QQQ Passiv %
  allocGLD:       25,   // Gold (GLD) %
  allocBeta:      10,   // SPMO + SPY %
  allocQT:        20,   // four strategy sleeves %
  source:        'reference' as Source,
} as const;

// ─── Derived metrics ──────────────────────────────────────────────────────────

function yearsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return ((yb - ya) * 12 + (mb - ma)) / 12;
}

const MONTHS_DE = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const periodStr = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS_DE[m - 1]} ${y}`;
};

export const wsYears  = yearsBetween(WS_LIVE.periodStart, WS_LIVE.periodEnd); // 2.25
export const wsCAGR   = Math.pow(1 + WS_LIVE.totalReturn, 1 / wsYears) - 1;  // ≈ 0.35229 → "+35.2%"
export const wsCalmar = wsCAGR / Math.abs(WS_LIVE.maxDD);                     // ≈ 2.9855
export const ciCalmar = null;

// ─── Format helpers ───────────────────────────────────────────────────────────

const pct     = (n: number, d = 1) => `${n >= 0 ? '+' : '−'}${(Math.abs(n) * 100).toFixed(d)}%`;
const rat     = (n: number, d = 2) => n.toFixed(d);
const corrS   = (n: number)        => `~${n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
const roughDD = (n: number)        => `~${Math.round(Math.abs(n) * 100)}%`;

// ─── Display layer — abgeleitete Strings; MISMATCH-Einträge sind überschrieben ─

const D = {
  // White Swan Live
  wsCAGR:        pct(wsCAGR),                  // "+35.2%" (abgeleitet 35.229%, Δ 0.03pp ✓)
  wsDD:          pct(WS_LIVE.maxDD),           // "−11.8%"
  wsSharpe:      rat(WS_LIVE.sharpe),          // "1.60"
  wsCalmar:      rat(wsCalmar),               // "3.00" (wsCalmar=2.9955 mit maxDD=−0.1176 ✓)
  wsTotalReturn: pct(WS_LIVE.totalReturn),     // "+97.2%"
  wsKomp:        pct(WS_LIVE.kompoundiert),    // "+114.6%"
  wsPF:          rat(WS_LIVE.profitFactor),    // "1.28"
  wsCorr:        corrS(WS_LIVE.corrSPY),       // "~0.05"
  wsPeriod:      `${periodStr(WS_LIVE.periodStart)} – ${periodStr(WS_LIVE.periodEnd)}`,  // "Apr 2024 – Jul 2026"
  // Core Invest
  ciCAGR:        "nicht validiert",
  ciDD:          "nicht validiert",
  ciSharpe:      "nicht validiert",
  ciCalmar:      "nicht validiert",
  ciCorr:        "nicht belegt",
  // WS Referenz-Backtest f10
  f10CAGR:       pct(WS_BACKTEST_F10.cagr),    // "+4.6%"
  f10DD:         pct(WS_BACKTEST_F10.maxDD),   // "−4.4%"
  f10Sharpe:     rat(WS_BACKTEST_F10.sharpe),  // "1.27"
};

// ─── Strategy definitions ─────────────────────────────────────────────────────

export const ABOUT_STRATEGIES = [
  {
    id: "ws",
    number: "01",
    type: "Futures & FX · Live-Handel",
    name: "White Swan Portfolio",
    badge: `Live seit ${periodStr(WS_LIVE.periodStart)}`,
    badgeColor: "gold" as const,
    stats: [
      { label: "CAGR p.a.", value: D.wsCAGR,   color: "gold"  as const },
      { label: "Max DD",    value: D.wsDD,      color: "red"   as const },
      { label: "Sharpe",    value: D.wsSharpe,  color: "white" as const },
      { label: "Calmar",    value: D.wsCalmar,  color: "white" as const },
    ],
    details: [
      { icon: "Layers",      key: "Aufbau",                 value: `${WS_LIVE.instruments} Instrumente · ${WS_LIVE.strategies} Strategien` },
      { icon: "Globe",       key: "Sleeves",                value: "Agrar · Metalle · Indizes · Energie · FX" },
      { icon: "Clock",       key: "Trade-Horizont",         value: "1–30 Tage je Sleeve" },
      { icon: "BarChart2",   key: "Referenz-Backtest f10",  value: `${D.f10CAGR} p.a. · DD ${D.f10DD} · Sharpe ${D.f10Sharpe}` },
      { icon: "CheckCircle", key: "Live-Basis",             value: `${WS_LIVE.trades} Trades · ${D.wsTotalReturn} kombiniert` },
      { icon: "Target",      key: "Korr. zu SPY",           value: `${D.wsCorr} · unkorreliert (geschätzt)` },
    ],
  },
  {
    id: "ci",
    number: "02",
    type: "ETF · Aktien · Rohstoffe · Backtest",
    name: "Core Invest",
    badge: "Validation blockiert",
    badgeColor: "blue" as const,
    stats: [
      { label: "CAGR OOS", value: D.ciCAGR,   color: "white" as const },
      { label: "Max DD",   value: D.ciDD,      color: "red"   as const },
      { label: "Sharpe",   value: D.ciSharpe,  color: "white" as const },
      { label: "Calmar",   value: D.ciCalmar,  color: "white" as const },
    ],
    details: [
      { icon: "Layers",      key: "Komponenten",  value: `8 · QQQ ${CI.allocQQQ}% · GLD ${CI.allocGLD}% · ${CI.sleeves} Sleeves` },
      { icon: "Globe",       key: "Kern",         value: `QQQ ${CI.allocQQQ}% · GLD ${CI.allocGLD}%` },
      { icon: "RefreshCw",   key: "Rebalancing",  value: "Quartalsweise (Mär/Jun/Sep/Dez)" },
      { icon: "Calendar",    key: "OOS-Backtest", value: "abgelehnt · Engine-Parität fehlt" },
      { icon: "CheckCircle", key: "Status",       value: "v2.0 eingefroren · nicht live-ready" },
      { icon: "Target",      key: "Korr. zu SPY", value: D.ciCorr },
    ],
  },
];

// ─── Comparison table ─────────────────────────────────────────────────────────
// WS/CI-Zeilen referenzieren abgeleitete Display-Werte; Benchmark-Zeilen sind Schätzungen.

export const ABOUT_COMPARISON = [
  { name: "White Swan",     tag: "LIVE", cagr: D.wsCAGR,  dd: D.wsDD,  sharpe: D.wsSharpe, calmar: D.wsCalmar, corrSpy: D.wsCorr,   accent: true  },
  { name: "Core Invest",    tag: "BLOCK", cagr: D.ciCAGR, dd: D.ciDD, sharpe: D.ciSharpe, calmar: D.ciCalmar, corrSpy: D.ciCorr, accent: true },
  { name: "S&P 500",        tag: "",     cagr: "~10%",    dd: "−55%",  sharpe: "~0.5",     calmar: "~0.2",     corrSpy: "1.00",     accent: false },
  { name: "Nasdaq 100",     tag: "",     cagr: "~13%",    dd: "−53%",  sharpe: "~0.6",     calmar: "~0.2",     corrSpy: "~0.90",    accent: false },
  { name: "DAX",            tag: "",     cagr: "~8%",     dd: "−60%",  sharpe: "~0.4",     calmar: "~0.1",     corrSpy: "~0.80",    accent: false },
  { name: "Gold",           tag: "",     cagr: "~7%",     dd: "−45%",  sharpe: "~0.4",     calmar: "~0.2",     corrSpy: "~0.05",    accent: false },
  { name: "60/40",          tag: "",     cagr: "~7%",     dd: "−35%",  sharpe: "~0.5",     calmar: "~0.2",     corrSpy: "~0.65",    accent: false },
  { name: "Anleihen (AGG)", tag: "",     cagr: "~3%",     dd: "−20%",  sharpe: "~0.4",     calmar: "~0.2",     corrSpy: "~−0.05",   accent: false },
];

// ─── Investor info ────────────────────────────────────────────────────────────
export const ABOUT_INVESTOR = [
  { key: "Anlagehorizont", value: "min. 5 Jahre" },
  { key: "Sinnvoll ab",    value: "3 Jahre" },
  { key: "Liquidität",     value: "Täglich" },
  { key: "Währung",        value: "EUR / USD" },
  { key: "Ertrag",         value: "Thesaurierend" },
  { key: "Struktur",       value: "Eigenhandel · Pre-Fund" },
] as const;

// ─── Risk profile ─────────────────────────────────────────────────────────────
export const ABOUT_RISK = [
  { key: "White Swan",      value: `Niedrig–Mittel · DD ${roughDD(WS_LIVE.maxDD)}` },          // "Niedrig–Mittel · DD ~12%"
  { key: "Core Invest",     value: "Risikokennzahlen nicht aggregiert validiert" },
  { key: "WS Korr. SPY",    value: `${D.wsCorr} · unkorreliert` },                            // "~0.05 · unkorreliert"
  { key: "CI Korr. SPY",    value: D.ciCorr },
  { key: "Diversifikation", value: `${WS_LIVE.instruments} Märkte · ${WS_LIVE.sleeves} Sleeves` }, // "29 Märkte · 5 Sleeves"
];

// ─── WS Live Track Record ─────────────────────────────────────────────────────
export const ABOUT_TRACK_RECORD = [
  { key: "Zeitraum",      value: D.wsPeriod },         // "Apr 2024 – Jul 2026"
  { key: "Kombiniert",    value: D.wsTotalReturn },     // "+97.2%"
  { key: "Kompoundiert",  value: D.wsKomp },            // "+114.6%"
  { key: "p.a.",          value: D.wsCAGR },            // "+35.2%"
  { key: "Sharpe",        value: D.wsSharpe },          // "1.60"
  { key: "Calmar",        value: D.wsCalmar },          // "3.00" (MISMATCH annotiert in D)
  { key: "Max DD",        value: D.wsDD },              // "−11.8%"
  { key: "Profit-Faktor", value: D.wsPF },              // "1.28"
  { key: "Basis",         value: `${WS_LIVE.trades} Trades · Performance-Report` },
];

// ─── Time horizon ─────────────────────────────────────────────────────────────
export const ABOUT_ZEITHORIZONT = [
  { key: "Empfohlen",      value: "min. 5 Jahre" },
  { key: "Sinnvoll ab",    value: "3 Jahre" },
  { key: "WS Trades",      value: "1–30 Tage je Sleeve" },
  { key: "CI Haltedauer",  value: "Wochen – 12 Monate" },
  { key: "CI Rebalancing", value: "Quartalsweise" },
  { key: "Liquidität",     value: "Täglich handelbar" },
] as const;

// ─── WS Sleeve allocation (aus 35 aktiven Strategien) ────────────────────────
export const ABOUT_WS_SLEEVES = [
  { label: "Agrar",   n: 14, pct: 40.0 },
  { label: "FX",      n: 8,  pct: 22.9 },
  { label: "Metalle", n: 5,  pct: 14.3 },
  { label: "Indizes", n: 5,  pct: 14.3 },
  { label: "Energie", n: 3,  pct: 8.6  },
] as const;

// ─── CI Gewichtung v2.0 (frozen 2026-07-20) ──────────────────────────────────
export const ABOUT_CI_ALLOC = [
  { label: "QQQ Passiv",     pct: CI.allocQQQ  },  // 45
  { label: "Gold (GLD)",     pct: CI.allocGLD  },  // 25
  { label: "Beta + Divers.", pct: CI.allocBeta },  // 20
  { label: "QQQ Tactical",   pct: CI.allocQT   },  // 10
];

// ─── SPY-Korrelation (numerisch, für Balkenbreite) ────────────────────────────
export const ABOUT_CORRELATION = [
  { name: "White Swan",     corr: WS_LIVE.corrSPY,  accent: true  },  // 0.05
  { name: "S&P 500",        corr: 1.00,              accent: false },
  { name: "Nasdaq 100",     corr: 0.90,              accent: false },
  { name: "DAX",            corr: 0.80,              accent: false },
  { name: "60/40",          corr: 0.65,              accent: false },
  { name: "Gold",           corr: 0.05,              accent: false },
  { name: "Anleihen (AGG)", corr: -0.05,             accent: false },
];

// ─── Eckdaten & Aufbau ────────────────────────────────────────────────────────
export const ABOUT_ECKDATEN = [
  { key: "Live seit",  value: `${periodStr(WS_LIVE.periodStart)} (White Swan)` },
  { key: "WS Aufbau",  value: `${WS_LIVE.instruments} Instrumente · ${WS_LIVE.strategies} Strategien` },
  { key: "WS Sleeves", value: "Agrar · Metalle · Indizes · Energie · FX" },
  { key: "CI Kern",    value: `QQQ ${CI.allocQQQ}% · GLD ${CI.allocGLD}% · ${CI.sleeves} Sleeves` },
  { key: "Backtests",  value: "WS f10 · CI Aggregat blockiert" },
  { key: "Signale",    value: "Vollautomatisch · regelbasiert" },
];
