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
Stand: final_production_sleeves.json v2, 2026-07-04
- 5 aktive Production Sleeves (Gruppen)
- 35 aktive Production Entries (aktive Strategie-Eintraege gesamt)
- OOS-Zeitraum: 2008-01-01 bis 2026-01-01
- Walk-Forward: IS 2000-2007, OOS-Zyklen bis 2025

| Sleeve         | CAGR    | Max DD  | Sharpe | Entries | Status          |
|----------------|---------|---------|--------|---------|-----------------|
| Agrar Final    | 1.94 %  | -0.86 % | 2.02   | 14      | Final           |
| Metals5        | 1.18 %  | -3.02 % | 0.81   | 5       | Final Candidate |
| Indices Hybrid | 1.54 %  | -5.84 % | 0.61   | 5       | Final Candidate |
| Energy Robust3 | 2.40 %  | -3.61 % | 1.01   | 3       | Final Candidate |
| Forex8         | 1.84 %  | -1.93 % | 1.28   | 8       | Final Candidate |

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
  { relPath: "09_AI/AI_PROJECT_BRAIN_CURRENT.md", label: "AI Project Brain Current", maxChars: 5000 },
  { relPath: "09_AI/dashboard_snapshot.json", label: "Dashboard Snapshot", maxChars: 5000 },
  { relPath: "00_Index/Open Issues.md", label: "Open Issues", maxChars: 1800 },
  { relPath: "00_Index/Next Actions.md", label: "Next Actions", maxChars: 1800 },
];

// -- Context builder ----------------------------------------------------------

function buildContext(): string {
  const brainStatus = getBrainContextStatus();
  if (!brainStatus.available) {
    return `${STATIC_CONTEXT}\n\n---\n\n## Context Mode\n${brainStatus.message}`;
  }

  if (!BRAIN_BASE) {
    return `${STATIC_CONTEXT}\n\n---\n\n## Context Mode\nBrain path missing`;
  }

  const liveParts: string[] = [];

  for (const { relPath, label, maxChars } of BRAIN_FILES) {
    const fullPath = path.join(/* turbopackIgnore: true */ BRAIN_BASE, relPath);
    const content = readSafe(fullPath);
    if (!content?.trim()) continue;
    const clean = content.replace(/\r\n/g, "\n").trim();
    liveParts.push(`### ${label}\n${clamp(clean, maxChars)}`);
  }

  if (liveParts.length === 0) return STATIC_CONTEXT;
  return `${STATIC_CONTEXT}\n\n---\n\n## Capitalife Brain - Geladene Quelldateien\n\n${liveParts.join("\n\n---\n\n")}`;
}

// -- Cache (5-minute TTL) -----------------------------------------------------

let cached: string | null = null;
let cachedAt = 0;
const TTL = 5 * 60 * 1000;

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
