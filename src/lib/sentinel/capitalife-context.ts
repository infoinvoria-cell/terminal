import fs from "fs";
import path from "path";
import { getBrainContextStatus, getSentinelEnvConfig } from "./providers/provider-status";

// -- Paths --------------------------------------------------------------------

const BRAIN_BASE = getSentinelEnvConfig().brainPath;

// -- Helpers ------------------------------------------------------------------

function readSafe(filePath: string): string | null {
  try {
    const normalized = path.normalize(filePath);
    if (!fs.existsSync(normalized)) return null;
    return fs.readFileSync(normalized, "utf-8");
  } catch {
    return null;
  }
}

function clamp(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

// -- Static core context ------------------------------------------------------

const STATIC_CONTEXT = `
## Capitalife - Interne Kernfakten (immer gueltig)

### Organisation
- Capitalife Brain = einzige Source of Truth / zentraler Datenraum aller Capitalife-Daten.
- Capitalife Terminal = interne UI/Visualisierung, kein unabhaengiger Datenursprung.
- Capitalife GbR erbringt KEINE eigene Finanzportfolioverwaltung fuer Dritte.
- Keine Live-Execution, keine Order-Ausfuehrung, keine Portfolio-Freigabe.
- AuM = EUR0 (kein verwaltetes Kundenvermoegen belegt).
- Performance Report ist statement-based und nicht unabhaengig auditiert.
- Execution Readiness: ALLE Bereiche ROT (kein Broker-Account, keine Signale, kein Order-Routing).

### White Swan Production Registry
WICHTIG: Konkrete Performance-Zahlen (CAGR, Max DD, Sharpe pro Sleeve) stehen
NICHT in diesem statischen Fallback-Block, weil sie sich aendern und ein
frueherer Max-DD-Datensatz hier nachweislich veraltet war. Wenn Live-Brain-Daten
oben in diesem Kontext vorhanden sind, nutze ausschliesslich diese. Wenn KEINE
Live-Brain-Daten verfuegbar sind, sage explizit, dass aktuelle Sleeve-Kennzahlen
gerade nicht abrufbar sind — erfinde oder schaetze keine Zahlen.
- Mehrere aktive Production Sleeves (Gruppen), organisiert nach Asset-Klasse
  (Agrar, Metals, Indices, Energy, Forex).
- Walk-Forward-Methodik: In-Sample-Fit, Out-of-Sample-Validierung ueber
  mehrere Marktzyklen.

Gruppen-Gewichte zwischen den Sleeves: offen / nicht final festgelegt.

### Assets (gehandelte Symbole pro Sleeve)
- Agrar / Commodities: ZC1!, ZW1!, ZS1!, CC1!, KC1!, OJ1!, SB1!, CT1! (je nach Macro/Seasonal-Status)
- Metals: GC1!, SI1!, HG1!, PL1!, PA1!
- Indices: ES1!, NQ1!, YM1!, FDAX1!, UKX
- Energy: CL1!, NG1!, RB1!
- Forex: EURGBP, MXNUSD, NOK, CLPUSD, GBPJPY, SEKUSD, BRLUSD, ZARUSD

### Strategie-Register (White Swan Universe)
- 42 belegbare White-Swan-Strategien im Universe Register.
- Nr. 43: offen / nicht gefunden (trotz gruendlicher Quellensuche).
- Nr. 44-50: Candidate/Source open, nicht belegt.
- 21 Seasonal Production Patterns (separat gezaehlt, nicht in den 42 enthalten).
- 28 Seasonal Research Assets (Cache, kein Production-Status).

### Invest Portfolio
Status: Research / Konzeptionell - kein aktiver Production Sleeve.
- E-Step Invest (NAS100)
- Only Long Valuation Trend EMA (NAS100)
- CHF Invest (6S1!)
- Ziel: ca. 5 Invest-Strategien - ca. 2 weitere Kandidaten offen.
- Kein externer Track Record fuer Invest vorhanden.

### FSPortfolio Live Core v2
Status: Research / Forward-ready / nicht live / nicht freigegeben.
- Eigenstaendiges Long-only Multi-Asset Invest Portfolio
- Zielgewichte: SPY 27.5 %, SPMO 27.5 %, QQQ 15 %, GLD 20 %, White Swan NAS EMA 10 %
- White Swan NAS EMA ist nur ein 10-%-Satellite-Sleeve und nicht der White-Swan-Gesamttrack-Record
- NAS100USD bleibt Research-Referenz fuer den Sleeve; die Core-Implementierung laeuft ueber QQQ long/cash
- DBC ist aus dem finalen Core entfernt und nur noch research optional
- Invest nutzt im Dashboard exakt dieselbe Analytics-Struktur wie White Swan; keine separate Invest-UI, keine zweite Boxenlandschaft
- SPMO bleibt required core data; solange SPMO fehlt, darf Invest nicht als vollstaendig berechneter finaler v2-Backtest dargestellt werden
- Quartalsweises Rebalancing, 10 bps Kostenannahme, optionales Toleranzband +/-20 % relativ
- Keine Shorts, keine Optionen, kein Portfolio-Hebel
- Keine Live-Execution, keine Renditeversprechen, keine eigene Finanzportfolioverwaltung durch Capitalife GbR
- ETF-Historie gilt erst ab gemeinsamer Datenverfuegbarkeit der realen ETF-Serien; Proxy-Tests sind getrennt zu kennzeichnen

### Live Track Record (White Swan)
Zeitraum: 11.04.2024 bis 01.07.2026 (ca. 26 Monate)
- Combined Return: +97.2 %
- Compounded Cumulative: +114.6 %
- Max Historical Drawdown: -11.76 %
- Annualized Return: 35.2 % p.a.
- Sharpe: 1.60 | Calmar: 3.0 | Profit Factor: 1.28
- Positive Months: 18 / 26 (69.2 %)
- Account 1 (RoboForex): +73.19 %
- Account 2 (Myfxbook): +23.96 %
- Jahresrenditen: 2024 +27.2 % (9 M), 2025 +41.7 % (12 M), 2026 +12.3 % (6 M, partiell)
- Caveat: statement-based, nicht unabhaengig auditiert, Rohdaten teilweise fehlend.

### Technologie
- Capitalife Terminal: Next.js 15, React 19, TypeScript 5, Tailwind CSS 4
- Sentinel: lokaler AI-Assistent im Local-Only-Modus ueber Ollama
- Invoria Dashboard: separate technische Instanz, Daten konsistent mit Brain
`.trim();

// -- Brain file list ----------------------------------------------------------

const BRAIN_FILES: { relPath: string; label: string; maxChars: number }[] = [
  { relPath: "09_AI/AI_PROJECT_BRAIN_CURRENT.md", label: "AI Project Brain (aktuell)", maxChars: 8000 },
  { relPath: "09_AI/dashboard_snapshot.json", label: "Dashboard Snapshot (aktuell)", maxChars: 6000 },
  { relPath: "00_Index/Open Issues.md", label: "Offene Issues (aktuell)", maxChars: 3000 },
  { relPath: "00_Index/Next Actions.md", label: "Nächste Aktionen (aktuell)", maxChars: 3000 },
  { relPath: "00_Index/Changelog.md", label: "Changelog", maxChars: 2000 },
  { relPath: "09_AI/Live_Track_Record.md", label: "Live Track Record (aktuell)", maxChars: 3000 },
];

// -- Context builder ----------------------------------------------------------

function buildContext(): string {
  const brainStatus = getBrainContextStatus();
  const liveParts: string[] = [];

  if (brainStatus.available && BRAIN_BASE) {
    for (const { relPath, label, maxChars } of BRAIN_FILES) {
      const fullPath = path.join(/* turbopackIgnore: true */ BRAIN_BASE, relPath);
      const content = readSafe(fullPath);
      if (!content?.trim()) continue;
      const clean = content.replace(/\r\n/g, "\n").trim();
      liveParts.push(`### ${label}\n${clamp(clean, maxChars)}`);
    }
  }

  if (liveParts.length > 0) {
    // Live Brain data comes FIRST — always takes priority over static context
    return `## CAPITALIFE BRAIN — LIVE DATEN (höchste Priorität, immer aktuell)
WICHTIG: Diese Live-Daten haben IMMER Vorrang. Nutze ausschließlich diese Werte, nicht veraltete Annahmen.

${liveParts.join("\n\n---\n\n")}

---

## Statischer Basis-Kontext (Fallback / Hintergrundwissen)
${STATIC_CONTEXT}`;
  }

  // Fallback: only static context
  return `## CAPITALIFE KONTEXT (Statisch — Brain nicht erreichbar)
${STATIC_CONTEXT}`;
}

// -- Cache (30-second TTL for near-real-time freshness) -----------------------

let cached: string | null = null;
let cachedAt = 0;
const TTL = 30 * 1000;

export function getCapalifeContext(): string {
  const now = Date.now();
  if (cached !== null && now - cachedAt < TTL) return cached;
  try {
    cached = buildContext();
  } catch {
    cached = STATIC_CONTEXT;
  }
  cachedAt = now;
  return cached;
}

// Always inject full Brain context — no keyword filtering
export function getCapalifeContextConditional(_question?: string): string {
  return getCapalifeContext();
}

export function getBrainCacheStatus(): { cachedAt: number; ageMs: number; valid: boolean } {
  const now = Date.now();
  return { cachedAt, ageMs: now - cachedAt, valid: cached !== null && now - cachedAt < TTL };
}

export function getCapalifeContextBudgeted(maxContextTokens: number): string {
  const full = getCapalifeContext();
  const fullTokens = Math.ceil(full.length / 3.5);
  if (fullTokens <= maxContextTokens) return full;
  const charBudget = maxContextTokens * 3.5;
  return full.slice(0, charBudget) + "\n...[context truncated to fit model budget]";
}
