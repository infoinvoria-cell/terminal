"use client";

import { useEffect, useMemo, useState } from "react";
import type { PatternCandidate, PatternDataResult } from "@/lib/seasonality/patternSelection";
import { formatPatternWindow } from "@/lib/seasonality/patternSelection";
import { SEASONAL_CSV_ASSETS, getAssetDef } from "@/lib/seasonality/walkForward/assetManifest";
import type { SeasonalAssetCategory } from "@/lib/seasonality/walkForward/assetManifest";
import { DirectionSparkline } from "./DirectionSparkline";
import { SeasonalityMonitoringAssetIcon } from "./SeasonalityMonitoringAssetIcon";
import styles from "./seasonal.module.css";

export type ScannerTimeScope  = "month" | "quarter" | "year";
export type ScannerAssetScope = "global" | "group" | "asset";

const C_WHITE  = "#F0F3F7";
const C_GOLD   = "#C9A84C";
const C_TEXT_2 = "#A8B4C4";
const C_TEXT_3 = "#6A7785";
const FONT     = "Montserrat, Segoe UI, sans-serif";

const SCAN_STEP  = 3;
const MAX_CARDS  = 8;
const DEDUP_BINS = 10;

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScanResult {
  assetId:        string;
  assetNameShort: string;
  symbol:         string;
  category:       SeasonalAssetCategory;
  iconKey:        string;
  pattern:        PatternCandidate;
  score:          number;
}

// ── Historical ranking only ───────────────────────────────────────────────────
function computeScore(p: PatternCandidate): number {
  const wr    = p.winRate / 100;
  const pf    = Math.min((p.profitFactor ?? 0) / 6, 1);
  const avg   = Math.min(Math.max(p.avgPerformance * 12, 0), 1);
  const sharp = Math.min(Math.max((p.sharpe ?? 0) / 2, 0), 1);
  return wr * 0.45 + pf * 0.25 + avg * 0.20 + sharp * 0.10;
}

// ── Central sort function (encapsulates all sort logic) ───────────────────────
export function sortPatternScannerResults(results: ScanResult[]): ScanResult[] {
  return [...results].sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.0001) return b.score - a.score;
    if (Math.abs(a.pattern.winRate - b.pattern.winRate) > 0.01) return b.pattern.winRate - a.pattern.winRate;
    const aS = a.pattern.sharpe ?? -Infinity;
    const bS = b.pattern.sharpe ?? -Infinity;
    if (Math.abs(aS - bS) > 0.001) return bS - aS;
    if (Math.abs(a.pattern.avgPerformance - b.pattern.avgPerformance) > 0.0001) {
      return b.pattern.avgPerformance - a.pattern.avgPerformance;
    }
    return a.pattern.startSlot - b.pattern.startSlot;
  });
}

// ── Slot / range filter ────────────────────────────────────────────────────────
function slotInRange(slot: number, todaySlot: number, scope: ScannerTimeScope): boolean {
  if (scope === "year") return true;
  const lookahead = scope === "month" ? 22 : 63;
  const end = todaySlot + lookahead;
  if (end <= 252) return slot >= todaySlot && slot <= end;
  return slot >= todaySlot || slot <= end - 252;
}

function extractBestPatterns(
  bestPatternBySlot: Record<number, PatternCandidate | null>,
  assetId: string,
  todaySlot: number,
  timeScope: ScannerTimeScope,
): ScanResult[] {
  const def = getAssetDef(assetId);
  if (!def) return [];
  const results: ScanResult[] = [];
  for (let slot = 1; slot <= 252; slot += SCAN_STEP) {
    if (!slotInRange(slot, todaySlot, timeScope)) continue;
    const p = bestPatternBySlot[slot] ?? (bestPatternBySlot as Record<string, PatternCandidate | null>)[String(slot)];
    if (!p) continue;
    results.push({
      assetId,
      assetNameShort: def.displayNameShort,
      symbol:         def.symbol,
      category:       def.category,
      iconKey:        def.iconKey,
      pattern:        p,
      score:          computeScore(p),
    });
  }
  return results;
}

function dedupAndScan(all: ScanResult[]): ScanResult[] {
  const grouped = new Map<string, ScanResult>();
  for (const r of all) {
    const key = `${r.assetId}-${Math.floor(r.pattern.startSlot / DEDUP_BINS)}`;
    const prev = grouped.get(key);
    if (!prev || r.score > prev.score) grouped.set(key, r);
  }
  return sortPatternScannerResults(Array.from(grouped.values())).slice(0, MAX_CARDS);
}

// ── Mini Donut ─────────────────────────────────────────────────────────────────
function MiniDonut({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const r    = size * 0.36;
  const circ = 2 * Math.PI * r;
  const sw   = size * 0.092;
  const arc  = Math.max(0, Math.min(1, pct / 100)) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeOpacity={0.20} strokeWidth={sw} />
        {arc > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeOpacity={0.92} strokeWidth={sw}
            strokeDasharray={`${arc} ${circ - arc}`} />
        )}
      </g>
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontFamily={FONT} fontSize={size * 0.215} fontWeight="700">
        {pct.toFixed(0)}%
      </text>
    </svg>
  );
}

// ── Big card (top 4) — 172px fixed width, three stacked sections ───────────────
const BIG_DONUT_PX = 62;
const BIG_SPARK_W = 94;
const BIG_SPARK_H = 64;
const BIG_LABEL_PX = 9;
const CARD_PAD = "14px 14px 12px";
const TOP_INSET = 8;
const GAP_TOP_MID = 18;
const GAP_MID_BOTTOM = 20;
const BOTTOM_INSET = 10;
const BIG_ASSET_NAME_PX = 12.5;
const BIG_SHARPE_VAL_PX = 14;

function ScannerCardBig({ result, opacity, onSelect }: { result: ScanResult; opacity: number; onSelect?: () => void }) {
  const { pattern, assetNameShort, symbol, iconKey, category, assetId } = result;
  const isShort  = pattern.direction === "SHORT";
  const color    = isShort ? C_GOLD : C_WHITE;
  const symShort = symbol.includes(":") ? symbol.split(":")[1] : symbol;
  const sharpeStr = pattern.sharpe != null
    ? `${pattern.sharpe >= 0 ? "+" : ""}${pattern.sharpe.toFixed(2)}`
    : "—";
  const windowStr = formatPatternWindow(pattern.startSlot, pattern.endSlot);

  return (
    <div
      className={`${styles.scannerBigCard}${onSelect ? ` ${styles.scannerBigCardBtn}` : ""}`}
      data-short={isShort ? "1" : "0"}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect?.(); }}
      style={{
      opacity,
      background:    "rgba(255,255,255,0.028)",
      border:        `1px solid rgba(255,255,255,${isShort ? "0.05" : "0.07"})`,
      borderRadius:  10,
      padding:       CARD_PAD,
      display:       "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      fontFamily:    FONT,
      overflow:      "hidden",
      height:        "100%",
      boxSizing:     "border-box",
      cursor:        onSelect ? "pointer" : "default",
      outline:       "none",
    }}>

      {/* Oben: Winrate + Direction */}
      <div style={{ marginTop: TOP_INSET, marginBottom: GAP_TOP_MID, flexShrink: 0 }}>
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 6,
        }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 5,
            flex: "0 0 auto",
            minHeight: BIG_DONUT_PX + 18,
            justifyContent: "flex-end",
          }}>
            <MiniDonut pct={pattern.winRate} color={color} size={BIG_DONUT_PX} />
            <span style={{ fontSize: BIG_LABEL_PX, color: C_TEXT_3, letterSpacing: "0.04em", lineHeight: 1 }}>Winrate</span>
          </div>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 5,
            flex: "1 1 0",
            minWidth: 0,
            maxWidth: BIG_SPARK_W,
            minHeight: BIG_SPARK_H + 18,
            justifyContent: "flex-end",
          }}>
            <DirectionSparkline
              returns={pattern.strategyReturns}
              direction={pattern.direction}
              width={BIG_SPARK_W}
              height={BIG_SPARK_H}
              invertForShort
            />
            <span style={{ fontSize: BIG_LABEL_PX, color: C_TEXT_3, letterSpacing: "0.04em", lineHeight: 1 }}>Direction</span>
          </div>
        </div>
      </div>

      {/* Mitte: Asset + Sharpe (Grid — Name vollständig, Sharpe schmal rechts) */}
      <div style={{ marginBottom: GAP_MID_BOTTOM, flexShrink: 0, paddingTop: 2 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "14px minmax(0, 1fr) auto",
            columnGap: 6,
            rowGap: 2,
            alignItems: "center",
          }}
        >
          <SeasonalityMonitoringAssetIcon
            assetId={assetId}
            iconKey={iconKey}
            category={category}
            assetName={assetNameShort}
            assetSymbol={symbol}
            className={`${styles.scannerBigCardIcon} shrink-0`}
          />
          <div style={{ fontSize: 8.5, color: C_TEXT_3, lineHeight: 1.1, minWidth: 0 }}>{symShort}</div>
          <div
            style={{
              fontSize: BIG_LABEL_PX,
              color: C_TEXT_3,
              lineHeight: 1.1,
              textAlign: "right",
              whiteSpace: "nowrap",
              paddingLeft: 4,
            }}
          >
            Sharpe Ratio
          </div>
          <div
            style={{
              fontSize: BIG_ASSET_NAME_PX,
              fontWeight: 600,
              color: C_TEXT_2,
              lineHeight: 1.15,
              minWidth: 0,
            }}
          >
            {assetNameShort}
          </div>
          <div
            style={{
              fontSize: BIG_SHARPE_VAL_PX,
              fontWeight: 700,
              color,
              lineHeight: 1.1,
              textAlign: "right",
              whiteSpace: "nowrap",
              paddingLeft: 4,
            }}
          >
            {sharpeStr}
          </div>
        </div>
      </div>

      {/* Unten: Window — fester Abstand zur Mitte (kein justify-between) */}
      <div style={{ flexShrink: 0, marginBottom: BOTTOM_INSET }}>
        <div style={{ fontSize: BIG_LABEL_PX, color: C_TEXT_3, marginBottom: 4, letterSpacing: "0.04em", lineHeight: 1 }}>Window</div>
        <div style={{
          fontSize: 16, fontWeight: 700, color, letterSpacing: "-0.2px", lineHeight: 1.15,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{windowStr}</div>
      </div>
    </div>
  );
}

// ── Small card (2x2 grid, ranks 5-8) ─────────────────────────────────────────
function ScannerCardSmall({ result, opacity, onSelect }: { result: ScanResult; opacity: number; onSelect?: () => void }) {
  const { pattern, assetNameShort, symbol, iconKey, category, assetId } = result;
  const isShort  = pattern.direction === "SHORT";
  const color    = isShort ? C_GOLD : C_WHITE;
  const symShort = symbol.includes(":") ? symbol.split(":")[1] : symbol;
  const sharpeStr = pattern.sharpe != null
    ? `${pattern.sharpe >= 0 ? "+" : ""}${pattern.sharpe.toFixed(2)}`
    : "—";
  const windowStr = formatPatternWindow(pattern.startSlot, pattern.endSlot);

  return (
    <div
      className={styles.scannerSmallCard}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect?.(); }}
      style={{
      opacity,
      background:    "rgba(255,255,255,0.020)",
      border:        "1px solid rgba(255,255,255,0.045)",
      borderRadius:  8,
      padding:       "7px 8px 6px",
      display:       "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      gap:           5,
      fontFamily:    FONT,
      cursor:        onSelect ? "pointer" : "default",
      outline:       "none",
      overflow:      "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
        <div>
          <div style={{ fontSize: 7, color: C_TEXT_3, letterSpacing: "0.04em", marginBottom: 1 }}>Winrate</div>
          <div style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1 }}>{pattern.winRate.toFixed(0)}%</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 7, color: C_TEXT_3, letterSpacing: "0.04em", marginBottom: 1 }}>Sharpe</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color, lineHeight: 1 }}>{sharpeStr}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden" }}>
        <SeasonalityMonitoringAssetIcon assetId={assetId} iconKey={iconKey} category={category}
          assetName={assetNameShort} assetSymbol={symbol} className="h-[9px] w-[9px] shrink-0" />
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div style={{ fontSize: 7, color: C_TEXT_3, lineHeight: 1 }}>{symShort}</div>
          <div style={{
            fontSize: 8.5, fontWeight: 600, color: C_TEXT_2, lineHeight: 1.15,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {assetNameShort}
          </div>
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 7, color: C_TEXT_3, letterSpacing: "0.04em", marginBottom: 2 }}>Window</div>
        <div style={{
          fontSize: 9.5, fontWeight: 700, color, lineHeight: 1.1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {windowStr}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  assetId:            string;
  currentPatternData: PatternDataResult | null;
  todaySlot:          number;
  timeScope:          ScannerTimeScope;
  assetScope:         ScannerAssetScope;
  /** Called when a scanner card is clicked. assetId is the card's asset (may differ from current). */
  onSelectPattern?: (assetId: string, pattern: PatternCandidate) => void;
}

export function PatternScannerPanel({ assetId, currentPatternData, todaySlot, timeScope, assetScope, onSelectPattern }: Props) {
  const currentCategory = getAssetDef(assetId)?.category;

  const targetIds = useMemo(() => {
    if (assetScope === "asset")  return [assetId];
    if (assetScope === "group")  return SEASONAL_CSV_ASSETS.filter(a => a.category === currentCategory).map(a => a.assetId);
    return SEASONAL_CSV_ASSETS.map(a => a.assetId);
  }, [assetScope, assetId, currentCategory]);

  const [extraCaches, setExtraCaches] = useState<Record<string, Record<number, PatternCandidate | null>>>({});
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    const needed = targetIds.filter(id => id !== assetId && !(id in extraCaches));
    if (needed.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(
      needed.map(id =>
        fetch("/api/seasonality/walk-forward", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body:   JSON.stringify({ action: "loadSeasonalityCache", assetId: id, lookbackYears: 20 }),
        })
        .then(r => r.ok ? r.json() : null)
        .then((d: { patternIndex?: { bestPatternBySlot?: Record<number, PatternCandidate | null> } } | null) => ({
          id, slots: d?.patternIndex?.bestPatternBySlot ?? null,
        }))
        .catch(() => ({ id, slots: null })),
      ),
    ).then(results => {
      if (cancelled) return;
      setExtraCaches(prev => {
        const next = { ...prev };
        for (const { id, slots } of results) { if (slots) next[id] = slots; }
        return next;
      });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [targetIds, assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const all: ScanResult[] = [];
    for (const id of targetIds) {
      let slots: Record<number, PatternCandidate | null> | null = null;
      if (id === assetId && currentPatternData) slots = currentPatternData.bestPatternBySlot;
      else if (extraCaches[id]) slots = extraCaches[id];
      if (!slots) continue;
      all.push(...extractBestPatterns(slots, id, todaySlot, timeScope));
    }
    return dedupAndScan(all);
  }, [targetIds, assetId, currentPatternData, extraCaches, todaySlot, timeScope]);

  const topCards    = results.slice(0, 4);
  const bottomCards = results.slice(4, 8);
  const hasBottom   = bottomCards.length > 0;

  if (loading && results.length === 0) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center",
        padding: "0 12px", fontSize: 10, color: C_TEXT_3, fontFamily: FONT }}>
        Loading…
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center",
        padding: "0 12px", fontSize: 10, color: C_TEXT_3, fontFamily: FONT }}>
        No patterns in this range.
      </div>
    );
  }

  return (
    <div className={styles.scannerLayout}>
      <div className={styles.scannerBigRow}>
        {topCards.map((r, i) => (
          <ScannerCardBig
            key={`${r.assetId}-${r.pattern.startSlot}-${r.pattern.holdingDays}`}
            result={r}
            opacity={Math.max(1 - i * 0.08, 0.55)}
            onSelect={onSelectPattern ? () => onSelectPattern(r.assetId, r.pattern) : undefined}
          />
        ))}
      </div>

      {hasBottom ? (
        <div className={styles.scannerSmallGrid}>
          {bottomCards.map((r, i) => (
            <ScannerCardSmall
              key={`${r.assetId}-${r.pattern.startSlot}-${r.pattern.holdingDays}`}
              result={r}
              opacity={Math.max(0.72 - i * 0.06, 0.40)}
              onSelect={onSelectPattern ? () => onSelectPattern(r.assetId, r.pattern) : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
