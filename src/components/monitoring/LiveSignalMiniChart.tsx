"use client";

import type { LiveSignalColors } from "@/components/monitoring/LiveSignalCard";

type Props = {
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  endPrice: number | null; // current price (open) or exit price (closed)
  status: "Open" | "Take Profit" | "Stop Loss";
  direction: "long" | "short";
  colors: LiveSignalColors; // entry=blue, sl=red, tp=green (from user settings)
  seed?: string; // stable per-trade seed so the simulated path doesn't change on re-render
  width?: number;
  height?: number;
};

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}

/** Reference-style schematic of one trade: solid Entry/TP/SL levels in the user's
 *  configured colours, plus a white price path from the Signal point to Now/Exit. The
 *  two endpoints (entry + current/exit) and all levels are REAL; the intermediate
 *  candles are a deterministic, seeded simulation of the move between them so the line
 *  reads like real price action rather than a flat placeholder. */
export default function LiveSignalMiniChart({ entry, stopLoss, takeProfit, endPrice, status, direction, colors, seed = "x", width = 126, height = 58 }: Props) {
  const vals = [entry, stopLoss, takeProfit, endPrice].filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length < 1) return <svg width={width} height={height} aria-hidden />;

  const padTop = 9;
  const padBottom = 9;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const span0 = hi - lo;
  const span = span0 * 1.16;
  const mid = (hi + lo) / 2;
  lo = mid - span / 2; hi = mid + span / 2;
  const y = (p: number) => padTop + (height - padTop - padBottom) * (1 - (p - lo) / (hi - lo));
  const xL = 6;
  const xR = width - 6;

  const isLong = direction === "long";
  const endColor = status === "Take Profit" ? colors.tp : status === "Stop Loss" ? colors.sl : colors.entry;
  const markColor = isLong ? colors.tp : colors.sl;
  const hLine = (p: number | null, color: string) =>
    p == null ? null : <line x1={xL} y1={y(p)} x2={xR} y2={y(p)} stroke={color} strokeWidth={1.7} strokeLinecap="round" opacity={0.92} />;

  const eY = entry != null ? y(entry) : null;
  const endY = endPrice != null ? y(endPrice) : null;

  // Simulated per-candle path between the two real endpoints (entry → now/exit): a
  // drift-toward-target random walk with bounded, seeded wiggle. Endpoints stay exact.
  let pricePath: string | null = null;
  if (entry != null && endPrice != null) {
    const band = span0 * 0.16;
    let s = hashSeed(seed);
    const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return (s / 0x7fffffff) * 2 - 1; };
    const N = 13;
    const drift = (endPrice - entry) / N;
    const prices: number[] = [entry];
    let p = entry;
    for (let i = 1; i < N; i++) {
      p += drift + rnd() * band * 0.55;
      prices.push(p);
    }
    prices.push(endPrice);
    pricePath = prices.map((pp, i) => `${(xL + ((xR - xL) * i) / N).toFixed(1)},${y(pp).toFixed(1)}`).join(" ");
  }

  const markY = eY != null ? (isLong ? eY + 6 : eY - 6) : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {hLine(takeProfit, colors.tp)}
      {hLine(entry, colors.entry)}
      {hLine(stopLoss, colors.sl)}
      {pricePath ? <polyline points={pricePath} fill="none" stroke="#ffffff" strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" /> : null}
      {eY != null && markY != null ? (
        <>
          <text x={xL} y={isLong ? markY + 9 : markY - 4} fontSize={6} fill="#aeb6c2" textAnchor="middle">Signal</text>
          <path
            d={isLong ? `M${xL - 3},${markY} L${xL + 3},${markY} L${xL},${markY - 4} Z` : `M${xL - 3},${markY} L${xL + 3},${markY} L${xL},${markY + 4} Z`}
            fill={markColor}
          />
        </>
      ) : null}
      {endY != null ? (
        <>
          <circle cx={xR} cy={endY} r={2.6} fill={endColor} />
          <text x={xR} y={endY > height / 2 ? endY - 4 : endY + 9} fill="#aeb6c2" fontSize={6} textAnchor="end">Now</text>
        </>
      ) : null}
    </svg>
  );
}
