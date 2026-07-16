"use client";

import { useState } from "react";
import { getMonitoringAssetIconUrl } from "@/lib/monitoring/monitoringAssetIcons";
import LiveSignalMiniChart from "@/components/monitoring/LiveSignalMiniChart";
import type { LiveSignalCardModel } from "@/lib/monitoring/collectRealMonitoringSignals";

/** Colours sourced from the user's chart/UI overlay settings. */
export type LiveSignalColors = { entry: string; sl: string; tp: string };

function hexToRgba(hex: string, alpha: number): string {
  const h = String(hex || "").trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6) || "3b82f6", 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fmtPrice(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  const d = a < 10 ? 4 : a < 100 ? 3 : 2;
  return v.toLocaleString("de-DE", { maximumFractionDigits: d });
}
function fmtNum(v: number | null, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return v.toLocaleString("de-DE", { maximumFractionDigits: d });
}
function fmtDate(ms: number | null): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtDateTime(ms: number | null): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
// Display-name fallback for the common signal-producing futures when the feed only
// carries the ticker. Pure UI labels (not data) — used only if no real name is present.
const SYMBOL_DISPLAY_NAMES: Record<string, string> = {
  "KC1!": "Coffee", "SB1!": "Sugar", "CC1!": "Cocoa", "CT1!": "Cotton", "OJ1!": "Orange Juice",
  "ZC1!": "Corn", "ZS1!": "Soybeans", "ZW1!": "Wheat",
  "GC1!": "Gold", "SI1!": "Silver", "PA1!": "Palladium", "PL1!": "Platinum",
  "CL1!": "Crude Oil", "HG1!": "Copper", "NG1!": "Natural Gas", "BRN1!": "Brent",
  "ES1!": "S&P 500", "NQ1!": "Nasdaq 100", "YM1!": "Dow Jones", "FDAX1!": "DAX", "RTY1!": "Russell 2000",
};

function displayName(card: { name: string; symbol: string }): string {
  if (card.name && card.name !== "-" && card.name !== card.symbol) return card.name;
  return SYMBOL_DISPLAY_NAMES[card.symbol] ?? "";
}

function ageLabel(ms: number | null): string {
  if (ms == null) return "";
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `vor ${days} T`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `vor ${hours} Std`;
  return "heute";
}

const DEFAULT_COLORS: LiveSignalColors = { entry: "#3b82f6", sl: "#ff3b46", tp: "#22c55e" };

export default function LiveSignalCard({ card, onSelect, colors = DEFAULT_COLORS, scale = 1 }: { card: LiveSignalCardModel; onSelect: (card: LiveSignalCardModel) => void; colors?: LiveSignalColors; scale?: number }) {
  const [open, setOpen] = useState(false);
  const iconUrl = getMonitoringAssetIconUrl({ code: card.symbol, assetId: card.assetId, name: card.name });
  const isLong = card.direction === "long";
  const tone = card.cardStatus === "Take Profit" ? "tp" : card.cardStatus === "Stop Loss" ? "sl" : "open";
  const endPrice = card.category === "closed" ? card.exitPrice : card.currentPrice;
  const levelsMissing = !(card.entryPrice != null && card.entryPrice > 0) || !card.hasStopLoss || !card.hasTakeProfit;

  // Accent + direction colours come from the user's settings (Open=entry/blue,
  // Take Profit=tp/green, Stop Loss=sl/red). Gradient + pill + LONG/SHORT all derive.
  const accent = tone === "tp" ? colors.tp : tone === "sl" ? colors.sl : colors.entry;
  const dirColor = isLong ? colors.tp : colors.sl;
  const gradStyle = { background: `linear-gradient(120deg, rgba(9,11,15,0.97) 0%, ${hexToRgba(accent, 0.1)} 44%, ${hexToRgba(accent, 0.92)} 100%)` };
  const pillStyle = { background: accent, color: "#f7fbff" };

  return (
    <div
      className={`lsc-card lsc-${tone}`}
      role="button"
      tabIndex={0}
      data-live-symbol={card.symbol}
      data-live-status={card.cardStatus}
      data-live-category={card.category}
      data-live-trade-id={card.tradeId}
      data-live-group={card.group}
      // Click on the rest of the card opens the dropdown; navigation is the status pill.
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => { if (e.key === "Enter") setOpen((v) => !v); }}
    >
      <div className="lsc-grad" style={gradStyle} aria-hidden />
      <div className="lsc-body">
        <div className="lsc-left">
          <div className="lsc-headrow">
            {iconUrl ? <img src={iconUrl} alt="" className="lsc-icon" /> : <span className="lsc-icon lsc-icon-fb" />}
            <div className="lsc-names">
              <span className="lsc-sym">{card.symbol}</span>
              <span className="lsc-name">{displayName(card)}</span>
            </div>
          </div>
          <div className="lsc-time">Signal: {fmtDate(card.signalMs)}{ageLabel(card.signalMs) ? ` · ${ageLabel(card.signalMs)}` : ""}</div>
          <div className="lsc-dir" style={{ color: dirColor }}>
            <span className="lsc-tri">{isLong ? "▲" : "▼"}</span>{isLong ? "LONG" : "SHORT"}
          </div>
        </div>

        <div className="lsc-mini">
          <LiveSignalMiniChart entry={card.entryPrice} stopLoss={card.stopLossPrice} takeProfit={card.takeProfitPrice} endPrice={endPrice} status={card.cardStatus} direction={card.direction} seed={card.tradeId} colors={colors} width={Math.round(132 * scale)} height={Math.round(58 * scale)} />
        </div>

        <div className="lsc-spacer" aria-hidden />

        <div className="lsc-right">
          <button
            type="button"
            className="lsc-pill"
            style={pillStyle}
            aria-label={`${card.symbol} ${card.cardStatus} – zum Chart`}
            onClick={(e) => { e.stopPropagation(); onSelect(card); }}
          >{card.cardStatus}</button>
          <span className="lsc-expand" aria-hidden>{open ? "▴" : "▾"}</span>
        </div>
      </div>

      {open ? (
        <div className="lsc-details" onClick={(e) => e.stopPropagation()}>
          <div className="lsc-grid">
            <div><span>Entry</span><b>{fmtPrice(card.entryPrice)}</b></div>
            <div><span>{card.category === "closed" ? "Exit" : "Current"}</span><b>{fmtPrice(endPrice)}</b></div>
            <div><span>Stop Loss</span><b>{card.hasStopLoss ? fmtPrice(card.stopLossPrice) : "—"}</b></div>
            <div><span>Take Profit</span><b>{card.hasTakeProfit ? fmtPrice(card.takeProfitPrice) : "—"}</b></div>
            <div><span>P/L</span><b className={card.plPct != null && card.plPct < 0 ? "neg" : "pos"}>{card.plAbs != null ? `${card.plAbs >= 0 ? "+" : ""}${fmtNum(card.plAbs)}` : "—"}{card.plPct != null ? ` (${card.plPct >= 0 ? "+" : ""}${fmtNum(card.plPct)}%)` : ""}</b></div>
            <div><span>CRV / RR</span><b>{card.rr != null ? `${fmtNum(card.rr)} : 1` : "—"}</b></div>
            <div><span>Signalzeit</span><b>{fmtDateTime(card.signalMs)}</b></div>
            <div><span>Entryzeit</span><b>{fmtDateTime(card.signalMs)}</b></div>
            {card.category === "closed" ? <div><span>Exitzeit</span><b>{fmtDateTime(card.exitMs)}</b></div> : null}
            {card.category === "closed" ? <div><span>Exit Reason</span><b>{card.exitReason ?? "—"}</b></div> : null}
          </div>
          {levelsMissing ? <div className="lsc-missing">Levels fehlen</div> : null}
          <div className="lsc-src">{card.strategy && card.strategy !== "-" && !card.strategy.startsWith("manual:") ? `${card.strategy} · ` : ""}{card.sourceLabel}</div>
        </div>
      ) : null}

      <style jsx>{`
        .lsc-card {
          position: relative;
          width: 100%;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: calc(22px * var(--lsc-scale, 1));
          background: #08090c;
          overflow: hidden;
          cursor: pointer;
          transition: border-color 0.12s;
        }
        .lsc-card:hover { border-color: rgba(255,255,255,0.22); }
        /* Diagonal (~120deg) wash toward the bottom-right; colour set inline from settings. */
        .lsc-grad { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
        /* Every size scales with --lsc-scale (1 at default width, down to 0.72 when narrow)
           so the layout/alignment stays identical, just smaller. */
        .lsc-body { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, calc(158px * var(--lsc-scale, 1))) auto minmax(0,1fr) calc(36px * var(--lsc-scale, 1)); align-items: stretch; min-height: calc(64px * var(--lsc-scale, 1)); }
        .lsc-left { display: flex; flex-direction: column; justify-content: center; gap: calc(3px * var(--lsc-scale, 1)); padding: calc(7px * var(--lsc-scale, 1)) calc(4px * var(--lsc-scale, 1)) calc(7px * var(--lsc-scale, 1)) calc(12px * var(--lsc-scale, 1)); min-width: 0; }
        .lsc-spacer { min-width: 0; }
        .lsc-headrow { display: flex; align-items: center; gap: calc(7px * var(--lsc-scale, 1)); min-width: 0; }
        .lsc-icon { width: calc(28px * var(--lsc-scale, 1)); height: calc(28px * var(--lsc-scale, 1)); border-radius: calc(8px * var(--lsc-scale, 1)); object-fit: cover; flex: 0 0 auto; }
        .lsc-icon-fb { background: rgba(255,255,255,0.08); display: inline-block; }
        .lsc-names { min-width: 0; display: flex; align-items: baseline; gap: calc(6px * var(--lsc-scale, 1)); flex-wrap: wrap; }
        .lsc-sym { font-size: calc(15px * var(--lsc-scale, 1)); font-weight: 800; color: #f6f8fc; letter-spacing: 0.01em; line-height: 1.05; }
        .lsc-name { font-size: calc(10.5px * var(--lsc-scale, 1)); color: #9aa3af; }
        .lsc-time { font-size: calc(10px * var(--lsc-scale, 1)); color: #97a0ad; }
        .lsc-dir { display: inline-flex; align-items: center; gap: calc(5px * var(--lsc-scale, 1)); font-size: calc(11.5px * var(--lsc-scale, 1)); font-weight: 800; letter-spacing: 0.04em; }
        .lsc-tri { font-size: calc(8.5px * var(--lsc-scale, 1)); }
        .lsc-mini { display: flex; align-items: center; justify-content: flex-end; padding: 0; overflow: hidden; max-width: calc(132px * var(--lsc-scale, 1)); }
        .lsc-right { display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; gap: 4px; padding: calc(8px * var(--lsc-scale, 1)) calc(9px * var(--lsc-scale, 1)) calc(7px * var(--lsc-scale, 1)) 2px; }
        .lsc-pill { font-size: calc(10px * var(--lsc-scale, 1)); font-weight: 800; padding: calc(4px * var(--lsc-scale, 1)) calc(10px * var(--lsc-scale, 1)); border-radius: 999px; white-space: nowrap; letter-spacing: 0.01em; border: none; cursor: pointer; }
        .lsc-pill:hover { filter: brightness(1.12); }
        .lsc-expand { background: transparent; border: none; color: #ffffff; font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1; opacity: 0.9; }
        .lsc-expand:hover { opacity: 1; }
        .lsc-details { position: relative; z-index: 2; border-top: 1px solid rgba(255,255,255,0.09); margin: 0 18px; padding: 12px 0 14px; cursor: default; }
        .lsc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 18px; }
        .lsc-grid > div { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; }
        .lsc-grid span { color: #828b98; }
        .lsc-grid b { color: #e2e8f1; font-weight: 600; font-variant-numeric: tabular-nums; }
        .lsc-grid b.pos { color: #4ade80; }
        .lsc-grid b.neg { color: #ff5d9e; }
        .lsc-missing { margin-top: 8px; font-size: 11px; color: #d9b066; }
        .lsc-src { margin-top: 8px; font-size: 10px; color: #5b636e; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ── Mobile layout: stack vertically on narrow screens ── */
        @media (max-width: 520px) {
          .lsc-body {
            grid-template-columns: 1fr auto;
            grid-template-rows: auto auto;
            min-height: unset;
          }
          /* Left info stays top-left */
          .lsc-left {
            grid-column: 1;
            grid-row: 1;
            padding: 10px 4px 6px 12px;
          }
          /* Mini chart: top-right, smaller */
          .lsc-mini {
            grid-column: 2;
            grid-row: 1;
            align-items: flex-start;
            padding: 8px 10px 0 0;
          }
          /* Spacer hidden on mobile */
          .lsc-spacer { display: none; }
          /* Right (pill + expand): full-width bottom row */
          .lsc-right {
            grid-column: 1 / -1;
            grid-row: 2;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            padding: 4px 12px 10px;
            border-top: 1px solid rgba(255,255,255,0.05);
          }
          /* Bigger pill tap target */
          .lsc-pill {
            font-size: 12px;
            padding: 7px 16px;
            min-height: 36px;
          }
          /* Bigger expand tap target */
          .lsc-expand {
            font-size: 20px;
            padding: 6px 8px;
          }
          /* Sym + name: slightly larger */
          .lsc-sym { font-size: 16px; }
          .lsc-name { font-size: 11px; }
          .lsc-time { font-size: 11px; }
          .lsc-dir { font-size: 12.5px; }
          /* Details grid: single column on very narrow */
          .lsc-grid { grid-template-columns: 1fr 1fr; gap: 8px 12px; }
          .lsc-grid > div { font-size: 12.5px; }
          .lsc-details { margin: 0 12px; padding: 12px 0 12px; }
        }
      `}</style>
    </div>
  );
}
