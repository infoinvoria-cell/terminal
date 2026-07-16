"use client";

import { useMemo } from "react";
import type { MonitoringPrimaryTabId } from "@/config/monitoringTabConfig";
import type { LiveSignalsFeed } from "@/lib/monitoring/liveSignalsFeed";
import { collectRealMonitoringSignals, type LiveSignalCardModel } from "@/lib/monitoring/collectRealMonitoringSignals";
import LiveSignalCard, { type LiveSignalColors } from "@/components/monitoring/LiveSignalCard";

export type LiveSignalNavTarget = { tabId: MonitoringPrimaryTabId; itemKey: string; tradeId: string };

const DEFAULT_LIVE_COLORS: LiveSignalColors = { entry: "#3b82f6", sl: "#ff3b46", tp: "#22c55e" };

type Props = {
  feed: LiveSignalsFeed;
  refreshLabel: string;
  refreshStatus: "idle" | "running" | "done" | "error";
  onSelectSignal: (target: LiveSignalNavTarget) => void;
  colors?: LiveSignalColors;
  onResizeStart?: (e: React.PointerEvent) => void;
  scale?: number; // <1 when the column is narrower than default → cards scale down
};

export default function LiveSignalsPanel({ feed, onSelectSignal, colors = DEFAULT_LIVE_COLORS, onResizeStart, scale = 1 }: Props) {
  const { open, closed } = useMemo(() => collectRealMonitoringSignals(feed), [feed]);
  const total = open.length + closed.length;
  const select = (card: LiveSignalCardModel) => onSelectSignal({ tabId: card.tabId, itemKey: card.itemKey, tradeId: card.tradeId });

  return (
    <aside className="lsp-panel" style={{ "--lsc-scale": String(scale) } as React.CSSProperties}>
      {onResizeStart ? (
        <div
          className="lsp-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Live-Signale Breite anpassen"
          onPointerDown={onResizeStart}
        />
      ) : null}
      <header className="lsp-head">
        <div className="lsp-title">Live-Signale</div>
      </header>
      <div className="lsp-scroll">
        {total === 0 ? (
          <div className="lsp-empty">Keine offenen Live-Signale</div>
        ) : (
          <>
            <div className="lsp-cat"><span className="lsp-cat-label">Open ·</span> <span className="lsp-cat-num lsp-num-open">{open.length}</span></div>
            {open.length ? (
              <div className="lsp-list">{open.map((c) => <LiveSignalCard key={c.id} card={c} onSelect={select} colors={colors} scale={scale} />)}</div>
            ) : <div className="lsp-cat-empty">Keine offenen Signale.</div>}

            <div className="lsp-cat"><span className="lsp-cat-label">Closed ·</span> <span className="lsp-cat-num lsp-num-closed">{closed.length}</span></div>
            {closed.length ? (
              <div className="lsp-list">{closed.map((c) => <LiveSignalCard key={c.id} card={c} onSelect={select} colors={colors} scale={scale} />)}</div>
            ) : <div className="lsp-cat-empty">Diese Woche nichts geschlossen.</div>}
          </>
        )}
      </div>
      <style jsx>{`
        .lsp-panel { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; background: #06080b; }
        .lsp-resize { position: absolute; top: 0; left: 0; width: 8px; height: 100%; cursor: col-resize; z-index: 30; touch-action: none; background: linear-gradient(90deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 70%); }
        .lsp-resize::before { content: ""; position: absolute; left: 2px; top: 50%; transform: translateY(-50%); width: 2px; height: 38px; border-radius: 2px; background: rgba(255,255,255,0.18); }
        .lsp-resize:hover { background: linear-gradient(90deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 70%); }
        .lsp-resize:hover::before { background: rgba(255,255,255,0.42); }
        .lsp-head { padding: 16px 18px 8px; }
        .lsp-title { font-size: 15px; font-weight: 700; color: #f4f7fb; letter-spacing: 0.01em; }
        .lsp-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 6px calc(16px * var(--lsc-scale, 1)) 18px; display: grid; gap: calc(10px * var(--lsc-scale, 1)); align-content: start; }
        .lsp-cat { font-size: calc(18px * var(--lsc-scale, 1)); font-weight: 800; letter-spacing: 0.01em; margin: calc(8px * var(--lsc-scale, 1)) 2px 3px; line-height: 1.1; }
        .lsp-cat-label { color: #d7dde6; }
        .lsp-cat-num { font-weight: 900; }
        .lsp-num-open { color: #4ea1ff; }
        .lsp-num-closed { color: #f4f7fb; }
        .lsp-list { display: grid; gap: calc(12px * var(--lsc-scale, 1)); }
        .lsp-cat-empty { font-size: 12px; color: #6b7380; padding: 2px 2px 8px; }
        .lsp-empty { display: grid; place-items: center; padding: 60px 12px; color: #8b94a2; font-size: 14px; text-align: center; }
        .lsp-scroll::-webkit-scrollbar { width: 9px; }
        .lsp-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 5px; }
        /* smooth momentum scroll + pan on touch */
        .lsp-scroll { -webkit-overflow-scrolling: touch; touch-action: pan-y; }

        @media (max-width: 640px) {
          .lsp-head { padding: 14px 16px 8px; }
          .lsp-title { font-size: 16px; }
          .lsp-scroll { padding: 6px 12px 24px; gap: 10px; }
          .lsp-cat { font-size: 20px; margin: 10px 2px 4px; }
          .lsp-empty { font-size: 15px; padding: 48px 16px; }
        }
      `}</style>
    </aside>
  );
}
