"use client";

type SvgLineSegment = {
  id: string;
  type: "entry" | "sl" | "tp" | "be";
  x1: number;
  x2: number;
  y: number;
  y2?: number;
  price: number;
  color: string;
  dashArray?: string;
  opacity?: number;
};

type SvgTradeTriangle = {
  id: string;
  kind: "entry" | "exit";
  x: number;
  y: number;
  color: string;
  direction: "left" | "right" | "up" | "down";
  size?: number;
};

type SvgOpenTradeTarget = {
  tradeId: string;
  candleX: number;
  candleYMin: number;
  candleYMax: number;
  markerX: number;
  markerY: number;
};

type SvgTradeZone = {
  id: string;
  x1: number;
  x2: number;
  yTop: number;
  yBottom: number;
  fill: string;
};

type SvgLineLabel = {
  id: string;
  type: "entry" | "sl" | "tp";
  x: number;
  y: number;
  color: string;
  lines: string[];
};

type Props = {
  segments: SvgLineSegment[];
  triangles?: SvgTradeTriangle[];
  openTradeTargets?: SvgOpenTradeTarget[];
  onToggleOpenTrade?: (tradeId: string) => void;
  tradeZones?: SvgTradeZone[];
  lineLabels?: SvgLineLabel[];
  currentPriceGuide?: {
    x1: number;
    x2: number;
    y: number;
    stroke: string;
  } | null;
  compactMode?: boolean;
  /** Pixels to clip from the right edge (price scale width). Prevents trade zones from bleeding into the Y-axis area. */
  rightClipPx?: number;
  /** Pixels to clip from the bottom edge (time scale height). Prevents trade zones from bleeding into the X-axis area. */
  bottomClipPx?: number;
};

export type { SvgLineSegment };
export type { SvgTradeTriangle };
export type { SvgOpenTradeTarget };
export type { SvgTradeZone };
export type { SvgLineLabel };

export function pointsForTradeTriangle(marker: SvgTradeTriangle): string {
  const size = marker.size ?? 7;
  if (marker.direction === "right") {
    return `${marker.x},${marker.y - size * 0.5} ${marker.x},${marker.y + size * 0.5} ${marker.x + size},${marker.y}`;
  }
  if (marker.direction === "left") {
    return `${marker.x},${marker.y - size * 0.5} ${marker.x},${marker.y + size * 0.5} ${marker.x - size},${marker.y}`;
  }
  if (marker.direction === "up") {
    return `${marker.x},${marker.y - size} ${marker.x - size * 0.7},${marker.y + size * 0.55} ${marker.x + size * 0.7},${marker.y + size * 0.55}`;
  }
  return `${marker.x},${marker.y + size} ${marker.x - size * 0.7},${marker.y - size * 0.55} ${marker.x + size * 0.7},${marker.y - size * 0.55}`;
}

export const TRADE_SVG_OVERLAY_CLASS = "tradeSvgOverlay";

export function syncTradeSvgOverlayDom(
  svg: SVGSVGElement,
  input: {
    segments: SvgLineSegment[];
    triangles: SvgTradeTriangle[];
    tradeZones: SvgTradeZone[];
    lineLabels: SvgLineLabel[];
    currentPriceGuide: {
      x1: number;
      x2: number;
      y: number;
      stroke: string;
    } | null;
  },
): void {
  for (const segment of input.segments) {
    const el = svg.querySelector(`line[data-segment-id="${segment.id}"]`) as SVGLineElement | null;
    if (!el) continue;
    el.setAttribute("x1", String(segment.x1));
    el.setAttribute("x2", String(segment.x2));
    el.setAttribute("y1", String(segment.y));
    el.setAttribute("y2", String(segment.y2 ?? segment.y));
  }

  for (const marker of input.triangles) {
    const el = svg.querySelector(`polygon[data-marker-id="${marker.id}"]`) as SVGPolygonElement | null;
    if (!el) continue;
    el.setAttribute("points", pointsForTradeTriangle(marker));
  }

  for (const zone of input.tradeZones) {
    const el = svg.querySelector(`rect[data-zone-id="${zone.id}"]`) as SVGRectElement | null;
    if (!el) continue;
    el.setAttribute("x", String(zone.x1));
    el.setAttribute("y", String(zone.yTop));
    el.setAttribute("width", String(Math.max(1, zone.x2 - zone.x1)));
    el.setAttribute("height", String(Math.max(1, zone.yBottom - zone.yTop)));
  }

  for (const label of input.lineLabels) {
    const group = svg.querySelector(`g[data-label-id="${label.id}"]`);
    if (!group) continue;
    const texts = group.querySelectorAll("text");
    label.lines.forEach((line, index) => {
      const text = texts.item(index);
      if (!text) return;
      text.setAttribute("x", String(label.x));
      text.setAttribute("y", String(label.y + index * 11));
      text.textContent = line;
    });
  }

  const guide = svg.querySelector("line[data-price-guide]") as SVGLineElement | null;
  if (input.currentPriceGuide) {
    if (guide) {
      guide.setAttribute("x1", String(input.currentPriceGuide.x1));
      guide.setAttribute("x2", String(input.currentPriceGuide.x2));
      guide.setAttribute("y1", String(input.currentPriceGuide.y));
      guide.setAttribute("y2", String(input.currentPriceGuide.y));
      guide.setAttribute("stroke", input.currentPriceGuide.stroke);
    }
  } else if (guide) {
    guide.setAttribute("x1", "0");
    guide.setAttribute("x2", "0");
    guide.setAttribute("y1", "0");
    guide.setAttribute("y2", "0");
  }
}

export default function TradeSvgOverlay({
  segments,
  triangles = [],
  openTradeTargets = [],
  onToggleOpenTrade,
  tradeZones = [],
  lineLabels = [],
  currentPriceGuide = null,
  compactMode = false,
  rightClipPx = 0,
  bottomClipPx = 0,
}: Props) {
  const strokeWidth = compactMode ? 1 : 1.5;
  const labelFontSize = compactMode ? 7 : 9;
  const clipStyle = (rightClipPx > 0 || bottomClipPx > 0)
    ? { clipPath: `inset(0 ${rightClipPx}px ${bottomClipPx}px 0)` }
    : {};
  return (
    <svg
      className={TRADE_SVG_OVERLAY_CLASS}
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, cursor: "crosshair", ...clipStyle }}
    >
      {tradeZones.map((zone) => (
        <rect
          key={zone.id}
          data-zone-id={zone.id}
          x={zone.x1}
          y={zone.yTop}
          width={Math.max(1, zone.x2 - zone.x1)}
          height={Math.max(1, zone.yBottom - zone.yTop)}
          fill={zone.fill}
          pointerEvents="none"
        />
      ))}
      {currentPriceGuide ? (
        <line
          data-price-guide="1"
          x1={currentPriceGuide.x1}
          y1={currentPriceGuide.y}
          x2={currentPriceGuide.x2}
          y2={currentPriceGuide.y}
          stroke={currentPriceGuide.stroke}
          strokeOpacity={0.92}
          strokeWidth={strokeWidth}
          strokeDasharray="3 3"
          shapeRendering="geometricPrecision"
          pointerEvents="none"
        />
      ) : null}
      {segments.map((segment) => (
        <line
          key={segment.id}
          data-segment-id={segment.id}
          x1={segment.x1}
          y1={segment.y}
          x2={segment.x2}
          y2={segment.y2 ?? segment.y}
          stroke={segment.color}
          strokeWidth={strokeWidth}
          strokeOpacity={segment.opacity ?? (compactMode ? 0.9 : 0.95)}
          strokeDasharray={segment.dashArray}
          shapeRendering="crispEdges"
          pointerEvents="none"
        />
      ))}
      {triangles.map((marker) => (
        <polygon
          key={marker.id}
          data-marker-id={marker.id}
          points={pointsForTradeTriangle(marker)}
          fill={marker.color}
          fillOpacity={compactMode ? 0.9 : 0.95}
          pointerEvents="none"
        />
      ))}
      {!compactMode
        ? lineLabels.map((label) => (
          <g key={label.id} data-label-id={label.id} pointerEvents="none">
            {label.lines.map((line, index) => (
              <text
                key={`${label.id}-${index}`}
                x={label.x}
                y={label.y + index * 11}
                fill={label.color}
                fontSize={labelFontSize}
                fontWeight={600}
                dominantBaseline="middle"
                style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
              >
                {line}
              </text>
            ))}
          </g>
        ))
        : null}
      {openTradeTargets.map((target) => (
        <g key={`hit-${target.tradeId}`} pointerEvents="none">
          <rect
            x={target.candleX - 10}
            y={target.candleYMin - 8}
            width={20}
            height={Math.max(14, target.candleYMax - target.candleYMin + 16)}
            fill="transparent"
          />
          <circle cx={target.markerX} cy={target.markerY} r={11} fill="transparent" />
        </g>
      ))}
    </svg>
  );
}
