"use client";

/**
 * Master candle-chart asset overlay — rendered top-left directly on the chart.
 * No border, no box — text sits on the chart with backdrop blur behind it.
 * Used identically on: Signal page, Globe, Monitoring, Komponenten.
 */

interface ChartAssetOverlayProps {
  iconUrl?: string | null;
  symbol: string;
  assetName?: string;
  /** Icon size in px (default 26) */
  iconSize?: number;
}

export function ChartAssetOverlay({
  iconUrl,
  symbol,
  assetName,
  iconSize = 26,
}: ChartAssetOverlayProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        padding: "6px 10px",
        borderRadius: 8,
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        background: "rgba(0,0,0,0.08)",
        pointerEvents: "none",
      }}
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={symbol}
          width={iconSize}
          height={iconSize}
          style={{ objectFit: "contain", borderRadius: iconSize * 0.23, flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: iconSize,
            height: iconSize,
            borderRadius: iconSize * 0.23,
            background: "rgba(255,255,255,0.06)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: iconSize * 0.55,
            color: "rgba(255,255,255,0.4)",
            fontWeight: 800,
          }}
        >
          {symbol.charAt(0)}
        </div>
      )}
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1,
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            whiteSpace: "nowrap",
          }}
        >
          {symbol}
        </div>
        {assetName && (
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.45)",
              marginTop: 3,
              lineHeight: 1,
              textShadow: "0 1px 3px rgba(0,0,0,0.7)",
              whiteSpace: "nowrap",
            }}
          >
            {assetName}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChartAssetOverlay;
