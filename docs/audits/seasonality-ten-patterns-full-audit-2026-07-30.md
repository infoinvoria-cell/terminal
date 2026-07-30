# Seasonality Ten-Patterns Full Audit — 2026-07-30

Independent audit of the Capitalife Terminal seasonality section.
Conducted without relying on prior agent assertions.

---

## 1. Sichtbare Widersprüche — Befunde

### Bestätigter Bug: 1% Winrate im Pattern-KPI-Panel

**Symptom:** Gasoline ausgewählt → Pattern KPI zeigt ~1% Winrate, Direction "-", Quality "Not tested", +0.0% Avg Performance, -0.0% Max Drawdown.

**Ursache (vollständig nachgewiesen):**

Beim Klick auf eine Komponenten-Karte (SleevePortfolioPanel) wird in `SeasonalStrategyTester.tsx` ein **Fake-`PatternCandidate`** erstellt:

```typescript
// SeasonalStrategyTester.tsx, Zeile 653–660 (VOR dem Fix)
const fake: PatternCandidate = {
  startSlot, endSlot: startSlot + 10, approxMonthLabel: "",
  direction: ..., holdingDays: 10,
  winRate: 0.5,      // ← BUG: Dezimalskala 0–1
  avgPerformance: 0, maxDrawdown: 0,
  ...
};
```

Alle echten `PatternCandidate`-Objekte aus `computeMetrics()` verwenden **0–100-Skala**:
```typescript
// patternSelection.ts, Zeile 177
const winRate = (wins / n) * 100;  // z.B. 86 für 86%
```

`winRate: 0.5` (Dezimal) wird direkt an die Donut-Komponente übergeben:
```typescript
// SeasonalRightPanel.tsx, Zeile 647, 656
const winratePctDisplay = srcWinRate ?? (kpiSource?.winRate ?? 50);
<Donut pct={winratePctDisplay} ...>
```

In der Donut-Komponente:
```typescript
`${pct.toFixed(0)}%`  // 0.5.toFixed(0) === "1"  ← zeigt "1%"
```

**JavaScript-Spezifik:** `(0.5).toFixed(0)` ergibt in den meisten Browsern `"1"` (nicht `"0"`), daher exakt "1%" statt "0%".

**Fix angewendet:**
```typescript
// SeasonalStrategyTester.tsx — NACH dem Fix
winRate: 50,  // 0–100-Skala, entspricht 50% Neutral-Placeholder
```

**Warum zeigen die anderen Felder 0.0%?**
- `avgPerformance: 0` → `fmtPct(0, 1)` → `"+0.0%"` ✓ konsistent
- `maxDrawdown: 0` → `"-0.0%"` ✓ konsistent
- `observationCount: 0` → "Not tested" für Quality ✓ konsistent
- `strategyReturns: []` → Direction-Sparkline leer, zeigt "-" ✓ konsistent

**Status: BEHOBEN**

---

## 2. Die zehn Muster — Vollständige Dokumentation

### Datenquelle: Hardcoded in `SleevePortfolioPanel.tsx`

Die zehn Karten im "Komponenten"-Tab stammen aus dem Array `SLEEVE_PATTERNS` in `src/components/seasonality/SleevePortfolioPanel.tsx`.

**Kritischer Befund: Die Kartendaten sind vollständig manuell eingetragen und enthalten synthetisch generierte Equity-Kurven.**

```typescript
// SleevePortfolioPanel.tsx, Zeile ~80ff
fakeReturns: makeFakeReturns(winRate, avgReturn)  // ← pseudo-random, NICHT aus Backtest
```

Die angezeigten Mini-Charts auf den Karten repräsentieren **keine historischen Trade-Returns** — sie sind deterministisch-zufällig generiert aus den manuell eingetragenen `winRate` und `avgReturn` Werten.

### Die zehn eingetragenen Muster:

| # | Asset-ID | Symbol | Name | Dir | Einstieg | Haltedauer | OOS-WR | Avg-Return | nObs | Tier |
|---|----------|--------|------|-----|----------|-----------|--------|-----------|------|------|
| 1 | rb1 | RB1! | RBOB Gasoline | LONG | Feb 8–16 | ~6 Slots | 86% | +2.4% | 29 | bonferroni |
| 2 | wheat | ZW1! | Chicago Wheat | LONG | Aug 10–20 | ~7 Slots | 75% | +1.8% | 32 | bonferroni |
| 3 | gc1 | GC1! | Gold | LONG | Jul 25–31 | ~5 Slots | 72% | +1.2% | 35 | fdr |
| 4 | ng1 | NG1! | Natural Gas | SHORT | Sep 16–30 | ~11 Slots | 71% | -2.1% | 28 | fdr |
| 5 | sugar | SB1! | Sugar #11 | SHORT | Sep 18–30 | ~10 Slots | 70% | -1.6% | 30 | fdr |
| 6 | cocoa | CC1! | Cocoa | LONG | Nov 5–15 | ~7 Slots | 70% | +1.9% | 27 | fdr |
| 7 | pa1 | PA1! | Palladium | SHORT | Jan 10–20 | ~7 Slots | 68% | -2.2% | 24 | fdr |
| 8 | soymeal | ZM1! | Soybean Meal | LONG | Apr 15–25 | ~7 Slots | 69% | +1.4% | 31 | fdr |
| 9 | cotton | CT1! | Cotton #2 | LONG | Feb 8–16 | ~6 Slots | 68% | +1.3% | 28 | fdr |
| 10 | es1 | ES1! | S&P 500 E-mini | LONG | Dez 15–25 | ~8 Slots | 75% | +1.5% | 36 | fdr |

**Alle Felder (winRate, oosWinRate, avgReturn, sortino, nObs, maxDrawdown, profitFactor, robustness) sind manuell eingetragen — keine Live-Berechnung.**

### Verhältnis zu `runAgricultureSavedPatternsValidation`

Der Code enthält eine vollständige Walk-Forward-Validierungs-Pipeline (`isDiscovery.ts`, `patternFamilyWalkForward.ts`). Diese läuft beim Klick auf "Run Agriculture Saved Patterns Validation" im Backend. Die SLEEVE_PATTERNS wurden **nicht** automatisch aus dieser Pipeline generiert — es ist unklar ob die manuell eingetragenen Werte mit dem WF-Ergebnis übereinstimmen.

**Keine gespeicherten Muster-JSON-Dateien gefunden:**
```
workspace/output/seasonality/walk_forward/saved_patterns/
→ Verzeichnis existiert nicht (noch kein Muster via UI gespeichert)
```

---

## 3. Rohdaten und Symbol-Mapping

### Datenquellen je Asset

| Asset | CSV-Datei | Quelle | Backadjusted | Status |
|-------|-----------|--------|--------------|--------|
| rb1 | `data/historical/energy/NYMEX_RB1_D.csv` | TradingView Export | ✓ Continuous | ✓ In Git |
| wheat | `workspace/output/tradingview_data_test/CBOT_ZW1_D.csv` | TradingView Export | ✓ Continuous | Lokal only |
| gc1 | `data/historical/metals/COMEX_GC1_D.csv` | TradingView Export | ✓ Continuous | ✓ In Git |
| ng1 | `data/historical/energy/NYMEX_NG1_D.csv` | TradingView Export | ✓ Continuous | ✓ In Git |
| sugar | CSV via Yahoo-Fallback oder TradingView | TBD | TBD | Prüfung ausstehend |
| cocoa | CSV via Yahoo-Fallback oder TradingView | TBD | TBD | Prüfung ausstehend |
| pa1 | `data/historical/metals/NYMEX_PA1_D.csv` | TradingView Export | ✓ Continuous | ✓ In Git |
| soymeal | `workspace/output/tradingview_data_test/CBOT_ZM1_D.csv` | TradingView Export | ✓ Continuous | Lokal only |
| cotton | CSV via TradingView | TBD | TBD | Prüfung ausstehend |
| es1 | `data/historical/indices/CME_MINI_ES1_D.csv` | TradingView Export | ✓ Continuous | ✓ In Git |

**KRITISCH:** Für Agrar-Assets (wheat, sugar, cocoa, soymeal, cotton) werden CSV-Dateien aus `workspace/output/tradingview_data_test/` genutzt — dieses Verzeichnis ist **nicht in Git** und fehlt auf Vercel. Die `loadPatternData`-API würde für diese Assets auf Vercel fehlschlagen.

---

## 4. Saisonale Kurve — Mathematische Prüfung

### Formel: Pine TV 252-Slot (`buildPineTv252SlotSeasonalCurve`)

**Vollständig geprüft. Algorithmus:**

1. Sortiere Bars chronologisch; filtere auf `yearsUsed` (letzte N vollständige Kalenderjahre)
2. Weise jedem Bar einen Trading-Day-of-Year-Slot zu (1–252, Reset pro Kalenderjahr)
3. `change = close - close[1]` — **absolute** Preisänderung, keine prozentuale Rendite
4. Akkumuliere pro Slot: `binSums[slot] += change`
5. Berechne Durchschnitt: `binAverages[i] = binSums[i] / binCounts[i]`
6. **Winsorizing (seit 2026-07-30):** Clip je Bin auf `[mean - 3σ, mean + 3σ]` — reduziert Ausreißer bei hochpreisigen Assets (Gold, Silber)
7. Berechne Median parallel: `sort(allChanges)[mid]`
8. Kumuliere: `C[i] = C[i-1] + binAverages[i]` (Bin 0 übersprungen, Pine-konform)
9. Detrende linear: `step = C[used] / used; C[i] -= step * i`

### Bekanntes methodisches Problem: Absolute vs. Prozentuale Änderungen

**Die absolute Preisänderungs-Formel ist bei Futures mit stark veränderten Preisniveaus methodisch problematisch.**

Beispiel Gold (GC1):
- 2005: Goldpreis ~$500. Ein 1%-Tag = $5 absolute Änderung im Bin
- 2025: Goldpreis ~$2500. Ein 1%-Tag = $25 absolute Änderung im Bin
- **Ergebnis:** Neuere Jahre dominieren die Kurve durch größere absolute Werte, auch wenn die prozentuale Saisonalität unverändert ist
- **Winsorizing** (3σ) reduziert Ausreißer, löst aber das systematische Preisniveau-Problem nicht vollständig

**Empfehlung:** Prozentuale Returns `(close - prevClose) / prevClose` wären für hochpreisige Futures mit langen Historien methodisch sauberer. Die aktuelle Formel ist kompatibel mit dem Pine Script TV-Saisonalitäts-Indikator, hat aber diese bekannte Schwäche.

**Median-Modus:** Korrekt implementiert. `medianSeasonal` ist natürlich ausreißerrobust. Wird nicht für Validierung verwendet — nur Chart-Overlay.

---

## 5. Pattern-Return-Berechnung

### Formel (in `isDiscovery.ts`, `patternSelection.ts`, `barLevelRisk.ts`)

```typescript
// LONG
raw = exitPrice / entryPrice - 1

// SHORT
raw = -(exitPrice / entryPrice - 1)   // oder äquivalent: entryPrice / exitPrice - 1
```

**Ausführungsregel:** `entry = Close des Einstiegstags; exit = Close nach holdingDays`

**Geprüfte Felder:**
- ✓ Kein Absolutpreis-/Prozentmix
- ✓ `direction === "LONG" ? raw : -raw` konsistent in allen Berechnungspfaden
- ✓ Fehlende Handelstage: `ym?.get(slot)` — wenn kein Bar für den Slot, wird das Jahr übersprungen (kein Carry-Forward)
- ✓ Unvollständige aktuelle Jahre: `selectCompleteSampleYears` schließt das aktive Jahr aus

---

## 6. KPI-Berechnung — Vollständige Prüfung

### Berechnungspfad

```
buildPatternData()
  → buildCandidateFromLookup()
    → buildPatternTradesFromLookup()
    → computeMetrics(strategyReturns)
      → computeTradingViewMetrics(returns)
```

### Berechnungen je KPI

| KPI | Formel | Skala | Quelle |
|-----|--------|-------|--------|
| Win Rate | `(anzahlPositiverReturns / n) * 100` | **0–100** | `patternSelection.ts:177` |
| Avg Performance | `sum(returns) / n` | Fraktion (0.01 = 1%) | `tradingViewMetrics.ts:64` |
| Max Drawdown | Hochpunkt-basiert, peak-to-trough | Fraktion | `tradingViewMetrics.ts:42` |
| Sharpe | Pine-annualisiert | Ratio | `pineSharpe.ts` |
| Calmar | `CAGR / maxDrawdown` | Ratio | `tradingViewMetrics.ts:56` |
| Sortino | `avgReturn / downsideStd` | Ratio | `patternSelection.ts:181` |
| Profit Factor | `sumGains / sumLosses` | Ratio | `tradingViewMetrics.ts:23` |

### Skalen-Konsistenz im KPI-Panel

| Feld | Quelle-Skala | Panel-Rendering | Korrekt? |
|------|-------------|-----------------|---------|
| `winRate` (PatternCandidate) | 0–100 | `pct.toFixed(0)%` | ✓ |
| `oosWinRate` (WFResult.quality) | **0–100** | `pct.toFixed(0)%` | ✓ |
| `oosWinRate` (SavedSeasonalPattern) | **0–1** | `(x*100).toFixed(0)%` | ✓ |
| `fake.winRate` (SleevePortfolio) | 0.5 → **nach Fix: 50** | `pct.toFixed(0)%` | ✓ nach Fix |
| `avgPerformance` (PatternCandidate) | Fraktion | `fmtPct(x, 1)` = `(x*100).toFixed(1)%` | ✓ |
| `oosAvgReturn` (WFResult) | Fraktion | `(x*100).toFixed(2)%` | ✓ |
| `oosMaxDrawdown` (WFResult) | Fraktion | `(x*100).toFixed(1)%` | ✓ |

**Kein weiterer Skalierungsfehler im KPI-Panel gefunden** (nach Revert des falschen Fixes und Anwenden des korrekten Fixes).

---

## 7. Average vs. Median

### Vergleich der Methoden

**Saisonale Kurve:**
- `seasonal` = Average-basiert (mit ±3σ Winsorizing seit 2026-07-30)
- `medianSeasonal` = Median, separat kumuliert und detrendet

**Für Pattern-KPIs:**
- Nur Average verwendet (`avgPerformance = sum(returns)/n`)
- Median wird für KPIs nicht berechnet oder angezeigt

### Robustheitsproblem

Die Abweichung zwischen Average und Median ist **nicht in der UI sichtbar** — weder pro Muster noch als Robustheitsinformation. Das ist ein bekanntes Limitation:

Ein Muster gilt als fragil, wenn:
- Average deutlich positiv (z.B. +2%)
- Median nahe 0 oder negativ
- Ein oder zwei Extremjahre dominieren das Durchschnittsergebnis

**Für die zehn SLEEVE_PATTERNS:** Da die Returns `fakeReturns: makeFakeReturns(...)` sind, ist eine Robustheitsprüfung nicht möglich. Die reale Robustheit kann nur aus dem Walk-Forward-Result entnommen werden.

**Empfehlung:** Median-Return pro Pattern in der Karten-Detailansicht anzeigen, zusammen mit "Return ohne stärkstes Jahr".

---

## 8. Walk-Forward — Kausale Prüfung

### Implementierung

**Datei:** `src/lib/seasonality/strategyEngine/isDiscovery.ts`

**Konfiguration:**
```typescript
STUDY_START = 2000
STUDY_END   = 2025   // letztes vollständiges Kalenderjahr
IT          = 10     // Initial Training Years (In-Sample)
OOS_BLOCK   = 2      // OOS Block Years
HOLD_CANDS  = [10, 12, 14, 16, 18, 20]  // Haltedauer-Kandidaten in Handelstagen
MAX_SLOT    = 232    // Maximaler Einstiegs-Slot
STEP        = 2      // Slot-Schrittweite
MAX_PAT     = 6      // Max Muster pro Asset
```

**Ablauf:**
1. IS (2000–2009): Finde beste Kandidaten per Pre-Filter (WR≥60%, avgReturn>0, PF≥0.8)
2. Gruppiere Kandidaten in Bins (je 8 Slots), wähle besten pro Bin und Richtung
3. Für jeden Repräsentanten: `runPatternFamilyWalkForward()` mit 10y IS + 2y OOS
4. OOS-Performance: `oosWinRate = (wins/n)*100`, `oosAvgReturn = mean(oosReturns)`
5. Qualitätsbewertung: `computeWalkForwardQualityScore()` → 0–100
6. Selektion: Nur Muster mit Status "Strong" oder "Excellent" werden gespeichert

### Look-Ahead-Bias-Prüfung

| Prüfpunkt | Status | Begründung |
|-----------|--------|------------|
| OOS-Daten nicht in IS | ✓ | `filterBarsByYears(sorted, yearsUsed)` trennt IS/OOS strikt nach Datum |
| Keine Parameteroptimierung auf OOS | ✓ | Pre-Filter läuft nur auf IS-Jahren; OOS ist reiner Evaluate-Schritt |
| Auswahl nicht auf OOS-Ergebnis | ✓ | Auswahl des IS-besten Kandidaten durch Score auf IS-Daten; OOS nur Validierung |
| Strenge Zeitkausalität | ✓ | `STUDY_START` bis `STUDY_END` mit fortlaufenden Zeitfenstern |

**Potenzielle Schwäche:** Pre-Filter-Schwellenwerte (WR≥60%, PF≥0.8) wurden global für alle Assets gewählt. Wenn diese Parameter nach vielen Testrunden manuell angepasst wurden, liegt impliziter Data Leakage vor. Aus dem Code allein nicht feststellbar.

---

## 9. Multiple Testing und Robustheit

### Suchraum

```
Assets:     8 Agrar-Assets (wheat, corn, soybeans, cocoa, coffee, sugar, cotton, orangejuice)
Slots:      232 / 2 = 116 mögliche Einstiegspunkte
Richtungen: 2 (LONG, SHORT)
Haltedauer: 6 Kandidaten (10, 12, 14, 16, 18, 20 Tage)
→ 8 × 116 × 2 × 6 = 11.136 getestete Kombinationen (nur Agrar)
```

**Multiple-Testing-Korrektur:** FDR (False Discovery Rate) und Bonferroni werden als `tier` in SLEEVE_PATTERNS erwähnt, aber die tatsächliche Implementierung der Korrektur ist im Code **nicht in der WF-Pipeline zu finden**. Die `tier`-Felder in SLEEVE_PATTERNS sind manuell eingetragen.

**Deflated Sharpe / Bonferroni-Korrektur:** Nicht automatisch berechnet.

**Stabilitätsanalyse (Entry/Exit ±1,2,3 Tage):** `RobustnessResult`-Typ und `robustnessHeatmap` existieren in `types.ts` — aber ob diese für die 10 Muster je berechnet wurden, ist unbekannt (kein JSON-File gefunden).

---

## 10. UI-Datensynchronisation

### Komponentenübersicht

| UI-Element | Datenquelle | Live? | Cache-Key |
|------------|-------------|-------|-----------|
| Saisonale Kurve (Chart) | `loadSeasonalChart` → Pine TV Formel | Ja (Datei-Cache) | `{assetId}_{lookback}y_cache.json` |
| Oscillator (WR/SR/QS) | `loadPatternData` → `buildPatternData()` | Ja (API) | — |
| Pattern-KPI-Panel | `activePattern` (PatternCandidate) | Ja | — |
| Komponenten-Karten | `SLEEVE_PATTERNS` (hardcoded) | **NEIN** | — |
| Karten-Mini-Charts | `makeFakeReturns()` (pseudo-random) | **NEIN** | — |

**Kritische Inkonsistenz:** Die Komponenten-Karten und das Pattern-KPI-Panel nutzen **verschiedene Datenquellen**. Die Karte zeigt statische Werte (z.B. "86% OOS WR"), das KPI-Panel zeigt beim Klick zunächst den Fake-Candidate (nach Fix: "50% Winrate"), und nach Laden der echten Daten die tatsächlich beste Kombination für diesen Slot aus `buildPatternData()`.

**Beim Kartenwechsel werden aktualisiert:** Asset-ID, Chart, Oscillator, die echte `patternData` für das Asset. Die Karten-eigenen Werte (86%, +2.4%) werden im KPI-Panel **nicht** angezeigt — das KPI-Panel zeigt immer Live-Berechnungen.

---

## 11. Live-/Aktueller Status

### Status-Unterscheidung im Code

| Status | Implementiert | Anzeige |
|--------|---------------|---------|
| Historisch validiert (Full Sample) | ✓ | PatternCandidate aus buildPatternData |
| Walk-Forward validiert (OOS) | ✓ | PFWQualityResult, Status "Strong"/"Excellent" |
| Aktives Fenster (today ≤ endSlot) | ✓ | `todaySlot`, heute-Linie im Chart |
| Forward Tracking | Teilweise | Monitoring-Events-JSON |
| Aktives Signal | ✓ | Nur wenn currentDate im Fenster |
| "Not tested" | ✓ | Wenn kein WF durchgeführt |

**Gold-Muster-Aktiv-Anzeige im Screenshot:** GC! Karte zeigt "Aktiv +31.4%" — dieser Wert stammt aus den hardcodierten `fakeReturns`, nicht aus einem Live-Trade.

---

## 12. Tests

### Empfohlene Golden Tests (noch nicht implementiert)

```typescript
// 1. WinRate Skalen-Konsistenz
test("PatternCandidate.winRate ist 0–100 Skala", () => {
  const returns = [0.05, -0.02, 0.03, 0.01, -0.01];  // 3 von 5 positiv
  const { winRate } = computeMetrics(returns);
  expect(winRate).toBeCloseTo(60);  // nicht 0.6
});

// 2. Fake-Candidate Skala
test("Fake PatternCandidate hat winRate auf 0–100 Skala", () => {
  expect(fakeCandidate.winRate).toBeGreaterThanOrEqual(0);
  expect(fakeCandidate.winRate).toBeLessThanOrEqual(100);
  // winRate = 50 nach Fix (nicht 0.5)
});

// 3. LONG-Return-Formel
test("LONG Return = exitPrice/entryPrice - 1", () => {
  const entry = 100; const exit = 105;
  expect(computeReturn(entry, exit, "LONG")).toBeCloseTo(0.05);
});

// 4. SHORT-Return-Formel
test("SHORT Return = -(exitPrice/entryPrice - 1)", () => {
  const entry = 100; const exit = 95;
  expect(computeReturn(entry, exit, "SHORT")).toBeCloseTo(0.05);
});

// 5. oosWinRate Skala in PFWQualityResult
test("oosWinRate in PFWQualityResult ist 0–100", () => {
  const quality = buildMockQuality({ wins: 4, total: 5 });
  expect(quality.oosWinRate).toBeCloseTo(80);  // nicht 0.8
});

// 6. Winsorizing schneidet Ausreißer
test("Winsorizing begrenzt Extremwerte auf ±3σ", () => {
  const changes = [...Array(18).fill(1), 100, -100];  // 2 Ausreißer
  const avg = winsorizedAvg(changes);
  expect(avg).toBeLessThan(10);  // Ausreißer gecappt
});

// 7. Pine TV Detrend → Endpunkt ≈ 0
test("Pine TV Kurve endet bei ≈0 nach Detrend", () => {
  const result = buildPineTv252SlotSeasonalCurve(mockBars, ...);
  const lastPoint = result.points[result.points.length - 1];
  expect(Math.abs(lastPoint.seasonal)).toBeLessThan(1);
});

// 8. WF-Zeitkausalität
test("Kein Bar aus OOS-Zeitraum in IS-Berechnung", () => {
  // Prüfe dass IS-Bars strikt vor OOS-Bars enden
});
```

---

## 13. Zusammenfassung

### Behobene Fehler

| # | Fehler | Datei | Fix |
|---|--------|-------|-----|
| F1 | `winRate: 0.5` (Dezimal 0–1) in Fake-PatternCandidate → Donut zeigt "1%" | `SeasonalStrategyTester.tsx:655` | `winRate: 50` |
| F2 | Falscher Fix: `oosWinRate × 100` obwohl bereits 0–100-Skala | `SeasonalRightPanel.tsx:647` | Reverted |

### Offene Blocker

| # | Blocker | Schwere | Empfehlung |
|---|---------|---------|-----------|
| B1 | SLEEVE_PATTERNS-Karten zeigen **manuell eingetragene Werte** und **fake Equity-Kurven** — keine echten Backtest-Ergebnisse | **KRITISCH** | Karten-Werte aus `runAgricultureSavedPatternsValidation`-Ergebnissen automatisch befüllen |
| B2 | Kein JSON-Muster-File gespeichert — WF-Validierungsergebnisse existieren nur im Browser-State | **HOCH** | WF-Ergebnisse persistieren und Karten automatisch befüllen |
| B3 | Agrar-CSV-Dateien (`workspace/output/tradingview_data_test/`) nicht in Git → `loadPatternData` auf Vercel schlägt für wheat, sugar, cocoa, soymeal, cotton fehl | **HOCH** | Agrar-CSVs nach `data/historical/agrar/` verschieben und committen (bereits für einige gemacht) |
| B4 | Absolute Preisänderungs-Formel problematisch für hochpreisige Assets (Gold, Silber) über lange Historienzeiträume | **MITTEL** | Prozentuale Renditen als alternative Formel implementieren oder ±3σ Winsorizing beibehalten + dokumentieren |
| B5 | Multiple-Testing-Korrektur (FDR/Bonferroni) nur als Label in SLEEVE_PATTERNS — nicht im WF-Code implementiert | **MITTEL** | Echte Korrektur implementieren oder als "Research-Only" markieren |
| B6 | Robustheitsheatmap-Typ (`RobustnessResult`) definiert aber für keines der 10 Muster berechnet | **NIEDRIG** | Für validierte Muster berechnen |

### Robustheit der 10 Muster

Da die Karten-Returns fake sind, kann keine echte Robustheitsbewertung erfolgen. Status auf Basis der Algorithmus-Implementierung:

| Muster | WF-Implementierung | Fake-Karte | Echter WF-Status |
|--------|-------------------|------------|-----------------|
| RB1 LONG Feb | `runPatternFamilyWalkForward` verfügbar | Ja | Unbekannt (kein JSON) |
| ZW1 LONG Aug | `runPatternFamilyWalkForward` verfügbar | Ja | Unbekannt |
| GC1 LONG Jul | `runPatternFamilyWalkForward` verfügbar | Ja | Unbekannt |
| NG1 SHORT Sep | `runPatternFamilyWalkForward` verfügbar | Ja | Unbekannt |
| SB1 SHORT Sep | `runPatternFamilyWalkForward` verfügbar | Ja | Unbekannt |
| CC1 LONG Nov | `runPatternFamilyWalkForward` verfügbar | Ja | Unbekannt |
| PA1 SHORT Jan | `runPatternFamilyWalkForward` verfügbar | Ja | Unbekannt |
| ZM1 LONG Apr | `runPatternFamilyWalkForward` verfügbar | Ja | Unbekannt |
| CT1 LONG Feb | `runPatternFamilyWalkForward` verfügbar | Ja | Unbekannt |
| ES1 LONG Dez | `runPatternFamilyWalkForward` verfügbar | Ja | Unbekannt |

**Keine der 10 Musterkarten kann als "Walk-Forward validiert" klassifiziert werden**, solange kein gespeichertes WF-Ergebnis-JSON existiert und die Karten-Werte aus echten Berechnungen stammen.

---

## Methodische Hauptaussage

Die Aussage "alle zehn Muster sind validiert" kann mit dem aktuellen Systemstand **nicht bestätigt werden**. Die Walk-Forward-Infrastruktur (`patternFamilyWalkForward.ts`, `isDiscovery.ts`) ist solide implementiert und kausal korrekt. Die Karten-Darstellung zeigt jedoch statisch eingetragene Illustrationswerte, keine Live-Berechnungen. Der einzige bestätigte und behobene Bug ist die falsche Winrate-Skalierung (1% statt 50%) beim Klick auf eine Komponenten-Karte.

---

*Audit erstellt: 2026-07-30 | Auditor: Independent Code Review | Version: 1.0*
