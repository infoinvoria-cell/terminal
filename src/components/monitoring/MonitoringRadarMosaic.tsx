"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  rankAllMonitoringTiles,
  type AllTileState,
  type RankedAllTile,
} from "@/lib/monitoring/rankAllMonitoringTiles";

type RadarGridItem = {
  key: string;
  code: string;
  universeGroup?: string;
  payload?: { bars?: unknown[] | null } | null;
  [key: string]: unknown;
};

type RadarSignalInfo = {
  activeSignal: boolean;
  hasOpenTrade?: boolean;
  isClosedSignal?: boolean;
  lastSignalMs: number | null;
};

type Props = {
  assets: RadarGridItem[];
  signalState: Record<string, RadarSignalInfo>;
  sourceByKey?: Record<string, string>;
  backgroundColor?: string;
  renderTile: (item: RadarGridItem, ranked: RankedAllTile) => ReactNode;
};

// Hero row holds the open positions + fresh active entries. Generous cap so several
// concurrent open swing signals (Sugar, Cotton, Corn…) all stay prominent on top.
const TOP_MAX = 7;

function MonitoringRadarMosaicInner({ assets, signalState, sourceByKey, backgroundColor, renderTile }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({ cols: 8, rows: 3, topHeight: 340 });

  const { active, rest } = useMemo(() => {
    const states: AllTileState[] = assets.map((item) => {
      const sig = signalState[item.key];
      const hasData = Array.isArray(item.payload?.bars) && (item.payload?.bars?.length ?? 0) > 0;
      return {
        key: item.key,
        symbol: item.code,
        category: String(item.universeGroup ?? item.key.split(":")[0] ?? ""),
        hasData,
        hasOpenTrade: Boolean(sig?.hasOpenTrade) && hasData,
        activeSignal: Boolean(sig?.activeSignal) && hasData,
        isClosedSignal: Boolean(sig?.isClosedSignal) && hasData,
        lastSignalMs: sig?.lastSignalMs ?? null,
      };
    });
    // No-data charts are hidden entirely — never shown as empty tiles. Ranking already
    // sorts open trades first, then fresh active entries, then closed, then no-signal.
    const ranked = rankAllMonitoringTiles(states).filter((t) => t.hasData);
    const activeTiles = ranked.filter((t) => t.activeSignal).slice(0, TOP_MAX);
    const activeKeys = new Set(activeTiles.map((t) => t.key));
    const restTiles = ranked.filter((t) => !activeKeys.has(t.key));
    return { active: activeTiles, rest: restTiles };
  }, [assets, signalState]);

  const itemByKey = useMemo(() => new Map(assets.map((a) => [a.key, a])), [assets]);

  // Bottom watchlist grid: pick the column count that fills the remaining area with the
  // fewest empty cells AND keeps tiles square-ish (no portrait, no extreme strips). Rows
  // stretch with 1fr and the last row spans to full width, so there is no black gap.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 60 || h < 60) return;
      const topHeight = active.length ? Math.round(Math.min(h * 0.42, Math.max(220, h * 0.36))) : 0;
      const bottomH = Math.max(80, h - topHeight - (active.length ? 2 : 0));
      const n = rest.length;
      if (n === 0) {
        setGrid((prev) => (prev.cols === 1 && prev.rows === 1 && prev.topHeight === topHeight ? prev : { cols: 1, rows: 1, topHeight }));
        return;
      }
      const maxCols = Math.max(3, Math.min(n, Math.floor(w / 130))); // tiles ≥ ~130px wide
      let best = { cols: 0, rows: 0, score: Infinity };
      for (let c = Math.min(3, n); c <= maxCols; c++) {
        const rows = Math.ceil(n / c);
        const aspect = (w / c) / (bottomH / rows);
        if (aspect < 0.95 || aspect > 2.6) continue; // tiles must be horizontal, never portrait
        const empty = c * rows - n;
        const score = empty * 2 + Math.abs(aspect - 1.55) * 3; // fill first, then ~landscape (wider than tall)
        if (score < best.score) best = { cols: c, rows, score };
      }
      if (!best.cols) {
        const c = Math.max(1, Math.min(maxCols, Math.round(Math.sqrt(n * (w / bottomH)))));
        best = { cols: c, rows: Math.ceil(n / c), score: 0 };
      }
      setGrid((prev) =>
        prev.cols === best.cols && prev.rows === best.rows && prev.topHeight === topHeight
          ? prev
          : { cols: best.cols, rows: best.rows, topHeight });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active.length, rest.length]);

  // Column spans for the final (partial) row so it stretches to full width — no gap.
  const lastRowSpans = useMemo(() => {
    const n = rest.length;
    const { cols, rows } = grid;
    const spans = new Array<number>(n).fill(1);
    if (n === 0 || cols <= 1 || rows <= 0) return spans;
    const lastStart = (rows - 1) * cols;
    const lastCount = n - lastStart;
    if (lastCount <= 0 || lastCount >= cols) return spans;
    const base = Math.floor(cols / lastCount);
    const extra = cols % lastCount;
    for (let j = 0; j < lastCount; j++) spans[lastStart + j] = base + (j < extra ? 1 : 0);
    return spans;
  }, [rest.length, grid]);

  const cell = (tile: RankedAllTile, size: RankedAllTile["tileSize"], styleExtra?: React.CSSProperties) => {
    const item = itemByKey.get(tile.key);
    if (!item) return null;
    return (
      <div
        key={tile.key}
        className="monitoring-radar-cell"
        data-radar-rank={tile.rank}
        data-radar-size={size}
        data-radar-active={tile.activeSignal ? "1" : "0"}
        data-radar-symbol={tile.symbol}
        data-radar-category={tile.category}
        data-radar-age-min={tile.signalAgeMinutes ?? ""}
        style={{ position: "relative", minWidth: 0, minHeight: 0, background: "#0d0f13", ...styleExtra }}
      >
        {renderTile(item, { ...tile, tileSize: size })}
        {sourceByKey?.[tile.key] ? (
          <span
            title={`Datenquelle: ${sourceByKey[tile.key]} · Research monitoring, not live approved`}
            style={{
              position: "absolute",
              bottom: 3,
              left: 4,
              zIndex: 3,
              pointerEvents: "auto",
              fontSize: 7.5,
              fontWeight: 700,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              padding: "1px 4px",
              borderRadius: 4,
              color: "#9aa3ad",
              background: "rgba(8, 10, 13, 0.72)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            {sourceByKey[tile.key]}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="monitoring-radar-mosaic"
      data-tab-id="all"
      style={{
        width: "100%",
        height: "calc(100vh - var(--monitoring-tabbar-height))",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: active.length ? 2 : 0,
        background: backgroundColor ?? "#0a0c10",
      }}
    >
      {active.length ? (
        <div
          className="monitoring-radar-top"
          style={{ display: "flex", gap: 1, height: grid.topHeight, flex: "0 0 auto", background: "rgba(255,255,255,0.05)" }}
        >
          {active.map((tile) => cell(tile, "XL", { flex: "1 1 0", height: "100%" }))}
        </div>
      ) : null}

      <div
        className="monitoring-radar-grid"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
          gridAutoFlow: "row",
          gap: 1,
          flex: "1 1 auto",
          minHeight: 0,
          background: "rgba(255,255,255,0.05)",
        }}
      >
        {rest.map((tile, i) => cell(tile, "S", lastRowSpans[i] > 1 ? { gridColumn: `span ${lastRowSpans[i]}` } : undefined))}
      </div>
    </div>
  );
}

export default memo(MonitoringRadarMosaicInner);
